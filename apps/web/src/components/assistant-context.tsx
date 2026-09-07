import { createContext, useContext } from "react"

import type { AssistantController } from "#/hooks/use-assistant"

export const AssistantContext = createContext<AssistantController | null>(null)

export function useWorkspaceAssistant() {
  const assistant = useContext(AssistantContext)
  if (!assistant) {
    throw new Error("Assistant context is unavailable")
  }
  return assistant
}
