import { DatabaseSync } from "node:sqlite"
import { expect, test } from "vite-plus/test"

import { migratePurchaseConfirmations } from "./migrate-purchase-confirmations.ts"

test("existing purchases survive the repeatable confirmation-progress migration", () => {
  const sqlite = new DatabaseSync(":memory:")
  try {
    sqlite.exec(
      "CREATE TABLE purchases (id TEXT PRIMARY KEY, tx_hash TEXT); INSERT INTO purchases VALUES ('paid', '0xsubmitted')"
    )
    migratePurchaseConfirmations(sqlite)
    migratePurchaseConfirmations(sqlite)
    expect(sqlite.prepare("SELECT * FROM purchases").get()).toEqual({
      id: "paid",
      tx_hash: "0xsubmitted",
      confirmations: null,
      required_confirmations: null,
    })
    sqlite.exec(
      "UPDATE purchases SET confirmations = 1, required_confirmations = 2"
    )
    expect(
      sqlite
        .prepare("SELECT confirmations, required_confirmations FROM purchases")
        .get()
    ).toEqual({
      confirmations: 1,
      required_confirmations: 2,
    })
  } finally {
    sqlite.close()
  }
})
