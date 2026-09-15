import type {
  Conversation,
  Message,
  Purchase,
  PurchasePlanItem,
} from "@repo/schemas"

import {
  openDatabase,
  eq,
  and,
  inArray,
  notInArray,
  deletedConversations,
  conversations,
  messages,
  allowances,
  purchases,
  quotes,
  runs,
  challenges,
  sessions,
  purchasePlanItems,
} from "@repo/db"
import { createRecordQueries } from "@repo/db/records"

export function openBuyerDatabase(filename: string) {
  const connection = openDatabase(filename)
  const { db } = connection
  const records = createRecordQueries(db)

  function getPurchase(id: string): Purchase | undefined {
    const row = db.select().from(purchases).where(eq(purchases.id, id)).get()

    if (!row) {
      return undefined
    }

    const offer = records.getQuote(id)

    if (!offer) {
      throw new Error("Purchase quote is missing.")
    }

    const { buyerSignature, authorizationFromBlock, ...purchaseRow } = row
    return {
      ...purchaseRow,
      authorization:
        authorizationFromBlock === null
          ? undefined
          : {
              fromBlock: authorizationFromBlock,
              signature: buyerSignature ?? undefined,
            },
      offer,
      delivery: records.getDelivery(id),
      txHash: row.txHash ?? undefined,
      gasUsed: row.gasUsed ?? undefined,
      gasWei: row.gasWei ?? undefined,
      error: row.error ?? undefined,
    }
  }

  function savePurchase(purchase: Purchase) {
    db.transaction((tx) => {
      const transactionRecords = createRecordQueries(tx)
      transactionRecords.saveQuote(purchase.offer, purchase.conversationId)

      const row = {
        id: purchase.id,
        conversationId: purchase.conversationId,
        paymentStatus: purchase.paymentStatus,
        createdAt: purchase.createdAt,
        txHash: purchase.txHash ?? null,
        buyerSignature: purchase.authorization?.signature ?? null,
        authorizationFromBlock: purchase.authorization?.fromBlock ?? null,
        gasUsed: purchase.gasUsed ?? null,
        gasWei: purchase.gasWei ?? null,
        error: purchase.error ?? null,
      }
      tx.insert(purchases)
        .values(row)
        .onConflictDoUpdate({ target: purchases.id, set: row })
        .run()

      if (purchase.delivery) {
        transactionRecords.saveDelivery(purchase.delivery)
      }
    })
  }

  function listPurchases(conversationId?: string, unresolved = false) {
    return db
      .select({ id: purchases.id })
      .from(purchases)
      .where(
        and(
          conversationId === undefined
            ? undefined
            : eq(purchases.conversationId, conversationId),
          unresolved
            ? inArray(purchases.paymentStatus, ["prepared", "pending"])
            : undefined
        )
      )
      .orderBy(purchases.createdAt)
      .all()
      .map((row) => getPurchase(row.id)!)
  }

  function saveConversation(conversation: Conversation) {
    db.insert(conversations)
      .values(conversation)
      .onConflictDoUpdate({ target: conversations.id, set: conversation })
      .run()
  }

  function withConversationTitle(conversation: Conversation): Conversation {
    if (
      !["Exchange semester", "Allowance boundary", "New conversation"].includes(
        conversation.title
      )
    ) {
      return conversation
    }
    const first = db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversation.id),
          eq(messages.role, "user")
        )
      )
      .orderBy(messages.createdAt)
      .get()
    return first
      ? {
          ...conversation,
          title: first.content.replace(/\s+/g, " ").slice(0, 120),
        }
      : conversation
  }

  return {
    ...connection,
    ...records,
    getPurchase,
    savePurchase,
    listPurchases,
    saveConversation,
    savePurchasePlan(conversationId: string, items: PurchasePlanItem[]) {
      const rows = items.map(({ task, listing, recipient }, position) => {
        if (task.service !== listing.id || task.version !== listing.version) {
          throw new Error("Planned task must match its listing and version.")
        }
        const { id: listingId, version: listingVersion, ...details } = listing
        return {
          conversationId,
          position,
          recipient,
          listingId,
          listingVersion,
          sellerId: task.sellerId,
          requestId: task.requestId,
          brief: task.brief,
          evidence: task.evidence,
          ...details,
        }
      })
      db.transaction((tx) => {
        tx.delete(purchasePlanItems)
          .where(eq(purchasePlanItems.conversationId, conversationId))
          .run()
        if (rows.length) {
          tx.insert(purchasePlanItems).values(rows).run()
        }
      })
    },
    getPurchasePlan(conversationId: string): PurchasePlanItem[] {
      return db
        .select()
        .from(purchasePlanItems)
        .where(eq(purchasePlanItems.conversationId, conversationId))
        .orderBy(purchasePlanItems.position)
        .all()
        .map((row) => ({
          recipient: row.recipient,
          task: {
            service: row.listingId,
            version: row.listingVersion,
            sellerId: row.sellerId,
            requestId: row.requestId,
            brief: row.brief,
            evidence: row.evidence,
          },
          listing: {
            id: row.listingId,
            version: row.listingVersion,
            name: row.name,
            description: row.description,
            preview: row.preview,
            type: row.type,
            amount: row.amount,
            requiredInputs: row.requiredInputs,
            deliverable: row.deliverable,
            scope: row.scope,
            contentHash: row.contentHash,
          },
        }))
    },
    deleteConversation(id: string) {
      db.transaction((tx) => {
        // Keep allowance bindings and the payment journal for reconciliation.
        tx.insert(deletedConversations)
          .values({ conversationId: id, deletedAt: Date.now() })
          .onConflictDoNothing()
          .run()
        tx.delete(messages).where(eq(messages.conversationId, id)).run()
        tx.delete(purchasePlanItems)
          .where(eq(purchasePlanItems.conversationId, id))
          .run()
      })
    },
    listUnresolvedPurchases() {
      return listPurchases(undefined, true)
    },
    getConversation(id: string) {
      const conversation = db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, id),
            notInArray(
              conversations.id,
              db
                .select({ id: deletedConversations.conversationId })
                .from(deletedConversations)
            )
          )
        )
        .get()
      return conversation ? withConversationTitle(conversation) : undefined
    },
    listConversations(owner: string) {
      return db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.owner, owner),
            notInArray(
              conversations.id,
              db
                .select({ id: deletedConversations.conversationId })
                .from(deletedConversations)
            )
          )
        )
        .orderBy(conversations.createdAt)
        .all()
        .map(withConversationTitle)
    },
    saveMessage(message: Message) {
      db.insert(messages).values(message).run()
    },
    listMessages(conversationId: string) {
      return db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt)
        .all()
    },
    hasQuote(id: string, conversationId: string) {
      return !!db
        .select({ id: quotes.id })
        .from(quotes)
        .where(
          and(eq(quotes.id, id), eq(quotes.conversationId, conversationId))
        )
        .get()
    },
    getAllowance(allowanceId: string) {
      return db
        .select()
        .from(allowances)
        .where(eq(allowances.allowanceId, allowanceId))
        .get()
    },
    bindAllowance(conversation: Conversation, allowanceId: string) {
      db.transaction(() => {
        const bound = db
          .select()
          .from(allowances)
          .where(eq(allowances.allowanceId, allowanceId))
          .get()

        if (bound && bound.conversationId !== conversation.id) {
          throw new Error("Allowance already belongs to another conversation.")
        }

        db.insert(allowances)
          .values({
            allowanceId: allowanceId,
            conversationId: conversation.id,
          })
          .onConflictDoNothing()
          .run()

        saveConversation({ ...conversation, allowanceId })
      })
    },
    acceptRun(id: string, conversationId: string) {
      return (
        db
          .insert(runs)
          .values({ id, conversationId, acceptedAt: Date.now() })
          .onConflictDoNothing()
          .returning({ id: runs.id })
          .get() !== undefined
      )
    },
    saveChallenge(challenge: typeof challenges.$inferInsert) {
      db.insert(challenges).values(challenge).run()
    },
    getChallenge(id: string) {
      return db.select().from(challenges).where(eq(challenges.id, id)).get()
    },
    removeChallenge(id: string) {
      db.delete(challenges).where(eq(challenges.id, id)).run()
    },
    consumeChallenge(id: string) {
      return db
        .delete(challenges)
        .where(eq(challenges.id, id))
        .returning()
        .get()
    },
    removeOwnerSessions(owner: string) {
      db.delete(sessions).where(eq(sessions.owner, owner)).run()
    },
    saveSession(session: typeof sessions.$inferInsert) {
      db.insert(sessions).values(session).run()
    },
    getSession(id: string) {
      return db.select().from(sessions).where(eq(sessions.id, id)).get()
    },
    removeSession(id: string) {
      db.delete(sessions).where(eq(sessions.id, id)).run()
    },
  }
}

export type BuyerStore = ReturnType<typeof openBuyerDatabase>
