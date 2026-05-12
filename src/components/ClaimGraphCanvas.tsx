"use client";

import { useRef } from "react";
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
  return (
    <div
      className={`${mode === "fullbleed" ? "ag-fullbleed" : "ag-inline"}${
        className ? " " + className : ""
      }`}
      style={style}
    >
      <ClaimGraphRF
        data={data}
        mode={mode}
        editable={editable}
        onPersist={onPersist}
        onZoom={onZoom}
        onReady={onReady}
      />
    </div>
  );
}

export function useGraphInstance(): React.RefObject<AboardGraphInstance | null> {
  return useRef<AboardGraphInstance | null>(null);
}
