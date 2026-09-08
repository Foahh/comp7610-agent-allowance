import type { SignedQuote, Task } from "@repo/schemas"

import {
  createPublicClient,
  hashTypedData,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
  type PublicClient,
  type Transport,
  type Hex,
} from "viem"
import { sepolia, hardhat } from "viem/chains"

export const LOCAL_CHAIN_ID = 31337

export const SEPOLIA_CHAIN_ID = 11155111

export const vaultAbi = parseAbi([
  "function createAllowance(address agent,address[] sellers,uint256 budget,uint256 perPurchase,uint256 expiresAt) returns (uint256)",
  "function allowances(uint256) view returns (address owner,address agent,uint256 budget,uint256 perPurchase,uint256 spent,uint256 expiresAt,bool revoked,uint256 withdrawn)",
  "function purchase((uint256 allowanceId,bytes32 service,bytes32 requestHash,address recipient,uint256 amount,bytes32 nonce,uint256 expiresAt) quote,bytes signature)",
  "function quoteDigest((uint256 allowanceId,bytes32 service,bytes32 requestHash,address recipient,uint256 amount,bytes32 nonce,uint256 expiresAt) quote) view returns (bytes32)",
  "function allowanceSellers(uint256) view returns (address[])",
  "function purchases(bytes32) view returns (bool)",
  "function revokeAllowance(uint256 allowanceId)",
  "function withdrawUnused(uint256 allowanceId)",
  "event AllowanceCreated(uint256 indexed allowanceId,address indexed owner,address agent,address[] sellers,uint256 budget,uint256 perPurchase,uint256 expiresAt)",
  "event Purchased(bytes32 indexed purchaseId,uint256 indexed allowanceId,address indexed recipient,uint256 amount,bytes32 service,bytes32 requestHash)",
  "error Unauthorized()",
  "error InactiveAllowance()",
  "error InvalidQuote()",
  "error LimitExceeded()",
  "error DuplicatePurchase()",
])

export const tokenAbi = parseAbi([
  "function faucet()",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
])

export const quoteTypes = {
  Quote: [
    { name: "allowanceId", type: "uint256" },
    { name: "service", type: "bytes32" },
    { name: "requestHash", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const

export function quoteMessage(quote: SignedQuote["quote"]) {
  return {
    allowanceId: BigInt(quote.allowanceId),
    service: quote.service as Hex,
    requestHash: quote.requestHash as Hex,
    recipient: quote.recipient as Address,
    amount: BigInt(quote.amount),
    nonce: quote.nonce as Hex,
    expiresAt: BigInt(quote.expiresAt),
  }
}

export function quoteTypedData(
  quote: SignedQuote["quote"],
  chainId: number,
  vault: Address
) {
  return {
    domain: {
      name: "AgentSpendVault",
      version: "1",
      chainId,
      verifyingContract: vault,
    },
    types: quoteTypes,
    primaryType: "Quote" as const,
    message: quoteMessage(quote),
  }
}

export function quoteId(
  quote: SignedQuote["quote"],
  chainId: number,
  vault: Address
) {
  return hashTypedData(quoteTypedData(quote, chainId, vault))
}

export function taskHash(task: Task, deliverable = "") {
  // Fixed ordering ensures the quote commits to exactly the task delivered.
  return keccak256(
    stringToHex(
      JSON.stringify([
        task.service,
        task.version,
        task.requestId,
        task.brief,
        task.evidence,
        deliverable,
      ])
    )
  )
}

export function serviceHash(service: string) {
  return keccak256(stringToHex(service))
}

export function getChain(chainId: number) {
  if (chainId === SEPOLIA_CHAIN_ID) {
    return sepolia
  }

  if (chainId === LOCAL_CHAIN_ID) {
    return hardhat
  }

  throw new Error("Choose the local development chain or Sepolia.")
}

export function confirmationCount(chainId: number) {
  getChain(chainId)

  return chainId === LOCAL_CHAIN_ID ? 1 : 2
}

export function publicClient(
  chainId: number,
  rpcUrl: string
): PublicClient<Transport, ReturnType<typeof getChain>> {
  return createPublicClient({
    chain: getChain(chainId),
    transport: http(rpcUrl),
    ...(chainId === LOCAL_CHAIN_ID
      ? { pollingInterval: 50, cacheTime: 0 }
      : {}),
  })
}

export function listingHash(listing: {
  id: string
  version: number
  contentHash: string
}) {
  return serviceHash(
    JSON.stringify([listing.id, listing.version, listing.contentHash])
  )
}

export function identityMessage(nonce: string, endpoint: string) {
  return `Agent Spend Guard seller identity\nEndpoint: ${endpoint}\nNonce: ${nonce}`
}

export function deliveryMessage(
  id: string,
  chainId: number,
  vault: string,
  purpose: string,
  expiresAt: number
) {
  return `Agent Spend Guard delivery v1\nChain: ${chainId}\nVault: ${vault.toLowerCase()}\nPurchase: ${id}\nPurpose: ${purpose}\nExpires: ${expiresAt}`
}
