import { describe, it, expect } from "vitest";
import { isTransientStatus, retryDelayMs, withRetry } from "@/lib/http-retry";

describe("isTransientStatus", () => {
  it("treats 5xx and 429 as transient", () => {
    expect(isTransientStatus(500)).toBe(true);
    expect(isTransientStatus(503)).toBe(true);
    expect(isTransientStatus(429)).toBe(true);
  });

  it("treats 2xx and non-429 4xx as final answers, not transient", () => {
    for (const s of [200, 201, 401, 404, 422]) {
      expect(isTransientStatus(s)).toBe(false);
    }
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially", () => {
    expect([0, 1, 2].map(retryDelayMs)).toEqual([300, 600, 1200]);
  });
});

describe("withRetry", () => {
  // A fake sleep records the delays instead of waiting, so the test is instant
  // and also asserts the backoff schedule.
  const fakeSleep = (log: number[]) => (ms: number) => {
    log.push(ms);
    return Promise.resolve();
  };
  const transient = (r: { status: number }) => isTransientStatus(r.status);

  it("returns immediately on a non-transient result, no sleeps", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => ({ status: 200, n: ++calls }),
      { retries: 3, transient, sleep: fakeSleep(delays) },
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it("retries while transient, then returns the first good result", async () => {
    const delays: number[] = [];
    const statuses = [503, 503, 200];
    let i = 0;
    const result = await withRetry(
      async () => ({ status: statuses[i++] }),
      { retries: 3, transient, sleep: fakeSleep(delays) },
    );
    expect(result.status).toBe(200);
    expect(i).toBe(3); // two failures + one success
    expect(delays).toEqual([300, 600]); // backoff between the retries
  });

  it("gives up after `retries` and returns the last transient result", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => ({ status: 503, n: ++calls }),
      { retries: 2, transient, sleep: fakeSleep(delays) },
    );
    expect(result.status).toBe(503);
    expect(calls).toBe(3); // initial + 2 retries
    expect(delays).toEqual([300, 600]);
  });
});
