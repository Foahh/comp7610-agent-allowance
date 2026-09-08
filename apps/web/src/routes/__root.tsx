import type { QueryClient } from "@tanstack/react-query"

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import type { ConnectedWallet } from "#/lib/wallet"

import { AccountEntry } from "#/components/account-entry"
import { AssistantContext } from "#/components/assistant-context"
import { AssistantNotifications } from "#/components/assistant-notifications"
import { DeploymentSettings } from "#/components/deployment-settings"
import { useAssistant } from "#/hooks/use-assistant"

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return (
    <AccountEntry>
      {(wallet, logout) => (
        <Workspace
          key={wallet.account.address}
          wallet={wallet}
          logout={logout}
        />
      )}
    </AccountEntry>
  )
}

function Workspace({
  wallet,
  logout,
}: {
  wallet: ConnectedWallet
  logout: () => void
}) {
  const assistant = useAssistant(wallet, logout)
  return (
    <AssistantContext value={assistant}>
      <AssistantNotifications error={assistant.error} />
      {assistant.config?.configured === false ? (
        <main className="mx-auto max-w-2xl p-6">
          <DeploymentSettings />
        </main>
      ) : assistant.config ? (
        <Outlet />
      ) : (
        <p role="status" className="p-6">
          Loading your workspace…
        </p>
      )}
    </AssistantContext>
  )
}
