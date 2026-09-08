import type { Hex } from "viem"

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, expect, test, vi } from "vite-plus/test"

import { validateDeployment } from "./deployment.ts"
import { projectRoot } from "./project-root.ts"

const rpc = vi.hoisted(() => ({
  getChainId: vi.fn(),
  getBlock: vi.fn(),
  getCode: vi.fn(),
  readContract: vi.fn(),
}))
vi.mock("./chain.ts", async (original) => ({
  ...(await original<typeof import("./chain.ts")>()),
  publicClient: () => rpc,
}))
const input = {
  rpcUrl: "https://rpc.example/private-key",
  tokenAddress: "0x0000000000000000000000000000000000000001",
  vaultAddress: "0x0000000000000000000000000000000000000002",
}
beforeEach(() => {
  vi.resetAllMocks()
  rpc.getChainId.mockResolvedValue(11155111)
  rpc.getBlock.mockResolvedValue({
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  })
  rpc.getCode.mockResolvedValue("0x1234")
})
test.each([1, 31337])(
  "application setup rejects chain %s before inspecting contracts",
  async (chainId) => {
    rpc.getChainId.mockResolvedValue(chainId)
    await expect(validateDeployment(input)).rejects.toThrow("Sepolia")
    expect(rpc.getCode).not.toHaveBeenCalled()
  }
)
test("invalid addresses and insecure RPC endpoints cannot be saved", async () => {
  await expect(
    validateDeployment({
      ...input,
      tokenAddress: "0x0000000000000000000000000000000000000000",
    })
  ).rejects.toThrow("nonzero")
  await expect(
    validateDeployment({ ...input, rpcUrl: "http://localhost:8545" })
  ).rejects.toThrow("HTTPS")
  expect(rpc.getChainId).not.toHaveBeenCalled()
})
test("rejects a vault with another token and masks RPC credentials in errors", async () => {
  rpc.readContract.mockImplementation(({ functionName }) =>
    Promise.resolve(
      {
        token: input.vaultAddress,
        decimals: 6,
        symbol: "ATT",
        nextAllowanceId: 1n,
      }[functionName as "token"]
    )
  )
  await expect(validateDeployment(input)).rejects.toThrow(
    "vault holding that token"
  )
  rpc.getChainId.mockRejectedValue(new Error(input.rpcUrl))
  await expect(validateDeployment(input)).rejects.not.toThrow("private-key")
})

test("validates release code with deployed immutable values and rejects modified code", async () => {
  const codes = ["AllowanceTestToken", "AgentSpendVault"].map((name) => {
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
    const code = Buffer.from(artifact.deployedBytecode.slice(2), "hex")
    for (const slots of Object.values(artifact.immutableReferences)) {
      for (const slot of slots) {
        code.fill(1, slot.start, slot.start + slot.length)
      }
    }
    return `0x${code.toString("hex")}`
  })
  rpc.getCode.mockImplementation(({ address }) =>
    Promise.resolve(address === input.tokenAddress ? codes[0] : codes[1])
  )
  rpc.readContract.mockImplementation(({ functionName }) =>
    Promise.resolve(
      {
        token: input.tokenAddress,
        decimals: 6,
        symbol: "ATT",
        nextAllowanceId: 1n,
      }[functionName as "token"]
    )
  )
  expect(await validateDeployment(input)).toMatchObject({
    chainId: 11155111,
    vaultVersion: "2",
  })
  codes[1] = `0xff${codes[1]!.slice(4)}`
  await expect(validateDeployment(input)).rejects.toThrow("does not match")
})
