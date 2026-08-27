import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * WCAG AA contrast for the tokens that carry text, in both themes.
 *
 * The fault this is written for reached production and was found by an
 * external audit rather than by anything here. `--dark-muted-2` was set to
 * `#78716c`, byte-identical to the light `--muted-2`: every other token in the
 * dark block has a value tuned for a dark surface, and this one was a
 * light-surface grey left sitting on `--dark-bg`, `--dark-paper` and
 * `--dark-paper-2` at 3.77, 3.59 and 3.44 against a 4.5 requirement. The light
 * `--muted-2` separately missed AA on `--hair` alone, at 4.40.
 *
 * Nothing in the gate could see either. A hex string is well-typed however
 * wrong it is, which is the same argument `tokens.test.ts` makes next door;
 * that file relates the two languages the palette is written in and asserts
 * nothing about the values themselves. axe, in `a11y` terms, is the tool that
 * would normally catch this, and its `color-contrast` rule is precisely the one
 * that cannot run in jsdom, because it needs real layout and real compositing.
 * So the palette's own arithmetic is checked here, where it needs no browser.
 *
 * Scope is deliberately the text tokens against the surface tokens. Border and
 * dot colours (`--line`, `--line-2`, `--grid-dot`) are excluded because they
 * are not text and AA does not govern them — but note that using one of them
 * *as* text is exactly how the reported defect appeared in the DOM: `.sep`
 * coloured its `·` with `--line-2` for 1.49. That is a rule about call sites
 * rather than about the palette, so it is not enforceable from this file.
 */

const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8"
);

/** The value of a custom property from the first block that declares it. */
function token(name: string): string {
  const m = new RegExp(`^\\s*${name}:\\s*(#[0-9a-fA-F]{6});`, "m").exec(css);
  if (!m) throw new Error(`no declaration found for ${name}`);
  return m[1].toLowerCase();
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** AA for body text. Large text is 3.0, and nothing here is guaranteed large. */
const AA = 4.5;

const THEMES = {
  light: { prefix: "--", text: ["fg", "muted", "muted-2"], surface: ["bg", "paper", "paper-2", "hair"] },
  dark: { prefix: "--dark-", text: ["fg", "muted", "muted-2"], surface: ["bg", "paper", "paper-2", "hair"] },
} as const;

describe("palette contrast", () => {
  for (const [theme, { prefix, text, surface }] of Object.entries(THEMES)) {
    it(`${theme}: every text token meets AA on every surface token`, () => {
      const failures: string[] = [];
      for (const t of text) {
        for (const s of surface) {
          const ratio = contrast(token(`${prefix}${t}`), token(`${prefix}${s}`));
          if (ratio < AA) {
            failures.push(`${prefix}${t} on ${prefix}${s} = ${ratio.toFixed(2)} (need ${AA})`);
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it("keeps the two muted tiers distinguishable from each other", () => {
    // Guards the lazy fix for the above: dragging `--muted-2` until it equals
    // `--muted` would pass every assertion here and delete a design distinction.
    expect(token("--muted-2")).not.toEqual(token("--muted"));
    expect(token("--dark-muted-2")).not.toEqual(token("--dark-muted"));
  });

  it("gives the dark palette its own muted-2 rather than reusing the light one", () => {
    // The defect itself, pinned: these were byte-identical in production.
    expect(token("--dark-muted-2")).not.toEqual(token("--muted-2"));
  });
});
