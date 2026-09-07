import { createOpenAI } from "@ai-sdk/openai"
import { valibotSchema } from "@ai-sdk/valibot"
import {
  SignedQuoteSchema,
  TaskSchema,
  type ChatEvent,
  type Conversation,
  type Message,
  type Purchase,
  type Task,
} from "@repo/schemas"
import { taskHash } from "@repo/utils"
import { modelSettings, type Config } from "@repo/utils/config"
import { streamText, tool, stepCountIs } from "ai"
import { randomUUID } from "node:crypto"
import * as v from "valibot"

import type { Payments } from "./payments.ts"
import type { BuyerStore } from "./store.ts"

import {
  BUYER_SYSTEM_PROMPT,
  EMPTY_ANSWER_MESSAGE,
  previousPurchasesMessage,
  STEP_LIMIT_MESSAGE,
} from "./agent-prompts.ts"
import { publicPurchase } from "./payments.ts"
import { createProviderClient } from "./provider-client.ts"

export function createAgent(
  config: Config,
  store: BuyerStore,
  payments: Payments
) {
  const providerClient = createProviderClient(config)

  async function deliver(
    purchase: Purchase,
    emit: (event: ChatEvent) => Promise<void>
  ) {
    if (purchase.paymentStatus !== "confirmed") {
      return purchase
    }
    if (
      purchase.delivery?.status === "completed" ||
      purchase.delivery?.status === "failed"
    ) {
      return purchase
    }

    const signature = await payments.account.signMessage({
      message: `Agent Spend Guard delivery ${purchase.id}`,
    })

    try {
      purchase.delivery = await providerClient.deliver(purchase, signature)
    } catch {
      purchase.delivery = {
        purchaseId: purchase.id,
        status: "pending",
        content: "",
        references: [],
        modelMs: 0,
        deliveryMs: 0,
        error:
          "Provider connection interrupted. Retry delivery without another payment.",
      }
    }

    store.savePurchase(purchase)
    await emit({ type: "purchase", purchase: publicPurchase(purchase) })
    return purchase
  }

  async function run(
    conversation: Conversation,
    prompt: string,
    emit: (event: ChatEvent) => Promise<void>
  ) {
    let purchaseCount = 0
    let answer = ""
    const remember = (role: Message["role"], content: string) => {
      const message: Message = {
        id: randomUUID(),
        conversationId: conversation.id,
        role,
        content,
        createdAt: Date.now(),
      }
      store.saveMessage(message)
    }

    remember("user", prompt)

    const sendText = async (text: string) => {
      answer = `${answer}${text}`
      await emit({ type: "text", text })
    }

    async function quote(task: Task) {
      task = v.parse(TaskSchema, task)
      if (!conversation.allowanceId) {
        return {
          clarification:
            "Confirm a funded allowance in your wallet before purchasing.",
        }
      }

      await emit({
        type: "status",
        text: "Asking the specialist to define a deliverable and quote.",
      })

      const result = await providerClient.quote(conversation.allowanceId, task)
      if (!result.offer) {
        return {
          clarification: result.clarification || "Please clarify the task.",
        }
      }

      const offer = v.parse(SignedQuoteSchema, result.offer)
      // Do not trust a provider to substitute different work.
      if (taskHash(offer.task) !== taskHash(task)) {
        throw new Error("Provider changed the requested task.")
      }
      store.saveQuote(offer, conversation.id)
      return { offer }
    }

    async function purchase(id: string) {
      const offer = store.getQuote(id)
      const permitted = store.hasQuote(id, conversation.id)

      if (!offer || !permitted) {
        throw new Error("Unknown quote for this conversation.")
      }

      const existing = store.getPurchase(id)
      if (!existing && purchaseCount >= 2) {
        return { error: "This run has reached its two-purchase limit." }
      }
      if (!existing) {
        purchaseCount += 1
      }

      const paid = await payments.purchase(conversation, offer)
      await emit({ type: "purchase", purchase: publicPurchase(paid) })
      const result = await deliver(paid, emit)
      return publicPurchase(result)
    }

    try {
      const settings = modelSettings("buyer")
      if (!settings.apiKey || !settings.model) {
        throw new Error(
          "Configure the buyer model endpoint, API key, and model before chatting."
        )
      }
      const provider = createOpenAI(settings)

      const tools = {
        discoverServices: tool({
          description:
            "Discover the independently operated specialist's paid capabilities.",
          inputSchema: valibotSchema(v.object({})),
          execute: async () => providerClient.capabilities(),
        }),
        requestQuote: tool({
          description:
            "Request a deliverable and signed price. Does not spend tokens.",
          inputSchema: valibotSchema(
            v.object({
              service: v.picklist(["analysis", "writing"]),
              brief: v.string(),
              evidence: v.optional(v.string(), ""),
            })
          ),
          execute: async (input) => quote(input),
        }),
        purchaseQuote: tool({
          description:
            "Buy a quoted service under the confirmed contract allowance and retrieve its result.",
          inputSchema: valibotSchema(v.object({ quoteId: v.string() })),
          execute: async ({ quoteId }) => purchase(quoteId),
        }),
        retrievePurchase: tool({
          description:
            "Reuse or resume an existing purchase without charging again.",
          inputSchema: valibotSchema(v.object({ purchaseId: v.string() })),
          execute: async ({ purchaseId }) => {
            const item = store.getPurchase(purchaseId)
            if (!item || item.conversationId !== conversation.id) {
              return { error: "Unknown purchase." }
            }
            return publicPurchase(await deliver(item, emit))
          },
        }),
      }
      const paidContext = store
        .listPurchases(conversation.id)
        .map(publicPurchase)

      const result = streamText({
        model: provider.chat(settings.model),
        system: BUYER_SYSTEM_PROMPT,
        messages: [
          ...store
            .listMessages(conversation.id)
            .map(({ role, content }) => ({ role, content })),
          // Keep purchased text out of system instructions, even on later turns.
          {
            role: "user",
            content: previousPurchasesMessage(paidContext),
          },
        ],
        tools,
        stopWhen: stepCountIs(8),
        maxOutputTokens: 2000,
        abortSignal: AbortSignal.timeout(180000),
      })
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          await sendText(part.text)
        }
        if (part.type === "tool-call") {
          await emit({
            type: "status",
            text: `Assistant requested ${part.toolName}.`,
          })
        }
        if (part.type === "error") {
          throw new Error(
            "Model streaming failed; inspect endpoint configuration."
          )
        }
      }
      if ((await result.steps).length >= 8) {
        await sendText(STEP_LIMIT_MESSAGE)
      }
      if (!answer.trim()) {
        await sendText(EMPTY_ANSWER_MESSAGE)
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.split("\n")[0]!
          : "Assistant run failed."
      await emit({ type: "error", text: message })
      if (!answer) {
        answer = message
      }
    } finally {
      remember("assistant", answer)
      await emit({ type: "done" })
    }
  }

  return { run, deliver }
}
