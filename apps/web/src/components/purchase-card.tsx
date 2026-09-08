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
  CardFooter,
} from "#/components/ui/card"
import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { listingTypeLabel } from "#/lib/presentation"
import { confirmPurchase } from "#/lib/wallet"

import { useWorkspaceAssistant } from "./assistant-context"
import { RequestState } from "./marketplace-page"

export function PurchaseCard({
  purchase,
  chainId,
  children,
}: {
  purchase: Purchase
  children?: ReactNode
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
            Payment: {paymentStatus}
          </Badge>
          {delivery && (
            <Badge
              variant={delivery.status === "failed" ? "destructive" : "outline"}
            >
              {paymentStatus === "confirmed" && delivery.status === "failed"
                ? "Paid, delivery failed"
                : `Delivery: ${delivery.status}`}
            </Badge>
          )}
        </div>
        {(purchase.error || delivery?.error) && (
          <details className="detail-disclosure purchase-error">
            <summary>Failure details</summary>
            <p>{purchase.error || delivery?.error}</p>
          </details>
        )}
        <details>
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
      </CardContent>
      {children && (
        <CardFooter className="purchase-footer">{children}</CardFooter>
      )}
    </Card>
  )
}

function PurchaseConfirmation({ purchase }: { purchase: Purchase }) {
  const { wallet, config } = useWorkspaceAssistant()
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
              Confirm this purchase and pay gas in your wallet.
            </p>
            <p className="text-xs text-muted-foreground">
              If a submission is pending, refresh before trying again.
            </p>
            <Button
              disabled={confirm.isPending}
              onClick={() => confirm.mutate(undefined)}
            >
              {confirm.isPending ? "Confirming…" : "Confirm purchase"}
            </Button>
            <RequestState error={confirm.error} />
          </div>
        )}
    </>
  )
}
