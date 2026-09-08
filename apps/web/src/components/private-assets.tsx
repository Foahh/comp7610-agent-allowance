import type { Asset } from "@repo/schemas"

import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

import { RequestState } from "./marketplace-page"
import { Button } from "./ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"
import { Field, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"

export function PrivateAssets({ assets }: { assets: Asset[] }) {
  const upload = useMarketplaceAction((form: FormData) =>
    marketplaceRequest("seller/assets", form)
  )
  return (
    <Card className="assets-card">
      <CardHeader>
        <CardTitle>Private assets</CardTitle>
        <CardDescription>
          Files for listings and model knowledge. Up to 20 MiB each.
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
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </form>
        <RequestState
          error={upload.error}
          success={upload.isSuccess ? "File uploaded." : undefined}
        />
        <ul className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
          {assets.map((asset) => (
            <li className="asset-row" key={asset.id}>
              {asset.name} · {Math.ceil(asset.size / 1024)} KiB ·{" "}
              {asset.readable ? "Model readable" : "Download only"}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
