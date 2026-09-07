import {
  RiAddLine,
  RiLayoutLeftLine,
  RiTeamLine,
  RiDeleteBinLine,
} from "@remixicon/react"
import { Link } from "@tanstack/react-router"

import { Button } from "#/components/ui/button"

import { useWorkspaceAssistant } from "./assistant-context"

type Props = { collapsed: boolean; onToggle: () => void }

export function ConversationSidebar({ collapsed, onToggle }: Props) {
  const assistant = useWorkspaceAssistant()
  const { run, wallet, selected } = assistant
  return (
    <aside className="conversation-sidebar">
      <div className="sidebar-heading">
        <div className="brand" hidden={collapsed}>
          <span className="brand-copy">
            <span className="eyebrow">COMP7610</span>
            <strong>Agent Spend</strong>
          </span>
        </div>
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
      </div>
      <Button
        variant="outline"
        size={collapsed ? "icon" : "default"}
        aria-label="New conversation"
        title="New conversation"
        disabled={run.busy || !wallet}
        onClick={() => assistant.preset("success")}
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
        {assistant.conversations.map((conversation) => (
          <div key={conversation.id} className="conversation-row">
            <Button
              className="conversation-select"
              variant={selected === conversation.id ? "secondary" : "ghost"}
              disabled={run.busy}
              onClick={() => assistant.select(conversation.id)}
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
      <Button
        asChild
        variant="ghost"
        size={collapsed ? "icon" : "default"}
        className="mt-auto"
      >
        <Link to="/providers" aria-label="Providers" title="Providers">
          <RiTeamLine />
          {!collapsed && "Providers"}
        </Link>
      </Button>
    </aside>
  )
}
