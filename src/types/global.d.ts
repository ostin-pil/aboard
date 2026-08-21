// The import is what makes this a module, which `declare global` requires.
// It also stops `EngineEdge["kind"]` being a hand-copy of the canonical enum:
// every render and edit site downstream keys its lookup tables off this type,
// so adding a kind to `EdgeKind` fails the build at each site that has not
// handled it. Before session 49 this union was one kind short of canonical and
// `engine-adapter.ts` filtered the difference away, so an `evidences` edge in
// `data/` was dropped from the graph without a word.
import type { EdgeKind } from "@/lib/types";

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
    // True when a persisted sandbox was restored but the canonical seed has
    // since changed (claims added/removed in data/). The chrome uses it to
    // offer a refresh without discarding the user's local edits.
    seedDrift: boolean;
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
    kind: EdgeKind;
    author?: string;
    rationale?: string;
    crossDomain?: boolean;
    sources?: EngineEdgeSource[];
    /**
     * The edge's id in `data/`, for an edge that came from there.
     *
     * Absent means sandbox-authored: an edge the user drew, which has no id
     * until the exporter mints one. Named `canonicalId` rather than `id`
     * because React Flow gives every edge an `id` of its own
     * (`<from>-><to>#<kind>#<i>`, synthesized for rendering), and the two are
     * not interchangeable — writing the React Flow id into `edges.yaml` is
     * the same class of defect as re-minting from `E1`.
     */
    canonicalId?: string;
    /**
     * The edge's calibrated strength in `data/`, likewise absent for a
     * sandbox-authored edge. Carried through the engine shape for one reason:
     * the exporter emits the merged edge set, so an edge it does not know the
     * strength of is an edge it would write back at the placeholder value,
     * silently overwriting a number a reviewer tuned by hand.
     */
    strength?: number;
  }

  interface EngineGraphData {
    domain?: string;
    domains?: string[];
    nodes: EngineNode[];
    edges: EngineEdge[];
  }
}
