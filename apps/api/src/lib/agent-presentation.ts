import { formatUnits } from "viem"

const monetaryFields = new Set([
  "amount",
  "budget",
  "perPurchase",
  "spent",
  "remaining",
  "withdrawn",
])

// Format only the model-facing copy. Signed quotes and contract inputs remain exact.
export function agentPresentation(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(agentPresentation)
  }
  if (!value || typeof value !== "object") {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (
        monetaryFields.has(key) &&
        typeof item === "string" &&
        /^\d+$/.test(item)
      ) {
        return [
          [`${key}BaseUnits`, item],
          [`${key}Display`, `${formatUnits(BigInt(item), 6)} ATT`],
        ]
      }
      return [[key, agentPresentation(item)]]
    })
  )
}
