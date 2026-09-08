import { RiWallet3Line } from "@remixicon/react"

import type { AssistantController } from "#/hooks/use-assistant"

import { Button } from "#/components/ui/button"

export function WalletControls({
  assistant,
}: {
  assistant: AssistantController
}) {
  const { wallet, config, run } = assistant
  const address = wallet.account.address
  return (
    <div className="wallet-controls wallet-card">
      <div className="wallet-heading">
        <span className="eyebrow">Wallet</span>
        <span className="wallet-status">Connected</span>
      </div>
      <Button
        variant="outline"
        disabled={run.busy || !config}
        onClick={assistant.connect}
        aria-label={`Switch wallet ${address}`}
      >
        <RiWallet3Line />
        <span>{`${address.slice(0, 6)}…${address.slice(-4)}`}</span>
      </Button>
    </div>
  )
}
