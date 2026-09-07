# Agent Allowance

A conversational assistant hires an independent specialist using a conversation-specific allowance enforced by a smart contract.

The specialist sells city analysis for **1.2 ATT** and evidence-based writing for **0.8 ATT**. Both agents require a configured model endpoint. ATT is a six-decimal demonstration token with no monetary value. The provider's bundled Tokyo, Seoul, and Taipei dataset is clearly labeled synthetic teaching data.

## Setup

Use Vite+ with Node 24 and the repository's pnpm configuration. Dependency versions belong in the workspace catalog. Chat primitives use `@shadcn/react`, class composition uses `cnfast`, and contract tests use Vitest through `vp test`.

From the repository root:

```powershell
vp install
Copy-Item .env.example .env
vp run @repo/contracts#build
```

Configure the ignored local `.env` with `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL`. The endpoint must support Chat Completions with streaming, tool calling, and structured output. Buyer and seller use these shared defaults; override them independently with `BUYER_BASE_URL`, `BUYER_API_KEY`, `BUYER_MODEL` and the corresponding `SELLER_*` settings.

Run `vp run models:check` to check both configured endpoints. This makes real API calls for streamed text, a required tool call, and a structured response. Chat reports missing model configuration instead of providing canned answers.

## Networks and wallets

| Network          | Configuration                                            | Owner wallet                                  |
| ---------------- | -------------------------------------------------------- | --------------------------------------------- |
| Local Hardhat    | `CHAIN_ID=31337`, `RPC_URL=http://127.0.0.1:8545`        | Browser wallet connected to local chain 31337 |
| Ethereum Sepolia | `CHAIN_ID=11155111`, Sepolia `RPC_URL`, test signer keys | Browser wallet connected to Sepolia           |

For local development, start the chain in one terminal:

```powershell
vp run chain
```

In another terminal, deploy once for that chain session and start the applications:

```powershell
vp run deploy:local
vp run db:migrate
vp run dev
```

Open **http://127.0.0.1:3000/** and connect a browser wallet. There is no embedded owner wallet. For local development, use a funded Hardhat account in your browser wallet. Hardhat account 1 signs buyer purchases and account 2 signs provider quotes. Backend development keys are selected only on chain 31337.

The buyer API uses port 3001 and the independent specialist uses port 3002. All application listeners bind to loopback. Deployment addresses are written to `data/deployment-<chainId>.json`.

For Sepolia:

1. Set `CHAIN_ID=11155111` and `RPC_URL` to a Sepolia endpoint.
2. Configure test-only `DEPLOYER_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, and `PROVIDER_PRIVATE_KEY`. Fund the deployer, agent, and browser wallet with Sepolia ETH.
3. Run `vp run @repo/contracts#build`, then `vp run deploy:sepolia`.
4. Start the applications and connect the browser wallet on Sepolia.

The provider signs quotes and does not need gas for those signatures. The deployment file supplies token, vault, and provider addresses; `TOKEN_ADDRESS`, `VAULT_ADDRESS`, and `PROVIDER_ADDRESS` can override them. The buyer needs the provider's address, not its signing key. Use separate process environments when separating operator credentials. The owner's private key stays in the browser wallet.

## Chat and purchases

Connect and sign the one-time wallet challenge. Conversation is available before funding; purchases require an active allowance.

Authorize **5 ATT total**, **2 ATT per purchase**, valid for 24 hours. The UI presents token approval followed by allowance creation. If the wallet needs ATT, the faucet supplies 100 ATT per claim. Gas is paid separately in test ETH.

Example request:

> Compare Tokyo, Seoul, and Taipei for an exchange semester, then prepare a recommendation brief. Spend at most 5 ATT, with a maximum of 2 ATT per purchase.

The model chooses useful services, asks for clarification when necessary, and can purchase within the wallet-confirmed allowance. Analysis and writing can be purchased independently. Writing requires supporting evidence, which can be supplied by the user or a purchased analysis.

Purchase cards show the provider, deliverable, amount, payment status, delivery status, and receipt. Saved results are available for follow-up messages. The **Budget limit** preset provides a 1 ATT allowance example; the 1.2 ATT analysis exceeds that cap.

Use **Stop future spending** to revoke an allowance, then **Withdraw unused ATT**. Revocation takes effect when mined and does not reverse earlier payments. Changing limits requires revoking the old allowance and creating another.

A real delivery failure remains visible after confirmed payment. The application does not simulate failures, automatically refund payments, or purchase a replacement.

Sepolia verification waits for two confirmations and local verification waits for one. This is a demonstration confirmation policy, not a finality guarantee. Sepolia receipts link to the transaction and show gas separately from ATT.

## Architecture and financial authority

- `apps/web`: React, TanStack Router/Query, and the existing shadcn chat primitives.
- `apps/api`: Hono wallet sessions, conversations, streaming buyer runs, and durable payment execution.
- `apps/providers`: independent Hono service with its own catalog, model prompts, asset tools, quote key, and delivery storage.
- `packages/contracts`: Hardhat 3, ATT, and the non-upgradeable allowance vault.
- `packages/schemas`: shared Valibot payloads; amounts cross JSON as integer strings.
- `packages/db`: Drizzle with Node SQLite and versioned SQL migrations.
- `packages/utils`: chain ABI and quote hashing, plus server-only configuration.

The custom provider protocol exposes capabilities, quotes, execution, and retrieval. It does not claim standardized A2A or x402 compatibility.

An EIP-712 quote binds chain, vault, allowance, service, request hash, recipient, amount, unique nonce, and expiry. Its signed digest is the purchase ID. The vault checks the designated signer, provider, expiries, revocation, per-purchase cap, cumulative budget, and replay protection. Spending updates and token transfer are atomic.

One allowance binds to one conversation. Chat cannot change contract limits. The buyer permits at most eight model steps and two new purchases per run. Models cannot access signing keys or unrestricted transaction operations.

The provider independently verifies the exact successful payment event before executing paid work. Model tools read its controlled dataset and writing template. Prompts and purchased content stay off-chain. The dataset is not live market data; payment does not establish necessity or answer quality.

## Recovery and storage

The buyer saves the exact signed transaction, nonce, and hash before broadcasting. Signer submissions are serialized. Startup reconciles pending transactions. An uncertain outcome blocks another charge and reuses the same signed bytes on retry.

Use **Refresh pending purchases** after an interrupted connection. Confirmed purchases resume or retrieve the same provider job. Completed and explicitly failed deliveries are retained.

Default files are `data/buyer-<chainId>.sqlite` and `data/provider-<chainId>.sqlite`; override them with `DATABASE_PATH` and `PROVIDER_DATABASE_PATH`. Wallet sessions expire and are owner-scoped. Browser mutations require the configured origin.

Keep one buyer process per agent signer and database. Run contract tests separately from interactive purchases against shared local accounts.

Application restarts preserve data. Hardhat restarts reset the chain: stop the apps, archive the previous local databases and deployment file, redeploy, and restart with fresh databases. Existing purchase history may contain results from earlier versions; start a new conversation when validating live-model behavior.

Numbered SQL files in `packages/db/migrations` are applied at startup and by `vp run db:migrate`. If using `db:generate`, review the SQL and add the intended changes as a new numbered runtime migration.

## Validation

With the local chain running:

```powershell
vp check
vp run @repo/contracts#build
vp test
vp run test:contracts
vp run -r build
vp exec react-doctor apps/web --verbose --scope changed
```

The retained automated suite contains smart-contract tests for payment boundaries, unauthorized callers and providers, modified signatures, expiry, replay, competing prechecks, revocation, withdrawal, and failed-transfer rollback.

Application mock tests and browser automation have been removed. Live endpoint compatibility, the browser-wallet journey, and Sepolia purchases and rejection/revocation demonstrations still require manual verification with configured resources.
