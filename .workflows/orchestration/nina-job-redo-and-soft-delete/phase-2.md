# Phase 2: Soft delete: `nina_turns.deleted_at` and the tidy list

**Plan set:** `NINA_JOB_REDO_AND_SOFT_DELETE_PLAN.md`
**Analysis:** `20260907-072951-JB2R_code_analyzer.md`
**Satisfies:** R2 — a delete icon on every row of `/nina/jobs`, one tap, no confirmation, that hides the job while the row itself survives in Neon
**Depends on:** Phase 1
**Difficulty:** NORMAL
**Package:** `lib/db` + `lib/nina` + `components/nina`

---

## Goal

After this phase `nina_turns` carries a nullable `deleted_at`, and tapping the trash icon on a
`/nina/jobs` row writes it. The row leaves every screen and every scheduler that would restart it,
while the row itself — its `status`, its `error_code`, its `cost_micro_usd` — is byte-for-byte
unchanged in the database, and the daily image cap keeps counting it. No `DELETE` statement is
added anywhere; undoing one is `update nina_turns set deleted_at = null where id = '…'`.

---

## Phase 1's shapes — RECONCILED, and no longer assumptions

This section was written as four assumptions (A1–A4) because Phase 1's plan could not be seen when
it was drafted. **The reconciler has read Phase 1's plan and replaced them with what Phase 1
actually writes.** Every identifier below is quoted from Phase 1's own steps; nothing here is a
guess, and **there is no adaptation left for the executor to perform.** If the code on the branch
disagrees with this section, the branch is wrong.

### F1 — `lib/nina/jobActions.ts` after Phase 1

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

import { reopenNinaImageJob } from './imagejobs'
import { fireNinaImageGeneration } from './imagerun'
import { NINA_JOBS_HREF, type NinaJobRefusal } from './jobview'

export interface NinaJobActionResult {
  ok: boolean
  /** Why not, as a discriminant. `null` on success. */
  reason: NinaJobRefusal | null
}

export async function redoNinaImageJob(input: { jobId: string }): Promise<NinaJobActionResult> {
  /* Phase 1's body. Not restated, not edited, not moved. */
}
```

**There is no `next` field.** Phase 1 states why in as many words — the control does not navigate,
the runner stays on the list. So the earlier note about "`next` is always `null` for a delete" is
struck: there is no such member to fill. Every `return` in Step 5 below carries `{ ok, reason }`.

### F2 — `NinaJobRefusal`, and why a delete needs no new member

`lib/nina/jobview.ts` (Phase 1) declares:

```ts
export type NinaJobRefusal = 'not-found' | 'not-failed' | 'no-args' | 'capped'
```

**A delete can only ever refuse with `'not-found'`**, and that is verified rather than assumed:
`softDeleteNinaImageJob` returns a bare boolean, and its four causes — not his, never existed, not
an image row, already hidden — are one answer by design (Step 3j). So this phase **widens nothing**
in `jobview.ts`, which is Phase 1's file, and `NOTE['not-found']` ("Job ini sudah nggak ada.")
already covers every sentence the delete path can produce.

### F3 — `components/nina/NinaJobActions.tsx` after Phase 1

```tsx
export function NinaJobActions({ item }: { item: NinaJobListItem }) {
  const [note, setNote] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  /** ONE argument. There is no `onOk` and none is needed. */
  function run(action: () => Promise<NinaJobActionResult>) { /* … */ }

  const title = ninaJobTitle(item)

  return (
    <>
      <span className="flex shrink-0 items-center gap-0.5">
        {item.canRedo && (
          <button type="button" aria-label={`Coba lagi ${title}`} /* … */>
            <RedoIcon />
          </button>
        )}
        {/* ← PHASE 2 APPENDS ITS BUTTON HERE, as the last child of this cluster */}
      </span>

      {note !== null && <span role="status" className="w-full …">{note}</span>}
    </>
  )
}
```

The three facts Step 7 depends on, all confirmed:

- **`run()` takes ONE argument.** `run(() => deleteNinaImageJob({ jobId: item.id }))`. No `onOk`.
- **The prop is `item`, not `jobId`/`canRedo`.** The job id is `item.id`.
- **The pending flag is `pending` and the refusal state is `note`.** Step 7 reads `pending`; it
  sets neither.
- **`ninaJobTitle(item)` is already in scope as `title`**, and Phase 1's stated rule is that an icon
  button's accessible name must name the ROW ("six rows of 'Coba lagi' is a list a screen reader
  cannot navigate"). The delete button is on EVERY row, so that rule binds it harder than it binds
  the redo. Step 7's `aria-label` is `Hapus ${title} dari daftar`.

### F4 — the control slot is ALREADY ungated, so the old Step 6 is deleted

Phase 1 writes the slot in `components/nina/NinaJobList.tsx` as:

```tsx
{withActions && <NinaJobActions item={item} />}
```

with `const withActions = actions === true`, and puts the `canRedo` test **inside**
`NinaJobActions`, on the redo `<button>` alone. That is exactly what R2 needs: the slot renders on
every row, the redo glyph on failed rows only. **`components/nina/NinaJobList.tsx` is therefore not
this phase's file at all** — the old conditional "Step 6" had nothing to do and has been removed.

### F5 — what Phase 1 does not touch

Confirmed against Phase 1's plan: it edits neither `lib/db/schema.ts`, `drizzle/`,
`lib/nina/queries.ts`, nor `tests/db.schema.nina.test.ts`, and it generates no migration.

### F6 — `tests/nina.jobActions.test.ts` does NOT mock `@/lib/nina/imagejobs`

This is the assumption that was furthest from the truth, and Step 10 has been re-derived from the
real file. Phase 1 mocks **only the edges** — `@/lib/db`, `@/lib/nina/queries`,
`@/lib/nina/imagecall`, `@vercel/blob`, `next/server`, `next/cache`,
`@/lib/auth/requireUserId` — and runs `imagejobs`, `imagerun`, `sessionResolve` and `jobview` for
real, deliberately, because mocking `imagejobs` would make R1's session-fallback assertion
impossible in the same file.

Two consequences, both already applied below:

1. **There is no `vi.mock('@/lib/nina/imagejobs', …)` factory to insert a key into.** The old Step
   10a is deleted. Phase 1's `@/lib/nina/queries` factory must export **exactly seven** names or the
   suite fails at link time (`countNinaTurnsSince`, `getNinaMessagesByIds`, `insertNinaMessages`,
   `insertNinaTurn`, `insertNinaAvatarAsCurrent`, `insertNinaMessageImages`, `ensureNinaSession`);
   **this phase adds no export to `lib/nina/queries.ts` and must not disturb that count.**
2. **The delete cases drive Phase 1's fake `db` instead of a spy.** `deleteNinaImageJob` reaches the
   real `softDeleteNinaImageJob`, whose `.returning()` resolves to Phase 1's `dbRows.update`. So
   `dbRows.update = [{ id: … }]` is a successful flag and `dbRows.update = []` is a refusal. Phase
   1's bindings — `actions`, `requireUserId`, `revalidatePath`, `dbRows`, `deferred`,
   `insertNinaTurn`, `FAILED_JOB` — are all this phase needs, and it declares no new fixture.

## Interface Contract

**Deletes:** _(nothing — this phase is the one that must not delete)_

**Renames:** _(none)_

**Creates:**
- `schema.ninaTurns.deletedAt` -> column `nina_turns.deleted_at`, `timestamptz` NULL, no default (`lib/db/schema.ts`)
- `drizzle/0008_<generated>.sql` + `drizzle/meta/0008_snapshot.json` + one `drizzle/meta/_journal.json` entry (**generated by `npm run db:generate`; never hand-written, never renamed**)
- `imagejobs.softDeleteNinaImageJob(userId, jobId): Promise<boolean>` (`lib/nina/imagejobs.ts`)
- `jobActions.deleteNinaImageJob({ jobId }): Promise<NinaJobActionResult>` — Phase 1's exact `{ ok, reason }` type; the only `reason` it can ever return is `'not-found'` (`lib/nina/jobActions.ts`, appended)
- `NinaJobActions`' delete `<button>` + a local `TrashIcon()` (`components/nina/NinaJobActions.tsx`, appended)
- `tests/nina.softDelete.test.ts` (**new file — see the Deviation note under Files**)

**Signature changes:** _(none — every one of the **eight** reads keeps its exact signature; only its `WHERE` grows a predicate)_

**Widens nothing of Phase 1's:** `NinaJobRefusal` gains no member, `NinaJobActionResult` gains no field, `NinaJobList` gains no prop, `run()` keeps its one argument.

**Behaviour changes to existing exports (same signatures):**
- `imagejobs.listNinaImageJobs` — now excludes flagged rows
- `imagejobs.getNinaImageJobDetail` — now returns `null` for a flagged row (`/nina/jobs/[id]` 404s)
- `imagejobs.listOpenNinaImageJobs` — now excludes flagged rows
- `imagejobs.getNinaImageJob` — now returns `null` for a flagged row
- `imagejobs.listRevivableNinaImageJobs` — now excludes flagged rows
- `imagejobs.sweepStaleNinaImageJobs` — now skips flagged rows (SELECT **and** the guarded UPDATE)
- `imagejobs.claimNinaImageJob` — now refuses a flagged row
- `imagejobs.reopenNinaImageJob` (**Phase 1's**, the SEVENTH read on `nina_turns` and the one this phase's original scope missed) — now refuses a flagged row as `'not-found'`, so a redo fired from a stale tab cannot resurrect a job he hid. No new refusal code and no change to `NinaJobRefusal`: the owner-scoped SELECT simply comes back empty
- `queries.countNinaTurnsSince` — **DELIBERATELY UNCHANGED**; gains only a docstring paragraph

**Requires (from earlier phases) — all VERIFIED against Phase 1's plan, none assumed:**
- `lib/nina/jobActions.ts` exists and exports `interface NinaJobActionResult { ok: boolean; reason: NinaJobRefusal | null }` (Phase 1) — see **F1**
- `components/nina/NinaJobActions.tsx` exists, is `'use client'`, takes `{ item }`, and owns a ONE-argument `run()`, a `pending` flag, a `note` state and `const title = ninaJobTitle(item)` (Phase 1) — see **F3**
- `NinaJobList`'s control slot is gated on the `actions` prop ALONE; `canRedo` gates the redo `<button>` inside `NinaJobActions` (Phase 1) — see **F4**. Nothing to fix; the old Step 6 is deleted
- `lib/nina/imagejobs.ts` exports `reopenNinaImageJob(userId, jobId)` whose owner-scoped SELECT is this phase's eighth `WHERE` (Phase 1) — see Step 3k
- `tests/nina.jobActions.test.ts` mocks only the EDGES and runs `imagejobs` for real (Phase 1) — see **F6**, and Step 10
- `NINA_JOBS_HREF` is already exported from `lib/nina/jobview.ts` (shipped, `jobview.ts:33`)

**Leaves alone (owned by others):**
- `lib/nina/jobview.ts` — Phase 1's. A hidden job never reaches the view layer, so there is no view rule to add.
- `components/nina/NinaAboutScreen.tsx`, `app/nina/about/page.tsx` — nobody's this set. Invariant 5.
- `app/nina/jobs/page.tsx` — Phase 1 already wired the `actions` prop and `maxDuration = 300`.
- `components/nina/NinaJobList.tsx` — **Phase 1's, and not edited by this phase.** Its slot is already ungated (F4). This phase assumes that state and adds nothing to the file.
- `lib/nina/imagerun.ts`, `lib/nina/selfiegen.ts`, `lib/nina/avatargen.ts` — untouched.
- `scripts/nina-image-worker.ts` — deliberately not taught about the column (see *Handoffs*).
- `lib/nina/chatturn.ts` — reads `kind='chat'` turns only. There is no chat-turn list to tidy, and this column never applies to one.
- `imagejobs.completeNinaImageJob` / `requeueNinaImageJob` / `failNinaImageJob` — id-scoped writers that only ever run on a job already claimed. They keep working on a hidden row on purpose; that is D8.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/schema.ts` | modify | `deletedAt` column on `ninaTurns`, between `args` and `createdAt` (~line 663), with its docstring |
| `drizzle/0008_<generated>.sql` | **generate** | `npm run db:generate`. One `ALTER TABLE … ADD COLUMN`. Never hand-written, never renamed |
| `drizzle/meta/0008_snapshot.json` | generate | written by the same command |
| `drizzle/meta/_journal.json` | generate | one appended entry, `idx: 8`, by the same command |
| `lib/nina/imagejobs.ts` | modify | `isNull` import (l.3); `isNull(ninaTurns.deletedAt)` in **8** functions (**9** `WHERE`s — the eighth is Phase 1's `reopenNinaImageJob`, Step 3k); new `softDeleteNinaImageJob` |
| `lib/nina/queries.ts` | modify | **docstring only** on `countNinaTurnsSince` (l.2098-2102). No code change |
| `lib/nina/jobActions.ts` | append | `deleteNinaImageJob` + one import |
| `components/nina/NinaJobActions.tsx` | append | delete `<button>` + `TrashIcon()` + one import name |
| `tests/db.schema.nina.test.ts` | append | one `describe` block: the column exists, is nullable, has no default, adds no index |
| `tests/nina.jobActions.test.ts` | append | the delete refusals, driven through Phase 1's fake `db`. **No edit to any `vi.mock` factory** — see F6 |
| `tests/nina.softDelete.test.ts` | **create** | the SQL-level proofs: **eight** reads filter, the cap does not, the write is a flag |

**Eight files edited by hand, plus three written by `db:generate`.**

### Deviation from the plan index, recorded rather than discovered later

The index gave `tests/nina.jobActions.test.ts` both the action refusals **and** *"that a
soft-deleted row is invisible to every list read and still counted by the cap"*. **Those two still
cannot live in one file — but not for the reason first written here.** The original argument was
that Phase 1's file mocks `@/lib/nina/imagejobs`; it does not (F6). The real and stronger reason is
that Phase 1's file installs its own `vi.mock('@/lib/db', …)` — a hand-rolled thenable that returns
rows and records no SQL — while `installFakeDb()` works the other way round, seeding
`globalThis.__runInsightsDb` **before** `lib/db` is first imported. Two owners of `@/lib/db` in one
file is not a thing, and only the second of them can answer "was the predicate in the `WHERE`".

So the split stands: Phase 1's file asserts the ACTION's branching (it can, because the real
`imagejobs` runs against its fake chain), and `tests/nina.softDelete.test.ts` asserts the SQL.
`tests/db.ownership.test.ts` and `tests/nina.sessionPurge.test.ts` are the precedent for the shape.

---

## Implementation Steps

### Step 1: The column, and the argument for it

**File:** `lib/db/schema.ts` — inside the `ninaTurns` `pgTable(...)` column object, immediately
after the `args: jsonb('args'),` line (currently `:662`) and immediately before
`createdAt: timestamp('created_at', …)` (currently `:663`).

**Change:** add one nullable `timestamptz`, with the docstring that says what it means and — the
part that matters six months from now — what it does **not** mean. `createdAt` stays last: this is
a job-lifecycle field and it groups with `args`, not after the row's own birthday.

**Code** (insert exactly this between the two existing lines):

```ts
    /**
     * **The runner hid this job row from `/nina/jobs`. That is the whole feature (R2).**
     *
     * NULL means "not hidden". A timestamp means "hidden, then". Nullable, no default, and **no
     * backfill script** — every row written before this column reads NULL and is therefore
     * visible, which is `tuning_revision`'s idiom and the `*_enabled` columns' idiom one table
     * over: the migration IS the backfill, because the absent value already spells the right
     * answer.
     *
     * The runner's words were *"delete job icon … (but just soft delete in neon db). so i can
     * keep the job list tidy and pristine"*, and the parenthesis is a specification. This table
     * is the money ledger AND the audit trail (see the header), so a `DELETE` here would erase a
     * billed generation from the record in order to tidy a list.
     *
     * ── FOUR THINGS IT IS NOT, EACH OF WHICH SOMEBODY WILL OTHERWISE RE-OPEN ──────────────────
     *
     *   1. **NOT A REFUND.** `countNinaTurnsSince` — the daily image cap — does NOT filter on
     *      this column, deliberately and permanently. `lib/nina/selfiegen.ts` calls that cap *"a
     *      money cap and not a feature cap"*, and $0.04 that has been spent is still spent after
     *      the row is hidden. Six generations a day is six generations a day whether or not he
     *      tidied the list afterwards. A version of this column that refunded the quota would be
     *      an unmetered image budget with one extra tap in front of it.
     *
     *   2. **NOT A CANCEL.** Hiding a `status = 'pending'` job does not stop the invocation that
     *      is already drawing it. That generation finishes, `completeNinaImageJob` closes the row
     *      it was handed, and **the photograph still lands in the chat.** That is a real,
     *      reachable, user-visible outcome and it is the right one — he asked for that
     *      photograph, and the money is already committed. What the flag DOES stop is anything
     *      NEW starting: `claimNinaImageJob`, `listRevivableNinaImageJobs` and
     *      `sweepStaleNinaImageJobs` all skip a flagged row, so a hidden job is never re-fired
     *      and never apologised for. A true cancel would have to race the claim, and losing that
     *      race means spending the money and then telling him it did not happen.
     *
     *   3. **NOT A DELETE, AND NOT AN ARCHIVE WITH A SCREEN.** No statement anywhere removes a
     *      `nina_turns` row; `tests/nina.softDelete.test.ts` asserts that against this module's
     *      source. There is also no trash view and no undo button, because nobody asked for one —
     *      what the nullable column buys is that `update nina_turns set deleted_at = null where
     *      id = '…'` restores a row exactly, in SQL, by hand. That recoverability is also why the
     *      control that writes this needs no confirmation dialog: `SessionRow`'s R11 confirmation
     *      exists because *"there is no archive flag and therefore no undo"*, and here there is.
     *
     *   4. **NOT A PER-KIND CONCEPT.** Only `kind = 'image'` rows are ever flagged, because
     *      `/nina/jobs` is the only screen that lists turns and it lists only image jobs. Every
     *      writer of this column carries `kind = 'image'` in its `WHERE`. A `kind = 'chat'` turn
     *      has no list to be tidied out of; `lib/nina/chatturn.ts` does not read this column and
     *      must not start.
     *
     * ── NO INDEX, AND HERE IS THE ARITHMETIC ──────────────────────────────────────────────────
     * A partial index — `(user_id, created_at desc) where kind = 'image' and deleted_at is null`
     * — was considered and declined, and the numbers are small enough to write down. The list
     * read is one `LIMIT 60` walk of `nina_turns_user_created_idx`, which ALREADY carries
     * `kind = 'image'` as a heap filter on tuples it has fetched anyway; `deleted_at IS NULL` is a
     * second predicate on those same fetched tuples and costs one null check each. The set it
     * filters is bounded by `NINA_IMAGE_DAILY_CAP` — six image rows per user per day — so sixty
     * rows is ten days of flat-out use, and the worst case for a runner who hides everything is
     * that the walk passes a few extra tuples before it fills the limit. The index would cost a
     * write on every turn Nina ever takes, chat rows included, to save microseconds on a page
     * opened by hand. `nina_turns` keeps exactly one index, and
     * `tests/db.schema.nina.test.ts` pins that.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
```

**Impact:** additive and nullable, so nothing in the tree breaks before Step 2 runs. `timestamp`
is already imported by this file. No existing test asserts `nina_turns`' full column list, and
nothing calls `tableRow(schema.ninaTurns, …)`, so the column's position in the object is free.

---

### Step 2: Generate the migration — and do not touch it afterwards

**File:** `drizzle/0008_<generated>.sql` (plus `drizzle/meta/0008_snapshot.json` and one appended
entry in `drizzle/meta/_journal.json`). Latest existing migration is `drizzle/0007_graceful_mercury.sql`,
journal `idx: 7`.

**Change:** run, once, from the worktree root:

```
npm run db:generate
```

Then:

```
npm run db:check
```

The generated file must be exactly one statement:

```sql
ALTER TABLE "nina_turns" ADD COLUMN "deleted_at" timestamp with time zone;
```

**Rules, in order of how expensive it is to break them:**

- **NEVER rename the generated file.** The tag in `drizzle/meta/_journal.json` is what
  `drizzle-kit migrate` matches; a renamed migration keeps its old `when`, drops below the
  applied-watermark, and is **skipped silently** — a column that exists in the schema and never
  exists in the database.
- **NEVER hand-write it.** If the diff is not the single `ADD COLUMN` above, the schema edit is
  wrong; fix `lib/db/schema.ts` and regenerate rather than editing SQL.
- If `db:generate` produces MORE than one new file, or a file numbered other than `0008`, stop:
  something else changed the schema.
- **DO NOT RUN `npm run db:migrate`.** That writes production. Generating is this phase's job;
  applying is the operator's. See *Verification*.

**Impact:** none on the running tree — the column is nullable, so existing production rows are
already correct the moment the ALTER lands, and the code reads NULL as "visible".

---

### Step 3: `lib/nina/imagejobs.ts` — one new writer, NINE `WHERE`s, and the comment on each

All line numbers are as of `origin/main`; Phase 1 inserts `reopenNinaImageJob` into this same file
(at `:111`) and will shift every one of the numbers below it. **Anchor on the quoted surrounding
text, not on the number.**

**Eight functions, nine statements.** Seven of them were in this phase's original scope; the eighth
— `reopenNinaImageJob`, Step 3k — is Phase 1's new function and did not exist when that list was
written. It is a real `SELECT` on `nina_turns` that decides whether work gets scheduled, so it is
exactly the kind of read the flag exists to stop.

#### 3a — the import

**File:** `lib/nina/imagejobs.ts:3`

```ts
import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
```

#### 3b — `claimNinaImageJob` (`:202-211`, the `.where(and(` block)

Replace:

```ts
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        isNotNull(ninaTurns.args),
        sql`coalesce((${ninaTurns.args} ->> 'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}`,
        phasePredicate,
      ),
    )
```

with:

```ts
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        // R2: a claim is a START, and the flag's rule is that nothing new starts for a hidden job.
        isNull(ninaTurns.deletedAt),
        isNotNull(ninaTurns.args),
        sql`coalesce((${ninaTurns.args} ->> 'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}`,
        phasePredicate,
      ),
    )
```

**Impact:** an in-flight generation that already holds the claim is unaffected — it claimed before
the flag was written, and `completeNinaImageJob` is id-scoped. That is D8, and it is the outcome
the column's docstring describes.

#### 3c — `listRevivableNinaImageJobs` (`:315-321`)

Replace the head of the `.where(and(` block:

```ts
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        isNotNull(ninaTurns.args),
```

with:

```ts
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        // R2: never revive a job he hid — reviving is exactly "start something new for it".
        isNull(ninaTurns.deletedAt),
        isNotNull(ninaTurns.args),
```

**Impact:** `reviveNinaImageJobs` on a `/nina` render stops re-firing hidden jobs.

#### 3d — `sweepStaleNinaImageJobs`, the SELECT (`:524-530`)

Replace:

```ts
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        lt(ninaTurns.createdAt, olderThan),
      ),
    )
```

with:

```ts
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        /* R2: never APOLOGISE in the chat for a job he hid. The sweep's whole visible output is
         * `postNinaApologyMessage`, and a sentence from Nina about a row that is no longer on any
         * screen is the one thing tidying the list must not produce. */
        isNull(ninaTurns.deletedAt),
        lt(ninaTurns.createdAt, olderThan),
      ),
    )
```

#### 3e — `sweepStaleNinaImageJobs`, the guarded UPDATE (`:545-551`)

The same predicate goes on the inner statement, for the same reason its existing
`status = 'pending'` guard is there. Replace:

```ts
        .where(
          and(
            eq(ninaTurns.userId, userId),
            eq(ninaTurns.id, row.id),
            eq(ninaTurns.status, 'pending'),
          ),
        )
```

with:

```ts
        .where(
          and(
            eq(ninaTurns.userId, userId),
            eq(ninaTurns.id, row.id),
            eq(ninaTurns.status, 'pending'),
            /* R2, and the same race the `status` guard above covers: he may have hidden the row
             * between the SELECT and this statement. `returning` length 0 then means "somebody
             * else closed it OR he hid it", and both want the same answer — skip, apologise for
             * nothing. */
            isNull(ninaTurns.deletedAt),
          ),
        )
```

**Impact:** counts as one of the eight functions; two statements, one rule.

#### 3f — `listOpenNinaImageJobs` (`:594-600`)

Replace:

```ts
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
      ),
    )
```

with:

```ts
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        // R2: `/nina`'s in-flight strip is a LIST, so a hidden job leaves it. The generation it
        // describes keeps running; only the row is gone.
        isNull(ninaTurns.deletedAt),
      ),
    )
```

#### 3g — `getNinaImageJob` (`:619`, single-line `.where`)

Replace:

```ts
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.kind, 'image')))
```

with:

```ts
    // R2: a poll on a hidden job answers "no such job" — which is what a poller should do with a
    // row that has left every screen it could report into.
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        isNull(ninaTurns.deletedAt),
      ),
    )
```

#### 3h — `listNinaImageJobs` (`:792`)

Replace:

```ts
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.kind, 'image')))
```

with:

```ts
    /* R2, and this is the read the feature is FOR. It also serves `/nina/about`'s "Pembuatan
     * foto" section, so a job hidden on one surface is hidden on both — which is correct: he
     * hid the JOB, not the row on one screen. `/nina/about`'s markup and controls are untouched;
     * only its contents shrink. */
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        isNull(ninaTurns.deletedAt),
      ),
    )
```

#### 3i — `getNinaImageJobDetail` (`:826`)

Replace:

```ts
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.kind, 'image')))
```

with:

```ts
    /* R2: a hidden job 404s at `/nina/jobs/[id]`. `null` here already means "not yours OR never
     * existed", stated in this function's own header as an anti-oracle property; "hidden" joins
     * that set rather than getting a third, distinguishable answer. */
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        isNull(ninaTurns.deletedAt),
      ),
    )
```

**Impact:** `app/nina/jobs/[id]/page.tsx` 404s a hidden job with no edit to that file — its
`if (job === null) notFound()` already says it.

#### 3k — `reopenNinaImageJob`, Phase 1's read and the EIGHTH one (added by the reconciler)

**File:** `lib/nina/imagejobs.ts` — inside `reopenNinaImageJob`, which Phase 1 inserts at `:111`
between `openNinaImageJob` and `export interface NinaImageClaim`.

**Why this exists.** Phase 1 adds a `SELECT` on `nina_turns` that this phase's seven-read list
predates. A soft-deleted job is off `/nina/jobs`, so a redo can only arrive from a stale tab — and
if it arrived it would open a NEW job row for work the runner had just tidied away, spend one of
six generations a day on it, and deliver a photograph he had already dismissed. Phase 1 named the
seam in its own **Handoffs**; this is the step that closes it.

**No new refusal code, and that is verified rather than hoped.** `reopenNinaImageJob`'s first line
after the read is `if (row == null) return { ok: false, reason: 'not-found' }`, so a hidden row
takes the existing path. `NinaJobRefusal` is unchanged, `NOTE` is unchanged, the button is
unchanged, and `'not-found'` is the honest answer: as far as every screen is concerned, that job is
not there any more.

Replace:

```ts
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.kind, 'image')))
```

with:

```ts
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        // R2: a redo is a START, and a job he hid must not be redoable from a stale tab. The empty
        // read makes this `'not-found'` for free — no new member of `NinaJobRefusal`.
        isNull(ninaTurns.deletedAt),
      ),
    )
```

**Impact:** `redoNinaImageJob` answers a hidden job exactly as it answers a foreign one. Phase 1's
`tests/nina.jobActions.test.ts` keeps passing untouched — it never enqueues a hidden row — and the
new predicate is asserted in Step 9.

---

#### 3j — the new writer

**File:** `lib/nina/imagejobs.ts` — append at the END of the file, after `getNinaImageJobDetail`.

```ts
/**
 * **R2's only write, and it is a flag.** The runner tapped the trash icon on `/nina/jobs`; this
 * stamps `deleted_at` and returns whether a row was actually flagged.
 *
 * ── WHY IT IS AN UPDATE AND NOT A DELETE, ONE MORE TIME ───────────────────────────────────────
 * His words: *"delete job icon … (but just soft delete in neon db)"*. `nina_turns` is the money
 * ledger and the audit trail at once, and this row carries a `cost_micro_usd` that was really
 * billed. Nothing in the SET touches `status`, `error_code`, `cost_micro_usd` or `latency_ms` —
 * tidying a list may not rewrite what a generation cost or how it ended.
 *
 * ── OWNERSHIP IS PROVED IN SQL, AND SO IS IDEMPOTENCE ─────────────────────────────────────────
 * Invariant 3: `userId` is first and it is in the `WHERE`, so a job id from a browser is a claim
 * that this statement turns into a fact. `kind = 'image'` is load-bearing for the reason the
 * block above `listNinaImageJobs` gives — since phase 3 this table also holds pending `kind='chat'`
 * turns, and this column has no meaning on one. `isNull(deletedAt)` makes a second tap a no-op
 * rather than a re-stamp, so a double-tap cannot move the timestamp and `false` means exactly one
 * thing to the caller: **nothing changed.** Not his, never existed, not an image row, or already
 * hidden — four causes, one answer, deliberately, so the return value cannot be used to probe
 * which job ids exist.
 *
 * `now()` and not `new Date()`: the database's clock, so `deleted_at` can never precede the
 * `created_at` it sits beside because a serverless host's clock drifted. Same instinct as
 * `created_at`'s `defaultNow()`.
 *
 * **This does not cancel anything.** A `pending` job that is already claimed keeps drawing and its
 * photograph still arrives in the chat. See `nina_turns.deleted_at`'s docstring, point 2.
 */
export async function softDeleteNinaImageJob(userId: string, jobId: string): Promise<boolean> {
  const flagged = await db
    .update(ninaTurns)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        isNull(ninaTurns.deletedAt),
      ),
    )
    .returning({ id: ninaTurns.id })

  return flagged.length > 0
}
```

**Impact:** one indexed write. `scripts/check-data-layer-invariants.mjs` greps
`lib/db/queries.ts` only, so nothing here is in its scope — and the function takes `userId` first
regardless.

---

### Step 4: `lib/nina/queries.ts` — say out loud why the cap does **not** filter

**File:** `lib/nina/queries.ts` — the docstring above `countNinaTurnsSince` (`:2098-2102`).

**Change:** docstring only. **No code change in this file at all.** Replace:

```ts
/**
 * Phase 12's daily cap, and phase 10's "have I already spoken today". Counts by `kind` since an
 * instant, and counts FAILED turns too — a cap that only counts successes is a cap an unlucky
 * afternoon can spend ten times over.
 */
```

with:

```ts
/**
 * Phase 12's daily cap, and phase 10's "have I already spoken today". Counts by `kind` since an
 * instant, and counts FAILED turns too — a cap that only counts successes is a cap an unlucky
 * afternoon can spend ten times over.
 *
 * **AND IT DOES NOT FILTER `deleted_at`, WHICH IS A DECISION AND NOT AN OVERSIGHT (R2).** Every
 * other reader of a `kind='image'` row skips a row the runner hid from `/nina/jobs`; this one
 * keeps counting it, for the same reason it counts failures. `lib/nina/selfiegen.ts` calls this
 * cap *"a money cap and not a feature cap"* — the $0.04 was spent, and hiding the row does not
 * un-spend it. A version of this count that respected the flag would turn one tap on a tidy-up
 * icon into a quota refund, which is an unmetered image budget wearing a trash can as a hat.
 * `tests/nina.softDelete.test.ts` asserts the absence of the predicate rather than trusting it.
 */
```

**Impact:** none at runtime. This is the phase's most important comment.

---

### Step 5: `lib/nina/jobActions.ts` — append the action

**File:** `lib/nina/jobActions.ts` — Phase 1's file. **Two edits: one import name, one appended
function at the end.** Do not touch `redoNinaImageJob` or the `NinaJobActionResult` declaration.

**5a — widen Phase 1's import from `./imagejobs`** so it also names the new writer:

```ts
import { reopenNinaImageJob, softDeleteNinaImageJob } from './imagejobs'
```

(If Phase 1 imported a different set, add `softDeleteNinaImageJob` to whatever it wrote. If Phase 1
imported from `'@/lib/nina/imagejobs'` rather than `'./imagejobs'`, match its spelling.)

**5b — append at the end of the file:**

```ts
/**
 * **R2, and the whole of it: one tap, no dialog, and the row leaves the list.**
 *
 * ── WHY THERE IS NO CONFIRMATION, AND WHY `SessionRow`'s PRECEDENT DOES NOT TRANSFER ──────────
 * The runner asked for this by name — *"we dont need confirmation message to execute them"* — but
 * it survives on its merits, which matters because `components/nina/SessionRow.tsx` builds a
 * three-tap confirmation panel for its delete and argues for it at length. Read that argument and
 * it turns entirely on ONE premise: *"There is no archive flag and therefore no undo, so the
 * confirmation is the only thing between a mis-tap and a lost conversation."* R11 hard-deletes a
 * conversation and, through two cascades, its photographs' rows.
 *
 * That premise is absent here, deliberately. This writes a nullable column. A mis-tap costs the
 * runner one row on one screen; `update nina_turns set deleted_at = null where id = '…'` puts it
 * back exactly, the ledger never moved, the photograph is still in the chat and still in Blob, and
 * an in-flight generation still finishes and still delivers. A confirmation panel guarding a
 * reversible flag is friction people learn to tap through — which `SessionRow` also says, about
 * the typed-phrase alternative it rejected.
 *
 * ── WHAT THE CALLER GETS, AND WHAT IT DOES NOT ───────────────────────────────────────────────
 * `ok: false` is the whole refusal — `NinaJobActionResult` carries no error prose, on
 * `NinaSessionActionResult`'s rule that the component supplies the sentence in his language. A
 * malformed id, a job that is not his, a job that never existed and a job already hidden are one
 * answer, because distinguishing them would be an ownership oracle.
 *
 * `revalidatePath` runs only when a row was actually flagged. Nothing written, nothing to
 * invalidate — `removeNinaChatSession`'s rule. And only `NINA_JOBS_HREF`: that is the surface the
 * tap happened on. `/nina/about` renders the same jobs and will show one fewer, but it is
 * dynamically rendered behind `requireUserId()` and re-reads on its next request anyway; naming it
 * here would be this phase reaching into a screen it promised not to touch.
 *
 * No `redirect()` and no `next` URL: he is already standing on the list he is tidying, and the
 * revalidate re-renders it under him. Navigating would be a bug.
 */
export async function deleteNinaImageJob(input: { jobId: string }): Promise<NinaJobActionResult> {
  const userId = await requireUserId()
  /* Line one is the auth call, ABOVE the shape check — `app/actions/share.ts`'s asserted property,
   * so a signed-out caller is bounced to sign-in rather than told their id was malformed. */
  if (!isValidId(input?.jobId)) return { ok: false, reason: 'not-found' }

  const deleted = await softDeleteNinaImageJob(userId, input.jobId)
  if (!deleted) return { ok: false, reason: 'not-found' }

  revalidatePath(NINA_JOBS_HREF)
  return { ok: true, reason: null }
}
```

**The `reason` field is Phase 1's, and `'not-found'` is the only value a delete can ever carry
(F2).** The other three members of `NinaJobRefusal` are redo's: `'not-failed'` and `'no-args'` are
properties of a row you are about to re-run, and `'capped'` is a money check a delete does not make
— hiding a row spends nothing. So this phase **adds no member to the union and edits no line of
`lib/nina/jobview.ts`**, which is Phase 1's file. `NOTE['not-found']` — *"Job ini sudah nggak
ada."* — is already the right sentence for both buttons, which is why Phase 1's `Record` needs no
new key either.

The four causes of the second `return` — not his, never existed, not an image row, already hidden —
stay one answer on purpose: a refusal that told them apart would be an ownership oracle.

**Impact:** no model call is added, so `scripts/check-llm-payload-boundary.mjs` has nothing new to
object to and this module's status in that file is unchanged (invariant 4).

---

### Step 6: _(deleted by the reconciler — nothing to do)_

This step was a conditional fix for a Phase 1 that might have gated the whole control slot on
`canRedo`. **Phase 1 did not.** It writes `{withActions && <NinaJobActions item={item} />}` in
`components/nina/NinaJobList.tsx` and puts the `canRedo` test on the redo `<button>` inside
`NinaJobActions`, which is precisely the arrangement R2 requires: the slot on every row, the redo
glyph on failed rows only.

**`components/nina/NinaJobList.tsx` is therefore not edited by this phase at all.** It has left the
Files table. Do not open it.

---

### Step 7: `components/nina/NinaJobActions.tsx` — append the button and its icon

**File:** `components/nina/NinaJobActions.tsx` — Phase 1's file. **Three edits: one import name,
one `<button>` appended as the LAST child of Phase 1's `<span>` control cluster, one icon function
appended at the end of the file.** Do not restructure Phase 1's component, its `run()`, its
`pending` flag, its `note` state, or its redo button.

Phase 1's shapes, confirmed (F3): the prop is `item: NinaJobListItem`, `run()` takes **one**
argument, the pending flag is `pending`, and `const title = ninaJobTitle(item)` is already in scope
above the `return`.

**7a — widen Phase 1's import from `@/lib/nina/jobActions`:**

```tsx
import {
  deleteNinaImageJob,
  redoNinaImageJob,
  type NinaJobActionResult,
} from '@/lib/nina/jobActions'
```

**7b — append inside Phase 1's control container, after the redo button:**

```tsx
      {/*
        R2's control, and it renders on EVERY row — a done job, a queued job and a failed job all
        get it, because "so i can keep the job list tidy and pristine" is about the whole list.
        Redo is failed-only and gated above; this one is not gated at all.

        A SIBLING of the row's <Link>, never a child: `SessionRow` records the rule ("a <button>
        inside an <a> is invalid and breaks the link's hit testing"), and Phase 1's slot is where
        that separation already lives.

        `size-11` is 44px — `Button.tsx`'s `md`, "the iOS minimum tap target, never less" — which
        matters more here than anywhere else on the screen: this is a one-tap mutation sitting in
        a vertically-scrolling list, so the target has to be big enough that a scroll never ends
        on it by accident. That is the safeguard the confirmation dialog would have been, spent on
        the input instead of on a second screen.

        No `window.confirm`, no panel, no second tap. See `deleteNinaImageJob`'s header for why
        `SessionRow`'s R11 confirmation is the right call there and the wrong one here.
      */}
      <button
        type="button"
        aria-label={`Hapus ${title} dari daftar`}
        aria-busy={pending}
        disabled={pending}
        onClick={() => run(() => deleteNinaImageJob({ jobId: item.id }))}
        className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-3 transition-colors hover:text-red disabled:opacity-40"
      >
        <TrashIcon />
      </button>
```

**The accessible name names the ROW, and here it matters more than it does for redo.** Phase 1's
rule — *"an icon button's accessible name must be the visible label of the thing it acts on, or a
screen reader announces 'Coba lagi' six times in a list of six rows"* — binds this button harder,
because the delete control is on EVERY row while redo is only on the failed ones. `title` is Phase
1's `const title = ninaJobTitle(item)`, the same pure function `NinaJobList` renders as the visible
title, so the two strings cannot drift. `aria-busy={pending}` matches Phase 1's redo button
attribute for attribute.

**7c — append at the end of the file, beside whatever icon Phase 1 wrote:**

```tsx
/**
 * A trash can at 18px. Hand-written SVG for `SessionRow`'s `PinIcon` reason, quoted from `TabBar`:
 * *"four glyphs is not worth a package, and an icon font would be a second webfont on a page whose
 * first is already Poppins."* `aria-hidden`, because the button above already carries the
 * accessible name and a labelled glyph inside a labelled button reads the label twice.
 *
 * `currentColor` throughout, so the button's own `text-ink-3` → `hover:text-red` is the only place
 * the colour is decided.
 */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden="true">
      <path
        d="M4 7h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 7.5 7.2 18a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9L17.5 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 11v5M13.5 11v5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
```

**Impact:** the delete control appears on every row of `/nina/jobs` and on no row of
`/nina/about`. `disabled={pending}` shares Phase 1's flag, so a redo in flight also blocks the
delete on that row and vice versa — correct: they are the same row's two mutations. `run()` also
already owns the refusal sentence, and the only refusal this button can produce is `'not-found'`,
which `NOTE` already words.

**`/nina/about` is untouched by this step (invariant 5).** The cluster this button joins renders
only when `NinaJobList` receives `actions`, and only `app/nina/jobs/page.tsx` passes it. The About
screen's rows still emit `<li>` with no `className` and the same `cn()` arguments in the same
order, which is the equality Phase 1's Step 5 was written to preserve.

---

### Step 8: `tests/db.schema.nina.test.ts` — the column, pinned

**File:** `tests/db.schema.nina.test.ts` — append a new `describe` at the END of the file, after
the existing `describe('deleting or editing a nina message: …')` block (`:588-608`). The helpers
`sqlType`, `columns`, `names` and `indexNames` are already defined at the top of the file; do not
redefine them.

```ts
/**
 * R2's one schema change. The column is additive, nullable and default-less, and each of those
 * three properties is doing a job: additive so no row moves, nullable so NULL means "visible" for
 * every row written before the feature existed, default-less so the migration IS the backfill —
 * `tuning_revision`'s idiom and the `*_enabled` columns', asserted the same way they are.
 */
describe('nina_turns.deleted_at — the soft delete (R2)', () => {
  it('is a nullable timestamptz with NO default, so every pre-R2 row reads "visible"', () => {
    expect(sqlType(schema.ninaTurns, 'deleted_at')).toBe('timestamp with time zone')
    expect(columns(schema.ninaTurns).get('deleted_at')?.notNull).toBe(false)
    expect(columns(schema.ninaTurns).get('deleted_at')?.hasDefault).toBe(false)
  })

  it('is a TIMESTAMP and not an is_deleted boolean, because "when" is free and answers more', () => {
    // `nina_chat_sessions.pinned_at` made the same call for the same reason (R4). A boolean would
    // hold strictly less and cost exactly the same.
    const turnColumns = names(schema.ninaTurns)
    expect(turnColumns).toContain('deleted_at')
    expect(turnColumns).not.toContain('is_deleted')
    expect(turnColumns).not.toContain('deleted')
  })

  it('is not an archive: there is no trash view, no restored_at and no deleted_by', () => {
    // Nobody asked for an undo screen. What the nullable column buys is `set deleted_at = null`
    // in psql — a recoverable mistake, not a feature surface.
    const turnColumns = names(schema.ninaTurns)
    expect(turnColumns).not.toContain('restored_at')
    expect(turnColumns).not.toContain('deleted_by')
  })

  it('adds NO index — nina_turns still has exactly the one it shipped with', () => {
    /* The arithmetic is in `lib/db/schema.ts` and this is what keeps it honest: the daily cap is
     * six image rows per user, the list read is LIMIT 60 over `(user_id, created_at desc)`, and
     * `deleted_at IS NULL` is a heap predicate on tuples `kind = 'image'` had already fetched. A
     * partial index would cost a write on every turn Nina ever takes to save microseconds on a
     * page opened by hand. */
    expect(indexNames(schema.ninaTurns)).toEqual(['nina_turns_user_created_idx'])
  })
})
```

**Impact:** fails loudly if the column is spelled `deletedAt` in SQL, given a default, made
`NOT NULL`, or shipped with a companion index.

---

### Step 9: `tests/nina.softDelete.test.ts` — the SQL-level proofs

**File:** `tests/nina.softDelete.test.ts` — **new**. This is the file that proves the **eight**
reads respect the flag and that `countNinaTurnsSince` does not, against the SQL drizzle actually
generates. `tests/db.ownership.test.ts` and `tests/nina.sessionPurge.test.ts` are the precedent;
`tests/support/fakeDb.ts` is the driver.

```ts
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **R2's contract, asserted against generated SQL rather than against a spy.**
 *
 * A soft delete is only worth anything if EVERY reader agrees about what the flag means, and a spy
 * cannot tell "the function was called" from "the predicate was in the WHERE". So this file
 * installs the recording driver and reads the statements.
 *
 * Three properties, and the second is the one most likely to rot:
 *
 *   1. Every read that describes a job to a human, or that schedules work on one, carries
 *      `deleted_at is null`. EIGHT functions, NINE statements — the eighth is
 *      `reopenNinaImageJob`, R1's redo, which is a read that SCHEDULES.
 *   2. `countNinaTurnsSince` — the daily image cap — carries NO such predicate, deliberately. The
 *      cap is a money cap; hiding a row does not un-spend $0.04. The assertion is written as an
 *      ABSENCE on purpose: a future "consistency" cleanup that adds the filter here turns one tap
 *      into a quota refund, and this is the only thing that would notice.
 *   3. The write is an UPDATE that touches nothing but the flag. `nina_turns` is the money ledger.
 *
 * Deliberately NOT in `tests/nina.jobActions.test.ts`. That file does NOT mock
 * `@/lib/nina/imagejobs` — it runs it for real — but it does install its own
 * `vi.mock('@/lib/db', …)`, a hand-rolled thenable that returns rows and records no SQL.
 * `installFakeDb()` works the other way round: it seeds `globalThis.__runInsightsDb` BEFORE
 * `lib/db` is first imported. Two owners of `@/lib/db` in one file is not a thing, and only the
 * recorder can answer "was the predicate in the WHERE". So that file asserts the ACTION's
 * branching and this one asserts the SQL.
 */

type ImageJobs = typeof import('@/lib/nina/imagejobs')
type Queries = typeof import('@/lib/nina/queries')

/** 12 chars, so `isValidId` would accept it and `newId()` could have produced it. */
const JOB = 'jobAAAAAAAAA'

let fake: FakeDb
let jobs: ImageJobs
let queries: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  jobs = await import('@/lib/nina/imagejobs')
  queries = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/**
 * Matches both `"deleted_at" is null` and `"nina_turns"."deleted_at" is null`, because drizzle
 * qualifies a column in a SELECT and may not in an UPDATE, and neither spelling is the point.
 */
const HIDDEN_SKIPPED = '"deleted_at" is null'

describe('every read that shows a job or schedules work on one skips a hidden row', () => {
  it('listNinaImageJobs — /nina/jobs loses the row, and so does /nina/about', async () => {
    fake.enqueue([])
    await jobs.listNinaImageJobs('u1')
    const { sql } = fake.only()
    expect(sql).toContain(HIDDEN_SKIPPED)
    // Still the same one indexed read it always was: kind is a heap filter, limit is real.
    expect(sql).toContain('"kind" = $')
    expect(sql).toContain('limit')
  })

  it('getNinaImageJobDetail — /nina/jobs/[id] 404s a hidden job', async () => {
    fake.enqueue([])
    await expect(jobs.getNinaImageJobDetail('u1', JOB)).resolves.toBeNull()
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('getNinaImageJob — a poll answers "no such job"', async () => {
    fake.enqueue([])
    await expect(jobs.getNinaImageJob('u1', JOB)).resolves.toBeNull()
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('listOpenNinaImageJobs — the in-flight strip AND the sweep it runs first', async () => {
    fake.enqueue([], []) // the sweep's SELECT, then the strip's
    await jobs.listOpenNinaImageJobs('u1')
    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) expect(query.sql).toContain(HIDDEN_SKIPPED)
  })

  it('listRevivableNinaImageJobs — a hidden job is never re-fired', async () => {
    fake.enqueue([])
    await jobs.listRevivableNinaImageJobs('u1', {
      queuedBefore: new Date('2026-09-07T00:00:00Z'),
      runningBefore: new Date('2026-09-07T00:00:00Z'),
    })
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('sweepStaleNinaImageJobs — she never apologises in the chat for a job he hid', async () => {
    fake.enqueue([])
    await expect(jobs.sweepStaleNinaImageJobs('u1')).resolves.toBe(0)
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('claimNinaImageJob — a hidden job cannot be claimed, so nothing NEW starts for it', async () => {
    fake.enqueue([])
    await expect(jobs.claimNinaImageJob('u1', JOB)).resolves.toBeNull()
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('reopenNinaImageJob — R1’s redo cannot resurrect a job he hid', async () => {
    /*
     * The EIGHTH read, and Phase 1's, added here by the reconciler. A hidden job is off
     * `/nina/jobs`, so a redo can only arrive from a stale tab — and if it landed it would open a
     * NEW row for work he had just tidied away and spend one of six generations a day on it.
     *
     * The refusal costs no new code: the owner-scoped SELECT comes back empty and
     * `reopenNinaImageJob`'s own first branch answers `'not-found'`, which is the same word a
     * foreign id gets. `NinaJobRefusal` is unchanged and so is the button's `NOTE`.
     */
    fake.enqueue([])
    await expect(jobs.reopenNinaImageJob('u1', JOB)).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    })
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })
})

describe('the daily cap keeps counting a hidden job — it is a money cap, not a feature cap', () => {
  it('countNinaTurnsSince carries NO deleted_at predicate, and that is the decision', async () => {
    fake.enqueue([[4]])
    await expect(queries.countNinaTurnsSince('u1', 'image', new Date(0))).resolves.toBe(4)
    // An ABSENCE assertion on purpose. A "consistency" cleanup that adds the filter here turns one
    // tap on a tidy-up icon into a quota refund; nothing else in the suite would notice.
    expect(fake.only().sql).not.toContain('deleted_at')
  })

  it('so a runner who generated six and hid all six has nothing left today', async () => {
    fake.enqueue([[6]]) // NINA_IMAGE_DAILY_CAP
    await expect(jobs.ninaImageQuotaLeft('u1')).resolves.toBe(0)
    expect(fake.only().sql).not.toContain('deleted_at')
  })
})

describe('softDeleteNinaImageJob — a flag, owner-scoped, idempotent, and never a DELETE', () => {
  it('is an UPDATE that stamps the DATABASE clock', async () => {
    fake.enqueue([[JOB]])
    await expect(jobs.softDeleteNinaImageJob('u1', JOB)).resolves.toBe(true)

    const { sql } = fake.only()
    expect(sql).toMatch(/^update "nina_turns" set/)
    expect(sql).toContain('"deleted_at" = now()')
    /* now() and not a JS `new Date()`: a serverless host's clock drift must not be able to put
     * `deleted_at` before the `created_at` sitting next to it. The SET therefore binds NO
     * parameter at all — every `$n` in this statement belongs to the ownership predicate. */
    expect(sql.slice(0, sql.indexOf(' where '))).not.toContain('$')
  })

  it('proves ownership in the same statement, and only ever flags an image row', async () => {
    fake.enqueue([[JOB]])
    await jobs.softDeleteNinaImageJob('u1', JOB)

    const { sql, params } = fake.only()
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"id" = $')
    expect(sql).toContain('"kind" = $')
    expect(params).toContain('u1')
    expect(params).toContain(JOB)
    expect(params).toContain('image')
  })

  it('only writes where the flag is still NULL, so a double-tap cannot move the timestamp', async () => {
    fake.enqueue([[JOB]])
    await jobs.softDeleteNinaImageJob('u1', JOB)
    expect(fake.only().sql).toContain(HIDDEN_SKIPPED)
  })

  it('reports false for a foreign id, a missing id and an already-hidden row alike', async () => {
    // One answer for four causes, deliberately: a return value that distinguished them would be a
    // probe for which job ids exist.
    fake.enqueue([])
    await expect(jobs.softDeleteNinaImageJob('u2', JOB)).resolves.toBe(false)
  })

  it('touches nothing but the flag — not status, not error_code, not the money', async () => {
    fake.enqueue([[JOB]])
    await jobs.softDeleteNinaImageJob('u1', JOB)

    const { sql } = fake.only()
    const setClause = sql.slice(0, sql.indexOf(' where '))
    expect(setClause).toContain('deleted_at')
    for (const column of ['cost_micro_usd', 'status', 'error_code', 'latency_ms', 'args']) {
      expect(setClause, column).not.toContain(column)
    }
  })
})

describe('"but just soft delete in neon db" — asserted against the module, not just one path', () => {
  it('lib/nina/imagejobs.ts issues no DELETE against nina_turns anywhere', () => {
    // The grep-as-a-guard shape `tests/db.schema.nina.test.ts` already uses on lib/nina/queries.ts.
    // This table is the money ledger and the audit trail; a row leaves it exactly one way, which is
    // the users cascade when an account is deleted.
    const source = readFileSync('lib/nina/imagejobs.ts', 'utf8')
    expect(source).not.toMatch(/\.delete\(\s*ninaTurns\s*\)/)
  })

  it('and neither does lib/nina/jobActions.ts', () => {
    const source = readFileSync('lib/nina/jobActions.ts', 'utf8')
    expect(source).not.toMatch(/\.delete\(/)
  })
})
```

**Impact:** nine statements' worth of coverage with no database and no network.

---

### Step 10: `tests/nina.jobActions.test.ts` — append the delete refusals

**File:** `tests/nina.jobActions.test.ts` — Phase 1's file. **ONE edit: append at the end.**

**The old Step 10a is deleted.** It said to insert a key into Phase 1's
`vi.mock('@/lib/nina/imagejobs', …)` factory. **Phase 1 has no such factory** (F6): it mocks only
the edges and runs `imagejobs` for real, deliberately, because mocking that module would make R1's
session-fallback assertion impossible in the same file. So:

- **Do not touch any `vi.mock` factory in that file.** Phase 1's `@/lib/nina/queries` factory must
  export exactly seven names or the suite fails at link time, and this phase adds no export to
  `lib/nina/queries.ts` (Step 4 is a docstring). Adding a name there would be a link error waiting
  for the day somebody trims it back.
- **Declare no new mock, no new fixture and no new `beforeEach` default.** Everything below uses
  Phase 1's bindings: `actions`, `requireUserId`, `revalidatePath`, `dbRows`, `deferred`,
  `insertNinaTurn` and `FAILED_JOB` (its 12-character fixture id).
- **The delete path is driven through Phase 1's fake `db`.** `deleteNinaImageJob` reaches the real
  `softDeleteNinaImageJob`, whose `.returning({ id })` resolves to `dbRows.update`. So
  `dbRows.update = [{ id: FAILED_JOB }]` **is** a successful flag and `dbRows.update = []` **is** a
  refusal — which is a truer test than a spy, because the branch under test is the real
  `flagged.length > 0`.

Phase 1's `beforeEach` already sets `dbRows.update = []`, so a case that expects a refusal need not
arrange anything at all; each one below arranges explicitly anyway, so no case depends on ordering.

**What is NOT asserted here, and where it lives instead.** "The user id in the `WHERE` is the
authenticated one" is a SQL property and Phase 1's fake records no SQL — it is asserted in
`tests/nina.softDelete.test.ts`, which checks `params` contains `'u1'` for
`softDeleteNinaImageJob('u1', …)`. What this file can prove, and does, is that `requireUserId()`
ran and that `input` carries nothing but a `jobId` for the action to have used instead.

**Append at the END of the file:**

```ts
/* ── R2's delete ───────────────────────────────────────────────────────────────────────────── */

/**
 * **R2's refusals, and the one thing the action is not allowed to be clever about.**
 *
 * The delete is a one-tap mutation with no confirmation, so `requireUserId()` plus an owner-scoped
 * write is the ENTIRE boundary — `tests/share.actions.test.ts` says why that makes "line one is
 * the auth call" a property worth asserting rather than reviewing.
 *
 * The second property is the absence of an oracle: a bad id, a foreign job, a job that never
 * existed and a job already hidden all come back `{ ok: false, reason: 'not-found' }`, and none of
 * them can be told apart by a caller counting round trips or reading a sentence.
 *
 * These cases run the REAL `softDeleteNinaImageJob` against the fake `db` at the top of this file:
 * `dbRows.update` is what its `.returning()` resolves to, so a row there is a flag that landed and
 * an empty array is a flag that did not. The SQL those statements build is
 * `tests/nina.softDelete.test.ts`'s question, not this file's.
 */
describe('deleteNinaImageJob authenticates first and refuses without writing', () => {
  it('bounces a malformed job id before it reaches the database', async () => {
    /* The db is ARMED TO SUCCEED and the action refuses anyway, which proves the statement was
     * never issued rather than merely that it matched nothing. */
    dbRows.update = [{ id: FAILED_JOB }]

    const result = await actions.deleteNinaImageJob({ jobId: 'nope' })

    expect(result).toEqual({ ok: false, reason: 'not-found' })
    /* requireUserId still ran — it is line one, ABOVE the shape check, so a signed-out caller is
     * bounced to sign-in rather than told their id was malformed. */
    expect(requireUserId).toHaveBeenCalledOnce()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reports a foreign job exactly as it reports one that never existed', async () => {
    dbRows.update = []

    const result = await actions.deleteNinaImageJob({ jobId: FAILED_JOB })

    expect(result).toEqual({ ok: false, reason: 'not-found' })
    /* Nothing was written, so nothing is invalidated — `removeNinaChatSession`'s rule. */
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('gives an ALREADY-hidden job the identical answer, so a double-tap is a silent no-op', async () => {
    /* `softDeleteNinaImageJob`'s WHERE carries `isNull(deletedAt)`, so a second tap flags nothing
     * and `returning` comes back empty — the same empty answer a foreign id gets. The timestamp
     * cannot move, and the runner cannot tell the two apart. */
    dbRows.update = []

    const first = await actions.deleteNinaImageJob({ jobId: FAILED_JOB })
    const second = await actions.deleteNinaImageJob({ jobId: FAILED_JOB })

    expect(second).toEqual(first)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('never opens a job and never schedules one — a delete is not a redo', async () => {
    /* The two features share a module, a component and a result type; they must not share a write.
     * Hiding a row spends nothing, so there is no cap check, no INSERT and no `after()`. */
    dbRows.update = [{ id: FAILED_JOB }]

    await actions.deleteNinaImageJob({ jobId: FAILED_JOB })

    expect(insertNinaTurn).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(0)
  })
})

describe('a successful delete refreshes the list he is standing on, and nothing else', () => {
  it('revalidates /nina/jobs and returns ok', async () => {
    dbRows.update = [{ id: FAILED_JOB }]

    const result = await actions.deleteNinaImageJob({ jobId: FAILED_JOB })

    expect(result).toEqual({ ok: true, reason: null })
    expect(revalidatePath).toHaveBeenCalledWith('/nina/jobs')
  })

  it('revalidates exactly one path — /nina/about is not this phase to reach into', async () => {
    /* `/nina/about` renders the same jobs and will show one fewer, but it is dynamically rendered
     * behind `requireUserId()` and re-reads on its next request anyway. Naming it here would be
     * this phase reaching into a screen it promised not to touch. */
    dbRows.update = [{ id: FAILED_JOB }]

    await actions.deleteNinaImageJob({ jobId: FAILED_JOB })

    expect(revalidatePath).toHaveBeenCalledOnce()
  })
})
```

**Impact:** Phase 1's suite keeps every case it had — nothing above changes an existing arrangement,
and `dbRows.select` (the redo path's) is never read by the delete path.

---

## Verification

**Generate (once, and only once):**

```
npm run db:generate
npm run db:check
```

`db:check` must print no error. `git status` must show exactly three new/changed files under
`drizzle/`: `0008_<generated>.sql`, `meta/0008_snapshot.json`, `meta/_journal.json`.

**Build:**

```
npm run lint
npm run typecheck
```

**Tests:**

```
npm run test
npm run ci:data-layer-guard
```

`ci:data-layer-guard` greps `lib/db/queries.ts` only — this phase does not touch that file, so it
is a confirmation, not a risk.

**DO NOT RUN `npm run db:migrate`.** It writes production. **Generating the migration is this
phase's job; applying it is the operator's**, after the branch merges:

```
npm run db:migrate   # operator only, after merge — writes production
```

Until that runs, production has the code and not the column, and every read that names
`deleted_at` errors. **This phase is not deployable until the operator has applied 0008.** Say so
in the merge note.

**`/nina/about` renders byte for byte:**

```
git diff --stat origin/main -- components/nina/NinaAboutScreen.tsx app/nina/about/page.tsx
```

must print nothing. Its "Pembuatan foto" section will show one fewer job after a delete, and that
is correct and intended — a job hidden on one surface is hidden on both. What must not change is
its markup or its controls, and neither file is edited.

**Manual check** (dev, against a scratch job):

1. `/nina/jobs` — every row shows a trash icon; failed rows show two icons, others show one.
2. Tap it. **No dialog, no sheet, no second tap.** The row is gone on the next paint.
3. `psql`: `select id, status, error_code, cost_micro_usd, deleted_at from nina_turns where id = '<that job>';`
   — the row is still there, `deleted_at` is set, everything else is untouched.
4. `/nina/jobs/<that id>` — 404.
5. `/nina/about` — the Media section's job list is one shorter; its markup and its "Semua" link
   are unchanged.
6. `/nina` — the in-flight strip does not show it.
7. Ask Nina for a photo six times in one Jakarta day, hiding each job as it lands: the seventh is
   still refused by the cap.
8. Open `/nina/jobs` in a second tab BEFORE hiding a failed job, hide it in the first tab, then tap
   redo in the stale second tab: the row's refusal sentence reads *"Job ini sudah nggak ada."* and
   `select count(*) from nina_turns where user_id = '<uid>'` is unchanged — no new job was opened.
9. Undo it: `update nina_turns set deleted_at = null where id = '<that job>';` — the row is back on
   both screens, unchanged.

**Exit criteria:**

- `nina_turns.deleted_at` exists in `lib/db/schema.ts` and in exactly one generated migration named `0008_*`, and `npm run db:check` is clean
- tapping delete on any `/nina/jobs` row removes it from the list on the next paint, with no dialog at any point
- the row survives in `nina_turns` with `deleted_at` set and `status`, `error_code`, `cost_micro_usd` and `latency_ms` unchanged
- `/nina/jobs/<that id>` 404s; `/nina`'s in-flight strip, the revival read and the stale sweep all skip it
- a redo fired at a hidden job from a stale tab is refused as `'not-found'` and opens nothing (Step 3k), and no member was added to `NinaJobRefusal` to say so
- `components/nina/NinaJobList.tsx`, `lib/nina/jobview.ts` and `app/nina/jobs/page.tsx` are byte-for-byte as Phase 1 left them — this phase edits none of the three
- the daily cap still counts it
- no `DELETE` statement was added anywhere, asserted by test
- `npm run lint && npm run typecheck && npm run test` green
- `components/nina/NinaAboutScreen.tsx` and `app/nina/about/page.tsx` are byte-for-byte `origin/main`

---

## Handoffs

- **Phase 1 owns the `run()` helper, the `pending` flag, the `note` state, the refusal vocabulary
  and the control-slot gate — and all five were read, not guessed** (see *Phase 1's shapes*). This
  phase appends one `<button>` and one `TrashIcon()` and restructures nothing. The invariants on
  this side are: it renders on every row, it fires on one tap, it opens nothing, and it widens no
  type of Phase 1's.
- **Phase 1's `reopenNinaImageJob` is this phase's eighth `WHERE` (Step 3k), and Phase 1 asked for
  it in its own Handoffs.** If a later phase adds a ninth read of `nina_turns` that shows a job or
  schedules work on one, it carries `isNull(ninaTurns.deletedAt)` too, and it gets a case in
  `tests/nina.softDelete.test.ts`. That file's first `describe` is the register.
- **`scripts/nina-image-worker.ts` is deliberately NOT taught about `deleted_at`, and that is a
  decision.** It hand-writes its own SQL against a second copy of the column names; it is the
  GitHub Actions backstop that runs only when the platform path has already failed; and the worst
  case is that it finishes a job the runner hid — which produces a photograph he asked for and
  which the platform path would have produced too (see `deleted_at`'s docstring, point 2). Teaching
  it would mean a third copy of the predicate on a host that cannot see this module. If somebody
  later decides a hidden job must be invisible to the backstop as well, that is a card, not a
  drive-by.
- **No undo, no trash view, no `restored_at`.** Nobody asked. The nullable column is what makes a
  mistake recoverable in SQL; a restore screen is a separate feature with its own R.
- **No blob cleanup.** A hidden job's photograph, if it has one, stays in the chat and in Blob.
  Deleting a JOB is not deleting a PHOTOGRAPH. The `reap-orphaned-blobs` skill does not cover
  `nina/` and that already has its own card.
- **`/nina/jobs/[id]` gains no delete control.** The user named the list. The detail page inherits
  the filter and 404s; it gets nothing else.
- **The bulk case** — "hide every failed job at once" — is not built. He asked for a per-row icon.
- **`lib/nina/chatturn.ts` and `kind='chat'` rows** are untouched and must stay so: there is no
  chat-turn list for the flag to tidy.

---

## Rollback

This phase is code plus **one additive, nullable column**. Nothing is lost by reverting, which is
the entire point of the design.

1. **Revert the code:** `git revert <phase-2 commit>`. Every read goes back to unfiltered, and
   **every hidden job reappears on `/nina/jobs` and `/nina/about` exactly as it was** — its
   `deleted_at` is still set and simply stops being read. No data is lost and nothing has to be
   repaired.
2. **Leave the column in place.** It is nullable, unread after the revert, and costs one null
   bitmap bit per row. Dropping it is only worth doing if the feature is abandoned for good.
3. **If it is abandoned:** after the code revert has shipped and is verified in production, run
   `alter table nina_turns drop column deleted_at;` — in that order, never before, or production
   errors on every job read between the deploys. Then delete `drizzle/0008_*.sql`, its snapshot and
   its `_journal.json` entry, and re-run `npm run db:check`.
4. **To un-hide one job without reverting anything:**
   `update nina_turns set deleted_at = null where user_id = '<uid>' and id = '<job>';`

Nothing in `nina_messages`, `nina_message_images`, `nina_avatars`, `nina_chat_sessions` or Vercel
Blob was touched by this phase.
