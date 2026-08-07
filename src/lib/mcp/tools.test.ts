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
      "outputSchema",
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

describe("parameter descriptions", () => {
  // Every published parameter carries a description. This is what a caller
  // reads to fill the argument in, and it is separately what the Smithery
  // listing scores; 5 of 9 tools failed it before the payload schemas in
  // proposals.ts were described.
  it("describes every parameter of every tool", () => {
    const undescribed: string[] = [];
    for (const tool of toolListing()) {
      const properties = (tool.inputSchema.properties ?? {}) as Record<
        string,
        { description?: string }
      >;
      for (const [field, schema] of Object.entries(properties)) {
        if (!schema.description?.trim()) undescribed.push(`${tool.name}.${field}`);
      }
    }
    expect(undescribed).toEqual([]);
  });
});

// The point of deriving these from the canonical Zod payloads is that a client
// is told exactly what the validator will accept. These assert the derivation
// survived, not the wording of any particular field.
describe("write tool schemas, derived from the canonical payloads", () => {
  it("requires on propose_claim exactly what ClaimPayload requires, plus a rationale", () => {
    const { required, properties } = shape("propose_claim");
    expect(required.sort()).toEqual([
      "confidence",
      "domain",
      "kind",
      "rationale",
      "sources",
      "statement",
      "title",
    ]);
    // Server-stamped fields are absent, so a caller cannot even name them.
    expect(properties.id).toBeUndefined();
    expect(properties.authoredBy).toBeUndefined();
    expect(properties.createdAt).toBeUndefined();
  });

  it("carries the one-source-minimum onto the wire", () => {
    const { properties } = shape("propose_claim");
    expect(properties.sources.minItems).toBe(1);
  });

  it("carries the 0..1 bounds on a probability", () => {
    const { properties } = shape("propose_forecast_prediction");
    expect(properties.probability).toMatchObject({ type: "number", minimum: 0, maximum: 1 });
  });

  it("leaves defaulted fields optional", () => {
    // Each of these has a default in its payload schema, so a caller may omit it.
    expect(shape("propose_edge").required).not.toContain("sources");
    expect(shape("propose_forecast_prediction").required).not.toContain("dataAnchors");
    expect(shape("propose_dossier").required).not.toContain("cruxes");
  });

  it("requires both sides of a dossier", () => {
    const { required } = shape("propose_dossier");
    expect(required).toContain("pro");
    expect(required).toContain("con");
  });

  it("names the rationale field each write tool actually reads", () => {
    for (const tool of TOOLS) {
      if (tool.handler.kind !== "write") continue;
      const { required } = shape(tool.name);
      expect(required).toContain(tool.handler.rationaleField);
    }
  });

  it("tells the caller a token is needed and that nothing auto-merges", () => {
    for (const tool of TOOLS) {
      if (tool.handler.kind !== "write") continue;
      expect(tool.description).toMatch(/Bearer/);
      expect(tool.description).toMatch(/NEVER auto-merged/);
    }
  });
});

describe("read tool schemas", () => {
  it("requires an id where one is needed and nothing where none is", () => {
    expect(shape("get_claim").required).toEqual(["id"]);
    expect(shape("get_forecast").required).toEqual(["id"]);
    expect(shape("get_dossier").required).toEqual(["claim_id"]);
    expect(shape("get_graph").required).toEqual([]);
    expect(shape("list_claims").required).toEqual([]);
  });
});

describe("findTool", () => {
  it("finds a tool by name and is case-sensitive", () => {
    expect(findTool("get_claim")?.name).toBe("get_claim");
    expect(findTool("Get_Claim")).toBeUndefined();
    expect(findTool("nope")).toBeUndefined();
  });
});

describe("output schemas", () => {
  it("declares one for every tool", () => {
    for (const tool of toolListing()) {
      expect(tool.outputSchema, tool.name).toBeTruthy();
      expect(Object.keys(tool.outputSchema).length, tool.name).toBeGreaterThan(1);
    }
  });

  it("leaves no dangling $ref, so a client can validate offline", () => {
    // The whole reason the closures are inlined rather than referenced by URL.
    // A schema that names a definition it does not carry is worse than none:
    // a validator fails open on it and the caller never learns why.
    for (const tool of TOOLS) {
      const carried = new Set(
        Object.keys((tool.outputSchema.$defs ?? {}) as Record<string, unknown>),
      );
      const named = new Set<string>();
      const walk = (node: unknown): void => {
        if (node === null || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(walk);
        for (const [key, value] of Object.entries(node)) {
          if (key === "$ref" && typeof value === "string") named.add(value);
          else walk(value);
        }
      };
      walk(tool.outputSchema);
      for (const ref of named) {
        expect(ref.startsWith("#/$defs/"), `${tool.name} uses a non-local $ref: ${ref}`).toBe(true);
        expect(carried.has(ref.slice("#/$defs/".length)), `${tool.name} -> ${ref}`).toBe(true);
      }
    }
  });

  it("declares the dialect its $defs are actually written in", () => {
    // v0.json is 2020-12, so any schema carrying its definitions is 2020-12. An
    // envelope rendered from Zod declares draft-07, and an earlier draft of
    // this module let that label survive onto a document that had 2020-12
    // definitions spliced into it. Ajv refused to compile the result, which is
    // the good outcome; a laxer validator would have accepted a lie.
    for (const tool of TOOLS) {
      if (tool.outputSchema.$defs === undefined) continue;
      expect(String(tool.outputSchema.$schema), tool.name).toContain("2020-12");
    }
  });

  it("says a proposal is never auto-merged, in the type and not only the prose", () => {
    // The write path has no branch that merges, so `merged` is a constant. A
    // plain boolean would describe a state the server cannot reach.
    for (const tool of TOOLS.filter((t) => t.handler.kind === "write")) {
      const properties = tool.outputSchema.properties as Record<string, JsonSchema>;
      expect(properties.merged.const, tool.name).toBe(false);
      expect(tool.outputSchema.required).toContain("merged");
    }
  });

  it("gives the read tools the published document shapes rather than a restatement", () => {
    const graph = findTool("get_graph")?.outputSchema ?? {};
    const claim = findTool("get_claim")?.outputSchema ?? {};
    // `const` on @type is what v0.json uses to discriminate the two documents;
    // finding it here is how we know the definition was lifted, not retyped.
    expect((graph.properties as Record<string, JsonSchema>)["@type"].const).toBe(
      "aboard:ClaimGraph",
    );
    expect(graph.required).toContain("aboard:claims");
    expect(claim.required).toContain("aboard:id");
  });
});
