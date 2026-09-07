import {
  openDatabase,
  eq,
  and,
  inArray,
  conversations,
  messages,
  allowances,
  purchases,
  quotes,
  runs,
  challenges,
  sessions,
} from "@repo/db"
import { createRecordQueries } from "@repo/db/records"
import type { Conversation, Message, Purchase } from "@repo/schemas"

export function openBuyerDatabase(filename?: string) {
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
    return {
      ...row,
      offer,
      delivery: records.getDelivery(id),
      txHash: row.txHash ?? undefined,
      rawTransaction: row.rawTransaction ?? undefined,
      nonce: row.nonce ?? undefined,
      gasUsed: row.gasUsed ?? undefined,
      gasWei: row.gasWei ?? undefined,
      paymentMs: row.paymentMs ?? undefined,
      broadcastMs: row.broadcastMs ?? undefined,
      confirmationMs: row.confirmationMs ?? undefined,
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
        rawTransaction: purchase.rawTransaction ?? null,
        nonce: purchase.nonce ?? null,
        gasUsed: purchase.gasUsed ?? null,
        gasWei: purchase.gasWei ?? null,
        paymentMs: purchase.paymentMs ?? null,
        broadcastMs: purchase.broadcastMs ?? null,
        confirmationMs: purchase.confirmationMs ?? null,
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
  return {
    ...connection,
    ...records,
    getPurchase,
    savePurchase,
    listPurchases,
    saveConversation,
    listUnresolvedPurchases() {
      return listPurchases(undefined, true)
    },
    getConversation(id: string) {
      return db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id))
        .get()
    },
    listConversations(owner: string) {
      return db
        .select()
        .from(conversations)
        .where(eq(conversations.owner, owner))
        .orderBy(conversations.createdAt)
        .all()
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
          .values({ allowanceId, conversationId: conversation.id })
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
