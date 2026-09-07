import { RiWallet3Line } from "@remixicon/react"

import type { AssistantController } from "#/hooks/use-assistant"

import { Button } from "#/components/ui/button"

export function WalletControls({
  assistant,
}: {
  assistant: AssistantController
}) {
  const { wallet, config, run } = assistant
  const label = wallet
    ? `${wallet.account.address.slice(0, 6)}…${wallet.account.address.slice(-4)}`
    : "Connect wallet"

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        disabled={run.busy || !config}
        onClick={assistant.connect}
      >
        <RiWallet3Line data-icon="inline-start" />
        {label}
      </Button>
    </div>
  )
}
