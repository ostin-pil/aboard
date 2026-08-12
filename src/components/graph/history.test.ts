import { describe, it, expect } from "vitest";
import {
  createHistory,
  copySnapshot,
  pushSnapshot,
  stepBack,
  stepForward,
  type GraphSnapshot,
} from "./history";
import type { ClaimEdge, GraphNode } from "./types";

const node = (id: string, title = id): GraphNode =>
  ({
    id,
    type: "claim",
    position: { x: 0, y: 0 },
    data: { kind: "symptom", title, row: 1, col: 0 },
  }) as unknown as GraphNode;

const link = (id: string): ClaimEdge =>
  ({
    id,
    type: "claim",
    source: "S1",
    target: "M1",
    data: { kind: "causes" },
  }) as unknown as ClaimEdge;

const snap = (...ids: string[]): GraphSnapshot => ({
  nodes: ids.map((id) => node(id)),
  edges: [link("e1")],
});

const titles = (s: GraphSnapshot) =>
  s.nodes.map((n) => (n.data as { title: string }).title);

describe("copySnapshot", () => {
  // React Flow mutates the node objects it is handed, so a stack holding live
  // references has its own history rewritten under it.
  it("detaches the node objects and their data", () => {
    const original = snap("S1");
    const copy = copySnapshot(original);
    (copy.nodes[0].data as { title: string }).title = "mutated";
    expect(titles(original)).toEqual(["S1"]);
    expect(copy.nodes[0]).not.toBe(original.nodes[0]);
  });

  it("detaches edge data too", () => {
    const original = snap("S1");
    const copy = copySnapshot(original);
    (copy.edges[0].data as { kind: string }).kind = "reduces";
    expect(original.edges[0].data?.kind).toBe("causes");
  });
});

describe("pushSnapshot", () => {
  it("appends and moves the cursor to the new entry", () => {
    const h = pushSnapshot(createHistory(snap("S1")), snap("S1", "S2"));
    expect(h.stack).toHaveLength(2);
    expect(h.idx).toBe(1);
    expect(titles(h.stack[1])).toEqual(["S1", "S2"]);
  });

  // Editing after an undo forks the timeline; the abandoned branch must not be
  // reachable by redo, or redo replays a state the user backed out of.
  it("drops the redo tail", () => {
    let h = createHistory(snap("S1"));
    h = pushSnapshot(h, snap("S1", "S2"));
    h = pushSnapshot(h, snap("S1", "S2", "S3"));
    h = stepBack(h)!.history; // idx 1
    h = pushSnapshot(h, snap("S1", "S2", "X"));
    expect(h.stack).toHaveLength(3);
    expect(h.idx).toBe(2);
    expect(stepForward(h)).toBeNull();
    expect(titles(h.stack[2])).toEqual(["S1", "S2", "X"]);
  });

  it("caps the stack at the limit, dropping the oldest entry", () => {
    let h = createHistory(snap("first"));
    for (let i = 0; i < 5; i++) h = pushSnapshot(h, snap(`s${i}`), 3);
    expect(h.stack).toHaveLength(3);
    expect(h.idx).toBe(2);
    expect(titles(h.stack[0])).toEqual(["s2"]);
  });

  it("stores a copy, not the caller's arrays", () => {
    const live = snap("S1");
    const h = pushSnapshot(createHistory(snap("seed")), live);
    (live.nodes[0].data as { title: string }).title = "mutated later";
    expect(titles(h.stack[1])).toEqual(["S1"]);
  });

  it("leaves the input history untouched", () => {
    const before = createHistory(snap("S1"));
    pushSnapshot(before, snap("S2"));
    expect(before.stack).toHaveLength(1);
    expect(before.idx).toBe(0);
  });
});

describe("stepBack and stepForward", () => {
  const built = (() => {
    let h = createHistory(snap("a"));
    h = pushSnapshot(h, snap("b"));
    h = pushSnapshot(h, snap("c"));
    return h;
  })();

  it("walks back through the stack", () => {
    const one = stepBack(built)!;
    expect(titles(one.entry)).toEqual(["b"]);
    expect(one.history.idx).toBe(1);
    const two = stepBack(one.history)!;
    expect(titles(two.entry)).toEqual(["a"]);
    expect(two.history.idx).toBe(0);
  });

  it("is null at the oldest entry", () => {
    expect(stepBack(createHistory(snap("a")))).toBeNull();
  });

  it("walks forward again after stepping back", () => {
    const back = stepBack(built)!;
    const forward = stepForward(back.history)!;
    expect(titles(forward.entry)).toEqual(["c"]);
    expect(forward.history.idx).toBe(2);
  });

  it("is null at the newest entry", () => {
    expect(stepForward(built)).toBeNull();
  });

  // The entry handed to the caller goes straight into React state, where it is
  // mutated. Handing out the stored object would corrupt the stack on restore.
  it("hands out a copy of the stored entry", () => {
    const back = stepBack(built)!;
    (back.entry.nodes[0].data as { title: string }).title = "mutated";
    expect(titles(stepBack(built)!.entry)).toEqual(["b"]);
  });
});
