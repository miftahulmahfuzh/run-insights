# Plan: `/nina/jobs` — per-row redo and soft delete

**Slug:** nina-job-redo-and-soft-delete
**Date:** 2026-09-07 07:29:51 +07
**Analysis:** `20260907-072951-JB2R_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-job-redo-and-soft-delete`
**Branch:** `feature/nina-job-redo-and-soft-delete` (base: `origin/main` @ `3902c58`)
**Phases:** 2
**Status:** phase 1/2 complete
**Coordinator:** —

---

## Why

The user's rationale, verbatim:

> di Proses foto page, we have successfully list all jobs. improve it:
> for each item, add two buttons directly there. we dont need confirmation message to execute them:
> 1. redo job icon. clicking this will redo the failed job. if the chat is no longer there, we will keep executing the reload, nina can just mention the new photograph in the most recent chat session
> 2. delete job icon . clicking this will delete the item (but just soft delete in neon db). so i can keep the job list tidy and pristine

Two sentences in there are specifications and are quoted again wherever they decide something:
**"we dont need confirmation message"** (which overrides `SessionRow`'s R11 confirmation precedent) and
**"but just soft delete in neon db"** (which forbids a `DELETE`, in a table that is also the money ledger).

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | A **redo** icon button on each item of `/nina/jobs`, firing immediately with no confirmation, that re-runs the failed job — and when the triggering chat message is gone, still delivers the photograph, into the most recent chat session | 1 |
| R2 | A **delete** icon button on each item, firing immediately with no confirmation, that **soft**-deletes the row in Neon so the job list stays tidy | 2 |

## Scope

**In scope**

- a control slot on the `/nina/jobs` row, opt-in per surface
- a `'use server'` module for the two actions
- `reopenNinaImageJob` — a redo that opens a *new* job row from a failed one's stored `args`
- `nina_turns.deleted_at` + one drizzle migration + the `isNull` filter on every read that describes jobs to a human or schedules work
- tests for the pure rules, for the action refusals, and for R1's "the chat is gone" fallback

**Out of scope, and why**

- **The `/nina/jobs/[id]` detail page gains no controls.** The user named the list. The detail page inherits the soft-delete filter (it will 404 a deleted job) and nothing else.
- **`/nina/about`'s Media section stays read-only.** It renders the same `NinaJobList`; the controls are opt-in for exactly this reason. See D6.
- **No undo / no trash view.** "Soft delete" here buys ledger safety and a recoverable mistake at the SQL level, not a restore button. Nobody asked for one.
- **No blob cleanup.** A soft-deleted job's photograph, if it has one, stays in the chat and in Blob. Deleting a *job* is not deleting a *photograph*.
- **No cancellation of an in-flight generation.** See D8.
- **`scripts/nina-image-worker.ts`** (the GitHub backstop) is not taught about `deleted_at`. It hand-writes its own SQL against a second copy of the column names, it is a backstop that runs only when the platform path failed, and the worst case is that it finishes a job the runner hid — which produces a photograph he asked for. Named here so it is a decision and not an oversight.

## Invariants

1. **The tree builds and `npm run test`, `npm run lint`, `npm run typecheck` pass at the end of each phase.**
2. **Money is never spent silently, and never un-spent.** `nina_turns` is the ledger. No phase may `DELETE` a row, reset a terminal row's `status`, or zero a `cost_micro_usd`. A redo is an INSERT; a delete is a flag.
3. **Ownership is proved in SQL.** Every new query takes `userId` first and puts it in the `WHERE`. A job id arriving from a browser is a claim, never a fact.
4. **No model call is added to a module `scripts/check-llm-payload-boundary.mjs` does not already list.** The redo action schedules; it does not call.
5. **`/nina/about` renders byte for byte as it does on `origin/main`.** Both phases verify this; neither edits `NinaAboutScreen.tsx`.
6. **Pure rules live in `lib/nina/jobview.ts` and are unit-tested** (`vitest` is `environment: 'node'`, so a rule inside a `'use client'` component is a rule no test can reach).
7. **No confirmation dialog, sheet, second tap, or `window.confirm` on either control.** This is R-level, not stylistic.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Redo: reopen a failed job from its own args | R1 | `lib/nina` + `components/nina` + `app/nina/jobs` | 8 | — | NORMAL | `.workflows/plan/nina-job-redo-and-soft-delete/phase-1.md` | `P1-NIN-A013` | `miftahulmahfuzh/run-insights#105` |
| 2 | Soft delete: `nina_turns.deleted_at` and the tidy list | R2 | `lib/db` + `lib/nina` + `components/nina` | 8 (+3 generated) | 1 | NORMAL | `.workflows/plan/nina-job-redo-and-soft-delete/phase-2.md` | `P1-NIN-A014` | `miftahulmahfuzh/run-insights#106` |

### Phase 1 — Redo: reopen a failed job from its own args

**Satisfies:** R1

**Owns:**
- `lib/nina/jobview.ts` — `jobCanRedo(stage)` (pure), `NinaJobListItem.canRedo`
- `lib/nina/imagejobs.ts` — `reopenNinaImageJob(userId, jobId)`: read the failed row owner-scoped, refuse anything that is not `status='failed'` or whose `args` are null, check `ninaImageQuotaLeft`, `openNinaImageJob` with the same `args` and `attempts: 0`, return the new job id + purpose + replyToId
- `lib/nina/jobActions.ts` — **new** `'use server'` module: `redoNinaImageJob({ jobId })`, which calls `reopenNinaImageJob`, then `fireNinaImageGeneration(...)`, then `revalidatePath(NINA_JOBS_HREF)`; returns `NinaJobActionResult`
- `components/nina/NinaJobActions.tsx` — **new** `'use client'`: the redo icon button, its pending state, its refusal sentence
- `components/nina/NinaJobList.tsx` — the row becomes a flex line: the existing `<Link>` plus a sibling control slot, rendered only when the new `actions` prop is set
- `app/nina/jobs/page.tsx` — passes `actions`, and **exports `export const maxDuration = 300`**
- `tests/nina.jobview.test.ts` — `jobCanRedo` / `canRedo`
- `tests/nina.jobActions.test.ts` — **new**: the refusals, and R1's "the chat is gone" fallback asserted against `finishSelfie`'s resolution rule

**Does not touch:** `lib/db/schema.ts`, `drizzle/`, `components/nina/NinaAboutScreen.tsx`, `app/nina/about/page.tsx`, `app/nina/jobs/[id]/page.tsx`, `lib/nina/imagerun.ts`, `lib/nina/selfiegen.ts`, `scripts/`.

**Exit criteria:**
- tapping redo on a failed row on `/nina/jobs` starts a generation and the row list refreshes; no dialog appears at any point
- redo is absent on a row that is not `failed`, and `redoNinaImageJob` refuses one anyway
- the original failed row is untouched: same `status`, same `error_code`, same `cost_micro_usd`
- a redo whose stored `replyToId` names a deleted message still delivers, into `ensureNinaSession`'s most recent session — asserted by test
- `/nina/about` renders identically (no `actions` prop → no control slot)
- `npm run lint && npm run typecheck && npm run test` green

### Phase 2 — Soft delete: `nina_turns.deleted_at` and the tidy list

**Satisfies:** R2

**Owns:**
- `lib/db/schema.ts` — `deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' })`, nullable, no default, on `nina_turns`, with the docstring that says what it means for each `kind`
- `drizzle/0008_*.sql` — **generated with `npm run db:generate`, never hand-written and never renamed**
- `lib/nina/imagejobs.ts` — `softDeleteNinaImageJob(userId, jobId)`; and `isNull(ninaTurns.deletedAt)` added to **eight** functions / **nine** `WHERE`s: `listNinaImageJobs`, `getNinaImageJobDetail`, `listOpenNinaImageJobs`, `getNinaImageJob`, `listRevivableNinaImageJobs`, `sweepStaleNinaImageJobs` (SELECT **and** guarded UPDATE), `claimNinaImageJob`, and **`reopenNinaImageJob`** — phase 1's new read, so a redo cannot resurrect a hidden job from a stale tab — and **deliberately not** to `countNinaTurnsSince` (D7)
- `lib/nina/jobActions.ts` — `deleteNinaImageJob({ jobId })`, appended to the module phase 1 created
- `components/nina/NinaJobActions.tsx` — the delete icon button, appended beside phase 1's redo button
- `tests/db.schema.nina.test.ts` — the column exists, is nullable, has no default and adds no index
- `tests/nina.jobActions.test.ts` — the delete refusals, appended to phase 1's file and driven through its fake `db` (no `vi.mock` factory is edited)
- `tests/nina.softDelete.test.ts` — **new**: the SQL-level proofs, on `tests/support/fakeDb.ts` — that all eight reads carry the predicate, that `countNinaTurnsSince` does not, and that the write is a flag and never a `DELETE`. Split out because `installFakeDb()` and `tests/nina.jobActions.test.ts`'s own `vi.mock('@/lib/db', …)` cannot both own `@/lib/db` in one file

**Does not touch:** `lib/nina/jobview.ts` (a deleted job never reaches the view layer, so there is no view rule to add — and phase 2 adds no member to `NinaJobRefusal`), `components/nina/NinaJobList.tsx` (phase 1 already gates the control slot on the `actions` prop alone, which is exactly what "delete on every row" needs), `app/nina/jobs/page.tsx`, `components/nina/NinaAboutScreen.tsx`, `scripts/nina-image-worker.ts`, `lib/nina/imagerun.ts`.

**Exit criteria:**
- tapping delete removes the row from `/nina/jobs` on the next paint; no dialog appears
- `select * from nina_turns where id = <that job>` still returns the row, with `deleted_at` set and `cost_micro_usd` unchanged
- `/nina/jobs/<that id>` 404s
- `/nina`'s in-flight strip, the revival read and the stale sweep all skip the row
- a redo fired at a hidden job from a stale tab is refused as `'not-found'` and opens nothing
- the daily cap still counts it
- `npm run db:generate` produced exactly one new migration file and `npm run db:check` is clean
- `npm run lint && npm run typecheck && npm run test` green

## Reconciliation Log

Two planners wrote in parallel; phase 2 could not see phase 1's plan and wrote its appends against
four stated assumptions (A1–A4). Every one of them has been replaced with phase 1's actual shape,
in the plan file, so **no assumption survives into execution**.

| Conflict | Phases | Resolution |
|---|---|---|
| **Gap — an eighth read nobody filtered.** Phase 1 adds `reopenNinaImageJob`, a new owner-scoped `SELECT` on `nina_turns`, after phase 2's seven-read list was written. A hidden job would stay redoable from a stale tab | 1 → 2 | Added **Step 3k** to phase 2: `isNull(ninaTurns.deletedAt)` in that `WHERE`, with the same one-line-comment convention its other seven edits use. Verified against phase 1's actual `NinaJobRefusal`: the empty read takes the existing `if (row == null) … 'not-found'` branch, so **no new refusal code and no union widening**. Phase 2's arithmetic is now 8 functions / 9 statements throughout; a case was added to `tests/nina.softDelete.test.ts`; phase 1's handoff was marked LANDED |
| **Contract drift — `NinaJobActionResult`.** Phase 2 assumed `{ ok }` (and hedged about a `next` member); phase 1 defines `{ ok: boolean; reason: NinaJobRefusal \| null }` and has no `next` | 1 → 2 | Rewrote `deleteNinaImageJob` to phase 1's exact type: `{ ok: false, reason: 'not-found' }` twice, `{ ok: true, reason: null }` once. The A1 adaptation note about `next` was struck. **Phase 2 invents no union member** — a delete's four causes (not his, never existed, not an image row, already hidden) collapse to `'not-found'`, which `NOTE` already words — so no widening had to move into phase 1, and `lib/nina/jobview.ts` stays untouched by phase 2 |
| **Contract drift — `run()`'s arity and the refusal sentence** | 1 → 2 | Phase 1's `run()` takes ONE argument and the prop is `item`, not `jobId`/`canRedo`. Phase 2's call is now `run(() => deleteNinaImageJob({ jobId: item.id }))` and the two-argument A2 adaptation was deleted. `NOTE` is a `Record<NinaJobRefusal, string>` and `'not-found'` is the only refusal the delete path can produce, so coverage is complete with no new key |
| **Requirement risk — the control-slot gate (R2).** Phase 2 feared phase 1 had written `{actions && item.canRedo && …}`, which would hide the delete button on every non-failed row | 1 → 2 | Read phase 1's code: the slot is `{withActions && <NinaJobActions item={item} />}` and `canRedo` gates the redo `<button>` **inside** `NinaJobActions`. That is already correct, so **phase 1 needed no fix**; phase 2's conditional "Step 6 ungate" was deleted as having nothing to do and `components/nina/NinaJobList.tsx` left phase 2's Files table. Phase 1's Handoffs now record that the gate must stay on the button |
| **Broken test assumption.** Phase 2's Step 10a said to insert a key into phase 1's `vi.mock('@/lib/nina/imagejobs', …)` factory. Phase 1 has no such factory — it mocks only the edges and runs `imagejobs` for real, so R1's session-fallback assertion is reachable in the same file | 1 → 2 | **Step 10a deleted.** Step 10b re-derived: the delete cases append to the end of phase 1's file and drive `dbRows.update` — the real `softDeleteNinaImageJob` against phase 1's fake `db` chain — instead of a spy, which tests the real `flagged.length > 0` branch. No factory, fixture or `beforeEach` default is edited. The one assertion that arrangement cannot make (the authenticated id reaching the `WHERE`) was already covered in `tests/nina.softDelete.test.ts`'s `params` check, and Step 10 now says so |
| **The split of the two test files.** Phase 2's stated reason for `tests/nina.softDelete.test.ts` was the (false) claim above | 2 | The split **stands**, on a corrected and stronger reason: `installFakeDb()` seeds `globalThis.__runInsightsDb` before `lib/db` is imported, while phase 1's file installs `vi.mock('@/lib/db', …)`; two owners of `@/lib/db` in one file is not a thing, and only the recorder can answer "was the predicate in the `WHERE`". Both the Files-table deviation note and the new file's own docstring were rewritten |
| **Duplicate-work check — the seven-name mock factory.** Phase 1's `@/lib/nina/queries` factory must export exactly seven names or the suite fails at link time | 1, 2 | Verified the closure from source: `imagejobs` takes 4, `imagerun` 4, `sessionResolve` 2, union = exactly 7. Phase 2 edits `lib/nina/queries.ts` **docstring only** and adds no export, and its `tests/nina.softDelete.test.ts` imports the real `queries` through `fakeDb` with no factory of its own — so the two files cannot disagree. Recorded in both plans |
| **Unowned consistency gap (reconciler's sweep) — the delete button's accessible name.** Phase 2 wrote `aria-label="Hapus dari daftar"`, identical on every row, against phase 1's stated rule that an icon button's name must name the row | 2 | Changed to an `aria-label` of "Hapus &lt;row title&gt; dari daftar" (a template literal over phase 1's in-scope `const title = ninaJobTitle(item)`), and `aria-busy={pending}` added to match phase 1's redo button attribute for attribute. The rule binds harder here than for redo: delete is on **every** row, so six rows of "Hapus dari daftar" is a list a screen reader cannot navigate |
| **Invariant 5 (reconciler's sweep) — `/nina/about` byte for byte** | 1, 2 | **Verified by reading the code, not the prose.** Today's `<li>` carries no `className`; phase 1's `className={withActions ? cn(…) : undefined}` makes React omit the attribute. Today's `<a>` is `cn('block rounded-card px-3 py-2.5', item.open ? 'bg-card shadow-card' : 'bg-transparent')`; the non-actions branch is `cn('block rounded-card px-3 py-2.5', surface)` — same two arguments, same order. `ninaJobTitle(item)` is `item.scene ?? (item.purpose === 'avatar' ? 'Foto profil' : 'Selfie')`, character for character today's inline expression. `{false && …}` emits nothing. **The invariant holds.** Phase 2 does not open the file at all, so it cannot disturb it |
| **`NinaJobListItem.canRedo` is REQUIRED (reconciler's sweep)** | 1 | Verified there is no third construction site: `grep` over `app/`, `components/`, `lib/`, `tests/` finds `toNinaJobListItems` as the only constructor, called at `app/nina/jobs/page.tsx:62` and `app/nina/about/page.tsx:100`, and no `NinaJobListItem` object literal anywhere. `tsc` covers a future one. No change needed |
| **Build-green at each commit (reconciler's sweep)** | 1, 2 | Phase 1 deletes nothing, renames nothing, and its one new required field is produced by the only constructor — the tree compiles and the suite is green at its own commit. Phase 2 is additive: a nullable column, one new writer, predicates on existing `WHERE`s, appends to two files. Its migration is **generated, not applied** — `npm run db:migrate` is explicitly forbidden in its Verification and named as the operator's post-merge step, which the reconciler confirmed is stated in both Step 2 and Verification |
| **`Satisfies` lines and requirement ids** | 1, 2 | No creep found: every step in phase 1 serves R1, every step in phase 2 serves R2 — including the new Step 3k, which is the flag's semantics (R2) applied to a function R1 introduced. No `R` moved, so neither `Satisfies` line changed and the Requirements table is unchanged |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Redo = reset the failed row in place, vs. open a new job row from its `args` | **Open a NEW row.** The failed row keeps its `status`, its `error_code` and its recorded spend | 1: invariant 2 — `lib/nina/imagejobs.ts` says the ledger accumulates and never erases; resetting a terminal row deletes a billed attempt from the audit trail |
| Redo re-rolls the seed, vs. copies `args` verbatim | **Verbatim** — same prompt, same seed, `attempts: 0` | 6: `requeueNinaImageJob`'s stated rule, *"the same prompt and the same seed — which is why a retry produces the same photograph rather than a different one"* |
| Redo offered on every row, vs. on failed rows only | **Failed rows only.** An open row is already being retried by `reviveNinaImageJobs`; redoing a done row is a re-roll nobody asked for and costs $0.04 of a 6/day cap | 5: the user's raw input, *"clicking this will redo the **failed** job"* |
| Delete offered on failed rows only, vs. every row | **Every row.** "so i can keep the job list tidy and pristine" is about the whole list | 5: the user's raw input, *"clicking this will delete the item"* |
| A confirmation step, on `SessionRow`'s R11 precedent | **None, on either control.** Both are recoverable — a redo costs one generation of a daily cap, a soft delete is one nullable column away from being undone in SQL — which is exactly why the precedent does not transfer | 5: the user's raw input, *"we dont need confirmation message to execute them"* |
| Controls on `NinaJobList` unconditionally, vs. opt-in per surface | **Opt-in** — a new prop, absent by default, set only by `app/nina/jobs/page.tsx` | 6: the user named "Proses foto page"; `NinaJobList`'s own header says the component must render unchanged on both surfaces, and `/nina/about`'s Media section is a summary, not a console |
| Soft delete refunds the daily image quota, vs. does not | **Does not.** `countNinaTurnsSince` keeps counting a deleted job | 4: the Why section — the cap is a money cap (`lib/nina/selfiegen.ts`: *"a money cap and not a feature cap"*), and hiding a row does not un-spend it |
| Soft-deleting a `pending` job cancels the generation, vs. lets it finish | **Lets it finish.** The photograph may still land in the chat; the JOB row is what was hidden | 1: invariant 2 — the money is already committed, and a cancel path would have to race `claimNinaImageJob`. The sweep and the revival skip the row, so nothing *new* starts |
| Redo ignores the daily cap (it is a retry), vs. respects it | **Respects it.** `ninaImageQuotaLeft` is checked before the row is opened, exactly as `generateNinaSelfie` does | 6: `generateNinaSelfie`'s stated order — the cap is checked *"before the row is opened and therefore before a cent is spent"* |
| Where the redo runs | **`after()` on the `/nina/jobs` segment**, which therefore must export `maxDuration = 300` | 6: `lib/nina/imagerun.ts`'s header — *"`after()` inherits the `maxDuration` of the route segment it was registered from … A third caller would need the same line"* |
| Which module the actions live in | **A new `lib/nina/jobActions.ts`**, not `lib/nina/actions.ts` | 6: `lib/nina/sessionActions.ts`'s and `lib/nina/albumActions.ts`'s stated isolation argument |

## Open Questions

_(none — every fork was decided from the ladder before reconciliation, and reconciliation opened
no new one: every conflict above was settled by reading phase 1's code and plan rather than by
choosing between two intended behaviours.)_

## Rollback

- **Phase 1** is code-only: `git revert` the phase commit. No schema, no data. An already-fired redo simply completes and delivers a photograph, which is harmless.
- **Phase 2** is code plus one additive, nullable column. Reverting the code restores the unfiltered reads and every soft-deleted job reappears in the list — no data is lost, because that is the entire point of the design. The column may be left in place; dropping it is `alter table nina_turns drop column deleted_at`, and only after the code revert has shipped.
- **The whole set:** `git revert` both commits, then optionally drop the column. Nothing in `nina_messages`, `nina_message_images`, `nina_avatars` or Blob was touched by either phase.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md
