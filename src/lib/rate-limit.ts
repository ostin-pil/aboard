/**
 * Rate-limit decision for the agent write path, kept pure so it is unit-testable
 * and so the Worker can run with the limiter binding absent.
 *
 * The shape mirrors Cloudflare's native Workers Rate Limiting binding: a single
 * `limit({ key })` that resolves to `{ success }`, where `success === false`
 * means the key has exceeded its budget for the current window. Modelling it as
 * an interface (rather than importing the concrete binding type) means the
 * decision logic here has no Cloudflare dependency and the same function is
 * exercised in tests with a fake.
 */
export interface RateLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Whether a keyed request may proceed.
 *
 * Fails OPEN: when the limiter is unbound (a deploy without the binding) or the
 * call throws, the request is allowed. The limiter is a flood brake in front of
 * a human-gated PR queue, not the admission gate itself — a limiter hiccup must
 * never reject a legitimate proposal. This also matches Cloudflare's own
 * contract for the binding, which is documented as permissive and eventually
 * consistent rather than an exact accounting system.
 */
export async function withinRateLimit(
  limiter: RateLimiter | undefined,
  key: string,
): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch {
    return true;
  }
}
