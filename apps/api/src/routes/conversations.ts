import type { Config } from "@repo/utils/config"

import { sValidator as validator } from "@hono/standard-validator"
import {
  AmountSchema,
  ScenarioSchema,
  type Conversation,
  type ChatEvent,
} from "@repo/schemas"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { streamSSE } from "hono/streaming"
import { randomUUID } from "node:crypto"
import * as v from "valibot"

import type { BuyerAgent } from "../lib/agent.ts"
import type { Payments } from "../lib/payments.ts"
import type { BuyerStore } from "../lib/store.ts"

import { purchasePlanProgress } from "../lib/purchase-plan.ts"

type ServerBindings = {
  incoming?: { socket: { remoteAddress?: string } }
}

export type AppEnv = {
  Bindings: ServerBindings & { server?: ServerBindings }
  Variables: { owner: string }
}

const CreateConversationRequestSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.maxLength(120)), "New conversation"),
  scenario: v.optional(ScenarioSchema, "success"),
})

const BindAllowanceRequestSchema = v.object({ allowanceId: AmountSchema })

const SendMessageRequestSchema = v.object({
  text: v.pipe(v.string(), v.minLength(1), v.maxLength(12000)),
  requestId: v.pipe(v.string(), v.minLength(8), v.maxLength(100)),
})

export function createConversationRoutes(
  config: Config,
  store: BuyerStore,
  payments: Payments,
  agent: BuyerAgent
) {
  const router = new Hono<AppEnv>()
  const active = new Set<string>()
  const refreshing = new Map<string, Promise<void>>()

  function reconcile(id: string) {
    const existing = refreshing.get(id)
    if (existing) {
      return existing
    }
    const operation = (async () => {
      await payments.recoverAll(id)
      for (const item of store.listPurchases(id)) {
        void agent.deliver(item, async () => {}).catch(() => undefined)
      }
    })().finally(() => refreshing.delete(id))
    refreshing.set(id, operation)
    return operation
  }

  function owned(id: string, owner: string) {
    const conversation = store.getConversation(id)

    if (!conversation || conversation.owner !== owner) {
      throw new HTTPException(404, { message: "Conversation not found." })
    }

    return conversation
  }

  return router
    .get("/", (context) =>
      context.json(store.listConversations(context.get("owner")))
    )
    .post(
      "/",
      validator("json", CreateConversationRequestSchema),
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
    .delete("/:id", async (context) => {
      const conversation = owned(context.req.param("id"), context.get("owner"))

      if (active.has(conversation.id)) {
        throw new HTTPException(409, {
          message: "Wait for the active run before deleting this conversation.",
        })
      }
      active.add(conversation.id)

      try {
        if (conversation.allowanceId) {
          const allowance = await payments.allowance(conversation.allowanceId)

          if (!allowance.revoked || BigInt(allowance.remaining) > 0n) {
            throw new HTTPException(409, {
              message:
                "Stop future spending and withdraw unused ATT before deleting this conversation.",
            })
          }
        }

        // Resolve stale authorizations (including revoked allowances) before
        // deciding whether deleting the conversation would hide pending work.
        if (store.listPurchases(conversation.id).length) {
          await reconcile(conversation.id)
        }

        if (
          store
            .listPurchases(conversation.id)
            .some(
              (purchase) =>
                purchase.paymentStatus === "prepared" ||
                purchase.paymentStatus === "pending" ||
                (purchase.paymentStatus === "confirmed" &&
                  purchase.delivery?.status !== "completed" &&
                  purchase.delivery?.status !== "failed")
            )
        ) {
          throw new HTTPException(409, {
            message:
              "Refresh pending purchases before deleting this conversation.",
          })
        }

        store.deleteConversation(conversation.id)

        return context.json({ ok: true })
      } finally {
        active.delete(conversation.id)
      }
    })
    .get("/:id", async (context) => {
      const conversation = owned(context.req.param("id"), context.get("owner"))

      // Recovery and delivery can involve slow external services. Return the
      // current snapshot while one shared refresh progresses in the background.
      if (!active.has(conversation.id)) {
        void reconcile(conversation.id).catch(() => undefined)
      }

      return context.json({
        conversation,
        messages: store.listMessages(conversation.id),
        purchases: store.listPurchases(conversation.id),
        purchasePlan: purchasePlanProgress(
          store.getPurchasePlan(conversation.id),
          store.listPurchases()
        ),
        allowance: conversation.allowanceId
          ? await payments.allowance(conversation.allowanceId)
          : null,
      })
    })
    .post(
      "/:id/allowance",
      validator("json", BindAllowanceRequestSchema),
      async (context) => {
        const { allowanceId } = context.req.valid("json")
        const conversation = owned(
          context.req.param("id"),
          context.get("owner")
        )

        if (active.has(conversation.id)) {
          throw new HTTPException(409, {
            message: "Wait for this run before replacing its allowance.",
          })
        }

        const state = await payments.allowance(allowanceId)

        if (
          state.owner.toLowerCase() !== conversation.owner ||
          (state.buyerSigner.toLowerCase() !==
            payments.account.address.toLowerCase() &&
            !(state.buyerSigner.toLowerCase() === conversation.owner))
        ) {
          throw new Error("Allowance ownership or buyer signer mismatch.")
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
    .post(
      "/:id/messages",
      validator("json", SendMessageRequestSchema),
      async (context) => {
        const { text, requestId } = context.req.valid("json")
        const conversation = owned(
          context.req.param("id"),
          context.get("owner")
        )

        await refreshing.get(conversation.id)

        if (active.has(conversation.id)) {
          throw new HTTPException(409, {
            message: "This conversation already has an active run.",
          })
        }

        const key = `run:${conversation.id}:${requestId}`

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
    .post("/:id/recover", async (context) => {
      const conversation = owned(context.req.param("id"), context.get("owner"))

      if (active.has(conversation.id)) {
        throw new HTTPException(409, { message: "Wait for the active run." })
      }

      active.add(conversation.id)

      try {
        await payments.recoverAll(conversation.id)

        for (const item of store.listPurchases(conversation.id)) {
          void agent.deliver(item, async () => {}).catch(() => undefined)
        }

        return context.json({ ok: true })
      } finally {
        active.delete(conversation.id)
      }
    })
}
