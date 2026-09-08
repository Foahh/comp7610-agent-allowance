import type { Config } from "@repo/utils/config"

import { sValidator as validator } from "@hono/standard-validator"
import { AmountSchema, HexSchema, TaskSchema } from "@repo/schemas"
import { identityMessage } from "@repo/utils"
import { endpointUrl } from "@repo/utils/http"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import * as v from "valibot"

import type { Marketplace } from "../lib/marketplace.ts"
import type { SellerService } from "../lib/seller-service.ts"
import type { SellerStore } from "../lib/store.ts"

const AuthorizationSchema = v.object({
  signature: HexSchema,
  expiresAt: v.pipe(v.number(), v.integer()),
})

export function createProtocolRoutes(
  config: Config,
  market: Marketplace,
  service: SellerService,
  store: SellerStore
) {
  const app = new Hono()
  app.use("/*", bodyLimit({ maxSize: 512 * 1024 }))

  function identity() {
    const { name, description } = market.profile()

    return {
      protocol: "agent-spend/2" as const,
      name,
      description,
      address: service.account.address,
      chainId: config.chainId,
      vault: config.vault,
      token: config.token,
    }
  }

  return app
    .get("/identity", (context) => context.json(identity()))
    .post(
      "/identity",
      validator(
        "json",
        v.object({
          nonce: v.pipe(v.string(), v.minLength(16), v.maxLength(100)),
          endpoint: v.string(),
        })
      ),
      async (context) => {
        const { nonce, endpoint } = context.req.valid("json")

        return context.json({
          identity: identity(),
          signature: await service.account.signMessage({
            message: identityMessage(nonce, endpointUrl(endpoint)),
          }),
        })
      }
    )
    .get("/catalog", (context) =>
      context.json(market.published.list().map(market.offerListing))
    )
    .get("/listings/:id", (context) => {
      const listing = market.published.get(context.req.param("id"))

      if (!listing) {
        return context.json({ error: "Listing not available." }, 404)
      }

      return context.json(market.offerListing(listing))
    })
    .post(
      "/quotes",
      validator(
        "json",
        v.object({ allowanceId: AmountSchema, task: TaskSchema })
      ),
      async (context) => {
        const { allowanceId, task } = context.req.valid("json")

        return context.json(await service.createQuote(allowanceId, task))
      }
    )
    .post(
      "/purchases/:id/delivery",
      validator(
        "json",
        v.object({
          ...AuthorizationSchema.entries,
          txHash: HexSchema,
          retry: v.optional(v.boolean(), false),
        })
      ),
      async (context) => {
        const { signature, expiresAt, txHash, retry } =
          context.req.valid("json")
        const offer = await service.authorize(
          context.req.param("id"),
          retry ? "retry" : "deliver",
          signature,
          expiresAt
        )

        return context.json(
          await service.deliver(offer, txHash as `0x${string}`, retry)
        )
      }
    )
    .post(
      "/purchases/:id/status",
      validator("json", AuthorizationSchema),
      async (context) => {
        const { signature, expiresAt } = context.req.valid("json")
        const offer = await service.authorize(
          context.req.param("id"),
          "status",
          signature,
          expiresAt
        )

        return context.json(
          store.getDelivery(offer.id) ?? { status: "pending" }
        )
      }
    )
    .post(
      "/purchases/:id/file",
      validator("json", AuthorizationSchema),
      async (context) => {
        const { signature, expiresAt } = context.req.valid("json")
        const offer = await service.authorize(
          context.req.param("id"),
          "file",
          signature,
          expiresAt
        )
        const { asset, bytes } = service.file(offer.id)

        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
            "x-content-type-options": "nosniff",
            "cache-control": "no-store",
          },
        })
      }
    )
}
