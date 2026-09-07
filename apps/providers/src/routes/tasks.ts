import type { Hex } from "viem"

import { sValidator as validator } from "@hono/standard-validator"
import { Hono } from "hono"
import * as v from "valibot"

import type { ProviderService } from "../lib/provider-service.ts"

const TransactionRequestSchema = v.object({
  txHash: v.pipe(v.string(), v.regex(/^0x[0-9a-fA-F]{64}$/)),
})

export function createTaskRoutes(
  service: Pick<ProviderService, "runDelivery" | "getDelivery">
) {
  const app = new Hono()

  return app
    .post(
      "/:id",
      validator("json", TransactionRequestSchema),
      async (context) => {
        const { txHash } = context.req.valid("json")
        const result = await service.runDelivery(
          context.req.param("id"),
          context.req.header("x-agent-signature"),
          txHash as Hex
        )

        return context.json(result)
      }
    )
    .get("/:id", async (context) => {
      const result = await service.getDelivery(
        context.req.param("id"),
        context.req.header("x-agent-signature")
      )

      return context.json(result)
    })
}
