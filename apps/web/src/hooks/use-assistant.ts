import { useReducer, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Conversation, Purchase } from "@repo/schemas"
import {
  jsonRequest,
  sendMessage,
  type AppConfig,
  type ConversationDetails,
} from "#/lib/client"
import {
  connectWallet,
  fundAllowance,
  updateAllowance,
  type ConnectedWallet,
} from "#/lib/wallet"

type Scenario = Conversation["scenario"]
type RunState = {
  busy: boolean
  status: string
  error: string
  user: string
  answer: string
  purchases: Purchase[]
  startedAt: number
}
type Action =
  | { type: "start"; user?: string }
  | { type: "finish" }
  | { type: "status"; text: string }
  | { type: "error"; text: string }
  | { type: "text"; text: string }
  | { type: "purchase"; purchase: Purchase }

const initial: RunState = {
  busy: false,
  status: "",
  error: "",
  user: "",
  answer: "",
  purchases: [],
  startedAt: 0,
}
function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "start":
      return {
        ...initial,
        busy: true,
        user: action.user || "",
        startedAt: Date.now(),
      }
    case "finish":
      return {
        ...state,
        busy: false,
        status: "",
        user: "",
        answer: "",
        purchases: [],
      }
    case "status":
      return { ...state, status: action.text }
    case "error":
      return { ...state, error: action.text }
    case "text":
      return { ...state, answer: state.answer + action.text }
    case "purchase":
      return {
        ...state,
        purchases: [
          ...state.purchases.filter((item) => item.id !== action.purchase.id),
          action.purchase,
        ],
      }
  }
}

export function useAssistant() {
  const cache = useQueryClient()
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [scenario, setScenario] = useState<Scenario>("success")
  const [draft, setDraft] = useState("")
  const [run, dispatch] = useReducer(reducer, initial)

  const configuration = useQuery({
    queryKey: ["config"],
    queryFn: () => jsonRequest<AppConfig>("/config"),
    retry: false,
  })
  const config = configuration.data
  const conversations = useQuery({
    queryKey: ["conversations", wallet?.account.address],
    queryFn: () => jsonRequest<Conversation[]>("/conversations"),
    enabled: !!wallet,
    retry: false,
  })
  const details = useQuery({
    queryKey: ["conversation", selected],
    queryFn: () =>
      jsonRequest<ConversationDetails>("/conversations/" + selected),
    enabled: !!selected && !!wallet,
    retry: false,
  })

  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["conversations"] }),
      cache.invalidateQueries({ queryKey: ["conversation"] }),
    ])
  }

  async function perform(operation: () => Promise<void>, user?: string) {
    dispatch({ type: "start", user })
    try {
      await operation()
    } catch (error) {
      dispatch({
        type: "error",
        text: error instanceof Error ? error.message : "Action failed.",
      })
    } finally {
      await refresh()
      dispatch({ type: "finish" })
    }
  }

  async function createConversation(nextScenario: Scenario) {
    const conversation = await jsonRequest<Conversation>("/conversations", {
      title:
        nextScenario === "insufficient"
          ? "Allowance boundary"
          : "Exchange semester",
      scenario: nextScenario,
    })
    setSelected(conversation.id)
    return conversation
  }

  function connect() {
    if (!config) {
      return
    }
    void perform(async () => {
      const connected = await connectWallet(config)
      const challenge = await jsonRequest<{ id: string; message: string }>(
        "/auth/challenge",
        {
          address: connected.account.address,
        }
      )
      const signature = await connected.signMessage({
        message: challenge.message,
      })
      await jsonRequest("/auth/verify", { id: challenge.id, signature })
      setWallet(connected)
      setSelected(null)
      await createConversation(scenario)
    })
  }

  function preset(next: Scenario) {
    setScenario(next)
    setDraft(
      "Compare Tokyo, Seoul, and Taipei for an exchange semester, then prepare a recommendation brief."
    )
    if (wallet) {
      void perform(async () => {
        await createConversation(next)
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
        (text) => dispatch({ type: "status", text })
      )
      await jsonRequest("/conversations/" + selected + "/allowance", {
        allowanceId,
      })
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

  function send() {
    if (!selected || !draft.trim()) {
      return
    }
    const message = draft.trim()
    setDraft("")
    void perform(async () => {
      await sendMessage(selected, message, (event) => {
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
      await jsonRequest("/conversations/" + selected + "/recover", {})
    })
  }

  const purchases = new Map(
    (details.data?.purchases || []).map((item) => [item.id, item])
  )
  for (const item of run.purchases) {
    purchases.set(item.id, item)
  }

  return {
    config,
    wallet,
    selected,
    scenario,
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
    setDraft,
    select: setSelected,
    connect,
    preset,
    fund,
    allowanceAction,
    send,
    recover,
  }
}

export type AssistantController = ReturnType<typeof useAssistant>
