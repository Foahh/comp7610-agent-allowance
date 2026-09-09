import {
  useId,
  useEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { Button } from "#/components/ui/button"
import { Field, FieldLabel, FieldError } from "#/components/ui/field"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"

export function MarketplacePage({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <main className="providers-page app-surface">
      <section
        className="providers-content"
        aria-labelledby="marketplace-title"
      >
        <div className="providers-intro">
          <h1 id="marketplace-title">{title}</h1>
        </div>
        {children}
      </section>
    </main>
  )
}

export function TextField({
  label,
  multiline = false,
  error,
  ...props
}: ComponentProps<typeof Input> & {
  label: string
  multiline?: boolean
  error?: string
}) {
  const id = useId()

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea
          id={id}
          name={props.name}
          defaultValue={props.defaultValue}
          required={props.required}
          maxLength={props.maxLength}
          rows={5}
        />
      ) : (
        <Input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}

export function RequestState({
  pending,
  error,
  label = "Loading…",
  onRetry,
  success,
}: {
  onRetry?: () => void
  label?: string
  pending?: boolean
  error?: Error | null
  success?: string
}) {
  const previous = useRef("")
  const message = error?.message || success || ""
  useEffect(() => {
    if (message && message !== previous.current) {
      if (error) {
        if (!onRetry) {
          toast.error(message, { id: `request-error-${message}` })
        }
      } else {
        toast.success(message)
      }
    }
    previous.current = message
  }, [message, error, onRetry])

  if (error && onRetry) {
    return (
      <div
        role="alert"
        className="status-notice flex flex-wrap items-center justify-between gap-3"
      >
        <p>{error.message}</p>
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }
  return pending ? (
    <p role="status" className="request-status">
      {label}
    </p>
  ) : null
}
