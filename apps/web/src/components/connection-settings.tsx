import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { requestJson } from "#/lib/client"

import { useWorkspaceAssistant } from "./assistant-context"
import { RequestState } from "./marketplace-page"
import { Button } from "./ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"
import { Checkbox } from "./ui/checkbox"
import { Input } from "./ui/input"

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
        <CardDescription>Manage how buyers reach your seller.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void save(new FormData(event.currentTarget))
          }}
        >
          <label className="grid gap-2">
            Seller base URL
            <Input
              name="endpoint"
              required
              defaultValue={config?.sellerEndpoint.split("/sellers/")[0]}
            />
          </label>
          <label className="flex gap-2">
            <Checkbox
              value="on"
              name="public"
              defaultChecked={config?.sellerPublic}
            />
            Allow remote connections
          </label>
          <details className="detail-disclosure">
            <summary>Remote connection setup</summary>
            <p>
              For another computer, replace 127.0.0.1 with this computer's
              reachable LAN address or HTTPS endpoint. Keep the seller port.
              Firewall or tunnel setup may be needed; saving a URL does not make
              it reachable.
            </p>
          </details>
          <Button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save access"}
          </Button>
        </form>
        <p className="break-all">Share: {config?.sellerEndpoint}</p>
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
        <CardTitle>Local instances</CardTitle>
        <CardDescription>
          Run a separate workspace for another account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void create()
          }}
        >
          {busy ? "Starting…" : "Start instance"}
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
            </a>{" "}
            · allow a few seconds for startup.
          </p>
        )}
        <details className="detail-disclosure">
          <summary>Using multiple accounts</summary>
          <p>
            Tabs on the same URL share an account. Use a separate instance or
            browser profile for another account. Some wallet extensions share
            their selected account across tabs; separate browser profiles are
            most reliable.
          </p>
        </details>
        <RequestState error={error ? new Error(error) : undefined} />
      </CardContent>
    </Card>
  )
}
