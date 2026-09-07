import { Hono } from "hono"
import { sValidator as validator } from "@hono/standard-validator"
import * as v from "valibot"
import { AmountSchema, TaskSchema } from "@repo/schemas"
import type { ProviderService } from "../../provider-service.ts"

export function createQuoteRoutes(
  service: Pick<ProviderService, "createQuote">
) {
  const app = new Hono()
  return app.post(
    "/",
    validator(
      "json",
      v.object({
        allowanceId: AmountSchema,
        task: TaskSchema,
      })
    ),
    async (context) => {
      const { allowanceId, task } = context.req.valid("json")
      return context.json(await service.createQuote(allowanceId, task))
    }
  )
}
