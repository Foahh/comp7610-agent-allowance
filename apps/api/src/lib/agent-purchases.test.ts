import type { Purchase } from "@repo/schemas"

import { expect, test, vi } from "vite-plus/test"

import {
  createPurchaseExecutor,
  waitForSubmittedPurchase,
} from "./agent-purchases.ts"

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

test("submitted payments wait for settlement and release the next sequential purchase", async () => {
  vi.useFakeTimers()
  try {
    const records: Purchase[] = []
    const submit = vi.fn(async (id: string) => {
      const pending = { ...record(id, "pending"), txHash: `0x${id}` }
      records.push(pending)
      return waitForSubmittedPurchase(pending, async () => {
        pending.paymentStatus = "confirmed"
        return pending
      })
    })
    const execute = createPurchaseExecutor(() => records, submit)
    const result = Promise.all([execute("one"), execute("two")])
    await vi.advanceTimersByTimeAsync(0)
    expect(submit).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(submit).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(
      (await result).map(
        (item) => "paymentStatus" in item && item.paymentStatus
      )
    ).toEqual(["confirmed", "confirmed"])
    expect(records).toHaveLength(2)
  } finally {
    vi.useRealTimers()
  }
})

test("wallet handoffs and terminal payments do not enter the settlement wait", async () => {
  const refresh = vi.fn()
  for (const status of [
    "prepared",
    "pending",
    "reverted",
    "confirmed",
  ] as const) {
    const purchase = record("one", status)
    expect(await waitForSubmittedPurchase(purchase, refresh)).toBe(purchase)
  }
  expect(refresh).not.toHaveBeenCalled()
})

test("settlement waits are bounded and preserve unresolved payment state", async () => {
  vi.useFakeTimers()
  try {
    const pending = { ...record("one", "pending"), txHash: "0xsubmitted" }
    const refresh = vi.fn(async () => pending)
    const result = waitForSubmittedPurchase(pending, refresh, 5000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toBe(pending)
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(pending.paymentStatus).toBe("pending")
  } finally {
    vi.useRealTimers()
  }
})

test("a reverted transaction stops the wait immediately", async () => {
  vi.useFakeTimers()
  try {
    const pending = { ...record("one", "pending"), txHash: "0xsubmitted" }
    const refresh = vi.fn(async () => ({
      ...pending,
      paymentStatus: "reverted" as const,
    }))
    const result = waitForSubmittedPurchase(pending, refresh)
    await vi.advanceTimersByTimeAsync(2000)
    expect((await result).paymentStatus).toBe("reverted")
    expect(refresh).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
  }
})
