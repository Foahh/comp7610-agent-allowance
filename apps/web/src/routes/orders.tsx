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
      description="Track payment and delivery separately for your purchases and sales."
    >
      <RequestState
        pending={purchases.isFetching || sales.isFetching || retry.isPending}
        error={purchases.error || sales.error || retry.error}
      />
      <Tabs defaultValue="purchases">
        <TabsList>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases" className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            {purchases.data?.length || 0} purchases
          </p>
          {purchases.data?.map((purchase) => (
            <div key={purchase.id} className="flex flex-col gap-2">
              <PurchaseCard purchase={purchase} chainId={11155111} />
              {(["prepared", "pending"].includes(purchase.paymentStatus) ||
                (purchase.paymentStatus === "confirmed" &&
                  purchase.delivery?.status !== "completed") ||
                (!!purchase.error &&
                  purchase.paymentStatus === "confirmed")) && (
                <Button
                  variant="outline"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(purchase.id)}
                >
                  Recover payment / retry delivery without another charge
                </Button>
              )}
            </div>
          ))}
        </TabsContent>
        <TabsContent value="sales" className="grid gap-5">
          <p className="text-sm text-muted-foreground">
            {sales.data?.length || 0} quoted orders
          </p>
          {sales.data?.map((sale) => (
            <Card key={sale.id}>
              <CardHeader>
                <CardTitle>{sale.offer.listing.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm">{sale.offer.deliverable}</p>
                <p className="text-sm">
                  {formatUnits(BigInt(sale.offer.quote.amount), 6)} ATT
                </p>
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
                  <p className="text-sm text-destructive">
                    {sale.delivery.error}
                  </p>
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
