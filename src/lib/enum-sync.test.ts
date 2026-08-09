import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ClaimKind, EdgeKind } from "./types";

/**
 * `ClaimKind` and `EdgeKind` are canonical in `types.ts`, and both are re-typed
 * by hand in packages the root type-checker cannot see. That drift is what A4
 * was: `EdgeKind` gained `evidences` and the front end kept three kinds, so an
 * `evidences` edge was accepted by the write path and dropped by the renderer.
 *
 * The in-repo sites are not checked here, deliberately. Session 49 re-keyed
 * them off the canonical type (`EngineEdge["kind"]` is `EdgeKind`, and the
 * render/edit lookups are exhaustive `Record`s), so `tsc` fails the build at
 * the exact site that has not handled a new kind. A test asserting what the
 * compiler already proves would be ceremony.
 *
 * What is left are the copies no compiler in this gate reads: two separate npm
 * packages excluded from the root tsconfig, and prose in a tool description
 * that an agent consumes as the contract. Those get this test.
 */

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * Pull the quoted string literals out of the first line matching `anchor`.
 * Deliberately line-scoped: these are all single-line declarations, and a
 * whole-file scan would sweep up unrelated literals and pass by accident.
 */
function literalsOnLine(rel: string, anchor: RegExp): string[] {
  const line = read(rel)
    .split("\n")
    .find((l) => anchor.test(l));
  if (line === undefined) {
    throw new Error(`enum-sync: no line matching ${anchor} in ${rel}. ` + "The hand-copy moved; update this test to its new home.");
  }
  return [...line.matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]);
}

const claimKinds = [...ClaimKind.options].sort();
const edgeKinds = [...EdgeKind.options].sort();

describe("enum sync across packages the root tsconfig excludes", () => {
  it("mcp-server write tools accept exactly the canonical claim kinds", () => {
    expect(literalsOnLine("mcp-server/src/tools/write.ts", /const claimKind = z\.enum/).sort()).toEqual(claimKinds);
  });

  it("mcp-server write tools accept exactly the canonical edge kinds", () => {
    expect(literalsOnLine("mcp-server/src/tools/write.ts", /const edgeKind = z\.enum/).sort()).toEqual(edgeKinds);
  });

  it("mcp-server JSON-LD claim type lists the canonical claim kinds", () => {
    expect(literalsOnLine("mcp-server/src/types.ts", /"aboard:kind":/).sort()).toEqual(claimKinds);
  });

  it("mcp-server graph claim type lists the canonical claim kinds", () => {
    expect(literalsOnLine("mcp-server/src/types.ts", /^\s*kind: "symptom"/).sort()).toEqual(claimKinds);
  });

  it("the client adapter's claim type lists the canonical claim kinds", () => {
    expect(literalsOnLine("clients/briefing.ts", /"aboard:kind":/).sort()).toEqual(claimKinds);
  });

  it("the client adapter's edge type lists the canonical edge kinds", () => {
    expect(literalsOnLine("clients/briefing.ts", /"aboard:relation":/).sort()).toEqual(edgeKinds);
  });
});

describe("enum sync in agent-facing prose", () => {
  /**
   * A tool description is the contract an agent reads before it writes. If it
   * lists fewer kinds than the schema accepts, the schema is not what limits
   * the agent; the sentence is.
   */
  it("the MCP claim-kind description names every canonical claim kind", () => {
    const line = read("src/lib/mcp/tools.ts")
      .split("\n")
      .find((l) => l.includes("kind: z.string().describe("));
    expect(line).toBeDefined();
    for (const kind of ClaimKind.options) {
      expect(line).toContain(kind);
    }
  });
});
