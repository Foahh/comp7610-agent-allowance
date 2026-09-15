import type { Listing } from "@repo/schemas"

import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { DemoItems } from "#/components/demo-items"
import { EditorSheet } from "#/components/editor-sheet"
import { ListingCard } from "#/components/listing-card"
import { ListingEditor } from "#/components/listing-editor"
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
    <MarketplacePage title="My listings">
      <div className="providers-toolbar">
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
        <DemoItems />
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
        </div>
      )}
      <div className="provider-grid">
        {listings.data?.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            publishing={publish.isPending}
            onDeleted={() => {
              if (editor?.listing?.id === listing.id) {
                setEditor(null)
                setEditorOpen(false)
              }
            }}
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
