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
    taskService: text("task_service", {
      enum: ["analysis", "writing"],
    }).notNull(),
    brief: text("brief").notNull(),
    evidence: text("evidence").notNull(),
    deliverable: text("deliverable").notNull(),
  },
  (table) => [
    check(
      "quotes_task_service_check",
      sql`${table.taskService} in ('analysis', 'writing')`
    ),
    index("quotes_lookup_idx").on(table.conversationId),
  ]
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
    rawTransaction: text("raw_transaction"),
    gasUsed: text("gas_used"),
    gasWei: text("gas_wei"),
    error: text("error"),
    nonce: integer("nonce"),
    paymentMs: real("payment_ms"),
    broadcastMs: real("broadcast_ms"),
    confirmationMs: real("confirmation_ms"),
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
