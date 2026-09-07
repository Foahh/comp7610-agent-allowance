import { RiArrowUpLine, RiWallet3Line } from "@remixicon/react"
import type { AssistantController } from "#/hooks/use-assistant"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from "#/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group"
import { Spinner } from "#/components/ui/spinner"

export function WorkspaceHeader({
  assistant,
}: {
  assistant: AssistantController
}) {
  const network =
    assistant.config?.chainId === 11155111 ? "Sepolia" : "Local chain"
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

export function ScenarioBar({ assistant }: { assistant: AssistantController }) {
  const scenario =
    assistant.details?.conversation.scenario || assistant.scenario
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

export function WalletControls({
  assistant,
}: {
  assistant: AssistantController
}) {
  const { wallet, config, run } = assistant
  const label = wallet
    ? wallet.account.address.slice(0, 6) +
      "…" +
      wallet.account.address.slice(-4)
    : "Connect wallet"
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        disabled={run.busy || !config}
        onClick={() => assistant.connect()}
      >
        <RiWallet3Line data-icon="inline-start" />
        {label}
      </Button>
    </div>
  )
}

export function ChatComposer({
  assistant,
}: {
  assistant: AssistantController
}) {
  const { wallet, run } = assistant
  const canSend = !!wallet && !run.busy && !!assistant.draft.trim()
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSend) {
          assistant.send()
        }
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
              if (canSend) {
                assistant.send()
              }
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
