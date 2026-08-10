import { describe, it, expect } from "vitest";
import { classifySubmitFailure, type SubmitFailure } from "@/lib/proposal-errors";

const commitFailure = (over: Partial<SubmitFailure> = {}): SubmitFailure => ({
  step: "commit",
  status: 422,
  intent: "create",
  path: "data/democratic_backsliding/claims/S5.md",
  detail: "could not commit data/democratic_backsliding/claims/S5.md (HTTP 422)",
  ...over,
});

const claim = { kind: "claim", id: "S5" } as const;

describe("classifySubmitFailure", () => {
  it("reads a 422 on create as an id collision, not a GitHub fault", () => {
    const e = classifySubmitFailure(commitFailure(), claim);

    expect(e.status).toBe(409);
    expect(e.code).toBe("id_collision");
  });

  it("names the id and the path the caller needs to act on", () => {
    const e = classifySubmitFailure(commitFailure(), claim);

    expect(e.extra.id).toBe("S5");
    expect(e.extra.path).toBe("data/democratic_backsliding/claims/S5.md");
    expect(e.extra.kind).toBe("claim");
    expect(e.extra.retryable).toBe(true);
    expect(String(e.extra.remediation)).toContain("/api/graph");
  });

  it("tells a dossier caller something different from a claim caller", () => {
    const asClaim = classifySubmitFailure(commitFailure(), claim);
    const asDossier = classifySubmitFailure(
      commitFailure({ path: "data/democratic_backsliding/dossiers/S2.yaml" }),
      { kind: "dossier", id: "S2" },
    );

    // Both are 409s, but "mint the next id" is wrong advice for a dossier:
    // there is no next id, and a second dossier is refused by design.
    expect(asDossier.status).toBe(409);
    expect(asDossier.extra.remediation).not.toEqual(asClaim.extra.remediation);
    expect(String(asDossier.extra.remediation)).toContain("already exists");
  });

  describe("stays a 502 for everything that is not the collision", () => {
    it("a 422 on an update, where a concurrent write moved the file", () => {
      const e = classifySubmitFailure(commitFailure({ intent: "update" }), claim);

      expect(e.status).toBe(502);
      expect(e.code).toBe("github_failed");
    });

    it("a commit that failed for some other reason", () => {
      const e = classifySubmitFailure(commitFailure({ status: 500 }), claim);

      expect(e.status).toBe(502);
    });

    it("a failure at a different step that happens to be 422", () => {
      for (const step of ["base-ref", "branch", "pull-request"] as const) {
        const e = classifySubmitFailure(commitFailure({ step }), claim);
        expect(e.status, `step ${step}`).toBe(502);
      }
    });

    it("preserves the original trail in the message", () => {
      const e = classifySubmitFailure(
        commitFailure({ step: "pull-request", status: 403, detail: "could not open PR (HTTP 403)" }),
        claim,
      );

      expect(e.message).toContain("could not open PR (HTTP 403)");
    });
  });

  it("carries no extra fields on the passthrough path", () => {
    // The 502 shape is what callers already parse; adding fields to it would be
    // a silent contract change for the case that did not need fixing.
    const e = classifySubmitFailure(commitFailure({ status: 500 }), claim);

    expect(e.extra).toEqual({});
  });
});
