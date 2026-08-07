import { describe, expect, it } from "vitest";
import { TOOLS, findTool, toolListing, type JsonSchema } from "@/lib/mcp/tools";

/** Properties of a rendered input schema, as a client would read them. */
function shape(name: string): { required: string[]; properties: Record<string, JsonSchema> } {
  const tool = findTool(name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  const schema = tool.inputSchema;
  return {
    required: (schema.required as string[] | undefined) ?? [],
    properties: (schema.properties as Record<string, JsonSchema> | undefined) ?? {},
  };
}

describe("the tool catalogue", () => {
  it("publishes nine tools with unique names", () => {
    expect(TOOLS).toHaveLength(9);
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(9);
  });

  it("lists five read tools and four write tools", () => {
    const reads = TOOLS.filter((t) => t.handler.kind === "read");
    const writes = TOOLS.filter((t) => t.handler.kind === "write");
    expect(reads.map((t) => t.name)).toEqual([
      "list_claims",
      "get_claim",
      "get_graph",
      "get_forecast",
      "get_dossier",
    ]);
    expect(writes.map((t) => t.name)).toEqual([
      "propose_claim",
      "propose_edge",
      "propose_forecast_prediction",
      "propose_dossier",
    ]);
  });

  it("gives every tool a non-empty description and an object input schema", () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("keeps the listing free of the executable schema", () => {
    const listed = toolListing();
    expect(listed).toHaveLength(9);
    expect(Object.keys(listed[0]).sort()).toEqual([
      "annotations",
      "description",
      "inputSchema",
      "name",
      "title",
    ]);
  });
});

describe("tool annotations", () => {
  it("marks every read tool read-only and closed-world", () => {
    for (const tool of TOOLS.filter((t) => t.handler.kind === "read")) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
    }
  });

  it("marks every write tool non-read-only, non-destructive and non-idempotent", () => {
    // Non-destructive is the substantive claim: a propose_* tool opens a pull
    // request that adds, and is never auto-merged, so it cannot destroy data.
    // Non-idempotent is the other one: two identical calls open two PRs.
    for (const tool of TOOLS.filter((t) => t.handler.kind === "write")) {
      expect(tool.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    }
  });

  it("omits the write-only hints on read tools rather than guessing them", () => {
    // The spec says destructive/idempotent are meaningful only when a tool is
    // not read-only. Emitting them anyway would answer a question nobody asked.
    for (const tool of TOOLS.filter((t) => t.handler.kind === "read")) {
      expect(tool.annotations.destructiveHint).toBeUndefined();
      expect(tool.annotations.idempotentHint).toBeUndefined();
    }
  });

  it("derives the hints from the handler, so they cannot disagree with it", () => {
    for (const tool of TOOLS) {
      expect(tool.annotations.readOnlyHint).toBe(tool.handler.kind === "read");
    }
  });
});
