import { useReducer } from "react"
import type { ChatEvent, Purchase } from "@repo/schemas"

export type RunState = {
  busy: boolean
  status: string
  error: string
  user: string
  answer: string
  purchases: Purchase[]
  startedAt: number
}

type RunAction =
  | { type: "start"; user?: string }
  | { type: "finish" }
  | Exclude<ChatEvent, { type: "done" }>

const initialRunState: RunState = {
  busy: false,
  status: "",
  error: "",
  user: "",
  answer: "",
  purchases: [],
  startedAt: 0,
}

function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "start":
      return {
        ...initialRunState,
        busy: true,
        user: action.user ?? "",
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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useAssistantRun(refresh: () => Promise<void>) {
  const [run, dispatch] = useReducer(runReducer, initialRunState)

  async function perform(operation: () => Promise<void>, user?: string) {
    dispatch({ type: "start", user })
    try {
      await operation()
    } catch (error) {
      dispatch({ type: "error", text: errorMessage(error, "Action failed.") })
    } finally {
      try {
        await refresh()
      } catch (error) {
        dispatch({
          type: "error",
          text: errorMessage(error, "Unable to refresh application data."),
        })
      } finally {
        // Refresh failures must not leave every action disabled indefinitely.
        dispatch({ type: "finish" })
      }
    }
  }

  return {
    run,
    dispatch,
    perform,
  }
}
