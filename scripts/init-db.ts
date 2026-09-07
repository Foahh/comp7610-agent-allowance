import { openDatabase } from "@repo/db"
import { readConfig } from "@repo/utils/config"

const config = readConfig()
const configuredPaths = {
  buyer: process.env.DATABASE_PATH,
  provider: process.env.PROVIDER_DATABASE_PATH,
}

for (const role of ["buyer", "provider"] as const) {
  const store = openDatabase(
    configuredPaths[role] ||
      `${config.root}data/${role}-${config.chainId}.sqlite`
  )

  store.close()
  console.log(`${role} database initialized`)
}
