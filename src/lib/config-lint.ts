/**
 * Rules for the repo's two hand-written config files, `.github/workflows/ci.yml`
 * and `wrangler.jsonc`.
 *
 * Both are executable configuration that no other command in the gate reads.
 * Session 53 measured it: with a YAML syntax error in `ci.yml` and a JSON
 * syntax error in `wrangler.jsonc` planted at the same time, all nine gate
 * commands exited 0. `wrangler.jsonc` at least has a reader somewhere (CI's
 * `wrangler deploy --dry-run` exits 1 on the same fault); `ci.yml` has none
 * anywhere, and a workflow that will not parse does not run, so its failure
 * mode is a CI column that goes quiet rather than red.
 *
 * This module is the pure half, unit-tested against fixtures. The filesystem
 * half and the project-specific tables live in `scripts/check-config.ts`, the
 * same split `lint-resolution.ts` uses over `src/lib/resolution-lint.ts`.
 */

/** One thing that is wrong, named precisely enough to fix without re-deriving. */
export type ConfigFinding = {
  /** Which rule fired, for grouping in the report. */
  check: string;
  /** What is wrong, naming the file and the field. */
  detail: string;
};

/** A step as it appears under `jobs.<job>.steps` in a GitHub Actions workflow. */
export type CiStep = {
  name?: string;
  uses?: string;
  run?: string;
  "working-directory"?: string;
};

/**
 * How one gate command is covered in CI.
 *
 * `run` is the exact `run:` string when the two lists say the same thing
 * verbatim. `equivalent` is for the two cases where they cannot: the
 * sub-package type-checks are `npm run typecheck:mcp` in the gate and
 * `npm ci && npm run typecheck` under `working-directory: mcp-server` in CI,
 * because CI has no node_modules yet and the gate's script provisions its own.
 * Declaring the equivalence keeps the drift check honest instead of asserting a
 * string match that was never true.
 */
export type GateCoverage = {
  /** The `name:` of the CI step that covers this gate command. */
  step: string;
  /** Exact `run:` string, when gate and CI express the command identically. */
  run?: string;
  /** Why the two forms differ, when they do. Required if `run` is absent. */
  equivalent?: string;
};

/** Steps that exist only in CI, each with the reason it does not belong to the gate. */
export type CiOnly = Record<string, string>;

/**
 * Strips `//` and block comments from JSONC, preserving string contents.
 *
 * Written rather than depended on: `strip-json-comments` is present in the tree
 * only as a transitive dependency, so relying on it would break on any lockfile
 * change that drops it. A regex over the whole text is not good enough either,
 * since `wrangler.jsonc` contains URLs with `//` inside string values and the
 * naive version truncates them.
 *
 * Comment bodies are replaced with spaces rather than removed so that byte
 * offsets survive, which keeps a parse error's reported position pointing at
 * the right place in the original file.
 */
export function stripJsonComments(source: string): string {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      } else {
        out += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        out += "  ";
        i += 1;
      } else {
        out += ch === "\n" ? ch : " ";
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      out += "  ";
      i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      out += "  ";
      i += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

/** Parses JSONC. Throws the underlying `SyntaxError` unchanged, position intact. */
export function parseJsonc(source: string): unknown {
  return JSON.parse(stripJsonComments(source));
}

/**
 * Reports every way the session gate's command list and CI's step list have
 * drifted apart.
 *
 * `CLAUDE.md` has told readers to "read them against each other whenever either
 * changes" since session 48, which is a rule with nothing enforcing it. The
 * check runs in both directions, because drift is possible in both:
 *
 *   - a gate command with no CI step means a PR from someone who never runs
 *     `/session-end` skips that check entirely;
 *   - a CI step that is neither a gate command nor declared CI-only means the
 *     gate silently stopped being a preview of CI.
 *
 * A genuinely CI-only step is fine and there are several; it just has to say so
 * in `ciOnly`, so that adding one is a decision someone made rather than a
 * divergence nobody noticed.
 */
export function checkGateParity(input: {
  steps: readonly CiStep[];
  gateCommands: readonly string[];
  coverage: Readonly<Record<string, GateCoverage>>;
  ciOnly: CiOnly;
}): ConfigFinding[] {
  const { steps, gateCommands, coverage, ciOnly } = input;
  const findings: ConfigFinding[] = [];
  const check = "gate/CI parity";

  const byName = new Map<string, CiStep>();
  for (const step of steps) {
    if (step.name !== undefined) byName.set(step.name, step);
  }

  const claimed = new Set<string>();

  for (const command of gateCommands) {
    const entry = coverage[command];
    if (entry === undefined) {
      findings.push({
        check,
        detail:
          `build_commands/test_commands has \`${command}\`, which no entry in ` +
          `GATE_COVERAGE accounts for. Add the CI step that runs it, then name ` +
          `that step here.`,
      });
      continue;
    }

    const step = byName.get(entry.step);
    if (step === undefined) {
      findings.push({
        check,
        detail:
          `\`${command}\` is covered by CI step "${entry.step}", which no longer ` +
          `exists in ci.yml. Either the step was renamed or the check was dropped.`,
      });
      continue;
    }

    claimed.add(entry.step);

    if (entry.run !== undefined && step.run?.trim() !== entry.run) {
      findings.push({
        check,
        detail:
          `CI step "${entry.step}" should run \`${entry.run}\` to match the gate, ` +
          `but runs \`${step.run?.trim() ?? "(nothing)"}\`.`,
      });
    }

    if (entry.run === undefined && entry.equivalent === undefined) {
      findings.push({
        check,
        detail:
          `GATE_COVERAGE entry for \`${command}\` declares neither an exact \`run\` ` +
          `nor an \`equivalent\` explaining why the two forms differ.`,
      });
    }
  }

  for (const step of steps) {
    // `uses:` steps are action invocations (checkout, setup-node), not checks.
    if (step.run === undefined) continue;
    const name = step.name;
    if (name === undefined) {
      findings.push({
        check,
        detail:
          `ci.yml has a \`run:\` step with no \`name:\` (\`${step.run.trim().split("\n")[0]}\`). ` +
          `Name it, so parity can account for it.`,
      });
      continue;
    }
    if (claimed.has(name)) continue;
    if (name in ciOnly) continue;
    findings.push({
      check,
      detail:
        `ci.yml step "${name}" is neither a gate command nor listed in CI_ONLY. ` +
        `If it should also run at session end, add it to build_commands; if it ` +
        `is genuinely CI-only, say so in CI_ONLY with the reason.`,
    });
  }

  for (const name of Object.keys(ciOnly)) {
    if (!byName.has(name)) {
      findings.push({
        check,
        detail: `CI_ONLY lists "${name}", which no longer exists in ci.yml.`,
      });
    }
  }

  return findings;
}

/** The subset of `wrangler.jsonc` this repo asserts things about. */
export type WranglerConfig = {
  main?: unknown;
  assets?: { directory?: unknown; binding?: unknown } | unknown;
  ratelimits?: unknown;
  analytics_engine_datasets?: unknown;
};

/**
 * Every rate-limit binding in `wrangler.jsonc` and the constant that mirrors it.
 *
 * Both halves of each pair document the other in prose and neither enforced it.
 * `PROPOSAL_LIMITER` was checked from session 53; `REGISTRATION_LIMITER` was
 * not, which S4 in `plans/audit-2026-08.md` names: identical obligation, no
 * reader. They happen to agree at 60 today, so the gap never showed.
 *
 * `scripts/check-config.ts` drives its source extraction off this table too, so
 * a limiter added here is a limiter checked, rather than one more pair of
 * comments trusting each other.
 */
export const LIMITER_MIRRORS = [
  {
    binding: "PROPOSAL_LIMITER",
    constant: "RATE_LIMIT_PERIOD_S",
    source: "worker/index.ts",
  },
  {
    binding: "REGISTRATION_LIMITER",
    constant: "REGISTRATION_LIMIT_PERIOD_S",
    source: "worker/oauth.ts",
  },
] as const;

export type LimiterBinding = (typeof LIMITER_MIRRORS)[number]["binding"];

/**
 * The telemetry binding, its dataset, and the Env field that reads it.
 *
 * Unlike the limiter mirrors there is no number to disagree about, only names,
 * and the failure is quieter than a lying `retry-after`: `record` fails open
 * by design, so a binding renamed on either side errors nowhere — the rows
 * just stop arriving, which is the one fault telemetry cannot report about
 * itself. The dataset name is pinned too, because the SQL in
 * `worker/README.md` queries it by name and a rename would strand those
 * queries against an empty table that looks like "no traffic".
 */
export const ANALYTICS_MIRROR = {
  binding: "EVENTS",
  dataset: "aboard_events",
  source: "worker/index.ts",
} as const;

/**
 * The only two values Cloudflare's rate-limiting accepts for `simple.period`.
 *
 * Worth asserting separately from the mirror: a matched pair at `period: 30`
 * satisfies every check above and fails at deploy, which is the slowest place
 * to find out.
 */
const LEGAL_PERIODS = [10, 60];

/**
 * Checks the invariants `wrangler.jsonc` states in prose and nothing enforces.
 *
 * The rate-limit one is the reason this exists. `worker/index.ts` declares
 * `RATE_LIMIT_PERIOD_S = 60` with a comment saying it mirrors the
 * `PROPOSAL_LIMITER` period here, and `wrangler.jsonc` carries the matching
 * comment pointing back. Cloudflare restricts `period` to 10 or 60, so the one
 * legal edit is also the one that breaks the pair: change it to 10 and every
 * rate-limited caller gets a `retry-after: 60` that is six times too long,
 * while the type-checker, the tests and the dry-run bundle all stay green.
 */
export function checkWranglerWiring(input: {
  config: WranglerConfig;
  /** Each mirror constant in `LIMITER_MIRRORS`, as read out of its source file. */
  limiterPeriods: Record<LimiterBinding, number | undefined>;
  /** Whether `ANALYTICS_MIRROR.source` declares the `EVENTS` field on `Env`. */
  eventsFieldDeclared: boolean;
  /** Whether `config.main` resolves to a file that exists. */
  mainExists: boolean;
  /** `output` from `next.config.ts`. */
  nextOutput: string | undefined;
}): ConfigFinding[] {
  const { config, limiterPeriods, eventsFieldDeclared, mainExists, nextOutput } = input;
  const findings: ConfigFinding[] = [];
  const check = "wrangler wiring";

  const main = config.main;
  if (typeof main !== "string") {
    findings.push({ check, detail: "wrangler.jsonc has no string `main` entry point." });
  } else if (!mainExists) {
    findings.push({
      check,
      detail: `wrangler.jsonc \`main\` points at ${main}, which does not exist.`,
    });
  }

  const assets = config.assets;
  const directory =
    typeof assets === "object" && assets !== null && "directory" in assets
      ? (assets as { directory?: unknown }).directory
      : undefined;

  if (nextOutput !== "export") {
    findings.push({
      check,
      detail:
        `next.config declares output: ${JSON.stringify(nextOutput)}, but the assets ` +
        `binding assumes a static export. The Worker serves the site from that ` +
        `directory, so this pair has to agree.`,
    });
  } else if (directory !== "./out") {
    findings.push({
      check,
      detail:
        `wrangler.jsonc \`assets.directory\` is ${JSON.stringify(directory)}, but ` +
        `\`output: "export"\` writes to ./out. The deploy would ship the wrong ` +
        `directory, or nothing.`,
    });
  }

  const limiters = Array.isArray(config.ratelimits) ? config.ratelimits : [];

  for (const mirror of LIMITER_MIRRORS) {
    const declared = limiterPeriods[mirror.binding];
    const limiter = limiters.find(
      (l): l is { name: string; simple?: { period?: unknown } } =>
        typeof l === "object" &&
        l !== null &&
        (l as { name?: unknown }).name === mirror.binding
    );

    if (limiter === undefined) {
      findings.push({
        check,
        detail: `wrangler.jsonc has no ${mirror.binding} ratelimit binding.`,
      });
      continue;
    }

    const period = limiter.simple?.period;

    // The platform constraint stands on its own: it holds whether or not the
    // mirror agrees, and a matched-but-illegal pair fails only at deploy.
    if (typeof period !== "number" || !LEGAL_PERIODS.includes(period)) {
      findings.push({
        check,
        detail:
          `${mirror.binding} period is ${String(period)} in wrangler.jsonc. ` +
          `Cloudflare accepts only ${LEGAL_PERIODS.join(" or ")}, so this would ` +
          `pass CI and fail at deploy.`,
      });
    }

    if (declared === undefined) {
      findings.push({
        check,
        detail:
          `Could not read ${mirror.constant} from ${mirror.source}, so the mirror ` +
          `with ${mirror.binding}'s period cannot be checked. Was the constant renamed?`,
      });
    } else if (period !== declared) {
      findings.push({
        check,
        detail:
          `${mirror.binding} period is ${String(period)} in wrangler.jsonc but ` +
          `${mirror.constant} is ${declared} in ${mirror.source}. The retry-after ` +
          `header would lie to every rate-limited caller.`,
      });
    }
  }

  const datasets = Array.isArray(config.analytics_engine_datasets)
    ? config.analytics_engine_datasets
    : [];
  const events = datasets.find(
    (d): d is { binding: string; dataset?: unknown } =>
      typeof d === "object" &&
      d !== null &&
      (d as { binding?: unknown }).binding === ANALYTICS_MIRROR.binding
  );

  if (events === undefined) {
    findings.push({
      check,
      detail:
        `wrangler.jsonc has no ${ANALYTICS_MIRROR.binding} entry in ` +
        `analytics_engine_datasets. record() fails open, so telemetry would ` +
        `silently stop rather than error.`,
    });
  } else if (events.dataset !== ANALYTICS_MIRROR.dataset) {
    findings.push({
      check,
      detail:
        `${ANALYTICS_MIRROR.binding} writes to dataset ` +
        `${JSON.stringify(events.dataset)}, but the queries in worker/README.md ` +
        `read ${ANALYTICS_MIRROR.dataset}. They would answer "no traffic" from ` +
        `an empty table.`,
    });
  }

  if (!eventsFieldDeclared) {
    findings.push({
      check,
      detail:
        `Could not find the ${ANALYTICS_MIRROR.binding} field on Env in ` +
        `${ANALYTICS_MIRROR.source}, so the binding in wrangler.jsonc has no ` +
        `reader. Was the field renamed?`,
    });
  }

  return findings;
}
