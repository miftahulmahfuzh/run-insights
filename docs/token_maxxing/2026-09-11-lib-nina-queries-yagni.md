# Token-Maxxing Session — 2026-09-11: Lib Nina Queries YAGNI

## 🎯 Achievement / End Result
- **Goal of the burn:** A two-part cleanup scoped to `lib/nina/`: (1) refile the five
  `[x]`-completed tasks sitting misfiled in `lib/nina/.workflows/todos.md`'s Active
  section (whose header already claimed "1 active"), and (2) — the headline — a
  genuine unused-export audit of `lib/nina/queries.ts` (4,542 lines, 114 exports),
  the single most-deferred cleanup item in this repo's token-maxxing history,
  flagged as a YAGNI/dead-code target across 4–5 prior sessions and each time
  deferred for lacking test coverage. That coverage landed earlier the same day,
  so the blocking condition was finally gone.
- **Concrete changes:**
  - Commit `897a3a1` — `lib/nina/.workflows/todos.md`: five completed entries
    (P1-NIN-A025, A030, A031, A016, A017) moved out of Active Tasks into Completed
    Tasks at their date-descending positions; two damaged timestamps repaired
    from commit archaeology (81 insertions / 80 deletions, one file).
  - Commit `3974079` — `lib/nina/queries.ts`: exactly one dead export found and
    removed, `countNinaSessionMessages` (23 deletions, one file). Nothing else
    touched — no restructure, no split, no renames, per the card.
- **Real value delivered:**
  - `lib/nina/todos.md` now tells the truth again: Active holds exactly one
    `- [ ]` and zero `- [x]`; the Completed section holds all 35 entries, matching
    the header's own stats. The section that lied beneath an honest header is fixed.
  - The 4–5-times-deferred `queries.ts` audit was finally *done*, and its answer
    is itself the value: **114 exports audited, exactly one was dead.** The audit
    is the deliverable as much as the deletion — it converts a vague "queries.ts
    is probably full of YAGNI" suspicion (repeated across many sessions' menus)
    into a measured, per-name, repo-wide-verified result that future sessions can
    stop re-flagging.
  - The one dead export was removed *and* the removal was a deliberate,
    documented supersession of a previously recorded keep-decision (task #136's
    "the card does not authorise this" note) — with the full rationale preserved
    in git history rather than silently dropped.
  - Gates all green after the removal: `next typegen` + `tsc --noEmit` exit 0;
    vitest `lib/nina` + `tests/nina` 76 files / 1,925 tests green; **full suite
    265 files / 5,107 tests green**.
- **Branch:** `token-maxxing-2026-09-11-lib-nina-queries-yagni`
- **Merge status:** merged (commit `c2d7abc`)
- **Approx token burn:** high — a per-name word-boundary grep audit of 114 exports
  across the whole repo, hit-by-hit verification of every single-reference
  function, commit archaeology for two timestamps, plus the full gate ladder
  (typegen, tsc, targeted vitest, full vitest, prettier). 🔥

## Context & Motivation
This was a **worker session** under the day's orchestrator
(`tokenmax-orch-2026-09-11`), assigned one idea from the coordinator's menu rather
than picking from a cold read.

The assignment had two halves, and both had history:

1. **The todos.md misfile.** `lib/nina/.workflows/todos.md`'s header claimed
   "Total Active Tasks: 1 / Completed: 35", but its Active section listed **six**
   entries, five of which were marked `[x]` with completed dates of 09-07/09-08.
   Only P1-NIN-A018 was genuinely open. The header was already describing the
   correct post-move state; the section beneath it was what lied — the kind of
   slow rot that makes a todos file untrustworthy as an index.

2. **The queries.ts YAGNI question.** `lib/nina/queries.ts` (4,542 lines) had been
   flagged as a YAGNI/dead-code target across **4–5 prior token-maxxing sessions**,
   and every one of them deferred it for the same reason: there was no test
   coverage over `lib/nina`, so deleting an export there had no safety net. On
   this same day, earlier sessions closed exactly that hole — `components/nina`
   got real component tests and much of `lib/nina` got real suites. The deferred
   cleanup's blocking condition was resolved by other work, and this session was
   the payoff: the audit could finally be a *measured* deletion instead of another
   deferral.

Why it mattered: this was the single most-deferred cleanup item in the repo's
token-maxxing history. Leaving it deferred again would have been the sixth
consecutive skip; acting on it the same day its blocker fell is the whole point
of keeping the follow-up lists honest.

## What We Did (blow-by-blow)

### Part 1 — todos.md refile (commit `897a3a1`)

1. **Confirmed the misfile.** The Active section held 6 entries; 5 of them were
   `[x]` completed on 09-07/09-08 (P1-NIN-A025, P1-NIN-A030, P1-NIN-A031,
   P1-NIN-A016, P1-NIN-A017), and only P1-NIN-A018 was genuinely open. The
   header's "Total Active Tasks: 1 / Completed: 35" was already correct for the
   post-move state — the section beneath it was the lie.

2. **Moved all five into Completed Tasks at date-descending positions.** Each
   entry was inserted where its completed date puts it in the section's existing
   ordering: A025/A031/A030 ahead of A023; A016 ahead of A019; A017 ahead of
   A019→A013. The resulting head is strictly date-descending except for one
   **pre-existing** inversion (A023→A027) that predates this session and was
   deliberately not touched.

3. **Repaired two damaged timestamps while moving.** A030's entry was missing its
   Completed timestamp entirely — filled from its landing commit `86891a9`
   (2026-09-07 23:06). A031's entry had a date but no time-of-day — added from
   commit `5a07dc5` (2026-09-08 03:22). Provenance from git, not invention.

4. **Verified mechanically, not by eyeball.** A script check confirmed the Active
   section now holds exactly one `- [ ]` and zero `- [x]`, and the Completed
   section holds all 35 entries — matching the header stat exactly.
   `prettier --check` clean.

### Part 2 — queries.ts unused-export audit + removal (commit `3974079`)

5. **Enumerated the full export surface first.** `lib/nina/queries.ts` exports
   **114 names: 84 functions + 30 interfaces/types.** No sampling, no "looks
   unused" heuristics — the audit covered every one.

6. **Probed soundness before trusting grep.** Two checks make a named-import grep
   a *valid* caller probe here: the repo contains no `import * as` namespace
   imports of `queries`, and no `export *` re-export barrels of it anywhere. With
   both absent, any real caller must name its import explicitly, so a
   word-boundary grep per name across `app/`, `components/`, `lib/`, `scripts/`
   and `tests/` cannot miss one.

7. **Audited all 114 names.** Exactly **one** had zero callers:
   `countNinaSessionMessages` (then at ~lines 931–952). Its only repo-wide hits
   outside its own declaration were landed plan documents in `.workflows/` —
   prose about the function, not calls to it. A repo-wide sweep (including the
   plan docs and drizzle schema) confirmed the candidate dead from every angle.

8. **Verified the negative result just as hard.** "No other dead exports" was not
   assumed from the grep pass: the six functions with only a single reference
   were each verified hit-by-hit as a real import + real call site (not a
   comment, not a stale mock), and every one of the 30 interfaces feeds at least
   one signature somewhere. So the honest headline is: one dead export, and a
   verified absence of any other.

9. **Removed it — dead code only.** The function and its docstring went out; 23
   deletions, nothing else. No restructure, no split, no renames, no drive-by
   reformatting — the card scoped this to dead-code removal and the diff respects
   that to the line.

10. **Documented the supersession in the commit body.** See Decisions below —
    this removal reverses a recorded keep-decision, and the commit message
    carries that argument so a future reader doesn't have to reconstruct it.

11. **Ran the full gate ladder:**
    - `npm run typecheck` (`next typegen` + `tsc --noEmit`) → exit 0. Note for
      future fresh-worktree sessions: bare `tsc` in this worktree first reported
      16 `PageProps`/`LayoutProps`/`RouteContext` errors — the known
      missing-Next-generated-types class; `typegen` clears them. (Matches the
      standing memory note.)
    - Targeted vitest: `lib/nina` + `tests/nina` → 76 files / 1,925 tests green.
    - Full suite → **265 files / 5,107 tests green**.
    - `prettier --check` on the touched file → clean for this change; the file's
      two pre-existing divergences were left alone (see Follow-ups).

## Code / Design Details

**The dead export, as removed.** `countNinaSessionMessages` was written for
phase 5's delete-confirmation panel, which task #136 had already removed — its
own docstring admitted it had no caller:

```ts
/**
 * How many messages a session holds — written for phase 5's delete confirmation, **which task #136
 * removed. It has no caller now.**
 *
 * Kept rather than deleted, because the number it produces is still the only honest way to name what
 * an R11 removal costs, and there is still no undo for R11 (the archive flag was ruled out). What
 * changed is a product decision — the runner asked for the panel to go — not the arithmetic. Anything
 * that ever has to say what a session removal destroys (an undo, a trash view, a line before a
 * purge) starts here rather than writing the statement again.
 */
export async function countNinaSessionMessages(userId: string, sessionId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.sessionId, sessionId)))

  return rows[0]?.n ?? 0
}
```

The audit method, in one line per step (this is the part a future session should
copy before touching `queries.ts` again):

1. List exports: `export async function` / `export function` / `export interface`
   / `export type` — 84 + 30 = 114 names.
2. Reject namespace and barrel imports repo-wide (`import * as`, `export *`) so
   named-import grep is provably exhaustive.
3. Word-boundary grep each name across `app/ components/ lib/ scripts/ tests/`.
4. For zero-hit names, widen to a repo-wide sweep (including `.workflows/` plan
   docs and drizzle) and read every remaining hit to separate prose from calls.
5. For single-hit names, read the hit and confirm it is a real import + call —
   not a comment, not a mock leftover.

**What the audit produced:** a 1-of-114 result with a verified negative on the
other 113. The interesting number for future sessions is not the 23 deleted
lines — it's that `queries.ts`'s export surface is otherwise *clean*: every
remaining function has a real caller and every interface feeds a signature. The
"4,542-line file is probably riddled with YAGNI" prior was wrong, and now the
repo has the measurement saying so.

## Decisions & Trade-offs

- **Completed, not Archive, for the five misfiled entries.** The file has **no
  Archive section at all**, and every entry in it is ≤30 days old, so Completed
  is where they belong. The `reorganize-todos` skill's 80%-archive rule was
  deliberately **not** applied: the card's mandate was the 5 misfiled entries,
  not a general reorganization, and this repo's todos convention keeps full
  provenance entries rather than shrinking them on move. Scope discipline over
  opportunistic tidying.
- **The removal deliberately reverses a recorded keep-decision.** Task #136's
  plan had written: *"Kept... deleting a data-layer read is a judgement the card
  does not authorise"*, and the function's docstring argued for its own
  preservation (*"Anything that ever has to say what a session removal destroys
  (an undo, a trash view, a line before a purge) starts here"*). Today's card
  **did** authorise it, and the keep's stated reason is speculative future need —
  the exact thing a YAGNI pass exists to strike. An "undo, trash view, or
  pre-purge line" that needs this count can resurrect it from git, where the
  function and its full rationale live forever. The supersession is argued in
  the commit body, not buried.
- **De-exporting the 11 internally-used-only interfaces was rejected.** The audit
  found 11 exported interfaces with zero external importers but real in-module
  use (full list in Follow-ups). Un-exporting them would be API-surface churn,
  not dead-code removal — and the card scoped removal to functions with zero
  callers. Recorded as candidates instead of acted on.
- **Prettier's two known divergences in `queries.ts` were left untouched**, per
  the P1-NIN-A026 precedent — a dead-code card is not a formatting card, and
  mixing the two pollutes the diff.
- **Commit-archaeology for timestamps instead of guessing.** A030's missing
  Completed time and A031's missing time-of-day were both filled from the
  commits that landed the work (`86891a9`, `5a07dc5`), not from plausible-looking
  invented values — a todos file's dates should be evidence, not decoration.

## Follow-ups & YAGNI notes

Deliberately left undone, recorded so future sessions inherit the measurement
rather than re-running the audit:

- **11 exported interfaces in `queries.ts` have zero external importers but are
  used inside the module** — the natural next (much smaller) de-export pass:
  `NinaIdentity`, `NinaSessionRow`, `NinaMediaPage`, `NinaNagUpsert`,
  `NinaAvatarInsert`, `NinaAvatarCrop`, `NinaAvatarBatchInsert`,
  `NinaFolderRenameResult`, `NinaChatPhotoBlobPatch`, `NinaJobPhotoRow`,
  `NinaJobPhotoBubbleRow`. Left this session because the mandate scoped removal
  to zero-caller *functions*; un-exporting types is API-surface churn, not dead
  code.
- **`queries.ts` carries two pre-existing prettier divergences** (~line 2231 and
  ~line 2424, multi-line `and(...)` calls prettier would collapse). Left alone
  per the P1-NIN-A026 precedent; a future formatting-only pass may take them.
- **`npm run lint` on the base branch currently reports 4 errors + 7 warnings,
  all in files this session never touched** — `components/nina/NinaBarProvider.test.tsx`,
  `components/nina/useChatScroll.test.tsx`, and `components/ui/Card.test.tsx`
  (`react/no-unescaped-entities`), plus unused-var warnings in
  `lib/nina/turn.test.ts`. Pre-existing from the same day's earlier
  test-coverage sessions; recorded here so they are not mistaken for new.
- **The audit's negative result is itself a standing answer:** don't re-flag
  `queries.ts` as a probable YAGNI target in future menus — 113 of 114 exports
  are verified live. Any future pass should start from the 11-interface list
  above, not from the whole file.

## Appendix

**Commits (work, on `token-maxxing-2026-09-11-lib-nina-queries-yagni`):**
```
897a3a1  docs(nina): refile 5 completed tasks out of Active in lib/nina todos
         lib/nina/.workflows/todos.md | 81 insertions(+), 80 deletions(-)

3974079  refactor(nina): remove caller-less countNinaSessionMessages from queries.ts
         lib/nina/queries.ts | 23 deletions(-)
```
HEAD at work-report time: `3974079`; this doc and its index row are committed
on top by the session itself before sending its DONE report.

**Verification state after the work:**
- `npm run typecheck` (next typegen + tsc --noEmit): exit 0.
- vitest `lib/nina` + `tests/nina`: 76 files / 1,925 tests green.
- Full suite: 265 files / 5,107 tests green.
- `prettier --check` on both touched files: clean.
- todos.md script check: Active = exactly one `- [ ]`, zero `- [x]`;
  Completed = 35 entries, matching the header's "Completed: 35".

**Key method notes for a future audit of this file:**
- Named-import grep is exhaustive for `queries.ts` only because the repo has no
  `import * as` of it and no `export *` barrels of it — re-verify those two
  facts before trusting a repeat of the grep.
- Fresh-worktree `tsc` without `next typegen` first reports
  `PageProps`/`LayoutProps`/`RouteContext` errors; that is the known
  generated-types class, not a real regression.
