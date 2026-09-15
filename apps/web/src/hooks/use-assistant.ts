import type { Address } from "viem"

import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import {
  bindAllowance,
  createConversation as requestConversation,
  deleteConversation,
  recoverConversation,
  sendMessage,
} from "#/lib/client"
import {
  fundAllowance,
  updateAllowance,
  type ConnectedWallet,
} from "#/lib/wallet"

import { useAssistantQueries } from "./use-assistant-queries.ts"
import { useAssistantRun } from "./use-assistant-run.ts"

export function useAssistant(wallet: ConnectedWallet, logout: () => void) {
  const cache = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [approvedSellers, setApprovedSellers] = useState<Address[]>([])
  const [automatic, setAutomatic] = useState(false)
  const [draft, setDraft] = useState("")
  const { configuration, conversations, details, refresh } =
    useAssistantQueries(wallet?.account.address, selected)
  const { run, dispatch, perform } = useAssistantRun(refresh)
  const config = configuration.data

  async function createConversation(message?: string) {
    const title =
      message?.replace(/\s+/g, " ").slice(0, 120) || "New conversation"
    const conversation = await requestConversation(title, "success")
    setSelected(conversation.id)

    return conversation
  }

  function newConversation() {
    if (run.busy) {
      return
    }
    setDraft("")

    if (wallet) {
      void perform(async () => {
        await createConversation()
      })
    }
  }

  function fund(budget: string, cap: string) {
    if (!wallet || !config || !selected) {
      return
    }

    void perform(async () => {
      const allowanceId = await fundAllowance(
        wallet,
        config,
        budget,
        cap,
        approvedSellers,
        (text) => dispatch({ type: "status", text }),
        automatic
      )
      await bindAllowance(selected, allowanceId)
    })
  }

  function allowanceAction(action: "revokeAllowance" | "withdrawUnused") {
    if (!wallet || !config || !details.data?.allowance) {
      return
    }

    void perform(async () => {
      dispatch({
        type: "status",
        text: "Confirm the allowance change in your wallet.",
      })
      await updateAllowance(wallet, config, details.data!.allowance!.id, action)
    })
  }

  function send(text = draft) {
    if (!wallet || run.busy || !text.trim()) {
      return
    }

    const message = text.trim()
    setDraft("")
    void perform(async () => {
      let conversationId = selected
      if (!conversationId) {
        try {
          conversationId = (await createConversation(message)).id
        } catch (error) {
          setDraft(message)
          throw error
        }
      }
      await sendMessage(conversationId, message, (event) => {
        if (event.type !== "done") {
          dispatch(event)
        }
      })
    }, message)
  }

  function recover() {
    if (!selected) {
      return
    }

    void perform(async () => {
      await recoverConversation(selected)
    })
  }

  function removeConversation(id: string) {
    if (run.busy) {
      return
    }
    void perform(async () => {
      await deleteConversation(id)
      if (selected === id) {
        setSelected(
          conversations.data?.find((conversation) => conversation.id !== id)
            ?.id ?? null
        )
        setDraft("")
      }
      cache.removeQueries({ queryKey: ["conversation", id], exact: true })
    })
  }

  const purchases = new Map(
    (details.data?.purchases || []).map((item) => [item.id, item])
  )

  for (const item of run.purchases) {
    if (purchases.get(item.id)?.paymentStatus !== "confirmed") {
      purchases.set(item.id, item)
    }
  }

  return {
    config,
    wallet,
    selected,
    draft,
    run,
    details: details.data,
    loading: configuration.isPending || (details.isPending && !!selected),
    error:
      run.error ||
      configuration.error?.message ||
      details.error?.message ||
      conversations.error?.message,
    conversations: conversations.data || [],
    purchases: [...purchases.values()],
    approvedSellers,
    automatic,
    setAutomatic,
    setApprovedSellers,
    setDraft,
    select: (id: string) => {
      setSelected(id)
      setDraft("")
    },
    connect: logout,
    logout,
    newConversation,
    fund,
    allowanceAction,
    send,
    continuePurchases: () => send("Continue remaining purchases."),
    recover,
    removeConversation,
  }
}

export type AssistantController = ReturnType<typeof useAssistant>
