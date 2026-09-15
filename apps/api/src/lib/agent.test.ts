import type { ChatEvent, Conversation } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { MockLanguageModelV3 } from "ai/test"
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test"

import type { Marketplace } from "../seller/lib/marketplace.ts"
import type { Payments } from "./payments.ts"

import { MAX_AGENT_STEPS } from "./agent-prompts.ts"
import { createAgent } from "./agent.ts"
import { openBuyerDatabase } from "./store.ts"

const modelFactory = vi.hoisted(() => vi.fn())
vi.mock("@repo/utils/model", () => ({ createModel: modelFactory }))
vi.mock("./seller-client.ts", () => ({
  createSellerClient: () => ({ discover: () => [] }),
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
  store = openBuyerDatabase(":memory:")
  store.saveConversation(conversation)
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
