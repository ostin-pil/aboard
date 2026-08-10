/**
 * Turning a failed proposal submission into an error the caller can act on.
 *
 * The Worker mints ids and checks for existing dossiers against the *deployed*
 * `/api/graph` asset, which lags `main` by one Cloudflare Workers Builds cycle.
 * Inside that window the graph says an id is free when the file already exists
 * on the base branch, so the create lands as a `PUT /contents` with no `sha`
 * and GitHub answers 422.
 *
 * Until session 51 every step of the submit sequence collapsed into
 * `502 github_failed` with the status buried in a prose string:
 *
 *   "Could not open the proposal PR: could not commit data/x/claims/S5.md (HTTP 422)"
 *
 * Three things wrong with that, and only the third is cosmetic. 502 asserts
 * GitHub misbehaved when the request was in fact refused correctly. The caller
 * has no field to branch on, so an agent cannot tell a retryable staleness
 * collision from a genuine outage. And the one action that resolves it, re-read
 * and retry, is nowhere in the response.
 *
 * This module is pure so it can be tested: `worker/index.ts` exports only its
 * default handler, which is the same reason session 47 moved the PR-body
 * builders to `src/lib/pr-body.ts`.
 */

/** Which call in the submit sequence failed. */
export type SubmitStep = "base-ref" | "branch" | "commit" | "pull-request";

/**
 * Whether a commit meant to create a file or update one.
 *
 * This is the field that makes 422 legible. `PUT /contents` creates when `sha`
 * is absent and updates when it is present, and GitHub returns 422 for both a
 * create over an existing file and a stale `sha` on an update. Without knowing
 * which was intended, the status alone cannot distinguish "the id is taken"
 * from "someone else wrote this file since I read it".
 */
export type CommitIntent = "create" | "update";

export type SubmitFailure = {
  step: SubmitStep;
  status: number;
  /** Human-readable trail, preserved verbatim in the response's `detail`. */
  detail: string;
  intent?: CommitIntent;
  path?: string;
};

export type ProposalError = {
  status: number;
  code: string;
  message: string;
  extra: Record<string, unknown>;
};

/**
 * Which proposal kinds can collide this way.
 *
 * Only the two that create a file. An edge appends to `edges.yaml` and a
 * prediction appends to a forecast, and both read that file live from GitHub at
 * the base ref and commit with its `sha`, so neither reaches the create path. A
 * stale *edge* id is a real defect too, but it surfaces as a duplicate id
 * inside the YAML that CI's integrity check rejects on the PR, not as a 422
 * here. Different failure, different fix, deliberately out of scope.
 */
export type CollidableKind = "claim" | "dossier";

const REMEDIATION: Record<CollidableKind, string> = {
  claim:
    "Re-read /api/graph and file again: the next free id will account for it. " +
    "If the graph still shows this id as free, the deploy has not caught up yet; " +
    "wait a minute and retry.",
  dossier:
    "A dossier already exists for this claim on the base branch. Re-read " +
    "/api/graph to confirm; if it does not show one yet, the deploy has not " +
    "caught up. Filing a second dossier for the same claim is refused by design.",
};

/**
 * Map a submit failure to the response the caller gets.
 *
 * Everything that is not the collision keeps the previous `502 github_failed`
 * shape. Widening this classifier is a per-case decision with evidence behind
 * it, not a default: an error code the caller cannot act on differently is a
 * string with extra steps.
 */
export function classifySubmitFailure(
  failure: SubmitFailure,
  context: { kind: CollidableKind; id: string },
): ProposalError {
  const isCollision =
    failure.step === "commit" && failure.status === 422 && failure.intent === "create";

  if (isCollision) {
    return {
      // 409, not 422. The payload was valid and the id was free when it was
      // minted; what changed is the state of the target, which is precisely
      // what 409 Conflict describes. A 422 here would tell the agent to fix
      // its input, and there is nothing in its input to fix.
      status: 409,
      code: "id_collision",
      message:
        `${failure.path ?? "The file"} already exists on the base branch, so ${context.id} ` +
        `is already taken. The published graph had not caught up when this id was chosen.`,
      extra: {
        kind: context.kind,
        id: context.id,
        path: failure.path,
        retryable: true,
        remediation: REMEDIATION[context.kind],
      },
    };
  }

  return {
    status: 502,
    code: "github_failed",
    message: `Could not open the proposal PR: ${failure.detail}`,
    extra: {},
  };
}
