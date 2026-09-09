import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

import { RequestState } from "./marketplace-page"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu"

export function ListingTemplates() {
  const template = useMarketplaceAction((type: string) =>
    marketplaceRequest(`seller/templates/${type}`, {})
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-slot="button"
          render={<Button variant="outline" disabled={template.isPending} />}
        >
          {template.isPending ? "Creating…" : "Use template"}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="app-surface">
          <DropdownMenuItem onClick={() => template.mutate("analysis")}>
            Analysis service
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => template.mutate("writing")}>
            Writing service
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RequestState
        error={template.error}
        success={template.isSuccess ? "Template created." : undefined}
      />
    </>
  )
}
