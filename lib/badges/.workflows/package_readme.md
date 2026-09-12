# Package: lib/badges + lib/records — the gamification pair

**Location**: `lib/badges`, `lib/records` — **one doc for both**
**Last Updated**: 2026-09-12 (first package_readme; written after the same-day YAGNI sweep,
commit `f903ef4`)

## Overview

Two packages, one subsystem, and one deliberate asymmetry between them:

- **`lib/records` — the current-truth table.** Eleven personal-record keys
  (`RECORD_CATALOG`), recomputed **wholesale from reviewed history on every commit**, never
  incremented. A correction that disqualifies the holder of `fastest_pace_10k` must be able
  to *remove* that record, so the writer is a full DELETE + INSERT in one batch. Absence is
  meaningful: a key nothing qualifies for is missing, never a synthetic zero.
- **`lib/badges` — the fact ledger.** Twenty-two award keys (`BADGE_CATALOG`), inserted and
  **never revoked, updated or deleted** — `badges.run_id` is `ON DELETE SET NULL` (R-22), one
  of the schema's two deliberate `SET NULL` FKs in a file where every other FK cascades, so a
  badge survives the deletion of the run that earned it.
  A correction can make a run *newly* earn something; it can never take an award back. A
  newspaper prints a correction without recalling the copies it delivered.

`records` answers "what is my longest run, *right now*"; `badges` answers "on what date did a
run first feel like my longest". Every other structural fact in this file — the write shapes,
the trigger order, the schema's two `SET NULL` FKs, the read paths — is a consequence of that
split.

**Why one doc, and where it lives.** The pair was YAGNI-swept together (2026-09-12), shares
one trigger contract, one art pipeline, one CI guard and a shared `runs.started_at` column
read two different ways; the seam between them (`onRunCommitted`'s ordering) is the single
most load-bearing fact in the area and no per-package doc can hold it. `lib/` itself is not a
package, so this file lives at `lib/badges/.workflows/package_readme.md` and **is also
`lib/records`' standing map** — there is deliberately no second readme under `lib/records/`.
If the pair ever stops being one subsystem, dissolve this file into two in the same commit
that dissolves the coupling; do not fork it silently.

**Dependency direction, one-way on purpose:** `lib/badges` may import `lib/records`
(`evaluate.ts` reads `RecordKey`; two badges are one-line reads of the recompute's `changed`).
**`lib/records` must never import `lib/badges`.** The precedent is `compute.ts`'s private
`clockToSeconds`: it re-implements, in six guarded lines, what `badges/rules.ts`'s
`startTimeOf` does, rather than couple the decks over one field — "the two decks share a
database column and nothing else". A third shared parse, if ever needed, belongs in
`lib/format.ts` (R-23), not in a cross-import.

## Standing rules

1. **Records are recomputed, never incremented; badges are inserted, never revoked.** The two
   write shapes are the design, not two stages of one design. Do not "fix" either toward the
   other (see *The two write shapes*).
2. **Every threshold lives in `catalog.ts`, and copy interpolates, never restates** (R-42).
   `rules.ts` compares against `BADGE_THRESHOLDS`, `meta.ts` interpolates it through
   `lib/format` formatters, `progress.ts` measures distance from it — and, one layer out,
   `lib/nina/patterns.ts` reads `BADGE_THRESHOLDS.lateStartAfter` for her phrasing. Move the
   number in one place and the rule, the copy, the progress line and Nina all move together.
   `records/labels.ts` does the same job by carrying the qualifier *inside the label*
   ("Fastest pace, 10 km+", never a hand-written "10k PB").
3. **The layering is pure → orchestrator → server-only gateway, on both sides.** Catalogs,
   rules/compute, facts, meta and labels are pure and testable with no connection. The two
   orchestrators (`evaluate.ts`, `recompute.ts`) reach the database only through an **injected**
   gateway interface. Each `gateway.ts` is the only db-touching file on its side and contains
   no arithmetic. `import 'server-only'` appears **only** in the two gateways — pulling it
   anywhere else would make the catalogs and art unimportable from client components, which is
   exactly what the deleted barrels' header once documented.
4. **Catalog order is the one order.** `BADGE_CATALOG` order = shelf order = every evaluator's
   return order = award-result order; `RECORD_CATALOG` order is the records shelf's order and
   the catalog is append-only so existing rows never move. Never sort alphabetically at a
   display site; never apply the order a third time in a layer that already has it.
5. **The two `-art.ts` files are generated** (`tools/make_badge_assets.py`) and are TOTAL
   `Record`s on purpose: a catalog key with no art fails `typecheck` in the same session. The
   fix for that failure is generating art, never reaching for `Partial<>` and never hand-editing
   the file — the generator resurrects the old bytes. Filenames carry the master's SHA-256
   prefix, which is what licenses `next.config.ts` to serve `/badges/*` and `/records/*` as
   `immutable`.
6. **Adding a record key is not just a catalog edit.** `records` has exactly one writer — the
   recompute at the next review commit — so a key added today does not exist for a user until
   they commit, or until `npm run records:backfill` is run once (`scripts/backfill-record-keys.mjs`;
   the F32 lesson: `earliest_start` shipped and the shelf stayed silent for the whole account).
   Badge keys need no backfill; the next qualifying commit (or the nightly sweep) earns them.
7. **Unknown or retired keys degrade silently, never throw.** `badgeDefinition`/`badgeTitle`
   return null, `readCurrent` drops a key the catalog no longer defines, `buildShelf` simply
   never iterates it. Retirement is: remove the catalog row, leave the `badges`/`records` rows
   inert — no migration. A row from a dead key must never take `/me` down.
8. **`lib/records/catalog.ts` must stay runtime-dependency-free.** Every import in it is
   `import type`, which is what lets `scripts/backfill-record-keys.mjs` import it directly under
   `node --experimental-strip-types` — the backfill computes with the *real* table so it cannot
   become R-42's second source of truth. A runtime import added to that file breaks the one
   script that keeps new keys honest.

## The file map

### lib/records (7 files)

| File | What it is |
|---|---|
| `types.ts` | The boundary types: `RecordKey` (11-key union), `RecordUnit` (incl. `bp` and `clock` — see gotchas), `RecordCandidate` (everything `computeRecords` needs about one run), `RecordDefinition` (per-key `qualifies`/`valueOf`/`direction`), `RecordResult`, `StoredRecord` (+`previousValue`), `RecordRunRow` (the gateway's reviewed-run shape). `RecordDirection`/`RecordUnit` are deliberately un-exported (yagni sweep f903ef4). |
| `catalog.ts` | Roadmap §4.5 as data. The list **is the contract** — F08 renders exactly these keys and F09's `long_way_home` fires off `longest_distance` moving. Rate keys carry minimum qualifying distances ("fastest pace over 400 m is a sprint to the corner"); magnitude/moment keys have no floor. Append-only. Also `RECORD_KEYS`, `recordDefinition`, `isRecordKey` (6 production refs — its badge twin is test-only; the asymmetry is real, do not "symmetrize" it). |
| `compute.ts` | The pure reduction: candidates in, one winner per key out. `beats` is **strict** — an exact tie keeps the earlier holder (earlier `occurredOn`, then lower `runId`), so a tie-break never depends on iteration order. `toRecordCandidate` reuses `computeSessionMetrics` for fastest-km and decoupling (never re-derived), with `hrMax: null` — no record key divides by HRmax. |
| `recompute.ts` | The I/O-shaped orchestrator that does none. Declares `RecordsGateway` (fetch reviewed-only D16, read current, **replace** R-10), diffs new results against stored rows, and writes **only when something moved** — so `records.updated_at` means "when this record last changed". Returns `{ rows, changed, removed }`; `changed` is the answer to "did a record just move", true only at that instant. |
| `gateway.ts` | `server-only`. The only db door. `fetchReviewedRuns` maps query rows to `RecordRunRow`; `readCurrent` drops unknown keys (the retirement mechanism); `replace` delegates to the batch. Zero arithmetic. |
| `labels.ts` | `RECORD_LABELS` (the label carries the qualifier) and `formatRecordValue`, routing by unit through `lib/format`. The two non-identity encodings are visible here: `bp` ÷ 100 → `formatPercent` (1235 → `12.3%`), `clock` → `formatClockSec` (25620 → `07:07`), **never** `formatDuration` (same number as a duration is `7:07:00`). |
| `record-art.ts` | **Generated.** `Record<RecordKey, RecordArt>` with `src`, `small`, `sha256`, `twill` (sampled from the master's frame, never chosen), `styleVersion`. |

### lib/badges (10 files)

| File | What it is |
|---|---|
| `types.ts` | Boundary types. `BadgeKey` is a **hand-written** 22-key union, not derived from the catalog — the derivation needs `as const`, which silently breaks `Record<BadgeKey, BadgeMeta>` exhaustiveness the day a key is commented out; written out, forgetting an edit is a compile error. `BadgeScope` documents the `run_id`/`scope_key` stamping table. `StoredBadge` is the per-key fold with `earnedDays` (see gotchas: `earnedDays.length` is not `count`). |
| `catalog.ts` | `BADGE_THRESHOLDS` — the only home of every number (rule 2). `BADGE_CATALOG` — 22 rows, order = shelf order = evaluator order; retired keys are removed and left inert, never deleted from the table. `PROGRESS` — exactly the five accumulating badges get a locked-tile progress spec (R-44); the other seventeen render condition-only, because inventing a percentage for "second half faster than first" is the dishonesty R-41 removed elsewhere. Also `isBadgeKey` (**test-only**), `badgeDefinition`, `badgeScope`, `catalogIndex`. |
| `rules.ts` | The 22 predicates. **Pure: no db, no clock, no F06 re-derivation, no record comparison** — `new_ceiling`/`long_way_home` arrive as booleans built from the recompute's `changed`, so two answers to "is this the longest run" cannot disagree. Returns catalog order from every exit. `windowEdgeFires` gives trailing-window rules edge detection: the window ending here qualifies and the previous one did not, so a five-run streak of identical loops earns `groundhog_day` once, on the run that completes the pattern. |
| `evaluate.ts` | The orchestrator: builds nothing, computes nothing, decides what each earn is *stamped* with — `runId`, `scopeKey`, `earnedOn` (the run's own day, never the wall clock), `dedupeKey` (scope switch: run id / week / month / `''` for lifetime; a mis-stamped earn throws here, loudly, by design). `newlyEarned` is **the database's report** (`insertBadgeAward`'s insert-or-not), not a prediction. `sweepPeriodBadges` is the nightly backstop and the one path that keeps `runId: null`. |
| `facts.ts` | Pure fact-builders the gateway calls: `toWindowRun` (re-runs `computeSessionMetrics` per window run for its decoupling — `boring_excellence` is the one rule needing another run's hardest metric), `foldAwards` (the ledger → per-key fold; `count` **sums the column**; the `created_at` same-day tie-break is load-bearing), `weekRunCounts`, `previousIsoWeek` (calendar walk, never week-number arithmetic), `qualifyingWeekStreak` (stops at the first miss, anchor included), `runsOnDay`, `totalDistanceM`. |
| `meta.ts` | `BADGE_META`, a total `Record` of condition + gloss for all 22. A separate module from `catalog.ts` on purpose: the review-commit path imports the catalog on every save and must not carry 44 sentences with it. Impersonal register enforced — one string serves both the earned and locked state, and a sentence with no "you" cannot accidentally judge the runner. Every number interpolated from `T`; a per-string budget test keeps the prose from creeping back. |
| `progress.ts` | R-44's locked-tile line for the five accumulating badges. Second person **deliberately** differs from `meta.ts`' register: a progress line exists only in the locked state and is only about the reader's standing. Never a percentage, never a bar. |
| `shelf.ts` | `buildShelf` — the `/me` shelf as pure data. All 22 slots always shown with condition and gloss (no redaction: hiding a threshold relocates min-maxing, doesn't remove it); catalog order, not earned-first (earned-first is a progress bar). Retired keys drop out by non-iteration. |
| `gateway.ts` | `server-only`. The only db door. `loadCommitFacts` asserts the reviewed-data invariant **structurally** (`reviewedAt == null` → null; `getRunDetail` is draft-visible by design, so the guard lives here), loads window/location/period in parallel, and computes session metrics with `hrMax: null` — no rule reads `avgHrPctMax`. `STREAK_LOOKBACK_WEEKS = 26` must comfortably exceed the longest streak it measures (gremlin re-fires at 4-week multiples; a lookback at the horizon would fire on the window's edge). `badgesForRun` is the per-run inline read — **test-only in production as of 2026-09-12** (kept and recorded by the yagni sweep; F11's shared-run page is its intended consumer). |
| `badge-art.ts` | **Generated.** `Record<BadgeKey, BadgeArt>`, same shape as the records deck. `BADGE_ART_SMALL_SIZE` is consumed by `BadgeShelf` (the records deck's twin constant is the standing zero-ref one — see gotchas). |

## The commit pipeline, as data

```
review commit (lib/review/commit.ts)
  │  the run transaction has returned — a human confirmed these numbers
  ▼
lib/derived/invalidate.ts  onRunCommitted        failure policy: log and carry on;
  │                                              NEVER roll the save back (plan §7.3)
  ├─ 1. recomputeRecords   records/recompute.ts + records/gateway.ts
  │      fetchReviewedRuns → toRecordCandidate → computeRecords
  │      → diff vs readCurrent → [only when moved] replace: DELETE + INSERT, one batch
  │      → changed ∩ {this run} = recordsMovedToThisRun   ← true only at this instant
  │
  ├─ 2. insight sweep (F07 — not this pair's, but ordered here)
  │
  └─ 3. evaluateBadgesForCommit   badges/evaluate.ts + badges/gateway.ts
         loadCommitFacts (reviewed-at guard, window, location, period — in parallel)
         → the four pure evaluators (session/week/month/lifetime)
         → dedupeKeyFor → insertBadgeAward, sequential, onConflictDoNothing
         · recordsMovedToThisRun drives long_way_home / new_ceiling — one-line reads
         → { newlyEarned, recordsMovedToThisRun } returned to the caller
           (Nina reacts to both; she can congratulate a record whose badge write failed)

nightly backstop: GET /api/cron/rollup (CRON_SECRET)
  → sweepPeriodBadges per active user (60-day window), BEFORE the insight generations
    (cheap first), its own try/catch per user, runId: null — the honest "no completing run"
```

**Order is load-bearing:** records before badges. The two record-derived badges read what the
recompute just wrote; running them first would evaluate against yesterday's shelf, and
re-deriving "did the record move" inside the badge path would be the second implementation of
one comparison. The sweep is a backstop, not the mechanism: every period rule already fires at
the commit that satisfies it, whatever order runs are reviewed in — the sweep earns its keep
only when an aggregate moves *without* a commit (a deletion, a boundary-crossing correction).

## The two write shapes

| | `records` | `badges` |
|---|---|---|
| Table | `(user_id, key, …)` — "all records" is an index-only PK scan | `(user_id, key, dedupe_key)` — the dedupe **is** the PK |
| Writer | `recomputeRecords` on every commit — the only writer | `insertBadgeAward` on commits + the nightly sweep |
| Write | DELETE + INSERT, one batch, only when something moved | INSERT only, `onConflictDoNothing().returning()`; no update, no delete, anywhere |
| On correction | demoted keys are **removed** | a correction can only make something *newly* earn |
| On run deletion | next recompute drops or reassigns | `run_id` → NULL, the badge survives (R-22) |
| Count semantics | value is the current best; `previousValue` keeps "what you beat" (only overwritten when *this* key moves) | `count` sums the ledger column; a pre-F13 row carries the aggregate it had then |
| Identity of an earn | n/a — current truth | `dedupe_key`: run id (session) / week / month / `''` (lifetime, one row per account forever — re-firing `dawn_patrol` at 20 and 30 would be a scoreboard) |

Neither side uses a transaction wrapper: `neon-http` has none, which is *why* the ledger row
is one insert (F13 widened `badges` instead of adding a second table) and why the badge award
loop is sequential — a failure on the fourth must not roll back the first three, because a
genuinely earned badge is not made less true by the next one failing.

## Reads

- **`/me`** (`app/me/page.tsx`): `readBadges → foldAwards` + `loadPeriodFacts` → `buildShelf`
  (the 22-slot shelf); `getRecords` read against `RECORD_KEYS`/`RECORD_LABELS` for the records
  table. One parallel `Promise.all`, no waterfall.
- **Run detail**: `badgesForRun(userId, runId)` — a real `WHERE run_id = $1` against
  `badges_user_run_idx` (post-F13 the ledger grows without bound; the old filter-the-history
  read no longer scales). Period badges appear here since F27 round 3: one commit *earned* the
  month badge, and that commit is a run.
- **Nina**: `lib/nina/load.ts` folds the raw awards for her context; `lib/nina/context.ts`
  builds her badge section (`BADGE_KEYS` × `BADGE_META` conditions — R-42 again: she never
  hand-writes a threshold) and her records section (`RECORD_LABELS` + `formatRecordValue`, so
  "fastest 10 km+ run" and `12.3%` come out of the same strings the shelf uses);
  `lib/nina/proactive.ts` congratulates using `badgeDefinition` titles and record labels.

## Reverse wiring (why "quiet" ≠ "unused")

- **`lib/derived/invalidate.ts`** — the trigger contract both sides fill in; the ordering and
  failure policy above are its comments' subject.
- **`app/me/page.tsx`** — both shelves. **`app/api/cron/rollup/route.ts`** — the badge sweep.
- **`components/profile/`** — `BadgeShelf` (`BADGE_ART` + `SMALL_SIZE`, `Shelf` types),
  `BadgeDialog` (`BADGE_ART`, `ShelfEntry`), `RecordsTable` (`RECORD_LABELS`,
  `formatRecordValue`), `RecordDialog` (`RECORD_ART`). `components/ui/RunDateLink.tsx` cites
  `StoredBadge.runId`'s null semantics in prose.
- **`lib/nina/{patterns,context,load,proactive}`** — threshold sharing, narration, context,
  congratulations. `tests/nina.patterns.test.ts` pins the threshold sharing.
- **`lib/db/{schema,queries}`** — the `records` and `badges` tables (the schema comments carry
  the R-22/SET-NULL argument); `getRecords`, `replaceRecords`, `getBadgeAwards`,
  `getBadgeAwardsForRun`, `insertBadgeAward`, plus the ten read functions and two writers the
  two gateways call (as of this stamp).
- **`tests/`** — the testing map below; note `tests/fixtures/{canonicalRun,recordCandidates,ninaContext}`
  import the pair's types directly.
- **`scripts/backfill-record-keys.mjs`** — imports `lib/records/catalog.ts` under
  `--experimental-strip-types` (rule 8); restates `beats` in four guarded lines (the one
  deliberate duplication; keep identical or a backfilled row will disagree with the next
  recompute); builds candidates with `fastestFullKmPaceSec`/`decouplingBp` null so the two
  metric-derived keys **exclude themselves through their own qualifiers** — no key names
  hardcoded. Insert-only (`on conflict do nothing`), never deletes or updates: it cannot corrupt
  a value it does not compute.
- **`scripts/backfill-badge-run-ids.mjs`** — gives pre-round-3 period awards the run that
  earned them (day + exactly-one-reviewed-run ⇒ certain; two runs ⇒ `ambiguous`, skipped rather
  than guessed). Spells `PERIOD_KEYS` as a literal because it runs outside the bundler — the
  literal is kept honest by `tests/badges.catalog.test.ts` asserting those five are exactly the
  non-session badges. Do not "fix" either script's duplication by importing `lib/` code neither
  can load.
- **`scripts/capture/{seed-demo,dataset}.mjs`** — demo data shaped so the rules visibly fire;
  they name the pair's `server-only` modules as the reason seeding goes through SQL, not imports.
- **`tools/decks.py`** — the deck table names both catalogs and both manifests;
  **`tools/make_badge_assets.py`** generates both `-art.ts` files;
  **`scripts/check-badge-art.mjs`** (CI, `npm run badges:check`) anchors on `badge-art.ts`
  being a total map and recomputes every `sha256`/`twill`. **`next.config.ts`** serves
  `/badges/*` and `/records/*` `immutable` — per-deck matchers on purpose, so a third deck must
  be added consciously.

## Gotchas

- **`earnedDays.length` is not `count`.** `count` sums the ledger column; a row predating F13
  carries the aggregate it had then, so one row folding to 5 lists one day and four earnings
  with no date on record. `BadgeDialog` says this out loud; inventing dates to make the two
  agree would show the runner facts nothing ever recorded.
- **`firstEarnedOn` has no on-screen reader** — a correct, tested fold with no caller since F23
  moved the date line into `earnedDays`. Not dead code; do not sweep it.
- **`negative_split` and `fast_start_fool` read the same field from opposite sides** and can
  never both fire; a drift of exactly 0 fires neither. `fast_start_fool` additionally requires
  the run to have positively split — a fast first km that was then vindicated is a good run,
  not this badge.
- **An empty zone table fires nothing** (`sandbagger` reads raw durations, not rounded shares —
  a share rounded to 0% is not a duration of 0 s): "no heart-rate data" must never read as "the
  entire run was easy". `warmup_who` is judged against **this run's own** zone-4 floor, not a
  fixed bpm or %HRmax band (R-26); `tests/badges.rules.fixture.test.ts` asserts its
  non-firing on the canonical fixture, and loosening that is a regression.
- **`tourist`: a blank location is missing data, not a new town.** `locationSeenBefore` is
  three-valued for this reason; only `false` earns.
- **`boring_excellence`: a run whose decoupling could not be computed disqualifies the
  window** rather than reading as 0 — "we don't know" is not evidence of steadiness.
- **`earliest_start` is a plain minimum at midnight**: 00:15 beats 04:30. F32 §1b holds the
  argument and names the one line to change if that call is revisited.
- **`fastest_pace_5k`/`10k` are whole-run averages among runs at least that long**, not best
  segments carved out of longer runs — the app has no GPS trace to reconstruct a segment. The
  label carries the qualifier so the copy cannot drop it.
- **`best_paced_run` is min |decoupling| in basis points, absolute** — a run that got faster
  per heartbeat is as well-paced as one that held level. Both `bp` and `clock` units exist so
  `records.value` stays an integer for all eleven keys; `clock` is a time of day, emphatically
  not `'s'`.
- **`RECORD_ART_SMALL_SIZE` is a standing zero-reference constant** — the generator
  (`tools/make_badge_assets.py`) emits `{deck.const_name}_SMALL_SIZE` unconditionally; only the
  badges deck consumes its twin. Hand-deleting it fights the generator; the fix belongs in the
  generator (or a records shelf ships). Likewise the records `.small` derivatives ship
  unrendered — the F25 plan's open deliberate bet (pre-generate now, avoid re-hashing masters
  later). Both recorded so no future sweep re-litigates them
  (`docs/token_maxxing/2026-09-12-badges-records-yagni.md`).
- **Test-only exports, recorded not fought**: `isBadgeKey`, `previousIsoWeek` (self-used too),
  and `badgesForRun` exist in production code with zero production callers, solely because
  tests import them. Un-exporting requires touching tests; a sweep should record, not delete.
- **Verifying consumers of this pair by static import grep alone under-reports**: the gateway
  tests use dynamic `await import('@/lib/badges/gateway')` behind `vi.mock`. Include dynamic
  imports in any liveness census (this bit someone on 2026-09-12 while writing this doc).
- **A lost badge write stays lost** (session ones, at least — the sweep recovers period ones
  next night); a lost record write self-heals at the next commit. That asymmetry is why badge
  evaluation failure is the one invalidate failure the code comments mourn.
- **The gateway tests fake the db, and `tests/integration/queries.int.test.ts` needs a real
  one** — integration coverage for `records`/`badges` queries lives behind the integration
  marker, not the unit sweep.

## Testing map

`tests/` pins this area from twelve direct files plus four adjacent ones:

- `badges.catalog.test.ts` — thresholds, catalog/meta shape, the per-string copy budget, the
  **exactly-five-period-badges** assertion (the backfill script's literal depends on it), and
  the every-period-badge-has-progress invariant (the count-threshold rule's guard).
- `badges.rules.fixture.test.ts` — the canonical fixture; among other things the `warmup_who`
  non-firing regression.
- `badges.evaluate.test.ts` — stamping and dedupe: the first qualifying commit writes the row,
  the fifth run of the week collides with it.
- `badges.facts.test.ts` — the fold, and the `created_at` tie-break asserted from both
  directions (reversed input).
- `badges.gateway.test.ts`, `records.gateway.test.ts`, `db.queries.recordsAndBadges.test.ts` —
  fake-db gateway/queries behavior (dynamic imports + `vi.mock`).
- `badges.shelf.test.ts`, `badges.render.test.ts` — the pure shelf, and the art wiring it
  renders (`BADGE_ART`/`RECORD_ART` sizes on screen).
- `records.catalog.test.ts`, `records.compute.test.ts`, `records.recompute.test.ts` — the
  table, the strict-`beats` reduction, and the move/skip/replace semantics.
- Adjacent: `derived.invalidate.test.ts` (the trigger contract), `insights.cron.test.ts` (the
  sweep rides along), `nina.patterns.test.ts` (threshold sharing), `nina.context.test.ts`.

## Error & failure posture

Deliberately two-valued. **Loud where a bug would hide:** `dedupeKeyFor` throws on a
mis-stamped earn (a session badge with no runId); `insertBadgeAward` reports what the database
did; the recompute's `changed` is computed at the moment of truth. **Silent where data is
merely absent or old:** unknown keys drop, blank locations are null, unparseable start times
exclude one key and no others, `loadCommitFacts` returns null for a run deleted mid-flight.
Panics/no-throw conventions otherwise follow the repo norm: nothing here throws on user data.

## Performance envelope

The recompute is a full-history scan by design and is free at this app's scale (~17 runs a
month is the number the comments reason from); the badge commit path is one run detail plus a
parallel triple load whose first query (a 26-week range) does triple duty; the cron sweep is
three cheap indexed queries per active user, ordered before the 13–16 s model calls so a
deadline skip costs the expensive half, not the cheap one. No caching anywhere in the pair —
`records` **is** the cache; `insights` (F07) is the cached narrative layer, not this.

## Verification stamp

2026-09-12, this tree: both catalogs read 22 badges / 11 records (counts are as-of-this-date
state — the live counts are what the catalogs and `npm run badges:check` say); the yagni-sweep
commit `f903ef4` is an ancestor of this branch and both `index.ts` barrels are gone; the
consumer census in *Reverse wiring* was taken today by exact-quote import grep **plus** a
dynamic-`import()` pass (which found the three gateway/db tests the static pass missed);
`isBadgeKey` / `previousIsoWeek` / `badgesForRun` re-verified test-only today by repo-wide
grep; `lib/records` re-verified badges-import-free (the only badge references in `lib/records`
are prose). This file is markdown-only; the gates that read it are prettier (`npm run
format:check` covers `.md`) and the source-extension-only OpenRouter boundary guard, which
prose cannot trip.

## Notes

Documentation created 2026-09-12 by the `tokenmax-pkg-readme-badges-records` worker session
(coordinator `tokenmax-orch-2026-09-12`), as the standing map/rules doc both packages were
owed after the same-day YAGNI sweep — that session's liveness map, non-removal harvest and
barrel-convention proof are the evidence base this file rests on, and its follow-ups
(generator `*_SMALL_SIZE` emission, the F25 `.small` bet, the test-only-export restructure)
remain open as written there. Method note for the next doc-drift pass: the deep documentation
is the code's own headers — `catalog.ts`, `rules.ts`, `evaluate.ts`, `recompute.ts` and
`lib/derived/invalidate.ts` carry the full design arguments; this file is the map, the seam,
and the rules a new arrival can't see from any one file. Verify a claim here against those
headers, not the other way round.
