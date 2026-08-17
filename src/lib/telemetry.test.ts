import { describe, expect, it } from "vitest";
import {
  mcpCallEvent,
  proposalEvent,
  record,
  twinEvent,
  type AnalyticsDataset,
  type EventPoint,
} from "./telemetry";

describe("proposalEvent", () => {
  it("classes a 2xx as accepted", () => {
    expect(proposalEvent(200, "POST /api/proposals").blobs[0]).toBe("accepted");
    expect(proposalEvent(201, "POST /api/proposals").blobs[0]).toBe("accepted");
  });

  it("classes 401 and 403 as unauthorized", () => {
    expect(proposalEvent(401, "propose_claim").blobs[0]).toBe("unauthorized");
    expect(proposalEvent(403, "propose_claim").blobs[0]).toBe("unauthorized");
  });

  it("classes 429 as rate_limited", () => {
    expect(proposalEvent(429, "propose_claim").blobs[0]).toBe("rate_limited");
  });

  it("classes the caller's other 4xx as rejected", () => {
    expect(proposalEvent(400, "propose_edge").blobs[0]).toBe("rejected");
    expect(proposalEvent(413, "propose_edge").blobs[0]).toBe("rejected");
    expect(proposalEvent(422, "propose_edge").blobs[0]).toBe("rejected");
  });

  it("classes 5xx as failed, including 503 not_configured", () => {
    expect(proposalEvent(500, "propose_dossier").blobs[0]).toBe("failed");
    expect(proposalEvent(503, "propose_dossier").blobs[0]).toBe("failed");
  });

  it("carries the entry point and indexes as proposal", () => {
    const point = proposalEvent(200, "propose_prediction");
    expect(point.indexes).toEqual(["proposal"]);
    expect(point.blobs[1]).toBe("propose_prediction");
  });
});

describe("mcpCallEvent", () => {
  it("carries the tool name and the credential-presence label", () => {
    expect(mcpCallEvent("list_claims", false)).toEqual({
      indexes: ["mcp_call"],
      blobs: ["list_claims", "anonymous"],
    });
    expect(mcpCallEvent("propose_claim", true)).toEqual({
      indexes: ["mcp_call"],
      blobs: ["propose_claim", "credentialed"],
    });
  });
});

describe("twinEvent", () => {
  it("carries the pathname", () => {
    expect(twinEvent("/claims/M4")).toEqual({
      indexes: ["twin"],
      blobs: ["/claims/M4"],
    });
  });
});

describe("record", () => {
  const point: EventPoint = { indexes: ["proposal"], blobs: ["accepted", "x"] };

  it("no-ops on an unbound sink", () => {
    expect(() => record(undefined, point)).not.toThrow();
  });

  it("hands the point to the sink verbatim", () => {
    const written: unknown[] = [];
    const sink: AnalyticsDataset = { writeDataPoint: (event) => written.push(event) };
    record(sink, point);
    expect(written).toEqual([point]);
  });

  it("swallows a throwing sink — telemetry never fails the request", () => {
    const sink: AnalyticsDataset = {
      writeDataPoint: () => {
        throw new Error("dataset unavailable");
      },
    };
    expect(() => record(sink, point)).not.toThrow();
  });
});
