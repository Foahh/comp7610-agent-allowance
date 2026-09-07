import type { Address } from "viem"

import { Hono } from "hono"

import { catalog } from "../lib/catalog.ts"

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
