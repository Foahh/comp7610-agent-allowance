import { Hono } from "hono"
import type { Health } from "@repo/schemas"

export function createHealthRoutes(checkDatabase: () => void) {
  const app = new Hono()

  const routes = app.get("/", (context) => {
    try {
      checkDatabase()
      return context.json({
        status: "ok",
        service: "api",
        database: "ok",
      } satisfies Health)
    } catch {
      return context.json(
        { status: "error", service: "api", database: "unavailable" } as const,
        503
      )
    }
  })

  return routes
}
