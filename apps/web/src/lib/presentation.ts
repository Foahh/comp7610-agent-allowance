import type { PublicListing } from "@repo/schemas"

export function listingTypeLabel(type: PublicListing["type"]) {
  return {
    "ai-service": "AI service",
    text: "Text",
    link: "Link",
    file: "File",
  }[type]
}
