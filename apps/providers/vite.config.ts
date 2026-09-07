import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite-plus"
import devServer from "@hono/vite-dev-server"

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url))

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, workspaceRoot, "PROVIDERS_PORT")
  const port = Number(
    process.env.PROVIDERS_PORT || environment.PROVIDERS_PORT || 3002
  )

  return {
    appType: "custom",
    plugins: [devServer({ entry: "src/index.ts" })],
    server: { host: "127.0.0.1", port, strictPort: true },
    ssr: { noExternal: [/^@repo\//] },
    build: {
      ssr: "src/index.ts",
      target: "node24",
      sourcemap: true,
    },
  }
})
