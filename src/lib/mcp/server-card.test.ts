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
 * The version has five hand-written homes as of session 67: `package.json`,
 * `SERVER_VERSION` in `protocol.ts`, the two cards, and now `mcp-server/package.json`,
 * which the cards name in their `packages` entry. `SERVER_VERSION`'s doc comment
 * already claims it mirrors `package.json`; these tests are what make that claim
 * checkable, and extend it to the two documents the registry and any probing agent
 * actually read, and to the npm package they send a client to install.
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

/**
 * Session 67 gave the card a `packages` entry, which made `mcp-server/package.json`
 * a fifth hand-written home for a version and the first one that is also a claim
 * about a third-party registry. The failure it invites is quiet: bump the npm
 * package, forget the card, and the registry directs every client at a version
 * that is no longer latest, with the app, the tests and the build all green
 * because none of them reads npm.
 *
 * These assertions relate the card to the package it advertises. What they
 * deliberately do not do is call the npm registry: a network round trip would
 * make `npm test` fail offline and on a rate limit, and the drift worth catching
 * is between two files in this repo. Whether the version is actually live is the
 * publish step's job, and `npm view aboard-mcp-server` answers it in one line.
 */
describe("the card's npm package entry", () => {
  const registry = card(REGISTRY_CARD);
  const mcpPkg = card(join(REPO_ROOT, "mcp-server/package.json"));

  /** The one npm entry, narrowed so its fields can be read without `any`. */
  function npmPackage(): Record<string, JsonValue> {
    const packages = registry.packages;
    if (!Array.isArray(packages)) throw new Error("the card has no packages array");
    const npm = packages.find(
      (p) => p !== null && typeof p === "object" && !Array.isArray(p) && p.registryType === "npm",
    );
    if (npm === undefined || npm === null || typeof npm !== "object" || Array.isArray(npm)) {
      throw new Error("the card has no npm package entry");
    }
    return npm;
  }

  it("advertises the package name mcp-server/package.json declares", () => {
    expect(npmPackage().identifier).toBe(mcpPkg.name);
  });

  it("advertises the version mcp-server/package.json declares", () => {
    // The card pins an exact version — the schema rejects ranges — so a publish
    // that does not edit this file leaves the registry one release behind.
    expect(npmPackage().version).toBe(mcpPkg.version);
  });

  it("advertises a package that is actually publishable", () => {
    // `private: true` was the state that made M4 a finding: a card naming a
    // package npm would refuse to accept. Re-adding the flag must fail here
    // rather than at the next publish attempt.
    expect(mcpPkg.private).toBeUndefined();
  });

  it("declares stdio, which is the transport the package speaks", () => {
    // The streamable-http endpoint is a `remotes` entry, not this one. Saying
    // stdio here and http there is what lets a client choose without launching
    // the wrong thing to find out.
    expect(npmPackage().transport).toEqual({ type: "stdio" });
  });

  it("points bin at built output rather than at TypeScript", () => {
    // The card telling a client to run `npx aboard-mcp-server` is only true if
    // the bin is executable by node. It used to be `src/index.ts` behind an
    // `npx tsx` shebang, which resolved only inside a checkout of this repo.
    const bin = mcpPkg.bin;
    if (bin === null || typeof bin !== "object" || Array.isArray(bin)) {
      throw new Error("mcp-server/package.json has no bin object");
    }
    expect(bin["aboard-mcp-server"]).toBe("dist/index.js");
  });
});
