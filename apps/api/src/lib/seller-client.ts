import type { Purchase, SellerConnection, Task } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { createBuyerMarketplaceQueries } from "@repo/db/marketplace"
import {
  DeliverySchema,
  PublicListingSchema,
  SellerIdentitySchema,
  SignedQuoteSchema,
} from "@repo/schemas"
import { deliveryMessage, identityMessage } from "@repo/utils"
import { publicClient, vaultAbi } from "@repo/utils"
import { signer } from "@repo/utils/config"
import { boundedResponse, endpointRequest, endpointUrl } from "@repo/utils/http"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as v from "valibot"
import { keccak256, recoverMessageAddress } from "viem"

import type { BuyerStore } from "./store.ts"

const ProofSchema = v.object({
  identity: SellerIdentitySchema,
  signature: v.string(),
})
const QuoteResponseSchema = v.union([
  v.object({ offer: SignedQuoteSchema }),
  v.object({ clarification: v.string() }),
])

export function createSellerClient(config: Config, store: BuyerStore) {
  const { connections, destinations, files } = createBuyerMarketplaceQueries(
    store.db
  )

  async function inspect(endpoint: string) {
    const normalized = endpointUrl(endpoint)
    const nonce = randomUUID()
    const proof = v.parse(
      ProofSchema,
      await endpointRequest(normalized, "/v1/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nonce, endpoint: normalized }),
      })
    )
    const recovered = await recoverMessageAddress({
      message: identityMessage(nonce, normalized, proof.identity),
      signature: proof.signature as `0x${string}`,
    })
    const { identity } = proof
    const validSigner =
      recovered.toLowerCase() === identity.address.toLowerCase() ||
      (await publicClient(config.chainId, config.rpcUrl).readContract({
        address: config.vault,
        abi: vaultAbi,
        functionName: "sellerSigners",
        args: [identity.address as `0x${string}`, recovered],
      })) > BigInt(Math.floor(Date.now() / 1000))

    if (
      !validSigner ||
      identity.chainId !== config.chainId ||
      identity.vault.toLowerCase() !== config.vault.toLowerCase() ||
      identity.token.toLowerCase() !== config.token.toLowerCase()
    ) {
      throw new Error(
        "Seller identity or chain, vault, and token configuration does not match this installation."
      )
    }

    const listings = v.parse(
      v.array(PublicListingSchema),
      await endpointRequest(normalized, "/v1/catalog")
    )

    return { endpoint: normalized, identity, listings }
  }

  async function connect(endpoint: string) {
    const info = await inspect(endpoint)
    const existing = connections
      .list()
      .find((item) => item.endpoint === info.endpoint)

    if (existing) {
      throw new Error(
        "Endpoint already saved. Refresh it or remove it before reconnecting."
      )
    }

    const connection: SellerConnection = {
      ...info,
      id: randomUUID(),
      enabled: true,
      status: "online",
      checkedAt: Date.now(),
    }
    connections.save(connection.id, connection)

    return connection
  }

  async function refresh(id: string) {
    const previous = connections.get(id)

    if (!previous) {
      throw new Error("Seller connection not found.")
    }

    let updated: SellerConnection

    try {
      const info = await inspect(previous.endpoint)

      if (
        info.identity.address.toLowerCase() !==
        previous.identity.address.toLowerCase()
      ) {
        updated = {
          ...previous,
          enabled: false,
          status: "identity-changed",
          checkedAt: Date.now(),
          error:
            "Seller identity changed. Remove and reconnect, then authorize the new address in your wallet.",
        }
      } else {
        updated = {
          ...previous,
          ...info,
          status: "online",
          error: undefined,
          checkedAt: Date.now(),
        }
      }
    } catch {
      updated = {
        ...previous,
        status: "offline",
        checkedAt: Date.now(),
        error:
          "Could not verify this seller. Check its endpoint and deployment configuration.",
      }
    }
    connections.save(id, updated)

    return updated
  }

  // Discovery integration point: a future registry supplies the same candidates.
  function discover() {
    return connections
      .list()
      .filter(
        (connection) => connection.enabled && connection.status === "online"
      )
      .flatMap((connection) =>
        connection.listings.map((listing) => ({
          sellerId: connection.id,
          seller: connection.identity,
          listing,
        }))
      )
  }

  async function quote(allowanceId: string, task: Task) {
    const connection = connections.get(task.sellerId)

    if (!connection?.enabled || connection.status !== "online") {
      throw new Error("Connect and enable this seller before buying.")
    }

    const listing = connection.listings.find(
      (item) => item.id === task.service && item.version === task.version
    )

    if (!listing) {
      throw new Error(
        "Refresh the seller catalog and select a listing version."
      )
    }

    const result = v.parse(
      QuoteResponseSchema,
      await endpointRequest(connection.endpoint, "/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowanceId, task }),
      })
    )

    if ("offer" in result) {
      const { offer } = result

      if (
        offer.quote.recipient.toLowerCase() !==
          connection.identity.address.toLowerCase() ||
        JSON.stringify(offer.listing) !== JSON.stringify(listing) ||
        offer.quote.amount !== listing.amount
      ) {
        throw new Error(
          "Seller changed the listing or payment recipient. Refresh before requesting another quote."
        )
      }
      destinations.save(offer.id, { endpoint: connection.endpoint })
    }

    return result
  }

  async function authorization(id: string, purpose: string) {
    const expiresAt = Math.floor(Date.now() / 1000) + 120

    return {
      expiresAt,
      signature: await signer("buyer", config).signMessage({
        message: deliveryMessage(
          id,
          config.chainId,
          config.vault,
          purpose,
          expiresAt
        ),
      }),
    }
  }

  function destination(id: string) {
    const value = destinations.get(id)

    if (!value) {
      throw new Error("Purchase destination is missing.")
    }

    return value.endpoint
  }

  async function cacheFile(purchase: Purchase) {
    if (!purchase.delivery?.file || files.get(purchase.id)) {
      return
    }

    const response = await fetch(
      `${destination(purchase.id)}/v1/purchases/${purchase.id}/file`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(90000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify(await authorization(purchase.id, "file")),
      }
    )

    if (!response.ok) {
      throw new Error("File retrieval failed. Retry without another payment.")
    }

    const bytes = await boundedResponse(response, 20 * 1024 * 1024)

    if (
      keccak256(bytes) !== purchase.delivery.file.hash ||
      bytes.length !== purchase.delivery.file.size
    ) {
      throw new Error("Delivered file does not match its receipt.")
    }

    const directory = join(config.dataDir, "purchased-files")
    mkdirSync(directory, { recursive: true })
    const path = join(directory, purchase.id)
    writeFileSync(path, bytes)
    files.save(purchase.id, { path })
  }

  async function deliver(purchase: Purchase, retry = false) {
    const delivery = v.parse(
      DeliverySchema,
      await endpointRequest(
        destination(purchase.id),
        `/v1/purchases/${purchase.id}/delivery`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(await authorization(purchase.id, retry ? "retry" : "deliver")),
            txHash: purchase.txHash,
            retry,
          }),
        }
      )
    )

    if (delivery.purchaseId !== purchase.id) {
      throw new Error("Seller returned a different purchase.")
    }

    purchase.delivery = delivery
    await cacheFile(purchase)

    return delivery
  }

  async function file(purchase: Purchase) {
    await cacheFile(purchase)
    const cached = files.get(purchase.id)

    if (!cached || !purchase.delivery?.file) {
      throw new Error("Purchased file is unavailable.")
    }

    const bytes = readFileSync(cached.path)

    if (keccak256(bytes) !== purchase.delivery.file.hash) {
      throw new Error("Cached file integrity check failed.")
    }

    return bytes
  }

  return { connections, connect, refresh, discover, quote, deliver, file }
}

export type SellerClient = ReturnType<typeof createSellerClient>
