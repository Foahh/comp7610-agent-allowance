import { Hono } from "hono"
import type { Address } from "viem"
import { catalog } from "../../catalog.ts"

export function createCapabilityRoutes(providerAddress: Address) {
  const app = new Hono()
  return app.get("/", (context) =>
    context.json({
      name: "Exchange Evidence Specialist",
      provider: providerAddress,
      services: catalog,
    })
  )
}
