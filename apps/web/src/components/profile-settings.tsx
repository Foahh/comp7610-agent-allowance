import type { ModelConnection } from "@repo/schemas"

import { useWorkspaceAssistant } from "#/components/assistant-context"
import { RequestState, TextField } from "#/components/marketplace-page"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card"
import { Field, FieldLabel, FieldGroup } from "#/components/ui/field"
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select"
import { useMarketplace } from "#/hooks/use-marketplace"
import { useMarketplaceAction } from "#/hooks/use-marketplace"
import {
  marketplaceRequest,
  formText,
  type SellerProfile,
} from "#/lib/marketplace"
export function ProfileForm({
  profile,
  models,
}: {
  profile: SellerProfile
  models: ModelConnection[]
}) {
  const { config } = useWorkspaceAssistant()
  const identity = useMarketplace("seller/identity")

  const save = useMarketplaceAction((input: SellerProfile) =>
    marketplaceRequest("seller/profile", input, "PUT")
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seller profile</CardTitle>
        <CardDescription>
          Your name and description appear in connected catalogs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 text-sm">
          <details className="detail-disclosure">
            <summary>Endpoint and signing accounts</summary>
            <dl className="receipt">
              <dt>Seller endpoint</dt>
              <dd>{config?.sellerEndpoint}</dd>
              <dt>Seller signer</dt>
              <dd>{identity.data?.address || "Unavailable"}</dd>
              <dt>Buyer signer · no ETH funding required</dt>
              <dd>{config?.buyerSigner}</dd>
            </dl>
          </details>
          <RequestState error={identity.error} />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            save.mutate({
              name: formText(form, "name"),
              description: formText(form, "description"),
              buyerModelId: formText(form, "buyerModelId"),
            })
          }}
        >
          <FieldGroup>
            <TextField
              label="Seller name"
              name="name"
              defaultValue={profile.name}
              required
              maxLength={120}
            />
            <TextField
              label="Description"
              name="description"
              defaultValue={profile.description}
              multiline
              maxLength={2000}
            />
            <Field>
              <FieldLabel htmlFor="buyer-model">
                Buyer assistant model
              </FieldLabel>
              <NativeSelect
                id="buyer-model"
                name="buyerModelId"
                defaultValue={profile.buyerModelId}
              >
                <NativeSelectOption value="">
                  Select a connection
                </NativeSelectOption>
                {models.map((model) => (
                  <NativeSelectOption key={model.id} value={model.id}>
                    {model.name} · {model.model}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save profile"}
            </Button>
            <RequestState
              pending={save.isPending}
              error={save.error}
              success={save.isSuccess ? "Settings saved." : undefined}
            />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
