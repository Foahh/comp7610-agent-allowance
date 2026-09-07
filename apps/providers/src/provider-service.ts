import { randomBytes } from "node:crypto"
import {
  decodeEventLog,
  recoverMessageAddress,
  type Address,
  type Hex,
} from "viem"
import type { Delivery, SignedQuote, Task } from "@repo/schemas"
import {
  publicClient,
  quoteId,
  quoteMessage,
  quoteTypedData,
  serviceHash,
  taskHash,
  vaultAbi,
} from "@repo/utils"
import { signer, type Config } from "@repo/utils/config"
import { catalog } from "./catalog.ts"
import { executeTask, interpretTask } from "./specialist.ts"
import type { ProviderStore } from "./store.ts"

export function createProviderService(config: Config, store: ProviderStore) {
  const client = publicClient(config.chainId, config.rpcUrl)
  const account = signer("provider")
  const runningDeliveries = new Map<string, Promise<Delivery>>()

  async function createQuote(allowanceId: string, task: Task) {
    const interpretation = await interpretTask(task)
    if ("clarification" in interpretation) {
      return interpretation
    }

    const service = catalog.find((offer) => offer.id === task.service)
    if (!service) {
      throw new Error("Requested service is not available.")
    }

    const block = await client.getBlock()
    const quote = {
      allowanceId,
      service: serviceHash(task.service),
      requestHash: taskHash(task),
      recipient: account.address,
      amount: service.amount,
      nonce: ("0x" + randomBytes(32).toString("hex")) as Hex,
      expiresAt: (block.timestamp + 600n).toString(),
    }
    const offer: SignedQuote = {
      id: quoteId(quote, config.chainId, config.vault),
      quote,
      task,
      deliverable: interpretation.deliverable,
      signature: await account.signTypedData(
        quoteTypedData(quote, config.chainId, config.vault)
      ),
    }
    store.put("quotes", offer.id, allowanceId, offer)
    return { offer }
  }

  async function authorize(id: string, signature?: string) {
    const offer = store.get("quotes", id)
    if (!offer || !signature) {
      throw new Error("Unknown quote or missing agent signature.")
    }
    const allowance = await client.readContract({
      address: config.vault,
      abi: vaultAbi,
      functionName: "allowances",
      args: [BigInt(offer.quote.allowanceId)],
    })
    const recovered = await recoverMessageAddress({
      message: "AgentAllowance delivery " + id,
      signature: signature as Hex,
    })
    if (recovered.toLowerCase() !== allowance[1].toLowerCase()) {
      throw new Error("Only the authorized buyer can retrieve this task.")
    }
    return offer
  }

  async function deliver(offer: SignedQuote, txHash: Hex): Promise<Delivery> {
    const started = performance.now()
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      confirmations: config.confirmations,
      timeout: 45000,
    })
    if (receipt.status !== "success") {
      throw new Error("Payment transaction reverted.")
    }
    if (!receipt.logs.some((log) => isPaymentForOffer(log, offer))) {
      throw new Error("Transaction does not pay this exact quote.")
    }

    const existing = store.get("jobs", offer.id)
    if (existing?.status === "completed" || existing?.status === "failed") {
      return existing
    }

    const job: Delivery = {
      purchaseId: offer.id,
      status: "running",
      content: "",
      references: [],
      modelMs: 0,
      deliveryMs: 0,
    }
    store.put("jobs", offer.id, offer.quote.allowanceId, job)
    const modelStarted = performance.now()
    try {
      job.content = await executeTask(offer.task)
      job.status = "completed"
      job.references = extractReferences(job.content)
    } catch (error) {
      job.status = "failed"
      job.error =
        error instanceof Error ? error.message : "Provider execution failed."
    }
    job.modelMs = performance.now() - modelStarted
    job.deliveryMs = performance.now() - started
    store.put("jobs", offer.id, offer.quote.allowanceId, job)
    return job
  }

  function isPaymentForOffer(
    log: { address: Address; data: Hex; topics: [] | [Hex, ...Hex[]] },
    offer: SignedQuote
  ) {
    if (log.address.toLowerCase() !== config.vault.toLowerCase()) {
      return false
    }
    try {
      const event = decodeEventLog({
        abi: vaultAbi,
        data: log.data,
        topics: log.topics,
        eventName: "Purchased",
      })
      const expected = quoteMessage(offer.quote)
      return (
        event.args.purchaseId === offer.id &&
        event.args.allowanceId === expected.allowanceId &&
        event.args.recipient.toLowerCase() ===
          expected.recipient.toLowerCase() &&
        event.args.amount === expected.amount &&
        event.args.requestHash === expected.requestHash &&
        event.args.service === expected.service
      )
    } catch {
      return false
    }
  }

  async function runDelivery(
    id: string,
    signature: string | undefined,
    txHash: Hex
  ) {
    const offer = await authorize(id, signature)
    let delivery = runningDeliveries.get(id)
    if (!delivery) {
      delivery = deliver(offer, txHash)
      runningDeliveries.set(id, delivery)
    }
    try {
      return await delivery
    } finally {
      runningDeliveries.delete(id)
    }
  }

  async function getDelivery(id: string, signature: string | undefined) {
    await authorize(id, signature)
    return store.get("jobs", id) ?? { status: "pending" as const }
  }

  return {
    providerAddress: account.address,
    createQuote,
    runDelivery,
    getDelivery,
  }
}

function extractReferences(content: string) {
  return [
    ...new Set(
      content.match(/exchange-cities-synthetic-v1|\[[^\]\n]+\]/g) ?? []
    ),
  ]
}

export type ProviderService = ReturnType<typeof createProviderService>
