import devServer from "@hono/vite-dev-server"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite-plus"

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url))

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, workspaceRoot, "API_PORT")
  const port = Number(process.env.API_PORT || environment.API_PORT || 3001)

  return {
    appType: "custom",
    plugins: [
      build({ entry: "src/index.ts", port, shutdownTimeoutMs: 5000 }),
      devServer({ entry: "src/index.ts" }),
    ],
    server: { host: "127.0.0.1", port, strictPort: true },
    ssr: { noExternal: [/^@repo\//] },
    build: {
      target: "node24",
      sourcemap: true,
    },
  }
})

import build from "@hono/vite-build/node"
