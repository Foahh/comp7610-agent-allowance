import type { Config } from "@repo/utils/config"

import { sValidator as validator } from "@hono/standard-validator"
import { AddressSchema, HexSchema } from "@repo/schemas"
import { addHours, addMinutes, hoursToSeconds } from "date-fns"
import { Hono } from "hono"
import { setCookie, deleteCookie, getCookie } from "hono/cookie"
import { randomBytes, randomUUID } from "node:crypto"
import * as v from "valibot"
import { recoverMessageAddress } from "viem"

import type { BuyerStore } from "../lib/store.ts"

const ChallengeRequestSchema = v.object({ address: AddressSchema })
const VerificationRequestSchema = v.object({
  id: v.string(),
  signature: HexSchema,
})

export function createAuthRoutes(store: BuyerStore, config: Config) {
  const router = new Hono()

  return router
    .post(
      "/challenge",
      validator("json", ChallengeRequestSchema),
      (context) => {
        const { address } = context.req.valid("json")

        const owner = address.toLowerCase()
        const id = randomUUID()
        const expiresAt = addMinutes(new Date(), 5).getTime()

        const message = [
          "sign-in",
          `Origin: ${config.appOrigin}`,
          `Wallet: ${owner}`,
          `Chain: ${config.chainId}`,
          `Nonce: ${id}`,
          `Expires: ${new Date(expiresAt).toISOString()}`,
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
    .post(
      "/verify",
      validator("json", VerificationRequestSchema),
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
          expiresAt: addHours(new Date(), 8).getTime(),
        })

        setCookie(context, "agent_session", token, {
          httpOnly: true,
          sameSite: "Strict",
          path: "/api",
          maxAge: hoursToSeconds(8),
        })

        return context.json({ owner: challenge.owner })
      }
    )
    .post("/logout", (context) => {
      const token = getCookie(context, "agent_session")
      if (token) {
        store.removeSession(token)
      }

      deleteCookie(context, "agent_session", { path: "/api" })

      return context.json({ ok: true })
    })
}
