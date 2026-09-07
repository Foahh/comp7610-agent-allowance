import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { Spinner } from "#/components/ui/spinner"

import { AllowancePanel } from "./allowance-panel.tsx"
import { useWorkspaceAssistant } from "./assistant-context"
import { ChatComposer } from "./chat-composer.tsx"
import { ConversationSidebar } from "./conversation-sidebar"
import { ConversationThread } from "./conversation-thread.tsx"
import { ScenarioBar } from "./scenario-bar.tsx"
import { WalletControls } from "./wallet-controls.tsx"

export function AssistantWorkspace() {
  const assistant = useWorkspaceAssistant()
  const [collapsed, setCollapsed] = useState(false)
  const { run, wallet, selected, details } = assistant
  const scenario = details?.conversation.scenario || assistant.scenario

  return (
    <main className="workspace" data-sidebar-collapsed={collapsed}>
      <ConversationSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <section className="chat-workspace" aria-label="Assistant conversation">
        <ScenarioBar assistant={assistant} />
        {assistant.error && (
          <div className="px-5 py-2">
            <Alert variant="destructive">
              <AlertTitle>Action needs attention</AlertTitle>
              <AlertDescription>{assistant.error}</AlertDescription>
            </Alert>
          </div>
        )}
        {assistant.loading && (
          <div className="flex items-center gap-2 px-5 py-2" role="status">
            <Spinner />
            Loading conversation
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
      <aside className="allowance-sidebar">
        <WalletControls assistant={assistant} />
        <AllowancePanel
          key={selected || scenario}
          allowance={details?.allowance || null}
          connected={!!wallet && !!selected}
          busy={run.busy}
          initialBudget={scenario === "insufficient" ? "0.005" : "0.02"}
          initialCap={scenario === "insufficient" ? "0.005" : "0.01"}
          onFund={assistant.fund}
          onAction={assistant.allowanceAction}
        />
        {!!assistant.purchases.length && (
          <Button
            variant="ghost"
            disabled={run.busy}
            onClick={assistant.recover}
          >
            Refresh pending purchases
          </Button>
        )}
      </aside>
    </main>
  )
}
