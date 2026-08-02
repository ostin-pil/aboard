/**
 * Reports forecasts whose resolution criteria could not be settled by a
 * reader who distrusts aboard.
 *
 *   npm run lint:resolution            # report, always exit 0
 *   npm run lint:resolution -- --strict  # exit 1 if anything is flagged
 *
 * Warn-only by default and deliberately outside `npm run build`: failing the
 * product build on prose heuristics would be the wrong trade. The session-end
 * gate is stricter — `build_commands` in `.claude/lifecycle-manifest.md` runs
 * this with `--strict` since session 38, when the live corpus first reported
 * clean (pre-anchor forecasts are marked `supersededBy` and skipped).
 *
 * The rules live in `src/lib/resolution-lint.ts` (pure, unit-tested); this
 * file is the filesystem half. It parses `data/` directly rather than through
 * `src/lib/data/loader.ts`, which is `server-only` and cannot be imported by a
 * plain node script.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { Forecast } from "../src/lib/types";
import { lintForecast, type ResolutionFinding } from "../src/lib/resolution-lint";

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));

const out = (line = "") => process.stdout.write(`${line}\n`);

/** Every `data/<domain>/forecasts/*.yaml`, sorted for stable output. */
function forecastFiles(): { domain: string; path: string }[] {
  const domains = readdirSync(DATA_DIR)
    .filter((name) => statSync(join(DATA_DIR, name)).isDirectory())
    .sort();

  return domains.flatMap((domain) => {
    const dir = join(DATA_DIR, domain, "forecasts");
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return []; // a domain need not have forecasts
    }
    return entries
      .filter((name) => name.endsWith(".yaml"))
      .sort()
      .map((name) => ({ domain, path: join(dir, name) }));
  });
}

const files = forecastFiles();
const findings: (ResolutionFinding & { domain: string })[] = [];
const unparseable: { path: string; error: string }[] = [];
const superseded: { id: string; by: string[]; domain: string }[] = [];

for (const { domain, path } of files) {
  const parsed = Forecast.safeParse(YAML.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    unparseable.push({ path, error: parsed.error.issues[0]?.message ?? "invalid" });
    continue;
  }
  if (parsed.data.supersededBy?.length) {
    superseded.push({ id: parsed.data.id, by: parsed.data.supersededBy, domain });
  }
  for (const finding of lintForecast(parsed.data)) {
    findings.push({ ...finding, domain });
  }
}

out();
out(`Resolution lint — ${files.length} forecast(s) across ${
  new Set(files.map((f) => f.domain)).size
} domain(s)`);
out();

for (const { path, error } of unparseable) {
  out(`  ERROR  ${path}: ${error}`);
}

if (findings.length === 0 && unparseable.length === 0) {
  out("  No findings. Every forecast names a checkable threshold and an");
  out("  external resolution source.");
} else {
  let current = "";
  for (const f of findings) {
    const key = `${f.domain}/${f.forecastId}`;
    if (key !== current) {
      current = key;
      out(`  ${key}`);
    }
    out(`    [${f.rule}] ${f.message}`);
  }
}

if (superseded.length > 0) {
  out();
  out(`  Superseded, not linted (criteria are historical record):`);
  for (const s of superseded) {
    out(`    ${s.domain}/${s.id} → ${s.by.join(", ")}`);
  }
}

out();
const flagged = new Set(findings.map((f) => f.forecastId)).size;
out(
  `${findings.length} finding(s) on ${flagged} of ${files.length} forecast(s).` +
    (superseded.length > 0 ? ` ${superseded.length} superseded forecast(s) skipped.` : "") +
    (unparseable.length > 0 ? ` ${unparseable.length} file(s) failed to parse.` : "")
);
out(
  "Findings are advisory: reread the criteria, then fix or keep them. See " +
    "src/lib/resolution-lint.ts for what each rule is blunt about."
);
out();

const strict = process.argv.includes("--strict");
if (strict && (findings.length > 0 || unparseable.length > 0)) {
  process.exit(1);
}
if (unparseable.length > 0) {
  process.exit(1); // a file that will not parse is a real error, not a heuristic
}
