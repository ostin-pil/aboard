import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { kindPalette, stancePalette, surface } from "@/lib/tokens";

/**
 * `tokens.ts` exists because Satori cannot read CSS, so the OG cards need the
 * palette as JavaScript literals. That buys one problem in exchange for the 45
 * loose hex strings it removes: the palette is now written in two languages,
 * and nothing in the type system relates them. A card could advertise a colour
 * the site stopped using and every gate command would still pass.
 *
 * This file is the relation. It parses the custom-property blocks out of
 * `globals.css` and asserts each token equals the property it claims to mirror,
 * so the duplication is checked rather than merely commented.
 */

const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8"
);

/**
 * Declarations from one rule, by selector. The token blocks contain no nested
 * braces, so the first `}` after the selector ends the rule — enough of a
 * parser for this job, and it fails loudly (empty map) rather than quietly if
 * that stops being true.
 */
function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `selector ${selector} not found in globals.css`).toBeGreaterThan(-1);
  const body = css.slice(start + selector.length + 2, css.indexOf("}", start));
  const out = new Map<string, string>();
  for (const line of body.split("\n")) {
    const m = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (m) out.set(m[1], m[2].trim().toLowerCase());
  }
  return out;
}

const light = declarations(":root");
const dark = declarations(':root[data-theme="dark"]');

describe("tokens mirror globals.css", () => {
  it("parses a palette out of globals.css at all", () => {
    // Guards the parser itself: a silent zero-match would make every case below
    // vacuous, and a vacuous check is worse than none because it reads as green.
    expect(light.size).toBeGreaterThan(20);
    expect(dark.size).toBeGreaterThan(20);
  });

  it.each([
    ["bg", surface.bg, "--bg"],
    ["fg", surface.fg, "--fg"],
    ["muted", surface.muted, "--muted"],
    ["muted2", surface.muted2, "--muted-2"],
    ["line2", surface.line2, "--line-2"],
  ])("surface.%s equals light %s", (_name, value, prop) => {
    expect(light.get(prop)).toBe(value);
  });

  it("light --grid-dot holds the same value as --line-2, as tokens.line2 assumes", () => {
    expect(light.get("--grid-dot")).toBe(surface.line2);
  });

  it("surface.separator is the dark --muted, the off-palette value it documents", () => {
    // Not a light token. The comment on `surface.separator` explains how it got
    // onto a light-only card; this pins it so it cannot drift a second time,
    // and it fails if someone corrects the card without correcting the note.
    expect(light.get("--muted")).not.toBe(surface.separator);
    expect(dark.get("--muted")).toBe(surface.separator);
  });

  it.each([
    ["symptom", "sym"],
    ["mechanism", "mech"],
    ["leverage_point", "lev"],
  ] as const)("kindPalette.%s equals the light --%s-* triple", (kind, prefix) => {
    expect(kindPalette[kind].fg).toBe(light.get(`--${prefix}-fg`));
    expect(kindPalette[kind].bg).toBe(light.get(`--${prefix}-bg`));
    expect(kindPalette[kind].bd).toBe(light.get(`--${prefix}-bd`));
  });

  it.each(["pro", "con"] as const)(
    "stancePalette.%s equals the light --%s-* pair",
    (stance) => {
      expect(stancePalette[stance].fg).toBe(light.get(`--${stance}-fg`));
      expect(stancePalette[stance].bg).toBe(light.get(`--${stance}-bg`));
    }
  );

  it("models no stance border, because light --pro-bd/--con-bd are the fg value", () => {
    // The reason `stancePalette` has no `bd`. If the CSS ever gives the dossier
    // columns a lighter border the way the kind chips have one, this fails and
    // the token needs the third field after all.
    expect(light.get("--pro-bd")).toBe(stancePalette.pro.fg);
    expect(light.get("--con-bd")).toBe(stancePalette.con.fg);
  });
});

describe("the OG cards carry no colour of their own", () => {
  // The point of the module is that these three files stopped holding literals.
  // Without this, the next hand-typed hex is invisible to every gate command.
  it.each([
    "../app/opengraph-image.tsx",
    "../app/claims/[id]/opengraph-image.tsx",
    "../app/dossiers/[claimId]/opengraph-image.tsx",
  ])("%s has no hex literal", (rel) => {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });
});
