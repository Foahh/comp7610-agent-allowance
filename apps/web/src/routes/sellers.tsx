import type { PublicListing, SellerConnection } from "@repo/schemas"

import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { formatUnits } from "viem"

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
} from "#/components/ui/card"
import { useMarketplace, useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest, formText } from "#/lib/marketplace"

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
  const [selection, setSelection] = useState<{
    seller: SellerConnection
    listing: PublicListing
  } | null>(null)
  const connect = useMarketplaceAction((endpoint: string) =>
    marketplaceRequest("connections", { endpoint })
  )
  const update = useMarketplaceAction(updateConnection)

  return (
    <MarketplacePage
      title="Connected sellers"
      description="Save seller endpoints, explore their listings, and choose what your assistant can buy."
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          connect.mutate(formText(new FormData(form), "endpoint"), {
            onSuccess: () => form.reset(),
          })
        }}
      >
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
          Connect seller
        </Button>
      </form>
      <p className="my-3 text-sm text-muted-foreground">
        Connecting saves a catalog. Spending permission is approved separately
        in your conversation allowance.
      </p>
      <RequestState
        pending={
          connections.isFetching || connect.isPending || update.isPending
        }
        error={connections.error || connect.error || update.error}
      />
      {selection && (
        <ListingPurchase
          key={`${selection.seller.id}:${selection.listing.id}:${selection.listing.version}`}
          {...selection}
          onClose={() => setSelection(null)}
        />
      )}
      {connections.data?.length === 0 && (
        <div className="provider-empty">
          <h2>No connected sellers</h2>
          <p>
            Ask another participant for their seller endpoint, then add it
            above.
          </p>
        </div>
      )}
      <div className="provider-grid">
        {connections.data?.map((seller) => (
          <Card key={seller.id}>
            <CardHeader>
              <div className="flex justify-between gap-2">
                <CardTitle>{seller.identity.name}</CardTitle>
                <Badge
                  variant={
                    seller.status === "online" ? "secondary" : "destructive"
                  }
                >
                  {seller.enabled ? seller.status : "disabled"}
                </Badge>
              </div>
              <CardDescription>{seller.identity.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs break-all text-muted-foreground">
                {seller.endpoint}
                <br />
                {seller.identity.address}
              </p>
              {seller.error && (
                <p className="text-sm text-destructive">{seller.error}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ id: seller.id, action: "refresh" })
                  }
                >
                  Refresh
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
              {seller.listings.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  This seller has no active listings.
                </p>
              )}
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
                    <span className="text-sm">
                      {formatUnits(BigInt(listing.amount), 6)} ATT ·{" "}
                      {listing.type}
                    </span>
                    <Button
                      disabled={!seller.enabled || seller.status !== "online"}
                      onClick={() => setSelection({ seller, listing })}
                    >
                      View & buy
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </MarketplacePage>
  )
}
