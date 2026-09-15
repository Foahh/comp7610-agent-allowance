import type { Allowance, Conversation, SignedQuote } from "@repo/schemas"
import type { Config } from "@repo/utils/config"
import type { Address } from "viem"

import { quoteId, listingHash, taskHash } from "@repo/utils"
import { formatUnits } from "viem"

type QuoteValidation = {
  conversation: Conversation
  offer: SignedQuote
  allowance: Allowance
  buyerAddress: Address
  recoveredSeller: Address
  currentTimestamp: bigint
  config: Pick<Config, "chainId" | "vault">
}

export function assertPurchasableQuote({
  conversation,
  offer,
  allowance,
  buyerAddress,
  recoveredSeller,
  currentTimestamp,
  config,
}: QuoteValidation) {
  const matchesAuthority =
    conversation.allowanceId === offer.quote.allowanceId &&
    allowance.owner.toLowerCase() === conversation.owner.toLowerCase() &&
    allowance.buyerSigner.toLowerCase() === buyerAddress.toLowerCase() &&
    recoveredSeller.toLowerCase() === offer.quote.recipient.toLowerCase() &&
    allowance.sellers.some(
      (seller) => seller.toLowerCase() === offer.quote.recipient.toLowerCase()
    )

  const matchesSignedWork =
    quoteId(offer.quote, config.chainId, config.vault) === offer.id &&
    taskHash(offer.task, offer.deliverable) === offer.quote.requestHash &&
    listingHash(offer.listing) === offer.quote.service &&
    offer.listing.id === offer.task.service &&
    offer.listing.version === offer.task.version &&
    offer.listing.amount === offer.quote.amount

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
    throw new Error(
      `Purchase exceeds the per-purchase or remaining allowance. Price: ${formatUnits(amount, 6)} ATT; per-purchase cap: ${formatUnits(BigInt(allowance.perPurchase), 6)} ATT; remaining: ${formatUnits(BigInt(allowance.remaining), 6)} ATT.`
    )
  }
}
