import { buyerTypedData, quoteTypedData } from "@repo/utils"
import { createHardhatRuntimeEnvironment } from "hardhat/hre"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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
const directory = mkdtempSync(join(tmpdir(), "vault-tests-"))
const hre = await createHardhatRuntimeEnvironment(
  {
    solidity: "0.8.30",
    paths: {
      artifacts: join(directory, "artifacts"),
      cache: join(directory, "cache"),
    },
  },
  {},
  root
)
const network = await hre.network.create()
const transport = custom(network.provider)
const client = createPublicClient({ chain: hardhat, transport })
const wallet = createWalletClient({ chain: hardhat, transport })
const [owner, buyerSigner, seller, otherSeller, outsider] =
  await wallet.getAddresses()
let vault: Address
let token: Address
let allowanceId: bigint
let expiresAt: bigint
let counter = 0

beforeAll(async () => {
  await hre.solidity.build(await hre.solidity.getRootFilePaths())
})

afterAll(async () => {
  await network.close()
  rmSync(directory, { recursive: true, force: true })
})

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
    buyerSigner,
    buyerSigner,
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

async function buy(
  value: Awaited<ReturnType<typeof offer>>,
  authorizer = buyerSigner!
) {
  const buyerSignature = await wallet.signTypedData({
    account: authorizer,
    ...buyerTypedData(serializedQuote(value.quote), hardhat.id, vault),
  })
  return write(
    "AgentSpendVault",
    vault,
    "purchase",
    [value.quote, value.signature, buyerSignature],
    outsider
  )
}

function serializedQuote(quote: Awaited<ReturnType<typeof offer>>["quote"]) {
  return {
    ...quote,
    allowanceId: quote.allowanceId.toString(),
    amount: quote.amount.toString(),
    expiresAt: quote.expiresAt.toString(),
  }
}

test("relayed purchases require buyer authorization bound to the exact quote and vault", async () => {
  const value = await offer(100n)
  const signature = await wallet.signTypedData({
    account: buyerSigner!,
    ...buyerTypedData(serializedQuote(value.quote), hardhat.id, vault),
  })
  const submit = (buyerSignature: Hex, quote = value.quote) =>
    write(
      "AgentSpendVault",
      vault,
      "purchase",
      [quote, value.signature, buyerSignature],
      outsider
    )
  await expect(submit(value.signature)).rejects.toThrow()
  const wrongVault = await wallet.signTypedData({
    account: buyerSigner!,
    ...buyerTypedData(serializedQuote(value.quote), hardhat.id, token),
  })
  await expect(submit(wrongVault)).rejects.toThrow()
  await expect(
    submit(signature, { ...value.quote, amount: 101n })
  ).rejects.toThrow()
  await submit(signature)
  await expect(submit(signature)).rejects.toThrow()
  const state = (await read("allowances", [allowanceId])) as bigint[]
  expect(state[4]).toBe(100n)
})

test("seller delegation pays the owner and revocation rejects outstanding quotes", async () => {
  await write(
    "AgentSpendVault",
    vault,
    "setSellerSigner",
    [otherSeller, expiresAt],
    seller
  )
  async function delegatedOffer() {
    const value = await offer(100n)
    const sellerSignature = await wallet.signTypedData({
      account: otherSeller!,
      ...quoteTypedData(serializedQuote(value.quote), hardhat.id, vault),
    })
    const buyerSignature = await wallet.signTypedData({
      account: buyerSigner!,
      ...buyerTypedData(serializedQuote(value.quote), hardhat.id, vault),
    })
    return [value.quote, sellerSignature, buyerSignature]
  }
  await write(
    "AgentSpendVault",
    vault,
    "purchase",
    await delegatedOffer(),
    outsider
  )
  const { abi } = await hre.artifacts.readArtifact("AllowanceTestToken")
  expect(
    await client.readContract({
      address: token,
      abi,
      functionName: "balanceOf",
      args: [seller],
    })
  ).toBe(100n)
  expect(
    await client.readContract({
      address: token,
      abi,
      functionName: "balanceOf",
      args: [otherSeller],
    })
  ).toBe(0n)
  const outstanding = await delegatedOffer()
  await write(
    "AgentSpendVault",
    vault,
    "setSellerSigner",
    [otherSeller, 0n],
    seller
  )
  await expect(
    write("AgentSpendVault", vault, "purchase", outstanding, outsider)
  ).rejects.toThrow()
})

test("shares an inclusive budget across approved sellers and rejects cumulative excess", async () => {
  await buy(await offer())
  await buy(await offer(2_000_000n, otherSeller))
  await expect(buy(await offer(1_000_001n))).rejects.toThrow()
  await buy(await offer(1_000_000n))
  const allowance = (await read("allowances", [allowanceId])) as bigint[]
  expect(allowance[4]).toBe(5_000_000n)
})

test("rejects unapproved sellers, unauthorized buyer signatures, and per-purchase excess without application checks", async () => {
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
        buyerSigner,
        buyerSigner,
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

test("failed token transfers roll back accounting and quote consumption", async () => {
  token = await deploy("RejectingTestToken")
  vault = await deploy("AgentSpendVault", [token])
  await write("RejectingTestToken", token, "approve", [vault, 5_000_000n])
  await write("AgentSpendVault", vault, "createAllowance", [
    buyerSigner,
    buyerSigner,
    [seller],
    5_000_000n,
    2_000_000n,
    expiresAt,
  ])
  const value = await offer()
  await write("RejectingTestToken", token, "setRejectTransfers", [true])
  await expect(buy(value)).rejects.toThrow()
  const digest = await read("quoteDigest", [value.quote])
  expect(await read("purchases", [digest])).toBe(false)
  expect(((await read("allowances", [allowanceId])) as bigint[])[4]).toBe(0n)
  await write("RejectingTestToken", token, "setRejectTransfers", [false])
  await buy(value)
  expect(await read("purchases", [digest])).toBe(true)
})

test("competing purchases cannot spend the same remaining funds", async () => {
  await buy(await offer())
  await buy(await offer())
  const first = await offer(1_000_000n)
  const second = await offer(1_000_000n, otherSeller)
  const { abi } = await hre.artifacts.readArtifact("AgentSpendVault")
  const nonce = await client.getTransactionCount({ address: buyerSigner! })
  await network.provider.request({ method: "evm_setAutomine", params: [false] })
  try {
    const hashes: Hex[] = []
    for (const [index, value] of [first, second].entries()) {
      hashes.push(
        await wallet.writeContract({
          account: buyerSigner!,
          address: vault,
          abi,
          functionName: "purchase",
          args: [
            value.quote,
            value.signature,
            await wallet.signTypedData({
              account: buyerSigner!,
              ...buyerTypedData(
                serializedQuote(value.quote),
                hardhat.id,
                vault
              ),
            }),
          ],
          nonce: nonce + index,
          gas: 300000n,
        })
      )
    }
    await network.provider.request({ method: "evm_mine" })
    const receipts = await Promise.all(
      hashes.map((hash) => client.getTransactionReceipt({ hash }))
    )
    expect(receipts.map((receipt) => receipt.status).sort()).toEqual([
      "reverted",
      "success",
    ])
    expect(((await read("allowances", [allowanceId])) as bigint[])[4]).toBe(
      5_000_000n
    )
  } finally {
    await network.provider.request({
      method: "evm_setAutomine",
      params: [true],
    })
  }
})
