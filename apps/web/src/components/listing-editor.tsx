import type {
  Asset,
  Listing,
  ListingInput,
  ModelConnection,
} from "@repo/schemas"

import { useState } from "react"
import { formatUnits, parseUnits } from "viem"

import { RequestState, TextField } from "#/components/marketplace-page"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Checkbox } from "#/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field"
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select"
import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest, formText } from "#/lib/marketplace"

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
  const [type, setType] = useState<ListingInput["type"]>(
    listing?.type || "text"
  )
  const [assetIds, setAssetIds] = useState(listing?.assetIds || [])
  const selectedAssets = new Set(assetIds)
  const readableAssets = assets.filter((asset) => asset.readable)
  const save = useMarketplaceAction(async (form: FormData) => {
    const price = formText(form, "price")

    if (!/^\d+(\.\d{1,6})?$/.test(price) || parseUnits(price, 6) <= 0n) {
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

    return marketplaceRequest(
      listing ? `seller/listings/${listing.id}` : "seller/listings",
      input,
      listing ? "PUT" : "POST"
    )
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {listing ? `Edit ${listing.name}` : "Create listing"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate(new FormData(event.currentTarget), {
              onSuccess: onSaved,
            })
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="listing-type">Item type</FieldLabel>
              <NativeSelect
                id="listing-type"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as ListingInput["type"])
                }
              >
                {["text", "link", "file", "ai-service"].map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value === "ai-service" ? "AI service" : value}
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
                label="Price per request or copy (ATT)"
                name="price"
                defaultValue={
                  listing ? formatUnits(BigInt(listing.amount), 6) : "0.01"
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
                <FieldLabel htmlFor="listing-file">Private file</FieldLabel>
                <NativeSelect
                  id="listing-file"
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
              <>
                <Field>
                  <FieldLabel htmlFor="listing-model">
                    Model connection
                  </FieldLabel>
                  <NativeSelect
                    id="listing-model"
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
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-3 text-sm font-medium">
                    Knowledge assets
                  </legend>
                  {readableAssets.map((asset) => (
                    <Field key={asset.id} orientation="horizontal">
                      <Checkbox
                        id={`knowledge-${asset.id}`}
                        checked={selectedAssets.has(asset.id)}
                        onCheckedChange={(checked) =>
                          setAssetIds(
                            checked
                              ? [...assetIds, asset.id]
                              : assetIds.filter((id) => id !== asset.id)
                          )
                        }
                      />
                      <FieldLabel htmlFor={`knowledge-${asset.id}`}>
                        {asset.name}
                      </FieldLabel>
                    </Field>
                  ))}
                </fieldset>
              </>
            )}
            <p className="text-sm text-muted-foreground">
              Saving creates a draft version. Existing quotes and purchases
              retain their original content.
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending}>
                Save draft
              </Button>
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </div>
            <RequestState pending={save.isPending} error={save.error} />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
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
        <p className="text-sm text-muted-foreground">
          Calls your real model connection. No ATT purchase is created.
        </p>
        <TextField label="Test request" name="brief" multiline required />
        <TextField label="Supporting evidence" name="evidence" multiline />
        <Button type="submit" disabled={preview.isPending}>
          Run preview
        </Button>
        <RequestState pending={preview.isPending} error={preview.error} />
        {preview.data && (
          <p className="text-sm whitespace-pre-wrap">{preview.data.content}</p>
        )}
      </form>
    </details>
  )
}
