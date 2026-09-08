import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { requestJson } from "#/lib/client"

import { useWorkspaceAssistant } from "./assistant-context"
import { Button } from "./ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"

export function ConnectionSettings() {
  const { config } = useWorkspaceAssistant()
  const cache = useQueryClient()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [instance, setInstance] = useState<{ name: string; url: string }>()

  async function save(form: FormData) {
    setBusy(true)
    setError("")

    try {
      await requestJson("/setup/seller", {
        endpoint: form.get("endpoint"),
        public: form.get("public") === "on",
      })
      await cache.invalidateQueries({ queryKey: ["config"] })
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to save endpoint."
      )
    } finally {
      setBusy(false)
    }
  }

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

  async function select(id: string) {
    setBusy(true)
    setError("")

    try {
      await requestJson("/setup/select", { id })
      location.reload()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to select deployment."
      )
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connections and demonstrations</CardTitle>
        <CardDescription>
          Each account has a separate seller endpoint. Only the seller protocol
          can be shared with another computer.
        </CardDescription>
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
            Advertised seller base URL
            <input
              className="rounded-md border p-2"
              name="endpoint"
              required
              defaultValue={config?.sellerEndpoint.split("/sellers/")[0]}
            />
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              name="public"
              defaultChecked={config?.sellerPublic}
            />
            Allow other computers to connect to this account's seller
          </label>
          <p>
            For another computer, replace 127.0.0.1 with this computer's
            reachable LAN address or HTTPS endpoint. Keep the seller port.
            Firewall or tunnel setup may be needed; saving a URL does not make
            it reachable.
          </p>
          <Button disabled={busy} type="submit">
            Save seller access
          </Button>
        </form>
        <p className="break-all">Share: {config?.sellerEndpoint}</p>
        <label className="grid gap-2">
          Active deployment
          <select
            className="rounded-md border p-2"
            value={config?.activeDeployment || ""}
            disabled={busy}
            onChange={(event) => {
              void select(event.target.value)
            }}
          >
            {config?.deployments.map((deployment) => (
              <option
                key={deployment.vaultAddress}
                value={deployment.vaultAddress.toLowerCase()}
              >
                Sepolia · {deployment.vaultAddress}
              </option>
            ))}
          </select>
        </label>
        <p>
          Switching keeps each deployment's history and old allowances. Return
          to the old deployment to recover payments or withdraw funds.
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void create()
          }}
        >
          Start another local instance
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
        <p>
          Tabs on the same URL share an account. Use a separate instance or
          browser profile for another account. Some wallet extensions share
          their selected account across tabs; separate browser profiles are most
          reliable.
        </p>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
