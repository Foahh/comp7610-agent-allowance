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
    <div className="my-4 space-y-2">
      <Button
        variant="outline"
        disabled={demo.isPending}
        onClick={() => demo.mutate(undefined)}
      >
        {demo.isPending ? "Adding demo items…" : "Add demo items"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Publishes a guide, a synthetic CSV dataset, and a Markdown checklist for
        1, 2, and 3 demo tokens. Existing demo items keep your edits and status.
        Purchases use the normal Sepolia payment flow.
      </p>
      <RequestState
        error={demo.error}
        success={
          demo.isSuccess
            ? demo.data.added
              ? `${demo.data.added} demo items added and published.`
              : "Demo items already exist. No changes made."
            : undefined
        }
      />
    </div>
  )
}
