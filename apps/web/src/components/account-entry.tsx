import { getChain } from "@repo/utils"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createWalletClient, custom } from "viem"

import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card"
import {
  getConfig,
  requestJson,
  createAuthChallenge,
  verifyAuthChallenge,
  type AppConfig,
} from "#/lib/client"
import { connectWallet, type ConnectedWallet } from "#/lib/wallet"

type Session = { owner: string | null }

export function AccountEntry({
  children,
}: {
  children: (wallet: ConnectedWallet, logout: () => void) => ReactNode
}) {
  const cache = useQueryClient()
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null)
  const [config, setConfig] = useState<AppConfig>()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const generation = useRef(0)
  const channel = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([
      getConfig(),
      requestJson("/auth/session") as Promise<Session>,
    ])
      .then(async ([settings, session]) => {
        if (!active) {
          return
        }

        setConfig(settings)

        if (session.owner && window.ethereum) {
          const connector = createWalletClient({
            chain: getChain(settings.chainId),
            transport: custom(window.ethereum),
          })
          const addresses = await connector.getAddresses()

          if (
            active &&
            addresses[0]?.toLowerCase() === session.owner &&
            (await connector.getChainId()) === settings.chainId
          ) {
            setWallet(
              createWalletClient({
                account: addresses[0],
                chain: getChain(settings.chainId),
                transport: custom(window.ethereum),
              })
            )
          } else if (active) {
            await requestJson("/auth/logout", {})
          }
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "Unable to connect to this installation. Check that the application is running."
          )
        }
      })
      .finally(() => {
        if (active) {
          setBusy(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!config) {
      return
    }

    const messages = new BroadcastChannel(`account-${config.instance}`)

    messages.onmessage = () => location.reload()
    channel.current = messages

    return () => {
      messages.close()
      channel.current = null
    }
  }, [config])

  const logout = useCallback(async () => {
    generation.current += 1
    setWallet(null)
    cache.clear()
    setBusy(true)

    try {
      await requestJson("/auth/logout", {})
      channel.current?.postMessage("logout")
    } catch {
      setError(
        "Server logout could not be confirmed. Reconnect and try again; existing allowances require on-chain revocation."
      )
    } finally {
      setBusy(false)
    }
  }, [cache])

  useEffect(() => {
    const provider = window.ethereum as typeof window.ethereum & {
      on?: (event: string, fn: () => void) => void
      removeListener?: (event: string, fn: () => void) => void
    }

    const changed = () => {
      if (wallet) {
        void logout()
      }
    }

    if (!provider?.on || !provider.removeListener) {
      return
    }

    provider.on("accountsChanged", changed)
    provider.on("chainChanged", changed)
    provider.on("disconnect", changed)

    return () => {
      provider.removeListener!("accountsChanged", changed)
      provider.removeListener!("chainChanged", changed)
      provider.removeListener!("disconnect", changed)
    }
  }, [wallet, logout])

  useEffect(() => {
    if (!wallet) {
      return
    }

    const timer = setInterval(() => {
      void (requestJson("/auth/session") as Promise<Session>)
        .then((session) => {
          if (session.owner !== wallet.account.address.toLowerCase()) {
            void logout()
          }
        })
        .catch(() => {
          /* Mutations still require a valid server session. */
        })
    }, 60000)

    return () => clearInterval(timer)
  }, [wallet, logout])

  async function login() {
    if (!config) {
      return
    }

    const current = ++generation.current

    setBusy(true)
    setError("")

    try {
      const connected = await connectWallet(config)
      const challenge = await createAuthChallenge(connected.account.address)
      const signature = await connected.signMessage({
        message: challenge.message,
      })
      const accounts = await connected.getAddresses()

      if (
        accounts[0]?.toLowerCase() !==
          connected.account.address.toLowerCase() ||
        (await connected.getChainId()) !== config.chainId
      ) {
        throw new Error(
          "Wallet changed during login. Try again with the selected account."
        )
      }

      await verifyAuthChallenge(challenge.id, signature)

      if (current !== generation.current) {
        return
      }

      cache.clear()
      setWallet(connected)
      channel.current?.postMessage("login")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sign-in failed.")
    } finally {
      setBusy(false)
    }
  }

  if (wallet) {
    return children(wallet, () => {
      void logout()
    })
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-lg items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in to Agent Spend Guard</CardTitle>
          <CardDescription>
            Use your browser wallet on Sepolia. Signing in does not authorize
            spending.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your conversations, listings, model credentials, and purchases stay
            in this installation. The same wallet on another installation starts
            a separate workspace.
          </p>
          <Button
            disabled={busy || !config}
            onClick={() => {
              void login()
            }}
          >
            {busy ? "Connecting…" : "Connect wallet and sign in"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
