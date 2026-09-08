import type { Allowance, Conversation, SignedQuote } from "@repo/schemas"
import type { Address, Hex } from "viem"

import { quoteId, listingHash, taskHash } from "@repo/utils"
import assert from "node:assert/strict"
import { describe, test } from "vite-plus/test"

import { assertPurchasableQuote } from "./quote-validation.ts"

const owner = "0x0000000000000000000000000000000000000001" as Address
const agent = "0x0000000000000000000000000000000000000002" as Address
const seller = "0x0000000000000000000000000000000000000003" as Address
const vault = "0x0000000000000000000000000000000000000004" as Address
const chainId = 11155111
const currentTimestamp = 1_000n
const unauthorizedTaskPattern = /authorized task and allowance/
const expiredAuthorityPattern = /revoked or expired/
const purchaseCapExceededPattern = /exceeds/

function createValidInput() {
  const task = {
    service: "analysis",
    sellerId: "test",
    version: 1,
    requestId: "request",
    brief: "Compare the three available cities.",
    evidence: "",
  } as const
  const listing = {
    id: "analysis",
    version: 1,
    name: "Test",
    description: "",
    preview: "",
    type: "ai-service" as const,
    amount: "1200000",
    requiredInputs: "",
    deliverable: "A cited comparison.",
    scope: "",
    contentHash: `0x${"1".repeat(64)}`,
  }

  const quote = {
    allowanceId: "1",
    service: listingHash(listing),
    requestHash: taskHash(task, "A cited comparison."),
    recipient: seller,
    amount: "1200000",
    nonce: `0x${"1".repeat(64)}` as Hex,
    expiresAt: "1300",
  }

  const offer: SignedQuote = {
    id: quoteId(quote, chainId, vault),
    quote,
    signature: "0x12",
    listing,
    task,
    deliverable: "A cited comparison.",
  }

  const conversation: Conversation = {
    id: "conversation-1",
    owner,
    title: "Exchange semester",
    scenario: "success",
    allowanceId: "1",
    createdAt: 1,
  }

  const allowance: Allowance = {
    id: "1",
    owner,
    buyerSigner: agent,
    sellers: [seller],
    budget: "5000000",
    perPurchase: "2000000",
    spent: "0",
    remaining: "5000000",
    withdrawn: "0",
    expiresAt: "2000",
    revoked: false,
  }

  return {
    conversation,
    offer,
    allowance,
    buyerAddress: agent,
    recoveredSeller: seller,
    currentTimestamp,
    config: { chainId, vault },
  }
}

describe("quote validation", () => {
  test("accepts a quote matching its task and allowance", () => {
    assert.doesNotThrow(() => assertPurchasableQuote(createValidInput()))
  })

  test("rejects a quote for different work", () => {
    const input = createValidInput()
    input.offer.task.brief = "Use a different task instead."

    assert.throws(() => assertPurchasableQuote(input), unauthorizedTaskPattern)
  })

  test("rejects expired authority", () => {
    const input = createValidInput()
    input.allowance.expiresAt = currentTimestamp.toString()

    assert.throws(() => assertPurchasableQuote(input), expiredAuthorityPattern)
  })

  test("rejects amounts above the purchase cap", () => {
    const input = createValidInput()
    input.allowance.perPurchase = "1000000"

    assert.throws(
      () => assertPurchasableQuote(input),
      purchaseCapExceededPattern
    )
  })
})
