import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { requestJson } from "#/lib/client"

import { useWorkspaceAssistant } from "./assistant-context"
import { TextField } from "./marketplace-page"
import { Button } from "./ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"

type Validation = {
  validationId: string
  manifest: {
    chainId: number
    tokenAddress: string
    vaultAddress: string
    vaultVersion: string
  }
}

export function DeploymentSettings() {
  const { config, logout } = useWorkspaceAssistant()
  const cache = useQueryClient()
  const [addresses, setAddresses] = useState({
    tokenAddress: "",
    vaultAddress: "",
  })
  const [validated, setValidated] = useState<Validation>()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function validate(form: FormData) {
    setBusy(true)
    setError("")
    setValidated(undefined)

    try {
      setValidated(
        (await requestJson("/setup/validate", {
          rpcUrl: form.get("rpcUrl"),
          ...addresses,
        })) as Validation
      )
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Validation failed."
      )
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!validated) {
      return
    }

    setBusy(true)
    setError("")

    try {
      await requestJson("/setup/save", { validationId: validated.validationId })
      await cache.invalidateQueries({ queryKey: ["config"] })
      setValidated(undefined)
      location.reload()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save.")
    } finally {
      setBusy(false)
    }
  }

  async function importManifest(file?: File) {
    if (!file) {
      return
    }

    setError("")
    setValidated(undefined)

    try {
      if (file.size > 20000) {
        throw new Error("Deployment file is too large.")
      }

      const value = JSON.parse(await file.text()) as {
        schemaVersion?: number
        chainId?: number
        tokenAddress?: string
        vaultAddress?: string
      }
      if (
        value.schemaVersion !== 1 ||
        value.chainId !== 11155111 ||
        typeof value.tokenAddress !== "string" ||
        typeof value.vaultAddress !== "string"
      ) {
        throw new Error(
          "Import a version 1 deployment configuration for Sepolia."
        )
      }

      setAddresses({
        tokenAddress: value.tokenAddress,
        vaultAddress: value.vaultAddress,
      })
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Invalid configuration."
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {config?.configured
            ? "Deployment settings"
            : "Connect to the shared contracts"}
        </CardTitle>
        <CardDescription>
          Import the group's deployment file, then validate your RPC and
          contracts. No deployment or private key is needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {config?.restartRequired && (
          <p role="status" className="rounded-md border p-3 text-sm">
            RPC settings saved. Restart this instance to apply them to both
            buying and selling. The previous RPC remains active until then.
          </p>
        )}
        {config?.configured && (
          <div className="space-y-2 text-sm">
            <p>Sepolia · Vault {config.vault}</p>
            <a className="underline" href="/api/setup/export">
              Export public deployment configuration
            </a>
          </div>
        )}
        <form
          className="space-y-4"
          onChange={() => setValidated(undefined)}
          onSubmit={(event) => {
            event.preventDefault()
            void validate(new FormData(event.currentTarget))
          }}
        >
          <label className="grid gap-2 text-sm">
            Import deployment JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                void importManifest(event.currentTarget.files?.[0])
              }}
            />
          </label>
          <TextField
            label="RPC URL"
            name="rpcUrl"
            required
            defaultValue="https://ethereum-sepolia-rpc.publicnode.com"
          />
          <label className="grid gap-2 text-sm">
            Token address
            <input
              className="rounded-md border p-2"
              required
              value={addresses.tokenAddress}
              onChange={(event) =>
                setAddresses({ ...addresses, tokenAddress: event.target.value })
              }
            />
          </label>
          <label className="grid gap-2 text-sm">
            Vault address
            <input
              className="rounded-md border p-2"
              required
              value={addresses.vaultAddress}
              onChange={(event) =>
                setAddresses({ ...addresses, vaultAddress: event.target.value })
              }
            />
          </label>
          <Button disabled={busy} type="submit">
            {busy ? "Checking…" : "Validate network and contracts"}
          </Button>
        </form>
        {validated && (
          <div className="space-y-3 rounded-md border p-4 text-sm">
            <p>
              Verified Sepolia · ATT (6 decimals) · vault version{" "}
              {validated.manifest.vaultVersion}
            </p>
            <p className="break-all">
              Token: {validated.manifest.tokenAddress}
            </p>
            <p className="break-all">
              Vault: {validated.manifest.vaultAddress}
            </p>
            <p>
              No funds will be moved. The RPC stays private and is excluded from
              exports.
            </p>
            <Button
              disabled={busy}
              onClick={() => {
                void save()
              }}
            >
              Save this deployment
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button variant="outline" onClick={logout}>
          Log out / switch account
        </Button>
      </CardContent>
    </Card>
  )
}
