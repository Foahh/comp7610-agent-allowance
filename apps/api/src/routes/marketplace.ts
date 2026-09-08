import type { Config } from "@repo/utils/config"

import { sValidator as validator } from "@hono/standard-validator"
import { TaskSchema, HexSchema } from "@repo/schemas"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import * as v from "valibot"

import type { BuyerAgent } from "../lib/agent.ts"
import type { Payments } from "../lib/payments.ts"
import type { BuyerStore } from "../lib/store.ts"
import type { Marketplace } from "../seller/lib/marketplace.ts"
import type { SellerService } from "../seller/lib/seller-service.ts"
import type { AppEnv } from "./conversations.ts"

import { publicPurchase } from "../lib/payments.ts"
import { createSellerClient } from "../lib/seller-client.ts"
import { createAdminRoutes } from "../seller/routes/admin.ts"

const SellerEndpointSchema = v.object({ endpoint: v.string() })
const SellerStatusSchema = v.object({ enabled: v.boolean() })
const PurchaseRequestSchema = v.object({ quoteId: HexSchema })

async function ignoreAgentEvent() {}

export function createMarketplaceRoutes(
  config: Config,
  store: BuyerStore,
  payments: Payments,
  agent: BuyerAgent,
  market: Marketplace,
  service: SellerService
) {
  const app = new Hono<AppEnv>()
  const sellers = createSellerClient(config, store)
  app.use("/*", bodyLimit({ maxSize: 21 * 1024 * 1024 }))

  function conversation(id: string, owner: string) {
    const value = store.getConversation(id)

    if (!value || value.owner !== owner) {
      throw new Error("Conversation not found.")
    }

    return value
  }

  return app
    .get("/connections", (context) => context.json(sellers.connections.list()))
    .post(
      "/connections",
      validator("json", SellerEndpointSchema),
      async (context) =>
        context.json(
          await sellers.connect(context.req.valid("json").endpoint),
          201
        )
    )
    .post("/connections/:id/refresh", async (context) =>
      context.json(await sellers.refresh(context.req.param("id")))
    )
    .put(
      "/connections/:id",
      validator("json", SellerStatusSchema),
      (context) => {
        const connection = sellers.connections.get(context.req.param("id"))

        if (!connection || connection.status === "identity-changed") {
          throw new Error(
            "Reconnect and verify this seller before enabling it."
          )
        }

        const updated = {
          ...connection,
          enabled: context.req.valid("json").enabled,
        }
        sellers.connections.save(connection.id, updated)

        return context.json(updated)
      }
    )
    .delete("/connections/:id", (context) => {
      sellers.connections.remove(context.req.param("id"))

      return context.json({ ok: true })
    })
    .post(
      "/conversations/:id/quotes",
      validator("json", TaskSchema),
      async (context) =>
        context.json(
          await agent.quote(
            conversation(context.req.param("id"), context.get("owner")),
            context.req.valid("json")
          )
        )
    )
    .post(
      "/conversations/:id/purchases",
      validator("json", PurchaseRequestSchema),
      async (context) =>
        context.json(
          await agent.purchase(
            conversation(context.req.param("id"), context.get("owner")),
            context.req.valid("json").quoteId,
            ignoreAgentEvent
          )
        )
    )
    .get("/purchases", (context) =>
      context.json(store.listPurchases().map(publicPurchase))
    )
    .post("/purchases/:id/retry", async (context) => {
      const purchase = store.getPurchase(context.req.param("id"))

      if (!purchase) {
        throw new Error("Purchase not found.")
      }

      await payments.recoverAll()

      return context.json(
        publicPurchase(
          await agent.deliver(
            store.getPurchase(purchase.id)!,
            ignoreAgentEvent,
            true
          )
        )
      )
    })
    .get("/purchases/:id/file", async (context) => {
      const purchase = store.getPurchase(context.req.param("id"))

      if (
        !purchase ||
        purchase.paymentStatus !== "confirmed" ||
        purchase.delivery?.status !== "completed" ||
        !purchase.delivery.file
      ) {
        throw new Error("A completed file purchase is required.")
      }

      return new Response(new Uint8Array(await sellers.file(purchase)), {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(purchase.delivery.file.name)}`,
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        },
      })
    })
    .route("/seller", createAdminRoutes(market, service))
}
