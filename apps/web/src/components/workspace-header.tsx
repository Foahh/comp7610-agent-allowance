import { Badge } from "#/components/ui/badge"

export function WorkspaceHeader() {
  return (
    <header className="chat-header">
      <div>
        <h1>Your assistant</h1>
        <p className="text-sm text-muted-foreground">
          Evidence, ideas, and a budget you control.
        </p>
      </div>
      <Badge variant="outline">Sepolia</Badge>
    </header>
  )
}
