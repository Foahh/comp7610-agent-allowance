import { RiArrowRightLine, RiWallet3Line } from "@remixicon/react"

import type { AssistantController } from "#/hooks/use-assistant"

import { Button } from "#/components/ui/button"
import { Spinner } from "#/components/ui/spinner"

export function WalletControls({
  assistant,
  highlighted = false,
}: {
  assistant: AssistantController
  highlighted?: boolean
}) {
  const { wallet, config, run } = assistant
  const Icon = highlighted ? RiArrowRightLine : RiWallet3Line
  const label = wallet
    ? `Switch ${wallet.account.address.slice(0, 6)}…${wallet.account.address.slice(-4)}`
    : "Connect wallet"

  return (
    <div className="wallet-controls" data-highlighted={highlighted}>
      {!highlighted && (
        <div className="wallet-heading">
          <span className="eyebrow">Wallet</span>
          <span className="wallet-status">
            {wallet ? "Connected" : "Not connected"}
          </span>
        </div>
      )}
      <Button
        variant={highlighted ? "default" : "outline"}
        disabled={run.busy || !config}
        onClick={assistant.connect}
        aria-describedby={highlighted ? "wallet-connection-status" : undefined}
      >
        {highlighted && run.busy ? (
          <Spinner />
        ) : (
          <Icon data-icon="inline-start" />
        )}
        {highlighted && run.busy ? "Connecting wallet…" : label}
      </Button>
      {!highlighted && !wallet && (
        <p className="wallet-description">
          Connect to start chatting. Fund an allowance when you need a
          specialist.
        </p>
      )}
    </div>
  )
}
