import { openDatabase, type Store } from "@repo/db"
import type { Delivery, SignedQuote } from "@repo/schemas"

type ProviderTables = {
  quotes: SignedQuote
  jobs: Delivery
}

export type ProviderStore = Store<ProviderTables>

export function openProviderDatabase(filename?: string) {
  return openDatabase<ProviderTables>(filename)
}
