import type { Listing } from "@repo/schemas"

import { formatUnits } from "viem"

import { listingStatusLabel, listingTypeLabel } from "#/lib/presentation"

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
}: {
  listing: Listing
  publishing: boolean
  onEdit: () => void
  onPublish: () => void
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
        </div>
        {listing.type === "ai-service" && <ListingPreview listing={listing} />}
      </CardContent>
    </Card>
  )
}
