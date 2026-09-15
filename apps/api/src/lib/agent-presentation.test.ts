import { expect, test } from "vite-plus/test"

import { agentPresentation } from "./agent-presentation.ts"

test("model prices use ATT without mutating signed amounts or numeric identifiers", () => {
  const offer = {
    quote: { amount: "5000000", allowanceId: "2", expiresAt: "1789477728" },
    listing: { amount: "1" },
  }
  expect(agentPresentation(offer)).toEqual({
    quote: {
      amountBaseUnits: "5000000",
      amountDisplay: "5 ATT",
      allowanceId: "2",
      expiresAt: "1789477728",
    },
    listing: { amountBaseUnits: "1", amountDisplay: "0.000001 ATT" },
  })
  expect(offer.quote.amount).toBe("5000000")
})

test("allowance presentation retains precision above the safe integer limit", () => {
  expect(
    agentPresentation({
      remaining: "9007199254740993000001",
      perPurchase: "3000000",
    })
  ).toEqual({
    remainingBaseUnits: "9007199254740993000001",
    remainingDisplay: "9007199254740993.000001 ATT",
    perPurchaseBaseUnits: "3000000",
    perPurchaseDisplay: "3 ATT",
  })
})
