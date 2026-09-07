import { eq } from "drizzle-orm"
import type { Delivery, SignedQuote } from "@repo/schemas"
import type { Database } from "./index.ts"
import { quotes, deliveries, deliveryReferences } from "./schema.ts"

export function createRecordQueries(
  db: Pick<Database, "select" | "insert" | "delete" | "transaction">
) {
  function saveQuote(offer: SignedQuote, conversationId?: string) {
    const row = {
      id: offer.id,
      conversationId: conversationId ?? null,
      ...offer.quote,
      signature: offer.signature,
      taskService: offer.task.service,
      brief: offer.task.brief,
      evidence: offer.task.evidence,
      deliverable: offer.deliverable,
    }
    // Signed offers are immutable snapshots.
    db.insert(quotes).values(row).onConflictDoNothing().run()
  }
  function getQuote(id: string): SignedQuote | undefined {
    const row = db.select().from(quotes).where(eq(quotes.id, id)).get()
    if (!row) {
      return undefined
    }
    return {
      id: row.id,
      signature: row.signature,
      deliverable: row.deliverable,
      quote: {
        allowanceId: row.allowanceId,
        service: row.service,
        requestHash: row.requestHash,
        recipient: row.recipient,
        amount: row.amount,
        nonce: row.nonce,
        expiresAt: row.expiresAt,
      },
      task: {
        service: row.taskService,
        brief: row.brief,
        evidence: row.evidence,
      },
    }
  }
  function saveDelivery(delivery: Delivery) {
    db.transaction(() => {
      const { references, ...fields } = delivery
      const row = { ...fields, error: fields.error ?? null }
      db.insert(deliveries)
        .values(row)
        .onConflictDoUpdate({ target: deliveries.purchaseId, set: row })
        .run()
      db.delete(deliveryReferences)
        .where(eq(deliveryReferences.purchaseId, delivery.purchaseId))
        .run()
      if (references.length) {
        db.insert(deliveryReferences)
          .values(
            references.map((reference, position) => ({
              purchaseId: delivery.purchaseId,
              position,
              reference,
            }))
          )
          .run()
      }
    })
  }
  function getDelivery(id: string): Delivery | undefined {
    const row = db
      .select()
      .from(deliveries)
      .where(eq(deliveries.purchaseId, id))
      .get()
    if (!row) {
      return undefined
    }
    return {
      ...row,
      error: row.error ?? undefined,
      references: db
        .select()
        .from(deliveryReferences)
        .where(eq(deliveryReferences.purchaseId, id))
        .orderBy(deliveryReferences.position)
        .all()
        .map((row) => row.reference),
    }
  }
  return { saveQuote, getQuote, saveDelivery, getDelivery }
}
