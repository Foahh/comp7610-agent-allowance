import type { Purchase } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { publicClient, vaultAbi } from "@repo/utils"
import {
  decodeEventLog,
  parseAbiItem,
  TransactionReceiptNotFoundError,
  type Hex,
  type TransactionReceipt,
} from "viem"

const purchasedEvent = parseAbiItem(
  "event Purchased(bytes32 indexed purchaseId,uint256 indexed allowanceId,address indexed recipient,uint256 amount,bytes32 service,bytes32 requestHash)"
)

export async function recoverIntent(
  config: Config,
  purchase: Purchase
): Promise<Purchase> {
  if (!purchase.authorization || purchase.paymentStatus === "confirmed") {
    return purchase
  }
  const client = publicClient(config.chainId, config.rpcUrl)
  try {
    const blockNumber = await client.getBlockNumber()
    // Discover a submission even if the submitting browser/seller crashed before
    // returning its hash. A receipt supplied by a peer is never sufficient alone.
    let hash = purchase.txHash as Hex | undefined
    let receipt: TransactionReceipt | undefined
    if (hash) {
      try {
        receipt = await client.getTransactionReceipt({ hash })
      } catch (error) {
        if (!(error instanceof TransactionReceiptNotFoundError)) {
          throw error
        }
      }
    }
    if (!receipt) {
      const logs = await client.getLogs({
        address: config.vault,
        event: purchasedEvent,
        args: { purchaseId: purchase.id as Hex },
        fromBlock: BigInt(purchase.authorization.fromBlock),
        toBlock: blockNumber,
      })
      const discovered = logs[0]?.transactionHash
      if (discovered) {
        hash = discovered
        purchase.txHash = hash
        purchase.paymentStatus = "pending"
        receipt = await client.getTransactionReceipt({ hash })
      }
    }

    if (!hash) {
      // Read revocation at the same block as the log scan: a payment mined
      // before revocation must be recovered, never mistaken for cancellation.
      const allowance = await client.readContract({
        address: config.vault,
        abi: vaultAbi,
        functionName: "allowances",
        args: [BigInt(purchase.offer.quote.allowanceId)],
        blockNumber,
      })
      if (allowance[6]) {
        purchase.paymentStatus = "rejected"
        purchase.error =
          "Purchase was not paid before its allowance was revoked."
        return purchase
      }

      if (purchase.authorization.signature) {
        // Keep the seller's submission failure visible across read-only refreshes.
        purchase.error ??=
          "Submission not confirmed. Refresh or submit this same purchase in your wallet."
      } else {
        purchase.error = "Confirm this purchase in your wallet."
      }

      return purchase
    }

    purchase.txHash = hash
    purchase.paymentStatus = "pending"
    // A refresh checks the current state once; polling must not wait for a block
    // per purchase while holding up the entire conversation or payment queue.
    if (!receipt) {
      purchase.error = undefined
      return purchase
    }
    if (blockNumber - receipt.blockNumber + 1n < BigInt(config.confirmations)) {
      purchase.error = undefined
      return purchase
    }
    if (receipt.status === "reverted") {
      purchase.paymentStatus = "reverted"
      purchase.error = "Payment transaction reverted. No payment was made."
      return purchase
    }
    const quote = purchase.offer.quote
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
            args.purchaseId === purchase.id &&
            args.allowanceId === BigInt(quote.allowanceId) &&
            args.recipient.toLowerCase() === quote.recipient.toLowerCase() &&
            args.amount === BigInt(quote.amount) &&
            args.service === quote.service &&
            args.requestHash === quote.requestHash
          )
        } catch {
          return false
        }
      })
    if (matches) {
      purchase.txHash = hash
      purchase.paymentStatus = "confirmed"
      purchase.error = undefined
      purchase.gasUsed = receipt.gasUsed.toString()
      purchase.gasWei = (receipt.gasUsed * receipt.effectiveGasPrice).toString()
    } else {
      purchase.error =
        "This transaction did not pay the exact quote. Refresh before attempting the same purchase again."
      purchase.txHash = undefined
    }
  } catch {
    purchase.error =
      "Payment outcome is not known. Refresh this purchase; do not create a replacement charge."
  }
  return purchase
}
