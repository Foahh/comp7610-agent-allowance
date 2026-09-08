import type { ListingInput } from "@repo/schemas"
import type { Config } from "@repo/utils/config"

import { mkdtempSync, rmSync } from "node:fs"
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
  market = createMarketplace({ dataDir: directory } as Config, store)
  vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "ab".repeat(32))
})

afterEach(() => {
  store.close()
  rmSync(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

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
  market = createMarketplace({ dataDir: directory } as Config, store)
  expect(market.runtimeModel(model.id).apiKey).toBe("private-api-key")
  vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "cd".repeat(32))
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
