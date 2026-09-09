import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { Toaster } from "#/components/ui/sonner"

const errorToastId = "assistant-error"

export function AssistantNotifications({ error }: { error?: string }) {
  const previousError = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (previousError.current === error) {
      return
    }
    previousError.current = error
    if (error) {
      toast.error(error, { id: errorToastId })
    } else {
      toast.dismiss(errorToastId)
    }
  }, [error])

  return null
}

export function GlobalToaster() {
  return (
    <Toaster
      theme="light"
      className="toaster app-toaster group"
      position="top-right"
      duration={8000}
      closeButton
      offset={24}
      mobileOffset={16}
    />
  )
}
