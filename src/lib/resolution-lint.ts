/**
 * Resolution-criteria lint.
 *
 * A forecast is only falsifiable if a reader who distrusts aboard can settle
 * it without asking us. That fails in three ways, and this module detects
 * them: the criteria hang on somebody *saying* something rather than on an
 * outcome, the criteria name no threshold anyone could check, or no external
 * source is named at all.
 *
 * The rules are heuristics over prose, so they are advisory by construction.
 * A finding is a prompt to reread the criteria, not a verdict — see the
 * per-rule notes for where each one is known to be blunt. Nothing here rejects
 * data at load time; `scripts/lint-resolution.ts` reports and, only when asked
 * with `--strict`, exits non-zero.
 *
 * The rule set follows the Metaculus question checklist as summarised in
 * `research/integrity-anti-gaming.md`.
 */
import type { Forecast } from "./types";

export type ResolutionRule = "says-trigger" | "no-threshold" | "no-source";

export type ResolutionFinding = {
  forecastId: string;
  rule: ResolutionRule;
  message: string;
};

/** The fields the lint reads. Keeps the checker usable on parsed YAML. */
export type LintableForecast = Pick<
  Forecast,
  "id" | "resolutionCriteria" | "resolutionSource" | "supersededBy"
>;

/**
 * Criteria that resolve on an utterance. "Will X be true" is falsifiable;
 * "will the President say X is true" resolves on a speech act, which is
 * gameable by anyone who can prompt the speech.
 *
 * Deliberately excludes "claims that" — this is a claims graph, and the word
 * appears in ordinary criteria prose too often to carry signal.
 */
const SAYS_TRIGGER =
  /\b(says?|said|announces?|announced|declares?|declared|tweets?|tweeted|states? that|stated that)\b/i;

/**
 * Any marker of a checkable quantity: a digit, a comparison glyph, or a
 * quantifier phrase. Blunt on purpose — a bare year like "2024" counts, so
 * this catches criteria with no numbers at all rather than criteria whose
 * numbers are the wrong ones. It is a floor, not a proof of rigor.
 */
const THRESHOLD_MARKER =
  /[0-9]|[≥≤><%]|\b(at least|at most|no fewer than|no more than|more than|fewer than|less than|greater than|majority|all of|any of|none of|doubles?|halves?)\b/i;

/** Run every rule against one forecast. */
export function lintForecast(f: LintableForecast): ResolutionFinding[] {
  // A superseded forecast's criteria are historical record, not a live
  // resolution path: its defects are what the replacement forecasts named in
  // supersededBy exist to repair, so re-flagging them every run is noise.
  // The CLI reports which forecasts were skipped for this reason.
  if (f.supersededBy && f.supersededBy.length > 0) return [];

  const findings: ResolutionFinding[] = [];
  const criteria = f.resolutionCriteria ?? "";

  const says = criteria.match(SAYS_TRIGGER);
  if (says) {
    findings.push({
      forecastId: f.id,
      rule: "says-trigger",
      message:
        `resolutionCriteria turns on an utterance (matched "${says[0]}"). ` +
        `Resolve on the outcome, not on who announces it.`,
    });
  }

  if (!THRESHOLD_MARKER.test(criteria)) {
    findings.push({
      forecastId: f.id,
      rule: "no-threshold",
      message:
        "resolutionCriteria names no threshold, count, or comparison a " +
        "reader could check. State the metric and the number that settles it.",
    });
  }

  if (!f.resolutionSource) {
    findings.push({
      forecastId: f.id,
      rule: "no-source",
      message:
        "no resolutionSource: nothing outside the graph resolves this " +
        "forecast. Name the third-party dataset or publication.",
    });
  }

  return findings;
}

/** Run the lint across a corpus, in the order given. */
export function lintForecasts(
  forecasts: readonly LintableForecast[]
): ResolutionFinding[] {
  return forecasts.flatMap(lintForecast);
}
