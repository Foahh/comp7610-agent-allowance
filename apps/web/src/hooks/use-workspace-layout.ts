import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void) {
  const queries = [
    window.matchMedia("(min-width: 768px)"),
    window.matchMedia("(min-width: 1280px)"),
  ]
  for (const query of queries) {
    query.addEventListener("change", onChange)
  }
  return () => {
    for (const query of queries) {
      query.removeEventListener("change", onChange)
    }
  }
}

function getLayout() {
  if (window.matchMedia("(min-width: 1280px)").matches) {
    return "desktop"
  }
  return window.matchMedia("(min-width: 768px)").matches ? "tablet" : "mobile"
}

export function useWorkspaceLayout() {
  return useSyncExternalStore(subscribe, getLayout, () => "desktop" as const)
}
