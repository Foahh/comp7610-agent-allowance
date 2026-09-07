import assert from "node:assert/strict"
import { describe, test } from "vite-plus/test"
import type { Address, Hex } from "viem"
import type { Allowance, Conversation, SignedQuote } from "@repo/schemas"
import { quoteId, serviceHash, taskHash } from "@repo/utils"
import { assertPurchasableQuote } from "./quote-validation.ts"

const owner = "0x0000000000000000000000000000000000000001" as Address
const agent = "0x0000000000000000000000000000000000000002" as Address
const provider = "0x0000000000000000000000000000000000000003" as Address
const vault = "0x0000000000000000000000000000000000000004" as Address
const chainId = 11155111
const currentTimestamp = 1_000n

function createValidInput() {
  const task = {
    service: "analysis",
    brief: "Compare the three available cities.",
    evidence: "",
  } as const
  const quote = {
    allowanceId: "1",
    service: serviceHash(task.service),
    requestHash: taskHash(task),
    recipient: provider,
    amount: "1200000",
    nonce: ("0x" + "1".repeat(64)) as Hex,
    expiresAt: "1300",
  }
  const offer: SignedQuote = {
    id: quoteId(quote, chainId, vault),
    quote,
    signature: "0x12",
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
    agent,
    provider,
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
    agentAddress: agent,
    recoveredProvider: provider,
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

    assert.throws(
      () => assertPurchasableQuote(input),
      /authorized task and allowance/
    )
  })

  test("rejects expired authority", () => {
    const input = createValidInput()
    input.allowance.expiresAt = currentTimestamp.toString()

    assert.throws(() => assertPurchasableQuote(input), /revoked or expired/)
  })

  test("rejects amounts above the purchase cap", () => {
    const input = createValidInput()
    input.allowance.perPurchase = "1000000"

    assert.throws(() => assertPurchasableQuote(input), /exceeds/)
  })
})
