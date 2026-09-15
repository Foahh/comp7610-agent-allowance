import type {
  Purchase,
  PurchasePlanEntry,
  PurchasePlanItem,
} from "@repo/schemas"

import { taskHash } from "@repo/utils"

export function purchasePlanProgress(
  items: PurchasePlanItem[],
  purchases: Purchase[]
): PurchasePlanEntry[] {
  return items.map((item) => {
    const matches = purchases.filter(
      (purchase) =>
        purchase.offer.quote.recipient.toLowerCase() ===
          item.recipient.toLowerCase() &&
        purchase.offer.listing.id === item.listing.id &&
        purchase.offer.listing.version === item.listing.version &&
        (item.listing.type !== "ai-service" ||
          taskHash(purchase.offer.task) === taskHash(item.task))
    )
    const purchase =
      matches.find((value) => value.paymentStatus === "confirmed") ??
      matches.find(
        (value) =>
          value.paymentStatus === "pending" ||
          value.paymentStatus === "prepared"
      ) ??
      matches.at(-1)
    return { ...item, purchase }
  })
}
