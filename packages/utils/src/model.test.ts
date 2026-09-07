import { generateText, jsonSchema, Output } from "ai"
import { afterEach, expect, test, vi } from "vite-plus/test"

import { createModel } from "./model.ts"

afterEach(() => vi.unstubAllGlobals())

const schema = jsonSchema<{ ok: boolean }>(
  {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  },
  {
    validate: (value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "ok" in value &&
        typeof value.ok === "boolean"
      ) {
        return { success: true, value: { ok: value.ok } }
      }
      return { success: false, error: new Error("Expected boolean ok") }
    },
  }
)

function mockCompletion(content: string) {
  const fetchMock = vi.fn(async () =>
    Response.json({
      id: "test",
      object: "chat.completion",
      created: 0,
      model: "test",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

test.each([
  ["https://api.deepseek.com", "json_object"],
  ["https://api.openai.com/v1", "json_schema"],
])(
  "structured output uses the correct format for %s",
  async (baseURL, format) => {
    const fetchMock = mockCompletion('{"ok":true}')
    const result = await generateText({
      model: createModel({ baseURL, apiKey: "test", model: "test" }),
      prompt: "Return JSON with ok true.",
      output: Output.object({ schema }),
    })
    expect(result.output).toEqual({ ok: true })
    const calls = fetchMock.mock.calls as unknown as [unknown, RequestInit][]
    const body = calls[0]![1].body
    if (typeof body !== "string") {
      throw new Error("Expected a JSON request body")
    }
    const request = JSON.parse(body)
    expect(request.response_format.type).toBe(format)
  }
)

test("DeepSeek JSON mode still rejects output that violates the schema", async () => {
  mockCompletion('{"ok":"true"}')
  await expect(
    generateText({
      model: createModel({
        baseURL: "https://api.deepseek.com",
        apiKey: "test",
        model: "test",
      }),
      prompt: "Return JSON with ok true.",
      output: Output.object({ schema }),
    })
  ).rejects.toThrow()
})
