import { Hono } from "hono"
import type { Config } from "@repo/utils/config"
import { createProviderService } from "./provider-service.ts"
import { createCapabilityRoutes } from "./routes/capabilities/index.ts"
import { healthRoutes } from "./routes/health/index.ts"
import { createQuoteRoutes } from "./routes/quotes/index.ts"
import { createTaskRoutes } from "./routes/tasks/index.ts"
import type { ProviderStore } from "./store.ts"

export function createProviderApp(config: Config, store: ProviderStore) {
  const app = new Hono()
  const service = createProviderService(config, store)

  app.onError((error, context) =>
    context.json({ error: error.message.split("\n")[0] }, 400)
  )

  const health = app.route("/health", healthRoutes)
  const capabilities = health.route(
    "/capabilities",
    createCapabilityRoutes(service.providerAddress)
  )
  const quotes = capabilities.route("/quotes", createQuoteRoutes(service))
  return quotes.route("/tasks", createTaskRoutes(service))
}
