import { queryOptions } from "@tanstack/react-query"
import { hc } from "hono/client"
import * as v from "valibot"
import type { AppType } from "@repo/api"
import { HealthSchema } from "@repo/schemas"

const client = hc<AppType>("/")

async function fetchHealth() {
  const response = await client.api.health.$get()

  if (!response.ok) {
    throw new Error("API or database is unavailable")
  }

  const data = await response.json()
  return v.parse(HealthSchema, data)
}

export const healthQueryOptions = queryOptions({
  queryKey: ["health"],
  queryFn: fetchHealth,
})
