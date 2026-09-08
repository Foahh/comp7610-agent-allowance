import type { ModelConnection } from "@repo/schemas"

import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

import { RequestState, TextField } from "./marketplace-page"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { FieldGroup } from "./ui/field"
export function ModelForm({
  model,
  onSaved,
}: {
  model: ModelConnection | null
  onSaved: () => void
}) {
  const save = useMarketplaceAction((form: FormData) =>
    marketplaceRequest(
      model ? `seller/models/${model.id}` : "seller/models",
      Object.fromEntries(form),
      model ? "PUT" : "POST"
    )
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{model ? "Edit connection" : "Add connection"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const element = event.currentTarget
            save.mutate(new FormData(element), {
              onSuccess: () => {
                element.reset()
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
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending}>
                Save connection
              </Button>
              {model && (
                <Button variant="outline" onClick={onSaved}>
                  Cancel
                </Button>
              )}
            </div>
            <RequestState
              pending={save.isPending}
              error={save.error}
              success={save.isSuccess ? "Connection saved." : undefined}
            />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
