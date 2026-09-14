import { RiMenuLine } from "@remixicon/react"
import { useRouterState } from "@tanstack/react-router"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { useWorkspaceLayout } from "#/hooks/use-workspace-layout"

import { ConversationSidebar } from "./conversation-sidebar"
import { Button } from "./ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet"

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const layout = useWorkspaceLayout()
  const [collapsed, setCollapsed] = useState(false)
  const [navigation, setNavigation] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const routeContent = useRef<HTMLDivElement>(null)
  useEffect(() => {
    routeContent.current?.scrollTo({ top: 0 })
  }, [path])
  const sidebar = (mobile: boolean) => (
    <ConversationSidebar
      collapsed={!mobile && collapsed}
      showConversations={path === "/"}
      onToggle={mobile ? undefined : () => setCollapsed(!collapsed)}
      onNavigate={() => setNavigation(false)}
    />
  )
  return (
    <div className="app-shell app-surface" data-collapsed={collapsed}>
      {layout === "mobile" ? (
        <>
          <header className="mobile-app-header">
            <Button
              ref={trigger}
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              aria-haspopup="dialog"
              aria-expanded={navigation}
              aria-controls={navigation ? "app-navigation" : undefined}
              onClick={() => setNavigation(true)}
            >
              <RiMenuLine />
            </Button>
            <strong>Mandate</strong>
          </header>
          <Sheet open={navigation} onOpenChange={setNavigation}>
            <SheetContent
              id="app-navigation"
              side="left"
              className="workspace-sheet app-surface"
              finalFocus={trigger}
            >
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              {sidebar(true)}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        sidebar(false)
      )}
      <div ref={routeContent} className="app-route">
        {children}
      </div>
    </div>
  )
}
