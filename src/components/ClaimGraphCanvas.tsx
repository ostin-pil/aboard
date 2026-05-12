"use client";

import { useEffect, useRef } from "react";

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

  // Stash callbacks in refs so changes to their identity (which happens every
  // parent render for inline arrows) don't retrigger the mount effect. The
  // engine should only re-mount when mode/editable/data actually change.
  const onPersistRef = useRef(onPersist);
  const onZoomRef = useRef(onZoom);
  const onReadyRef = useRef(onReady);
  onPersistRef.current = onPersist;
  onZoomRef.current = onZoom;
  onReadyRef.current = onReady;

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
          if (instance) onPersistRef.current?.(instance);
        },
        onZoom: (s) => onZoomRef.current?.(s),
      });
      instanceRef.current = instance;
      onReadyRef.current?.(instance);
    }

    tryMount();

    return () => {
      cancelled = true;
      if (pollHandle) window.clearTimeout(pollHandle);
      if (rootRef.current) rootRef.current.innerHTML = "";
      instanceRef.current = null;
    };
  }, [mode, editable, data]);

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
