import type { Listing } from "@repo/schemas"

import { formatUnits } from "viem"

import { listingStatusLabel, listingTypeLabel } from "#/lib/presentation"

import { DeleteItemButton } from "./delete-item-button"
import { ListingPreview } from "./listing-editor"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"

export function ListingCard({
  listing,
  publishing,
  onEdit,
  onPublish,
  onDeleted,
}: {
  listing: Listing
  publishing: boolean
  onEdit: () => void
  onPublish: () => void
  onDeleted: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between gap-2">
          <Badge variant="outline">{listingTypeLabel(listing.type)}</Badge>
          <Badge variant="secondary">
            {listingStatusLabel(listing.status)} · v{listing.version}
          </Badge>
        </div>
        <CardTitle>{listing.name}</CardTitle>
        <CardDescription>{listing.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm tabular-nums">
          {formatUnits(BigInt(listing.amount), 6)} ATT /{" "}
          {listing.type === "ai-service" ? "request" : "copy"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button disabled={publishing} onClick={onPublish}>
            {publishing
              ? "Updating…"
              : listing.status === "active"
                ? "Unpublish"
                : "Publish"}
          </Button>
          <DeleteItemButton
            name={listing.name}
            path={`seller/listings/${listing.id}`}
            description="This removes the listing from your listings and the public catalog. Existing orders and purchased content are kept. This cannot be undone."
            disabled={publishing}
            onDeleted={onDeleted}
          />
        </div>
        {listing.type === "ai-service" && <ListingPreview listing={listing} />}
      </CardContent>
    </Card>
  )
}
