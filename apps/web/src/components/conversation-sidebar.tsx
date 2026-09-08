import {
  RiAddLine,
  RiLayoutLeftLine,
  RiTeamLine,
  RiDeleteBinLine,
} from "@remixicon/react"
import { Link } from "@tanstack/react-router"

import { Button } from "#/components/ui/button"
import { marketplaceNavigation } from "#/lib/navigation"

import { useWorkspaceAssistant } from "./assistant-context"

type Props = {
  collapsed: boolean
  onToggle?: () => void
  onNavigate?: () => void
}

export function ConversationSidebar({
  collapsed,
  onToggle,
  onNavigate,
}: Props) {
  const assistant = useWorkspaceAssistant()
  const { run, wallet, selected } = assistant
  return (
    <aside
      className="conversation-sidebar"
      data-collapsed={collapsed}
      aria-label="Conversation navigation"
    >
      <div className="sidebar-heading">
        <div className="brand" hidden={collapsed}>
          <span className="brand-copy">
            <span className="eyebrow">COMP7610</span>
            <strong>Agent Spend</strong>
          </span>
        </div>
        {onToggle && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="conversation-navigation"
            onClick={onToggle}
          >
            <RiLayoutLeftLine />
          </Button>
        )}
      </div>
      <Button
        variant="outline"
        size={collapsed ? "icon" : "default"}
        aria-label="New conversation"
        title="New conversation"
        disabled={run.busy || !wallet}
        onClick={() => {
          assistant.preset("success")
          onNavigate?.()
        }}
      >
        <RiAddLine data-icon="inline-start" />
        {!collapsed && "New conversation"}
      </Button>
      <nav
        id="conversation-navigation"
        hidden={collapsed}
        aria-label="Conversations"
        className="conversation-navigation"
      >
        <p className="eyebrow">Conversations</p>
        {assistant.conversations.length === 0 && (
          <p className="sidebar-empty">
            {wallet
              ? "Your conversations will appear here."
              : "Connect your wallet to start a conversation."}
          </p>
        )}
        {assistant.conversations.map((conversation) => (
          <div key={conversation.id} className="conversation-row">
            <Button
              className="conversation-select"
              variant={selected === conversation.id ? "secondary" : "ghost"}
              disabled={run.busy}
              aria-current={selected === conversation.id ? "true" : undefined}
              onClick={() => {
                assistant.select(conversation.id)
                onNavigate?.()
              }}
            >
              <span className="truncate">{conversation.title}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="conversation-delete"
              aria-label={`Delete conversation: ${conversation.title}`}
              title="Delete conversation"
              disabled={run.busy}
              onClick={() => assistant.removeConversation(conversation.id)}
            >
              <RiDeleteBinLine />
            </Button>
          </div>
        ))}
      </nav>
      <nav className="mt-auto flex flex-col gap-1" aria-label="Marketplace">
        {marketplaceNavigation.map((item) => (
          <Button
            key={item.to}
            nativeButton={false}
            role="link"
            render={
              <Link
                to={item.to}
                aria-label={item.label}
                title={item.label}
                onClick={onNavigate}
              />
            }
            variant="ghost"
            size={collapsed ? "icon" : "default"}
          >
            <RiTeamLine />
            {!collapsed && item.label}
          </Button>
        ))}
      </nav>
    </aside>
  )
}
