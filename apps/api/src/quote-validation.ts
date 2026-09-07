import type { Address } from "viem"
import type { Allowance, Conversation, SignedQuote } from "@repo/schemas"
import { quoteId, serviceHash, taskHash } from "@repo/utils"
import type { Config } from "@repo/utils/config"

type QuoteValidation = {
  conversation: Conversation
  offer: SignedQuote
  allowance: Allowance
  agentAddress: Address
  recoveredProvider: Address
  currentTimestamp: bigint
  config: Pick<Config, "chainId" | "vault">
}

export function assertPurchasableQuote({
  conversation,
  offer,
  allowance,
  agentAddress,
  recoveredProvider,
  currentTimestamp,
  config,
}: QuoteValidation) {
  const matchesAuthority =
    conversation.allowanceId === offer.quote.allowanceId &&
    allowance.owner.toLowerCase() === conversation.owner.toLowerCase() &&
    allowance.agent.toLowerCase() === agentAddress.toLowerCase() &&
    recoveredProvider.toLowerCase() === allowance.provider.toLowerCase() &&
    offer.quote.recipient.toLowerCase() === allowance.provider.toLowerCase()

  const matchesSignedWork =
    quoteId(offer.quote, config.chainId, config.vault) === offer.id &&
    taskHash(offer.task) === offer.quote.requestHash &&
    serviceHash(offer.task.service) === offer.quote.service

  if (!matchesAuthority || !matchesSignedWork) {
    throw new Error("Quote does not match the authorized task and allowance.")
  }
  if (allowance.revoked || BigInt(allowance.expiresAt) <= currentTimestamp) {
    throw new Error("Allowance is revoked or expired.")
  }
  if (BigInt(offer.quote.expiresAt) <= currentTimestamp) {
    throw new Error("Quote expired.")
  }

  const amount = BigInt(offer.quote.amount)
  if (
    amount <= 0n ||
    amount > BigInt(allowance.perPurchase) ||
    amount > BigInt(allowance.remaining)
  ) {
    throw new Error("Purchase exceeds the per-purchase or remaining allowance.")
  }
}
