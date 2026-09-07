import { openDatabase } from "@repo/db"
import { createRecordQueries } from "@repo/db/records"

export function openProviderDatabase(filename?: string) {
  const connection = openDatabase(filename)
  return { ...connection, ...createRecordQueries(connection.db) }
}

export type ProviderStore = ReturnType<typeof openProviderDatabase>
