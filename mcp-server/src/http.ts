/**
 * Thin JSON-LD fetch helper. Mirrors the consume-the-HTTP-endpoint pattern
 * used by `clients/validate.ts` and `clients/briefing.ts`: no local `data/`
 * access, no shared code with the Next.js app — just the published API.
 *
 * Base URL is configurable via the `ABOARD_API_BASE_URL` env var and
 * defaults to `http://localhost:3000`, matching the `clients/` default.
 */

const DEFAULT_BASE_URL = "http://localhost:3000";

export function baseUrl(): string {
  const raw = process.env.ABOARD_API_BASE_URL?.trim();
  if (!raw) return DEFAULT_BASE_URL;
  // Strip a trailing slash so `${base}${path}` never doubles up.
  return raw.replace(/\/+$/, "");
}

/** Raised when the API is unreachable or returns a non-2xx status. */
export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * GET `{base}{path}` and parse the JSON-LD body. `path` must start with `/`,
 * e.g. `/api/graph` or `/api/claims/M4`.
 */
export async function fetchLD<T>(path: string): Promise<T> {
  const url = `${baseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/ld+json" } });
  } catch (err) {
    throw new ApiError(
      `Could not reach aboard API at ${url} — ${(err as Error).message}. ` +
        `Is the dev server running? Set ABOARD_API_BASE_URL to point elsewhere.`
    );
  }
  if (res.status === 404) {
    throw new ApiError(`Not found: ${url} (HTTP 404)`, 404);
  }
  if (!res.ok) {
    throw new ApiError(`Fetch failed — HTTP ${res.status} from ${url}`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new ApiError(
      `Response from ${url} was not valid JSON — ${(err as Error).message}`
    );
  }
}
