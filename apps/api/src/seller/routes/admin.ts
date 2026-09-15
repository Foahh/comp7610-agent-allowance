import { sValidator as validator } from "@hono/standard-validator"
import { ListingInputSchema, ModelInputSchema } from "@repo/schemas"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import * as v from "valibot"

import type { Marketplace } from "../lib/marketplace.ts"
import type { SellerService } from "../lib/seller-service.ts"

import { checkModel } from "../lib/model-check.ts"
import { executeTask } from "../lib/specialist.ts"

const ProfileSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  description: v.pipe(v.string(), v.maxLength(2000)),
  buyerModelId: v.string(),
})
const PreviewInputSchema = v.object({
  brief: v.pipe(v.string(), v.maxLength(12000)),
  evidence: v.optional(v.pipe(v.string(), v.maxLength(30000)), ""),
})

export function createAdminRoutes(market: Marketplace, service: SellerService) {
  const app = new Hono()
  app.use("/*", bodyLimit({ maxSize: 21 * 1024 * 1024 }))

  return app
    .get("/submission", async (context) =>
      context.json(await service.submitter.status())
    )
    .put(
      "/submission",
      validator("json", v.object({ enabled: v.boolean() })),
      (context) => {
        service.submitter.setEnabled(context.req.valid("json").enabled)
        return context.json({ ok: true })
      }
    )
    .get("/identity", (context) =>
      context.json({ address: service.account.address })
    )
    .get("/profile", (context) => context.json(market.profile()))
    .put("/profile", validator("json", ProfileSchema), (context) => {
      const profile = context.req.valid("json")

      if (profile.buyerModelId) {
        market.runtimeModel(profile.buyerModelId)
      }
      market.settings.save("profile", profile)

      return context.json(profile)
    })
    .get("/models", (context) => context.json(market.modelList()))
    .delete("/models/:id", (context) => {
      market.deleteModel(context.req.param("id"))
      return context.json({ ok: true })
    })
    .post(
      "/models",
      validator("json", ModelInputSchema, (result, context) => {
        if (!result.success) {
          // Validation responses must never echo an API key.
          return context.json(
            {
              error:
                "Invalid model settings. Check the name, endpoint, model, and key.",
            },
            400
          )
        }
      }),
      (context) =>
        context.json(market.saveModel(context.req.valid("json")), 201)
    )
    .put(
      "/models/:id",
      validator("json", ModelInputSchema, (result, context) => {
        if (!result.success) {
          // Validation responses must never echo an API key.
          return context.json(
            {
              error:
                "Invalid model settings. Check the name, endpoint, model, and key.",
            },
            400
          )
        }
      }),
      (context) =>
        context.json(
          market.saveModel(context.req.valid("json"), context.req.param("id"))
        )
    )
    .post("/models/:id/check", async (context) => {
      try {
        return context.json(
          await checkModel(market.runtimeModel(context.req.param("id")))
        )
      } catch {
        return context.json(
          {
            error:
              "Connection check failed. Verify the endpoint, model, and key; this check requires streaming, tool calls, and structured output.",
          },
          400
        )
      }
    })
    .get("/assets", (context) => context.json(market.assets.list()))
    .delete("/assets/:id", (context) => {
      const id = context.req.param("id")
      if (!market.assets.get(id)) {
        return context.json({ error: "File not found." }, 404)
      }
      if (market.assets.isReferenced(id)) {
        return context.json(
          {
            error:
              "This file is still needed by a current listing or file order. Remove it from the listing and republish, or delete the listing. Files needed by existing orders must be kept.",
          },
          409
        )
      }
      market.deleteAsset(id)
      return context.json({ ok: true })
    })
    .post("/assets", async (context) => {
      const body = await context.req.parseBody()

      if (!(body.file instanceof File)) {
        throw new Error("Choose a file to upload.")
      }

      return context.json(
        market.saveAsset(
          body.file.name,
          body.file.type,
          new Uint8Array(await body.file.arrayBuffer())
        ),
        201
      )
    })
    .get("/listings", (context) => context.json(market.listings.list()))
    .delete("/listings/:id", (context) => {
      market.deleteListing(context.req.param("id"))
      return context.json({ ok: true })
    })
    .post("/demo-items", (context) => context.json(market.addDemoItems()))
    .post("/listings", validator("json", ListingInputSchema), (context) =>
      context.json(market.saveListing(context.req.valid("json")), 201)
    )
    .put("/listings/:id", validator("json", ListingInputSchema), (context) => {
      if (!market.listings.get(context.req.param("id"))) {
        throw new Error("Listing not found.")
      }

      return context.json(
        market.saveListing(context.req.valid("json"), context.req.param("id"))
      )
    })
    .post(
      "/listings/:id/publish",
      validator("json", v.object({ active: v.boolean() })),
      (context) =>
        context.json(
          market.publish(
            context.req.param("id"),
            context.req.valid("json").active
          )
        )
    )
    .post(
      "/listings/:id/preview",
      validator("json", PreviewInputSchema),
      async (context) => {
        const listing = market.listings.get(context.req.param("id"))

        if (!listing || listing.type !== "ai-service") {
          throw new Error("Select an AI-service draft to preview.")
        }

        const input = context.req.valid("json")

        return context.json({
          content: await executeTask(
            {
              ...input,
              service: listing.id,
              version: listing.version,
              requestId: "preview",
              sellerId: "preview",
            },
            market.snapshot(listing),
            listing.deliverable,
            market.credentialsDir
          ),
        })
      }
    )
    .get("/orders", (context) => context.json(service.orders()))
    .delete("/orders/:id", (context) => {
      if (!service.deleteOrder(context.req.param("id"))) {
        return context.json({ error: "Order not found." }, 404)
      }
      return context.json({ ok: true })
    })
}
