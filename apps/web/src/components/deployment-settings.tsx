import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { FieldGroup } from "#/components/ui/field"
import { requestJson } from "#/lib/client"

import { useWorkspaceAssistant } from "./assistant-context"
import { FileUploadField } from "./file-upload-field"
import { RequestState, TextField } from "./marketplace-page"
import { Button } from "./ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card"
import { NativeSelect, NativeSelectOption } from "./ui/native-select"

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
          {config?.configured ? "Network & contracts" : "Connect contracts"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {config?.restartRequired && (
          <p role="status" className="status-notice">
            RPC settings saved. Restart this instance to apply them to both
            buying and selling. The previous RPC remains active until then.
          </p>
        )}
        {config?.configured && (
          <div className="space-y-2 text-sm">
            <p className="break-all">Sepolia · Vault {config.vault}</p>
            <a className="underline" href="/api/setup/export">
              Export configuration
            </a>
          </div>
        )}
        {config?.configured && (
          <>
            <label className="grid gap-2">
              Active deployment
              <NativeSelect
                value={config?.activeDeployment || ""}
                disabled={busy}
                onChange={(event) => {
                  void select(event.target.value)
                }}
              >
                {config?.deployments.map((deployment) => (
                  <NativeSelectOption
                    key={deployment.vaultAddress}
                    value={deployment.vaultAddress.toLowerCase()}
                  >
                    Sepolia · {deployment.vaultAddress}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <p className="text-xs text-muted-foreground">
              History and funds stay with each deployment. Switch back to
              recover payments or withdraw funds.
            </p>
          </>
        )}
        <details className="detail-disclosure" open={!config?.configured}>
          <summary>
            {config?.configured
              ? "Edit network configuration"
              : "Network configuration"}
          </summary>
          <form
            className="space-y-4"
            onChange={() => setValidated(undefined)}
            onSubmit={(event) => {
              event.preventDefault()
              void validate(new FormData(event.currentTarget))
            }}
          >
            <FieldGroup>
              <FileUploadField
                label="Import deployment JSON"
                disabled={busy}
                accept="application/json,.json"
                onChange={(event) => {
                  void importManifest(event.currentTarget.files?.[0])
                }}
              />
              <TextField
                label="RPC URL"
                name="rpcUrl"
                required
                defaultValue="https://ethereum-sepolia-rpc.publicnode.com"
              />
              <TextField
                label="Token address"
                name="tokenAddress"
                required
                value={addresses.tokenAddress}
                onChange={(event) =>
                  setAddresses({
                    ...addresses,
                    tokenAddress: event.target.value,
                  })
                }
              />
              <TextField
                label="Vault address"
                name="vaultAddress"
                required
                value={addresses.vaultAddress}
                onChange={(event) =>
                  setAddresses({
                    ...addresses,
                    vaultAddress: event.target.value,
                  })
                }
              />
              <Button disabled={busy} type="submit">
                {busy ? "Checking…" : "Validate connection"}
              </Button>
            </FieldGroup>
          </form>
        </details>
        {validated && (
          <div className="space-y-3 border p-4 text-sm">
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
              {busy ? "Saving…" : "Save deployment"}
            </Button>
          </div>
        )}
        <RequestState error={error ? new Error(error) : undefined} />
        <Button variant="outline" onClick={logout}>
          Switch account
        </Button>
      </CardContent>
    </Card>
  )
}
