import type { DatabaseSync } from "node:sqlite"

// Upgrade the short-lived JSON plan schema. Called inside the startup transaction.
export function migratePurchasePlans(sqlite: DatabaseSync) {
  const legacy = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_plans'"
    )
    .get()
  if (!legacy) {
    return
  }
  if (
    sqlite
      .prepare(
        "SELECT 1 FROM purchase_plans WHERE json_type(items) != 'array' LIMIT 1"
      )
      .get() ||
    sqlite
      .prepare(`SELECT 1 FROM purchase_plans, json_each(purchase_plans.items) AS item
        WHERE json_extract(item.value, '$.task.service') IS NOT json_extract(item.value, '$.listing.id')
          OR json_extract(item.value, '$.task.version') IS NOT json_extract(item.value, '$.listing.version') LIMIT 1`)
      .get()
  ) {
    throw new Error(
      "Cannot migrate a purchase plan whose task does not match its listing."
    )
  }
  sqlite.exec(`
    INSERT INTO purchase_plan_items (
      conversation_id, position, seller_id, recipient, listing_id, listing_version,
      request_id, brief, evidence, name, description, preview, type, amount,
      required_inputs, deliverable, scope, content_hash
    )
    SELECT plan.conversation_id, CAST(item.key AS INTEGER),
      json_extract(item.value, '$.task.sellerId'),
      json_extract(item.value, '$.recipient'),
      json_extract(item.value, '$.listing.id'),
      json_extract(item.value, '$.listing.version'),
      json_extract(item.value, '$.task.requestId'),
      json_extract(item.value, '$.task.brief'),
      json_extract(item.value, '$.task.evidence'),
      json_extract(item.value, '$.listing.name'),
      json_extract(item.value, '$.listing.description'),
      json_extract(item.value, '$.listing.preview'),
      json_extract(item.value, '$.listing.type'),
      json_extract(item.value, '$.listing.amount'),
      json_extract(item.value, '$.listing.requiredInputs'),
      json_extract(item.value, '$.listing.deliverable'),
      json_extract(item.value, '$.listing.scope'),
      json_extract(item.value, '$.listing.contentHash')
    FROM purchase_plans AS plan, json_each(plan.items) AS item;
    DROP TABLE purchase_plans;
  `)
}
