import { z } from "zod";

export const AgentAttribution = z.object({
  agent: z.string(),
  promptTitle: z.string().optional(),
  promptHash: z.string().optional(),
  generatedAt: z.string(),
  /**
   * The accountable human or organisation behind the credential that filed
   * this. Stamped server-side from the agent token; never read from a caller's
   * payload, because the whole point is that it cannot be self-asserted.
   */
  operator: z.string().optional(),
  /**
   * Stable identifier for the agent *configuration* (model + prompt + tool
   * stack), as distinct from `agent`, which is a free-form label. Also stamped
   * server-side. The ERC-8004 pattern, off-chain.
   */
  agentId: z.string().optional(),
});
export type AgentAttribution = z.infer<typeof AgentAttribution>;

export const SourceKind = z.enum([
  "dataset",
  "paper",
  "news",
  "policy",
  "book",
  "report",
  "court",
  "blog",
  "statute",
]);
export type SourceKind = z.infer<typeof SourceKind>;

/**
 * A source URL, constrained to http(s).
 *
 * Zod's bare `.url()` accepts `javascript:`, `data:` and `vbscript:` — verified
 * by execution, not assumed. Nothing renders a source through a script-capable
 * sink today (React blocks `javascript:` hrefs, and there is no `innerHTML`
 * path), so this is defence in depth rather than a live hole. What it actually
 * prevents is an unsafe scheme reaching `data/` at all, where it would outlive
 * whichever renderer happens to be safe this year and would appear as a link
 * target in the proposal PR body a reviewer reads.
 */
export const HttpUrl = z.url({ protocol: /^https?$/ });

export const Source = z.object({
  label: z.string(),
  url: HttpUrl,
  kind: SourceKind.optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  authors: z.string().optional(),
  finding: z.string().optional(),
  excerpt: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

export const ClaimKind = z.enum(["symptom", "mechanism", "leverage_point"]);
export type ClaimKind = z.infer<typeof ClaimKind>;

export const DataPoint = z.object({
  metric: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  period: z.string(),
  geography: z.string().optional(),
  source: Source,
  note: z.string().optional(),
});
export type DataPoint = z.infer<typeof DataPoint>;

export const Claim = z.object({
  id: z.string(),
  kind: ClaimKind,
  title: z.string(),
  statement: z.string(),
  domain: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(Source),
  dataPoints: z.array(DataPoint).default([]),
  analyses: z.array(z.string()).default([]),
  authoredBy: AgentAttribution,
  createdAt: z.string(),
});
export type Claim = z.infer<typeof Claim>;

export const AnalysisKind = z.enum([
  "regression",
  "comparison",
  "synthesis",
  "simulation",
  "qualitative",
]);
export type AnalysisKind = z.infer<typeof AnalysisKind>;

export const Analysis = z.object({
  id: z.string(),
  domain: z.string(),
  kind: AnalysisKind,
  title: z.string(),
  summary: z.string(),
  methodology: z.string().optional(),
  dataSources: z.array(Source),
  producedFinding: z.string(),
  authoredBy: AgentAttribution,
  createdAt: z.string(),
});
export type Analysis = z.infer<typeof Analysis>;

export const EdgeKind = z.enum(["causes", "moderates", "reduces", "evidences"]);
export type EdgeKind = z.infer<typeof EdgeKind>;

export const Edge = z.object({
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
  kind: EdgeKind,
  strength: z.number().min(0).max(1),
  /**
   * Required: the graph classifies relations on stated reasoning rather than
   * on edge counts, which means the reasoning has to always be there to read.
   */
  rationale: z.string(),
  sources: z.array(Source).default([]),
});
export type Edge = z.infer<typeof Edge>;

export const BaseRate = z.object({
  question: z.string(),
  rate: z.number().min(0).max(1),
  source: Source,
});
export type BaseRate = z.infer<typeof BaseRate>;

export const Prediction = z.object({
  agent: AgentAttribution,
  probability: z.number().min(0).max(1),
  reasoning: z.string(),
  baseRates: z.array(BaseRate).default([]),
  dataAnchors: z.array(Source).default([]),
  createdAt: z.string(),
});
export type Prediction = z.infer<typeof Prediction>;

/**
 * How a resolved forecast came out.
 *
 * Binary forecasts use `"yes"` / `"no"`, which map to 1 / 0 for proper
 * scoring. The numeric arm is reserved for range questions; no `Prediction`
 * shape can express one yet, so nothing in the corpus uses it today.
 */
export const ResolvedOutcome = z.union([z.enum(["yes", "no"]), z.number()]);
export type ResolvedOutcome = z.infer<typeof ResolvedOutcome>;

export const Forecast = z
  .object({
    id: z.string(),
    attachedToClaimId: z.string(),
    question: z.string(),
    resolutionDate: z.string(),
    resolutionCriteria: z.string(),
    /**
     * The external, real-world thing that resolves this forecast: the
     * third-party dataset or publication a reader checks, not aboard's own
     * judgement. Every defense that resists gaming terminates in an anchor
     * outside the agent graph, and for forecasts this is that anchor.
     *
     * Optional while the corpus backfills. A forecast without one is a
     * finding in `resolution-lint`, not a load error.
     */
    resolutionSource: Source.optional(),
    /**
     * Absent means "not resolved yet". An explicit `null` means "resolved as
     * annulled" — the question turned out to be unresolvable, so it is
     * excluded from scoring rather than left pending forever.
     */
    resolvedOutcome: ResolvedOutcome.nullable().optional(),
    resolvedAt: z.string().optional(),
    /**
     * IDs of the forecasts that replace this one. A forecast whose criteria
     * turn out to be under-specified is never edited in place — editing
     * criteria under existing predictions changes what those predictions
     * were answering — so the repair is new forecasts, and this field points
     * at them. The superseded forecast stays filed as historical record.
     */
    supersededBy: z.array(z.string()).min(1).optional(),
    predictions: z.array(Prediction),
  })
  // A resolution without a date cannot be audited or scored in order, so the
  // two fields travel together.
  .refine((f) => f.resolvedOutcome === undefined || f.resolvedAt !== undefined, {
    message: "resolvedAt is required once resolvedOutcome is set",
    path: ["resolvedAt"],
  });
export type Forecast = z.infer<typeof Forecast>;

export const Argument = z.object({
  thesis: z.string(),
  steelmannedSummary: z.string(),
  keySources: z.array(Source),
  authoredBy: AgentAttribution,
});
export type Argument = z.infer<typeof Argument>;

export const Crux = z.object({
  statement: z.string(),
  impactScore: z.number().min(0).max(1),
  uncertainty: z.number().min(0).max(1),
});
export type Crux = z.infer<typeof Crux>;

export const Dossier = z.object({
  attachedToClaimId: z.string(),
  pro: Argument,
  con: Argument,
  cruxes: z.array(Crux),
});
export type Dossier = z.infer<typeof Dossier>;

export type ClaimGraph = {
  claims: Claim[];
  edges: Edge[];
  forecasts: Forecast[];
  dossiers: Dossier[];
  analyses: Analysis[];
};

export const cruxRank = (c: Crux) => c.impactScore * c.uncertainty;
