import { openDatabase, type Store } from "@repo/db"
import type {
  Conversation,
  Message,
  Purchase,
  SignedQuote,
} from "@repo/schemas"

export type Session = {
  owner: string
  expiresAt: number
}

export type Challenge = {
  owner: string
  message: string
  expiresAt: number
}

type AllowanceBinding = {
  conversationId: string
  allowanceId: string
}

type AcceptedRun = {
  acceptedAt: number
}

type BuyerTables = {
  conversations: Conversation
  messages: Message
  allowances: AllowanceBinding
  quotes: SignedQuote
  purchases: Purchase
  jobs: AcceptedRun
  challenges: Challenge
  sessions: Session
}

export type BuyerStore = Store<BuyerTables>

export function openBuyerDatabase(filename?: string) {
  return openDatabase<BuyerTables>(filename)
}
