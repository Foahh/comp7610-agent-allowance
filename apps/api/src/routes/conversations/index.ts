import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { streamSSE } from "hono/streaming"
import { sValidator as validator } from "@hono/standard-validator"
import * as v from "valibot"
import {
  AmountSchema,
  ScenarioSchema,
  type Conversation,
  type ChatEvent,
} from "@repo/schemas"
import type { Config } from "@repo/utils/config"
import { createAgent } from "../../agent.ts"
import { publicPurchase, type Payments } from "../../payments.ts"
import type { BuyerStore } from "../../store.ts"

export type AppEnv = { Variables: { owner: string } }

export function createConversationRoutes(
  config: Config,
  store: BuyerStore,
  payments: Payments
) {
  const router = new Hono<AppEnv>()
  const agent = createAgent(config, store, payments)
  const active = new Set<string>()

  function owned(id: string, owner: string) {
    const conversation = store.getConversation(id)
    if (!conversation || conversation.owner !== owner) {
      throw new HTTPException(404, { message: "Conversation not found." })
    }
    return conversation
  }

  const listing = router.get("/", (context) =>
    context.json(store.listConversations(context.get("owner")))
  )
  const creating = listing.post(
    "/",
    validator(
      "json",
      v.object({
        title: v.optional(
          v.pipe(v.string(), v.maxLength(120)),
          "New conversation"
        ),
        scenario: v.optional(ScenarioSchema, "success"),
      })
    ),
    (context) => {
      const input = context.req.valid("json")
      const conversation: Conversation = {
        ...input,
        id: randomUUID(),
        owner: context.get("owner"),
        allowanceId: null,
        createdAt: Date.now(),
      }
      store.saveConversation(conversation)
      return context.json(conversation, 201)
    }
  )

  const details = creating.get("/:id", async (context) => {
    const conversation = owned(context.req.param("id"), context.get("owner"))
    return context.json({
      conversation,
      messages: store.listMessages(conversation.id),
      purchases: store.listPurchases(conversation.id).map(publicPurchase),
      allowance: conversation.allowanceId
        ? await payments.allowance(conversation.allowanceId)
        : null,
    })
  })

  const bind = details.post(
    "/:id/allowance",
    validator("json", v.object({ allowanceId: AmountSchema })),
    async (context) => {
      const conversation = owned(context.req.param("id"), context.get("owner"))
      if (active.has(conversation.id)) {
        throw new HTTPException(409, {
          message: "Wait for this run before replacing its allowance.",
        })
      }
      const { allowanceId } = context.req.valid("json")
      const state = await payments.allowance(allowanceId)
      if (
        state.owner.toLowerCase() !== conversation.owner ||
        state.agent.toLowerCase() !== payments.account.address.toLowerCase() ||
        state.provider.toLowerCase() !== config.provider.toLowerCase()
      ) {
        throw new Error("Allowance ownership, agent, or provider mismatch.")
      }
      const bound = store.getAllowance(allowanceId)
      if (bound && bound.conversationId !== conversation.id) {
        throw new Error("Allowance already belongs to another conversation.")
      }
      if (
        conversation.allowanceId &&
        conversation.allowanceId !== allowanceId
      ) {
        const previous = await payments.allowance(conversation.allowanceId)
        if (!previous.revoked) {
          throw new Error("Revoke the old allowance before replacing it.")
        }
      }
      conversation.allowanceId = allowanceId
      store.bindAllowance(conversation, allowanceId)
      return context.json(state)
    }
  )

  const streaming = bind.post(
    "/:id/messages",
    validator(
      "json",
      v.object({
        text: v.pipe(v.string(), v.minLength(1), v.maxLength(12000)),
        requestId: v.pipe(v.string(), v.minLength(8), v.maxLength(100)),
      })
    ),
    (context) => {
      const conversation = owned(context.req.param("id"), context.get("owner"))
      const { text, requestId } = context.req.valid("json")
      if (active.has(conversation.id)) {
        throw new HTTPException(409, {
          message: "This conversation already has an active run.",
        })
      }
      const key = "run:" + conversation.id + ":" + requestId
      if (!store.acceptRun(key, conversation.id)) {
        throw new HTTPException(409, {
          message:
            "This message was already accepted. Refresh the conversation.",
        })
      }
      active.add(conversation.id)

      return streamSSE(context, async (stream) => {
        // A disconnected browser cannot cancel or restart a financial operation.
        const emit = async (event: ChatEvent) => {
          await stream
            .writeSSE({ event: "message", data: JSON.stringify(event) })
            .catch(() => undefined)
        }
        try {
          await agent.run(conversation, text, emit)
        } finally {
          active.delete(conversation.id)
        }
      })
    }
  )

  return streaming.post("/:id/recover", async (context) => {
    const conversation = owned(context.req.param("id"), context.get("owner"))
    if (active.has(conversation.id)) {
      throw new HTTPException(409, { message: "Wait for the active run." })
    }
    active.add(conversation.id)
    try {
      await payments.recoverAll()
      for (const item of store.listPurchases(conversation.id)) {
        await agent.deliver(item, async () => {})
      }
      return context.json({ ok: true })
    } finally {
      active.delete(conversation.id)
    }
  })
}
