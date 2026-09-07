import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip"

export function AttToken({ focusable = true }: { focusable?: boolean }) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="att-token" tabIndex={focusable ? 0 : undefined} />
          }
        >
          ATT
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>
          ATT is a demonstration token with no monetary value.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
