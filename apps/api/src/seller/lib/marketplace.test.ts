import type { ListingInput } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test"

import { createMarketplace } from "./marketplace.ts"
import { openSellerDatabase } from "./store.ts"

export const textListing: ListingInput = {
  type: "text",
  name: "Private guide",
  description: "A guide",
  preview: "Public sample",
  amount: "10000",
  content: "Paid content",
  assetId: "",
  modelId: "",
  instructions: "",
  requiredInputs: "",
  deliverable: "A guide",
  scope: "One copy",
  assetIds: [],
}

let directory: string
let store: ReturnType<typeof openSellerDatabase>
let market: ReturnType<typeof createMarketplace>

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "seller-test-"))
  store = openSellerDatabase(join(directory, "seller.sqlite"))
  market = createMarketplace(
    {
      dataDir: directory,
      credentialsDir: join(directory, "credentials"),
    } as Config,
    store
  )
})

afterEach(() => {
  store.close()
  rmSync(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

test("deleting an unused file removes its bytes and metadata", () => {
  const asset = market.saveAsset(
    "unused.txt",
    "text/plain",
    Buffer.from("unused")
  )
  market.deleteAsset(asset.id)
  expect(market.assets.get(asset.id)).toBeUndefined()
  expect(existsSync(join(directory, "seller-assets", asset.id))).toBe(false)
  expect(() => market.deleteAsset(asset.id)).toThrow("File not found")
})

test("deleting a listing unpublishes it while retaining history and unique version numbers", () => {
  const listing = market.saveListing(textListing, "reusable-id")
  market.publish(listing.id, true)
  market.deleteListing(listing.id)
  expect(market.listings.list()).toEqual([])
  expect(market.published.list()).toEqual([])
  expect(market.versions.get(listing.id, 1)?.content).toBe("Paid content")
  expect(() => market.deleteListing(listing.id)).toThrow("Listing not found")
  const replacement = market.saveListing(
    { ...textListing, content: "New content" },
    listing.id
  )
  expect(replacement.version).toBe(2)
  expect(market.listings.get(listing.id)?.content).toBe("New content")
  expect(market.versions.get(listing.id, 1)?.content).toBe("Paid content")
})

test("model deletion protects buyer, draft and published references, but preserves existing execution snapshots", () => {
  const model = market.saveModel({
    name: "Model",
    baseURL: "https://example.com/v1",
    model: "chat",
    apiKey: "key",
  })
  market.settings.save("profile", {
    name: "Seller",
    description: "",
    buyerModelId: model.id,
  })
  expect(() => market.deleteModel(model.id)).toThrow("buyer model")
  market.settings.save("profile", {
    name: "Seller",
    description: "",
    buyerModelId: "",
  })
  const listing = market.saveListing({
    ...textListing,
    type: "ai-service",
    modelId: model.id,
    instructions: "Write a guide",
  })
  expect(() => market.deleteModel(model.id)).toThrow("used by a listing")
  market.publish(listing.id, true)
  const snapshot = market.snapshot(listing)
  market.saveListing(textListing, listing.id)
  expect(() => market.deleteModel(model.id)).toThrow("used by a listing")
  market.deleteListing(listing.id)
  market.deleteModel(model.id)
  expect(market.modelList()).toEqual([])
  expect(snapshot.model?.encryptedKey).toBeTruthy()
  expect(() => market.deleteModel(model.id)).toThrow(
    "Model connection not found"
  )
})

test.each(["file", "ai-service"] as const)(
  "deletion protects files referenced by historical %s listings",
  (type) => {
    const asset = market.saveAsset(
      "evidence.txt",
      "text/plain",
      Buffer.from("evidence")
    )
    const listing = market.saveListing({
      ...textListing,
      type,
      assetId: type === "file" ? asset.id : "",
      assetIds: type === "ai-service" ? [asset.id] : [],
    })
    market.saveListing(textListing, listing.id)
    expect(() => market.deleteAsset(asset.id)).toThrow("saved listing version")
    expect(market.readAsset(asset.id).bytes.toString()).toBe("evidence")
  }
)

test("catalog excludes private content and preserves purchased versions after edits and deactivation", () => {
  const first = market.saveListing(textListing)
  market.publish(first.id, true)
  const published = market.published.get(first.id)!
  expect(market.offerListing(published)).not.toHaveProperty("content")
  expect(JSON.stringify(market.offerListing(published))).not.toContain(
    "Paid content"
  )
  const edited = market.saveListing(
    { ...textListing, content: "Changed" },
    first.id
  )
  expect(edited.version).toBe(2)
  expect(market.published.get(first.id)?.version).toBe(1)
  market.publish(first.id, false)
  expect(market.published.list()).toEqual([])
  expect(market.versions.get(first.id, 1)?.content).toBe("Paid content")
})

test("demo items publish deliverable content and survive retries and reopening without overwriting edits", () => {
  expect(market.addDemoItems()).toEqual({ added: 3, skipped: 0 })
  const items = market.published.list()
  expect(items).toHaveLength(3)
  expect(items.map((item) => item.amount).sort()).toEqual([
    "1000000",
    "2000000",
    "3000000",
  ])
  for (const item of items) {
    expect(() => market.snapshot(item)).not.toThrow()
    expect(market.offerListing(item)).not.toHaveProperty("content")
    if (item.type === "file") {
      const { asset, bytes } = market.readAsset(item.assetId)
      expect(bytes.length).toBe(asset.size)
      expect(bytes.toString()).toMatch(/synthetic|checklist/i)
    } else {
      expect(item.content).toContain("Agent budgeting guide")
    }
  }
  const guide = items.find((item) => item.type === "text")!
  market.saveListing({ ...guide, name: "My edited guide" }, guide.id)
  market.publish(guide.id, false)
  store.close()
  store = openSellerDatabase(join(directory, "seller.sqlite"))
  market = createMarketplace(
    {
      dataDir: directory,
      credentialsDir: join(directory, "credentials"),
    } as Config,
    store
  )
  expect(market.addDemoItems()).toEqual({ added: 0, skipped: 3 })
  expect(market.listings.get(guide.id)).toMatchObject({
    name: "My edited guide",
    version: 2,
    status: "inactive",
  })
  expect(market.published.list()).toHaveLength(2)
  expect(market.assets.list()).toHaveLength(2)
})

test("model credentials are encrypted, write-only, and survive reopening", () => {
  const model = market.saveModel({
    name: "Model",
    baseURL: "https://example.com/v1",
    model: "chat",
    apiKey: "private-api-key",
  })
  expect(JSON.stringify(market.modelList())).not.toContain("private-api-key")
  expect(JSON.stringify(market.models.list())).not.toContain("private-api-key")
  store.close()
  store = openSellerDatabase(join(directory, "seller.sqlite"))
  market = createMarketplace(
    {
      dataDir: directory,
      credentialsDir: join(directory, "credentials"),
    } as Config,
    store
  )
  expect(market.runtimeModel(model.id).apiKey).toBe("private-api-key")
  market = createMarketplace(
    {
      dataDir: directory,
      credentialsDir: join(directory, "different-account"),
    } as Config,
    store
  )
  expect(() => market.runtimeModel(model.id)).toThrow()
})

test("files remain private and only selected readable assets enter a service snapshot", () => {
  const one = market.saveAsset(
    "../one.txt",
    "text/plain",
    Buffer.from("selected evidence")
  )
  const two = market.saveAsset(
    "two.txt",
    "text/plain",
    Buffer.from("other secret")
  )
  const binary = market.saveAsset(
    "archive.zip",
    "application/zip",
    Buffer.from([1, 2, 3])
  )
  expect(one.name).toBe("one.txt")
  expect(binary.readable).toBe(false)
  const model = market.saveModel({
    name: "Model",
    baseURL: "https://example.com/v1",
    model: "chat",
    apiKey: "key",
  })
  const listing = market.saveListing({
    ...textListing,
    type: "ai-service",
    modelId: model.id,
    instructions: "Use evidence",
    assetIds: [one.id],
  })
  const snapshot = market.snapshot(listing)
  expect(JSON.stringify(snapshot.assets)).toContain("selected evidence")
  expect(JSON.stringify(snapshot.assets)).not.toContain(two.name)
  expect(() => market.snapshot({ ...listing, assetIds: [binary.id] })).toThrow()
})

test("rejects invalid links, excessive file size, invalid UTF-8, and oversized model context", () => {
  expect(() =>
    market.snapshot(
      market.saveListing({
        ...textListing,
        type: "link",
        content: "javascript:alert(1)",
      })
    )
  ).toThrow()
  expect(() =>
    market.saveAsset("big.bin", "", new Uint8Array(20 * 1024 * 1024 + 1))
  ).toThrow()
  expect(() =>
    market.saveAsset("bad.txt", "", new Uint8Array([0xff]))
  ).toThrow()
  expect(() =>
    market.saveAsset("big.txt", "", Buffer.from("a".repeat(200001)))
  ).toThrow()
})
