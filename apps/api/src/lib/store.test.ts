import type { Conversation, Purchase, SignedQuote } from "@repo/schemas"

import {
  conversations,
  messages,
  purchases,
  deliveries,
  deliveryReferences,
  eq,
} from "@repo/db"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "vite-plus/test"

import { openSellerDatabase } from "../seller/lib/store.ts"
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
    rawTransaction: "0xabcdef",
    nonce: 0,
    paymentMs: 1.25,
    createdAt: 10,
  }
}

describe("relational storage", () => {
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
      assert.equal(store.getPurchase("quote-1")?.rawTransaction, "0xabcdef")
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
      assert.equal(row.rawTransaction, record.rawTransaction)
      assert.equal(row.nonce, 0)
      assert.equal(row.paymentMs, 1.25)
      assert.equal("data" in row, false)
      store.close()
      store = openBuyerDatabase(path)
      const restored = store.getPurchase(record.id)!
      assert.equal(restored.rawTransaction, record.rawTransaction)
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
