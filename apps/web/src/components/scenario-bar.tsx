import type { AssistantController } from "#/hooks/use-assistant"

import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group"

export function ScenarioBar({ assistant }: { assistant: AssistantController }) {
  const scenario =
    assistant.details?.conversation.scenario ?? assistant.scenario

  return (
    <div className="demo-bar">
      <span className="text-sm text-muted-foreground">Try a scenario</span>
      <ToggleGroup
        type="single"
        className="flex-wrap"
        value={scenario}
        disabled={assistant.run.busy}
        onValueChange={(value) => {
          if (value) {
            assistant.preset(value as typeof scenario)
          }
        }}
      >
        <ToggleGroupItem value="success">Complete task</ToggleGroupItem>
        <ToggleGroupItem value="insufficient">Budget limit</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
