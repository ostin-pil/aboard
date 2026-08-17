import { describe, expect, it } from "vitest";
import {
  checkGateParity,
  checkWranglerWiring,
  parseJsonc,
  stripJsonComments,
  type CiStep,
  type GateCoverage,
} from "./config-lint";

describe("stripJsonComments", () => {
  it("removes line and block comments", () => {
    const src = `{
  // a line comment
  "a": 1, /* inline block */
  /* multi
     line */
  "b": 2
}`;
    expect(JSON.parse(stripJsonComments(src))).toEqual({ a: 1, b: 2 });
  });

  it("leaves // inside string values alone", () => {
    // The reason this is hand-written rather than a regex: wrangler.jsonc's
    // comments carry URLs, and a naive strip truncates the line at the scheme.
    const src = '{ "url": "https://example.com/a//b", "n": 1 }';
    expect(JSON.parse(stripJsonComments(src))).toEqual({
      url: "https://example.com/a//b",
      n: 1,
    });
  });

  it("leaves /* inside string values alone", () => {
    const src = '{ "glob": "src/**/*.ts", "note": "/* not a comment */" }';
    expect(JSON.parse(stripJsonComments(src))).toEqual({
      glob: "src/**/*.ts",
      note: "/* not a comment */",
    });
  });

  it("handles escaped quotes without losing string state", () => {
    const src = '{ "quoted": "say \\"hi\\" // still a string", "n": 1 }';
    expect(JSON.parse(stripJsonComments(src))).toEqual({
      quoted: 'say "hi" // still a string',
      n: 1,
    });
  });

  it("preserves byte offsets so parse errors point at the right place", () => {
    const src = '{\n  // comment\n  "a": 1\n}';
    const stripped = stripJsonComments(src);
    expect(stripped).toHaveLength(src.length);
    expect(stripped.split("\n")).toHaveLength(src.split("\n").length);
  });

  it("round-trips a document with no comments unchanged", () => {
    const src = '{"a":[1,2,{"b":"c"}]}';
    expect(stripJsonComments(src)).toBe(src);
  });
});

describe("parseJsonc", () => {
  it("parses a wrangler-shaped document", () => {
    const src = `{
  // deployment config
  "name": "aboard",
  "main": "worker/index.ts", // entry point
  "ratelimits": [{ "name": "PROPOSAL_LIMITER", "simple": { "limit": 10, "period": 60 } }]
}`;
    expect(parseJsonc(src)).toEqual({
      name: "aboard",
      main: "worker/index.ts",
      ratelimits: [{ name: "PROPOSAL_LIMITER", simple: { limit: 10, period: 60 } }],
    });
  });

  it("throws on a genuine syntax error", () => {
    expect(() => parseJsonc('{ "a": 1 "b": 2 }')).toThrow(SyntaxError);
  });
});

const STEPS: CiStep[] = [
  { uses: "actions/checkout@v4" },
  { name: "Install", run: "npm ci" },
  { name: "Type-check", run: "npx tsc --noEmit" },
  { name: "Sub-package", run: "npm ci && npm run typecheck", "working-directory": "clients" },
];

const COVERAGE: Record<string, GateCoverage> = {
  "npx tsc --noEmit": { step: "Type-check", run: "npx tsc --noEmit" },
  "npm run typecheck:clients": {
    step: "Sub-package",
    equivalent: "CI has no node_modules yet; the gate's script provisions its own.",
  },
};

const CI_ONLY = { Install: "CI starts from a bare checkout." };

describe("checkGateParity", () => {
  it("passes when both lists agree", () => {
    expect(
      checkGateParity({
        steps: STEPS,
        gateCommands: ["npx tsc --noEmit", "npm run typecheck:clients"],
        coverage: COVERAGE,
        ciOnly: CI_ONLY,
      })
    ).toEqual([]);
  });

  it("flags a gate command CI does not run", () => {
    const findings = checkGateParity({
      steps: STEPS,
      // Both covered commands stay in the list. Dropping one would also orphan
      // the CI step covering it, and the reverse-direction check would report
      // that too — correctly, but it would stop this test being about one rule.
      gateCommands: ["npx tsc --noEmit", "npm run typecheck:clients", "npm run lint"],
      coverage: COVERAGE,
      ciOnly: CI_ONLY,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("npm run lint");
  });

  it("flags a covered step that was renamed out of ci.yml", () => {
    const findings = checkGateParity({
      steps: STEPS.filter((s) => s.name !== "Type-check"),
      gateCommands: ["npx tsc --noEmit", "npm run typecheck:clients"],
      coverage: COVERAGE,
      ciOnly: CI_ONLY,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("no longer exists");
  });

  it("reports both directions at once when a step is swapped out", () => {
    // The pair that made the two tests above misread at first: replacing a
    // covered step with an undeclared one is two independent failures, and
    // collapsing them into one would hide whichever was fixed second.
    const findings = checkGateParity({
      steps: [...STEPS.filter((s) => s.name !== "Type-check"), { name: "Types", run: "tsc" }],
      gateCommands: ["npx tsc --noEmit", "npm run typecheck:clients"],
      coverage: COVERAGE,
      ciOnly: CI_ONLY,
    });
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.detail).join("\n")).toContain("no longer exists");
    expect(findings.map((f) => f.detail).join("\n")).toContain('"Types"');
  });

  it("flags a CI step whose run drifted from the gate command", () => {
    const findings = checkGateParity({
      steps: [{ name: "Type-check", run: "npx tsc --noEmit --skipLibCheck" }],
      gateCommands: ["npx tsc --noEmit"],
      coverage: COVERAGE,
      ciOnly: {},
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("--skipLibCheck");
  });

  it("flags a new CI step that is neither covered nor declared CI-only", () => {
    const findings = checkGateParity({
      steps: [...STEPS, { name: "Deploy", run: "npx wrangler deploy" }],
      gateCommands: ["npx tsc --noEmit", "npm run typecheck:clients"],
      coverage: COVERAGE,
      ciOnly: CI_ONLY,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain('"Deploy"');
  });

  it("flags a CI_ONLY entry left behind after its step was deleted", () => {
    const findings = checkGateParity({
      steps: STEPS,
      gateCommands: ["npx tsc --noEmit", "npm run typecheck:clients"],
      coverage: COVERAGE,
      ciOnly: { ...CI_ONLY, Ghost: "gone" },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("Ghost");
  });

  it("flags an unnamed run step, which parity cannot account for", () => {
    const findings = checkGateParity({
      steps: [{ run: "echo hi" }],
      gateCommands: [],
      coverage: {},
      ciOnly: {},
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("no `name:`");
  });

  it("ignores uses-only steps, which are actions rather than checks", () => {
    expect(
      checkGateParity({
        steps: [{ uses: "actions/setup-node@v4" }],
        gateCommands: [],
        coverage: {},
        ciOnly: {},
      })
    ).toEqual([]);
  });
});

const WRANGLER = {
  main: "worker/index.ts",
  assets: { directory: "./out", binding: "ASSETS" },
  ratelimits: [
    { name: "PROPOSAL_LIMITER", simple: { limit: 10, period: 60 } },
    { name: "REGISTRATION_LIMITER", simple: { limit: 5, period: 60 } },
  ],
};

const WIRING_OK = {
  config: WRANGLER,
  limiterPeriods: { PROPOSAL_LIMITER: 60, REGISTRATION_LIMITER: 60 },
  mainExists: true,
  nextOutput: "export",
};

/** The shipped ratelimits with one binding's period overridden. */
function withPeriod(binding: string, period: unknown) {
  return {
    ...WRANGLER,
    ratelimits: WRANGLER.ratelimits.map((l) =>
      l.name === binding ? { ...l, simple: { ...l.simple, period } } : l,
    ),
  };
}

describe("checkWranglerWiring", () => {
  it("passes on the shipped configuration", () => {
    expect(checkWranglerWiring(WIRING_OK)).toEqual([]);
  });

  it("catches the proposal period drifting from the Worker constant", () => {
    // 10 and 60 are the only values Cloudflare accepts, so this is the single
    // legal edit, and it is the one that silently breaks retry-after.
    const findings = checkWranglerWiring({
      ...WIRING_OK,
      config: withPeriod("PROPOSAL_LIMITER", 10),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("retry-after");
    expect(findings[0].detail).toContain("RATE_LIMIT_PERIOD_S");
  });

  // S4. The identical obligation on the registration limiter, which nothing
  // read until session 59. Both sides are 60 today, so no drift was live.
  it("catches the registration period drifting from the OAuth constant", () => {
    const findings = checkWranglerWiring({
      ...WIRING_OK,
      config: withPeriod("REGISTRATION_LIMITER", 10),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("retry-after");
    expect(findings[0].detail).toContain("REGISTRATION_LIMIT_PERIOD_S");
    expect(findings[0].detail).toContain("worker/oauth.ts");
  });

  // A matched pair can still be illegal: Cloudflare rejects anything but 10 or
  // 60 at deploy, and every other check here would pass it.
  it.each(["PROPOSAL_LIMITER", "REGISTRATION_LIMITER"])(
    "catches an off-platform period on %s even when the mirror agrees",
    (binding) => {
      const findings = checkWranglerWiring({
        ...WIRING_OK,
        config: withPeriod(binding, 30),
        limiterPeriods: { PROPOSAL_LIMITER: 30, REGISTRATION_LIMITER: 30 },
      });
      // Only the edited binding is off-platform; the other still reads 60 in
      // wrangler.jsonc, so it reports a mirror mismatch against the 30.
      const offPlatform = findings.filter((f) => f.detail.includes("fail at deploy"));
      expect(offPlatform).toHaveLength(1);
      expect(offPlatform[0].detail).toContain(binding);
      expect(offPlatform[0].detail).toContain("10 or 60");
    },
  );

  it("catches a main entry point that does not exist", () => {
    const findings = checkWranglerWiring({ ...WIRING_OK, mainExists: false });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("does not exist");
  });

  it("catches an assets directory that is not what the build writes", () => {
    const findings = checkWranglerWiring({
      ...WIRING_OK,
      config: { ...WRANGLER, assets: { directory: "./dist" } },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("./out");
  });

  it("catches next.config drifting off static export", () => {
    const findings = checkWranglerWiring({ ...WIRING_OK, nextOutput: "standalone" });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("static export");
  });

  it.each([
    ["PROPOSAL_LIMITER", "RATE_LIMIT_PERIOD_S"],
    ["REGISTRATION_LIMITER", "REGISTRATION_LIMIT_PERIOD_S"],
  ])("reports %s's constant going unread rather than passing silently", (binding, constant) => {
    const findings = checkWranglerWiring({
      ...WIRING_OK,
      limiterPeriods: { ...WIRING_OK.limiterPeriods, [binding]: undefined },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain(constant);
  });

  it("catches a missing limiter binding, one finding per limiter", () => {
    const findings = checkWranglerWiring({
      ...WIRING_OK,
      config: { ...WRANGLER, ratelimits: [] },
    });
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.detail).join(" ")).toContain("PROPOSAL_LIMITER");
    expect(findings.map((f) => f.detail).join(" ")).toContain("REGISTRATION_LIMITER");
  });
});
