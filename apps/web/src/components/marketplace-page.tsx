import { RiArrowLeftLine } from "@remixicon/react"
import { Link } from "@tanstack/react-router"
import { useId, type ComponentProps, type ReactNode } from "react"

import { useWorkspaceAssistant } from "#/components/assistant-context"
import { Button } from "#/components/ui/button"
import { Field, FieldLabel } from "#/components/ui/field"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { marketplaceNavigation } from "#/lib/navigation"

export function MarketplacePage({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  const assistant = useWorkspaceAssistant()

  return (
    <main className="providers-page app-surface">
      <header className="providers-header">
        <div className="providers-header-inner">
          <Link to="/" className="brand">
            <span className="brand-copy">
              <span className="eyebrow">COMP7610</span>
              <strong>Agent Spend</strong>
            </span>
          </Link>
          <Button
            nativeButton={false}
            role="link"
            render={<Link to="/" />}
            variant="outline"
          >
            <RiArrowLeftLine />
            Back to assistant
          </Button>
        </div>
      </header>
      <section
        className="providers-content"
        aria-labelledby="marketplace-title"
      >
        <nav className="flex flex-wrap gap-2" aria-label="Application">
          {marketplaceNavigation.map((item) => (
            <Button
              key={item.to}
              nativeButton={false}
              render={
                <Link to={item.to} activeProps={{ "aria-current": "page" }} />
              }
              variant="ghost"
            >
              {item.label}
            </Button>
          ))}
        </nav>
        <div className="providers-intro">
          <p className="eyebrow">Buy & sell</p>
          <h1 id="marketplace-title">{title}</h1>
          <p>{description}</p>
        </div>
        {!assistant.wallet ? (
          <div className="provider-empty">
            <h2>Connect your owner wallet</h2>
            <p>
              Only this installation’s owner can manage its items and settings.
            </p>
            <Button
              onClick={assistant.connect}
              disabled={assistant.run.busy || !assistant.config}
            >
              Connect wallet
            </Button>
          </div>
        ) : (
          children
        )}
      </section>
    </main>
  )
}

export function TextField({
  label,
  multiline = false,
  ...props
}: ComponentProps<typeof Input> & { label: string; multiline?: boolean }) {
  const id = useId()

  return (
    <Field>
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
        <Input id={id} {...props} />
      )}
    </Field>
  )
}

export function RequestState({
  pending,
  error,
  success,
}: {
  pending?: boolean
  error?: Error | null
  success?: string
}) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    )
  }

  if (pending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Working…
      </p>
    )
  }

  return success ? (
    <p role="status" className="text-sm text-muted-foreground">
      {success}
    </p>
  ) : null
}
