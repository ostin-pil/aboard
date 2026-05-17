export {};

declare global {
  interface AboardGraphInstance {
    state: EngineGraphData;
    render: () => void;
    addNode: () => void;
    undo: () => void;
    redo: () => void;
    fitView: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    zoom: () => number;
    reset: () => void;
    exportJSONLD: () => string;
    setActiveDomain: (domain: string | "all") => void;
  }

  interface EngineNode {
    id: string;
    kind: "symptom" | "mechanism" | "leverage";
    title: string;
    body?: string;
    meta?: string;
    conf?: number;
    author?: string;
    filed?: string;
    row: 1 | 2 | 3;
    col: number;
    dossier?: boolean;
    forecast?: number;
    domain?: string;
  }

  interface EngineEdgeSource {
    label: string;
    url: string;
    kind?: string;
    finding?: string;
  }

  interface EngineEdge {
    from: string;
    to: string;
    kind: "causes" | "moderates" | "reduces";
    author?: string;
    rationale?: string;
    crossDomain?: boolean;
    sources?: EngineEdgeSource[];
  }

  interface EngineGraphData {
    domain?: string;
    domains?: string[];
    nodes: EngineNode[];
    edges: EngineEdge[];
  }
}
