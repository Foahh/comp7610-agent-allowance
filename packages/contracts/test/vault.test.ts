import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import { describe, test } from "vite-plus/test"
import { createWalletClient, http, parseAbi, type Abi, type Hex } from "viem"
import { mnemonicToAccount } from "viem/accounts"
import { hardhat } from "viem/chains"
import {
  publicClient,
  vaultAbi,
  tokenAbi,
  quoteTypedData,
  quoteId,
  serviceHash,
} from "@repo/utils"

const rpc = "http://127.0.0.1:8545"
const client = publicClient(31337, rpc)
const accounts = [0, 1, 2, 3].map((addressIndex) =>
  mnemonicToAccount(
    "test test test test test test test test test test test junk",
    {
      addressIndex,
    }
  )
)
const wallets = accounts.map((account) =>
  createWalletClient({ account, chain: hardhat, transport: http(rpc) })
)
function requiredWallet<T>(wallet: T | undefined, role: string): T {
  if (!wallet) {
    throw new Error("Missing " + role + " test account.")
  }
  return wallet
}

const owner = requiredWallet(wallets[0], "owner")
const agent = requiredWallet(wallets[1], "agent")
const provider = requiredWallet(wallets[2], "provider")
const stranger = requiredWallet(wallets[3], "stranger")

async function mine(hash: Hex) {
  const receipt = await client.waitForTransactionReceipt({ hash })
  assert.equal(receipt.status, "success")
  return receipt
}

async function deploy(name: string, args: readonly unknown[] = []) {
  const artifact = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          "../artifacts/contracts/" + name + ".sol/" + name + ".json",
          import.meta.url
        )
      ),
      "utf8"
    )
  ) as { abi: Abi; bytecode: Hex }
  const receipt = await mine(await owner.deployContract({ ...artifact, args }))
  assert.ok(receipt.contractAddress)
  return receipt.contractAddress
}

async function createFixture(
  budget = 5_000_000n,
  cap = 2_000_000n,
  failing = false
) {
  const token = await deploy(failing ? "FailingToken" : "AllowanceTestToken")
  const vault = await deploy("AgentAllowanceVault", [token])
  if (!failing) {
    await mine(
      await owner.writeContract({
        address: token,
        abi: tokenAbi,
        functionName: "faucet",
      })
    )
  }
  await mine(
    await owner.writeContract({
      address: token,
      abi: tokenAbi,
      functionName: "approve",
      args: [vault, budget],
    })
  )
  const now = (await client.getBlock()).timestamp
  await mine(
    await owner.writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "createAllowance",
      args: [
        agent.account.address,
        provider.account.address,
        budget,
        cap,
        now + 3600n,
      ],
    })
  )

  async function createQuote(
    amount = 1_200_000n,
    overrides: Record<string, string> = {}
  ) {
    const value = {
      allowanceId: "1",
      service: serviceHash("analysis"),
      requestHash: serviceHash("request"),
      recipient: provider.account.address,
      amount: amount.toString(),
      nonce: ("0x" + randomBytes(32).toString("hex")) as Hex,
      expiresAt: (now + 300n).toString(),
      ...overrides,
    }
    const typed = quoteTypedData(value, 31337, vault)
    const signature = await provider.signTypedData(typed)
    return { value, typed, signature, id: quoteId(value, 31337, vault) }
  }

  async function purchase(
    offer: Awaited<ReturnType<typeof createQuote>>,
    wallet = agent
  ) {
    return mine(
      await wallet.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "purchase",
        args: [offer.typed.message, offer.signature],
      })
    )
  }

  async function readAllowance() {
    const allowance = await client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "allowances",
      args: [1n],
    })
    return {
      spent: allowance[5],
      withdrawn: allowance[8],
    }
  }

  return { token, vault, now, createQuote, purchase, readAllowance }
}

describe("vault financial boundaries", () => {
  test("successful purchase, receipt and duplicate rejection", async () => {
    const fixture = await createFixture()
    const quote = await fixture.createQuote()
    await fixture.purchase(quote)
    assert.equal((await fixture.readAllowance()).spent, 1_200_000n)
    assert.equal(
      await client.readContract({
        address: fixture.vault,
        abi: vaultAbi,
        functionName: "purchases",
        args: [quote.id],
      }),
      true
    )
    await assert.rejects(fixture.purchase(quote))
  })

  test("inclusive cap and total; cumulative and per-purchase violations", async () => {
    const fixture = await createFixture(4_000_000n)
    await assert.rejects(
      fixture.purchase(await fixture.createQuote(2_000_001n))
    )
    await fixture.purchase(await fixture.createQuote(2_000_000n))
    await fixture.purchase(await fixture.createQuote(2_000_000n))
    await assert.rejects(fixture.purchase(await fixture.createQuote(1n)))
    assert.equal((await fixture.readAllowance()).spent, 4_000_000n)
  })

  test("unauthorized caller, recipient, tampered signature and domain", async () => {
    const fixture = await createFixture()
    await assert.rejects(
      fixture.purchase(await fixture.createQuote(), stranger)
    )
    await assert.rejects(
      fixture.purchase(
        await fixture.createQuote(1n, {
          recipient: stranger.account.address,
        })
      )
    )
    const quote = await fixture.createQuote()
    await assert.rejects(
      fixture.purchase({
        ...quote,
        typed: {
          ...quote.typed,
          message: { ...quote.typed.message, amount: 1n },
        },
      })
    )
    const wrong = await provider.signTypedData(
      quoteTypedData(quote.value, 11155111, fixture.vault)
    )
    await assert.rejects(fixture.purchase({ ...quote, signature: wrong }))
    assert.equal((await fixture.readAllowance()).spent, 0n)
  })

  test("expired quote and allowance", async () => {
    const fixture = await createFixture()
    await assert.rejects(
      fixture.purchase(
        await fixture.createQuote(1n, {
          expiresAt: fixture.now.toString(),
        })
      )
    )
    await client.request({
      method: "evm_increaseTime" as never,
      params: [3601] as never,
    })
    await client.request({ method: "evm_mine" as never })
    await assert.rejects(fixture.purchase(await fixture.createQuote()))
  })

  test("revocation and owner-only withdrawal", async () => {
    const fixture = await createFixture()
    await fixture.purchase(await fixture.createQuote())
    await assert.rejects(
      stranger.writeContract({
        address: fixture.vault,
        abi: vaultAbi,
        functionName: "revokeAllowance",
        args: [1n],
      })
    )
    await assert.rejects(
      owner.writeContract({
        address: fixture.vault,
        abi: vaultAbi,
        functionName: "withdrawUnused",
        args: [1n],
      })
    )
    await mine(
      await owner.writeContract({
        address: fixture.vault,
        abi: vaultAbi,
        functionName: "revokeAllowance",
        args: [1n],
      })
    )
    await assert.rejects(fixture.purchase(await fixture.createQuote()))
    await assert.rejects(
      agent.writeContract({
        address: fixture.vault,
        abi: vaultAbi,
        functionName: "withdrawUnused",
        args: [1n],
      })
    )
    await mine(
      await owner.writeContract({
        address: fixture.vault,
        abi: vaultAbi,
        functionName: "withdrawUnused",
        args: [1n],
      })
    )
    assert.equal((await fixture.readAllowance()).withdrawn, 3_800_000n)
    await assert.rejects(
      owner.writeContract({
        address: fixture.vault,
        abi: vaultAbi,
        functionName: "withdrawUnused",
        args: [1n],
      })
    )
  })

  test("competing purchases share one budget", async () => {
    const fixture = await createFixture(2_000_000n)
    const firstQuote = await fixture.createQuote(1_200_000n)
    const secondQuote = await fixture.createQuote(1_200_000n)
    // Both preflights observe sufficient funds; execution still serializes state.
    for (const quote of [firstQuote, secondQuote]) {
      await client.simulateContract({
        account: agent.account,
        address: fixture.vault,
        abi: vaultAbi,
        functionName: "purchase",
        args: [quote.typed.message, quote.signature],
      })
    }
    await fixture.purchase(firstQuote)
    await assert.rejects(fixture.purchase(secondQuote))
    assert.equal((await fixture.readAllowance()).spent, 1_200_000n)
  })

  test("failed token transfer rolls back spending and replay state", async () => {
    const fixture = await createFixture(5_000_000n, 2_000_000n, true)
    const abi = parseAbi(["function setFailTransfers(bool value)"])
    await mine(
      await owner.writeContract({
        address: fixture.token,
        abi,
        functionName: "setFailTransfers",
        args: [true],
      })
    )
    const quote = await fixture.createQuote()
    await assert.rejects(fixture.purchase(quote))
    assert.equal((await fixture.readAllowance()).spent, 0n)
    assert.equal(
      await client.readContract({
        address: fixture.vault,
        abi: vaultAbi,
        functionName: "purchases",
        args: [quote.id],
      }),
      false
    )
    await mine(
      await owner.writeContract({
        address: fixture.token,
        abi,
        functionName: "setFailTransfers",
        args: [false],
      })
    )
    await fixture.purchase(quote)
  })
})
