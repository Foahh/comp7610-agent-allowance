# Mandate research brief

Working title: **Mandate: Evaluating Delegated Spending Controls for AI Purchasing Agents**

Prepared for COMP7610 on 14 September 2026. This is a working research package for the team, not a completed submission or a claim of previously unknown security mechanisms.

## Decision and contribution

Keep the existing implementation and pause product features. Investigate this question:

**Under a compromised delegated signing key, which spending policies does Mandate enforce beyond an equally funded agent wallet, and what financial exposure remains?**

Proposed course contribution: a concrete purchasing-system design combining conversation allowances, seller-signed work quotes, buyer authorization, and off-chain delivery, accompanied by a reproducible evaluation of its enforcement boundaries. The evaluation includes adverse results and a comparison of shared versus separate delegated signers. The primitives themselves are established. We have not established that their combination is novel.

The assignment allows proposing a system or improving an existing one. An evaluation alone may not satisfy the instructor's interpretation of research. Before committing the final title, ask: “We have built a quote-bound AI purchasing system and are evaluating policy enforcement and residual loss under delegated-key compromise, including shared versus separate signer configurations. Does this systems-design and evaluation contribution meet the research-project requirement?”

## Closest prior work

| Source                                                                                                                                     | What the source establishes                                                                       | Implication for our claim                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [Safe: AI agent with a spending limit](https://docs.safe.global/home/ai-agent-quickstarts/agent-with-spending-limit)                       | Safe documents giving an AI agent a token allowance, including one-time and recurring allowances. | Do not claim to invent on-chain AI-agent allowances. Safe is a close design reference, not a system we benchmarked.                     |
| [MetaMask: ERC-20 token permissions](https://docs.metamask.io/smart-accounts-kit/guides/advanced-permissions/use-permissions/erc20-token/) | The documentation describes fixed, periodic, and streaming delegated token permissions.           | Bounded delegated authority is established. Our contract has a per-purchase cap, not a periodic refill mechanism.                       |
| [Coinbase: Policy Engine](https://docs.cdp.coinbase.com/wallets/security-and-policies/policy-engine/overview)                              | Wallet signing operations can be accepted or rejected using configured transaction rules.         | Independent signing-layer enforcement is a serious alternative. It is not equivalent to a wallet whose raw signing key has escaped.     |
| [Debenedetti et al.: AgentDojo](https://arxiv.org/abs/2406.13352)                                                                          | A research framework evaluates tool-using agents under prompt injection.                          | Distinguish agent behavior from downstream financial enforcement. We have not run AgentDojo or measured prompt-injection success rates. |

These are a focused starting set of primary sources, checked on 14 September 2026, not an exhaustive literature review. One teammate should read them and trace relevant references before the report. No performance or security superiority over Safe, MetaMask, or Coinbase has been measured.

## System and threat model

The owner funds an ERC-20 vault allowance with a budget, per-purchase limit, seller allowlist, expiry, and delegated buyer signer. A seller signs a quote committing to an allowance, recipient, amount, service hash, request hash, nonce, and expiry. The buyer signs authorization for that quote. Any relayer can submit the two signatures. The contract validates the policy and transfers tokens. Delivery is an off-chain step after payment.

The tested attacker controls the delegated buyer signing key and can call the contract directly, bypassing the application. In relevant cases the attacker also has cooperation from an approved seller that signs fresh quotes. This is a deliberate adverse assumption, not evidence that an honest seller would issue duplicate or malicious offers. The owner key, deployed contract, EVM, and standard test token are trusted. Gas is supplied by the local test accounts. Live seller discovery, LLM behavior, files, and actual fulfillment are outside this experiment.

| Attacker capability                                                   | What the current evidence covers                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Manipulates the model but can only invoke validated application tools | Not evaluated here; backend validation may already be sufficient for some policies.   |
| Possesses one delegated buyer key                                     | Main experiment: independent contract checks still run.                               |
| Possesses that key and cooperates with an approved seller             | Residual-loss and fresh-quote experiments.                                            |
| Compromises the entire host or owner wallet                           | Outside scope. Separate keys on the same compromised host need not provide isolation. |

A useful analytical bound, under these assumptions, is:

`maximum token exposure for key k <= sum of remaining budgets in active allowances authorizing k`

Remaining budget is `budget - spent - withdrawn`. The sum is over allowances in the tested vault and token; additional vaults or assets would require extending it. Sufficient valid seller quotes and time before expiry can make this bound achievable. A per-purchase cap does not impose a cumulative rate limit: many individually permitted transactions can consume the whole allowance. Revocation protects transactions ordered after it takes effect; it cannot undo earlier payments or guarantee winning a mempool race.

## Method

Use the production contract source without modification. Compile with Solidity 0.8.30 and the production optimizer setting of 200 runs. Execute on an isolated Hardhat local EVM, using synthetic accounts and a six-decimal test token. One wallet or allowance receives 5 tokens, and the Mandate per-purchase cap is 2 tokens. The baseline is a directly controlled EOA funded with the same 5 tokens. Both therefore have the same initial aggregate token limit.

For each paired scenario, execute the EOA transfers, restore an EVM snapshot, then execute the equivalent Mandate purchase sequence. Recipient balances start from the same state. The baseline is an intentionally simple prefunded wallet, not a reproduction of a commercial wallet or a separate secure signing service. Expiry and owner-controlled revocation are not native EOA features; the direct key holder can ignore an application's instruction to stop.

Assertions check decoded EVM revert reasons and actual balance/accounting changes. Successful operations are mined local transactions. Rejected operations revert during EVM simulation before submission; they are not measured failed on-chain transactions. Each scenario has one deterministic execution. Counts describe test cases, not statistical attack success rates.

## Measured results

The original 61 tests passed after resolving compiler setup. The research harness adds 10 passing tests and records 17 system/scenario observations in [results.json](results.json). The final combined run passed all 71 tests in 15 files. `vp check` also passed formatting, lint, and type checks. Source commit: `90cf3913801bbdbd67ff35b9d787d9ea814e9f0d`. The JSON records source hashes and environment details.

| Attempt, with initial budget 5 and cap 2        | Prefunded EOA                                              | Mandate                                  |
| ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| Legitimate payment of 1                         | Spends 1                                                   | Spends 1                                 |
| One payment of 3                                | Spends 3                                                   | Rejects; spends 0                        |
| Pay unapproved recipient 1                      | Spends 1                                                   | Rejects; spends 0                        |
| Payments of 2, 2, 1, then 1                     | Spends 5; final transfer rejected for insufficient balance | Spends 5; final quote rejected by policy |
| Payment after owner revocation has taken effect | Direct key still spends 1; no native revocation            | Rejects; spends 0                        |
| Payment after allowance expiry                  | Direct key still spends 1; no native expiry                | Rejects; spends 0                        |
| Unwanted approved purchases of 2, 2, 1          | Spends all 5                                               | Spends all 5                             |

Three additional contract-focused tests establish narrower boundaries:

- Reusing the exact signed quote is rejected. A newly signed quote with the same service and request hash but a fresh nonce is accepted. Thus cryptographic replay protection is not semantic purchase deduplication. The application's honest-seller/request handling can impose additional constraints; this test deliberately bypasses it.
- With two 5-token allowances sharing the compromised buyer key, the attacker spends 10 tokens through policy-compliant purchases.
- With distinct buyer signers for those allowances, the same single compromised key spends 5 tokens and fails authorization for the other allowance. This is a configuration comparison supported by the contract; it is not a completed change to the application's key management.

The application stores `buyer.key` per account/deployment credential directory, as shown in [config.ts](../packages/utils/src/config.ts) and [installation.ts](../apps/api/src/installation.ts). Consequently, describing current conversation allowances as separate key-compromise boundaries would be misleading. The test compares that shared-signer pattern with an alternative contract configuration.

### Cost samples

| Local operation                              | Gas used in this run |
| -------------------------------------------- | -------------------: |
| First 1-token EOA transfer to the seller     |               51,543 |
| First 1-token Mandate purchase to the seller |              161,499 |
| Create an allowance with one approved seller |              280,968 |

These are execution samples, not averages or estimates of fiat prices. Deployment and token approval costs are excluded. Signature bytes, storage state, compiler settings, and chain rules affect gas. No public-network confirmation latency, throughput, or model-call latency was measured. Later purchases can use different gas because storage state changes. Do not present the ratio as a general platform benchmark.

## What we can conclude

Mandate enforces recipient, per-purchase, expiry, and revocation policies independently of a compromised delegated buyer key in these tested cases. An equally funded EOA also bounds total token loss by its balance. Mandate's additional value is the finer policy and authorization structure; the experiment does not show that a smart contract is necessary for any aggregate budget limit.

Spending controls constrain authority, but the tested contract does not determine whether the work is useful. Policy-compliant loss can equal the whole budget, fresh signed quotes can repeat identical work, and a shared signer can expose multiple conversation budgets. Signer isolation reduces exposure only under a correspondingly narrower compromise assumption.

Do not claim a new vulnerability, complete security, prevention of prompt injection, guaranteed delivery, or superiority over established delegated-wallet systems. Present the system design, measured enforcement boundaries, and residual-risk analysis as the contribution under discussion with the instructor.

## Reproduce

From the repository root:

```bash
vp install --frozen-lockfile
vp run @repo/contracts#build
vp check
vp test
MANDATE_RESEARCH_OUTPUT=research/results.json vp test packages/contracts/test/research.test.ts
```

The last command is Bash syntax; on PowerShell set `$env:MANDATE_RESEARCH_OUTPUT = "research/results.json"` before running the test command. Normal test runs do not overwrite the research results. Check `complete: true` and a successful test exit status before using regenerated output. Gas samples can vary with chain timestamps/signatures; policy outcomes should match. Update the brief if measured numbers change.

The earlier compiler failure was an environment download problem, not a contract test failure. For this run, official Linux and WASM 0.8.30 binaries were downloaded through the configured network proxy from `https://binaries.soliditylang.org/`, their SHA-256 values checked against the official manifests, and placed in Hardhat's compiler cache. No compiler checks, contract logic, or test assertions were disabled.

## Two-day plan

Assume four people and an 8-minute talk plus 2 minutes for questions, within the required 10 minutes. Presentation dates in the supplied brief are September 17–18; the report deadline is October 4 at 23:59, with a maximum of six PDF pages. Confirm your assigned presentation slot.

| Owner                           | First day                                                                                            | Second day                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A: question and literature      | Read the four sources; state the closest overlap; ask instructor about the proposed contribution.    | Tighten related-work claims and prepare answers about novelty and why blockchain.       |
| B: system and threat model      | Trace allowance creation, quote signatures, payment, and key scope; draw one architecture figure.    | Explain the security boundary and check every technical claim in the slides.            |
| C: experiments                  | Reproduce the tests on a second machine; check JSON, gas units, and assumptions.                     | Capture a short local demonstration and keep a backup recording and result table.       |
| D: presentation and integration | Build six slides using [presentation.md](presentation.md); insert source links and measured results. | Run two timed rehearsals; reserve two minutes for questions; remove unsupported claims. |

Shared checkpoints: agree the question in the first hour; freeze the experiment scope halfway through day one; assemble the complete talk by the end of day one; spend day two on reproduction, explanation, and rehearsal. If compiler setup fails on another machine, use the recorded results transparently while troubleshooting; never relabel them as locally reproduced.

For the October report, reserve roughly 0.5 pages for motivation, 1 for related work and threat model, 1 for design, 1.5 for method/results, 1 for limitations/conclusion, and 1 for references. Treat references as included in the six-page cap unless the instructor says otherwise. The two-day milestone is a credible presentation and evidence package, with remaining literature and report refinement scheduled afterward.
