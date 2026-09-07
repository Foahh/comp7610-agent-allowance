import { openDatabase } from "@repo/db"
import { readConfig } from "@repo/utils/config"
import { createApp } from "./app.ts"
import { createPayments } from "./payments.ts"

const config = readConfig()
const database = openDatabase(
  process.env.DATABASE_PATH ||
    config.root + "data/buyer-" + config.chainId + ".sqlite"
)
const payments = createPayments(config, database)

// Reconcile the durable journal before accepting another signing request.
await payments.recoverAll()
const app = createApp(config, database, payments)

if (import.meta.hot) {
  import.meta.hot.dispose(() => database.close())
}
export default app
