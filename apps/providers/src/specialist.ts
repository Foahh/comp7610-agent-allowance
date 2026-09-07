import { generateText, Output, stepCountIs, tool } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { valibotSchema } from "@ai-sdk/valibot"
import * as v from "valibot"
import type { Task } from "@repo/schemas"
import { modelSettings } from "@repo/utils/config"
import { dataset, writingTemplate } from "./catalog.ts"
import {
  EXECUTE_TASK_SYSTEM_PROMPT,
  INTERPRET_TASK_SYSTEM_PROMPT,
} from "./prompts.ts"

export async function interpretTask(task: Task) {
  if (
    task.service === "analysis" &&
    !/tokyo|seoul|taipei|cities|exchange/i.test(task.brief)
  ) {
    return {
      clarification:
        "The dataset covers Tokyo, Seoul and Taipei. Which comparison would help your task?",
    }
  }
  if (task.service === "writing" && !task.evidence.trim()) {
    return {
      clarification:
        "Please supply evidence or buy an analysis before requesting an evidence-based brief.",
    }
  }
  const settings = modelSettings("seller")
  if (!settings.apiKey || !settings.model) {
    throw new Error("Seller model is not configured.")
  }
  const provider = createOpenAI(settings)
  const result = await generateText({
    model: provider.chat(settings.model),
    system: INTERPRET_TASK_SYSTEM_PROMPT,
    prompt: JSON.stringify(task),
    output: Output.object({
      schema: valibotSchema(
        v.object({ needsClarification: v.boolean(), message: v.string() })
      ),
    }),
    maxOutputTokens: 120,
    abortSignal: AbortSignal.timeout(30000),
  })
  return result.output.needsClarification
    ? { clarification: result.output.message }
    : { deliverable: result.output.message }
}

export async function executeTask(task: Task) {
  const settings = modelSettings("seller")
  if (!settings.apiKey || !settings.model) {
    throw new Error("Seller model is not configured.")
  }
  const provider = createOpenAI(settings)
  const result = await generateText({
    model: provider.chat(settings.model),
    system: EXECUTE_TASK_SYSTEM_PROMPT,
    prompt: JSON.stringify(task),
    tools: {
      readDataset: tool({
        description:
          "Read the provider's controlled synthetic city dataset with row identifiers.",
        inputSchema: valibotSchema(v.object({})),
        execute: async () => dataset,
      }),
      readWritingTemplate: tool({
        description: "Read the provider's evidence-based brief template.",
        inputSchema: valibotSchema(v.object({})),
        execute: async () => writingTemplate,
      }),
    },
    stopWhen: stepCountIs(4),
    maxOutputTokens: 1500,
    abortSignal: AbortSignal.timeout(60000),
  })
  if (!result.text.trim()) {
    throw new Error("Specialist ended without a deliverable.")
  }
  return result.text
}
