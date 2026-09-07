import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip"

export function AttToken({ focusable = true }: { focusable?: boolean }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="att-token" tabIndex={focusable ? 0 : undefined}>
            ATT
          </span>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>
          ATT is a demonstration token with no monetary value.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
