import { openDatabase } from "@repo/db"
import { readConfig } from "@repo/utils/config"

const config = readConfig()
const configuredPaths = {
  buyer: process.env.DATABASE_PATH,
  seller: process.env.SELLER_DATABASE_PATH,
}

for (const role of ["buyer", "seller"] as const) {
  const store = openDatabase(
    configuredPaths[role] || `${config.dataDir}/${role}.sqlite`
  )

  store.close()
  console.log(`${role} database initialized`)
}
