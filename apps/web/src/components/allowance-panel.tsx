import type { Allowance } from "@repo/schemas"

import { formatUnits } from "viem"

import { AttToken } from "#/components/att-token"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { Checkbox } from "#/components/ui/checkbox"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "#/components/ui/field"
import { Input } from "#/components/ui/input"
import { Separator } from "#/components/ui/separator"

import { AllowanceSellers } from "./allowance-sellers"
import { useWorkspaceAssistant } from "./assistant-context"

const amount = (value: string) => formatUnits(BigInt(value), 6)

type Props = {
  allowance: Allowance | null
  connected: boolean
  busy: boolean
  budget: string
  cap: string
  onBudgetChange: (value: string) => void
  onCapChange: (value: string) => void
  onFund: (budget: string, cap: string) => void
  onAction: (action: "revokeAllowance" | "withdrawUnused") => void
}

export function AllowancePanel({
  allowance,
  connected,
  busy,
  budget,
  cap,
  onBudgetChange,
  onCapChange,
  onFund,
  onAction,
}: Props) {
  const { automatic, setAutomatic } = useWorkspaceAssistant()
  const canCreate = !allowance || allowance.revoked
  const { invalidBudget, invalidCap } = validateAmounts(budget, cap)

  return (
    <Card className="allowance-card">
      <CardHeader>
        <CardTitle>
          <h2>Allowance</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {allowance && <AllowanceSummary allowance={allowance} />}
        {canCreate && (
          <FieldGroup>
            <Field data-invalid={invalidBudget}>
              <FieldLabel htmlFor="budget">
                <span>
                  Total budget (<AttToken />)
                </span>
              </FieldLabel>
              <Input
                id="budget"
                aria-invalid={invalidBudget}
                inputMode="decimal"
                value={budget}
                aria-describedby={invalidBudget ? "budget-error" : undefined}
                onChange={(event) => onBudgetChange(event.target.value)}
                disabled={busy}
              />
              {invalidBudget && (
                <FieldError id="budget-error">
                  Enter a positive amount with at most six decimal places.
                </FieldError>
              )}
            </Field>
            <Field data-invalid={invalidCap}>
              <FieldLabel htmlFor="cap">
                <span>
                  Per purchase (<AttToken />)
                </span>
              </FieldLabel>
              <Input
                id="cap"
                aria-invalid={invalidCap}
                inputMode="decimal"
                value={cap}
                aria-describedby={invalidCap ? "cap-error" : undefined}
                onChange={(event) => onCapChange(event.target.value)}
                disabled={busy}
              />
              {invalidCap && (
                <FieldError id="cap-error">
                  Use a positive cap no larger than the total.
                </FieldError>
              )}
            </Field>
          </FieldGroup>
        )}
        <AllowanceSellers />
        {canCreate && (
          <section className="purchase-mode">
            <Field orientation="horizontal">
              <Checkbox
                id="automatic-purchases"
                checked={automatic}
                disabled={busy}
                onCheckedChange={(checked) => setAutomatic(checked)}
              />
              <FieldLabel htmlFor="automatic-purchases">
                Automatic purchases
              </FieldLabel>
            </Field>
            <p className="text-xs text-muted-foreground">
              {automatic
                ? "Approved sellers can charge this allowance without wallet confirmation."
                : "Each purchase requires wallet confirmation and gas."}
            </p>
          </section>
        )}
      </CardContent>
      <AllowanceActions
        allowance={allowance}
        canCreate={canCreate}
        connected={connected}
        busy={busy}
        invalid={invalidBudget || invalidCap}
        onFund={() => onFund(budget, cap)}
        onAction={onAction}
      />
    </Card>
  )
}

function validateAmounts(budget: string, cap: string) {
  const validAmount = /^\d+(\.\d{1,6})?$/
  const invalidBudget = !validAmount.test(budget) || Number(budget) <= 0
  const invalidCap =
    !validAmount.test(cap) || Number(cap) <= 0 || Number(cap) > Number(budget)

  return { invalidBudget, invalidCap }
}

function AllowanceSummary({ allowance }: { allowance: Allowance }) {
  return (
    <>
      <Badge variant={allowance.revoked ? "outline" : "secondary"}>
        {allowance.revoked ? "Revoked" : "Authorized"} · #{allowance.id}
      </Badge>
      <div className="allowance-balance">
        <p className="eyebrow">Remaining allowance</p>
        <p className="balance">
          {amount(allowance.remaining)} <span>ATT</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {amount(allowance.spent)} spent of {amount(allowance.budget)} ATT
        </p>
      </div>
      <dl className="allowance-facts">
        <div>
          <dt>Per purchase</dt>
          <dd>{amount(allowance.perPurchase)} ATT</dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>
            {new Date(Number(allowance.expiresAt) * 1000).toLocaleString()}
          </dd>
        </div>
      </dl>
      <Separator />
    </>
  )
}

function AllowanceActions({
  allowance,
  canCreate,
  connected,
  busy,
  invalid,
  onFund,
  onAction,
}: Pick<Props, "allowance" | "connected" | "busy" | "onAction"> & {
  canCreate: boolean
  invalid: boolean
  onFund: () => void
}) {
  return (
    <CardFooter className="flex flex-col items-stretch gap-2">
      {canCreate && (
        <p className="allowance-guidance">
          {connected
            ? "Expires after 24 hours. Requires wallet confirmation and test ETH for gas."
            : "Select a conversation first."}
        </p>
      )}
      {canCreate ? (
        <Button disabled={!connected || busy || invalid} onClick={onFund}>
          Authorize allowance
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onAction("revokeAllowance")}
        >
          Stop future spending
        </Button>
      )}
      {allowance?.revoked && BigInt(allowance.remaining) > 0n && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onAction("withdrawUnused")}
        >
          Withdraw unused ATT
        </Button>
      )}
    </CardFooter>
  )
}
