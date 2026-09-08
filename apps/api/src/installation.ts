import type { Config } from "@repo/utils/config"
import type {
  DeploymentInput,
  DeploymentManifest,
} from "@repo/utils/deployment"

import { sValidator as validator } from "@hono/standard-validator"
import { VAULT_VERSION } from "@repo/utils"
import { signer } from "@repo/utils/config"
import { validateDeployment } from "@repo/utils/deployment"
import { endpointUrl } from "@repo/utils/http"
import { encryptSecret, decryptSecret } from "@repo/utils/secrets"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { getCookie } from "hono/cookie"
import { AsyncLocalStorage } from "node:async_hooks"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import * as v from "valibot"
import { getAddress, zeroAddress } from "viem"

import type { AppEnv } from "./routes/conversations.ts"

import { createApp } from "./app.ts"
import { createPayments } from "./lib/payments.ts"
import { openBuyerDatabase } from "./lib/store.ts"
import { activeSession, createAuthRoutes } from "./routes/auth.ts"
import { openSellerDatabase } from "./seller/lib/store.ts"

type Profile = {
  manifest: DeploymentManifest
  encryptedRpc: string
  endpoint: string
  public?: boolean
}

type AccountSettings = {
  active: string
  profiles: Record<string, Profile>
}

const SetupSchema = v.strictObject({
  rpcUrl: v.pipe(v.string(), v.maxLength(2048)),
  tokenAddress: v.string(),
  vaultAddress: v.string(),
})
const SaveSetupSchema = v.object({ validationId: v.string() })
const SelectSetupSchema = v.object({ id: v.string() })
const SellerAccessSchema = v.object({
  endpoint: v.pipe(v.string(), v.maxLength(2048)),
  public: v.boolean(),
})

const LOCAL_MANAGEMENT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
const READ_ONLY_METHODS = new Set(["GET", "HEAD"])
const SESSION_INACTIVITY_LIMIT_MS = 30 * 60 * 1000
const DEFAULT_SESSION_DURATION_MS = 8 * 60 * 60 * 1000
const VALIDATION_LIFETIME_MS = 60 * 1000
const MAX_PENDING_VALIDATIONS = 100

export function createInstallation(
  config: Config,
  validate = validateDeployment,
  mode: "management" | "seller" = "management"
) {
  const auth = openBuyerDatabase(join(config.dataDir, "sessions.sqlite"))
  const authorization = new AsyncLocalStorage<string>()
  const runtimes = new Map<string, ReturnType<typeof runtime>>()
  const validations = new Map<
    string,
    {
      session: string
      expiresAt: number
      input: DeploymentInput
      manifest: DeploymentManifest
    }
  >()
  const app = new Hono<AppEnv>()

  function accountRoot(owner: string) {
    return join(config.dataDir, "accounts", getAddress(owner).toLowerCase())
  }

  function secrets(owner: string) {
    return join(accountRoot(owner), "credentials")
  }

  function settings(owner: string): AccountSettings {
    const file = join(accountRoot(owner), "settings.json")

    if (!existsSync(file)) {
      return { active: "", profiles: {} }
    }

    return JSON.parse(readFileSync(file, "utf8")) as AccountSettings
  }

  function saveSettings(owner: string, value: AccountSettings) {
    mkdirSync(accountRoot(owner), { recursive: true })
    const file = join(accountRoot(owner), "settings.json")

    writeFileSync(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 })
    renameSync(`${file}.tmp`, file)
  }

  function runtime(owner: string, id: string, profile: Profile) {
    const base = profile.endpoint || config.sellerPublicUrl
    const scoped: Config = {
      ...config,
      owner: getAddress(owner),
      token: getAddress(profile.manifest.tokenAddress),
      vault: getAddress(profile.manifest.vaultAddress),
      rpcUrl: decryptSecret(profile.encryptedRpc, secrets(owner)),
      dataDir: join(accountRoot(owner), "deployments", id),
      credentialsDir: join(
        accountRoot(owner),
        "deployments",
        id,
        "credentials"
      ),
      sellerPublicUrl: `${base}/sellers/${owner}/${id}`,
    }
    const buyer = openBuyerDatabase(join(scoped.dataDir, "buyer.sqlite"))
    const seller = openSellerDatabase(join(scoped.dataDir, "seller.sqlite"))
    const payments = createPayments(scoped, buyer, () => {
      const sessionId = authorization.getStore()

      if (!sessionId) {
        return false
      }

      const session = auth.getSession(sessionId)

      if (!session) {
        return false
      }

      const lastSeen = auth.getOperation(`session-activity:${session.id}`) as
        | number
        | undefined
      const lastActivity =
        lastSeen ?? session.expiresAt - DEFAULT_SESSION_DURATION_MS
      const now = Date.now()

      return (
        session.expiresAt > now &&
        now - lastActivity <= SESSION_INACTIVITY_LIMIT_MS &&
        session.owner === owner &&
        settings(owner).active === id
      )
    })

    return {
      app: createApp(scoped, buyer, payments, seller, auth),
      config: scoped,
      close() {
        buyer.close()
        seller.close()
      },
    }
  }
  function getRuntime(owner: string, id: string, profile: Profile) {
    const key = `${owner}:${id}`
    let value = runtimes.get(key)

    if (!value) {
      value = runtime(owner, id, profile)
      runtimes.set(key, value)
    }

    return value
  }

  function publicConfig(owner?: string) {
    const saved = owner ? settings(owner) : { active: "", profiles: {} }
    const profile = saved.profiles[saved.active]
    const scoped =
      owner && profile
        ? getRuntime(owner, saved.active, profile).config
        : config
    const restartRequired =
      owner && profile
        ? scoped.rpcUrl !== decryptSecret(profile.encryptedRpc, secrets(owner))
        : false

    return {
      chainId: config.chainId,
      vaultVersion: VAULT_VERSION,
      token: scoped.token,
      vault: scoped.vault,
      owner: owner || zeroAddress,
      buyerSigner: profile ? signer("buyer", scoped).address : zeroAddress,
      sellerEndpoint: profile ? scoped.sellerPublicUrl : "",
      sellerPublic: profile?.public === true,
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      configured: Boolean(profile),
      restartRequired,
      activeDeployment: saved.active,
      deployments: Object.values(saved.profiles).map(
        ({ manifest }) => manifest
      ),
      instance: config.cookieName,
    }
  }
  app.onError((_error, context) =>
    context.json(
      { error: "Request failed. Check the configuration and try again." },
      400
    )
  )
  app.use("/api/*", bodyLimit({ maxSize: 22 * 1024 * 1024 }))
  app.use("/api/*", async (context, next) => {
    if (mode === "seller") {
      return context.json({ error: "Not found." }, 404)
    }
    const hostname = new URL(context.req.url).hostname

    if (!LOCAL_MANAGEMENT_HOSTS.has(hostname)) {
      return context.json(
        { error: "Use this installation's local management URL." },
        403
      )
    }
    const remote = (context.env?.server || context.env)?.incoming?.socket
      .remoteAddress

    if (remote && !LOOPBACK_ADDRESSES.has(remote)) {
      return context.json(
        { error: "Management is available only on this computer." },
        403
      )
    }
    // Exact browser origin is mandatory even between same-site localhost ports.
    if (
      !READ_ONLY_METHODS.has(context.req.method) &&
      context.req.header("origin") !== config.appOrigin
    ) {
      return context.json({ error: "Untrusted request origin." }, 403)
    }

    context.header("Cache-Control", "no-store")
    await next()
  })
  app.route("/api/auth", createAuthRoutes(auth, config))
  app.get("/api/health", (context) =>
    context.json({ status: "ok", service: "api" })
  )
  app.get("/api/config", (context) =>
    context.json(
      publicConfig(
        activeSession(auth, config, getCookie(context, config.cookieName))
          ?.owner
      )
    )
  )
  app.use("/api/*", async (context, next) => {
    const session = activeSession(
      auth,
      config,
      getCookie(context, config.cookieName)
    )
    if (!session) {
      return context.json({ error: "Connect and verify your wallet." }, 401)
    }
    context.set("owner", session.owner)
    await authorization.run(session.id, next)
  })
  app.post(
    "/api/setup/validate",
    validator("json", SetupSchema),
    async (context) => {
      const input = context.req.valid("json")

      try {
        const manifest = await validate(input)

        for (const [id, item] of validations) {
          if (item.expiresAt <= Date.now()) {
            validations.delete(id)
          }
        }
        if (validations.size >= MAX_PENDING_VALIDATIONS) {
          return context.json(
            { error: "Too many pending validations. Wait one minute." },
            429
          )
        }

        const id = randomUUID()

        validations.set(id, {
          session: authorization.getStore()!,
          expiresAt: Date.now() + VALIDATION_LIFETIME_MS,
          input,
          manifest,
        })
        return context.json({ validationId: id, manifest })
      } catch (error) {
        return context.json(
          {
            error:
              error instanceof Error ? error.message : "Validation failed.",
          },
          400
        )
      }
    }
  )
  app.post("/api/setup/save", validator("json", SaveSetupSchema), (context) => {
    const { validationId } = context.req.valid("json")
    const verified = validations.get(validationId)

    validations.delete(validationId)

    if (
      !verified ||
      verified.expiresAt <= Date.now() ||
      verified.session !== authorization.getStore()
    ) {
      return context.json(
        { error: "Validation expired. Validate again before saving." },
        409
      )
    }
    const owner = context.get("owner")
    const saved = settings(owner)
    const id = verified.manifest.vaultAddress.toLowerCase()

    // Keep in-flight work on its original transport. Persist the replacement
    // and report that both management and seller processes need a restart.
    const previous = saved.profiles[id]
    saved.profiles[id] = {
      manifest: verified.manifest,
      encryptedRpc: encryptSecret(verified.input.rpcUrl, secrets(owner)),
      endpoint: previous?.endpoint || "",
      public: previous?.public,
    }
    saved.active = id
    saveSettings(owner, saved)

    return context.json(publicConfig(owner))
  })
  app.post(
    "/api/setup/select",
    validator("json", SelectSetupSchema),
    (context) => {
      const owner = context.get("owner")
      const saved = settings(owner)
      const { id } = context.req.valid("json")

      if (!saved.profiles[id]) {
        return context.json({ error: "Unknown deployment." }, 404)
      }

      saveSettings(owner, { ...saved, active: id })

      return context.json(publicConfig(owner))
    }
  )
  app.get("/api/setup/export", (context) => {
    const saved = settings(context.get("owner"))

    if (!saved.profiles[saved.active]) {
      return context.json({ error: "Configure contracts first." }, 409)
    }
    context.header(
      "Content-Disposition",
      'attachment; filename="deployment.json"'
    )

    return context.json(saved.profiles[saved.active]!.manifest)
  })
  app.post("/api/instances", async (context) => {
    const name = `demo-${randomUUID().slice(0, 8)}`
    const directory = join(config.root, "data", "instances", name)

    mkdirSync(directory, { recursive: true })

    const env = { ...process.env }

    for (const key of [
      "DATA_DIRECTORY",
      "WEB_PORT",
      "API_PORT",
      "SELLER_PORT",
      "PUBLIC_API_URL",
      "SESSION_COOKIE_NAME",
      "APP_ORIGIN",
    ]) {
      delete env[key]
    }

    const output = openSync(join(directory, "launcher.log"), "a")
    const child = spawn(
      process.execPath,
      [join(config.root, "scripts", "dev.ts"), "--instance", name],
      {
        cwd: config.root,
        env,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", output, output],
      }
    )

    closeSync(output)

    let failure = false

    child.once("error", () => {
      failure = true
    })
    child.unref()

    for (let attempt = 0; attempt < 100 && !failure; attempt++) {
      const file = join(directory, "instance.json")
      if (existsSync(file)) {
        const instance = JSON.parse(readFileSync(file, "utf8")) as {
          origin: string
        }
        return context.json({ name, url: instance.origin })
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return context.json(
      {
        error:
          "Instance did not start. Check its launcher.log in data/instances.",
      },
      503
    )
  })
  app.post(
    "/api/setup/seller",
    validator("json", SellerAccessSchema),
    (context) => {
      const owner = context.get("owner")
      const saved = settings(owner)
      const profile = saved.profiles[saved.active]

      if (!profile) {
        return context.json({ error: "Configure a deployment first." }, 409)
      }

      const input = context.req.valid("json")

      profile.endpoint = endpointUrl(input.endpoint)
      profile.public = input.public
      saveSettings(owner, saved)

      const running = runtimes.get(`${owner}:${saved.active}`)

      if (running) {
        running.config.sellerPublicUrl = `${profile.endpoint}/sellers/${owner}/${saved.active}`
      }

      return context.json(publicConfig(owner))
    }
  )
  app.all("/api/*", async (context) => {
    const owner = context.get("owner")
    const saved = settings(owner)
    const profile = saved.profiles[saved.active]

    if (!profile) {
      return context.json(
        { error: "Import and validate a deployment in Settings first." },
        409
      )
    }

    return getRuntime(owner, saved.active, profile).app.fetch(
      context.req.raw,
      context.env
    )
  })
  app.all("/sellers/:owner/:vault/v1/*", (context) => {
    if (mode !== "seller") {
      return context.json({ error: "Use the seller endpoint." }, 404)
    }
    const owner = getAddress(context.req.param("owner")).toLowerCase()
    const id = getAddress(context.req.param("vault")).toLowerCase()
    const profile = settings(owner).profiles[id]

    if (!profile) {
      return context.json({ error: "Unknown seller." }, 404)
    }
    const remote = (context.env?.server || context.env)?.incoming?.socket
      .remoteAddress

    if (remote && !LOOPBACK_ADDRESSES.has(remote) && !profile.public) {
      return context.json(
        { error: "This seller has not enabled remote access." },
        403
      )
    }

    const url = new URL(context.req.url)

    url.pathname = url.pathname.replace(
      `/sellers/${context.req.param("owner")}/${context.req.param("vault")}`,
      ""
    )

    const running = getRuntime(owner, id, profile)

    running.config.sellerPublicUrl = `${profile.endpoint || config.sellerPublicUrl}/sellers/${owner}/${id}`
    return running.app.fetch(new Request(url, context.req.raw), context.env)
  })
  return {
    app,
    close() {
      for (const value of runtimes.values()) {
        value.close()
      }
      auth.close()
    },
  }
}
