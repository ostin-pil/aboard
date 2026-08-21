/**
 * The light palette, as data.
 *
 * `globals.css` defines these as CSS custom properties, which is the right home
 * for anything the browser paints. The OG cards cannot reach them: `next/og`
 * rasterizes through Satori, which resolves no cascade and no `var()`, so every
 * colour has to arrive as a literal. Before this module existed they arrived as
 * 45 hand-typed hex strings across the three `opengraph-image.tsx` files — 15
 * distinct values, most of them written out three to twelve times.
 *
 * That is a drift surface with no reader. A card could disagree with the site it
 * advertises and nothing in the gate would say so, because a hex string is
 * well-typed however wrong it is. This module names the 15 values once, and
 * `tokens.test.ts` parses `globals.css` and asserts each one still equals the
 * custom property it mirrors. The duplication is unavoidable (two languages, one
 * palette); the silence about it was not.
 *
 * Light only, deliberately. An OG card is rasterized once at build time into a
 * PNG that social crawlers serve to every viewer, so it has no theme to follow
 * and the dark palette has no meaning here.
 */

import type { ClaimKind } from "@/lib/types";

/** Surfaces and text. The names are the `globals.css` custom property they mirror. */
export const surface = {
  /** `--bg` */
  bg: "#fafaf9",
  /** `--fg` */
  fg: "#0c0a09",
  /** `--muted` */
  muted: "#57534e",
  /** `--muted-2` */
  muted2: "#78716c",
  /** `--line-2`, and `--grid-dot`, which hold the same value in light. */
  line2: "#d6d3d1",
  /**
   * The `·` separating facts on the claim card. Alone among these it mirrors no
   * light custom property: the value is the *dark* theme's `--muted`, which is
   * how it got here — it reads as a hairline against `--bg` and nobody checked
   * it against the palette. Recorded rather than corrected, because changing it
   * would re-render every claim card, which is a design decision and not a
   * refactor. `tokens.test.ts` pins it to the dark `--muted` so it cannot drift
   * into being wrong in a second way.
   */
  separator: "#a8a29e",
} as const;

/** One triple per claim kind, mirroring the `--sym-*` / `--mech-*` / `--lev-*` groups. */
export const kindPalette: Record<ClaimKind, { fg: string; bg: string; bd: string }> = {
  /** `--sym-fg` / `--sym-bg` / `--sym-bd` */
  symptom: { fg: "#b91c1c", bg: "#fef2f2", bd: "#fecaca" },
  /** `--mech-fg` / `--mech-bg` / `--mech-bd` */
  mechanism: { fg: "#b45309", bg: "#fffbeb", bd: "#fde68a" },
  /** `--lev-fg` / `--lev-bg` / `--lev-bd` */
  leverage_point: { fg: "#047857", bg: "#ecfdf5", bd: "#a7f3d0" },
};

/**
 * The dossier's two sides, mirroring `--pro-*` / `--con-*`.
 *
 * These are not a fourth kind: light `--pro-bd` and `--con-bd` are the *fg*
 * value rather than a lighter border, which is what gives a dossier column its
 * heavier rule. The dossier card draws its `2px` border from `fg` for exactly
 * that reason, so no `bd` is modelled here.
 */
export const stancePalette = {
  /** `--pro-fg` / `--pro-bg` */
  pro: { fg: "#047857", bg: "#ecfdf5" },
  /** `--con-fg` / `--con-bg` */
  con: { fg: "#b91c1c", bg: "#fef2f2" },
} as const;
