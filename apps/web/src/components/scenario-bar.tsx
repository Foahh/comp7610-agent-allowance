import type { AssistantController } from "#/hooks/use-assistant"

import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group"

export function ScenarioBar({ assistant }: { assistant: AssistantController }) {
  const scenario =
    assistant.details?.conversation.scenario ?? assistant.scenario

  return (
    <div className="demo-bar">
      <ToggleGroup
        aria-label="Example tasks"
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
        <ToggleGroupItem value="success">Exchange semester</ToggleGroupItem>
        <ToggleGroupItem value="insufficient">
          Budget limit example
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
