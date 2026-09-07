import assert from "node:assert/strict"
import { describe, test } from "vite-plus/test"
import type { Address } from "viem"
import { LOCAL_CHAIN_ID } from "@repo/utils"
import type { Config } from "@repo/utils/config"
import { createApp } from "../app.ts"
import { openBuyerDatabase } from "../store.ts"
import { createConfigRoutes } from "./config/index.ts"
import { createHealthRoutes } from "./health/index.ts"

const address = "0x0000000000000000000000000000000000000001" as Address

const config = {
  root: "D:\\project\\",
  chainId: LOCAL_CHAIN_ID,
  rpcUrl: "http://127.0.0.1:8545",
  confirmations: 1,
  provider: address,
  token: address,
  vault: address,
  providerUrl: "http://127.0.0.1:3002",
  appOrigin: "http://127.0.0.1:3000",
} satisfies Config

describe("system routes", () => {
  test("mounts system routes at their public API paths", async () => {
    const store = openBuyerDatabase(":memory:")
    try {
      const app = createApp(config, store)

      assert.equal((await app.request("/api/health")).status, 200)
      assert.equal((await app.request("/api/config")).status, 200)
    } finally {
      store.close()
    }
  })

  test("reports database health", async () => {
    let checked = false
    const routes = createHealthRoutes(() => {
      checked = true
    })

    const response = await routes.request("/")

    assert.equal(response.status, 200)
    assert.equal(checked, true)
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "api",
      database: "ok",
    })
  })

  test("reports a database failure without leaking its error", async () => {
    const routes = createHealthRoutes(() => {
      throw new Error("private database details")
    })

    const response = await routes.request("/")

    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), {
      status: "error",
      service: "api",
      database: "unavailable",
    })
  })

  test("exposes the public application configuration", async () => {
    const routes = createConfigRoutes(config, address)

    const response = await routes.request("/")
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(body, {
      chainId: LOCAL_CHAIN_ID,
      vault: address,
      token: address,
      agent: address,
      provider: address,
      rpcUrl: config.rpcUrl,
    })
  })
})
