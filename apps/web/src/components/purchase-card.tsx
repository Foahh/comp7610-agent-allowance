import type { Purchase } from "@repo/schemas"

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
import { confirmPurchase } from "#/lib/wallet"

import { useWorkspaceAssistant } from "./assistant-context"

export function PurchaseCard({
  purchase,
  chainId,
}: {
  purchase: Purchase
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
          {offer.listing.type} · {offer.deliverable}
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
          <p className="purchase-error">{purchase.error || delivery?.error}</p>
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
              Your wallet will submit this exact purchase and pay gas. If
              another submission is pending, refresh first to avoid paying for a
              duplicate attempt.
            </p>
            <Button
              disabled={confirm.isPending}
              onClick={() => confirm.mutate(undefined)}
            >
              {confirm.isPending ? "Confirming…" : "Confirm purchase in wallet"}
            </Button>
            {confirm.error && (
              <p role="alert" className="text-sm text-destructive">
                {confirm.error.message}
              </p>
            )}
          </div>
        )}
    </>
  )
}
