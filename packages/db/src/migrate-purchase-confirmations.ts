import type { DatabaseSync } from "node:sqlite"

export function migratePurchaseConfirmations(sqlite: DatabaseSync) {
  const columns = sqlite.prepare("PRAGMA table_info(purchases)").all() as {
    name: string
  }[]
  for (const column of ["confirmations", "required_confirmations"]) {
    if (!columns.some(({ name }) => name === column)) {
      sqlite.exec(`ALTER TABLE purchases ADD COLUMN ${column} INTEGER`)
    }
  }
}
