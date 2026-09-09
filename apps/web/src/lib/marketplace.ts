import type {
  Asset,
  Listing,
  ModelConnection,
  Purchase,
  SellerConnection,
} from "@repo/schemas"

export type SellerProfile = {
  name: string
  description: string
  buyerModelId: string
}
export type Sale = {
  id: string
  offer: Purchase["offer"]
  paymentStatus: Purchase["paymentStatus"] | "awaiting-payment"
  txHash?: string
  delivery?: Purchase["delivery"]
}

export type MarketplaceData = {
  connections: SellerConnection[]
  purchases: Purchase[]
  "seller/listings": Listing[]
  "seller/identity": { address: string }
  "seller/models": ModelConnection[]
  "seller/profile": SellerProfile
  "seller/assets": Asset[]
  "seller/orders": Sale[]
}

export async function marketplaceRequest<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST"
): Promise<T> {
  const form = body instanceof FormData
  const response = await fetch(`/api/marketplace/${path}`, {
    method,
    headers:
      body === undefined || form
        ? undefined
        : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || "Request failed.")
  }
  return result as T
}

export function formText(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}
