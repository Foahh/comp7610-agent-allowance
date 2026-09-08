import {
  publicClient,
  SEPOLIA_CHAIN_ID,
  getChain,
  VAULT_VERSION,
} from "@repo/utils"
import { matchesArtifact } from "@repo/utils/deployment"
import {
  encryptSecret,
  decryptSecret,
  credentialsDirectory,
} from "@repo/utils/secrets"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"
import {
  createWalletClient,
  getAddress,
  http,
  keccak256,
  type Abi,
  type Hex,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

// Do not import application config or load the application's .env.
const root = fileURLToPath(new URL("../../../", import.meta.url))
const envPath = resolve(root, ".env.contract")
if (!existsSync(envPath)) {
  throw new Error(
    "Copy .env.contract.example to .env.contract before deploying."
  )
}
const env = parseEnv(readFileSync(envPath, "utf8"))
if (!env.RPC_URL) {
  throw new Error("Set RPC_URL in .env.contract.")
}
const directory = credentialsDirectory(
  resolve(root, env.DEPLOYER_DIRECTORY || "data/contract-credentials")
)
const keyPath = resolve(directory, "deployer.key")
if (!existsSync(keyPath)) {
  writeFileSync(keyPath, encryptSecret(generatePrivateKey(), directory), {
    flag: "wx",
    mode: 0o600,
  })
}
const account = privateKeyToAccount(
  decryptSecret(readFileSync(keyPath, "utf8"), directory) as Hex
)
const client = publicClient(SEPOLIA_CHAIN_ID, env.RPC_URL)
if ((await client.getChainId()) !== SEPOLIA_CHAIN_ID) {
  throw new Error("Deployment is restricted to Sepolia.")
}
console.log(`Deployment signer: ${account.address}`)
if ((await client.getBalance({ address: account.address })) === 0n) {
  throw new Error(
    "Fund this deployment signer with Sepolia ETH, then run deployment again."
  )
}
const wallet = createWalletClient({
  account,
  chain: getChain(SEPOLIA_CHAIN_ID),
  transport: http(env.RPC_URL),
})
async function deploy(name: string, args: readonly unknown[] = []) {
  const artifact = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          `../artifacts/contracts/${name}.sol/${name}.json`,
          import.meta.url
        )
      ),
      "utf8"
    )
  ) as { abi: Abi; bytecode: Hex }
  const hash = await wallet.deployContract({ ...artifact, args })
  const receipt = await client.waitForTransactionReceipt({
    hash,
    confirmations: 2,
  })
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("Deployment failed.")
  }
  return {
    address: receipt.contractAddress,
    hash,
    block: receipt.blockNumber.toString(),
  }
}
const token = env.TOKEN_ADDRESS
  ? getAddress(env.TOKEN_ADDRESS)
  : (await deploy("AllowanceTestToken")).address
const tokenCode = await client.getCode({ address: token })
if (!tokenCode || !matchesArtifact(tokenCode, "AllowanceTestToken")) {
  throw new Error(
    "The token must match this release's AllowanceTestToken before deploying a vault."
  )
}
const vault = await deploy("AgentSpendVault", [token])
const vaultCode = await client.getCode({ address: vault.address })
if (!tokenCode || !vaultCode) {
  throw new Error("Deployment code unavailable.")
}
const output = resolve(
  root,
  env.DEPLOYMENT_OUTPUT || "data/deployment-11155111.json"
)
mkdirSync(dirname(output), { recursive: true })
writeFileSync(
  output,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      chainId: SEPOLIA_CHAIN_ID,
      tokenAddress: token,
      vaultAddress: vault.address,
      vaultVersion: VAULT_VERSION,
      deploymentTxHash: vault.hash,
      deploymentBlock: vault.block,
      runtimeCodeHashes: {
        token: keccak256(tokenCode),
        vault: keccak256(vaultCode),
      },
    },
    null,
    2
  )}\n`
)
console.log(`Share this public deployment configuration: ${output}`)
