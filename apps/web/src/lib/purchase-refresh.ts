import type { Purchase } from "@repo/schemas"

export function purchaseRefreshInterval(purchases: Purchase[] = []) {
  if (
    purchases.some(
      (purchase) =>
        purchase.paymentStatus === "pending" ||
        (purchase.paymentStatus === "confirmed" &&
          (!purchase.delivery ||
            ["pending", "running"].includes(purchase.delivery.status)))
    )
  ) {
    return 3000
  }
  return purchases.some((purchase) => purchase.paymentStatus === "prepared")
    ? 10000
    : false
}
