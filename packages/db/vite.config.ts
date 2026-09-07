import { defineConfig } from "vite-plus"

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/schema.ts", "src/records.ts"],
    platform: "node",
    format: "esm",
    dts: true,
  },
})
