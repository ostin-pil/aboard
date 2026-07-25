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

### Slice A. One source for the positioning paragraph (landed, session 29)

`src/lib/copy.ts` (`4a79e3d`) exports the shared strings as plain typed
constants: no loader, no parsing, no new dependency. The five sites named
above import from it, and so does `opengraph-image.tsx`, which turned out to
share the tagline's second half with the homepage headline.

Two rules came out of doing it, both asserted by `src/lib/copy.test.ts`:

- **Constants are plain prose, never markup.** A call site that wants emphasis
  wraps a whole constant, so one spelling serves JSX, Markdown and a `<meta>`
  attribute. The positioning sentence is split at its subject for this reason:
  the homepage bolds "aboard" and the Markdown twin quotes the sentence whole.
- **Copy that differs by audience still lives there.** `SITE_DESCRIPTION`,
  `POSITIONING` and `AGENT_INTRO` address a search engine, a human and an
  agent; they are deliberately different prose and flattening them would lose
  the tuning. Adjacency is what makes the next writer reuse one instead of
  writing a sixth. `copy.test.ts` confines a distinctive fragment of each to
  the module, the way `canonical-urls.test.ts` confines origin literals.

Output is unchanged but for two reconciliations, both verified against a build
of `origin/main` (the OG card is byte-identical, and so are `about.html`,
`llms.txt`, and every claim and dossier twin): the hero now says "leverage
points", matching the claim kind's name in `data/`, and the OG alt text is
composed from the card's own headline.

One known sentence-initial use of "non-convergent by design" remains outside
the module, in `dossiers/[claimId]/index.md/route.ts`. That is the dossier's
own editorial surface with its own grammar, and it belongs to slice B rather
than to a capitalization helper.

### Slice B. A `content/` tree, loaded and validated

For prose with structure (the about page's sections), constants stop being
enough and it wants to be a document.

- `content/<slug>.md`, YAML frontmatter plus a Markdown body, mirroring the
  shape of `data/<domain>/claims/<id>.md`.
- A loader beside `src/lib/data/loader.ts`, validating frontmatter with Zod,
  memoized at module load, same as the graph loader.
- A renderer turning the body into HTML for the page, and serving it verbatim
  for the twin.
- `about/page.tsx` shrinks to layout and section chrome, reading its prose
  from the loader. That satisfies the audit's "split `about/page.tsx`" item
  (`code-quality-audit.md` section D) by removing content rather than by
  cutting the file into three.
- `src/app/about/index.md/route.ts` becomes trivial: serve the body. The
  negotiation from session 28 picks it up automatically, because
  `markdownTwinPath` already maps `/about` to `/about/index.md` and the
  Worker's asset lookup is what decides whether a twin exists.

### Slice C. Inline styles to classes

Independent of A and B. Convert the 102 inline `style={}` objects in
`about/page.tsx` to classes in `globals.css`, following the conventions the
claim and dossier pages already use. Mechanical, reviewable, and it lands the
file under the 250-line rule on its own.

## Decisions to make first

1. **Renderer dependency.** The project has no Markdown-to-HTML renderer
   today (`gray-matter` parses frontmatter only, and `claim.statement` is
   rendered as raw text in a `<p>`). Options: add `marked` (small, fast),
   add `remark`/`rehype` (heavier, plugin ecosystem, sanitization available),
   or hand-roll a deliberately tiny subset renderer covering paragraphs,
   bold, links and lists. Adding a dependency to a repo with 9 runtime
   dependencies is a real decision, not a default.
2. **Sanitization posture.** Rendering our own build-time content through
   `dangerouslySetInnerHTML` is safe (no user input reaches it, and the write
   path produces `data/` PRs a human reviews, not site copy). It should still
   be a recorded decision rather than an accident, and it changes if agent
   proposals ever write editorial copy.
3. **`content/` or `data/`.** `data/` is documented as the claim graph, and
   `loader.ts` walks it expecting domains. A sibling `content/` keeps that
   invariant clean. The alternative, a `data/site/` domain, would need loader
   carve-outs. Recommend `content/`.
4. **Scope of the move.** Whether the homepage hero prose moves in slice B or
   stays inline, given it is short and sits inside a layout that is mostly
   markup.

## Sequencing and effort

- Slice A, landed in session 29 (`4a79e3d`). Decision 4 is answered for the
  hero copy: it moved into `copy.ts` as constants rather than waiting for the
  `content/` tree, because it is three sentences with no structure to model.
- Slice B, ~3 to 4 hours after decision 1 is made. Bounded by the about page.
- Slice C, ~1 to 2 hours. Mechanical, independent, browser QA on both themes.

B and C each deserve their own PR.

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

## Verification

- `npx tsc --noEmit`, `npm run build`, `npm test` all green; lint at its
  documented 14-warning baseline (session 28).
- The positioning paragraph appears exactly once in `src/`, verified by
  grepping for a distinctive fragment.
- `/about` with `Accept: text/markdown` returns `text/markdown` against
  `wrangler dev`, and `/about/index.md` exists in `out/`. Test against the
  Workers runtime, not the build output: session 28 found that static assets
  are served before the Worker runs unless `assets.run_worker_first` lists
  the route, so a negotiation change is invisible in `next build` alone.
- `about/page.tsx` under 250 lines after slice B or C.
