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
