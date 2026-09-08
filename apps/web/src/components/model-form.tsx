import type { ModelConnection } from "@repo/schemas"

import { useId } from "react"
import { toast } from "sonner"

import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

import { SheetActions } from "./editor-sheet"
import { RequestState, TextField } from "./marketplace-page"
import { Button } from "./ui/button"
import { FieldGroup } from "./ui/field"
export function ModelForm({
  model,
  onSaved,
}: {
  model: ModelConnection | null
  onSaved: () => void
}) {
  const formId = useId()
  const save = useMarketplaceAction((form: FormData) =>
    marketplaceRequest(
      model ? `seller/models/${model.id}` : "seller/models",
      Object.fromEntries(form),
      model ? "PUT" : "POST"
    )
  )

  return (
    <div className="editor-content">
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          const element = event.currentTarget
          save.mutate(new FormData(element), {
            onSuccess: () => {
              element.reset()
              toast.success("Connection saved.")
              onSaved()
            },
          })
        }}
      >
        <FieldGroup>
          <TextField
            label="Connection name"
            name="name"
            defaultValue={model?.name}
            required
          />
          <TextField
            label="Model API base URL"
            name="baseURL"
            defaultValue={model?.baseURL || "https://api.openai.com/v1"}
            type="url"
            required
          />
          <TextField
            label="Model name"
            name="model"
            defaultValue={model?.model}
            required
          />
          <TextField
            label={
              model ? "Replace API key (leave blank to keep it)" : "API key"
            }
            name="apiKey"
            type="password"
            autoComplete="new-password"
            required={!model}
          />
          <SheetActions>
            <Button form={formId} type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save connection"}
            </Button>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={onSaved}
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
