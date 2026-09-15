import type { ModelConnection } from "@repo/schemas"

import { useState } from "react"

import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

import { DeleteItemButton } from "./delete-item-button"
import { EditorSheet } from "./editor-sheet"
import { RequestState } from "./marketplace-page"
import { ModelForm } from "./model-form"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
export function ModelSettings({
  models,
  loading,
  error,
  onRetry,
}: {
  models: ModelConnection[]
  loading?: boolean
  error?: Error | null
  onRetry?: () => void
}) {
  const [revision, setRevision] = useState(0)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ModelConnection | null>(null)
  const check = useMarketplaceAction((id: string) =>
    marketplaceRequest(`seller/models/${id}/check`, {})
  )

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>AI models</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {models.map((model) => (
            <div
              key={model.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <strong className="text-sm">{model.name}</strong>
                <p className="text-xs text-muted-foreground">{model.model}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(model)
                    setOpen(true)
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  disabled={check.isPending}
                  onClick={() => check.mutate(model.id)}
                >
                  {check.isPending ? "Testing…" : "Test connection"}
                </Button>
                <DeleteItemButton
                  name={model.name}
                  path={`seller/models/${model.id}`}
                  disabled={check.isPending}
                  description="This removes the saved connection and its API key. Models used by the buyer or a listing must be replaced before deletion."
                  onDeleted={() => {
                    if (selected?.id === model.id) {
                      setSelected(null)
                      setOpen(false)
                    }
                  }}
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => {
              setSelected(null)
              setOpen(true)
            }}
          >
            Add connection
          </Button>
          <RequestState
            pending={loading}
            onRetry={error ? onRetry : undefined}
            error={error || check.error}
            success={check.isSuccess ? "Connection verified." : undefined}
          />
        </CardContent>
      </Card>
      <EditorSheet
        open={open}
        onOpenChange={setOpen}
        title={selected ? "Edit connection" : "Add connection"}
      >
        <ModelForm
          key={`${selected?.id || "new"}:${revision}`}
          model={selected}
          onSaved={() => {
            setOpen(false)
            setSelected(null)
            setRevision((value) => value + 1)
          }}
        />
      </EditorSheet>
    </div>
  )
}
