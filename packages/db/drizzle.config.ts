import { defineConfig } from "drizzle-kit"
import { fileURLToPath } from "node:url"

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_PATH ||
      fileURLToPath(new URL("../../data/data.sqlite", import.meta.url)),
  },
})
