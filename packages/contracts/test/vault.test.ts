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
const [owner, agent, provider, stranger] = wallets
if (!owner || !agent || !provider || !stranger) {
  throw new Error("Missing test accounts.")
}

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
  const receipt = await mine(await owner!.deployContract({ ...artifact, args }))
  assert.ok(receipt.contractAddress)
  return receipt.contractAddress
}

async function setup(budget = 5_000_000n, cap = 2_000_000n, failing = false) {
  const token = await deploy(failing ? "FailingToken" : "AllowanceTestToken")
  const vault = await deploy("AgentAllowanceVault", [token])
  if (!failing) {
    await mine(
      await owner!.writeContract({
        address: token,
        abi: tokenAbi,
        functionName: "faucet",
      })
    )
  }
  await mine(
    await owner!.writeContract({
      address: token,
      abi: tokenAbi,
      functionName: "approve",
      args: [vault, budget],
    })
  )
  const now = (await client.getBlock()).timestamp
  await mine(
    await owner!.writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "createAllowance",
      args: [
        agent!.account.address,
        provider!.account.address,
        budget,
        cap,
        now + 3600n,
      ],
    })
  )

  async function quote(
    amount = 1_200_000n,
    overrides: Record<string, string> = {}
  ) {
    const value = {
      allowanceId: "1",
      service: serviceHash("analysis"),
      requestHash: serviceHash("request"),
      recipient: provider!.account.address,
      amount: amount.toString(),
      nonce: ("0x" + randomBytes(32).toString("hex")) as Hex,
      expiresAt: (now + 300n).toString(),
      ...overrides,
    }
    const typed = quoteTypedData(value, 31337, vault)
    const signature = await provider!.signTypedData(typed)
    return { value, typed, signature, id: quoteId(value, 31337, vault) }
  }

  async function pay(
    offer: Awaited<ReturnType<typeof quote>>,
    wallet = agent!
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

  const allowance = () =>
    client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "allowances",
      args: [1n],
    })
  return { token, vault, now, quote, pay, allowance }
}

describe("vault financial boundaries", () => {
  test("successful purchase, receipt and duplicate rejection", async () => {
    const f = await setup()
    const q = await f.quote()
    await f.pay(q)
    assert.equal((await f.allowance())[5], 1_200_000n)
    assert.equal(
      await client.readContract({
        address: f.vault,
        abi: vaultAbi,
        functionName: "purchases",
        args: [q.id],
      }),
      true
    )
    await assert.rejects(f.pay(q))
  })

  test("inclusive cap and total; cumulative and per-purchase violations", async () => {
    const f = await setup(4_000_000n)
    await assert.rejects(f.pay(await f.quote(2_000_001n)))
    await f.pay(await f.quote(2_000_000n))
    await f.pay(await f.quote(2_000_000n))
    await assert.rejects(f.pay(await f.quote(1n)))
    assert.equal((await f.allowance())[5], 4_000_000n)
  })

  test("unauthorized caller, recipient, tampered signature and domain", async () => {
    const f = await setup()
    await assert.rejects(f.pay(await f.quote(), stranger))
    await assert.rejects(
      f.pay(await f.quote(1n, { recipient: stranger!.account.address }))
    )
    const q = await f.quote()
    await assert.rejects(
      f.pay({
        ...q,
        typed: { ...q.typed, message: { ...q.typed.message, amount: 1n } },
      })
    )
    const wrong = await provider!.signTypedData(
      quoteTypedData(q.value, 11155111, f.vault)
    )
    await assert.rejects(f.pay({ ...q, signature: wrong }))
    assert.equal((await f.allowance())[5], 0n)
  })

  test("expired quote and allowance", async () => {
    const f = await setup()
    await assert.rejects(
      f.pay(await f.quote(1n, { expiresAt: f.now.toString() }))
    )
    await client.request({
      method: "evm_increaseTime" as never,
      params: [3601] as never,
    })
    await client.request({ method: "evm_mine" as never })
    await assert.rejects(f.pay(await f.quote()))
  })

  test("revocation and owner-only withdrawal", async () => {
    const f = await setup()
    await f.pay(await f.quote())
    await assert.rejects(
      stranger!.writeContract({
        address: f.vault,
        abi: vaultAbi,
        functionName: "revokeAllowance",
        args: [1n],
      })
    )
    await assert.rejects(
      owner!.writeContract({
        address: f.vault,
        abi: vaultAbi,
        functionName: "withdrawUnused",
        args: [1n],
      })
    )
    await mine(
      await owner!.writeContract({
        address: f.vault,
        abi: vaultAbi,
        functionName: "revokeAllowance",
        args: [1n],
      })
    )
    await assert.rejects(f.pay(await f.quote()))
    await assert.rejects(
      agent!.writeContract({
        address: f.vault,
        abi: vaultAbi,
        functionName: "withdrawUnused",
        args: [1n],
      })
    )
    await mine(
      await owner!.writeContract({
        address: f.vault,
        abi: vaultAbi,
        functionName: "withdrawUnused",
        args: [1n],
      })
    )
    assert.equal((await f.allowance())[8], 3_800_000n)
    await assert.rejects(
      owner!.writeContract({
        address: f.vault,
        abi: vaultAbi,
        functionName: "withdrawUnused",
        args: [1n],
      })
    )
  })

  test("competing purchases share one budget", async () => {
    const f = await setup(2_000_000n)
    const first = await f.quote(1_200_000n)
    const second = await f.quote(1_200_000n)
    // Both preflights observe sufficient funds; execution still serializes state.
    for (const q of [first, second]) {
      await client.simulateContract({
        account: agent!.account,
        address: f.vault,
        abi: vaultAbi,
        functionName: "purchase",
        args: [q.typed.message, q.signature],
      })
    }
    await f.pay(first)
    await assert.rejects(f.pay(second))
    assert.equal((await f.allowance())[5], 1_200_000n)
  })

  test("failed token transfer rolls back spending and replay state", async () => {
    const f = await setup(5_000_000n, 2_000_000n, true)
    const abi = parseAbi(["function setFailTransfers(bool value)"])
    await mine(
      await owner!.writeContract({
        address: f.token,
        abi,
        functionName: "setFailTransfers",
        args: [true],
      })
    )
    const q = await f.quote()
    await assert.rejects(f.pay(q))
    assert.equal((await f.allowance())[5], 0n)
    assert.equal(
      await client.readContract({
        address: f.vault,
        abi: vaultAbi,
        functionName: "purchases",
        args: [q.id],
      }),
      false
    )
    await mine(
      await owner!.writeContract({
        address: f.token,
        abi,
        functionName: "setFailTransfers",
        args: [false],
      })
    )
    await f.pay(q)
  })
})
