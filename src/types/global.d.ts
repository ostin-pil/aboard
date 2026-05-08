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
  }

  interface EngineEdge {
    from: string;
    to: string;
    kind: "causes" | "moderates" | "reduces";
    author?: string;
  }

  interface EngineGraphData {
    domain?: string;
    nodes: EngineNode[];
    edges: EngineEdge[];
  }
}
