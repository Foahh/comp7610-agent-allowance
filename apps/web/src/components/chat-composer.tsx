import { RiArrowUpLine } from "@remixicon/react"
import type { AssistantController } from "#/hooks/use-assistant"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "#/components/ui/input-group"
import { Spinner } from "#/components/ui/spinner"

export function ChatComposer({
  assistant,
}: {
  assistant: AssistantController
}) {
  const { wallet, run } = assistant
  const canSend = wallet !== null && !run.busy && assistant.draft.trim() !== ""

  function sendMessage() {
    if (canSend) {
      assistant.send()
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        sendMessage()
      }}
    >
      <InputGroup>
        <InputGroupTextarea
          aria-label="Message your assistant"
          placeholder="Give your assistant a task…"
          value={assistant.draft}
          disabled={run.busy}
          onChange={(event) => assistant.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              sendMessage()
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <span className="text-sm text-muted-foreground">
            Purchases require an active allowance.
          </span>
          <InputGroupButton
            type="submit"
            aria-label="Send message"
            disabled={!canSend}
            className="ml-auto"
          >
            {run.busy ? (
              <Spinner />
            ) : (
              <RiArrowUpLine data-icon="inline-start" />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p className="text-xs text-muted-foreground">
        Synthetic city data for teaching. Payment receipts do not guarantee
        service quality.
      </p>
    </form>
  )
}
