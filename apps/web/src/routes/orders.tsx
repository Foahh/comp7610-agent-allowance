import { createFileRoute } from "@tanstack/react-router"
import { formatUnits } from "viem"

import { DeleteItemButton } from "#/components/delete-item-button"
import { MarketplacePage, RequestState } from "#/components/marketplace-page"
import { PurchaseCard } from "#/components/purchase-card"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { useMarketplace, useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"
import { deliveryStatusLabel, paymentStatusLabel } from "#/lib/presentation"

export const Route = createFileRoute("/orders")({ component: OrdersPage })

function OrdersPage() {
  const purchases = useMarketplace("purchases")
  const sales = useMarketplace("seller/orders")
  const retry = useMarketplaceAction((id: string) =>
    marketplaceRequest(`purchases/${id}/retry`, {})
  )

  return (
    <MarketplacePage title="Orders">
      <RequestState
        onRetry={
          purchases.error || sales.error
            ? () => {
                void Promise.all([purchases.refetch(), sales.refetch()])
              }
            : undefined
        }
        pending={purchases.isPending || sales.isPending}
        error={purchases.error || sales.error || retry.error}
      />
      <Tabs defaultValue="purchases">
        <TabsList>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases" className="flex flex-col gap-5">
          {purchases.data?.length === 0 && (
            <div className="provider-empty">
              <h2>No purchases yet</h2>
            </div>
          )}
          {purchases.data?.map((purchase) => (
            <div key={purchase.id} className="flex flex-col gap-2">
              <PurchaseCard
                purchase={purchase}
                chainId={11155111}
                actions={
                  <>
                    {(["prepared", "pending"].includes(
                      purchase.paymentStatus
                    ) ||
                      (purchase.paymentStatus === "confirmed" &&
                        purchase.delivery?.status !== "completed") ||
                      (!!purchase.error &&
                        purchase.paymentStatus === "confirmed")) && (
                      <Button
                        className="min-w-0 flex-1"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(purchase.id)}
                      >
                        {retry.isPending
                          ? "Checking…"
                          : "Check payment or retry delivery"}
                      </Button>
                    )}
                    <DeleteItemButton
                      className="text-muted-foreground hover:text-destructive"
                      name={purchase.offer.listing.name}
                      path={`purchases/${purchase.id}`}
                      description="This removes this purchase from Orders and Library. It does not cancel or refund payment. Payment records are retained. This cannot be undone."
                      disabled={retry.isPending}
                    />
                  </>
                }
              />
            </div>
          ))}
        </TabsContent>
        <TabsContent value="sales" className="grid gap-5">
          {sales.data?.length === 0 && (
            <div className="provider-empty">
              <h2>No sales yet</h2>
            </div>
          )}
          {sales.data?.map((sale) => (
            <Card key={sale.id}>
              <CardHeader>
                <div className="purchase-heading">
                  <CardTitle>{sale.offer.listing.name}</CardTitle>
                  <span className="purchase-amount">
                    {formatUnits(BigInt(sale.offer.quote.amount), 6)} ATT
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <DeleteItemButton
                  name={sale.offer.listing.name}
                  path={`seller/orders/${sale.id}`}
                  description="This removes this sale from Orders. It does not cancel or refund payment, and the buyer can still retrieve their purchase. This cannot be undone."
                />
                <p className="text-sm">{sale.offer.deliverable}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    Payment: {paymentStatusLabel(sale.paymentStatus)}
                  </Badge>
                  <Badge
                    variant={
                      sale.delivery?.status === "failed"
                        ? "destructive"
                        : "outline"
                    }
                  >
                    Delivery: {deliveryStatusLabel(sale.delivery?.status)}
                  </Badge>
                </div>
                <RequestState
                  error={
                    sale.delivery?.error
                      ? new Error(sale.delivery?.error)
                      : undefined
                  }
                />
                {sale.txHash && (
                  <a
                    className="text-sm break-all underline"
                    href={`https://sepolia.etherscan.io/tx/${sale.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View payment receipt
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </MarketplacePage>
  )
}
