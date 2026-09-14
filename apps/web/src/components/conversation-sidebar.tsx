import { RiAddLine, RiLayoutLeftLine, RiDeleteBinLine } from "@remixicon/react"
import { Link } from "@tanstack/react-router"

import { Button } from "#/components/ui/button"
import { marketplaceNavigation } from "#/lib/navigation"

import { useWorkspaceAssistant } from "./assistant-context"

type Props = {
  showConversations?: boolean
  collapsed: boolean
  onToggle?: () => void
  onNavigate?: () => void
}

export function ConversationSidebar({
  collapsed,
  showConversations = true,
  onToggle,
  onNavigate,
}: Props) {
  const assistant = useWorkspaceAssistant()
  const { run, wallet, selected } = assistant
  return (
    <aside
      className="conversation-sidebar"
      data-collapsed={collapsed}
      aria-label="Application sidebar"
    >
      <div className="sidebar-heading">
        <div className="brand" hidden={collapsed}>
          <span className="brand-copy">
            <span className="eyebrow">COMP7610</span>
            <strong>Mandate</strong>
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
      <nav className="flex flex-col gap-1" aria-label="Application">
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
                activeProps={{ "aria-current": "page" }}
                activeOptions={{ exact: true }}
                onClick={onNavigate}
              />
            }
            variant="ghost"
            size={collapsed ? "icon" : "default"}
          >
            <item.icon />
            {!collapsed && item.label}
          </Button>
        ))}
      </nav>
      {showConversations && (
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
      )}
      <nav
        id="conversation-navigation"
        hidden={collapsed || !showConversations}
        aria-label="Conversations"
        className="conversation-navigation"
      >
        <p className="eyebrow">Conversations</p>
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
    </aside>
  )
}
