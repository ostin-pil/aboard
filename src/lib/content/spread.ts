import { aggregate } from "@/lib/forecast";
import type { Forecast } from "@/lib/types";

/**
 * The about page's per-forecast spread table, derived from `data/`.
 *
 * The numbers used to be typed into the page and then into `content/about.md`,
 * and by the time they moved they were wrong: F1's spread read 0.30 against an
 * actual 0.37, F4's 0.25 against 0.30, F5's median 0.40 against 0.30, and a
 * sixth forecast had been added that the table never mentioned. That is the
 * same failure session 26 fixed for claim counts, one level down, and the fix
 * is the same one: derive it.
 *
 * What stays authored is the `reading` column, which is editorial judgement
 * about what a number means and cannot be computed. It is keyed by forecast id
 * in the document's frontmatter.
 *
 * Pure: takes the forecasts, returns the rows. The page and the Markdown twin
 * both call this so they cannot publish different tables.
 */

/**
 * Minimum predictions for a forecast to count as an ensemble.
 *
 * `forecast.ts` documents that callers gate the ensemble surface on more than
 * one prediction, and the table's whole subject is disagreement between models.
 * A single-prediction forecast has a spread of 0 by definition, which would
 * read as perfect consensus rather than as an absent ensemble.
 */
export const ENSEMBLE_MIN_PREDICTIONS = 2;

export type SpreadRow = {
  id: string;
  /** Formatted to two decimals, the precision the table has always shown. */
  median: string;
  spread: string;
  reading: string;
};

/** Forecast ids, ordered so `F2` precedes `F10` rather than following it. */
function byId(a: Forecast, b: Forecast): number {
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

/**
 * Builds the table rows and asserts the editorial readings line up with the
 * data in both directions.
 *
 * Failing loudly is the point. A forecast added to `data/` without a reading
 * would otherwise appear as a blank cell, and a reading left behind after a
 * forecast is renamed would sit in the document forever with nothing to attach
 * to. Both are the drift this module exists to end, so both fail the build.
 */
export function spreadRows(
  forecasts: Forecast[],
  readings: Readonly<Record<string, string>>,
  label: string,
): SpreadRow[] {
  const ensembles = forecasts
    .filter((f) => f.predictions.length >= ENSEMBLE_MIN_PREDICTIONS)
    .sort(byId);

  const missing = ensembles.filter((f) => !readings[f.id]).map((f) => f.id);
  if (missing.length > 0) {
    throw new Error(
      `${label}: spreadReadings has no entry for ${missing.join(", ")}. ` +
        `Every forecast with ${ENSEMBLE_MIN_PREDICTIONS} or more predictions needs one.`,
    );
  }

  const known = new Set(ensembles.map((f) => f.id));
  const orphaned = Object.keys(readings).filter((id) => !known.has(id));
  if (orphaned.length > 0) {
    throw new Error(
      `${label}: spreadReadings mentions ${orphaned.join(", ")}, which ` +
        `${orphaned.length === 1 ? "is not an" : "are not"} ensemble forecast` +
        `${orphaned.length === 1 ? "" : "s"} in data/.`,
    );
  }

  return ensembles.map((f) => {
    const stats = aggregate(f.predictions);
    return {
      id: f.id,
      median: stats.median.toFixed(2),
      spread: stats.spread.toFixed(2),
      reading: readings[f.id],
    };
  });
}
