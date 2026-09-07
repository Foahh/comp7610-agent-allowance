import type { Allowance } from "@repo/schemas"

import { useState } from "react"
import { formatUnits } from "viem"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "#/components/ui/field"
import { Input } from "#/components/ui/input"
import { Separator } from "#/components/ui/separator"

const amount = (value: string) => formatUnits(BigInt(value), 6)

type Props = {
  allowance: Allowance | null
  connected: boolean
  busy: boolean
  initialBudget: string
  onFund: (budget: string, cap: string) => void
  onAction: (action: "revokeAllowance" | "withdrawUnused") => void
}

export function AllowancePanel({
  allowance,
  connected,
  busy,
  initialBudget,
  onFund,
  onAction,
}: Props) {
  const [budget, setBudget] = useState(initialBudget)
  const [cap, setCap] = useState(initialBudget === "1" ? "1" : "2")
  const canCreate = !allowance || allowance.revoked
  const { invalidBudget, invalidCap } = validateAmounts(budget, cap)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation allowance</CardTitle>
        <CardDescription>
          You control the budget. The contract enforces it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {allowance ? (
          <>
            <Badge variant={allowance.revoked ? "outline" : "secondary"}>
              {allowance.revoked ? "Revoked" : "Authorized"} · #{allowance.id}
            </Badge>
            <div>
              <p className="balance">
                {amount(allowance.remaining)} <span>ATT left</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {amount(allowance.spent)} spent of {amount(allowance.budget)}{" "}
                ATT
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
                  {new Date(
                    Number(allowance.expiresAt) * 1000
                  ).toLocaleString()}
                </dd>
              </div>
            </dl>
            <Separator />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chat freely. Activate an allowance when you want your assistant to
            hire a specialist.
          </p>
        )}
        {canCreate && (
          <FieldGroup>
            <Field data-invalid={invalidBudget}>
              <FieldLabel htmlFor="budget">Total allowance (ATT)</FieldLabel>
              <Input
                id="budget"
                aria-invalid={invalidBudget}
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                disabled={busy}
              />
              {invalidBudget && (
                <FieldError>
                  Enter a positive amount with at most six decimal places.
                </FieldError>
              )}
            </Field>
            <Field data-invalid={invalidCap}>
              <FieldLabel htmlFor="cap">Maximum per purchase (ATT)</FieldLabel>
              <Input
                id="cap"
                aria-invalid={invalidCap}
                inputMode="decimal"
                value={cap}
                onChange={(event) => setCap(event.target.value)}
                disabled={busy}
              />
              <FieldDescription>
                Approve ATT first, then confirm allowance creation. Valid for 24
                hours. Gas is paid separately in test ETH.
              </FieldDescription>
              {invalidCap && (
                <FieldError>
                  Use a positive cap no larger than the total.
                </FieldError>
              )}
            </Field>
          </FieldGroup>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        {canCreate ? (
          <Button
            disabled={!connected || busy || invalidBudget || invalidCap}
            onClick={() => onFund(budget, cap)}
          >
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
