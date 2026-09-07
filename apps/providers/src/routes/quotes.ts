import { sValidator as validator } from "@hono/standard-validator"
import { AmountSchema, TaskSchema } from "@repo/schemas"
import { Hono } from "hono"
import * as v from "valibot"

import type { ProviderService } from "../lib/provider-service.ts"

const QuoteRequestSchema = v.object({
  allowanceId: AmountSchema,
  task: TaskSchema,
})

export function createQuoteRoutes(
  service: Pick<ProviderService, "createQuote">
) {
  const app = new Hono()

  return app.post(
    "/",
    validator("json", QuoteRequestSchema),
    async (context) => {
      const { allowanceId, task } = context.req.valid("json")
      return context.json(await service.createQuote(allowanceId, task))
    }
  )
}
