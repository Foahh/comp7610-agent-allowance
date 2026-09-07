import { openDatabase } from "@repo/db"
import { readConfig } from "@repo/utils/config"
import { createProviderApp } from "./app.ts"

const config = readConfig()
const store = openDatabase(
  process.env.PROVIDER_DATABASE_PATH ||
    config.root + "data/provider-" + config.chainId + ".sqlite"
)
const app = createProviderApp(config, store)

if (import.meta.hot) {
  import.meta.hot.dispose(() => store.close())
}
export default app
