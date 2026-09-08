import type { Purchase } from "@repo/schemas"

import {
  confirmationCount,
  getChain,
  publicClient,
  tokenAbi,
  vaultAbi,
  buyerTypedData,
  quoteMessage,
} from "@repo/utils"
import {
  createWalletClient,
  custom,
  decodeEventLog,
  parseUnits,
  type Address,
  type EIP1193Provider,
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
  const balance = await client.readContract({
    address: config.token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [wallet.account.address],
  })

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
  const creation = await wallet.writeContract({
    address: config.vault,
    abi: vaultAbi,
    functionName: "createAllowance",
    args: [
      allowanceBuyer,
      config.buyerSigner,
      sellers,
      budget,
      cap,
      now + 86400n,
    ],
  })
  const receipt = await client.waitForTransactionReceipt({
    hash: creation,
    confirmations,
  })

  if (receipt.status !== "success") {
    throw new Error("Allowance creation failed.")
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.vault.toLowerCase()) {
      continue
    }

    try {
      const event = decodeEventLog({
        abi: vaultAbi,
        data: log.data,
        topics: log.topics,
        eventName: "AllowanceCreated",
      })
      return event.args.allowanceId.toString()
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
  action: "revokeAllowance" | "withdrawUnused"
) {
  await assertWallet(wallet, config)
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
