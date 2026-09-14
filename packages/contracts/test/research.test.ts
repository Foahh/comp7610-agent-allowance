import type { Address, Hex } from "viem"

import { buyerTypedData, quoteTypedData } from "@repo/utils"
import { createHardhatRuntimeEnvironment } from "hardhat/hre"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  keccak256,
  stringToHex,
} from "viem"
import { hardhat } from "viem/chains"
import { afterAll, beforeAll, beforeEach, expect, test } from "vite-plus/test"

// A controlled delegated-key compromise experiment. No live wallets or LLMs.
const root = fileURLToPath(new URL("../", import.meta.url))
const repo = resolve(root, "../..")
const temporary = mkdtempSync(join(tmpdir(), "mandate-research-"))
const hre = await createHardhatRuntimeEnvironment(
  {
    solidity: {
      version: "0.8.30",
      settings: { optimizer: { enabled: true, runs: 200 } },
    },
    paths: {
      artifacts: join(temporary, "artifacts"),
      cache: join(temporary, "cache"),
    },
  },
  {},
  root
)
const network = await hre.network.create()
const transport = custom(network.provider)
const client = createPublicClient({ chain: hardhat, transport, cacheTime: 0 })
const wallet = createWalletClient({ chain: hardhat, transport })
const accounts = await wallet.getAddresses()
const owner = accounts[0]!
const buyer = accounts[1]!
const seller = accounts[2]!
const outsider = accounts[3]!
const isolatedBuyer = accounts[4]!
const unit = 1_000_000n
const budget = 5n * unit
const cap = 2n * unit
let token: Address
let vault: Address
let expiry: bigint
let counter = 0
let setupGas: string

type Outcome = {
  status: "success" | "blocked"
  gasUsed?: string
  error?: string
}
type Observation = {
  scenario: string
  system: "prefunded-eoa" | "mandate"
  outcomes: Outcome[]
  tokensSpent: string
}
const observations: Observation[] = []

async function deploy(name: string, args: readonly unknown[] = []) {
  const artifact = await hre.artifacts.readArtifact(name)
  const hash = await wallet.deployContract({
    account: owner,
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
  account = owner
) {
  const { abi } = await hre.artifacts.readArtifact(name)
  const { request } = await client.simulateContract({
    address,
    abi,
    functionName,
    args,
    account,
  })
  const hash = await wallet.writeContract(request)
  const receipt = await client.waitForTransactionReceipt({ hash })
  expect(receipt.status).toBe("success")
  return receipt
}

async function attempt(
  operation: () => ReturnType<typeof write>
): Promise<Outcome> {
  try {
    const receipt = await operation()
    return { status: "success", gasUsed: receipt.gasUsed.toString() }
  } catch (error) {
    const cause =
      error instanceof BaseError
        ? error.walk(
            (nested) => nested instanceof ContractFunctionRevertedError
          )
        : undefined
    if (
      !(cause instanceof ContractFunctionRevertedError) ||
      !cause.data?.errorName
    ) {
      throw error
    }
    return { status: "blocked", error: cause.data.errorName }
  }
}

async function allowance(id = 1n) {
  const { abi } = await hre.artifacts.readArtifact("AgentSpendVault")
  return (await client.readContract({
    address: vault,
    abi,
    functionName: "allowances",
    args: [id],
  })) as readonly [
    Address,
    Address,
    bigint,
    bigint,
    bigint,
    bigint,
    boolean,
    bigint,
  ]
}

async function baselineSpent() {
  const { abi } = await hre.artifacts.readArtifact("AllowanceTestToken")
  const balance = (await client.readContract({
    address: token,
    abi,
    functionName: "balanceOf",
    args: [buyer],
  })) as bigint
  return budget - balance
}

async function offer(amount: bigint, recipient = seller, id = 1n) {
  const quote = {
    allowanceId: id.toString(),
    service: keccak256(stringToHex("research-listing-v1")),
    requestHash: keccak256(stringToHex("same-request-and-deliverable")),
    recipient,
    amount: amount.toString(),
    nonce: keccak256(stringToHex(`research-${counter++}`)),
    expiresAt: ((await client.getBlock()).timestamp + 600n).toString(),
  }
  const sellerSignature = await wallet.signTypedData({
    account: recipient,
    ...quoteTypedData(quote, hardhat.id, vault),
  })
  const buyerSignature = await wallet.signTypedData({
    account: buyer,
    ...buyerTypedData(quote, hardhat.id, vault),
  })
  return [
    quoteTypedData(quote, hardhat.id, vault).message,
    sellerSignature,
    buyerSignature,
  ]
}

async function purchase(args: readonly unknown[]) {
  return attempt(() =>
    write("AgentSpendVault", vault, "purchase", args, outsider)
  )
}

beforeAll(async () => {
  await hre.solidity.build(await hre.solidity.getRootFilePaths())
})

beforeEach(async () => {
  token = await deploy("AllowanceTestToken")
  vault = await deploy("AgentSpendVault", [token])
  await write("AllowanceTestToken", token, "faucet")
  await write("AllowanceTestToken", token, "transfer", [buyer, budget])
  await write("AllowanceTestToken", token, "approve", [vault, 2n * budget])
  expiry = (await client.getBlock()).timestamp + 3600n
  const created = await write("AgentSpendVault", vault, "createAllowance", [
    buyer,
    buyer,
    [seller],
    budget,
    cap,
    expiry,
  ])
  setupGas = created.gasUsed.toString()
})

const scenarios = [
  {
    name: "legitimate",
    amounts: [unit],
    recipient: seller,
    expected: ["success"],
  },
  {
    name: "per-purchase-cap",
    amounts: [3n * unit],
    recipient: seller,
    expected: ["LimitExceeded"],
  },
  {
    name: "unapproved-recipient",
    amounts: [unit],
    recipient: outsider,
    expected: ["InvalidQuote"],
  },
  {
    name: "total-budget",
    amounts: [2n * unit, 2n * unit, unit, unit],
    recipient: seller,
    expected: ["success", "success", "success", "LimitExceeded"],
  },
  {
    name: "confirmed-revocation",
    amounts: [unit],
    recipient: seller,
    expected: ["InactiveAllowance"],
  },
  {
    name: "expired-allowance",
    amounts: [unit],
    recipient: seller,
    expected: ["InactiveAllowance"],
  },
  {
    name: "unwanted-approved-purchases",
    amounts: [2n * unit, 2n * unit, unit],
    recipient: seller,
    expected: ["success", "success", "success"],
  },
] as const

for (const scenario of scenarios) {
  test(`research: ${scenario.name}`, async () => {
    if (scenario.name === "confirmed-revocation") {
      await write("AgentSpendVault", vault, "revokeAllowance", [1n])
      // An EOA has no equivalent owner-controlled on-chain revocation.
      // A revoked application permission is bypassed by this key holder.
    }
    if (scenario.name === "expired-allowance") {
      await network.provider.request({
        method: "evm_setNextBlockTimestamp",
        params: [Number(expiry)],
      })
      await network.provider.request({ method: "evm_mine" })
    }
    const direct: Outcome[] = []
    const guarded: Outcome[] = []
    // Restore the same recipient balances before evaluating Mandate.
    const snapshot = await network.provider.request({ method: "evm_snapshot" })
    for (const amount of scenario.amounts) {
      direct.push(
        await attempt(() =>
          write(
            "AllowanceTestToken",
            token,
            "transfer",
            [scenario.recipient, amount],
            buyer
          )
        )
      )
    }
    const observedDirectSpend = await baselineSpent()
    await network.provider.request({ method: "evm_revert", params: [snapshot] })
    for (const amount of scenario.amounts) {
      guarded.push(await purchase(await offer(amount, scenario.recipient)))
    }
    expect(guarded.map((item) => item.error || item.status)).toEqual(
      scenario.expected
    )
    const directExpected =
      scenario.name === "total-budget"
        ? ["success", "success", "success", "ERC20InsufficientBalance"]
        : scenario.amounts.map(() => "success")
    expect(direct.map((item) => item.error || item.status)).toEqual(
      directExpected
    )
    const intendedGuardedSpend =
      scenario.name === "legitimate"
        ? unit
        : scenario.name === "total-budget" ||
            scenario.name === "unwanted-approved-purchases"
          ? budget
          : 0n
    const directSpend =
      scenario.name === "total-budget"
        ? budget
        : scenario.amounts.reduce((sum, amount) => sum + amount, 0n)
    expect((await allowance())[4]).toBe(intendedGuardedSpend)
    expect(observedDirectSpend).toBe(directSpend)
    observations.push(
      {
        scenario: scenario.name,
        system: "prefunded-eoa",
        outcomes: direct,
        tokensSpent: directSpend.toString(),
      },
      {
        scenario: scenario.name,
        system: "mandate",
        outcomes: guarded,
        tokensSpent: intendedGuardedSpend.toString(),
      }
    )
  })
}

test("research: exact signed quote replay versus fresh quote for identical work", async () => {
  const first = await offer(unit)
  const results = [
    await purchase(first),
    await purchase(first),
    await purchase(await offer(unit)),
  ]
  expect(results.map((item) => item.error || item.status)).toEqual([
    "success",
    "DuplicatePurchase",
    "success",
  ])
  expect((await allowance())[4]).toBe(2n * unit)
  observations.push({
    scenario: "exact-replay-then-fresh-nonce",
    system: "mandate",
    outcomes: results,
    tokensSpent: (2n * unit).toString(),
  })
})

for (const shared of [true, false]) {
  test(`research: ${shared ? "shared" : "isolated"} signer across allowances`, async () => {
    const delegate = shared ? buyer : isolatedBuyer
    await write("AgentSpendVault", vault, "createAllowance", [
      delegate,
      delegate,
      [seller],
      budget,
      cap,
      expiry,
    ])
    const results: Outcome[] = []
    for (const id of [1n, 2n]) {
      for (const amount of [2n * unit, 2n * unit, unit]) {
        results.push(await purchase(await offer(amount, seller, id)))
      }
    }
    expect(results.slice(0, 3).map((item) => item.status)).toEqual([
      "success",
      "success",
      "success",
    ])
    expect(results.slice(3).map((item) => item.error || item.status)).toEqual(
      shared
        ? ["success", "success", "success"]
        : ["Unauthorized", "Unauthorized", "Unauthorized"]
    )
    const spent = (await allowance(1n))[4] + (await allowance(2n))[4]
    expect(spent).toBe(shared ? 2n * budget : budget)
    observations.push({
      scenario: `${shared ? "shared" : "isolated"}-signer-two-allowances`,
      system: "mandate",
      outcomes: results,
      tokensSpent: spent.toString(),
    })
  })
}

afterAll(async () => {
  try {
    const output = process.env.MANDATE_RESEARCH_OUTPUT
    if (output) {
      const report = {
        complete: observations.length === 17,
        recordedAt: new Date().toISOString(),
        implementationCommit: execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: repo,
          encoding: "utf8",
        }).trim(),
        harnessSha256: createHash("sha256")
          .update(readFileSync(fileURLToPath(import.meta.url)))
          .digest("hex"),
        contractSha256: createHash("sha256")
          .update(readFileSync(join(root, "contracts/AgentSpendVault.sol")))
          .digest("hex"),
        node: process.version,
        solc: "0.8.30",
        optimizer: { enabled: true, runs: 200 },
        chain: "Hardhat local EVM (31337)",
        tokenDecimals: 6,
        budgetPerWalletOrAllowance: budget.toString(),
        perPurchaseCap: cap.toString(),
        sampleCountPerScenario: 1,
        allowanceCreationGasSample: setupGas,
        limitations: [
          "Deterministic direct contract calls; no LLM prompt-injection success rate measured.",
          "Local gas samples only; not Sepolia latency, fiat costs, or a statistical benchmark.",
          "Seller signatures supplied for attempted quotes, including an approved colluding seller.",
          "Blocked outcomes are EVM simulation reverts, so no failed-transaction gas is measured.",
          "EOA baseline has the same token funding; no additional funding during each scenario.",
          "Separate signer experiment assumes only one signing key is compromised, not the whole host.",
        ],
        observations,
      }
      mkdirSync(dirname(resolve(output)), { recursive: true })
      writeFileSync(output, JSON.stringify(report, null, 2) + "\n")
    }
  } finally {
    await network.close()
    rmSync(temporary, { recursive: true, force: true })
  }
})
