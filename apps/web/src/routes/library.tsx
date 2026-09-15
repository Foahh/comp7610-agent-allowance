import { createFileRoute, Link } from "@tanstack/react-router"

import { MessageResponse } from "#/components/ai-elements/message"
import { useWorkspaceAssistant } from "#/components/assistant-context"
import { DeleteItemButton } from "#/components/delete-item-button"
import { MarketplacePage, RequestState } from "#/components/marketplace-page"
import { PurchaseCard } from "#/components/purchase-card"
import { Button } from "#/components/ui/button"
import { useMarketplace } from "#/hooks/use-marketplace"

const HTTP_URL_PATTERN = /^https?:\/\//i

function isHttpUrl(value: string) {
  return HTTP_URL_PATTERN.test(value)
}

export const Route = createFileRoute("/library")({ component: LibraryPage })

function LibraryPage() {
  const purchases = useMarketplace("purchases")
  const assistant = useWorkspaceAssistant()
  const completed =
    purchases.data?.filter(
      (purchase) =>
        purchase.paymentStatus === "confirmed" &&
        purchase.delivery?.status === "completed"
    ) || []

  return (
    <MarketplacePage title="Library">
      <RequestState
        onRetry={
          purchases.error
            ? () => {
                void purchases.refetch()
              }
            : undefined
        }
        pending={purchases.isPending}
        error={purchases.error}
      />
      {!purchases.isPending && !purchases.error && completed.length === 0 && (
        <div className="provider-empty">
          <h2>No completed purchases</h2>
          <Link to="/sellers">Explore sellers</Link>
        </div>
      )}
      <div className="grid gap-6">
        {completed.map((purchase) => (
          <PurchaseCard
            key={purchase.id}
            purchase={purchase}
            chainId={11155111}
            actions={
              <>
                <Button
                  nativeButton={false}
                  render={<Link to="/" />}
                  variant="outline"
                  onClick={() =>
                    assistant.setDraft(
                      `Use the “${purchase.offer.listing.name}” purchase from my library. `
                    )
                  }
                >
                  Chat
                </Button>
                <DeleteItemButton
                  className="text-muted-foreground hover:text-destructive"
                  name={purchase.offer.listing.name}
                  path={`purchases/${purchase.id}`}
                  description="This removes this purchase from Library and Orders. It does not cancel or refund payment. Payment records are retained. This cannot be undone."
                />
              </>
            }
          >
            {purchase.offer.listing.type === "link" &&
            isHttpUrl(purchase.delivery!.content) ? (
              <a
                href={purchase.delivery!.content}
                target="_blank"
                rel="noreferrer"
                className="text-sm break-all underline"
              >
                Open purchased link
              </a>
            ) : (
              purchase.delivery?.content && (
                <details className="w-full min-w-0">
                  <summary className="cursor-pointer text-sm">
                    Read purchased content
                  </summary>
                  <div className="mt-3 overflow-x-auto border bg-muted/30 p-4">
                    <MessageResponse className="message-markdown" mode="static">
                      {purchase.delivery.content}
                    </MessageResponse>
                  </div>
                </details>
              )
            )}
            {purchase.delivery?.file && (
              <a
                className="text-sm underline"
                href={`/api/marketplace/purchases/${purchase.id}/file`}
              >
                Download {purchase.delivery.file.name}
              </a>
            )}
          </PurchaseCard>
        ))}
      </div>
    </MarketplacePage>
  )
}
