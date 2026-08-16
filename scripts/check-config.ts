/**
 * Gate for the two hand-written config files nothing else in the repo reads.
 *
 *   npm run check:config
 *
 * Session 53 planted a YAML syntax error in `.github/workflows/ci.yml` and a
 * JSON syntax error in `wrangler.jsonc` at the same time and ran the whole
 * gate: all nine commands exited 0. That is the hole this closes. The two files
 * fail differently and only one of them fails loudly:
 *
 *   - `wrangler.jsonc` has a reader in CI (`wrangler deploy --dry-run` exits 1
 *     on the same fault), so a broken deploy config shows up as a red check.
 *   - `ci.yml` has no reader anywhere, and it cannot have one in itself: a
 *     workflow that will not parse does not run, so the failure presents as CI
 *     going quiet rather than red. A PR with a broken `ci.yml` looks like a PR
 *     with nothing to report.
 *
 * Beyond parseability this enforces two cross-file rules the repo had written
 * down and left to memory: gate/CI parity (`CLAUDE.md`, since session 48) and
 * the rate-limit period mirrored between `wrangler.jsonc` and `worker/index.ts`
 * (a comment on each side pointing at the other, since the limiter landed).
 *
 * The rules are pure and unit-tested in `src/lib/config-lint.ts`; this file is
 * the filesystem half plus the two tables that name this repo's actual steps.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  checkGateParity,
  checkWranglerWiring,
  parseJsonc,
  LIMITER_MIRRORS,
  type CiStep,
  type ConfigFinding,
  type GateCoverage,
  type LimiterBinding,
  type WranglerConfig,
} from "../src/lib/config-lint";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const at = (relative: string) => `${ROOT}${relative}`;

const out = (line = "") => process.stdout.write(`${line}\n`);

/**
 * How each `build_commands` / `test_commands` entry is covered in CI.
 *
 * Keyed by the exact manifest string, so a command renamed in the manifest
 * arrives here as "no entry accounts for it" rather than passing unnoticed.
 */
const GATE_COVERAGE: Record<string, GateCoverage> = {
  "shellcheck $(git ls-files '*.sh')": {
    step: "Shellcheck",
    run: "shellcheck $(git ls-files '*.sh')",
  },
  "npx tsc --noEmit": { step: "Type-check", run: "npx tsc --noEmit" },
  "npm run lint": { step: "Lint", run: "npm run lint" },
  "npm run check:exports": { step: "Check exports", run: "npm run check:exports" },
  "npm run typecheck:mcp": {
    step: "Type-check the MCP server",
    equivalent:
      "CI runs `npm ci && npm run typecheck` under working-directory: mcp-server. " +
      "The gate's script provisions node_modules itself; CI starts from a bare checkout.",
  },
  "npm run typecheck:clients": {
    step: "Install and type-check the client adapter",
    equivalent:
      "Same split as the MCP server: CI installs first, the gate's script self-provisions.",
  },
  "npm run lint:resolution -- --strict": {
    step: "Resolution-criteria lint",
    run: "npm run lint:resolution -- --strict",
  },
  "npm run check:config": { step: "Check config", run: "npm run check:config" },
  "npm run build": { step: "Build", run: "npm run build" },
  "npm run check:built-urls": { step: "Check built URLs", run: "npm run check:built-urls" },
  "npm test": { step: "Test", run: "npm test" },
};

/**
 * Steps CI runs that the session gate deliberately does not, each with why.
 *
 * Adding a step to `ci.yml` without adding it here fails this check, which is
 * the point: the choice to leave something out of the session gate should be
 * made once and written down, not rediscovered by a session that wonders why
 * CI is red on a tree that just passed locally.
 */
const CI_ONLY: Record<string, string> = {
  Install: "CI starts from a bare checkout; a developer machine already has node_modules.",
  "Bundle the Worker (write path)":
    "Costs a wrangler download per run. Measured narrow in session 48 (exits 0 on an " +
    "unknown compatibility flag and on a node: import with no nodejs_compat); what it " +
    "does catch is a stale `main` path, which check:config now also catches.",
  "Serve the static export": "Needs a served build; there is no server under output: export.",
  "Validate /api/graph against the v0 schema":
    "Needs the served export plus ajv, which is not a root dependency. The serializers " +
    "themselves are covered in-process by src/lib/jsonld.test.ts.",
  "Validate a single-claim endpoint": "Same served-export dependency as the graph endpoint.",
  "Stop the static server": "Teardown for the served-export steps above.",
};

const findings: ConfigFinding[] = [];
const add = (check: string, detail: string) => findings.push({ check, detail });

/** `build_commands` and `test_commands`, read from the manifest's YAML block. */
function gateCommands(): string[] {
  const source = readFileSync(at(".claude/lifecycle-manifest.md"), "utf8");
  const block = /```yaml\n([\s\S]*?)```/.exec(source);
  if (block === null) {
    add("manifest", "No ```yaml block in .claude/lifecycle-manifest.md.");
    return [];
  }
  const manifest = YAML.parse(block[1]) as Record<string, unknown>;
  const list = (key: string): string[] => {
    const value = manifest[key];
    if (!Array.isArray(value)) {
      add("manifest", `\`${key}\` is missing or not a list in the manifest.`);
      return [];
    }
    return value.map(String);
  };
  return [...list("build_commands"), ...list("test_commands")];
}

/** `jobs.build.steps` from ci.yml, or `undefined` if the file will not parse. */
function ciSteps(): CiStep[] | undefined {
  const path = ".github/workflows/ci.yml";
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(at(path), "utf8"));
  } catch (error) {
    add("parse", `${path} is not valid YAML: ${(error as Error).message}`);
    return undefined;
  }
  const steps = (parsed as { jobs?: { build?: { steps?: unknown } } })?.jobs?.build?.steps;
  if (!Array.isArray(steps)) {
    add("parse", `${path} parsed, but jobs.build.steps is missing or not a list.`);
    return undefined;
  }
  return steps as CiStep[];
}

/** The parsed `wrangler.jsonc`, or `undefined` if it will not parse. */
function wrangler(): WranglerConfig | undefined {
  try {
    return parseJsonc(readFileSync(at("wrangler.jsonc"), "utf8")) as WranglerConfig;
  } catch (error) {
    add("parse", `wrangler.jsonc is not valid JSONC: ${(error as Error).message}`);
    return undefined;
  }
}

/**
 * Each limiter's mirror constant out of its source file, by source match.
 *
 * Read as text rather than imported because the worker modules export only what
 * the runtime needs (`worker/index.ts` its default fetch handler), the same
 * constraint session 47 hit with A6 and session 51 with the proposal-error
 * classifier. `undefined` for any entry is itself a finding, so a rename
 * surfaces rather than silently disabling that mirror check.
 */
function limiterPeriods(): Record<LimiterBinding, number | undefined> {
  const periods = {} as Record<LimiterBinding, number | undefined>;
  for (const mirror of LIMITER_MIRRORS) {
    const source = readFileSync(at(mirror.source), "utf8");
    const match = new RegExp(`const ${mirror.constant}\\s*=\\s*(\\d+)`).exec(source);
    periods[mirror.binding] = match === null ? undefined : Number(match[1]);
  }
  return periods;
}

/** `output` from `next.config.ts`, by source match, for the same reason. */
function nextOutput(): string | undefined {
  const source = readFileSync(at("next.config.ts"), "utf8");
  const match = /output:\s*"([^"]+)"/.exec(source);
  return match?.[1];
}

const steps = ciSteps();
if (steps !== undefined) {
  findings.push(
    ...checkGateParity({
      steps,
      gateCommands: gateCommands(),
      coverage: GATE_COVERAGE,
      ciOnly: CI_ONLY,
    })
  );
}

const config = wrangler();
if (config !== undefined) {
  findings.push(
    ...checkWranglerWiring({
      config,
      limiterPeriods: limiterPeriods(),
      mainExists: typeof config.main === "string" && existsSync(at(config.main)),
      nextOutput: nextOutput(),
    })
  );
}

if (findings.length === 0) {
  out("check:config: ci.yml and wrangler.jsonc parse; gate/CI parity and wrangler wiring agree.");
  process.exit(0);
}

let current = "";
for (const finding of findings) {
  if (finding.check !== current) {
    current = finding.check;
    out();
    out(`${current}:`);
  }
  out(`  - ${finding.detail}`);
}
out();
out(`${findings.length} finding(s). These files have no other reader in the gate.`);
process.exit(1);
