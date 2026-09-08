import type { Task } from "@repo/schemas"

import { expect, test, vi } from "vite-plus/test"

import type { ExecutionSnapshot } from "./marketplace.ts"

import { interpretTask } from "./specialist.ts"

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }))
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText,
}))

const task: Task = {
  service: "listing",
  sellerId: "seller",
  version: 1,
  requestId: "request",
  brief: "",
  evidence: "",
}

const snapshot = {
  listing: {
    type: "ai-service",
    requiredInputs: "Provide your evidence.",
    name: "Writer",
    deliverable: "A brief",
  },
  assets: [],
} as unknown as ExecutionSnapshot

test("missing service inputs clarify without a model call or payable deliverable", async () => {
  expect(await interpretTask(task, snapshot)).toEqual({
    clarification: "Provide your evidence.",
  })
  expect(generateText).not.toHaveBeenCalled()
})

test("static items quote their deliverable without invoking a model", async () => {
  expect(
    await interpretTask(task, {
      ...snapshot,
      listing: { ...snapshot.listing, type: "text" },
    })
  ).toEqual({ deliverable: "A brief" })
  expect(generateText).not.toHaveBeenCalled()
})
