import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * `public/_headers` is the only place the static export's response headers are
 * declared, and until this file nothing in the repo read it. That is the same
 * shape as the `tokens.ts`/`globals.css` split next door: a fact stated in a
 * non-TypeScript file that no command relates to anything.
 *
 * The fault it is written for was live on 2026-08-27. `robots.txt` and
 * `llms.txt` were served as bare `text/plain`, and RFC 2046 makes an absent
 * charset on `text/*` mean US-ASCII, so a browser fell back to its locale
 * default and rendered the file's em dashes as `â€"`. The bytes were correct
 * UTF-8 throughout; only the header was wrong. The five markdown twins had the
 * same defect on `text/markdown`, which was invisible from the negotiated path
 * because the Worker sets the charset itself (`worker/index.ts`) and only the
 * `/index.md` URLs come from the assets binding.
 *
 * Why no other command sees it: the Route Handlers that generate these files
 * already set `charset=utf-8` and are correct, so grepping the source finds a
 * charset everywhere. `output: "export"` discards those headers, which is the
 * same reason the CORS rules in `_headers` have to be restated by hand. The
 * build emits the file without reading it, `check:built-urls` looks for
 * localhost, and eslint and tsc do not read it at all.
 */

const headers = readFileSync(
  fileURLToPath(new URL("../../public/_headers", import.meta.url)),
  "utf8"
);

/** `Content-Type` declarations as [path, value], comments and blanks dropped. */
function contentTypes(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let path = "";
  for (const raw of headers.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      path = line.trim();
      continue;
    }
    const m = /^\s+Content-Type:\s*(.+)$/i.exec(line);
    if (m) out.push([path, m[1].trim()]);
  }
  return out;
}

/**
 * Types whose interpretation depends on a charset. `text/*` is the RFC 2046
 * case; the structured-suffix JSON types are included because the project
 * declares a charset on them already and dropping it should be a test failure
 * rather than a silent change of mind.
 */
const NEEDS_CHARSET = /^(text\/|application\/(ld\+json|linkset\+json|json))/i;

describe("public/_headers", () => {
  it("declares charset=utf-8 on every charset-dependent content type", () => {
    const offenders = contentTypes()
      .filter(([, value]) => NEEDS_CHARSET.test(value))
      .filter(([, value]) => !/;\s*charset=utf-8\b/i.test(value))
      .map(([path, value]) => `${path} -> ${value}`);
    expect(offenders).toEqual([]);
  });

  it("covers the extension-inferred text formats, not only the extensionless routes", () => {
    // The original file named only the routes that export without an extension,
    // because those have no content type at all otherwise. These three do infer
    // one from the extension, which is exactly why they were missed.
    const paths = contentTypes().map(([path]) => path);
    expect(paths).toContain("/robots.txt");
    expect(paths).toContain("/llms.txt");
    expect(paths).toContain("/*.md");
  });

  it("declares no content type twice for one path", () => {
    const paths = contentTypes().map(([path]) => path);
    expect(paths).toEqual([...new Set(paths)]);
  });
});
