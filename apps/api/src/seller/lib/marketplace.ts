import type {
  Asset,
  Listing,
  ListingInput,
  ModelConnection,
  ModelInput,
  StoredModel,
  ExecutionSnapshot,
} from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { createSellerQueries } from "@repo/db/marketplace"
import { publicListing } from "@repo/schemas"
import { endpointUrl } from "@repo/utils/http"
import { decryptSecret, encryptSecret } from "@repo/utils/secrets"
import { HTTPException } from "hono/http-exception"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { keccak256, stringToHex } from "viem"

import type { SellerStore } from "./store.ts"

import { demoItems } from "./demo-items.ts"

export type { StoredModel, ExecutionSnapshot } from "@repo/schemas"

export function createMarketplace(config: Config, store: SellerStore) {
  const { listings, versions, published, models, assets, settings } =
    createSellerQueries(store.db)
  const assetDirectory = join(config.dataDir, "seller-assets")

  function profile() {
    return (
      settings.get("profile") ?? {
        name: "My seller",
        description: "",
        buyerModelId: "",
      }
    )
  }

  function saveModel(input: ModelInput, id: string = randomUUID()) {
    const previous = models.get(id)
    const encryptedKey = input.apiKey
      ? encryptSecret(input.apiKey, config.credentialsDir)
      : previous?.encryptedKey

    if (!encryptedKey) {
      throw new Error("An API key is required for a new connection.")
    }

    models.save(id, {
      id,
      name: input.name,
      baseURL: endpointUrl(input.baseURL),
      model: input.model,
      encryptedKey,
    })

    return modelList().find((model) => model.id === id)!
  }

  function modelList(): ModelConnection[] {
    return models.list().map(({ encryptedKey, ...model }) => ({
      ...model,
      hasKey: !!encryptedKey,
    }))
  }

  function runtimeModel(id: string) {
    const model = models.get(id)

    if (!model) {
      throw new Error("Select a saved model connection in Settings.")
    }

    return decodeModel(model, config.credentialsDir)
  }

  function saveListing(input: ListingInput, id: string = randomUUID()) {
    const listing: Listing = {
      ...input,
      id,
      version: listings.latestVersion(id) + 1,
      status: "draft",
      createdAt: Date.now(),
    }

    listings.save(id, listing)

    return listing
  }

  function deleteListing(id: string) {
    if (!listings.get(id)) {
      throw new HTTPException(404, { message: "Listing not found." })
    }
    // Removing the head also removes publication; historical versions serve purchases.
    listings.remove(id)
  }

  function deleteModel(id: string) {
    if (!models.get(id)) {
      throw new HTTPException(404, { message: "Model connection not found." })
    }
    if (profile().buyerModelId === id) {
      throw new HTTPException(409, {
        message:
          "Select another buyer model in Settings before deleting this connection.",
      })
    }
    if (
      [...listings.list(), ...published.list()].some(
        (listing) => listing.modelId === id
      )
    ) {
      throw new HTTPException(409, {
        message:
          "This model is used by a listing. Change its model and republish, or delete the listing first.",
      })
    }
    models.remove(id)
  }

  function saveAsset(
    name: string,
    mediaType: string,
    bytes: Uint8Array
  ): Asset {
    if (bytes.length > 20 * 1024 * 1024) {
      throw new Error("Files may be at most 20 MiB.")
    }

    const safeName =
      basename(name.replaceAll("\\", "/")).slice(0, 200) || "attachment"
    const readable = [".txt", ".md", ".csv", ".json"].includes(
      extname(safeName).toLowerCase()
    )

    if (readable) {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)

      if (text.length > 200000) {
        throw new Error(
          "Readable files may contain at most 200,000 characters."
        )
      }

      if (extname(safeName).toLowerCase() === ".json") {
        JSON.parse(text)
      }
    }

    const asset: Asset = {
      id: randomUUID(),
      name: safeName,
      mediaType: mediaType || "application/octet-stream",
      size: bytes.length,
      hash: keccak256(bytes),
      readable,
    }

    mkdirSync(assetDirectory, { recursive: true })
    writeFileSync(join(assetDirectory, asset.id), bytes, { flag: "wx" })
    assets.save(asset.id, asset)

    return asset
  }

  function deleteAsset(id: string) {
    const asset = assets.get(id)
    if (!asset) {
      throw new Error("File not found.")
    }
    if (assets.isReferenced(id)) {
      throw new Error(
        "This file is still needed by a current listing or file order. Remove it from the listing and republish, or delete the listing. Files needed by existing orders must be kept."
      )
    }
    rmSync(join(assetDirectory, asset.id), { force: true })
    assets.remove(id)
  }

  function readAsset(id: string) {
    const asset = assets.get(id)

    if (!asset) {
      throw new Error("Asset not found.")
    }

    const bytes = readFileSync(join(assetDirectory, asset.id))

    if (keccak256(bytes) !== asset.hash) {
      throw new Error("Stored file integrity check failed.")
    }

    return { asset, bytes }
  }

  function snapshot(listing: Listing): ExecutionSnapshot {
    let model: StoredModel | undefined
    const selected = listing.assetIds.map((id) => {
      const { asset, bytes } = readAsset(id)

      if (!asset.readable) {
        throw new Error(
          "Knowledge assets must be text, Markdown, CSV, or JSON."
        )
      }

      return { name: asset.name, text: bytes.toString("utf8") }
    })

    if (listing.type === "ai-service") {
      model = models.get(listing.modelId)

      if (
        !model ||
        !listing.instructions.trim() ||
        !listing.deliverable.trim()
      ) {
        throw new Error(
          "AI services require a model, instructions, and deliverable."
        )
      }
    }

    if (listing.type === "file") {
      readAsset(listing.assetId)
    }

    if (["text", "link"].includes(listing.type) && !listing.content.trim()) {
      throw new Error("Provide the private content before publishing.")
    }

    if (listing.type === "link") {
      const url = new URL(listing.content)

      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error("Links must use HTTP(S) without embedded credentials.")
      }
    }

    assertContextSize(
      listing.instructions,
      ...selected.map((asset) => asset.text)
    )

    return { listing, model, assets: selected }
  }

  function publish(id: string, active: boolean) {
    const listing = listings.get(id)

    if (!listing) {
      throw new Error("Listing not found.")
    }

    if (active) {
      snapshot(listing)
      published.save(id, { ...listing, status: "active" })
    } else {
      published.remove(id)
    }

    const updated: Listing = {
      ...listing,
      status: active ? "active" : "inactive",
    }

    listings.save(id, updated)

    return updated
  }

  function offerListing(listing: Listing) {
    const assetHashes = [...listing.assetIds, listing.assetId]
      .filter(Boolean)
      .map((id) => assets.get(id)?.hash)
    // Commit to private content without including it in catalog responses.
    const hash = keccak256(stringToHex(JSON.stringify([listing, assetHashes])))

    return publicListing(listing, hash)
  }

  function addDemoItems() {
    let added = 0
    for (const item of demoItems) {
      if (listings.get(item.id)) {
        continue
      }
      const asset =
        "filename" in item
          ? saveAsset(item.filename, item.mediaType, Buffer.from(item.content))
          : undefined
      saveListing(
        {
          name: item.name,
          description: item.description,
          preview: item.preview,
          type: asset ? "file" : "text",
          amount: item.amount,
          content: asset ? "" : item.content,
          assetId: asset?.id ?? "",
          modelId: "",
          instructions: "",
          requiredInputs: "",
          deliverable: item.deliverable,
          scope: "One copy of the supplied demonstration resource",
          assetIds: [],
        },
        item.id
      )
      publish(item.id, true)
      added++
    }
    return { added, skipped: demoItems.length - added }
  }

  return {
    credentialsDir: config.credentialsDir,
    listings,
    versions,
    published,
    assets,
    models,
    settings,
    profile,
    saveModel,
    deleteModel,
    modelList,
    runtimeModel,
    saveListing,
    deleteListing,
    saveAsset,
    deleteAsset,
    readAsset,
    snapshot,
    publish,
    offerListing,
    addDemoItems,
  }
}

export function decodeModel(model: StoredModel, credentialsDir: string) {
  return {
    baseURL: model.baseURL,
    model: model.model,
    apiKey: decryptSecret(model.encryptedKey, credentialsDir),
  }
}

export function assertContextSize(...parts: string[]) {
  if (parts.reduce((total, part) => total + part.length, 0) > 200000) {
    throw new Error(
      "Model context exceeds 200,000 characters. Reduce the inputs or selected assets."
    )
  }
}

export type Marketplace = ReturnType<typeof createMarketplace>
