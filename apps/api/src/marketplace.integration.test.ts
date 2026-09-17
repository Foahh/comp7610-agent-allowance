import type {
  Conversation,
  Listing,
  ListingInput,
  Purchase,
  SellerConnection,
  SignedQuote,
} from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { serve } from "@hono/node-server"
import {
  getChain,
  publicClient,
  tokenAbi,
  vaultAbi,
  buyerTypedData,
  quoteMessage,
} from "@repo/utils"
import { readConfig, signer } from "@repo/utils/config"
import { createHardhatRuntimeEnvironment } from "hardhat/hre"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWalletClient, http, type Address, type Hex } from "viem"
import { beforeAll, afterAll, expect, test } from "vite-plus/test"

import { createApp } from "./app.ts"
import { createPayments } from "./lib/payments.ts"
import { openBuyerDatabase } from "./lib/store.ts"
import { openSellerDatabase } from "./seller/lib/store.ts"

const directory = mkdtempSync(join(tmpdir(), "marketplace-integration-"))
const hre = await createHardhatRuntimeEnvironment(
  {
    solidity: "0.8.30",
    paths: {
      artifacts: join(directory, "artifacts"),
      cache: join(directory, "cache"),
    },
  },
  {},
  join(readConfig().root, "packages/contracts")
)
const chain = await hre.network.createServer(undefined, "127.0.0.1", 0)
const address = await chain.listen()
const rpcUrl = `http://127.0.0.1:${address.port}`
const client = publicClient(31337, rpcUrl)
const transport = http(rpcUrl)
const wallet = createWalletClient({ chain: getChain(31337), transport })
const accounts = await wallet.getAddresses()
let token: Address
let vault: Address
const installations: Awaited<ReturnType<typeof installation>>[] = []

async function deploy(name: string, args: readonly unknown[] = []) {
  const artifact = await hre.artifacts.readArtifact(name)
  const hash = await wallet.deployContract({
    account: accounts[0]!,
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    args,
  })

  return (await client.waitForTransactionReceipt({ hash })).contractAddress!
}

async function installation(index: number) {
  const config: Config = {
    ...readConfig(),
    local: true,
    localInstallation: index,
    chainId: 31337,
    confirmations: 1,
    rpcUrl,
    owner: accounts[index * 3]!,
    token,
    vault,
    appOrigin: `http://localhost:${4000 + index}`,
    dataDir: join(directory, index.toString()),
    credentialsDir: join(directory, index.toString(), "credentials"),
  }
  const store = openBuyerDatabase(join(config.dataDir, "buyer.sqlite"))
  const sellerStore = openSellerDatabase(join(config.dataDir, "seller.sqlite"))
  const payments = createPayments(config, store)
  const app = createApp(config, store, payments, sellerStore)
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 })

  if (!server.listening) {
    await once(server, "listening")
  }

  const address = server.address()

  if (!address || typeof address === "string") {
    throw new Error("API did not start.")
  }

  const endpoint = `http://127.0.0.1:${address.port}`
  config.sellerPublicUrl = endpoint
  const ownerWallet = createWalletClient({
    account: config.owner,
    chain: getChain(31337),
    transport,
  })
  let cookie = ""
  const registration = await ownerWallet.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "setSellerSigner",
    args: [
      signer("seller", config).address,
      (await client.getBlock()).timestamp + 86400n,
    ],
  })
  await client.waitForTransactionReceipt({ hash: registration })
  sellerStore.saveOperation("relay-enabled", true)
  await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "hardhat_setBalance",
      params: [payments.account.address, "0x0"],
    }),
  })

  async function request<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST"
  ): Promise<T> {
    const form = body instanceof FormData
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        origin: config.appOrigin,
        cookie,
        ...(form ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: form ? body : JSON.stringify(body) }),
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie

    return response.json() as Promise<T>
  }

  const challenge = await request<{ id: string; message: string }>(
    "/api/auth/challenge",
    { address: config.owner }
  )
  const signature = await ownerWallet.signMessage({
    message: challenge.message,
  })
  await request("/api/auth/verify", { id: challenge.id, signature })

  async function allowance(
    seller: Address,
    conversation: Conversation,
    automatic = true
  ) {
    const faucet = await ownerWallet.writeContract({
      address: token,
      abi: tokenAbi,
      functionName: "faucet",
    })
    await client.waitForTransactionReceipt({ hash: faucet })
    const approval = await ownerWallet.writeContract({
      address: token,
      abi: tokenAbi,
      functionName: "approve",
      args: [vault, 5_000_000n],
    })
    await client.waitForTransactionReceipt({ hash: approval })
    const hash = await ownerWallet.writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "createAllowance",
      args: [
        automatic ? payments.account.address : config.owner,
        payments.account.address,
        [seller],
        5_000_000n,
        2_000_000n,
        (await client.getBlock()).timestamp + 3600n,
      ],
    })
    await client.waitForTransactionReceipt({ hash })
    const next = await client.readContract({
      address: vault,
      abi: [
        {
          type: "function",
          name: "nextAllowanceId",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "nextAllowanceId",
    })
    await request(`/api/conversations/${conversation.id}/allowance`, {
      allowanceId: (next - 1n).toString(),
    })
  }

  return {
    config,
    endpoint,
    request,
    store,
    sellerStore,
    server,
    allowance,
    ownerWallet,
  }
}

beforeAll(async () => {
  await hre.solidity.build(await hre.solidity.getRootFilePaths())
  token = await deploy("AllowanceTestToken")
  vault = await deploy("AgentSpendVault", [token])
  installations.push(await installation(0), await installation(1))
}, 30000)

afterAll(async () => {
  for (const installation of installations) {
    await new Promise<void>((resolve, reject) =>
      installation.server.close((error) => (error ? reject(error) : resolve()))
    )
    installation.store.close()
    installation.sellerStore.close()
  }

  await chain.close()
  rmSync(directory, { recursive: true, force: true })
})

test("independent installations buy with unfunded buyer signers and seller-paid gas, without duplicate charges", async () => {
  const [buyer, seller] = installations
  const listingInput: ListingInput = {
    name: "Private guide",
    description: "Guide for testing",
    preview: "Public excerpt",
    type: "text",
    amount: "10000",
    content: "Paid reference",
    assetId: "",
    modelId: "",
    instructions: "",
    requiredInputs: "",
    deliverable: "One item",
    scope: "",
    assetIds: [],
  }
  const upload = new FormData()
  upload.set("file", new File(["Private attachment"], "guide.txt"))
  const asset = await seller!.request<{ id: string }>(
    "/api/marketplace/seller/assets",
    upload
  )
  const listings: Listing[] = []

  for (const type of ["text", "link", "file"] as const) {
    const listing = await seller!.request<Listing>(
      "/api/marketplace/seller/listings",
      {
        ...listingInput,
        type,
        content:
          type === "link" ? "https://example.com/paid-guide" : "Paid reference",
        assetId: type === "file" ? asset.id : "",
      }
    )
    await seller!.request(
      `/api/marketplace/seller/listings/${listing.id}/publish`,
      { active: true }
    )
    listings.push(listing)
  }

  const connection = await buyer!.request<SellerConnection>(
    "/api/marketplace/connections",
    { endpoint: seller!.endpoint }
  )
  expect(connection.identity.address).toBe(seller!.config.owner)
  expect(JSON.stringify(connection)).not.toContain("Paid reference")
  const conversation = await buyer!.request<Conversation>(
    "/api/conversations",
    { title: "Integration" }
  )
  await buyer!.allowance(connection.identity.address as Address, conversation)

  for (const listing of listings) {
    const task = {
      service: listing.id,
      version: listing.version,
      sellerId: connection.id,
      brief: "",
      evidence: "",
      requestId: randomUUID(),
    }
    const quote = await buyer!.request<{ offer: SignedQuote }>(
      `/api/marketplace/conversations/${conversation.id}/quotes`,
      task
    )
    const purchase = await buyer!.request<Purchase>(
      `/api/marketplace/conversations/${conversation.id}/purchases`,
      { quoteId: quote.offer.id }
    )
    expect(purchase.paymentStatus).toBe("confirmed")
    expect(
      await client.getBalance({
        address: signer("buyer", buyer!.config).address,
      })
    ).toBe(0n)
    expect(purchase.delivery?.status).toBe("completed")
    expect(
      await client.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "purchases",
        args: [purchase.id as Hex],
      })
    ).toBe(true)

    const followup = await buyer!.request<Conversation>("/api/conversations", {
      title: "Reuse",
    })
    const reused = await buyer!.request<{ purchase: Purchase }>(
      `/api/marketplace/conversations/${followup.id}/quotes`,
      { ...task, requestId: randomUUID() }
    )
    expect(reused.purchase.id).toBe(purchase.id)

    const duplicate = await buyer!.request<Purchase>(
      `/api/marketplace/conversations/${conversation.id}/purchases`,
      { quoteId: quote.offer.id }
    )
    expect(duplicate.txHash).toBe(purchase.txHash)
  }

  expect(buyer!.store.listPurchases()).toHaveLength(3)
  const state = await client.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "allowances",
    args: [1n],
  })
  expect(state[4]).toBe(30000n)

  // The second installation can also become a buyer, using its own signer.
  const returnListing = await buyer!.request<Listing>(
    "/api/marketplace/seller/listings",
    listingInput
  )
  await buyer!.request(
    `/api/marketplace/seller/listings/${returnListing.id}/publish`,
    { active: true }
  )
  const reverse = await seller!.request<SellerConnection>(
    "/api/marketplace/connections",
    { endpoint: buyer!.endpoint }
  )
  const reverseChat = await seller!.request<Conversation>(
    "/api/conversations",
    { title: "Reverse purchase" }
  )
  await seller!.allowance(reverse.identity.address as Address, reverseChat)
  const reverseQuote = await seller!.request<{ offer: SignedQuote }>(
    `/api/marketplace/conversations/${reverseChat.id}/quotes`,
    {
      service: returnListing.id,
      version: 1,
      sellerId: reverse.id,
      brief: "",
      evidence: "",
      requestId: randomUUID(),
    }
  )
  const reversePurchase = await seller!.request<Purchase>(
    `/api/marketplace/conversations/${reverseChat.id}/purchases`,
    { quoteId: reverseQuote.offer.id }
  )
  expect(reversePurchase.delivery?.content).toBe("Paid reference")
}, 30000)

test("wallet confirmation persists authorization before payment and retrieves delivery using its delegated reader", async () => {
  const [buyer, seller] = installations
  const listing = await seller!.request<Listing>(
    "/api/marketplace/seller/listings",
    {
      name: "Manual purchase",
      description: "",
      preview: "",
      type: "text",
      amount: "10000",
      content: "Manual delivery",
      assetId: "",
      modelId: "",
      instructions: "",
      requiredInputs: "",
      deliverable: "One guide",
      scope: "",
      assetIds: [],
    }
  )
  await seller!.request(
    `/api/marketplace/seller/listings/${listing.id}/publish`,
    { active: true }
  )
  const connections = await buyer!.request<SellerConnection[]>(
    "/api/marketplace/connections"
  )
  let connection = connections.find(
    (item) => item.endpoint === seller!.endpoint
  )
  if (!connection) {
    connection = await buyer!.request<SellerConnection>(
      "/api/marketplace/connections",
      { endpoint: seller!.endpoint }
    )
  }
  await buyer!.request(
    `/api/marketplace/connections/${connection.id}/refresh`,
    {}
  )
  const conversation = await buyer!.request<Conversation>(
    "/api/conversations",
    { title: "Manual mode" }
  )
  await buyer!.allowance(seller!.config.owner, conversation, false)
  const { offer } = await buyer!.request<{ offer: SignedQuote }>(
    `/api/marketplace/conversations/${conversation.id}/quotes`,
    {
      service: listing.id,
      version: 1,
      sellerId: connection.id,
      brief: "",
      evidence: "",
      requestId: randomUUID(),
    }
  )
  const prepared = await buyer!.request<Purchase>(
    `/api/marketplace/conversations/${conversation.id}/purchases`,
    { quoteId: offer.id }
  )
  expect(prepared.paymentStatus).toBe("prepared")
  expect(prepared.authorization?.signature).toBeUndefined()
  const signature = await buyer!.ownerWallet.signTypedData(
    buyerTypedData(offer.quote, 31337, vault)
  )
  await buyer!.request(`/api/marketplace/purchases/${offer.id}/authorize`, {
    signature,
  })
  expect(buyer!.store.getPurchase(offer.id)?.authorization?.signature).toBe(
    signature
  )
  const txHash = await buyer!.ownerWallet.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "purchase",
    args: [quoteMessage(offer.quote), offer.signature as Hex, signature],
  })
  const paid = await buyer!.request<Purchase>(
    `/api/marketplace/purchases/${offer.id}/transaction`,
    { txHash }
  )
  expect(paid.paymentStatus).toBe("pending")
  // Payment acknowledgement no longer waits for seller delivery.
  await expect
    .poll(() => buyer!.store.getPurchase(offer.id)?.delivery?.content, {
      timeout: 5000,
    })
    .toBe("Manual delivery")
  expect(buyer!.store.getPurchase(offer.id)?.paymentStatus).toBe("confirmed")
}, 30000)
