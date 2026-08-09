/**
 * The reviewer-facing body of an agent's proposal PR.
 *
 * This is the surface aboard's whole safety posture rests on. The write path is
 * PR-only and never auto-merges (`research/integrity-anti-gaming.md`), which
 * makes the human reading this body the admission gate — and makes the body
 * itself worth attacking. A caller supplies the rationale, the statement, the
 * theses and the source labels; the server supplies the identity, the ids and
 * the checklist. If caller text can forge the server's half, the gate reads a
 * document the caller wrote and believes the server wrote it.
 *
 * So every caller-controlled value here is contained before it is interpolated:
 *
 * - **Multi-line free text** (rationale, statement, theses) goes inside a code
 *   fence whose length is computed from the content, so nothing inside it can
 *   close it. See `fenceBlock`.
 * - **Single-line free text** (source labels, domain) is escaped and stripped
 *   of newlines, so it cannot start a new markdown block. See `inlineText`.
 * - **Link targets** are http(s) by schema (`HttpUrl` in `types.ts`), so a
 *   source URL cannot be a `javascript:` payload.
 *
 * Values that need no containment, and why: `kind` fields are Zod enums;
 * confidence, strength and probability are numbers; ids are minted server-side
 * and already sit in code spans.
 *
 * This module lives in `src/lib` rather than in the Worker on purpose. The
 * Worker is a thin HTTP shell and exports nothing, so nothing in it can be unit
 * tested — which is precisely why the forgery hole survived two audits
 * unnoticed. Here it is pure, imported by the Worker, and covered by
 * `pr-body.test.ts`.
 */
import type { Claim, Dossier, Edge, Prediction, Source } from "./types";
import type { TokenIdentity } from "./proposals";

/**
 * Wrap untrusted multi-line text in a code fence that its own content cannot
 * close.
 *
 * CommonMark closes a fenced block on a line whose fence is *at least as long*
 * as the opening one. A fixed three-backtick fence is therefore not
 * containment: a caller who writes ``` inside the text closes it and everything
 * after is live markdown again. Counting the longest backtick run in the
 * content and opening with one more is what makes the block inescapable.
 */
export function fenceBlock(text: string): string {
  const runs = [...text.matchAll(/`+/g)].map((m) => m[0].length);
  const fence = "`".repeat(Math.max(3, ...runs.map((n) => n + 1)));
  return `${fence}\n${text}\n${fence}`;
}

/**
 * Flatten untrusted text for interpolation inside a line.
 *
 * Newlines become spaces, because a newline is what lets a value escape its
 * bullet and open a block of its own. The characters escaped after that are the
 * ones that would otherwise be read as structure at the point of use: link
 * syntax, emphasis, and the backslash that would undo the rest.
 */
export function inlineText(value: string): string {
  return value
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/([\\`*_[\]()<>|])/g, "\\$1")
    .trim();
}

/** Untrusted text inside a code span, for values better shown verbatim. */
export function codeSpan(value: string): string {
  const flat = value.replace(/\s*\r?\n\s*/g, " ");
  const runs = [...flat.matchAll(/`+/g)].map((m) => m[0].length);
  const ticks = "`".repeat(Math.max(1, ...runs.map((n) => n + 1)));
  // A code span that starts or ends with a backtick needs padding spaces,
  // which CommonMark strips back off when rendering.
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${ticks}${pad}${flat}${pad}${ticks}`;
}

const PREAMBLE =
  "Filed by an agent through `POST /api/proposals`. " +
  "**Not auto-merged** — a human is the admission gate.";

const CI_CHECK = "- [ ] CI is green (build, referential integrity, tests).";

/**
 * The block a reviewer trusts. Stamped from the authenticated token, never from
 * the payload — the caller cannot assert who it is. `agent` and `operator` are
 * operator-set strings from the token table, so they are shown as code spans
 * rather than interpolated raw.
 */
function provenanceBlock(identity: TokenIdentity): string[] {
  return [
    `## Provenance`,
    ``,
    `Stamped server-side from the agent token; none of it is caller-asserted.`,
    ``,
    `- **operator** ${codeSpan(identity.operator ?? "unknown")}`,
    `- **agent** ${codeSpan(identity.agent)}`,
    `- **agentId** ${codeSpan(identity.agentId ?? "unknown")}`,
  ];
}

/** A caller-supplied prose block, contained and labelled. */
function callerBlock(heading: string, text: string): string[] {
  return [`## ${heading}`, ``, `Caller-supplied, shown verbatim:`, ``, fenceBlock(text)];
}

/**
 * A link destination in angle-bracket form.
 *
 * Bare `(url)` breaks on a URL containing unbalanced parentheses — which is not
 * exotic, it is every Wikipedia article with a disambiguator. The angle-bracket
 * form takes parentheses literally. `<` and `>` are percent-encoded so the
 * destination cannot be closed early; the scheme is already http(s) by schema.
 */
function linkDestination(url: string): string {
  return `<${url.replace(/</g, "%3C").replace(/>/g, "%3E")}>`;
}

function sourcesList(sources: readonly Source[]): string {
  if (sources.length === 0) return "_None._";
  return sources
    .map(
      (s) =>
        `- [${inlineText(s.label)}](${linkDestination(s.url)})${s.kind ? ` — ${s.kind}` : ""}`,
    )
    .join("\n");
}

export function claimPrBody(claim: Claim, rationale: string, identity: TokenIdentity): string {
  return [
    PREAMBLE,
    ``,
    ...callerBlock("Rationale", rationale),
    ``,
    `## Claim`,
    ``,
    `- **id** \`${claim.id}\` (minted server-side)`,
    `- **kind** ${claim.kind}`,
    `- **domain** ${codeSpan(claim.domain)}`,
    `- **confidence** ${claim.confidence}`,
    ``,
    ...callerBlock("Statement", claim.statement),
    ``,
    `## Sources`,
    ``,
    sourcesList(claim.sources),
    ``,
    ...provenanceBlock(identity),
    ``,
    `## Reviewer checklist`,
    ``,
    `- [ ] The sources are real, and they say what the claim says they say.`,
    `- [ ] Confidence is calibrated, not decorative.`,
    `- [ ] The claim is falsifiable and belongs in this domain.`,
    CI_CHECK,
  ].join("\n");
}

export function edgePrBody(
  edge: Edge,
  rationale: string,
  identity: TokenIdentity,
  crossDomain: boolean,
): string {
  return [
    PREAMBLE,
    ``,
    ...callerBlock("Rationale", rationale),
    ``,
    `## Edge`,
    ``,
    `- **id** \`${edge.id}\` (minted server-side)`,
    `- **relation** \`${edge.fromId}\` **${edge.kind}** \`${edge.toId}\``,
    `- **strength** ${edge.strength}`,
    `- **scope** ${crossDomain ? "cross-domain" : "intra-domain"}`,
    ``,
    `## Sources`,
    ``,
    sourcesList(edge.sources ?? []),
    ``,
    ...provenanceBlock(identity),
    ``,
    `## Reviewer checklist`,
    ``,
    `- [ ] Both endpoints exist and the direction is right.`,
    `- [ ] The relation kind and strength are defensible, not decorative.`,
    `- [ ] The rationale (and any sources) actually support the relation.`,
    CI_CHECK,
  ].join("\n");
}

export function predictionPrBody(
  forecastId: string,
  prediction: Prediction,
  rationale: string,
  identity: TokenIdentity,
): string {
  return [
    PREAMBLE,
    ``,
    ...callerBlock("Reasoning", rationale),
    ``,
    `## Prediction`,
    ``,
    `- **forecast** \`${forecastId}\``,
    `- **probability** ${prediction.probability}`,
    ...(prediction.dataAnchors.length > 0
      ? [``, `## Data anchors`, ``, sourcesList(prediction.dataAnchors)]
      : []),
    ``,
    ...provenanceBlock(identity),
    ``,
    `## Reviewer checklist`,
    ``,
    `- [ ] The probability is defensible and the reasoning supports it.`,
    `- [ ] Any data anchors are real and load.`,
    `- [ ] The prediction sharpens the ensemble spread rather than padding it.`,
    CI_CHECK,
  ].join("\n");
}

export function dossierPrBody(
  dossier: Dossier,
  rationale: string,
  identity: TokenIdentity,
): string {
  return [
    PREAMBLE,
    ``,
    ...callerBlock("Rationale", rationale),
    ``,
    `## Dossier on \`${dossier.attachedToClaimId}\``,
    ``,
    `${dossier.cruxes.length} ranked crux${dossier.cruxes.length === 1 ? "" : "es"}; ` +
      `${dossier.pro.keySources.length + dossier.con.keySources.length} cited sources across both sides.`,
    ``,
    ...callerBlock("Pro thesis", dossier.pro.thesis),
    ``,
    ...callerBlock("Con thesis", dossier.con.thesis),
    ``,
    ...provenanceBlock(identity),
    ``,
    `## Reviewer checklist`,
    ``,
    `- [ ] Both sides are genuinely steel-manned, not a strawman paired with a favourite.`,
    `- [ ] Every keySource is real and supports its side.`,
    `- [ ] The cruxes are the questions that would actually move the disagreement.`,
    CI_CHECK,
  ].join("\n");
}
