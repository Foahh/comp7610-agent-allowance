import type { Purchase } from "@repo/schemas"

import { expect, test } from "vite-plus/test"

import { purchaseRefreshInterval } from "./purchase-refresh.ts"

test("pending payments and deliveries poll promptly, while terminal states stop", () => {
  expect(
    purchaseRefreshInterval([{ paymentStatus: "pending" } as Purchase])
  ).toBe(3000)
  expect(
    purchaseRefreshInterval([
      {
        paymentStatus: "confirmed",
        delivery: { status: "running" },
      } as Purchase,
    ])
  ).toBe(3000)
  expect(
    purchaseRefreshInterval([{ paymentStatus: "prepared" } as Purchase])
  ).toBe(10000)
  expect(
    purchaseRefreshInterval([
      {
        paymentStatus: "confirmed",
        delivery: { status: "completed" },
      } as Purchase,
    ])
  ).toBe(false)
  expect(
    purchaseRefreshInterval([
      {
        paymentStatus: "confirmed",
        delivery: { status: "failed" },
      } as Purchase,
    ])
  ).toBe(false)
  expect(
    purchaseRefreshInterval([{ paymentStatus: "reverted" } as Purchase])
  ).toBe(false)
  expect(purchaseRefreshInterval()).toBe(false)
})
