import assert from "node:assert/strict"
import { describe, test } from "vite-plus/test"
import type { Address, Hex } from "viem"
import { catalog } from "../catalog.ts"
import { createProviderApp } from "../app.ts"
import { openProviderDatabase } from "../store.ts"
import type { Config } from "@repo/utils/config"
import { createCapabilityRoutes } from "./capabilities/index.ts"
import { createQuoteRoutes } from "./quotes/index.ts"
import { createTaskRoutes } from "./tasks/index.ts"

const providerAddress = "0x0000000000000000000000000000000000000001" as Address
const transactionHash = ("0x" + "1".repeat(64)) as Hex
const config = {
  root: "D:\\project\\",
  chainId: 31337,
  rpcUrl: "http://127.0.0.1:8545",
  confirmations: 1,
  provider: providerAddress,
  token: providerAddress,
  vault: providerAddress,
  providerUrl: "http://127.0.0.1:3002",
  appOrigin: "http://127.0.0.1:3000",
} satisfies Config

describe("provider routes", () => {
  test("mounts public routes on the provider application", async () => {
    const store = openProviderDatabase(":memory:")
    try {
      const app = createProviderApp(config, store)

      assert.equal((await app.request("/health")).status, 200)
      assert.equal((await app.request("/capabilities")).status, 200)
    } finally {
      store.close()
    }
  })

  test("lists capabilities", async () => {
    const routes = createCapabilityRoutes(providerAddress)

    const response = await routes.request("/")
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(body, {
      name: "Exchange Evidence Specialist",
      provider: providerAddress,
      services: catalog,
    })
  })

  test("validates and delegates quote requests", async () => {
    const requests: unknown[] = []
    const routes = createQuoteRoutes({
      async createQuote(allowanceId, task) {
        requests.push({ allowanceId, task })
        return { clarification: "Which comparison should be used?" }
      },
    })

    const response = await routes.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        allowanceId: "1",
        task: {
          service: "analysis",
          brief: "Compare the available cities.",
          evidence: "",
        },
      }),
    })

    assert.equal(response.status, 200)
    assert.equal(requests.length, 1)
  })

  test("delegates delivery creation and retrieval", async () => {
    const calls: string[] = []
    const routes = createTaskRoutes({
      async runDelivery(id, signature, txHash) {
        calls.push(`create:${id}:${signature}:${txHash}`)
        return {
          purchaseId: id,
          status: "completed",
          content: "result",
          references: [],
          modelMs: 1,
          deliveryMs: 2,
        }
      },
      async getDelivery(id, signature) {
        calls.push(`get:${id}:${signature}`)
        return { status: "pending" }
      },
    })
    const signature = "0x1234"

    const created = await routes.request("/purchase-1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-signature": signature,
      },
      body: JSON.stringify({ txHash: transactionHash }),
    })
    const retrieved = await routes.request("/purchase-1", {
      headers: { "x-agent-signature": signature },
    })

    assert.equal(created.status, 200)
    assert.equal(retrieved.status, 200)
    assert.deepEqual(calls, [
      `create:purchase-1:${signature}:${transactionHash}`,
      `get:purchase-1:${signature}`,
    ])
  })
})
