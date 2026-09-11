# F13 — The badge award ledger

> **Fixes:** the count-inflation defect recorded in `F12-badge-panel.md` §4.1, and the missing
> "first earned" date recorded alongside it.
> **Depends on:** F03 (schema, `queries.ts`, the `neon-http`/`db.batch` constraint), F09
> (`lib/badges/*` — `evaluate.ts`'s `award`/`isNews`, `gateway.ts`, `shelf.ts`, `facts.ts`), F12
> (`BadgeDialog`, the shelf's count pill).
> **Owns:** the `badges` primary key, `lib/badges/facts.ts`' new fold, `getBadgeAwards` /
> `insertBadgeAward` in `queries.ts`, and one migration.
> **Does NOT touch:** `catalog.ts`, `meta.ts`, `rules.ts`, any threshold, any badge's condition, or
> what a badge means. This is a counting fix.

---

## 1. The defect, reproduced

`lib/badges/evaluate.ts`:

```ts
function isNews(existing: StoredBadge | undefined, earn: BadgeEarn): boolean {
  if (!existing) return true
  switch (badgeScope(earn.key)) {
    case 'session':
      return existing.runId !== earn.runId
    …
```

`badges` holds **one row per `(user_id, key)`**, so `existing.runId` is the *last* run to earn that
badge — not the set of every run that ever did. Walk it:

| step | action | `badges` row after | correct count |
|---|---|---|---|
| 1 | review run **A**, `early_bird` fires | `run_id = A, count = 1` | 1 |
| 2 | review run **B**, `early_bird` fires | `run_id = B, count = 2` | 2 |
| 3 | re-review run **A** (a split was wrong) | `A !== B` → **`count = 3`** | **2** |

Step 3 is the bug. The comment above `isNews` claims *"Re-committing the same run after a
post-review edit must not increment anything"*, and that is true only while the run being
re-committed is the most recent one to have earned the badge. Every earlier one is a false
increment, and it repeats on every subsequent re-review.

`week` and `month` have the identical shape with `scopeKey` in place of `runId`: re-reviewing a run
from an *earlier* week, after a later week has already qualified, re-fires `self_reward`. `lifetime`
is immune, because `isNews` returns `false` unconditionally for it.

**Severity.** The count only ever inflates, never deflates, and only under re-review. No other
number in the app derives from it: `count` is read by `buildShelf` and rendered by `BadgeShelf` and
`BadgeDialog`, and by nothing else. So this is a display defect with a permanent write behind it —
which is why it needs fixing rather than tolerating: the wrong number is durable.

---

## 2. The fix, in one sentence

**Stop asking the application whether an earn is news, and let the primary key answer.** Widen
`badges`' PK from `(user_id, key)` to `(user_id, key, dedupe_key)`, insert every earn with
`ON CONFLICT DO NOTHING … RETURNING`, and derive `count` / `first` / `latest` by folding the rows.

`dedupe_key` is the earn's own scope identity:

| scope | `dedupe_key` | one row per |
|---|---|---|
| `session` | the run id | run |
| `week` | `'2026-W34'` | ISO week |
| `month` | `'2026-08'` | calendar month |
| `lifetime` | `''` | account, forever |

Every line of §7's `count` policy survives verbatim — a session badge re-fires on a *different*
run, a week badge on a *different* week, a lifetime badge never — but it is now enforced by a
uniqueness constraint instead of by a read-then-compare that can only see one row. Re-committing
run A cannot insert a second `(user, early_bird, A)`, so step 3 above becomes a no-op at the
database, not at the discretion of a function.

Three things fall out for free:

1. **`isNews` disappears**, and with it `award()`'s `readBadges` call — one fewer query per review
   commit.
2. **`newlyEarned` gets more accurate, not just cheaper.** It is now what the `RETURNING` clause
   returned: rows that were genuinely written. Today it is what `isNews` predicted would be
   written.
3. **The "first earned" date exists**, because the rows do. `BadgeDialog`'s *"Most recently
   Thu, 20 Aug 2026"* can become *"×12 · first 4 Jul 2026 · latest 20 Aug 2026"*.

### 2.1 Why widen `badges` rather than add a `badge_awards` table

A second table would mean two writes per earn (a ledger insert plus an aggregate update) with no
transaction to bind them — `neon-http` has no `db.transaction()`, only `db.batch()`, and the
existing `award()` loop is deliberately *not* batched so that a failure on the fourth badge does not
roll back the first three. Two unbound writes is a drift bug traded for a counting bug.

Deriving the aggregate instead means there is nothing to drift. The row count *is* the count. A
user holds at most a few hundred award rows in the lifetime of this app, which is a smaller read
than `getRunsBetween`'s 26-week window already is.

### 2.2 `dedupe_key` must be a plain column, NOT generated

`dedupe_key text GENERATED ALWAYS AS (coalesce(run_id, scope_key, '')) STORED` looks like the tidy
version and is a live bug. `badges.run_id` is `ON DELETE SET NULL` — R-22, the one non-cascade FK in
the schema, because *"a badge is a fact about the past; deleting the run that earned it must not
delete the history that it happened."* A generated column would **recompute on that SET NULL**,
collapsing every session award for the deleted run to `''`, colliding with each other and with the
lifetime row, and the user's `DELETE FROM runs` would fail on a primary-key violation.

Written once at insert, `dedupe_key` retains the deleted run's id forever. That is not a workaround;
it is R-22 extended to the dedupe identity, and it means a re-uploaded run that happens to get a
fresh id correctly counts as a fresh earn.

---

## 3. Schema delta

```sql
-- drizzle/0001_badge_award_ledger.sql  (hand-edited after `npm run db:generate`)

ALTER TABLE "badges" ADD COLUMN "dedupe_key" text;
--> statement-breakpoint

-- Backfill. Each existing row is one award whose identity is whatever it last recorded.
UPDATE "badges" SET "dedupe_key" = coalesce("run_id", "scope_key", '');
--> statement-breakpoint

ALTER TABLE "badges" ALTER COLUMN "dedupe_key" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "badges" DROP CONSTRAINT "badges_user_id_key_pk";
--> statement-breakpoint

ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_key_dedupe_key_pk"
  PRIMARY KEY ("user_id", "key", "dedupe_key");
--> statement-breakpoint

CREATE INDEX "badges_user_run_idx" ON "badges" ("user_id", "run_id");
```

**`db:generate` will not produce this.** drizzle-kit emits `ADD COLUMN "dedupe_key" text NOT NULL`
for a non-null column, which fails on any existing row, and it has no way to know the backfill
expression. Generate the migration to get the snapshot in `drizzle/meta/`, then replace the body
with the above. Verify with `npm run db:check` before `db:migrate`.

### 3.1 `count` keeps its column and changes its meaning

The column stays, and the comment in `lib/db/schema.ts` must say what it now means:

> Earnings folded into this row. **1 for every row this app writes.** Pre-ledger rows carry the
> aggregate they had before F13's migration, which could not be itemised into real awards without
> fabricating run ids and dates — so it is preserved here instead of discarded. A read sums the
> column; it never counts rows.

That is the honest backfill. The alternative — resetting every count to 1 — would silently delete
the user's history off the shelf, and the other alternative — inserting N synthetic rows — would
put invented run ids and invented dates into a table whose whole premise is that it records what
happened.

**The one residual inaccuracy, stated rather than hidden.** A pre-ledger row's `dedupe_key` is its
*last* earning run. If that badge's run A (an earlier earner, folded into the surplus) is
re-reviewed after the migration, a new row is inserted for A and the count goes up by one when it
should not have. It can happen at most once per (badge, earlier run) pair, only for badges earned
before the migration, and it is the exact residue of not having the history. New earns are exact.

### 3.2 Test deltas in `tests/db.schema.test.ts`

- `compositePk(schema.badges)` → `['user_id', 'key', 'dedupe_key']`
- `sqlType(schema.badges, 'dedupe_key')` is `text`, `notNull` is `true`
- R-22's assertions on `run_id` (nullable, `set null`, the two-non-cascade count) are unchanged and
  must stay green — they are what §2.2 depends on
- new: `dedupe_key` has **no** `generated` config

---

## 4. Type and API changes

### 4.1 `lib/badges/types.ts`

```ts
/** One row of the award ledger, as read back. */
export interface BadgeAward {
  key: string
  runId: string | null
  scopeKey: string | null
  dedupeKey: string
  earnedOn: DateISO
  /** Earnings folded into this row: 1, except on rows predating F13. See schema.ts. */
  count: number
}

/** The per-key fold of a user's awards — what the shelf and the panel read. */
export interface StoredBadge {
  key: string
  /** From the LATEST award. Null for a period badge, or a session badge whose run was deleted. */
  runId: string | null
  scopeKey: string | null
  /** The earliest award's day. Equal to `earnedOn` when the badge was earned once. */
  firstEarnedOn: DateISO
  /** The latest award's day — what "most recently" means on the shelf and in the panel. */
  earnedOn: DateISO
  count: number
}
```

`StoredBadge` keeps its name and its `earnedOn`/`count` fields, so `buildShelf`, `BadgeShelf` and
`BadgeDialog` compile unchanged and only *gain* `firstEarnedOn`. `BadgeEarn` is unchanged.

### 4.2 `lib/badges/facts.ts` — the fold, pure

```ts
export function foldAwards(rows: readonly BadgeAward[]): StoredBadge[]
```

The fold lives here and not in the gateway for the reason `gateway.ts` already states about itself:
*"the only file in `lib/badges` that touches the database, and it does no arithmetic (that is all in
`facts.ts`)."* Sorting and summing rows is arithmetic. It also makes the whole of §1's fix unit
testable with no connection — the case that matters most (run A, run B, re-review A) is three
literal rows and one assertion.

Rules, all of which need a test: `count` sums the column and never counts rows; `firstEarnedOn` is
the minimum `earned_on`; `earnedOn` is the maximum; `runId`/`scopeKey` come from the row holding
that maximum, ties broken by `created_at` so the fold is deterministic; a key with no rows is
absent rather than a zero row; catalog order is **not** applied here — `buildShelf` and
`badgesForRun` each already impose their own.

### 4.3 `lib/db/queries.ts`

Replace `upsertBadge` and `getBadges`:

```ts
/** One award. Returns false when the row already existed — the dedupe is the PK, not a read. */
export async function insertBadgeAward(
  userId: string,
  key: string,
  award: { runId: string | null; scopeKey: string | null; dedupeKey: string; earnedOn: DateISO },
): Promise<boolean>          // insert … onConflictDoNothing().returning({ key: badges.key })

/** Every award row for a user, `order by key, earned_on`. Folded by `foldAwards`. */
export async function getBadgeAwards(userId: string): Promise<Badge[]>

/** The awards a single run earned. Replaces the TS filter in `badgesForRun`. */
export async function getBadgeAwardsForRun(userId: string, runId: string): Promise<Badge[]>
```

`getBadgeAwardsForRun` exists because `badgesForRun`'s current comment — *"a user has at most 22
badge rows, so a `WHERE run_id = $1` would be a round trip to avoid iterating an array of 22"* — is
no longer true. The ledger grows without bound; the index in §3 is what the query uses.

Deleting `upsertBadge` rather than keeping it as a wrapper is deliberate: its `ON CONFLICT
("user_id","key") DO UPDATE` targets a constraint that no longer exists (`badges_user_id_key_pk`,
which §3 drops), so leaving it in the file is leaving a query that throws. `getBadges` goes with it
— `getBadgeAwards` is the same query under a name that says what a row now is.

### 4.4 `lib/badges/evaluate.ts`

- `BadgeGateway.earn` → `Promise<boolean>` (did it write?)
- `BadgeGateway.readBadges` keeps its signature; it now returns the fold
- `isNews` is **deleted**
- `award()` loses its `readBadges` call and becomes:

```ts
for (const earn of earns) {
  if (await gateway.earn(userId, earn)) newlyEarned.push(earn.key)
}
```

- new, next to `toEarns`:

```ts
/**
 * The earn's scope identity — what the primary key dedupes on.
 *
 * A switch on the scope rather than `earn.runId ?? earn.scopeKey ?? ''`, which would produce the
 * same four answers today and would silently produce a WRONG one the first time a stamp is
 * mis-built. A session earn with a null runId is a bug, and this is where it should be loud.
 */
function dedupeKeyFor(earn: BadgeEarn): string
```

`badgeScope` stays imported — it moves from `isNews` to here.

### 4.5 `lib/badges/gateway.ts`

`readBadges` becomes `foldAwards(await getBadgeAwards(userId))`. `earn` calls `insertBadgeAward`
with `dedupeKeyFor(earn)` and returns its boolean. `badgesForRun` calls
`getBadgeAwardsForRun` and sorts by `catalogIndex`, dropping the TS filter.

### 4.6 The UI, last and smallest

`ShelfEntry.earned` gains `firstEarnedOn` in `shelf.ts`. `BadgeDialog`'s dates line becomes the
three-part form when `count > 1`:

> `×12 · first Sat, 4 Jul 2026 · latest Thu, 20 Aug 2026`

and stays `Earned Thu, 20 Aug 2026` at a count of one. `BadgeShelf`'s row is left alone — the
`· most recent of 12` line and the `×12` pill are both still correct, and the shelf is a reference
table, not the place for a second date.

**Delete F12's `§4.1`-shaped comment in `BadgeDialog.tsx`** ("the column moves forward on every
re-earn … so on a count above one it is the LATEST"). It will be describing a schema that no longer
exists, which is worse than no comment.

---

## 5. What must be true afterwards

1. Run A earns `early_bird`; run B earns it; **re-committing run A leaves the count at 2.** This is
   the defect, and it is a `foldAwards` unit test plus an `evaluate` test against the fake gateway.
2. Re-committing run A when A is the only earner leaves the count at 1 — the behaviour `isNews`
   already got right, which must not regress.
3. A week badge re-fires on a new ISO week and not on a re-review of a run from an old one.
4. `dawn_patrol` fires exactly once, ever, however many sweeps run.
5. `newlyEarned` names only rows actually written, on both the commit path and
   `sweepPeriodBadges`.
6. `DELETE FROM runs WHERE id = A` succeeds, and every badge A earned survives with its
   `dedupe_key` intact and its `run_id` null. (This is the §2.2 assertion; an integration test,
   because it is a database behaviour and a fake cannot fail it.)
7. `/me` renders identical numbers to today for a user who has never re-reviewed a run.

---

## 6. Tasks

| # | Task | Commit |
|---|---|---|
| 1 | **Preflight.** Read the current `badges` row set out of production (`scripts/db-smoke.mjs` shape) and record, in the commit message, how many rows have `count > 1` — that is exactly the history the backfill preserves and the blast radius of §3.1's residual inaccuracy. | — |
| 2 | `lib/db/schema.ts`: `dedupeKey` column, the widened `primaryKey`, the `badges_user_run_idx` index, the rewritten `count` comment. `tests/db.schema.test.ts` deltas from §3.2. | ✅ |
| 3 | `npm run db:generate`, then hand-edit `drizzle/0001_*.sql` to §3's body. `npm run db:check`. Do **not** migrate yet. | ✅ |
| 4 | `lib/badges/types.ts` (`BadgeAward`, widened `StoredBadge`) and `lib/badges/facts.ts` (`foldAwards`) with its unit tests — including §5.1 as three literal rows. Nothing else compiles against it yet. | ✅ |
| 5 | `lib/db/queries.ts`: `insertBadgeAward`, `getBadgeAwards`, `getBadgeAwardsForRun`; delete `upsertBadge` and `getBadges`. Update `tests/db.queries.recordsAndBadges.test.ts` — its three `upsertBadge` cases become `insertBadgeAward` cases asserting `on conflict … do nothing` and no `do update` — and the four `getBadges`/`upsertBadge` call sites in `tests/integration/queries.int.test.ts` (lines ~485, ~497, ~637 and the `upsertBadge` block above them). | ✅ |
| 6 | `lib/badges/evaluate.ts`: delete `isNews`, add `dedupeKeyFor`, `earn → Promise<boolean>`, drop the `readBadges` call from `award`. `lib/badges/gateway.ts` wiring. `tests/badges.evaluate.test.ts`' fake gateway becomes a real multiset keyed by `(key, dedupeKey)` — that fake is what §5.1–§5.5 assert against, so it must model the PK and not a map. | ✅ |
| 7 | `shelf.ts`' `firstEarnedOn`, `BadgeDialog`'s three-part dates line, the stale-comment deletion. `tests/badges.shelf.test.ts` and `tests/badges.render.test.ts`. | ✅ |
| 8 | `tests/integration/queries.int.test.ts`: §5.6 (run delete preserves the award) and one real insert-twice-returns-false case. Needs `VITEST_INTEGRATION=1`. | ✅ |
| 9 | `npm run db:migrate` against production, then deploy. **Order is not negotiable** — see §7. Update `F12-badge-panel.md` §4.1 to point here and say it is fixed. | ✅ |

---

## 7. Deploying it

The old code and the new schema are incompatible in one direction: `upsertBadge`'s
`ON CONFLICT ("user_id","key")` names a constraint the migration drops, so **every review commit
between the migration and the deploy would throw.** The new code and the old schema are incompatible
too — `dedupe_key` would not exist.

There is no expand-and-contract path worth building here for a single-user app: run
`npm run db:migrate`, then deploy, and do not review a run in between. If this app ever has a second
user, the two-phase version is to ship §3's migration with the *old* PK retained as a unique index,
deploy code that writes both shapes, then drop it — three deploys to avoid a thirty-second window,
which is not the trade today.

Rolling back is a `git revert` plus re-adding the old PK, and it will fail if any duplicate
`(user_id, key)` rows have been written since — i.e. after the first genuine re-earn. Treat the
migration as forward-only and take a Neon branch before running it.

---

## 8. Out of scope

- **Badge revocation.** §1.2's position stands: a correction can make a run newly earn a badge and
  can never take one back. The ledger makes revocation *expressible* (delete the row) which is
  precisely why this section exists — nothing in F13 may delete an award row.
- **Showing the full award list in the panel.** `daily-words` declines this for a good reason: a
  badge earned 104 times is a log rather than a record, and no question is answered by the middle
  102. First, latest and the count is the whole of it.
- **Any change to `meta.ts`.** F12's copy budget stands.
