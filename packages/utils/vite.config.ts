import { defineConfig } from "vite-plus"

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/config.ts", "src/model.ts"],
    platform: "node",
    format: "esm",
    dts: { tsgo: true },
    exports: false,
  },
})
