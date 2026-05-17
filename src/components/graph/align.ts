/**
 * Pure horizontal align / distribute math. Operates in a single coordinate
 * space (caller passes absolute X, gets absolute X back). Widths are uniform
 * for claim cards so only X + width are needed.
 *
 * Y alignment is intentionally NOT here: rows carry semantic meaning
 * (symptom/mechanism/leverage), so vertical placement is handled as a
 * row-snap in the caller, not as free-form pixel alignment.
 */

export type XBox = { id: string; x: number; w: number };
export type HAlign = "left" | "hcenter" | "right";

export function alignX(boxes: XBox[], op: HAlign): Map<string, number> {
  const out = new Map<string, number>();
  if (boxes.length < 2) return out;

  if (op === "left") {
    const minX = Math.min(...boxes.map((b) => b.x));
    for (const b of boxes) out.set(b.id, minX);
    return out;
  }
  if (op === "right") {
    const maxRight = Math.max(...boxes.map((b) => b.x + b.w));
    for (const b of boxes) out.set(b.id, maxRight - b.w);
    return out;
  }
  // hcenter — align centers to the selection's bounding-box center.
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxRight = Math.max(...boxes.map((b) => b.x + b.w));
  const center = (minX + maxRight) / 2;
  for (const b of boxes) out.set(b.id, center - b.w / 2);
  return out;
}

/**
 * Even horizontal spacing between bounding boxes (Figma "distribute
 * horizontal spacing"). First and last boxes stay put; the gap between
 * every adjacent pair becomes equal. Needs ≥3 boxes to be meaningful.
 */
export function distributeX(boxes: XBox[]): Map<string, number> {
  const out = new Map<string, number>();
  if (boxes.length < 3) return out;

  const sorted = [...boxes].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last.x + last.w - first.x;
  const totalW = sorted.reduce((s, b) => s + b.w, 0);
  const gap = (span - totalW) / (sorted.length - 1);

  let cursor = first.x;
  for (const b of sorted) {
    out.set(b.id, cursor);
    cursor += b.w + gap;
  }
  return out;
}
