import { RiWallet3Line } from "@remixicon/react"
import { useRef, useState, type RefObject } from "react"

import { Button } from "#/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { Spinner } from "#/components/ui/spinner"
import { useWorkspaceLayout } from "#/hooks/use-workspace-layout"

import { AllowancePanel } from "./allowance-panel.tsx"
import { useWorkspaceAssistant } from "./assistant-context"
import { ChatComposer } from "./chat-composer.tsx"
import { ConversationThread } from "./conversation-thread.tsx"
import { WalletControls } from "./wallet-controls.tsx"

export function AssistantWorkspace() {
  const assistant = useWorkspaceAssistant()
  const layout = useWorkspaceLayout()
  const [panel, setPanel] = useState<{
    layout: typeof layout
    open: "allowance" | null
  }>({ layout, open: null })
  const allowanceTrigger = useRef<HTMLButtonElement>(null)
  const { selected, details } = assistant
  const scenario = details?.conversation.scenario || "success"
  const amounts = useAllowanceAmounts(selected || scenario, scenario)
  if (panel.layout !== layout) {
    setPanel({ layout, open: null })
  }

  const allowance = <AllowanceControls amounts={amounts} />

  return (
    <main className="workspace app-surface">
      <section className="chat-workspace" aria-label="Assistant conversation">
        <WorkspaceHeader
          layout={layout}
          openPanel={panel.open}
          allowanceTrigger={allowanceTrigger}
          onOpen={(open) => setPanel({ layout, open })}
        />
        {assistant.loading && (
          <div
            className="workspace-notice flex items-center gap-2"
            role="status"
          >
            <Spinner /> Loading conversation
          </div>
        )}
        <div className="thread-region">
          <ConversationThread
            key={selected || "welcome"}
            assistant={assistant}
          />
        </div>
        <ChatComposer assistant={assistant} />
      </section>
      {layout === "desktop" && (
        <aside className="allowance-sidebar" aria-label="Wallet and allowance">
          <div className="panel-heading">
            <h2>Wallet & allowance</h2>
          </div>
          {allowance}
        </aside>
      )}
      {layout !== "desktop" && (
        <Sheet
          open={panel.open === "allowance"}
          onOpenChange={(open) =>
            setPanel({ layout, open: open ? "allowance" : null })
          }
        >
          <SheetContent
            id="allowance-panel"
            className="workspace-sheet app-surface"
            finalFocus={allowanceTrigger}
          >
            <SheetHeader>
              <SheetTitle>Wallet & allowance</SheetTitle>
            </SheetHeader>
            {allowance}
          </SheetContent>
        </Sheet>
      )}
    </main>
  )
}

function useAllowanceAmounts(scope: string, scenario: string) {
  const defaults = {
    scope,
    budget: scenario === "insufficient" ? "0.5" : "10",
    cap: scenario === "insufficient" ? "0.5" : "3",
  }
  const [amounts, setAmounts] = useState(defaults)
  // Reset on conversation changes, but retain edits across responsive panel mounts.
  if (amounts.scope !== scope) {
    setAmounts(defaults)
  }
  return {
    ...amounts,
    onBudgetChange: (budget: string) =>
      setAmounts((current) => ({ ...current, budget })),
    onCapChange: (cap: string) =>
      setAmounts((current) => ({ ...current, cap })),
  }
}

function AllowanceControls({
  amounts,
}: {
  amounts: ReturnType<typeof useAllowanceAmounts>
}) {
  const assistant = useWorkspaceAssistant()
  const { run, wallet, selected, details } = assistant
  return (
    <div className="allowance-content">
      <WalletControls assistant={assistant} />
      <AllowancePanel
        allowance={details?.allowance || null}
        connected={!!wallet && !!selected}
        busy={run.busy}
        budget={amounts.budget}
        cap={amounts.cap}
        onBudgetChange={amounts.onBudgetChange}
        onCapChange={amounts.onCapChange}
        onFund={assistant.fund}
        onAction={assistant.allowanceAction}
      />
      {!!assistant.purchases.length && (
        <Button
          variant="ghost"
          className="recovery-button"
          disabled={run.busy}
          onClick={assistant.recover}
        >
          Refresh pending purchases
        </Button>
      )}
    </div>
  )
}

function WorkspaceHeader({
  layout,
  openPanel,
  allowanceTrigger,
  onOpen,
}: {
  layout: ReturnType<typeof useWorkspaceLayout>
  openPanel: "allowance" | null
  allowanceTrigger: RefObject<HTMLButtonElement | null>
  onOpen: (panel: "allowance") => void
}) {
  const assistant = useWorkspaceAssistant()
  const { details } = assistant
  return (
    <header className="workspace-header">
      <div className="workspace-heading">
        <div className="workspace-title">
          <h1>{details?.conversation.title || "New conversation"}</h1>
        </div>
        {layout !== "desktop" && (
          <Button
            ref={allowanceTrigger}
            className="allowance-trigger"
            variant="outline"
            aria-haspopup="dialog"
            aria-expanded={openPanel === "allowance"}
            aria-controls={
              openPanel === "allowance" ? "allowance-panel" : undefined
            }
            onClick={() => onOpen("allowance")}
          >
            <RiWallet3Line />
            Allowance
          </Button>
        )}
      </div>
    </header>
  )
}
