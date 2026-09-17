import { tokenAbi, vaultAbi } from "@repo/utils"
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiParameters,
} from "viem"
import { beforeEach, expect, test, vi } from "vite-plus/test"

import type { AppConfig } from "./client.ts"
import type { ConnectedWallet } from "./wallet.ts"

import {
  authorizeAndFundSeller,
  executeWalletCalls,
  fundAllowance,
  updateAllowance,
} from "./wallet.ts"

const rpc = vi.hoisted(() => ({
  getBalance: vi.fn(),
  readContract: vi.fn(),
  getBlock: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}))
vi.mock("@repo/utils", async (original) => ({
  ...(await original<typeof import("@repo/utils")>()),
  publicClient: () => rpc,
}))

const owner = "0x0000000000000000000000000000000000000001"
const agent = "0x0000000000000000000000000000000000000002"
const seller = "0x0000000000000000000000000000000000000003"
const vault = "0x0000000000000000000000000000000000000004"
const token = "0x0000000000000000000000000000000000000005"
const hash = `0x${"a".repeat(64)}` as const
const config: AppConfig = {
  configured: true,
  restartRequired: false,
  vaultVersion: "2",
  instance: "test",
  activeDeployment: "test",
  deployments: [],
  sellerEndpoint: "https://seller.example",
  sellerPublic: false,
  owner,
  buyerSigner: agent,
  vault,
  token,
  chainId: 11155111,
  rpcUrl: "https://example.invalid",
}
const walletMock = {
  account: { address: owner },
  getAddresses: vi.fn(),
  getChainId: vi.fn(),
  getCapabilities: vi.fn(),
  sendCalls: vi.fn(),
  waitForCallsStatus: vi.fn(),
  writeContract: vi.fn(),
  sendTransaction: vi.fn(),
}
const wallet = walletMock as unknown as ConnectedWallet

function receipt(
  buyer: `0x${string}` = owner,
  eventOwner: `0x${string}` = owner
) {
  return {
    status: "success",
    logs: [
      {
        address: vault,
        topics: encodeEventTopics({
          abi: vaultAbi,
          eventName: "AllowanceCreated",
          args: { allowanceId: 42n, owner: eventOwner },
        }),
        data: encodeAbiParameters(
          parseAbiParameters("address,address[],uint256,uint256,uint256"),
          [buyer, [seller], 10_000_000n, 3_000_000n, 87400n]
        ),
      },
    ],
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  walletMock.getAddresses.mockResolvedValue([owner])
  walletMock.getChainId.mockResolvedValue(config.chainId)
  walletMock.getCapabilities.mockResolvedValue({
    atomic: { status: "supported" },
  })
  walletMock.sendCalls.mockResolvedValue({ id: "batch-1" })
  walletMock.waitForCallsStatus.mockResolvedValue({
    status: "success",
    atomic: true,
    chainId: config.chainId,
    receipts: [{ transactionHash: hash }],
  })
  walletMock.writeContract.mockResolvedValue(hash)
  walletMock.sendTransaction.mockResolvedValue(hash)
  rpc.getBalance.mockResolvedValue(10n ** 18n)
  rpc.readContract.mockResolvedValue(100_000_000n)
  rpc.getBlock.mockResolvedValue({ timestamp: 1000n })
  rpc.waitForTransactionReceipt.mockResolvedValue(receipt())
})

const fund = (automatic = false) =>
  fundAllowance(wallet, config, "10", "3", [seller], () => {}, automatic)

test.each(["supported", "ready"])(
  "%s wallets batch exact approval and allowance creation",
  async (status) => {
    walletMock.getCapabilities.mockResolvedValue({ atomic: { status } })
    expect(await fund()).toBe("42")
    expect(walletMock.getCapabilities).toHaveBeenCalledWith({
      chainId: config.chainId,
    })
    expect(walletMock.sendCalls).toHaveBeenCalledOnce()
    const request = walletMock.sendCalls.mock.calls[0]![0]
    expect(request.forceAtomic).toBe(true)
    expect(request.calls).toHaveLength(2)
    expect(request.calls.map((call: { to: string }) => call.to)).toEqual([
      token,
      vault,
    ])
    expect(
      decodeFunctionData({ abi: tokenAbi, data: request.calls[0].data })
    ).toEqual({ functionName: "approve", args: [vault, 10_000_000n] })
    expect(
      decodeFunctionData({ abi: vaultAbi, data: request.calls[1].data })
    ).toEqual({
      functionName: "createAllowance",
      args: [owner, agent, [seller], 10_000_000n, 3_000_000n, 87400n],
    })
    expect(rpc.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash,
      confirmations: 1,
      pollingInterval: 1000,
      timeout: 60_000,
    })
    expect(walletMock.writeContract).not.toHaveBeenCalled()
  }
)

test("automatic mode keeps the agent signer in the batch", async () => {
  rpc.waitForTransactionReceipt.mockResolvedValue(receipt(agent))
  expect(await fund(true)).toBe("42")
  const calls = walletMock.sendCalls.mock.calls[0]![0].calls
  expect(
    decodeFunctionData({ abi: vaultAbi, data: calls[1].data }).args?.[0]
  ).toBe(agent)
})

test("a needed faucet claim is included before approval in the same batch", async () => {
  rpc.readContract.mockResolvedValue(0n)
  expect(await fund()).toBe("42")
  const calls = walletMock.sendCalls.mock.calls[0]![0].calls
  expect(calls).toHaveLength(3)
  expect(
    decodeFunctionData({ abi: tokenAbi, data: calls[0].data }).functionName
  ).toBe("faucet")
  expect(walletMock.writeContract).not.toHaveBeenCalled()
})

test.each([undefined, {}, { atomic: { status: "unsupported" } }])(
  "unsupported capabilities retain ordered approval and creation",
  async (capabilities) => {
    walletMock.getCapabilities.mockResolvedValue(capabilities)
    expect(await fund()).toBe("42")
    expect(walletMock.sendCalls).not.toHaveBeenCalled()
    expect(
      walletMock.writeContract.mock.calls.map(([call]) => call.functionName)
    ).toEqual(["approve", "createAllowance"])
  }
)

test.each([-32601, -32004, 4200])(
  "missing capability RPC (%s) uses the legacy flow",
  async (code) => {
    walletMock.getCapabilities.mockRejectedValue({ cause: { code } })
    expect(await fund()).toBe("42")
    expect(walletMock.sendCalls).not.toHaveBeenCalled()
  }
)

test("legacy faucet, approval and creation stay sequential", async () => {
  walletMock.getCapabilities.mockResolvedValue({})
  rpc.readContract.mockResolvedValueOnce(0n).mockResolvedValueOnce(100_000_000n)
  expect(await fund()).toBe("42")
  expect(
    walletMock.writeContract.mock.calls.map(([call]) => call.functionName)
  ).toEqual(["faucet", "approve", "createAllowance"])
})

test("a reverted legacy approval prevents allowance creation", async () => {
  walletMock.getCapabilities.mockResolvedValue({})
  rpc.waitForTransactionReceipt.mockResolvedValue({ status: "reverted" })
  await expect(fund()).rejects.toThrow("Token approval failed")
  expect(walletMock.writeContract).toHaveBeenCalledOnce()
})

test.each([4001, 4900])(
  "capability rejection or disconnection (%s) stops without prompting",
  async (code) => {
    walletMock.getCapabilities.mockRejectedValue({ code })
    await expect(fund()).rejects.toEqual({ code })
    expect(walletMock.sendCalls).not.toHaveBeenCalled()
    expect(walletMock.writeContract).not.toHaveBeenCalled()
  }
)

test.each(["sendCalls", "waitForCallsStatus"] as const)(
  "%s errors never resubmit as separate transactions",
  async (method) => {
    walletMock[method].mockRejectedValue(new Error("Rejected or uncertain"))
    await expect(fund()).rejects.toThrow("Rejected or uncertain")
    expect(walletMock.sendCalls).toHaveBeenCalledOnce()
    expect(walletMock.writeContract).not.toHaveBeenCalled()
    expect(walletMock.sendTransaction).not.toHaveBeenCalled()
  }
)

test.each([
  { status: "failure" },
  { atomic: false },
  { chainId: 1 },
  { receipts: [] },
])(
  "invalid batch status cannot be treated as a funded allowance: %j",
  async (override) => {
    walletMock.waitForCallsStatus.mockResolvedValue({
      status: "success",
      atomic: true,
      chainId: config.chainId,
      receipts: [{ transactionHash: hash }],
      ...override,
    })
    await expect(fund()).rejects.toThrow("did not complete successfully")
    expect(walletMock.writeContract).not.toHaveBeenCalled()
  }
)

test("a successful wallet report still requires an on-chain event for this owner", async () => {
  rpc.waitForTransactionReceipt.mockResolvedValue(receipt(owner, seller))
  await expect(fund()).rejects.toThrow("identifier could not be read")
})

test("closing an allowance batches revocation and withdrawal in order", async () => {
  rpc.readContract.mockResolvedValue([
    owner,
    agent,
    10n,
    3n,
    2n,
    1000n,
    false,
    0n,
  ])
  await updateAllowance(wallet, config, "42", "closeAllowance")
  const calls = walletMock.sendCalls.mock.calls[0]![0].calls
  expect(
    calls.map(
      (call: { data: `0x${string}` }) =>
        decodeFunctionData({ abi: vaultAbi, data: call.data }).functionName
    )
  ).toEqual(["revokeAllowance", "withdrawUnused"])
})

test("closing an already revoked allowance only withdraws", async () => {
  rpc.readContract.mockResolvedValue([
    owner,
    agent,
    10n,
    3n,
    2n,
    1000n,
    true,
    0n,
  ])
  await updateAllowance(wallet, config, "42", "closeAllowance")
  expect(walletMock.sendCalls).not.toHaveBeenCalled()
  expect(
    decodeFunctionData({
      abi: vaultAbi,
      data: walletMock.sendTransaction.mock.calls[0]![0].data,
    }).functionName
  ).toBe("withdrawUnused")
})

test("closing an exhausted allowance revokes without a reverting withdrawal", async () => {
  rpc.readContract.mockResolvedValue([
    owner,
    agent,
    10n,
    3n,
    10n,
    1000n,
    false,
    0n,
  ])
  await updateAllowance(wallet, config, "42", "closeAllowance")
  expect(walletMock.sendTransaction).toHaveBeenCalledOnce()
  expect(
    decodeFunctionData({
      abi: vaultAbi,
      data: walletMock.sendTransaction.mock.calls[0]![0].data,
    }).functionName
  ).toBe("revokeAllowance")
})

test("seller setup combines scoped signer authorization and the displayed gas amount", async () => {
  await authorizeAndFundSeller(wallet, config, seller)
  const calls = walletMock.sendCalls.mock.calls[0]![0].calls
  expect(calls).toHaveLength(2)
  expect(decodeFunctionData({ abi: vaultAbi, data: calls[0].data })).toEqual({
    functionName: "setSellerSigner",
    args: [seller, 2593000n],
  })
  expect(calls[1]).toEqual({ to: seller, value: 2_000_000_000_000_000n })
})

test("legacy combined actions stop when the first transaction reverts", async () => {
  walletMock.getCapabilities.mockResolvedValue({})
  rpc.waitForTransactionReceipt.mockResolvedValue({ status: "reverted" })
  await expect(authorizeAndFundSeller(wallet, config, seller)).rejects.toThrow(
    "Remaining steps were not sent"
  )
  expect(walletMock.sendTransaction).toHaveBeenCalledOnce()
})

test("account changes before batch submission prevent sending", async () => {
  walletMock.getAddresses
    .mockResolvedValueOnce([owner])
    .mockResolvedValue([seller])
  await expect(
    executeWalletCalls(wallet, config, [{ to: vault }, { to: token }])
  ).rejects.toThrow("account or network changed")
  expect(walletMock.sendCalls).not.toHaveBeenCalled()
})
