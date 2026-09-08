import type { Conversation, SignedQuote } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { listingHash, quoteId, quoteTypedData, taskHash } from "@repo/utils"
import { privateKeyToAccount } from "viem/accounts"
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test"

import { createPayments } from "./payments.ts"
import { openBuyerDatabase } from "./store.ts"

const rpc = vi.hoisted(() => ({
  readContract: vi.fn(),
  getBlock: vi.fn(),
  simulateContract: vi.fn(),
  getTransactionReceipt: vi.fn(),
  sendRawTransaction: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}))
const prepare = vi.hoisted(() => vi.fn())
vi.mock("@repo/utils", async (original) => ({
  ...(await original<typeof import("@repo/utils")>()),
  publicClient: () => rpc,
}))
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createWalletClient: () => ({ prepareTransactionRequest: prepare }),
}))

const agentKey = `0x${"5".padStart(64, "0")}` as const
const account = privateKeyToAccount(agentKey)
const seller = privateKeyToAccount(`0x${"6".padStart(64, "0")}`)
vi.mock("@repo/utils/config", async (original) => ({
  ...(await original<typeof import("@repo/utils/config")>()),
  signer: () => account,
}))

const vault = "0x0000000000000000000000000000000000000009"
const config = {
  local: false,
  localInstallation: 0,
  chainId: 11155111,
  vault,
  rpcUrl: "https://example.invalid",
  confirmations: 2,
  root: "",
  owner: account.address,
  sellerPublicUrl: "http://localhost:3002",
  dataDir: "",
  token: vault,
  appOrigin: "http://localhost:3000",
} as Config
const conversation: Conversation = {
  id: "chat",
  owner: account.address.toLowerCase(),
  title: "Test",
  scenario: "success",
  allowanceId: "1",
  createdAt: 1,
}

const confirmed = { status: "success", gasUsed: 100n, effectiveGasPrice: 1n }
let store: ReturnType<typeof openBuyerDatabase>
let payments: ReturnType<typeof createPayments>

beforeEach(() => {
  vi.clearAllMocks()
  store = openBuyerDatabase(":memory:")
  store.saveConversation(conversation)
  payments = createPayments(config, store, 1)
  rpc.readContract.mockImplementation(({ functionName }) =>
    Promise.resolve(
      functionName === "allowanceSellers"
        ? [seller.address]
        : [
            account.address,
            account.address,
            5000000n,
            2000000n,
            0n,
            2000n,
            false,
            0n,
          ]
    )
  )
  rpc.getBlock.mockResolvedValue({ timestamp: 1000n })
  rpc.simulateContract.mockResolvedValue({})
  rpc.getTransactionReceipt.mockRejectedValue(new Error("Not found"))
  rpc.sendRawTransaction.mockResolvedValue("0x01")
  rpc.waitForTransactionReceipt.mockRejectedValue(new Error("Timeout"))
  prepare.mockImplementation(async (input) => ({
    ...input,
    chainId: config.chainId,
    nonce: 0,
    gas: 100000n,
    maxFeePerGas: 2n,
    maxPriorityFeePerGas: 1n,
  }))
})

afterEach(() => {
  store.close()
  vi.unstubAllEnvs()
})

async function offer(requestId = "request"): Promise<SignedQuote> {
  const listing = {
    id: "item",
    version: 1,
    type: "text" as const,
    name: "Guide",
    description: "",
    preview: "",
    amount: "10000",
    requiredInputs: "",
    deliverable: "One guide",
    scope: "",
    contentHash: `0x${"a".repeat(64)}`,
  }

  const task = {
    service: listing.id,
    version: 1,
    requestId,
    sellerId: "seller",
    brief: "",
    evidence: "",
  }

  const quote = {
    allowanceId: "1",
    service: listingHash(listing),
    requestHash: taskHash(task, listing.deliverable),
    recipient: seller.address,
    amount: listing.amount,
    nonce: taskHash(task),
    expiresAt: "1500",
  }

  return {
    id: quoteId(quote, config.chainId, vault),
    listing,
    task,
    quote,
    deliverable: listing.deliverable,
    signature: await seller.signTypedData(
      quoteTypedData(quote, config.chainId, vault)
    ),
  }
}

test("timeout persists signed bytes and restart recovery rebroadcasts the same transaction", async () => {
  const value = await offer()
  const first = await payments.purchase(conversation, value)
  expect(first.paymentStatus).toBe("pending")
  expect(first.rawTransaction).toBeTruthy()
  const restarted = createPayments(config, store, 1)
  rpc.waitForTransactionReceipt.mockResolvedValue(confirmed)
  const recovered = await restarted.purchase(conversation, value)
  expect(recovered.paymentStatus).toBe("confirmed")
  expect(recovered.txHash).toBe(first.txHash)
  expect(prepare).toHaveBeenCalledOnce()
  const submissions = rpc.sendRawTransaction.mock.calls.map(
    ([input]) => input.serializedTransaction
  )
  expect(new Set(submissions).size).toBe(1)
})

test("an unresolved payment blocks a different quote without signing again", async () => {
  await payments.purchase(conversation, await offer())
  await expect(
    payments.purchase(conversation, await offer("other"))
  ).rejects.toThrow("unresolved")
  expect(prepare).toHaveBeenCalledOnce()
})

test("concurrent purchases for one static version share the successful payment", async () => {
  rpc.waitForTransactionReceipt.mockResolvedValue(confirmed)
  const first = await offer()
  const second = await offer("second")
  const results = await Promise.all([
    payments.purchase(conversation, first),
    payments.purchase(conversation, second),
  ])
  expect(results[0]!.id).toBe(results[1]!.id)
  expect(prepare).toHaveBeenCalledOnce()
  expect(store.listPurchases()).toHaveLength(1)
})
