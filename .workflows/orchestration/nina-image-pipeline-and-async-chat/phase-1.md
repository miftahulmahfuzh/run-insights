# Phase 1: Unblock the camera: the three measured defects

**Plan set:** `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md`
**Analysis:** `20260906-204533-IMG9_code_analyzer.md`
**Satisfies:** R2 — no photograph has ever reached a chat bubble; this phase makes the shipped
architecture capable of landing one.
**Depends on:** none
**Difficulty:** HARD
**Package:** `scripts/`, `lib/nina`

---

## Goal

After this phase the GitHub Actions worker can claim the job it was dispatched for, can write the
`nina_messages` row that makes a photograph visible, and cannot lose the money it spent when that
write fails. The class of defect that produced Finding 1 — a `NOT NULL` column added to a table the
worker INSERTs into, invisible to an existence-only preflight — becomes a loud red workflow instead
of a silently unwritten photograph. Finding 3's measured schedule cadence is recorded where the
threshold chain is derived, so nobody re-derives it from the `*/10` the workflow declares.

This phase repairs the shipped architecture in place. It does not move the generation host; phase 2
owns that, and reverting phase 2 must land on a *working* pipeline, which is what this phase builds.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none

**Renames:** none

**Creates:**
- `scripts/nina-image-worker.ts` — `WorkerTable` (interface), `SchemaColumn` (interface, exported),
  `findSchemaDrift` (exported), `dispatchCutoffFor` (exported), `resolveWorkerSessionId` (exported)
- `lib/nina/imagerecipe.ts` — `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` (exported const, `6_360_000`)

**Signature changes:**
- `scripts/nina-image-worker.ts` — `finishSelfie` and `closeFailed` change from module-private to
  `export`ed (so the regression tests can drive them without a database).
- `closeFailed(sql, job, outcome)` — `outcome` gains a required field:
  `{ kind, latencyMs, detail }` -> `{ kind, latencyMs, detail, costMicroUsd: number | null }`.
  All three call sites are inside `runOneJob` in the same file.
- `preflight`'s private `REQUIRED_COLUMNS` changes shape from
  `Record<string, readonly string[]>` to `Record<string, WorkerTable>`. Not exported; no external
  reader exists (verified: `grep -rn REQUIRED_COLUMNS` matches only this file).

**Behavioural contract changes visible to later phases:**
- **`nina_turns.cost_micro_usd` on a `kind='image'` row is a PER-JOB CUMULATIVE TOTAL, on every
  path and on every host.** RECONCILED (see the plan index's *Decisions*, rung 1: invariant 9).
  Every write in this file becomes `coalesce(cost_micro_usd, 0) + spend` — the two `closeFailed`
  branches (Steps 6), **and the success paths in `finishSelfie` and `finishAvatar` (Step 5 and
  Step 5b)**. A single overwrite would silently discard the first attempt's spend when the second
  attempt writes, and two OpenRouter calls recorded as one is exactly the "money spent silently"
  invariant 9 forbids. Phase 2 applies the identical rule to its in-platform writes
  (`completeNinaImageJob`, `requeueNinaImageJob`, `failNinaImageJob`); phase 4 renders it as
  "total spent on this job" beside `attempts`; phase 7 asserts `2 x NINA_IMAGE_COST_MICRO_USD` on
  a job that burned both attempts.
- A worker-written `nina_messages` row now always carries `session_id`, satisfying invariant 6.
  Phase 4's `replyToId -> sessionId` resolution and phase 7's end-to-end assertion both depend on
  this.

**Requires (from earlier phases):** nothing. This phase has no `depends_on` and assumes `origin/main`
@ `02dc79a` as the tree.

**Leaves alone (owned by others):**
- `app/**`, `components/**` — phases 2–5
- `lib/nina/actions.ts` — phase 3
- `lib/nina/imagedispatch.ts`, `lib/nina/imagejobs.ts` — phase 2 (host choice) and phase 4
  (projection). This phase does **not** touch either file.
- `lib/nina/queries.ts`, `lib/nina/sessionActions.ts`, `lib/db/schema.ts`, `drizzle/**` — phase 6.
  **No migration is generated here and no `claimed_at` column is added**, though `claimJob`'s own
  comment invites one; a schema change here would collide with phase 6's generated migration.
- No `maxDuration` anywhere is raised (phase 2).

**Shared-file warnings — RECONCILED. These three hunks collide with phase 2 and the resolution is
binding on both plans:**

1. `.github/workflows/nina-image.yml` — phase 2 owns this file's *demotion to backstop*. This phase
   edits **comments only**, in exactly two blocks: the header's schedule paragraph (lines 13–16) and
   the `schedule:` block's comment (lines 31–36). The `on:`, `concurrency:`, `permissions:` and
   `jobs:` bodies are untouched. **Phase 2's Step 9 rewrites the same comments wholesale and
   supersedes this phase's version on those hunks** — its replacement header already contains the
   twelve measured `schedule` run timestamps and the "1 h 46 m to 4 h 19 m" fact verbatim. Keep
   exactly ONE copy of the measurement. Nothing in this phase's version may survive as a duplicate.
2. `lib/nina/imagerecipe.ts:98–115` (the whole `/* ── The threshold chain ── */` block, verified
   against the real file: the banner is exactly line 98 and `NINA_IMAGE_SWEEP_BUDGET` is exactly
   line 115). This phase changes **no existing constant's value**; it adds
   `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` and rewrites two doc comments. **Phase 2's Step 7b
   replaces that entire block and therefore supersedes this phase's comments — but it MUST carry
   `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS = 6_360_000` and the measured-cadence paragraph forward
   into its replacement.** Phase 2's plan has been edited to do so. If that constant is dropped,
   `tests/nina.imagerecipe.test.ts` stops compiling.
3. `tests/nina.imagerecipe.test.ts` — this phase **adds one `it()`** to the existing
   `describe('the threshold chain')` and adds one import. **Phase 2 rewrites that whole describe
   block and MUST keep this phase's `it()` and its import.** The assertion needs no numeric change
   across phase 2: phase 2 keeps `NINA_IMAGE_STALE_MS` at `1_200_000`, so `6_360_000 > 1_200_000`
   still holds. It must be *preserved*, not deleted — it is the only thing standing between a
   future reader and re-deriving a ten-minute rescue from the declared `*/10`.

## Files

| File | Action | What changes |
|---|---|---|
| `scripts/nina-image-worker.ts` | modify | `REQUIRED_COLUMNS` reshaped + `nina_chat_sessions` added (`:133`); `findSchemaDrift` extracted and NOT-NULL coverage added (`:177`); `dispatchCutoffFor` added and `claimJob`'s dispatch predicate re-pointed at it (`:250`); `resolveWorkerSessionId` added (new, after `store`); `finishSelfie` writes `session_id` and **accumulates** `cost_micro_usd` (`:423`); **`finishAvatar` accumulates `cost_micro_usd`** (Step 5b); `closeFailed` writes `session_id`, survives a failed apology, and takes a spend (`:517`); `runOneJob`'s three `closeFailed` call sites pass the spend (`:564`) |
| `lib/nina/imagerecipe.ts` | modify | `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` added after `NINA_IMAGE_STALE_MS` (`:113`); `NINA_IMAGE_STALE_MS`'s and `NINA_IMAGE_DISPATCH_GRACE_MS`'s doc comments made honest about Findings 2 and 3 |
| `.github/workflows/nina-image.yml` | modify | comments only: the header's schedule paragraph (`:13`) and the `schedule:` block's comment (`:31`) record the measured gaps |
| `tests/nina.imageworker.test.ts` | modify | a `fakeSql` harness plus four new `describe` blocks: `findSchemaDrift`, `dispatchCutoffFor`/`claimJob`, `resolveWorkerSessionId`/`finishSelfie`, `closeFailed` |
| `tests/nina.imagerecipe.test.ts` | modify | one import and one `it()` asserting the backstop cannot beat the give-up |

Five files. No file is created and none is deleted.

---

## Implementation Steps

### Step 1: Reshape `REQUIRED_COLUMNS` so it knows which tables this worker INSERTs into

**File:** `scripts/nina-image-worker.ts:127-175`
**Change:** Replace the whole `REQUIRED_COLUMNS` block (its doc comment and the constant) with a
table spec that records, per table, whether this file inserts into it — because only an INSERT target
can omit a `NOT NULL` column. `nina_chat_sessions` joins the list because `resolveWorkerSessionId`
(Step 4) reads it.

**Code:**

```ts
/**
 * Every column this file names for a table, and whether this file INSERTs rows into it.
 *
 * `columns` is **the duplication `lib/db/schema.ts` costs us**, and checking it against
 * `information_schema` on every run is what makes the duplication safe: a rename surfaces as a red
 * workflow on the very next run instead of as a silently unwritten photograph.
 *
 * `inserts` is **FINDING 1'S CLASS, made structural.** Checking that every column we name EXISTS is
 * only half a check: it catches a rename and it is blind to an ADDITION. Migration 0004 added
 * `nina_messages.session_id text NOT NULL` after this worker was written; both INSERTs kept
 * compiling, kept passing preflight, and every generation crashed on the write that would have made
 * the photograph visible — after the money was spent. So for an INSERT target `findSchemaDrift`
 * also runs the CONVERSE: every `NOT NULL` column the database does not fill for us must appear in
 * `columns`. A table this file only reads or only UPDATEs is exempt, because a statement that never
 * supplies a column cannot omit one.
 */
interface WorkerTable {
  /** True when this file writes an `insert into <table>`. Only then is NOT NULL coverage checked. */
  readonly inserts: boolean
  /** Every column this file names for the table, in any statement. */
  readonly columns: readonly string[]
}

const REQUIRED_COLUMNS: Record<string, WorkerTable> = {
  /* UPDATE and SELECT only — `claimJob` and the three terminal updates. Never inserted here: the
   * app opens every job (`openNinaImageJob`), and a worker that could open one would be a second
   * writer of a table whose whole point is that the app owns the ledger. */
  nina_turns: {
    inserts: false,
    columns: [
      'id',
      'user_id',
      'kind',
      'model',
      'status',
      'error_code',
      'tool_calls',
      'latency_ms',
      'cost_micro_usd',
      'args',
      'created_at',
    ],
  },
  /* SELECT only — `resolveWorkerSessionId`'s activity ordering. The worker deliberately cannot
   * CREATE a session: `ensureNinaSession` is the app's policy and a worker that minted one would
   * file a photograph into a conversation the runner has never seen. When no session exists the
   * worker declines to write the message instead. */
  nina_chat_sessions: {
    inserts: false,
    columns: ['id', 'user_id', 'created_at'],
  },
  nina_messages: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      /* FINDING 1. `NOT NULL` since migration 0004, and omitted by both INSERTs until this phase.
       * It is listed here so the existence check covers it AND so the NOT NULL coverage check
       * passes — the two halves have to agree or the worker will not start. */
      'session_id',
      'role',
      'text',
      'source',
      'turn_id',
      'reply_to_id',
      'sent_at',
    ],
  },
  nina_message_images: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      'message_id',
      'kind',
      'blob_url',
      'pathname',
      'width',
      'height',
      'bytes',
      'description',
      'prompt',
      'sort_order',
    ],
  },
  nina_avatars: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      'blob_url',
      'pathname',
      'width',
      'height',
      'bytes',
      'source',
      'description',
      'is_current',
      'announced_at',
    ],
  },
}
```

**Impact:** `preflight`'s loop no longer typechecks against the new shape — Step 2 replaces it in the
same edit. Verified against `lib/db/schema.ts`: the `NOT NULL`-without-default sets are
`nina_messages` `{id, user_id, session_id, role, text}`, `nina_message_images`
`{id, user_id, message_id, kind, blob_url, pathname}`, `nina_avatars`
`{id, user_id, blob_url, pathname, source}` — every one of them is covered by the lists above, so
the widened check is green on the current database the moment `session_id` is added.

---

### Step 2: Extract the preflight decision as a pure function and add NOT NULL coverage

**File:** `scripts/nina-image-worker.ts:177-220`
**Change:** Replace the whole `preflight` function. The catalogue query grows three columns; the
decision moves into `findSchemaDrift`, which is pure and therefore testable with no database — which
is the only way Finding 1's exact shape can be asserted at all.

**Code:**

```ts
/**
 * One `information_schema.columns` row, as much of it as `findSchemaDrift` reads. Written by hand
 * for the same reason `NeonSql` is: the catalogue's own types are not reachable here.
 */
export interface SchemaColumn {
  table_name: string
  column_name: string
  /** `'YES'` or `'NO'`. */
  is_nullable: string
  /** The `DEFAULT` expression, or null when the column has none. */
  column_default: string | null
  /** `'YES'` or `'NO'`. */
  is_identity: string | null
  /** `'ALWAYS'` or `'NEVER'`. */
  is_generated: string | null
}

/**
 * **The whole preflight decision, as a pure function over what the catalogue said.**
 *
 * Split out of `preflight` so `tests/nina.imageworker.test.ts` can drive Finding 1's exact shape —
 * a `NOT NULL` column with no default that this worker never writes — with no database, no key and
 * no network. A check that only runs against production is a check that first fails in production,
 * which is precisely how Finding 1 shipped.
 *
 * Two rules, and the second is the new one:
 *   1. every column this file NAMES must exist (a rename takes the workflow red);
 *   2. on a table this file INSERTS into, every column the database will NOT fill for us must be
 *      named (an addition takes the workflow red).
 *
 * "The database will fill it for us" means one of: a `DEFAULT` expression (`sent_at`, `source`,
 * `sort_order`, `created_at`, `is_current`, `folder`), an identity column, or a generated column.
 * `nina_messages.seq` is a `bigserial`, so its `column_default` is a `nextval(...)` and it is
 * correctly exempt — the check must not demand that the worker write the conversation's sequence.
 *
 * Returns the drift as sentences. Empty means this file and the schema agree.
 */
export function findSchemaDrift(
  rows: readonly SchemaColumn[],
  tables: Record<string, WorkerTable> = REQUIRED_COLUMNS,
): string[] {
  const have = new Map<string, Map<string, SchemaColumn>>()
  for (const row of rows) {
    const columns = have.get(row.table_name) ?? new Map<string, SchemaColumn>()
    columns.set(row.column_name, row)
    have.set(row.table_name, columns)
  }

  const drift: string[] = []
  for (const [table, spec] of Object.entries(tables)) {
    const columns = have.get(table)
    if (columns == null) {
      drift.push(`${table} (whole table) is missing`)
      continue
    }

    for (const column of spec.columns) {
      if (!columns.has(column)) drift.push(`${table}.${column} is missing`)
    }

    if (!spec.inserts) continue

    const named = new Set(spec.columns)
    for (const [column, meta] of columns) {
      if (named.has(column)) continue
      if (meta.is_nullable !== 'NO') continue
      if (meta.column_default != null) continue
      if (meta.is_identity === 'YES') continue
      if (meta.is_generated === 'ALWAYS') continue
      drift.push(`${table}.${column} is NOT NULL with no default and this worker never writes it`)
    }
  }
  return drift
}

export async function preflight(sql: NeonSql): Promise<void> {
  const missingEnv = REQUIRED_ENV.filter((key) => {
    const value = process.env[key]
    return value == null || value.length === 0
  })
  if (missingEnv.length > 0) {
    throw new Error(
      `missing ${missingEnv.join(', ')} — set them as repository secrets, or run with --env-file=.env.local`,
    )
  }

  const tables = Object.keys(REQUIRED_COLUMNS)
  const rows = (await sql`
    select table_name, column_name, is_nullable, column_default, is_identity, is_generated
    from information_schema.columns
    where table_schema = 'public' and table_name = any(${tables})
  `) as SchemaColumn[]

  const drift = findSchemaDrift(rows)
  if (drift.length > 0) {
    /*
     * The most likely cause, in order: a migration has not been applied to this database; a column
     * was renamed; a column was ADDED as NOT NULL and this file was not updated with it (Finding 1);
     * the connection points at the wrong database entirely. All four are a code or configuration
     * change rather than a retry, so this throws and takes the workflow red rather than failing a
     * job quietly.
     */
    throw new Error(`schema drift — ${drift.join('; ')}`)
  }
}
```

**Impact:** `npm run nina:worker:dry` now fails loudly against any database whose `NOT NULL` columns
this file does not cover. Run it before committing — see **Verification**.

---

### Step 3: Finding 2 — a job named by `--job` is claimable regardless of the dispatch grace

**File:** `scripts/nina-image-worker.ts:229-289`
**Change:** Replace `claimJob`'s doc comment and function, and add `dispatchCutoffFor` immediately
above it. The SQL's *shape* does not change at all — only the instant that is bound to the
`dispatched` predicate. That keeps the fix in one pure, unit-testable function instead of in a
second copy of the predicate.

**Code:**

```ts
/**
 * **The instant a `dispatched` row becomes claimable. FINDING 2, in one function.**
 *
 * `fireNinaImageDispatch` stamps `error_code = 'dispatched'` BEFORE it POSTs to GitHub — deliberately,
 * so two concurrent dispatch attempts cannot both call the API — and a GitHub runner takes ~25-40 s
 * to reach the `Generate` step. Measured: job `ke20AUHNE0TB` was created at `03:02:31.897Z` and the
 * worker ran at `03:03:00.4Z`, 28.5 seconds old. With a single cutoff of `now - GRACE` the row is
 * `dispatched` and younger than 60 s, so the `WHERE` excluded it, and every one of the five
 * `workflow_dispatch` runs on 2026-09-06 logged `finished { attempted: 0 }`. **The doorbell rang a
 * runner that was structurally forbidden from opening the door.**
 *
 * The grace exists to stop a SWEEP stealing a job a runner is about to start. A job named by `--job`
 * was named by the doorbell, so the name and the runner ARE the same event and there is nothing to
 * protect it from. So:
 *
 *   · sweep      (`jobId == null`) -> `now - GRACE`. A fresh dispatch is left alone.
 *   · named job  (`jobId != null`) -> `now + GRACE`. Claimable however young it is.
 *
 * The named cutoff runs the window FORWARD rather than simply using `now`, and that is not
 * decoration: `created_at` is stamped by Vercel and `now` is read on a GitHub runner, so a minute of
 * clock skew between the two must not be able to reintroduce the bug. It reuses the same constant so
 * there is no second number to keep in step.
 *
 * **What this does NOT relax.** The `running` reclaim cutoff still applies to a named job, so a
 * dispatch can never steal a job another runner is mid-generation on and bill the same picture
 * twice. Neither does it relax `attempts < NINA_IMAGE_MAX_ATTEMPTS` — see `claimJob`'s note, where
 * that bound is the only thing preventing an infinite reclaim loop.
 */
export function dispatchCutoffFor(jobId: string | null, now: Date): Date {
  return jobId == null
    ? new Date(now.getTime() - NINA_IMAGE_DISPATCH_GRACE_MS)
    : new Date(now.getTime() + NINA_IMAGE_DISPATCH_GRACE_MS)
}

/**
 * **The only lock in the system.** One conditional UPDATE, and exactly one caller gets a row back.
 *
 * With a job id it claims that job. Without one it claims the oldest ACTIONABLE job, which is:
 *   · `queued`     — the doorbell never rang, or rang and the bookkeeping died;
 *   · `dispatched` past `dispatchCutoffFor` — for a sweep that means older than
 *     `NINA_IMAGE_DISPATCH_GRACE_MS`, i.e. GitHub accepted it and no runner ever picked it up; for a
 *     NAMED job it means unconditionally, because the runner asking IS the dispatch (Finding 2);
 *   · `running` older than `NINA_IMAGE_RECLAIM_MS` — the runner that owned it was killed by
 *     `timeout-minutes`, which is longer than the ceiling so it cannot still be alive. **This one is
 *     not relaxed for a named job**: a live generation must never be claimed twice.
 *
 * `attempts` is incremented in the same statement, so the retry budget cannot be spent twice by two
 * runners. A job at the budget is not claimed at all; the app-side sweep closes it instead.
 *
 * **One note on `created_at` in the WHERE clause.** It is the job's OPEN time, not its claim time,
 * because `nina_turns` has no claim timestamp and no phase has added one. For a first attempt the
 * two are within a minute of each other, so it is a fine proxy. For a SECOND attempt the timestamp
 * is already old, which would make a reclaimed job immediately eligible again — and the only thing
 * stopping an infinite reclaim loop is `attempts < NINA_IMAGE_MAX_ATTEMPTS` in the same clause.
 * **That bound is therefore load-bearing, not a nicety.** If a future phase adds a `claimed_at`
 * column, the cutoff should move to it and the bound should stay.
 */
export async function claimJob(
  sql: NeonSql,
  jobId: string | null,
  now: Date = new Date(),
): Promise<ClaimedJob | null> {
  const dispatchCutoff = dispatchCutoffFor(jobId, now)
  const runningCutoff = new Date(now.getTime() - NINA_IMAGE_RECLAIM_MS)

  const rows = (await sql`
    update nina_turns set
      error_code = 'running',
      args = jsonb_set(args, '{attempts}', to_jsonb((coalesce((args->>'attempts')::int, 0) + 1)))
    where id = (
      select id from nina_turns
      where kind = 'image'
        and status = 'pending'
        and args is not null
        and coalesce((args->>'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}
        and (${jobId}::text is null or id = ${jobId}::text)
        and (
          error_code = 'queued'
          or (error_code = 'dispatched' and created_at < ${dispatchCutoff.toISOString()})
          or (error_code = 'running' and created_at < ${runningCutoff.toISOString()})
        )
      order by created_at asc
      limit 1
      for update skip locked
    )
    returning id, user_id, args
  `) as Array<{ id: string; user_id: string; args: NinaImageJobArgs }>

  const row = rows[0]
  if (row == null) return null
  return {
    jobId: row.id,
    userId: row.user_id,
    args: row.args,
    attempts: Number(row.args.attempts ?? 0),
  }
}
```

**Impact:** a targeted `workflow_dispatch` can now claim its own job on the first try. The two
concurrency hazards this could have opened are both closed by predicates that did not move: a sweep
running 61 s later sees `running` and young and is excluded until `RECLAIM`; a named runner arriving
after a sweep already claimed sees the same. No double billing is introduced.

---

### Step 4: Finding 1 — the session-resolution SQL the worker owns

**File:** `scripts/nina-image-worker.ts` — insert immediately after `store` (currently ends at
`:392`) and before `finishSelfie`'s doc comment (`:394`).
**Change:** New exported function. One statement, one round trip, mirroring
`resolveNinaSessionForMessage` + `mostRecentNinaSession` exactly.

**Code:**

```ts
/**
 * **Which session does a message this worker writes belong in? FINDING 1's real question.**
 *
 * `nina_messages.session_id` has been `NOT NULL` since migration 0004 (`lib/db/schema.ts:855`) and
 * both of this file's INSERTs omitted it, so every successful generation crashed on the write that
 * would have made the photograph visible, and the apology for that crash crashed the same way and
 * took the process down before `nina_turns` could record what had been spent. Run `33986082744`
 * measured all of it.
 *
 * ── WHY THIS IS SQL AND NOT AN IMPORT ─────────────────────────────────────────────────────────
 * The app's answer to this exact question is `resolveNinaSessionForMessage` in
 * `lib/nina/sessionResolve.ts`. It cannot be imported here: it begins `import 'server-only'` and
 * reaches `lib/nina/queries.ts` through `@/` aliases, neither of which survives
 * `--experimental-strip-types`. See this file's header. So the POLICY is duplicated and the
 * duplication is stated rather than hidden — and the widened `findSchemaDrift` is what keeps the
 * column list honest across the two hosts.
 *
 * ── THE POLICY, WHICH IS `resolveNinaSessionForMessage`'S, CLAUSE FOR CLAUSE ───────────────────
 *   1. the session of `args.replyToId` — the runner message that asked — **when that message still
 *      exists and is his**. So a photograph lands in the conversation where he asked for it, not in
 *      whichever chat happens to be newest two minutes later.
 *   2. otherwise his most recent session BY ACTIVITY, which is `max(sent_at)` over his own messages
 *      in it, falling back to the session's `created_at` for one he made and has not written in.
 *      This is `sessionActivityAt` + `compareNinaSessionActivity` from `lib/nina/sessions.ts`, and
 *      **pins are irrelevant on purpose** — the display list is pinned-first, and a photograph does
 *      not belong in a conversation he pinned in March. The `s.id desc` tie-break is that
 *      comparator's, which returns `a.id < b.id ? 1 : -1` and therefore sorts the larger id first.
 *   3. otherwise **null, and the caller declines to write the message**. This is the one place the
 *      policies differ, deliberately: the app's fallback is `ensureNinaSession`, which CREATES. A
 *      worker that minted a session would file a photograph into a conversation the runner has
 *      never seen, and it would make `nina_chat_sessions` a table this file writes — which is a
 *      second writer of a ledger the app owns. Declining is the honest outcome, and it is reachable
 *      only in the R11 state where he has removed every session he has.
 *
 * Owner-scoped in both branches (invariant 5): a foreign or vanished id comes back empty and takes
 * the fallback rather than reaching into somebody else's conversation.
 *
 * One statement rather than two, because neon-http charges a round trip per call and the `not
 * exists` guard means exactly one branch of the `union all` ever produces a row.
 */
export async function resolveWorkerSessionId(
  sql: NeonSql,
  userId: string,
  replyToId: string | null,
): Promise<string | null> {
  const rows = (await sql`
    with reply as (
      select m.session_id as id
      from nina_messages m
      where m.id = ${replyToId}::text and m.user_id = ${userId}
      limit 1
    ),
    recent as (
      select s.id
      from nina_chat_sessions s
      left join (
        select m.session_id as session_id, max(m.sent_at) as last_user_at
        from nina_messages m
        where m.user_id = ${userId} and m.role = 'runner'
        group by m.session_id
      ) a on a.session_id = s.id
      where s.user_id = ${userId}
      order by coalesce(a.last_user_at, s.created_at) desc, s.id desc
      limit 1
    )
    select id from reply
    union all
    select id from recent where not exists (select 1 from reply)
  `) as Array<{ id: string | null }>

  return rows[0]?.id ?? null
}
```

**Impact:** two extra statements per job at most (one on the success path, one on the terminal
failure path for a selfie). Avatar jobs resolve nothing, because `finishAvatar` writes no
`nina_messages` row.

---

### Step 5: `finishSelfie` writes `session_id`

**File:** `scripts/nina-image-worker.ts:394-454`
**Change:** Replace the doc comment's last paragraph and the function. The function becomes
`export`ed so the regression test can drive it. Three paragraphs are added to the doc: the session
resolution, and what happens when it fails.

**Code:**

```ts
/**
 * Success, for a **chat selfie**. The photograph, as an ordinary chat message.
 *
 * **Not a special kind of message** — a `nina_messages` row plus a `nina_message_images` row with
 * `kind = 'generated'`, which is the same pair phase 6 writes for an upload. That is what makes it
 * quotable (phase 7), gallery-able (phase 13) and unread-able (phase 10) for free.
 *
 * `source = 'chat'` on purpose, and NOT a sixth `NinaMessageSource`: she is answering something he
 * said in an open conversation, minutes ago. Adding a source value would force an edit to phase 1's
 * column domain and phase 10's `'chat' | ProactiveTriggerKind` test for no gain (RULING C9).
 *
 * The caption is never empty. `nina_messages.text` is `notNull` and would accept `''`, but an empty
 * bubble is not a message.
 *
 * `prompt` gets the sidecar (prompt as sent, model, seed) and `description` gets the scene prose.
 * Phase 6's `glm-4.6v` describe pre-pass is **not** run over a generated image: we wrote the
 * picture, so we already know what is in it, and paying a vision call to be told back our own prompt
 * would be absurd. Phases 14 and 15 hand-upload files with no prompt and DO run that pre-pass —
 * that is the whole difference between the two paths.
 *
 * **THE ORDER IS LOAD-BEARING.** The message and its image row go in FIRST, then the job is marked
 * `ok`. A crash between the two leaves a `pending` job whose photo is already in the chat — which a
 * sweep will eventually apologise for, so the runner sees a picture AND an apology. Odd, but
 * survivable and self-correcting. The reverse order would mark the job done with no photograph
 * anywhere and no sweep left to notice, which is R22's exact failure.
 *
 * `reply_to_id` is written through a subselect rather than trusted: a quote whose target was deleted
 * must degrade to a plain message, not violate the foreign key and lose the photograph.
 *
 * **`session_id` IS FINDING 1, AND IT IS RESOLVED RATHER THAN GUESSED.** It is `NOT NULL` and this
 * function omitted it, so the picture was generated, paid for, stored in Blob — and thrown away by
 * the INSERT that would have shown it. `resolveWorkerSessionId` is the policy, and it is the same
 * policy `postNinaApologyMessage` uses on the app side. Note that `reply_to_id` and `session_id`
 * degrade in OPPOSITE directions and that is correct: a deleted quote target degrades to a plain
 * message (`set null`), while a message with no session is not a message at all.
 *
 * **When no session resolves, this throws rather than writing anything.** The caller turns that into
 * a `transport` failure through `closeFailed`, which records what was spent and — once the retry
 * budget is gone — apologises. The state is reachable only when he has removed every session he has
 * (R11), and the honest cost is that the retry regenerates and spends a second $0.04 before giving
 * up. That is priced rather than special-cased: both spends are now recorded (see `closeFailed`), so
 * phase 4's detail page will show `attempts: 2` and a doubled cost, which is exactly what happened.
 */
export async function finishSelfie(
  sql: NeonSql,
  job: ClaimedJob,
  image: { blobUrl: string; pathname: string; bytes: number },
  result: { costMicroUsd: number; latencyMs: number },
): Promise<void> {
  const messageId = newId()
  const imageId = newId()
  const { jobId, userId, args } = job

  const sessionId = await resolveWorkerSessionId(sql, userId, args.replyToId)
  if (sessionId == null) {
    throw new Error(`no session to file the photograph in (job ${jobId})`)
  }

  await sql`
    insert into nina_messages
      (id, user_id, session_id, role, text, source, turn_id, reply_to_id)
    values (
      ${messageId}, ${userId}, ${sessionId}, 'nina', ${ninaImageCaption(jobId)}, 'chat', ${jobId},
      (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId})
    )
  `
  await sql`
    insert into nina_message_images
      (id, user_id, message_id, kind, blob_url, pathname, width, height, bytes, description, prompt, sort_order)
    values (
      ${imageId}, ${userId}, ${messageId}, 'generated', ${image.blobUrl}, ${image.pathname},
      ${NINA_IMAGE_WIDTH}, ${NINA_IMAGE_HEIGHT}, ${image.bytes}, ${args.scene}, ${args.sidecar}, 0
    )
  `
  await sql`
    update nina_turns
    set status = 'ok', error_code = null, latency_ms = ${result.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0) + ${result.costMicroUsd}
    where id = ${jobId} and user_id = ${userId}
  `
}
```

**Impact:** the success path can complete for the first time. `nina_message_images` gains its first
row ever.

**The success UPDATE ACCUMULATES, and that is reconciled rather than incidental.** An earlier draft
of this phase left it as a plain `SET` and deferred the change to phase 2. That was wrong under
invariant 9: a job that fails its first attempt (spending $0.04, recorded by `closeFailed`'s retry
branch) and succeeds on its second would have the first attempt's spend **overwritten** by this
statement — two OpenRouter calls, one recorded, money spent silently. The column is a **per-job
total on every path**; see the Interface Contract. `coalesce(cost_micro_usd, 0)` on the right-hand
side of the `SET` refers to the OLD row value, which is standard Postgres and is what makes the
accumulation correct.

---

### Step 5b: `finishAvatar` accumulates too, so the two success paths agree

**File:** `scripts/nina-image-worker.ts` — `finishAvatar`'s `update nina_turns` statement (the one
inside its transaction that sets `status = 'ok'`)
**Change:** one expression. `cost_micro_usd = ${result.costMicroUsd}` becomes
`cost_micro_usd = coalesce(cost_micro_usd, 0) + ${result.costMicroUsd}`. Nothing else in the
function moves — the `nina_avatars` un-current + insert transaction is untouched.

**Why it is here and not left to phase 2.** Phase 2 reimplements this path in-platform, but phase 2
is also the *rollback target*: reverting it must land on a worker whose ledger is honest. A retried
avatar job under-reporting by one generation on the backstop and reporting correctly in-platform
would be exactly the "a column that means one thing on one host and another on the other host"
failure invariant 9 exists to prevent. Both hosts, one rule.

**Impact:** `finishSelfie`, `finishAvatar` and both `closeFailed` branches now write the same kind
of number. No call site changes; `result.costMicroUsd` is already threaded to both.

---

### Step 6: `closeFailed` — always close the job, and always record the spend

**File:** `scripts/nina-image-worker.ts:501-554`
**Change:** Replace the doc comment and the function. Three things change: `session_id` is written,
the apology is wrapped so it can never prevent the terminal UPDATE, and the spend for this attempt
is passed in and accumulated instead of a constant being stamped once.

**Code:**

```ts
/**
 * Failure. **Two outcomes, and the choice is the retry budget.**
 *
 * If attempts remain, the row goes back to `queued` and stays `pending`, so the next backstop run
 * tries again with the SAME prompt and the SAME seed — which is why both are stored rather than
 * rebuilt. Nothing is said to the runner: her bubble still says she is taking the photo, and she is.
 *
 * If the budget is spent, the job is terminal and **the apology goes in with it, in the same
 * function**, because a caller that could mark a job failed without saying anything is a caller that
 * will eventually do so. An **avatar** job posts nothing — nobody asked for it in chat — which is
 * the same rule `failNinaImageJob` and both sweeps follow.
 *
 * ── FINDING 1's BLAST RADIUS: THE APOLOGY CANNOT TAKE THE JOB DOWN WITH IT ────────────────────
 * The apology INSERT omitted `session_id`, so on the final attempt it threw, the throw propagated
 * out of `runOneJob` and out of `main`, and the process died BEFORE the terminal
 * `update nina_turns` ever ran. The job stayed `pending`, the app's 20-minute sweep later marked it
 * `stale`, and `cost_micro_usd` stayed NULL — measured on jobs `pF5c6V8YbxAR` (73 925 ms) and
 * `ChfwHZ2GJT4I` (55 600 ms), both of which reached OpenRouter successfully. **The money was spent
 * and the ledger said it was free.**
 *
 * So the apology is now best-effort and the terminal UPDATE is not. The ordering is unchanged —
 * apology first, then close — because the alternative (close first) would let a crash in between
 * leave a `failed` job with no apology and no sweep left to notice it, and the sweep only looks at
 * `pending` rows. Wrapping is strictly better than reordering here.
 *
 * ── INVARIANT 9: MONEY IS NEVER SPENT SILENTLY ───────────────────────────────────────────────
 * `costMicroUsd` is what THIS attempt is known to have spent, or null when the call never came back
 * with a figure. Both branches now accumulate onto the row rather than overwriting it, because two
 * attempts are two generations and two bills. The retry branch adds only a KNOWN spend: an unknown
 * one would otherwise be guessed twice for the same picture. The terminal branch keeps the old
 * behaviour of guessing high when nothing is known — a call that reached the provider and then timed
 * out was very probably billed, and guessing high is the honest direction for a cost log.
 */
export async function closeFailed(
  sql: NeonSql,
  job: ClaimedJob,
  outcome: {
    kind: NinaImageFailure
    latencyMs: number
    detail: string
    /** Micro-USD this attempt is KNOWN to have spent. Null when the call returned no figure. */
    costMicroUsd: number | null
  },
): Promise<'retry' | 'gave-up'> {
  const { jobId, userId, args, attempts } = job
  console.warn('[nina-worker] generation failed', {
    jobId,
    kind: outcome.kind,
    attempts,
    detail: outcome.detail,
  })

  if (attempts < NINA_IMAGE_MAX_ATTEMPTS) {
    await sql`
      update nina_turns set
        error_code = 'queued',
        latency_ms = ${outcome.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0) + ${outcome.costMicroUsd ?? 0}
      where id = ${jobId} and user_id = ${userId} and status = 'pending'
    `
    return 'retry'
  }

  if (args.purpose === 'selfie') {
    try {
      const sessionId = await resolveWorkerSessionId(sql, userId, args.replyToId)
      if (sessionId == null) {
        console.warn('[nina-worker] no session for the apology; closing the job anyway', { jobId })
      } else {
        await sql`
          insert into nina_messages
            (id, user_id, session_id, role, text, source, turn_id, reply_to_id)
          values (
            ${newId()}, ${userId}, ${sessionId}, 'nina', ${ninaImageApology(outcome.kind, jobId)},
            'chat', ${jobId},
            (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId})
          )
        `
      }
    } catch (cause) {
      /* Best-effort, and it MUST stay that way. See the header: this throw is what killed the
       * process before the money could be recorded. Nothing identifying is logged — invariant 4,
       * this repository is public and this line appears in an Actions run. */
      console.warn('[nina-worker] the apology could not be written; closing the job anyway', {
        jobId,
        error: String(cause),
      })
    }
  }

  await sql`
    update nina_turns
    set status = 'failed', error_code = ${outcome.kind}, latency_ms = ${outcome.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0)
          + ${outcome.costMicroUsd ?? NINA_IMAGE_COST_MICRO_USD}
    where id = ${jobId} and user_id = ${userId} and status = 'pending'
  `
  return 'gave-up'
}
```

**Impact:** `cost_micro_usd` is never NULL on a job that reached OpenRouter. The unqualified
`cost_micro_usd` on the right-hand side of the `SET` refers to the OLD row value, which is standard
Postgres and is what makes the accumulation correct. Phase 4 must read the column as "total spent on
this job".

---

### Step 7: `runOneJob` passes the spend to every `closeFailed` call site

**File:** `scripts/nina-image-worker.ts:556-618`
**Change:** Replace the function. Three call sites gain `costMicroUsd`. Nothing else moves.

**Code:**

```ts
/**
 * Claim, generate, close. Returns what happened so `main` can log one line per job and so the test
 * can assert the branches without a network.
 *
 * **A store failure is a `transport` failure and not a crash.** The picture exists and we could not
 * keep it, which from the runner's side is "the photo did not come through" — and the money is
 * already spent, which is why it is still logged, still counted against the cap, and now also
 * recorded on the row (invariant 9).
 */
export async function runOneJob(
  sql: NeonSql,
  jobId: string | null,
): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  const job = await claimJob(sql, jobId)
  if (job == null) return 'none'

  console.info('[nina-worker] claimed', {
    jobId: job.jobId,
    purpose: job.args.purpose,
    attempt: job.attempts,
  })

  const outcome = await generate(job.args.prompt, job.args.seed)
  if (!outcome.ok) {
    return closeFailed(sql, job, {
      kind: outcome.kind,
      latencyMs: outcome.latencyMs,
      detail: outcome.detail,
      /* The call returned no figure, so what it cost is unknown. `closeFailed` adds nothing on a
       * retry — an unknown guessed twice for one picture is a worse log than a missing one — and
       * guesses high on the terminal attempt, where a timed-out call was very probably billed. */
      costMicroUsd: null,
    })
  }

  let image: { blobUrl: string; pathname: string; bytes: number }
  try {
    image = await store(job.userId, job.args.purpose, outcome.b64)
  } catch (cause) {
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `store: ${String(cause)}`,
      /* The generation SUCCEEDED and was billed; only the storage failed. */
      costMicroUsd: outcome.costMicroUsd,
    })
  }

  try {
    if (job.args.purpose === 'avatar') {
      await finishAvatar(sql, job, image, outcome)
    } else {
      await finishSelfie(sql, job, image, outcome)
    }
  } catch (cause) {
    /*
     * The bytes are stored and the row could not be written. Closing it as a failure is the honest
     * outcome — no photograph is visible, so she should say so — and the blob is left behind, which
     * the plan's Handoff 6 (the `nina/` reaper) exists for.
     *
     * **This is the branch Finding 1 lived in**, and it reached `closeFailed` correctly every time.
     * What was broken was `closeFailed` itself, which threw the same way and killed the process
     * before the spend below could be recorded.
     */
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `finish: ${String(cause)}`,
      costMicroUsd: outcome.costMicroUsd,
    })
  }

  console.info('[nina-worker] done', {
    jobId: job.jobId,
    purpose: job.args.purpose,
    bytes: image.bytes,
    costMicroUsd: outcome.costMicroUsd,
    latencyMs: outcome.latencyMs,
  })
  return 'ok'
}
```

**Impact:** none beyond the three arguments. `main` is unchanged.

---

### Step 8: Finding 3 — record the measured cadence where the chain is derived

**File:** `lib/nina/imagerecipe.ts:106-115`
**Change:** Replace the `NINA_IMAGE_DISPATCH_GRACE_MS` and `NINA_IMAGE_STALE_MS` doc comments and
insert `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` between `NINA_IMAGE_STALE_MS` and
`NINA_IMAGE_SWEEP_BUDGET`. **No existing value changes.** The constant exists because a comment
nothing reads is a comment that goes stale; a test reads this one (Step 10).

**Code (replacing lines 106–115 in full):**

```ts
/**
 * How long a `dispatched` row is left alone before a SWEEP treats it as un-started.
 *
 * **It applies to a sweep and NOT to a job named by `--job`** — see `dispatchCutoffFor` in
 * `scripts/nina-image-worker.ts`, which is where Finding 2 was fixed. The grace exists to stop a
 * sweep stealing a job a runner is about to start; a named job and its runner are the same event, so
 * for a named claim the same window runs FORWARD instead, absorbing clock skew between the Vercel
 * process that stamped `created_at` and the GitHub runner that reads `now`.
 */
export const NINA_IMAGE_DISPATCH_GRACE_MS = 60_000
/** > the job ceiling, so a `running` row this old cannot still be running. */
export const NINA_IMAGE_RECLAIM_MS = 420_000
/** One retry. 2 x RECLAIM = 14 min worst case, which must stay under STALE. */
export const NINA_IMAGE_MAX_ATTEMPTS = 2
/**
 * The app-side give-up, and — **measured, not assumed** — the only deadline in the system.
 *
 * The original derivation assumed the workflow's `schedule: '*/10'` would rescue a lost dispatch at
 * ~10 minutes, comfortably inside this 20. `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` records what
 * `schedule:` actually does, and it is one to two orders of magnitude slower. So this is not "the
 * backstop's deadline plus margin"; it is the whole guarantee, and the FAST path has to work. That
 * is Finding 2's fix and, permanently, phase 2's in-platform generator.
 *
 * The value does not move. Twenty minutes is how long she may plausibly say "bentar" before an
 * apology is the kinder answer, and stretching it to cover a four-hour backstop would mean a
 * photograph that failed at 09:00 goes unacknowledged until lunch.
 */
export const NINA_IMAGE_STALE_MS = 1_200_000
/**
 * **What `schedule:` measured, against what it declares. FINDING 3.**
 *
 * `.github/workflows/nina-image.yml` declares `cron: '*/10 * * * *'`. Twelve consecutive `schedule`
 * runs over 2026-09-04..06 fired with gaps of **1 h 46 m to 4 h 19 m** — never ten minutes. GitHub
 * documents `schedule:` as best-effort and heavily deprioritises it on low-activity public
 * repositories, and the workflow's own comment anticipated the direction ("a good retry engine and a
 * bad deadline") while the threshold chain was nonetheless derived as if `*/10` were honoured.
 *
 * This is the SHORTEST measured gap, so it is the most generous number the evidence supports.
 * `tests/nina.imagerecipe.test.ts` asserts it exceeds `NINA_IMAGE_STALE_MS`, which is the fact that
 * matters: **the backstop cannot beat the give-up.** If anyone later lowers `NINA_IMAGE_STALE_MS`
 * on the belief that a ten-minute rescue exists, that assertion is what stops them.
 */
export const NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS = 6_360_000
/** Jobs one backstop run will drain, so a burst cannot exceed `timeout-minutes`. */
export const NINA_IMAGE_SWEEP_BUDGET = 3
```

**Impact:** one new exported symbol. Phase 2 re-derives the chain on top of this; the measured fact
must survive that re-derivation.

---

### Step 9: Finding 3 — the same measurement in the workflow's own comments

**File:** `.github/workflows/nina-image.yml:13-16` and `:31-36`
**Change:** comments only. No key, no step, no trigger, no `timeout-minutes` moves.

**Code — replacing lines 13–16:**

```yaml
# The schedule is best-effort by GitHub's own documentation: it is delayed under load and it is
# DISABLED ENTIRELY after 60 days with no repository activity. MEASURED, 2026-09-04..06: twelve
# consecutive `schedule` runs fired with gaps of 1 h 46 m to 4 h 19 m, never ten minutes. So it is a
# good retry engine and a bad deadline — literally, not rhetorically — which is why
# lib/nina/imagejobs.ts keeps an independent 20-minute give-up sweep that runs on every /nina page
# load. Do not delete that sweep on the grounds that this exists, and do not derive any threshold
# from the */10 below. NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS in lib/nina/imagerecipe.ts holds the
# measurement and tests/nina.imagerecipe.test.ts asserts it against the give-up.
```

**Code — replacing lines 31–36 (the comment above `- cron:`; the `cron:` line itself is unchanged):**

```yaml
    # Declared every ten minutes. GitHub's minimum is 5 and it promises no punctuality — and MEASURED
    # on this repository the real gaps were 1 h 46 m to 4 h 19 m (2026-09-04..06). The declared value
    # is therefore a ceiling on the request, not a description of the behaviour, and nothing in the
    # threshold chain may assume it.
    #
    # The cost note still holds at the declared rate: 144 runs a day at ~40 s each ~ 96 min/day ~
    # 2,900 min/month. THIS REPOSITORY IS PUBLIC, so Actions minutes are unmetered and that number is
    # free. If it is ever made private, GitHub Free's 2,000 minutes would be exceeded and the
    # one-line fix is */30, leaning harder on workflow_dispatch for latency and on the on-read sweep
    # for the R22 guarantee. Lowering it to chase punctuality would not work: the deprioritisation
    # measured above is a function of repository activity, not of the requested interval.
```

**Impact:** none at runtime. Phase 2 rewrites this file's role; these numbers must survive.

---

### Step 10: The threshold-chain assertion for Finding 3

**File:** `tests/nina.imagerecipe.test.ts:19` (import) and `:300` (inside
`describe('the threshold chain')`, after the sweep-budget test)
**Change:** one import line and one `it()`. No existing assertion is edited.

**Code — add to the import block from `@/lib/nina/imagerecipe`, in alphabetical position after
`NINA_IMAGE_RESOLUTION`:**

```ts
  NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS,
```

**Code — add inside `describe('the threshold chain', ...)`:**

```ts
  it('the schedule backstop cannot beat the give-up, and nothing may assume it can', () => {
    // FINDING 3. The workflow declares `*/10` and twelve consecutive measured runs came 1 h 46 m to
    // 4 h 19 m apart. The original chain was derived as if a ten-minute rescue existed, which put
    // the backstop comfortably inside the 20-minute give-up; it is in fact five to thirteen times
    // OUTSIDE it. This asserts the direction rather than the magnitude, so it survives a re-measure
    // and fails the moment someone lowers STALE on the strength of the declared cron.
    expect(NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS).toBeGreaterThan(NINA_IMAGE_STALE_MS)
  })
```

**Impact:** one new passing test. `6_360_000 > 1_200_000`.

---

### Step 11: The worker test harness — a fake `NeonSql`

**File:** `tests/nina.imageworker.test.ts:1-30`
**Change:** widen the import, and add a fake tagged-template client above the existing
`describe('parseArgv')`. This is what makes Findings 1 and 2 assertable with no database, no key and
no network — the property the file's header already claims for `generate`.

**Code — replace the import at line 3:**

```ts
import {
  claimJob,
  closeFailed,
  dispatchCutoffFor,
  findSchemaDrift,
  finishSelfie,
  generate,
  parseArgv,
  resolveWorkerSessionId,
} from '../scripts/nina-image-worker.ts'
import type { ClaimedJob, NeonSql, SchemaColumn } from '../scripts/nina-image-worker.ts'
import {
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
} from '../lib/nina/imagerecipe.ts'
```

**Code — add after `stubFetch` (currently ends at line 28):**

```ts
/** One statement the worker sent, with `$n` markers where its values went. */
interface Recorded {
  text: string
  values: readonly unknown[]
}

interface FakeSql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>
  transaction: (queries: unknown[]) => Promise<unknown[]>
  calls: Recorded[]
}

/**
 * A tagged-template client that records instead of connecting.
 *
 * The worker takes its `sql` as a parameter on every function that writes — deliberately, so this is
 * possible — and asserting on the statement it BUILT is the only way to prove Finding 1 without a
 * Postgres. The assertions below therefore look for tokens (`session_id`, `cost_micro_usd`) and
 * check parameter VALUES, never whitespace or clause order, so a reworded statement does not fail a
 * test that is about a column.
 *
 * `rows` scripts the response per statement; `failOn` makes a matching statement throw, which is how
 * "the apology INSERT dies and the job is still closed" is driven.
 */
function fakeSql(options: { rows?: (call: Recorded) => unknown[]; failOn?: RegExp } = {}): FakeSql {
  const calls: Recorded[] = []
  const run = async (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const text = strings.raw
      .map((chunk, index) => (index === 0 ? chunk : `$${index}${chunk}`))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    const call: Recorded = { text, values }
    calls.push(call)
    if (options.failOn?.test(text)) throw new Error('simulated NeonDbError')
    return options.rows?.(call) ?? []
  }
  const sql = run as unknown as FakeSql
  sql.transaction = async (queries: unknown[]) =>
    Promise.all(queries as ReadonlyArray<Promise<unknown>>)
  sql.calls = calls
  return sql
}

/** Every statement the worker sent whose text matches. */
function sent(sql: FakeSql, pattern: RegExp): Recorded[] {
  return sql.calls.filter((call) => pattern.test(call.text))
}

const SESSION_ID = 'sess00000001'

function jobFixture(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    jobId: 'job000000001',
    userId: 'user00000001',
    attempts: 1,
    args: {
      purpose: 'selfie',
      scene: 'a photograph of her at the track',
      mood: null,
      prompt: 'a photograph',
      seed: 42,
      replyToId: 'msg000000001',
      source: 'chat',
      attempts: 1,
      sidecar: 'prompt / model / seed',
    },
    ...overrides,
  }
}

/** A `sql` that answers `resolveWorkerSessionId` with `SESSION_ID` and everything else with []. */
function sqlResolving(sessionId: string | null, options: { failOn?: RegExp } = {}): FakeSql {
  return fakeSql({
    failOn: options.failOn,
    rows: (call) =>
      /with reply as/.test(call.text) && sessionId != null ? [{ id: sessionId }] : [],
  })
}
```

**Impact:** none on production code. The `NeonSql`, `ClaimedJob` and `SchemaColumn` types must all be
exported from the worker — `NeonSql` and `ClaimedJob` already are; `SchemaColumn` is added in Step 2.

---

### Step 12: The Finding 1 regression tests

**File:** `tests/nina.imageworker.test.ts` — append after the existing `describe('generate')`
**Change:** three new describe blocks.

**Code:**

```ts
describe('resolveWorkerSessionId — Finding 1', () => {
  it('asks for the replying message first and the most recent session second, in one statement', async () => {
    const sql = sqlResolving(SESSION_ID)
    expect(await resolveWorkerSessionId(sql, 'user00000001', 'msg000000001')).toBe(SESSION_ID)

    const [call] = sql.calls
    expect(call).toBeDefined()
    // Both branches of `resolveNinaSessionForMessage`'s policy, and the `not exists` guard that
    // makes exactly one of them produce a row.
    expect(call?.text).toMatch(/with reply as/)
    expect(call?.text).toMatch(/from nina_chat_sessions/)
    expect(call?.text).toMatch(/where not exists/)
    // The activity key is his own messages, not hers, and the fallback is the session's own
    // creation — `sessionActivityAt` in lib/nina/sessions.ts.
    expect(call?.text).toMatch(/role = 'runner'/)
    expect(call?.text).toMatch(/coalesce\(a\.last_user_at, s\.created_at\) desc/)
  })

  it('is owner-scoped in both branches (invariant 5)', async () => {
    const sql = sqlResolving(SESSION_ID)
    await resolveWorkerSessionId(sql, 'user00000001', 'msg000000001')
    const [call] = sql.calls
    // Three separate `user_id = $n` bindings: the reply lookup, the activity subquery and the
    // session list. A foreign id must come back empty rather than reach another conversation.
    expect(call?.values.filter((value) => value === 'user00000001')).toHaveLength(3)
  })

  it('returns null when he has no sessions at all, rather than inventing one', async () => {
    // The R11 state: he removed every session he had. The app's policy CREATES here
    // (`ensureNinaSession`); the worker deliberately does not.
    const sql = sqlResolving(null)
    expect(await resolveWorkerSessionId(sql, 'user00000001', null)).toBeNull()
  })
})

describe('finishSelfie — Finding 1', () => {
  const image = { blobUrl: 'https://blob/x.png', pathname: 'nina/u/selfie-x.png', bytes: 1234 }
  const result = { costMicroUsd: 40_000, latencyMs: 78_200 }

  it('writes session_id, and writes the session it resolved', async () => {
    // THE REGRESSION. `nina_messages.session_id` is NOT NULL since migration 0004 and this INSERT
    // omitted it, so every generation ever made was thrown away by the write that would have shown
    // it. Run 33986082744 measured the crash.
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture(), image, result)

    const [insert] = sent(sql, /insert into nina_messages/)
    expect(insert).toBeDefined()
    expect(insert?.text).toMatch(/\bsession_id\b/)
    expect(insert?.values).toContain(SESSION_ID)
  })

  it('still writes the image row and marks the job ok', async () => {
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture(), image, result)
    expect(sent(sql, /insert into nina_message_images/)).toHaveLength(1)
    expect(sent(sql, /set status = 'ok'/)).toHaveLength(1)
  })

  it('ACCUMULATES the spend on success rather than overwriting the failed attempt’s', async () => {
    // INVARIANT 9, on the path that is easiest to get wrong. A job that fails its first attempt
    // (billed, recorded by `closeFailed`'s retry branch) and succeeds on its second must read
    // $0.08, not $0.04. A plain `SET` here would silently discard one whole generation from the
    // ledger — two OpenRouter calls, one number. The column is a per-JOB total on every path.
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture({ attempts: 2 }), image, result)

    const [close] = sent(sql, /set status = 'ok'/)
    expect(close?.text).toMatch(/cost_micro_usd = coalesce\(cost_micro_usd, 0\)/)
    expect(close?.values).toContain(40_000)
  })

  it('refuses to write anything when no session resolves', async () => {
    // Declining beats crashing the process, and beats inventing a conversation he has never seen.
    const sql = sqlResolving(null)
    await expect(finishSelfie(sql, jobFixture(), image, result)).rejects.toThrow(/no session/)
    expect(sent(sql, /insert into/)).toHaveLength(0)
    expect(sent(sql, /update nina_turns/)).toHaveLength(0)
  })
})

describe('closeFailed — Finding 1 and its blast radius', () => {
  const terminal = jobFixture({ attempts: 2, args: { ...jobFixture().args, attempts: 2 } })

  it('the apology carries session_id', async () => {
    const sql = sqlResolving(SESSION_ID)
    await closeFailed(sql, terminal, {
      kind: 'transport',
      latencyMs: 55_600,
      detail: 'x',
      costMicroUsd: null,
    })
    const [insert] = sent(sql, /insert into nina_messages/)
    expect(insert?.text).toMatch(/\bsession_id\b/)
    expect(insert?.values).toContain(SESSION_ID)
  })

  it('MARKS THE JOB FAILED WITH A COST EVEN WHEN THE APOLOGY INSERT THROWS', async () => {
    // THE MONEY TEST. Jobs pF5c6V8YbxAR (73 925 ms) and ChfwHZ2GJT4I (55 600 ms) both reached
    // OpenRouter, both were billed, and both recorded cost_micro_usd NULL — because this INSERT
    // threw and took the process down before the UPDATE below could run. Invariant 9.
    const sql = sqlResolving(SESSION_ID, { failOn: /insert into nina_messages/ })
    const outcome = await closeFailed(sql, terminal, {
      kind: 'transport',
      latencyMs: 73_925,
      detail: 'x',
      costMicroUsd: 40_000,
    })

    expect(outcome).toBe('gave-up')
    const [close] = sent(sql, /set status = 'failed'/)
    expect(close).toBeDefined()
    expect(close?.text).toMatch(/cost_micro_usd = coalesce\(cost_micro_usd, 0\)/)
    expect(close?.values).toContain(40_000)
  })

  it('closes the job when there is no session for the apology either', async () => {
    const sql = sqlResolving(null)
    expect(
      await closeFailed(sql, terminal, {
        kind: 'transport',
        latencyMs: 1,
        detail: 'x',
        costMicroUsd: null,
      }),
    ).toBe('gave-up')
    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
    // Nothing known was spent, so the terminal branch guesses high rather than recording zero.
    expect(sent(sql, /set status = 'failed'/)[0]?.values).toContain(NINA_IMAGE_COST_MICRO_USD)
  })

  it('an avatar job apologises to nobody but is still closed', async () => {
    const sql = sqlResolving(SESSION_ID)
    const avatar = jobFixture({
      attempts: 2,
      args: { ...jobFixture().args, purpose: 'avatar', attempts: 2, replyToId: null },
    })
    await closeFailed(sql, avatar, {
      kind: 'policy',
      latencyMs: 1,
      detail: 'x',
      costMicroUsd: null,
    })
    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
    expect(sent(sql, /set status = 'failed'/)).toHaveLength(1)
  })

  it('a retry records what this attempt is KNOWN to have spent, and never guesses', async () => {
    // A finish failure on attempt 1: the picture was generated and billed, and the old retry branch
    // wrote latency and nothing else, so one generation vanished from the ledger.
    const sql = sqlResolving(SESSION_ID)
    expect(
      await closeFailed(sql, jobFixture({ attempts: 1 }), {
        kind: 'transport',
        latencyMs: 78_200,
        detail: 'finish: x',
        costMicroUsd: 40_000,
      }),
    ).toBe('retry')

    const [retry] = sent(sql, /error_code = 'queued'/)
    expect(retry?.text).toMatch(/cost_micro_usd = coalesce\(cost_micro_usd, 0\)/)
    expect(retry?.values).toContain(40_000)
    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
  })

  it('a retry after a call that returned no figure adds nothing rather than guessing twice', async () => {
    const sql = sqlResolving(SESSION_ID)
    await closeFailed(sql, jobFixture({ attempts: 1 }), {
      kind: 'timeout',
      latencyMs: 240_000,
      detail: 'x',
      costMicroUsd: null,
    })
    expect(sent(sql, /error_code = 'queued'/)[0]?.values).toContain(0)
  })
})
```

**Impact:** none on production code.

---

### Step 13: The Finding 2 and preflight-class regression tests

**File:** `tests/nina.imageworker.test.ts` — append
**Change:** two more describe blocks.

**Code:**

```ts
describe('dispatchCutoffFor — Finding 2', () => {
  const now = new Date('2026-09-06T03:03:00.400Z')

  it('a SWEEP leaves a dispatched row alone until the grace has passed', () => {
    const cutoff = dispatchCutoffFor(null, now)
    expect(cutoff.getTime()).toBe(now.getTime() - NINA_IMAGE_DISPATCH_GRACE_MS)
    // Job ke20AUHNE0TB, created 03:02:31.897Z — 28.5 s old. A sweep must not steal it: a runner is
    // very probably booting for it right now.
    expect(new Date('2026-09-06T03:02:31.897Z').getTime()).toBeGreaterThan(cutoff.getTime())
  })

  it('a job named by --job is claimable however young it is', () => {
    // THE REGRESSION. Five workflow_dispatch runs on 2026-09-06 all logged
    // `finished { attempted: 0 }` because this comparison went the other way. A GitHub runner needs
    // ~25-40 s to reach the Generate step and fireNinaImageDispatch stamps `dispatched` BEFORE the
    // POST, so no targeted dispatch could EVER claim its own job.
    const cutoff = dispatchCutoffFor('ke20AUHNE0TB', now)
    expect(new Date('2026-09-06T03:02:31.897Z').getTime()).toBeLessThan(cutoff.getTime())
    // A job created in the same instant the runner reads the clock is claimable too.
    expect(now.getTime()).toBeLessThan(cutoff.getTime())
  })

  it('absorbs clock skew between the Vercel writer and the GitHub runner', () => {
    // created_at is stamped by Vercel; `now` is read on the runner. A minute of skew in the
    // hostile direction must not reintroduce the bug, which is why the named window runs FORWARD
    // by the same constant rather than stopping at `now`.
    const cutoff = dispatchCutoffFor('ke20AUHNE0TB', now)
    const skewed = new Date(now.getTime() + NINA_IMAGE_DISPATCH_GRACE_MS - 1_000)
    expect(skewed.getTime()).toBeLessThan(cutoff.getTime())
  })
})

describe('claimJob — Finding 2, as the statement actually sent', () => {
  const now = new Date('2026-09-06T03:03:00.400Z')

  it('sends a FUTURE dispatch cutoff for a named job and a PAST one for a sweep', async () => {
    const named = fakeSql()
    await claimJob(named, 'ke20AUHNE0TB', now)
    const sweep = fakeSql()
    await claimJob(sweep, null, now)

    const cutoffOf = (sql: FakeSql) =>
      Date.parse(
        (sql.calls[0]?.values.find(
          (value) => typeof value === 'string' && value.endsWith('Z') && value.includes('T'),
        ) ?? '') as string,
      )

    expect(cutoffOf(named)).toBeGreaterThan(now.getTime())
    expect(cutoffOf(sweep)).toBeLessThan(now.getTime())
  })

  it('keeps the attempts bound, which is the only thing stopping an infinite reclaim loop', async () => {
    const sql = fakeSql()
    await claimJob(sql, 'ke20AUHNE0TB', now)
    expect(sql.calls[0]?.text).toMatch(/attempts'\)::int, 0\) < \$/)
  })

  it('does not relax the running reclaim for a named job, so a live generation is never claimed twice', async () => {
    const sql = fakeSql()
    await claimJob(sql, 'ke20AUHNE0TB', now)
    expect(sql.calls[0]?.text).toMatch(/error_code = 'running' and created_at < \$/)
  })
})

describe('findSchemaDrift — Finding 1 as a CLASS', () => {
  function column(overrides: Partial<SchemaColumn> & Pick<SchemaColumn, 'table_name' | 'column_name'>): SchemaColumn {
    return {
      is_nullable: 'YES',
      column_default: null,
      is_identity: 'NO',
      is_generated: 'NEVER',
      ...overrides,
    }
  }

  const spec = {
    widget: { inserts: true, columns: ['id', 'user_id'] },
    ledger: { inserts: false, columns: ['id'] },
  }

  it('is silent when the schema and the worker agree', () => {
    expect(
      findSchemaDrift(
        [
          column({ table_name: 'widget', column_name: 'id', is_nullable: 'NO' }),
          column({ table_name: 'widget', column_name: 'user_id', is_nullable: 'NO' }),
          column({ table_name: 'ledger', column_name: 'id', is_nullable: 'NO' }),
        ],
        spec,
      ),
    ).toEqual([])
  })

  it('reports a column the worker names and the database does not have (a rename)', () => {
    expect(
      findSchemaDrift([column({ table_name: 'widget', column_name: 'id' }), column({ table_name: 'ledger', column_name: 'id' })], spec),
    ).toContain('widget.user_id is missing')
  })

  it('REPORTS A NOT NULL COLUMN WITH NO DEFAULT THAT THE WORKER NEVER WRITES', () => {
    // FINDING 1'S EXACT SHAPE. Migration 0004 added nina_messages.session_id NOT NULL after this
    // worker was written; the existence-only check saw a column it did not name and said nothing,
    // and every generation crashed on the INSERT. This is the assertion that would have caught it.
    const drift = findSchemaDrift(
      [
        column({ table_name: 'widget', column_name: 'id', is_nullable: 'NO' }),
        column({ table_name: 'widget', column_name: 'user_id', is_nullable: 'NO' }),
        column({ table_name: 'widget', column_name: 'session_id', is_nullable: 'NO' }),
        column({ table_name: 'ledger', column_name: 'id', is_nullable: 'NO' }),
      ],
      spec,
    )
    expect(drift).toHaveLength(1)
    expect(drift[0]).toMatch(/widget\.session_id is NOT NULL/)
  })

  it('does not report a NOT NULL column the database fills for us', () => {
    // `seq` is a bigserial, `sent_at`/`source`/`sort_order` have DEFAULTs. Demanding that the worker
    // write the conversation's sequence would be a check that is wrong rather than strict.
    expect(
      findSchemaDrift(
        [
          column({ table_name: 'widget', column_name: 'id', is_nullable: 'NO' }),
          column({ table_name: 'widget', column_name: 'user_id', is_nullable: 'NO' }),
          column({ table_name: 'widget', column_name: 'seq', is_nullable: 'NO', column_default: "nextval('widget_seq_seq'::regclass)" }),
          column({ table_name: 'widget', column_name: 'n', is_nullable: 'NO', is_identity: 'YES' }),
          column({ table_name: 'widget', column_name: 'g', is_nullable: 'NO', is_generated: 'ALWAYS' }),
          column({ table_name: 'ledger', column_name: 'id', is_nullable: 'NO' }),
        ],
        spec,
      ),
    ).toEqual([])
  })

  it('exempts a table the worker only reads or only UPDATEs', () => {
    // nina_turns is claimed and closed, never inserted. A statement that never supplies a column
    // cannot omit one, so demanding coverage there would be noise that trains people to widen the
    // list without thinking.
    expect(
      findSchemaDrift(
        [
          column({ table_name: 'widget', column_name: 'id', is_nullable: 'NO' }),
          column({ table_name: 'widget', column_name: 'user_id', is_nullable: 'NO' }),
          column({ table_name: 'ledger', column_name: 'id', is_nullable: 'NO' }),
          column({ table_name: 'ledger', column_name: 'kind', is_nullable: 'NO' }),
        ],
        spec,
      ),
    ).toEqual([])
  })

  it('reports a whole missing table', () => {
    expect(findSchemaDrift([column({ table_name: 'ledger', column_name: 'id' })], spec)).toContain(
      'widget (whole table) is missing',
    )
  })
})
```

**Impact:** none on production code.

---

## Verification

**Build:** `npm run typecheck` then `npm run build`

**Tests:**

```
npm test
npm run lint
npm run typecheck
npm run ci:openrouter-guard && npm run ci:client-secret-guard && npm run ci:llm-payload-guard \
  && npm run ci:data-layer-guard && npm run ci:f08-guard && npm run ci:f11-guard
```

**Manual check — run this BEFORE committing, it is the one thing the unit tests cannot do:**

```
npm run nina:worker:dry
```

The widened preflight now runs the NOT NULL coverage check against the real database. It must print
`[nina-worker] preflight ok`. If it throws `schema drift — ...`, the production database has a
`NOT NULL` column on `nina_messages`, `nina_message_images` or `nina_avatars` that `REQUIRED_COLUMNS`
does not name — which is exactly the class of bug this phase exists to make loud. Fix the list (and
the INSERT that must supply the value); do not weaken the check.

**Manual check — the end-to-end proof of R2, against a hand-opened job:**

1. In the production/preview database, take one of the 15 `failed`/`stale` image jobs and reopen it:
   `update nina_turns set status='pending', error_code='dispatched', args = jsonb_set(args,'{attempts}','0') where id='<jobId>'`
   (`error_code='dispatched'` with an OLD `created_at` reproduces neither finding; set
   `created_at = now()` too, so the row is younger than the 60 s grace and Finding 2 is genuinely
   under test.)
2. `node --experimental-strip-types --no-warnings --env-file=.env.local scripts/nina-image-worker.ts --job <jobId>`
3. Expect `[nina-worker] claimed`, then `[nina-worker] done`, then `finished { attempted: 1 }` —
   **not** `attempted: 0`, which is Finding 2's signature.
4. Confirm in the database: one new `nina_message_images` row with `kind='generated'` (the table has
   never had a row), its `nina_messages` parent carrying a non-null `session_id` and a `turn_id`, and
   the `nina_turns` row at `status='ok'` with a non-null `cost_micro_usd`.
5. Reload `/nina` on that session and see the bubble.

**Exit criteria:**
- `npm run nina:worker --` against a hand-opened job produces a `nina_message_images` row and a
  visible bubble in the session the runner asked in.
- A targeted `--job` claim succeeds on a job under 60 seconds old.
- No path through `closeFailed` can leave a job that reached OpenRouter with `cost_micro_usd` NULL.
- **No path in this file OVERWRITES `cost_micro_usd`.** Every write is
  `coalesce(cost_micro_usd, 0) + spend`, so a job that reached the provider twice records both
  bills. Grep it: `grep -n 'cost_micro_usd =' scripts/nina-image-worker.ts` must show `coalesce`
  on every line.
- `npm run nina:worker:dry` fails loudly if a `NOT NULL` column is added to a table this worker
  inserts into.
- `npm test`, `npm run lint`, `npm run typecheck` and all six CI guards green.

---

## Handoffs

**To phase 2 — the session-resolution SQL, and why it is NOT exported for a server module to reuse.**
The brief asked for `resolveWorkerSessionId` "in a shape a server module can reuse, or say plainly
why it cannot be". It cannot be, and it should not be:

- `resolveWorkerSessionId` is bound to `@neondatabase/serverless`'s tagged-template client, which the
  worker `require()`s because it cannot reach `lib/db/*`. A server module has drizzle and `db`.
- A `server-only` module importing from `scripts/` inverts the dependency the worker's header
  establishes and would drag `createRequire` into the Next.js bundle.
- **The app already has this function.** `resolveNinaSessionForMessage(userId, replyToId)` in
  `lib/nina/sessionResolve.ts` is the canonical policy, it is what `postNinaApologyMessage` uses, and
  `resolveWorkerSessionId` is a faithful SQL transcription of it — clause for clause, with one
  documented divergence (the worker declines rather than creating a session, because a worker must
  not mint conversations).

So phase 2's in-platform generator must call `resolveNinaSessionForMessage`, not import anything from
`scripts/`. The two implementations are a duplication of POLICY, stated in both files' doc comments.
If phase 2's probe succeeds and the worker is demoted to a backstop that eventually dies, delete
`resolveWorkerSessionId` with it — do not promote it.

**To phase 2 — the workflow's demotion.** This phase only corrected the cadence *claim* in
`.github/workflows/nina-image.yml`'s comments. The backstop is not rebuilt, no `cron:` value changes,
and `NINA_IMAGE_STALE_MS` does not move. Phase 2 owns the demotion, the `maxDuration` raise, and the
re-derived chain. `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` is the fact that must survive the
re-derivation — it is asserted against `NINA_IMAGE_STALE_MS` in `tests/nina.imagerecipe.test.ts`, and
if phase 2 changes `NINA_IMAGE_STALE_MS` that assertion is the thing to check, not to delete.

**To phase 2 — Finding 2 retires at the source, and the state this fix guards stops being reachable
for NEW jobs. Say it plainly, because it changes what this fix is FOR.** With the generator
in-platform there is no doorbell and no dispatch grace window, and — verified against phase 2's
Interface Contract — **nothing writes `error_code = 'dispatched'` after phase 2 lands.** Phase 2
deletes `lib/nina/imagedispatch.ts` and `markNinaImageJobDispatched`, which were the only two
writers of that value (confirmed by grep: `markNinaImageJobDispatched` has exactly one caller,
`imagedispatch.ts:168`, and `fireNinaImageDispatch` has exactly two, `selfiegen.ts:92` and
`avatargen.ts:109`, both of which phase 2 re-points).

**So keep the fix, and keep it for two reasons that are still live:**

1. **The fifteen existing rows.** Every one of the 15 orphaned `failed`/`stale` jobs carries
   `error_code = 'dispatched'`. Phase 2's `claimNinaImageJob` admits that value explicitly as a
   LEGACY phase for exactly this reason, and a manual `--job` drain through this worker is one of
   the two documented ways to unstick one. Without `dispatchCutoffFor`, the drain is refused.
2. **The backstop is the rollback target.** Reverting phase 2 restores the doorbell, and with it a
   live `dispatched` writer. A revert that landed on the un-fixed `claimJob` would land straight
   back on Finding 2.

`dispatchCutoffFor` therefore becomes backstop-and-history machinery rather than hot-path
machinery. It stays correct, it stays tested (`tests/nina.imageworker.test.ts`, and phase 7's
end-to-end assertion moves to the in-platform claim — see phase 7's Branch A), and it is not to be
deleted along with the doorbell.

**To phase 4 — `cost_micro_usd` is a job TOTAL, everywhere.** Every write in this file accumulates:
both `closeFailed` branches, `finishSelfie` (Step 5) and `finishAvatar` (Step 5b). Phase 2 applies
the identical rule in-platform. The detail page should label it "total spent on this job", and
`attempts` is the number to show beside it. A job that failed twice will legitimately read $0.08.

**To phase 4 — `nina_messages.turn_id` is now actually written.** The analysis measured "48 rows; 0
rows carry a turn_id" because no worker write ever landed. The job -> bubble join in the other
direction is now populated for jobs completed after this phase; **it is empty for all 18 historical
jobs**, so the detail page's "jump to the bubble" must degrade visibly for them rather than dead-end.
The index already names that degradation.

**To phase 6 — no `claimed_at`, and RECONCILED: there is no migration anywhere in this plan set.**
`claimJob`'s comment still invites the column and this phase deliberately did not add it. An
earlier draft of this handoff said "phase 6's generated migration is the only migration in the
set" — **that is false and has been corrected.** Phase 6's own Interface Contract creates no
migration and states the reason at length (an FK cannot tell a deleted sentence from a deleted
conversation, and it cannot be added against a live database that already holds dangling
pointers); phase 3 accepts its `openNinaChatTurn` race permanently rather than indexing it; and
phase 2 adds no column. **`drizzle/` gains no file in this set and `npm run db:check` must stay
clean in every phase.** If a later card ever adds `claimed_at`, the cutoff moves to it and
`attempts < NINA_IMAGE_MAX_ATTEMPTS` stays.

**Not done, deliberately, and not this phase's:**
- The `nina/` Blob objects orphaned by Finding 1's crashes (the pictures were paid for and stored,
  and the rows that would reference them were never written). The `reap-orphaned-blobs` skill covers
  `nina/`; the plan index puts this out of scope as a separate card.
- Backfilling or reopening the 15 historical `failed`/`stale` jobs. Nothing here reopens them; they
  stay as the measured record of the defect.
- ~~`finishSelfie`'s success-path `nina_turns` update still SETS `cost_micro_usd`~~ — **RECONCILED
  INTO THIS PHASE.** Both success paths now accumulate (Steps 5 and 5b). Deferring it to phase 2
  would have left the backstop under-reporting a retried job by one whole generation, and phase 2
  is the rollback target, so its revert must land on an honest ledger. See the Interface Contract.

## Rollback

One commit on `feature/nina-image-pipeline-and-async-chat`. `git revert <sha>` restores every file:
no migration is generated, no schema changes, no constant's value moves, and nothing outside the five
listed files is touched. Reverting returns the pipeline to the broken-but-known state the analysis
measured — which is why phase 2's rollback story depends on this phase landing first and staying
landed.
