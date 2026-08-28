/**
 * Usage telemetry for the Worker's three agent-facing surfaces, kept pure so
 * the event shapes are unit-testable and the Worker can run with the dataset
 * binding absent.
 *
 * M1 in `plans/audit-2026-08.md`: nothing measured anything, so "did anyone
 * call the API this week" had no answer. One `writeDataPoint` per event, three
 * events: a proposal (either door), an MCP `tools/call`, and a Markdown-twin
 * negotiation hit. `worker/README.md` documents the row schema and how to
 * query it.
 *
 * Every dimension is bounded and none identifies anyone: outcome classes are a
 * closed set, tool names come from the nine-entry registry, twin pathnames are
 * bounded by the corpus, and the who-dimension is two values. No tokens, no
 * logins, no payload content.
 */

/**
 * The shape mirrors Cloudflare's Analytics Engine dataset binding: a single
 * fire-and-forget `writeDataPoint`. Modelled as an interface (rather than
 * importing the concrete binding type) for the same reason `RateLimiter` is in
 * `rate-limit.ts`: no Cloudflare dependency in the decision logic, and tests
 * exercise the same function with a fake.
 */
export interface AnalyticsDataset {
  writeDataPoint(event: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

/**
 * One event, ready for `writeDataPoint`.
 *
 * Analytics Engine allows a single index per point and uses it as the sampling
 * key, so the event kind goes there: under load each kind samples
 * independently, and a burst of one cannot thin the others' rows.
 */
export type EventPoint = {
  indexes: [string];
  blobs: string[];
};

/**
 * A proposal's outcome, folded to a closed set so the dimension stays
 * countable: `accepted` (a PR was opened), `unauthorized`, `rate_limited`,
 * `rejected` (the caller's envelope was the problem), `failed` (ours or the
 * platform's).
 */
function outcomeClass(status: number): string {
  if (status < 300) return "accepted";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status < 500) return "rejected";
  return "failed";
}

/** A proposal reached a decision. `via` is the door: HTTP or an MCP tool. */
export function proposalEvent(status: number, via: string): EventPoint {
  return { indexes: ["proposal"], blobs: [outcomeClass(status), via] };
}

/**
 * A `tools/call` arrived. `credentialed` is credential *presence*, not
 * validity: the caller decides it from the Authorization header alone, because
 * resolving a credential just to label a row would put a KV lookup on the
 * anonymous read path, which deliberately touches no storage.
 */
export function mcpCallEvent(tool: string, credentialed: boolean): EventPoint {
  return { indexes: ["mcp_call"], blobs: [tool, credentialed ? "credentialed" : "anonymous"] };
}

/**
 * A non-POST request reached `/mcp`. Session 71 measured thirteen of fourteen
 * requests in a four-minute window as `GET` or `HEAD`, every one answered 405,
 * and could not say whether Glama's health checker was among them because
 * `wrangler tail` only sees the window someone is watching. This point is the
 * persistent version of that measurement: Analytics Engine stamps each row with
 * a timestamp, so a checker that publishes when it last tested can be
 * correlated against what actually arrived.
 *
 * Only non-POST requests are counted. A point per POST would put a second row
 * on the hot path to re-count what `mcp_call` already counts, and the open
 * question is entirely about the traffic that never reaches a tool.
 *
 * `accept` is the dimension the `GET` behaviour keys on, so it is recorded
 * rather than inferred: a caller that asks for `text/event-stream` is a client
 * following the spec, and one that does not is a probe.
 */
export function mcpProbeEvent(method: string, userAgent: string | null, accept: string | null): EventPoint {
  return { indexes: ["mcp_probe"], blobs: [method, agentClass(userAgent), acceptClass(accept)] };
}

/**
 * Fold a User-Agent to a closed set.
 *
 * The raw header is the one dimension here that would be unbounded, and this
 * file's contract is that none of them are. The named entries are the checkers
 * and crawlers worth telling apart by name; everything else lands in three
 * buckets. A directory whose probe carries no distinguishing string is
 * therefore invisible to this dimension by construction, which is why the
 * timestamp above is what the correlation actually rests on.
 */
function agentClass(userAgent: string | null): string {
  if (!userAgent) return "none";
  const ua = userAgent.toLowerCase();
  if (ua.includes("glama")) return "glama";
  if (ua.includes("googleother")) return "google-other";
  if (ua.includes("googlebot")) return "googlebot";
  if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider")) return "crawler";
  if (ua.startsWith("mozilla/")) return "browser-ua";
  return "other";
}

/** Whether the caller asked for an SSE stream, which is what a spec-following
 *  MCP client does and what a liveness probe does not. */
function acceptClass(accept: string | null): string {
  if (!accept) return "none";
  return accept.toLowerCase().includes("text/event-stream") ? "event-stream" : "other";
}

/** A page was served as its Markdown twin — an agent-shaped read of the site. */
export function twinEvent(pathname: string): EventPoint {
  return { indexes: ["twin"], blobs: [pathname] };
}

/**
 * Write one point, or don't.
 *
 * Fails OPEN, like `withinRateLimit`: an unbound dataset (a deploy without the
 * binding) or a throwing one is a no-op, never an error the request sees.
 * Telemetry must not be able to take down the request it observes.
 */
export function record(sink: AnalyticsDataset | undefined, point: EventPoint): void {
  if (!sink) return;
  try {
    sink.writeDataPoint(point);
  } catch {
    // Nothing: the row is lost, the response is not.
  }
}
