import type {
  Asset,
  Listing,
  ListingInput,
  ModelConnection,
} from "@repo/schemas"

import { useId, useState } from "react"
import { toast } from "sonner"
import { formatUnits, parseUnits } from "viem"

import { SheetActions } from "#/components/editor-sheet"
import { RequestState, TextField } from "#/components/marketplace-page"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field"
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select"
import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest, formText } from "#/lib/marketplace"
import { listingTypeLabel } from "#/lib/presentation"

const TOKEN_PRICE_PATTERN = /^\d+(\.\d{1,6})?$/
const LISTING_TYPES: ListingInput["type"][] = [
  "text",
  "link",
  "file",
  "ai-service",
]

export function ListingEditor({
  listing,
  models,
  assets,
  onSaved,
  onCancel,
}: {
  listing: Listing | null
  models: ModelConnection[]
  assets: Asset[]
  onSaved: () => void
  onCancel: () => void
}) {
  const formId = useId()
  const [price, setPrice] = useState(
    listing ? formatUnits(BigInt(listing.amount), 6) : "0.01"
  )
  const invalidPrice = !TOKEN_PRICE_PATTERN.test(price) || Number(price) <= 0
  const [type, setType] = useState<ListingInput["type"]>(
    listing?.type || "text"
  )
  const [assetIds, setAssetIds] = useState(listing?.assetIds || [])
  const selectedAssets = new Set(assetIds)
  const readableAssets = assets.filter((asset) => asset.readable)

  function setAssetSelected(assetId: string, selected: boolean) {
    setAssetIds((currentAssetIds) => {
      if (selected) {
        return [...currentAssetIds, assetId]
      }

      return currentAssetIds.filter((id) => id !== assetId)
    })
  }

  const save = useMarketplaceAction(async (form: FormData) => {
    const price = formText(form, "price")

    if (!TOKEN_PRICE_PATTERN.test(price) || parseUnits(price, 6) <= 0n) {
      throw new Error(
        "Enter a positive ATT price with at most six decimal places."
      )
    }

    const input: ListingInput = {
      name: formText(form, "name"),
      description: formText(form, "description"),
      preview: formText(form, "preview"),
      type,
      amount: parseUnits(price, 6).toString(),
      content: formText(form, "content"),
      assetId: formText(form, "assetId"),
      modelId: formText(form, "modelId"),
      instructions: formText(form, "instructions"),
      requiredInputs: formText(form, "requiredInputs"),
      deliverable: formText(form, "deliverable"),
      scope: formText(form, "scope"),
      assetIds: type === "ai-service" ? assetIds : [],
    }

    if (listing) {
      return marketplaceRequest(`seller/listings/${listing.id}`, input, "PUT")
    }

    return marketplaceRequest("seller/listings", input)
  })

  return (
    <div className="editor-content">
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate(new FormData(event.currentTarget), {
            onSuccess: () => {
              toast.success("Draft saved.")
              onSaved()
            },
          })
        }}
      >
        <FieldGroup>
          <h3 className="form-section-title">Basics</h3>
          <Field>
            <FieldLabel htmlFor={`${formId}-type`}>Item type</FieldLabel>
            <NativeSelect
              id={`${formId}-type`}
              value={type}
              onChange={(event) =>
                setType(event.target.value as ListingInput["type"])
              }
            >
              {LISTING_TYPES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {listingTypeLabel(value)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Name"
              name="name"
              defaultValue={listing?.name}
              required
              maxLength={120}
            />
            <TextField
              label="Price (ATT)"
              name="price"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              error={
                invalidPrice
                  ? "Enter a positive ATT price with up to six decimals."
                  : undefined
              }
              inputMode="decimal"
              required
            />
          </div>
          <TextField
            label="Public description"
            name="description"
            defaultValue={listing?.description}
            multiline
            maxLength={2000}
          />
          <TextField
            label="Public preview"
            name="preview"
            defaultValue={listing?.preview}
            multiline
            maxLength={2000}
          />
          <h3 className="form-section-title">Delivery</h3>
          <TextField
            label="What the buyer receives"
            name="deliverable"
            defaultValue={listing?.deliverable}
            required
            maxLength={2000}
          />
          <TextField
            label="Scope limits"
            name="scope"
            defaultValue={listing?.scope}
            maxLength={2000}
          />
          {(type === "text" || type === "link") && (
            <TextField
              label={
                type === "text" ? "Private paid content" : "Private paid URL"
              }
              name="content"
              defaultValue={listing?.content}
              multiline={type === "text"}
              type={type === "link" ? "url" : "text"}
              required
              maxLength={200000}
            />
          )}
          {type === "file" && (
            <Field>
              <FieldLabel htmlFor={`${formId}-file`}>Private file</FieldLabel>
              <NativeSelect
                id={`${formId}-file`}
                name="assetId"
                defaultValue={listing?.assetId || ""}
                required
              >
                <NativeSelectOption value="">
                  Select an uploaded file
                </NativeSelectOption>
                {assets.map((asset) => (
                  <NativeSelectOption key={asset.id} value={asset.id}>
                    {asset.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          {type === "ai-service" && (
            <ListingServiceFields
              listing={listing}
              models={models}
              readableAssets={readableAssets}
              selectedAssets={selectedAssets}
              onAssetChange={setAssetSelected}
              formId={formId}
            />
          )}
          <p className="text-sm text-muted-foreground">
            Edits don’t change existing purchases.
          </p>
          <SheetActions>
            <Button
              form={formId}
              type="submit"
              disabled={save.isPending || invalidPrice}
            >
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </SheetActions>
          <RequestState error={save.error} />
        </FieldGroup>
      </form>
    </div>
  )
}

export function ListingPreview({ listing }: { listing: Listing }) {
  const preview = useMarketplaceAction((form: FormData) =>
    marketplaceRequest<{ content: string }>(
      `seller/listings/${listing.id}/preview`,
      Object.fromEntries(form)
    )
  )

  return (
    <details>
      <summary className="cursor-pointer text-sm">Test this AI service</summary>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          preview.mutate(new FormData(event.currentTarget))
        }}
      >
        <FieldGroup>
          <TextField label="Test request" name="brief" multiline required />
          <TextField label="Supporting evidence" name="evidence" multiline />
          <Button type="submit" disabled={preview.isPending}>
            {preview.isPending ? "Running…" : "Run preview"}
          </Button>
          <RequestState error={preview.error} />
          {preview.data && (
            <p className="text-sm whitespace-pre-wrap">
              {preview.data.content}
            </p>
          )}
        </FieldGroup>
      </form>
    </details>
  )
}

function ListingServiceFields({
  listing,
  models,
  readableAssets,
  selectedAssets,
  onAssetChange,
  formId,
}: {
  listing: Listing | null
  models: ModelConnection[]
  readableAssets: Asset[]
  selectedAssets: Set<string>
  onAssetChange: (id: string, selected: boolean) => void
  formId: string
}) {
  return (
    <>
      <h3 className="form-section-title">Service configuration</h3>
      <Field>
        <FieldLabel htmlFor={`${formId}-model`}>Model connection</FieldLabel>
        <NativeSelect
          id={`${formId}-model`}
          name="modelId"
          defaultValue={listing?.modelId || ""}
        >
          <NativeSelectOption value="">
            Select before publishing
          </NativeSelectOption>
          {models.map((model) => (
            <NativeSelectOption key={model.id} value={model.id}>
              {model.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <TextField
        label="Private service instructions"
        name="instructions"
        defaultValue={listing?.instructions}
        multiline
        maxLength={30000}
      />
      <TextField
        label="Required buyer inputs"
        name="requiredInputs"
        defaultValue={listing?.requiredInputs}
        multiline
        maxLength={2000}
      />
      {readableAssets.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-medium">Knowledge assets</legend>
          {readableAssets.map((asset) => (
            <Field key={asset.id} orientation="horizontal">
              <Checkbox
                id={`knowledge-${asset.id}`}
                checked={selectedAssets.has(asset.id)}
                onCheckedChange={(checked) => onAssetChange(asset.id, checked)}
              />
              <FieldLabel htmlFor={`knowledge-${asset.id}`}>
                {asset.name}
              </FieldLabel>
            </Field>
          ))}
        </fieldset>
      )}
    </>
  )
}
