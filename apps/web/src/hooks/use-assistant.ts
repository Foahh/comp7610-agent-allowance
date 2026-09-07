import { useState } from "react"
import type { Conversation } from "@repo/schemas"
import {
  bindAllowance,
  createAuthChallenge,
  createConversation as requestConversation,
  recoverConversation,
  sendMessage,
  verifyAuthChallenge,
} from "#/lib/client"
import {
  connectWallet,
  fundAllowance,
  updateAllowance,
  type ConnectedWallet,
} from "#/lib/wallet"
import { useAssistantQueries } from "./use-assistant-queries.ts"
import { useAssistantRun } from "./use-assistant-run.ts"

type Scenario = Conversation["scenario"]

const EXCHANGE_SEMESTER_PROMPT = [
  "Compare Tokyo, Seoul, and Taipei for an exchange semester, then prepare",
  "a recommendation brief.",
].join(" ")
export function useAssistant() {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [scenario, setScenario] = useState<Scenario>("success")
  const [draft, setDraft] = useState("")
  const { configuration, conversations, details, refresh } =
    useAssistantQueries(wallet?.account.address, selected)
  const { run, dispatch, perform } = useAssistantRun(refresh)
  const config = configuration.data

  async function createConversation(nextScenario: Scenario) {
    const title =
      nextScenario === "insufficient"
        ? "Allowance boundary"
        : "Exchange semester"
    const conversation = await requestConversation(title, nextScenario)
    setSelected(conversation.id)
    return conversation
  }

  function connect() {
    if (!config) {
      return
    }
    void perform(async () => {
      const connected = await connectWallet(config)
      const challenge = await createAuthChallenge(connected.account.address)
      const signature = await connected.signMessage({
        message: challenge.message,
      })
      await verifyAuthChallenge(challenge.id, signature)
      setWallet(connected)
      setSelected(null)
      await createConversation(scenario)
    })
  }

  function preset(next: Scenario) {
    setScenario(next)
    setDraft(EXCHANGE_SEMESTER_PROMPT)
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
      await recoverConversation(selected)
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
