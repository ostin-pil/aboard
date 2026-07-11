# Plan: FLF Epistemic Case Study Competition entry — writeup-led — deadline 2026-07-19

Enter the Future of Life Foundation's Epistemic Case Study Competition
(~$200k pool; awards $5k–$50k; continuation funding possible) with a
**writeup-led** entry: aboard's external-anchor thesis + both-readings
methodology as the substance, aboard the deployed prototype as the
demonstration, and **one** cheap worked example (eggs, through the existing
ensemble) to satisfy "address the cases." Submit via the Google Form linked at
[flf.org/epistack-competition](https://flf.org/epistack-competition/).

**Hard deadline: 2026-07-19.** Early-feedback option: 2026-06-21 (past). Facts
verified against the competition page 2026-07-11. Realistic effort: **~2
sessions**, not five — this is a writing + light-demo sprint, not a build.

## Why writeup-led (the Fork C decision, 2026-07-11)

FLF's accepted entry forms explicitly include **"comparative analyses"** and
**"critiques: identifying limitations of promising approaches"** alongside
prototype tools and protocols. World-class comparative analysis is the thing
aboard has *already produced*: `research/landscape.md`,
`agent-first-validation.md`, and the `integrity-anti-gaming.md` /
`sybil-identity.md` pair. The load-bearing synthesis —
**integrity, adjudication, and Sybil-resistance are one problem; every
gaming-resistant defense terminates in an external anchor outside the agent
graph** — is a sharp, underexplored contribution to exactly the question FLF
is asking ("reliable epistemic investigations and trustworthy knowledge
bases"). Leading with the thinking plays to the maintainer's strongest muscle
(research/writing) instead of the scarcest resource (build-sessions), and keeps
the artifact-first track (below) as the real work.

A build-led entry (a hand-authored COVID-origins dossier + eggs + LHC in 8
days) was the original scoping here; it was over-scoped for a solo builder and
is explicitly rejected.

## The one framing risk to manage

There is a philosophical seam: FLF wants tooling that helps someone
"reason **better** about this case" — implicitly, *converge toward truth*.
aboard's signature move is **not** converging ("both readings as tension").
Manage it, don't hide it:

- **Lead with the aligned parts:** crux identification and ranking (FLF names
  cruxes as a wanted capability), provenance structure, machine-readable
  interoperability (a protocol other investigations can share), the
  external-anchor design constraint as a *reliability* result.
- **Deploy non-convergence only where it genuinely fits** — the eggs case (an
  open-ended everyday question) and the honest reporting that FRI's adversarial
  collaborations moved a 20-point disagreement ~1 point even after resolving top
  cruxes. Non-convergence is a *finding about hard cases*, not a refusal to
  reason. Do not make "we don't pick" the headline for a settled case.

## Deliverables

1. **The written entry (≤10 pages, excluding appendices/worked examples).**
   Structure:
   - The epistemic-stack framing: ingestion → structure → assessment, and where
     aboard sits (structure + assessment).
   - aboard's mechanisms as the reliability toolkit: typed causal claim graph,
     `AgentAttribution` provenance on every object, dual-dossier with ranked
     cruxes (`cruxRank = impact × uncertainty`), ensemble disagreement as a
     measured signal (median / spread / leave-one-out), JSON-LD + JSON Schema +
     MCP as the interoperability protocol.
   - The external-anchor result, stated as a *design principle for trustworthy
     knowledge bases*, cited honestly from the integrity research (including the
     cruxes-barely-move-beliefs caveat and the cold-start problem).
   - Answers to FLF's four judging questions, explicitly: *helps reason better?
     generalizes? scales with better AI? compounds?* (The last two are
     aboard's strong suit — schema + ensemble both improve monotonically with
     better/cheaper models, and the corpus compounds as agents contribute.)
   - Appendices: schema spec (`research/schema.md`), a live MCP read-tool
     transcript, JSON-LD samples, links to the deployed demo.
2. **The deployed demo** — aboard on a public URL (see the deploy runbook;
   this is the fork-independent forcing function). The existing two domains +
   the eggs example are the worked examples ("navigable knowledge base").
3. **The eggs worked example** — 2–3 claims + one forecast-shaped question run
   through the live Groq ensemble (`scripts/forecasters/ensemble-predict.ts`),
   rendered with both readings. This is the case-study coverage; it reuses
   machinery that already exists, so it's ~1–2 hours, not a build.

## Tiered scope (submit the tier you reach — all are legitimate entries)

- **T1 — minimum viable (target: submit this):** writeup + deployed demo +
  eggs example + the two live domains as generality evidence. Addresses one FLF
  case directly and argues generality from the existing corpus. ~2 sessions.
- **T2 — if time allows:** add a **light** COVID-origins treatment — a
  structural claim map + ranked cruxes drawn from the *public* Rootclaim debate
  record (not a fully hand-authored steelmanned dossier). Demonstrates the
  dual-dossier module on their flagship case. +~1 session.
- **T3 — only if T1+T2 land early:** a 1–2 claim LHC "settled case" showing the
  external resolution anchor (needs `integrity-foundations.md`'s
  `resolutionSource` fields — do that slice first if reaching for T3).

Do not let T2/T3 ambition threaten a clean T1 submission. One convincing worked
example + strong writeup beats three thin ones — which is also what FLF's
"tooling should be general" rewards.

## Prerequisites (do before writing)

- **Deploy + LICENSE.** LICENSE landed 2026-07-11 (`7b3348e`). Deploy is the
  one blocker; follow the runbook. A public URL is required for the demo links
  and unblocks the real vocab namespace (`repo-hardening.md` §4).
- **Every source URL human-reviewed** — real landing pages only (CLAUDE.md).
  Applies especially to any eggs / Rootclaim sources.

## Deploy runbook (static export → any static host)

The app is a **static site** (`output: "export"`, landed on `feat/static-export`,
commit `a9905cf`): `npm run build` writes portable files to `out/` with no
server runtime — so it deploys to any static host with zero lock-in, and the
host is swappable by copying `out/`. Rationale: the site is a pure function of
`data/`; static files are the most durable, cacheable form for a
machine-readable substrate (and independence from any one platform is on-thesis
— see the ClaimReview lesson in `research/agent-first-validation.md`).

**Build-time requirement — set `SITE_URL`.** It seeds absolute JSON-LD `@id`s;
without it the export uses relative IRIs (valid JSON-LD, but they fail
`v0.json`'s strict `uri` format). Verified 2026-07-11: a `SITE_URL`-set export
passes `clients/validate.ts` on `/api/graph` and `/api/claims/<id>`.

```
SITE_URL=https://<domain> npm run build     # → out/
```

Host options, ranked by how far the "no company / own it" preference goes
(all serve the same `out/`, so the choice is reversible):
- **Cloudflare Pages / GitHub Pages** — free, easy, fast; portable output means
  no lock-in.
- **Codeberg Pages** — free static hosting from a non-profit; most aligned with
  aboard's posture.
- **Own €4/mo VPS (Hetzner) + Caddy** — maximum ownership; Caddy does auto-TLS
  and serves `out/` directly.

Two host-level settings to apply (the API/OG files are extensionless, inherent
to static export of route handlers + metadata images):
- Serve `/api/graph` and `/api/claims/*` as `application/ld+json` (or at least
  `application/json`) and `/*/opengraph-image` as `image/png` via a `_headers`
  file (Cloudflare/Netlify) or web-server config. Consumers still parse the
  body regardless; this is correctness, not a blocker.
- Enable clean-URL / `.html` resolution (default on Cloudflare Pages, Netlify,
  GitHub Pages).

Verify after deploy:
- `! curl -s https://<domain>/api/graph | head -c 300` → JSON-LD with claims.
- Open `https://<domain>/graph` → the interactive graph renders.
- `! (cd clients && npx tsx validate.ts https://<domain>/api/graph)` → passes.

Then wire the host to rebuild on push to `main` (with `SITE_URL` set in its
build env), and feed the canonical domain into the JSON-LD namespace
(`repo-hardening.md` §4).

## Suggested schedule (fits the ~8 days, front-loaded)

- Session A: deploy; eggs example (claims + ensemble run + render); outline the
  writeup against the four judging questions.
- Session B: draft the ≤10-page writeup; `/prose-check` it; internal red-team
  against the judging questions; assemble appendices; submit T1. Add T2 only if
  a full session remains before 07-19.
- Leave 07-18/07-19 as buffer; do not first-submit on the deadline day.

## Verification

1. Deployed URL renders the graph, claim pages, a dossier, and the eggs example.
2. `npx tsc --noEmit` + `npm run build` + `clients/validate.ts` against the
   deployed `/api/graph`.
3. Every new source URL resolves to a real landing page.
4. Writeup ≤10 pages; each of the four judging questions explicitly answered;
   prose-checked.

## Out of scope

- MCP write path (mention as roadmap in the writeup; don't build under deadline).
- Any new UI feature or redesign — existing surfaces + the deploy are enough.
- A fully hand-authored COVID dossier (that's the rejected build-led scope).

## Even if it doesn't win

The entry doubles as: the deployed public artifact every funding application
needs (`funding-applications.md`), a citable write-up of the external-anchor
thesis, the eggs example as the first worked case outside the two seed domains,
and reconnaissance — FLF will surface whoever else is building this stack.
