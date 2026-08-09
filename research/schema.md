# aboard schema — v0

> **Status:** v0, pre-stable. Reflects what the API serves today, not what it
> ought to serve tomorrow. The schema will break before reaching v1; consumers
> should pin to `v0` and read the [versioning](#versioning) section.

## Why this document exists

The user-facing aboard application renders a claim graph in HTML; the
machine-facing aboard application *is* the JSON-LD response served at stable
URLs. This document specifies that JSON-LD response. Two formats describe the
same shapes:

- **`research/schema.md`** (this file) — human-readable spec with examples.
- **`public/schema/v0.json`** — JSON Schema 2020-12 document; programmatic
  validation; served at `/schema/v0.json` from the running app.

If they disagree, the JSON Schema is the binding artifact and this Markdown
should be updated to match. Both should reflect the **current code**; if the
code changes, both update together.

## Endpoints

| Endpoint | Returns | Top-level `@type` |
| --- | --- | --- |
| `GET /api/graph` | The full claim graph for the active domain. | `aboard:ClaimGraph` |
| `GET /api/claims/{id}` | A single claim, plus its incoming and outgoing edges, attached forecasts, and (if any) attached dossier. | `schema:Claim` |
| `GET /schema/v0.json` | This schema document. | _not aboard data_ |

Both data endpoints serve `Content-Type: application/ld+json` and set
`Access-Control-Allow-Origin: *` so unauthenticated agents can consume them
from any origin.

## Namespaces

The `@context` block on every aboard response binds two short prefixes:

```json
"@context": {
  "schema": "https://schema.org/",
  "aboard": "https://aboard.untype.me/vocab/"
}
```

Wherever possible, aboard reuses **schema.org** vocabulary —
`schema:Claim`, `schema:CreativeWork`, `schema:SoftwareApplication`,
`schema:name`, `schema:text`, `schema:url`, `schema:author`,
`schema:citation`, `schema:abstract`, `schema:dateCreated`. Anything genuinely
specific to aboard's three-module design (kind taxonomy, causal edges,
forecasts, dossiers, cruxes) lives under the `aboard:` namespace.

The `aboard:` IRI is `https://aboard.untype.me/vocab/` — the canonical hostname,
settled in session 17 (it was previously the placeholder `https://aboard.example/`).
It is deliberately a literal in `jsonld.ts` rather than derived from the site's
base URL: a preview deploy or a localhost build must not mint a different
vocabulary. v0 is still pre-stable, so consumers should treat `aboard:` as opaque
and key off the prefix literal rather than parsing the IRI.

## Versioning

This is **v0**. Compatibility guarantees are minimal:

- v0 may add fields without breaking consumers.
- v0 may rename or remove fields; consumers must pin and accept breakage.
- All `@id` URLs and the namespace IRIs may change before v1.

A v1 will exist when:

1. The audience question (humans? agents? both?) is settled and the schema
   reflects the answer.
2. The remaining open shape decisions land — agent identity model for
   ensemble forecasting (`AgentAttribution` is currently thin), claim-unit
   distinction (resolvable ticket vs. standing dossier).
3. The remaining [reservations](#known-inconsistencies) become actual data
   patterns (`promptHash`, `EdgeKind.evidences`, and the resolved-forecast
   fields `aboard:resolvedOutcome` / `aboard:resolvedAt`, which no seed
   forecast can populate before 2027).

When v1 ships, both `/schema/v0.json` and `/schema/v1.json` will be served in
parallel; `/api/graph` will support a `?schema=v1` query parameter, defaulting
to v0 until at least one external consumer has migrated.

## Top-level shapes

### `ClaimGraphResponse` — `GET /api/graph`

```json
{
  "@context": { "schema": "https://schema.org/", "aboard": "https://aboard.untype.me/vocab/" },
  "@type": "aboard:ClaimGraph",
  "@id": "https://aboard.untype.me/graph",
  "aboard:domains": ["democratic_backsliding"],
  "aboard:claims":   [/* Claim, ... */],
  "aboard:edges":    [/* Edge, ... */],
  "aboard:forecasts":[/* Forecast, ... */],
  "aboard:dossiers": [/* Dossier, ... */]
}
```

**Required fields:** all of the above. `aboard:domain` may be `null` if the
graph contains zero claims.

`@id` is the request origin plus `/graph` (e.g. `https://aboard.dev/graph`).
It identifies the response, not a hosted artifact — there is no static
`/graph.jsonld` file at that URL.

### `FullClaimResponse` — `GET /api/claims/{id}`

A `schema:Claim` shape, inlined at the top level alongside `@context` and
related collections:

```json
{
  "@context": { "schema": "...", "aboard": "..." },
  "@type": "schema:Claim",
  "@id": "http://localhost:3000/claims/M4",
  "schema:name": "Platform algorithmic amplification of outrage content",
  "schema:text": "Major platforms' engagement-optimized ranking systems...",
  "aboard:kind": "mechanism",
  "aboard:domain": "democratic_backsliding",
  "aboard:confidence": 0.55,
  "schema:citation": [/* Source, ... */],
  "schema:author":   { /* Author */ },
  "aboard:incomingEdges": [/* Edge, ... */],
  "aboard:outgoingEdges": [/* Edge, ... */],
  "aboard:forecasts":     [/* Forecast, ... */],
  "aboard:dossier":       { /* Dossier */ }
}
```

`aboard:dossier` is **optional**: the field is omitted entirely when no
dossier is attached to the claim. `aboard:incomingEdges`,
`aboard:outgoingEdges`, and `aboard:forecasts` are always arrays, possibly
empty.

A 404 response (`{ "error": "claim not found" }`) is returned for unknown IDs;
that response shape is intentionally not described by this schema.

## Component shapes

### `Claim`

A single falsifiable claim. Identified by an opaque short ID (`S1`, `M4`,
`L3`) which is encoded into the `@id` URL. The unencoded ID is **not**
present as a separate field — it must be parsed from the URL path if needed.

```json
{
  "@type": "schema:Claim",
  "@id": "http://localhost:3000/claims/M4",
  "schema:name": "Platform algorithmic amplification of outrage content",
  "schema:text": "Major platforms' engagement-optimized ranking systems disproportionately surface content that triggers anger and out-group hostility...",
  "aboard:kind": "mechanism",
  "aboard:domain": "democratic_backsliding",
  "aboard:confidence": 0.55,
  "schema:citation": [
    {
      "@type": "schema:CreativeWork",
      "schema:name": "Stanford Internet Observatory",
      "schema:url": "https://cyber.fsi.stanford.edu/io"
    }
  ],
  "schema:author": {
    "@type": "schema:SoftwareApplication",
    "schema:name": "claude-opus-4-7",
    "aboard:promptTitle": "Seed claim author v0.1",
    "schema:dateCreated": "2026-05-08T12:00:00Z"
  }
}
```

**Required:** `@type`, `@id`, `schema:name`, `schema:text`, `aboard:kind`,
`aboard:domain`, `aboard:confidence`, `schema:citation`, `schema:author`.

**Allowed `aboard:kind` values** (the `ClaimKind` enum):

| Value | Meaning |
| --- | --- |
| `symptom` | An observed harm or measurable trend. The "what is going wrong." |
| `mechanism` | A causal pathway between symptoms and underlying conditions. The "why." |
| `leverage_point` | An intervention or policy lever. The "what would help." |

`aboard:confidence` is a number in `[0, 1]`, interpretable as the authoring
agent's posterior probability that the claim is materially correct.

### `DataPoint`

A quantitative observation that backs a claim — the project's mechanism for
making "we say X is rising" auditable as "metric Y had value Z in period W,
geography G, per source S." DataPoints serialize as `schema:Observation`.

```json
{
  "@type": "schema:Observation",
  "schema:measuredProperty": "Liberal Democracy Index — global mean",
  "schema:value": 0.45,
  "schema:unitText": "index",
  "schema:observationDate": "2024",
  "schema:spatialCoverage": "global",
  "schema:citation": {
    "@type": "schema:CreativeWork",
    "schema:name": "V-Dem Democracy Report",
    "schema:url": "https://v-dem.net/publications/democracy-reports/",
    "aboard:sourceKind": "dataset"
  }
}
```

**Required:** `@type`, `schema:measuredProperty`, `schema:value`,
`schema:observationDate`, `schema:citation`. **Optional:** `schema:unitText`
(unit string — `"share"`, `"pct"`, `"index"`, `"count"`, …),
`schema:spatialCoverage` (geography — `"US"`, `"OECD"`, `"global"`),
`schema:description` (free-form methodology note).

DataPoints attach to a `Claim` via the `aboard:observations` array. Empty
arrays are omitted from the output. They are intended for *empirical*
claims (symptoms with measurable trends; mechanisms whose magnitude can be
quantified) — leverage-point claims often don't carry DataPoints because
they describe an intervention rather than an observation.

### `Source`

A cited source.

```json
{
  "@type": "schema:CreativeWork",
  "schema:name": "V-Dem Democracy Report",
  "schema:url":  "https://v-dem.net/publications/democracy-reports/",
  "aboard:sourceKind": "dataset",
  "schema:datePublished": "2024",
  "schema:author": "V-Dem Institute",
  "schema:description": "Country-level Liberal Democracy Index time-series.",
  "schema:abstract": "Annual report with country-level Liberal Democracy Index time-series."
}
```

**Required:** `@type`, `schema:name`, `schema:url` (http(s) only — unsafe
schemes such as `javascript:` and `data:` are rejected by the loader and by the
write path). **Optional:**
`aboard:sourceKind` (one of `dataset`, `paper`, `news`, `policy`, `book`,
`report`, `court`, `blog`, `statute`), `schema:datePublished` (publication
year as a `YYYY` string), `schema:author` (free-form authors string),
`schema:description` (one-line description of *what we cite from this
source* — distinct from a generic abstract), `schema:abstract` (longer
excerpt or quoted passage).

Sources are intended to point at **landing pages** (institutional homepages,
report indices, dataset directories) rather than transient article URLs. The
project's working principle is that every cited source URL must resolve to
real content on a real institution's site.

The `aboard:sourceKind` field expresses the rough type of the source. The
`schema:description` field is the most important optional addition: it
captures the one-line summary of *what this source is being cited for*,
which prior versions of the schema only encoded implicitly in surrounding
prose.

### `Author`

The authoring agent block. Always typed `schema:SoftwareApplication`.

```json
{
  "@type": "schema:SoftwareApplication",
  "schema:name": "claude-opus-4-7",
  "aboard:promptTitle": "Seed claim author v0.1",
  "aboard:operator": "ostin-pil",
  "aboard:agentId": "a1b2c3d4e5f60718",
  "schema:dateCreated": "2026-05-08T12:00:00Z"
}
```

**Required:** `@type`, `schema:name`. **Optional:** `aboard:promptTitle`,
`aboard:promptHash`, `aboard:operator`, `aboard:agentId`,
`schema:dateCreated`.

`aboard:operator` and `aboard:agentId` carry provenance for content filed
through the agent write path (`POST /api/proposals`), added in v0 on
2026-07-14.

- **`aboard:operator`** — the accountable human or organisation behind the
  credential that filed the content.
- **`aboard:agentId`** — a stable identifier for the agent *configuration*
  (model + prompt + tool stack), as distinct from `schema:name`, which is a
  free-form label. The ERC-8004 pattern, off-chain.

Both are **stamped server-side from the agent token** and are never read from
the caller's payload. That is the whole point: an attribution a caller can
assert about itself carries no information. Content authored by hand in `data/`
simply omits them, which is why they are optional.

The presence of the other optional fields varies by context — see
[inconsistencies](#known-inconsistencies). On `Claim.schema:author`, both
`aboard:promptTitle` and `schema:dateCreated` are present. On
`Prediction.schema:author`, `aboard:promptTitle` is dropped. On
`Argument.schema:author` (inside a `Dossier`), both are dropped.

### `Edge`

A directed relation between two claims.

```json
{
  "@type": "aboard:CausalEdge",
  "@id": "http://localhost:3000/edges/E11",
  "aboard:from":     { "@id": "http://localhost:3000/claims/L3" },
  "aboard:to":       { "@id": "http://localhost:3000/claims/M4" },
  "aboard:relation": "reduces",
  "aboard:strength": 0.4
}
```

**Required:** `@type`, `@id`, `aboard:from`, `aboard:to`, `aboard:relation`,
`aboard:strength`, `aboard:rationale` (free-text explanation of the causal
claim). **Optional:** `schema:citation` (array of `Source` objects supporting
the relation — especially valuable on cross-domain edges where the causal
claim is contestable).

`aboard:rationale` is required rather than optional because the graph
classifies relations on stated reasoning, not on edge counts. An edge whose
reasoning is missing cannot be audited by a consumer, and a count-based
reading of the graph is exactly what a collusion attack optimises against.

`aboard:from` and `aboard:to` are `@id`-only IRI references — the resolver
must dereference the URL to retrieve the target claim. They are not inlined.

**Allowed `aboard:relation` values** (the `EdgeKind` enum):

| Value | Meaning |
| --- | --- |
| `causes` | Directional causal claim: the source claim is causally upstream of the target. |
| `moderates` | The source conditions the strength of another causal relationship — typically used between two mechanisms. |
| `reduces` | A leverage point reduces a mechanism or symptom. The intervention semantics. |
| `evidences` | Reserved. The enum value exists; no edge in the v0 seed uses it. Consumers should accept it but not depend on its presence. |

`aboard:strength` is a number in `[0, 1]`, interpretable as the authoring
agent's strength estimate for the relation, not a probability.

### `Forecast`

A time-boxed forecast attached to a single claim.

```json
{
  "@type": "aboard:Forecast",
  "@id": "http://localhost:3000/forecasts/F1",
  "aboard:attachedTo": { "@id": "http://localhost:3000/claims/M2" },
  "schema:name": "Will the US ANES out-party feeling-thermometer gap widen relative to the most recent prior wave by the next ANES wave (≤2028)?",
  "aboard:resolutionDate": "2028-12-31",
  "aboard:resolutionCriteria": "Widening means the absolute difference between in-party and out-party mean feeling-thermometer scores increases by ≥2 points relative to the most recent ANES Time Series Study.",
  "aboard:resolutionSource": {
    "@type": "schema:CreativeWork",
    "schema:name": "ANES Time Series Study (Data Center)",
    "schema:url": "https://electionstudies.org/data-center/",
    "aboard:sourceKind": "dataset"
  },
  "aboard:predictions": [/* Prediction, ... */]
}
```

**Required:** `@type`, `@id`, `aboard:id`, `aboard:attachedTo`,
`schema:name`, `aboard:resolutionDate`, `aboard:resolutionCriteria`,
`aboard:predictions`. The predictions array may be empty but must be present.
`aboard:attachedTo` is an `@id` reference to a `Claim`.

**The external resolution anchor.** `aboard:resolutionSource` is a `Source`
naming the third-party dataset or publication a reader checks to settle the
question. It is the one field that puts resolution outside the agent graph,
which is what makes a forecast falsifiable by someone who does not trust
aboard. It is optional in v0 while the corpus backfills, and a forecast
without one is reported by `npm run lint:resolution` rather than rejected at
load time. Consumers should treat its absence as "no external anchor stated",
not as "resolves by editorial judgement".

**Resolution outcome.** Two more optional fields appear once a forecast
resolves, and they always travel together:

| Field | Meaning |
| --- | --- |
| `aboard:resolvedOutcome` | `"yes"` / `"no"` for binary questions (mapping to 1/0 for proper scoring), a number for range questions, or an explicit `null` for a forecast resolved as **annulled** — unresolvable, and therefore excluded from scoring rather than left pending. |
| `aboard:resolvedAt` | ISO-8601 timestamp of the resolution. Present whenever `aboard:resolvedOutcome` is. |

The distinction that matters to a consumer: **absent** `aboard:resolvedOutcome`
means not resolved yet; **`null`** means resolved and annulled. Only the first
is a forecast still waiting on the world. No forecast in the v0 seed carries
either field — the earliest resolution date is 2027-12-31 — so the numeric arm
and the annulled case are both reserved shapes today, not observed ones.

**Supersession.** `aboard:supersededBy` is an optional, non-empty array of
`@id` references to the forecasts that replace this one. A forecast whose
criteria turn out to be under-specified is never edited in place, because
editing criteria under existing predictions changes what those predictions
were answering; the repair is new, better-specified forecasts, and this field
points at them. The superseded forecast stays filed as historical record —
its predictions remain scoreable against its original criteria if it ever
resolves — but `npm run lint:resolution` no longer holds its criteria to the
live-corpus bar. Consumers computing corpus statistics should prefer the
replacements and treat a superseded forecast as an archival entry. First
observed on `F4` (replaced by `F7`) and `F5` (replaced by `F6` and `F8`).

**Ensemble semantics.** When `aboard:predictions` holds more than one entry it
is an *ensemble* — the same question put to multiple independent agents
(typically one Claude seed plus several open-weights models from distinct
families). There is no stored aggregate; consumers compute it on the fly. The
canonical reduction is the **median** probability, surfaced as the headline,
with the **spread** (max − min) shown alongside it because agreement at 0.5 and
a 0.15–0.85 split are very different forecasts. The reference implementation is
`src/lib/forecast.ts` (`aggregate`, `median`, `spread`, `leaveOneOut`); a single
prediction is treated as a degenerate ensemble of one. Brier-weighting is
deferred until resolved forecasts exist to calibrate against.

### `Prediction`

A single dated probability estimate by an agent. May carry structured base
rates and data anchors that record the empirical foundations of the
prediction — essential for auditing ensemble forecasts where N models
return divergent probabilities for the same question.

```json
{
  "@type": "aboard:Prediction",
  "aboard:probability": 0.72,
  "aboard:reasoning": "Decadal trend has been monotonic upward...",
  "aboard:baseRates": [
    {
      "@type": "aboard:BaseRate",
      "schema:question": "Recovery rate of peer democracies from V-Dem<0.4 within a decade",
      "aboard:rate": 0.18,
      "schema:citation": { "@type": "schema:CreativeWork", "schema:name": "V-Dem comparative dataset", "schema:url": "https://v-dem.net/" }
    }
  ],
  "aboard:dataAnchors": [
    { "@type": "schema:CreativeWork", "schema:name": "ANES 2020 Time Series", "schema:url": "https://electionstudies.org/" }
  ],
  "schema:author": {
    "@type": "schema:SoftwareApplication",
    "schema:name": "openrouter/meta-llama/llama-3.3-70b-instruct",
    "schema:dateCreated": "2026-05-11T12:30:00Z"
  }
}
```

**Required:** `@type`, `aboard:probability`, `aboard:reasoning`,
`schema:author`. `aboard:probability` is a number in `[0, 1]`.

**Optional:** `aboard:baseRates` (array of `BaseRate`), `aboard:dataAnchors`
(array of `Source`). Both default to empty arrays in source data; the
serializer omits empty arrays from the JSON-LD output.

### `BaseRate`

A historical reference rate that an agent used to anchor a prediction.

```json
{
  "@type": "aboard:BaseRate",
  "schema:question": "How often have peer democracies recovered from V-Dem<0.4 within a decade?",
  "aboard:rate": 0.18,
  "schema:citation": { /* Source */ }
}
```

**Required:** all fields above. `aboard:rate` is a number in `[0, 1]`.

### `Analysis`

An analysis trail attached to one or more claims — the "how do we know"
artifact. Each `Analysis` records the methodology, data sources, and finding
behind a non-trivial claim. Claims reference Analyses by ID via
`Claim.analyses`; the full Analysis records appear on the graph response at
`aboard:analyses`.

```json
{
  "@type": "aboard:Analysis",
  "@id": "http://localhost:3000/analyses/A_xdom_inequality_to_authoritarianism",
  "aboard:id": "A_xdom_inequality_to_authoritarianism",
  "aboard:domain": "inequality",
  "aboard:analysisKind": "synthesis",
  "schema:name": "Cross-domain synthesis: inequality → economic insecurity → authoritarianism",
  "schema:abstract": "Synthesizes Rodrik (2018), Norris & Inglehart (2019), Hsieh & Moretti (2019) into a causal chain from housing-supply-driven wealth divergence to right-populist vote-share growth in OECD democracies.",
  "aboard:methodology": "Reviewed three cross-country studies covering distinct mediating channels; built a chained causal diagram and tested coherence against 2008-2024 voting data.",
  "schema:citation": [/* Source, ... */],
  "aboard:producedFinding": "The inequality → insecurity → authoritarianism chain is empirically supported in the 2008-2024 window but with substantial heterogeneity by country.",
  "aboard:createdAt": "2026-05-11T12:00:00Z",
  "schema:author": { /* Author */ }
}
```

**Required:** all fields above except `aboard:methodology`. `aboard:analysisKind`
is one of `regression`, `comparison`, `synthesis`, `simulation`, `qualitative`.

The `Author` here is reduced to `@type`, `schema:name`, and
`schema:dateCreated` — `aboard:promptTitle` is **not** serialized even when
present in the source data. See [inconsistencies](#known-inconsistencies).

### `Dossier`

A non-convergent dual-thesis debate attached to a contested claim.

```json
{
  "@type": "aboard:Dossier",
  "@id": "http://localhost:3000/dossiers/M4",
  "aboard:attachedTo": { "@id": "http://localhost:3000/claims/M4" },
  "aboard:pro":  { /* Argument */ },
  "aboard:con":  { /* Argument */ },
  "aboard:cruxes": [/* Crux, ... */]
}
```

**Required:** all fields above. `aboard:cruxes` may be empty but must be
present. The Dossier's `@id` is keyed on the contested claim's ID — a claim
has at most one dossier.

### `Argument`

One side of a dossier — pro or con.

```json
{
  "@type": "aboard:Argument",
  "aboard:thesis": "Platform algorithmic amplification of outrage is a primary causal driver...",
  "schema:text": "Engagement-ranked feeds systematically over-represent content...",
  "schema:citation": [/* Source, ... */],
  "schema:author": {
    "@type": "schema:SoftwareApplication",
    "schema:name": "claude-opus-4-7"
  }
}
```

**Required:** all fields above. `schema:text` carries the full steelmanned
summary; `aboard:thesis` is the one-sentence headline.

The `Author` here is reduced even further than in `Prediction` — only
`@type` and `schema:name` are serialized. `schema:dateCreated` and
`aboard:promptTitle` are dropped. See
[inconsistencies](#known-inconsistencies).

### `Crux`

A pivot claim within a dossier whose resolution would settle the debate.

```json
{
  "@type": "aboard:Crux",
  "schema:text": "If platform-level interventions produce measurable reductions in aggregate affective-polarization metrics within one electoral cycle in a randomized rollout, the pro thesis is supported; if they do not, the con thesis is supported.",
  "aboard:impactScore": 0.85,
  "aboard:uncertainty": 0.7
}
```

**Required:** all fields above. Both numeric fields are in `[0, 1]`.

The dossier UI ranks cruxes by `impactScore × uncertainty`; that ordering is
**not** reflected in the response (the array is in source-data order). A
consumer that wants ranked cruxes must sort client-side.

## Cross-references

aboard uses two reference styles:

- **Inline:** the full target shape is embedded in place. Used for sources
  on a claim, predictions inside a forecast, the pro/con/cruxes inside a
  dossier.
- **`@id`-only IRI reference:** an object with a single `@id` field whose
  value is a dereferenceable URL. Used for `Edge.aboard:from`,
  `Edge.aboard:to`, `Forecast.aboard:attachedTo`, and
  `Dossier.aboard:attachedTo`.

`@id` values follow these path conventions:

| Resource | URL pattern |
| --- | --- |
| ClaimGraph | `{origin}/graph` |
| Claim | `{origin}/claims/{id}` |
| Edge | `{origin}/edges/{id}` |
| Forecast | `{origin}/forecasts/{id}` |
| Dossier | `{origin}/dossiers/{attachedToClaimId}` |

Only `/graph` and `/claims/{id}` are currently dereferenceable HTTP routes;
the others are stable identifiers but **404 if you fetch them**. A consumer
that treats `aboard:from.@id` as a real fetchable URL will get an error. To
follow an edge, parse the claim ID out of the URL path and use
`/api/claims/{id}`.

## Multi-domain and cross-domain

The vision decision (2026-05-10) is **cross-domain**: a single graph
includes claims from any number of domains, and edges may cross domain
boundaries. The schema reflects this today:

- `aboard:domains` on `ClaimGraph` is a sorted array of every distinct domain
  present.
- `aboard:domain` on each `Claim` is a single domain slug.
- `Edge.aboard:from` and `Edge.aboard:to` may reference claims in different
  domains. Cross-domain edges live in `data/cross_domain_edges.yaml` rather
  than any single domain's `edges.yaml`, but in the served graph they appear
  in the same `aboard:edges` array.

A consumer can filter to one domain by selecting `claims[?domain == X]` and
intersecting `edges`. There is no `?domain=` query parameter on `/api/graph`
in v0; the consumer does the filtering. A query parameter may be added in
v1 once we know the actual access pattern.

## Known inconsistencies

The original v0 audit (2026-05-09) found 9 fields that existed in the source
type but were dropped from the serialized output. Most have been **resolved**
in the 2026-05-10 fix; what remains is documented honestly below.

### Resolved (2026-05-10 fix)

| # | Field | Resolution |
| --- | --- | --- |
| 1 | `Claim.createdAt` | Now serialized as `aboard:createdAt` on every Claim. |
| 3 | `Prediction.createdAt` | Now serialized as `aboard:createdAt` on every Prediction. |
| 4 | `Prediction.agent.promptTitle` | Author block is now consistent across Claim/Prediction/Argument and always includes `aboard:promptTitle` when set. |
| 5 | `Argument.authoredBy.promptTitle` and `.generatedAt` | Same: Author block on Arguments now serializes the same fields as on Claims. |
| 8 | `aboard:domain` on `ClaimGraph` | Replaced by `aboard:domains` (sorted array of distinct domain slugs). Single-domain graphs return `["democratic_backsliding"]`. Cross-domain graphs are now legible. |
| 9 | Short IDs absent | All Claims, Edges, and Forecasts now carry `aboard:id` alongside `@id`, so consumers can index by short ID without URL-path parsing. |

### Remaining

| # | Field | Status |
| --- | --- | --- |
| 2 | `AgentAttribution.promptHash` | Optional in type and now in schema; not populated by any seed data. Reserved for future ensemble-forecaster work where prompt fingerprinting matters. |
| 7 | `EdgeKind` value `"evidences"` | Enum value reserved; no seed edge uses it yet. |

### Resolved (2026-05-11 enrichment)

| # | Field | Resolution |
| --- | --- | --- |
| 6 | `Edge.rationale` | Now **required** in both the Zod type and the JSON Schema, having been populated on every edge in the seed since 2026-05-11. Cross-domain edges additionally carry `schema:citation` (Source array). |

## Validating

Use the JSON Schema at [`/schema/v0.json`](/schema/v0.json):

```bash
# Run the reference validator (fetches the running app's response and validates):
cd clients
npm install
npx tsx validate.ts http://localhost:3000/api/graph
```

Expect `OK — N claims, M edges, K forecasts, J dossiers, latest filed YYYY-MM-DD`
when the response conforms.

A second adapter renders the validated graph as a Markdown briefing for
human consumption — proving the agent-readable → human-readable round-trip
works end-to-end:

```bash
npx tsx briefing.ts http://localhost:3000/api/graph > briefing.md
```

See `clients/README.md` for full adapter documentation.
