import type { Purchase } from "@repo/schemas"

import { expect, test } from "vite-plus/test"

import {
  purchaseConfirmationMessage,
  purchasePaymentLabel,
} from "./presentation.ts"

test("mined payments show settlement progress without being labeled confirmed", () => {
  const purchase = {
    paymentStatus: "pending",
    txHash: "0xsubmitted",
    confirmations: 1,
    requiredConfirmations: 2,
  } as Purchase
  expect(purchasePaymentLabel(purchase)).toBe("Mined · 1/2 confirmations")
  expect(purchaseConfirmationMessage(purchase)).toContain("(1/2)")
  expect(purchaseConfirmationMessage(purchase)).toContain(
    "No wallet action needed"
  )
  expect(
    purchasePaymentLabel({ ...purchase, paymentStatus: "confirmed" })
  ).toBe("Confirmed")
})

test("unmined and wallet-confirmation states remain distinct", () => {
  const purchase = {
    paymentStatus: "pending",
    txHash: "0xsubmitted",
  } as Purchase
  expect(purchasePaymentLabel(purchase)).toBe(
    "Submitted · awaiting confirmation"
  )
  expect(purchaseConfirmationMessage(purchase)).toContain("Waiting to be mined")
  expect(
    purchasePaymentLabel({
      ...purchase,
      paymentStatus: "prepared",
      txHash: undefined,
    })
  ).toBe("Awaiting wallet confirmation")
})
