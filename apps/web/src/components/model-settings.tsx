import type { ModelConnection } from "@repo/schemas"

import { useState } from "react"

import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

import { RequestState } from "./marketplace-page"
import { ModelForm } from "./model-form"
import { Button } from "./ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./ui/card"
export function ModelSettings({ models }: { models: ModelConnection[] }) {
  const [selected, setSelected] = useState<ModelConnection | null>(null)
  const check = useMarketplaceAction((id: string) =>
    marketplaceRequest(`seller/models/${id}/check`, {})
  )

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Model connections</CardTitle>
          <CardDescription>
            API keys stay private. Connection checks invoke the selected model.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {models.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Add a connection to enable chat or AI services. Static items do
              not need a model.
            </p>
          )}
          {models.map((model) => (
            <div
              key={model.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <strong className="text-sm">{model.name}</strong>
                <p className="text-xs text-muted-foreground">
                  {model.model} · key saved
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelected(model)}>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  disabled={check.isPending}
                  onClick={() => check.mutate(model.id)}
                >
                  Check connection
                </Button>
              </div>
            </div>
          ))}
          <RequestState
            pending={check.isPending}
            error={check.error}
            success={
              check.isSuccess
                ? "Streaming, tool calls, and structured output passed."
                : undefined
            }
          />
        </CardContent>
      </Card>
      <ModelForm
        key={selected?.id || "new"}
        model={selected}
        onSaved={() => setSelected(null)}
      />
    </div>
  )
}
