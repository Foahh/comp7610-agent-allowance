import { createDeepSeek } from "@ai-sdk/deepseek"
import { createOpenAI } from "@ai-sdk/openai"

type ModelSettings = {
  baseURL: string
  apiKey?: string
  model: string
}

export function createModel(
  settings: ModelSettings
): ReturnType<ReturnType<typeof createDeepSeek>["chat"]> {
  if (new URL(settings.baseURL).hostname === "api.deepseek.com") {
    return createDeepSeek(settings).chat(settings.model)
  }

  return createOpenAI(settings).chat(settings.model)
}
