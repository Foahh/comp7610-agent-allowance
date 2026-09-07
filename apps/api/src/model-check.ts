import { generateText, streamText, tool, stepCountIs, Output } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { valibotSchema } from "@ai-sdk/valibot"
import * as v from "valibot"
import { modelSettings } from "@repo/utils/config"

export async function checkModels() {
  for (const role of ["buyer", "seller"] as const) {
    const settings = modelSettings(role)
    if (!settings.apiKey || !settings.model) {
      throw new Error("Configure " + role + " model credentials first.")
    }
    const model = createOpenAI(settings).chat(settings.model)
    let streamed = ""
    const response = streamText({
      model,
      prompt: "Reply with exactly OK.",
      maxOutputTokens: 16,
    })
    for await (const text of response.textStream) {
      streamed += text
    }
    if (!streamed.trim()) {
      throw new Error(role + " returned no streamed text.")
    }

    let invoked = false
    await generateText({
      model,
      prompt: "Call the probe tool once.",
      toolChoice: "required",
      stopWhen: stepCountIs(1),
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
    if (!invoked) {
      throw new Error(role + " did not call the probe tool.")
    }

    const result = await generateText({
      model,
      prompt: "Return a structured object with ok true.",
      output: Output.object({
        schema: valibotSchema(v.object({ ok: v.boolean() })),
      }),
    })
    if (!result.output.ok) {
      throw new Error(role + " failed the structured-output probe.")
    }
    console.log(role + ": streaming, tool calling and structured output passed")
  }
}
