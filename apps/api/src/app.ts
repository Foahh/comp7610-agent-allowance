import type { Config } from "@repo/utils/config"

import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"

import type { BuyerStore } from "./lib/store.ts"

import { createPayments } from "./lib/payments.ts"
import { createAuthRoutes } from "./routes/auth.ts"
import { createConfigRoutes } from "./routes/config.ts"
import {
  createConversationRoutes,
  type AppEnv,
} from "./routes/conversations.ts"
import { healthRoutes } from "./routes/health.ts"

const CONVERSATIONS_API_PATH = "/api/conversations"

function isConversationApiPath(path: string) {
  return (
    path === CONVERSATIONS_API_PATH ||
    path.startsWith(CONVERSATIONS_API_PATH + "/")
  )
}

export function createApp(
  config: Config,
  store: BuyerStore,
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
    if (!isConversationApiPath(context.req.path)) {
      return next()
    }
    const token = getCookie(context, "agent_session")
    const session = token ? store.getSession(token) : undefined
    if (!session || session.expiresAt <= Date.now()) {
      return context.json({ error: "Connect and verify your wallet." }, 401)
    }
    context.set("owner", session.owner)
    await next()
  })

  return app
    .route("/api/health", healthRoutes)
    .route("/api/config", createConfigRoutes(config, payments.account.address))
    .route("/api/auth", createAuthRoutes(store, config))
    .route(
      "/api/conversations",
      createConversationRoutes(config, store, payments)
    )
}

export type AppType = ReturnType<typeof createApp>
