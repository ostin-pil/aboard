# Plan: editor-mode posture

Decide what `/graph`'s editor-mode does now that `data/` is the source of truth.

## Context

The custom JS graph engine at `public/graph-engine.js` (ported from Claude Design)
has an editor mode that supports: drag-to-reposition, drag-handle-to-connect new
edges, modal to file new claims, modal to edit edges, undo/redo, persistence to
`localStorage` under key `aboard.graph.v0`.

This was excellent for a v0 tech demo. With the CMS migration (2026-05-10), the
filesystem is now authoritative — edits stored in `localStorage` no longer
persist back to disk, so they are *visually real but factually ephemeral*. Each
visitor sees their own edits.

This is now misleading. The page presents "filed claims" affordances that don't
actually file anything.

## Decision space — three postures

### Posture 1 — Remove

Strip editor controls entirely. `/graph` becomes read-only. The fullbleed page
keeps zoom, pan, hover-focus, popover, JSON-LD export. Drop "+ new claim",
"edit mode" toggle, undo/redo, the node ✎/→ overlays. Engine's edit code paths
stay for now (untested but inert) since porting to TS is a separate decision.

**Pros:** honest. Aligns with "data/ is the source of truth." Zero confusion.
**Cons:** loses a visible-from-the-first-click "this is alive" signal.
**Effort:** ~45 min — set `editable: false` everywhere, remove toolbar buttons,
hide the `edit-help` strip. Add prominent "PR claims via GitHub" or similar
hint where the toolbar used to be.

### Posture 2 — Keep as sandbox, label clearly (Recommended starting point)

Editor remains on, but the UI announces what it is: a personal sandbox that
does not file. Add visible "● local sandbox · edits not saved to graph"
indicator next to the existing "● saved locally" flash. Replace the "+ new
claim" primary tooltip with copy that explains: "Try out a claim — to file for
real, open a PR against data/." On the JSON-LD export modal, change one button
from "download .jsonld" to "download as PR-ready data file" and produce the
Markdown frontmatter + YAML pack rather than the JSON-LD blob.

**Pros:** preserves the wow moment. Funnels engaged users into the real
submission path. Honest about the boundary.
**Cons:** still has a "two modes" cognitive cost. Local edits look authoritative
inside the session until you reload.
**Effort:** ~3 hr. The export-as-PR-pack feature is the heavy bit — needs a
small TS module that emits frontmatter Markdown + YAML from the engine's state
shape. Best path: reuse the migration script's logic, ported to client-side
TypeScript.

### Posture 3 — Real submission flow

Editor writes back to disk (in dev) or to a real submission endpoint that opens
a PR (in prod). Requires deciding authentication (GitHub OAuth? simple shared
secret for collaborators? open writes with manual review?), validation gate
(reject before commit if schema fails), and review UI.

**Pros:** the most honest version of "agent-filed."
**Cons:** substantial scope (auth + API + GitHub integration + review tooling),
opens trust/identity questions that are in `vision.md` as open-questions, real
spam/abuse risk on a public site.
**Effort:** ~12–20 hr just for the minimal version; the trust/governance
decisions add weeks of policy work.

## Recommendation

Start with **Posture 2** (sandbox + PR-pack export). It honors the immediate
problem ("the UI lies") without committing to the architecture that Posture 3
requires. The PR-pack export is genuinely useful: an agent could exercise the
sandbox to construct a candidate claim, then submit it via PR with the exported
files attached.

Defer Posture 3 until at least one external contributor (human or agent) has
exercised the PR path manually.

## File-level work for Posture 2

1. `public/graph-engine.js` — Add a global `aboard:sandbox-notice` event or
   simple data attribute the React layer can show. Keep current behavior.
2. `src/components/GraphFullbleed.tsx` — Add a persistent "● local sandbox"
   pill near the saved-flash indicator with hover tooltip "Edits stay in your
   browser. To file for real, see /about#contributing." Update the JSON-LD
   modal: add a tab or button "Export as PR-ready files (.zip of frontmatter +
   yaml)".
3. `src/lib/data/exporter.ts` (new) — Function `engineToPRPack(state) => { files: { path: string, body: string }[] }`. Walks engine state, emits the
   same shape the migration script wrote. Zips client-side via JSZip or similar.
4. `src/app/about/page.tsx` — Add a `## Contributing` section linking to the
   `data/` directory on GitHub with the workflow: clone, add files matching the
   pattern, validate locally with `clients/validate.ts`, open PR.

## Verification

- `/graph` still renders the editor controls.
- The "local sandbox" pill is visible at all times.
- Filing a new claim via the modal still works locally but no longer suggests
  it's been "filed" elsewhere.
- "Export as PR-ready files" produces a valid pack: `clients/validate.ts`
  should pass after unpacking into `data/`.

## Open questions inside this plan

1. **Zip in browser or single-file emit?** Multi-file zip is more PR-ready but
   needs a dependency. Single-file pack (concatenated Markdown blocks separated
   by `---`) is simpler but less useful. Default: zip with JSZip.
2. **GitHub URL placeholders.** The PR workflow doc references `data/` paths
   but the repo is at `git@github.com:ostin-pil/aboard`. Once a public web
   address exists, update.
