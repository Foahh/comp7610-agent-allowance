import {
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  recoverTypedDataAddress,
  type Hex,
} from "viem"
import type { Store } from "@repo/db"
import type {
  Allowance,
  Conversation,
  Purchase,
  SignedQuote,
} from "@repo/schemas"
import {
  getChain,
  publicClient,
  quoteId,
  quoteMessage,
  quoteTypedData,
  serviceHash,
  taskHash,
  vaultAbi,
} from "@repo/utils"
import { signer, type Config } from "@repo/utils/config"

export function createPayments(
  config: Config,
  store: Store,
  receiptTimeoutMs = 30000
) {
  const client = publicClient(config.chainId, config.rpcUrl)
  const account = signer("agent", config.chainId)
  const wallet = createWalletClient({
    account,
    chain: getChain(config.chainId),
    transport: http(config.rpcUrl),
  })
  let tail = Promise.resolve()

  async function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  async function allowance(id: string): Promise<Allowance> {
    const value = await client.readContract({
      address: config.vault,
      abi: vaultAbi,
      functionName: "allowances",
      args: [BigInt(id)],
    })
    const [
      owner,
      agent,
      provider,
      budget,
      perPurchase,
      spent,
      expiresAt,
      revoked,
      withdrawn,
    ] = value
    return {
      id,
      owner,
      agent,
      provider,
      budget: budget.toString(),
      perPurchase: perPurchase.toString(),
      spent: spent.toString(),
      expiresAt: expiresAt.toString(),
      revoked,
      withdrawn: withdrawn.toString(),
      remaining: (budget - spent - withdrawn).toString(),
    }
  }

  function save(purchase: Purchase) {
    store.put("purchases", purchase.id, purchase.conversationId, purchase)
    return purchase
  }

  async function recover(purchase: Purchase): Promise<Purchase> {
    if (!purchase.txHash || !purchase.rawTransaction) {
      return purchase
    }
    if (!["prepared", "pending"].includes(purchase.paymentStatus)) {
      return purchase
    }

    const start = performance.now()
    try {
      const known = await client
        .getTransactionReceipt({ hash: purchase.txHash as Hex })
        .catch(() => undefined)
      if (!known) {
        // Re-broadcast exactly the persisted bytes. Never re-sign an uncertain purchase.
        await client
          .sendRawTransaction({
            serializedTransaction: purchase.rawTransaction as Hex,
          })
          .catch(() => undefined)
      }
      purchase.paymentStatus = "pending"
      save(purchase)
      const confirmationStarted = performance.now()
      purchase.broadcastMs =
        (purchase.broadcastMs ?? 0) + confirmationStarted - start
      const receipt = await client.waitForTransactionReceipt({
        hash: purchase.txHash as Hex,
        confirmations: config.confirmations,
        timeout: receiptTimeoutMs,
      })
      purchase.paymentStatus =
        receipt.status === "success" ? "confirmed" : "reverted"
      purchase.gasUsed = receipt.gasUsed.toString()
      purchase.gasWei = (receipt.gasUsed * receipt.effectiveGasPrice).toString()
      purchase.paymentMs = (purchase.paymentMs ?? 0) + performance.now() - start
      purchase.confirmationMs =
        (purchase.confirmationMs ?? 0) + performance.now() - confirmationStarted
      purchase.error =
        receipt.status === "reverted"
          ? "Contract rejected the payment."
          : undefined
    } catch {
      purchase.paymentStatus = "pending"
      purchase.error =
        "Payment outcome is not known yet. Recover this purchase before spending again."
    }
    return save(purchase)
  }

  async function purchase(conversation: Conversation, offer: SignedQuote) {
    return serialized(async () => {
      const existing = store.get<Purchase>("purchases", offer.id)
      if (existing) {
        if (existing.conversationId !== conversation.id) {
          throw new Error("Quote belongs to another conversation.")
        }
        return recover(existing)
      }

      const unresolved = store
        .list<Purchase>("purchases")
        .filter(
          (item) =>
            item.paymentStatus === "pending" ||
            item.paymentStatus === "prepared"
        )
      for (const item of unresolved) {
        const recovered = await recover(item)
        if (recovered.paymentStatus === "pending") {
          throw new Error(
            "Another payment is unresolved. No new charge was created."
          )
        }
      }

      const record: Purchase = {
        id: offer.id,
        conversationId: conversation.id,
        offer,
        paymentStatus: "rejected",
        createdAt: Date.now(),
      }
      try {
        const limit = await allowance(offer.quote.allowanceId)
        const now = (await client.getBlock()).timestamp
        const recovered = await recoverTypedDataAddress({
          ...quoteTypedData(offer.quote, config.chainId, config.vault),
          signature: offer.signature as Hex,
        })
        if (
          conversation.allowanceId !== offer.quote.allowanceId ||
          limit.owner.toLowerCase() !== conversation.owner.toLowerCase() ||
          limit.agent.toLowerCase() !== account.address.toLowerCase() ||
          recovered.toLowerCase() !== limit.provider.toLowerCase() ||
          offer.quote.recipient.toLowerCase() !==
            limit.provider.toLowerCase() ||
          quoteId(offer.quote, config.chainId, config.vault) !== offer.id ||
          taskHash(offer.task) !== offer.quote.requestHash ||
          serviceHash(offer.task.service) !== offer.quote.service
        ) {
          throw new Error(
            "Quote does not match the authorized task and allowance."
          )
        }
        if (limit.revoked || BigInt(limit.expiresAt) <= now) {
          throw new Error("Allowance is revoked or expired.")
        }
        if (BigInt(offer.quote.expiresAt) <= now) {
          throw new Error("Quote expired.")
        }
        const amount = BigInt(offer.quote.amount)
        if (
          amount <= 0n ||
          amount > BigInt(limit.perPurchase) ||
          amount > BigInt(limit.remaining)
        ) {
          throw new Error(
            "Purchase exceeds the per-purchase or remaining allowance."
          )
        }

        const args = [
          quoteMessage(offer.quote),
          offer.signature as Hex,
        ] as const
        await client.simulateContract({
          account,
          address: config.vault,
          abi: vaultAbi,
          functionName: "purchase",
          args,
        })
        const request = await wallet.prepareTransactionRequest({
          type: "eip1559",
          to: config.vault,
          data: encodeFunctionData({
            abi: vaultAbi,
            functionName: "purchase",
            args,
          }),
        })
        const rawTransaction = await account.signTransaction({
          ...request,
          chainId: config.chainId,
        })
        record.rawTransaction = rawTransaction
        record.txHash = keccak256(rawTransaction)
        record.nonce = request.nonce
        record.paymentStatus = "prepared"
        // The durable journal precedes all broadcasting.
        save(record)
        return recover(record)
      } catch (error) {
        record.error =
          error instanceof Error
            ? error.message.split("\n")[0]
            : "Purchase rejected."
        return save(record)
      }
    })
  }

  async function recoverAll() {
    return serialized(async () => {
      for (const item of store.list<Purchase>("purchases")) {
        await recover(item)
      }
    })
  }

  return { account, allowance, purchase, recoverAll }
}

export type Payments = ReturnType<typeof createPayments>

export function publicPurchase(
  purchase: Purchase
): Omit<Purchase, "rawTransaction"> {
  const { rawTransaction: _, ...visible } = purchase
  return visible
}
