import type { Config } from "@repo/utils/config"

import { getChain, publicClient, quoteMessage, vaultAbi } from "@repo/utils"
import { signer } from "@repo/utils/config"
import {
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  type Hex,
} from "viem"

import type { SellerStore } from "./store.ts"

type Journal = { id: string; raw: Hex; txHash: Hex }
const MAX_FEE = 20_000_000_000n
const MAX_TRANSACTION = 2_000_000_000_000_000n
const DAILY_LIMIT = 10_000_000_000_000_000n

export function createSubmitter(config: Config, store: SellerStore) {
  const account = signer("seller", config)
  const client = publicClient(config.chainId, config.rpcUrl)
  const wallet = createWalletClient({
    account,
    chain: getChain(config.chainId),
    transport: http(config.rpcUrl),
  })
  let tail = Promise.resolve()
  const enabled = () => store.getOperation("relay-enabled") === true
  async function status() {
    return {
      enabled: enabled(),
      address: account.address,
      balance: (
        await client.getBalance({ address: account.address })
      ).toString(),
      maxFeeWei: MAX_FEE.toString(),
      maxTransactionWei: MAX_TRANSACTION.toString(),
      dailyLimitWei: DAILY_LIMIT.toString(),
    }
  }
  async function submit(id: string, signature: Hex) {
    let release!: () => void
    const previous = tail
    tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      const known = store.getOperation(`relay:${id}`) as Journal | undefined
      if (known) {
        await client
          .sendRawTransaction({ serializedTransaction: known.raw })
          .catch(() => undefined)
        return { txHash: known.txHash }
      }
      if (!enabled()) {
        throw new Error(
          "Seller submission is disabled. Confirm the purchase in your browser wallet."
        )
      }
      const pending = store.getOperation("relay-pending") as Journal | undefined
      if (pending) {
        const receipt = await client
          .getTransactionReceipt({ hash: pending.txHash })
          .catch(() => undefined)
        if (!receipt) {
          await client
            .sendRawTransaction({ serializedTransaction: pending.raw })
            .catch(() => undefined)
          throw new Error(
            "Seller has an unresolved transaction. Wait or submit the same purchase in your wallet."
          )
        }
      }
      const offer = store.getQuote(id)
      if (!offer) {
        throw new Error("Unknown quote.")
      }
      const args = [
        quoteMessage(offer.quote),
        offer.signature as Hex,
        signature,
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
      const worstCase = request.gas * request.maxFeePerGas
      if (
        request.maxFeePerGas > MAX_FEE ||
        worstCase > MAX_TRANSACTION ||
        request.gas > 300000n
      ) {
        throw new Error(
          "Gas exceeds the seller's submission policy. Try later or confirm in your wallet."
        )
      }
      const day = `relay-budget:${new Date().toISOString().slice(0, 10)}`
      const spent = BigInt(
        (store.getOperation(day) as string | undefined) || "0"
      )
      if (spent + worstCase > DAILY_LIMIT) {
        throw new Error("Seller's daily gas budget is exhausted.")
      }
      if ((await client.getBalance({ address: account.address })) < worstCase) {
        throw new Error(
          "Seller needs Sepolia ETH for gas. Confirm this purchase in your wallet instead."
        )
      }
      const raw = await account.signTransaction({
        ...request,
        chainId: config.chainId,
      })
      const journal = { id, raw, txHash: keccak256(raw) }
      store.db.transaction(() => {
        store.saveOperation(day, (spent + worstCase).toString())
        store.saveOperation(`relay:${id}`, journal)
        store.saveOperation("relay-pending", journal)
      })
      await client
        .sendRawTransaction({ serializedTransaction: raw })
        .catch(() => undefined)
      return { txHash: journal.txHash }
    } finally {
      release()
    }
  }
  return {
    submit,
    status,
    setEnabled(value: boolean) {
      store.saveOperation("relay-enabled", value)
    },
  }
}
