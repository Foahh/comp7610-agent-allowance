import { existsSync, readFileSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { projectRoot } from "./project-root.ts"
export { projectRoot } from "./project-root.ts"
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts"
import { getAddress, type Hex } from "viem"
import { confirmationCount, LOCAL_CHAIN_ID, SEPOLIA_CHAIN_ID } from "./chain.ts"

const root = projectRoot()
const envPath = root + ".env"
if (existsSync(envPath)) {
  loadEnvFile(envPath)
}

export function readConfig() {
  const chainId = Number(process.env.CHAIN_ID || LOCAL_CHAIN_ID)
  if (![LOCAL_CHAIN_ID, SEPOLIA_CHAIN_ID].includes(chainId)) {
    throw new Error("Unsupported chain.")
  }

  const deploymentPath = root + "data/deployment-" + chainId + ".json"
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
    rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
    confirmations: confirmationCount(chainId),
    provider: getAddress(
      process.env.PROVIDER_ADDRESS ||
        deployment?.provider ||
        (chainId === LOCAL_CHAIN_ID
          ? signer("provider", chainId).address
          : "0x0000000000000000000000000000000000000000")
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
    providerUrl: process.env.PROVIDER_URL || "http://127.0.0.1:3002",
    appOrigin: process.env.APP_ORIGIN || "http://127.0.0.1:3000",
  }
}

export type Config = ReturnType<typeof readConfig>

export function signer(
  role: "agent" | "provider" | "deployer",
  chainId: number
) {
  const key = process.env[role.toUpperCase() + "_PRIVATE_KEY"]
  if (key) {
    return privateKeyToAccount(key as Hex)
  }
  if (chainId !== LOCAL_CHAIN_ID) {
    throw new Error("Set " + role.toUpperCase() + "_PRIVATE_KEY for Sepolia.")
  }

  // Public Hardhat development mnemonic. Never selected on a public network.
  const indexes = { deployer: 0, agent: 1, provider: 2 }
  return mnemonicToAccount(
    "test test test test test test test test test test test junk",
    {
      addressIndex: indexes[role],
    }
  )
}

export function modelSettings(role: "buyer" | "seller") {
  const prefix = role.toUpperCase()
  return {
    baseURL:
      process.env[prefix + "_BASE_URL"] ||
      process.env.OPENAI_BASE_URL ||
      "https://api.openai.com/v1",
    apiKey: process.env[prefix + "_API_KEY"] || process.env.OPENAI_API_KEY,
    model: process.env[prefix + "_MODEL"] || process.env.OPENAI_MODEL,
  }
}
