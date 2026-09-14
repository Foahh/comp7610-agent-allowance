# Eight-minute presentation outline

Title: **Mandate: Evaluating Delegated Spending Controls for AI Purchasing Agents**

Use six slides and reserve two of the allotted ten minutes for Q&A. This is slide content and speaker guidance, not a finished slide deck. Keep the numerical claims tied to `results.json`.

## 1. Problem and question — 0:00–1:00

On slide:

- An AI buyer needs payment authority to act for a user.
- A delegated key may be compromised independently of the owner's wallet.
- Question: Which policies remain enforceable, and how much can still be lost?

Say: “We study what happens after a delegated signing key is compromised. We compare our purchasing system with an agent wallet funded with exactly the same amount.”

## 2. Design and closest work — 1:00–2:30

On slide:

- Owner chooses budget, per-purchase cap, approved sellers, and expiry.
- Seller quote plus buyer authorization leads to a contract-validated payment.
- AI decisions and delivery remain off-chain.
- Existing foundations: Safe allowances, MetaMask delegated permissions, Coinbase signing policies.

Use one diagram showing the owner, agent signer, seller, and contract, with the enforced policy at the contract. Put the literature links from the brief in the slide notes. Do not imply all vendors use the same enforcement architecture.

Say: “Allowances are established technology. Our proposed contribution is this concrete quote-bound purchasing system and an evaluation of the limits of its controls.”

## 3. Experimental design — 2:30–3:45

On slide:

- Equal funding: 5 test tokens; Mandate purchase cap: 2.
- Local EVM, production contract source, Solidity 0.8.30.
- Attacker holds the buyer key; approved seller cooperates in adverse cases.
- Seven paired scenarios plus three contract-focused tests.

Say: “We bypass application checks to isolate the contract boundary. This is a controlled transaction experiment, not a measurement of how often an LLM can be manipulated. The baseline already limits total loss to five tokens.”

## 4. Which controls survive? — 3:45–5:15

On slide:

| Attempt                                    | Prefunded wallet | Mandate  |
| ------------------------------------------ | ---------------- | -------- |
| Spend 3 with policy cap 2                  | Succeeds         | Rejected |
| Send to an unapproved recipient            | Succeeds         | Rejected |
| Spend after confirmed revocation or expiry | Succeeds         | Rejected |
| Exceed total funding of 5                  | Rejected         | Rejected |

Show a screenshot or brief recording of one rejected transaction and the unchanged spending balance. Use a recording if a live network would put the talk at risk. Label the environment as local.

Say: “The strongest benefit here is the survival of finer-grained restrictions after key compromise. Both systems cap aggregate loss when they receive the same initial funding.”

## 5. What still goes wrong? — 5:15–6:45

On slide:

- Unwanted but permitted purchases consume all 5 tokens.
- Exact quote replay fails; fresh quotes can repeat identical work.
- One shared key across two allowances exposes 10 tokens.
- Separate keys expose 5 in the single-key compromise test.

Say: “A valid payment is not necessarily a useful purchase. Also, conversation budgets are accounting boundaries; they do not automatically isolate signing-key compromise. We tested the separate-key alternative at the contract configuration level, but have not migrated the application's signer management.”

## 6. Cost, limitations, and contribution — 6:45–8:00

On slide:

- First-payment gas sample: 51,543 EOA versus 161,499 Mandate.
- Additional setup and policy complexity; no delivery-quality guarantee.
- No measured LLM attack success rate or public-network latency.
- Contribution under evaluation: system design, reproducible boundary tests, residual-loss analysis.

Say: “The experiment supports precise enforcement claims. It does not show immunity to prompt injection or eliminate all financial loss. The results motivate separating delegated keys and distinguishing budget safety from purchase usefulness.”

## Questions to rehearse

**Why not just fund a separate wallet with five tokens?**

That already bounds total token loss to five. Our measured added controls are approved recipients, individual payment caps, expiry, owner-controlled revocation after confirmation, and quote-specific authorization.

**Why not use Safe or MetaMask?**

They are close prior work and potential production foundations. We do not claim our allowance mechanism is new or benchmark our implementation against theirs. Our work studies a specific purchasing-system design and its boundaries.

**Is this novel enough?**

The instructor should confirm that the proposed system plus empirical evaluation satisfies the course requirement. The primitives are not novel. We must not replace that gap with a stronger title or claim of a new vulnerability.

**Does it prevent prompt injection?**

We have not evaluated prompt-injection susceptibility. Even a fully controlled agent cannot bypass the tested contract policies, but can request unwanted purchases permitted by them.

**Are separate keys sufficient?**

Only for the narrower case of one exposed key. If the attacker compromises the host and obtains every key, separation alone is insufficient. The current application reuses a buyer signer within an account/deployment.

**Are the outcomes just expected contract behavior?**

Several are. Their purpose is to establish the mechanism's boundary. The study also checks a fair funded-wallet baseline, policy-compliant loss, semantic duplicates, and the effect of signer sharing. We make no claim that routine invariant tests alone establish research novelty.

**What remains before the report?**

Confirm the contribution with the instructor, deepen the literature comparison, reproduce the results on another machine, and explain limitations. An actual LLM experiment or additional security mechanism is optional follow-up work only if time and the agreed research question justify it.
