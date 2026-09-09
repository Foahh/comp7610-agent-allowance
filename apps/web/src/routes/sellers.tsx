import type { PublicListing, SellerConnection } from "@repo/schemas"

import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { formatUnits } from "viem"

import { EditorSheet } from "#/components/editor-sheet"
import { ListingPurchase } from "#/components/listing-purchase"
import {
  MarketplacePage,
  RequestState,
  TextField,
} from "#/components/marketplace-page"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "#/components/ui/card"
import { FieldGroup } from "#/components/ui/field"
import { useMarketplace, useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest, formText } from "#/lib/marketplace"
import { listingTypeLabel, sellerStatusLabel } from "#/lib/presentation"

export const Route = createFileRoute("/sellers")({ component: SellersPage })

type ConnectionAction = {
  id: string
  action: "refresh" | "toggle" | "remove"
  enabled?: boolean
}

function updateConnection({ id, action, enabled }: ConnectionAction) {
  if (action === "refresh") {
    return marketplaceRequest(`connections/${id}/refresh`, {})
  }

  if (action === "toggle") {
    return marketplaceRequest(`connections/${id}`, { enabled }, "PUT")
  }

  return marketplaceRequest(`connections/${id}`, undefined, "DELETE")
}

function SellersPage() {
  const connections = useMarketplace("connections")
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [selection, setSelection] = useState<{
    seller: SellerConnection
    listing: PublicListing
  } | null>(null)
  const connect = useMarketplaceAction((endpoint: string) =>
    marketplaceRequest("connections", { endpoint })
  )
  const update = useMarketplaceAction(updateConnection)

  return (
    <MarketplacePage title="Sellers">
      <form
        className="dashboard-toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          connect.mutate(formText(new FormData(form), "endpoint"), {
            onSuccess: () => form.reset(),
          })
        }}
      >
        <FieldGroup className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <TextField
              label="Seller endpoint"
              name="endpoint"
              placeholder="http://localhost:3005"
              type="url"
              required
            />
          </div>
          <Button type="submit" disabled={connect.isPending}>
            {connect.isPending ? "Connecting…" : "Connect seller"}
          </Button>
        </FieldGroup>
      </form>
      <RequestState
        onRetry={
          connections.error
            ? () => {
                void connections.refetch()
              }
            : undefined
        }
        pending={connections.isPending}
        error={connections.error || connect.error || update.error}
        success={
          connect.isSuccess
            ? "Seller connected."
            : update.isSuccess
              ? "Seller updated."
              : undefined
        }
      />
      {selection && (
        <EditorSheet
          open={purchaseOpen}
          onOpenChange={setPurchaseOpen}
          title={selection.listing.name}
        >
          <ListingPurchase
            key={`${selection.seller.id}:${selection.listing.id}:${selection.listing.version}`}
            {...selection}
            onClose={() => setPurchaseOpen(false)}
          />
        </EditorSheet>
      )}
      {!connections.error && connections.data?.length === 0 && (
        <div className="provider-empty">
          <h2>No connected sellers</h2>
        </div>
      )}
      <div className="provider-grid">
        {connections.data?.map((seller) => (
          <Card key={seller.id} className="seller-card">
            <CardHeader>
              <div className="flex justify-between gap-2">
                <CardTitle>{seller.identity.name}</CardTitle>
                <Badge
                  variant={
                    seller.status === "online" ? "secondary" : "destructive"
                  }
                >
                  {seller.enabled
                    ? sellerStatusLabel(seller.status)
                    : "Disabled"}
                </Badge>
              </div>
              <CardDescription>{seller.identity.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <span className="text-xs text-muted-foreground">
                {seller.listings.length}{" "}
                {seller.listings.length === 1 ? "listing" : "listings"}
              </span>
              <details className="detail-disclosure">
                <summary>Seller details</summary>
                <dl className="receipt">
                  <dt>Endpoint</dt>
                  <dd>{seller.endpoint}</dd>
                  <dt>Address</dt>
                  <dd>{seller.identity.address}</dd>
                </dl>
                <RequestState
                  error={seller.error ? new Error(seller.error) : undefined}
                />
              </details>
              {seller.listings.map((listing) => (
                <div
                  key={`${listing.id}:${listing.version}`}
                  className="flex flex-col gap-2 border-t border-border pt-4"
                >
                  <strong className="text-sm">{listing.name}</strong>
                  <p className="text-sm text-muted-foreground">
                    {listing.description}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm tabular-nums">
                      {formatUnits(BigInt(listing.amount), 6)} ATT ·{" "}
                      {listingTypeLabel(listing.type)}
                    </span>
                    <Button
                      disabled={!seller.enabled || seller.status !== "online"}
                      onClick={() => {
                        setSelection({ seller, listing })
                        setPurchaseOpen(true)
                      }}
                    >
                      View & buy
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
            <CardFooter>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ id: seller.id, action: "refresh" })
                  }
                >
                  {update.isPending &&
                  update.variables?.id === seller.id &&
                  update.variables.action === "refresh"
                    ? "Refreshing…"
                    : "Refresh"}
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    update.isPending || seller.status === "identity-changed"
                  }
                  onClick={() =>
                    update.mutate({
                      id: seller.id,
                      action: "toggle",
                      enabled: !seller.enabled,
                    })
                  }
                >
                  {seller.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ id: seller.id, action: "remove" })
                  }
                >
                  Remove
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </MarketplacePage>
  )
}
