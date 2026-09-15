import { readConfig } from "@repo/utils/config"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { privateKeyToAccount } from "viem/accounts"
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test"

import type { Payments } from "../lib/payments.ts"

import { createApp } from "../app.ts"
import { openBuyerDatabase } from "../lib/store.ts"

const owner = privateKeyToAccount(`0x${"3".padStart(64, "0")}`)
const other = privateKeyToAccount(`0x${"4".padStart(64, "0")}`)
const origin = "http://localhost:3000"
let directory: string
let store: ReturnType<typeof openBuyerDatabase>
let app: ReturnType<typeof createApp>

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "marketplace-api-"))
  store = openBuyerDatabase(":memory:")
  app = createApp(
    {
      ...readConfig(),
      local: true,
      dataDir: directory,
      credentialsDir: join(directory, "credentials"),
      owner: owner.address,
      appOrigin: origin,
    },
    store,
    { account: { address: owner.address } } as Payments
  )
})

afterEach(() => {
  store.close()
  rmSync(directory, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

function json(body: unknown, cookie = "") {
  return {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  }
}

async function session() {
  const response = await app.request(
    "/api/auth/challenge",
    json({ address: owner.address })
  )
  const challenge = (await response.json()) as { id: string; message: string }
  const signature = await owner.signMessage({ message: challenge.message })
  const verified = await app.request(
    "/api/auth/verify",
    json(
      { id: challenge.id, signature },
      response.headers.get("set-cookie")!.split(";")[0]
    )
  )
  expect(verified.status).toBe(200)

  return verified.headers.get("set-cookie")!.split(";")[0]!
}

test("a scoped runtime admits only its account; challenges are browser-bound and one-use", async () => {
  expect(
    (await app.request("/api/auth/challenge", json({ address: other.address })))
      .status
  ).toBe(403)
  const response = await app.request(
    "/api/auth/challenge",
    json({ address: owner.address })
  )
  const challenge = (await response.json()) as { id: string; message: string }
  const signature = await owner.signMessage({ message: challenge.message })
  const verify = () =>
    app.request(
      "/api/auth/verify",
      json(
        { id: challenge.id, signature },
        response.headers.get("set-cookie")!.split(";")[0]
      )
    )
  expect((await verify()).status).toBe(200)
  expect((await verify()).status).toBe(401)
})

test("private routes require an owner session and same-origin mutations", async () => {
  for (const path of [
    "connections",
    "purchases",
    "seller/models",
    "seller/listings",
  ]) {
    expect((await app.request(`/api/marketplace/${path}`)).status).toBe(401)
  }

  const cookie = await session()
  expect(
    (await app.request("/api/marketplace/connections", { headers: { cookie } }))
      .status
  ).toBe(200)
  expect(
    (
      await app.request("/api/marketplace/connections", {
        ...json({ endpoint: "https://example.com" }, cookie),
        headers: {
          cookie,
          origin: "https://attacker.invalid",
          "content-type": "application/json",
        },
      })
    ).status
  ).toBe(403)
})

test("seller administration cannot expose runtime credentials and accepts private asset uploads", async () => {
  const cookie = await session()
  expect(
    (
      await app.request("/api/marketplace/seller/runtime-model", {
        headers: { cookie },
      })
    ).status
  ).toBe(404)
  const upstream = vi
    .fn()
    .mockResolvedValue(Response.json({ id: "asset" }, { status: 201 }))
  vi.stubGlobal("fetch", upstream)
  const body = new FormData()
  body.set("file", new File(["test"], "test.txt"))
  const response = await app.request("/api/marketplace/seller/assets", {
    method: "POST",
    headers: { origin, cookie },
    body,
  })
  expect(response.status).toBe(201)
  expect(upstream).not.toHaveBeenCalled()
})

test("unpaid or unknown downloads never reach the seller", async () => {
  const cookie = await session()
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  expect(
    (
      await app.request("/api/marketplace/purchases/unknown/file", {
        headers: { cookie },
      })
    ).status
  ).toBe(400)
  expect(fetch).not.toHaveBeenCalled()
})

test("file deletion requires an owner session and same origin", async () => {
  const cookie = await session()
  const body = new FormData()
  body.set("file", new File(["unused"], "unused.txt"))
  const uploaded = await app.request("/api/marketplace/seller/assets", {
    method: "POST",
    headers: { origin, cookie },
    body,
  })
  expect(uploaded.status).toBe(201)
  const asset = (await uploaded.json()) as { id: string }
  const path = `/api/marketplace/seller/assets/${asset.id}`
  expect(
    (await app.request(path, { method: "DELETE", headers: { origin } })).status
  ).toBe(401)
  expect(
    (
      await app.request(path, {
        method: "DELETE",
        headers: { cookie, origin: "https://attacker.invalid" },
      })
    ).status
  ).toBe(403)
  expect(
    (await app.request(path, { method: "DELETE", headers: { origin, cookie } }))
      .status
  ).toBe(200)
  expect(
    (await app.request(path, { method: "DELETE", headers: { origin, cookie } }))
      .status
  ).toBe(404)
  const listed = await app.request("/api/marketplace/seller/assets", {
    headers: { cookie },
  })
  expect(await listed.json()).toEqual([])
})

test.each(["models", "listings"])(
  "%s deletion requires an owner session and same origin",
  async (resource) => {
    const cookie = await session()
    const created = await app.request(
      resource === "models"
        ? "/api/marketplace/seller/models"
        : "/api/marketplace/seller/templates/writing",
      json(
        resource === "models"
          ? {
              name: "Disposable model",
              baseURL: "https://example.com/v1",
              model: "chat",
              apiKey: "test-key",
            }
          : {},
        cookie
      )
    )
    expect(created.status).toBe(201)
    const item = (await created.json()) as { id: string }
    const path = `/api/marketplace/seller/${resource}/${item.id}`
    expect(
      (await app.request(path, { method: "DELETE", headers: { origin } }))
        .status
    ).toBe(401)
    expect(
      (
        await app.request(path, {
          method: "DELETE",
          headers: { origin: "https://attacker.invalid", cookie },
        })
      ).status
    ).toBe(403)
    expect(
      (
        await app.request(path, {
          method: "DELETE",
          headers: { origin, cookie },
        })
      ).status
    ).toBe(200)
    const missing = await app.request(path, {
      method: "DELETE",
      headers: { origin, cookie },
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toHaveProperty("error")
    const listed = await app.request(`/api/marketplace/seller/${resource}`, {
      headers: { cookie },
    })
    expect(await listed.json()).toEqual([])
  }
)

test("model validation errors never echo submitted credentials", async () => {
  const cookie = await session()
  const apiKey = "private-test-value".repeat(300)
  const response = await app.request(
    "/api/marketplace/seller/models",
    json(
      {
        name: "Test",
        baseURL: "https://example.invalid",
        model: "test",
        apiKey,
      },
      cookie
    )
  )

  expect(response.status).toBe(400)
  expect(await response.text()).not.toContain("private-test-value")
})

test("LAN seller exposure does not expose management routes", async () => {
  const response = await app.request(
    "/api/config",
    {},
    {
      incoming: { socket: { remoteAddress: "192.168.1.10" } },
    }
  )

  expect(response.status).toBe(403)
})
