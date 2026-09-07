import { readConfig } from "@repo/utils/config"
import { defineConfig } from "drizzle-kit"

const config = readConfig()

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  dbCredentials: {
    url:
      process.env.DATABASE_PATH ||
      `${config.root}data/buyer-${config.chainId}.sqlite`,
  },
})
