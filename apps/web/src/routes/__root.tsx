import type { QueryClient } from "@tanstack/react-query"

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import type { ConnectedWallet } from "#/lib/wallet"

import { AccountEntry } from "#/components/account-entry"
import { AppShell } from "#/components/app-shell"
import { AssistantContext } from "#/components/assistant-context"
import { GlobalToaster } from "#/components/assistant-notifications"
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
    <>
      <GlobalToaster />
      <AccountEntry>
        {(wallet, logout) => (
          <Workspace
            key={wallet.account.address}
            wallet={wallet}
            logout={logout}
          />
        )}
      </AccountEntry>
    </>
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
        <main className="setup-page app-surface">
          <DeploymentSettings />
        </main>
      ) : assistant.config ? (
        <AppShell>
          <Outlet />
        </AppShell>
      ) : (
        <p role="status" className="p-6">
          Loading your workspace…
        </p>
      )}
    </AssistantContext>
  )
}
