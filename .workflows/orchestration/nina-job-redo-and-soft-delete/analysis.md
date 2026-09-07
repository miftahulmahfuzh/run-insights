# Code Analysis: `/nina/jobs` — per-row redo and soft delete

**Type:** Feature Implementation
**Date:** 2026-09-07 07:29:51 +07
**Session ID:** 20260907-072951-JB2R
**Plan:** `NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md` (2 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-job-redo-and-soft-delete` — branch `feature/nina-job-redo-and-soft-delete`, base `origin/main` @ `3902c58`

---

## User Input

### Original User Request

> di Proses foto page, we have successfully list all jobs. improve it:
> for each item, add two buttons directly there. we dont need confirmation message to execute them:
> 1. redo job icon. clicking this will redo the failed job. if the chat is no longer there, we will keep executing the reload, nina can just mention the new photograph in the most recent chat session
> 2. delete job icon . clicking this will delete the item (but just soft delete in neon db). so i can keep the job list tidy and pristine

### User-Provided Context

None beyond the prose. "Proses foto page" is `app/nina/jobs/page.tsx` — `<ScreenHeader title="Proses foto" />` at line 60 is the only occurrence of that string in the app.

### User-Provided Files

None marked with `@`.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | A **redo** icon button on each item of `/nina/jobs`, firing immediately with no confirmation, that re-runs the failed job. If the chat message that triggered it is gone, the generation still runs and the resulting photograph lands in the most recent chat session. |
| R2 | A **delete** icon button on each item, firing immediately with no confirmation, that soft-deletes the row in Neon so the list stays tidy. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

`/nina/jobs` is today read-only: `NinaJobList` renders each job as a single `<Link>` to `/nina/jobs/[id]` and nothing on the screen can change a row. Two things the runner cannot do from it: re-run a generation that failed, and get a dead row out of his way. Both are per-row, both are one tap, and neither may show a confirmation.

**Success Criteria**

- R1: tapping the redo control on a failed row starts a new generation from that job's stored `args` and returns without waiting for it. The photograph arrives in the chat the way any selfie does. When the triggering message or its whole session has been deleted, the photograph still arrives — in the runner's most recent session.
- R2: tapping the delete control removes the row from `/nina/jobs` immediately and permanently *for the list*, while the row itself survives in `nina_turns` (money ledger + audit trail intact) carrying a deletion timestamp.
- Neither control opens a dialog, a sheet, or a second tap.
- `/nina/about`'s Media section, which renders the **same** `NinaJobList` component, is unchanged.

**Key Considerations**

- **`nina_turns` is the money ledger.** `lib/nina/imagejobs.ts` states invariant 9 in three places — "money is never spent silently", `costMicroUsd` accumulates with `coalesce(...) + spend` on every writer. A redo that reset the failed row in place would erase a recorded, billed attempt; a hard delete would erase it outright. Both features must therefore be additive to the ledger, not destructive of it.
- **`NinaJobList` has two callers.** `app/nina/jobs/page.tsx` and `components/nina/NinaAboutScreen.tsx` (line 317). Adding unconditional controls would put them on the About page's Media section, which the user did not ask for.
- **Redo's "chat is gone" case is already solved on the write path.** `finishSelfie` (`lib/nina/imagerun.ts:167`) resolves the landing session as `quoted?.sessionId ?? await resolveNinaWriteSession(userId)`, and `resolveNinaWriteSession` → `ensureNinaSession` returns the most recently active session, creating one if there is none. So R1's second sentence needs a *test*, not new code.
- **The daily cap is a money cap.** `ninaImageQuotaLeft` counts every `kind='image'` turn since Jakarta midnight against `NINA_IMAGE_DAILY_CAP`. A redo spends money and must be counted; a soft-deleted job spent money and must stay counted.
- **There is no soft-delete precedent in this repo.** `grep -rn "deleted_at\|deletedAt" --include=*.ts` over the tree returns **zero** hits. `removeNinaChatSession` is explicitly a hard delete and argues for it. So R2 introduces the pattern, and every reader of `nina_turns` has to be classified as "respects the flag" or "ignores it".

---

## Analysis Scope

### Explicitly Mentioned Files

None.

### Discovered Related Files

| File | Why it is here |
|---|---|
| `app/nina/jobs/page.tsx` | the "Proses foto" screen itself |
| `components/nina/NinaJobList.tsx` | the row markup; the controls go here |
| `components/nina/NinaAboutScreen.tsx:317` | the **second** caller of `NinaJobList` |
| `app/nina/about/page.tsx:62,100` | feeds that second caller from the same `listNinaImageJobs` |
| `lib/nina/jobview.ts` | `NinaJobListItem`, `jobStage`, `jobIsOpen`, the labels |
| `lib/nina/imagejobs.ts` | every read and write of a job row (`server-only`) |
| `lib/nina/imagerun.ts` | `fireNinaImageGeneration`, `runNinaImageJob`, `finishSelfie`, `reviveNinaImageJobs` |
| `lib/nina/selfiegen.ts` | the shape of "open a job then fire it" |
| `lib/nina/sessionResolve.ts` | `resolveNinaWriteSession` — R1's fallback, already written |
| `lib/nina/imagerecipe.ts` | `NinaImageJobArgs`, `NINA_IMAGE_MAX_ATTEMPTS`, `NINA_IMAGE_DAILY_CAP` |
| `lib/nina/queries.ts` | `insertNinaTurn`, `countNinaTurnsSince` |
| `lib/db/schema.ts:579` | the `nina_turns` table |
| `lib/nina/sessionActions.ts` | the `'use server'` module shape this repo uses |
| `components/nina/SessionRow.tsx` | the per-row-control precedent (and the confirmation the user is overriding) |
| `app/nina/jobs/[id]/page.tsx` | the detail route, which must 404 a soft-deleted job |
| `drizzle/0007_graceful_mercury.sql` | the migration watermark R2 has to sit above |

---

## Current Dataflow

### Entry Point: `GET /nina/jobs`

**Location:** `app/nina/jobs/page.tsx:36`
**Trigger:** navigation from `NinaSidebar.tsx:395` (`NINA_JOBS_HREF`)
**Input:** none — session only, via `requireUserId()`
**Validation:** `requireUserId` throws/redirects for a signed-out visitor
**Next step:** `listNinaImageJobs(userId)` → `toNinaJobListItems(...)` → `<NinaJobList>`

Deliberately **does not** sweep: the page's own header says a tracking screen must not change what it is describing.

### Processing chain

1. **`listNinaImageJobs(userId, {limit})`** — `lib/nina/imagejobs.ts:785`
   - one indexed read on `nina_turns_user_created_idx`, `kind='image'` as a heap filter, `ORDER BY created_at DESC`, `LIMIT NINA_JOB_LIST_LIMIT` (60)
   - projects `JOB_COLUMNS` (`id, status, error_code, model, created_at, latency_ms, cost_micro_usd, args`) through `toJobRecord`, which tolerates `args = null` on every field
   - **no `WHERE` on deletion** — there is no such column today

2. **`toNinaJobListItems(rows)`** — `lib/nina/jobview.ts:213`
   - `jobStage({status, errorCode})` → `queued | dispatched | running | done | failed`
   - `jobIsOpen(stage)` → true for the first three
   - `createdAt: Date` → `createdAtMs: number` (the client boundary)
   - `errorLabel` only on `failed`

3. **`<NinaJobList items nowMs emptyText>`** — `components/nina/NinaJobList.tsx`
   - `'use client'`, every prop serialisable
   - each item is **one `<Link href={item.href}>`** wrapping the whole row: title line, elapsed/latency, stage · purpose · attempts, error sentence
   - never re-sorts

### Data persistence

**Database:** `nina_turns` (Neon Postgres, via drizzle). Columns that matter here:

| Column | Meaning on a `kind='image'` row |
|---|---|
| `status` | `pending` while the job lives; `ok`/`repaired` on success; `failed` when terminal |
| `error_code` | **dual meaning** — the job PHASE (`queued`/`dispatched`/`running`) while `status='pending'`, the FAILURE REASON (`timeout`/`policy`/`transport`/`stale`) when `status='failed'` |
| `args` (jsonb) | `NinaImageJobArgs`: `{purpose, scene, mood, prompt, seed, replyToId, source, attempts, sidecar}` — nullable; three production rows predate it |
| `cost_micro_usd` | per-JOB cumulative spend across attempts |
| `latency_ms`, `model`, `tool_calls`, `created_at` | audit |

**Index:** `nina_turns_user_created_idx` on `(user_id, created_at DESC)`.

### Every reader/writer of a `kind='image'` row today

| Function | File | Reads or writes | Would a soft-delete flag apply? |
|---|---|---|---|
| `ninaImageQuotaLeft` → `countNinaTurnsSince` | `imagejobs.ts:87`, `queries.ts:2102` | read (count) | **NO** — the money was spent |
| `openNinaImageJob` | `imagejobs.ts:101` | write (insert) | n/a |
| `claimNinaImageJob` | `imagejobs.ts:161` | write (conditional update) | **YES** |
| `completeNinaImageJob` | `imagejobs.ts:238` | write | no filter needed (id-scoped, job already claimed) |
| `requeueNinaImageJob` | `imagejobs.ts:272` | write | idem |
| `listRevivableNinaImageJobs` | `imagejobs.ts:308` | read | **YES** — do not revive a deleted job |
| `failNinaImageJob` | `imagejobs.ts:359` | write | idem |
| `sweepStaleNinaImageJobs` | `imagejobs.ts:515` | read + write + apology | **YES** — do not apologise for a deleted job |
| `listOpenNinaImageJobs` | `imagejobs.ts:583` | read (`/nina` in-flight strip) | **YES** |
| `getNinaImageJob` | `imagejobs.ts:607` | read (poll) | **YES** |
| `listNinaImageJobs` | `imagejobs.ts:785` | read (both list screens) | **YES** |
| `getNinaImageJobDetail` | `imagejobs.ts:819` | read (`/nina/jobs/[id]`) | **YES** — 404 |

### Exit points

- the rendered list; `/nina/jobs/[id]` for one row
- side effects on the write path only: Vercel Blob `put`, `nina_messages` + `nina_message_images` inserts, `nina_avatars` insert

---

## Key Data Structures

### `NinaImageJobArgs` — `lib/nina/imagerecipe.ts`
`{ purpose, scene, mood, prompt, seed, replyToId, source, attempts, sidecar }`, stored verbatim in `nina_turns.args`. **This is what makes a redo possible at all** — the column's docstring says so in as many words: *"a job whose args were only ever in the dispatch payload is a job that can never be retried."*

### `NinaImageJobRecord` / `NinaImageJobDetail` — `lib/nina/imagejobs.ts:690,720`
The list/detail projection. Every `args`-derived field is nullable by design.

### `NinaJobListItem` — `lib/nina/jobview.ts:195`
`{ id, href, stage, stageLabel, purpose, scene, attempts, createdAtMs, errorLabel, latencyMs, open }`. The client contract. Two surfaces render it.

### `NinaSessionActionResult` — `lib/nina/sessionActions.ts`
`{ ok: boolean; next: string | null }`. The repo's action-result shape: **the server carries no error prose**; the calling component supplies the sentence.

---

## Dependencies

**Configuration:** `NINA_IMAGE_DAILY_CAP`, `NINA_IMAGE_MAX_ATTEMPTS`, `NINA_IMAGE_RUN_BUDGET_MS`, `NINA_IMAGE_CALL_TIMEOUT_MS` (all `lib/nina/imagerecipe.ts`).
**Environment:** `BLOB_READ_WRITE_TOKEN` via `blobEnv()`; `DATABASE_URL` via `lib/db`.
**External services:** the image provider through `lib/nina/imagecall.ts`; Vercel Blob.
**Platform:** `after()` + Fluid compute; `maxDuration = 300` must be exported by **any route segment that can start a generation**. Today that is `app/nina/page.tsx` and `app/api/cron/nina/route.ts`. **A redo action invoked from `/nina/jobs` makes that segment a third one** — `lib/nina/imagerun.ts`'s header states the rule: *"A third caller would need the same line."*
**CI guards:** `scripts/check-llm-payload-boundary.mjs` (no model call from an unlisted module), `scripts/check-data-layer-invariants.mjs` (every `lib/db/queries.ts` export takes `userId` first), `scripts/check-client-secret-boundary.mjs`.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `ScreenHeader title="Proses foto"` | `app/nina/jobs/page.tsx:60` | def | `app` |
| `NinaJobList` | `components/nina/NinaJobList.tsx:39` | def | `components/nina` |
| `NinaJobList` | `app/nina/jobs/page.tsx:61` | call | `app` |
| `NinaJobList` | `components/nina/NinaAboutScreen.tsx:317` | call | `components/nina` |
| `NinaJobListItem` | `lib/nina/jobview.ts:195` | def | `lib/nina` |
| `toNinaJobListItems` | `lib/nina/jobview.ts:213` | def | `lib/nina` |
| `toNinaJobListItems` | `app/nina/jobs/page.tsx:62`, `app/nina/about/page.tsx:100` | call | `app` |
| `toNinaJobListItems` | `tests/nina.jobview.test.ts:118-152` | test | `tests` |
| `jobStage` / `jobIsOpen` | `lib/nina/jobview.ts:151,163` | def | `lib/nina` |
| `listNinaImageJobs` | `lib/nina/imagejobs.ts:785` | def | `lib/nina` |
| `listNinaImageJobs` | `app/nina/jobs/page.tsx:38`, `app/nina/about/page.tsx:62` | call | `app` |
| `getNinaImageJobDetail` | `lib/nina/imagejobs.ts:819` | def | `lib/nina` |
| `getNinaImageJobDetail` | `app/nina/jobs/[id]/page.tsx:57` | call | `app` |
| `listOpenNinaImageJobs` | `lib/nina/imagejobs.ts:583` | def | `lib/nina` |
| `getNinaImageJob` | `lib/nina/imagejobs.ts:607` | def | `lib/nina` |
| `listRevivableNinaImageJobs` | `lib/nina/imagejobs.ts:308` | def | `lib/nina` |
| `sweepStaleNinaImageJobs` | `lib/nina/imagejobs.ts:515` | def | `lib/nina` |
| `claimNinaImageJob` | `lib/nina/imagejobs.ts:161` | def | `lib/nina` |
| `openNinaImageJob` | `lib/nina/imagejobs.ts:101` | def | `lib/nina` |
| `fireNinaImageGeneration` | `lib/nina/imagerun.ts:441` | def | `lib/nina` |
| `finishSelfie` (session fallback) | `lib/nina/imagerun.ts:167-180` | def | `lib/nina` |
| `resolveNinaWriteSession` | `lib/nina/sessionResolve.ts` | def | `lib/nina` |
| `generateNinaSelfie` | `lib/nina/selfiegen.ts` | def | `lib/nina` |
| `ninaTurns` table | `lib/db/schema.ts:579-670` | def | `lib/db` |
| `countNinaTurnsSince` | `lib/nina/queries.ts:2102` | def | `lib/nina` |
| `NinaSessionActionResult` | `lib/nina/sessionActions.ts` | def (pattern) | `lib/nina` |
| `SessionRow` per-row controls | `components/nina/SessionRow.tsx` | precedent | `components/nina` |
| latest migration | `drizzle/0007_graceful_mercury.sql` | config | `drizzle` |
| `maxDuration = 300` | `app/nina/page.tsx`, `app/api/cron/nina/route.ts` | config | `app` |

---

## Impact Points (files that WILL need changes)

1. `components/nina/NinaJobList.tsx` — the row gains a control slot beside the `<Link>`. A `<button>` may not nest inside an `<a>` (`SessionRow`'s recorded rule), so the controls are **siblings** of the link in a flex line. Owned by phase 1; extended by phase 2.
2. `components/nina/NinaJobActions.tsx` — **new**, `'use client'`. Both icon buttons, the pending flag, the failure sentence. Created by phase 1, extended by phase 2.
3. `lib/nina/jobActions.ts` — **new**, `'use server'`. `redoNinaImageJob` (phase 1), `softDeleteNinaImageJobAction` (phase 2).
4. `lib/nina/imagejobs.ts` — `reopenNinaImageJob` (phase 1); `softDeleteNinaImageJob` + `isNull(deletedAt)` on six reads (phase 2).
5. `lib/nina/jobview.ts` — `NinaJobListItem` gains `canRedo` (phase 1); the pure rule `jobCanRedo(stage)`. Phase 2 needs nothing here.
6. `app/nina/jobs/page.tsx` — passes `actions` to `NinaJobList`; **exports `maxDuration = 300`** (phase 1).
7. `components/nina/NinaAboutScreen.tsx` — passes nothing new; the default keeps its Media section read-only. Verified, not edited, by both phases.
8. `lib/db/schema.ts` — `nina_turns.deleted_at` (phase 2).
9. `drizzle/0008_*.sql` — generated, never hand-named (phase 2).
10. `app/nina/jobs/[id]/page.tsx` — 404s a soft-deleted job for free once `getNinaImageJobDetail` filters (phase 2, verify only).
11. `tests/nina.jobview.test.ts` — extended (phase 1).
12. `tests/nina.jobActions.test.ts`, `tests/db.schema.nina.test.ts` — new/extended (phases 1 and 2).

**This document describes. The plan files prescribe.**
