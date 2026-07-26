import { describe, expect, it } from "vitest";
import { z } from "zod";
import { INTRO_SLUG, parseDocument, requireSection, slugify, splitSections } from "./parse";

/**
 * Structure only. These assert that a document parses into the shape a page
 * consumes and that a broken document fails loudly; they never assert the prose
 * itself, which is the point of moving copy out of code. Editing `content/`
 * must not require editing a test.
 */

const Doc = z.object({ title: z.string().trim().min(1) });

describe("slugify", () => {
  it("kebab-cases a heading", () => {
    expect(slugify("Three modules over a shared claim graph")).toBe(
      "three-modules-over-a-shared-claim-graph",
    );
  });

  it("drops apostrophes rather than replacing them", () => {
    expect(slugify("Why dossiers don't synthesize")).toBe("why-dossiers-dont-synthesize");
    expect(slugify("Why dossiers don’t synthesize")).toBe("why-dossiers-dont-synthesize");
  });

  it("collapses punctuation runs and trims edges", () => {
    expect(slugify("  What this is not!  ")).toBe("what-this-is-not");
  });
});

describe("splitSections", () => {
  it("puts content before the first heading in the intro section", () => {
    const sections = splitSections("Lede paragraph.\n\n## First\n\nBody.");
    expect(sections.map((s) => s.slug)).toEqual([INTRO_SLUG, "first"]);
    expect(sections[0].title).toBe("");
    expect(sections[0].markdown).toBe("Lede paragraph.");
    expect(sections[1].markdown).toBe("Body.");
  });

  it("omits an empty intro when the document opens with a heading", () => {
    const sections = splitSections("## First\n\nBody.");
    expect(sections.map((s) => s.slug)).toEqual(["first"]);
  });

  it("keeps a section that has a heading but no body", () => {
    const sections = splitSections("## Cards\n\n## After\n\nBody.");
    expect(sections.map((s) => s.slug)).toEqual(["cards", "after"]);
    expect(sections[0].markdown).toBe("");
  });

  it("does not split on a heading inside a fenced code block", () => {
    const sections = splitSections("## Real\n\n```\n## not a heading\n```\n\nAfter.");
    expect(sections.map((s) => s.slug)).toEqual(["real"]);
    expect(sections[0].markdown).toContain("## not a heading");
  });

  it("leaves h1 and h3 alone", () => {
    const sections = splitSections("# Title\n\n### Sub\n\n## Real");
    expect(sections.map((s) => s.slug)).toEqual([INTRO_SLUG, "real"]);
  });
});

describe("parseDocument", () => {
  it("returns validated frontmatter, the verbatim body, and its sections", () => {
    const doc = parseDocument("---\ntitle: About\n---\n\nLede.\n\n## One\n\nBody.\n", Doc, "about.md");
    expect(doc.data.title).toBe("About");
    expect(doc.body).toBe("Lede.\n\n## One\n\nBody.");
    expect(doc.sections.map((s) => s.slug)).toEqual([INTRO_SLUG, "one"]);
  });

  it("names the file and the field when frontmatter is invalid", () => {
    expect(() => parseDocument("---\ntitle: '  '\n---\nBody.", Doc, "content/about.md")).toThrow(
      /content\/about\.md[\s\S]*title/,
    );
  });

  it("rejects a document with no frontmatter at all", () => {
    expect(() => parseDocument("Just prose.", Doc, "content/about.md")).toThrow(/title/);
  });
});

describe("requireSection", () => {
  const sections = splitSections("## One\n\nA.\n\n## Two\n\nB.");

  it("returns the matching section", () => {
    expect(requireSection(sections, "two", "about.md").markdown).toBe("B.");
  });

  it("throws and lists what it has when a slug is missing", () => {
    expect(() => requireSection(sections, "three", "content/about.md")).toThrow(
      /content\/about\.md[\s\S]*three[\s\S]*one, two/,
    );
  });
});
