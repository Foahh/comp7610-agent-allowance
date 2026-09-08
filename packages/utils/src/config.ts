import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { loadEnvFile } from "node:process"
import { zeroAddress, type Hex, type Address } from "viem"
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
  const apiPort = Number(process.env.API_PORT || 3001)

  return {
    root,
    // Tests construct an explicit local configuration; application setup is Sepolia.
    local: false,
    localInstallation: 0,
    chainId,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    confirmations: confirmationCount(chainId),
    // Assigned only from a verified session by the account runtime.
    owner: zeroAddress as Address,
    dataDir:
      process.env.DATA_DIRECTORY || join(root, "data", "instances", "default"),
    credentialsDir: "",
    cookieName: process.env.SESSION_COOKIE_NAME || "spend_session_default",
    sellerPublicUrl:
      process.env.PUBLIC_API_URL ||
      `http://127.0.0.1:${process.env.SELLER_PORT || apiPort + 1}`,
    token: zeroAddress as Address,
    vault: zeroAddress as Address,
    appOrigin:
      process.env.APP_ORIGIN ||
      `http://localhost:${process.env.WEB_PORT || 3000}`,
  }
}

export type Config = ReturnType<typeof readConfig>

export function signer(
  role: "buyer" | "seller",
  config: Pick<Config, "local" | "localInstallation"> & {
    credentialsDir: string
  }
) {
  if (process.env.VITEST === "true" && config.local) {
    return localAccount(role, config.localInstallation)
  }

  const directory = credentialsDirectory(config.credentialsDir)
  const path = join(directory, `${role}.key`)

  if (!existsSync(path)) {
    writeFileSync(path, encryptSecret(generatePrivateKey(), directory), {
      flag: "wx",
      mode: 0o600,
    })
  }

  return privateKeyToAccount(
    decryptSecret(readFileSync(path, "utf8"), directory) as Hex
  )
}
