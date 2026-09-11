# F03 — Data Layer

**Status:** SHIPPED 2026-08-20 (see §12) · **Depends on:** F01 (Foundation) · **Blocks:** F02, F04, F05, F06, F07, F08, F09, F11
**Owner of:** `lib/db/*`, `lib/id.ts`, `lib/date/*`, `drizzle.config.ts`, `drizzle/`

> **This is the keystone feature.** Every other feature reads or writes through this module set.
> Every exported symbol is a public API; nothing here changes later without a `## Contract deltas`
> note in the consuming plan. F03 owns **the userId-scoping invariant** (§8) — the single most
> important security property in the app — and **the reviewed-data invariant** (§2.7) — the
> property that keeps a hallucination from ever reaching a rollup, a record or a badge.

Precedent: `expense-tracking/docs/plans/F03-data-layer.md`. This plan follows its shape
(decisions → schema → queries → migration → invariant → TDD tasks → verification) and departs
from it wherever run-insights' schema — deeper (10 app tables vs. 4), append-only where the
expense tracker was mutable, and carrying a duplicate-upload guard the expense tracker never
needed — requires it.

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| Drizzle table definitions for the 10 tables in roadmap §4.3 + 4 Auth.js adapter tables | Auth.js wiring itself (F02) |
| Neon serverless client + Drizzle instance | Server Actions / route handlers (F04, F05, F07, F09, F11) |
| Migration generation + application to Neon | UI, pages, components |
| Every read AND write query the other ten features need, all ownership-scoped | `lib/metrics/*`, `lib/records/catalog.ts` rules, `lib/badges/catalog.ts` rules (F06/F09 own the rules; F03 owns the tables the rules read and write) |
| `lib/id.ts` (nanoid, no dependency) | LLM clients, Zod extraction schemas (F04) |
| `lib/date/*` — ISO-week and calendar-month range helpers the rollup queries need | `lib/format.ts` rendering (F08), `lib/env.ts` (F01) |
| The ownership-proof pattern every mutation in F04/F05/F07/F09/F11 must copy | Blob upload itself (F04) |

F03 ships **zero React**, **zero Server Actions**, **zero routes**. Pure library layer plus a
migration.

---

## 2. Decisions and their justification

### D1 · Integer units everywhere, and why it is not just a style rule (roadmap §4.2 / D5)

Every measured quantity is an integer in its smallest sensible unit: `distance_m` metres,
`duration_sec` / `avg_pace_sec` seconds, `active_kcal` / `total_kcal` kcal, `elevation_m` metres,
cadence/HR in native units. **`weight_kg` is the one deliberate exception** — `numeric(4,1)`,
because body weight has no smaller-unit integer representation worth having (roadmap §4.2 table).

Two distinct failure modes this prevents, both real, both already observed in this codebase's
sibling project:

1. **Float summation drift.** `10.67 + 5.33 + 8.2 + …` over 17 runs a month, stored as floats, is
   how a monthly total renders `180.00000000000003`. IMPLEMENTATION_PLAN §3 calls this out
   verbatim for `distance_m`; it is the same lesson the expense tracker learned from whole-rupiah
   `bigint` instead of a decimal currency type.
2. **Derived-value compounding.** `avg_pace_sec` is *stored*, computed once in TypeScript at
   commit time (`round(duration_sec / (distance_m / 1000))`), not recomputed from a float division
   on every read. A pace chart, a weekly average, and a monthly average are three more
   derivations layered on top; if the base value is a float, each layer's rounding error
   compounds into the next. An integer base value means every downstream average is at worst
   off by the rounding of that single layer — never a chain of them.

**The gotcha this does NOT prevent, and must be handled separately:** Postgres `SUM(integer)`
returns `bigint`, and `SUM(bigint)`/`SUM(numeric)` return `numeric` — and `@neondatabase/serverless`
returns both as **strings**, exactly like the expense tracker's `bigint` columns did. Storing
`distance_m` as `integer` does not make `SUM(distance_m)` immune to this. **Every aggregate in
`lib/db/queries.ts` ends in `.mapWith(Number)`** (§5.2, §5.6). Monthly-totals and all-time-totals
are the two query families where this bites hardest — they are pure aggregates.

Types enforce the contract at the boundary: `lib/db/schema.ts` types every measured column
`integer`, and `NewRunInput` (F04's Zod schema, not owned here) is `z.number().int()` end to end.
There is no path from an extracted screenshot to a stored row that touches a JS float.

### D2 · The `UNIQUE (user_id, occurred_on, started_at)` duplicate-upload guard

**The literal roadmap spec has a gap: a plain `UNIQUE` constraint treats two `NULL`s as
distinct.** Postgres does not enforce uniqueness across `NULL` columns — two rows with the same
`user_id` and `occurred_on`, both with `started_at IS NULL`, do **not** violate a plain
`UNIQUE (user_id, occurred_on, started_at)`. Extraction almost always yields a `started_at` (it is
printed on every Apple Fitness summary screenshot), but "almost always" is not a guard; a runner
who forgets to screenshot the summary card, only the splits and HR pages, produces a `started_at`
of `NULL` and the guard silently stops working on exactly the upload most likely to be a genuine
accidental duplicate (re-uploading the same splits screenshot).

**Fix (see Contract deltas #1): a functional unique index on `coalesce(started_at, '00:00:00')`**
instead of a plain column list:

```sql
create unique index runs_user_occurred_started_unq
  on runs (user_id, occurred_on, coalesce(started_at, '00:00:00'::time));
```

This closes the gap at the cost of one edge case the app must accept: two genuinely different
runs on the same calendar day, both missing `started_at`, are now indistinguishable to the guard.
That is the correct trade — a false "duplicate" (rare, resolvable by the runner adding a start
time) is far cheaper than a false negative that lets two copies of the *same* run corrupt a
month's rollup.

**What happens on conflict, end to end:**

1. F05's review-confirm action calls `commitExtractedRun(userId, input)` (§5.3).
2. The `INSERT` hits the unique index → Postgres raises `23505 unique_violation`.
3. `commitExtractedRun` catches exactly that SQLSTATE (`isUniqueViolation`, §5.3), looks up the
   colliding row **scoped to the same user** (`findRunByOccurredAndStarted`), and throws
   `DuplicateRunError` carrying the existing run's id.
4. F05's Server Action maps `DuplicateRunError` to a structured result (never a generic 500):
   `{ ok: false, code: 'DUPLICATE', existingRunId }`.
5. The review screen renders *"You already uploaded this run — [view it](/r/{existingRunId})"*
   instead of a second silent row. The extraction itself is **not discarded** — its `extractions`
   row stands as-is (§2.3); only the `runs` insert is refused.

No query in this module ever does a `SELECT` to check for a duplicate before the `INSERT`. The
unique index is the source of truth; the `SELECT` in step 3 only happens *after* the index has
already said no, purely to make the error message useful. A check-then-insert would be a TOCTOU
race between two tabs uploading the same screenshot at once — the index cannot race itself.

### D3 · `extractions` is append-only, and the query that turns it into a prompt-improvement signal

**No function in this module ever deletes an `extractions` row, and none is written.** The table
has an `INSERT` path (`createExtraction`), a small number of terminal-state `UPDATE`s written
exactly once each (`markExtractionOk` / `markExtractionRepaired` / `markExtractionFailed`,
`recordCorrections`), and reads. `grep -n "delete(extractions)" lib/db/queries.ts` must return
nothing, forever — enforce this as a CI grep, not just a comment (§7 Task 15).

**Why it is the most valuable table in the schema, more than any single run:** every field a
human corrects in review (`extractions.corrections`) is a *labelled* extraction failure —
model said X, ground truth was Y, for a known field, against a known image. `runs` only ever
holds the corrected, final value; the wrongness the model actually produced is thrown away the
moment a naive review flow overwrites it. `extractions.raw_response` + `corrections` together are
the only place that wrongness survives. After a month of real uploads this is a genuine,
queryable error profile — which field breaks most often — instead of vibes about "the prompt
feels a bit off."

**The error-profile query.** `corrections` is shaped `Record<string, {from, to}>` (roadmap §4.3);
turning N of those JSON blobs into "which field is wrong most often" needs `jsonb_each`, which
the query builder has no first-class shape for, so this one query is raw SQL via `db.execute`:

```sql
select
  kv.key                                            as field,
  count(*)::int                                     as correction_count,
  (select count(*) from extractions
     where user_id = $1 and corrections is not null) as extractions_with_corrections
from extractions, jsonb_each(extractions.corrections) as kv(key, value)
where extractions.user_id = $1
group by kv.key
order by correction_count desc;
```

```ts
export interface FieldErrorStat {
  field: string
  correctionCount: number
  /** Denominator for a per-field correction rate — same value on every row, on purpose. */
  extractionsWithCorrections: number
}

export async function getExtractionErrorProfile(userId: string): Promise<FieldErrorStat[]> {
  const result = await db.execute<{
    field: string
    correction_count: number
    extractions_with_corrections: number
  }>(sql`
    select
      kv.key                                             as field,
      count(*)::int                                      as correction_count,
      (select count(*) from ${extractions}
         where ${extractions.userId} = ${userId} and ${extractions.corrections} is not null)
                                                           as extractions_with_corrections
    from ${extractions}, jsonb_each(${extractions.corrections}) as kv(key, value)
    where ${extractions.userId} = ${userId}
    group by kv.key
    order by correction_count desc
  `)
  return result.rows.map((r) => ({
    field: r.field,
    correctionCount: Number(r.correction_count),
    extractionsWithCorrections: Number(r.extractions_with_corrections),
  }))
}
```

This is user-scoped like every other query in this module (§8) even though a single-user app
means the "error profile" is really "this author's error profile" — a future multi-user
aggregate (roadmap D8 allows any Google account) would need an explicit, separately-reviewed
unscoped variant, which does not exist today and must not be added casually.

`corrections`' internal key syntax (plain field name vs. a dotted path like `splits.3.hr` for a
nested correction) is **not** specified by the roadmap and is not enforced by this module beyond
"a JSON object of `{field: {from, to}}`" — F05 owns the path syntax it writes (Contract delta #7).

### D4 · Composite-PK child tables and the one-round-trip full-run read

`run_splits` (`PRIMARY KEY (run_id, km)`) and `run_zones` (`PRIMARY KEY (run_id, zone)`) carry no
`user_id` — ownership is proved by joining back to `runs`, exactly like the expense tracker's
`expense_items`/`expense_photos` join back to `expense_groups`. The composite PK is not
incidental: `(run_id, km)` is the natural key (a run cannot have two "km 3" rows), so it is also
the fastest possible access path for "all splits for this run" — an equality scan on the PK's
leading column, no secondary index needed.

**The full-run read (`getRunDetail`, roadmap routes `/r/[id]` and `/r/[id]/review`) is four
statements in `db.batch`, one HTTP round trip:**

```ts
export async function getRunDetail(userId: string, runId: string): Promise<RunDetail | null> {
  const [runRows, splitRows, zoneRows, photoRows] = await db.batch([
    db.select().from(runs)
      .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
      .limit(1),

    db.select().from(runSplits)
      .where(and(eq(runSplits.runId, runId), runSplitOwnedBy(userId)))
      .orderBy(asc(runSplits.km)),

    db.select().from(runZones)
      .where(and(eq(runZones.runId, runId), runZoneOwnedBy(userId)))
      .orderBy(asc(runZones.zone)),

    db.select().from(runPhotos)
      .where(and(eq(runPhotos.runId, runId), runPhotoOwnedBy(userId)))
      .orderBy(asc(runPhotos.sortOrder), asc(runPhotos.createdAt)),
  ])

  const run = runRows[0]
  if (!run) return null
  return { ...run, splits: splitRows, zones: zoneRows, photos: photoRows }
}
```

`db.batch` sends all four `SELECT`s as one Neon HTTP request inside one Postgres snapshot, so the
four results are mutually consistent (no window where a concurrent correction changes the splits
between reading the run row and reading its splits). This is the exact shape every other
"give me one run plus its children" caller (F06's metrics input, F08's run-detail page, F09's
badge evaluation, F11's share page) must copy — never a `SELECT run` followed by two more awaited
`SELECT`s, which is both three round trips and a consistency gap. **No caller may issue N+1
per-split or per-zone queries; this function is the only sanctioned way to read a full run.**

`run_photos` needs its own `id` (not a composite PK) because a photo has no natural key —
`kind` is not unique per run (a runner might screenshot the splits page twice) — so it is `text`
nanoid(12) like every other free-standing entity in this schema.

### D5 · Ownership scoping is the security boundary (full treatment in §8)

`profiles`, `runs`, `extractions`, `insights`, `records` and `badges` all carry `user_id`
directly. `run_splits`, `run_zones`, `run_photos` and `shares`' children (there are none — `shares`
also carries `user_id` directly, deliberately, see §8) reach it by joining to `runs`. Every read
and write in this module takes `userId` as an explicit parameter and it appears in every `WHERE`.
The one designed exception, `getRunByShareToken`, is unscoped by contract (roadmap D9) and is
fenced off in its own subsection with the same warning banner the expense tracker uses.

### D6 · The reviewed-data invariant — not in roadmap §4.3's column list, but load-bearing

Roadmap §4.6: *"Every badge rule is evaluated against stored, human-reviewed data only. A badge
earned from an unreviewed extraction is a badge earned from a hallucination."* The same is true
of every rollup and every record — a month total that silently includes a not-yet-confirmed
draft run is wrong the moment the runner corrects that draft's distance.

`runs.reviewed_at` is the gate. **Two classes of query exist in this module, and the split is a
contract, not an accident:**

| Class | Filter | Used by |
|---|---|---|
| **Draft-visible** | none beyond ownership | `getRunDetail` (backs both `/r/[id]` and `/r/[id]/review`), `getRunIdForExtraction` |
| **Reviewed-only** | `AND reviewed_at IS NOT NULL` | `listRuns`, `getRunsInIsoWeek`, `getRunsInMonth`, `getMonthlyTotals`, `getAllTimeTotals`, `getObservedMaxHr` — every rollup, every input to F06/F09 |

A `runs` row is created **at extraction time**, not at confirmation time (this is the only way
`/r/[id]/review` can be a stable URL that exists before the human has looked at it, and the only
way `run_photos`/`run_splits`/`run_zones` — all FK'd to `runs.id`, not `extractions.id` — have
somewhere to attach). `reviewed_at` starts `NULL` and is set exactly once, by `confirmRun` (§5.3),
the moment the human clicks confirm. **A row with `reviewed_at IS NULL` is a draft, is invisible
to every rollup query, and must never be counted toward a record or a badge.** Getting this
filter right in ten different query functions instead of once is exactly the kind of thing that
gets missed on the eleventh; §7 Task 12's test suite asserts it on every reviewed-only query by
name.

### D7 · Records are recomputed by full replace, never incremented (roadmap §4.5)

*"Records are recomputed, never incremented. A correction in review can invalidate a record; the
only safe implementation is a full recompute over the user's runs."* F06 owns the recompute
*logic* (which run wins each of the ten `records.catalog.ts` keys); F03 owns the *write*, and it
is a full replace, not ten conditional upserts:

```ts
export async function replaceRecords(userId: string, next: NewRecordRow[]): Promise<void> {
  await db.batch([
    db.delete(records).where(eq(records.userId, userId)),
    ...(next.length > 0
      ? [db.insert(records).values(next.map((r) => ({ ...r, userId })))]
      : []),
  ] as const)
}
```

Delete-then-insert in one `db.batch` (not `db.transaction` — see D-driver note below) means a key
that no longer qualifies for anyone (e.g. the run that held `longest_distance` was corrected down
below the next-longest run) simply has no row after the replace — it does not linger with a stale
`run_id`. `badges` are the opposite shape on purpose: a badge, once earned, is a fact about the
past ("you did hit 100 km that month") and is never revoked by a later correction to a *different*
run, so `upsertBadge` is a per-key `ON CONFLICT DO UPDATE` that only ever increments `count` and
moves `earned_on` forward — never a bulk replace.

### D8 · Driver and connection strings — identical reasoning to the expense tracker

`drizzle-orm/neon-http` + `neon()` from `@neondatabase/serverless`. **`db.transaction()` throws**
on this driver (`No transactions support in neon-http driver`); every multi-statement write in
this module uses `db.batch([...])`, which Neon executes as one HTTP request inside one Postgres
transaction. `DATABASE_URL` (pooled, `-pooler` host) for runtime queries; `DATABASE_URL_UNPOOLED`
(direct host) for `drizzle-kit generate/migrate/push/studio` only, read by `drizzle.config.ts`,
never by `lib/db/index.ts`. Both are already in roadmap §4.1's env list.

`lib/db/index.ts` reads `process.env.DATABASE_URL` directly rather than importing `lib/env.ts`:
`lib/env.ts` opens with `import 'server-only'`, whose default-export condition throws outside a
React Server Components graph — Vitest resolves the default condition, so routing the DB client
through it would take every unit test down with it. `lib/env.ts` (F01) still validates both
strings at boot for the app itself; this is the same value read one layer lower, for the
non-Next callers (`drizzle-kit`, `research/*.mjs`) `lib/env.ts` cannot serve either.

---

## 3. Dependencies to add

```bash
npm i drizzle-orm@0.45.2 @neondatabase/serverless@1.1.0 zod@4.4.3
npm i -D drizzle-kit@0.31.10 vitest@4.1.2
```

No `nanoid` (see `lib/id.ts`, §5.1 — 15 lines, no dependency, same 72-bit alphabet). No `dotenv`
(Node 22's `process.loadEnvFile` covers `drizzle.config.ts`). No `date-fns` (the two date helpers
this module needs — an ISO-week range and a month range — are ~30 lines of integer math each and
must stay dependency-free so they can be unit-tested with zero I/O, per Task 6).

`package.json` scripts (F01 stubs `db:*`; F03 fills them in):

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:int": "vitest run --dir tests/integration",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:check": "drizzle-kit check"
  }
}
```

---

## 4. Test harness

`vitest.config.ts` — identical shape to the expense tracker's, path alias `@/*` from F01's
`tsconfig.json`, `tests/**/*.test.ts` excluding `tests/integration/**`.

`tests/setup.ts`:

```ts
// lib/db/index.ts constructs the Neon client eagerly at import time so a missing DATABASE_URL
// is a loud boot crash in prod (roadmap §4.1), never a silent undefined. neon() performs no I/O
// at construction — a syntactically valid dummy URL lets unit tests import query modules and
// inspect .toSQL() without ever touching a network.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://u:p@ep-unit-test-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
}
```

Integration tests (§9) run via `npm run test:int`, `describe.skipIf(!process.env.TEST_DATABASE_URL)`
against a Neon **branch**, never `main`.

---

## 5. Complete source

### 5.1 `lib/id.ts`

```ts
/**
 * nanoid-compatible id generation, no dependency. 64-symbol URL-safe alphabet ⇒ `byte & 63` is
 * a perfectly uniform mapping (256 / 64 = 4), so no rejection sampling is needed and there is
 * zero modulo bias. Ported verbatim from expense-tracking/lib/id.ts (D-E there).
 */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

/** roadmap §4.3: every entity PK is nanoid(12). */
export const ID_LENGTH = 12
/** roadmap §4.3: shares.token is nanoid(16) — a longer, unguessable token by design. */
export const SHARE_TOKEN_LENGTH = 16

export function newId(size: number = ID_LENGTH): string {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i]! & 63]
  return out
}

export const newRunId = (): string => newId()
export const newExtractionId = (): string => newId()
export const newPhotoId = (): string => newId()
export const newInsightId = (): string => newId()
/** 16 × log2(64) = 96 bits. roadmap says "~71 bits"; with this alphabet at length 16 it is 96. */
export const newShareToken = (): string => newId(SHARE_TOKEN_LENGTH)

const ID_RE = /^[0-9A-Za-z_-]{12}$/
const SHARE_TOKEN_RE = /^[0-9A-Za-z_-]{16}$/

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value)
}
export function isValidShareToken(value: unknown): value is string {
  return typeof value === 'string' && SHARE_TOKEN_RE.test(value)
}
```

### 5.2 `lib/date/ranges.ts`

The rollup queries in §5.6 need index-friendly `>= / <` boundaries, not a `to_char(...) = $key`
predicate (a functional expression on the indexed column defeats the `(user_id, occurred_on)`
index). These two helpers turn a `'2026-W34'` or `'2026-08'` key into `[start, endExclusive)`
date strings, in pure integer math, with zero timezone reasoning — because `occurred_on` is
**already** the correct Asia/Jakarta calendar day by the time it reaches this table (D6 is
enforced upstream, at extraction/review time, by F04/F05; this module never re-derives a
timezone from a timestamp).

```ts
export type DateISO = string   // 'YYYY-MM-DD'
export type MonthKey = string  // 'YYYY-MM'
export type IsoWeekKey = string // 'YYYY-Www', e.g. '2026-W34'

const MONTH_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/
const WEEK_RE = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/

export function isValidMonthKey(v: unknown): v is MonthKey {
  return typeof v === 'string' && MONTH_RE.test(v)
}
export function isValidIsoWeekKey(v: unknown): v is IsoWeekKey {
  return typeof v === 'string' && WEEK_RE.test(v)
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}
function toISO(d: Date): DateISO {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** addMonths('2026-01', -1) === '2025-12'. Pure integer math, no Date construction. */
export function addMonths(month: MonthKey, delta: number): MonthKey {
  if (!isValidMonthKey(month)) throw new RangeError(`Invalid month key: ${JSON.stringify(month)}`)
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12 + 1
  return `${pad(ny, 4)}-${pad(nm)}`
}

/** monthRange('2026-08') -> { startISO: '2026-08-01', endExclusiveISO: '2026-09-01' } */
export function monthRange(month: MonthKey): { startISO: DateISO; endExclusiveISO: DateISO } {
  if (!isValidMonthKey(month)) throw new RangeError(`Invalid month key: ${JSON.stringify(month)}`)
  return { startISO: `${month}-01`, endExclusiveISO: `${addMonths(month, 1)}-01` }
}

/**
 * ISO 8601: week 1 is the week containing the year's first Thursday; weeks run Monday..Sunday.
 * Standard algorithm — the Monday of week 1 is 3 days before the year's first Thursday, found by
 * walking back from Jan 4 (which is always in week 1) to that week's Monday.
 */
export function isoWeekRange(week: IsoWeekKey): { startISO: DateISO; endExclusiveISO: DateISO } {
  if (!isValidIsoWeekKey(week)) throw new RangeError(`Invalid ISO week key: ${JSON.stringify(week)}`)
  const isoYear = Number(week.slice(0, 4))
  const weekNum = Number(week.slice(6, 8))

  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4Dow = (jan4.getUTCDay() + 6) % 7 // Mon=0 .. Sun=6
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow)

  const start = new Date(week1Monday)
  start.setUTCDate(week1Monday.getUTCDate() + (weekNum - 1) * 7)
  const endExclusive = new Date(start)
  endExclusive.setUTCDate(start.getUTCDate() + 7)

  return { startISO: toISO(start), endExclusiveISO: toISO(endExclusive) }
}

/** The ISO week key containing a given day — for grouping the "/" runs list and for badges. */
export function isoWeekKeyOf(dateISO: DateISO): IsoWeekKey {
  const d = new Date(`${dateISO}T00:00:00Z`)
  // ISO week-year algorithm: shift to the Thursday of this row's week, read its year and week.
  const dow = (d.getUTCDay() + 6) % 7
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() - dow + 3)
  const isoYear = thursday.getUTCFullYear()
  const jan1 = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil(((+thursday - +jan1) / 86_400_000 + 1) / 7)
  return `${isoYear}-W${pad(week)}`
}

/** monthKey('2026-08-18') === '2026-08' */
export function monthKey(dateISO: DateISO): MonthKey {
  return dateISO.slice(0, 7)
}
```

**Test cases that pin this down (Task 6):** `2026-01-01` is a Thursday, so week 1 of 2026 starts
Monday `2025-12-29` — `isoWeekRange('2026-W01')` must return `{ startISO: '2025-12-29',
endExclusiveISO: '2026-01-05' }`, and `isoWeekKeyOf('2025-12-29')` must round-trip to `'2026-W01'`
(a Monday in late December belonging to the *next* ISO year is the classic off-by-one this
algorithm exists to get right). `isoWeekKeyOf('2026-08-20')` — the canonical fixture's date — must
equal `'2026-W34'`.

### 5.3 `lib/db/schema.ts`

```ts
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/* ============================================================================
 * Auth.js adapter tables — canonical @auth/drizzle-adapter Postgres shape,
 * copied verbatim (roadmap §4.3: "do not hand-roll them"). No casing:'snake_case'
 * on the drizzle() call — these columns are camelCase.
 * ==========================================================================*/

type AdapterAccountType = 'oauth' | 'oidc' | 'email' | 'webauthn'

export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)

/* ============================================================================
 * App tables — AUTHORITATIVE, roadmap §4.3, with the Contract deltas in §10.
 * `extractions` is declared before `runs` because runs.extractionId references
 * it; extractions never references runs (D3 — the audit trail is independent
 * of any run it may or may not have produced).
 * ==========================================================================*/

export const profiles = pgTable('profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  birthYear: integer('birth_year'),
  heightCm: integer('height_cm'),
  /** kg, one decimal. The one non-integer measured column in the schema — see D1. */
  weightKg: numeric('weight_kg', { precision: 4, scale: 1, mode: 'number' }),
  restingHr: integer('resting_hr'),
  /** MEASURED only (roadmap §4.4). Never write a Tanaka estimate here — that lives in F02's resolver. */
  maxHr: integer('max_hr'),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true, mode: 'date' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const extractions = pgTable(
  'extractions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** The screenshots as uploaded to Blob, in review order. */
    blobUrls: jsonb('blob_urls').$type<string[]>().notNull(),
    model: text('model').notNull(), // 'glm-4.6v'
    /** The §1.1 token-floor canary (IMPLEMENTATION_PLAN), stored so the guard is auditable after the fact. */
    promptTokens: integer('prompt_tokens'),
    /** Exactly what the vision model returned. Never mutated once written. */
    rawResponse: jsonb('raw_response').$type<unknown>(),
    status: text('status').notNull(), // 'pending' | 'ok' | 'repaired' | 'failed'
    errorCode: text('error_code'),
    /** {field: {from, to}} — every human fix. Written once, at review-confirm. Never deleted (D3). */
    corrections: jsonb('corrections').$type<ExtractionCorrections>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [index('extractions_user_created_idx').on(t.userId, t.createdAt.desc())],
)

export type ExtractionCorrections = Record<string, { from: unknown; to: unknown }>

export const runs = pgTable(
  'runs',
  {
    /** nanoid(12) — lib/id.ts newRunId() */
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Asia/Jakarta calendar day, 'YYYY-MM-DD'. Set correctly upstream — see D6. Never a JS Date. */
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    /** 'HH:MM:SS', no date attached — badges like early_bird compare this directly as a string. */
    startedAt: time('started_at'),
    endedAt: time('ended_at'),
    activityType: text('activity_type').notNull().default('Outdoor Run'),
    location: text('location'),
    durationSec: integer('duration_sec').notNull(),
    distanceM: integer('distance_m').notNull(),
    activeKcal: integer('active_kcal'),
    totalKcal: integer('total_kcal'),
    elevationM: integer('elevation_m'),
    avgCadence: integer('avg_cadence'),
    /** Derived once at commit time (D1), stored for cheap sorting — never recomputed on read. */
    avgPaceSec: integer('avg_pace_sec').notNull(),
    avgHr: integer('avg_hr'),
    maxHr: integer('max_hr'),
    restingHr: integer('resting_hr'),
    intent: text('intent'), // 'easy'|'tempo'|'long'|'race'|'unspecified'
    note: text('note'),
    source: text('source').notNull(), // 'screenshot'|'manual'
    extractionId: text('extraction_id').references(() => extractions.id),
    /** NULL = draft, created at extraction time, not yet confirmed. See D6 — the reviewed-data invariant. */
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // D2 — a plain UNIQUE(user_id, occurred_on, started_at) leaks NULLs; coalesce closes the gap.
    uniqueIndex('runs_user_occurred_started_unq').on(
      t.userId,
      t.occurredOn,
      sql`coalesce(${t.startedAt}, '00:00:00'::time)`,
    ),
    // Powers "/" (newest first), every rollup's range scan, and getObservedMaxHr.
    index('runs_user_occurred_idx').on(t.userId, t.occurredOn.desc()),
  ],
)

export const runSplits = pgTable(
  'run_splits',
  {
    runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
    km: integer('km').notNull(),
    timeSec: integer('time_sec').notNull(),
    paceSec: integer('pace_sec').notNull(),
    hr: integer('hr'),
    cadence: integer('cadence'),
    /** D14 — the final partial km. Stored, shown, and EXCLUDED from every pace average by F06 — never filtered here. */
    partial: boolean('partial').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.runId, t.km] })],
)

export const runZones = pgTable(
  'run_zones',
  {
    runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
    zone: integer('zone').notNull(), // 1..5
    durationSec: integer('duration_sec').notNull(),
    minBpm: integer('min_bpm'), // NULL for zone 1
    maxBpm: integer('max_bpm'), // NULL for zone 5
  },
  (t) => [primaryKey({ columns: [t.runId, t.zone] })],
)

export const runPhotos = pgTable(
  'run_photos',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
    blobUrl: text('blob_url').notNull(),
    pathname: text('pathname').notNull(),
    kind: text('kind').notNull(), // 'summary'|'splits'|'heartrate'|'other'
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('run_photos_run_idx').on(t.runId)],
)

export const insights = pgTable(
  'insights',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(), // 'session'|'week'|'month'
    scopeKey: text('scope_key').notNull(), // run id | '2026-W34' | '2026-08'
    factsHash: text('facts_hash').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    model: text('model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('insights_user_scope_key_hash_unq').on(t.userId, t.scope, t.scopeKey, t.factsHash)],
)

export const records = pgTable(
  'records',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(), // lib/records/catalog.ts, F06
    runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
    /** Canonical unit for the key — see roadmap §4.5. Basis points for best_paced_run. */
    value: integer('value').notNull(),
    achievedOn: date('achieved_on', { mode: 'string' }).notNull(),
    previousValue: integer('previous_value'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // PK's leading column is user_id, so "all records for a user" is an index-only PK scan.
  // No separate index earns its place here.
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
)

export const badges = pgTable(
  'badges',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(), // lib/badges/catalog.ts, F09
    runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
    scopeKey: text('scope_key'), // '2026-W34' | '2026-08' for period badges
    earnedOn: date('earned_on', { mode: 'string' }).notNull(),
    count: integer('count').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
)

export const shares = pgTable(
  'shares',
  {
    /** nanoid(16) — the credential itself. See lib/id.ts newShareToken(). */
    token: text('token').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  // One ACTIVE share per run (roadmap §4.3). Revoke = set revoked_at; re-share mints a fresh token,
  // so the partial index (not a plain unique index) is what makes re-sharing possible at all.
  (t) => [uniqueIndex('shares_run_id_active_unq').on(t.runId).where(sql`${t.revokedAt} is null`)],
)

/* ============================================================================
 * Relations — convenience for db.query.*. The sanctioned read path is explicit
 * selects + db.batch (§5.4); kept because a later feature may want relational
 * reads and they cost nothing at runtime.
 * ==========================================================================*/

export const runsRelations = relations(runs, ({ one, many }) => ({
  user: one(users, { fields: [runs.userId], references: [users.id] }),
  extraction: one(extractions, { fields: [runs.extractionId], references: [extractions.id] }),
  splits: many(runSplits),
  zones: many(runZones),
  photos: many(runPhotos),
}))
export const runSplitsRelations = relations(runSplits, ({ one }) => ({
  run: one(runs, { fields: [runSplits.runId], references: [runs.id] }),
}))
export const runZonesRelations = relations(runZones, ({ one }) => ({
  run: one(runs, { fields: [runZones.runId], references: [runs.id] }),
}))
export const runPhotosRelations = relations(runPhotos, ({ one }) => ({
  run: one(runs, { fields: [runPhotos.runId], references: [runs.id] }),
}))
export const sharesRelations = relations(shares, ({ one }) => ({
  run: one(runs, { fields: [shares.runId], references: [runs.id] }),
}))

/* ============================================================================
 * Row types — import instead of re-deriving $inferSelect at call sites.
 * ==========================================================================*/

export type User = typeof users.$inferSelect
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type Extraction = typeof extractions.$inferSelect
export type NewExtraction = typeof extractions.$inferInsert
export type Run = typeof runs.$inferSelect
export type NewRun = typeof runs.$inferInsert
export type RunSplit = typeof runSplits.$inferSelect
export type NewRunSplit = typeof runSplits.$inferInsert
export type RunZone = typeof runZones.$inferSelect
export type NewRunZone = typeof runZones.$inferInsert
export type RunPhoto = typeof runPhotos.$inferSelect
export type NewRunPhoto = typeof runPhotos.$inferInsert
export type Insight = typeof insights.$inferSelect
export type NewInsight = typeof insights.$inferInsert
export type RecordRow = typeof records.$inferSelect
export type NewRecordRow = typeof records.$inferInsert
export type Badge = typeof badges.$inferSelect
export type NewBadge = typeof badges.$inferInsert
export type Share = typeof shares.$inferSelect
export type NewShare = typeof shares.$inferInsert
```

### 5.4 `lib/db/index.ts`

Byte-for-byte the expense tracker's pattern (D8): `neon()` + `drizzle()`, `globalThis` cache for
HMR, eager construction so a missing `DATABASE_URL` is a boot crash, `process.env.DATABASE_URL`
read directly (not through `lib/env.ts`), no `casing: 'snake_case'`.

```ts
import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export type Database = NeonHttpDatabase<typeof schema>

function createDb(): Database {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add the POOLED Neon connection string to .env.local ' +
        '(and to the Vercel project env). See roadmap §4.1.',
    )
  }
  return drizzle(neon(url), { schema, logger: process.env.DRIZZLE_LOG === '1' })
}

const globalForDb = globalThis as unknown as { __runInsightsDb?: Database }
export const db: Database = (globalForDb.__runInsightsDb ??= createDb())

export { schema }
export * from './schema'
```

### 5.5 `drizzle.config.ts`

Same shape as the expense tracker's: reads `.env.local` manually (Node 22's
`process.loadEnvFile`, with a fallback for older Node), uses `DATABASE_URL_UNPOOLED` (warns if it
falls back to a pooled string), points `schema` at `./lib/db/schema.ts`, `out` at `./drizzle`.

### 5.6 `lib/db/queries.ts` — signatures and the load-bearing implementations

Full file is large; every function below is either shown in full (the ones the four critical
design points depend on) or given a complete signature plus its one-line contract. **Every
function except `getRunByShareToken` takes `userId` as its first parameter.**

#### §1 — Errors

```ts
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const
  constructor(message = 'Not found') { super(message); this.name = 'NotFoundError' }
}

export class DuplicateRunError extends Error {
  readonly code = 'DUPLICATE_RUN' as const
  constructor(public readonly existingRunId: string | null) {
    super('A run already exists for this date and start time')
    this.name = 'DuplicateRunError'
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23505'
}
```

#### §2 — Ownership predicates (THE security primitive, §8)

```ts
export function runSplitOwnedBy(userId: string) {
  return exists(db.select({ ok: sql`1` }).from(runs)
    .where(and(eq(runs.id, runSplits.runId), eq(runs.userId, userId))))
}
export function runZoneOwnedBy(userId: string) {
  return exists(db.select({ ok: sql`1` }).from(runs)
    .where(and(eq(runs.id, runZones.runId), eq(runs.userId, userId))))
}
export function runPhotoOwnedBy(userId: string) {
  return exists(db.select({ ok: sql`1` }).from(runs)
    .where(and(eq(runs.id, runPhotos.runId), eq(runs.userId, userId))))
}

export async function assertRunOwned(userId: string, runId: string): Promise<void> {
  const rows = await db.select({ ok: sql<number>`1`.mapWith(Number) }).from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId))).limit(1)
  if (rows.length === 0) throw new NotFoundError('Run not found')
}
```

#### §3 — Runs: draft, commit, duplicate guard, review, list

```ts
export interface NewRunInput {
  occurredOn: DateISO
  startedAt: string | null // 'HH:MM:SS'
  endedAt: string | null
  activityType: string
  location: string | null
  durationSec: number
  distanceM: number
  activeKcal: number | null
  totalKcal: number | null
  elevationM: number | null
  avgCadence: number | null
  avgPaceSec: number
  avgHr: number | null
  maxHr: number | null
  restingHr: number | null
  source: 'screenshot' | 'manual'
  extractionId: string | null
  splits: Omit<NewRunSplit, 'runId'>[]
  zones: Omit<NewRunZone, 'runId'>[]
}

/**
 * Creates a run as a DRAFT (reviewed_at = NULL) with its splits and zones, in one db.batch.
 * Called by F04 the moment extraction succeeds — this is what gives /r/[id]/review a stable id
 * before a human has looked at anything (D6). Throws DuplicateRunError on the D2 unique index.
 */
export async function commitExtractedRun(
  userId: string,
  input: NewRunInput,
): Promise<{ runId: string }> {
  const runId = newRunId()
  try {
    await db.batch([
      db.insert(runs).values({ id: runId, userId, reviewedAt: null, ...input }),
      ...(input.splits.length > 0
        ? [db.insert(runSplits).values(input.splits.map((s) => ({ ...s, runId })))]
        : []),
      ...(input.zones.length > 0
        ? [db.insert(runZones).values(input.zones.map((z) => ({ ...z, runId })))]
        : []),
    ] as const)
    return { runId }
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await findRunByOccurredAndStarted(userId, input.occurredOn, input.startedAt)
      throw new DuplicateRunError(existing?.id ?? null)
    }
    throw err
  }
}

/** Scoped lookup used only to enrich the D2 duplicate error with a linkable run id. */
async function findRunByOccurredAndStarted(
  userId: string,
  occurredOn: DateISO,
  startedAt: string | null,
): Promise<{ id: string } | undefined> {
  const rows = await db.select({ id: runs.id }).from(runs).where(and(
    eq(runs.userId, userId),
    eq(runs.occurredOn, occurredOn),
    sql`coalesce(${runs.startedAt}, '00:00:00'::time) = coalesce(${startedAt ?? null}::time, '00:00:00'::time)`,
  )).limit(1)
  return rows[0]
}

/**
 * The review-confirm commit (F05). Sets reviewed_at, applies the human's corrected top-level
 * fields, and — if the human corrected any split/zone rows — replaces ALL of that run's splits
 * and/or zones (delete-then-insert, D7's reasoning applies here too: a km renumbered by a
 * correction cannot be safely "upserted" against the old composite key). One db.batch.
 */
export async function confirmRun(
  userId: string,
  runId: string,
  patch: Partial<NewRunInput>,
  replacementSplits?: Omit<NewRunSplit, 'runId'>[],
  replacementZones?: Omit<NewRunZone, 'runId'>[],
): Promise<void> {
  const statements = [
    db.update(runs).set({ ...patch, reviewedAt: new Date() })
      .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
      .returning({ id: runs.id }),
  ]
  if (replacementSplits) {
    statements.push(db.delete(runSplits).where(eq(runSplits.runId, runId)) as never)
    if (replacementSplits.length > 0) {
      statements.push(db.insert(runSplits).values(replacementSplits.map((s) => ({ ...s, runId }))) as never)
    }
  }
  if (replacementZones) {
    statements.push(db.delete(runZones).where(eq(runZones.runId, runId)) as never)
    if (replacementZones.length > 0) {
      statements.push(db.insert(runZones).values(replacementZones.map((z) => ({ ...z, runId }))) as never)
    }
  }
  const [[row]] = await db.batch(statements as never)
  if (!row) throw new NotFoundError('Run not found')
}

export interface RunDetail extends Run {
  splits: RunSplit[]
  zones: RunZone[]
  photos: RunPhoto[]
}

/** See D4 — the full-run read, one round trip. Draft-visible (no reviewed_at filter, D6). */
export async function getRunDetail(userId: string, runId: string): Promise<RunDetail | null> { /* §5.3 D4, shown in full above */ }

/** Reviewed-only (D6). Newest first, for "/". F08 groups by isoWeekKeyOf(occurredOn) client-side. */
export async function listRuns(
  userId: string,
  opts: { limit?: number; beforeOccurredOn?: DateISO } = {},
): Promise<Run[]> {
  const limit = opts.limit ?? 50
  return db.select().from(runs).where(and(
    eq(runs.userId, userId),
    isNotNull(runs.reviewedAt),
    opts.beforeOccurredOn ? lt(runs.occurredOn, opts.beforeOccurredOn) : undefined,
  )).orderBy(desc(runs.occurredOn), desc(runs.startedAt)).limit(limit)
}

/** Resolves the run an extraction produced, for F04's poll endpoint to redirect on completion. */
export async function getRunIdForExtraction(userId: string, extractionId: string): Promise<string | null> {
  const rows = await db.select({ id: runs.id }).from(runs)
    .where(and(eq(runs.extractionId, extractionId), eq(runs.userId, userId))).limit(1)
  return rows[0]?.id ?? null
}

export async function deleteRun(userId: string, runId: string): Promise<void> {
  const [row] = await db.delete(runs).where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .returning({ id: runs.id })
  if (!row) throw new NotFoundError('Run not found')
  // Cascade removes splits, zones, photos, shares. records.run_id also cascades — D7 means
  // this is safe: F06 recomputes records from the remaining runs on the next write.
}
```

#### §4 — Rollups (roadmap D6 / Asia/Jakarta, item 6 of the design brief)

```ts
export interface RunAggregate {
  runCount: number
  distanceM: number
  durationSec: number
}

/** Runs in one ISO week (roadmap scope_key format '2026-W34'), reviewed-only, oldest first. */
export async function getRunsInIsoWeek(userId: string, week: IsoWeekKey): Promise<Run[]> {
  const { startISO, endExclusiveISO } = isoWeekRange(week)
  return db.select().from(runs).where(and(
    eq(runs.userId, userId),
    isNotNull(runs.reviewedAt),
    gte(runs.occurredOn, startISO),
    lt(runs.occurredOn, endExclusiveISO),
  )).orderBy(asc(runs.occurredOn), asc(runs.startedAt))
}

/** Runs in one calendar month ('2026-08'), reviewed-only, oldest first. */
export async function getRunsInMonth(userId: string, month: MonthKey): Promise<Run[]> {
  const { startISO, endExclusiveISO } = monthRange(month)
  return db.select().from(runs).where(and(
    eq(runs.userId, userId),
    isNotNull(runs.reviewedAt),
    gte(runs.occurredOn, startISO),
    lt(runs.occurredOn, endExclusiveISO),
  )).orderBy(asc(runs.occurredOn), asc(runs.startedAt))
}

export interface MonthlyTotal extends RunAggregate {
  month: MonthKey
}

/**
 * Last `months` months ending at `anchorMonth` inclusive, oldest -> newest, zero-filled.
 * anchorMonth is an explicit parameter (never derived from the wall clock here) — callers pass
 * a Jakarta "today", computed once, so a midnight boundary can't change the answer mid-render.
 * SUM(integer) returns bigint/numeric over the wire as a STRING (D1's aggregate gotcha) —
 * every aggregate below ends in .mapWith(Number).
 */
export async function getMonthlyTotals(
  userId: string,
  months: number,
  anchorMonth: MonthKey,
): Promise<MonthlyTotal[]> {
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    throw new RangeError(`months must be an integer in 1..60, got ${months}`)
  }
  const firstMonth = addMonths(anchorMonth, -(months - 1))
  const startISO = monthRange(firstMonth).startISO
  const endExclusiveISO = monthRange(anchorMonth).endExclusiveISO
  const monthExpr = sql<string>`to_char(${runs.occurredOn}, 'YYYY-MM')`

  const rows = await db.select({
    month: monthExpr,
    runCount: sql<number>`count(*)`.mapWith(Number),
    distanceM: sql<number>`coalesce(sum(${runs.distanceM}), 0)`.mapWith(Number),
    durationSec: sql<number>`coalesce(sum(${runs.durationSec}), 0)`.mapWith(Number),
  }).from(runs).where(and(
    eq(runs.userId, userId),
    isNotNull(runs.reviewedAt),
    gte(runs.occurredOn, startISO),
    lt(runs.occurredOn, endExclusiveISO),
  )).groupBy(monthExpr)

  return fillZeroMonths(rows, anchorMonth, months)
}

/** Pure. Exported for unit testing (no DB) and for F08 to reuse on client-side slices. */
export function fillZeroMonths(
  rows: ReadonlyArray<{ month: string; runCount: number; distanceM: number; durationSec: number }>,
  anchorMonth: MonthKey,
  months: number,
): MonthlyTotal[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]))
  const out: MonthlyTotal[] = []
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(anchorMonth, -i)
    const r = byMonth.get(m)
    out.push({ month: m, runCount: r?.runCount ?? 0, distanceM: r?.distanceM ?? 0, durationSec: r?.durationSec ?? 0 })
  }
  return out
}

export interface AllTimeTotals extends RunAggregate {
  firstRunOn: DateISO | null
  lastRunOn: DateISO | null
}

/** Lifetime totals, reviewed-only. Powers /me. One aggregate, index-scoped, no range needed. */
export async function getAllTimeTotals(userId: string): Promise<AllTimeTotals> {
  const rows = await db.select({
    runCount: sql<number>`count(*)`.mapWith(Number),
    distanceM: sql<number>`coalesce(sum(${runs.distanceM}), 0)`.mapWith(Number),
    durationSec: sql<number>`coalesce(sum(${runs.durationSec}), 0)`.mapWith(Number),
    firstRunOn: sql<string | null>`min(${runs.occurredOn})`,
    lastRunOn: sql<string | null>`max(${runs.occurredOn})`,
  }).from(runs).where(and(eq(runs.userId, userId), isNotNull(runs.reviewedAt)))
  return rows[0] ?? { runCount: 0, distanceM: 0, durationSec: 0, firstRunOn: null, lastRunOn: null }
}

/** roadmap §4.4 rule 2 — "the highest runs.max_hr ever observed". F02's hrMax.ts depends on this. */
export async function getObservedMaxHr(userId: string): Promise<number | null> {
  const rows = await db.select({ v: sql<number | null>`max(${runs.maxHr})`.mapWith((v) => (v == null ? null : Number(v))) })
    .from(runs).where(and(eq(runs.userId, userId), isNotNull(runs.reviewedAt)))
  return rows[0]?.v ?? null
}
```

#### §5 — Extractions (§2.3 / D3)

```ts
export async function createExtraction(userId: string, blobUrls: string[], model: string): Promise<{ id: string }> {
  const id = newExtractionId()
  await db.insert(extractions).values({ id, userId, blobUrls, model, status: 'pending' })
  return { id }
}

export async function getExtraction(userId: string, id: string): Promise<Extraction | null> {
  const rows = await db.select().from(extractions).where(and(eq(extractions.id, id), eq(extractions.userId, userId))).limit(1)
  return rows[0] ?? null
}

export async function markExtractionOk(id: string, rawResponse: unknown, promptTokens: number): Promise<void> {
  await db.update(extractions).set({ status: 'ok', rawResponse, promptTokens, completedAt: new Date() }).where(eq(extractions.id, id))
}
export async function markExtractionRepaired(id: string, rawResponse: unknown, promptTokens: number): Promise<void> {
  await db.update(extractions).set({ status: 'repaired', rawResponse, promptTokens, completedAt: new Date() }).where(eq(extractions.id, id))
}
export async function markExtractionFailed(id: string, errorCode: string): Promise<void> {
  await db.update(extractions).set({ status: 'failed', errorCode, completedAt: new Date() }).where(eq(extractions.id, id))
}

/** Written exactly once, at review-confirm. Never merged with a prior value — see D3. */
export async function recordCorrections(userId: string, id: string, corrections: ExtractionCorrections): Promise<void> {
  const [row] = await db.update(extractions).set({ corrections })
    .where(and(eq(extractions.id, id), eq(extractions.userId, userId))).returning({ id: extractions.id })
  if (!row) throw new NotFoundError('Extraction not found')
}

export async function getExtractionErrorProfile(userId: string): Promise<FieldErrorStat[]> { /* §2.3, shown in full above */ }
```

#### §6 — Profile, records, badges, shares

```ts
export async function getProfile(userId: string): Promise<Profile | null> {
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
  return rows[0] ?? null
}
/** Upsert — a profile row may not exist yet on first save (onboarding). */
export async function upsertProfile(userId: string, patch: Partial<Omit<NewProfile, 'userId'>>): Promise<void> {
  await db.insert(profiles).values({ userId, ...patch })
    .onConflictDoUpdate({ target: profiles.userId, set: patch })
}

export async function getRecords(userId: string): Promise<RecordRow[]> {
  return db.select().from(records).where(eq(records.userId, userId))
}
/** D7 — full replace, delete-then-insert in one db.batch. F06 calls this after every recompute. */
export async function replaceRecords(userId: string, next: Omit<NewRecordRow, 'userId'>[]): Promise<void> { /* §2.7, shown in full above */ }

export async function getBadges(userId: string): Promise<Badge[]> {
  return db.select().from(badges).where(eq(badges.userId, userId))
}
/** Per-key upsert: first earn inserts count=1; a re-earn increments count and moves earnedOn forward. */
export async function upsertBadge(
  userId: string,
  key: string,
  earn: { runId: string | null; scopeKey: string | null; earnedOn: DateISO },
): Promise<void> {
  await db.insert(badges).values({ userId, key, ...earn, count: 1 })
    .onConflictDoUpdate({
      target: [badges.userId, badges.key],
      set: { runId: earn.runId, scopeKey: earn.scopeKey, earnedOn: earn.earnedOn, count: sql`${badges.count} + 1` },
    })
}

export async function createShare(userId: string, runId: string): Promise<{ token: string }> {
  await assertRunOwned(userId, runId)
  const token = newShareToken()
  await db.insert(shares).values({ token, userId, runId })
  return { token }
}
export async function getActiveShareForRun(userId: string, runId: string): Promise<Share | null> {
  const rows = await db.select().from(shares).where(and(eq(shares.runId, runId), eq(shares.userId, userId), isNull(shares.revokedAt))).limit(1)
  return rows[0] ?? null
}
export async function revokeShare(userId: string, token: string): Promise<void> {
  await db.update(shares).set({ revokedAt: new Date() }).where(and(eq(shares.token, token), eq(shares.userId, userId)))
}
```

#### §7 — The one unscoped query (roadmap D9)

```ts
/* ─────────────────────────────────────────────────────────────────────────
 *  ⚠️  THE ONLY UNSCOPED QUERY IN THE ENTIRE APPLICATION  ⚠️
 *  getRunByShareToken has NO userId parameter, by design (roadmap D9, /s/[token]).
 *  The 96-bit token IS the credential. Returns a SharedRun — no user_id, no note,
 *  no photos beyond what the run owner chose to keep, and NEVER extraction internals.
 *  A revoked or unknown token returns null; the page 404s. Do not add a second
 *  unscoped read anywhere in this codebase.
 * ───────────────────────────────────────────────────────────────────────── */
export interface SharedRun extends Pick<Run,
  'id' | 'occurredOn' | 'startedAt' | 'distanceM' | 'durationSec' | 'avgPaceSec' | 'avgHr' | 'elevationM'> {
  ownerName: string | null
  splits: RunSplit[]
  zones: RunZone[]
}

export async function getRunByShareToken(token: string): Promise<SharedRun | null> {
  const linkedRunId = db.select({ id: shares.runId }).from(shares)
    .where(and(eq(shares.token, token), isNull(shares.revokedAt)))

  const [runRows, splitRows, zoneRows] = await db.batch([
    db.select({
      id: runs.id, occurredOn: runs.occurredOn, startedAt: runs.startedAt, distanceM: runs.distanceM,
      durationSec: runs.durationSec, avgPaceSec: runs.avgPaceSec, avgHr: runs.avgHr, elevationM: runs.elevationM,
      ownerName: users.name,
    }).from(shares)
      .innerJoin(runs, eq(runs.id, shares.runId))
      .innerJoin(users, eq(users.id, runs.userId))
      .where(and(eq(shares.token, token), isNull(shares.revokedAt))).limit(1),
    db.select().from(runSplits).where(inArray(runSplits.runId, linkedRunId)).orderBy(asc(runSplits.km)),
    db.select().from(runZones).where(inArray(runZones.runId, linkedRunId)).orderBy(asc(runZones.zone)),
  ])
  const run = runRows[0]
  if (!run) return null
  return { ...run, splits: splitRows, zones: zoneRows }
}
```

---

## 6. Migration workflow against Neon

Identical procedure to the expense tracker (`docs.../F03-data-layer.md` §6), adjusted for this
schema:

1. `.env.local` needs both `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) from the
   Neon dashboard.
2. `npm run db:generate` → review `drizzle/0000_*.sql` line by line against this checklist:
   - [ ] **14 tables**: 4 Auth.js + `profiles`, `extractions`, `runs`, `run_splits`, `run_zones`,
     `run_photos`, `insights`, `records`, `badges`, `shares`.
   - [ ] every FK is `ON DELETE cascade` **except** `runs.extraction_id` (no cascade rule — an
     extraction is never deleted, so this never fires, but it must not be `restrict` either) and
     `badges.run_id` (`ON DELETE set null`, roadmap §4.3 — a badge survives the run that earned
     it being deleted; see D7's badges-vs-records asymmetry).
   - [ ] `occurred_on` / `achieved_on` / `earned_on` are `date`, never `timestamp`.
   - [ ] `started_at` / `ended_at` are `time`, never `timestamp`.
   - [ ] every measured column (`distance_m`, `duration_sec`, `avg_pace_sec`, kcal, elevation,
     cadence, HR fields, `records.value`) is `integer` — **none is `numeric` or `real`** except
     `profiles.weight_kg`.
   - [ ] `runs_user_occurred_started_unq` is a **unique index over an expression**
     (`coalesce("started_at", '00:00:00'::time)`), not a plain column-list `UNIQUE` constraint —
     this is the D2 fix; grep the SQL file for `coalesce`.
   - [ ] `shares_run_id_active_unq` is a **partial** unique index (`WHERE revoked_at IS NULL`).
   - [ ] `run_splits` PK is `(run_id, km)`; `run_zones` PK is `(run_id, zone)`; `records`/`badges`
     PK is `(user_id, key)`.
3. `npm run db:migrate`, then verify with `information_schema.tables` (14 rows in `public`),
   `pg_constraint` (`confdeltype = 'c'` for cascades, `'n'` for `set null` on `badges.run_id`),
   and `pg_indexes` (the six named indexes above plus PKs).
4. Commit `drizzle/`. Never hand-edit an applied migration. Never `db:push` against production.

---

## 7. TDD task breakdown

Every task: **failing test → RED → implement → GREEN → commit.** `npx vitest run tests/<file>` for
the loop, `npm test && npm run typecheck` before committing.

1. **Harness.** `tests/harness.test.ts`. Install deps, `vitest.config.ts`, `tests/setup.ts`.
2. **`lib/id.ts`.** `tests/id.test.ts` — length, alphabet, 20 000-id distinctness, `newShareToken`
   is 16 chars, `isValidId`/`isValidShareToken` reject malformed input.
3. **`lib/date/ranges.ts` — month half.** `tests/date.month.test.ts` — `addMonths`, `monthRange`
   including December/February boundaries, `isValidMonthKey`, throws on garbage.
4. **`lib/date/ranges.ts` — ISO week half.** `tests/date.isoWeek.test.ts` — the `2026-W01` /
   `2025-12-29` boundary case from §5.2, `isoWeekKeyOf('2026-08-20') === '2026-W34'` (the
   canonical fixture date), a full round trip `isoWeekKeyOf(isoWeekRange(w).startISO) === w` for
   ten arbitrary weeks spanning three different years.
5. **App tables.** `tests/db.schema.test.ts` (`getTableConfig`) — SQL names/columns for all 10
   app tables; `distance_m`/`duration_sec`/`avg_pace_sec`/`records.value` are `integer`;
   `weight_kg` is `numeric`; `occurred_on`/`achieved_on`/`earned_on` are `date`; `started_at`/
   `ended_at` are `time`; every FK's `onDelete`, specifically asserting `runs.extraction_id` has
   none and `badges.run_id` is `set null`; the six named indexes exist with the right columns;
   `run_splits`/`run_zones` composite PKs; `records`/`badges` composite PKs.
6. **Auth.js tables.** Extend `tests/db.schema.test.ts` — mirrors expense tracker's Task 9
   verbatim (SQL names, camelCase columns, composite PKs, `user.email` unique).
7. **DB client.** `tests/db.client.test.ts` — missing `DATABASE_URL` rejects; globalThis cache
   returns the same instance across two imports.
8. **Generate + apply migration.** No unit test — the §6 checklist is the test. Two commits
   (`db:generate` review, then `db:migrate` + verification queries pasted into the commit body).
9. **Ownership predicates.** `tests/db.ownership.test.ts` — mirrors the expense tracker's file
   almost line for line: `runSplitOwnedBy`/`runZoneOwnedBy`/`runPhotoOwnedBy` each produce
   `exists(...)` SQL correlating back to `runs.user_id`; `assertRunOwned` filters on both `id` and
   `user_id` and throws `NotFoundError` (never a distinguishable message) when the run is missing
   **or** belongs to someone else. This is the app's core security regression guard — label the
   file header as such.
10. **`getRunDetail`.** `tests/db.queries.runDetail.test.ts` — asserts the shape is `db.batch` of
    exactly 4 statements (mock the driver and count calls), that splits are ordered by `km`, zones
    by `zone`, photos by `sortOrder`, and that a run owned by another user returns `null` without
    throwing.
11. **`commitExtractedRun` + the D2 duplicate guard.** `tests/db.queries.duplicateRun.test.ts` —
    a mocked unique-violation error (`{ code: '23505' }`) on the second insert causes
    `commitExtractedRun` to throw `DuplicateRunError`, and that the error's `existingRunId` is
    populated from a real (mocked) lookup scoped to the same `userId`. Assert the generated
    unique-index SQL uses `coalesce(started_at, '00:00:00'::time)` (this can be asserted directly
    off the migration SQL file, not just the schema object).
12. **Reviewed-only filter, exhaustively.** `tests/db.queries.reviewedOnly.test.ts` — for
    **every** function in the "reviewed-only" row of §2.6's table
    (`listRuns`, `getRunsInIsoWeek`, `getRunsInMonth`, `getMonthlyTotals`, `getAllTimeTotals`,
    `getObservedMaxHr`), assert the generated SQL contains `"reviewed_at" is not null`. This test
    exists specifically because the failure mode (forgetting the filter on the eleventh query) is
    silent and produces a plausible-looking wrong number, not a crash.
13. **Rollups.** `tests/db.queries.rollups.test.ts` — `getRunsInIsoWeek`/`getRunsInMonth` use
    range predicates (`>= / <`), never `to_char(...) =`, against the indexed column (assert no
    `to_char` appears in the `WHERE` clause, only in the `SELECT`/`GROUP BY` of
    `getMonthlyTotals`); `getMonthlyTotals` returns exactly N zero-filled entries via
    `fillZeroMonths` (pure-function unit tests, no DB, mirroring the expense tracker's
    `fillZeroMonths` tests); `getAllTimeTotals` returns zeros and `null` dates for a user with no
    runs.
14. **`replaceRecords` and `upsertBadge`.** `tests/db.queries.recordsAndBadges.test.ts` —
    `replaceRecords` emits a `db.batch` of `DELETE` then `INSERT` (never an `UPDATE`); calling it
    with an empty array only deletes; `upsertBadge` emits `ON CONFLICT (user_id, key) DO UPDATE`
    with `count = badges.count + 1` in the `SET` clause — never a plain overwrite of `count`.
15. **Extractions and the error-profile query.** `tests/db.queries.extractions.test.ts` — the
    `createExtraction` → `markExtractionOk` → `recordCorrections` lifecycle; a CI-enforced grep
    (`! grep -n "delete(extractions)" lib/db/queries.ts`) proving no delete path exists (D3);
    `getExtractionErrorProfile`'s raw SQL contains `jsonb_each` and is scoped by `user_id` in both
    the outer query and the correlated subquery.
16. **Shares.** `tests/db.queries.shares.test.ts` — `createShare` asserts ownership first;
    `getRunByShareToken` returns `null` for both an unknown and a revoked token, and the returned
    object has no `userId`/`note` field even if TypeScript would otherwise let one leak through a
    careless `select()` with no column list (assert the *keys* of the returned object, not just
    its values).
17. **Integration suite.** `tests/integration/queries.int.test.ts`, `test:int`, skipped without
    `TEST_DATABASE_URL` — see §9.

---

## 8. The userId-scoping invariant

> **Read this before writing any mutation in F04, F05, F07, F09 or F11.**

### 8.1 The ownership graph

```
users.id ──< profiles.user_id            (1:1, direct)
         ├──< runs.user_id               (direct)
         │        ├──< run_splits.run_id     (no user_id — join to runs)
         │        ├──< run_zones.run_id      (no user_id — join to runs)
         │        └──< run_photos.run_id     (no user_id — join to runs)
         ├──< extractions.user_id        (direct — independent of any run it produced, D3)
         ├──< insights.user_id           (direct)
         ├──< records.user_id            (direct, PK prefix)
         ├──< badges.user_id             (direct, PK prefix)
         └──< shares.user_id             (direct — AND shares.run_id, both present)
```

`shares` carrying `user_id` directly (rather than only reaching it through `run_id`, the way the
expense tracker's `share_links` only reaches it through `group_id`) is deliberate: a share is
revoked or created by its owner regardless of which run it points at, and roadmap §4.3 spells out
both columns. It costs nothing and removes one join from `createShare`/`revokeShare`.

### 8.2 Statement

1. Every read and write filters on `user_id = <session user id>` — directly for the six tables
   that carry it, via a correlated `EXISTS` (§5.6 §2) for `run_splits`, `run_zones`, `run_photos`.
2. The one exception is `getRunByShareToken` (§5.6 §7), marked with its own banner comment. There
   is never a second exception.
3. A row that exists but is not yours, and a row that does not exist, are the **same outcome**:
   `NotFoundError` → HTTP 404. Distinguishing them is an id-enumeration oracle.
4. `userId` comes from `await requireUserId()` (F02) — **never** from a Server Action argument, a
   form field, a header, or a URL segment.

### 8.3 The pattern every nested mutation must copy

```ts
// F09, evaluating a session badge — the shape every F04/F05/F07/F09/F11 mutation must have
export async function markBadgeIfEarned(userId: string, runId: string, key: string): Promise<void> {
  await assertRunOwned(userId, runId)   // proof, before any child write
  const run = await getRunDetail(userId, runId)
  if (!run || !ruleFires(key, run)) return
  await upsertBadge(userId, key, { runId, scopeKey: null, earnedOn: run.occurredOn })
}
```

For a table with no `user_id` of its own (`run_splits`, `run_zones`, `run_photos`), any direct
`UPDATE`/`DELETE` against it must carry the ownership predicate **in the same statement**:

```ts
await db.delete(runPhotos)
  .where(and(eq(runPhotos.id, photoId), runPhotoOwnedBy(userId)))
  .returning({ runId: runPhotos.runId, pathname: runPhotos.pathname })
// zero rows returned => missing OR not yours. Never SELECT-then-DELETE — that is a TOCTOU window.
```

### 8.4 Review checklist for F04/F05/F07/F09/F11

- [ ] Does every exported action begin with `const userId = await requireUserId()`?
- [ ] Does `userId` appear in the `where` of every statement the action executes?
- [ ] Is `userId` absent from every action's parameter list?
- [ ] Is `getRunByShareToken` still the only unscoped read? (`grep -rn "from(runs)" app lib` and
      manually check every hit carries a `userId` predicate or is that one function.)
- [ ] Does `/s/[token]` render only `SharedRun` fields — no `note`, no `userId`, no extraction
      internals, no email?
- [ ] Does the route middleware protect `/`, `/upload`, `/r`, `/trends`, `/me`, `/onboarding` and
      explicitly **not** `/s`?
- [ ] Does every rollup/record/badge-input query carry `reviewed_at is not null` (§2.6/§8's sister
      invariant)?

---

## 9. Integration tests

`tests/integration/queries.int.test.ts`, `npm run test:int`, against a Neon **branch**,
`describe.skipIf(!process.env.TEST_DATABASE_URL)`.

Setup: two users `u1`/`u2`; for `u1`, three reviewed runs (one in `2026-08`, one in `2026-06`, one
matching the canonical fixture: `2026-08-20`, `10670` m, `4716` s, 11 splits, 5 zones, 2 photos)
plus one **draft** run (`reviewed_at = NULL`) in `2026-08`; for `u2`, one reviewed run in
`2026-08`. One extraction with `corrections = {"distanceM": {"from": 10600, "to": 10670}}`.

Assertions that matter:

1. **Draft invisibility.** `listRuns('u1', {})` and `getMonthlyTotals('u1', 1, '2026-08')` never
   count `u1`'s draft run; `getRunDetail('u1', <draft id>)` still returns it.
2. **Cross-user isolation.** `getRunsInMonth('u2', '2026-08')` never contains a `u1` id.
   `getRunDetail('u2', <u1 run id>)` is `null`. `assertRunOwned('u2', <u1 run id>)` throws
   `NotFoundError`.
3. **The D2 guard.** Inserting a second run for `u1` with the same `occurredOn`/`startedAt`
   throws `DuplicateRunError` whose `existingRunId` matches the first. Inserting a second run
   with the same `occurredOn` and **both** `startedAt` values `NULL` also throws (proving the
   `coalesce` fix, not the literal roadmap spec, is what's deployed).
4. **`getRunDetail` round-trip count.** Wrap the Neon fetch with a counter; exactly **1** HTTP
   request for a run with 11 splits + 5 zones + 2 photos. This is the N+1 regression guard (D4).
5. **`getMonthlyTotals` zero-fill and the aggregate-string gotcha.** `typeof distanceM ===
   'number'` (not `'string'`) for every one of 12 entries; `'2026-07'` is present at `0`;
   `'2026-08'` sums to `10670` for `u1`'s two reviewed August runs... (extend with a second
   reviewed August run in the fixture to make the sum non-trivial).
6. **ISO week.** `getRunsInIsoWeek('u1', '2026-W34')` returns the canonical fixture run;
   `getRunsInIsoWeek('u1', '2026-W33')` does not.
7. **`getExtractionErrorProfile`.** Returns one row, `field: 'distanceM'`, `correctionCount: 1`.
8. **Share lifecycle.** `getRunByShareToken` returns the run for a live token, `null` after
   `revokeShare`, and the returned object's keys never include `note` or `userId` even via
   `Object.keys`.
9. **Cascade.** Deleting a run removes its splits, zones, photos and shares, and `SET NULL`s any
   badge that pointed at it (never deletes the badge). Deleting a user removes everything of
   theirs including `extractions` (the only place `extractions` is ever removed — user deletion,
   not any query in this module).
10. **`replaceRecords` under a correction.** Seed a `longest_distance` record pointing at a run,
    then call `replaceRecords('u1', [])` (simulating "the correction demoted this run and no run
    now qualifies") — `getRecords('u1')` returns `[]`, not a stale row.
11. **TZ independence.** Run the whole file with `TZ=America/New_York npm run test:int` too — every
    result must be identical, proving D6/§5.2's "no Date, no timezone reasoning inside this
    module" claim.

---

## 10. Contract deltas

Six, against roadmap §4.3. None changes a shape another feature was told to expect; all close a
gap or add plumbing the rollup/duplicate-guard/audit requirements need.

1. **The duplicate-upload guard is a functional unique index, not the literal `UNIQUE (user_id,
   occurred_on, started_at)`.** `create unique index ... on runs (user_id, occurred_on,
   coalesce(started_at, '00:00:00'::time))`. Rationale: Postgres treats two `NULL`s as distinct
   in a plain `UNIQUE`, so the literal spec silently stops guarding the moment a screenshot set
   omits the summary card. See D2. Every consumer (F04, F05) sees the same behavior — "this run
   already exists" — the delta is purely which SQL enforces it.

2. **`lib/id.ts` and `lib/date/ranges.ts` are owned here** though the roadmap's F03 row doesn't
   name them. Both are load-bearing plumbing the schema and the rollup queries cannot function
   without (id generation for ten `text` PKs; ISO-week/month range math for the queries item 6 of
   this plan's brief explicitly requires). Additive; no other feature was told to expect these
   paths differently.

3. **`runs.reviewed_at IS NOT NULL` is a mandatory filter on every rollup, list and
   badge/record-input query** (§2.6, §8.4). Roadmap §4.3 defines the column; it does not spell
   out which queries must filter on it. This plan makes it explicit and gives it a name (the
   "reviewed-data invariant") because roadmap §4.6 already implies it for badges and the same
   reasoning silently generalizes to every other aggregate — undocumented, it is the single most
   likely thing a later feature gets wrong.

4. **`records` are replaced by `DELETE` + `INSERT` in one `db.batch`, not per-key upserts.**
   Roadmap §4.5 says "recomputed, never incremented" but doesn't specify the write shape. A
   per-key upsert cannot make a record disappear when a correction removes its last qualifying
   run; a full replace can. See D7.

5. **`badges.run_id` is `ON DELETE SET NULL`** (present in roadmap §4.3's column list already —
   flagged here only because it is the one FK in the schema that is *not* cascade, and the
   migration checklist (§6) calls it out explicitly so it isn't "corrected" to cascade by a later
   contributor pattern-matching on every other FK in the file).

6. **`extractions.corrections`' internal key syntax (plain field name vs. a dotted/bracketed path
   for a nested split/zone correction) is unspecified by this module and owned by F05,** the
   first feature that actually writes a nested correction. F03 only enforces the outer shape:
   `Record<string, {from: unknown, to: unknown}>`.

---

## 11. Interfaces this feature publishes

Exhaustive list of what other features import. Any change here needs a Contract delta in the
consuming plan.

| Module | Key exports | Consumed by |
|---|---|---|
| `lib/id.ts` | `newRunId`, `newExtractionId`, `newPhotoId`, `newInsightId`, `newShareToken`, `isValidId`, `isValidShareToken` | F04, F05, F09, F11 |
| `lib/date/ranges.ts` | `monthRange`, `addMonths`, `isoWeekRange`, `isoWeekKeyOf`, `monthKey`, `DateISO`, `MonthKey`, `IsoWeekKey` | F06, F07, F08, F09 |
| `lib/db/schema.ts` | all tables, relations, row types (`Run`, `RunDetail`'s constituents, `Profile`, `Extraction`, …) | F02, F04, F05, F06, F07, F08, F09, F11 |
| `lib/db/index.ts` | `db`, `schema` | every feature that touches the DB |
| `lib/db/queries.ts` | everything in §5.6 — ownership predicates, `commitExtractedRun`, `confirmRun`, `getRunDetail`, `listRuns`, `getRunsInIsoWeek`, `getRunsInMonth`, `getMonthlyTotals`, `getAllTimeTotals`, `getObservedMaxHr`, extraction CRUD + `getExtractionErrorProfile`, `getProfile`/`upsertProfile`, `getRecords`/`replaceRecords`, `getBadges`/`upsertBadge`, `createShare`/`getActiveShareForRun`/`revokeShare`/`getRunByShareToken`, `NotFoundError`, `DuplicateRunError` | F02 (`getObservedMaxHr`, `getProfile`/`upsertProfile`), F04 (`createExtraction`, `commitExtractedRun`, extraction marks), F05 (`confirmRun`, `recordCorrections`, `getRunDetail`), F06 (`getRunDetail`, rollups, `replaceRecords`), F07 (rollups, `insights` table), F08 (`listRuns`, rollups, `getRunDetail`), F09 (`getRunDetail`, `getBadges`/`upsertBadge`), F11 (`createShare`/`revokeShare`/`getRunByShareToken`) |

---

## 12. Execution record — 2026-08-20

F03 executed end to end. Migration generated, applied to Neon and verified; 188 unit tests and 40
integration tests green; `typecheck`, `lint`, `format:check` and `next build` clean.

**Where this plan was overruled.** The plan was written before `RECONCILIATION_v0.1.0.md`
existed, and R-1 in particular invalidates its §2.6/D6 model. The roadmap-plus-reconciliation pair
wins (roadmap preamble), so what shipped follows those and not §5.3's schema block. The
differences are listed under "Contract deltas as built" below; §1–§11 above are otherwise intact
and still describe what was built.

### What shipped

| Path | Contents |
|---|---|
| `lib/id.ts` | nanoid-compatible ids, no dependency. `newRunId`/`newExtractionId`/`newPhotoId`/`newInsightId` (12 chars), `newShareToken` (16 chars, 96 bits), `isValidId`, `isValidShareToken` |
| `lib/date/ranges.ts` | `monthRange`, `addMonths`, `monthKey`, `isoWeekRange`, `isoWeekKeyOf`, `addDays`, `daysBetween`, validators. Zero dependencies, zero timezone reasoning |
| `lib/db/schema.ts` | 14 tables (4 Auth.js + 10 app), 8 named indexes, relations, row types |
| `lib/db/index.ts` | `neon()` + `drizzle()`, `globalThis` cache, eager construction, `process.env.DATABASE_URL` read directly |
| `lib/db/queries.ts` | 45 exported functions across nine sections |
| `drizzle/0000_confused_madame_hydra.sql` | The one migration, applied |
| `scripts/check-data-layer-invariants.mjs` | CI guard: no `delete(extractions)`, and `getRunByShareToken` is still the only unscoped read |
| `tests/support/fakeDb.ts` | The recording driver the unit suites run against |
| 14 unit suites + 1 integration suite | 188 + 40 tests |

### The migration, verified against the live database

`information_schema` / `pg_constraint` / `pg_indexes` on `ep-winter-bonus-azjhv7a4`:

```
TABLES (14): account, badges, extractions, insights, profiles, records, run_photos,
             run_splits, run_zones, runs, session, shares, user, verificationToken
FKS: 17 total, 15 cascade
NON-CASCADE: badges_run_id_runs_id_fk = n (set null, R-22)
             runs_extraction_id_extractions_id_fk = a (no action, D3)
runs_user_occurred_started_unq  UNIQUE (user_id, occurred_on,
                                COALESCE(started_at, '00:00:00'::time))     <- R-5, live
shares_run_id_active_unq        UNIQUE (run_id) WHERE (revoked_at IS NULL)  <- partial, live
runs_user_maxhr_idx             (user_id, max_hr DESC)                      <- R-12
insights_latest_idx             (user_id, scope, scope_key, created_at DESC)<- R-12
```

Every §6 checklist item passed, and the two that are easiest to get silently wrong — the
`coalesce` expression index and the partial share index — are now asserted against the migration
FILE as well as the schema object (`tests/db.queries.commitRun.test.ts`), because a schema object
that says `coalesce` and a migration that does not would leave production unguarded.

### Measured facts that only a real database could establish

| Claim | Result |
|---|---|
| `getRunDetail` is one HTTP round trip for a run with 11 splits + 5 zones + 2 photos | **1 request**, counted at `neonConfig.fetchFunction` |
| Two runs on one day with **both** `started_at` NULL collide | **They do** — the literal roadmap `UNIQUE` would have let both in |
| `SUM(integer)` arrives as a string | **It does**; every aggregate needed `.mapWith(Number)` |
| A draft run (`reviewed_at IS NULL`) is invisible to rollups but visible to `getRunDetail` | Confirmed on both sides |
| Deleting a run SET NULLs its badge instead of deleting it | Confirmed |
| Whole suite under `TZ=America/New_York` | **40/40 identical** — D6's "no timezone reasoning in this module" holds |

The integration suite is safe against a shared database: it creates two users with a unique
suffix and deletes them in `afterAll`, which cascades everything away. Verified — all 11 tables
back to 0 rows afterwards.

### Contract deltas as built (supersede §10 where they differ)

1. **`commitExtractedRun` creates a REVIEWED run, and is the only thing that creates a run at
   all (R-1).** The plan's §2.6 has F04 insert a draft at extraction time so `/r/[id]/review` has
   a stable URL. R-1 killed that: `occurred_on` is NOT NULL and unknown at upload, so a draft
   needs a placeholder date, and the R-5 index then rejects the second upload of any day — two
   weekend runs, one broken app. The signature keeps its name; `reviewedAt` is set at INSERT, and
   the function also backfills `run_photos.run_id` for the extraction's photos.

2. **`confirmRun` does not exist; `applyRunCorrections` replaces it.** With the run born reviewed,
   nothing needs to *set* `reviewed_at` later. What F05 needs instead is the R-8 post-review edit:
   same wholesale child replacement, but it stamps `corrected_at` and never touches
   `reviewed_at`. It maps a dedupe collision (from an edited date) to `DuplicateRunError` too.

3. **`run_photos` gained a lifecycle of its own** — `attachExtractionPhotos`,
   `listExtractionPhotos`, `setPhotoExcludedFromShare` (R-11), `updatePhotoBlobLocation` (R-15's
   rotation), `deletePhoto`. The plan had none of these because in its model photos attached to a
   run. `runPhotoOwnedBy` therefore accepts EITHER parent: an extraction before the commit, a run
   after it.

4. **`markExtraction*` and `recordCorrections` take `userId` first**, like everything else. The
   plan omitted it on the marks because the background job "already owns the id". It also always
   has the userId, so the scoping invariant costs nothing and holds without exception —
   `scripts/check-data-layer-invariants.mjs` can then enforce the rule mechanically instead of
   listing per-function exemptions.

5. **`corrections` is `Record<string, CorrectionEvent[]>` (R-7), and the error-profile query counts
   EVENTS.** `getExtractionErrorProfile` gained `extractionCount` alongside `correctionCount`, and
   guards `jsonb_array_length` with `jsonb_typeof(...) = 'array'` — the function raises on a
   non-array, so one pre-R-7 row would otherwise take the whole query down.

6. **Insight queries ship here** (`getInsight`, `getLatestInsight`, `saveInsight`), which the plan
   listed only as "the `insights` table". `saveInsight` is insert-if-new (`ON CONFLICT DO NOTHING`,
   then read the winner), never an upsert: an insight a runner has already read is immutable, and
   a cron refresh racing a page view must not rewrite it.

7. **`getRunByShareToken` returns more than the plan's `SharedRun`** — `activityType`, `location`,
   `maxHr`, `activeKcal`, `avgCadence`, non-excluded `photos` (R-11), and `insightPayload`: the
   frozen session insight, which is what lets `/s/[token]` render a %HRmax without resolving HRmax
   live (R-11 / F02 INVARIANT B). Still an explicit column list, still no `note`/`userId`/email.
   **F11 must strip `doNext` and `questionForRunner` from that payload (R-27).**

8. **Two additions the later features need:** `getRunsBetween` (R-6's rolling 7/28-day ACWR
   windows are neither a week nor a month) and `getObservedMaxHrExcludingRun` (R-3 point 3 —
   F09's `new_ceiling` badge, and *only* that; using it for metrics would reintroduce the formula
   estimate exactly where the measurement is strongest).

9. **`db:push` was not added** to `package.json`, though §3 lists it. There is one database and
   `db:push` against it would bypass the migration history the §6 checklist depends on. `db:check`
   and `test:int` were added.

### Notes for whoever picks up F02, F04 and F05

- `lib/db/index.ts` deliberately does **not** import `lib/env.ts` (D8). Do not "tidy" that: the
  `server-only` import in `lib/env.ts` would take every unit test with it.
- Read a full run with `getRunDetail` and nothing else. It is 4 statements in one batch and one
  snapshot; a `SELECT run` followed by two awaited child selects is three round trips AND a
  consistency gap.
- Every new mutation starts with `const userId = await requireUserId()` and passes it as the first
  argument. `scripts/check-data-layer-invariants.mjs` fails the build on a new unscoped export,
  and `tests/db.ownership.test.ts` fails on a dropped ownership predicate.
- Adding a rollup means adding it to `tests/db.queries.reviewedOnly.test.ts`. That file's last
  test enumerates every rollup-shaped export by name specifically so a new one cannot slip in
  without a human deciding whether it is reviewed-only.
- `tests/support/fakeDb.ts` is how to unit-test a query without a database: `installFakeDb()`,
  then `await import('@/lib/db/queries')`. It records real generated SQL, so assertions about a
  `WHERE` clause are assertions about what Postgres would actually receive.
