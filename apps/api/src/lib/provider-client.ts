import type { Config } from "@repo/utils/config"

import { DeliverySchema, type Purchase, type Task } from "@repo/schemas"
import * as v from "valibot"

const QuoteResponseSchema = v.object({
  offer: v.optional(v.unknown()),
  clarification: v.optional(v.string()),
})

const ErrorResponseSchema = v.object({ error: v.string() })

export function createProviderClient(config: Config) {
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${config.providerUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(90000),
      headers: {
        "content-type": "application/json",
        ...Object.fromEntries(new Headers(init?.headers).entries()),
      },
    })
    const body: unknown = await response.json()

    if (!response.ok) {
      const error = v.safeParse(ErrorResponseSchema, body)
      throw new Error(
        error.success ? error.output.error : "Provider request failed."
      )
    }

    return body
  }

  function capabilities() {
    return request("/capabilities")
  }

  async function quote(allowanceId: string, task: Task) {
    const response = await request("/quotes", {
      method: "POST",
      body: JSON.stringify({ allowanceId, task }),
    })

    return v.parse(QuoteResponseSchema, response)
  }

  async function deliver(purchase: Purchase, signature: string) {
    const response = await request(`/tasks/${purchase.id}`, {
      method: "POST",
      headers: { "x-agent-signature": signature },
      body: JSON.stringify({ txHash: purchase.txHash }),
    })

    return v.parse(DeliverySchema, response)
  }

  return { capabilities, quote, deliver }
}
