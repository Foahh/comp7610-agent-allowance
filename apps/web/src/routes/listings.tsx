import type { Listing } from "@repo/schemas"

import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { formatUnits } from "viem"

import { ListingEditor, ListingPreview } from "#/components/listing-editor"
import { MarketplacePage, RequestState } from "#/components/marketplace-page"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card"
import { Field, FieldLabel } from "#/components/ui/field"
import { Input } from "#/components/ui/input"
import { useMarketplace, useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

export const Route = createFileRoute("/listings")({ component: ListingsPage })

function ListingsPage() {
  const listings = useMarketplace("seller/listings")
  const models = useMarketplace("seller/models")
  const assets = useMarketplace("seller/assets")
  const [editor, setEditor] = useState<{ listing: Listing | null } | null>(null)
  const publish = useMarketplaceAction(
    ({ id, active }: { id: string; active: boolean }) =>
      marketplaceRequest(`seller/listings/${id}/publish`, { active })
  )
  const template = useMarketplaceAction((type: string) =>
    marketplaceRequest(`seller/templates/${type}`, {})
  )
  const upload = useMarketplaceAction((form: FormData) =>
    marketplaceRequest("seller/assets", form)
  )

  return (
    <MarketplacePage
      title="My listings"
      description="Offer private digital resources and AI services from your own seller runtime."
    >
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditor({ listing: null })}>
          Create listing
        </Button>
        <Button
          variant="outline"
          disabled={template.isPending}
          onClick={() => template.mutate("analysis")}
        >
          Use analysis template
        </Button>
        <Button
          variant="outline"
          disabled={template.isPending}
          onClick={() => template.mutate("writing")}
        >
          Use writing template
        </Button>
      </div>
      <RequestState
        pending={listings.isFetching || publish.isPending || template.isPending}
        error={
          listings.error ||
          models.error ||
          assets.error ||
          publish.error ||
          template.error
        }
      />
      <Card className="my-6">
        <CardHeader>
          <CardTitle>Private assets</CardTitle>
          <CardDescription>
            Upload files to sell or select text, Markdown, CSV, and JSON as
            knowledge. Maximum 20 MiB per file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              const element = event.currentTarget
              upload.mutate(new FormData(element), {
                onSuccess: () => element.reset(),
              })
            }}
          >
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor="asset-upload">Upload a file</FieldLabel>
              <Input id="asset-upload" name="file" type="file" required />
            </Field>
            <Button type="submit" disabled={upload.isPending}>
              Upload
            </Button>
          </form>
          <RequestState pending={upload.isPending} error={upload.error} />
          <ul className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
            {assets.data?.map((asset) => (
              <li key={asset.id}>
                {asset.name} · {Math.ceil(asset.size / 1024)} KiB ·{" "}
                {asset.readable ? "Model readable" : "Download only"}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {editor && (
        <div className="mb-6">
          <ListingEditor
            key={
              editor.listing
                ? `${editor.listing.id}:${editor.listing.version}`
                : "new"
            }
            listing={editor.listing}
            models={models.data || []}
            assets={assets.data || []}
            onSaved={() => setEditor(null)}
            onCancel={() => setEditor(null)}
          />
        </div>
      )}
      {listings.data?.length === 0 && !editor && (
        <div className="provider-empty">
          <h2>No listings yet</h2>
          <p>
            Create an item or review an optional service template. Nothing is
            published automatically.
          </p>
        </div>
      )}
      <div className="provider-grid">
        {listings.data?.map((listing) => (
          <Card key={listing.id}>
            <CardHeader>
              <div className="flex justify-between gap-2">
                <Badge variant="outline">{listing.type}</Badge>
                <Badge variant="secondary">
                  {listing.status} · v{listing.version}
                </Badge>
              </div>
              <CardTitle>{listing.name}</CardTitle>
              <CardDescription>{listing.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm">
                {formatUnits(BigInt(listing.amount), 6)} ATT /{" "}
                {listing.type === "ai-service" ? "request" : "copy"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditor({ listing })}
                >
                  Edit
                </Button>
                <Button
                  disabled={publish.isPending}
                  onClick={() =>
                    publish.mutate({
                      id: listing.id,
                      active: listing.status !== "active",
                    })
                  }
                >
                  {listing.status === "active" ? "Deactivate" : "Publish"}
                </Button>
              </div>
              {listing.type === "ai-service" && (
                <ListingPreview listing={listing} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </MarketplacePage>
  )
}
