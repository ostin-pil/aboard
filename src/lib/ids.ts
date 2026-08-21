/**
 * Minting the next id on a stem.
 *
 * Its own module, and deliberately importing nothing. `proposals.ts` is where
 * this used to live and is still its main caller, but that file pulls in Zod,
 * and the second caller — `src/lib/data/exporter.ts` — runs in the browser,
 * where session 61 spent a chunk removing exactly that dependency from the
 * client bundle (P2: a 287 KB chunk validating a localStorage snapshot). A
 * shared helper that drags Zod back onto the homepage would undo it silently,
 * so the helper lives where neither caller has to choose.
 *
 * The `ClaimKind` import is type-only and therefore erased: it names the
 * canonical enum so `KIND_LETTER` fails to compile if a kind is added without a
 * letter, without pulling the schema module in at runtime.
 */
import type { ClaimKind } from "@/lib/types";

/**
 * Next unused `<stem><n>` id, given every id already in use.
 *
 * Takes the max sequence already used for the stem and adds one, rather than
 * counting: ids are never reused, so a deleted `S3` does not come back and
 * collide with the `S3` some consumer already cached. The stem is anchored, so
 * stem `E` does not swallow `IE7` or `CE1`.
 *
 * Matched by string operations rather than by an interpolated pattern. The
 * previous form built `new RegExp(`^${stem}(\\d+)$`)`, which treats the stem as
 * a pattern and not as text: a stem carrying a regex metacharacter either
 * matches the wrong ids or throws `SyntaxError` from inside id minting. No
 * stem in `data/` today contains one — they are all letters — but the stems are
 * derived from ids, and ids arrive from proposals, so "the input is always
 * tame" is an assumption about a boundary rather than a fact about a constant.
 */
export function nextSequentialId(
  stem: string,
  existingIds: readonly string[],
): string {
  let max = 0;
  for (const id of existingIds) {
    if (!id.startsWith(stem)) continue;
    const seq = id.slice(stem.length);
    if (seq.length === 0 || !/^\d+$/.test(seq)) continue;
    max = Math.max(max, Number(seq));
  }
  return `${stem}${max + 1}`;
}

/**
 * The stem of an id: everything before its trailing digits.
 *
 * `E12` → `E`, `ECE3` → `ECE`, `CE1` → `CE`. Returns null for an id that does
 * not end in digits, which is not an id this convention minted.
 */
export function idStem(id: string): string | null {
  const stem = id.replace(/\d+$/, "");
  return stem === id ? null : stem;
}

// --- claim ids -------------------------------------------------------------

/** The letter each claim kind contributes to an id, per the CLAUDE.md convention. */
export const KIND_LETTER: Record<ClaimKind, string> = {
  symptom: "S",
  mechanism: "M",
  leverage_point: "L",
};

/**
 * Infer a domain's id prefix from the claims it already contains.
 *
 * The convention (CLAUDE.md) is `<domainPrefix><kindLetter><n>`:
 * `S1`/`M1`/`L1` in democratic_backsliding (empty prefix), `IS1`/`IM1`/`IL1` in
 * inequality, `ECS1`/`ECM1`/`ECL1` in epistack_cases. The prefix is not derivable
 * from the domain's *name* (`EC` for epistack_cases is initials; `I` for
 * inequality is not), so it is read off the existing ids instead. That keeps the
 * rule in one place — the data — rather than in a registry that drifts.
 *
 * Returns null when the domain has no claims yet, or when its existing ids do
 * not agree on a prefix. Both are refusals, not guesses: minting an id under a
 * wrong prefix would silently fork a domain's namespace.
 */
export function inferDomainPrefix(existingIdsInDomain: readonly string[]): string | null {
  const letters = Object.values(KIND_LETTER);
  const prefixes = new Set<string>();

  for (const id of existingIdsInDomain) {
    const withoutSeq = id.replace(/\d+$/, "");
    if (withoutSeq === id) return null; // no trailing number: not our convention
    const letter = withoutSeq.slice(-1);
    if (!letters.includes(letter)) return null;
    prefixes.add(withoutSeq.slice(0, -1));
  }

  if (prefixes.size !== 1) return null; // no claims, or a domain with mixed prefixes
  return [...prefixes][0];
}
