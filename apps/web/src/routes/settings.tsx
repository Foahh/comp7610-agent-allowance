import { createFileRoute } from "@tanstack/react-router"

import {
  ConnectionSettings,
  LocalInstances,
} from "#/components/connection-settings"
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
    <MarketplacePage title="Settings">
      <RequestState
        onRetry={
          profile.error
            ? () => {
                void profile.refetch()
              }
            : undefined
        }
        pending={profile.isPending}
        error={profile.error || models.error}
      />
      <div className="settings-grid">
        {profile.data && (
          <ProfileForm
            key={JSON.stringify(profile.data)}
            profile={profile.data}
            models={models.data || []}
          />
        )}
        <ModelSettings
          models={models.data || []}
          loading={models.isPending}
          error={models.error}
          onRetry={() => {
            void models.refetch()
          }}
        />
        <ConnectionSettings />
        <SellerOperations />
        <DeploymentSettings />
        <LocalInstances />
      </div>
    </MarketplacePage>
  )
}
