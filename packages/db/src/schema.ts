import type { SignedQuote, ExecutionSnapshot } from "@repo/schemas"

import { sql } from "drizzle-orm"
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
  check,
} from "drizzle-orm/sqlite-core"

export const deletedOrders = sqliteTable(
  "deleted_orders",
  {
    id: text("id").notNull(),
    kind: text("kind", { enum: ["purchase", "sale"] }).notNull(),
    deletedAt: integer("deleted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.kind] })]
)

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey().notNull(),
    owner: text("owner").notNull(),
    title: text("title").notNull(),
    scenario: text("scenario", { enum: ["success", "insufficient"] }).notNull(),
    allowanceId: text("allowance_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    check(
      "conversations_scenario_check",
      sql`${table.scenario} in ('success', 'insufficient')`
    ),
    index("conversations_lookup_idx").on(table.owner, table.createdAt),
  ]
)

export const deletedConversations = sqliteTable("deleted_conversations", {
  conversationId: text("conversation_id")
    .primaryKey()
    .notNull()
    .references(() => conversations.id),
  deletedAt: integer("deleted_at").notNull(),
})

export const purchasePlanItems = sqliteTable(
  "purchase_plan_items",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    position: integer("position").notNull(),
    sellerId: text("seller_id").notNull(),
    recipient: text("recipient").notNull(),
    listingId: text("listing_id").notNull(),
    listingVersion: integer("listing_version").notNull(),
    requestId: text("request_id").notNull(),
    brief: text("brief").notNull(),
    evidence: text("evidence").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    preview: text("preview").notNull(),
    type: text("type", {
      enum: ["text", "link", "file", "ai-service"],
    }).notNull(),
    amount: text("amount").notNull(),
    requiredInputs: text("required_inputs").notNull(),
    deliverable: text("deliverable").notNull(),
    scope: text("scope").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.position] }),
    check("purchase_plan_items_position_check", sql`${table.position} >= 0`),
    check(
      "purchase_plan_items_version_check",
      sql`${table.listingVersion} >= 1`
    ),
    check(
      "purchase_plan_items_type_check",
      sql`${table.type} in ('text', 'link', 'file', 'ai-service')`
    ),
  ]
)

export const allowances = sqliteTable(
  "allowances",
  {
    allowanceId: text("allowance_id").primaryKey().notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
  },
  (table) => [index("allowances_lookup_idx").on(table.conversationId)]
)

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey().notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    check("messages_role_check", sql`${table.role} in ('user', 'assistant')`),
    index("messages_lookup_idx").on(table.conversationId, table.createdAt),
  ]
)

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey().notNull(),
    conversationId: text("conversation_id").references(() => conversations.id),
    allowanceId: text("allowance_id").notNull(),
    service: text("service").notNull(),
    requestHash: text("request_hash").notNull(),
    recipient: text("recipient").notNull(),
    amount: text("amount").notNull(),
    nonce: text("nonce").notNull(),
    expiresAt: text("expires_at").notNull(),
    signature: text("signature").notNull(),
    taskService: text("task_service").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<SignedQuote>().notNull(),
    brief: text("brief").notNull(),
    evidence: text("evidence").notNull(),
    deliverable: text("deliverable").notNull(),
  },
  (table) => [index("quotes_lookup_idx").on(table.conversationId)]
)

export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .references(() => quotes.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    paymentStatus: text("payment_status", {
      enum: ["prepared", "pending", "confirmed", "reverted", "rejected"],
    }).notNull(),
    txHash: text("tx_hash"),
    confirmations: integer("confirmations"),
    requiredConfirmations: integer("required_confirmations"),
    buyerSignature: text("buyer_signature"),
    authorizationFromBlock: text("authorization_from_block"),
    gasUsed: text("gas_used"),
    gasWei: text("gas_wei"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    check(
      "purchases_payment_status_check",
      sql`${table.paymentStatus} in ('prepared', 'pending', 'confirmed', 'reverted', 'rejected')`
    ),
    index("purchases_lookup_idx").on(table.conversationId, table.createdAt),
    index("purchases_payment_status_idx").on(table.paymentStatus),
  ]
)

export const deliveries = sqliteTable(
  "deliveries",
  {
    purchaseId: text("purchase_id")
      .primaryKey()
      .notNull()
      .references(() => quotes.id),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed"],
    }).notNull(),
    content: text("content").notNull(),
    fileName: text("file_name"),
    fileSize: integer("file_size"),
    fileMediaType: text("file_media_type"),
    fileHash: text("file_hash"),
    modelMs: real("model_ms").notNull(),
    deliveryMs: real("delivery_ms").notNull(),
    error: text("error"),
  },
  (table) => [
    check(
      "deliveries_status_check",
      sql`${table.status} in ('pending', 'running', 'completed', 'failed')`
    ),
  ]
)

export const deliveryReferences = sqliteTable(
  "delivery_references",
  {
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => deliveries.purchaseId),
    position: integer("position").notNull(),
    reference: text("reference").notNull(),
  },
  (table) => [primaryKey({ columns: [table.purchaseId, table.position] })]
)

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey().notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    acceptedAt: integer("accepted_at").notNull(),
  },
  (table) => [index("runs_lookup_idx").on(table.conversationId)]
)

export const challenges = sqliteTable(
  "challenges",
  {
    id: text("id").primaryKey().notNull(),
    owner: text("owner").notNull(),
    message: text("message").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("challenges_lookup_idx").on(table.expiresAt)]
)

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().notNull(),
    owner: text("owner").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("sessions_lookup_idx").on(table.expiresAt)]
)

export const sellerProfiles = sqliteTable("seller_profiles", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  buyerModelId: text("buyer_model_id").notNull(),
})

export const modelConnections = sqliteTable("model_connections", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  baseURL: text("base_url").notNull(),
  model: text("model").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
})

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  mediaType: text("media_type").notNull(),
  size: integer("size").notNull(),
  hash: text("hash").notNull(),
  readable: integer("readable", { mode: "boolean" }).notNull(),
})

export const listingVersions = sqliteTable(
  "listing_versions",
  {
    id: text("id").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    preview: text("preview").notNull(),
    type: text("type", {
      enum: ["text", "link", "file", "ai-service"],
    }).notNull(),
    amount: text("amount").notNull(),
    content: text("content").notNull(),
    assetId: text("asset_id").notNull(),
    modelId: text("model_id").notNull(),
    instructions: text("instructions").notNull(),
    requiredInputs: text("required_inputs").notNull(),
    deliverable: text("deliverable").notNull(),
    scope: text("scope").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.version] })]
)

export const listingHeads = sqliteTable("listing_heads", {
  id: text("id").primaryKey().notNull(),
  version: integer("version").notNull(),
  publishedVersion: integer("published_version"),
  status: text("status", { enum: ["draft", "active", "inactive"] }).notNull(),
})

export const listingAssets = sqliteTable(
  "listing_assets",
  {
    listingId: text("listing_id").notNull(),
    version: integer("version").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.listingId, table.version, table.position] }),
  ]
)

export const sellerConnections = sqliteTable("seller_connections", {
  id: text("id").primaryKey().notNull(),
  endpoint: text("endpoint").notNull().unique(),
  address: text("address").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  chainId: integer("chain_id").notNull(),
  vault: text("vault").notNull(),
  token: text("token").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  status: text("status", {
    enum: ["online", "offline", "identity-changed"],
  }).notNull(),
  checkedAt: integer("checked_at").notNull(),
  error: text("error"),
})

export const connectedListings = sqliteTable(
  "connected_listings",
  {
    connectionId: text("connection_id")
      .notNull()
      .references(() => sellerConnections.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    preview: text("preview").notNull(),
    type: text("type", {
      enum: ["text", "link", "file", "ai-service"],
    }).notNull(),
    amount: text("amount").notNull(),
    requiredInputs: text("required_inputs").notNull(),
    deliverable: text("deliverable").notNull(),
    scope: text("scope").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.id, table.version] }),
  ]
)

export const quoteRequests = sqliteTable("quote_requests", {
  requestKey: text("request_key").primaryKey().notNull(),
  id: text("quote_id")
    .notNull()
    .references(() => quotes.id),
  taskHash: text("task_hash").notNull(),
})

export const sellerJobs = sqliteTable("seller_jobs", {
  id: text("purchase_id")
    .primaryKey()
    .notNull()
    .references(() => quotes.id),
  snapshot: text("snapshot", { mode: "json" })
    .$type<ExecutionSnapshot>()
    .notNull(),
  txHash: text("tx_hash"),
  paid: integer("paid", { mode: "boolean" }).notNull(),
})

export const purchaseDestinations = sqliteTable("purchase_destinations", {
  id: text("purchase_id").primaryKey().notNull(),
  endpoint: text("endpoint").notNull(),
})

export const purchasedFiles = sqliteTable("purchased_files", {
  id: text("purchase_id")
    .primaryKey()
    .notNull()
    .references(() => purchases.id),
  path: text("path").notNull(),
})

export const installations = sqliteTable("installations", {
  role: text("role").primaryKey().notNull(),
  chain: text("chain").notNull(),
  vault: text("vault").notNull(),
  signer: text("signer").notNull(),
})

export const operationRecords = sqliteTable("operation_records", {
  id: text("id").primaryKey().notNull(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
})
