import type { Purchase } from "@repo/schemas"

import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { expect, test, vi } from "vite-plus/test"

import { handleAssistantEvent } from "./assistant-events.ts"

test("a streamed purchase refreshes the allowance before the agent finishes", async () => {
  const cache = new QueryClient()
  const queryKey = ["conversation", "chat", "wallet", "deployment"]
  const oldDetails = { allowance: { remaining: "10000000" }, purchases: [] }
  cache.setQueryData(queryKey, oldDetails)
  cache.setQueryData(["conversation", "other"], oldDetails)
  let completeRead!: (value: typeof oldDetails) => void
  const read = vi.fn(
    () =>
      new Promise<typeof oldDetails>((resolve) => {
        completeRead = resolve
      })
  )
  const observer = new QueryObserver(cache, {
    queryKey,
    queryFn: read,
    staleTime: Infinity,
  })
  const unsubscribe = observer.subscribe(() => {})
  const dispatch = vi.fn()
  try {
    handleAssistantEvent(
      {
        type: "purchase",
        purchase: { id: "purchase", paymentStatus: "confirmed" } as Purchase,
      },
      "chat",
      cache,
      dispatch
    )

    expect(read).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledOnce()
    // No done event or delivery result is needed to refresh the balance.
    completeRead({ ...oldDetails, allowance: { remaining: "7500000" } })
    await vi.waitFor(() => {
      expect(cache.getQueryData(queryKey)).toEqual({
        ...oldDetails,
        allowance: { remaining: "7500000" },
      })
    })
    expect(cache.getQueryState(["conversation", "other"])?.isInvalidated).toBe(
      false
    )
  } finally {
    unsubscribe()
    cache.clear()
  }
})

test("pending purchase events trigger discovery so the query can begin polling", () => {
  const cache = new QueryClient()
  const queryKey = ["conversation", "chat", "wallet", "deployment"]
  cache.setQueryData(queryKey, { purchases: [] })
  const libraryKey = ["marketplace", "purchases", "wallet"]
  cache.setQueryData(libraryKey, [])
  handleAssistantEvent(
    {
      type: "purchase",
      purchase: { id: "purchase", paymentStatus: "pending" } as Purchase,
    },
    "chat",
    cache,
    vi.fn()
  )
  expect(cache.getQueryState(queryKey)?.isInvalidated).toBe(true)
  expect(cache.getQueryState(libraryKey)?.isInvalidated).toBe(true)
  cache.clear()
})

test("text and status events do not repeatedly request the allowance", () => {
  const cache = new QueryClient()
  const queryKey = ["conversation", "chat"]
  cache.setQueryData(queryKey, { purchases: [] })
  const dispatch = vi.fn()
  handleAssistantEvent(
    { type: "text", text: "Working" },
    "chat",
    cache,
    dispatch
  )
  handleAssistantEvent(
    { type: "status", text: "Delivering" },
    "chat",
    cache,
    dispatch
  )
  handleAssistantEvent({ type: "done" }, "chat", cache, dispatch)
  expect(cache.getQueryState(queryKey)?.isInvalidated).toBe(false)
  expect(dispatch).toHaveBeenCalledTimes(2)
  cache.clear()
})
