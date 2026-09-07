import type { Allowance } from "@repo/schemas"

import { useState } from "react"
import { formatUnits } from "viem"

import { AttToken } from "#/components/att-token"
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
  initialCap: string
  onFund: (budget: string, cap: string) => void
  onAction: (action: "revokeAllowance" | "withdrawUnused") => void
}

export function AllowancePanel({
  allowance,
  connected,
  busy,
  initialBudget,
  initialCap,
  onFund,
  onAction,
}: Props) {
  const [budget, setBudget] = useState(initialBudget)
  const [cap, setCap] = useState(initialCap)
  const canCreate = !allowance || allowance.revoked
  const { invalidBudget, invalidCap } = validateAmounts(budget, cap)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation allowance</CardTitle>
        <CardDescription>
          Approve ATT first, then confirm allowance creation. Valid for 24
          hours. Gas is paid separately in test ETH.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {allowance && (
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
        )}
        {canCreate && (
          <FieldGroup>
            <Field data-invalid={invalidBudget}>
              <FieldLabel htmlFor="budget">
                <span>
                  Total allowance (<AttToken />)
                </span>
              </FieldLabel>
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
              <FieldLabel htmlFor="cap">
                <span>
                  Maximum per purchase (<AttToken />)
                </span>
              </FieldLabel>
              <Input
                id="cap"
                aria-invalid={invalidCap}
                inputMode="decimal"
                value={cap}
                onChange={(event) => setCap(event.target.value)}
                disabled={busy}
              />
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
