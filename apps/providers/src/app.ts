import { randomBytes } from "node:crypto"
import { Hono } from "hono"
import { sValidator as validator } from "@hono/standard-validator"
import { decodeEventLog, recoverMessageAddress, type Hex } from "viem"
import * as v from "valibot"
import type { Store } from "@repo/db"
import {
  TaskSchema,
  AmountSchema,
  type SignedQuote,
  type Delivery,
} from "@repo/schemas"
import {
  publicClient,
  quoteTypedData,
  quoteId,
  serviceHash,
  taskHash,
  vaultAbi,
  quoteMessage,
} from "@repo/utils"
import { signer, type Config } from "@repo/utils/config"
import { catalog } from "./catalog.ts"
import { executeTask, interpretTask } from "./specialist.ts"

export function createProviderApp(config: Config, store: Store) {
  const router = new Hono()
  const client = publicClient(config.chainId, config.rpcUrl)
  const account = signer("provider", config.chainId)
  const running = new Map<string, Promise<Delivery>>()

  router.onError((error, context) =>
    context.json({ error: error.message }, 400)
  )
  const health = router.get("/health", (context) =>
    context.json({ status: "ok", service: "providers" })
  )
  const capabilities = health.get("/capabilities", (context) =>
    context.json({
      name: "Exchange Evidence Specialist",
      provider: account.address,
      services: catalog,
    })
  )
  const quotes = capabilities.post(
    "/quotes",
    validator(
      "json",
      v.object({
        allowanceId: AmountSchema,
        task: TaskSchema,
      })
    ),
    async (context) => {
      const { allowanceId, task } = context.req.valid("json")
      const interpretation = await interpretTask(task)
      if ("clarification" in interpretation) {
        return context.json(interpretation)
      }

      const service = catalog.find((offer) => offer.id === task.service)!
      const block = await client.getBlock()
      const quote = {
        allowanceId,
        service: serviceHash(task.service),
        requestHash: taskHash(task),
        recipient: account.address,
        amount: service.amount,
        nonce: ("0x" + randomBytes(32).toString("hex")) as Hex,
        expiresAt: (block.timestamp + 600n).toString(),
      }
      const offer: SignedQuote = {
        id: quoteId(quote, config.chainId, config.vault),
        quote,
        task,
        deliverable: interpretation.deliverable,
        signature: await account.signTypedData(
          quoteTypedData(quote, config.chainId, config.vault)
        ),
      }
      store.put("quotes", offer.id, allowanceId, offer)
      return context.json({ offer })
    }
  )

  async function authorize(id: string, signature?: string) {
    const offer = store.get<SignedQuote>("quotes", id)
    if (!offer || !signature) {
      throw new Error("Unknown quote or missing agent signature.")
    }
    const allowance = await client.readContract({
      address: config.vault,
      abi: vaultAbi,
      functionName: "allowances",
      args: [BigInt(offer.quote.allowanceId)],
    })
    const recovered = await recoverMessageAddress({
      message: "AgentAllowance delivery " + id,
      signature: signature as Hex,
    })
    if (recovered.toLowerCase() !== allowance[1].toLowerCase()) {
      throw new Error("Only the authorized buyer can retrieve this task.")
    }
    return offer
  }

  async function deliver(offer: SignedQuote, txHash: Hex): Promise<Delivery> {
    const started = performance.now()
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      confirmations: config.confirmations,
      timeout: 45000,
    })
    if (receipt.status !== "success") {
      throw new Error("Payment transaction reverted.")
    }
    const matching = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== config.vault.toLowerCase()) {
        return false
      }
      try {
        const event = decodeEventLog({
          abi: vaultAbi,
          data: log.data,
          topics: log.topics,
          eventName: "Purchased",
        })
        const expected = quoteMessage(offer.quote)
        return (
          event.args.purchaseId === offer.id &&
          event.args.allowanceId === expected.allowanceId &&
          event.args.recipient.toLowerCase() ===
            expected.recipient.toLowerCase() &&
          event.args.amount === expected.amount &&
          event.args.requestHash === expected.requestHash &&
          event.args.service === expected.service
        )
      } catch {
        return false
      }
    })
    if (!matching) {
      throw new Error("Transaction does not pay this exact quote.")
    }

    const existing = store.get<Delivery>("jobs", offer.id)
    if (existing?.status === "completed" || existing?.status === "failed") {
      return existing
    }
    const job: Delivery = {
      purchaseId: offer.id,
      status: "running",
      content: "",
      references: [],
      modelMs: 0,
      deliveryMs: 0,
    }
    store.put("jobs", offer.id, offer.quote.allowanceId, job)
    const modelStarted = performance.now()
    try {
      job.content = await executeTask(offer.task)
      job.status = "completed"
      job.references = [
        ...new Set(
          job.content.match(/exchange-cities-synthetic-v1|\[[^\]\n]+\]/g) || []
        ),
      ]
    } catch (error) {
      job.status = "failed"
      job.error =
        error instanceof Error ? error.message : "Provider execution failed."
    }
    job.modelMs = performance.now() - modelStarted
    job.deliveryMs = performance.now() - started
    store.put("jobs", offer.id, offer.quote.allowanceId, job)
    return job
  }

  const tasks = quotes.post(
    "/tasks/:id",
    validator(
      "json",
      v.object({
        txHash: v.pipe(v.string(), v.regex(/^0x[0-9a-fA-F]{64}$/)),
      })
    ),
    async (context) => {
      const id = context.req.param("id")
      const offer = await authorize(id, context.req.header("x-agent-signature"))
      let promise = running.get(id)
      if (!promise) {
        promise = deliver(offer, context.req.valid("json").txHash as Hex)
        running.set(id, promise)
      }
      try {
        return context.json(await promise)
      } finally {
        running.delete(id)
      }
    }
  )

  return tasks.get("/tasks/:id", async (context) => {
    const id = context.req.param("id")
    await authorize(id, context.req.header("x-agent-signature"))
    return context.json(
      store.get<Delivery>("jobs", id) ?? { status: "pending" }
    )
  })
}
