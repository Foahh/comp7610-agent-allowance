import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useWorkspaceAssistant } from "#/components/assistant-context"
import { marketplaceRequest, type MarketplaceData } from "#/lib/marketplace"

export function useMarketplace<K extends keyof MarketplaceData>(resource: K) {
  const { wallet } = useWorkspaceAssistant()
  return useQuery({
    queryKey: ["marketplace", resource, wallet?.account.address],
    queryFn: () => marketplaceRequest<MarketplaceData[K]>(resource),
    enabled: !!wallet,
  })
}

export function useMarketplaceAction<T, R = unknown>(
  action: (input: T) => Promise<R>
) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: action,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["marketplace"] }),
        cache.invalidateQueries({ queryKey: ["conversations"] }),
        cache.invalidateQueries({ queryKey: ["conversation"] }),
      ])
    },
  })
}
