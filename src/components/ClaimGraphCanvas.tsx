"use client";

import { useEffect, useRef, useState } from "react";
import { ClaimGraphRF } from "./graph/ClaimGraphRF";

type Mode = "inline" | "fullbleed";

type Props = {
  data: EngineGraphData;
  mode?: Mode;
  editable?: boolean;
  onPersist?: (instance: AboardGraphInstance) => void;
  onZoom?: (scale: number) => void;
  onReady?: (instance: AboardGraphInstance) => void;
  className?: string;
  style?: React.CSSProperties;
};

export function ClaimGraphCanvas({
  data,
  mode = "inline",
  editable = false,
  onPersist,
  onZoom,
  onReady,
  className,
  style,
}: Props) {
  // Render the graph client-only. Its initial state derives from localStorage
  // (see ClaimGraphRFInner), which is undefined on the server, so a
  // server-prerendered graph and the hydrating client necessarily disagree —
  // under output:"export" that fired a hydration mismatch on every load with a
  // saved sandbox. Gating the subtree on a mounted flag keeps the sized wrapper
  // identical across server and first client render (so hydration matches),
  // then mounts the real graph in a client-only pass. The wrapper's CSS box
  // (.ag-inline / .ag-fullbleed) holds layout so nothing shifts.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // The one render that reconciles with the client environment: flip to the
    // real graph after mount. Setting state in this effect is the point of the
    // gate, not an accident — the React Compiler-preview rule flags it, but the
    // compiler is not enabled here (no reactCompiler in next.config).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <div
      className={`${mode === "fullbleed" ? "ag-fullbleed" : "ag-inline"}${
        className ? " " + className : ""
      }`}
      style={style}
    >
      {mounted ? (
        <ClaimGraphRF
          data={data}
          mode={mode}
          editable={editable}
          onPersist={onPersist}
          onZoom={onZoom}
          onReady={onReady}
        />
      ) : (
        <div className="ag-canvas-loading" role="status" aria-label="Loading graph" />
      )}
    </div>
  );
}

export function useGraphInstance(): React.RefObject<AboardGraphInstance | null> {
  return useRef<AboardGraphInstance | null>(null);
}
