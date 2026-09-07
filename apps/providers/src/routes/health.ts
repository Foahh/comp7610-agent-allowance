import type { Health } from "@repo/schemas"

import { Hono } from "hono"

const app = new Hono()

export const healthRoutes = app.get("/", (context) => {
  return context.json({
    status: "ok",
    service: "providers",
  } satisfies Health)
})
