import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { Forecast } from "@/lib/types";
import { parseDocument } from "./parse";
import { renderContent, splitSlots } from "./render";
import { AboutDoc, HomeDoc, SiteDoc } from "./schema";
import { spreadRows } from "./spread";

/**
 * The shipped `content/` documents, checked against their schemas here rather
 * than only at `next build`. Reads the files directly instead of going through
 * `loader.ts`, which imports `server-only` and cannot run under this config.
 *
 * Structure only. Nothing here asserts what the prose says: a copy edit must
 * never require a test edit, which was the flaw in the constants module this
 * replaced. What is asserted is what a page would crash on — a missing field, a
 * slot with no component behind it, an undefined placeholder.
 */

const CONTENT = join(process.cwd(), "content");
const read = (slug: string) => readFileSync(join(CONTENT, `${slug}.md`), "utf8");

/**
 * The shipped forecasts, read straight from `data/`. Bypasses
 * `src/lib/data/loader.ts` for the same reason this file bypasses the content
 * loader: it imports `server-only`. The Zod schema is the same one the loader
 * validates against, so a forecast that parses here parses there.
 */
function shippedForecasts() {
  const root = join(process.cwd(), "data");
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(root, e.name, "forecasts"))
    .filter(existsSync)
    .flatMap((dir) => readdirSync(dir).map((f) => join(dir, f)))
    .map((file) => Forecast.parse(YAML.parse(readFileSync(file, "utf8"))));
}

/** Slots the about page knows how to fill. A slot outside this set throws. */
const KNOWN_SLOTS = new Set(["modules", "readings", "spread"]);

/** Placeholders the about page supplies. Values are irrelevant to the check. */
const ABOUT_VARS = {
  domainCount: 3,
  domainList: "a, b, and c",
  claimCount: 20,
  forecastCount: 5,
  ensembleCount: 5,
  crossDomainEdges: 3,
  dossierCount: 3,
};

describe("content/site.md", () => {
  it("satisfies the site schema", () => {
    expect(() => parseDocument(read("site"), SiteDoc, "content/site.md")).not.toThrow();
  });

  it("is frontmatter only, since every field feeds a surface that cannot render Markdown", () => {
    const doc = parseDocument(read("site"), SiteDoc, "content/site.md");
    expect(doc.body).toBe("");
    expect(doc.sections).toEqual([]);
  });
});

describe("content/home.md", () => {
  const doc = parseDocument(read("home"), HomeDoc, "content/home.md");

  it("satisfies the home schema", () => {
    expect(doc.data.title.length).toBeGreaterThan(0);
  });

  it("has a body, which is both the hero lede and the twin's prose", () => {
    expect(doc.body.length).toBeGreaterThan(0);
  });

  it("renders to a single paragraph run with no slots", () => {
    const parts = splitSlots(renderContent(doc.body, {}, "content/home.md"));
    expect(parts).toHaveLength(1);
    expect(parts[0].kind).toBe("html");
  });
});

describe("content/about.md", () => {
  const doc = parseDocument(read("about"), AboutDoc, "content/about.md");

  it("satisfies the about schema", () => {
    expect(doc.data.modules.length).toBeGreaterThanOrEqual(1);
    expect(doc.data.readings.length).toBeGreaterThanOrEqual(2);
  });

  it("opens with an untitled intro, then titled sections", () => {
    expect(doc.sections[0].slug).toBe("intro");
    expect(doc.sections[0].title).toBe("");
    expect(doc.sections.length).toBeGreaterThan(1);
    for (const s of doc.sections.slice(1)) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.slug.length).toBeGreaterThan(0);
    }
  });

  it("gives every section a unique slug, so anchors and keys do not collide", () => {
    const slugs = doc.sections.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("resolves every placeholder against what the page supplies", () => {
    for (const section of doc.sections) {
      expect(() => renderContent(section.markdown, ABOUT_VARS, "content/about.md")).not.toThrow();
    }
  });

  it("references only slots the page can fill", () => {
    for (const section of doc.sections) {
      const parts = splitSlots(renderContent(section.markdown, ABOUT_VARS, "content/about.md"));
      for (const part of parts) {
        if (part.kind === "slot") expect(KNOWN_SLOTS.has(part.name)).toBe(true);
      }
    }
  });

  it("has a spread reading for every ensemble forecast in data/, and no orphans", () => {
    // spreadRows throws in both directions; this is the shipped-data check that
    // catches a forecast added without commentary, which is how the table went
    // stale in the first place.
    expect(() =>
      spreadRows(shippedForecasts(), doc.data.spreadReadings, "content/about.md"),
    ).not.toThrow();
  });

  it("derives spread-table numbers rather than carrying them in the document", () => {
    const raw = read("about");
    for (const row of spreadRows(shippedForecasts(), doc.data.spreadReadings, "about.md")) {
      expect(raw).not.toContain(`| ${row.median} |`);
      expect(raw).not.toContain(`| ${row.spread} |`);
    }
  });

  it("uses every slot the page implements, so no component is orphaned", () => {
    const used = new Set(
      doc.sections
        .flatMap((s) => splitSlots(renderContent(s.markdown, ABOUT_VARS, "content/about.md")))
        .filter((p) => p.kind === "slot")
        .map((p) => (p.kind === "slot" ? p.name : "")),
    );
    expect(used).toEqual(KNOWN_SLOTS);
  });
});
