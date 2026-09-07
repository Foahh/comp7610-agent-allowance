import type { Config } from "@repo/utils/config"

import { Hono } from "hono"

import type { ProviderStore } from "./lib/store.ts"

import { createProviderService } from "./lib/provider-service.ts"
import { createCapabilityRoutes } from "./routes/capabilities.ts"
import { healthRoutes } from "./routes/health.ts"
import { createQuoteRoutes } from "./routes/quotes.ts"
import { createTaskRoutes } from "./routes/tasks.ts"

export function createProviderApp(config: Config, store: ProviderStore) {
  const app = new Hono()
  const service = createProviderService(config, store)

  app.onError((error, context) =>
    context.json({ error: error.message.split("\n")[0] }, 400)
  )

  return app
    .route("/health", healthRoutes)
    .route("/capabilities", createCapabilityRoutes(service.providerAddress))
    .route("/quotes", createQuoteRoutes(service))
    .route("/tasks", createTaskRoutes(service))
    .route("/tasks", createTaskRoutes(service))
}
