import { SEPOLIA_CHAIN_ID } from "@repo/utils"

import type { AssistantController } from "#/hooks/use-assistant"

import { Bubble, BubbleContent } from "#/components/ui/bubble"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "#/components/ui/empty"
import { Marker, MarkerContent } from "#/components/ui/marker"
import { Message, MessageContent, MessageHeader } from "#/components/ui/message"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "#/components/ui/message-scroller"

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
    <MessageScrollerProvider autoScroll>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="px-5 py-8 md:px-10">
            {!messages.length && (
              <MessageScrollerItem messageId="welcome">
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>What would you like to work on?</EmptyTitle>
                    <EmptyDescription>
                      Compare evidence, commission a brief, and keep every
                      purchase within your allowance. Connect a wallet to start
                      a conversation; funding is optional until you buy a
                      service.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </MessageScrollerItem>
            )}
            {timeline.map((entry) => {
              if (entry.kind === "purchase") {
                return (
                  <MessageScrollerItem key={entry.id} messageId={entry.id}>
                    <PurchaseCard
                      purchase={entry.purchase}
                      chainId={assistant.config?.chainId ?? SEPOLIA_CHAIN_ID}
                    />
                  </MessageScrollerItem>
                )
              }

              const message = entry.message
              return (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <Message align={message.role === "user" ? "end" : "start"}>
                    <MessageContent>
                      <MessageHeader>
                        {message.role === "user" ? "You" : "Your assistant"}
                      </MessageHeader>
                      <Bubble
                        variant={
                          message.role === "user" ? "secondary" : "ghost"
                        }
                        align={message.role === "user" ? "end" : "start"}
                      >
                        <BubbleContent>
                          <div className="message-text">{message.content}</div>
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )
            })}
            {assistant.run.status && (
              <MessageScrollerItem messageId="status">
                <Marker>
                  <MarkerContent>
                    <span role="status" className="shimmer">
                      {assistant.run.status}
                    </span>
                  </MarkerContent>
                </Marker>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
