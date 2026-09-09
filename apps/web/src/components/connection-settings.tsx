import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { Field, FieldLabel, FieldGroup } from "#/components/ui/field"
import { requestJson } from "#/lib/client"

import { useWorkspaceAssistant } from "./assistant-context"
import { RequestState, TextField } from "./marketplace-page"
import { Button } from "./ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card"
import { Checkbox } from "./ui/checkbox"

export function ConnectionSettings() {
  const { config } = useWorkspaceAssistant()
  const cache = useQueryClient()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function save(form: FormData) {
    setBusy(true)
    setError("")

    try {
      await requestJson("/setup/seller", {
        endpoint: form.get("endpoint"),
        public: form.get("public") === "on",
      })
      await cache.invalidateQueries({ queryKey: ["config"] })
      toast.success("Seller access saved.")
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to save endpoint."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seller access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void save(new FormData(event.currentTarget))
          }}
        >
          <FieldGroup>
            <TextField
              label="Seller base URL"
              name="endpoint"
              required
              defaultValue={config?.sellerEndpoint.split("/sellers/")[0]}
            />
            <Field orientation="horizontal">
              <Checkbox
                id="seller-public"
                value="on"
                name="public"
                defaultChecked={config?.sellerPublic}
              />
              <FieldLabel htmlFor="seller-public">
                Allow remote connections
              </FieldLabel>
            </Field>
            <details className="detail-disclosure">
              <summary>Remote connection setup</summary>
              <p>
                For another computer, replace 127.0.0.1 with this computer's
                reachable LAN address or HTTPS endpoint. Keep the seller port.
                Firewall or tunnel setup may be needed; saving a URL does not
                make it reachable.
              </p>
            </details>
            <Button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save access"}
            </Button>
          </FieldGroup>
        </form>
        <p className="break-all">Seller endpoint: {config?.sellerEndpoint}</p>
        <RequestState error={error ? new Error(error) : undefined} />
      </CardContent>
    </Card>
  )
}

export function LocalInstances() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [instance, setInstance] = useState<{ name: string; url: string }>()
  async function create() {
    setBusy(true)
    setError("")

    try {
      setInstance(
        (await requestJson("/instances", {})) as { name: string; url: string }
      )
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to open instance."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void create()
          }}
        >
          {busy ? "Opening…" : "Open another workspace"}
        </Button>
        {instance && (
          <p role="status">
            <a
              className="underline"
              href={instance.url}
              target="_blank"
              rel="noreferrer"
            >
              Open {instance.name}
            </a>
          </p>
        )}
        <details className="detail-disclosure">
          <summary>Keep accounts separate</summary>
          <p>
            Tabs at the same address share an account. Use a separate browser
            profile for each account.
          </p>
        </details>
        <RequestState error={error ? new Error(error) : undefined} />
      </CardContent>
    </Card>
  )
}
