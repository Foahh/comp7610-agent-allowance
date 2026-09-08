import { createContext, useContext, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet"

const FooterTarget = createContext<HTMLDivElement | null>(null)

export function SheetActions({ children }: { children: ReactNode }) {
  const target = useContext(FooterTarget)
  return target ? createPortal(children, target) : null
}

// Keep one form mounted while closed so DOM drafts and mutation progress survive.
export function EditorSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  const [footer, setFooter] = useState<HTMLDivElement | null>(null)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent keepMounted className="editor-sheet app-surface">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <FooterTarget value={footer}>
          <div className="editor-sheet-body">{children}</div>
        </FooterTarget>
        <div className="editor-sheet-footer" ref={setFooter} />
      </SheetContent>
    </Sheet>
  )
}
