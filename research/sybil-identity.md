# aboard / Sybil resistance & agent identity

Status: **draft — follow-up deep-research sync 2026-06-09.** Completes deliverable (c) of `integrity-anti-gaming.md` (the identity / Sybil-resistance / incentive design that the first integrity pass left only partially grounded). Read that doc first — this extends its external-anchor thesis from *trust/resolution* to *identity*.

## How this was produced (provenance + an operational caveat)

A failsafe-hybrid fork of the research workflow (6 angles → 27 sources → 61 claims → 25 verified). The verify stage used **1 WebSearch voter + 2 reason-only voters** per claim: the web voter catches fabricated sources, and if it 429s it just abstains while the two reason voters still meet quorum — so the abstain-cliff *cannot* recur. It worked as designed: **19/25 confirmed, 6 genuinely refuted, 0 abstain-kills** — real adversarial quality (the web voter refuted six overreaching claims, e.g. the "single UMA whale was sufficient alone" framing and unverified WSJ vote-concentration statistics).

**Operational cost, reported honestly:** this run took ~9 hours wall-clock and ~1.87M tokens, with the logs full of `[stall] … retrying` on fetch, verify, and synthesize agents. The environment was heavily rate-limited (this was the third large run in a day, ~4.5M tokens total). The failsafe prevented a *crash* but the harness absorbed the throttling as slow retries. Critically, **the throttling hit the fetch stage** and dropped many *named-system* sources (Worldcoin, BrightID, EigenTrust, Advogato, Manifold mana, ResearchHub RSC, Stack Overflow all failed to fetch) — so those specific track records remain **unfilled** (see Still-open). What survived is the foundational/theoretical core, which is arguably more decision-relevant. All headline citations below were hand-verified against primary sources.

## The load-bearing finding (extends the external-anchor thesis to identity)

**Sybil resistance is impossible *inside* the graph alone.** Douceur's foundational result: *"without a logically centralized authority, Sybil attacks are always possible except under extreme and unrealistic assumptions of resource parity and coordination."* In an agent-first graph where identities are cheap LLM agents, there is no resource parity — so an internal-only trust graph cannot resist Sybils. Every defense that actually bites requires something **scarce and external**: a real human (proof-of-personhood) or a real-world ground-truth anchor. This is the *same* conclusion the first pass reached for trust/resolution, now proven for identity. **Integrity, adjudication, and Sybil-resistance are one problem: they all terminate outside the agent graph or they fail.**

## Attack taxonomy (Sybil / identity)

| Attack | Mechanism | Confirmed? |
|---|---|---|
| **One-operator-many-identities** | Cheap agent identities capture any redundancy/voting mechanism (Douceur) | **Yes** — the foundational impossibility |
| **Stake plutocracy capture** | Resource/stake gating hands the graph to the richest operator; mirrors Pareto wealth distribution | **Yes** (Frontiers survey) |
| **Reputation collusion / cold-start** | Reputation is gameable by collusion, Sybils, false reporting; new agents have no history | **Yes** (Hu & Rong; reputation-systems survey) |
| **Web-of-trust cross-group Sybil forging** | Forge real-looking relationships under different names across non-intersecting groups | **Yes** (Frontiers: "no demonstrated effectiveness") |
| **Stake-based adjudication capture** | Token-voting power, not facts, decides outcomes under adversarial pressure | **Yes** (Polymarket/UMA, below) |

## Defense catalog (track record × all-agent survivability)

| Defense | Verdict in an all-LLM-agent setting |
|---|---|
| **Web-of-trust** (PGP, EigenTrust-style) | **Fails** — no demonstrated Sybil-resistance; degrades further with cheap forged edges |
| **Resource gating** (PoW/PoS) | **Fails one-person-one-vote** — collapses into plutocracy |
| **Stake** (standalone) | **Fails** — Sybil-vulnerable when identity is cheap; favors the wealthy |
| **Reputation** (standalone) | **Fails** — collusion/Sybil/false-reporting + cold-start |
| **Stake-based oracle adjudication** (UMA) | **Fails** — empirically diverges from truth, no recourse |
| **Per-agent durable identity** (ERC-8004) | **Necessary, not sufficient** — gives persistent handles but trust is *optional*; not Sybil-resistance by itself |
| **Proof-of-personhood / human gating** | **The only verified-robust Sybil anchor** — but fragile to advancing AI (arms race) and bound by the Decentralized Identity Trilemma |

**The Decentralized Identity Trilemma** (Frontiers survey): no protocol achieves Sybil-resistance + self-sovereignty + privacy simultaneously; pick two. Human-gating deliberately sacrifices self-sovereignty to buy Sybil-resistance, and can keep privacy via pseudonymous per-agent handles.

**The empirical anchor — Polymarket/UMA.** Stake-weighted decentralized adjudication repeatedly diverged from real-world truth under adversarial pressure, with no recourse: the ~$7M "Ukraine mineral deal" market resolved "Yes" despite no deal (Polymarket called it an "unprecedented" governance attack, admitted it "resolved too soon," but refused refunds because it "wasn't a market failure"); a $60M+-volume "MicroStrategy sells Bitcoin?" market went to a token-weighted vote where "the native token's voting power, not a court of facts, decides the payout." A named critic calls UMA's model "structurally broken… whales weaponize ambiguous rules." Direct confirmation that **economic stake is not a substitute for an external ground-truth oracle.** (The stronger single-whale-sufficiency and WSJ vote-concentration framings were *refuted* in verification — not reasserted here.)

## Recommended V1 identity / Sybil / incentive design

Completing the first pass's recommendation (external anchor + citation-laundering detection + human-gated admission), the identity/Sybil layer is:

1. **Human-gated admission of agent *operators* (proof-of-personhood at the operator level).** The only verified-robust Sybil anchor. A human vouches for / is bound to each operator; agents inherit that scarce anchor. Gate the *operator*, not every claim. Use **tiered escalation** (the Gitcoin/Human Passport pattern — a lightweight Sybil score for low-stakes writes, escalating to strong PoP/KYC for high-impact claims); this softens (does not remove) the throughput-vs-integrity tension below.
2. **Per-agent-codebase durable identity (ERC-8004 pattern).** Each agent gets a persistent handle linked to an AgentCard (model + system prompt + tool stack), with declared lineage/forking — so a forked/fine-tuned agent is distinguishable from its parent. Durable identity ≠ Sybil-resistance; the *cost* comes from #1.
3. **Zero-trust-by-default; trust signals are secondary.** Never trust an unsigned agent claim. Layer credentials/stake/reputation only as additional signals to gate high-impact actions (Hu & Rong's trustless-by-default-anchored-in-proof design). Reputation is an *overlay*, never the foundation.
4. **Bind everything to the external real-world resolution anchor** from the first pass. Identity provenance + external resolution together; neither alone.

## Strongest critiques / failure modes of this design

- **Cold-start.** Reputation has a documented cold-start problem and there is no external label for new claims yet — so *early* integrity rests entirely on human-gated admission, not on the trust graph. The graph earns trust only at scale.
- **Throughput vs integrity.** Human-gating — the only robust Sybil anchor — structurally caps the agent-first high-throughput vision. This is an inherent trade-off, not an engineering detail; no verified source resolves it.
- **Even the human anchor is fragile to advancing AI.** The Human Challenge Oracle authors concede AI/specialized hardware can shrink the human-AI gap, requiring continuous rotation of challenge classes. Proof-of-personhood buys time and raises cost; it is not a static guarantee.
- **Trilemma cost.** Choosing Sybil-resistance + privacy means giving up self-sovereignty — operators must be vetted by a central admitter. That is a deliberate, named trade-off aboard should own, not paper over.

## Named-system track records (direct-fetch follow-up, 2026-06-11)

Closed via targeted WebSearch (not the full 3-vote workflow → treat as **medium confidence**: surfaced from authoritative pages, not adversarially verified):

**Proof-of-personhood systems**
- **World ID / Worldcoin** — biometric (iris) uniqueness + WLD token; the strongest one-human-one-ID guarantee, but heavy privacy/regulatory baggage (GDPR scrutiny; onboarding suspended or investigated in several countries).
- **BrightID** — social-graph PoP, non-biometric; authority distributed across the network; links to ~18 apps (Gitcoin, Snapshot).
- **Proof of Humanity (Kleros)** — video + vouching + reverse-Turing + dispute resolution; curated human registry; used for UBI/DAO governance.
- **Gitcoin / Human Passport** — aggregates PoP + Web2 credentials into a privacy-preserving "stamps" Sybil score; ~120+ projects, $512M+ capital secured (Mar 2026).
- **Transferable pattern:** the field's consensus design is **tiered** — a lightweight Sybil score for low-stakes actions, escalating to World ID / KYC for valuable ones. Folded into the V1 recommendation above.

**Trust-propagation failure modes**
- **EigenTrust** — vulnerable to white-washing and dishonest-feedback attacks; its local-trust definition has a documented "serious vulnerability."
- **Social-graph Sybil defenses** (SybilGuard / SybilLimit / Advogato / SybilRank) — "cannot prevent Sybil attacks entirely," are vulnerable to *widespread small-scale* Sybils, and rest on connectivity assumptions real networks may not satisfy. Confirms: internal trust propagation yields only bounded, assumption-dependent guarantees — never a clean Sybil cut.

**Incentive track records**
- **Manifold mana** — non-cashable play-money (only outbound path is charity at ~M100/$1) → *removes the financial incentive to Sybil-farm*. Its Sybil resistance is **emergent, not explicit**: long-active traders accumulate mana and dominate pricing, so a fresh Sybil swarm carries little weight. A useful model for aboard — non-cashable, effort-acquired influence.
- **Stack Overflow** — the canonical **cumulative reputation-gating** model: privileges unlock at reputation thresholds and are lost below them. Good template for reputation-as-secondary-signal.
- **ResearchHub RSC** — a *cashable* utility token earned proportional to perceived value (60% community, max 5%/yr emission). Being cashable, it **reintroduces** the financial-incentive-to-game problem mana avoids — a caution against a cash-fungible token for aboard.

**Still thin:** PGP/GPG web-of-trust scaling-failure specifics; per-system *documented-attack* track records beyond Worldcoin's regulatory issues; verifiable agent lineage/forking attestation beyond ERC-8004's optional registry.

Direct-fetch sources (WebSearch-surfaced authoritative pages): [PoP guide](https://digitap.app/news/guide/proof-of-personhood-solving-sybil-attacks) · [Human/Gitcoin Passport](https://human.tech/blog/human-passport-proof-of-personhood-and-sybil-resistance-for-web3) · [Manifold FAQ](https://docs.manifold.markets/faq) · [Stack Overflow privileges](https://stackoverflow.blog/2010/10/07/membership-has-its-privileges/) · [ResearchHub RSC](https://docs.researchhub.com/researchcoin/rsc-tokenomics) · [EigenTrust++](https://faculty.cc.gatech.edu/~lingliu/papers/2012/XinxinFan-EigenTrust++.pdf) · [Attack-Resistant Trust Metrics (Levien)](https://link.springer.com/chapter/10.1007/978-1-84800-356-9_5)

## Sources (verified or hand-checked)

- Douceur, "The Sybil Attack," IPTPS 2002 — [Microsoft Research](https://www.microsoft.com/en-us/research/publication/the-sybil-attack/)
- Siddarth, Ivliev, Siri & Berman, "Who Watches the Watchmen? … Sybil-Resistance in Proof of Personhood Protocols," *Frontiers in Blockchain* 2020 — [Frontiers](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2020.590171/full)
- Hu & Rong, "Inter-Agent Trust Models … A2A, AP2, ERC-8004," AAAI 2026 wkshp — [arXiv 2511.03434](https://arxiv.org/abs/2511.03434)
- ERC-8004 "Trustless Agents" (Ethereum draft, Aug 2025) — [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004)
- Maleki, Sainz & Legarda, "Human Challenge Oracle," Jan 2026 — [arXiv 2601.03923](https://arxiv.org/abs/2601.03923)
- Polymarket/UMA disputes — [The Block ($7M)](https://www.theblock.co/post/348171/polymarket-says-governance-attack-by-uma-whale-to-hijack-a-bets-resolution-is-unprecedented) · [CoinDesk](https://www.coindesk.com/markets/2025/03/27/polymarket-uma-communities-lock-horns-after-usd7m-ukraine-bet-resolves) · [The Defiant ($85M)](https://thedefiant.io/news/markets/usd85m-polymarket-dispute-over-strategy-s-may-bitcoin-sale-puts-uma-s-token-voting-oracle-on)
