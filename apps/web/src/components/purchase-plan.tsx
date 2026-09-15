import { formatUnits } from "viem"

import type { AssistantController } from "#/hooks/use-assistant"

import { Button } from "#/components/ui/button"
import { purchasePaymentLabel } from "#/lib/presentation"

export function PurchasePlan({
  assistant,
}: {
  assistant: AssistantController
}) {
  const plan = assistant.details?.purchasePlan ?? []
  const pending = assistant.purchases.some((purchase) =>
    ["prepared", "pending"].includes(purchase.paymentStatus)
  )
  const completed = plan.filter(
    (item) => item.purchase?.paymentStatus === "confirmed"
  ).length
  const remaining = plan.length - completed
  if (!plan.length && !assistant.purchases.length) {
    return null
  }

  return (
    <section
      aria-label="Purchase plan"
      className="rounded-lg border bg-card p-4 text-sm"
    >
      <h3 className="font-medium">
        {plan.length
          ? `Purchase plan · ${completed} of ${plan.length} paid`
          : "Purchase progress"}
      </h3>
      {plan.length > 0 && (
        <ol className="my-3 space-y-3">
          {plan.map((item, index) => (
            <li
              key={`${item.task.sellerId}:${item.task.service}:${item.task.requestId}`}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p>
                  {index + 1}. {item.listing.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.purchase
                    ? purchasePaymentLabel(item.purchase)
                    : "Queued"}
                  {item.purchase?.delivery?.status === "completed"
                    ? " · Delivered"
                    : ""}
                </p>
              </div>
              <span className="shrink-0">
                {formatUnits(
                  BigInt(
                    item.purchase?.offer.quote.amount ?? item.listing.amount
                  ),
                  6
                )}{" "}
                ATT
              </span>
            </li>
          ))}
        </ol>
      )}
      {pending && (
        <p className="my-2 text-muted-foreground">
          Complete the pending purchase above. Status updates automatically.
        </p>
      )}
      {(remaining > 0 || !plan.length) && (
        <Button
          className="mt-2"
          variant="outline"
          disabled={assistant.run.busy || pending || !!assistant.draft.trim()}
          onClick={assistant.continuePurchases}
        >
          Continue remaining purchases
        </Button>
      )}
    </section>
  )
}
