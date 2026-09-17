import type {
  Listing,
  PublicListing,
  Purchase,
  SellerConnection,
} from "@repo/schemas"

export function listingTypeLabel(type: PublicListing["type"]) {
  return {
    "ai-service": "AI service",
    text: "Text",
    link: "Link",
    file: "File",
  }[type]
}

export function listingStatusLabel(status: Listing["status"]) {
  return {
    draft: "Draft",
    active: "Published",
    inactive: "Unpublished",
  }[status]
}

export function sellerStatusLabel(status: SellerConnection["status"]) {
  return {
    online: "Online",
    offline: "Offline",
    "identity-changed": "Identity changed",
  }[status]
}

export function paymentStatusLabel(
  status: Purchase["paymentStatus"] | "awaiting-payment"
) {
  return {
    prepared: "Awaiting confirmation",
    pending: "Pending",
    confirmed: "Confirmed",
    reverted: "Failed",
    rejected: "Rejected",
    "awaiting-payment": "Awaiting payment",
  }[status]
}

export function purchasePaymentLabel(purchase: Purchase) {
  if (purchase.paymentStatus === "prepared") {
    return "Awaiting wallet confirmation"
  }
  if (purchase.paymentStatus === "pending") {
    if (
      purchase.txHash &&
      purchase.confirmations &&
      purchase.requiredConfirmations
    ) {
      return `Mined · ${purchase.confirmations}/${purchase.requiredConfirmations} confirmations`
    }
    return purchase.txHash
      ? "Submitted · awaiting confirmation"
      : "Submission unconfirmed"
  }
  return paymentStatusLabel(purchase.paymentStatus)
}

export function purchaseConfirmationMessage(purchase: Purchase) {
  return purchase.confirmations && purchase.requiredConfirmations
    ? `Payment mined. Waiting for confirmations (${purchase.confirmations}/${purchase.requiredConfirmations}). No wallet action needed.`
    : "Transaction submitted. Waiting to be mined."
}

export function deliveryStatusLabel(
  status: NonNullable<Purchase["delivery"]>["status"] | undefined
) {
  if (!status) {
    return "Not started"
  }

  return {
    pending: "Pending",
    running: "In progress",
    completed: "Completed",
    failed: "Failed",
  }[status]
}
