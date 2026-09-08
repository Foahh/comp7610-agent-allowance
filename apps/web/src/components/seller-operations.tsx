import { publicClient, vaultAbi } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { formatEther, parseEther, type Address } from "viem"

import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"
import { assertWallet } from "#/lib/wallet"

import { useWorkspaceAssistant } from "./assistant-context"
import { Button } from "./ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"

type Submission = { address: Address; enabled: boolean; balance: string }
type SellerAction = "register" | "revoke" | "fund" | "toggle"

export function SellerOperations() {
  const { wallet, config } = useWorkspaceAssistant()
  const status = useQuery({
    queryKey: [
      "marketplace",
      "submission",
      wallet.account.address,
      config?.vault,
    ],
    queryFn: () => marketplaceRequest<Submission>("seller/submission"),
    enabled: !!config?.configured,
  })
  const action = useMarketplaceAction(async (kind: SellerAction) => {
    if (!config || !status.data) {
      throw new Error("Load the seller settings first.")
    }

    if (kind === "toggle") {
      return marketplaceRequest(
        "seller/submission",
        { enabled: !status.data.enabled },
        "PUT"
      )
    }

    await assertWallet(wallet, config)

    let hash: `0x${string}`

    if (kind === "fund") {
      hash = await wallet.sendTransaction({
        to: status.data.address,
        value: parseEther("0.002"),
      })
    } else {
      const authorizationExpiry =
        kind === "revoke"
          ? 0n
          : BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60)

      hash = await wallet.writeContract({
        address: config.vault,
        abi: vaultAbi,
        functionName: "setSellerSigner",
        args: [status.data.address, authorizationExpiry],
      })
    }

    const receipt = await publicClient(
      config.chainId,
      config.rpcUrl
    ).waitForTransactionReceipt({ hash, confirmations: 2 })

    if (receipt.status !== "success") {
      throw new Error("Wallet transaction reverted.")
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seller signing and gas</CardTitle>
        <CardDescription>
          Authorize your generated seller signer for 30 days. Token revenue is
          paid directly to your account wallet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="break-all">Revenue account: {wallet.account.address}</p>
        <p className="break-all">
          Seller signer: {status.data?.address || "Loading…"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={action.isPending || !status.data}
            onClick={() => action.mutate("register")}
          >
            Authorize seller signer
          </Button>
          <Button
            variant="outline"
            disabled={action.isPending || !status.data}
            onClick={() => action.mutate("revoke")}
          >
            Revoke seller signer
          </Button>
        </div>
        <p>
          Automatic submission is{" "}
          {status.data?.enabled ? "enabled" : "disabled"}. When enabled, this
          service submits valid buyer authorizations and pays ETH from the
          seller signer. Include gas in your listing price.
        </p>
        <p>
          Gas limits: 20 gwei maximum fee, 0.002 ETH maximum per transaction,
          and 0.01 ETH of reserved costs per UTC day. Reverted attempts still
          cost gas. These software limits cannot protect a stolen funded key.
        </p>
        <p>
          Operating balance:{" "}
          {status.data ? formatEther(BigInt(status.data.balance)) : "…"} Sepolia
          ETH
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={action.isPending || !status.data}
            onClick={() => action.mutate("toggle")}
          >
            {status.data?.enabled
              ? "Pause automatic submission"
              : "Enable seller-paid submission"}
          </Button>
          <Button
            variant="outline"
            disabled={action.isPending || !status.data}
            onClick={() => action.mutate("fund")}
          >
            Add 0.002 Sepolia ETH
          </Button>
        </div>
        {(status.error || action.error) && (
          <p role="alert" className="text-destructive">
            {status.error?.message || action.error?.message}
          </p>
        )}
        {action.isSuccess && <p role="status">Seller settings updated.</p>}
      </CardContent>
    </Card>
  )
}
