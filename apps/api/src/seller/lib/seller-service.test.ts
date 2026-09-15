import type { SignedQuote, Task } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { deliveryMessage, vaultAbi } from "@repo/utils"
import { Hono } from "hono"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiParameters,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test"

import { createProtocolRoutes } from "../routes/protocol.ts"
import { createMarketplace } from "./marketplace.ts"
import { createSellerService } from "./seller-service.ts"
import { openSellerDatabase } from "./store.ts"

const chain = vi.hoisted(() => ({
  getBlock: vi.fn(),
  readContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}))
vi.mock("@repo/utils", async (original) => ({
  ...(await original<typeof import("@repo/utils")>()),
  publicClient: () => chain,
}))
const sellerKey = `0x${"1".padStart(64, "0")}` as const
const buyer = privateKeyToAccount(`0x${"2".padStart(64, "0")}`)
const seller = privateKeyToAccount(sellerKey)
vi.mock("@repo/utils/config", async (original) => ({
  ...(await original<typeof import("@repo/utils/config")>()),
  signer: () => seller,
}))

const vault = "0x0000000000000000000000000000000000000009"
const txHash = `0x${"a".repeat(64)}` as const
let directory: string
let store: ReturnType<typeof openSellerDatabase>
let market: ReturnType<typeof createMarketplace>
let service: ReturnType<typeof createSellerService>
let config: Config
let task: Task

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "seller-protocol-test-"))
  config = {
    credentialsDir: join(directory, "credentials"),
    cookieName: "test",
    dataDir: directory,
    local: false,
    localInstallation: 0,
    chainId: 11155111,
    vault,
    token: vault,
    rpcUrl: "https://example.invalid",
    confirmations: 2,
    root: directory,
    owner: seller.address,
    sellerPublicUrl: "http://localhost:3002",
    appOrigin: "http://localhost:3000",
  } as Config
  store = openSellerDatabase(join(directory, "seller.sqlite"))
  market = createMarketplace(config, store)
  service = createSellerService(config, store, market)
  const listing = market.saveListing({
    name: "Guide",
    description: "Public description",
    preview: "Public preview",
    type: "text",
    content: "Private paid guide",
    amount: "10000",
    assetId: "",
    modelId: "",
    instructions: "",
    requiredInputs: "",
    scope: "One copy",
    deliverable: "The guide",
    assetIds: [],
  })
  market.publish(listing.id, true)
  task = {
    service: listing.id,
    version: 1,
    sellerId: "connection",
    requestId: "request-1",
    brief: "",
    evidence: "",
  }
  chain.getBlock.mockResolvedValue({ timestamp: 1000n })
  chain.readContract.mockImplementation(({ functionName }) =>
    Promise.resolve(
      functionName === "allowanceSellers"
        ? [seller.address]
        : functionName === "deliverySigners"
          ? buyer.address
          : [buyer.address, buyer.address]
    )
  )
  chain.waitForTransactionReceipt.mockReset()
})

afterEach(() => {
  store.close()
  rmSync(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

async function quoted() {
  const result = await service.createQuote("1", task)

  if (!("offer" in result)) {
    throw new Error("Expected a static quote.")
  }

  return result.offer
}

function payment(offer: SignedQuote) {
  return {
    status: "success",
    logs: [
      {
        address: vault,
        topics: encodeEventTopics({
          abi: vaultAbi,
          eventName: "Purchased",
          args: {
            purchaseId: offer.id as `0x${string}`,
            allowanceId: 1n,
            recipient: seller.address,
          },
        }),
        data: encodeAbiParameters(
          parseAbiParameters("uint256,bytes32,bytes32"),
          [
            BigInt(offer.quote.amount),
            offer.quote.service as `0x${string}`,
            offer.quote.requestHash as `0x${string}`,
          ]
        ),
      },
    ],
  }
}

test("duplicate quote requests share one signed offer, and reuse with different inputs is rejected", async () => {
  const [first, second] = await Promise.all([quoted(), quoted()])
  expect(first.id).toBe(second.id)
  await expect(
    service.createQuote("1", { ...task, brief: "Changed input" })
  ).rejects.toThrow("different inputs")
})

test("delivery requires an exact successful payment and uses the quoted version after edits", async () => {
  const offer = await quoted()
  chain.waitForTransactionReceipt.mockResolvedValue({
    status: "reverted",
    logs: [],
  })
  await expect(service.deliver(offer, txHash)).rejects.toThrow("exact quote")
  expect(store.getDelivery(offer.id)).toBeUndefined()
  chain.waitForTransactionReceipt.mockResolvedValue(payment(offer))
  const listing = market.listings.get(task.service)!
  market.saveListing({ ...listing, content: "A different guide" }, listing.id)
  market.publish(listing.id, false)
  const [first, second] = await Promise.all([
    service.deliver(offer, txHash),
    service.deliver(offer, txHash),
  ])
  expect(first.content).toBe("Private paid guide")
  expect(second).toEqual(first)
  expect(service.orders()[0]?.paymentStatus).toBe("confirmed")
  store.close()
  store = openSellerDatabase(join(directory, "seller.sqlite"))
  market = createMarketplace(config, store)
  service = createSellerService(config, store, market)
  expect(await service.deliver(offer, txHash)).toEqual(first)
})

test("delivery authorization is bound to buyer, purpose, chain/vault, and expiry", async () => {
  const offer = await quoted()
  const expiresAt = Math.floor(Date.now() / 1000) + 120
  const signature = await buyer.signMessage({
    message: deliveryMessage(
      offer.id,
      config.chainId,
      vault,
      "status",
      expiresAt
    ),
  })
  expect(
    (await service.authorize(offer.id, "status", signature, expiresAt)).id
  ).toBe(offer.id)
  await expect(
    service.authorize(offer.id, "file", signature, expiresAt)
  ).rejects.toThrow()
  await expect(
    service.authorize(offer.id, "status", signature, 1)
  ).rejects.toThrow()
  const outsider = await seller.signMessage({
    message: deliveryMessage(
      offer.id,
      config.chainId,
      vault,
      "status",
      expiresAt
    ),
  })
  await expect(
    service.authorize(offer.id, "status", outsider, expiresAt)
  ).rejects.toThrow()
})

test("public routes do not expose private management or unpaid files", async () => {
  const app = new Hono().route(
    "/v1",
    createProtocolRoutes(config, market, service, store)
  )
  const catalog = await (await app.request("/v1/catalog")).text()
  expect(catalog).not.toContain("Private paid guide")
  expect((await app.request("/internal/listings")).status).toBe(404)
  expect((await app.request("/internal/runtime-model")).status).toBe(404)
  const offer = await quoted()
  expect(() => service.file(offer.id)).toThrow("completed file purchase")
})

test("paid file delivery is authenticated, and a failed delivery retries without a new quote", async () => {
  const asset = market.saveAsset(
    "guide.txt",
    "text/plain",
    Buffer.from("Purchased attachment")
  )
  const listing = market.listings.get(task.service)!
  const updated = market.saveListing(
    { ...listing, type: "file", assetId: asset.id },
    listing.id
  )
  market.publish(listing.id, true)
  task.version = updated.version
  const offer = await quoted()
  market.deleteListing(listing.id)
  expect(() => market.deleteAsset(asset.id)).toThrow("file order")
  chain.waitForTransactionReceipt.mockResolvedValue(payment(offer))
  const realRead = market.readAsset
  market.readAsset = () => {
    throw new Error("File temporarily unavailable.")
  }
  expect((await service.deliver(offer, txHash)).status).toBe("failed")
  market.readAsset = realRead
  expect((await service.deliver(offer, txHash)).status).toBe("failed")
  const delivered = await service.deliver(offer, txHash, true)
  expect(delivered.status).toBe("completed")
  expect(service.file(offer.id).bytes.toString()).toBe("Purchased attachment")
  expect(() => market.deleteAsset(asset.id)).toThrow("file order")
  expect(service.orders()).toHaveLength(1)
})
