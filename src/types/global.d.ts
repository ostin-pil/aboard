export {};

declare global {
  interface Window {
    AboardGraph?: {
      mount: (
        rootEl: HTMLElement,
        opts: {
          mode?: "inline" | "fullbleed";
          editable?: boolean;
          data?: EngineGraphData;
          onPersist?: () => void;
          onZoom?: (scale: number) => void;
        }
      ) => AboardGraphInstance;
      SEED: EngineGraphData;
    };
  }

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

  interface EngineEdge {
    from: string;
    to: string;
    kind: "causes" | "moderates" | "reduces";
    author?: string;
    rationale?: string;
    crossDomain?: boolean;
  }

  interface EngineGraphData {
    domain?: string;
    domains?: string[];
    nodes: EngineNode[];
    edges: EngineEdge[];
  }
}
