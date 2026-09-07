import { createFileRoute } from "@tanstack/react-router"
import { AssistantWorkspace } from "#/components/assistant-workspace"

export const Route = createFileRoute("/")({ component: AssistantWorkspace })
