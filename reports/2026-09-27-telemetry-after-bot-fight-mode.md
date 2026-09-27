# Telemetry after Bot Fight Mode, 2026-09-27

Bot Fight Mode was turned off on 2026-09-17 at about 17:05 UTC, ten days ago. Every telemetry number this project has published was measured before that, against an endpoint that was challenging datacenter callers at the edge. Session 80 closed by naming the gap: "read counts were measured against an endpoint that was turning callers away, so the launch-post baseline in session 77's audit describes a throttled world."

This document is the re-measurement. It records the full daily series rather than only the windows it compares, because retention is three months and the early days start expiring around 2026-11-17. Everything here was queried from the Analytics Engine SQL API against `aboard_events` on 2026-09-27, `SUM(_sample_interval)` throughout. The queries are in the method section at the end, with their window bounds inline.

## Read this before the numbers

**The pre-fix rows are a survivorship sample, not demand.** A caller challenged at the edge got a 403 before the Worker ran, so `writeDataPoint` never fired and no row exists. The dataset has no column for what was refused. Every "before" figure below counts callers that got past the challenge, and the fix changed who is measurable at the same moment it changed who is served. The only measurement of the refused population is the zone's security events from 2026-09-17, which is a single day: 80 `botFight` challenges in 24 hours, 70 of them on `/mcp`. Against roughly 1,190 observed probe arrivals a day that is about 6% of arrivals, which is a rough bound on the probe undercount and not a bound on the read undercount, since the callers being challenged were the datacenter MCP clients most likely to call a tool.

**Sampling has started, which is new.** `_sample_interval` now reaches 10 on `mcp_probe` and 2 on `mcp_call`. `worker/README.md` says "at this Worker's volumes it will read 1 for a long time", and that has stopped being true. Every number in this document sums the interval and is therefore an estimate rather than a count, tightest where volume is lowest: `mcp_call` stores 459 rows standing for 467 events, `mcp_probe` stores 35,688 standing for 36,638. The historical numbers in earlier documents were computed the same way and stay valid.

**One fix is not the only thing that changed.** Session 80's listing work landed in the same week, the package is on npm, and this project has already watched a single crawler move reads twentyfold on its own. Where a step coincides with the fix this document says so and stops there.

## Windows

| Segment | Bounds, UTC | Why |
| --- | --- | --- |
| Crawler | 2026-08-29 to 2026-09-05 | One reader walking tools evenly. Reported separately, never averaged in |
| Pre-fix | 2026-09-08 to 2026-09-16 | Nine complete days, after that crawler left, before the fix |
| Straddle | 2026-09-17 | Excluded. The fix landed mid-day at about 17:05 UTC |
| Post-fix | 2026-09-18 to 2026-09-26 | Nine complete days, equal length, same weekday composition |

2026-08-28 is half-instrumented (the probe counter went live at 12:53) and 2026-09-27 is today, partial. Both are excluded from every total.

## 1. What the fix changed

**Probe arrivals rose about 20%, and the step is visible at the fix hour.** 10,733 arrivals in the pre-fix window against 12,840 in the post-fix window: 1,193 a day against 1,427, or 50 an hour against 59. The hourly series is noisy enough that the step is not obvious from the daily totals alone, and the post-fix range overlaps the pre-fix range.

**The unambiguous signal is in the `GET` requests.** They ran at 23 to 41 a day for the whole pre-fix window, then stepped to 97 to 116 a day beginning 2026-09-18 and stayed there.

| Day | `GET` probes | Day | `GET` probes |
| --- | --- | --- | --- |
| 09-12 | 24 | 09-19 | 112 |
| 09-13 | 29 | 09-20 | 104 |
| 09-14 | 24 | 09-21 | 106 |
| 09-15 | 23 | 09-22 | 107 |
| 09-16 | 23 | 09-23 | 97 |
| 09-17 (straddle) | 50 | 09-24 | 99 |
| 09-18 | 106 | 09-25 | 103 |

A four-fold step on the first full day after the fix, in the method most likely to be a health checker, is the cleanest evidence in this dataset that the challenge was the thing in the way.

**Reads went down, not up.** 97 reads in the pre-fix window against 43 after, a daily mean of 10.8 against 4.8. Nothing here supports a story where removing the block brought readers. The honest reading is that reads are dominated by whichever automated reader is active that week, which is the lesson session 77 already drew, and nine days a side cannot separate that from an edge effect.

## 2. Reads

All 464 reads recorded to date are `anonymous`. The `credentialed` value has never appeared.

**Daily reads, 2026-08-18 to 2026-09-26.** No day in that span has zero reads.

| Window | Reads | Days | Min | Max | Mean |
| --- | --- | --- | --- | --- | --- |
| 2026-08-18 to 2026-09-11 (the launch post's) | 350 | 25 | 1 | 47 | 14.0 |
| 2026-09-08 to 2026-09-16 (pre-fix) | 97 | 9 | 2 | 22 | 10.8 |
| 2026-09-18 to 2026-09-26 (post-fix) | 43 | 9 | 1 | 16 | 4.8 |
| 2026-08-18 to 2026-09-26 (to date) | 464 | 40 | 1 | 47 | 11.6 |

The launch post's window reproduces exactly: 350 reads, min 1, max 47, mean 14. That sentence was right when it was written, and it is right now about the window it names.

**By tool, over the whole period.** All five read tools have been called; `get_forecast` has not been called since 2026-09-04.

| Tool | Calls | Last seen |
| --- | --- | --- |
| `list_claims` | 176 | 2026-09-26 |
| `get_graph` | 107 | 2026-09-26 |
| `get_claim` | 77 | 2026-09-21 |
| `get_dossier` | 57 | 2026-09-21 |
| `get_forecast` | 47 | 2026-09-04 |

The tool mix is what identifies the caller. In the pre-fix window only two tools were touched (`get_graph` 49, `list_claims` 48), which is not the even five-way walk session 77 described. The post-fix window has four tools and no `get_forecast`. Neither window looks like the 2026-08-29 crawler, and neither looks like a person.

## 3. Probes

| Dimension | Pre-fix | Post-fix |
| --- | --- | --- |
| Total | 10,733 | 12,840 |
| Per day | 1,193 | 1,427 |
| `POST`, agent `other`, accept `event-stream` | 6,362 | 6,947 |
| `POST`, agent `crawler`, accept `event-stream` | 3,392 | 3,386 |
| `POST`, agent `other`, accept `other` | 520 | 1,320 |
| `GET`, agent `other`, accept `event-stream` | absent | 657 |
| `GET` and `HEAD` combined | 249 (2.32%) | 965 (7.52%) |

The recognised-crawler share is flat to within six arrivals, which is what a fix aimed at datacenter clients should look like: it did not change who Google sends.

**The agent class `glama` has never appeared in a single row.** Not before the fix, not after. Glama's checker either sends no user agent carrying its name, in which case it is inside `other` or `none` and invisible to this dimension, or it is not calling. The classifier only matches a user agent containing "glama" (`src/lib/telemetry.ts`), so an absence here is not evidence that the connector is unchecked. It does mean this dataset cannot answer the connector question, and the browser is still the only place to read it.

## 4. Writes and Markdown twins

Four `proposal` rows exist in total, all `unauthorized`, all through `POST /api/proposals`, the last on 2026-08-28. Separately, `mcp_call` records three `propose_claim` calls, the last on 2026-09-11; those produced no `proposal` row because `mcp_call` is recorded before authorization and an unauthorized MCP write never reaches the proposal handler. The launch post says "two to date", which was true when written.

Markdown twins: 96 served, `/` 58 and `/about` 13, the rest spread across claim pages. The 2026-09-13 spike of 25 is one caller walking claim pages.

## 5. The claims ledger

| Claim | Where | Verdict |
| --- | --- | --- |
| "350 read calls across all five read tools over the twenty-five days to 2026-09-11", min 1, max 47, mean 14 | `research/launch-post-2026-08.md`, body and operator notes, on branch `feature/session-78-launch-post` | **Confirmed** for its window, and extendable. To 2026-09-26 it is 464 reads over forty days, still with no gap, min 1, max 47, mean 11.6 |
| "115 read calls … on every one of the twelve days" | same file on `origin/main` | Still true, and now three windows stale |
| "roughly 1,150 probe arrivals a day, one every 75 seconds" | `reports/2026-09-07-state-audit.md` | **Corrected.** 1,193 a day pre-fix, 1,427 a day post-fix, one every 61 seconds |
| "the reachability cost of the 405 is under 2% of automated traffic" | same | **Corrected.** 2.32% pre-fix and 7.52% post-fix. The `GET` step is what moved it |
| "around 1,400 data points a day against a free allowance of 100,000" | same | **Confirmed.** About 1,450 a day now, still under 2% of the allowance |
| Weekly table and daily reads 08-29 to 09-07 | same | **Annotate in place.** Every row was measured under the challenge. This document supersedes it rather than rewriting a dated audit |
| "at this Worker's volumes [`_sample_interval`] will read 1 for a long time" | `worker/README.md` | **Retired.** It reaches 10 on probe rows today |
| "an empty answer from the query above means no traffic, provided the deploy carried the binding" | `worker/README.md` | **Incomplete.** An empty answer can also mean the edge refused the callers before the Worker ran. This is the most reusable lesson of the episode |
| "refusing its own audience roughly seventy times a day" | `knowledge/issues.md`, 2026-09-11 | **Order of magnitude supported, not confirmed.** A one-day zone sample. The observed rise of 234 arrivals a day is larger than 70, so either the sample understates the block or something else also changed |
| Priority 3, identify the 1,150-a-day probe client | `plans/README.md` | **Answered as far as the data can.** It is a `POST` with `accept: text/event-stream` and a user agent the classifier files under `other`, running at a fixed cadence, 6,947 arrivals in nine days. A closed-set classifier cannot name it; identifying it further needs a raw user agent the counter deliberately does not keep |
| Priority 5, post-launch measurement | `plans/README.md` | **This document**, with the caveat that there has been no launch to measure against |

## 6. A replacement sentence, offered rather than applied

The launch post lives on session 78's unmerged branch and stays that session's to edit. If it wants the window extended, the shape it already settled on holds:

> The counters went up on 2026-08-17. The first uninvited read arrived the next day. Every day since has carried at least one: 464 read calls across all five read tools over the forty days to 2026-09-26, with no gap. The daily rate swings hard, between a single call and forty-seven, depending on whether some automated reader is working through the tool list that week. The floor has never been zero.

One caveat to weigh before using it. The 2026-09-18 to 2026-09-26 stretch averages under five reads a day, so a forty-day mean of 11.6 describes a busier period than the present one. The window, the range and the floor stay true; the implied rate does not.

## 7. Method

Queried on 2026-09-27 between 11:44 and 12:10 UTC against `aboard_events` through `https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql`, the token from the keychain and never printed, per `worker/README.md` under "Querying it". All days are UTC days. Row schema from `src/lib/telemetry.ts`: for `mcp_probe`, `blob1` is the method, `blob2` the agent class, `blob3` the accept class.

Provenance check, run first because an empty result and a bad window look identical (session 63):

```sql
SELECT NOW() AS server_now, MIN(timestamp) AS first_row, MAX(timestamp) AS last_row,
       MAX(_sample_interval) AS max_sample_interval, COUNT() AS rows_stored,
       SUM(_sample_interval) AS points_all
FROM aboard_events
```

It returned server time 2026-09-27 11:44:34, first row 2026-08-17 18:00:44, last row 2026-09-27 11:42:01, max sample interval 10, 36,242 rows standing for 37,203 events. The first row is the day the counters went up rather than the retention edge, so nothing has expired yet.

The daily spine, which every table in sections 1 to 4 is cut from:

```sql
SELECT toDate(timestamp) AS day, index1 AS kind, COUNT() AS rows_stored,
       SUM(_sample_interval) AS events
FROM aboard_events GROUP BY day, kind ORDER BY day, kind
```

Reads, filtered to the five read tools by name so that `propose_*` cannot leak in:

```sql
SELECT toDate(timestamp) AS day, blob2 AS who, SUM(_sample_interval) AS reads
FROM aboard_events WHERE index1 = 'mcp_call'
  AND blob1 IN ('list_claims','get_claim','get_graph','get_forecast','get_dossier')
GROUP BY day, who ORDER BY day
```

Probes by shape, both windows in one answer:

```sql
SELECT if(timestamp < toDateTime('2026-09-17 00:00:00'), 'pre', 'post') AS period,
       blob1 AS method, blob2 AS agent_class, blob3 AS accept_class,
       SUM(_sample_interval) AS probes
FROM aboard_events WHERE index1 = 'mcp_probe'
  AND ((timestamp >= toDateTime('2026-09-08 00:00:00') AND timestamp < toDateTime('2026-09-17 00:00:00'))
    OR (timestamp >= toDateTime('2026-09-18 00:00:00') AND timestamp < toDateTime('2026-09-27 00:00:00')))
GROUP BY period, method, agent_class, accept_class ORDER BY period, probes DESC
```

The same `period` expression, with `blob1` alone, gives the reads-by-tool split; substituting `toStartOfHour(timestamp)` and a 2026-09-16 to 2026-09-19 range gives the hourly series behind section 1.

## 8. What this does not establish

That the fix caused the rise. The `GET` step lands on the first full day after it and the crawler share stayed flat, which is the shape the Bot Fight story predicts, but nine days a side cannot separate a step from a trend, arrivals here are dominated by single actors, and session 80's listing work is a co-intervention inside the same window.

That the post-fix rate is the new normal. Nine days, and a baseline is a window rather than a number.

That probe volume is readership. Probes reach no tool by definition. Reads are the interesting number and reads are small.

That the Glama connector is or is not being checked. This dataset cannot see it.
