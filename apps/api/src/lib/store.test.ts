import type { Conversation, Purchase, SignedQuote } from "@repo/schemas"

import {
  conversations,
  messages,
  purchases,
  deliveries,
  deliveryReferences,
  purchasePlanItems,
  eq,
} from "@repo/db"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { describe, test } from "vite-plus/test"

import { openSellerDatabase } from "../seller/lib/store.ts"
import { purchasePlanProgress } from "./purchase-plan.ts"
import { openBuyerDatabase } from "./store.ts"

const conversation: Conversation = {
  id: "conversation-1",
  owner: "0x1234",
  title: "Test",
  scenario: "success",
  allowanceId: null,
  createdAt: 1,
}

function offer(id = "quote-1"): SignedQuote {
  return {
    id,
    signature: "0x1234",
    deliverable: "Report",
    listing: {
      id: "analysis",
      version: 1,
      name: "Test",
      description: "",
      preview: "",
      type: "text",
      amount: "1",
      requiredInputs: "",
      deliverable: "Report",
      scope: "",
      contentHash: "0x01",
    },
    task: {
      service: "analysis",
      sellerId: "test",
      version: 1,
      requestId: "request",
      brief: "Compare the available cities.",
      evidence: "",
    },
    quote: {
      allowanceId: "1",
      service: "0x01",
      requestHash: "0x02",
      recipient: "0x03",
      amount: (2n ** 255n).toString(),
      nonce: "0x04",
      expiresAt: "9999999999",
    },
  }
}

function purchase(id = "quote-1"): Purchase {
  return {
    id,
    conversationId: conversation.id,
    offer: offer(id),
    paymentStatus: "prepared",
    txHash: "0xab",
    authorization: { signature: "0xabcdef", fromBlock: "123" },
    createdAt: 10,
  }
}

describe("relational storage", () => {
  test("deleted purchases stay hidden after reopen and recovery without losing payment records", () => {
    const directory = mkdtempSync(join(tmpdir(), "deleted-purchases-"))
    const filename = join(directory, "buyer.sqlite")
    let store = openBuyerDatabase(filename)
    try {
      store.saveConversation(conversation)
      const value = purchase()
      store.savePurchase(value)
      const stored = store.getPurchase(value.id)
      store.savePurchase(purchase("kept"))
      store.deleteOrder(value.id, "purchase")
      assert.deepEqual(
        store.listVisiblePurchases().map((item) => item.id),
        ["kept"]
      )
      assert.equal(store.listUnresolvedPurchases().length, 2)
      assert.deepEqual(store.getPurchase(value.id), stored)
      store.close()
      store = openBuyerDatabase(filename)
      store.savePurchase({ ...value, paymentStatus: "confirmed" })
      assert.deepEqual(
        store.listVisiblePurchases().map((item) => item.id),
        ["kept"]
      )
      assert.equal(store.getPurchase(value.id)?.paymentStatus, "confirmed")
      assert.equal(store.deletedOrderIds("sale").size, 0)
    } finally {
      store.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("plan rows preserve order and exact prices, replace atomically, and clear by conversation", () => {
    const store = openBuyerDatabase(":memory:")
    try {
      store.saveConversation(conversation)
      store.saveConversation({ ...conversation, id: "other" })
      const value = offer()
      const first = {
        task: value.task,
        listing: { ...value.listing, amount: (2n ** 255n).toString() },
        recipient: value.quote.recipient,
      }
      const second = { ...first, task: { ...first.task, requestId: "second" } }
      store.savePurchasePlan(conversation.id, [second, first])
      store.savePurchasePlan("other", [first])
      assert.deepEqual(store.getPurchasePlan(conversation.id), [second, first])
      const rows = store.db
        .select()
        .from(purchasePlanItems)
        .where(eq(purchasePlanItems.conversationId, conversation.id))
        .orderBy(purchasePlanItems.position)
        .all()
      assert.deepEqual(
        rows.map((row) => [row.position, row.requestId, row.amount]),
        [
          [0, "second", first.listing.amount],
          [1, "request", first.listing.amount],
        ]
      )
      // A database constraint failure after DELETE must restore the previous plan.
      const invalid = {
        ...first,
        task: { ...first.task, version: 0 },
        listing: { ...first.listing, version: 0 },
      }
      assert.throws(() => store.savePurchasePlan(conversation.id, [invalid]))
      assert.deepEqual(store.getPurchasePlan(conversation.id), [second, first])
      store.savePurchasePlan(conversation.id, [first])
      assert.deepEqual(store.getPurchasePlan(conversation.id), [first])
      store.savePurchasePlan(conversation.id, [])
      assert.deepEqual(store.getPurchasePlan(conversation.id), [])
      assert.deepEqual(store.getPurchasePlan("other"), [first])
    } finally {
      store.close()
    }
  })

  test("startup migrates legacy JSON plans to ordered rows and preserves them across reopen", () => {
    const filename = join(tmpdir(), `mandate-plan-${randomUUID()}.sqlite`)
    const value = offer()
    const first = {
      task: value.task,
      listing: { ...value.listing, amount: (2n ** 255n).toString() },
      recipient: value.quote.recipient,
    }
    const plan = [
      first,
      { ...first, task: { ...first.task, requestId: "second" } },
    ]
    try {
      const initial = openBuyerDatabase(filename)
      initial.saveConversation(conversation)
      initial.close()
      const legacy = new DatabaseSync(filename)
      try {
        legacy.exec(
          "DROP TABLE purchase_plan_items; CREATE TABLE purchase_plans (conversation_id TEXT PRIMARY KEY REFERENCES conversations(id), items TEXT NOT NULL); PRAGMA user_version = 2"
        )
        legacy
          .prepare("INSERT INTO purchase_plans VALUES (?, ?)")
          .run(conversation.id, JSON.stringify(plan))
      } finally {
        legacy.close()
      }
      const migrated = openBuyerDatabase(filename)
      try {
        assert.deepEqual(migrated.getPurchasePlan(conversation.id), plan)
      } finally {
        migrated.close()
      }
      const reopened = openBuyerDatabase(filename)
      try {
        assert.deepEqual(reopened.getPurchasePlan(conversation.id), plan)
      } finally {
        reopened.close()
      }
      const inspect = new DatabaseSync(filename)
      try {
        assert.equal(
          inspect
            .prepare(
              "SELECT name FROM sqlite_master WHERE name = 'purchase_plans'"
            )
            .get(),
          undefined
        )
        assert.equal(
          inspect.prepare("PRAGMA user_version").get()?.user_version,
          4
        )
      } finally {
        inspect.close()
      }
    } finally {
      rmSync(filename, { force: true })
    }
  })

  test("a failed plan migration preserves legacy data and schema version", () => {
    const filename = join(tmpdir(), `mandate-plan-${randomUUID()}.sqlite`)
    try {
      const initial = openBuyerDatabase(filename)
      initial.saveConversation(conversation)
      initial.close()
      const legacy = new DatabaseSync(filename)
      try {
        legacy.exec(
          "DROP TABLE purchase_plan_items; CREATE TABLE purchase_plans (conversation_id TEXT PRIMARY KEY REFERENCES conversations(id), items TEXT NOT NULL); PRAGMA user_version = 2"
        )
        legacy
          .prepare("INSERT INTO purchase_plans VALUES (?, ?)")
          .run(conversation.id, "invalid JSON")
      } finally {
        legacy.close()
      }
      assert.throws(() => openBuyerDatabase(filename))
      const inspect = new DatabaseSync(filename)
      try {
        assert.equal(
          inspect.prepare("SELECT items FROM purchase_plans").get()?.items,
          "invalid JSON"
        )
        assert.equal(
          inspect.prepare("PRAGMA user_version").get()?.user_version,
          2
        )
        assert.equal(
          inspect
            .prepare(
              "SELECT name FROM sqlite_master WHERE name = 'purchase_plan_items'"
            )
            .get(),
          undefined
        )
      } finally {
        inspect.close()
      }
    } finally {
      rmSync(filename, { force: true })
    }
  })

  test("saved plans retain task identity and prefer paid static items over failed retries", () => {
    const store = openBuyerDatabase(":memory:")
    try {
      store.saveConversation(conversation)
      const item = offer()
      const plan = [
        {
          task: item.task,
          listing: item.listing,
          recipient: item.quote.recipient,
        },
      ]
      store.savePurchasePlan(conversation.id, plan)
      const paid = { ...purchase(), paymentStatus: "confirmed" as const }
      const retry = { ...purchase("retry"), paymentStatus: "rejected" as const }
      store.savePurchase(paid)
      store.savePurchase(retry)
      const progress = purchasePlanProgress(
        store.getPurchasePlan(conversation.id),
        store.listPurchases()
      )
      assert.equal(progress[0]?.purchase?.id, paid.id)
      assert.deepEqual(progress[0]?.task, item.task)
      store.deleteConversation(conversation.id)
      assert.deepEqual(store.getPurchasePlan(conversation.id), [])
    } finally {
      store.close()
    }
  })

  test("a plan does not mistake another seller, version, or AI request for its purchase", () => {
    const paid = { ...purchase(), paymentStatus: "confirmed" as const }
    const item = paid.offer
    const base = {
      task: item.task,
      listing: item.listing,
      recipient: item.quote.recipient,
    }
    assert.equal(
      purchasePlanProgress([{ ...base, recipient: "0x99" }], [paid])[0]
        ?.purchase,
      undefined
    )
    assert.equal(
      purchasePlanProgress(
        [{ ...base, listing: { ...item.listing, version: 2 } }],
        [paid]
      )[0]?.purchase,
      undefined
    )
    assert.equal(
      purchasePlanProgress(
        [
          {
            ...base,
            listing: { ...item.listing, type: "ai-service" },
            task: { ...item.task, requestId: "new-work" },
          },
        ],
        [paid]
      )[0]?.purchase,
      undefined
    )
  })

  test("generic conversation titles follow the first message while custom titles remain intact", () => {
    const store = openBuyerDatabase(":memory:")
    try {
      store.saveConversation({ ...conversation, title: "Exchange semester" })
      store.saveMessage({
        id: "first",
        conversationId: conversation.id,
        role: "user",
        content: "Show me available items",
        createdAt: 1,
      })
      assert.equal(
        store.getConversation(conversation.id)?.title,
        "Show me available items"
      )
      assert.equal(
        store.listConversations(conversation.owner)[0]?.title,
        "Show me available items"
      )
      store.saveConversation({ ...conversation, title: "My research" })
      assert.equal(store.getConversation(conversation.id)?.title, "My research")
    } finally {
      store.close()
    }
  })
  test("deletes chat messages and hides the conversation while retaining payment records", () => {
    const store = openBuyerDatabase(":memory:")

    try {
      store.saveConversation(conversation)
      store.saveConversation({ ...conversation, id: "other" })
      store.bindAllowance(conversation, "1")
      store.savePurchase(purchase())
      store.saveMessage({
        id: "message",
        conversationId: conversation.id,
        role: "user",
        content: "Private chat",
        createdAt: 1,
      })
      store.deleteConversation(conversation.id)
      assert.equal(store.getConversation(conversation.id), undefined)
      assert.deepEqual(
        store.listConversations(conversation.owner).map((item) => item.id),
        ["other"]
      )
      assert.deepEqual(store.listMessages(conversation.id), [])
      assert.equal(store.getAllowance("1")?.conversationId, conversation.id)
      assert.equal(
        store.getPurchase("quote-1")?.authorization?.signature,
        "0xabcdef"
      )
      assert.equal(store.listUnresolvedPurchases().length, 1)
      store.deleteConversation(conversation.id)
    } finally {
      store.close()
    }
  })
  test("persists journal columns and reconstructs nested responses after reopening", () => {
    const directory = mkdtempSync(join(tmpdir(), "allowance-db-test-"))
    const path = join(directory, "buyer.sqlite")
    let store = openBuyerDatabase(path)

    try {
      store.saveConversation(conversation)
      const record = purchase()
      store.savePurchase(record)
      const row = store.db.select().from(purchases).get()!
      assert.equal(row.buyerSignature, record.authorization?.signature)
      assert.equal(row.authorizationFromBlock, "123")
      assert.equal("data" in row, false)
      store.close()
      store = openBuyerDatabase(path)
      const restored = store.getPurchase(record.id)!
      assert.deepEqual(restored.authorization, record.authorization)
      assert.equal(restored.offer.quote.amount, (2n ** 255n).toString())
      assert.deepEqual(restored.offer, record.offer)
      assert.deepEqual(
        store.listUnresolvedPurchases().map((row) => row.id),
        [record.id]
      )
      restored.paymentStatus = "confirmed"
      restored.error = undefined
      store.savePurchase(restored)
      assert.equal(store.listUnresolvedPurchases().length, 0)
      assert.equal(store.listPurchases("other-conversation").length, 0)
    } finally {
      store.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("enforces foreign keys and status constraints, and filters conversation children", () => {
    const store = openBuyerDatabase(":memory:")

    try {
      assert.throws(() =>
        store.saveMessage({
          id: "orphan",
          conversationId: "missing",
          role: "user",
          content: "Hi",
          createdAt: 1,
        })
      )
      store.saveConversation(conversation)
      store.saveConversation({
        ...conversation,
        id: "other",
        owner: "other-owner",
      })
      store.saveMessage({
        id: "late",
        conversationId: conversation.id,
        role: "assistant",
        content: "Later",
        createdAt: 20,
      })
      store.saveMessage({
        id: "early",
        conversationId: conversation.id,
        role: "user",
        content: "Earlier",
        createdAt: 10,
      })
      assert.deepEqual(
        store.listMessages(conversation.id).map((row) => row.id),
        ["early", "late"]
      )
      assert.equal(store.listMessages("other").length, 0)
      assert.equal(store.listConversations(conversation.owner).length, 1)
      assert.throws(() =>
        store.db.$client.exec("UPDATE conversations SET scenario = 'invalid'")
      )
      assert.throws(() =>
        store.db
          .delete(conversations)
          .where(eq(conversations.id, conversation.id))
          .run()
      )
      assert.equal(store.db.select().from(messages).all().length, 2)
    } finally {
      store.close()
    }
  })

  test("binds allowances atomically and rejects duplicate runs", () => {
    const store = openBuyerDatabase(":memory:")

    try {
      store.saveConversation(conversation)
      const other = { ...conversation, id: "other" }
      store.saveConversation(other)
      store.bindAllowance(conversation, "1")
      assert.throws(() => store.bindAllowance(other, "1"))
      assert.equal(store.getConversation(other.id)?.allowanceId, null)
      assert.equal(store.getAllowance("1")?.conversationId, conversation.id)
      store.bindAllowance(conversation, "2")
      assert.equal(store.getConversation(conversation.id)?.allowanceId, "2")
      assert.equal(store.getAllowance("1")?.conversationId, conversation.id)
      assert.equal(store.acceptRun("run-1", conversation.id), true)
      assert.equal(store.acceptRun("run-1", conversation.id), false)
    } finally {
      store.close()
    }
  })

  test("saves delivery children transactionally and rolls back a failed purchase update", () => {
    const store = openBuyerDatabase(":memory:")

    try {
      store.saveConversation(conversation)
      const record = purchase()
      record.delivery = {
        purchaseId: record.id,
        status: "running",
        content: "",
        references: ["first", "second"],
        modelMs: 0,
        deliveryMs: 0,
        error: "temporary",
      }

      store.savePurchase(record)
      assert.deepEqual(store.getPurchase(record.id)?.delivery?.references, [
        "first",
        "second",
      ])
      record.delivery = {
        ...record.delivery,
        status: "completed",
        content: "Done",
        references: ["replacement"],
        error: undefined,
      }
      record.paymentStatus = "confirmed"
      store.savePurchase(record)
      assert.equal(store.db.select().from(deliveryReferences).all().length, 1)
      assert.equal(store.db.select().from(deliveries).get()?.error, null)
      const invalid = {
        ...record,
        paymentStatus: "reverted" as const,
        delivery: { ...record.delivery, purchaseId: "missing-quote" },
      }
      assert.throws(() => store.savePurchase(invalid))
      assert.equal(store.getPurchase(record.id)?.paymentStatus, "confirmed")
      assert.deepEqual(store.getPurchase(record.id)?.delivery?.references, [
        "replacement",
      ])
    } finally {
      store.close()
    }
  })

  test("seller quotes and deliveries do not require buyer-side records", () => {
    const store = openSellerDatabase(":memory:")

    try {
      const quote = offer()
      store.saveQuote(quote)
      assert.deepEqual(store.getQuote(quote.id), quote)
      store.saveDelivery({
        purchaseId: quote.id,
        status: "completed",
        content: "Done",
        references: ["source"],
        modelMs: 1.5,
        deliveryMs: 2.5,
      })
      assert.equal(store.getDelivery(quote.id)?.content, "Done")
      assert.equal(store.db.select().from(conversations).all().length, 0)
      assert.equal(store.db.select().from(purchases).all().length, 0)
    } finally {
      store.close()
    }
  })
})
