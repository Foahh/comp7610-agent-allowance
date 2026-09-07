import { RiAddLine } from "@remixicon/react"

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { Spinner } from "#/components/ui/spinner"
import { useAssistant } from "#/hooks/use-assistant"

import { AllowancePanel } from "./allowance-panel.tsx"
import { ChatComposer } from "./chat-composer.tsx"
import { ConversationThread } from "./conversation-thread.tsx"
import { ScenarioBar } from "./scenario-bar.tsx"
import { WalletControls } from "./wallet-controls.tsx"
import { WorkspaceHeader } from "./workspace-header.tsx"

export function AssistantWorkspace() {
  const assistant = useAssistant()
  const { run, wallet, selected, details } = assistant
  const scenario = details?.conversation.scenario || assistant.scenario

  return (
    <main className="workspace">
      <aside className="conversation-sidebar">
        <div className="brand">
          <span className="brand-mark">a.</span>
          <span>Agent Spend Guard</span>
        </div>
        <p className="eyebrow">COMP7610 · agent to agent</p>
        <Button
          variant="outline"
          disabled={run.busy || !wallet}
          onClick={() => assistant.preset("success")}
        >
          <RiAddLine data-icon="inline-start" />
          New conversation
        </Button>
        <nav aria-label="Conversations" className="flex flex-col gap-2">
          {assistant.conversations.map((conversation) => (
            <Button
              key={conversation.id}
              variant={selected === conversation.id ? "secondary" : "ghost"}
              disabled={run.busy}
              onClick={() => assistant.select(conversation.id)}
            >
              <span className="truncate">{conversation.title}</span>
            </Button>
          ))}
        </nav>
        <div className="sidebar-note">
          <p>Delegate the work.</p>
          <p>Keep control of the spending.</p>
          <p className="text-sm text-muted-foreground">
            ATT is a demonstration token with no monetary value.
          </p>
        </div>
      </aside>
      <section className="chat-workspace" aria-label="Assistant conversation">
        <WorkspaceHeader />
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
        <div className="specialist-note">
          <p className="eyebrow">Available specialist</p>
          <h2>Exchange Evidence</h2>
          <p className="text-sm text-muted-foreground">
            Analysis · 0.01 ATT
            <br />
            Recommendation brief · 0.005 ATT
          </p>
          <p className="text-sm text-muted-foreground">
            A separate agent interprets the brief, quotes the work, and delivers
            cited results.
          </p>
        </div>
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
