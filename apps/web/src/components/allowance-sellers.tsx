import type { SellerConnection } from "@repo/schemas"
import type { Address } from "viem"

import { Link } from "@tanstack/react-router"

import { useWorkspaceAssistant } from "#/components/assistant-context"
import { RequestState } from "#/components/marketplace-page"
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
  const sellers = getOnlineSellers(connections.data)

  return (
    <section className="allowance-sellers" aria-label="Approved sellers">
      <div className="section-heading">
        <h3>Approved sellers</h3>
        <span className="text-xs text-muted-foreground">
          {selected.length} selected
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {!locked && (
          <p className="text-xs text-muted-foreground">
            Select up to 16 sellers.
          </p>
        )}
        <RequestState
          onRetry={
            connections.error
              ? () => {
                  void connections.refetch()
                }
              : undefined
          }
          pending={connections.isPending}
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
        {!locked &&
          !connections.isPending &&
          !connections.error &&
          sellers.size === 0 && (
            <Link className="text-sm underline" to="/sellers">
              Connect a seller first
            </Link>
          )}
        {locked && selected.length === 0 && (
          <p className="text-sm text-muted-foreground">No approved sellers.</p>
        )}
      </div>
    </section>
  )
}

function getOnlineSellers(connections: SellerConnection[] = []) {
  const sellers = new Map<string, SellerConnection["identity"]>()
  for (const connection of connections) {
    if (connection.enabled && connection.status === "online") {
      sellers.set(
        connection.identity.address.toLowerCase(),
        connection.identity
      )
    }
  }
  return sellers
}
