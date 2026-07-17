/**
 * Retry-on-transient for the write path's GitHub reads.
 *
 * A `503` from GitHub's Git-refs API (a real, observed incident) failed a whole
 * proposal at the base-branch read — an idempotent GET that is safe to retry.
 * This is deliberately used ONLY for the safe reads (base ref, file contents);
 * the mutating calls (create branch, commit, open PR) are not retried, because a
 * `5xx` on those is ambiguous and a blind retry could double-create.
 *
 * Pure and timer-free: `sleep` is injected, so the retry policy is unit-testable
 * without real delays. The Worker passes a real `setTimeout`-based sleep.
 */

/** GitHub 5xx and 429 are transient; 4xx (401/404/422) are not — those are answers. */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Exponential backoff: 300ms, 600ms, 1200ms, … */
export function retryDelayMs(attempt: number): number {
  return 300 * 2 ** attempt;
}

/**
 * Run `op`, retrying while its result is transient, up to `retries` extra times.
 * Returns the last result either way (success, a non-transient answer, or the
 * final transient one after exhausting retries — the caller still handles it).
 */
export async function withRetry<T>(
  op: () => Promise<T>,
  opts: {
    retries: number;
    transient: (result: T) => boolean;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<T> {
  let result = await op();
  for (let attempt = 0; attempt < opts.retries && opts.transient(result); attempt++) {
    await opts.sleep(retryDelayMs(attempt));
    result = await op();
  }
  return result;
}
