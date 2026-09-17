import { publicClient, vaultAbi } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { formatEther, parseEther, type Address } from "viem"

import { useMarketplaceAction } from "#/hooks/use-marketplace"
import { marketplaceRequest } from "#/lib/marketplace"
import { assertWallet, authorizeAndFundSeller } from "#/lib/wallet"

import { useWorkspaceAssistant } from "./assistant-context"
import { RequestState } from "./marketplace-page"
import { Button } from "./ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card"

type Submission = { address: Address; enabled: boolean; balance: string }
type SellerAction = "setup" | "register" | "revoke" | "fund" | "toggle"

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
    if (kind === "setup") {
      return authorizeAndFundSeller(wallet, config, status.data.address)
    }

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
        <CardTitle>Seller signing & gas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <details className="detail-disclosure">
          <summary>Signing accounts</summary>
          <p className="break-all">Revenue account: {wallet.account.address}</p>
          <p className="break-all">
            Seller signer: {status.data?.address || "Loading…"}
          </p>
        </details>
        <p className="text-xs text-muted-foreground">
          Signing authorization lasts 30 days. Revenue goes to your wallet.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={action.isPending || !status.data}
            onClick={() => action.mutate("setup")}
          >
            Authorize & add 0.002 Sepolia ETH
          </Button>
          <Button
            variant="outline"
            disabled={action.isPending || !status.data}
            onClick={() => action.mutate("register")}
          >
            {action.isPending ? "Updating…" : "Authorize signer"}
          </Button>
          <Button
            variant="outline"
            disabled={action.isPending || !status.data}
            onClick={() => action.mutate("revoke")}
          >
            Revoke signer
          </Button>
        </div>
        <div className="section-heading">
          <h3>Automatic order submission</h3>
          <span className="text-xs text-muted-foreground">
            {status.data?.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Uses the seller gas balance.
        </p>
        <details className="detail-disclosure">
          <summary>Gas limits and responsibilities</summary>
          <p>
            Include gas in listing prices. Limits: 20 gwei maximum fee, 0.002
            ETH per transaction, and 0.01 ETH per UTC day. Failed transactions
            still use gas. Keep only the required test ETH in this account.
          </p>
        </details>
        <p>
          Gas balance:{" "}
          {status.data ? formatEther(BigInt(status.data.balance)) : "…"} Sepolia
          ETH
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={action.isPending || !status.data}
            onClick={() => action.mutate("toggle")}
          >
            {status.data?.enabled ? "Pause submission" : "Enable submission"}
          </Button>
          <Button
            variant="outline"
            disabled={action.isPending || !status.data}
            onClick={() => action.mutate("fund")}
          >
            Add 0.002 Sepolia ETH
          </Button>
        </div>
        <RequestState
          error={status.error || action.error}
          success={action.isSuccess ? "Seller settings updated." : undefined}
        />
      </CardContent>
    </Card>
  )
}
