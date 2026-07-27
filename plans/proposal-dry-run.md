# Plan: dry-run mode for proposals

Drive down time-to-first-successful-proposal, the agent-UX north star named
in `organic-traffic-dual-ux.md` §7. Today an anonymous agent's first
feedback from the write path is a 401: it must obtain a credential before
learning whether its payload would even validate. This plan reverses that
order. Validation becomes free and anonymous; authentication is asked for
at the moment the agent has something real to submit.

## The shape

One flag, one code path, both doors:

- The proposal envelope gains an optional `dryRun: boolean`. It is honoured
  by `POST /api/proposals` and by all four MCP `propose_*` tools, whose
  derived schemas pick it up automatically once it lives on the canonical
  Zod payloads (`src/lib/proposals.ts`), the same no-drift property the
  tool schemas already rely on.
- A dry run executes the same validation the real path executes, then
  renders what would happen and stops: the would-be PR title, branch name,
  file path, and file content. Nothing is persisted, no PR opens, no
  provenance is stamped.
- No credential is required for a dry run. The response carries
  `dryRun: true` and a `next` hint that names the real call and how to
  authenticate (the `WWW-Authenticate` discovery hints, once the OAuth
  slice lands, make that hint self-serving).
- Validation failures return the same structured field paths the real path
  returns, so an agent can iterate to a valid payload without ever holding
  a token.

## Why this is safe to expose

- The validation layer is pure (`src/lib/proposals.ts` Zod payloads): no
  repository access, no KV writes, no GitHub calls on the dry path.
- Cost is bounded by rate limiting keyed on IP for anonymous dry runs,
  using the Worker's native rate limiting, at a stricter ceiling than the
  authenticated write limit. The existing ordering is preserved: the real
  path still refuses unauthenticated callers before reading the body.
- Nothing a dry run returns is secret; it is a rendering of the caller's
  own input against a published schema.

## Build order

1. `dryRun` on the envelope schema, plus the pure decision: given a valid
   payload and `dryRun`, produce the render-only outcome. Unit-tested in
   `src/lib/`, no IO.
2. `worker/index.ts`: route the dry path before the auth gate, with the
   IP-keyed limiter. The authenticated path is untouched.
3. MCP: the derived tool schemas already advertise the new field; the tool
   handler forwards it. One end-to-end test per door.
4. Documentation: `worker/README.md` contract, the agents surface, and the
   `/about` write-path section gain the dry-run example as the recommended
   first call.

## Verification

1. Dry run without a token returns 200 with the rendered PR preview; the
   same payload without `dryRun` still returns 401 with an unchanged
   challenge.
2. An invalid payload in dry-run mode returns the structured field paths;
   fixing them and re-running succeeds.
3. `tools/list` shows `dryRun` on all four `propose_*` schemas.
4. The anonymous limiter trips at its ceiling and the authenticated limit
   is unaffected.

## Out of scope

- Sandbox PRs or draft PRs on the real repository.
- Any auto-merge tier; the PR-only, human-gated posture is unchanged.
- Changing what the authenticated path validates or returns.
