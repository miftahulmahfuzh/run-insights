# Phase 2: Schema + job-args plumbing

**Plan set:** `PHOTOSHOP_ASPECT_RATIO_CROP_PLAN.md`
**Analysis:** `20260919-134412-K7Q2_code_analyzer.md`
**Satisfies:** R1 — the admin's chosen crop survives from the moment "Run" is clicked to the moment
the background `after()` job actually calls the model (possibly minutes later, possibly on a retry).
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/db/schema/nina`, `lib/nina`, `scripts`

---

## Goal

`nina_photoshop_jobs` gains four nullable columns (`crop_ratio_label`, `crop_scale`, `crop_x`,
`crop_y`) that durably carry an admin's aspect-ratio crop selection, and `NinaPhotoshopJobArgs`
carries them end to end: `openNinaPhotoshopJob` writes them, `claimNinaPhotoshopJob` reads them back
into `claim.args`. All four null — which is what every row written before this phase, and every
CLI-run job forever, stores — means "no crop, behave exactly as `main` does today." Nothing yet
*consumes* the fields (Phase 3) and nothing yet *supplies* them (Phase 4/5); this phase is the
carrier, and it is independently buildable and testable.

---

## READ THIS FIRST — the migration is a manual step, and it is NOT optional before deploy

Two separate, load-bearing facts, both verified against `node_modules/drizzle-orm` in this repo:

**1. `npm run db:migrate` is a step the USER runs deliberately, never this phase, never CI, never a
verification command.** `.env.local`'s `DATABASE_URL` is production — there is no dev or staging
instance (`CLAUDE.md`, and Invariant 5 of the plan index). This phase runs `npm run db:generate`
(which only writes files into `drizzle/` — it opens no connection to apply anything) and **reviews**
the generated SQL. It must not run `db:migrate`.

**2. Declaring these columns in the schema file BREAKS every photoshop job against an unmigrated
database — there is no grace period.** This is not the usual "additive nullable column, safe either
way" situation, and it is the one thing about this phase that can cause a production outage:

`drizzle-orm/pg-core/dialect.js:356-398` (`buildInsertQuery`) builds the INSERT's column list from
**every column on the table object**, not from the keys passed to `.values()` — a column with no
supplied value is emitted with the literal `default` keyword, but it is still *named in the SQL*.
Likewise `claimNinaPhotoshopJob`'s `.returning()` (no projection) and `getNinaPhotoshopJob`'s
`db.select()` both expand to every declared column. So the instant `ninaPhotoshopJobs` declares
`crop_ratio_label`, every open/claim/read statement references it, and against a database that has
not been migrated Postgres answers `column "crop_ratio_label" of relation "nina_photoshop_jobs" does
not exist` — every photoshop run fails, including ones that use no crop.

**Therefore the deploy order is: migrate FIRST, then ship — not after, not "at the same time", not
"it'll be fine, the columns are nullable".** The migration must be applied to production and
confirmed applied BEFORE the code from this phase onward is deployed. Generating and reviewing the
SQL is not applying it. Say this to the user in the phase's hand-off, in these words:

> Phase 2 generated `drizzle/00XX_<tag>.sql`. Run `npm run db:migrate` against production
> **before** this branch is deployed — the migration must already be applied when the new code goes
> live, not applied afterwards and not applied in the same breath. Between merging this branch and
> running the migration, `/admin/photoshop` and `scripts/photoshop.ts` are both broken, for every
> job, cropped or not.

A third, smaller consequence: `npm run ci:schema-drift-guard`'s **live** half will legitimately
report `"nina_photoshop_jobs"."crop_ratio_label" is declared in the schema but MISSING from the
database` if it is run from a machine with a reachable `DATABASE_URL` before the migration. That is
the guard working correctly, not a defect in this phase. CI itself is unaffected: CI's
`DATABASE_URL` is a dummy string, so only the static half runs there (see the script's own
"TWO HALVES" header comment, `scripts/check-schema-drift.mjs`).

**And the static half still gates `npm test`.** `tests/db.schemaDrift.test.ts`'s last block asserts
the real `drizzle/` folder's journal↔file bijection and snapshot `prevId` chain. So the generated
`.sql`, the updated `drizzle/meta/_journal.json`, and the new `drizzle/meta/00XX_snapshot.json`
**must all be committed together** with the schema change, or `npm test` goes red.

**Worktree note:** `/home/miftah/.worktrees/run-insights/photoshop-aspect-ratio-crop` has no
`node_modules` (verified). Run `npm ci` in the worktree before `db:generate`, `npm test`, or
`npm run typecheck`.

---

## Interface Contract

**Deletes:** none
**Renames:** none

**Creates (schema):**
- `ninaPhotoshopJobs.cropRatioLabel` → column `crop_ratio_label text` (nullable)
  (`lib/db/schema/nina/photoshop.ts`)
- `ninaPhotoshopJobs.cropScale` → column `crop_scale numeric(5, 3)` (nullable, `mode: 'number'`)
- `ninaPhotoshopJobs.cropX` → column `crop_x integer` (nullable)
- `ninaPhotoshopJobs.cropY` → column `crop_y integer` (nullable)
- `drizzle/00XX_<generated-tag>.sql` + its `drizzle/meta/00XX_snapshot.json` + a new
  `drizzle/meta/_journal.json` entry. `drizzle/` currently ends at `0034_previous_iron_monger.sql`,
  so the new file is `0035_*` unless another phase or branch lands a migration first.

**Signature changes (type widening only — every existing call site still compiles untouched):**
- `interface NinaPhotoshopJobArgs` (`lib/nina/photoshopJobs.ts:27-35`) gains four **optional**
  fields: `cropRatioLabel?: string | null`, `cropScale?: number | null`, `cropX?: number | null`,
  `cropY?: number | null`. They are optional, not required-nullable, precisely so that
  `lib/admin/photoshopActions.ts:66-74`'s existing call keeps compiling with no edit from this
  phase — Phase 4 owns adding them there.
- `openNinaPhotoshopJob(userId, args)` — unchanged signature; its INSERT now always binds the four
  columns explicitly (`args.cropX ?? null`, etc.), never leaving them to `default`.
- `claimNinaPhotoshopJob(userId, jobId)` — unchanged signature; the returned `claim.args` now always
  carries the four fields as `string | null` / `number | null` (never `undefined`).

**Creates (tests):** `tests/nina.photoshopJobs.test.ts` — a new file. Confirmed by search that **no**
test file in this repo references `openNinaPhotoshopJob`, `claimNinaPhotoshopJob`, or
`lib/nina/photoshopJobs` today; the only referencing files are `lib/nina/photoshopRun.ts`,
`lib/admin/photoshopActions.ts`, `lib/nina/photoshopResolve.ts` and the module itself.

**Requires (from earlier phases):** nothing. Phase 1 and Phase 2 are independent, and this phase
deliberately does **not** import `NINA_IMAGE_ASPECT_RATIOS` or `lib/nina/photoshopCrop.ts` — the
label column is an opaque `text` at this layer, validated at the Server Action boundary (Phase 4)
and interpreted at run time (Phase 3).

**Leaves alone (owned by others):**
- `lib/nina/imagerecipe.ts`, `lib/nina/photoshopCrop.ts` (Phase 1)
- `lib/nina/imagecall.ts`, `lib/nina/photoshopRun.ts` (Phase 3) — including
  `attemptPhotoshopOnce`'s `nearestNinaImageAspectRatio` branch, which this phase does not touch
- `lib/admin/photoshopActions.ts`, `app/admin/photoshop/[source]/[id]/page.tsx` (Phase 4)
- `components/admin/*` (Phase 5)

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/schema/nina/photoshop.ts` | modify | line 2: add `numeric` to the `drizzle-orm/pg-core` import; after line 49 (`promptText`): four new nullable crop columns |
| `drizzle/00XX_<tag>.sql` + `drizzle/meta/*` | create (generated) | `npm run db:generate` output — four `ALTER TABLE ... ADD COLUMN`s, reviewed here, **applied by the user** |
| `lib/nina/photoshopJobs.ts` | modify | lines 27-35 (`NinaPhotoshopJobArgs`), 42-55 (`openNinaPhotoshopJob`'s `.values`), 88-100 (`claimNinaPhotoshopJob`'s returned `args`) |
| `scripts/photoshop.ts` | modify | lines 206-214: the raw `insert into nina_photoshop_jobs` column list gains the four columns as explicit `null` literals |
| `tests/nina.photoshopJobs.test.ts` | create | round-trip coverage of the four fields through the recording fake DB driver |

---

## Implementation Steps

### Step 1: Declare the four columns on `ninaPhotoshopJobs`

**File:** `lib/db/schema/nina/photoshop.ts:2` and `:49`
**Change:** add `numeric` to the pg-core import, and insert the four crop columns immediately after
`promptText` — grouping them with the job's other *inputs* rather than with its `result_*` outputs.
The column shapes are copied verbatim from the precedent triple at
`lib/db/schema/nina/avatars.ts:319-324`, plus the new `text` label column. Placement in the file is
free: `scripts/check-schema-drift.mjs`'s `diffColumns` (line 275) keys tables and columns **by
name**, never by ordinal position, so the schema-file order and the physically-appended ALTER order
are allowed to differ.

**Code:** the replacement for line 2:

```ts
import { index, integer, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
```

and the replacement for line 49 (`promptText: text('prompt_text').notNull(),`) — the whole block,
in place:

```ts
    promptText: text('prompt_text').notNull(),
    /**
     * **The admin's optional aspect-ratio crop of the SOURCE photo** — four columns, all nullable,
     * and **all four null means "no crop; behave exactly as this table did before they existed."**
     * That is the same all-or-nothing convention `nina_avatars.crop_scale/crop_x/crop_y`
     * (`lib/db/schema/nina/avatars.ts`) already uses, widened by one column because this crop's
     * frame is NOT square: it is a rectangle at one exact OpenRouter `aspect_ratio` enum value, and
     * the numbers below mean nothing without knowing which one.
     *
     * They live here, on the row, rather than in React state, because a photoshop job is claimed
     * and run in the background by `after()` — arbitrarily later than the click that opened it, and
     * possibly a second time on retry. `lib/nina/photoshopJobs.ts` is the only writer and the only
     * reader; `lib/nina/photoshopRun.ts` turns them into real pixels.
     *
     * **No backfill, ever.** Every row written before this column existed reads back NULL, which is
     * exactly right: those jobs had no crop.
     */
    /** Which `NINA_IMAGE_ASPECT_RATIOS` label the admin cropped to, e.g. `'5:4'`. NULL = no crop.
     * Deliberately opaque `text` at this layer: the closed-set check against the real enum belongs
     * at the untrusted boundary (`lib/admin/photoshopActions.ts`), not in the column type. */
    cropRatioLabel: text('crop_ratio_label'),
    /** Multiple of the cover fit for the crop rectangle; NULL = no crop. See `lib/nina/photoshopCrop.ts`. */
    cropScale: numeric('crop_scale', { precision: 5, scale: 3, mode: 'number' }),
    /**
     * Per-mille of the crop frame's **WIDTH**, positive = image moves right. NULL = no crop.
     *
     * **The unit is PER-AXIS here, unlike `nina_avatars`.** That table stores both offsets in
     * thousandths of the frame's width, which is only legal because its frame is a SQUARE. This
     * frame is a rectangle at one of the provider's `aspect_ratio` values, so each axis carries its
     * own unit — `lib/nina/photoshopCrop.ts`'s header states the rule and every function there is
     * written around it. Reading these two columns with `crop.ts`'s square convention crops the
     * wrong region on the y axis for every non-square ratio.
     */
    cropX: integer('crop_x'),
    /** Per-mille of the crop frame's **HEIGHT**, positive = image moves down. NULL = no crop.
     * Height, not width — see `crop_x`'s comment. */
    cropY: integer('crop_y'),
```

**Impact:** `NinaPhotoshopJob`/`NewNinaPhotoshopJob` (the `$inferSelect`/`$inferInsert` types at
lines 73-74) automatically gain the four fields; nothing that reads a whole job row needs an edit,
because all four are nullable and optional on insert. **And every generated INSERT/SELECT/RETURNING
on this table now names the four columns** — see the READ THIS FIRST section; this is the step that
makes the migration a hard prerequisite for deploy.

---

### Step 2: Generate the migration (do NOT apply it)

**File:** `drizzle/00XX_<generated-tag>.sql` (new, plus `drizzle/meta/` updates)
**Change:** run, in the worktree, after `npm ci`:

```bash
npm run db:generate
```

`drizzle-kit generate` reads `drizzle.config.ts`, which requires `DATABASE_URL_UNPOOLED` to be set
and to be a direct (non-`-pooler`) host — but generation itself only diffs the committed snapshot
against the schema files and writes new files; it applies nothing.

**Review gate — the generated `.sql` must be exactly these four statements and nothing else.** Its
shape is `drizzle/0034_previous_iron_monger.sql`'s, one `ADD COLUMN` per statement-breakpoint:

```sql
ALTER TABLE "nina_photoshop_jobs" ADD COLUMN "crop_ratio_label" text;--> statement-breakpoint
ALTER TABLE "nina_photoshop_jobs" ADD COLUMN "crop_scale" numeric(5, 3);--> statement-breakpoint
ALTER TABLE "nina_photoshop_jobs" ADD COLUMN "crop_x" integer;--> statement-breakpoint
ALTER TABLE "nina_photoshop_jobs" ADD COLUMN "crop_y" integer;
```

If the generated file contains **any** other statement — a `DROP`, a `NOT NULL`, a change to another
table — stop and treat it as a stranded-migration symptom (`scripts/check-schema-drift.mjs`'s header
documents exactly that failure mode), not as something to commit.

**Commit all three artifacts together:** the `.sql`, the new `drizzle/meta/00XX_snapshot.json`, and
the updated `drizzle/meta/_journal.json`. `tests/db.schemaDrift.test.ts` asserts the folder's
journal↔file bijection and snapshot chain over the real `drizzle/` directory, so a partial commit
fails `npm test`.

**Impact:** no runtime impact until the user runs `npm run db:migrate`. See READ THIS FIRST.

---

### Step 3: Carry the four fields through `NinaPhotoshopJobArgs`

**File:** `lib/nina/photoshopJobs.ts:27-35`
**Change:** replace the interface with the version below. The four fields are **optional** (`?:`)
so that `lib/admin/photoshopActions.ts:66-74`'s existing object literal — which this phase does not
touch — still satisfies the type.

**Code:**

```ts
export interface NinaPhotoshopJobArgs {
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  sourceContentHash: string | null
  mode: NinaPhotoshopMode
  model: string
  presetKey: string | null
  promptText: string
  /**
   * **The admin's optional aspect-ratio crop — all four together, or none.** Optional on the way IN
   * (a caller that knows nothing about cropping, i.e. everything that exists today, simply omits
   * them) and always populated on the way BACK OUT of `claimNinaPhotoshopJob` as `null` when the
   * row stored no crop. A consumer must treat "any one of the four is null or undefined" as NO
   * CROP — a partial crop is not a crop, and guessing the missing member would crop the wrong
   * region of a real photograph. See `lib/db/schema/nina/photoshop.ts`'s column comments for the
   * units, and `lib/nina/photoshopCrop.ts` for the math that interprets them.
   */
  cropRatioLabel?: string | null
  cropScale?: number | null
  cropX?: number | null
  cropY?: number | null
}
```

**Impact:** purely additive; every existing constructor of this type compiles unchanged.

---

### Step 4: Write the four columns in `openNinaPhotoshopJob`

**File:** `lib/nina/photoshopJobs.ts:37-57`
**Change:** bind all four explicitly with `?? null`. Do **not** rely on omitting the keys: an
omitted key makes drizzle emit the literal `default` keyword for that column
(`drizzle-orm/pg-core/dialect.js:377-388`), which produces a statement whose bound-parameter list
shifts depending on the caller — a needlessly unstable thing to assert on, and a needlessly
surprising thing to read in a log.

**Code (the whole function, replacing lines 37-57):**

```ts
export async function openNinaPhotoshopJob(
  userId: string,
  args: NinaPhotoshopJobArgs,
): Promise<string> {
  const id = newId()
  await db.insert(ninaPhotoshopJobs).values({
    id,
    userId,
    sourceKind: args.sourceKind,
    sourceId: args.sourceId,
    sourceContentHash: args.sourceContentHash,
    mode: args.mode,
    model: args.model,
    presetKey: args.presetKey,
    promptText: args.promptText,
    // Bound explicitly rather than omitted: an omitted key becomes the literal `default` keyword in
    // the generated INSERT, so the statement's shape would differ between a cropped and an
    // uncropped job for no gain. `?? null` also collapses `undefined` (a caller that predates the
    // crop feature) and `null` (a caller that ran without one) to the single stored meaning.
    cropRatioLabel: args.cropRatioLabel ?? null,
    cropScale: args.cropScale ?? null,
    cropX: args.cropX ?? null,
    cropY: args.cropY ?? null,
    status: 'pending',
    errorCode: 'queued',
    attempts: 0,
  })
  return id
}
```

**Impact:** the generated INSERT gains four bound parameters. For a `numeric({ mode: 'number' })`
column drizzle binds via `mapToDriverValue = String` (`drizzle-orm/pg-core/columns/numeric.js:67`),
so `cropScale: 1.25` travels as the **string** `'1.25'`; `null` is passed through untouched
(`drizzle-orm/sql/sql.js:141` short-circuits on `null` before calling the encoder). The test in
Step 7 pins both.

---

### Step 5: Read the four columns back in `claimNinaPhotoshopJob`

**File:** `lib/nina/photoshopJobs.ts:88-100`
**Change:** add the four fields to the returned `args`. `.returning()` with no projection already
selects every column, so no query change is needed — only the mapping.

**Code (the whole function, replacing lines 67-101):**

```ts
export async function claimNinaPhotoshopJob(
  userId: string,
  jobId: string,
): Promise<NinaPhotoshopClaim | null> {
  const claimed = await db
    .update(ninaPhotoshopJobs)
    .set({ errorCode: 'running', attempts: sql`${ninaPhotoshopJobs.attempts} + 1` })
    .where(
      and(
        eq(ninaPhotoshopJobs.userId, userId),
        eq(ninaPhotoshopJobs.id, jobId),
        eq(ninaPhotoshopJobs.status, 'pending'),
        eq(ninaPhotoshopJobs.errorCode, 'queued'),
        lt(ninaPhotoshopJobs.attempts, NINA_PHOTOSHOP_MAX_ATTEMPTS),
      ),
    )
    .returning()

  const row = claimed[0]
  if (row == null) return null

  return {
    jobId: row.id,
    attempts: row.attempts,
    args: {
      sourceKind: row.sourceKind,
      sourceId: row.sourceId,
      sourceContentHash: row.sourceContentHash,
      mode: row.mode,
      model: row.model,
      presetKey: row.presetKey,
      promptText: row.promptText,
      // Always present on the way out, `null` when the row stored no crop — so a consumer's
      // all-four-non-null check is the only question it ever has to ask.
      cropRatioLabel: row.cropRatioLabel,
      cropScale: row.cropScale,
      cropX: row.cropX,
      cropY: row.cropY,
    },
  }
}
```

**Impact:** `attemptPhotoshopOnce`'s `claim.args` now carries the crop (Phase 3 reads it). Nothing
in this phase consumes it, so the behavior of a claim is byte-identical for an all-null row.

---

### Step 6: Keep `scripts/photoshop.ts`'s raw INSERT in column-list parity

**File:** `scripts/photoshop.ts:206-214`
**Change:** add the four columns as explicit `null` literals. The CLI never supplies a crop, by
construction — a terminal has no rectangle to drag (the plan index's Scope section makes this an
explicit decision, not an omission). The literals exist so the hand-written column list and the real
table never drift apart silently, which is the whole reason this file's duplication is tolerated.

**Code (replacing lines 205-214):**

```ts
const jobId = newId()
await sql`
  insert into nina_photoshop_jobs
    (id, user_id, source_kind, source_id, source_content_hash, mode, model, preset_key, prompt_text,
     crop_ratio_label, crop_scale, crop_x, crop_y,
     status, error_code, attempts, created_at)
  values (
    ${jobId}, ${userId}, ${source.sourceKind}, ${source.id}, ${source.content_hash}, ${mode}, ${model},
    null, ${instruction},
    -- A CLI run never crops: there is no browser to drag a rectangle in, so every CLI job is a
    -- "skipped the crop step" job and falls back to `nearestNinaImageAspectRatio` exactly as before.
    -- Spelled out rather than omitted so this list stays readable against the real table.
    null, null, null, null,
    'pending', 'queued', 0, now()
  )
`
```

**Impact:** none at run time (four NULLs into four nullable columns), but this statement now also
requires the migration to have been applied. `scripts/photoshop.ts` runs under
`--experimental-strip-types` and imports nothing from `lib/nina/photoshopCrop.ts` — Invariant 3's
zero-import rule is untouched by this phase, because this phase adds no import here at all.

---

### Step 7: New test file — the round trip, both ways

**File:** `tests/nina.photoshopJobs.test.ts` (new)
**Change:** create the file below. Searched and confirmed: no existing test covers
`openNinaPhotoshopJob`/`claimNinaPhotoshopJob`, so there is nothing to extend.

It uses `tests/support/fakeDb.ts`'s recording driver — the same posture as
`tests/nina.softDelete.test.ts` (which is the repo's model for "assert the generated SQL, not a
spy"). Two mechanics this file depends on, both verified in `node_modules/drizzle-orm`:

- an UPDATE/INSERT `... returning` is prepared with `isResponseInArrayMode: true`
  (`pg-core/query-builders/update.js:191`), so driver rows are **positional arrays in table column
  order** — exactly what `tableRow()` produces;
- `numeric({ mode: 'number' })` maps a driver string back with `Number(value)`
  (`pg-core/columns/numeric.js:63-65`), so `'1.250'` reads back as `1.25`.

`tableRow`'s fallback for a `numeric` column is the string `'0'` and for an `integer` it is `0` — so
the **no-crop** row must override all three numeric/integer crop columns with explicit `null`, or
the test would assert `0` where production stores `NULL`.

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ninaPhotoshopJobs } from '@/lib/db/schema'

import { installFakeDb, tableRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **The photoshop job row as a CARRIER: what goes in comes back out, and nothing else moves.**
 *
 * `openNinaPhotoshopJob` and `claimNinaPhotoshopJob` are the only writer and the only reader of
 * `nina_photoshop_jobs`' argument columns, and they are separated in time by an `after()` boundary
 * — the admin's click opens the row, and a background invocation claims it arbitrarily later, maybe
 * twice on a retry. Nothing about a crop selection can live in React state, so the only thing worth
 * asserting here is the round trip: the four `crop_*` columns come back out of a claim exactly as
 * they went into the open, and an absent crop comes back as four honest NULLs rather than as zeros.
 *
 * Written against the recording driver rather than a spy, because "was the column in the INSERT"
 * and "was `1.25` bound as the numeric string Postgres wants" are questions only the generated SQL
 * can answer — and a `numeric({ mode: 'number' })` column silently round-trips through `String()`
 * on the way out and `Number()` on the way back in.
 *
 * NOT asserted here, on purpose: whether `'5:4'` is a real OpenRouter aspect-ratio label. That
 * closed-set check belongs at the untrusted boundary (`lib/admin/photoshopActions.ts`); this layer
 * stores what it is handed, and a column type that pretended to validate would only move the lie.
 */

type Jobs = typeof import('@/lib/nina/photoshopJobs')

/** 12 chars apiece, so `isValidId` would accept them and `newId()` could have produced them. */
const USER = 'userAAAAAAAA'
const JOB = 'jobAAAAAAAAA'
const SOURCE = 'srcAAAAAAAAA'

const BASE_ARGS = {
  sourceKind: 'avatar' as const,
  sourceId: SOURCE,
  sourceContentHash: 'deadbeefcafe',
  mode: 'edit' as const,
  model: 'bytedance-seed/seedream-4.5',
  presetKey: null,
  promptText: 'bigger smile',
}

/**
 * The bound parameters of `openNinaPhotoshopJob`'s INSERT, in table column order, MINUS the
 * generated id at index 0. Drizzle emits every column of the table and binds only the ones the
 * caller supplied (the rest become the literal `default` keyword and consume no parameter), so this
 * list is: the seven pre-existing args, the four crop values, then status/errorCode/attempts.
 */
function insertParamsAfterId(crop: unknown[]): unknown[] {
  return [
    USER,
    'avatar',
    SOURCE,
    'deadbeefcafe',
    'edit',
    'bytedance-seed/seedream-4.5',
    null, // preset_key
    'bigger smile',
    ...crop,
    'pending',
    'queued',
    0,
  ]
}

let fake: FakeDb
let jobs: Jobs

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  jobs = await import('@/lib/nina/photoshopJobs')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('openNinaPhotoshopJob writes the crop columns', () => {
  it('a job with no crop binds four explicit NULLs — not four missing columns', async () => {
    fake.enqueue([])
    const id = await jobs.openNinaPhotoshopJob(USER, { ...BASE_ARGS })

    const { sql, params } = fake.only()
    expect(id).toHaveLength(12)
    expect(sql).toContain('"crop_ratio_label"')
    expect(sql).toContain('"crop_scale"')
    expect(sql).toContain('"crop_x"')
    expect(sql).toContain('"crop_y"')
    // The whole bound list, so a future column added to this INSERT cannot slip in unnoticed.
    expect(params[0]).toBe(id)
    expect(params.slice(1)).toEqual(insertParamsAfterId([null, null, null, null]))
  })

  it('a job with a crop binds all four — and the scale as the numeric STRING Postgres wants', async () => {
    fake.enqueue([])
    await jobs.openNinaPhotoshopJob(USER, {
      ...BASE_ARGS,
      cropRatioLabel: '5:4',
      cropScale: 1.25,
      cropX: 40,
      cropY: -25,
    })

    const { params } = fake.only()
    /*
     * `'1.25'`, not `1.25`. A `numeric({ mode: 'number' })` column's `mapToDriverValue` is `String`
     * — the number is a convenience on OUR side of the wire only. Asserted explicitly because a
     * future switch to `mode: 'string'` or to a plain `integer` per-mille column would change the
     * stored value's type without changing a single line of the calling code.
     */
    expect(params.slice(1)).toEqual(insertParamsAfterId(['5:4', '1.25', 40, -25]))
  })

  it('an explicit null crop and an omitted crop produce the identical statement', async () => {
    fake.enqueue([], [])
    await jobs.openNinaPhotoshopJob(USER, { ...BASE_ARGS })
    await jobs.openNinaPhotoshopJob(USER, {
      ...BASE_ARGS,
      cropRatioLabel: null,
      cropScale: null,
      cropX: null,
      cropY: null,
    })

    expect(fake.queries).toHaveLength(2)
    expect(fake.queries[0]!.sql).toBe(fake.queries[1]!.sql)
    expect(fake.queries[0]!.params.slice(1)).toEqual(fake.queries[1]!.params.slice(1))
  })
})

describe('claimNinaPhotoshopJob reads the crop back', () => {
  it('reads all four back, mapping the numeric string to a number', async () => {
    fake.enqueue([
      tableRow(ninaPhotoshopJobs, {
        id: JOB,
        userId: USER,
        sourceKind: 'avatar',
        sourceId: SOURCE,
        sourceContentHash: 'deadbeefcafe',
        mode: 'edit',
        model: 'bytedance-seed/seedream-4.5',
        presetKey: null,
        promptText: 'bigger smile',
        // The driver hands back what Postgres prints for numeric(5,3): a padded string.
        cropRatioLabel: '5:4',
        cropScale: '1.250',
        cropX: 40,
        cropY: -25,
        attempts: 1,
      }),
    ])

    const claim = await jobs.claimNinaPhotoshopJob(USER, JOB)

    expect(claim).toEqual({
      jobId: JOB,
      attempts: 1,
      args: {
        ...BASE_ARGS,
        cropRatioLabel: '5:4',
        cropScale: 1.25,
        cropX: 40,
        cropY: -25,
      },
    })
  })

  it('a row with no crop reads back four NULLs — never zeros, and never undefined', async () => {
    fake.enqueue([
      tableRow(ninaPhotoshopJobs, {
        id: JOB,
        userId: USER,
        sourceKind: 'avatar',
        sourceId: SOURCE,
        sourceContentHash: 'deadbeefcafe',
        mode: 'edit',
        model: 'bytedance-seed/seedream-4.5',
        presetKey: null,
        promptText: 'bigger smile',
        // Spelled out: `tableRow`'s own fallback for numeric is '0' and for integer is 0, and a
        // crop of scale 0 at offset 0,0 is a very different (and nonsensical) thing from no crop.
        cropRatioLabel: null,
        cropScale: null,
        cropX: null,
        cropY: null,
        attempts: 1,
      }),
    ])

    const claim = await jobs.claimNinaPhotoshopJob(USER, JOB)

    expect(claim?.args).toEqual({
      ...BASE_ARGS,
      cropRatioLabel: null,
      cropScale: null,
      cropX: null,
      cropY: null,
    })
    // `null`, not absent: a consumer's all-four-non-null check is then the only question it asks.
    expect(claim?.args).toHaveProperty('cropScale', null)
  })

  it('an unclaimable job is still null, and the claim is still one owner-scoped statement', async () => {
    fake.enqueue([])
    await expect(jobs.claimNinaPhotoshopJob(USER, JOB)).resolves.toBeNull()

    const { sql } = fake.only()
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"status" = $')
    expect(sql).toContain('returning')
  })
})
```

**Impact:** new coverage only. Note the `claim` equality assertions compare against `BASE_ARGS`
spread, so if a later phase adds another field to `NinaPhotoshopJobArgs` without threading it
through `claimNinaPhotoshopJob`, these tests go red — which is the point.

---

## Verification

Run in the worktree, after `npm ci` (the worktree has no `node_modules`):

**Generate the migration (writes files only, applies nothing):** `npm run db:generate`
**Build/typecheck:** `npm run typecheck` (`next typegen && tsc --noEmit` — the real gate; `npm run build` is not)
**Lint/format:** `npm run lint` && `npm run format:check`
**Tests:** `npm test`, and the focused file: `npx vitest run tests/nina.photoshopJobs.test.ts`
**Guards:** `npm run ci:schema-drift-guard` — expect the STATIC half green. If the machine has a
reachable production `DATABASE_URL`, the LIVE half will correctly report the four columns as
"declared in the schema but MISSING from the database" until the user migrates; that is expected
and is not a reason to change any code. Also `npm run ci:data-layer-guard` (unchanged boundaries).

**Manual check (the user's step, not this phase's):** review the generated
`drizzle/00XX_<tag>.sql` against the four-statement text in Step 2, then run `npm run db:migrate`
**before** deploying this branch.

**Exit criteria:**
1. `lib/db/schema/nina/photoshop.ts`, `lib/nina/photoshopJobs.ts` and `scripts/photoshop.ts` all
   agree on exactly four new nullable crop columns.
2. A generated migration file plus its `meta/` snapshot and journal entry are committed, contain
   only the four `ADD COLUMN`s, and have **not** been applied by any automated step.
3. `openNinaPhotoshopJob` called with no crop fields produces an INSERT whose crop parameters are
   four NULLs, and `claimNinaPhotoshopJob` reads a crop-less row back with the seven pre-existing
   args unchanged — the regression check, asserted rather than assumed.
4. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` all pass.
5. The phase's hand-off message to the user names the migration as a **required pre-deploy step**,
   in the verbatim words of the READ THIS FIRST block: `npm run db:migrate` must be applied to
   production **before** the code from Phase 2 onward is deployed. Generating and reviewing the SQL
   does not satisfy this criterion; only an applied migration does. Until it is applied, every
   photoshop job fails — cropped or not — because Drizzle names every declared column in every
   INSERT/UPDATE/SELECT/`.returning()` on this table.

---

## Assumptions

- **CONFIRMED (reconciled, round 1): Phase 1's stored crop convention is
  `{ scale: number, x: number, y: number }` with `x`/`y` as integer per-mille offsets and `scale` a
  positive multiple of the cover fit, clamped to `[1, 4]` and rounded to three decimals.** The
  column types here are exactly sized for that: `numeric(5, 3)` matches Phase 1's own
  three-decimal rounding (`NINA_PHOTOSHOP_CROP_SCALE_DECIMALS`), and `integer` holds the signed
  per-mille offsets, which Phase 1 always `Math.round`s. Phase 1's handoff states this agreement in
  the same words: *"`scale` is rounded to 3 decimals (`numeric(5,3)` as planned) and `x`/`y` are
  always integers, so `integer` columns are right."*
- **CORRECTED (reconciled, round 1): `x` is per-mille of the frame's WIDTH and `y` is per-mille of
  the frame's HEIGHT — per-axis, not both-from-width.** This phase's draft copied `crop.ts`'s
  single-unit convention into the column comments; Phase 1 deliberately does **not** do that,
  because `crop.ts`'s one-unit-for-both-axes rule is only legal for a square frame and this frame is
  a rectangle. The column comments in Step 1 have been rewritten to say so. No column TYPE changes
  — an `integer` holds either unit — but a reader who takes the wrong unit from the table crops the
  wrong region on the y axis for every non-square ratio, which is why the comment is explicit.
- **Phase 4 validates the ratio label against `NINA_IMAGE_ASPECT_RATIOS` before it ever reaches
  `openNinaPhotoshopJob`.** This phase stores an opaque string and does not defend the closed set;
  the Server Action boundary is where every other untrusted photoshop field is narrowed
  (`coercePhotoshopMode`/`coercePhotoshopModel`), and duplicating the check here would only give a
  second place for the enum to drift.
- **Phase 3 treats "any of the four is null/undefined" as no crop.** This phase's writer collapses
  `undefined` to `null` on the way in, and its reader always returns `null` rather than `undefined`
  on the way out, so that check is cheap — but enforcing all-or-nothing is Phase 4's coercion job
  and Phase 3's consumption job, not a constraint on the columns.

---

## Handoffs

- **Consuming the fields (R1, Phase 3).** `attemptPhotoshopOnce` (`lib/nina/photoshopRun.ts:76-149`)
  reads `claim.args` and, when all four crop fields are non-null, must compute the pixel box via
  Phase 1's module and pass `cropRatioLabel` as the exact `aspectRatio` — bypassing
  `nearestNinaImageAspectRatio` in **both** modes. This phase deliberately leaves
  `photoshopRun.ts`'s existing `mode === 'edit'` aspect-ratio branch untouched.
- **Supplying the fields (R1, Phase 4).** `lib/admin/photoshopActions.ts:66-74`'s
  `openNinaPhotoshopJob` call still passes only the seven original args and compiles fine; Phase 4
  adds the validated crop quartet there. This phase does not edit that file at all.
- **The ratio picker's data source (R1, Phase 1).** `NINA_IMAGE_ASPECT_RATIOS` stays module-private
  as far as this phase is concerned; nothing here imports `lib/nina/imagerecipe.ts`.
- **Deliberately NOT done here:** no index on the crop columns (nothing queries by them), no
  backfill (pre-existing rows correctly read `NULL` = no crop), no `CHECK` constraint enforcing
  all-or-nothing (the all-or-nothing rule is coerced at the boundary, exactly as
  `nina_avatars`' own crop triple does — adding an asymmetric constraint here would be a new
  convention for one table).
- **Not a drive-by:** `scripts/photoshop.ts`'s broader hand-duplication of `MODEL_RESOLUTION` and
  the model lists is a known, accepted cost documented in the analysis; this phase touches only its
  INSERT column list.

---

## Rollback

Revert this phase's commit(s). Nothing in it repurposes or removes an existing field, function or
column, so the tree returns to `main`'s behavior exactly.

**If the migration was already applied to production**, reverting the code alone is safe and
sufficient: four unreferenced nullable columns with no default and no backfill sit inert on the
table, and no row has ever been written to them by a reverted build. `scripts/check-schema-drift.mjs`
will then report them as "in the database but NOT in the schema" with "no default" — its own message
classifies that as the latent, non-outage case. To remove them for real, hand-write
`ALTER TABLE "nina_photoshop_jobs" DROP COLUMN "crop_ratio_label", DROP COLUMN "crop_scale", DROP
COLUMN "crop_x", DROP COLUMN "crop_y";` as a fresh generated migration and let the user apply it —
never by editing or deleting the committed `00XX_*.sql`, which would break the journal chain the
static drift guard asserts.

**No data is at risk either way:** nothing is backfilled, nothing is deleted, and every pre-existing
row reads back `NULL` for all four columns, which is exactly "no crop."
