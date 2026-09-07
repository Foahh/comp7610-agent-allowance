import { openDatabase } from "@repo/db"
import { readConfig } from "@repo/utils/config"

const config = readConfig()
for (const role of ["buyer", "provider"]) {
  const configuredPath =
    role === "buyer"
      ? process.env.DATABASE_PATH
      : process.env.PROVIDER_DATABASE_PATH
  const store = openDatabase(
    configuredPath || `${config.root}data/${role}-${config.chainId}.sqlite`
  )
  store.close()
  console.log(role + " database initialized")
}
