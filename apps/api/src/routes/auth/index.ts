import { randomBytes, randomUUID } from "node:crypto"
import { Hono } from "hono"
import { sValidator as validator } from "@hono/standard-validator"
import { setCookie, deleteCookie, getCookie } from "hono/cookie"
import { recoverMessageAddress } from "viem"
import * as v from "valibot"
import { AddressSchema, HexSchema } from "@repo/schemas"
import type { Config } from "@repo/utils/config"
import type { BuyerStore } from "../../store.ts"

export function createAuthRoutes(store: BuyerStore, config: Config) {
  const router = new Hono()

  const challenges = router.post(
    "/challenge",
    validator("json", v.object({ address: AddressSchema })),
    (context) => {
      const owner = context.req.valid("json").address.toLowerCase()
      const id = randomUUID()
      const expiresAt = Date.now() + 300000

      const message = [
        "Agent Allowance sign-in",
        "Origin: " + config.appOrigin,
        "Wallet: " + owner,
        "Chain: " + config.chainId,
        "Nonce: " + id,
        "Expires: " + new Date(expiresAt).toISOString(),
        "This signature only opens a local session. It does not authorize spending.",
      ].join("\n")

      store.saveChallenge({
        id,
        owner,
        message,
        expiresAt,
      })
      return context.json({ id, message })
    }
  )

  const verify = challenges.post(
    "/verify",
    validator("json", v.object({ id: v.string(), signature: HexSchema })),
    async (context) => {
      const { id, signature } = context.req.valid("json")

      const challenge = store.getChallenge(id)
      if (!challenge || challenge.expiresAt <= Date.now()) {
        return context.json({ error: "Challenge expired." }, 401)
      }

      // Consume before asynchronous verification to reject concurrent replay.
      store.removeChallenge(id)
      const recovered = await recoverMessageAddress({
        message: challenge.message,
        signature: signature as `0x${string}`,
      })
      if (recovered.toLowerCase() !== challenge.owner) {
        return context.json({ error: "Wallet signature mismatch." }, 401)
      }

      const token = randomBytes(32).toString("hex")
      store.saveSession({
        id: token,
        owner: challenge.owner,
        expiresAt: Date.now() + 8 * 3600000,
      })

      setCookie(context, "agent_session", token, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/api",
        maxAge: 8 * 3600,
      })
      return context.json({ owner: challenge.owner })
    }
  )

  return verify.post("/logout", (context) => {
    const token = getCookie(context, "agent_session")
    if (token) {
      store.removeSession(token)
    }

    deleteCookie(context, "agent_session", { path: "/api" })
    return context.json({ ok: true })
  })
}
