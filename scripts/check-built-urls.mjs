/**
 * Post-build gate: no localhost or dead-domain URL may survive into `out/`.
 *
 * This is the check that would have caught the missing `metadataBase` — under
 * `output: "export"` the Metadata API resolved every file-convention OG image
 * against http://localhost:3000, so 32 of 33 built pages shipped social cards
 * that 404 in production. Type-checking cannot see it (the URLs are computed by
 * Next at build) and the schema validator cannot either (they live in <meta>
 * tags, not in the JSON-LD). Only the built HTML shows it.
 *
 * Usage: node scripts/check-built-urls.mjs [outDir]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const OUT = process.argv[2] ?? "out";

/**
 * Patterns that must never appear in built output, with why.
 *
 * The localhost pattern requires a quote immediately before the URL, so it
 * matches an *emitted* URL — `content="http://localhost…"`, `href="…"`, or a
 * JSON string value — but not prose that happens to contain one. The /about
 * page and the export pack's README both legitimately print
 * `clients/validate.ts http://localhost:3000/api/graph` as an instruction to a
 * developer; that is visible text, not a link the page resolves.
 */
const FORBIDDEN = [
  [
    /["']http:\/\/localhost/g,
    "an emitted localhost URL (missing metadataBase, or a hardcoded dev origin)",
  ],
  [/aboard\.dev/g, "the dead aboard.dev domain"],
];

const SCANNED_EXT = new Set([".html", ".json", ".txt", ".xml"]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

try {
  statSync(OUT);
} catch {
  console.error(`check-built-urls: no build output at "${OUT}/" — run \`npm run build\` first.`);
  process.exit(1);
}

const files = walk(OUT).filter((f) => SCANNED_EXT.has(extname(f)) || extname(f) === "");
const failures = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // binary or unreadable — not a URL surface
  }
  for (const [pattern, why] of FORBIDDEN) {
    const count = (text.match(pattern) ?? []).length;
    if (count > 0) failures.push({ file, needle: pattern.source, why, count });
  }
}

if (failures.length > 0) {
  const total = failures.reduce((n, f) => n + f.count, 0);
  console.error(`check-built-urls: FAIL — ${total} forbidden URL(s) in ${failures.length} file(s):\n`);
  for (const f of failures.slice(0, 20)) {
    console.error(`  ${f.file}: ${f.count}× "${f.needle}" — ${f.why}`);
  }
  if (failures.length > 20) console.error(`  …and ${failures.length - 20} more file(s).`);
  process.exit(1);
}

console.log(`check-built-urls: OK — scanned ${files.length} file(s) in ${OUT}/, no forbidden URLs.`);
