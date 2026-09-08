export function endpointUrl(value: string) {
  const url = new URL(value)

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use an HTTP(S) endpoint without credentials, query parameters, or a fragment."
    )
  }

  const normalized = url.toString()

  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
}

export async function boundedResponse(
  response: Response,
  limit = 2 * 1024 * 1024
) {
  if (Number(response.headers.get("content-length")) > limit) {
    throw new Error("Response exceeds the size limit.")
  }

  const reader = response.body?.getReader()

  if (!reader) {
    throw new Error("Empty response.")
  }

  let size = 0
  const chunks: Uint8Array[] = []

  try {
    while (true) {
      const chunk = await reader.read()

      if (chunk.done) {
        break
      }
      size += chunk.value.length

      if (size > limit) {
        await reader.cancel()
        throw new Error("Response exceeds the size limit.")
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks)
}

export async function endpointRequest(
  endpoint: string,
  path: string,
  init: RequestInit = {}
) {
  const response = await fetch(`${endpointUrl(endpoint)}${path}`, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(90000),
  })
  const bytes = await boundedResponse(response)
  const result: unknown = JSON.parse(bytes.toString("utf8"))

  if (!response.ok) {
    const error = result as { error?: string }
    throw new Error(error.error || "Seller request failed.")
  }

  return result
}
