import { RiMenuLine, RiWallet3Line } from "@remixicon/react"
import { useRef, useState, type RefObject } from "react"

import { Button } from "#/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "#/components/ui/sheet"
import { Spinner } from "#/components/ui/spinner"
import { useWorkspaceLayout } from "#/hooks/use-workspace-layout"

import { AllowancePanel } from "./allowance-panel.tsx"
import { AllowanceSellers } from "./allowance-sellers.tsx"
import { useWorkspaceAssistant } from "./assistant-context"
import { ChatComposer } from "./chat-composer.tsx"
import { ConversationSidebar } from "./conversation-sidebar"
import { ConversationThread } from "./conversation-thread.tsx"
import { WalletConnectionGate } from "./wallet-connection-gate"
import { WalletControls } from "./wallet-controls.tsx"

export function AssistantWorkspace() {
  const assistant = useWorkspaceAssistant()
  const layout = useWorkspaceLayout()
  const [collapsed, setCollapsed] = useState(false)
  const [panel, setPanel] = useState<{
    layout: typeof layout
    open: "navigation" | "allowance" | null
  }>({ layout, open: null })
  const navigationTrigger = useRef<HTMLButtonElement>(null)
  const allowanceTrigger = useRef<HTMLButtonElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const { selected, details } = assistant
  const scenario = details?.conversation.scenario || assistant.scenario
  const amounts = useAllowanceAmounts(selected || scenario, scenario)
  if (panel.layout !== layout) {
    setPanel({ layout, open: null })
  }

  function closePanel() {
    setPanel({ layout, open: null })
  }

  const allowance = <AllowanceControls amounts={amounts} />

  return (
    <main
      ref={workspaceRef}
      tabIndex={-1}
      className="workspace app-surface"
      data-sidebar-collapsed={collapsed}
      data-wallet-required={!assistant.wallet}
      inert={!assistant.wallet}
    >
      <WalletConnectionGate assistant={assistant} returnFocus={workspaceRef} />
      {layout !== "mobile" && (
        <ConversationSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      )}
      <section className="chat-workspace" aria-label="Assistant conversation">
        <WorkspaceHeader
          layout={layout}
          openPanel={panel.open}
          navigationTrigger={navigationTrigger}
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
            <p className="eyebrow">Spending controls</p>
            <h2>Wallet & allowance</h2>
          </div>
          {allowance}
        </aside>
      )}
      {layout === "mobile" && (
        <Sheet
          open={panel.open === "navigation"}
          onOpenChange={(open) =>
            setPanel({ layout, open: open ? "navigation" : null })
          }
        >
          <SheetContent
            id="navigation-panel"
            side="left"
            className="workspace-sheet app-surface"
            finalFocus={navigationTrigger}
          >
            <SheetHeader>
              <SheetTitle>Conversations</SheetTitle>
              <SheetDescription>
                Your assistant workspace and history.
              </SheetDescription>
            </SheetHeader>
            <ConversationSidebar collapsed={false} onNavigate={closePanel} />
          </SheetContent>
        </Sheet>
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
              <SheetDescription>
                Manage spending for this conversation.
              </SheetDescription>
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
    budget: scenario === "insufficient" ? "0.005" : "0.02",
    cap: scenario === "insufficient" ? "0.005" : "0.01",
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
      <AllowanceSellers />
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
  navigationTrigger,
  allowanceTrigger,
  onOpen,
}: {
  layout: ReturnType<typeof useWorkspaceLayout>
  openPanel: "navigation" | "allowance" | null
  navigationTrigger: RefObject<HTMLButtonElement | null>
  allowanceTrigger: RefObject<HTMLButtonElement | null>
  onOpen: (panel: "navigation" | "allowance") => void
}) {
  const assistant = useWorkspaceAssistant()
  const { details } = assistant
  return (
    <header className="workspace-header">
      <div className="workspace-heading">
        {layout === "mobile" && (
          <Button
            ref={navigationTrigger}
            variant="ghost"
            size="icon"
            aria-label="Open conversations"
            aria-haspopup="dialog"
            aria-expanded={openPanel === "navigation"}
            aria-controls={
              openPanel === "navigation" ? "navigation-panel" : undefined
            }
            onClick={() => onOpen("navigation")}
          >
            <RiMenuLine />
          </Button>
        )}
        <div className="workspace-title">
          <p className="eyebrow">Assistant</p>
          <h1>{details?.conversation.title || "Your workspace"}</h1>
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
