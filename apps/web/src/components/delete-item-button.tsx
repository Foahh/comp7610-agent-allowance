import { RiDeleteBinLine, RiEyeOffLine } from "@remixicon/react"
import { useState } from "react"

import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"

import { RequestState } from "./marketplace-page"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog"
import { Button } from "./ui/button"

export function DeleteItemButton({
  name,
  path,
  description,
  disabled,
  onDeleted,
  action = "delete",
  className,
}: {
  name: string
  path: string
  description: string
  disabled?: boolean
  onDeleted?: () => void
  action?: "delete" | "hide"
  className?: string
}) {
  const hide = action === "hide"
  const label = hide ? "Hide" : "Delete"
  const Icon = hide ? RiEyeOffLine : RiDeleteBinLine
  const [open, setOpen] = useState(false)
  const remove = useMarketplaceAction(async () => {
    await marketplaceRequest(path, undefined, "DELETE")
    setOpen(false)
    onDeleted?.()
  })

  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!remove.isPending) {
          setOpen(value)
          remove.reset()
        }
      }}
    >
      <AlertDialogTrigger
        // Keep the button slot so app-surface sizing matches adjacent actions.
        data-slot="button"
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={
              className ??
              (hide
                ? "text-muted-foreground hover:text-foreground"
                : "text-destructive")
            }
            disabled={disabled || remove.isPending}
            aria-label={`${label} ${name}`}
            title={`${label} ${name}`}
          />
        }
      >
        <Icon className="size-4" aria-hidden="true" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {label} {name}?
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <RequestState error={remove.error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant={hide ? "default" : "destructive"}
            disabled={remove.isPending}
            onClick={() => remove.mutate(undefined)}
          >
            {remove.isPending ? (hide ? "Hiding…" : "Deleting…") : label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
