import { openDatabase } from "@repo/db"
import { createRecordQueries } from "@repo/db/records"

export function openSellerDatabase(filename?: string) {
  const connection = openDatabase(filename)

  return { ...connection, ...createRecordQueries(connection.db) }
}

export type SellerStore = ReturnType<typeof openSellerDatabase>
