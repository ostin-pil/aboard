import { describe, expect, it, vi } from "vitest";
import { withinRateLimit, type RateLimiter } from "./rate-limit";

const limiterReturning = (success: boolean): RateLimiter => ({
  limit: vi.fn(async () => ({ success })),
});

describe("withinRateLimit", () => {
  it("allows when the limiter is unbound (fail-open)", async () => {
    expect(await withinRateLimit(undefined, "proposal:tok")).toBe(true);
  });

  it("allows when the limiter reports success", async () => {
    expect(await withinRateLimit(limiterReturning(true), "proposal:tok")).toBe(true);
  });

  it("blocks when the limiter reports failure", async () => {
    expect(await withinRateLimit(limiterReturning(false), "proposal:tok")).toBe(false);
  });

  it("allows when the limiter throws (fail-open)", async () => {
    const throwing: RateLimiter = {
      limit: vi.fn(async () => {
        throw new Error("binding unavailable");
      }),
    };
    expect(await withinRateLimit(throwing, "proposal:tok")).toBe(true);
  });

  it("passes the key straight through to the binding", async () => {
    const limiter = limiterReturning(true);
    await withinRateLimit(limiter, "proposal:agent-7");
    expect(limiter.limit).toHaveBeenCalledWith({ key: "proposal:agent-7" });
  });
});
