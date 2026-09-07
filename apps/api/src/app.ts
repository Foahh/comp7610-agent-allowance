import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import type { Store } from "@repo/db"
import type { Config } from "@repo/utils/config"
import { createPayments } from "./payments.ts"
import { createAuthRoutes, type Session } from "./routes/auth/index.ts"
import {
  createConversationRoutes,
  type AppEnv,
} from "./routes/conversations/index.ts"

export function createApp(
  config: Config,
  store: Store,
  payments = createPayments(config, store)
) {
  const app = new Hono<AppEnv>()
  app.onError((error, context) => {
    const status = error instanceof HTTPException ? error.status : 400
    return context.json({ error: error.message.split("\n")[0] }, status)
  })
  app.use("/api/*", async (context, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(context.req.method)) {
      if (context.req.header("origin") !== config.appOrigin) {
        return context.json({ error: "Untrusted request origin." }, 403)
      }
    }
    await next()
  })
  app.use("/api/*", async (context, next) => {
    if (!/^\/api\/conversations(\/|$)/.test(context.req.path)) {
      return next()
    }
    const token = getCookie(context, "agent_session")
    const session = token ? store.get<Session>("sessions", token) : undefined
    if (!session || session.expiresAt <= Date.now()) {
      return context.json({ error: "Connect and verify your wallet." }, 401)
    }
    context.set("owner", session.owner)
    await next()
  })
  const health = app.get("/api/health", (context) => {
    store.checkConnection()
    return context.json({ status: "ok", service: "api", database: "ok" })
  })
  const configuration = health.get("/api/config", (context) =>
    context.json({
      chainId: config.chainId,
      vault: config.vault,
      token: config.token,
      agent: payments.account.address,
      provider: config.provider,
      // Never send a credential-bearing RPC URL to the browser.
      rpcUrl:
        config.chainId === 31337
          ? config.rpcUrl
          : "https://ethereum-sepolia-rpc.publicnode.com",
    })
  )
  const authenticated = configuration.route(
    "/api/auth",
    createAuthRoutes(store, config)
  )
  return authenticated.route(
    "/api/conversations",
    createConversationRoutes(config, store, payments)
  )
}

export type AppType = ReturnType<typeof createApp>
