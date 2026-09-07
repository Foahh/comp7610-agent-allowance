import { hc } from "hono/client"
import type { AppType } from "@repo/api"
import type {
  Allowance,
  Conversation,
  Message,
  Purchase,
  ChatEvent,
} from "@repo/schemas"
import { ChatEventSchema } from "@repo/schemas"
import * as v from "valibot"

export const rpc = hc<AppType>("/")
export type AppConfig = {
  chainId: number
  token: `0x${string}`
  vault: `0x${string}`
  agent: `0x${string}`
  provider: `0x${string}`
  rpcUrl: string
}
export type ConversationDetails = {
  conversation: Conversation
  messages: Message[]
  purchases: Purchase[]
  allowance: Allowance | null
}

export async function jsonRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || "Request failed.")
  }
  return result as T
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
    const result = await response.json()
    throw new Error(result.error || "Unable to start the conversation.")
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
      buffer = frames.pop() || ""
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
