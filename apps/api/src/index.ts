import { bindInstallation } from "@repo/db/marketplace"
import { readConfig, signer } from "@repo/utils/config"

import { createApp } from "./app.ts"
import { createPayments } from "./lib/payments.ts"
import { openBuyerDatabase } from "./lib/store.ts"
import { openSellerDatabase } from "./seller/lib/store.ts"

const config = readConfig()
const database = openBuyerDatabase(
  process.env.DATABASE_PATH || `${config.dataDir}/buyer.sqlite`,
  `${config.chainId}:${config.vault.toLowerCase()}:`
)
const payments = createPayments(config, database)

if (config.owner.toLowerCase() === payments.account.address.toLowerCase()) {
  throw new Error(
    "OWNER_ADDRESS must be a separate browser wallet. Keep its private key out of backend configuration."
  )
}

if (BigInt(config.vault) !== 0n && BigInt(config.owner) !== 0n) {
  bindInstallation(database.db, {
    chain: config.chainId.toString(),
    vault: config.vault.toLowerCase(),
    role: "buyer",
    signer: payments.account.address.toLowerCase(),
  })
}

// Reconcile the durable journal before accepting another signing request.
await payments.recoverAll()

const sellerStore = openSellerDatabase(`${config.dataDir}/seller.sqlite`)

if (BigInt(config.vault) !== 0n) {
  bindInstallation(sellerStore.db, {
    role: "seller",
    chain: config.chainId.toString(),
    vault: config.vault.toLowerCase(),
    signer: signer("seller", config).address.toLowerCase(),
  })
}

const app = createApp(config, database, payments, sellerStore)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    database.close()
    sellerStore.close()
  })
}

export default app
