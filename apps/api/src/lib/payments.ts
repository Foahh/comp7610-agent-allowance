import type {
  Allowance,
  Conversation,
  Purchase,
  SignedQuote,
} from "@repo/schemas"

import { createBuyerMarketplaceQueries } from "@repo/db/marketplace"
import {
  publicClient,
  quoteTypedData,
  vaultAbi,
  buyerTypedData,
} from "@repo/utils"
import { signer, type Config } from "@repo/utils/config"
import { endpointRequest } from "@repo/utils/http"
import { recoverTypedDataAddress, type Hex } from "viem"

import type { BuyerStore } from "./store.ts"

import { recoverIntent } from "./intent-recovery.ts"
import { assertPurchasableQuote } from "./quote-validation.ts"

const TRANSACTION_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/

export function createPayments(
  config: Config,
  store: BuyerStore,
  canAuthorize: () => boolean = () => true
) {
  const client = publicClient(config.chainId, config.rpcUrl)
  const account = signer("buyer", config)
  let tail = Promise.resolve()
  const recoveries = new Map<string, Promise<void>>()

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
    const [value, sellers] = await Promise.all([
      client.readContract({
        address: config.vault,
        abi: vaultAbi,
        functionName: "allowances",
        args: [BigInt(id)],
      }),
      client.readContract({
        address: config.vault,
        abi: vaultAbi,
        functionName: "allowanceSellers",
        args: [BigInt(id)],
      }),
    ])
    const [
      owner,
      buyerSigner,
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
      buyerSigner: buyerSigner,
      sellers: [...sellers],
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
    store.savePurchase(purchase)

    return purchase
  }

  async function recover(purchase: Purchase): Promise<Purchase> {
    return save(await recoverIntent(config, purchase))
  }

  async function purchase(conversation: Conversation, offer: SignedQuote) {
    return serialized(async () => {
      if (!canAuthorize()) {
        throw new Error(
          "Session ended or deployment changed. Sign in again before authorizing a purchase."
        )
      }
      const existing = store.getPurchase(offer.id)

      if (existing) {
        if (existing.conversationId !== conversation.id) {
          throw new Error("Quote belongs to another conversation.")
        }

        return recover(existing)
      }

      const unresolved = store.listUnresolvedPurchases()

      for (const item of unresolved) {
        const recovered = await recover(item)

        if (
          recovered.paymentStatus === "pending" ||
          recovered.paymentStatus === "prepared"
        ) {
          throw new Error(
            `Another payment is unresolved (${recovered.id}). Complete or refresh its purchase card before continuing. No new charge was created.`
          )
        }
      }

      // A second quote for a static version must reuse its confirmed purchase,
      // including when two conversations submitted competing requests.
      if (offer.listing.type !== "ai-service") {
        const owned = store
          .listPurchases()
          .find(
            (item) =>
              item.paymentStatus === "confirmed" &&
              item.offer.quote.recipient.toLowerCase() ===
                offer.quote.recipient.toLowerCase() &&
              item.offer.quote.service === offer.quote.service
          )

        if (owned) {
          return owned
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
        let recovered = await recoverTypedDataAddress({
          ...quoteTypedData(offer.quote, config.chainId, config.vault),
          signature: offer.signature as Hex,
        })

        if (recovered.toLowerCase() !== offer.quote.recipient.toLowerCase()) {
          const expiry = await client.readContract({
            address: config.vault,
            abi: vaultAbi,
            functionName: "sellerSigners",
            args: [offer.quote.recipient as `0x${string}`, recovered],
          })

          if (expiry > now) {
            recovered = offer.quote.recipient as `0x${string}`
          }
        }

        assertPurchasableQuote({
          conversation,
          offer,
          allowance: limit,
          buyerAddress:
            limit.buyerSigner.toLowerCase() === config.owner.toLowerCase()
              ? config.owner
              : account.address,
          recoveredSeller: recovered,
          currentTimestamp: now,
          config,
        })

        if (!canAuthorize()) {
          throw new Error("Session ended before purchase authorization.")
        }

        const automatic =
          limit.buyerSigner.toLowerCase() === account.address.toLowerCase()
        const fromBlock = (await client.getBlockNumber()).toString()

        record.authorization = {
          fromBlock,
        }

        if (automatic) {
          record.authorization.signature = await account.signTypedData(
            buyerTypedData(offer.quote, config.chainId, config.vault)
          )
          record.paymentStatus = "pending"
        } else {
          record.paymentStatus = "prepared"
        }

        save(record)

        if (automatic) {
          const destination = createBuyerMarketplaceQueries(
            store.db
          ).destinations.get(offer.id)
          if (!destination) {
            throw new Error(
              "Seller endpoint is unavailable. Submit the prepared purchase in your wallet."
            )
          }

          // Persist the authorization before crossing the network boundary.
          const result = (await endpointRequest(
            destination.endpoint,
            `/v1/purchases/${offer.id}/submit`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                signature: record.authorization.signature,
              }),
            }
          )) as { txHash?: string }

          if (result.txHash && TRANSACTION_HASH_PATTERN.test(result.txHash)) {
            record.txHash = result.txHash
            record.paymentStatus = "pending"
            save(record)
          }

          return recover(record)
        }

        record.error =
          "Confirm this purchase in your wallet. Your account wallet pays gas."

        return save(record)
      } catch (error) {
        record.error =
          error instanceof Error
            ? error.message.split("\n")[0]
            : "Purchase rejected."

        return save(record)
      }
    })
  }

  function recoverAll(conversationId?: string) {
    const key = conversationId ?? "*"
    const existing = recoveries.get(key)
    if (existing) {
      return existing
    }
    const operation = serialized(async () => {
      for (const item of store.listUnresolvedPurchases()) {
        if (conversationId && item.conversationId !== conversationId) {
          continue
        }
        await recover(item)
      }
    }).finally(() => recoveries.delete(key))
    recoveries.set(key, operation)
    return operation
  }

  async function authorizePurchase(id: string, signature: Hex) {
    if (!canAuthorize()) {
      throw new Error("Sign in again before authorizing a purchase.")
    }
    const purchase = store.getPurchase(id)
    if (!purchase?.authorization) {
      throw new Error("Unknown prepared purchase.")
    }
    const state = await allowance(purchase.offer.quote.allowanceId)
    const valid = await client.verifyTypedData({
      address: state.buyerSigner as `0x${string}`,
      ...buyerTypedData(purchase.offer.quote, config.chainId, config.vault),
      signature,
    })
    if (!valid) {
      throw new Error("Buyer signature does not match this allowance.")
    }
    purchase.authorization.signature = signature
    return save(purchase)
  }
  async function recordTransaction(id: string, txHash: Hex) {
    const purchase = store.getPurchase(id)
    if (!purchase?.authorization) {
      throw new Error("Unknown prepared purchase.")
    }
    purchase.txHash = txHash
    purchase.paymentStatus = "pending"
    save(purchase)
    return purchase
  }
  return {
    account,
    allowance,
    purchase,
    recoverAll,
    authorizePurchase,
    recordTransaction,
  }
}

export type Payments = ReturnType<typeof createPayments>
