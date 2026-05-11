import { z } from "zod";

export const AgentAttribution = z.object({
  agent: z.string(),
  promptTitle: z.string().optional(),
  promptHash: z.string().optional(),
  generatedAt: z.string(),
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

export const Source = z.object({
  label: z.string(),
  url: z.string().url(),
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
  rationale: z.string().optional(),
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

export const Forecast = z.object({
  id: z.string(),
  attachedToClaimId: z.string(),
  question: z.string(),
  resolutionDate: z.string(),
  resolutionCriteria: z.string(),
  predictions: z.array(Prediction),
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
