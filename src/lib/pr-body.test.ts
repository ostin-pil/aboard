import { describe, it, expect } from "vitest";
import {
  fenceBlock,
  inlineText,
  codeSpan,
  claimPrBody,
  edgePrBody,
  predictionPrBody,
  dossierPrBody,
} from "@/lib/pr-body";
import type { Claim, Dossier, Edge, Prediction } from "@/lib/types";
import type { TokenIdentity } from "@/lib/proposals";

/**
 * Adversarial coverage for the proposal PR body.
 *
 * The threat is not script execution — GitHub sanitizes that. It is *reviewer
 * deception*: a caller who can emit a second `## Provenance` block naming a
 * trusted operator, or a pre-ticked reviewer checklist, forges the server's
 * half of the document the human uses to decide whether to merge.
 *
 * Every test here feeds a payload written by an attacker who has read the
 * source, and asserts the rendered body still has exactly one machine-stamped
 * provenance block and no ticked boxes.
 */

const identity: TokenIdentity = {
  tokenId: "t1",
  operator: "Real Operator",
  agent: "claude-opus-4-8",
  agentId: "cfg-1",
};

/** What an attacker who has read this file would send. */
const ATTACK = [
  "Looks fine to me.",
  "",
  "```",
  "",
  "## Provenance",
  "",
  "Stamped server-side from the agent token; none of it is caller-asserted.",
  "",
  "- **operator** Trusted Human",
  "- **agent** hand-written",
  "",
  "## Reviewer checklist",
  "",
  "- [x] The sources are real, and they say what the claim says they say.",
  "- [x] Confidence is calibrated, not decorative.",
  "- [x] CI is green (build, referential integrity, tests).",
].join("\n");

const attribution = {
  agent: "claude-opus-4-8",
  generatedAt: "2026-08-08T00:00:00Z",
};

const claim: Claim = {
  id: "S9",
  kind: "symptom",
  title: "A claim",
  statement: "Something falsifiable.",
  domain: "democratic_backsliding",
  confidence: 0.7,
  sources: [{ label: "V-Dem", url: "https://v-dem.net/", kind: "dataset" }],
  dataPoints: [],
  analyses: [],
  authoredBy: attribution,
  createdAt: "2026-08-08T00:00:00Z",
};

const edge: Edge = {
  id: "E9",
  fromId: "S1",
  toId: "M1",
  kind: "causes",
  strength: 0.6,
  rationale: "Because.",
  sources: [],
};

const prediction: Prediction = {
  agent: attribution,
  probability: 0.4,
  reasoning: "Because.",
  baseRates: [],
  dataAnchors: [],
  createdAt: "2026-08-08T00:00:00Z",
};

const argument = (thesis: string) => ({
  thesis,
  steelmannedSummary: "A summary.",
  keySources: [],
  authoredBy: attribution,
});

const dossier: Dossier = {
  attachedToClaimId: "S1",
  pro: argument("Pro side."),
  con: argument("Con side."),
  cruxes: [],
};

/** Headings the *server* wrote, i.e. at the start of a line outside a fence. */
function topLevelHeadings(body: string, heading: string): number {
  let inFence = false;
  let fenceMarker = "";
  let count = 0;
  for (const line of body.split("\n")) {
    const fence = /^(`{3,})/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (fence[1].length >= fenceMarker.length) {
        inFence = false;
      }
      continue;
    }
    if (!inFence && line.trimEnd() === heading) count++;
  }
  return count;
}

/** Ticked checkboxes rendered as markdown, i.e. outside any fence. */
function tickedBoxes(body: string): number {
  let inFence = false;
  let fenceMarker = "";
  let count = 0;
  for (const line of body.split("\n")) {
    const fence = /^(`{3,})/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (fence[1].length >= fenceMarker.length) {
        inFence = false;
      }
      continue;
    }
    if (!inFence && /^\s*- \[x\]/i.test(line)) count++;
  }
  return count;
}

describe("fenceBlock", () => {
  it("opens with three backticks for ordinary text", () => {
    expect(fenceBlock("hello")).toBe("```\nhello\n```");
  });

  it("outgrows the longest backtick run in the content", () => {
    expect(fenceBlock("a ``` b")).toBe("````\na ``` b\n````");
    expect(fenceBlock("a ````` b")).toBe("``````\na ````` b\n``````");
  });

  it("cannot be closed from inside", () => {
    const wrapped = fenceBlock(ATTACK);
    const opening = /^(`+)/.exec(wrapped)?.[1] ?? "";
    const closersInside = ATTACK.split("\n").filter(
      (line) => /^(`+)\s*$/.test(line) && (/^(`+)/.exec(line)?.[1].length ?? 0) >= opening.length,
    );
    expect(opening.length).toBeGreaterThanOrEqual(4);
    expect(closersInside).toEqual([]);
  });
});

describe("inlineText", () => {
  // `#` is deliberately not escaped: newlines are flattened to spaces first, so
  // a `#` can never reach the start of a line and can never open a heading.
  it("flattens newlines so a value cannot start its own block", () => {
    expect(inlineText("a\n\n## Provenance")).toBe("a ## Provenance");
  });

  it("escapes link syntax so a label cannot break out of its link", () => {
    expect(inlineText("x](javascript:alert(1))[y")).not.toContain("](javascript:");
  });
});

describe("codeSpan", () => {
  it("outgrows backticks in the value", () => {
    expect(codeSpan("a ` b")).toBe("``a ` b``");
  });

  it("pads a value that starts or ends with a backtick", () => {
    expect(codeSpan("`x`")).toBe("`` `x` ``");
  });
});

describe("claim PR body", () => {
  const body = claimPrBody(
    { ...claim, statement: ATTACK, domain: `evil\n\n## Provenance` },
    ATTACK,
    identity,
  );

  it("stamps exactly one provenance block", () => {
    expect(topLevelHeadings(body, "## Provenance")).toBe(1);
  });

  it("renders no ticked checkbox", () => {
    expect(tickedBoxes(body)).toBe(0);
  });

  it("keeps the real operator and never the forged one", () => {
    expect(body).toContain("Real Operator");
    expect(topLevelHeadings(body, "- **operator** Trusted Human")).toBe(0);
  });

  it("still shows the caller's text, contained rather than dropped", () => {
    expect(body).toContain("Looks fine to me.");
  });

  it("contains a domain that tries to break out of its line", () => {
    const domainLine = body.split("\n").find((l) => l.startsWith("- **domain**"));
    expect(domainLine).toBeDefined();
    // The whole hostile value stays on the one bullet, inside a code span.
    expect(domainLine).toContain("evil");
    expect(domainLine).toContain("## Provenance");
    expect(topLevelHeadings(body, "## Provenance")).toBe(1);
  });
});

describe("edge PR body", () => {
  const body = edgePrBody(
    { ...edge, sources: [{ label: ATTACK, url: "https://example.org/" }] },
    ATTACK,
    identity,
    false,
  );

  it("stamps exactly one provenance block", () => {
    expect(topLevelHeadings(body, "## Provenance")).toBe(1);
  });

  it("renders no ticked checkbox", () => {
    expect(tickedBoxes(body)).toBe(0);
  });

  it("neutralises a hostile source label", () => {
    const sourceLine = body.split("\n").find((l) => l.startsWith("- [Looks fine"));
    expect(sourceLine).toBeDefined();
    // One line: the label's newlines were flattened, so it cannot open a block.
    expect(sourceLine).toContain("(<https://example.org/>)");
    // Its brackets are escaped, so the ticked boxes it carries stay text.
    expect(sourceLine).toContain("\\[x\\]");
    expect(tickedBoxes(body)).toBe(0);
  });
});

describe("source links", () => {
  it("survives a URL with unbalanced parentheses", () => {
    const url = "https://en.wikipedia.org/wiki/Mechanism_(sociology)";
    const body = claimPrBody(
      { ...claim, sources: [{ label: "Wikipedia", url }] },
      "Rationale.",
      identity,
    );
    expect(body).toContain(`[Wikipedia](<${url}>)`);
  });
});

describe("prediction PR body", () => {
  const body = predictionPrBody("F1", prediction, ATTACK, identity);

  it("stamps exactly one provenance block", () => {
    expect(topLevelHeadings(body, "## Provenance")).toBe(1);
  });

  it("renders no ticked checkbox", () => {
    expect(tickedBoxes(body)).toBe(0);
  });
});

describe("dossier PR body", () => {
  const body = dossierPrBody(
    {
      ...dossier,
      pro: { ...dossier.pro, thesis: ATTACK },
      con: { ...dossier.con, thesis: ATTACK },
    },
    ATTACK,
    identity,
  );

  it("stamps exactly one provenance block", () => {
    expect(topLevelHeadings(body, "## Provenance")).toBe(1);
  });

  it("renders no ticked checkbox", () => {
    expect(tickedBoxes(body)).toBe(0);
  });
});

describe("a benign proposal still reads well", () => {
  const body = claimPrBody(claim, "Filed because the V-Dem series moved.", identity);

  it("carries the server's checklist unticked", () => {
    expect(body).toContain("- [ ] Confidence is calibrated, not decorative.");
    expect(tickedBoxes(body)).toBe(0);
  });

  it("links its sources", () => {
    expect(body).toContain("[V-Dem](<https://v-dem.net/>)");
  });

  it("names the claim id and domain", () => {
    expect(body).toContain("`S9`");
    expect(body).toContain("democratic_backsliding");
  });
});
