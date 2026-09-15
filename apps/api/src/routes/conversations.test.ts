import type { Purchase } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { Hono } from "hono"
import assert from "node:assert/strict"
import { test } from "vite-plus/test"

import type { BuyerAgent } from "../lib/agent.ts"
import type { Payments } from "../lib/payments.ts"

import { openBuyerDatabase } from "../lib/store.ts"
import { createConversationRoutes, type AppEnv } from "./conversations.ts"

test("conversation reads reconcile payment and delivery before returning the balance", async () => {
  const events: string[] = []
  const purchase = {
    id: "paid",
    paymentStatus: "pending",
    delivery: undefined,
  } as unknown as Purchase
  const store = {
    getConversation: () => ({ id: "chat", owner: "alice", allowanceId: "1" }),
    listMessages: () => [],
    listPurchases: () => [purchase],
    getPurchasePlan: () => [],
  } as unknown as ReturnType<typeof openBuyerDatabase>
  const payments = {
    recoverAll: async (id: string) => {
      assert.equal(id, "chat")
      events.push("recover")
      purchase.paymentStatus = "confirmed"
    },
    allowance: async () => {
      events.push("balance")
      return { spent: "3000000", remaining: "97000000" }
    },
  } as unknown as Payments
  const agent = {
    deliver: async () => {
      events.push("deliver")
    },
    purchase: () => {
      assert.fail("A page read must never purchase")
    },
  } as unknown as BuyerAgent
  const app = new Hono<AppEnv>()
  app.use("*", async (context, next) => {
    context.set("owner", "alice")
    await next()
  })
  app.route("/", createConversationRoutes({} as Config, store, payments, agent))
  const response = await app.request("/chat")
  assert.equal(response.status, 200)
  const data = (await response.json()) as {
    purchases: Purchase[]
    allowance: { spent: string }
  }
  assert.equal(data.purchases[0]!.paymentStatus, "confirmed")
  assert.equal(data.allowance.spent, "3000000")
  assert.deepEqual(events, ["recover", "deliver", "balance"])
})

test("deletion enforces ownership and protects funded allowances", async () => {
  const store = openBuyerDatabase(":memory:")
  let revoked = false
  let remaining = "10"
  const payments = {
    allowance: async () => ({ revoked, remaining }),
  } as unknown as Payments
  const app = new Hono<AppEnv>()
  app.use("*", async (context, next) => {
    context.set("owner", "alice")
    await next()
  })
  app.route(
    "/",
    createConversationRoutes({} as Config, store, payments, {} as BuyerAgent)
  )
  const remove = (id: string) => app.request(`/${id}`, { method: "DELETE" })

  try {
    for (const [id, owner, allowanceId] of [
      ["mine", "alice", null],
      ["theirs", "bob", null],
      ["funded", "alice", "1"],
    ]) {
      store.saveConversation({
        id: id!,
        owner: owner!,
        allowanceId: allowanceId ?? null,
        title: "Chat",
        scenario: "success",
        createdAt: 1,
      })
    }
    assert.equal((await remove("theirs")).status, 404)
    assert.ok(store.getConversation("theirs"))
    assert.equal((await remove("mine")).status, 200)
    assert.equal((await remove("mine")).status, 404)
    assert.equal((await remove("funded")).status, 409)
    revoked = true
    assert.equal((await remove("funded")).status, 409)
    assert.ok(store.getConversation("funded"))
    remaining = "0"
    assert.equal((await remove("funded")).status, 200)
    assert.equal(store.getConversation("funded"), undefined)
  } finally {
    store.close()
  }
})
