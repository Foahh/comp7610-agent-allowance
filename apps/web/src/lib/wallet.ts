import {
  confirmationCount,
  getChain,
  publicClient,
  tokenAbi,
  vaultAbi,
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

export async function fundAllowance(
  wallet: ConnectedWallet,
  config: AppConfig,
  total: string,
  maximum: string,
  sellers: Address[],
  onStatus: (text: string) => void
) {
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

  onStatus("Confirm creation of this conversation's allowance.")
  const creation = await wallet.writeContract({
    address: config.vault,
    abi: vaultAbi,
    functionName: "createAllowance",
    args: [config.agent, sellers, budget, cap, now + 86400n],
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
