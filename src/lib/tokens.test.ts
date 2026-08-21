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

/** Custom-property declarations in source order, from one rule body. */
function parse(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of body.split("\n")) {
    const m = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (m) out.set(m[1], m[2].trim().toLowerCase());
  }
  return out;
}

/** The body of the `nth` rule opened by `opener`, brace-matched so a nested
 *  at-rule cannot truncate it. */
function ruleBody(opener: string, nth = 0): string {
  let from = 0;
  for (let i = 0; i <= nth; i++) {
    const at = css.indexOf(opener, from);
    expect(at, `rule ${nth} of \`${opener}\` not found in globals.css`).toBeGreaterThan(-1);
    from = at + opener.length;
    if (i < nth) continue;
    let depth = 1;
    for (let j = from; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) return css.slice(from, j);
    }
  }
  throw new Error(`unterminated rule: ${opener}`);
}

// Three `:root` blocks now: the light palette, then the dark palette's source
// values, then whatever comes after. The order is load-bearing here and is what
// the dark-palette suite below pins.
const light = parse(ruleBody(":root {", 0));
const darkSource = parse(ruleBody(":root {", 1));
const darkAlias = parse(ruleBody(':root[data-theme="dark"] {'));

/** The system-mode block: the one `prefers-color-scheme` at-rule that carries the palette. */
const systemAlias = (() => {
  for (let n = 0; n < 8; n++) {
    const body = ruleBody("@media (prefers-color-scheme: dark) {", n);
    if (body.includes("--bg:")) return parse(body);
  }
  throw new Error("no prefers-color-scheme block carries the palette");
})();

/** Resolve one level of `var(--dark-x)` against the source block. */
function resolved(aliases: Map<string, string>, prop: string): string | undefined {
  const v = aliases.get(prop);
  const m = v && /^var\((--[\w-]+)\)$/.exec(v);
  return m ? darkSource.get(m[1]) : v;
}

const dark = new Map(
  [...darkAlias.keys()].map((k) => [k, resolved(darkAlias, k) ?? ""] as const)
);

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

describe("the two dark blocks stay in step", () => {
  /**
   * Dark is selected two ways — the `data-theme` attribute and the system media
   * query — and CSS cannot express both in one rule, so there will always be two
   * blocks. Until this session they each carried their own copy of all 33
   * values, in two different formats; they now alias a single source. These
   * cases are what stops the aliasing from rotting back into duplication.
   */
  it("declares a palette in every block it parsed", () => {
    // Vacuous-pass guard: an empty map would make every case below trivially true.
    expect(darkSource.size).toBe(33);
    expect(darkAlias.size).toBe(33);
    expect(systemAlias.size).toBe(33);
  });

  it("the attribute block and the system block alias identically", () => {
    // The whole point. A value changed in one and not the other used to be
    // invisible; a line dropped from one is caught here too, because this
    // compares the full declaration list rather than the values it can see.
    expect([...systemAlias]).toEqual([...darkAlias]);
  });

  it("neither block holds a value of its own", () => {
    for (const [prop, value] of darkAlias) {
      expect(value, `${prop} should alias the source, not restate it`).toMatch(
        /^var\(--dark-[\w-]+\)$/
      );
    }
  });

  it("every alias resolves to a source token that exists", () => {
    for (const prop of darkAlias.keys()) {
      expect(resolved(darkAlias, prop), `${prop} resolves to nothing`).toBeDefined();
    }
  });

  it("every source token is aliased, so none is dead", () => {
    for (const src of darkSource.keys()) {
      expect(darkAlias.has(`--${src.slice("--dark-".length)}`), `${src} is aliased by nobody`).toBe(true);
    }
  });

  it("dark overrides nothing light does not define", () => {
    // A dark-only token would be unreachable in light mode and is almost always
    // a typo in the token name rather than an intention.
    for (const prop of darkAlias.keys()) {
      expect(light.has(prop), `${prop} is set in dark but never in light`).toBe(true);
    }
  });
});
