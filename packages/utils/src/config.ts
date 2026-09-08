import { existsSync, readFileSync } from "node:fs"
import { loadEnvFile } from "node:process"

import { projectRoot } from "./project-root.ts"

export { projectRoot } from "./project-root.ts"

import { getAddress, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

import { confirmationCount, SEPOLIA_CHAIN_ID } from "./chain.ts"

const root = projectRoot()
const privateKeyPattern = /^0x[0-9a-fA-F]{64}$/
const envPath = `${root}.env`

if (existsSync(envPath)) {
  loadEnvFile(envPath)
}

export function readConfig() {
  const chainId = SEPOLIA_CHAIN_ID

  const deploymentPath = `${root}data/deployment-${chainId}.json`
  const deployment = existsSync(deploymentPath)
    ? (JSON.parse(readFileSync(deploymentPath, "utf8")) as {
        token: string
        vault: string
        provider?: string
      })
    : undefined

  return {
    root,
    chainId,
    rpcUrl:
      process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    confirmations: confirmationCount(chainId),
    provider: getAddress(
      process.env.PROVIDER_ADDRESS ||
        deployment?.provider ||
        "0x0000000000000000000000000000000000000000"
    ),
    token: getAddress(
      process.env.TOKEN_ADDRESS ||
        deployment?.token ||
        "0x0000000000000000000000000000000000000000"
    ),
    vault: getAddress(
      process.env.VAULT_ADDRESS ||
        deployment?.vault ||
        "0x0000000000000000000000000000000000000000"
    ),
    providerUrl: process.env.PROVIDER_URL || "http://localhost:3002",
    appOrigin: process.env.APP_ORIGIN || "http://localhost:3000",
  }
}

export type Config = ReturnType<typeof readConfig>

export function signer(role: "agent" | "provider" | "deployer") {
  const variable = `${role.toUpperCase()}_PRIVATE_KEY`
  const key = process.env[variable]?.trim()

  if (!key) {
    throw new Error(`Set ${role.toUpperCase()}_PRIVATE_KEY for Sepolia.`)
  }

  if (!privateKeyPattern.test(key)) {
    throw new Error(
      `${variable} must be 0x followed by 64 hexadecimal characters.`
    )
  }

  try {
    return privateKeyToAccount(key as Hex)
  } catch {
    throw new Error(`${variable} is not a valid secp256k1 private key.`)
  }
}

export function modelSettings(role: "buyer" | "seller") {
  const prefix = role.toUpperCase()

  return {
    baseURL:
      process.env[`${prefix}_BASE_URL`] ||
      process.env.OPENAI_BASE_URL ||
      "https://api.openai.com/v1",
    apiKey: process.env[`${prefix}_API_KEY`] || process.env.OPENAI_API_KEY,
    model: process.env[`${prefix}_MODEL`] || process.env.OPENAI_MODEL,
  }
}
