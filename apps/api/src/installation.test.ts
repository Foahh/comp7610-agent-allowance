import type { DeploymentManifest } from "@repo/utils/deployment"

import { readConfig, signer } from "@repo/utils/config"
import { encryptSecret, decryptSecret } from "@repo/utils/secrets"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { test, expect } from "vite-plus/test"

import { createInstallation } from "./installation.ts"

const origin = "http://localhost:3000"
const manifest: DeploymentManifest = {
  schemaVersion: 1,
  chainId: 11155111,
  tokenAddress: "0x0000000000000000000000000000000000000001",
  vaultAddress: "0x0000000000000000000000000000000000000002",
  vaultVersion: "2",
  runtimeCodeHashes: { token: "0x00", vault: "0x00" },
}

test("wallet accounts isolate stores, sessions, configurations, and keys", async () => {
  const directory = mkdtempSync(join(tmpdir(), "account-isolation-"))
  const installation = createInstallation(
    { ...readConfig(), dataDir: directory, appOrigin: origin },
    async () => manifest
  )
  const app = installation.app
  function request(path: string, cookie = "", body?: unknown) {
    return app.request(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }
  async function login() {
    const account = privateKeyToAccount(generatePrivateKey())
    const challengeResponse = await request("/auth/challenge", "", {
      address: account.address,
    })
    const challenge = (await challengeResponse.json()) as {
      id: string
      message: string
    }
    expect(challenge.message).toContain("localhost:3000 wants you to sign in")
    const signature = await account.signMessage({ message: challenge.message })
    expect(
      (await request("/auth/verify", "", { id: challenge.id, signature }))
        .status
    ).toBe(401)
    const binding = challengeResponse.headers.get("set-cookie")!.split(";")[0]!
    const response = await request("/auth/verify", binding, {
      id: challenge.id,
      signature,
    })
    expect(response.status).toBe(200)
    expect(
      (await request("/auth/verify", binding, { id: challenge.id, signature }))
        .status
    ).toBe(401)
    return {
      account,
      cookie: response.headers.get("set-cookie")!.split(";")[0]!,
    }
  }
  try {
    const alice = await login()
    const bob = await login()
    expect((await app.request("http://evil.example/api/config")).status).toBe(
      403
    )
    expect(
      (
        await app.request("/api/auth/logout", {
          method: "POST",
          headers: { cookie: alice.cookie, origin: "http://localhost:9999" },
        })
      ).status
    ).toBe(403)
    expect(
      (
        await app.request(
          "/api/config",
          {},
          { incoming: { socket: { remoteAddress: "192.0.2.5" } } }
        )
      ).status
    ).toBe(403)
    expect((await request("/marketplace/seller/models")).status).toBe(401)
    expect((await request("/config", alice.cookie)).status).toBe(200)
    async function configure(
      cookie: string,
      rpcUrl = "https://rpc.example/private-key"
    ) {
      const validated = await request("/setup/validate", cookie, {
        rpcUrl,
        tokenAddress: manifest.tokenAddress,
        vaultAddress: manifest.vaultAddress,
      })
      const result = (await validated.json()) as { validationId: string }
      return request("/setup/save", cookie, result)
    }
    expect((await configure(alice.cookie)).status).toBe(200)
    expect(await (await request("/config", bob.cookie)).json()).toMatchObject({
      configured: false,
    })
    expect((await configure(bob.cookie)).status).toBe(200)
    const created = (await (
      await request("/conversations", alice.cookie, {
        title: "Alice private chat",
      })
    ).json()) as { id: string }
    expect(
      (await request(`/conversations/${created.id}`, bob.cookie)).status
    ).toBe(404)
    expect(await (await request("/conversations", bob.cookie)).json()).toEqual(
      []
    )
    const model = await request("/marketplace/seller/models", alice.cookie, {
      name: "Alice model",
      baseURL: "https://model.example/v1",
      model: "example",
      apiKey: "alice-private-model-key",
    })
    expect(model.status).toBe(201)
    expect(await model.text()).not.toContain("alice-private-model-key")
    expect(
      await (await request("/marketplace/seller/models", bob.cookie)).json()
    ).toEqual([])
    expect(
      (await configure(alice.cookie, "https://replacement.example/rpc")).status
    ).toBe(200)
    expect(await (await request("/config", alice.cookie)).json()).toMatchObject(
      { restartRequired: true }
    )
    expect(await (await request("/config", bob.cookie)).json()).toMatchObject({
      restartRequired: false,
    })
    const aliceConfig = (await (
      await request("/config", alice.cookie)
    ).json()) as { buyerSigner: string }
    const bobConfig = (await (await request("/config", bob.cookie)).json()) as {
      buyerSigner: string
    }
    expect(aliceConfig.buyerSigner).not.toBe(bobConfig.buyerSigner)
    expect(JSON.stringify(aliceConfig)).not.toContain("private-key")
    expect(await (await request("/setup/export", alice.cookie)).json()).toEqual(
      manifest
    )
    await request("/auth/logout", alice.cookie, {})
    expect((await request("/conversations", alice.cookie)).status).toBe(401)
    expect((await request("/conversations", bob.cookie)).status).toBe(200)
    const scopeA = join(directory, "a")
    const scopeB = join(directory, "b")
    const ciphertext = encryptSecret("private", scopeA)
    expect(() => decryptSecret(ciphertext, scopeB)).toThrow()
    expect(
      signer("buyer", {
        local: false,
        localInstallation: 0,
        credentialsDir: scopeA,
      }).address
    ).not.toBe(
      signer("buyer", {
        local: false,
        localInstallation: 0,
        credentialsDir: scopeB,
      }).address
    )
  } finally {
    installation.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("the externally reachable seller process never exposes management routes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "seller-boundary-"))
  const installation = createInstallation(
    { ...readConfig(), dataDir: directory },
    async () => manifest,
    "seller"
  )
  try {
    for (const path of [
      "/api/config",
      "/api/auth/session",
      "/api/marketplace/seller/models",
    ]) {
      expect((await installation.app.request(path)).status).toBe(404)
    }
  } finally {
    installation.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
