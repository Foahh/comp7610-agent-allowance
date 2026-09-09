import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

import { RequestState } from "./marketplace-page"
import { Button } from "./ui/button"

export function DemoItems() {
  const demo = useMarketplaceAction(() =>
    marketplaceRequest<{ added: number; skipped: number }>(
      "seller/demo-items",
      {}
    )
  )

  return (
    <>
      <Button
        variant="outline"
        disabled={demo.isPending}
        onClick={() => demo.mutate(undefined)}
      >
        {demo.isPending ? "Adding sample listings…" : "Add sample listings"}
      </Button>
      <RequestState
        error={demo.error}
        success={
          demo.isSuccess
            ? demo.data.added
              ? `${demo.data.added} sample listings added.`
              : "Sample listings already exist."
            : undefined
        }
      />
    </>
  )
}
