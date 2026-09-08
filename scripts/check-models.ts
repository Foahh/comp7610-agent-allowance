import { readConfig } from "@repo/utils/config"

import { createMarketplace } from "../apps/api/src/seller/lib/marketplace.ts"
import { checkModel } from "../apps/api/src/seller/lib/model-check.ts"
import { openSellerDatabase } from "../apps/api/src/seller/lib/store.ts"

const config = readConfig()
const store = openSellerDatabase(`${config.dataDir}/seller.sqlite`)
const market = createMarketplace(config, store)

try {
  const models = market.modelList()

  if (!models.length) {
    throw new Error("Add a model connection in Settings first.")
  }

  for (const model of models) {
    try {
      await checkModel(market.runtimeModel(model.id))
    } catch {
      throw new Error(
        "Model connection check failed. Verify the saved configuration in Settings."
      )
    }

    console.log(
      `${model.name}: streaming, tool calls, and structured output passed`
    )
  }
} finally {
  store.close()
}
