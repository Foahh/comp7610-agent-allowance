"use client"

// Adapted from Vercel AI Elements for this app's text-only assistant protocol.
import type { ChatStatus } from "ai"
import type { ComponentProps, FormEvent, HTMLAttributes } from "react"

import { CornerDownLeftIcon, SquareIcon, XIcon } from "lucide-react"
import { useCallback, useRef } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "#/components/ui/input-group"
import { Spinner } from "#/components/ui/spinner"
import { cn } from "#/lib/utils"

export type PromptInputMessage = { text: string }

export type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => void | Promise<void>
}

export const PromptInput = ({
  className,
  children,
  onSubmit,
  ...props
}: PromptInputProps) => (
  <form
    className={cn("w-full", className)}
    onSubmit={(event) => {
      event.preventDefault()
      const value = new FormData(event.currentTarget).get("message")
      const text = typeof value === "string" ? value : ""
      void onSubmit({ text }, event)
    }}
    {...props}
  >
    <InputGroup className="overflow-hidden">{children}</InputGroup>
  </form>
)

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>
export const PromptInputBody = ({
  className,
  ...props
}: PromptInputBodyProps) => (
  <div className={cn("contents", className)} {...props} />
)

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>
export const PromptInputTextarea = ({
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  className,
  placeholder = "What would you like to know?",
  ...props
}: PromptInputTextareaProps) => {
  const isComposing = useRef(false)
  return (
    <InputGroupTextarea
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      placeholder={placeholder}
      onCompositionStart={(event) => {
        isComposing.current = true
        onCompositionStart?.(event)
      }}
      onCompositionEnd={(event) => {
        isComposing.current = false
        onCompositionEnd?.(event)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (
          event.defaultPrevented ||
          event.key !== "Enter" ||
          event.shiftKey ||
          isComposing.current ||
          event.nativeEvent.isComposing
        ) {
          return
        }
        event.preventDefault()
        const form = event.currentTarget.form
        const submitButton = form?.querySelector<HTMLButtonElement>(
          'button[type="submit"]'
        )
        if (!submitButton?.disabled) {
          form?.requestSubmit()
        }
      }}
      {...props}
    />
  )
}

export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>
export const PromptInputFooter = ({
  className,
  ...props
}: PromptInputFooterProps) => (
  <InputGroupAddon
    align="block-end"
    className={cn("justify-between gap-1", className)}
    {...props}
  />
)

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus
  onStop?: () => void
}

export const PromptInputSubmit = ({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) => {
  const isGenerating = status === "submitted" || status === "streaming"

  let Icon = <CornerDownLeftIcon className="size-4" />

  if (status === "submitted") {
    Icon = <Spinner />
  } else if (status === "streaming") {
    Icon = <SquareIcon className="size-4" />
  } else if (status === "error") {
    Icon = <XIcon className="size-4" />
  }

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isGenerating && onStop) {
        e.preventDefault()
        onStop()
        return
      }
      onClick?.(e)
    },
    [isGenerating, onStop, onClick]
  )

  return (
    <InputGroupButton
      aria-label={isGenerating ? "Stop" : "Submit"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </InputGroupButton>
  )
}
