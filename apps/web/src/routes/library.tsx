import { createFileRoute, Link } from "@tanstack/react-router"

import { useWorkspaceAssistant } from "#/components/assistant-context"
import { MarketplacePage, RequestState } from "#/components/marketplace-page"
import { PurchaseCard } from "#/components/purchase-card"
import { Button } from "#/components/ui/button"
import { Card, CardContent } from "#/components/ui/card"
import { useMarketplace } from "#/hooks/use-marketplace"

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
    <MarketplacePage
      title="Library"
      description="Purchased resources and AI results remain available for follow-up conversations."
    >
      <RequestState pending={purchases.isFetching} error={purchases.error} />
      {!purchases.isPending && completed.length === 0 && (
        <div className="provider-empty">
          <h2>Your library is empty</h2>
          <p>Completed purchases will appear here.</p>
          <Link to="/sellers">Explore connected sellers</Link>
        </div>
      )}
      <div className="grid gap-6">
        {completed.map((purchase) => (
          <Card key={purchase.id}>
            <CardContent className="flex flex-col gap-4 pt-6">
              <PurchaseCard purchase={purchase} chainId={11155111} />
              {purchase.offer.listing.type === "link" &&
              /^https?:\/\//i.test(purchase.delivery!.content) ? (
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
                  <details>
                    <summary className="cursor-pointer text-sm">
                      Read purchased content
                    </summary>
                    <p className="mt-3 text-sm whitespace-pre-wrap">
                      {purchase.delivery.content}
                    </p>
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
              <Button
                nativeButton={false}
                render={<Link to="/" />}
                variant="outline"
                onClick={() =>
                  assistant.setDraft(
                    `Use my existing library purchase ${purchase.id} (${purchase.offer.listing.name}). `
                  )
                }
              >
                Use in chat
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </MarketplacePage>
  )
}
