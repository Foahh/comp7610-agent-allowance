import { createFileRoute } from "@tanstack/react-router"

import { ConnectionSettings } from "#/components/connection-settings"
import { DeploymentSettings } from "#/components/deployment-settings"
import { MarketplacePage, RequestState } from "#/components/marketplace-page"
import { ModelSettings } from "#/components/model-settings"
import { ProfileForm } from "#/components/profile-settings"
import { SellerOperations } from "#/components/seller-operations"
import { useMarketplace } from "#/hooks/use-marketplace"
export const Route = createFileRoute("/settings")({ component: SettingsPage })

function SettingsPage() {
  const profile = useMarketplace("seller/profile")
  const models = useMarketplace("seller/models")

  return (
    <MarketplacePage
      title="Settings"
      description="Configure your seller profile and private model connections."
    >
      <RequestState
        pending={profile.isFetching}
        error={profile.error || models.error}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <DeploymentSettings />
        <SellerOperations />
        <ConnectionSettings />
        {profile.data && (
          <ProfileForm
            key={JSON.stringify(profile.data)}
            profile={profile.data}
            models={models.data || []}
          />
        )}
        <ModelSettings models={models.data || []} />
      </div>
    </MarketplacePage>
  )
}
