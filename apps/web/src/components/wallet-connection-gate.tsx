import type { RefObject } from "react"

import { RiWallet3Line } from "@remixicon/react"

import type { AssistantController } from "#/hooks/use-assistant"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"

import { WalletControls } from "./wallet-controls"

export function WalletConnectionGate({
  assistant,
  returnFocus,
}: {
  assistant: AssistantController
  returnFocus: RefObject<HTMLElement | null>
}) {
  const { wallet, run, config, error } = assistant
  const status = run.busy
    ? "Finish connecting and sign the sign-in request in your wallet."
    : config
      ? ""
      : "Waiting for the workspace configuration…"

  return (
    <Dialog open={!wallet} disablePointerDismissal>
      <DialogContent
        className="wallet-connection-gate app-surface"
        showCloseButton={false}
        finalFocus={returnFocus}
        data-connecting={run.busy}
      >
        <div className="wallet-connection-icon" aria-hidden="true">
          <RiWallet3Line />
        </div>
        <DialogHeader>
          <p className="eyebrow">Start here</p>
          <DialogTitle>Connect your wallet</DialogTitle>
          <DialogDescription>
            Connect to start a conversation.
          </DialogDescription>
        </DialogHeader>
        <WalletControls assistant={assistant} highlighted />
        <p
          id="wallet-connection-status"
          className="wallet-connection-status"
          role="status"
          hidden={!status}
        >
          {error && !config
            ? "Unable to load the workspace. Refresh the page to try again."
            : status}
        </p>
      </DialogContent>
    </Dialog>
  )
}
