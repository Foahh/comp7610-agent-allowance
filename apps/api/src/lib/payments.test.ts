import type { Conversation, SignedQuote } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { createBuyerMarketplaceQueries } from "@repo/db/marketplace"
import {
  listingHash,
  quoteId,
  quoteTypedData,
  taskHash,
  vaultAbi,
} from "@repo/utils"
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiParameters,
  type Hex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test"

import { createPayments } from "./payments.ts"
import { openBuyerDatabase } from "./store.ts"

const rpc = vi.hoisted(() => ({
  readContract: vi.fn(),
  getBlock: vi.fn(),
  getBlockNumber: vi.fn(),
  getLogs: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}))
const submit = vi.hoisted(() => vi.fn())
vi.mock("@repo/utils", async (original) => ({
  ...(await original<typeof import("@repo/utils")>()),
  publicClient: () => rpc,
}))
vi.mock("@repo/utils/http", async (original) => ({
  ...(await original<typeof import("@repo/utils/http")>()),
  endpointRequest: submit,
}))

const buyerKey = `0x${"5".padStart(64, "0")}` as const
const account = privateKeyToAccount(buyerKey)
const seller = privateKeyToAccount(`0x${"6".padStart(64, "0")}`)
vi.mock("@repo/utils/config", async (original) => ({
  ...(await original<typeof import("@repo/utils/config")>()),
  signer: () => account,
}))

const vault = "0x0000000000000000000000000000000000000009"
const config = {
  credentialsDir: "",
  cookieName: "test",
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

const txHash = `0x${"a".repeat(64)}` as Hex
function confirmed(value: SignedQuote) {
  return {
    status: "success",
    gasUsed: 100n,
    effectiveGasPrice: 1n,
    logs: [
      {
        address: vault,
        topics: encodeEventTopics({
          abi: vaultAbi,
          eventName: "Purchased",
          args: {
            purchaseId: value.id as Hex,
            allowanceId: 1n,
            recipient: seller.address,
          },
        }),
        data: encodeAbiParameters(
          parseAbiParameters("uint256,bytes32,bytes32"),
          [
            BigInt(value.quote.amount),
            value.quote.service as Hex,
            value.quote.requestHash as Hex,
          ]
        ),
      },
    ],
  }
}
let store: ReturnType<typeof openBuyerDatabase>
let payments: ReturnType<typeof createPayments>

beforeEach(() => {
  vi.resetAllMocks()
  store = openBuyerDatabase(":memory:")
  store.saveConversation(conversation)
  payments = createPayments(config, store)
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
  rpc.getBlockNumber.mockResolvedValue(123n)
  rpc.getLogs.mockResolvedValue([])
  rpc.waitForTransactionReceipt.mockRejectedValue(new Error("Timeout"))
  submit.mockImplementation(async (_endpoint, path, options) => {
    const id = path.split("/")[3]
    // A restart must retain the authorization before it leaves this process.
    expect(store.getPurchase(id)?.authorization?.signature).toBe(
      JSON.parse(options.body).signature
    )
    return { txHash }
  })
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

  const id = quoteId(quote, config.chainId, vault)
  const result = {
    id,
    listing,
    task,
    quote,
    deliverable: listing.deliverable,
    signature: await seller.signTypedData(
      quoteTypedData(quote, config.chainId, vault)
    ),
  }
  store.saveQuote(result, conversation.id)
  createBuyerMarketplaceQueries(store.db).destinations.save(id, {
    endpoint: "https://seller.example",
  })
  return result
}

test("a lost submission response recovers the exact authorized payment after restart", async () => {
  const value = await offer()
  submit.mockRejectedValueOnce(new Error("Reply lost"))
  const first = await payments.purchase(conversation, value)
  expect(first.paymentStatus).toBe("pending")
  expect(first.authorization?.signature).toBeTruthy()
  expect(first.txHash).toBeUndefined()
  const restarted = createPayments(config, store)
  rpc.getLogs.mockResolvedValue([{ transactionHash: txHash }])
  rpc.waitForTransactionReceipt.mockResolvedValue(confirmed(value))
  const recovered = await restarted.purchase(conversation, value)
  expect(recovered.paymentStatus).toBe("confirmed")
  expect(recovered.authorization).toEqual(first.authorization)
  expect(recovered.txHash).toBe(txHash)
  expect(submit).toHaveBeenCalledOnce()
})

test("an unresolved authorization blocks a different quote without submitting again", async () => {
  await payments.purchase(conversation, await offer())
  await expect(
    payments.purchase(conversation, await offer("other"))
  ).rejects.toThrow("unresolved")
  expect(submit).toHaveBeenCalledOnce()
})

test("a purchase awaiting wallet confirmation blocks another quote too", async () => {
  const value = await offer()
  store.savePurchase({
    id: value.id,
    conversationId: conversation.id,
    offer: value,
    paymentStatus: "prepared",
    authorization: { fromBlock: "123" },
    createdAt: 1,
  })
  await expect(
    payments.purchase(conversation, await offer("other"))
  ).rejects.toThrow("unresolved")
  expect(submit).not.toHaveBeenCalled()
  expect(store.listPurchases()).toHaveLength(1)
})

test("recovery retains a discovered transaction hash while confirmations are pending", async () => {
  const value = await offer()
  submit.mockRejectedValueOnce(new Error("Reply lost"))
  await payments.purchase(conversation, value)
  rpc.getLogs.mockResolvedValue([{ transactionHash: txHash }])
  await payments.recoverAll(conversation.id)
  expect(store.getPurchase(value.id)?.txHash).toBe(txHash)
  expect(store.getPurchase(value.id)?.paymentStatus).toBe("pending")
})

test("concurrent purchases for one static version share the successful payment", async () => {
  const first = await offer()
  const second = await offer("second")
  rpc.waitForTransactionReceipt.mockResolvedValue(confirmed(first))
  const results = await Promise.all([
    payments.purchase(conversation, first),
    payments.purchase(conversation, second),
  ])
  expect(results[0]!.id).toBe(results[1]!.id)
  expect(submit).toHaveBeenCalledOnce()
  expect(store.listPurchases()).toHaveLength(1)
})

test("a successful transaction without the exact purchase event never confirms payment", async () => {
  rpc.waitForTransactionReceipt.mockResolvedValue({
    status: "success",
    logs: [],
    gasUsed: 1n,
    effectiveGasPrice: 1n,
  })
  const result = await payments.purchase(conversation, await offer())
  expect(result.paymentStatus).toBe("pending")
  expect(result.error).toContain("did not pay the exact quote")
})

test("logout prevents creating a purchase authorization", async () => {
  const ended = createPayments(config, store, () => false)
  await expect(ended.purchase(conversation, await offer())).rejects.toThrow(
    "Session ended"
  )
  expect(store.listPurchases()).toHaveLength(0)
  expect(submit).not.toHaveBeenCalled()
})
