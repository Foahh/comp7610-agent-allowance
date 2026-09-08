import type { AssistantController } from "#/hooks/use-assistant"

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "#/components/ai-elements/prompt-input"

export function ChatComposer({
  assistant,
}: {
  assistant: AssistantController
}) {
  const { wallet, run } = assistant
  const guidance = !wallet
    ? "Connect your wallet to send a message."
    : undefined
  const canSend = wallet !== null && !run.busy && assistant.draft.trim() !== ""

  function sendMessage() {
    if (canSend) {
      assistant.send()
    }
  }

  return (
    <div className="composer">
      <PromptInput
        onSubmit={sendMessage}
        onSubmitCapture={(event) => {
          if (!canSend) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message your assistant"
            aria-describedby={guidance ? "composer-guidance" : undefined}
            placeholder="Give your assistant a task…"
            value={assistant.draft}
            disabled={run.busy}
            onChange={(event) => assistant.setDraft(event.target.value)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          {guidance && (
            <span id="composer-guidance" className="composer-guidance">
              {guidance}
            </span>
          )}
          <PromptInputSubmit
            aria-label={run.busy ? "Sending message" : "Send message"}
            status={run.busy ? "submitted" : "ready"}
            disabled={!canSend}
            className="ml-auto"
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
