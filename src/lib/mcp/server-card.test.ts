/**
 * Repo invariants over the published server card.
 *
 * The card is a static asset rather than generated code, and it exists twice:
 * `/.well-known/mcp.json` (the registry's spelling, and the only file
 * `scripts/publish-registry.sh` ever uploads) and `/.well-known/mcp/server-card.json`
 * (the SEP-1649 spelling). Session 30 wrote both in one commit as a hedge against
 * the four spellings then in circulation, so they have never had the chance to
 * diverge and nothing has been watching them. Editing one and not the other would
 * leave the SEP-era path serving a stale card, which is the same drift session 33
 * deleted the root `server.json` to avoid.
 *
 * The version has four hand-written homes: `package.json`, `SERVER_VERSION` in
 * `protocol.ts`, and the two cards. `SERVER_VERSION`'s doc comment already claims
 * it mirrors `package.json`; these tests are what make that claim checkable, and
 * extend it to the two documents the registry and any probing agent actually read.
 *
 * Reading `public/` from disk is a wider reach than the pure-module unit tests
 * around it, and stays inside `vitest.config.ts`'s constraint: `readFileSync` over
 * three JSON assets pulls in neither `server-only` nor the Next runtime.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SERVER_VERSION } from "@/lib/mcp/protocol";
import { CANONICAL_ORIGIN } from "@/lib/site";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The registry's spelling. `publish-registry.sh` uploads this exact path. */
const REGISTRY_CARD = join(REPO_ROOT, "public/.well-known/mcp.json");
/** The SEP-1649 spelling, mirrored so either probe finds a card. */
const SEP_CARD = join(REPO_ROOT, "public/.well-known/mcp/server-card.json");

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function readJson(path: string): JsonValue {
  return JSON.parse(readFileSync(path, "utf8")) as JsonValue;
}

/**
 * Key order is not meaningful in JSON, so the mirror is compared on content.
 * This is the same canonicalisation `publish-registry.sh` runs before comparing
 * the local card against the deployed one.
 */
function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

/** Narrow the parsed card to an object so fields can be read without `any`. */
function card(path: string): Record<string, JsonValue> {
  const parsed = readJson(path);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return parsed;
}

describe("the two server-card paths", () => {
  it("serve the same document", () => {
    // Not a style preference: a client that probes only the SEP-era spelling
    // must not get an older card than one that probes the registry spelling.
    expect(canonicalize(readJson(SEP_CARD))).toEqual(canonicalize(readJson(REGISTRY_CARD)));
  });
});

describe("the server card", () => {
  const registry = card(REGISTRY_CARD);

  it("carries the version the endpoint reports over the wire", () => {
    // A card advertising a version the server does not report would put a lie
    // in the registry, which is read by clients that never call `initialize`.
    expect(registry.version).toBe(SERVER_VERSION);
  });

  it("carries the version in package.json", () => {
    // `SERVER_VERSION`'s doc comment claims this; nothing checked it until now.
    const pkg = card(join(REPO_ROOT, "package.json"));
    expect(registry.version).toBe(pkg.version);
  });

  it("points its remote at the canonical MCP endpoint", () => {
    expect(registry.remotes).toEqual([
      { type: "streamable-http", url: `${CANONICAL_ORIGIN}/mcp` },
    ]);
  });

  it("keeps websiteUrl on the canonical origin", () => {
    expect(String(registry.websiteUrl).startsWith(`${CANONICAL_ORIGIN}/`)).toBe(true);
  });

  it("names itself inside the DNS-verified namespace", () => {
    // Publishing is authorised by a TXT record at the untype.me apex, which
    // grants `me.untype/*` and nothing else. A name outside it cannot publish.
    expect(String(registry.name).startsWith("me.untype/")).toBe(true);
  });
});
