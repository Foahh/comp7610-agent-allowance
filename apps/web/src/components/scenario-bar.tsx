import type { AssistantController } from "#/hooks/use-assistant"

import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group"

export function ScenarioBar({ assistant }: { assistant: AssistantController }) {
  const scenario =
    assistant.details?.conversation.scenario ?? assistant.scenario

  return (
    <div className="demo-bar">
      <ToggleGroup
        aria-label="Try a scenario"
        multiple={false}
        className="flex-wrap"
        value={[scenario]}
        disabled={assistant.run.busy}
        onValueChange={([value]) => {
          if (value === "success" || value === "insufficient") {
            assistant.preset(value)
          }
        }}
      >
        <ToggleGroupItem value="success">Complete task</ToggleGroupItem>
        <ToggleGroupItem value="insufficient">Budget limit</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
