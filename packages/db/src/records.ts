import type { Delivery, SignedQuote } from "@repo/schemas"

import { eq } from "drizzle-orm"

import type { Database } from "./index.ts"

import {
  quotes,
  deliveries,
  deliveryReferences,
  operationRecords,
} from "./schema.ts"

export function createRecordQueries(
  db: Pick<Database, "select" | "insert" | "delete" | "transaction">
) {
  function saveQuote(offer: SignedQuote, conversationId?: string) {
    const row = {
      snapshot: offer,
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

    return row.snapshot
  }

  function saveDelivery(delivery: Delivery) {
    db.transaction(() => {
      const { references, file, ...fields } = delivery
      const row = {
        ...fields,
        fileName: file?.name ?? null,
        fileSize: file?.size ?? null,
        fileMediaType: file?.mediaType ?? null,
        fileHash: file?.hash ?? null,
        error: fields.error ?? null,
      }

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

    const { fileName, fileSize, fileMediaType, fileHash, ...fields } = row

    return {
      ...fields,
      file:
        fileName && fileHash && fileSize !== null && fileMediaType
          ? {
              name: fileName,
              hash: fileHash,
              size: fileSize,
              mediaType: fileMediaType,
            }
          : undefined,
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

  return {
    saveQuote,
    getQuote,
    saveDelivery,
    getDelivery,
    getOperation(id: string) {
      return db
        .select()
        .from(operationRecords)
        .where(eq(operationRecords.id, id))
        .get()?.value
    },
    saveOperation(id: string, value: unknown) {
      db.insert(operationRecords)
        .values({ id, value })
        .onConflictDoUpdate({ target: operationRecords.id, set: { value } })
        .run()
    },
  }
}
