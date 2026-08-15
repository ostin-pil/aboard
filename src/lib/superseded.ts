import type { Forecast } from "./types";

/**
 * Resolving a forecast's `supersededBy` ids into something renderable.
 *
 * `supersededBy` was read by five machines and rendered to nobody: it is in
 * `types.ts`, serialized by `jsonld.ts`, referentially checked by
 * `data/integrity.ts`, and honoured by `resolution-lint.ts`, which skips a
 * superseded forecast because its replacement repairs the criteria. A reader of
 * the site still saw F4 presented exactly like a live forecast.
 *
 * Pure, and takes the forecast list as an argument rather than importing the
 * graph, for the reason `spread.ts` gives: the HTML page and the Markdown twin
 * both call this, so they cannot disagree about what replaced what. It also
 * keeps the module testable, since `vitest.config.ts` scopes the suite to pure
 * modules and anything reaching the loader pulls in `server-only`.
 */

export type Replacement = {
  id: string;
  /**
   * The claim the replacement is attached to, or null when the id resolves to
   * no filed forecast.
   *
   * `integrity.ts` fails the build on a `supersededBy` naming an unknown
   * forecast, so null is unreachable in a built tree. It is modelled anyway
   * because the alternative is a non-null assertion that would silently produce
   * a broken link if that check were ever relaxed.
   */
  claimId: string | null;
};

/**
 * The replacements named by a forecast, in the order filed.
 *
 * Returns an empty array for a live forecast, so callers can render
 * unconditionally rather than repeating the guard.
 */
export function replacements(forecast: Forecast, forecasts: Forecast[]): Replacement[] {
  return (forecast.supersededBy ?? []).map((id) => ({
    id,
    claimId: forecasts.find((f) => f.id === id)?.attachedToClaimId ?? null,
  }));
}

/**
 * Joins ids into prose: "F7", "F6 and F8", "F6, F8 and F9".
 *
 * Serial comma omitted to match the project's existing prose.
 */
export function joinIds(ids: string[]): string {
  if (ids.length <= 1) return ids[0] ?? "";
  return `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
}

/**
 * The one-line marker for text surfaces (the Markdown twin, and anything else
 * that cannot render a component). Empty string for a live forecast.
 */
export function supersededLine(forecast: Forecast, forecasts: Forecast[]): string {
  const found = replacements(forecast, forecasts);
  if (found.length === 0) return "";
  return `Superseded, replaced by ${joinIds(found.map((r) => r.id))}.`;
}
