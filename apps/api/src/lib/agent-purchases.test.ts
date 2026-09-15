import type { Purchase } from "@repo/schemas"

import { expect, test } from "vite-plus/test"

import { createPurchaseExecutor } from "./agent-purchases.ts"

function record(id: string, status: Purchase["paymentStatus"] = "prepared") {
  return {
    id,
    paymentStatus: status,
    authorization: status === "rejected" ? undefined : { fromBlock: "1" },
  } as Purchase
}

test("blocked and rejected attempts leave room for two authorized purchases", async () => {
  const records: Purchase[] = []
  const execute = createPurchaseExecutor(
    () => records,
    async (id) => {
      if (id === "blocked") {
        throw new Error("Another payment is unresolved")
      }
      const value = record(id, id === "rejected" ? "rejected" : "confirmed")
      records.push(value)
      return value
    }
  )
  await expect(execute("blocked")).rejects.toThrow("unresolved")
  await execute("rejected")
  expect(await execute("one")).toHaveProperty("id", "one")
  expect(await execute("two")).toHaveProperty("id", "two")
  expect(await execute("three")).toHaveProperty("error")
})

test("parallel calls cannot exceed the two-purchase limit and existing purchases remain reusable", async () => {
  const records: Purchase[] = [record("owned", "confirmed")]
  const execute = createPurchaseExecutor(
    () => records,
    async (id) => {
      await Promise.resolve()
      const existing = records.find((value) => value.id === id)
      if (existing) {
        return existing
      }
      const value = record(id, "confirmed")
      records.push(value)
      return value
    }
  )
  const results = await Promise.all([
    execute("one"),
    execute("two"),
    execute("three"),
  ])
  expect(results[2]).toHaveProperty("error")
  expect(records).toHaveLength(3)
  expect(await execute("owned")).toHaveProperty("id", "owned")
})

test("a replacement quote that reuses an owned item does not consume a slot", async () => {
  const records: Purchase[] = [record("owned", "confirmed")]
  const execute = createPurchaseExecutor(
    () => records,
    async (id) => {
      if (id === "replacement") {
        return records[0]!
      }
      const value = record(id, "confirmed")
      records.push(value)
      return value
    }
  )
  await execute("replacement")
  await execute("one")
  expect(await execute("two")).toHaveProperty("id", "two")
})
