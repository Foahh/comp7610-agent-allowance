import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite-plus"

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url))

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, workspaceRoot, "API_")
  const apiPort = process.env.API_PORT || environment.API_PORT || "3001"

  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    server: {
      host: "127.0.0.1",
      port: 3000,
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${apiPort}` },
    },
    preview: {
      host: "127.0.0.1",
      port: 3000,
      strictPort: true,
    },
  }
})
