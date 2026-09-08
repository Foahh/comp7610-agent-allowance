import type { Config } from "@repo/utils/config"

import { sValidator as validator } from "@hono/standard-validator"
import { AddressSchema, HexSchema } from "@repo/schemas"
import { publicClient } from "@repo/utils"
import { Hono } from "hono"
import { setCookie, deleteCookie, getCookie } from "hono/cookie"
import { createHash, randomBytes } from "node:crypto"
import * as v from "valibot"
import { getAddress, recoverMessageAddress, zeroAddress, type Hex } from "viem"
import { createSiweMessage } from "viem/siwe"

import type { BuyerStore } from "../lib/store.ts"

export function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}
export function activeSession(
  store: BuyerStore,
  config: Config,
  token?: string,
  touch = true
) {
  const session = token ? store.getSession(sessionHash(token)) : undefined
  if (!session || session.expiresAt <= Date.now()) {
    return undefined
  }
  const lastSeen = store.getOperation(`session-activity:${session.id}`) as
    | number
    | undefined
  if (Date.now() - (lastSeen ?? session.expiresAt - 8 * 3600000) > 30 * 60000) {
    store.removeSession(session.id)
    return undefined
  }
  if (touch) {
    store.saveOperation(`session-activity:${session.id}`, Date.now())
  }
  return session
}

export function createAuthRoutes(store: BuyerStore, config: Config) {
  const router = new Hono()
  const cookie = config.cookieName
  const challengeCookie = `${cookie}_challenge`
  const options = {
    httpOnly: true,
    sameSite: "Strict" as const,
    path: "/api",
    secure: new URL(config.appOrigin).protocol === "https:",
  }
  let windowStart = Date.now()
  let attempts = 0
  router.use("*", async (context, next) => {
    if (context.req.method === "POST" && context.req.path !== "/logout") {
      if (Date.now() - windowStart > 60000) {
        windowStart = Date.now()
        attempts = 0
      }
      if (++attempts > 120) {
        return context.json(
          { error: "Too many sign-in attempts. Try again in a minute." },
          429
        )
      }
    }
    context.header("Cache-Control", "no-store")
    await next()
  })
  return router
    .get("/session", (context) => {
      const session = activeSession(
        store,
        config,
        getCookie(context, cookie),
        false
      )
      return context.json({
        owner: session?.owner ?? null,
        expiresAt: session?.expiresAt ?? null,
      })
    })
    .post(
      "/challenge",
      validator("json", v.object({ address: AddressSchema })),
      (context) => {
        const address = getAddress(context.req.valid("json").address)
        // A pre-bound runtime must never admit another account into its stores.
        if (
          address === zeroAddress ||
          (config.owner !== zeroAddress &&
            address.toLowerCase() !== config.owner.toLowerCase())
        ) {
          return context.json(
            { error: "This workspace belongs to another account." },
            403
          )
        }
        const binding = randomBytes(32).toString("hex")
        const nonce = randomBytes(24).toString("hex")
        const id = `${sessionHash(binding)}.${nonce}`
        const expiresAt = Date.now() + 5 * 60000
        const origin = new URL(config.appOrigin)
        const message = createSiweMessage({
          address,
          domain: origin.host,
          scheme: origin.protocol.slice(0, -1),
          uri: config.appOrigin,
          version: "1",
          chainId: config.chainId,
          nonce,
          issuedAt: new Date(),
          expirationTime: new Date(expiresAt),
          statement:
            "Sign in to this installation. This does not authorize token spending.",
        })
        store.saveChallenge({
          id,
          owner: address.toLowerCase(),
          message,
          expiresAt,
        })
        setCookie(context, challengeCookie, binding, {
          ...options,
          maxAge: 300,
        })
        return context.json({ id, message })
      }
    )
    .post(
      "/verify",
      validator(
        "json",
        v.object({
          id: v.pipe(v.string(), v.maxLength(200)),
          signature: HexSchema,
        })
      ),
      async (context) => {
        const { id, signature } = context.req.valid("json")
        const binding = getCookie(context, challengeCookie)
        if (!binding || !id.startsWith(`${sessionHash(binding)}.`)) {
          return context.json(
            {
              error: "Sign-in request belongs to another browser. Start again.",
            },
            401
          )
        }
        const challenge = store.consumeChallenge(id)
        if (!challenge || challenge.expiresAt <= Date.now()) {
          return context.json(
            { error: "Challenge expired or already used." },
            401
          )
        }
        const recovered = await recoverMessageAddress({
          message: challenge.message,
          signature: signature as Hex,
        }).catch(() => undefined)
        const verified =
          recovered?.toLowerCase() === challenge.owner ||
          (await publicClient(config.chainId, config.rpcUrl)
            .verifyMessage({
              address: getAddress(challenge.owner),
              message: challenge.message,
              signature: signature as Hex,
            })
            .catch(() => false))
        if (!verified) {
          return context.json({ error: "Wallet signature mismatch." }, 401)
        }
        const previous = getCookie(context, cookie)
        if (previous) {
          store.removeSession(sessionHash(previous))
        }
        const token = randomBytes(32).toString("hex")
        store.saveSession({
          id: sessionHash(token),
          owner: challenge.owner,
          expiresAt: Date.now() + 8 * 3600000,
        })
        setCookie(context, cookie, token, { ...options, maxAge: 8 * 3600 })
        deleteCookie(context, challengeCookie, options)
        return context.json({ owner: challenge.owner })
      }
    )
    .post("/logout", (context) => {
      const token = getCookie(context, cookie)
      if (token) {
        store.removeSession(sessionHash(token))
      }
      deleteCookie(context, cookie, options)
      return context.json({ ok: true })
    })
    .post("/logout-all", (context) => {
      const session = activeSession(store, config, getCookie(context, cookie))
      if (session) {
        store.removeOwnerSessions(session.owner)
      }
      deleteCookie(context, cookie, options)
      return context.json({ ok: true })
    })
}
