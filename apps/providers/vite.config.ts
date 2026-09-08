import devServer from "@hono/vite-dev-server"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite-plus"

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url))

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, workspaceRoot, "PROVIDERS_PORT")
  const port = Number(
    process.env.PROVIDERS_PORT || environment.PROVIDERS_PORT || 3002
  )

  return {
    appType: "custom",
    plugins: [
      build({ entry: "src/index.ts", port, shutdownTimeoutMs: 5000 }),
      devServer({ entry: "src/index.ts" }),
    ],
    server: { host: "localhost", port, strictPort: true },
    ssr: { noExternal: [/^@repo\//] },
    build: {
      target: "node24",
      sourcemap: true,
    },
  }
})
import build from "@hono/vite-build/node"
