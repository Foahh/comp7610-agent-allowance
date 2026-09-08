import type { Config } from "@repo/utils/config"

import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"

import type { BuyerStore } from "./lib/store.ts"
import type { SellerStore } from "./seller/lib/store.ts"

import { createAgent } from "./lib/agent.ts"
import { createPayments } from "./lib/payments.ts"
import { createAuthRoutes, activeSession } from "./routes/auth.ts"
import { createConfigRoutes } from "./routes/config.ts"
import {
  createConversationRoutes,
  type AppEnv,
} from "./routes/conversations.ts"
import { healthRoutes } from "./routes/health.ts"
import { createMarketplaceRoutes } from "./routes/marketplace.ts"
import { createMarketplace } from "./seller/lib/marketplace.ts"
import { createSellerService } from "./seller/lib/seller-service.ts"
import { createProtocolRoutes } from "./seller/routes/protocol.ts"

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const PUBLIC_API_PATHS = new Set(["/api/config", "/api/health"])
const AUTH_API_PATH = "/api/auth"

function isAuthenticationPath(path: string) {
  return path === AUTH_API_PATH || path.startsWith(`${AUTH_API_PATH}/`)
}

function isPublicApiPath(path: string) {
  return PUBLIC_API_PATHS.has(path) || isAuthenticationPath(path)
}

export function createApp(
  config: Config,
  store: BuyerStore,
  payments = createPayments(config, store),
  sellerStore: SellerStore = store,
  sessionStore: BuyerStore = store
) {
  const app = new Hono<AppEnv>()
  const market = createMarketplace(config, sellerStore)
  const service = createSellerService(config, sellerStore, market)
  const agent = createAgent(config, store, payments, market)

  app.onError((error, context) => {
    const status = error instanceof HTTPException ? error.status : 400

    return context.json({ error: error.message.split("\n")[0] }, status)
  })

  app.use("/api/*", async (context, next) => {
    // Public seller routes can serve the LAN; management remains local.
    // Inspect the socket address, never a caller-controlled forwarding header.
    const bindings = context.env?.server || context.env
    const remoteAddress = bindings?.incoming?.socket.remoteAddress

    if (remoteAddress && !LOOPBACK_ADDRESSES.has(remoteAddress)) {
      return context.json(
        { error: "Management is available only from this installation." },
        403
      )
    }

    if (!READ_ONLY_METHODS.has(context.req.method)) {
      if (context.req.header("origin") !== config.appOrigin) {
        return context.json({ error: "Untrusted request origin." }, 403)
      }
    }

    await next()
  })

  app.use("/api/*", async (context, next) => {
    if (isPublicApiPath(context.req.path)) {
      return next()
    }

    const token = getCookie(context, config.cookieName)
    const session = activeSession(sessionStore, config, token)

    if (
      !session ||
      session.expiresAt <= Date.now() ||
      session.owner !== config.owner.toLowerCase()
    ) {
      return context.json({ error: "Connect and verify your wallet." }, 401)
    }
    context.set("owner", session.owner)
    await next()
  })

  return app
    .route("/v1", createProtocolRoutes(config, market, service, sellerStore))
    .route("/api/health", healthRoutes)
    .route("/api/config", createConfigRoutes(config, payments.account.address))
    .route("/api/auth", createAuthRoutes(sessionStore, config))
    .route(
      "/api/marketplace",
      createMarketplaceRoutes(config, store, payments, agent, market, service)
    )
    .route(
      "/api/conversations",
      createConversationRoutes(config, store, payments, agent)
    )
}

export type AppType = ReturnType<typeof createApp>
