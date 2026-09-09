import type { ComponentProps } from "react"

import { Field } from "./ui/field"

export function FileUploadField({
  label,
  ...props
}: Omit<ComponentProps<"input">, "type" | "className"> & {
  label: string
}) {
  return (
    <Field className="min-w-0">
      <input
        {...props}
        type="file"
        aria-label={label}
        className="min-w-0 text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </Field>
  )
}
