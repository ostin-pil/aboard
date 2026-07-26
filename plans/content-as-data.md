# Plan: editorial prose as content data

aboard's thesis is that content is data, published machine-readable by
default. `data/` honours that for claims, forecasts, dossiers and edges.
Editorial prose does not: the site's own copy is typed into `.tsx` files, and
the same paragraph now exists five times with five slightly different
wordings. This plan moves editorial prose to a loaded, validated content
source, the way every other kind of content in this repo already works.

Measured 2026-07-25 against `main` at `dc25dcc` plus session 28. Effort is
split into three slices below because they are genuinely independent; only
slice B needs a new dependency.

## The problem, in three separable parts

Conflating these is what would turn a tidy change into a sprawling refactor.

### 1. One positioning paragraph, five copies

"aboard is a research-stage registry where AI agents file falsifiable claims
about systemic problems..." currently lives in:

- `src/app/layout.tsx` (the metadata description)
- `src/app/page.tsx` (the hero lede)
- `src/app/about/page.tsx`
- `src/app/llms.txt/route.ts` (the `INTRO` constant)
- `src/app/index.md/route.ts` (added in session 28, reworded and reflowed, so
  it no longer matches the other four even as a substring)

The fifth copy is the tell. It was written by an agent that had read the other
four and still produced a divergent fifth, because nothing in the codebase
says which one is canonical. This is the same failure as the stale "20 seed
claims" copy that session 26 fixed by deriving counts from the graph. Counts
got fixed; prose did not.

### 2. Prose embedded in TSX

`src/app/about/page.tsx` is 479 lines with 102 inline `style={}` objects. It
breaks two conventions this project already holds:

- CLAUDE.md's "keep each `.tsx` page file under ~250 lines".
- The class-based design system in `src/app/globals.css` (446 class
  definitions). `src/app/claims/[id]/page.tsx` uses `className="statement"`
  and carries 2 inline styles, so the rest of the codebase already does this
  correctly. `about/page.tsx` is the outlier, not the pattern.

Note that the inline styles and the prose are two different problems that
happen to live in one file. Slice C handles the styles and needs nothing from
slices A or B.

### 3. `/about` has no Markdown twin

Session 28 shipped `Accept: text/markdown` negotiation for `/`,
`/claims/{id}` and `/dossiers/{id}`. `/about` was deliberately excluded: its
content is hand-written prose in TSX, so a Markdown twin would be a hand copy
of it, which is exactly the drift in part 1 with an extra surface. Once the
prose is content, the twin is generated and the exclusion goes away.

## What this plan is not

Do not convert the data-driven pages to Markdown or templates. Claim,
dossier and graph pages render from `data/` through Zod-validated types. That
is the architecture working, and turning typed data into templates would lose
type-checking, referential-integrity tests, and the JSON-LD serialization
that all derive from those types. React over typed data stays.

The target is editorial prose only: the about page, the homepage hero copy,
and the positioning paragraph. Roughly 500 lines of English, not the graph.

## Proposed design

### Slice A. One source for the positioning paragraph (superseded)

Slice A proposed a `src/lib/copy.ts` of typed constants as the cheap version
of this plan. It was built and then replaced in the same session (`4a79e3d`,
then `dbd69ce`), on review: constants in TypeScript are this same problem one
indirection removed. The prose still lived in code, and the guard test that
confined each fragment to the module meant a copy edit was also a test edit.
The content tree makes the single-source property structural rather than
asserted, so there is nothing left for a fragment-confinement test to do.

Worth keeping from the attempt, because both rules survived into slice B:
prose carries no markup that a call site could instead wrap around it, and
copy that differs by audience (`description` for a search engine, `summary`
for a human, `agentIntro` for an agent) stays adjacent rather than being
flattened into one string.

### Slice B. A `content/` tree, loaded and validated (landed, session 29)

`content/site.md`, `content/home.md` and `content/about.md`, with
`src/lib/content/` reading them (`dbd69ce`). Frontmatter is the metadata and
the body is the prose, mirroring `data/<domain>/claims/<id>.md`.

The module splits the way the Worker does, pure core plus thin IO shell:
`schema.ts`, `parse.ts` and `render.ts` are unit-testable under the
node-environment vitest config, and only `loader.ts` imports `server-only`.
`content.test.ts` checks the shipped documents against their schemas, so a
malformed document fails `npm test` rather than only `next build`. None of
the tests assert prose.

Three problems the shape had to solve, none of them visible when the plan was
written:

- **Derived counts.** The about page interpolates claim, forecast and domain
  counts, which session 26 deliberately made derived. `{{placeholder}}` tokens
  keep that: `interpolate` throws on an unknown token rather than shipping
  `{{clamCount}}` to a reader, and `vars.ts` supplies the values to the page
  and the twin alike so the two cannot disagree.
- **Blocks Markdown cannot express.** The module cards and the two reading
  cards are laid out, not prose, so they stay frontmatter data positioned by
  `<!-- slot: name -->` markers in the body. The spread table is ordinary
  tabular content and is a GFM table in the body; only a genuine card layout
  earns a slot. An unknown slot throws.
- **Where the sections come from.** The page renders whatever the document's
  `##` headings are, keyed by slug, so adding, renaming or reordering a
  section is a content edit and never a code edit. Section slugs become the
  anchor ids, which is what preserved the existing `/about#contributing` link.

`/about` gains the Markdown twin session 28 excluded, since serving the body
is no longer a hand copy of it. The twin renders slot markers as prose rather
than components, so a Markdown reader gets the card content inline.

One consequence worth naming: a single source feeding both the hero and the
homepage twin means copy that differed between them has to reconcile. The
hero now says "leverage points" (the claim kind's name in `data/`) and uses a
colon before the dossier clause, and the twin no longer restates its own
summary, which it did the moment both were served from one body.

### Slice C. Inline styles to classes (landed for the about page, session 29)

Slice C was independent by design, but rewriting `about/page.tsx` to render
Markdown made it unavoidable: ~100 inline `style={}` objects cannot follow
prose through a renderer. The page is now 137 lines with zero inline styles,
against 479 lines with 102 of them, so it is under the 250-line rule and the
audit's "split `about/page.tsx`" item (`code-quality-audit.md` section D) is
satisfied by removing content rather than by cutting the file into three.

The new rules live in `globals.css` under an `ABOUT:` banner, scoped inside
`.about-page` so they cannot leak into the data-driven claim and dossier
pages. Nothing else in the codebase changed style, so this closes slice C for
the about page only; no other file was in its scope.

## Decisions, as made

1. **Renderer dependency: `marked`.** One dependency, no transitive ones,
   zero config, and GFM tables come with it, which is what let the spread
   table stay ordinary Markdown. `remark`/`rehype` buys a plugin ecosystem and
   a sanitizer this does not need; a hand-rolled subset renderer would have
   meant owning the escaping bugs in a project whose thesis is correctness.
2. **Sanitization posture: none, deliberately.** Every document is authored
   in-repo, reviewed in a pull request, and rendered at build time under
   `output: "export"`. No request input and no agent proposal reaches it; the
   write path produces `data/` PRs, never site copy. Recorded in `render.ts`
   rather than only here, with the condition that reverses it: if editorial
   content ever becomes agent-writable, the sanitizer lands in the same commit
   that opens the path.
3. **`content/`, not `data/`.** As recommended. `data/` is the claim graph and
   its loader walks domains; a sibling tree keeps that invariant clean.
4. **Scope of the move: the hero moved.** It is one paragraph, but splitting
   it between `site.md`'s `summary` and `home.md`'s body is what lets the
   homepage twin quote the first and carry the second without restating it.

## Sequencing and effort

All three slices landed in session 29, which was not the plan and is worth
recording as an estimate error rather than a success. A was built and
superseded within the session; C came along with B because inline styles
cannot follow prose through a renderer. The reason B did not take its
estimated 3 to 4 hours on its own is that the two are the same edit.

Remaining work is in "Follow-ups" below, not in a fourth slice.

## Relationship to existing plans

- `code-quality-audit.md` section B quantified hardcode and duplication but
  counted code literals: enums, design-token hex, origin strings, magic
  numbers. Editorial prose duplication is a B-class finding that pass missed,
  and this plan is where it lives.
- `code-quality-audit.md` section D proposes splitting `about/page.tsx` by
  section. Slice B achieves the same end by moving the content out, which is
  the better version of that item; slice C achieves the line-count part
  independently. Neither contradicts the audit.
- `agent-surface.md` and slice 1 of `proposed-direction-2026-07.md` shipped
  the Markdown twins and the negotiation this builds on. The `/about` twin is
  the one gap they left, and slice B closes it.

## Verification, as run

- `npx tsc --noEmit`, `npm run build`, `npm test` green (172 tests over 11
  files, up from 133 over 8); lint at the documented 14-warning baseline;
  `check:built-urls` clean over 335 files.
- Diffed against a build of `origin/main` rather than eyeballed. The about
  page's visible text is identical character for character, as is every claim
  and dossier page and Markdown twin; the OG card is byte-identical. The three
  intended copy changes are listed under slice B.
- `/about` with `Accept: text/markdown` returns `text/markdown` against
  `wrangler dev`, with `*/*`, a real Chrome header and `text/markdown;q=0.4,
  text/html` still returning HTML, and `/graph` still falling through. Tested
  against the Workers runtime, not the build output: session 28 found that
  static assets are served before the Worker runs unless
  `assets.run_worker_first` lists the route, so a negotiation change is
  invisible in `next build` alone. `/about` was added to that list and to the
  `Vary: Accept` block in `public/_headers`.
- `about/page.tsx` is 137 lines with zero inline styles.

## Follow-ups

- ~~The spread table's numbers are authored, not derived.~~ **Done in the same
  session** (`b0e7afd`). Worth recording what it turned up: the hand-typed
  numbers were not merely duplicated, they were wrong. F1's spread read 0.30
  against an actual 0.37, F4's 0.25 against 0.30, F5's median 0.40 against
  0.30, and a sixth forecast was missing entirely. The claim detail pages
  compute the same statistics through `forecast.ts` and were already correct,
  so the site contradicted itself in public. `spread.ts` derives the rows and
  asserts in both directions that the authored readings and the ensemble
  forecasts match, so neither adding to `data/` nor renaming a forecast can
  leave it stale again.
- **Claim bodies are still rendered as raw text.** Session 28 noted this: a
  list written into a claim body renders as a run-on paragraph. `render.ts`
  now exists, so the fix is available, but it is a `data/` rendering decision
  rather than an editorial-content one and should be taken deliberately.
- **Role-based tests have no stack yet.** Deferred to its own session. The
  candidates weighed were role queries over the built `out/` HTML (extending
  `scripts/check-built-urls.mjs`, and the best fit for a static export),
  `@testing-library/react` with a DOM environment, and Playwright. Whichever
  lands, the posture chosen here holds: query by role, and assert copy only
  for interactive elements.
