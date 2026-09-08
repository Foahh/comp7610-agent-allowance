import { RiArrowRightLine, RiWallet3Line } from "@remixicon/react"

import { AssistantNotifications } from "./assistant-notifications"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog"
import { Spinner } from "./ui/spinner"

export function WalletConnectionGate({
  busy,
  configured,
  error,
  onConnect,
}: {
  busy: boolean
  configured: boolean
  error: string
  onConnect: () => void
}) {
  return (
    <>
      <AssistantNotifications error={error || undefined} />
      <div className="signin-shell app-surface" inert aria-hidden="true">
        <aside>
          <strong>Agent Spend</strong>
          <div className="signin-placeholder" />
          <div className="signin-placeholder" />
        </aside>
        <div className="signin-canvas">
          <div className="signin-placeholder" />
          <div className="signin-composer" />
        </div>
        <aside>
          <strong>Wallet & allowance</strong>
          <div className="signin-placeholder" />
        </aside>
      </div>
      <Dialog open disablePointerDismissal>
        <DialogContent
          className="wallet-connection-gate app-surface"
          showCloseButton={false}
          data-connecting={busy}
        >
          <div className="wallet-connection-icon" aria-hidden="true">
            <RiWallet3Line />
          </div>
          <DialogHeader>
            <DialogTitle>Connect your wallet</DialogTitle>
            <DialogDescription>
              Connect to start a conversation.
            </DialogDescription>
          </DialogHeader>
          <Button
            className="connect-primary"
            disabled={busy || !configured}
            onClick={() => {
              onConnect()
            }}
          >
            {busy ? <Spinner /> : <RiArrowRightLine />}
            {busy ? "Connecting…" : "Connect wallet"}
          </Button>
          {!busy && !configured && error && (
            <Button variant="outline" onClick={() => location.reload()}>
              Retry connection
            </Button>
          )}
          {busy && (
            <p role="status" className="wallet-connection-status">
              {configured
                ? "Confirm the sign-in request in your wallet."
                : "Loading workspace…"}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
