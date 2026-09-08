import type { Address } from "viem"

import { Link } from "@tanstack/react-router"

import { useWorkspaceAssistant } from "#/components/assistant-context"
import { RequestState } from "#/components/marketplace-page"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Checkbox } from "#/components/ui/checkbox"
import { Field, FieldLabel } from "#/components/ui/field"
import { useMarketplace } from "#/hooks/use-marketplace"

export function AllowanceSellers() {
  const assistant = useWorkspaceAssistant()
  const connections = useMarketplace("connections")
  const allowance = assistant.details?.allowance
  const locked = !!allowance && !allowance.revoked
  const selected = locked ? allowance.sellers : assistant.approvedSellers
  const selectedAddresses = new Set(selected)
  const sellers = new Map<
    string,
    NonNullable<typeof connections.data>[number]["identity"]
  >()

  for (const connection of connections.data || []) {
    if (connection.enabled && connection.status === "online") {
      sellers.set(
        connection.identity.address.toLowerCase(),
        connection.identity
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approved sellers</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {locked
            ? "This seller set is fixed until you revoke and replace the allowance."
            : "Choose up to 16 sellers to include in the next wallet authorization."}
        </p>
        <RequestState
          pending={connections.isFetching}
          error={connections.error}
        />
        {locked
          ? selected.map((address) => (
              <p key={address} className="text-xs break-all">
                {sellers.get(address.toLowerCase())?.name || address}
              </p>
            ))
          : [...sellers.values()].map((seller) => (
              <Field key={seller.address} orientation="horizontal">
                <Checkbox
                  id={`allowance-${seller.address}`}
                  checked={selectedAddresses.has(seller.address as Address)}
                  disabled={assistant.run.busy}
                  onCheckedChange={(checked) =>
                    assistant.setApprovedSellers(
                      checked
                        ? [
                            ...assistant.approvedSellers,
                            seller.address as Address,
                          ]
                        : assistant.approvedSellers.filter(
                            (address) => address !== seller.address
                          )
                    )
                  }
                />
                <FieldLabel htmlFor={`allowance-${seller.address}`}>
                  {seller.name}
                </FieldLabel>
              </Field>
            ))}
        {!locked && sellers.size === 0 && (
          <Link className="text-sm underline" to="/sellers">
            Connect a seller first
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
