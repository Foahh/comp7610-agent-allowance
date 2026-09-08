import type { Delivery, SignedQuote, Task } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { createSellerQueries } from "@repo/db/marketplace"
import {
  deliveryMessage,
  listingHash,
  publicClient,
  quoteId,
  quoteTypedData,
  taskHash,
  vaultAbi,
} from "@repo/utils"
import { signer } from "@repo/utils/config"
import { randomBytes } from "node:crypto"
import { decodeEventLog, recoverMessageAddress, type Hex } from "viem"

import type { Marketplace } from "./marketplace.ts"
import type { SellerStore } from "./store.ts"

import { executeTask, interpretTask } from "./specialist.ts"
import { createSubmitter } from "./submitter.ts"

export function createSellerService(
  config: Config,
  store: SellerStore,
  market: Marketplace
) {
  const client = publicClient(config.chainId, config.rpcUrl)
  const account = signer("seller", config)
  const recipient = config.owner
  const submitter = createSubmitter(config, store)
  const { requests, jobs } = createSellerQueries(store.db)

  const quoteFlights = new Map<
    string,
    Promise<{ offer: SignedQuote } | { clarification: string }>
  >()
  const deliveryFlights = new Map<string, Promise<Delivery>>()

  async function createQuote(allowanceId: string, task: Task) {
    const key = `${allowanceId}:${task.requestId}`
    const known = requests.get(key)

    if (known) {
      if (known.taskHash !== taskHash(task)) {
        throw new Error(
          "Request identifier already belongs to different inputs."
        )
      }

      return { offer: store.getQuote(known.id)! }
    }

    const active = quoteFlights.get(key)

    if (active) {
      await active

      return createQuote(allowanceId, task)
    }

    const operation = issueQuote(allowanceId, task, key)
    quoteFlights.set(key, operation)

    try {
      return await operation
    } finally {
      quoteFlights.delete(key)
    }
  }

  async function issueQuote(allowanceId: string, task: Task, key: string) {
    const listing = market.published.get(task.service)

    if (!listing || listing.version !== task.version) {
      throw new Error(
        "Listing version is no longer offered. Refresh the catalog."
      )
    }

    const allowed = await client.readContract({
      address: config.vault,
      abi: vaultAbi,
      functionName: "allowanceSellers",
      args: [BigInt(allowanceId)],
    })

    if (
      !allowed.some(
        (address) => address.toLowerCase() === recipient.toLowerCase()
      )
    ) {
      throw new Error(
        "Authorize this seller in your conversation allowance first."
      )
    }

    const snapshot = market.snapshot(listing)
    const interpretation = await interpretTask(
      task,
      snapshot,
      config.credentialsDir
    )

    if ("clarification" in interpretation) {
      return interpretation
    }

    const publicItem = market.offerListing(listing)
    const quote = {
      allowanceId,
      service: listingHash(publicItem),
      requestHash: taskHash(task, interpretation.deliverable),
      recipient,
      amount: listing.amount,
      nonce: `0x${randomBytes(32).toString("hex")}` as Hex,
      expiresAt: ((await client.getBlock()).timestamp + 600n).toString(),
    }

    const offer: SignedQuote = {
      id: quoteId(quote, config.chainId, config.vault),
      signature: await account.signTypedData(
        quoteTypedData(quote, config.chainId, config.vault)
      ),
      quote,
      task,
      listing: publicItem,
      deliverable: interpretation.deliverable,
    }

    store.db.transaction(() => {
      store.saveQuote(offer)
      jobs.save(offer.id, { id: offer.id, snapshot, paid: false })
      requests.save(key, { id: offer.id, taskHash: taskHash(task) })
    })

    return { offer }
  }

  async function authorize(
    id: string,
    purpose: string,
    signature: string,
    expiresAt: number
  ) {
    const offer = store.getQuote(id)
    const now = Math.floor(Date.now() / 1000)

    if (!offer || expiresAt < now || expiresAt > now + 300) {
      throw new Error("Unknown purchase or expired delivery authorization.")
    }

    const allowance = await client.readContract({
      address: config.vault,
      abi: vaultAbi,
      functionName: "allowances",
      args: [BigInt(offer.quote.allowanceId)],
    })
    const address = await recoverMessageAddress({
      message: deliveryMessage(
        id,
        config.chainId,
        config.vault,
        purpose,
        expiresAt
      ),
      signature: signature as Hex,
    })

    const deliverySigner = await client.readContract({
      address: config.vault,
      abi: vaultAbi,
      functionName: "deliverySigners",
      args: [BigInt(offer.quote.allowanceId)],
    })
    if (
      address.toLowerCase() !== deliverySigner.toLowerCase() &&
      address.toLowerCase() !== allowance[0].toLowerCase()
    ) {
      throw new Error("Only the authorized buyer can retrieve this purchase.")
    }

    return offer
  }

  async function verifyPayment(offer: SignedQuote, txHash: Hex) {
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      confirmations: config.confirmations,
      timeout: 45000,
    })
    const matches =
      receipt.status === "success" &&
      receipt.logs.some((log) => {
        if (log.address.toLowerCase() !== config.vault.toLowerCase()) {
          return false
        }

        try {
          const { args } = decodeEventLog({
            abi: vaultAbi,
            eventName: "Purchased",
            data: log.data,
            topics: log.topics,
          })

          return (
            args.purchaseId === offer.id &&
            args.allowanceId === BigInt(offer.quote.allowanceId) &&
            args.recipient.toLowerCase() ===
              offer.quote.recipient.toLowerCase() &&
            args.amount === BigInt(offer.quote.amount) &&
            args.service === offer.quote.service &&
            args.requestHash === offer.quote.requestHash
          )
        } catch {
          return false
        }
      })

    if (!matches) {
      throw new Error("Transaction does not pay this exact quote.")
    }
  }

  async function execute(offer: SignedQuote, txHash: Hex, retry: boolean) {
    const job = jobs.get(offer.id)!
    const previous = store.getDelivery(offer.id)

    if (
      job.paid &&
      (previous?.status === "completed" ||
        (previous?.status === "failed" && !retry))
    ) {
      return previous
    }

    const start = performance.now()
    await verifyPayment(offer, txHash)
    jobs.save(offer.id, { ...job, txHash, paid: true })
    const delivery: Delivery = {
      purchaseId: offer.id,
      status: "running",
      content: "",
      references: [],
      modelMs: 0,
      deliveryMs: 0,
    }

    store.saveDelivery(delivery)

    try {
      const { listing } = job.snapshot

      if (listing.type === "ai-service") {
        const modelStarted = performance.now()
        delivery.content = await executeTask(
          offer.task,
          job.snapshot,
          offer.deliverable,
          config.credentialsDir
        )
        delivery.modelMs = performance.now() - modelStarted
        delivery.references = job.snapshot.assets.map((asset) => asset.name)
      } else if (listing.type === "file") {
        const { asset } = market.readAsset(listing.assetId)
        delivery.file = {
          name: asset.name,
          size: asset.size,
          mediaType: asset.mediaType,
          hash: asset.hash,
        }
      } else {
        delivery.content = listing.content
      }

      delivery.status = "completed"
    } catch (error) {
      delivery.status = "failed"
      delivery.error =
        error instanceof Error ? error.message : "Delivery failed."
    }

    delivery.deliveryMs = performance.now() - start
    store.saveDelivery(delivery)

    return delivery
  }

  async function deliver(offer: SignedQuote, txHash: Hex, retry = false) {
    const existing = deliveryFlights.get(offer.id)

    if (existing) {
      return existing
    }

    const operation = execute(offer, txHash, retry)
    deliveryFlights.set(offer.id, operation)

    try {
      return await operation
    } finally {
      deliveryFlights.delete(offer.id)
    }
  }

  function file(id: string) {
    const job = jobs.get(id)

    if (
      !job?.paid ||
      store.getDelivery(id)?.status !== "completed" ||
      job.snapshot.listing.type !== "file"
    ) {
      throw new Error("A completed file purchase is required.")
    }

    return market.readAsset(job.snapshot.listing.assetId)
  }

  function orders() {
    return jobs.list().map((job) => ({
      id: job.id,
      offer: store.getQuote(job.id)!,
      paymentStatus: job.paid ? "confirmed" : "awaiting-payment",
      txHash: job.txHash,
      delivery: store.getDelivery(job.id),
    }))
  }

  return {
    account,
    recipient,
    submitter,
    createQuote,
    authorize,
    deliver,
    file,
    orders,
  }
}

export type SellerService = ReturnType<typeof createSellerService>
