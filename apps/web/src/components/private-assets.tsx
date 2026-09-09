import type { Asset } from "@repo/schemas"

import { RiFileLine, RiDeleteBinLine } from "@remixicon/react"

import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

import { FileUploadField } from "./file-upload-field"
import { RequestState } from "./marketplace-page"
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "./ui/attachment"
import { Button } from "./ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"
import { FieldGroup } from "./ui/field"

export function PrivateAssets({ assets }: { assets: Asset[] }) {
  const upload = useMarketplaceAction((form: FormData) =>
    marketplaceRequest("seller/assets", form)
  )
  const remove = useMarketplaceAction((id: string) =>
    marketplaceRequest(`seller/assets/${id}`, undefined, "DELETE")
  )
  return (
    <Card className="assets-card">
      <CardHeader>
        <CardTitle>Listing files</CardTitle>
        <CardDescription>Up to 20 MiB each.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FileUploadField
            label="Add a listing file"
            name="file"
            disabled={upload.isPending}
            onChange={(event) => {
              const input = event.currentTarget
              const file = input.files?.[0]
              if (!file || upload.isPending) {
                return
              }
              remove.reset()
              const form = new FormData()
              form.set("file", file)
              upload.mutate(form, {
                onSettled: () => {
                  input.value = ""
                },
              })
            }}
          />
          {upload.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              Uploading…
            </p>
          )}
        </FieldGroup>
        <RequestState
          error={upload.error || remove.error}
          success={
            remove.isSuccess
              ? "File deleted."
              : upload.isSuccess
                ? "File uploaded."
                : undefined
          }
        />
        {assets.length > 0 && (
          <AttachmentGroup
            className="mt-5 flex-col overflow-visible"
            role="group"
            aria-label="Uploaded listing files"
            tabIndex={0}
          >
            {assets.map((asset) => (
              <Attachment
                key={asset.id}
                className="w-full flex-nowrap"
                size="sm"
              >
                <AttachmentMedia>
                  <RiFileLine aria-hidden="true" />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle title={asset.name}>
                    {asset.name}
                  </AttachmentTitle>
                  <AttachmentDescription>
                    {fileType(asset)} · {Math.ceil(asset.size / 1024)} KB
                  </AttachmentDescription>
                </AttachmentContent>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${asset.name}`}
                  title={`Delete ${asset.name}`}
                  disabled={remove.isPending || upload.isPending}
                  onClick={() => {
                    upload.reset()
                    remove.mutate(asset.id)
                  }}
                >
                  <RiDeleteBinLine
                    className="size-4 text-destructive"
                    aria-hidden="true"
                  />
                </Button>
              </Attachment>
            ))}
          </AttachmentGroup>
        )}
      </CardContent>
    </Card>
  )
}

function fileType(asset: Asset) {
  const extension = asset.name.split(".").at(-1)

  return extension && extension !== asset.name
    ? extension.toUpperCase()
    : "File"
}
