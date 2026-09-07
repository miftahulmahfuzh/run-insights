# Plan: "Her character" becomes the Personality tab

**Slug:** nina-personality-tab
**Date:** 2026-09-07 07:14:16 +07
**Analysis:** `20260907-071416-PRSN_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-personality-tab`
**Branch:** `feature/nina-personality-tab` (base: `origin/main` @ `3902c58`)
**Phases:** 1
**Status:** complete — 1/1 phases complete (1); a phase is complete when its row in the Phases table is ticked ✅; the single-phase set is reviewed and merged as a whole
**Coordinator:** —

---

## Why

The user's raw input, verbatim:

```
update /admin/nina UI
right now, "Her character" is in Nina's album. move it as a new tab with name : Personality
```

This repeals a premise `components/admin/CharacterPanel.tsx:36-40` states in its own docstring —
that the panel belongs on `/admin/nina`, shut, because *"the album is the page's working surface and
must stay the first thing on it."* Once the panel has a route of its own, both halves of that
sentence stop applying: nothing shares the page, so nothing has to be pushed below the fold.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Move the "Her character" panel off `/admin/nina` (Nina's album) and onto a new tab named **Personality** | 1 |

## Scope

**In scope**

- A new admin route `/admin/personality` that gates, reads the tuning, and renders the panel
- `/admin/nina` reduced to the album alone
- A fifth `AdminNav` cell — **Personality** at `lg`, **Persona** on a phone — and the `grid-cols-5`
  geometry that follows from it
- The panel rendered expanded rather than as a shut `<details>`
- Both `revalidatePath` targets in `lib/admin/tuningActions.ts`
- The overview hub card's link
- `tests/admin.shell.test.ts` and `tests/admin.tuning.test.ts`, and the two prose rows that name
  `/admin/nina` as the panel's home

**Out of scope, and it stays out**

- **Every control's behaviour.** Not one slider, toggle, bound, label or hint changes. This is a
  placement change; the panel that renders on the new route is the panel that renders today.
- **The prompt.** `lib/nina/tuning.ts`, `lib/nina/persona.ts`, `lib/nina/prompts/*`,
  `NINA_PROMPT_VERSION` and `tests/__snapshots__/nina.prompts.test.ts.snap` are untouched. A
  snapshot that changes is a bug in this work, and `vitest -u` is forbidden.
- **The database.** No schema change, no migration, no query change. `readNinaTuning` and
  `writeNinaTuning` are called exactly as they are called today.
- **The action signatures.** `saveNinaTuningAction` / `resetNinaTuningAction` keep their arguments,
  their Zod schemas and their two-export count; only the path they revalidate moves.
- **The album.** `FileExplorer`, folders, pagination, `?folder=`/`?page=` validation, `shareOrigin`.
- **`proxy.ts`.** It matches neither `/admin` nor `/api/*`, so a new admin segment needs no matcher
  edit — `requireAdmin()` is the gate, as it is on every sibling.

## Invariants

1. **The tree builds and the full gate passes at the end of the phase.**
   `npm run test && npm run typecheck && npm run lint && npm run build`, all green.
2. **`tests/__snapshots__/nina.prompts.test.ts.snap` passes unmodified.** Never `vitest -u`.
3. **`requireAdmin()` is the first statement of the new page**, above any use of `searchParams` or
   any read — the rule `app/admin/layout.tsx:60-70` states and `tests/admin.tuning.test.ts` asserts.
4. **`CharacterPanel` stays client-safe.** It may not import anything `server-only`, anything that
   reaches drizzle, or `lib/env.ts`. `lib/nina/tuning.ts` (zero imports of its own) remains its only
   `lib/nina` import, and the values still arrive as a plain `TuningDraft` the server mapped.
5. **The preview stays the pure assembler.** `buildNinaSystemPrompt` only; never `runNinaTurn`, and
   nothing on the new page may appear in `scripts/check-llm-payload-boundary.mjs`'s Rule 2 table.
6. **`AdminNav` stays a Server Component.** No `'use client'`, no `next/navigation`, no
   `usePathname()` — the package-readme rule survives the fifth cell, and no active-link
   highlighting is added while the file is open.
7. **The bar's height and the layout's clearance stay in step.** If `h-14` moves,
   `app/admin/layout.tsx`'s `pb-[calc(5rem+var(--safe-bottom))]` moves with it. Neither should need
   to move here; the cell count changes, not the height.
8. **Every interactive control in `components/admin/` stays ≥ 44 px on its smaller axis** — phase 2
   of `admin-responsive-nina-intimacy`'s exit criterion, still binding.
9. **One save, not sixteen.** `lib/admin/tuningActions.ts` keeps exactly two exported actions and
   each opens with `requireAdmin()` above its `.safeParse(`.
10. **No dead reference to `/admin/nina#character`.** After this phase, `grep -rn 'nina#character'`
    over `app components lib tests docs` returns nothing outside `.workflows/plan/`.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The Personality tab | R1 | `app/admin` · `components/admin` · `lib/admin` | 10 | — | NORMAL | `.workflows/plan/nina-personality-tab/phase-1.md` | P2-CA-A002 | miftahulmahfuzh/run-insights#103 |

### Phase 1 — The Personality tab

**Satisfies:** R1

**Owns:**
- `app/admin/personality/page.tsx` (new)
- `app/admin/nina/page.tsx` — remove the panel, its three imports, its slot in the `Promise.all`,
  and the docstring paragraph that explains a placement that no longer exists
- `components/admin/CharacterPanel.tsx` — `<details>`/`<summary>` → an always-open section; the
  placement docstring rewritten
- `components/admin/AdminNav.tsx` — fifth `LINKS` row, `grid-cols-4` → `grid-cols-5`
- `app/admin/page.tsx` — the hub card link
- `lib/admin/tuningActions.ts` — both `revalidatePath` targets
- `tests/admin.shell.test.ts`, `tests/admin.tuning.test.ts`
- `components/admin/.workflows/package_readme.md`, `docs/nina/persona.md` (lines 7, 258, 337, 412
  and 421 — every row that names `/admin/nina` as where the tuning is edited, not only the table row
  the first pass found)

**Does not touch:** everything under **Out of scope** above — `lib/nina/*` (except reading
`readNinaTuning` and `buildNinaSystemPrompt` exactly as the album does today), `lib/db/*`, any
migration, `lib/admin/schema.ts`, `lib/admin/tuningModel.ts`'s logic, `components/admin/DialSlider.tsx`,
`components/admin/FileExplorer*`, `proxy.ts`, `app/admin/layout.tsx`.

**Exit criteria:**
1. `/admin/personality` renders the whole panel expanded; every slider, the relationship selector,
   every toggle, wardrobe, notes and the prompt preview work, and Save reports the new revision on
   that page without a manual reload.
2. `/admin/nina` renders `<h1>Nina's album</h1>` and the explorer, with no `CharacterPanel` import
   and no `readNinaTuning` call.
3. `AdminNav` shows five cells; **Personality** at `lg`, **Persona** below it; the bar is
   `grid-cols-5` and still `h-14`.
4. `/admin` → *"Tune her character →"* lands on `/admin/personality`.
5. Invariant 10 holds — no dangling `#character` deep link.
6. `npm run test && npm run typecheck && npm run lint && npm run build` green, with
   `nina.prompts` snapshots unmodified.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| What "tab" means — an in-page tab strip on `/admin/nina`, or a fifth `AdminNav` cell | **A fifth `AdminNav` cell and a route of its own.** `/admin` has no in-page tab component anywhere; `AdminNav`'s own docstring calls its cells the admin counterpart of `components/ui/TabBar.tsx` and says it *"carries the four admin routes"*. "A new tab" beside "Nina's album" is a fifth one of those. | 5: the user's raw input, read against 6: surrounding convention |
| Route segment — `/admin/personality` or `/admin/nina/personality` | **`/admin/personality`**, a sibling of the album, not a child of it. The user asked for the panel to leave the album; nesting it under `/admin/nina` would leave it inside the thing it was moved out of, and the nav's other three entries are all flat. | 5: the user's raw input |
| Phone label — "Personality" (11 chars) will not fit a five-cell bar | **`short: 'Persona'` (7), and `tests/admin.shell.test.ts`'s ceiling tightens 10 → 8.** 470 px / 5 = 94 px, and 414 px / 5 = 82.8 px on the target XS Max against 103 px at four cells. The `short`/`label` pair in `LINKS` exists for precisely this, and the file's docstring already records the rule: *"a clipped nav label is worse than a shorter true one."* All five shorts (Overview 8, Album 5, Persona 7, Photos 6, Memory 6) clear the tightened bound. | 6: surrounding convention |
| The `<details>` disclosure — keep it shut, keep it open, or drop it | **Drop it; the panel renders expanded.** The disclosure's only stated justification is `CharacterPanel.tsx:36-40` — the album must stay the page's working surface. On a route of its own nothing shares the page. A `<details open>` would also be wrong mechanically: the file states `open` is deliberately not a prop because React would fight the user's click, and `revalidatePath` re-renders after every save. The summary line's content (relationship · loudest dials · N off · revision) is kept, as the page header. | 1: the panel's own stated invariant, applied to a premise the user repealed |
| The stale `/admin/nina#character` fragment | **The new section keeps `id="character"`**, and the overview link is repointed to `/admin/personality`. Costs one attribute; means a bookmarked fragment lands somewhere real. | 6: surrounding convention |
| `docs/nina/persona.md` names `/admin/nina` as the tuning's home in five places, not the one the first pass found (lines 7, 258, 337, 412, 421) | **Fix all five.** A doc that is four-fifths false is worse than one that is wholly stale, because the wrong line is the one a reader trusts. The phase builds and passes either way, so this is additive, not load-bearing. | 6: surrounding convention |
| `app/admin/personality/page.tsx` — `force-dynamic`, or let `requireAdmin()`'s cookie read opt it in implicitly | **Declare `force-dynamic` explicitly, and take no props.** `app/admin/page.tsx:28-30` is the exact precedent: `force-dynamic` with a no-parameter `AdminHomePage()` that reads `readNinaTuning` and no `searchParams`. Verified against this repo's own next@16.3.1 docs rather than recalled — `page.md:119` names `searchParams` as the request-time API that opts a page in, and this page reads none; `next.config.ts` sets no `cacheComponents`. A route's caching decided implicitly by a module three levels down is a route that will one day be cached by accident. | 6: surrounding convention |
| Whether `/admin/nina` keeps `force-dynamic` after losing the tuning read | **Yes.** Its docstring already says `force-dynamic` is about the album being per-request state that must reflect the action that just ran, *"unchanged and not about `searchParams`"* — the tuning read was never the reason. | 4: the file's own recorded Why |

## Open Questions

None. Every fork above was decidable from a stated invariant, the user's own words, or the
surrounding convention, and each is recorded with the rung that decided it. Overturning any one of
them costs a single commit.

## Handoffs

Named by the planner, deliberately left outside this phase:

- `lib/admin/.workflows/package_readme.md:507,594` name `revalidatePath('/admin/nina')` as the
  tuning actions' target and become false at step 6. That package's readme is not in this phase's
  Owns list; `/update-readme` owns it.
- `components/admin/.workflows/package_readme.md`'s **Last Updated** header and a new dated entry
  are `/update-readme`'s job, because it mints the TaskID. The two prose rows this phase actually
  falsifies (lines 101 and 591) **are** fixed here.
- `components/admin/.workflows/todos.md:36,44` describe a closed task's historical record and are not
  rewritten — a completed task's context is what it was.
- **Steps 1 and 2 must land in one commit.** Between them the panel is mounted on two routes: the
  tree builds, but two drafts of one row is not a state to leave on the branch.
- The worktree has no `node_modules`; `npm install` is step 0, and `npm run typecheck` runs
  `next typegen` first, which is what registers the new route literal for `PageProps`.

## Rollback

One phase, one branch, one PR. `git checkout main` and delete `feature/nina-personality-tab`, or
revert the merge commit. Nothing is written to the database, no migration runs, and no production
row changes shape — the stored `NinaTuning` is read and written by the same two actions before and
after, so a rollback needs no data repair.

## Next

Execute the single phase:

    /implement -f NINA_PERSONALITY_TAB_PLAN.md --phase 1

Or run it as a swarm — one session, started now rather than whenever someone looks:

    /analyze-orchestrator -f NINA_PERSONALITY_TAB_PLAN.md

Or put it on the board first:

    /create-task --from-plan NINA_PERSONALITY_TAB_PLAN.md
