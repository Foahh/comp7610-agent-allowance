import { PurchaseSchema, type Purchase } from "@repo/schemas"
import {
  confirmationCount,
  getChain,
  publicClient,
  tokenAbi,
  vaultAbi,
  buyerTypedData,
  quoteMessage,
} from "@repo/utils"
import * as v from "valibot"
import {
  createWalletClient,
  custom,
  decodeEventLog,
  encodeFunctionData,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
  type TransactionReceipt,
} from "viem"

import type { AppConfig } from "./client.ts"

import { marketplaceRequest } from "./marketplace.ts"

const tokenAmountPattern = /^\d+(\.\d{1,6})?$/

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

export async function connectWallet(config: AppConfig) {
  const chain = getChain(config.chainId)

  if (!window.ethereum) {
    throw new Error("Install a browser wallet to connect.")
  }

  const transport = custom(window.ethereum)
  const connector = createWalletClient({ chain, transport })
  const [address] = await connector.requestAddresses()

  if (!address) {
    throw new Error("No wallet account selected.")
  }

  await connector.switchChain({ id: config.chainId })

  if ((await connector.getChainId()) !== config.chainId) {
    throw new Error(`Switch your wallet to ${chain.name} before continuing.`)
  }

  return createWalletClient({ account: address, chain, transport })
}

export type ConnectedWallet = Awaited<ReturnType<typeof connectWallet>>

export async function assertWallet(wallet: ConnectedWallet, config: AppConfig) {
  const [selected] = await wallet.getAddresses()
  if (
    selected?.toLowerCase() !== wallet.account.address.toLowerCase() ||
    (config.owner !== "0x0000000000000000000000000000000000000000" &&
      selected.toLowerCase() !== config.owner.toLowerCase()) ||
    (await wallet.getChainId()) !== config.chainId
  ) {
    throw new Error(
      "Wallet account or network changed. Sign in again on Sepolia."
    )
  }
}

export async function fundAllowance(
  wallet: ConnectedWallet,
  config: AppConfig,
  total: string,
  maximum: string,
  sellers: Address[],
  onStatus: (text: string) => void,
  automatic = false
) {
  await assertWallet(wallet, config)
  if (sellers.length === 0 || sellers.length > 16) {
    throw new Error(
      "Select between one and sixteen sellers for this allowance."
    )
  }
  const budget = parseUnits(total, 6)
  const cap = parseUnits(maximum, 6)

  if (budget <= 0n || cap <= 0n || cap > budget) {
    throw new Error("Use a positive cap no larger than the total.")
  }
  if (!tokenAmountPattern.test(total) || !tokenAmountPattern.test(maximum)) {
    throw new Error("Amounts support at most six decimal places.")
  }

  const client = publicClient(config.chainId, config.rpcUrl)
  const confirmations = confirmationCount(config.chainId)

  if ((await client.getBalance({ address: wallet.account.address })) === 0n) {
    throw new Error("Your wallet needs test ETH to pay gas.")
  }
  const [balance, atomic] = await Promise.all([
    client.readContract({
      address: config.token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [wallet.account.address],
    }),
    supportsAtomicCalls(wallet, config.chainId),
  ])
  if (atomic) {
    if (balance < budget && balance + 100_000_000n < budget) {
      throw new Error(
        "Insufficient ATT. The faucet adds 100 ATT per claim; reduce the allowance or claim again."
      )
    }
    const now = (await client.getBlock()).timestamp
    const args = [
      automatic ? config.buyerSigner : wallet.account.address,
      config.buyerSigner,
      sellers,
      budget,
      cap,
      now + 86400n,
    ] as const
    const calls = [
      ...(balance < budget
        ? [
            {
              to: config.token,
              data: encodeFunctionData({
                abi: tokenAbi,
                functionName: "faucet",
              }),
            },
          ]
        : []),
      {
        to: config.token,
        data: encodeFunctionData({
          abi: tokenAbi,
          functionName: "approve",
          args: [config.vault, budget],
        }),
      },
      {
        to: config.vault,
        data: encodeFunctionData({
          abi: vaultAbi,
          functionName: "createAllowance",
          args,
        }),
      },
    ]
    onStatus("Confirm the token budget and allowance together in your wallet.")
    const receipts = await sendAtomicCalls(wallet, config, calls, onStatus)
    return createdAllowanceId(
      receipts,
      config.vault,
      wallet.account.address,
      args
    )
  }

  if (balance < budget) {
    onStatus("Claiming demonstration ATT in your wallet.")
    await assertWallet(wallet, config)
    const hash = await wallet.writeContract({
      address: config.token,
      abi: tokenAbi,
      functionName: "faucet",
    })
    const faucet = await client.waitForTransactionReceipt({
      hash,
      confirmations,
    })

    if (faucet.status !== "success") {
      throw new Error("ATT faucet transaction failed.")
    }
    const fundedBalance = await client.readContract({
      address: config.token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [wallet.account.address],
    })

    if (fundedBalance < budget) {
      throw new Error(
        "Insufficient ATT. The faucet adds 100 ATT per claim; reduce the allowance or claim again."
      )
    }
  }

  onStatus("Approve the token budget in your wallet.")
  await assertWallet(wallet, config)
  const approval = await wallet.writeContract({
    address: config.token,
    abi: tokenAbi,
    functionName: "approve",
    args: [config.vault, budget],
  })
  const approved = await client.waitForTransactionReceipt({
    hash: approval,
    confirmations,
  })

  if (approved.status !== "success") {
    throw new Error("Token approval failed.")
  }

  const now = (await client.getBlock()).timestamp
  const allowanceBuyer = automatic ? config.buyerSigner : wallet.account.address

  onStatus("Confirm creation of this conversation's allowance.")
  await assertWallet(wallet, config)
  const args = [
    allowanceBuyer,
    config.buyerSigner,
    sellers,
    budget,
    cap,
    now + 86400n,
  ] as const
  const creation = await wallet.writeContract({
    address: config.vault,
    abi: vaultAbi,
    functionName: "createAllowance",
    args,
  })
  const receipt = await client.waitForTransactionReceipt({
    hash: creation,
    confirmations,
  })

  if (receipt.status !== "success") {
    throw new Error("Allowance creation failed.")
  }

  return createdAllowanceId(
    [receipt],
    config.vault,
    wallet.account.address,
    args
  )
}

async function supportsAtomicCalls(wallet: ConnectedWallet, chainId: number) {
  try {
    const capabilities = await wallet.getCapabilities({ chainId })
    return (
      capabilities?.atomic?.status === "supported" ||
      capabilities?.atomic?.status === "ready"
    )
  } catch (error) {
    // Only a missing RPC method is a compatibility fallback. Cancellation,
    // disconnection and other provider errors must not trigger wallet prompts.
    let cause: unknown = error
    const visited = new Set<unknown>()
    while (cause && typeof cause === "object" && !visited.has(cause)) {
      visited.add(cause)
      if (
        "code" in cause &&
        [-32601, -32004, 4200].includes(Number(cause.code))
      ) {
        return false
      }
      cause = "cause" in cause ? cause.cause : undefined
    }
    throw error
  }
}

type WalletCall = { to: Address; data?: Hex; value?: bigint }

async function sendAtomicCalls(
  wallet: ConnectedWallet,
  config: AppConfig,
  calls: WalletCall[],
  onStatus: (text: string) => void = () => {}
) {
  await assertWallet(wallet, config)
  // Never retry as separate transactions after a request may have been sent.
  const { id } = await wallet.sendCalls({ calls, forceAtomic: true })
  onStatus("Waiting for wallet confirmation…")
  const batch = await wallet.waitForCallsStatus({ id, timeout: 120_000 })
  if (
    batch.status !== "success" ||
    !batch.atomic ||
    batch.chainId !== config.chainId ||
    !batch.receipts?.length
  ) {
    throw new Error(
      "Wallet batch did not complete successfully. Check its status in your wallet before trying again."
    )
  }
  const client = publicClient(config.chainId, config.rpcUrl)
  const receipts = await Promise.all(
    batch.receipts.map(({ transactionHash }) =>
      client.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: confirmationCount(config.chainId),
      })
    )
  )
  if (receipts.some((receipt) => receipt.status !== "success")) {
    throw new Error("Wallet batch transaction failed.")
  }
  return receipts
}

export async function executeWalletCalls(
  wallet: ConnectedWallet,
  config: AppConfig,
  calls: WalletCall[]
) {
  await assertWallet(wallet, config)
  if (calls.length > 1 && (await supportsAtomicCalls(wallet, config.chainId))) {
    return sendAtomicCalls(wallet, config, calls)
  }
  const client = publicClient(config.chainId, config.rpcUrl)
  const receipts: TransactionReceipt[] = []
  // Each call depends on the preceding successful receipt (e.g. revoke before
  // withdrawal). Parallel sends could fail or spend gas after a rejected step.
  for (const call of calls) {
    // eslint-disable-next-line react-doctor/async-await-in-loop
    await assertWallet(wallet, config)
    const hash = await wallet.sendTransaction(call)
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: confirmationCount(config.chainId),
    })
    if (receipt.status !== "success") {
      throw new Error(
        "Wallet transaction reverted. Remaining steps were not sent."
      )
    }
    receipts.push(receipt)
  }
  return receipts
}

export async function authorizeAndFundSeller(
  wallet: ConnectedWallet,
  config: AppConfig,
  seller: Address
) {
  const now = (await publicClient(config.chainId, config.rpcUrl).getBlock())
    .timestamp
  return executeWalletCalls(wallet, config, [
    {
      to: config.vault,
      data: encodeFunctionData({
        abi: vaultAbi,
        functionName: "setSellerSigner",
        args: [seller, now + 30n * 86400n],
      }),
    },
    { to: seller, value: 2_000_000_000_000_000n },
  ])
}

function createdAllowanceId(
  receipts: TransactionReceipt[],
  vault: Address,
  owner: Address,
  args: readonly [Address, Address, Address[], bigint, bigint, bigint]
) {
  for (const log of receipts.flatMap((receipt) => receipt.logs)) {
    if (log.address.toLowerCase() !== vault.toLowerCase()) {
      continue
    }

    try {
      const event = decodeEventLog({
        abi: vaultAbi,
        data: log.data,
        topics: log.topics,
        eventName: "AllowanceCreated",
      })
      const created = event.args
      if (
        created.owner.toLowerCase() === owner.toLowerCase() &&
        created.buyerSigner.toLowerCase() === args[0].toLowerCase() &&
        created.budget === args[3] &&
        created.perPurchase === args[4] &&
        created.expiresAt === args[5] &&
        created.sellers.length === args[2].length &&
        created.sellers.every(
          (seller, index) =>
            seller.toLowerCase() === args[2][index]!.toLowerCase()
        )
      ) {
        return created.allowanceId.toString()
      }
    } catch {
      /* Ignore token-transfer events in the same receipt. */
    }
  }

  throw new Error("Allowance created but its identifier could not be read.")
}

export async function updateAllowance(
  wallet: ConnectedWallet,
  config: AppConfig,
  id: string,
  action: "revokeAllowance" | "withdrawUnused" | "closeAllowance"
) {
  await assertWallet(wallet, config)
  if (action === "closeAllowance") {
    const state = await publicClient(
      config.chainId,
      config.rpcUrl
    ).readContract({
      address: config.vault,
      abi: vaultAbi,
      functionName: "allowances",
      args: [BigInt(id)],
    })
    const remaining = state[2] - state[4] - state[7]
    const calls: WalletCall[] = []
    if (!state[6]) {
      calls.push({
        to: config.vault,
        data: encodeFunctionData({
          abi: vaultAbi,
          functionName: "revokeAllowance",
          args: [BigInt(id)],
        }),
      })
    }
    if (remaining > 0n) {
      calls.push({
        to: config.vault,
        data: encodeFunctionData({
          abi: vaultAbi,
          functionName: "withdrawUnused",
          args: [BigInt(id)],
        }),
      })
    }
    await executeWalletCalls(wallet, config, calls)
    return
  }
  const hash = await wallet.writeContract({
    address: config.vault as Address,
    abi: vaultAbi,
    functionName: action,
    args: [BigInt(id)],
  })
  const receipt = await publicClient(
    config.chainId,
    config.rpcUrl
  ).waitForTransactionReceipt({
    hash,
    confirmations: confirmationCount(config.chainId),
  })

  if (receipt.status !== "success") {
    throw new Error("Allowance action failed.")
  }
}

export async function confirmPurchase(
  wallet: ConnectedWallet,
  config: AppConfig,
  purchase: Purchase
) {
  await assertWallet(wallet, config)
  // Reconcile before asking the wallet to sign or send: the previous submission
  // may already have succeeded even if its response never reached this browser.
  purchase = v.parse(
    PurchaseSchema,
    await marketplaceRequest(`purchases/${purchase.id}/retry`, {})
  )
  if (purchase.paymentStatus === "confirmed") {
    return purchase
  }
  if (purchase.txHash) {
    throw new Error(
      "This purchase has already been submitted. Wait for confirmation and refresh its status."
    )
  }
  if (
    !purchase.authorization ||
    !["prepared", "pending"].includes(purchase.paymentStatus)
  ) {
    throw new Error(
      "This purchase cannot be submitted. Refresh the conversation before continuing."
    )
  }
  const signature =
    (purchase.authorization?.signature as `0x${string}` | undefined) ||
    (await wallet.signTypedData(
      buyerTypedData(purchase.offer.quote, config.chainId, config.vault)
    ))
  // Save the exact authorization before the wallet may broadcast anything.
  await marketplaceRequest(`purchases/${purchase.id}/authorize`, { signature })
  await assertWallet(wallet, config)
  const hash = await wallet.writeContract({
    address: config.vault,
    abi: vaultAbi,
    functionName: "purchase",
    args: [
      quoteMessage(purchase.offer.quote),
      purchase.offer.signature as `0x${string}`,
      signature,
    ],
  })
  return marketplaceRequest(`purchases/${purchase.id}/transaction`, {
    txHash: hash,
  })
}
