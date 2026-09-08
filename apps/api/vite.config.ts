import devServer from "@hono/vite-dev-server"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite-plus"

const workspacePackagePattern = /^@repo\//

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url))

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, workspaceRoot, "API_")
  const port = Number(process.env.API_PORT || environment.API_PORT || 3001)

  return {
    appType: "custom",
    plugins: [
      build({
        entry: "src/index.ts",
        entryContentAfterHooks: [
          (appName) => `
          import { serve } from "@hono/node-server"
          const server = serve({
            fetch: ${appName}.fetch,
            hostname: process.env.API_HOST || "127.0.0.1",
            port: Number(process.env.API_PORT || 3001),
          })
          for (const signal of ["SIGINT", "SIGTERM"]) {
            process.on(signal, () => {
              server.close(() => process.exit(0))
              setTimeout(() => process.exit(1), 5000).unref()
            })
          }
        `,
        ],
      }),
      devServer({ entry: "src/index.ts" }),
    ],
    server: {
      host: process.env.API_HOST || environment.API_HOST || "localhost",
      port,
      strictPort: true,
    },
    ssr: { noExternal: [workspacePackagePattern] },
    build: {
      target: "node24",
      sourcemap: true,
    },
  }
})

import build from "@hono/vite-build/node"
