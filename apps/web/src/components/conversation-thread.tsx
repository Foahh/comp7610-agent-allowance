import { RiSparklingLine } from "@remixicon/react"
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
import { ScenarioBar } from "./scenario-bar"

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
      <ConversationContent
        className="thread-content"
        data-empty={timeline.length === 0}
      >
        {timeline.length === 0 && !assistant.loading && (
          <ConversationEmptyState className="welcome-state">
            <div className="welcome-icon">
              <RiSparklingLine aria-hidden="true" />
            </div>
            <h2>
              What would you like
              <br className="hidden sm:block" /> to work on?
            </h2>
            <p className="welcome-hint">
              Describe your task below, or try a scenario below.
            </p>
            <ScenarioBar assistant={assistant} />
          </ConversationEmptyState>
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
              <MessageContent className="chat-message-content">
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
