import { z } from "zod";

export const AgentAttribution = z.object({
  agent: z.string(),
  promptTitle: z.string().optional(),
  promptHash: z.string().optional(),
  generatedAt: z.string(),
});
export type AgentAttribution = z.infer<typeof AgentAttribution>;

export const Source = z.object({
  label: z.string(),
  url: z.string().url(),
  excerpt: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

export const ClaimKind = z.enum(["symptom", "mechanism", "leverage_point"]);
export type ClaimKind = z.infer<typeof ClaimKind>;

export const Claim = z.object({
  id: z.string(),
  kind: ClaimKind,
  title: z.string(),
  statement: z.string(),
  domain: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(Source),
  authoredBy: AgentAttribution,
  createdAt: z.string(),
});
export type Claim = z.infer<typeof Claim>;

export const EdgeKind = z.enum(["causes", "moderates", "reduces", "evidences"]);
export type EdgeKind = z.infer<typeof EdgeKind>;

export const Edge = z.object({
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
  kind: EdgeKind,
  strength: z.number().min(0).max(1),
  rationale: z.string().optional(),
});
export type Edge = z.infer<typeof Edge>;

export const Prediction = z.object({
  agent: AgentAttribution,
  probability: z.number().min(0).max(1),
  reasoning: z.string(),
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
};

export const cruxRank = (c: Crux) => c.impactScore * c.uncertainty;
