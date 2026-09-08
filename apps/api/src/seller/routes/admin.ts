import { sValidator as validator } from "@hono/standard-validator"
import { ListingInputSchema, ModelInputSchema } from "@repo/schemas"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import * as v from "valibot"

import type { Marketplace } from "../lib/marketplace.ts"
import type { SellerService } from "../lib/seller-service.ts"

import { dataset, writingTemplate } from "../lib/catalog.ts"
import { checkModel } from "../lib/model-check.ts"
import { executeTask } from "../lib/specialist.ts"

const ProfileSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  description: v.pipe(v.string(), v.maxLength(2000)),
  buyerModelId: v.string(),
})

export function createAdminRoutes(market: Marketplace, service: SellerService) {
  const app = new Hono()
  app.use("/*", bodyLimit({ maxSize: 21 * 1024 * 1024 }))

  return app
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
      validator(
        "json",
        v.object({
          brief: v.pipe(v.string(), v.maxLength(12000)),
          evidence: v.optional(v.pipe(v.string(), v.maxLength(30000)), ""),
        })
      ),
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
            listing.deliverable
          ),
        })
      }
    )
    .post("/templates/:type", (context) => {
      const type = context.req.param("type")

      if (!["analysis", "writing"].includes(type)) {
        throw new Error("Unknown template.")
      }

      const analysis = type === "analysis"
      const asset = market.saveAsset(
        analysis ? "exchange-cities-synthetic-v1.json" : "brief-template.json",
        "application/json",
        Buffer.from(
          JSON.stringify(analysis ? dataset : writingTemplate, null, 2)
        )
      )

      return context.json(
        market.saveListing({
          type: "ai-service",
          name: analysis ? "City evidence analysis" : "Recommendation brief",
          description: analysis
            ? "Compare Tokyo, Seoul, and Taipei using a synthetic teaching dataset."
            : "Write a brief using supplied evidence and retain references.",
          preview: "",
          amount: analysis ? "10000" : "5000",
          content: "",
          assetId: "",
          modelId: "",
          instructions:
            "Use the selected assets. Clearly label synthetic teaching data. Cite filenames and row IDs. Do not invent factual sources.",
          requiredInputs: analysis
            ? "Cities and comparison priorities"
            : "Evidence and writing requirements",
          deliverable: analysis
            ? "A comparison table and cited recommendation"
            : "A recommendation brief up to 600 words",
          scope: analysis
            ? "Up to three cities from the supplied dataset"
            : "One brief using supplied evidence",
          assetIds: [asset.id],
        }),
        201
      )
    })
    .get("/orders", (context) => context.json(service.orders()))
}
