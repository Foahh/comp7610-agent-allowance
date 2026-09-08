import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { loadEnvFile } from "node:process"
import { getAddress, zeroAddress, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

import { confirmationCount, SEPOLIA_CHAIN_ID } from "./chain.ts"
import { localAccount } from "./local-accounts.ts"
import { projectRoot } from "./project-root.ts"
import {
  credentialsDirectory,
  decryptSecret,
  encryptSecret,
} from "./secrets.ts"

export { projectRoot } from "./project-root.ts"

const root = projectRoot()
const envPath = join(root, ".env")

if (existsSync(envPath)) {
  loadEnvFile(envPath)
}

export function readConfig() {
  const chainId = SEPOLIA_CHAIN_ID
  const deploymentPath = join(root, "data", `deployment-${chainId}.json`)
  const deployment = existsSync(deploymentPath)
    ? (JSON.parse(readFileSync(deploymentPath, "utf8")) as {
        token: string
        vault: string
      })
    : undefined
  const apiPort = Number(process.env.API_PORT || 3001)

  return {
    root,
    // Tests construct an explicit local configuration; application setup is Sepolia.
    local: false,
    localInstallation: 0,
    chainId,
    rpcUrl:
      process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    confirmations: confirmationCount(chainId),
    owner: getAddress(process.env.OWNER_ADDRESS || zeroAddress),
    dataDir: process.env.DATA_DIRECTORY || join(root, "data", "sepolia"),
    sellerPublicUrl:
      process.env.PUBLIC_API_URL || `http://localhost:${apiPort}`,
    token: getAddress(
      process.env.TOKEN_ADDRESS || deployment?.token || zeroAddress
    ),
    vault: getAddress(
      process.env.VAULT_ADDRESS || deployment?.vault || zeroAddress
    ),
    appOrigin:
      process.env.APP_ORIGIN ||
      `http://localhost:${process.env.WEB_PORT || 3000}`,
  }
}

export type Config = ReturnType<typeof readConfig>

export function signer(
  role: "agent" | "seller" | "deployer",
  config?: Pick<Config, "local" | "localInstallation">
) {
  if (process.env.VITEST === "true" && config?.local) {
    return localAccount(role, config.localInstallation)
  }

  const path = join(credentialsDirectory(), `${role}.key`)

  if (!existsSync(path)) {
    writeFileSync(path, encryptSecret(generatePrivateKey()), {
      flag: "wx",
      mode: 0o600,
    })
  }

  return privateKeyToAccount(decryptSecret(readFileSync(path, "utf8")) as Hex)
}
