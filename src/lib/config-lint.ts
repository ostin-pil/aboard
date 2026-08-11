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
};

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
  /** `RATE_LIMIT_PERIOD_S` as read out of `worker/index.ts`. */
  rateLimitPeriodS: number | undefined;
  /** Whether `config.main` resolves to a file that exists. */
  mainExists: boolean;
  /** `output` from `next.config.ts`. */
  nextOutput: string | undefined;
}): ConfigFinding[] {
  const { config, rateLimitPeriodS, mainExists, nextOutput } = input;
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
  const proposal = limiters.find(
    (l): l is { name: string; simple?: { period?: unknown } } =>
      typeof l === "object" && l !== null && (l as { name?: unknown }).name === "PROPOSAL_LIMITER"
  );

  if (proposal === undefined) {
    findings.push({
      check,
      detail: "wrangler.jsonc has no PROPOSAL_LIMITER ratelimit binding.",
    });
  } else if (rateLimitPeriodS === undefined) {
    findings.push({
      check,
      detail:
        "Could not read RATE_LIMIT_PERIOD_S from worker/index.ts, so the mirror " +
        "with PROPOSAL_LIMITER's period cannot be checked. Was the constant renamed?",
    });
  } else if (proposal.simple?.period !== rateLimitPeriodS) {
    findings.push({
      check,
      detail:
        `PROPOSAL_LIMITER period is ${String(proposal.simple?.period)} in wrangler.jsonc ` +
        `but RATE_LIMIT_PERIOD_S is ${rateLimitPeriodS} in worker/index.ts. The ` +
        `retry-after header would lie to every rate-limited caller.`,
    });
  }

  return findings;
}
