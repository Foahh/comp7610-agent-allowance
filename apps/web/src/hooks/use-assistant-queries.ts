import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getConfig, getConversation, listConversations } from "#/lib/client"

export function useAssistantQueries(
  walletAddress: string | undefined,
  selectedConversationId: string | null
) {
  const cache = useQueryClient()
  const configuration = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    retry: false,
  })
  const conversations = useQuery({
    queryKey: ["conversations", walletAddress],
    queryFn: listConversations,
    enabled: walletAddress !== undefined,
    retry: false,
  })
  const details = useQuery({
    queryKey: ["conversation", selectedConversationId],
    queryFn: () => {
      if (selectedConversationId === null) {
        throw new Error("Select a conversation before loading its details.")
      }
      return getConversation(selectedConversationId)
    },
    enabled: selectedConversationId !== null && walletAddress !== undefined,
    retry: false,
  })

  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["conversations"] }),
      cache.invalidateQueries({ queryKey: ["conversation"] }),
    ])
  }

  return { configuration, conversations, details, refresh }
}
