import { beforeEach, expect, test, vi } from "vite-plus/test"

import { dataset } from "./catalog.ts"
import { interpretTask } from "./specialist.ts"

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }))
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText,
}))
vi.mock("@repo/utils/config", () => ({
  modelSettings: () => ({ apiKey: "test", model: "test" }),
}))
vi.mock("@repo/utils/model", () => ({ createModel: () => ({}) }))

beforeEach(() => {
  generateText.mockReset()
  generateText.mockResolvedValue({
    output: { needsClarification: false, message: "A cited comparison." },
  })
})

test("analysis quote review receives provider rows without buyer evidence", async () => {
  const task = {
    service: "analysis" as const,
    brief: "Compare Tokyo, Seoul, and Taipei for an exchange semester.",
    evidence: "",
  }
  expect(await interpretTask(task)).toEqual({
    deliverable: "A cited comparison.",
  })
  const context = JSON.parse(generateText.mock.calls[0]![0].prompt)
  expect(context).toEqual({ task, dataset })
  expect(context.dataset.rows.map((row: { id: string }) => row.id)).toEqual([
    "TOK-01",
    "SEL-01",
    "TPE-01",
  ])
})

test("writing still requires evidence before a quote can be issued", async () => {
  expect(
    await interpretTask({
      service: "writing",
      brief: "Recommend a city",
      evidence: " ",
    })
  ).toHaveProperty("clarification")
  expect(generateText).not.toHaveBeenCalled()
})

test("writing quote review uses the purchased evidence", async () => {
  const task = {
    service: "writing" as const,
    brief: "Prepare a recommendation brief",
    evidence: "Synthetic monthly total: Taipei USD 540 [TPE-01].",
  }
  await interpretTask(task)
  expect(JSON.parse(generateText.mock.calls[0]![0].prompt)).toEqual({ task })
})

test("unsupported analysis still asks for scope clarification", async () => {
  expect(
    await interpretTask({
      service: "analysis",
      brief: "Compare London and Paris",
      evidence: "",
    })
  ).toHaveProperty("clarification")
  expect(generateText).not.toHaveBeenCalled()
})
