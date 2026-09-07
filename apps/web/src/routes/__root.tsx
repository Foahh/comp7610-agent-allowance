import type { QueryClient } from "@tanstack/react-query"

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import { AssistantContext } from "#/components/assistant-context"
import { useAssistant } from "#/hooks/use-assistant"

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  const assistant = useAssistant()
  return (
    <AssistantContext value={assistant}>
      <Outlet />
    </AssistantContext>
  )
}
