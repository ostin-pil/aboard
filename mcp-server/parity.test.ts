/**
 * Pins the stdio tool surface to the remote one (U2/U3 in
 * `plans/audit-2026-08.md`).
 *
 * Two independent MCP servers define the nine tools by hand: this package
 * (stdio, zod 3) and `src/lib/mcp/tools.ts` (remote, zod 4, derived from the
 * canonical payload schemas). Nothing held them in agreement until this suite,
 * which is the same pattern `enum-sync.test.ts` applies to the type layer.
 *
 * Three pins: the tool names, each tool's argument fields and which are
 * required, and a shared accept/reject vector set run through both packages'
 * hand-mirrored `HttpUrl` constraint — the security-relevant line U3 names.
 *
 * Placement: this file lives in mcp-server/ so its imports of the stdio
 * modules resolve THIS package's zod 3, while the remote import resolves the
 * root's zod 4, each side exactly as it ships. Neither tsconfig reads this
 * file (the root excludes mcp-server/, and this package's covers src/ only);
 * vitest's parity project is its reader, and a type error here fails at run
 * time inside `npm test` rather than nowhere.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { z as z3 } from "zod";
import { TOOLS } from "../src/lib/mcp/tools";
import { registerReadTools } from "./src/tools/read.js";
import { registerWriteTools } from "./src/tools/write.js";

// --- capture the stdio surface without an MCP transport ---------------------

type RawShape = Record<string, z3.ZodTypeAny>;
type Captured = { name: string; inputSchema: RawShape };

function captureStdioTools(): Captured[] {
  const captured: Captured[] = [];
  const fake = {
    registerTool(name: string, config: { inputSchema?: RawShape }): void {
      captured.push({ name, inputSchema: config.inputSchema ?? {} });
    },
  };
  registerReadTools(fake as never);
  registerWriteTools(fake as never);
  return captured;
}

const stdioTools = captureStdioTools();

function stdioTool(name: string): Captured {
  const tool = stdioTools.find((t) => t.name === name);
  if (!tool) throw new Error(`stdio server registers no tool named ${name}`);
  return tool;
}

function remoteProperties(name: string): { fields: string[]; required: string[] } {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`remote catalogue has no tool named ${name}`);
  const schema = tool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return {
    fields: Object.keys(schema.properties ?? {}).sort(),
    required: [...(schema.required ?? [])].sort(),
  };
}

// --- the guard that keeps this test honest ----------------------------------

it("resolves the stdio server's zod from this package, not the root", () => {
  const resolved = createRequire(import.meta.url).resolve("zod");
  // If this fails, mcp-server/node_modules is missing and every assertion
  // below would run zod 4 against zod 4. parity.setup.ts provisions it;
  // `npm ci` here by hand does the same.
  expect(resolved).toContain("mcp-server/node_modules");
});

// --- the three pins ----------------------------------------------------------

describe("tool surface parity", () => {
  it("registers exactly the remote catalogue's nine tools", () => {
    expect(stdioTools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
  });

  it("declares the same argument fields per tool", () => {
    for (const tool of TOOLS) {
      const stdio = stdioTool(tool.name);
      expect(Object.keys(stdio.inputSchema).sort(), tool.name).toEqual(
        remoteProperties(tool.name).fields,
      );
    }
  });

  it("agrees on which arguments are required", () => {
    for (const tool of TOOLS) {
      const stdio = stdioTool(tool.name);
      const stdioRequired = Object.entries(stdio.inputSchema)
        .filter(([, shape]) => !shape.isOptional())
        .map(([field]) => field)
        .sort();
      expect(stdioRequired, tool.name).toEqual(remoteProperties(tool.name).required);
    }
  });
});

describe("the hand-mirrored HttpUrl constraint (U3)", () => {
  // One vector set, both validators. `expected` is what BOTH must answer;
  // a side that disagrees has drifted from the other, whichever is "right".
  const VECTORS: { url: string; expected: boolean }[] = [
    { url: "https://example.org/paper", expected: true },
    { url: "http://example.org", expected: true },
    { url: "https://example.org/path?q=1#frag", expected: true },
    { url: "ftp://example.org/file", expected: false },
    { url: "javascript:alert(1)", expected: false },
    { url: "file:///etc/passwd", expected: false },
    { url: "data:text/html,hi", expected: false },
    { url: "not a url", expected: false },
    { url: "//example.org/protocol-relative", expected: false },
    { url: "", expected: false },
  ];

  function stdioSourceElement(): z3.ZodTypeAny {
    const sources = stdioTool("propose_claim").inputSchema.sources as z3.ZodTypeAny & {
      element?: z3.ZodTypeAny;
      _def: { innerType?: z3.ZodTypeAny };
    };
    // Unwrap array (and any default wrapper) down to the source object schema.
    const array = sources.element ? sources : sources._def.innerType;
    const element = (array as { element?: z3.ZodTypeAny }).element;
    if (!element) throw new Error("could not reach the stdio source schema");
    return element;
  }

  function remoteClaimArgs() {
    const tool = TOOLS.find((t) => t.name === "propose_claim");
    if (!tool) throw new Error("remote catalogue has no propose_claim");
    return tool.args;
  }

  const stdioAccepts = (source: Record<string, unknown>) =>
    stdioSourceElement().safeParse(source).success;

  const remoteAccepts = (source: Record<string, unknown>) =>
    remoteClaimArgs().safeParse({
      domain: "inequality",
      kind: "mechanism",
      title: "t",
      statement: "s",
      confidence: 0.5,
      sources: [source],
      rationale: "r",
    }).success;

  it.each(VECTORS)("both sides answer $expected for $url", ({ url, expected }) => {
    const source = { label: "vector", url };
    expect(stdioAccepts(source), "stdio").toBe(expected);
    expect(remoteAccepts(source), "remote").toBe(expected);
  });

  it("both sides refuse a source carrying an unknown key", () => {
    const source = { label: "vector", url: "https://example.org", publisher: "x" };
    expect(stdioAccepts(source)).toBe(false);
    expect(remoteAccepts(source)).toBe(false);
  });
});
