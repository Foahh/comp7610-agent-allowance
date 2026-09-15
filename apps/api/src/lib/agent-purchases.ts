import type { Purchase } from "@repo/schemas"

// Tool calls may arrive in parallel. Count persisted authorizations, not attempts.
export function createPurchaseExecutor(
  listPurchases: () => Purchase[],
  purchase: (id: string) => Promise<Purchase>
) {
  let count = 0
  let tail = Promise.resolve()
  return async (id: string) => {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      const existing = new Set(listPurchases().map((item) => item.id))
      if (!existing.has(id) && count >= 2) {
        return {
          error:
            "Two new purchases were authorized. Continue remaining purchases in a follow-up.",
        }
      }
      const result = await purchase(id)
      if (
        !existing.has(result.id) &&
        result.authorization &&
        result.paymentStatus !== "rejected"
      ) {
        count += 1
      }
      return result
    } finally {
      release()
    }
  }
}
