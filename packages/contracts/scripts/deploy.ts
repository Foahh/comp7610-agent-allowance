import { getChain, publicClient } from "@repo/utils"
import { readConfig, signer } from "@repo/utils/config"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createWalletClient, http, type Abi, type Hex } from "viem"

const config = readConfig()
const account = signer("deployer")
const agent = signer("agent").address
const provider = signer("provider").address
const client = publicClient(config.chainId, config.rpcUrl)
const wallet = createWalletClient({
  account,
  chain: getChain(config.chainId),
  transport: http(config.rpcUrl),
})

async function deploy(name: string, args: readonly unknown[] = []) {
  const path = fileURLToPath(
    new URL(`../artifacts/contracts/${name}.sol/${name}.json`, import.meta.url)
  )
  const artifact = JSON.parse(readFileSync(path, "utf8")) as {
    abi: Abi
    bytecode: Hex
  }

  const hash = await wallet.deployContract({ ...artifact, args })
  const receipt = await client.waitForTransactionReceipt({
    hash,
    confirmations: config.confirmations,
  })

  if (!receipt.contractAddress) {
    throw new Error("Deployment did not create a contract.")
  }

  return receipt.contractAddress
}

const token = await deploy("AllowanceTestToken")
const vault = await deploy("AgentSpendVault", [token])

mkdirSync(`${config.root}data`, { recursive: true })
writeFileSync(
  `${config.root}data/deployment-${config.chainId}.json`,
  `${JSON.stringify(
    {
      chainId: config.chainId,
      token,
      vault,
      owner: account.address,
      agent,
      provider,
    },
    null,
    2
  )}\n`
)

console.log(JSON.stringify({ chainId: config.chainId, token, vault }, null, 2))
