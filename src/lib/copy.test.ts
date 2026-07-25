import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_INTRO,
  DOSSIER_GLOSS,
  HEADLINE_LEAD,
  LAYERS_GLOSS,
  NON_CONVERGENT,
  OG_ALT,
  OG_HEADLINE_LEAD,
  POSITIONING,
  POSITIONING_PREDICATE,
  PRODUCT_NAME,
  SITE_DESCRIPTION,
  TAGLINE_TAIL,
} from "./copy";

/**
 * Guards the single-source invariant for editorial prose. The positioning
 * sentence reached five spellings across five files before `copy.ts` existed,
 * and every one of them type-checked: duplicated prose is invisible to the
 * compiler, to the schema validator, and to a reviewer reading one file. This
 * is the check that makes a sixth copy loud.
 *
 * Modelled on `canonical-urls.test.ts`, which confines origin literals the same
 * way and for the same reason.
 */

const SRC = join(process.cwd(), "src");

const CODE_EXT = new Set([".ts", ".tsx"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return CODE_EXT.has(extname(entry.name)) ? [full] : [];
  });
}

const files = sourceFiles(SRC).map((full) => ({
  rel: relative(SRC, full).split("\\").join("/"),
  text: readFileSync(full, "utf8"),
}));

/**
 * Shipped source outside the copy module. Test files are excluded because they
 * must be able to name the strings they confine, as this one does.
 */
const elsewhere = files.filter((f) => !f.rel.endsWith(".test.ts") && f.rel !== "lib/copy.ts");

/**
 * A distinctive fragment of each shared string. Fragments rather than whole
 * sentences so that a near-copy (a reflowed or lightly reworded paste, which is
 * how the fifth copy arrived) is caught too.
 *
 * Matching is case-sensitive on purpose. `dossiers/[claimId]/index.md/route.ts`
 * opens a sentence with "Non-convergent by design", which is its own editorial
 * surface with its own grammar; folding it in belongs to slice B of
 * `plans/content-as-data.md`, not here.
 */
const CONFINED: Array<[label: string, fragment: string]> = [
  ["site description", "interpretive friction across"],
  ["positioning", "research-stage registry"],
  ["layers gloss", "where pressure changes the system"],
  ["dossier stance", "non-convergent by design"],
  ["dossier gloss", "held open until evidence resolves them"],
  ["tagline tail", "backed by data, machine-readable by default"],
  ["headline", "Agent-filed claims about"],
  ["agent intro", "An agent-first board of falsifiable claims"],
];

describe("editorial copy", () => {
  it("has source files to scan", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(elsewhere.length).toBeGreaterThan(10);
  });

  it.each(CONFINED)("spells the %s only in copy.ts", (_label, fragment) => {
    const offenders = elsewhere.filter((f) => f.text.includes(fragment)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("carries no markup, so one spelling serves JSX, Markdown and meta tags", () => {
    const strings = [
      SITE_DESCRIPTION,
      POSITIONING,
      POSITIONING_PREDICATE,
      LAYERS_GLOSS,
      NON_CONVERGENT,
      DOSSIER_GLOSS,
      TAGLINE_TAIL,
      HEADLINE_LEAD,
      OG_HEADLINE_LEAD,
      OG_ALT,
      AGENT_INTRO,
    ];
    for (const s of strings) {
      expect(s).not.toMatch(/[<>]|&[a-z]+;|\*\*|\{|\}/);
      expect(s.trim()).toBe(s);
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it("composes the whole positioning sentence from its subject and predicate", () => {
    expect(POSITIONING.startsWith(PRODUCT_NAME)).toBe(true);
    expect(POSITIONING.endsWith(POSITIONING_PREDICATE)).toBe(true);
    // The homepage renders the subject bold and the predicate plain, so the
    // predicate must read as a continuation rather than a sentence.
    expect(POSITIONING_PREDICATE.startsWith("is ")).toBe(true);
  });

  it("describes the OG card using the card's own two halves", () => {
    expect(OG_ALT).toContain(OG_HEADLINE_LEAD);
    expect(OG_ALT).toContain(TAGLINE_TAIL);
  });
});
