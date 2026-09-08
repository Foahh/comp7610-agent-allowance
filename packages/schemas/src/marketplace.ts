import * as v from "valibot"

const addressPattern = /^0x[0-9a-fA-F]{40}$/
const positiveAmountPattern = /^[1-9][0-9]*$/
const contentHashPattern = /^0x[0-9a-fA-F]{64}$/

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(100))
const shortText = v.pipe(v.string(), v.maxLength(2000))
const address = v.pipe(v.string(), v.regex(addressPattern))
const amount = v.pipe(v.string(), v.regex(positiveAmountPattern))

export const ListingTypeSchema = v.picklist([
  "text",
  "link",
  "file",
  "ai-service",
])
export const ListingStatusSchema = v.picklist(["draft", "active", "inactive"])

export const ListingInputSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  description: shortText,
  preview: shortText,
  type: ListingTypeSchema,
  amount,
  content: v.pipe(v.string(), v.maxLength(200000)),
  assetId: v.optional(v.string(), ""),
  modelId: v.optional(v.string(), ""),
  instructions: v.pipe(v.string(), v.maxLength(30000)),
  requiredInputs: shortText,
  deliverable: shortText,
  scope: shortText,
  assetIds: v.pipe(v.array(identifier), v.maxLength(32)),
})

export const ListingSchema = v.object({
  ...ListingInputSchema.entries,
  id: identifier,
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  status: ListingStatusSchema,
  createdAt: v.number(),
})

export const PublicListingSchema = v.object({
  id: identifier,
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  name: v.string(),
  description: v.string(),
  preview: v.string(),
  type: ListingTypeSchema,
  amount,
  requiredInputs: v.string(),
  deliverable: v.string(),
  scope: v.string(),
  contentHash: v.pipe(v.string(), v.regex(contentHashPattern)),
})

export const SellerIdentitySchema = v.object({
  protocol: v.literal("agent-spend/2"),
  address,
  name: v.string(),
  description: v.string(),
  chainId: v.number(),
  vault: address,
  token: address,
})

export const SellerConnectionSchema = v.object({
  id: identifier,
  endpoint: v.string(),
  identity: SellerIdentitySchema,
  enabled: v.boolean(),
  status: v.picklist(["online", "offline", "identity-changed"]),
  listings: v.array(PublicListingSchema),
  checkedAt: v.number(),
  error: v.optional(v.string()),
})

export const ModelInputSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  baseURL: v.pipe(v.string(), v.url()),
  model: v.pipe(v.string(), v.minLength(1), v.maxLength(150)),
  apiKey: v.optional(v.pipe(v.string(), v.maxLength(4000)), ""),
})

export const ModelConnectionSchema = v.object({
  id: identifier,
  name: v.string(),
  baseURL: v.string(),
  model: v.string(),
  hasKey: v.boolean(),
})

export const AssetSchema = v.object({
  id: identifier,
  name: v.string(),
  mediaType: v.string(),
  size: v.number(),
  hash: v.string(),
  readable: v.boolean(),
})

export const FileDeliverySchema = v.object({
  name: v.string(),
  mediaType: v.string(),
  size: v.number(),
  hash: v.string(),
})

export type Listing = v.InferOutput<typeof ListingSchema>
export type ListingInput = v.InferOutput<typeof ListingInputSchema>
export type PublicListing = v.InferOutput<typeof PublicListingSchema>
export type SellerConnection = v.InferOutput<typeof SellerConnectionSchema>
export type SellerIdentity = v.InferOutput<typeof SellerIdentitySchema>
export type ModelInput = v.InferOutput<typeof ModelInputSchema>
export type ModelConnection = v.InferOutput<typeof ModelConnectionSchema>
export type Asset = v.InferOutput<typeof AssetSchema>

export function publicListing(
  listing: Listing,
  contentHash: string
): PublicListing {
  const {
    id,
    version,
    name,
    description,
    preview,
    type,
    amount,
    requiredInputs,
    deliverable,
    scope,
  } = listing

  return {
    id,
    version,
    name,
    description,
    preview,
    type,
    amount,
    requiredInputs,
    deliverable,
    scope,
    contentHash,
  }
}

export type StoredModel = Omit<ModelConnection, "hasKey"> & {
  encryptedKey: string
}

// A paid job must retain the exact configuration agreed at quotation time.
export type ExecutionSnapshot = {
  listing: Listing
  model?: StoredModel
  assets: { name: string; text: string }[]
}
