# Architecture and security model

- `apps/web`: React, TanStack Router/Query, and the existing shadcn chat primitives.
- `apps/api`: Hono wallet sessions, conversations, streaming buyer runs, and durable payment execution.
- `apps/providers`: independent Hono service with its own catalog, model prompts, asset tools, quote key, and delivery storage.
- `packages/contracts`: Hardhat 3, ATT, and the non-upgradeable allowance vault.
- `packages/schemas`: shared Valibot payloads; amounts cross JSON as integer strings.
- `packages/db`: Drizzle with Node SQLite, explicit relational tables, foreign keys, and indexed queries. The package exports the connection factory and table definitions.
- `packages/utils`: chain ABI and quote hashing, plus server-only configuration.

The custom provider protocol exposes capabilities, quotes, execution, and retrieval. It does not claim standardized A2A or x402 compatibility.

An EIP-712 quote binds chain, vault, allowance, service, request hash, recipient, amount, unique nonce, and expiry. Its signed digest is the purchase ID. The vault checks the designated signer, provider, expiries, revocation, per-purchase cap, cumulative budget, and replay protection. Spending updates and token transfer are atomic.

One allowance binds to one conversation. Chat cannot change contract limits. The buyer permits at most eight model steps and two new purchases per run. Models cannot access signing keys or unrestricted transaction operations.

The provider independently verifies the exact successful payment event before executing paid work. Model tools read its controlled dataset and writing template. Prompts and purchased content stay off-chain. The dataset is not live market data; payment does not establish necessity or answer quality.
