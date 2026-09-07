import type { Address } from "viem"
import * as v from "valibot"
import {
  AddressSchema,
  AllowanceSchema,
  ChatEventSchema,
  ConversationSchema,
  MessageSchema,
  PurchaseSchema,
  type ChatEvent,
  type Conversation,
} from "@repo/schemas"

const AppAddressSchema = v.pipe(
  AddressSchema,
  v.transform((address) => address as Address)
)

const AppConfigSchema = v.object({
  chainId: v.number(),
  token: AppAddressSchema,
  vault: AppAddressSchema,
  agent: AppAddressSchema,
  provider: AppAddressSchema,
  rpcUrl: v.string(),
})

const ConversationDetailsSchema = v.object({
  conversation: ConversationSchema,
  messages: v.array(MessageSchema),
  purchases: v.array(PurchaseSchema),
  allowance: v.nullable(AllowanceSchema),
})

const ChallengeSchema = v.object({
  id: v.string(),
  message: v.string(),
})

const ErrorResponseSchema = v.object({ error: v.string() })

export type AppConfig = v.InferOutput<typeof AppConfigSchema>
export type ConversationDetails = v.InferOutput<
  typeof ConversationDetailsSchema
>

async function requestJson(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result: unknown = await response.json()
  if (!response.ok) {
    const error = v.safeParse(ErrorResponseSchema, result)
    throw new Error(error.success ? error.output.error : "Request failed.")
  }
  return result
}

export async function getConfig() {
  return v.parse(AppConfigSchema, await requestJson("/config"))
}

export async function listConversations() {
  return v.parse(
    v.array(ConversationSchema),
    await requestJson("/conversations")
  )
}

export async function getConversation(id: string) {
  return v.parse(
    ConversationDetailsSchema,
    await requestJson("/conversations/" + id)
  )
}

export async function createConversation(
  title: string,
  scenario: Conversation["scenario"]
) {
  return v.parse(
    ConversationSchema,
    await requestJson("/conversations", { title, scenario })
  )
}

export async function createAuthChallenge(address: Address) {
  return v.parse(
    ChallengeSchema,
    await requestJson("/auth/challenge", { address })
  )
}

export async function verifyAuthChallenge(id: string, signature: string) {
  await requestJson("/auth/verify", { id, signature })
}

export async function bindAllowance(
  conversationId: string,
  allowanceId: string
) {
  await requestJson("/conversations/" + conversationId + "/allowance", {
    allowanceId,
  })
}

export async function recoverConversation(conversationId: string) {
  await requestJson("/conversations/" + conversationId + "/recover", {})
}

export async function sendMessage(
  id: string,
  text: string,
  onEvent: (event: ChatEvent) => void
) {
  const response = await fetch("/api/conversations/" + id + "/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, requestId: crypto.randomUUID() }),
  })
  if (!response.ok) {
    const result: unknown = await response.json()
    const error = v.safeParse(ErrorResponseSchema, result)
    throw new Error(
      error.success ? error.output.error : "Unable to start the conversation."
    )
  }
  if (!response.body) {
    throw new Error("Streaming is unavailable.")
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      buffer += decoder
        .decode(chunk.value, { stream: true })
        .replaceAll("\r\n", "\n")
      const frames = buffer.split("\n\n")
      buffer = frames.pop() ?? ""
      for (const frame of frames) {
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
        if (data) {
          onEvent(v.parse(ChatEventSchema, JSON.parse(data)))
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
