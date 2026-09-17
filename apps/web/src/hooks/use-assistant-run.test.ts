import { expect, test, vi } from "vite-plus/test"

import { performAssistantAction } from "./use-assistant-run.ts"

test("completed wallet actions release controls while refresh is still pending", async () => {
  let release!: () => void
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
  )
  const dispatch = vi.fn()
  await performAssistantAction(async () => {}, refresh, dispatch)
  expect(refresh).toHaveBeenCalledOnce()
  expect(dispatch).toHaveBeenLastCalledWith({ type: "finish" })
  release()
})

test("controls remain busy until the transaction action itself completes", async () => {
  let release!: () => void
  const transaction = new Promise<void>((resolve) => {
    release = resolve
  })
  const dispatch = vi.fn()
  const result = performAssistantAction(
    () => transaction,
    async () => {},
    dispatch
  )
  await Promise.resolve()
  expect(dispatch).toHaveBeenCalledTimes(1)
  release()
  await result
  expect(dispatch).toHaveBeenLastCalledWith({ type: "finish" })
})

test("chat streaming keeps its final answer until the message cache refresh completes", async () => {
  let release!: () => void
  const refresh = new Promise<void>((resolve) => {
    release = resolve
  })
  const dispatch = vi.fn()
  const result = performAssistantAction(
    async () => {},
    () => refresh,
    dispatch,
    "User message"
  )
  await Promise.resolve()
  expect(dispatch).toHaveBeenCalledTimes(1)
  release()
  await result
  expect(dispatch).toHaveBeenLastCalledWith({ type: "finish" })
})
