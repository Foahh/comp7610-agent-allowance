import { valibotSchema } from "@ai-sdk/valibot"
import { createModel } from "@repo/utils/model"
import { generateText, streamText, tool, stepCountIs, Output } from "ai"
import * as v from "valibot"

export async function checkModel(settings: {
  baseURL: string
  model: string
  apiKey: string
}) {
  const role = "Connection"

  if (!settings.apiKey || !settings.model) {
    throw new Error(`Configure ${role} model credentials first.`)
  }

  const model = createModel({ ...settings, model: settings.model })
  let streamed = ""

  const response = streamText({
    model,
    prompt: "Reply with exactly OK.",
    abortSignal: AbortSignal.timeout(60000),
  })

  for await (const text of response.textStream) {
    streamed = `${streamed}${text}`
  }

  if (!streamed.trim()) {
    throw new Error(`${role} returned no streamed text.`)
  }

  let invoked = false
  const toolResponse = streamText({
    model,
    prompt: "Call the probe tool once, then reply with the value it returns.",
    toolChoice: "auto",
    stopWhen: stepCountIs(2),
    abortSignal: AbortSignal.timeout(60000),
    tools: {
      probe: tool({
        inputSchema: valibotSchema(v.object({})),
        execute: async () => {
          invoked = true

          return "ok"
        },
      }),
    },
  })

  let toolAnswer = ""
  for await (const text of toolResponse.textStream) {
    toolAnswer = `${toolAnswer}${text}`
  }

  if (!invoked || (await toolResponse.steps).length < 2 || !toolAnswer.trim()) {
    throw new Error(`${role} failed the multi-step tool probe.`)
  }

  const result = await generateText({
    model,
    prompt: 'Return a JSON object with exactly this shape: {"ok": true}.',
    output: Output.object({
      schema: valibotSchema(v.object({ ok: v.boolean() })),
    }),
    abortSignal: AbortSignal.timeout(60000),
  })

  const output = result.output

  if (!output.ok) {
    throw new Error(`${role} failed the structured-output probe.`)
  }

  return { streaming: true, tools: true, structuredOutput: true }
}
