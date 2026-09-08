import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  getAddress,
  isAddress,
  keccak256,
  parseAbi,
  zeroAddress,
  type Hex,
} from "viem"

import { publicClient, SEPOLIA_CHAIN_ID, VAULT_VERSION } from "./chain.ts"
import { projectRoot } from "./project-root.ts"

export type DeploymentInput = {
  rpcUrl: string
  tokenAddress: string
  vaultAddress: string
}
export type DeploymentManifest = {
  schemaVersion: 1
  chainId: number
  tokenAddress: string
  vaultAddress: string
  vaultVersion: string
  runtimeCodeHashes: { token: Hex; vault: Hex }
}
const metadataAbi = parseAbi([
  "function token() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function nextAllowanceId() view returns (uint256)",
])

// Imported hashes are not trusted. Match the local build, excluding only
// compiler-declared immutable slots; the token binding is checked separately.
export function matchesArtifact(code: Hex, name: string) {
  const artifact = JSON.parse(
    readFileSync(
      join(
        projectRoot(),
        `packages/contracts/artifacts/contracts/${name}.sol/${name}.json`
      ),
      "utf8"
    )
  ) as {
    deployedBytecode: Hex
    immutableReferences: Record<string, { start: number; length: number }[]>
  }
  function normalized(value: Hex) {
    const bytes = Buffer.from(value.slice(2), "hex")
    for (const references of Object.values(
      artifact.immutableReferences || {}
    )) {
      for (const { start, length } of references) {
        bytes.fill(0, start, start + length)
      }
    }
    return bytes.toString("hex")
  }
  return (
    code.length === artifact.deployedBytecode.length &&
    normalized(code) === normalized(artifact.deployedBytecode)
  )
}

export async function validateDeployment(
  input: DeploymentInput
): Promise<DeploymentManifest> {
  const rpc = new URL(input.rpcUrl)
  if (rpc.protocol !== "https:" || rpc.username || rpc.password || rpc.hash) {
    throw new Error(
      "Use an HTTPS Sepolia RPC URL without embedded login credentials or a fragment."
    )
  }
  for (const address of [input.tokenAddress, input.vaultAddress]) {
    if (
      !isAddress(address, { strict: true }) ||
      getAddress(address) === zeroAddress
    ) {
      throw new Error("Enter valid nonzero token and vault addresses.")
    }
  }
  const token = getAddress(input.tokenAddress)
  const vault = getAddress(input.vaultAddress)
  const client = publicClient(SEPOLIA_CHAIN_ID, rpc.toString())
  const result = await (async () => {
    if ((await client.getChainId()) !== SEPOLIA_CHAIN_ID) {
      throw new Error("network")
    }
    const [
      block,
      tokenCode,
      vaultCode,
      configuredToken,
      decimals,
      symbol,
      next,
    ] = await Promise.all([
      client.getBlock(),
      client.getCode({ address: token }),
      client.getCode({ address: vault }),
      client.readContract({
        address: vault,
        abi: metadataAbi,
        functionName: "token",
      }),
      client.readContract({
        address: token,
        abi: metadataAbi,
        functionName: "decimals",
      }),
      client.readContract({
        address: token,
        abi: metadataAbi,
        functionName: "symbol",
      }),
      client.readContract({
        address: vault,
        abi: metadataAbi,
        functionName: "nextAllowanceId",
      }),
    ])
    if (
      !tokenCode ||
      !vaultCode ||
      tokenCode === "0x" ||
      vaultCode === "0x" ||
      configuredToken.toLowerCase() !== token.toLowerCase() ||
      decimals !== 6 ||
      symbol !== "ATT" ||
      next < 1n ||
      Math.abs(Date.now() / 1000 - Number(block.timestamp)) > 300
    ) {
      throw new Error("contracts")
    }
    return { tokenCode, vaultCode }
  })().catch(() => {
    // Upstream errors can contain private RPC URLs.
    throw new Error(
      "Validation failed. Require a responsive Sepolia RPC, a six-decimal ATT token, and a vault holding that token. Check the three settings and try again."
    )
  })
  if (
    !matchesArtifact(result.tokenCode, "AllowanceTestToken") ||
    !matchesArtifact(result.vaultCode, "AgentSpendVault")
  ) {
    throw new Error(
      "Contract code does not match this application release. Import a matching deployment or use the corresponding application version."
    )
  }
  return {
    schemaVersion: 1,
    chainId: SEPOLIA_CHAIN_ID,
    tokenAddress: token,
    vaultAddress: vault,
    vaultVersion: VAULT_VERSION,
    runtimeCodeHashes: {
      token: keccak256(result.tokenCode),
      vault: keccak256(result.vaultCode),
    },
  }
}
