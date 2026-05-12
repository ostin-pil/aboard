import type { ClaimEdge, ClaimNode } from "./types";

export type LayoutMode = "inline" | "fullbleed";

const LAYOUT = {
  inline: {
    nodeW: 188,
    rowGap: 132,
    colGap: 22,
    rowY: { 1: 60, 2: 192, 3: 324 } as Record<1 | 2 | 3, number>,
    padX: 16,
  },
  fullbleed: {
    nodeW: 240,
    rowGap: 210,
    colGap: 36,
    rowY: { 1: 110, 2: 320, 3: 530 } as Record<1 | 2 | 3, number>,
    padX: 60,
  },
} as const;

export function engineToRF(
  data: EngineGraphData,
  mode: LayoutMode
): { nodes: ClaimNode[]; edges: ClaimEdge[] } {
  const layout = LAYOUT[mode];
  const byRow: Record<1 | 2 | 3, EngineNode[]> = { 1: [], 2: [], 3: [] };
  for (const n of data.nodes) {
    if (n.row >= 1 && n.row <= 3) byRow[n.row as 1 | 2 | 3].push(n);
  }
  for (const r of [1, 2, 3] as const) {
    byRow[r].sort((a, b) => a.col - b.col);
  }

  const nodes: ClaimNode[] = [];
  for (const row of [1, 2, 3] as const) {
    byRow[row].forEach((n, i) => {
      nodes.push({
        id: n.id,
        type: "claim",
        position: {
          x: layout.padX + i * (layout.nodeW + layout.colGap),
          y: layout.rowY[row],
        },
        data: {
          kind: n.kind,
          title: n.title,
          body: n.body ?? "",
          meta: n.meta ?? "",
          conf: n.conf ?? 0,
          author: n.author ?? "",
          filed: n.filed ?? "",
          row: row,
          col: i,
          dossier: !!n.dossier,
          forecast: n.forecast ?? 0,
          domain: n.domain,
          outOfDomain: false,
        },
      });
    });
  }

  const edges: ClaimEdge[] = data.edges.map((e, i) => ({
    id: `${e.from}->${e.to}#${e.kind}#${i}`,
    type: "claim",
    source: e.from,
    target: e.to,
    data: {
      kind: e.kind,
      rationale: e.rationale ?? "",
      sources: e.sources ?? [],
      crossDomain: !!e.crossDomain,
      outOfDomain: false,
    },
  }));

  return { nodes, edges };
}

export function rfToEngine(
  nodes: ClaimNode[],
  edges: ClaimEdge[],
  domains: string[] | undefined,
  domain: string | undefined
): EngineGraphData {
  const engineNodes: EngineNode[] = nodes.map((n) => {
    const out: EngineNode = {
      id: n.id,
      kind: n.data.kind,
      title: n.data.title,
      row: n.data.row,
      col: n.data.col,
    };
    if (n.data.body) out.body = n.data.body;
    if (n.data.meta) out.meta = n.data.meta;
    if (n.data.conf) out.conf = n.data.conf;
    if (n.data.author) out.author = n.data.author;
    if (n.data.filed) out.filed = n.data.filed;
    if (n.data.dossier) out.dossier = true;
    if (n.data.forecast) out.forecast = n.data.forecast;
    if (n.data.domain) out.domain = n.data.domain;
    return out;
  });
  const engineEdges: EngineEdge[] = edges.map((e) => {
    const out: EngineEdge = {
      from: e.source,
      to: e.target,
      kind: e.data?.kind ?? "causes",
    };
    if (e.data?.rationale) out.rationale = e.data.rationale;
    if (e.data?.sources && e.data.sources.length > 0) out.sources = e.data.sources;
    if (e.data?.crossDomain) out.crossDomain = true;
    return out;
  });
  return { domain, domains, nodes: engineNodes, edges: engineEdges };
}
