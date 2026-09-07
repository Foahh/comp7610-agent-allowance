import type { Config } from "@repo/utils/config"
import type { Address } from "viem"

import { Hono } from "hono"

export function createConfigRoutes(config: Config, agentAddress: Address) {
  const app = new Hono()

  return app.get("/", (context) =>
    context.json({
      chainId: config.chainId,
      vault: config.vault,
      token: config.token,
      agent: agentAddress,
      provider: config.provider,
      // Never send a credential-bearing RPC URL to the browser.
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    })
  )
}
