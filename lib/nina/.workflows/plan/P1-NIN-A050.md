> Adopted from `AGGREGATE_RUNS_TOOL_PLAN.md` phase 1. Source: `.workflows/plan/aggregate-runs-tool/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: Add `aggregate_runs` tool (schema, Zod, gateway, SQL, tests)

**Plan set:** `AGGREGATE_RUNS_TOOL_PLAN.md`
**Analysis:** `20260916-092315-6LV6_code_analyzer.md`
**Satisfies:** R1 — Nina can answer "what's my average run duration over the last 2 months" from one real SQL aggregate instead of reading rows and averaging them in prose
**Depends on:** none (the only phase in the set)
**Difficulty:** NORMAL
**Package:** `lib/nina` (+ `lib/db/queries`)

---

## Goal

After this phase `aggregate_runs` is a real, dispatchable Nina tool: she sends `{ metric, agg, from, to, intent? }`, the handler validates it, converts her **inclusive** `to` into the half-open upper bound every rollup already scans, and the gateway runs one `select avg|sum|min|max|count(...)` against `runs` — userId-scoped, `reviewed_at is not null`-gated, no rows materialised. The answer carries a single **already-spelled** value plus `n` (runs that had a reading) and `runCount` (runs in range at all), so nothing downstream ever hands a model a raw metre or second to do arithmetic on. `NINA_CORE_TOOL_SET` gains exactly one tool and `NINA_CHAT_TOOL_SET`/`NINA_FULL_TOOL_SET` inherit it with no edit in `imagetools.ts`/`avatartools.ts`/`turnrun.ts`.

## Interface Contract

**Deletes:** none
**Renames:** none

**Creates:**
- `lib/db/queries/rollups.ts` — `RUN_METRIC_COLUMNS` (module-private const map), `aggregateExpr` (module-private), `aggregateRunMetric(userId, params)`, types `RunMetricKey`, `RunAggregateFn`, `RunMetricAggregateParams`, `RunMetricAggregate`. All exported types/functions reach consumers through the existing `export * from './queries/rollups'` in `lib/db/queries.ts:—` (barrel, no edit needed).
- `lib/nina/schema.ts` — `NINA_AGGREGATE_METRICS`, `NINA_AGGREGATE_FNS`, `NINA_AGGREGATE_INTENTS`, types `NinaAggregateMetric`, `NinaAggregateFn`, `NinaAggregateIntent`, `AggregateRunsArgsSchema`.
- `lib/nina/prompts/tools.ts` — `AGGREGATE_RUNS_TOOL`.
- `lib/nina/tools.ts` — types `NinaAggregateParams`, `NinaAggregateResult`; module-private `AGGREGATE_METRICS`, `AGGREGATE_VERBS`, `AggregateMetricSpec`, `AggregateRunsAnswer`, `AggregateRunsResult`, `situationFor`; exported `handleAggregateRuns`.
- `tests/fixtures/ninaTurn.ts` — `FakeToolGateway.aggregates`, `FakeToolGateway.aggregateResult`, `FakeToolGateway.aggregateRuns`.

**Signature changes:**
- `interface NinaToolGateway` (`lib/nina/tools.ts:88`) gains a **fourth method** `aggregateRuns(userId: string, params: NinaAggregateParams): Promise<NinaAggregateResult>`. Every implementer must grow it: `dbNinaToolGateway` (`lib/nina/gateway.ts:346`) and `fakeToolGateway` (`tests/fixtures/ninaTurn.ts:78`) are the only two in the repo (verified by grep for `NinaToolGateway`).
- `NINA_CORE_TOOL_SET.tools` (`lib/nina/tools.ts:172`) goes from 4 entries to 5; `.handlers` from 3 to 4.
- `NINA_TOOLS` (`lib/nina/prompts/tools.ts:276`) goes from 6 entries to 7.
- `NINA_PROMPT_VERSION` (`lib/nina/prompts/index.ts:91`) 7 -> 8.

**Requires (from earlier phases):** nothing — this phase is first and only.

**Leaves alone (owned by nobody else, but deliberately untouched):** `lib/nina/turn.ts`, `lib/nina/imagetools.ts`, `lib/nina/avatartools.ts`, `lib/nina/turnrun.ts`, `lib/nina/prompts/system.ts`, `lib/db/schema/**`, `drizzle/**` (no migration), `lib/db/queries.ts` (the barrel already re-exports the whole rollups module), `lib/nina/queries.ts`.

**Invariant 9 restated as a contract:** neither `lib/nina/tools.ts` nor `lib/nina/prompts/tools.ts` may import `db`, `runs`, or any Drizzle value. `tools.ts` type-imports `RunIntent` from `@/lib/db/schema` — which it **already does today** for `NinaFactCategory`/`NinaMemorySource`/`NinaSlotValue` (line 25), and which erases at compile — and reaches the database only through `ctx.gateway.aggregateRuns`.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/queries/rollups.ts` | modify | new §5c block after `getAllTimeTotals` (ends line 175): the closed metric-column map and `aggregateRunMetric` |
| `lib/nina/schema.ts` | modify | three const arrays + `AggregateRunsArgsSchema`, inserted after `CompareRunsArgsSchema` (line 93) |
| `lib/nina/prompts/tools.ts` | modify | `AGGREGATE_RUNS_TOOL` after `COMPARE_RUNS_TOOL` (line 186); added to `NINA_TOOLS` (line 276) |
| `lib/nina/prompts/index.ts` | modify | `NINA_PROMPT_VERSION` 7 -> 8 + changelog comment (line 91); re-export `AGGREGATE_RUNS_TOOL` (line 107) |
| `lib/nina/tools.ts` | modify | imports (24, 25, 49, 50-55); `NinaToolGateway` 4th method (after line 120); `NINA_CORE_TOOL_SET` (171-178); new `aggregate_runs` section appended after line 847 |
| `lib/nina/gateway.ts` | modify | import `aggregateRunMetric` (line 5-8); `aggregateRuns` method after `loadRunHistory` (line 364) |
| `tests/fixtures/ninaTurn.ts` | modify | `FakeToolGateway` (67-76) and `fakeToolGateway` (78-94) grow the fourth method |
| `lib/nina/tools.test.ts` | modify | imports (5-15); dispatch-table assertions (218-249); new `handleAggregateRuns` describe |
| `tests/nina.prompts.test.ts` | modify | exact tool-name list (407-416); new enum-parity case |
| `tests/db.queries.rollups.test.ts` | modify | new `aggregateRunMetric` describe appended after line 76 |
| `tests/db.queries.reviewedOnly.test.ts` | modify | one new case after `getAllTimeTotals`'s (line 72) |

Eleven files. No migration, no new column, no new index.

---

## Implementation Steps

### Step 1: The SQL aggregate

**File:** `lib/db/queries/rollups.ts` — change the import on line 12, then append the new block after `getAllTimeTotals` ends at line 175 (before the `ObservedMaxHr` block at line 177).

**Change:** add `RunIntent` to the schema type import, then add the closed metric map and the one parameterised aggregate. `getAllTimeTotals` (163-175) is the template; this generalises it to a chosen column, a chosen aggregation, a date range and an optional intent.

**Code** — line 12 becomes:

```ts
import {
  runSplits,
  runZones,
  runs,
  type Run,
  type RunIntent,
  type RunSplit,
  type RunZone,
} from '../schema'
```

**Code** — appended after line 175:

```ts
/* ============================================================================
 * §5c The one PARAMETERISED aggregate — Nina's `aggregate_runs` (R1)
 * ==========================================================================*/

/**
 * **The metric columns an aggregate may be taken over, as a CLOSED map from key to column.**
 *
 * The map is the type source and the injection boundary at once: `RunMetricKey` is derived from
 * its own keys, so a caller cannot name a column that is not in here, and nothing a model sends is
 * ever interpolated into SQL as a string — the key selects a `PgColumn`, and drizzle renders that
 * column's quoted identifier itself.
 *
 * Three of the six are NOT NULL on every row (`durationSec`, `distanceM`, `avgPaceSec`) and three
 * are nullable (`avgHr`, `activeKcal`, `elevationM`), which is the whole reason `n` below counts
 * non-null READINGS rather than matching rows. Adding a seventh metric is one line here and one
 * line in `NINA_AGGREGATE_METRICS` (`lib/nina/schema.ts`); `tests/nina.prompts.test.ts` fails
 * until the tool schema's `enum` moves with them.
 */
const RUN_METRIC_COLUMNS = {
  durationSec: runs.durationSec,
  distanceM: runs.distanceM,
  avgPaceSec: runs.avgPaceSec,
  avgHr: runs.avgHr,
  activeKcal: runs.activeKcal,
  elevationM: runs.elevationM,
} as const

export type RunMetricKey = keyof typeof RUN_METRIC_COLUMNS

export type RunAggregateFn = 'avg' | 'sum' | 'min' | 'max' | 'count'

export interface RunMetricAggregateParams {
  metric: RunMetricKey
  agg: RunAggregateFn
  /** INCLUSIVE lower bound. */
  startISO: DateISO
  /** EXCLUSIVE upper bound — rule 1 at the top of this file. The caller added the day. */
  endExclusiveISO: DateISO
  /** `null` or omitted means every intent, INCLUDING rows whose intent was never set. */
  intent?: RunIntent | null
}

export interface RunMetricAggregate {
  /** The aggregate. `null` when no reviewed run in the range has a reading for the metric. */
  value: number | null
  /** Runs that contributed a NON-NULL reading — the denominator of an `avg`. */
  n: number
  /** Reviewed runs the filters matched at all. `runCount - n` is how many had no reading. */
  runCount: number
}

/**
 * The aggregation, as a SQL fragment. A `switch` over a closed union rather than a lookup table so
 * that adding a sixth `RunAggregateFn` fails to compile here instead of falling through to a
 * runtime default that quietly returns the wrong function.
 *
 * Every branch is typed `string | number | null` and NOT `.mapWith(Number)`: `avg()` over an
 * integer column returns `numeric` and `sum()`/`count()` return `bigint`, both of which the Neon
 * driver hands back as strings, while `min()`/`max()` come back as numbers — and `Number(null)` is
 * `0`, which is the one wrong answer this function must never give. The caller converts once,
 * after an explicit null check.
 */
function aggregateExpr(
  agg: RunAggregateFn,
  column: (typeof RUN_METRIC_COLUMNS)[RunMetricKey],
): SQL<string | number | null> {
  switch (agg) {
    case 'avg':
      return sql<string | number | null>`avg(${column})`
    case 'sum':
      return sql<string | number | null>`sum(${column})`
    case 'min':
      return sql<string | number | null>`min(${column})`
    case 'max':
      return sql<string | number | null>`max(${column})`
    case 'count':
      return sql<string | number | null>`count(${column})`
  }
}

/**
 * **One aggregate over one metric, over a half-open day range. One row back, never rows.**
 *
 * R1's whole point: an average over two months is a `select avg(...)` the database answers in one
 * row, and materialising the range to reduce over it in TypeScript would cost more and put the
 * arithmetic in the wrong place. `getAllTimeTotals` above is the shape; this is that shape with
 * the column, the function and the window made parameters.
 *
 * Reviewed-only (D16) and `userId`-scoped, like every other function in this file. The range is
 * `>= startISO AND < endExclusiveISO` so `runs_user_occurred_idx` can scan it.
 *
 * **`count` counts non-null READINGS, not matching rows.** `getAllTimeTotals` uses `count(*)`
 * because every column it totals is NOT NULL; three of the six metrics here are nullable, so
 * "how many runs have a recorded elevation gain" has to be answerable — and for the three NOT NULL
 * metrics `count(column)` is identical to `count(*)` anyway. `runCount` carries the row count
 * separately so a caller can tell 12-of-14 from 12-of-12.
 */
export async function aggregateRunMetric(
  userId: string,
  params: RunMetricAggregateParams,
): Promise<RunMetricAggregate> {
  const column = RUN_METRIC_COLUMNS[params.metric]
  const rows = await db
    .select({
      value: aggregateExpr(params.agg, column),
      n: sql<number>`count(${column})`.mapWith(Number),
      runCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        gte(runs.occurredOn, params.startISO),
        lt(runs.occurredOn, params.endExclusiveISO),
        /* `and()` drops undefined members, so "no intent filter" adds no predicate at all rather
         * than a tautology the planner has to reason about. */
        params.intent == null ? undefined : eq(runs.intent, params.intent),
      ),
    )

  const row = rows[0]
  /* An aggregate with no GROUP BY always returns exactly one row; the fallback is here for the
   * same reason `getAllTimeTotals` has one — a driver shape this file does not control. */
  if (row == null) return { value: null, n: 0, runCount: 0 }
  return {
    value: row.value == null ? null : Number(row.value),
    n: row.n,
    runCount: row.runCount,
  }
}
```

The `SQL` type used by `aggregateExpr`'s return annotation needs adding to line 1's import:

```ts
import { and, asc, desc, eq, exists, gt, gte, isNotNull, lt, sql, type SQL } from 'drizzle-orm'
```

**Impact:** `lib/db/queries` gains one exported function. `scripts/check-data-layer-invariants.mjs` scans `export (?:async )?function (\w+)\(([^)]*)` and requires the first argument to start with `userId` — `aggregateRunMetric(userId: string, ...)` satisfies it, so no allowlist edit. `aggregateExpr` is not exported and is not scanned.

---

### Step 2: The Zod contract and the tool's vocabulary

**File:** `lib/nina/schema.ts:93` — insert after `CompareRunsArgsSchema` (ends line 93), before `SaveMemoryArgsSchema` (line 95).

**Change:** three const arrays (the single spelling of the tool's vocabulary) and the args schema. Strict enums, loose dates — the file's own stated split, restated with the reason it applies here.

**Code:**

```ts
/**
 * `aggregate_runs`' vocabulary, spelled ONCE as const arrays so three things derive from it: the
 * Zod enums below, the TypeScript unions `lib/nina/tools.ts` types its gateway call with, and the
 * JSON-Schema `enum` lists in `lib/nina/prompts/tools.ts` — which are a hand-written copy, because
 * that file is a constant with no imports but `type Anthropic` and is meant to stay one.
 * `tests/nina.prompts.test.ts` asserts the copy against these arrays, so "kept in sync by hand"
 * is a checked claim rather than a hopeful comment.
 *
 * Six metrics: the three columns `runs` stores NOT NULL (`durationSec`, `distanceM`,
 * `avgPaceSec`) and the three it stores nullable but usually has (`avgHr`, `activeKcal`,
 * `elevationM`). Five aggregations: what SQL gives for free, and what a question about a training
 * block ever actually asks for.
 */
export const NINA_AGGREGATE_METRICS = [
  'durationSec',
  'distanceM',
  'avgPaceSec',
  'avgHr',
  'activeKcal',
  'elevationM',
] as const

export const NINA_AGGREGATE_FNS = ['avg', 'sum', 'min', 'max', 'count'] as const

/**
 * `runs.intent`'s domain (`lib/db/schema/runs.ts:250`). Copied rather than imported for the same
 * reason the metric list is: this module is the Zod layer and the enum has to be a VALUE array for
 * `z.enum`. Drift is a compile error, not a silent widening — `lib/nina/tools.ts` assigns the
 * parsed value to a `RunIntent | null` field, so a member this list gains and `RunIntent` does not
 * fails `tsc` at that assignment.
 */
export const NINA_AGGREGATE_INTENTS = ['easy', 'tempo', 'long', 'race', 'unspecified'] as const

export type NinaAggregateMetric = (typeof NINA_AGGREGATE_METRICS)[number]
export type NinaAggregateFn = (typeof NINA_AGGREGATE_FNS)[number]
export type NinaAggregateIntent = (typeof NINA_AGGREGATE_INTENTS)[number]

/**
 * **The enums are strict and the DATES are loose**, and the split is the same one
 * `LookupRunsArgsSchema` makes above for the same reason. A bad enum has nothing better to say
 * than Zod's own issue list, which already names the field and its options. A bad DATE does:
 * `handleAggregateRuns` answers it with the string it could not read and the shape it wanted,
 * inside the same budgeted round, and a Zod regex here would turn that into a dispatch failure
 * with nothing to say.
 */
export const AggregateRunsArgsSchema = z.object({
  metric: z.enum(NINA_AGGREGATE_METRICS),
  agg: z.enum(NINA_AGGREGATE_FNS),
  from: z.string().trim().min(1).max(32),
  to: z.string().trim().min(1).max(32),
  intent: z.enum(NINA_AGGREGATE_INTENTS).optional(),
})
```

**Impact:** `lib/nina/schema.ts` still imports only `zod`. No runtime dependency added anywhere.

---

### Step 3: The tool schema

**File:** `lib/nina/prompts/tools.ts:186` — insert between `COMPARE_RUNS_TOOL` (ends 186) and `SAVE_MEMORY_TOOL` (starts 188).

**Change:** the `Anthropic.Tool` constant. `additionalProperties: false`, every truly-required field in `required` **and** `"REQUIRED."`-prefixed in its description, one clause per description — the convention the file's header measures at 5/6 versus 0/3.

**Code:**

```ts
/**
 * **One SQL aggregate, one number** (R1) — the counterpart to `LOOKUP_RUNS_TOOL`, which caps at
 * five named days and returns every per-run fact for each. A question about a training BLOCK
 * ("rata-rata durasi lari gw 2 bulan terakhir") is not five days, and averaging a printed list of
 * rows in prose is exactly the arithmetic invariant 2 exists to refuse.
 *
 * `to` is INCLUSIVE, because that is what a model reasons in: "the last 2 months" ends today, and
 * today is a day he may have run. `handleAggregateRuns` converts it to the half-open upper bound
 * `lib/db/queries/rollups.ts` actually scans — the same translation `monthRange`/`isoWeekRange`
 * already perform for their own callers.
 *
 * The six `metric` values and five `agg` values are the JSON-Schema copy of
 * `NINA_AGGREGATE_METRICS`/`NINA_AGGREGATE_FNS` in `lib/nina/schema.ts`, which is what validates.
 * They are spelled here rather than imported because this module is a constant with no imports but
 * `type Anthropic` (see the header) — and `tests/nina.prompts.test.ts` asserts the two lists are
 * equal, so the copy cannot drift unnoticed.
 */
export const AGGREGATE_RUNS_TOOL: Anthropic.Tool = {
  name: 'aggregate_runs',
  description:
    'One number over a date range — average, total, fastest, slowest or count. Use it when he asks ' +
    'about a stretch of time rather than a day.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['metric', 'agg', 'from', 'to'],
    properties: {
      metric: {
        type: 'string',
        enum: ['durationSec', 'distanceM', 'avgPaceSec', 'avgHr', 'activeKcal', 'elevationM'],
        description: 'REQUIRED. Which number to work out.',
      },
      agg: {
        type: 'string',
        enum: ['avg', 'sum', 'min', 'max', 'count'],
        description: 'REQUIRED. How to combine it. "count" counts runs that have that reading.',
      },
      from: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'REQUIRED. First day of the range, YYYY-MM-DD, worked out from now.todayISO.',
      },
      to: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'REQUIRED. Last day of the range, YYYY-MM-DD. This day is included.',
      },
      intent: {
        type: 'string',
        enum: ['easy', 'tempo', 'long', 'race', 'unspecified'],
        description: 'Only count runs of this kind. Omit for all of them.',
      },
    },
  },
}
```

**Change (same file, line 271-283):** replace the `NINA_TOOLS` block. The doc comment above it says "All six" and names phases 12/13; it now says seven and names this set.

**Code:**

```ts
/**
 * All seven. **The dispatched set is a SUBSET**: `NINA_CORE_TOOL_SET` (`lib/nina/tools.ts`) ships
 * `send`, `lookup_runs`, `compare_runs`, `aggregate_runs` and `save_memory`; phases 12 and 13 add
 * the last two through `extendToolSet`. The array exists so `tests/nina.prompts.test.ts` can walk
 * every schema, not so a caller sends all of it.
 */
export const NINA_TOOLS: readonly Anthropic.Tool[] = [
  SEND_TOOL,
  LOOKUP_RUNS_TOOL,
  COMPARE_RUNS_TOOL,
  AGGREGATE_RUNS_TOOL,
  SAVE_MEMORY_TOOL,
  GENERATE_IMAGE_TOOL,
  SET_AVATAR_TOOL,
]
```

**Impact:** `tests/nina.prompts.test.ts`'s schema walk (line 401) now walks a seventh tool and will fail on any property without a description; its exact-name list (408-415) fails until Step 9 updates it. `tests/integration/ninaImageE2E.int.test.ts:749-753` uses `expect.arrayContaining` and `names[0] === 'send'`, both still true — **no edit needed there** (verified by reading it).

---

### Step 4: The version bump

**File:** `lib/nina/prompts/index.ts:91` and the export block at 107-114.

**Change:** a schema edit is a prompt edit (the rule in `prompts/tools.ts`'s header and in this file's own), so `NINA_PROMPT_VERSION` goes 7 -> 8 with the file's changelog-comment convention. Insert the comment block immediately before line 91 and change the constant.

**Code** — inserted between line 90 and line 91:

```ts
/* 8 — the aggregate-runs-tool set, R1. **A TOOL SCHEMA MOVED, and it is the first one since
 * version 1.** `./tools.ts` gained `AGGREGATE_RUNS_TOOL` and `NINA_TOOLS` went from six entries to
 * seven; `./system.ts` was not opened, so `buildNinaSystemPrompt` is byte-identical to version 7's
 * at every tuning and `tests/__snapshots__/nina.prompts.test.ts.snap` passes UNREGENERATED. What
 * she can now do that she could not before is ask the database for ONE number over a range —
 * average, total, fastest, slowest, count — over one of six run metrics, instead of calling
 * `lookup_runs` for up to five days and averaging the printed rows in prose.
 *
 * The bump is the file header's own rule applied literally: `NINA_PROMPT_VERSION` covers the
 * system text AND every tool schema in `./tools.ts`, and a turn that had a fifth tool in its
 * `body.tools` is a turn `nina_turns` has to be able to tell from version 7's. This is the SINGLE
 * bump for the whole set: it is a one-phase set and no other file touches this constant. */
export const NINA_PROMPT_VERSION = 8
```

**Code** — the export block at 107-114 becomes:

```ts
export {
  AGGREGATE_RUNS_TOOL,
  COMPARE_RUNS_TOOL,
  GENERATE_IMAGE_TOOL,
  LOOKUP_RUNS_TOOL,
  NINA_TOOLS,
  SAVE_MEMORY_TOOL,
  SEND_TOOL,
} from './tools'
```

**Impact:** `lib/nina/tools.ts` imports from `./prompts`, so the re-export is what makes Step 5's import resolve. `nina_turns.prompt_version` rows written after this commit read 8.

---

### Step 5: Dispatch — the gateway method, the handler, the registration

**File:** `lib/nina/tools.ts`.

**5a — imports.** Line 24 becomes a value import (`lib/date/ranges.ts` has no `server-only` and is pure string/integer math — verified), line 25 gains `RunIntent`, line 49 gains the tool, lines 50-55 gain the schema and its types:

```ts
import { addDays, isValidDateISO, type DateISO } from '@/lib/date/ranges'
import type {
  NinaFactCategory,
  NinaMemorySource,
  NinaSlotValue,
  RunIntent,
} from '@/lib/db/schema'
```

```ts
import {
  AGGREGATE_RUNS_TOOL,
  COMPARE_RUNS_TOOL,
  LOOKUP_RUNS_TOOL,
  SAVE_MEMORY_TOOL,
  SEND_TOOL,
} from './prompts'
import {
  AggregateRunsArgsSchema,
  CompareRunsArgsSchema,
  LookupRunsArgsSchema,
  SaveMemoryArgsSchema,
  describeNinaIssues,
  type NinaAggregateFn,
  type NinaAggregateMetric,
} from './schema'
```

**5b — the gateway's fourth method.** Insert the two interfaces immediately before `export interface NinaToolGateway` (line 88), and the method after `appendMemoryFact` closes (line 120, before the interface's closing brace on 121).

**Code** — before line 88:

```ts
/**
 * `aggregate_runs`' request, as the GATEWAY sees it — already validated, already translated.
 *
 * `endExclusiveISO` is EXCLUSIVE and `handleAggregateRuns` is what made it so: the tool's public
 * contract takes an inclusive `to`, because that is what a model reasons in, and the half-open
 * bound every rollup query scans is an implementation detail of the layer below. The translation
 * happens once, in the handler, and this type is where it is already done.
 */
export interface NinaAggregateParams {
  metric: NinaAggregateMetric
  agg: NinaAggregateFn
  /** INCLUSIVE lower bound, `YYYY-MM-DD`. */
  startISO: DateISO
  /** EXCLUSIVE upper bound, `YYYY-MM-DD`. */
  endExclusiveISO: DateISO
  /** `null` means every intent, including runs whose intent was never set. */
  intent: RunIntent | null
}

/** Three numbers and no rows. The shape `lib/db/queries/rollups.ts` returns, restated here so
 * `tools.ts` never has to import it — invariant 9. */
export interface NinaAggregateResult {
  /** `null` when no reviewed run in the range has a reading for the metric. */
  value: number | null
  /** Runs that contributed a NON-NULL reading — the denominator of an `avg`. */
  n: number
  /** Reviewed runs the filters matched at all. */
  runCount: number
}
```

**Code** — inside `NinaToolGateway`, after line 120:

```ts
  /**
   * **R1. The only read here that is NOT served from `loadRunHistory`'s snapshot, and the only one
   * that issues a query per tool CALL.** That is allowed because of what it brings back: three
   * numbers, never rows. An average over a training block is one `select avg(...)` the database
   * answers in a single row; loading the range and reducing over it in TypeScript would cost more
   * and would put the arithmetic in this package, which is what invariant 2 forbids.
   *
   * The date window is already half-open (`NinaAggregateParams`), and the `userId` scope and D16's
   * reviewed-only gate belong to the implementation, exactly as they do for `loadRunHistory`.
   */
  aggregateRuns(userId: string, params: NinaAggregateParams): Promise<NinaAggregateResult>
```

**5c — registration.** Replace `NINA_CORE_TOOL_SET` (171-178) and its doc comment (165-170):

```ts
/**
 * The five tools this package dispatches. `GENERATE_IMAGE_TOOL` and `SET_AVATAR_TOOL` exist in
 * phase 2's module and are **deliberately not here**: a tool she can call and this file cannot
 * dispatch would return an error she then has to apologise for, which is R22's failure mode
 * arriving two phases early.
 *
 * `aggregate_runs` IS here, and not behind `extendToolSet`, on purpose. `extendToolSet` exists to
 * keep tools with their own infrastructure — OpenRouter, image jobs, avatar rotation — out of this
 * file; `aggregate_runs` has the dependency profile of `lookup_runs` and `compare_runs` exactly,
 * one gateway method and `lib/format.ts`, so the reason for the seam does not reach it. Adding it
 * here is also what makes `NINA_CHAT_TOOL_SET` and `NINA_FULL_TOOL_SET` inherit it with no edit in
 * `imagetools.ts` or `avatartools.ts`.
 */
export const NINA_CORE_TOOL_SET: NinaToolSet = {
  tools: [SEND_TOOL, LOOKUP_RUNS_TOOL, COMPARE_RUNS_TOOL, AGGREGATE_RUNS_TOOL, SAVE_MEMORY_TOOL],
  handlers: {
    [LOOKUP_RUNS_TOOL.name]: handleLookupRuns,
    [COMPARE_RUNS_TOOL.name]: handleCompareRuns,
    [AGGREGATE_RUNS_TOOL.name]: handleAggregateRuns,
    [SAVE_MEMORY_TOOL.name]: handleSaveMemory,
  },
}
```

`handleAggregateRuns` is a hoisted `function` declaration in the same module, like its three siblings, so the forward reference at module init is fine.

**5d — the handler.** Append the whole section at the end of the file, after line 847.

**Code:**

```ts
/* ============================================================================
 * aggregate_runs — R1: one SQL aggregate, one number, already spelled
 * ==========================================================================*/

interface AggregateMetricSpec {
  label: string
  /** The unit a reader should hear. Echoed in the answer so she never has to guess it. */
  unit: string
  /** Spelling for an absolute value. Always an existing `lib/format.ts` call — invariant 3. */
  format: (value: number) => string
  /** `'a rise means he ran SLOWER'` — so she never has to infer what a bigger number means. */
  higherMeans: string
  /**
   * True for the two metrics that are ALREADY per-run averages. Two consequences, both below:
   * `sum` over one of them is refused (a column of average paces added up is a number with no
   * meaning, and a meaningless number is the thing a model restates most confidently), and `avg`
   * over one of them carries a caveat — it is the mean of each run's own average, which is not the
   * figure for the whole distance taken together.
   */
  perRunAverage: boolean
}

/**
 * **Every aggregate Nina can ask for, and therefore every aggregate she can ask for AT ALL.**
 *
 * The same shape as `COMPARE_FIELDS` above and for the same reason: a metric is in this table only
 * if `runs` stores it as a per-run number, so a metric that does not exist cannot be added to a
 * prompt — it has to be added to the schema first. The keys are `NinaAggregateMetric`, so this
 * record is exhaustive by type: a seventh metric in `lib/nina/schema.ts` fails to compile until it
 * has a label, a unit, a spelling and a `higherMeans`.
 */
const AGGREGATE_METRICS: Readonly<Record<NinaAggregateMetric, AggregateMetricSpec>> = {
  durationSec: {
    label: 'moving time',
    unit: 'h:mm:ss',
    format: (v) => formatDuration(v),
    higherMeans: 'a bigger number means he was out longer',
    perRunAverage: false,
  },
  distanceM: {
    label: 'distance',
    unit: 'km',
    format: (v) => formatDistanceM(v),
    higherMeans: 'a bigger number means he covered more ground',
    perRunAverage: false,
  },
  avgPaceSec: {
    label: 'average pace',
    unit: 'minutes per km',
    format: (v) => formatPace(v, true),
    higherMeans: 'pace is seconds per km, so a BIGGER number means he ran SLOWER',
    perRunAverage: true,
  },
  avgHr: {
    label: 'average heart rate',
    unit: 'bpm',
    format: (v) => formatBpm(v),
    higherMeans: 'a bigger number means his heart worked harder',
    perRunAverage: true,
  },
  activeKcal: {
    label: 'active calories',
    unit: 'kcal',
    format: (v) => formatKcal(v),
    higherMeans: 'a bigger number means more energy spent, as the watch reported it',
    perRunAverage: false,
  },
  elevationM: {
    label: 'elevation gain',
    unit: 'm',
    format: (v) => formatElevation(v),
    higherMeans: 'a bigger number means more climbing, which makes a slower pace expected',
    perRunAverage: false,
  },
}

/**
 * What each aggregation IS, said the way her sentence should say it. `count` is absent on purpose
 * — it does not read as "the count of average pace", so `situationFor` gives it its own clause.
 */
const AGGREGATE_VERBS: Readonly<Record<Exclude<NinaAggregateFn, 'count'>, string>> = {
  avg: 'The average',
  sum: 'The total',
  min: 'The lowest',
  max: 'The highest',
}

interface AggregateRunsAnswer {
  kind: 'aggregate'
  /** Repeated so the answer is self-contained if she re-reads it three turns later. */
  todayISO: DateISO
  metric: NinaAggregateMetric
  label: string
  agg: NinaAggregateFn
  fromISO: DateISO
  /** INCLUSIVE, exactly as she sent it — never the exclusive bound the query used. */
  toISO: DateISO
  intent: RunIntent | null
  /**
   * **Already spelled, and never a raw second or metre** (invariant 3). `null` means nothing in
   * the range had a reading for this metric, which is an ANSWER and not an error.
   */
  value: string | null
  unit: string
  /** Runs that contributed a reading — the denominator, so she can say "over 11 runs". */
  n: number
  /** Reviewed runs in the range at all. `runCount - n` had no reading for this metric. */
  runCount: number
  higherMeans: string
  situation: string
}

/** Every answer `aggregate_runs` can give. A union, so no branch can return "nothing". */
type AggregateRunsResult =
  | AggregateRunsAnswer
  | { kind: 'invalid'; input: string; situation: string }
  | { kind: 'empty_range'; fromISO: string; toISO: string; situation: string }
  | { kind: 'meaningless'; metric: NinaAggregateMetric; agg: NinaAggregateFn; situation: string }

/**
 * The clause addressed to her, and the reason this tool is safe to hand a model: it names what the
 * number IS, how many runs it came from, that it is already worked out — and, for the two metrics
 * that are themselves averages, what it is NOT.
 *
 * Three states have their own sentence and none of them is an empty object: no runs at all, runs
 * but no readings, and a real number. `lookup_runs`' `no_run` branch makes the same distinction for
 * the same reason (R15): an absence has to get SAID rather than skipped.
 */
function situationFor(input: {
  spec: AggregateMetricSpec
  agg: NinaAggregateFn
  fromISO: DateISO
  toISO: DateISO
  intent: RunIntent | null
  n: number
  runCount: number
  spelled: string | null
}): string {
  const { spec, agg, fromISO, toISO, intent, n, runCount, spelled } = input
  const scope = intent == null ? 'his runs' : `his "${intent}" runs`
  const window = `${fromISO} to ${toISO} inclusive`

  if (runCount === 0) {
    return `NO reviewed runs at all for ${scope} between ${window}. There is nothing to work out. Tell him that.`
  }
  if (spelled == null || n === 0) {
    return `${runCount} reviewed run(s) for ${scope} between ${window}, but NONE has a ${spec.label} reading. Say the number is missing — not that it is zero.`
  }

  const coverage =
    n === runCount ? `all ${n} of them` : `${n} of ${runCount} — the other ${runCount - n} have no reading`
  const head =
    agg === 'count'
      ? `${spelled} of ${scope} between ${window} have a ${spec.label} reading, out of ${runCount} reviewed run(s).`
      : `${AGGREGATE_VERBS[agg]} ${spec.label} for ${scope} between ${window} is ${spelled}, over ${coverage}.`
  const caveat =
    agg === 'avg' && spec.perRunAverage
      ? ` It is the mean of each run's own ${spec.label}, NOT the figure for the whole distance taken together.`
      : ''

  return `${head} It is already worked out — do NOT recompute it.${caveat}`
}

/**
 * **R1. One number, computed by the database, spelled by `lib/format.ts`.**
 *
 * The three things this handler owns, which the layers on either side of it deliberately do not:
 *
 *   - **The date translation.** Her `to` is the last day he means; the query scans `< to + 1 day`.
 *     `monthRange`/`isoWeekRange` already do this for their callers, and doing it here keeps the
 *     half-open convention an implementation detail of `lib/db/queries/rollups.ts`.
 *   - **The refusals.** A malformed day, a backwards range, and `sum` over a metric that is
 *     already an average. Each is a `tool_result` with a sentence she can act on, never a throw —
 *     and, per ruling (g), none of them spends the repair budget.
 *   - **The spelling.** The gateway returns a raw number; this returns `'8.40 km'`. Nothing in the
 *     answer is a number she could subtract from another number, which is invariant 2 applied at
 *     the one other place it could break.
 *
 * `isError` is FALSE for "no runs in that range" and for "no run has that reading". Both are
 * correct, complete answers to a well-formed question, and flagging them would invite her to
 * apologise for the tool instead of telling him what the data says — the same call
 * `handleLookupRuns` makes for `no_run`.
 */
export async function handleAggregateRuns(
  args: unknown,
  ctx: NinaToolContext,
): Promise<NinaToolAnswer> {
  const parsed = AggregateRunsArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: {
        error:
          'aggregate_runs needs { metric, agg, from: "YYYY-MM-DD", to: "YYYY-MM-DD", intent? }.',
        issues: describeNinaIssues(parsed.error),
      },
      isError: true,
    }
  }

  const { metric, agg, from, to } = parsed.data
  /* The one place `NINA_AGGREGATE_INTENTS` meets `RunIntent`. If the two lists ever drift, this
   * assignment is what stops compiling — see `lib/nina/schema.ts`'s note on the copy. */
  const intent: RunIntent | null = parsed.data.intent ?? null
  const spec = AGGREGATE_METRICS[metric]

  for (const input of [from, to]) {
    if (!isValidDateISO(input)) {
      return {
        answer: {
          kind: 'invalid',
          input,
          situation: `"${input}" is not a real calendar day. Send YYYY-MM-DD worked out from todayISO.`,
        } satisfies AggregateRunsResult,
        isError: true,
      }
    }
  }

  if (from > to) {
    /* String comparison is date comparison for `YYYY-MM-DD`, and both sides are already proven to
     * be real days one statement above. */
    return {
      answer: {
        kind: 'empty_range',
        fromISO: from,
        toISO: to,
        situation: `from (${from}) is after to (${to}), so the range holds no days. Send the earlier day as "from".`,
      } satisfies AggregateRunsResult,
      isError: true,
    }
  }

  if (agg === 'sum' && spec.perRunAverage) {
    return {
      answer: {
        kind: 'meaningless',
        metric,
        agg,
        situation: `${spec.label} is already a per-run average, so adding it up across runs means nothing. Ask for "avg", "min" or "max" instead.`,
      } satisfies AggregateRunsResult,
      isError: true,
    }
  }

  const { value, n, runCount } = await ctx.gateway.aggregateRuns(ctx.userId, {
    metric,
    agg,
    startISO: from,
    endExclusiveISO: addDays(to, 1),
    intent,
  })

  const spelled =
    value == null ? null : agg === 'count' ? `${Math.round(value)} run(s)` : spec.format(value)

  const answer: AggregateRunsAnswer = {
    kind: 'aggregate',
    todayISO: ctx.todayISO,
    metric,
    label: spec.label,
    agg,
    fromISO: from,
    toISO: to,
    intent,
    value: spelled,
    unit: agg === 'count' ? 'runs' : spec.unit,
    n,
    runCount,
    higherMeans: spec.higherMeans,
    situation: situationFor({ spec, agg, fromISO: from, toISO: to, intent, n, runCount, spelled }),
  }
  return { answer, isError: false }
}
```

**Impact:** `NINA_CORE_TOOL_SET` grows by one; both derived sets follow at module load with no edit. `lib/nina/tools.ts` still imports no `db`, no `runs`, no Drizzle value — invariant 9 holds.

---

### Step 6: The gateway implementation

**File:** `lib/nina/gateway.ts` — import at lines 5-8, method inserted after `loadRunHistory` closes (line 364).

**Change:** a pass-through. Every rule that matters (userId scope, D16's reviewed-only gate, the half-open scan) already lives in `aggregateRunMetric`, and the inclusive-to-exclusive translation already happened in the handler, so this method's whole job is to be the seam that keeps `tools.ts` free of a database import.

**Code** — lines 4-8 become:

```ts
import {
  aggregateRunMetric,
  getAllTimeTotals,
  getReviewedRunsWithChildren,
  getReviewedRunWindow,
} from '@/lib/db/queries'
```

**Code** — the import on line 41 gains the two new types:

```ts
import type {
  NinaAggregateParams,
  NinaAggregateResult,
  NinaDetailedRunInput,
  NinaRunHistory,
  NinaToolGateway,
} from './tools'
```

**Code** — inserted after line 364 (after `loadRunHistory`'s closing `},`), before `async saveMemorySlot`:

```ts
  /**
   * **R1. The one read in this object that runs per tool CALL instead of once per turn** — and
   * what makes that acceptable is the payload: three numbers, never rows. `loadRunHistory` above
   * is one `db.batch` for the whole history because the tools that read it need per-run facts; an
   * average over a training block is a `select avg(...)` that returns a single row, and
   * materialising the range to reduce over it here would cost more AND put arithmetic in a gateway,
   * which this file's header forbids in as many words.
   *
   * A pass-through, deliberately. `aggregateRunMetric` already applies the `userId` scope and
   * D16's `reviewed_at is not null` gate, and the inclusive-`to` translation already happened in
   * `handleAggregateRuns`, where the tool's public contract lives. Nothing is left for this method
   * to decide, which is the point — the seam exists for invariant 9, not for logic.
   */
  async aggregateRuns(
    userId: string,
    params: NinaAggregateParams,
  ): Promise<NinaAggregateResult> {
    return aggregateRunMetric(userId, {
      metric: params.metric,
      agg: params.agg,
      startISO: params.startISO,
      endExclusiveISO: params.endExclusiveISO,
      intent: params.intent,
    })
  },
```

**Impact:** `dbNinaToolGateway` satisfies the widened `NinaToolGateway`. The explicit parameter types are what make the metric/agg unions cross-check against `RunMetricKey`/`RunAggregateFn` at compile time — if `lib/nina/schema.ts`'s arrays ever gain a member `lib/db/queries/rollups.ts` has no column for, **this call is the line that fails `tsc`**.

---

### Step 7: The test gateway fake

**File:** `tests/fixtures/ninaTurn.ts:67-94` — replace the interface and the factory.

**Change:** record every call (so a test can assert the half-open window the handler built) and let a test set the result.

**Code:**

```ts
export interface FakeToolGateway extends NinaToolGateway {
  /**
   * `value` is `NinaSlotValue` and not `string` because phase 5 widened
   * `NinaToolGateway.saveMemorySlot` to carry `pending_promises`' structured value. The recorder
   * has to be at least as wide as the row it records; every assertion against it still compares a
   * plain string, because that is what phase 3's `save_memory` writes.
   */
  slots: Array<{ key: string; value: NinaSlotValue }>
  facts: Array<{ text: string; sourceMessageId: string | null }>
  /**
   * Every `aggregate_runs` call, in order. Recorded rather than asserted through a spy because the
   * interesting thing about the call is the WINDOW: the handler takes an inclusive `to` and must
   * hand this method the exclusive bound, and that translation is only visible here.
   */
  aggregates: NinaAggregateParams[]
  /** What the next `aggregateRuns` returns. Assign to it in the test that cares. */
  aggregateResult: NinaAggregateResult
}

export function fakeToolGateway(history: NinaRunHistory = runHistoryFixture()): FakeToolGateway {
  const slots: Array<{ key: string; value: NinaSlotValue }> = []
  const facts: Array<{ text: string; sourceMessageId: string | null }> = []
  const aggregates: NinaAggregateParams[] = []
  const gateway: FakeToolGateway = {
    slots,
    facts,
    aggregates,
    /* The empty account, which is the honest default: a fixture that returned a number would make
     * every unrelated turn test a test of that number. */
    aggregateResult: { value: null, n: 0, runCount: 0 },
    async loadRunHistory() {
      return history
    },
    async saveMemorySlot(_userId, row) {
      slots.push(row)
    },
    async appendMemoryFact(_userId, row) {
      facts.push(row)
    },
    async aggregateRuns(_userId, params) {
      aggregates.push(params)
      return gateway.aggregateResult
    },
  }
  return gateway
}
```

**Code** — the import at lines 6-11 gains the two types:

```ts
import {
  NINA_CORE_TOOL_SET,
  type NinaAggregateParams,
  type NinaAggregateResult,
  type NinaDetailedRunInput,
  type NinaRunHistory,
  type NinaToolGateway,
} from '@/lib/nina/tools'
```

**Impact:** every existing test that builds a `NinaToolContext` keeps compiling; `lib/nina/turn.test.ts` and the two `ninaImageE2E` suites use this factory and need no edit of their own.

---

### Step 8: `lib/nina/tools.test.ts`

**File:** `lib/nina/tools.test.ts` — imports at 5-15, the dispatch-table describe at 218-249, plus a new describe.

**Change (imports, 5-15):**

```ts
import {
  COMPARE_FIELDS,
  NINA_CORE_TOOL_SET,
  compareRunFacts,
  dispatchNinaTool,
  extendToolSet,
  handleAggregateRuns,
  handleCompareRuns,
  handleLookupRuns,
  handleSaveMemory,
  type NinaToolContext,
} from './tools'
```

**Change (the three stale counts).** Line 221-227 becomes:

```ts
    expect(NINA_CORE_TOOL_SET.tools.map((t) => t.name)).toEqual([
      'send',
      'lookup_runs',
      'compare_runs',
      'aggregate_runs',
      'save_memory',
    ])
```

Lines 229-235 become:

```ts
  it('ships exactly four handlers — generate_image and set_avatar are phases 12 and 13', () => {
    expect(Object.keys(NINA_CORE_TOOL_SET.handlers).sort()).toEqual([
      'aggregate_runs',
      'compare_runs',
      'lookup_runs',
      'save_memory',
    ])
  })
```

Lines 246-248 become:

```ts
    expect(Object.keys(extended.handlers)).toHaveLength(5)
    expect(Object.keys(NINA_CORE_TOOL_SET.handlers)).toHaveLength(4)
    expect(NINA_CORE_TOOL_SET.tools).toHaveLength(5)
```

**Change:** append the new describe at the end of the file.

**Code:**

```ts
describe('handleAggregateRuns', () => {
  it('hands the gateway a HALF-OPEN window built from her inclusive "to"', async () => {
    const gateway = fakeToolGateway()
    gateway.aggregateResult = { value: 2843, n: 11, runCount: 11 }
    const { isError } = await handleAggregateRuns(
      { metric: 'durationSec', agg: 'avg', from: '2026-07-04', to: '2026-09-03' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(isError).toBe(false)
    expect(gateway.aggregates).toEqual([
      {
        metric: 'durationSec',
        agg: 'avg',
        startISO: '2026-07-04',
        // 2026-09-04, not 2026-09-03: her last day is INCLUDED, and the query scans `< bound`.
        endExclusiveISO: '2026-09-04',
        intent: null,
      },
    ])
  })

  it('spells the value and never hands back a raw second — invariant 3', async () => {
    const gateway = fakeToolGateway()
    gateway.aggregateResult = { value: 2843.66, n: 11, runCount: 11 }
    const { answer } = await handleAggregateRuns(
      { metric: 'durationSec', agg: 'avg', from: '2026-07-04', to: '2026-09-03' },
      ctx(runHistoryFixture(), gateway),
    )
    const result = answer as { value: string; unit: string; n: number; situation: string }
    expect(result.value).toBe('47:24')
    expect(result.unit).toBe('h:mm:ss')
    expect(result.n).toBe(11)
    expect(result.situation).toContain('do NOT recompute')
    // Nothing in the answer may be a number she could subtract from another number.
    expect(answer).not.toHaveProperty('raw')
  })

  it('passes an intent filter through, and reports it back', async () => {
    const gateway = fakeToolGateway()
    gateway.aggregateResult = { value: 12400, n: 4, runCount: 4 }
    const { answer } = await handleAggregateRuns(
      { metric: 'distanceM', agg: 'max', from: '2026-08-01', to: '2026-08-31', intent: 'long' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(gateway.aggregates[0]!.intent).toBe('long')
    expect((answer as { intent: string }).intent).toBe('long')
    expect((answer as { value: string }).value).toBe('12.40 km')
  })

  it('says an empty range out loud and does NOT report it as an error', async () => {
    const gateway = fakeToolGateway()
    gateway.aggregateResult = { value: null, n: 0, runCount: 0 }
    const { answer, isError } = await handleAggregateRuns(
      { metric: 'avgHr', agg: 'avg', from: '2026-01-01', to: '2026-01-31' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(isError).toBe(false)
    const result = answer as { value: string | null; situation: string }
    expect(result.value).toBeNull()
    expect(result.situation).toContain('NO reviewed runs')
  })

  it('distinguishes "no runs" from "no readings" — a missing number is not zero', async () => {
    const gateway = fakeToolGateway()
    gateway.aggregateResult = { value: null, n: 0, runCount: 6 }
    const { answer, isError } = await handleAggregateRuns(
      { metric: 'elevationM', agg: 'avg', from: '2026-08-01', to: '2026-08-31' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(isError).toBe(false)
    const result = answer as { value: string | null; runCount: number; situation: string }
    expect(result.value).toBeNull()
    expect(result.runCount).toBe(6)
    expect(result.situation).toContain('not that it is zero')
  })

  it('names the coverage when some runs have no reading', async () => {
    const gateway = fakeToolGateway()
    gateway.aggregateResult = { value: 151, n: 9, runCount: 14 }
    const { answer } = await handleAggregateRuns(
      { metric: 'avgHr', agg: 'avg', from: '2026-08-01', to: '2026-08-31' },
      ctx(runHistoryFixture(), gateway),
    )
    const result = answer as { value: string; situation: string }
    expect(result.value).toBe('151 bpm')
    expect(result.situation).toContain('9 of 14')
  })

  it('warns that an average of average paces is not the overall pace', async () => {
    const gateway = fakeToolGateway()
    gateway.aggregateResult = { value: 402, n: 8, runCount: 8 }
    const { answer } = await handleAggregateRuns(
      { metric: 'avgPaceSec', agg: 'avg', from: '2026-08-01', to: '2026-08-31' },
      ctx(runHistoryFixture(), gateway),
    )
    const result = answer as { value: string; situation: string }
    expect(result.value).toBe(`6'42"/km`)
    expect(result.situation).toContain('NOT the figure for the whole distance')
  })

  it('refuses to add up a column of averages, and names the aggregation that was meant', async () => {
    const gateway = fakeToolGateway()
    const { answer, isError } = await handleAggregateRuns(
      { metric: 'avgPaceSec', agg: 'sum', from: '2026-08-01', to: '2026-08-31' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(isError).toBe(true)
    expect((answer as { kind: string }).kind).toBe('meaningless')
    expect((answer as { situation: string }).situation).toContain('"avg"')
    // The refusal happens BEFORE the query — a meaningless number is never computed.
    expect(gateway.aggregates).toHaveLength(0)
  })

  it('answers a malformed date as a tool result, not a throw', async () => {
    const gateway = fakeToolGateway()
    const { answer, isError } = await handleAggregateRuns(
      { metric: 'distanceM', agg: 'sum', from: 'bulan lalu', to: '2026-08-31' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(isError).toBe(true)
    expect((answer as { kind: string }).kind).toBe('invalid')
    expect((answer as { input: string }).input).toBe('bulan lalu')
    expect(gateway.aggregates).toHaveLength(0)
  })

  it('refuses a backwards range and says which way round it should be', async () => {
    const gateway = fakeToolGateway()
    const { answer, isError } = await handleAggregateRuns(
      { metric: 'distanceM', agg: 'sum', from: '2026-08-31', to: '2026-08-01' },
      ctx(runHistoryFixture(), gateway),
    )
    expect(isError).toBe(true)
    expect((answer as { kind: string }).kind).toBe('empty_range')
    expect(gateway.aggregates).toHaveLength(0)
  })

  it('refuses a metric it does not have a column for, with the field named', async () => {
    const { answer, isError } = await handleAggregateRuns(
      { metric: 'restingHr', agg: 'avg', from: '2026-08-01', to: '2026-08-31' },
      ctx(),
    )
    expect(isError).toBe(true)
    expect(answer).toHaveProperty('issues')
    expect((answer as { issues: string }).issues).toContain('metric')
  })

  it('counts runs that HAVE the reading, spelled as runs', async () => {
    const gateway = fakeToolGateway()
    gateway.aggregateResult = { value: 9, n: 9, runCount: 14 }
    const { answer } = await handleAggregateRuns(
      { metric: 'elevationM', agg: 'count', from: '2026-08-01', to: '2026-08-31' },
      ctx(runHistoryFixture(), gateway),
    )
    const result = answer as { value: string; unit: string; situation: string }
    expect(result.value).toBe('9 run(s)')
    expect(result.unit).toBe('runs')
    expect(result.situation).toContain('out of 14')
  })

  it('reaches the same handler through dispatchNinaTool', async () => {
    const gateway = fakeToolGateway()
    gateway.aggregateResult = { value: 8400, n: 3, runCount: 3 }
    const { answer, isError } = await dispatchNinaTool(
      'aggregate_runs',
      { metric: 'distanceM', agg: 'avg', from: '2026-08-01', to: '2026-08-31' },
      ctx(runHistoryFixture(), gateway),
      NINA_CORE_TOOL_SET.handlers,
    )
    expect(isError).toBe(false)
    expect((answer as { value: string }).value).toBe('8.40 km')
  })
})
```

**Impact:** `formatDuration(2843.66)` rounds to 2844 s = `47:24`; `formatPace(402, true)` is `6'42"/km`; `formatDistanceM(12400)` is `12.40 km`. All three are the existing `lib/format.ts` spellings, read from the file — no new formatter.

---

### Step 9: `tests/nina.prompts.test.ts`

**File:** `tests/nina.prompts.test.ts` — the exact-name case at 407-416, plus one new case.

**Change:** update the list and add the parity check that makes the hand-written JSON-Schema enums a checked copy rather than a promise. The import block at 20-30 gains `AGGREGATE_RUNS_TOOL`, and a new import pulls the const arrays.

**Code** — replace lines 407-416:

```ts
  it('defines the seven tools phases 3, 12 and 13 expect, under these exact names', () => {
    expect(NINA_TOOLS.map((t) => t.name)).toEqual([
      'send',
      'lookup_runs',
      'compare_runs',
      'aggregate_runs',
      'save_memory',
      'generate_image',
      'set_avatar',
    ])
  })

  /*
   * `AGGREGATE_RUNS_TOOL`'s enums are a hand-written copy of `lib/nina/schema.ts`'s const arrays —
   * that file is what VALIDATES, this one is what the model reads, and `prompts/tools.ts` is a
   * constant with no imports but `type Anthropic` on purpose. This case is what makes the copy
   * safe: a metric added to one list and not the other fails here instead of becoming a tool call
   * the model is invited to make and Zod then refuses.
   */
  it('keeps aggregate_runs’ enums equal to the Zod vocabulary that validates them', () => {
    const properties = (
      AGGREGATE_RUNS_TOOL.input_schema as unknown as {
        properties: Record<string, { enum?: readonly string[] }>
      }
    ).properties
    expect(properties.metric!.enum).toEqual([...NINA_AGGREGATE_METRICS])
    expect(properties.agg!.enum).toEqual([...NINA_AGGREGATE_FNS])
    expect(properties.intent!.enum).toEqual([...NINA_AGGREGATE_INTENTS])
  })
```

**Code** — the prompts import block (20-30) gains `AGGREGATE_RUNS_TOOL` as its first entry, and a new import goes with the other `@/lib/nina/*` imports:

```ts
import {
  NINA_AGGREGATE_FNS,
  NINA_AGGREGATE_INTENTS,
  NINA_AGGREGATE_METRICS,
} from '@/lib/nina/schema'
```

**Impact:** the generic schema walk at 401-404 already covers the new tool's descriptions — it will fail if any property or the tool itself lacks one, which is the 2026-08-21 measurement enforced.

---

### Step 10: `tests/db.queries.rollups.test.ts`

**File:** append after line 76.

**Change:** assert the real generated SQL through `installFakeDb` — the half-open scan, the reviewed gate, the userId scope, the absent-vs-present intent predicate, and that the metric reaches SQL as a quoted identifier and never as a bound parameter.

**Code:**

```ts
describe('aggregateRunMetric — the one parameterised aggregate', () => {
  it('scans a half-open range and aggregates in SQL, returning no rows', async () => {
    fake.enqueue([['2843.6666', '11', '11']])
    const result = await q.aggregateRunMetric('u1', {
      metric: 'durationSec',
      agg: 'avg',
      startISO: '2026-07-04',
      endExclusiveISO: '2026-09-04',
    })
    const { sql, params } = fake.only()
    expect(sql).toContain('avg(')
    expect(sql).toContain('>=')
    expect(sql).toContain('<')
    expect(sql).not.toContain('to_char')
    expect(params).toContain('2026-07-04')
    expect(params).toContain('2026-09-04')
    // numeric comes back from the driver as a string; Number() happens once, after a null check.
    expect(result).toEqual({ value: 2843.6666, n: 11, runCount: 11 })
  })

  it('is userId-scoped and reviewed-only, like every other rollup', async () => {
    fake.enqueue([[null, '0', '0']])
    await q.aggregateRunMetric('u1', {
      metric: 'elevationM',
      agg: 'sum',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    const { sql, params } = fake.only()
    expect(sql).toContain('"user_id"')
    expect(sql).toContain('"reviewed_at" is not null')
    expect(params).toContain('u1')
  })

  it('names the metric COLUMN in the SQL and never binds it as a parameter', async () => {
    fake.enqueue([['151', '9', '14']])
    await q.aggregateRunMetric('u1', {
      metric: 'avgHr',
      agg: 'avg',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    const { sql, params } = fake.only()
    expect(sql).toContain('"avg_hr"')
    // The closed map is the injection boundary: nothing a caller names becomes a bound string.
    expect(params).not.toContain('avgHr')
    expect(params).not.toContain('avg_hr')
  })

  it('adds no intent predicate when no intent is asked for', async () => {
    fake.enqueue([['0', '0', '0']])
    await q.aggregateRunMetric('u1', {
      metric: 'distanceM',
      agg: 'sum',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    expect(fake.only().sql).not.toContain('"intent"')
  })

  it('filters on intent when one is asked for', async () => {
    fake.enqueue([['12400', '4', '4']])
    await q.aggregateRunMetric('u1', {
      metric: 'distanceM',
      agg: 'max',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
      intent: 'long',
    })
    const { sql, params } = fake.only()
    expect(sql).toContain('"intent"')
    expect(params).toContain('long')
  })

  it('counts NON-NULL readings, so a nullable metric can be asked how many runs have it', async () => {
    fake.enqueue([['9', '9', '14']])
    const result = await q.aggregateRunMetric('u1', {
      metric: 'elevationM',
      agg: 'count',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    // `n` is count(column) and `runCount` is count(*) — 9 of 14 runs recorded an elevation gain.
    expect(result.n).toBe(9)
    expect(result.runCount).toBe(14)
    expect(fake.only().sql).toContain('count(*)')
  })

  it('returns null and NOT zero when nothing in the range has a reading', async () => {
    fake.enqueue([[null, '0', '6']])
    const result = await q.aggregateRunMetric('u1', {
      metric: 'activeKcal',
      agg: 'avg',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    // Number(null) is 0, which is the one wrong answer this function must never give.
    expect(result.value).toBeNull()
    expect(result.runCount).toBe(6)
  })
})
```

---

### Step 11: `tests/db.queries.reviewedOnly.test.ts`

**File:** insert after the `getAllTimeTotals` case (ends line 72).

**Change:** the file's header says adding a new rollup without adding it to this list is the mistake the test is for. Honour it.

**Code:**

```ts
  it('aggregateRunMetric filters on reviewed_at — the number Nina reads out loud', async () => {
    fake.enqueue([[null, '0', '0']])
    await q.aggregateRunMetric('u1', {
      metric: 'durationSec',
      agg: 'avg',
      startISO: '2026-08-01',
      endExclusiveISO: '2026-09-01',
    })
    expect(fake.only().sql).toContain('"reviewed_at" is not null')
  })
```

---

## Verification

The worktree has **no `node_modules`** (checked: `ls` fails). Install first, in the worktree, and copy `.env.local` from the primary checkout — env validation needs it and a `node_modules` symlink passes vitest but fails a Turbopack build:

**Setup:** `cd /home/miftah/.worktrees/run-insights/aggregate-runs-tool && npm install && cp /home/miftah/run-insights/.env.local .`

**Build:** `npx next typegen && npx tsc --noEmit` (`vitest` does not typecheck; this is the gate)
**Guards:** `npm run ci:data-layer-guard && npm run lint && npm run knip && npx prettier --check lib/nina lib/db/queries/rollups.ts tests`
**Tests, narrow first:**

    npx vitest run lib/nina/tools.test.ts tests/nina.prompts.test.ts tests/db.queries.rollups.test.ts tests/db.queries.reviewedOnly.test.ts

**Tests, full sweep:** `npm test`
**Snapshot check:** `tests/__snapshots__/nina.prompts.test.ts.snap` must pass **UNREGENERATED** — `prompts/system.ts` is untouched, so `buildNinaSystemPrompt` is byte-identical at every tuning. If the snapshot moves, something out of scope was edited.

**Manual check:** in `lib/nina/tools.ts`, grep the import block for `db`, `runs`, `drizzle` — there must be no value import of any of them (invariant 9). Same for `lib/nina/prompts/tools.ts`, whose only import stays `import type Anthropic from '@anthropic-ai/sdk'`.

**Exit criteria:**
1. `dispatchNinaTool('aggregate_runs', { metric, agg, from, to }, ctx, NINA_CORE_TOOL_SET.handlers)` returns `{ value: <spelled string>, unit, n, runCount, situation }` with `isError: false`.
2. A bad enum, a malformed date and `from > to` each return a structured `isError: true` answer and **issue no query** (asserted through `gateway.aggregates`).
3. `NINA_CORE_TOOL_SET.tools` has 5 entries with `send` first; `.handlers` has 4.
4. `NINA_PROMPT_VERSION === 8`.
5. `npx tsc --noEmit` clean, `npm test` green, `npm run ci:data-layer-guard` prints its two OK lines.
6. No file under `drizzle/` changed; `git status` shows exactly the eleven files in the Files table (plus `AGENTS.md` if `next dev` rewrote it — commit that with the work, per the repo instruction).

## Handoffs

Nothing belongs to another phase — this is a one-phase set. Work found and deliberately **not** done:

- **`lib/nina/prompts/system.ts` never mentions the new tool.** Whether a sentence in `NUMBERS_RULE` or `CONTEXT_GUIDE` should tell her to prefer `aggregate_runs` over five `lookup_runs` calls is a prompt-CONTENT question, and `prompts/tools.ts`'s header is explicit that content belongs in the system prompt while tool-call validity belongs in the descriptions. Raising the tool's pickup rate by tuning either against live traffic is named out of scope by the plan index and would need its own measurement.
- **Week/month bucketing and two-range comparison** ("this month vs last month in one call") — out of scope per the index. The shape that would serve it is `aggregateRunMetric` called twice and a `compareRunFacts`-style precomputed delta; nothing in this phase blocks it.
- **`avgCadence`, `maxHr`, `restingHr`, `totalKcal`** are columns `runs` has and this tool does not offer. Adding one is two lines (the `RUN_METRIC_COLUMNS` entry and the `NINA_AGGREGATE_METRICS` entry) plus an `AGGREGATE_METRICS` spec, and the parity test fails until all three move.
- **`lib/nina/.workflows/package_readme.md` and `.workflows/todos.md`** are the completion-handler's, per the index's out-of-scope list.
- **The `README`/docs mention of "the four tools Nina can call"**, if one exists outside `lib/nina/**`, was not searched for — a drive-by doc sweep is not this phase's work.

## Rollback

`git revert` the phase's commit(s) on `feature/aggregate-runs-tool`, or delete the branch. Nothing else depends on it:

- No migration, no schema change, no index — `drizzle/` is untouched, so there is nothing to un-apply against the (single, production) database.
- The tool is **read-only**. No row was written by anything this phase adds, so a revert leaves no data behind and no data missing.
- Reverting drops `aggregate_runs` from `NINA_TOOLS` and `NINA_CORE_TOOL_SET` (and therefore from `NINA_CHAT_TOOL_SET`/`NINA_FULL_TOOL_SET` automatically), removes the fourth `NinaToolGateway` method from both implementations, and returns `NINA_PROMPT_VERSION` to 7. `nina_turns` rows already stamped `prompt_version = 8` stay — which is the point of the constant, and correct: those turns really were run with a five-tool set.
