import { createHardhatRuntimeEnvironment } from "hardhat/hre"
import { fileURLToPath } from "node:url"
import {
  createPublicClient,
  createWalletClient,
  custom,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem"
import { hardhat } from "viem/chains"
import { beforeAll, afterAll, beforeEach, expect, test } from "vite-plus/test"

const root = fileURLToPath(new URL("../", import.meta.url))
const hre = await createHardhatRuntimeEnvironment(
  { solidity: "0.8.30" },
  {},
  root
)
const network = await hre.network.create()
const transport = custom(network.provider)
const client = createPublicClient({ chain: hardhat, transport })
const wallet = createWalletClient({ chain: hardhat, transport })
const [owner, agent, seller, otherSeller, outsider] =
  await wallet.getAddresses()
let vault: Address
let token: Address
let allowanceId: bigint
let expiresAt: bigint
let counter = 0

beforeAll(async () => {
  await hre.solidity.build(await hre.solidity.getRootFilePaths())
})

afterAll(async () => network.close())

async function deploy(name: string, args: readonly unknown[] = []) {
  const artifact = await hre.artifacts.readArtifact(name)
  const hash = await wallet.deployContract({
    account: owner!,
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex,
    args,
  })
  return (await client.waitForTransactionReceipt({ hash })).contractAddress!
}

async function write(
  name: string,
  address: Address,
  functionName: string,
  args: readonly unknown[] = [],
  account = owner!
) {
  const { abi } = await hre.artifacts.readArtifact(name)
  const hash = await wallet.writeContract({
    account,
    address,
    abi,
    functionName,
    args,
  })
  return client.waitForTransactionReceipt({ hash })
}

async function read(functionName: string, args: readonly unknown[] = []) {
  const { abi } = await hre.artifacts.readArtifact("AgentSpendVault")
  return client.readContract({ address: vault, abi, functionName, args })
}

beforeEach(async () => {
  token = await deploy("AllowanceTestToken")
  vault = await deploy("AgentSpendVault", [token])
  await write("AllowanceTestToken", token, "faucet")
  await write("AllowanceTestToken", token, "approve", [vault, 100_000_000n])
  expiresAt = (await client.getBlock()).timestamp + 3600n
  await write("AgentSpendVault", vault, "createAllowance", [
    agent,
    [seller, otherSeller],
    5_000_000n,
    2_000_000n,
    expiresAt,
  ])
  allowanceId = 1n
})

async function offer(
  amount = 2_000_000n,
  recipient = seller!,
  expiry = expiresAt
) {
  const quote = {
    allowanceId,
    service: keccak256(stringToHex("listing:1")),
    requestHash: keccak256(stringToHex("request and deliverable")),
    recipient,
    amount,
    nonce: keccak256(stringToHex(String(counter++))),
    expiresAt: expiry,
  }
  const signature = await wallet.signTypedData({
    account: recipient,
    domain: {
      name: "AgentSpendVault",
      version: "2",
      chainId: hardhat.id,
      verifyingContract: vault,
    },
    primaryType: "Quote",
    types: {
      Quote: [
        { name: "allowanceId", type: "uint256" },
        { name: "service", type: "bytes32" },
        { name: "requestHash", type: "bytes32" },
        { name: "recipient", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "bytes32" },
        { name: "expiresAt", type: "uint256" },
      ],
    },
    message: quote,
  })
  return { quote, signature }
}

async function buy(value: Awaited<ReturnType<typeof offer>>, caller = agent!) {
  return write(
    "AgentSpendVault",
    vault,
    "purchase",
    [value.quote, value.signature],
    caller
  )
}

test("shares an inclusive budget across approved sellers and rejects cumulative excess", async () => {
  await buy(await offer())
  await buy(await offer(2_000_000n, otherSeller))
  await expect(buy(await offer(1_000_001n))).rejects.toThrow()
  await buy(await offer(1_000_000n))
  const allowance = (await read("allowances", [allowanceId])) as bigint[]
  expect(allowance[4]).toBe(5_000_000n)
})

test("rejects unapproved sellers, unauthorized callers, and per-purchase excess without application checks", async () => {
  await expect(buy(await offer(1n, outsider))).rejects.toThrow()
  await expect(buy(await offer(), owner)).rejects.toThrow()
  await expect(buy(await offer(2_000_001n))).rejects.toThrow()
})

test("rejects altered quotes, replay, and expired quotes", async () => {
  const value = await offer()
  await expect(
    buy({ ...value, quote: { ...value.quote, amount: 1n } })
  ).rejects.toThrow()
  await buy(value)
  await expect(buy(value)).rejects.toThrow()
  await expect(buy(await offer(1n, seller, 1n))).rejects.toThrow()
})

test("owner revokes and withdraws once; revocation preserves previous payments", async () => {
  const value = await offer()
  await buy(value)
  await expect(
    write("AgentSpendVault", vault, "revokeAllowance", [allowanceId], outsider)
  ).rejects.toThrow()
  await expect(
    write("AgentSpendVault", vault, "withdrawUnused", [allowanceId])
  ).rejects.toThrow()
  await write("AgentSpendVault", vault, "revokeAllowance", [allowanceId])
  await expect(buy(await offer())).rejects.toThrow()
  await expect(
    write("AgentSpendVault", vault, "withdrawUnused", [allowanceId], outsider)
  ).rejects.toThrow()
  await write("AgentSpendVault", vault, "withdrawUnused", [allowanceId])
  await expect(
    write("AgentSpendVault", vault, "withdrawUnused", [allowanceId])
  ).rejects.toThrow()
  expect(
    await read("purchases", [await read("quoteDigest", [value.quote])])
  ).toBe(true)
})

test("rejects expired allowances and invalid seller sets", async () => {
  for (const sellers of [[], [seller, seller], Array(17).fill(seller)]) {
    await expect(
      write("AgentSpendVault", vault, "createAllowance", [
        agent,
        sellers,
        5n,
        2n,
        expiresAt,
      ])
    ).rejects.toThrow()
  }
  await network.provider.request({
    method: "evm_setNextBlockTimestamp",
    params: [Number(expiresAt)],
  })
  await network.provider.request({ method: "evm_mine" })
  await expect(buy(await offer(1n, seller, expiresAt + 100n))).rejects.toThrow()
  await write("AgentSpendVault", vault, "withdrawUnused", [allowanceId])
})
