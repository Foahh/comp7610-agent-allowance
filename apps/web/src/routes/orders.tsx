import { createFileRoute } from "@tanstack/react-router"
import { formatUnits } from "viem"

import { MarketplacePage, RequestState } from "#/components/marketplace-page"
import { PurchaseCard } from "#/components/purchase-card"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { useMarketplace, useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

export const Route = createFileRoute("/orders")({ component: OrdersPage })

function OrdersPage() {
  const purchases = useMarketplace("purchases")
  const sales = useMarketplace("seller/orders")
  const retry = useMarketplaceAction((id: string) =>
    marketplaceRequest(`purchases/${id}/retry`, {})
  )

  return (
    <MarketplacePage
      title="Orders"
      description="Purchases and sales, from payment to delivery."
    >
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
          {purchases.data && (
            <p className="text-sm text-muted-foreground">
              {purchases.data.length}{" "}
              {purchases.data.length === 1 ? "purchase" : "purchases"}
            </p>
          )}
          {purchases.data?.length === 0 && (
            <div className="provider-empty">
              <h2>No purchases yet</h2>
              <p>Your purchases will appear here.</p>
            </div>
          )}
          {purchases.data?.map((purchase) => (
            <div key={purchase.id} className="flex flex-col gap-2">
              <PurchaseCard purchase={purchase} chainId={11155111}>
                {(["prepared", "pending"].includes(purchase.paymentStatus) ||
                  (purchase.paymentStatus === "confirmed" &&
                    purchase.delivery?.status !== "completed") ||
                  (!!purchase.error &&
                    purchase.paymentStatus === "confirmed")) && (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(purchase.id)}
                    >
                      {retry.isPending ? "Recovering…" : "Recover purchase"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Check payment or retry delivery without another charge.
                    </p>
                  </div>
                )}
              </PurchaseCard>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="sales" className="grid gap-5">
          {sales.data && (
            <p className="text-sm text-muted-foreground">
              {sales.data.length} quoted orders
            </p>
          )}
          {sales.data?.length === 0 && (
            <div className="provider-empty">
              <h2>No sales yet</h2>
              <p>Quoted orders will appear here.</p>
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
                <p className="text-sm">{sale.offer.deliverable}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    Payment: {sale.paymentStatus}
                  </Badge>
                  <Badge
                    variant={
                      sale.delivery?.status === "failed"
                        ? "destructive"
                        : "outline"
                    }
                  >
                    Delivery: {sale.delivery?.status || "not started"}
                  </Badge>
                </div>
                {sale.delivery?.error && (
                  <details className="detail-disclosure purchase-error">
                    <summary>Failure details</summary>
                    <p>{sale.delivery.error}</p>
                  </details>
                )}
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
