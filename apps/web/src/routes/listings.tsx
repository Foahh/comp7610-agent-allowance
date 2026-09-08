import type { Listing } from "@repo/schemas"

import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { EditorSheet } from "#/components/editor-sheet"
import { ListingCard } from "#/components/listing-card"
import { ListingEditor } from "#/components/listing-editor"
import { ListingTemplates } from "#/components/listing-templates"
import { MarketplacePage, RequestState } from "#/components/marketplace-page"
import { PrivateAssets } from "#/components/private-assets"
import { Button } from "#/components/ui/button"
import { useMarketplace, useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

export const Route = createFileRoute("/listings")({ component: ListingsPage })

function ListingsPage() {
  const [editorOpen, setEditorOpen] = useState(false)
  const listings = useMarketplace("seller/listings")
  const models = useMarketplace("seller/models")
  const assets = useMarketplace("seller/assets")
  const [editor, setEditor] = useState<{ listing: Listing | null } | null>(null)
  const publish = useMarketplaceAction(
    ({ id, active }: { id: string; active: boolean }) =>
      marketplaceRequest(`seller/listings/${id}/publish`, { active })
  )

  return (
    <MarketplacePage
      title="My listings"
      description="Manage the resources and services you sell."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            if (!editor || editor.listing) {
              setEditor({ listing: null })
            }
            setEditorOpen(true)
          }}
        >
          Create listing
        </Button>
        <ListingTemplates />
      </div>
      <RequestState
        onRetry={
          listings.error
            ? () => {
                void listings.refetch()
              }
            : undefined
        }
        pending={listings.isPending}
        success={publish.isSuccess ? "Listing updated." : undefined}
        error={listings.error || models.error || assets.error || publish.error}
      />
      {editor && (
        <EditorSheet
          open={editorOpen}
          onOpenChange={setEditorOpen}
          title={editor.listing ? "Edit listing" : "Create listing"}
        >
          <ListingEditor
            key={
              editor.listing
                ? `${editor.listing.id}:${editor.listing.version}`
                : "new"
            }
            listing={editor.listing}
            models={models.data || []}
            assets={assets.data || []}
            onSaved={() => {
              setEditor(null)
              setEditorOpen(false)
            }}
            onCancel={() => {
              setEditor(null)
              setEditorOpen(false)
            }}
          />
        </EditorSheet>
      )}
      {!listings.error && listings.data?.length === 0 && (
        <div className="provider-empty">
          <h2>No listings yet</h2>
          <p>Create a listing or start with a template.</p>
        </div>
      )}
      <div className="provider-grid">
        {listings.data?.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            publishing={publish.isPending}
            onEdit={() => {
              if (editor?.listing?.id !== listing.id) {
                setEditor({ listing })
              }
              setEditorOpen(true)
            }}
            onPublish={() =>
              publish.mutate({
                id: listing.id,
                active: listing.status !== "active",
              })
            }
          />
        ))}
      </div>
      <PrivateAssets assets={assets.data || []} />
    </MarketplacePage>
  )
}
