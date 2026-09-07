import type { Config } from "@repo/utils/config"

import { Hono } from "hono"
import assert from "node:assert/strict"
import { test } from "vite-plus/test"

import type { Payments } from "../lib/payments.ts"

import { openBuyerDatabase } from "../lib/store.ts"
import { createConversationRoutes, type AppEnv } from "./conversations.ts"

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
  app.route("/", createConversationRoutes({} as Config, store, payments))
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
