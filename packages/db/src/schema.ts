import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"

function entity(name: string) {
  return sqliteTable(
    name,
    {
      id: text("id").primaryKey(),
      scope: text("scope").notNull(),
      data: text("data").notNull(),
      createdAt: integer("created_at").notNull(),
    },
    (table) => [index(name + "_scope_idx").on(table.scope)]
  )
}

export const conversations = entity("conversations")
export const messages = entity("messages")
export const allowances = entity("allowances")
export const quotes = entity("quotes")
export const purchases = entity("purchases")
export const jobs = entity("jobs")
export const challenges = entity("challenges")
export const sessions = entity("sessions")
