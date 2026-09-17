import type { ChatEvent } from "@repo/schemas"
import type { QueryClient } from "@tanstack/react-query"

export function handleAssistantEvent(
  event: ChatEvent,
  conversationId: string,
  cache: QueryClient,
  dispatch: (event: Exclude<ChatEvent, { type: "done" }>) => void
) {
  if (event.type === "done") {
    return
  }

  dispatch(event)

  if (event.type === "purchase") {
    // The stream updates the card, but the allowance lives in the conversation
    // query. Refresh it now instead of waiting for delivery and the final reply.
    void Promise.all([
      cache.invalidateQueries({
        queryKey: ["conversation", conversationId],
      }),
      cache.invalidateQueries({ queryKey: ["marketplace", "purchases"] }),
    ]).catch(() => undefined)
  }
}
