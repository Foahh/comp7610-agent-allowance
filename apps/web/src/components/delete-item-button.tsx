import { RiDeleteBinLine } from "@remixicon/react"
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
}: {
  name: string
  path: string
  description: string
  disabled?: boolean
  onDeleted?: () => void
}) {
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
            disabled={disabled || remove.isPending}
            aria-label={`Delete ${name}`}
            title={`Delete ${name}`}
          />
        }
      >
        <RiDeleteBinLine
          className="size-4 text-destructive"
          aria-hidden="true"
        />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <RequestState error={remove.error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(undefined)}
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
