"use client";

import { useEffect, useRef, useState } from "react";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<AboardGraphInstance | null>(null);
  const [, setReady] = useState(false);

  useEffect(() => {
    if (!rootRef.current) return;
    let cancelled = false;
    let pollHandle: number | undefined;

    function tryMount() {
      if (cancelled) return;
      const root = rootRef.current;
      if (!root) return;
      if (!window.AboardGraph) {
        pollHandle = window.setTimeout(tryMount, 50);
        return;
      }
      root.innerHTML = "";
      const instance = window.AboardGraph.mount(root, {
        mode,
        editable,
        data,
        onPersist: () => {
          if (instance && onPersist) onPersist(instance);
        },
        onZoom,
      });
      instanceRef.current = instance;
      setReady(true);
      onReady?.(instance);
    }

    tryMount();

    return () => {
      cancelled = true;
      if (pollHandle) window.clearTimeout(pollHandle);
      if (rootRef.current) rootRef.current.innerHTML = "";
      instanceRef.current = null;
    };
  }, [mode, editable, data, onPersist, onZoom, onReady]);

  return (
    <div
      ref={rootRef}
      className={`${mode === "fullbleed" ? "ag-fullbleed" : "ag-inline"}${
        className ? " " + className : ""
      }`}
      style={style}
    />
  );
}

export function useGraphInstance(): React.RefObject<AboardGraphInstance | null> {
  return useRef<AboardGraphInstance | null>(null);
}
