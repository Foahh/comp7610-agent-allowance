import { serve } from "@hono/node-server"
import { readConfig } from "@repo/utils/config"
import { validateDeployment } from "@repo/utils/deployment"

import { createInstallation } from "./installation.ts"

const DEFAULT_API_PORT = 3001
const apiPort = Number(process.env.API_PORT || DEFAULT_API_PORT)
const sellerPort = Number(process.env.SELLER_PORT || apiPort + 1)
const installation = createInstallation(
  readConfig(),
  validateDeployment,
  "seller"
)
const server = serve({
  hostname: "0.0.0.0",
  port: sellerPort,
  fetch(request, env) {
    const { pathname } = new URL(request.url)

    if (pathname === "/health") {
      return Response.json({ status: "ok", service: "seller" })
    }

    if (!pathname.startsWith("/sellers/")) {
      return new Response("Not found", { status: 404 })
    }

    return installation.app.fetch(request, env)
  },
})

function shutdown() {
  server.close(() => {
    installation.close()
    process.exit(0)
  })
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, shutdown)
}
