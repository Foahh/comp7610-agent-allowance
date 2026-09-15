import type { Purchase } from "@repo/schemas"
import type { ReactNode } from "react"

import { formatUnits, formatEther } from "viem"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "#/components/ui/card"
import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"
import {
  deliveryStatusLabel,
  listingTypeLabel,
  purchasePaymentLabel,
} from "#/lib/presentation"
import { confirmPurchase } from "#/lib/wallet"

import { useWorkspaceAssistant } from "./assistant-context"
import { RequestState } from "./marketplace-page"

export function PurchaseCard({
  purchase,
  chainId,
  children,
  actions,
}: {
  purchase: Purchase
  children?: ReactNode
  actions?: ReactNode
  chainId: number
}) {
  const { offer, paymentStatus, delivery } = purchase

  return (
    <Card className="purchase-card">
      <CardHeader>
        <div className="purchase-heading">
          <CardTitle>{offer.listing.name}</CardTitle>
          <Badge variant="outline" className="purchase-amount">
            {formatUnits(BigInt(offer.quote.amount), 6)} ATT
          </Badge>
        </div>
        <CardDescription>
          {listingTypeLabel(offer.listing.type)} · {offer.deliverable}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PurchaseConfirmation purchase={purchase} />
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={
              paymentStatus === "rejected" || paymentStatus === "reverted"
                ? "destructive"
                : "secondary"
            }
          >
            Payment: {purchasePaymentLabel(purchase)}
          </Badge>
          {delivery && (
            <Badge
              variant={delivery.status === "failed" ? "destructive" : "outline"}
            >
              {paymentStatus === "confirmed" && delivery.status === "failed"
                ? "Paid, delivery failed"
                : `Delivery: ${deliveryStatusLabel(delivery.status)}`}
            </Badge>
          )}
        </div>
        <RequestState
          error={
            purchase.error || delivery?.error
              ? new Error(purchase.error || delivery?.error)
              : undefined
          }
        />
        {children}
        <div className="purchase-toolbar">
          <details className="purchase-receipt">
            <summary className="cursor-pointer text-sm">View receipt</summary>
            <dl className="receipt">
              <dt>Seller</dt>
              <dd>{offer.quote.recipient}</dd>
              <dt>Purchase</dt>
              <dd>{purchase.id}</dd>
              {purchase.txHash && (
                <>
                  <dt>Transaction</dt>
                  <dd>
                    {chainId === 11155111 ? (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${purchase.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {purchase.txHash}
                      </a>
                    ) : (
                      purchase.txHash
                    )}
                  </dd>
                </>
              )}
              {purchase.gasWei && (
                <>
                  <dt>Gas, separate from allowance</dt>
                  <dd>{formatEther(BigInt(purchase.gasWei))} test ETH</dd>
                </>
              )}
            </dl>
          </details>
          {actions && <div className="purchase-actions">{actions}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

function PurchaseConfirmation({ purchase }: { purchase: Purchase }) {
  const { wallet, config } = useWorkspaceAssistant()
  const refresh = useMarketplaceAction(() =>
    marketplaceRequest(`purchases/${purchase.id}/retry`, {})
  )
  const confirm = useMarketplaceAction(async () => {
    if (!config) {
      throw new Error("Configuration unavailable.")
    }
    return confirmPurchase(wallet, config, purchase)
  })
  return (
    <>
      {purchase.authorization &&
        ["prepared", "pending"].includes(purchase.paymentStatus) && (
          <div className="space-y-2">
            <p className="text-sm">
              {purchase.txHash
                ? "Transaction submitted. Waiting for chain confirmation."
                : purchase.paymentStatus === "pending"
                  ? "Submission has not been confirmed. Refresh status before submitting this same purchase in your wallet."
                  : "Confirm this purchase in your wallet. Test ETH is required for gas."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={refresh.isPending || confirm.isPending}
                onClick={() => refresh.mutate(undefined)}
              >
                {refresh.isPending ? "Refreshing…" : "Refresh status"}
              </Button>
              {!purchase.txHash && (
                <Button
                  disabled={confirm.isPending || refresh.isPending}
                  onClick={() => confirm.mutate(undefined)}
                >
                  {confirm.isPending ? "Confirming…" : "Confirm purchase"}
                </Button>
              )}
            </div>
            <RequestState error={confirm.error || refresh.error} />
          </div>
        )}
    </>
  )
}
