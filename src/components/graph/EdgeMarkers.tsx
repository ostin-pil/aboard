"use client";

/**
 * The `<defs>` block of arrowhead markers every claim edge references by id,
 * and the table deciding which kinds get one.
 *
 * These used to be two hand-maintained lists in two files: `ARROWHEAD` in
 * `ClaimEdge.tsx` decided whether an edge asked for `url(#ag-rf-ah-<kind>)`,
 * and `ClaimGraphRF.tsx` hard-coded three `<marker>` elements. A kind set true
 * there without a marker here asks for an id that does not exist, and SVG
 * renders that as no arrowhead rather than as an error. One list now, with the
 * markers derived from it, so the two cannot disagree.
 */
export const EDGE_ARROWHEAD: Record<EngineEdge["kind"], boolean> = {
  causes: true,
  moderates: false,
  reduces: true,
  evidences: true,
};

const ARROWHEAD_KINDS = (
  Object.keys(EDGE_ARROWHEAD) as EngineEdge["kind"][]
).filter((kind) => EDGE_ARROWHEAD[kind]);

export function EdgeMarkerDefs() {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      <defs>
        {ARROWHEAD_KINDS.map((kind) => (
          <marker
            key={kind}
            id={`ag-rf-ah-${kind}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth={6.5}
            markerHeight={6.5}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 z" fill={`var(--edge-${kind})`} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
