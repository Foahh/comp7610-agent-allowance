import { SEPOLIA_CHAIN_ID } from "@repo/utils"

import type { AssistantController } from "#/hooks/use-assistant"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "#/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "#/components/ai-elements/message"
import { Shimmer } from "#/components/ai-elements/shimmer"

import { PurchaseCard } from "./purchase-card.tsx"

export function ConversationThread({
  assistant,
}: {
  assistant: AssistantController
}) {
  const messages = [...(assistant.details?.messages || [])]
  if (assistant.run.user) {
    messages.push({
      id: "stream-user",
      conversationId: "",
      role: "user",
      content: assistant.run.user,
      createdAt: assistant.run.startedAt,
    })
  }

  if (assistant.run.answer) {
    messages.push({
      id: "stream-answer",
      conversationId: "",
      role: "assistant",
      content: assistant.run.answer,
      createdAt: Date.now(),
    })
  }

  const timeline = [
    ...messages.map((message) => ({
      kind: "message" as const,
      id: message.id,
      createdAt: message.createdAt,
      message,
    })),
    ...assistant.purchases.map((purchase) => ({
      kind: "purchase" as const,
      id: purchase.id,
      createdAt: purchase.createdAt,
      purchase,
    })),
  ].sort((first, second) => first.createdAt - second.createdAt)

  return (
    <Conversation className="h-full" aria-label="Conversation">
      <ConversationContent className="px-5 py-8 md:px-10">
        {!messages.length && (
          <ConversationEmptyState
            title="What would you like to work on?"
            description="Compare evidence, commission a brief, and keep every purchase within your allowance. Connect a wallet to start a conversation; funding is optional until you buy a service."
          />
        )}
        {timeline.map((entry) => {
          if (entry.kind === "purchase") {
            return (
              <PurchaseCard
                key={entry.id}
                purchase={entry.purchase}
                chainId={assistant.config?.chainId ?? SEPOLIA_CHAIN_ID}
              />
            )
          }

          const message = entry.message
          return (
            <Message key={message.id} from={message.role}>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase group-[.is-user]:text-right">
                {message.role === "user" ? "You" : "Your assistant"}
              </p>
              <MessageContent>
                {message.role === "assistant" ? (
                  <MessageResponse
                    className="message-markdown"
                    isAnimating={
                      message.id === "stream-answer" && assistant.run.busy
                    }
                  >
                    {message.content}
                  </MessageResponse>
                ) : (
                  <div className="message-text">{message.content}</div>
                )}
              </MessageContent>
            </Message>
          )
        })}
        {assistant.run.status && (
          <div role="status" className="text-sm">
            <Shimmer>{assistant.run.status}</Shimmer>
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton aria-label="Scroll to latest message" />
    </Conversation>
  )
}
