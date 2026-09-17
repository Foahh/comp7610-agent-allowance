import type { ChatEvent, Conversation, Purchase, Delivery } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { MockLanguageModelV3 } from "ai/test"
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test"

import type { Marketplace } from "../seller/lib/marketplace.ts"
import type { Payments } from "./payments.ts"

import { MAX_AGENT_STEPS } from "./agent-prompts.ts"
import { createAgent } from "./agent.ts"
import { openBuyerDatabase } from "./store.ts"

const modelFactory = vi.hoisted(() => vi.fn())
const sellerDeliver = vi.hoisted(() => vi.fn())
const sellerDiscover = vi.hoisted(() => vi.fn())
vi.mock("@repo/utils/model", () => ({ createModel: modelFactory }))
vi.mock("./seller-client.ts", () => ({
  createSellerClient: () => ({
    discover: sellerDiscover,
    deliver: sellerDeliver,
  }),
}))

const conversation: Conversation = {
  id: "chat",
  owner: "0x0000000000000000000000000000000000000001",
  title: "Test",
  scenario: "success",
  allowanceId: null,
  createdAt: 1,
}
let store: ReturnType<typeof openBuyerDatabase>
beforeEach(() => {
  sellerDiscover.mockReturnValue([])
  store = openBuyerDatabase(":memory:")
  store.saveConversation(conversation)
})

test("quoting an owned static item restores it and explicitly reports no new charge", async () => {
  const listing = { id: "dataset", version: 1, type: "file" }
  sellerDiscover.mockReturnValue([
    {
      sellerId: "alice",
      seller: { address: conversation.owner },
      listing,
    },
  ])
  const owned = {
    id: "owned",
    paymentStatus: "confirmed",
    offer: { listing, quote: { recipient: conversation.owner } },
  } as Purchase
  const restoreOrder = vi.fn()
  const agent = createAgent(
    {} as Config,
    {
      listPurchases: () => [owned],
      restoreOrder,
    } as unknown as typeof store,
    {} as Payments,
    {} as Marketplace
  )
  const result = await agent.quote(conversation, {
    service: "dataset",
    version: 1,
    sellerId: "alice",
    requestId: "reuse",
    brief: "Read the dataset",
    evidence: "",
  })
  expect(result).toEqual({
    purchase: owned,
    reused: true,
    chargedThisRun: false,
  })
  expect(restoreOrder).toHaveBeenCalledWith(owned.id, "purchase")
})
afterEach(() => {
  store.close()
  vi.clearAllMocks()
})

async function runWorkflow(finishAt: number) {
  let calls = 0
  const model = new MockLanguageModelV3({
    doStream: async ({ toolChoice }) => {
      calls += 1
      const final = toolChoice?.type === "none" || calls === finishAt
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] })
            if (final) {
              controller.enqueue({ type: "text-start", id: "answer" })
              controller.enqueue({
                type: "text-delta",
                id: "answer",
                delta: "Here is the completed result.",
              })
              controller.enqueue({ type: "text-end", id: "answer" })
            } else {
              controller.enqueue({
                type: "tool-call",
                toolCallId: `call-${calls}`,
                toolName: "discoverListings",
                input: "{}",
              })
            }
            controller.enqueue({
              type: "finish",
              finishReason: {
                unified: final ? "stop" : "tool-calls",
                raw: undefined,
              },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            })
            controller.close()
          },
        }),
      }
    },
  })
  modelFactory.mockReturnValue(model)
  const payments = { recoverAll: async () => {} } as unknown as Payments
  const market = {
    profile: () => ({ buyerModelId: "test" }),
    runtimeModel: () => ({}),
  } as unknown as Marketplace
  const agent = createAgent({} as Config, store, payments, market)
  const events: ChatEvent[] = []
  await agent.run(conversation, "Complete this task.", async (event) => {
    events.push(event)
  })
  return {
    model,
    events,
    answer: store.listMessages(conversation.id).at(-1)?.content,
  }
}

test("a final answer on the eighth step has no false limit warning", async () => {
  const { model, answer, events } = await runWorkflow(8)
  expect(model.doStreamCalls).toHaveLength(8)
  expect(answer).toBe("Here is the completed result.")
  expect(events.some((event) => event.type === "error")).toBe(false)
})

test("workflows can continue beyond eight steps and finish normally", async () => {
  const { model, answer } = await runWorkflow(11)
  expect(model.doStreamCalls).toHaveLength(11)
  expect(answer).toBe("Here is the completed result.")
})

test("a looping workflow gets a final text-only turn before the bound", async () => {
  const { model, answer } = await runWorkflow(Infinity)
  expect(model.doStreamCalls).toHaveLength(MAX_AGENT_STEPS)
  const final = model.doStreamCalls.at(-1)!
  expect(final.toolChoice?.type).toBe("none")
  expect(final.tools ?? []).toHaveLength(0)
  expect(JSON.stringify(final.prompt)).toContain(
    "Do not claim unfinished work is complete"
  )
  expect(answer).toBe("Here is the completed result.")
})

test("overlapping delivery refreshes share a job and expose running status immediately", async () => {
  let complete!: (value: Delivery) => void
  sellerDeliver.mockReturnValue(
    new Promise<Delivery>((resolve) => {
      complete = resolve
    })
  )
  const savePurchase = vi.fn()
  const agent = createAgent(
    {} as Config,
    { savePurchase } as unknown as typeof store,
    {} as Payments,
    {} as Marketplace
  )
  const purchase = { id: "purchase", paymentStatus: "confirmed" } as Purchase
  const first = agent.deliver(purchase, async () => {})
  const second = agent.deliver(purchase, async () => {})
  expect(purchase.delivery?.status).toBe("running")
  expect(savePurchase).toHaveBeenCalledOnce()
  await Promise.resolve()
  expect(sellerDeliver).toHaveBeenCalledOnce()
  complete({ ...purchase.delivery!, status: "completed", content: "Delivered" })
  await Promise.all([first, second])
  expect(purchase.delivery?.content).toBe("Delivered")
})

test("delivery connection failure leaves a retriable failed state instead of permanent running", async () => {
  sellerDeliver.mockRejectedValue(new Error("Connection failed"))
  const agent = createAgent(
    {} as Config,
    { savePurchase: vi.fn() } as unknown as typeof store,
    {} as Payments,
    {} as Marketplace
  )
  const purchase = { id: "purchase", paymentStatus: "confirmed" } as Purchase
  await agent.deliver(purchase, async () => {})
  expect(purchase.paymentStatus).toBe("confirmed")
  expect(purchase.delivery?.status).toBe("failed")
  expect(purchase.error).toContain("Retry delivery without another payment")
})

test("an active purchase streams pending state then confirms before delivery without resubmission", async () => {
  vi.useFakeTimers()
  try {
    let purchase = {
      id: "purchase",
      paymentStatus: "pending",
      txHash: "0xsubmitted",
    } as Purchase
    const payments = {
      purchase: vi.fn(async () => purchase),
      recoverAll: vi.fn(async () => {
        purchase = { ...purchase, paymentStatus: "confirmed" }
      }),
    }
    const agent = createAgent(
      {} as Config,
      {
        getQuote: () => ({}),
        hasQuote: () => true,
        getPurchase: () => purchase,
        savePurchase: vi.fn(),
      } as unknown as typeof store,
      payments as unknown as Payments,
      {} as Marketplace
    )
    sellerDeliver.mockImplementation(async (item: Purchase) => ({
      ...item.delivery,
      status: "completed",
      content: "Delivered",
    }))
    const events: ChatEvent[] = []
    const result = agent.purchase(
      conversation,
      purchase.id,
      async (event) => {
        events.push(structuredClone(event))
      },
      true
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(events[0]).toMatchObject({
      type: "purchase",
      purchase: { paymentStatus: "pending" },
    })
    expect(sellerDeliver).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect((await result).paymentStatus).toBe("confirmed")
    expect(sellerDeliver).toHaveBeenCalledOnce()
    expect(payments.purchase).toHaveBeenCalledOnce()
    expect(events.filter((event) => event.type === "status").at(-1)).toEqual({
      type: "status",
      text: "Payment confirmed. Retrieving delivery…",
    })
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "purchase",
        purchase: expect.objectContaining({ paymentStatus: "confirmed" }),
      })
    )
  } finally {
    vi.useRealTimers()
  }
})
