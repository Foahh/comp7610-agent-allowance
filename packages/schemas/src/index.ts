import * as v from "valibot"

import { FileDeliverySchema, PublicListingSchema } from "./marketplace.ts"
export * from "./marketplace.ts"

const addressPattern = /^0x[0-9a-fA-F]{40}$/
const hexPattern = /^0x[0-9a-fA-F]+$/
const amountPattern = /^(0|[1-9][0-9]*)$/

export const AddressSchema = v.pipe(v.string(), v.regex(addressPattern))
export const HexSchema = v.pipe(v.string(), v.regex(hexPattern))
export const AmountSchema = v.pipe(v.string(), v.regex(amountPattern))
export const ServiceSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(100)
)
export const ScenarioSchema = v.picklist(["success", "insufficient"])

export const HealthSchema = v.object({
  status: v.literal("ok"),
  service: v.picklist(["api", "seller"]),
})

export const ConversationSchema = v.object({
  id: v.string(),
  owner: AddressSchema,
  title: v.string(),
  scenario: ScenarioSchema,
  allowanceId: v.nullable(AmountSchema),
  createdAt: v.number(),
})

export const MessageSchema = v.object({
  id: v.string(),
  conversationId: v.string(),
  role: v.picklist(["user", "assistant"]),
  content: v.string(),
  createdAt: v.number(),
})

export const TaskSchema = v.strictObject({
  service: ServiceSchema,
  sellerId: v.string(),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  requestId: v.string(),
  brief: v.pipe(v.string(), v.maxLength(12000)),
  evidence: v.optional(v.pipe(v.string(), v.maxLength(30000)), ""),
})

export const QuoteSchema = v.object({
  allowanceId: AmountSchema,
  service: HexSchema,
  requestHash: HexSchema,
  recipient: AddressSchema,
  amount: AmountSchema,
  nonce: HexSchema,
  expiresAt: AmountSchema,
})

export const SignedQuoteSchema = v.object({
  id: HexSchema,
  quote: QuoteSchema,
  signature: HexSchema,
  task: TaskSchema,
  deliverable: v.string(),
  listing: PublicListingSchema,
})

export const DeliverySchema = v.object({
  purchaseId: HexSchema,
  status: v.picklist(["pending", "running", "completed", "failed"]),
  content: v.string(),
  file: v.optional(FileDeliverySchema),
  references: v.array(v.string()),
  modelMs: v.number(),
  deliveryMs: v.number(),
  error: v.optional(v.string()),
})

export const PurchaseSchema = v.object({
  id: HexSchema,
  conversationId: v.string(),
  offer: SignedQuoteSchema,
  paymentStatus: v.picklist([
    "prepared",
    "pending",
    "confirmed",
    "reverted",
    "rejected",
  ]),
  txHash: v.optional(HexSchema),
  rawTransaction: v.optional(HexSchema),
  nonce: v.optional(v.number()),
  gasUsed: v.optional(AmountSchema),
  gasWei: v.optional(AmountSchema),
  paymentMs: v.optional(v.number()),
  broadcastMs: v.optional(v.number()),
  confirmationMs: v.optional(v.number()),
  delivery: v.optional(DeliverySchema),
  error: v.optional(v.string()),
  createdAt: v.number(),
})

export const AllowanceSchema = v.object({
  id: AmountSchema,
  owner: AddressSchema,
  agent: AddressSchema,
  sellers: v.array(AddressSchema),
  budget: AmountSchema,
  perPurchase: AmountSchema,
  spent: AmountSchema,
  remaining: AmountSchema,
  withdrawn: AmountSchema,
  expiresAt: AmountSchema,
  revoked: v.boolean(),
})

export const ChatEventSchema = v.variant("type", [
  v.object({ type: v.literal("text"), text: v.string() }),
  v.object({ type: v.literal("status"), text: v.string() }),
  v.object({ type: v.literal("purchase"), purchase: PurchaseSchema }),
  v.object({ type: v.literal("done") }),
  v.object({ type: v.literal("error"), text: v.string() }),
])

export type Health = v.InferOutput<typeof HealthSchema>
export type Conversation = v.InferOutput<typeof ConversationSchema>
export type Message = v.InferOutput<typeof MessageSchema>
export type Task = v.InferOutput<typeof TaskSchema>
export type SignedQuote = v.InferOutput<typeof SignedQuoteSchema>
export type Delivery = v.InferOutput<typeof DeliverySchema>
export type Purchase = v.InferOutput<typeof PurchaseSchema>
export type Allowance = v.InferOutput<typeof AllowanceSchema>
export type ChatEvent = v.InferOutput<typeof ChatEventSchema>
