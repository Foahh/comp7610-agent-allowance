# Agent Allowance

A demo where a buyer agent purchases specialist work with a per-conversation allowance enforced by a smart contract. ATT is a six-decimal teaching token with no monetary value; the included city data is synthetic.

## Run locally

Use Node 24. In one terminal:

```powershell
vp install
Copy-Item .env.example .env
vp run @repo/contracts#build
vp run chain
```

In another terminal:

```powershell
vp run deploy:local
vp run db:migrate
vp run dev
```

Open http://127.0.0.1:3000/ and connect a funded Hardhat browser wallet to chain `31337`. The buyer and provider APIs run on ports `3001` and `3002`.

## Configure AI

Add `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL` to `.env`. The configured endpoint must support streaming Chat Completions, tool calling, and structured output.

Use `BUYER_*` or `SELLER_*` versions of these variables to override either agent. Check both configurations with:

```powershell
vp run models:check
```

## Sepolia

Set `CHAIN_ID=11155111`, provide a Sepolia `RPC_URL`, configure the test signer keys in `.env`, fund the required wallets with Sepolia ETH, then run:

```powershell
vp run @repo/contracts#build
vp run deploy:sepolia
vp run db:migrate
vp run dev
```

Connect the browser wallet to Sepolia. The owner key stays in that wallet; the provider only signs quotes and needs no gas for them.

## Validate

With the local chain running:

```powershell
vp check
vp run @repo/contracts#build
vp test
vp run test:contracts
vp run -r build
vp exec react-doctor apps/web --verbose --scope changed
```

## More documentation

- [Using the application](docs/using-the-application.md)
- [Architecture and security model](docs/architecture-and-security.md)
- [Operations and recovery](docs/operations-and-recovery.md)
