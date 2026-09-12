# Package: date, flags & derived (combined — three single-file lib utilities)

**Location**: `lib/date`, `lib/flags`, `lib/derived`
**Last Updated**: 2026-09-12 (first audit; every consumer count and verdict below measured in the
tree on that date)

## Why one readme covers three packages

Each of these is a single file under 240 lines — alone, none ever crossed the size threshold that
triggered one of the per-package audits, so all three fell through every sweep. They are audited
together here because together they form one layer: **the pure seams the write path hangs on**.
`lib/date` owns every calendar decision, `lib/flags` owns the human sentence for each metric
verdict, and `lib/derived` owns what happens after a run's numbers change. None imports another's
data; the only edge between them is `lib/derived` → `lib/date` (`isoWeekKeyOf`, `monthKey`).

## YAGNI verdict (2026-09-12)

`npm run knip` (adopted 2026-09-12, `knip.ts`) reports **no unused files, no unused exports and no
duplicate exports in any of the three** — and `knip.ts` ignores neither (only `research/**` and
`docs/design/tokens.css` are ignored), so the census covered them in full. A per-symbol grep
cross-check agreed with every knip verdict. The traps that flipped verdicts in earlier sweeps were
each checked and each came back **deliberate, not speculative**:

- `lib/flags` `FLAG_CODES` is used only by `tests/flags.copy.test.ts`. It cannot be derived from
  `FLAG_THRESHOLDS`: that object's keys are *not* the code union (`FAST_START_TOLERANCE_SEC` is a
  threshold with no code; `FAST_START` is a code with no threshold), and a type union has no
  runtime existence. It is the only runtime enumeration of `FlagCode` and must stay hand-written —
  the exhaustive `switch` in `flagCopy` is what the compiler pins; this list is what the tone and
  non-empty tests walk.
- `lib/derived` `insightScopesFor` and the whole `InvalidateDeps` bag are used only by
  `tests/derived.invalidate.test.ts`. Both are the documented contract-test seam: production calls
  `onRunCommitted(event)` with no second argument (`lib/review/commit.ts:227`), tests inject the
  three halves to assert the failure-swallowing policy without a database.
- `lib/derived` has exactly one production importer by design — that is the invalidation contract:
  the commit path is written once, and each feature fills in its own section of the body.

One defect was found and fixed in the same pass (commit `4d5d270`, 2026-09-12): `lib/date`'s
`DATE_RE` was shape-only, so `utcDay` accepted `2026-99-99` (rendering `NaN-NaN-NaN` out of
`addDays`) and silently *normalised* `2026-02-30` to `2026-03-02`. The regex now range-checks
month/day like its `MONTH_RE`/`WEEK_RE` siblings, and `utcDay` round-trips the constructed `Date`
through `toISO`, throwing `RangeError` when the day does not exist.

## Exported API

### `lib/date/ranges.ts` — calendar math (168 lines)

Two rules govern the file (stated in its header and enforced by its shape):

1. **Half-open ranges, never `to_char` predicates.** `monthRange('2026-08')` returns
   `{ startISO: '2026-08-01', endExclusiveISO: '2026-09-01' }` so queries can use
   `occurred_on >= x AND occurred_on < y`, which the `(user_id, occurred_on DESC)` index scans.
2. **No timezone reasoning happens here.** `runs.occurred_on` is already the correct
   Asia/Jakarta calendar day when written. Everything is string/integer math; the only `Date`
   objects are UTC-only scratch values, so results are identical under any ambient `TZ`.

| Export | Contract |
| --- | --- |
| `DateISO` / `MonthKey` / `IsoWeekKey` | Branded-by-docstring string aliases: `'YYYY-MM-DD'`, `'YYYY-MM'`, `'YYYY-Www'` |
| `isValidMonthKey` / `isValidIsoWeekKey` / `isValidDateISO` | Field-range shape guards (month 01–12, week 01–53, day 01–31). Realness — does Feb 29 exist *this* year — is `utcDay`'s round-trip job, not theirs |
| `addMonths(month, delta)` | Integer month-ordinal math, no `Date`, year-safe in both directions |
| `monthRange(month)` / `isoWeekRange(week)` | Half-open `[startISO, endExclusiveISO)` pairs; ISO weeks run Mon–Sun and week 1 owns Jan 4, so `2026-W01` starts `2025-12-29` |
| `isoWeekKeyOf(dateISO)` | The ISO week owning a day — the week's *Thursday* decides the year |
| `monthKey(dateISO)` | A deliberate slice, no `Date` |
| `addDays(dateISO, delta)` / `daysBetween(a, b)` | UTC day arithmetic; `daysBetween` is whole days `b − a` (F09 badge streaks read its sign); both throw `RangeError` on impossible days since `4d5d270` |
| `jakartaDayOf(instant)` | **The one place** an instant becomes a Jakarta calendar day — the timezone decision is spent exactly once, here |
| `todayInJakarta(now?)` | `jakartaDayOf` with a defaulted clock, so tests pin the instant instead of mocking global time |

### `lib/flags/copy.ts` — the sentence for every flag F06 can fire (94 lines)

| Export | Contract |
| --- | --- |
| `flagCopy(flag)` | `{ title, detail }` per code. The exhaustive `switch` (return type `FlagCopy`) makes a missing case a compile error; `detail` quotes the measured value, `title` names the phenomenon |
| `FLAG_CODES` | The hand-written runtime enumeration of `FlagCode` — see the YAGNI verdict for why it cannot be derived |

The file's tone rule is operational and test-pinned (`tests/flags.copy.test.ts`): statements about
the data, never verdicts on the person — no second person as accusation, no exclamation marks, no
emoji, and the number is the emphasis.

### `lib/derived/invalidate.ts` — the invalidation contract (239 lines)

| Export | Contract |
| --- | --- |
| `onRunCommitted(event, deps?)` | The one seam every downstream feature hangs off. Records first (wholesale recompute — never increment, so deletion is expressible), then insight sweeps, then badge evaluation, in that order because `new_ceiling`/`long_way_home` read the recompute's `changed` set. Every stage swallows its own failure and logs: the run transaction already committed, and a human confirmed those numbers — losing the save over a cache sweep is the wrong trade in every direction |
| `RunChangeEvent` | `runId`, `userId`, `occurredOn`, `previousOccurredOn` (set only when the date itself moved — the week and month it *left* must be swept too), `phase` |
| `insightScopesFor(event)` | The deduped `(scope, scope_key)` list: session + the week and month of both old and new dates. Exported so the contract test can pin *which* scopes a date move sweeps |
| `InvalidateDeps` | The three injectable halves (`recomputeRecordsFor`, `sweepInsights`, `evaluateBadgesFor`) — test-only; production passes nothing |
| `InvalidateOutcome` (unexported) | `newlyEarned` + `recordsMovedToThisRun`, captured at the one moment they are free — after the redirect a badge costs a query and a moved record is unrecoverable |

Badges are deliberately **never revoked** (`badges.run_id` is the one `ON DELETE SET NULL` FK):
records answer "what is my longest run right now", badges answer "when did a run first feel like
my longest". `evaluate.ts`'s `isNews` keeps a re-commit of an unchanged run from inflating counts.

## Dependencies

- **External**: none in `lib/date` and `lib/flags` beyond `Intl.DateTimeFormat` (already in the
  runtime); `lib/derived` imports `server-only` and sits on `lib/db`, `lib/badges`, `lib/records`.
- **Internal**: `lib/flags/copy` → `lib/metrics/flags` (the `FlagCode` union + thresholds) and
  `lib/format` (every number in a sentence is pre-formatted by the format layer's authorities);
  `lib/derived/invalidate` → `lib/date/ranges`, `lib/badges/{evaluate,gateway}`,
  `lib/records/{recompute,gateway,types}`, `lib/db/queries`.

## Reverse dependencies (measured 2026-09-12)

- `lib/date/ranges` — **45 production importers**: 7 app routes, 3 components, and 35 files
  across 11 lib areas (nina 11, charts 6, badges 6, review 2, records 2, metrics 2, insights 2,
  llm 1, format 1, derived 1, db 1) — plus 9 test files. Quietly the most-depended-on utility in
  `lib/`; any signature change here is a fleet-wide event.
- `lib/flags/copy` — `components/ui/Flag.tsx` (the flag chip), `lib/nina/context.ts` (her
  commentary quotes the same sentence the screen shows), `tests/flags.copy.test.ts`.
- `lib/derived/invalidate` — `lib/review/commit.ts` only (plus `tests/derived.invalidate.test.ts`).
  No regex-scrape consumer in `scripts/` or `tools/` (checked against the knip blind-spot class).

## Tests

`tests/date.month.test.ts` and `tests/date.isoWeek.test.ts` pin the month and week halves
(boundaries, 53-week years, total sweeps, `TZ` independence); `tests/date.day.test.ts` (added
2026-09-12) pins the day half — `addDays` across month/year/leap boundaries, `daysBetween`'s
antisymmetry, `jakartaDayOf` at the UTC+7 midnight boundary, and the impossible-day `RangeError`s.
`tests/flags.copy.test.ts` walks every code for existence and tone; `tests/derived.invalidate.test.ts`
asserts the sweep sets and the failure-swallowing contract via injected halves.
