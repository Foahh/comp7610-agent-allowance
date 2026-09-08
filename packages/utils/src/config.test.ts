import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vite-plus/test"

import { readConfig, signer } from "./config.ts"

let directory: string | undefined

afterEach(() => {
  vi.unstubAllEnvs()

  if (directory) {
    rmSync(directory, { recursive: true, force: true })
    directory = undefined
  }
})

test("normal configuration stays on Sepolia even when obsolete local settings exist", () => {
  vi.stubEnv("NETWORK", "local")

  expect(readConfig().chainId).toBe(11155111)
  expect(readConfig().local).toBe(false)
})

test("backend keys are generated once and encrypted without private-key environment configuration", () => {
  directory = mkdtempSync(join(tmpdir(), "generated-credentials-"))
  const config = { ...readConfig(), credentialsDir: directory }
  vi.stubEnv("AGENT_PRIVATE_KEY", "obsolete-and-ignored")

  const first = signer("buyer", config)
  const encrypted = readFileSync(join(directory, "buyer.key"), "utf8")

  expect(signer("buyer", config).address).toBe(first.address)
  expect(signer("seller", config).address).not.toBe(first.address)
  expect(encrypted.split(".")).toHaveLength(3)
  expect(readFileSync(join(directory, "encryption.key"), "utf8")).toHaveLength(
    64
  )
})
