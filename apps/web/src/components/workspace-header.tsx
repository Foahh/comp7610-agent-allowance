import type { AssistantController } from "#/hooks/use-assistant"
import { Badge } from "#/components/ui/badge"
import { SEPOLIA_CHAIN_ID } from "@repo/utils"

export function WorkspaceHeader({
  assistant,
}: {
  assistant: AssistantController
}) {
  const network =
    assistant.config?.chainId === SEPOLIA_CHAIN_ID ? "Sepolia" : "Local chain"

  return (
    <header className="chat-header">
      <div>
        <h1>Your assistant</h1>
        <p className="text-sm text-muted-foreground">
          Evidence, ideas, and a budget you control.
        </p>
      </div>
      <Badge variant="outline">{network}</Badge>
    </header>
  )
}
