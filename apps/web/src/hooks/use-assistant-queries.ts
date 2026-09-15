import { useQuery, useQueryClient } from "@tanstack/react-query"

import { getConfig, getConversation, listConversations } from "#/lib/client"

export function useAssistantQueries(
  walletAddress: string | undefined,
  selectedConversationId: string | null
) {
  const cache = useQueryClient()

  const configuration = useQuery({
    queryKey: ["config", walletAddress],
    queryFn: getConfig,
    retry: false,
  })

  const conversations = useQuery({
    queryKey: ["conversations", walletAddress],
    queryFn: listConversations,
    enabled:
      walletAddress !== undefined && configuration.data?.configured === true,
    retry: false,
  })

  const details = useQuery({
    queryKey: [
      "conversation",
      selectedConversationId,
      walletAddress,
      configuration.data?.activeDeployment,
    ],
    queryFn: () => {
      if (selectedConversationId === null) {
        throw new Error("Select a conversation before loading its details.")
      }
      return getConversation(selectedConversationId)
    },
    refetchInterval: (query) =>
      query.state.data?.purchases.some(
        (purchase) =>
          purchase.paymentStatus === "prepared" ||
          purchase.paymentStatus === "pending" ||
          (purchase.paymentStatus === "confirmed" &&
            (!purchase.delivery ||
              ["pending", "running"].includes(purchase.delivery.status)))
      )
        ? 10000
        : false,
    enabled:
      selectedConversationId !== null &&
      walletAddress !== undefined &&
      configuration.data?.configured === true,
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
