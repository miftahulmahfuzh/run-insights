import { relations, sql } from 'drizzle-orm'
import {
  bigserial,
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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

/**
 * The whole database, in one file. ROADMAP_v0.1.0.md §4.3 is authoritative for every column;
 * RECONCILIATION_v0.1.0.md amends it in six places and each amendment is marked with its ruling
 * (R-1, R-5, R-7, R-8, R-9, R-11, R-12, R-22). Where this file and a feature plan disagree, the
 * roadmap-plus-reconciliation pair wins — see docs/plans/F03-data-layer.md §10.
 *
 * Two rules that are invisible in the column list but govern the whole schema:
 *
 *   - **Integers in the smallest sensible unit** (roadmap D5). Distance is metres, duration and
 *     pace are seconds. `profiles.weight_kg` is the single deliberate exception among MEASURED
 *     values; `nina_avatars.crop_scale` is a display transform rather than a measurement and is
 *     `numeric` for the same reason a zoom factor is not an integer. Floats summed over a month
 *     drift visibly; integers do not.
 *   - **`runs.reviewed_at IS NOT NULL` gates every aggregate** (roadmap D16 / R-13). The column
 *     is declared here; the filter is enforced in lib/db/queries.ts and asserted by
 *     tests/db.queries.reviewedOnly.test.ts.
 */

/* ============================================================================
 * Auth.js adapter tables — the canonical @auth/drizzle-adapter Postgres shape,
 * verbatim (roadmap §4.3: "do not hand-roll them"). Singular table names and
 * camelCase columns are the adapter's convention, not ours; `drizzle()` is
 * therefore constructed WITHOUT `casing: 'snake_case'`, and the app tables below
 * spell out every snake_case name explicitly instead.
 * ==========================================================================*/

type AdapterAccountType = 'oauth' | 'oidc' | 'email' | 'webauthn'

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
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
 * App tables. `extractions` is declared before `runs` because runs.extraction_id
 * references it and never the other way round: the audit trail is independent of
 * whether a run was ever committed from it.
 * ==========================================================================*/

/**
 * The runner's sex, R6. **The schema has never carried this** — the roadmap's §4.3 `profiles`
 * block has five columns and none of them is gender — so this is a genuinely new fact about the
 * runner rather than a rename of something.
 *
 * Four members, and `'unspecified'` is deliberately distinct from `NULL`: NULL means "never
 * asked", `'unspecified'` means "asked, and declined to say". Nina treats those differently — the
 * first is a thing she may ask about once, the second is a thing she must not ask about again.
 *
 * A plain `text` column, not a `pgEnum`: this file has no enum anywhere (`runs.intent`,
 * `runs.source`, `badges.key` and `insights.scope` are all `text().$type<…>()`), and adding the
 * first one would mean every future member is a migration instead of a one-line union edit.
 */
export type Sex = 'male' | 'female' | 'other' | 'unspecified'

/** Iteration order for the form's segmented control. Same order, one source. */
export const SEX_VALUES = ['male', 'female', 'other', 'unspecified'] as const

export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** The YEAR, not an age and not a birthday. Age is derived at read time or not at all. */
  birthYear: integer('birth_year'),
  heightCm: integer('height_cm'),
  /**
   * kg, one decimal — the one non-integer measured column in the schema (roadmap §4.2).
   *
   * **D15/R-28 REPEALED (RU-1, F33).** This column used to be documented as "must never enter an
   * LLM payload, and read by nothing that talks to a model". Both halves of that are now false:
   * `lib/llm/facts.ts`'s `NarrativeProfile` carries it, Nina's context carries it, and the
   * grep in `scripts/check-llm-payload-boundary.mjs` that enforced it has been deleted. The
   * repeal is recorded in RECONCILIATION_v0.1.0.md R-28 and in NINA_CHATBOT_PLAN.md RU-1; the
   * user's reason, verbatim, is "i am the only one that uses this app… this is my personal toy".
   *
   * Everything else about the column is unchanged: still `numeric(4,1)`, still the one deliberate
   * non-integer, still rounded to one decimal by `lib/profile/schema.ts` before it gets here.
   */
  weightKg: numeric('weight_kg', { precision: 4, scale: 1, mode: 'number' }),
  /** R6 / F33. See `Sex` above for why NULL and `'unspecified'` are not the same answer. */
  sex: text('sex').$type<Sex>(),
  restingHr: integer('resting_hr'),
  /**
   * MEASURED only (roadmap §4.4 / D11). A Tanaka estimate never lands here — the resolver
   * computes it on the fly and labels it `estimated`, so that a stored number always means a
   * human or a watch actually observed it.
   */
  maxHr: integer('max_hr'),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true, mode: 'date' }),
  /**
   * **The day the app was last opened**, as an Asia/Jakarta calendar day (roadmap D6) — a string,
   * never a JS `Date`, exactly like `runs.occurred_on`.
   *
   * F33 R3's fourth proactive trigger is prolonged silence, and the user specified it on two
   * signals: *no run in N days*, **or** *the app unopened for N days*. The schema had no answer
   * to the second — there is no last-seen column anywhere — so phase 10 was forced to proxy it
   * with CHAT silence, which is a different thing: he can open the app every morning, read his
   * runs, never message Nina, and be scolded for ghosting her. This column is the missing signal.
   *
   * **A cheap best-effort touch, not an audit trail.** One `date`, not a timestamp and not a
   * history table: the trigger asks "which day", so a day is the whole of what needs storing, and
   * a per-request timestamp write would turn every page load into a database write for a number
   * nobody reads at that resolution. A missed touch costs nothing.
   *
   * **NULL means "never seen", which the silence rule must read as NO SIGNAL and not as
   * infinitely silent.** A profile row exists from the moment onboarding is skipped, so a fresh
   * install has `NULL` here — and a rule that treats NULL as "silent since the epoch" roasts him
   * on day one for not having used an app he just installed.
   *
   * **This phase declares the column and nothing else.** Nothing writes it yet: phase 10 owns the
   * trigger that reads it, and where the touch belongs (a layout, a middleware, a Server Action)
   * is a later phase's decision. See Handoffs.
   */
  lastSeenOn: date('last_seen_on', { mode: 'string' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/**
 * R-7: one entry per correction EVENT, keyed by field path, appended never overwritten. The
 * roadmap's original `{field: {from, to}}` loses the first edit the moment a field is corrected
 * twice, and R-8's post-review editing makes that a normal occurrence — which would throw away
 * exactly the signal this column exists to capture.
 *
 * F05 owns the key syntax (`distanceM`, `splits.3.hr`, …); F03 only enforces this outer shape.
 */
export type CorrectionEvent = {
  from: unknown
  to: unknown
  phase: 'review' | 'post-review-edit' | 'manual'
  /** Which consistency check pointed at this field, if any (F05's check ids). */
  checkId?: string
  /** ISO 8601 instant. A string, so the JSON round-trips byte-identically. */
  correctedAt: string
}

export type ExtractionCorrections = Record<string, CorrectionEvent[]>

/**
 * One screenshot as sent to the vision model. Structural on purpose: `lib/db/schema.ts` stays
 * free of `zod` and of F04's module graph, and `ExtractionBlobRefSchema`
 * (`lib/schema/extractionResult.ts`) is the runtime validator every writer goes through.
 */
export type ExtractionBlobRefRow = {
  url: string
  pathname: string
  /** 'summary' | 'splits' | 'heartrate' — F04 never writes 'other' into an extraction. */
  kind: PhotoKind
  width?: number | null
  height?: number | null
  bytes?: number | null
}
export type ExtractionBlobUrls = ExtractionBlobRefRow[]

export const extractions = pgTable(
  'extractions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The screenshots as uploaded to Blob, in the order the model was shown them.
     *
     * F04 owns the shape inside this column (its plan §9) — a convention, not a migration, since
     * the column is `jsonb`. Each entry carries the `kind` because `kind` is what parameterises
     * the provenance guard in `lib/schema/extractedSession.ts`, and that guard must be able to
     * answer "which screens did we actually send?" from OUR records rather than from the model's
     * reply. `ExtractionBlobRefSchema` in `lib/schema/extractionResult.ts` is the validator.
     *
     * `run_photos` also holds these three rows (R-1). The duplication is deliberate: `run_photos`
     * is the mutable, user-facing photo lifecycle (exclude-from-share, blob rotation, deletion),
     * while this column is the immutable audit record of what was sent to the model.
     */
    blobUrls: jsonb('blob_urls').$type<ExtractionBlobUrls>().notNull(),
    model: text('model').notNull(), // 'glm-4.6v'
    /**
     * The D3 token-floor canary, persisted. The Anthropic endpoint answers 200 with invented
     * numbers when it drops the images; a `prompt_tokens` far below the floor is the only signal
     * that happened. Storing it makes the guard auditable after the fact instead of only at
     * request time.
     */
    promptTokens: integer('prompt_tokens'),
    /** Exactly what the vision model returned. Never mutated once written. */
    rawResponse: jsonb('raw_response').$type<unknown>(),
    status: text('status').$type<ExtractionStatus>().notNull(), // 'pending'|'ok'|'repaired'|'failed'
    errorCode: text('error_code'),
    corrections: jsonb('corrections').$type<ExtractionCorrections>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [index('extractions_user_created_idx').on(t.userId, t.createdAt.desc())],
)

export type ExtractionStatus = 'pending' | 'ok' | 'repaired' | 'failed'

export const runs = pgTable(
  'runs',
  {
    /** nanoid(12) — lib/id.ts newRunId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Asia/Jakarta calendar day (roadmap D6), 'YYYY-MM-DD'. Read as a string, never a JS Date. */
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    /** 'HH:MM:SS' with no date attached — `early_bird` compares it as a string, and must. */
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
    /** Derived once at commit (roadmap D5), stored for cheap sorting. Never recomputed on read. */
    avgPaceSec: integer('avg_pace_sec').notNull(),
    avgHr: integer('avg_hr'),
    maxHr: integer('max_hr'),
    restingHr: integer('resting_hr'),
    intent: text('intent').$type<RunIntent>(), // 'easy'|'tempo'|'long'|'race'|'unspecified'
    /** R-9: postWorkoutHr[0]. Fixture 185. Feeds hrRecovery1MinBpm with the column below. */
    endHrBpm: integer('end_hr_bpm'),
    /** R-9: postWorkoutHr[1]. Fixture 162. The +2 min reading is reviewable but gets no column. */
    hr1MinPostBpm: integer('hr_1min_post_bpm'),
    note: text('note'),
    source: text('source').$type<RunSource>().notNull(), // 'screenshot'|'manual'
    extractionId: text('extraction_id').references(() => extractions.id),
    /**
     * Roadmap D16 / R-13. Written exactly once, by the review commit. Under R-1 a `runs` row is
     * only ever INSERTed by that commit, so in practice every row has it set — the column stays
     * because it is what stops a future feature (a manual-entry draft, an importer) from
     * silently landing unreviewed rows in the rollups.
     */
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    /** R-8: last post-review edit. `reviewed_at` answers "confirmed?", this answers "changed?". */
    correctedAt: timestamp('corrected_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    /**
     * R-5 / D2 — the duplicate-upload guard. A plain UNIQUE(user_id, occurred_on, started_at)
     * guards NOTHING when started_at is NULL, because Postgres treats two NULLs as distinct;
     * the coalesce closes that hole. The cost is that two runs on one day with no start time
     * collide, which is the cheap direction to be wrong in.
     */
    uniqueIndex('runs_user_occurred_started_unq').on(
      t.userId,
      t.occurredOn,
      sql`coalesce(${t.startedAt}, '00:00:00'::time)`,
    ),
    /** Powers "/" (newest first) and every rollup range scan. */
    index('runs_user_occurred_idx').on(t.userId, t.occurredOn.desc()),
    /** R-12 — the observed-HRmax lookup (roadmap §4.4 rule 2) reads exactly this index. */
    index('runs_user_maxhr_idx').on(t.userId, t.maxHr.desc()),
  ],
)

export type RunIntent = 'easy' | 'tempo' | 'long' | 'race' | 'unspecified'
export type RunSource = 'screenshot' | 'manual'

export const runSplits = pgTable(
  'run_splits',
  {
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    km: integer('km').notNull(),
    timeSec: integer('time_sec').notNull(),
    paceSec: integer('pace_sec').notNull(),
    hr: integer('hr'),
    cadence: integer('cadence'),
    /**
     * Roadmap D14 — the final partial kilometre. Stored and shown, and EXCLUDED from every pace
     * average by F06. It is never filtered out here: dropping it at the query layer would hide
     * it from the splits table too, where it belongs.
     */
    partial: boolean('partial').notNull().default(false),
  },
  // (run_id, km) is the natural key — a run cannot have two "km 3" rows — so it is also the
  // fastest access path for "all splits of this run". No secondary index earns its place.
  (t) => [primaryKey({ columns: [t.runId, t.km] })],
)

export const runZones = pgTable(
  'run_zones',
  {
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    zone: integer('zone').notNull(), // 1..5
    durationSec: integer('duration_sec').notNull(),
    minBpm: integer('min_bpm'), // NULL for zone 1 — Apple prints "< 130", not a floor
    maxBpm: integer('max_bpm'), // NULL for zone 5 — "> 173", no ceiling
  },
  (t) => [primaryKey({ columns: [t.runId, t.zone] })],
)

export const runPhotos = pgTable(
  'run_photos',
  {
    id: text('id').primaryKey(),
    /**
     * R-1 — the attachment point at upload time. A photo exists before any run does: the vision
     * call has not run yet, so `occurred_on` (NOT NULL) is unknown, and a placeholder `runs` row
     * would both violate D1 and collide with the R-5 dedupe index on the second upload of a day.
     */
    extractionId: text('extraction_id')
      .notNull()
      .references(() => extractions.id, { onDelete: 'cascade' }),
    /** R-1 — backfilled by the review commit, once a real run row exists. */
    runId: text('run_id').references(() => runs.id, { onDelete: 'cascade' }),
    blobUrl: text('blob_url').notNull(),
    pathname: text('pathname').notNull(),
    kind: text('kind').$type<PhotoKind>().notNull(), // 'summary'|'splits'|'heartrate'|'other'
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** R-11 / F11 — per-photo opt-out from the public share page. */
    excludedFromShare: boolean('excluded_from_share').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('run_photos_extraction_idx').on(t.extractionId),
    index('run_photos_run_idx').on(t.runId),
  ],
)

export type PhotoKind = 'summary' | 'splits' | 'heartrate' | 'other'

export const insights = pgTable(
  'insights',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').$type<InsightScope>().notNull(), // 'session'|'week'|'month'
    scopeKey: text('scope_key').notNull(), // run id | '2026-W34' | '2026-08'
    /** sha256 of the metrics fed to the model. Same facts + same scope => cache hit, no call. */
    factsHash: text('facts_hash').notNull(),
    /**
     * R-11 — session payloads carry `hrMaxUsed` + `hrMaxSource`, frozen at generation time, so a
     * later higher observed ceiling cannot silently rewrite a percentage the runner read months
     * ago, and so /s/[token] can render one without ever resolving HRmax live.
     */
    payload: jsonb('payload').$type<unknown>().notNull(),
    model: text('model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('insights_user_scope_key_hash_unq').on(t.userId, t.scope, t.scopeKey, t.factsHash),
    /** R-12 — "the newest insight for this scope_key", which is F07's hot read. */
    index('insights_latest_idx').on(t.userId, t.scope, t.scopeKey, t.createdAt.desc()),
  ],
)

export type InsightScope = 'session' | 'week' | 'month'

export const records = pgTable(
  'records',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(), // lib/records/catalog.ts (F06)
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    /** The key's canonical unit (roadmap §4.5). Basis points for best_paced_run, so it stays int. */
    value: integer('value').notNull(),
    achievedOn: date('achieved_on', { mode: 'string' }).notNull(),
    previousValue: integer('previous_value'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // The PK's leading column is user_id, so "all records for a user" is an index-only PK scan.
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
)

export const badges = pgTable(
  'badges',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(), // lib/badges/catalog.ts (F09) — 22 keys, roadmap §4.6
    /**
     * R-22 — the one non-cascade FK among the F03 tables, and deliberately so. A badge is a fact
     * about the past; deleting the run that earned it must not delete the history that it
     * happened. Do not "fix" this to cascade by pattern-matching the other FKs in this file.
     *
     * (F33 adds two more `set null` FKs, both on `nina_messages`, for the reason given in that
     * table's header. R-22's argument here is untouched by them.)
     */
    runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
    scopeKey: text('scope_key'), // '2026-W34' | '2026-08' for period badges
    /**
     * F13 — the earn's own scope identity, and the third of the primary key. One row per
     * `(user, key, dedupe_key)`: a run id for a session badge, '2026-W34' for a week, '2026-08'
     * for a month, '' for a lifetime badge. Re-committing a run cannot insert a second row for it,
     * so the count is enforced by this constraint rather than by a read-then-compare that can only
     * see the LATEST earn (the count-inflation defect, F12 §4.1).
     *
     * **A plain column, never `GENERATED ALWAYS AS (coalesce(run_id, scope_key, ''))`.** `run_id`
     * is ON DELETE SET NULL (R-22 above), so a generated column would recompute on that SET NULL,
     * collapse every session award for the deleted run to '', and make `DELETE FROM runs` fail on
     * a primary-key violation. Written once at insert, this retains the deleted run's id forever —
     * which is R-22 extended to the dedupe identity.
     */
    dedupeKey: text('dedupe_key').notNull(),
    earnedOn: date('earned_on', { mode: 'string' }).notNull(),
    /**
     * Earnings folded into this row. **1 for every row this app writes.** Pre-ledger rows carry
     * the aggregate they had before F13's migration, which could not be itemised into real awards
     * without fabricating run ids and dates — so it is preserved here instead of discarded. A read
     * sums the column; it never counts rows.
     */
    count: integer('count').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key, t.dedupeKey] }),
    /* `getBadgeAwardsForRun`'s index. The ledger grows without bound, so F11's "what did this run
     * earn" can no longer be a TypeScript filter over every row the user holds. */
    index('badges_user_run_idx').on(t.userId, t.runId),
  ],
)

export const shares = pgTable(
  'shares',
  {
    /** nanoid(16) — the credential itself (roadmap D9). See lib/id.ts newShareToken(). */
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  // One ACTIVE share per run. Revoking sets revoked_at and re-sharing mints a fresh token, so a
  // PARTIAL unique index is what makes re-sharing possible at all — a plain one would forbid it.
  (t) => [
    uniqueIndex('shares_run_id_active_unq')
      .on(t.runId)
      .where(sql`${t.revokedAt} is null`),
  ],
)

/* ============================================================================
 * F33 — Nina. Eight tables, and one rule that explains the shape of all of them:
 * SHE READS THROUGH `lib/nina/queries.ts` AND NOWHERE ELSE. Every table below
 * carries `user_id` even though this app has exactly one user (plan invariant 7),
 * because the query layer is built that way and diverging from it is more work
 * rather than less.
 *
 * `nina_turns` is declared first because `nina_messages.turn_id` carries its id.
 * ==========================================================================*/

export type NinaTurnKind = 'chat' | 'proactive' | 'image' | 'vision'

/**
 * **`'pending'` is here under RULING C2, and it is what makes RU-20's out-of-process generation
 * auditable.** A `kind = 'image'` turn is dispatched to a GitHub Actions worker and finishes
 * minutes later in another process, so between the dispatch and the callback there is a real row
 * that is neither a success nor a failure. Phase 12's originally documented fallback — write it
 * as `failed` with `error_code: 'queued'` and correct it later — is **withdrawn**: it would put a
 * failure row in the table for every single image she ever makes, and poison every "how often
 * does she fail" reading of `nina_turns` for the life of the app. A cheap word in a union beats a
 * permanently wrong table.
 *
 * Plain `text` with `.$type<>()`, exactly like `kind`, so **adding the member is NOT a migration**
 * — the column domain lives in TypeScript and Postgres holds a string.
 */
export type NinaTurnStatus = 'pending' | 'ok' | 'repaired' | 'failed'

/**
 * **The audit trail for every model call Nina makes.** One row per call, written whether it
 * succeeded or not — this is the table that answers "why did that turn take nineteen seconds",
 * "how much has she cost this month" and "how often does the repair round-trip actually fire",
 * and it is the only place those questions can be answered after the fact.
 *
 * It is deliberately NOT `insights`-shaped: no `facts_hash`, no unique index, no cache. An
 * insight is a cacheable product keyed by its inputs; a conversation turn is an event, and two
 * identical inputs a minute apart are two events. Nothing here is ever read to avoid a call.
 *
 * `cost_micro_usd` is an INTEGER in millionths of a dollar, not a float in dollars — the schema's
 * smallest-sensible-unit rule (roadmap D5) applied to money, which is where float drift is least
 * forgivable. A $0.04 image generation is `40000`.
 *
 * ── IT IS ALSO THE JOB ROW FOR RU-20, WHICH IS WHY `args` AND `'pending'` EXIST ───────────────
 * An `image` turn does not finish in this process. It is dispatched to a GitHub Actions worker
 * and lands minutes later, so its row is written `status = 'pending'` with the job phase in
 * `error_code` and its full arguments in `args`, and is closed by the callback. That makes this
 * one row the audit record AND the queue entry, which is the right call for exactly one reason:
 * a separate `nina_image_jobs` table would hold the same nine columns, need the same daily-cap
 * count, and then have to be joined against this table to answer "what did that cost". One row
 * per model call stays one row per model call even when the call outlives the request.
 *
 * `trigger` holds phase 2's `ProactiveTriggerKind` ('run_committed' | 'missed_usual_day' |
 * 'pattern_crossed' | 'silence' | 'avatar_changed') for `kind = 'proactive'` rows and NULL
 * otherwise. It is untyped `text` here on purpose: the vocabulary belongs to phase 10, and this
 * table must not become the thing phase 10 has to migrate to add a fifth trigger.
 */
export const ninaTurns = pgTable(
  'nina_turns',
  {
    /** nanoid(12) — lib/id.ts newId(). Phase 3 stamps it onto every message the turn emitted. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NinaTurnKind>().notNull(),
    trigger: text('trigger'),
    model: text('model').notNull(),
    /** `NINA_PROMPT_VERSION` at call time, so a voice regression can be dated. */
    promptVersion: integer('prompt_version'),
    /**
     * The D3 token-floor canary again, one feature over: `extractions.prompt_tokens` exists for
     * exactly this reason and `lib/llm/vision.ts` reads it. A vision turn whose `input_tokens`
     * sits far below the floor is a turn where the endpoint silently dropped the image.
     */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /**
     * **WHICH tools fired, comma-joined. `''` when none — not an integer count (RULING C8).**
     * A count would have answered a question nobody asked. Phase 3's ruling (b) keeps
     * `save_memory` as a tool with an *empirical exit condition* — drop it if it never actually
     * fires — and that is only decidable if the column records the tool NAMES. `'save_memory'`,
     * `'save_memory,attach_run'`, `''`. `NOT NULL DEFAULT ''` so "no tools" and "not recorded"
     * cannot be told apart by accident, and so `WHERE tool_calls <> ''` is the whole query.
     * Phase 12 also writes the sentinel `'dropped:save_memory'` here.
     */
    toolCalls: text('tool_calls').notNull().default(''),
    latencyMs: integer('latency_ms'),
    /** Millionths of a USD. See the header — never a float, never dollars. */
    costMicroUsd: integer('cost_micro_usd'),
    status: text('status').$type<NinaTurnStatus>().notNull(),
    /**
     * Free text, ours not the provider's. NULL on success.
     *
     * **Phase 12 also uses it as the job PHASE while `status = 'pending'`** —
     * `'queued' | 'dispatched' | 'running'` — and only writes an actual failure reason here when
     * `status = 'failed'`. Two meanings in one column, disambiguated by `status`, which is
     * cheaper than a `job_phase` column that is NULL for every one of the other three kinds.
     */
    errorCode: text('error_code'),
    /**
     * **The job's own arguments, and RU-20 makes them mandatory rather than nice to have
     * (RULING C1).** Nullable, and NULL for every `kind` except `'image'`.
     *
     * Phase 12's `NinaImageJobArgs`, verbatim as the documented shape:
     * `{ purpose, scene, mood, prompt, seed, replyToId, source, attempts, sidecar }`.
     *
     * TWO independent reasons it cannot live anywhere else:
     *
     *   1. **THE REPO IS PUBLIC.** A `workflow_dispatch` input is world-readable in the Actions
     *      run log, forever. So the prompt must travel in the DATABASE and the dispatch may carry
     *      only an opaque job id. Putting the prompt in the dispatch input would publish every
     *      word Nina ever generates an image from.
     *   2. **The `schedule:` backstop wakes with NO ARGUMENTS AT ALL.** It exists because a
     *      dispatch can be dropped, and its whole job is to find work that was left behind. A
     *      retry is therefore impossible unless the arguments are in the row — a job whose args
     *      were only ever in the dispatch payload is a job that can never be retried.
     *
     * Untyped `jsonb` on purpose: `NinaImageJobArgs` belongs to phase 12, and this table must not
     * become the thing phase 12 has to migrate to add a tenth field to its own job shape. Same
     * argument as `trigger` above.
     */
    args: jsonb('args'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** "her turns, newest first" and "how many image turns today" both read this. */
    index('nina_turns_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

export type NinaRole = 'runner' | 'nina'

/**
 * **Why the row exists. RULING C9 fixed this union, and it is `'chat'` plus every member of phase
 * 2's `ProactiveTriggerKind` — nothing more and nothing less.**
 *
 * This phase originally declared `'chat' | 'proactive' | 'operator'`. Both of the losers lost for
 * a concrete reason, and the reasons are recorded here because a column domain is the hardest
 * thing in the schema to widen later.
 *
 * ── `'proactive'` LOSES: IT WOULD HAVE COST R8 ITS INDEXED READ ───────────────────────────────
 * Phase 10 owns every writer of a non-`'chat'` source, and its durable idempotence marker for R8
 * — "did I already speak about this run?" — is
 * `source = 'run_committed' AND run_id = <this run>`: one indexed read on
 * `nina_messages_user_run_idx`, decided by the row itself. Collapsing all five triggers into
 * `'proactive'` would make that question unanswerable from this table and force a join against
 * `nina_turns.trigger` — an audit table — to decide whether to send a message. Idempotence that
 * depends on a join against the audit trail is idempotence that breaks the first time the audit
 * trail is pruned.
 *
 * ── `'operator'` LOSES: IT HAS NO WRITER AT ALL ──────────────────────────────────────────────
 * It was declared for phase 14's operator script, and phase 14 deliberately writes **no**
 * `nina_messages` row: it re-anchors her face and inserts a `nina_avatars` row, and the
 * announcement reaches the conversation through `'avatar_changed'` when she next speaks. A member
 * with no writer is a member every `switch` has to handle and no test can ever exercise.
 *
 * ── ONE VOCABULARY, TWO DECLARATIONS, AND A TEST THAT PINS THEM TOGETHER ─────────────────────
 * The union is declared HERE, in `lib/db/schema.ts`, because it is a column domain and the column
 * lives here. Phase 2 declares `ProactiveTriggerKind` for the prompt layer. **Phase 10 owns the
 * test asserting `NinaMessageSource` equals `'chat' | ProactiveTriggerKind`** — not this phase,
 * because phase 10 is the first phase in which both types exist and a test cannot import a type
 * that has not been written yet.
 */
export type NinaMessageSource =
  'chat' | 'run_committed' | 'missed_usual_day' | 'pattern_crossed' | 'silence' | 'avatar_changed'

/**
 * **The conversation.** One row per bubble, which is RU-5 made structural: Nina returns 1–4 short
 * messages per turn and each one is a real row, so each is independently quotable (phase 7),
 * independently unread (phase 10) and independently attachable to an image (phase 6). A `jsonb`
 * array of bubbles on one row would have made every one of those a special case.
 *
 * ── `seq`, AND WHY IT IS A SEQUENCE AND NOT A TIMESTAMP ───────────────────────────────────────
 * Four bubbles written inside one `db.batch` must read back in the order Nina emitted them, and
 * `sent_at` cannot promise that: `defaultNow()` inside one transaction returns the SAME instant
 * for all four statements, so `ORDER BY sent_at` leaves their order up to the planner. A
 * per-turn integer would fix that but still ties two DIFFERENT turns landing in the same instant,
 * which is exactly what an `after()` hook and a cron running concurrently can do.
 *
 * So `seq` is a `bigserial`: a total order over the whole conversation, `ORDER BY seq` is
 * deterministic with no composite key, and rows inserted in one batch are numbered in array
 * order. It is also the natural cursor for "the messages before this one" (phase 4's
 * `olderCount`) and the natural watermark for "read up to here" (phase 10).
 *
 * The PK stays `id` (nanoid(12)) because ids appear in URLs, in `reply_to_id` and in the DOM
 * (`#nina-msg-<id>`), and a guessable integer in any of those is a change of kind.
 *
 * ── TWO `SET NULL` FKs, DELIBERATELY (see `badges.run_id`'s note) ─────────────────────────────
 * `reply_to_id` and `run_id` are BOTH dereferenced on every render — a quote bubble and a run
 * card. A dangling id would paint an empty quote or an empty card, so they are real FKs; and a
 * deleted run must not delete the conversation about it, so they are `set null` rather than
 * cascade. Phase 7 and phase 8 both degrade a NULL to plain text, which is the designed outcome.
 * `turn_id` gets neither: nothing renders it, and an audit pointer must not be able to block a
 * delete.
 */
export const ninaMessages = pgTable(
  'nina_messages',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    /**
     * The total order. Assigned by Postgres, never by the app, and never reused. See the header.
     */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'runner' is him, 'nina' is her. Not 'user'/'assistant' — she is not an assistant. */
    role: text('role').$type<NinaRole>().notNull(),
    /** Her words or his, verbatim. Never a template, never a rendered number. */
    text: text('text').notNull(),
    /**
     * Why the row exists — see the type's own note (RULING C9). `'chat'` is him or her in a
     * conversation; the other five are phase 10's, one per `ProactiveTriggerKind`, and phase 10
     * is the only writer of any of them. `'run_committed'` plus `run_id` is R8's whole
     * idempotence check, which is why the triggers are spelled out instead of collapsed.
     */
    source: text('source').$type<NinaMessageSource>().notNull().default('chat'),
    /** `nina_turns.id`. A plain column on purpose — see the header's last paragraph. */
    turnId: text('turn_id'),
    /** WhatsApp-style quote (R12). Self-referencing; `AnyPgColumn` is what makes that typecheck. */
    replyToId: text('reply_to_id').references((): AnyPgColumn => ninaMessages.id, {
      onDelete: 'set null',
    }),
    /** The run he shared into the chat (R13). */
    runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    /** Phase 11 stamps it when Web Push accepted the notification. NULL = never pushed. */
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    /** Phase 10's unread badge is `role = 'nina' AND read_at IS NULL`. */
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    /** The one hot read: "her last N messages, in order". Index-only for the ORDER BY. */
    index('nina_messages_user_seq_idx').on(t.userId, t.seq),
    /**
     * **The unread count, as a PARTIAL index — and RULING C9's index check resolves to "already
     * done here".** Phase 10 asked for either `(user_id, read_at) WHERE read_at IS NULL` or
     * `(user_id, role, read_at)`; this index is strictly stronger than both and no second one is
     * added. It carries the `role = 'nina'` predicate too, so his own messages — which are
     * `read_at IS NULL` forever, because nothing ever marks them read — are not even in the
     * index, let alone counted.
     *
     * Partial rather than full, on the `shares_run_id_active_unq` precedent one table over:
     * almost every row is read almost all of the time, so a full index on `read_at` would be a
     * big index answering a question about a handful of rows.
     *
     * This matters more than an index note usually does, which is why it is spelled out: the
     * count runs on **every page render of every tabbed screen** — the badge lives in the bottom
     * bar, so `/`, `/runs`, `/nina`, `/trends` and `/me` each pay for it. A sequential scan of
     * the whole conversation on every navigation is the one performance mistake in this schema
     * that a user would actually feel.
     */
    index('nina_messages_user_unread_idx')
      .on(t.userId, t.seq)
      .where(sql`${t.readAt} is null and ${t.role} = 'nina'`),
    /** Phase 7 resolves a quote's target, and phase 13 needs "what replied to this". */
    index('nina_messages_reply_to_idx').on(t.replyToId),
    /** Phase 8's "did he already share this run" and the run-detail back-link. */
    index('nina_messages_user_run_idx').on(t.userId, t.runId),
  ],
)

export type NinaImageKind = 'upload' | 'generated'

/**
 * **Its own table, not a `jsonb` column on `nina_messages`.** Three readers force that: phase 13's
 * detail page queries "every image in this conversation, newest first" without touching the
 * message rows, phase 6 writes a `description` per image, and phase 12 writes a `prompt` per
 * image. A `jsonb` array would make the gallery a full table scan plus a TypeScript flatten, and
 * `run_photos` — the table this one is modelled on — made the same call for the same reason.
 *
 * `user_id` is denormalised alongside `message_id` so the gallery read is `WHERE user_id = $1`
 * rather than a join back through `nina_messages` purely to prove ownership (invariant 7).
 *
 * `description` is `glm-4.6v`'s dense private text (RU-12): what is actually in the picture, in
 * prose, written for `glm-5.3` to react to and never shown to the runner. It is what makes R10
 * work at all, and phase 6 is the only writer.
 */
export const ninaMessageImages = pgTable(
  'nina_message_images',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Cascade: an image with no message is nothing. Unlike a badge, it is not a fact. */
    messageId: text('message_id')
      .notNull()
      .references(() => ninaMessages.id, { onDelete: 'cascade' }),
    /** 'upload' = he sent it (phase 6). 'generated' = she made it (phase 12). */
    kind: text('kind').$type<NinaImageKind>().notNull(),
    blobUrl: text('blob_url').notNull(),
    /** `nina/<userId>/…` (RU-7). The reaper's future handle on these — see Handoffs. */
    pathname: text('pathname').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    /** `glm-4.6v`'s private description. See the header. Phase 6 writes it. */
    description: text('description'),
    /** The generation prompt, `kind = 'generated'` only. Phase 12 writes it. */
    prompt: text('prompt'),
    /** Stable order for a multi-image message, the `run_photos.sort_order` precedent. */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** "the images on these messages" — phase 4's list hydration. */
    index('nina_message_images_message_idx').on(t.messageId),
    /** Phase 13's gallery, newest first, without a join. */
    index('nina_message_images_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

/** Who put the row there. `'admin'` is the `/admin/memory` editor (R26, phase 16). */
export type NinaMemorySource = 'distilled' | 'admin'

/**
 * One `pending_promises` entry (R19). Phase 5 writes them from a finished turn, phase 13's
 * evaluator reads them, checks each against reality, and on a met promise generates a new avatar
 * and makes her announce it.
 *
 * `metric` plus `target`/`targetKey` is what makes a promise CHECKABLE against precomputed facts
 * instead of re-asked of the model — invariant 2 applied to a promise. `'free'` is the escape
 * hatch for a promise no field can decide; phase 13 leaves those pending and she may ask.
 *
 * Every date is a Jakarta `'YYYY-MM-DD'` string (roadmap D6), never a JS `Date`.
 */
export type NinaPromiseMetric = 'distance_km_total' | 'run_count' | 'record' | 'badge' | 'free'

export type NinaPendingPromise = {
  /** nanoid(12), so she can refer to one promise across turns. */
  id: string
  /** Her promise in her own words, display-ready. */
  text: string
  /** The condition in his terms, display-ready — "kalau lo lari 50k bulan ini". */
  condition: string
  metric: NinaPromiseMetric
  /** The number to reach, in the metric's own unit. NULL for 'record' | 'badge' | 'free'. */
  target: number | null
  /** A `RECORD_CATALOG` or `BADGE_CATALOG` key for 'record' | 'badge'. NULL otherwise. */
  targetKey: string | null
  /** Deadline, or NULL for open-ended. */
  byDate: string | null
  promisedOn: string
  /** `nina_messages.id` she said it in, or NULL if the admin typed it. */
  sourceMessageId: string | null
  status: 'pending' | 'met' | 'expired'
  resolvedOn: string | null
  /**
   * ── THE THREE FIELDS BELOW ARE RULING C3, AND RU-20 IS WHY THEY HAVE TO EXIST ────────────────
   * The promise state machine used to be answerable in one process: evaluate the promise,
   * generate the avatar, make her announce it, mark it `met`. RU-20 broke that — generation is
   * now dispatched to a GitHub Actions worker and LANDS IN ANOTHER PROCESS MINUTES LATER. So
   * "did she keep her promise" can no longer be answered by a return value, and the only place
   * left to answer it is the promise itself.
   *
   *   · `jobId`   — the `nina_turns.id` of the dispatched generation. Without it, a promise that
   *                 has been acted on and a promise nobody has touched are indistinguishable,
   *                 and the evaluator fires a second job on its next sweep. This is the
   *                 idempotence marker for the promise path, exactly as
   *                 `source='run_committed' AND run_id=…` is for R8.
   *   · `firedOn` — the Jakarta `'YYYY-MM-DD'` the job was dispatched. A day, not an instant,
   *                 because every other date on this type is a day (roadmap D6) and the rule it
   *                 serves is "not twice in one day".
   *   · `attempts`— how many dispatches this promise has already cost. A worker that fails
   *                 transport is retried by the `schedule:` backstop, and a promise with no
   *                 attempt counter is a promise that can be retried forever.
   *
   * `nina_memory_slots.value` is `jsonb`, so **all three cost no migration**; and all three are
   * **optional**, so phase 5's constructor, its `mergePendingPromises` and its tests compile
   * untouched — a promise written before phase 12 lands simply has none of them, which reads
   * correctly as "never dispatched".
   */
  jobId?: string | null
  /** Jakarta `'YYYY-MM-DD'`. See the note above. */
  firedOn?: string | null
  attempts?: number
}

/** The `pending_promises` slot's value, in full. Phase 13 parses exactly this. */
export type NinaPendingPromisesSlot = { promises: NinaPendingPromise[] }

/** The one slot key this phase names. Phase 5 owns every other key in the vocabulary. */
export const NINA_SLOT_PENDING_PROMISES = 'pending_promises'

/**
 * What may live in `nina_memory_slots.value`. A bare JSON string is the common case — see the
 * table's header for why that is a feature and not a shortcut.
 */
export type NinaSlotValue =
  string | number | boolean | NinaPendingPromisesSlot | { [key: string]: unknown } | unknown[]

/**
 * **The upserted half of RU-6.** One row per `(user, key)`, overwritten in place: the runner's
 * nickname, his usual running days, what he is training for, what hurts, what he has promised.
 * These are the facts Nina must not have to search for — they are pre-injected on every turn
 * (RU-4), so a slot that is wrong is wrong in every conversation until it is corrected.
 *
 * ── WHY `jsonb` AND NOT `text` ────────────────────────────────────────────────────────────────
 * Almost every slot is a short display-ready phrase, and `jsonb` stores one as a bare JSON string
 * (`"suka lari pagi"`) perfectly well. But `pending_promises` is a list of records with a
 * deadline and a status, and phase 13 has to evaluate its fields — so one column has to hold
 * both. The alternative, a `text` column plus a `value_json` column, is two columns to keep in
 * step and a rule about which one wins. `lib/nina/queries.ts` absorbs the difference instead:
 * `getNinaMemorySlots` renders every value to the string phase 2's context wants, and
 * `getNinaMemorySlot` returns one parsed for phase 13.
 *
 * ── `source_message_id` IS NULLABLE, AND `source` SAYS WHY ────────────────────────────────────
 * A distilled slot points at the message it came from. A slot the admin typed into
 * `/admin/memory` (R26, phase 16) points at nothing, because nothing in the chat said it. NULL is
 * therefore a real answer and not missing data — and `source` is what tells the two apart, so
 * phase 5's distiller can refuse to silently overwrite something a human asserted, and so the
 * editor can show which rows it owns. Same argument as `nina_avatars.source`.
 */
export const ninaMemorySlots = pgTable(
  'nina_memory_slots',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Phase 5 owns the vocabulary. `NINA_SLOT_PENDING_PROMISES` is the one key declared here. */
    key: text('key').notNull(),
    value: jsonb('value').$type<NinaSlotValue>().notNull(),
    source: text('source').$type<NinaMemorySource>().notNull().default('distilled'),
    /** `nina_messages.id`, unenforced (see `nina_messages`' header). NULL = the admin typed it. */
    sourceMessageId: text('source_message_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // `(user_id, key)` is the natural key and the whole access pattern is "every slot for this
  // user", which is a leading-column PK scan. No secondary index earns its place — the same
  // argument `records` makes for its own PK.
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
)

/**
 * Phase 5 owns this vocabulary; these six are its starting set. A `text` column, so adding a
 * seventh is a one-line union edit and not a migration.
 */
export type NinaFactCategory =
  'person' | 'preference' | 'body' | 'life' | 'goal' | 'training' | 'other'

/**
 * **The append-only half of RU-6.** A slot answers "what is true now"; the ledger answers "what
 * has he told me". It is never updated and never deleted by the app — a contradicting later
 * statement REPLACES the slot and leaves both ledger rows, which is what lets her say "lo bilang
 * benci lari pagi bulan lalu" three months after the slot moved on.
 *
 * `confidence` is an INTEGER PERCENT, 0–100 — the smallest-sensible-unit rule applied to a
 * probability, so that summing or thresholding it never drifts. 100 is "he said it outright".
 *
 * `source_message_id` is nullable for the same reason as the slots table, and `source`
 * distinguishes a distilled row from one the admin typed (R26, phase 16). Phase 16 is the only
 * caller of `updateNinaMemoryFact` and `deleteNinaMemoryFact`; nothing in the runtime mutates a
 * ledger row.
 */
export const ninaMemoryFacts = pgTable(
  'nina_memory_facts',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').$type<NinaFactCategory>().notNull(),
    /** One fact, one sentence, in the language he said it in. */
    text: text('text').notNull(),
    /** Integer percent 0–100. See the header. */
    confidence: integer('confidence').notNull().default(100),
    source: text('source').$type<NinaMemorySource>().notNull().default('distilled'),
    /** `nina_messages.id`, unenforced. NULL = the admin typed it, not the chat. */
    sourceMessageId: text('source_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** "the newest 60 facts" — the only read (`MEMORY_FACT_LIMIT`, phase 2). */
    index('nina_memory_facts_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
)

/**
 * **The escalation ledger (RU-9).** `lib/nina/patterns.ts` computes what is true; this table
 * records what she has already SAID about it, so the third late start gets a different sentence
 * from the first instead of the same one three times. Anger that repeats verbatim stops being
 * anger and starts being a notification.
 *
 * `level` is the rung on phase 2's anger ladder, `count` is how many times the code has ever
 * fired, and `last_mentioned_on` is a Jakarta calendar day (roadmap D6, a string) because "did
 * she already mention this today" is a day question and never an instant question.
 *
 * Phase 9 owns the decay rule — a level that never falls is a friend who never forgives.
 */
export const ninaNags = pgTable(
  'nina_nags',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Phase 9's code. **The model never coins one** — it is handed codes that fired. */
    code: text('code').notNull(),
    level: integer('level').notNull().default(0),
    count: integer('count').notNull().default(0),
    lastMentionedOn: date('last_mentioned_on', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.code] })],
)

/** 'seed' is the committed first avatar, 'generated' phase 12, 'operator' phase 14, 'admin' 15. */
export type NinaAvatarSource = 'seed' | 'generated' | 'operator' | 'admin'

/**
 * **Her album (RU-7, R19).** Per-user, blobs under `nina/<userId>/`, exactly one row current.
 *
 * ── THE PARTIAL UNIQUE INDEX IS THE POINT ─────────────────────────────────────────────────────
 * `nina_avatars_user_current_unq on (user_id) where is_current` makes two current avatars
 * IMPOSSIBLE rather than merely unlikely — the `shares_run_id_active_unq` precedent, and for the
 * same reason: the alternative is a read-then-compare that is correct until two writers race.
 * **A consequence every writer must respect: un-current the old row BEFORE inserting the new
 * one, in one `db.batch`.** Insert-first violates the index mid-transaction. Phase 14's script
 * documents this and gets the order right; `insertNinaAvatarAsCurrent` in Step 6 is the runtime
 * half and gets it right for the same reason.
 *
 * ── `announced_at` ────────────────────────────────────────────────────────────────────────────
 * Nullable, so "the current avatar she has not mentioned yet" is a query
 * (`is_current AND announced_at IS NULL`) and not a flag someone has to remember to set. That
 * query is what makes RU-17 work: a hand-uploaded avatar makes her speak, because something
 * finds the un-announced row and asks her to comment on it.
 *
 * ── THE CROP TRANSFORM (R23) ──────────────────────────────────────────────────────────────────
 * `/admin/nina` (phase 15) lets the user zoom and drag an image until her face sits centred in a
 * CIRCULAR frame, and that transform has to persist per avatar or every screen re-guesses it.
 * Three nullable columns, in a resolution-independent convention so the same numbers work for a
 * 28 px bubble avatar and a full-screen photo:
 *
 *   - `crop_scale` — a multiple of the COVER fit. `1.000` is the smallest scale that still fills
 *     the circle; `1.500` is zoomed 50% further in. `numeric(5,3)`, so 0.001 … 9.999.
 *   - `crop_x`, `crop_y` — the image centre's offset from the frame centre, in THOUSANDTHS OF
 *     THE FRAME'S WIDTH. Positive x moves the image right, positive y moves it down. Integers,
 *     because the schema's rule is integers in the smallest sensible unit and a per-mille of a
 *     frame is that unit here.
 *
 * **All three NULL together means "no transform": render the image `object-cover`, centred.**
 * That is the value every row written before phase 15 carries — the seed row, phase 12's
 * generations, phase 14's operator uploads — so none of them needs a backfill and none of them is
 * invalid. A renderer must treat a partial triple (scale set, offsets NULL) as offsets of zero
 * rather than as an error.
 *
 * ── `description` (R25) ───────────────────────────────────────────────────────────────────────
 * What the picture DEPICTS, in prose. It exists so that "lah lo ganti foto profil na, itu lagi
 * dimana?" can be answered with a story consistent with the actual image and with the chat
 * history — she cannot invent where she was in a photograph she cannot see, and RU-12 forbids
 * sending `glm-5.3` an image. Nullable, and three different phases populate it three different
 * ways: **phase 12** already has its own generation prompt and writes from that; **phase 14**
 * and **phase 15** are handed a file with no prompt at all, so both run phase 6's `glm-4.6v`
 * describe pre-pass over it. Declaring the column is this phase's whole share of R25.
 *
 * ── THE ALBUM IS A FILE MANAGER, AND A FOLDER IS A COLUMN (F34 R1) ────────────────────────────
 * The user's requirement, verbatim: *"i will put hundreds of profile pics in there, and i very
 * much prefer we can upload folders instead."* So a photo has a `folder`, and `''` is the album
 * root.
 *
 * **Folder structure is METADATA, not blob layout, and that is a decision rather than an
 * oversight.** Blob pathnames keep the flat `nina/<userId>/avatar-<id>.<ext>` shape
 * (`lib/admin/avatars.ts`), so renaming a folder holding three hundred photos is ONE `UPDATE`
 * instead of three hundred copy-and-deletes across a network. It also means `pathname` could not
 * have carried the folder even if we wanted it to: `addRandomSuffix: true` makes Blob rewrite the
 * pathname it was asked for, so the stored value is Blob's and folder identity cannot be parsed
 * back out of it.
 *
 * `folder` is `NOT NULL DEFAULT ''` and that pairing is the entire migration story. Every row
 * written before F34 — the phase 14 operator uploads, phase 12's generations, phase 15's
 * hand-uploads — appears at the album root, and it appears there because Postgres applies a
 * constant default at `ADD COLUMN` time without rewriting the table. `419167d` is the precedent
 * for telling the two apart: that fix needed a BACKFILL, because a new `records` key changed what
 * a derived table *should* hold without touching anything that would make it hold that. This
 * needs a DEFAULT, because there is nothing to derive — "no folder" and "the root" are the same
 * fact, and a script that wrote `''` into every row would be writing the value the column already
 * has.
 *
 * **An EMPTY folder is representable, but not by this column** — see `nina_folders` below. A
 * folder is otherwise exactly the set of rows carrying its path, which is what makes a folder
 * arrive by being dropped and what makes a rename one `UPDATE`; what that cannot say is "this
 * directory exists and I have not filled it yet", and the operator filing hundreds of photographs
 * makes the directory first. So `nina_folders` holds that one fact and `listNinaAvatarFolders`
 * UNIONs the two sources rather than trusting either. **Neither is authoritative**, which is the
 * whole of the consistency story: read that function's header before touching either table.
 *
 * `filename` is what the file was called on the laptop — `File.webkitRelativePath`'s last
 * segment. Nullable, because the three pre-F34 writers were handed bytes and not a filename, and
 * inventing `avatar-<id>.jpg` for them would be recording a fact nobody stated. A renderer shows
 * the id when it is NULL.
 *
 * ── `source_key` IS A CONSTRAINT, NOT A CONVENTION ────────────────────────────────────────────
 * The other half of the requirement: *"it automatically upload only the new folders and files as
 * optimization."* The browser folds `(normalised relative path, size, lastModified)` into one
 * string per file, compares it against the manifest this table hands back, and uploads only the
 * misses. That diff is a client-side optimisation and therefore advisory — a double-clicked drop,
 * a retried Server Action or two tabs will all re-submit a batch that the diff already approved.
 *
 * So `nina_avatars_user_source_key_unq` on `(user_id, source_key)` makes the second insert
 * IMPOSSIBLE rather than merely unlikely, exactly as `nina_avatars_user_current_unq` above does
 * for two current avatars, and for the same stated reason: the alternative is a read-then-compare
 * that is correct until two writers race. The batch insert writes
 * `ON CONFLICT (user_id, source_key) DO NOTHING`, so a resubmitted batch is a no-op with a
 * truthful "0 new rows" instead of a duplicate album.
 *
 * **`source_key` is NULLABLE and that is what makes the unique index safe to add to a populated
 * table.** Postgres unique indexes treat NULLs as DISTINCT by default, so every pre-F34 row —
 * all of which carry NULL — coexists with every other, and only rows that actually claim a
 * dedupe key are held to it. `NULLS NOT DISTINCT` would have made the migration fail on the
 * second existing row. It is a client-supplied value, so `lib/admin/filetree.ts` bounds its
 * length: a b-tree tuple has a hard size limit and an unbounded text column in a unique index is
 * an insert that fails at 2704 bytes rather than at validation.
 *
 * ── THE DERIVED THUMBNAIL (`thumb_url`, `thumb_pathname`) ─────────────────────────────────────
 * A grid of hundreds cannot download hundreds of originals, and the two obvious escapes are both
 * already ruled out in writing: `components/nina/NinaPhotoGrid.tsx:56-58` refuses `next/image` on
 * these blobs (*"would re-optimise finished files on a paid transform quota"*), and
 * `components/admin/UploadAvatar.tsx:26-33` refuses to downscale the ORIGINAL, because a 4× crop
 * zoom on a 768 px source shows her face at 192 px. Both hold. So a SECOND, small blob is written
 * beside the original at upload time and the original is never touched.
 *
 * Two columns and not one: `thumb_url` is what a grid renders, and `thumb_pathname` is the STORED
 * Blob pathname, which is the only thing that lets a delete remove both objects. Recording a URL
 * without its pathname is how an album accumulates orphans that only a store listing can find.
 * Both NULL means "there is no thumbnail" — the pre-F34 rows, and any row whose thumbnail
 * derivation failed — and a renderer falls back to `blob_url`, which is correct if expensive and
 * is what `/nina/about`'s grid does today anyway.
 *
 * ── THE FOLDER INDEX DOES NOT REPLACE THE CREATED INDEX ───────────────────────────────────────
 * `nina_avatars_user_folder_created_idx on (user_id, folder, created_at desc)` is what makes the
 * explorer's page an index range scan: equality on `user_id`, equality on `folder`, and the sort
 * already ordered. `nina_avatars_user_created_idx` stays, because "the whole album, newest first"
 * (`listNinaAvatars`, three callers) puts no equality on `folder` and would have to sort. Two
 * reads, two shapes, two indexes.
 *
 * The one read the folder index serves less well is the SUBTREE — the manifest's "this folder and
 * everything under it", which is an exact-prefix comparison rather than an equality. Under a
 * non-C collation a b-tree cannot range-scan that without `text_pattern_ops`, so it degrades to a
 * `user_id` scan with a filter. Accepted deliberately: the subtree read runs once per dropped
 * folder over a table sized in hundreds, and a second index for it would be a second index to
 * maintain on every insert for a query that runs when a human drags something.
 */
export const ninaAvatars = pgTable(
  'nina_avatars',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blobUrl: text('blob_url').notNull(),
    /** `nina/<userId>/avatar-<id>.jpg` (RU-7). Phase 12 owns the exact shape. */
    pathname: text('pathname').notNull(),
    /**
     * Which album folder this photo sits in — F34 R1. `''` IS THE ROOT, not a missing value:
     * the path grammar is slash-separated segments with no leading or trailing slash, so the
     * root is the path with zero segments. `NOT NULL DEFAULT ''` is what puts every pre-F34 row
     * at the root without a backfill; see the header for why that is a default and `419167d` was
     * a script.
     */
    folder: text('folder').notNull().default(''),
    /**
     * The file's own name on the laptop, from `File.webkitRelativePath`'s last segment. NULL for
     * every row that was handed bytes rather than a file — the seed, phase 12's generations,
     * phase 14's operator uploads. See the header.
     */
    filename: text('filename'),
    /**
     * The client-computed dedupe key: `(normalised relative path, size, lastModified)` folded
     * into one string, so "have I already uploaded this?" is a string comparison and never a
     * content hash over hundreds of megabytes. NULL means this row predates the file manager, and
     * NULL is exactly what lets `nina_avatars_user_source_key_unq` be added to a populated table.
     * See the header.
     */
    sourceKey: text('source_key'),
    /** The derived grid thumbnail's Blob URL. NULL = none; a renderer falls back to `blob_url`. */
    thumbUrl: text('thumb_url'),
    /** The thumbnail's STORED Blob pathname — the only thing that lets a delete remove it too. */
    thumbPathname: text('thumb_pathname'),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    source: text('source').$type<NinaAvatarSource>().notNull(),
    /** Multiple of the cover fit; NULL = no transform. See the header. */
    cropScale: numeric('crop_scale', { precision: 5, scale: 3, mode: 'number' }),
    /** Per-mille of frame width, positive = right. NULL = 0. */
    cropX: integer('crop_x'),
    /** Per-mille of frame width, positive = down. NULL = 0. */
    cropY: integer('crop_y'),
    /** What the picture shows, in prose (R25). See the header for its three writers. */
    description: text('description'),
    isCurrent: boolean('is_current').notNull().default(false),
    /** NULL = she has not mentioned this one yet. See the header. */
    announcedAt: timestamp('announced_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** Two current avatars are impossible, not unlikely. Writers: un-current first. */
    uniqueIndex('nina_avatars_user_current_unq')
      .on(t.userId)
      .where(sql`${t.isCurrent}`),
    /** The album, newest first. Kept: "every folder, newest first" puts no equality on folder. */
    index('nina_avatars_user_created_idx').on(t.userId, t.createdAt.desc()),
    /**
     * The explorer's page (F34 R1): equality on `user_id`, equality on `folder`, sort already
     * ordered — so `listNinaAvatarsInFolder` is a range scan and not a sort over the album. See
     * the header for why this does not subsume the index above.
     */
    index('nina_avatars_user_folder_created_idx').on(t.userId, t.folder, t.createdAt.desc()),
    /**
     * A double-submitted batch cannot insert twice. NULLs are DISTINCT by default, so every
     * pre-F34 row is exempt and only a row that claims a dedupe key is held to it. See the
     * header — this is the `nina_avatars_user_current_unq` argument applied to a second fact.
     */
    uniqueIndex('nina_avatars_user_source_key_unq').on(t.userId, t.sourceKey),
  ],
)

/**
 * **DECLARATION ONLY — phase 11 owns every write against this table.** It is here because a
 * migration per phase is a migration per phase, and because phase 11's exit criteria are about
 * VAPID and a service worker rather than about DDL.
 *
 * The shape is the Web Push subscription as `PushSubscription.toJSON()` gives it, flattened:
 * `endpoint` plus the two `keys` fields. `endpoint` is globally unique by spec, so it gets a
 * unique index — but the PK stays a nanoid, because an endpoint is a 300-character URL and a
 * 300-character primary key is a 300-character foreign key everywhere it is referenced.
 *
 * `failure_count` and `revoked_at` are the pruning story: a browser that has revoked its
 * subscription answers 404/410 to every send, and a sender that does not record that will retry
 * forever. Phase 11 decides the threshold.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    /** `keys.p256dh` — the client's public key, base64url. */
    p256dh: text('p256dh').notNull(),
    /** `keys.auth` — the client's auth secret, base64url. */
    auth: text('auth').notNull(),
    /** Which browser this is, so a stale subscription is identifiable by a human. */
    userAgent: text('user_agent'),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'date' }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true, mode: 'date' }),
    failureCount: integer('failure_count').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** One row per browser endpoint. Re-subscribing upserts on this. */
    uniqueIndex('push_subscriptions_endpoint_unq').on(t.endpoint),
    /** "every live subscription for this user" — the send fan-out. */
    index('push_subscriptions_user_idx').on(t.userId),
  ],
)

/* ============================================================================
 * Relations. The sanctioned read path is explicit selects inside db.batch
 * (getRunDetail), because that is one HTTP round trip and one snapshot. These
 * cost nothing at runtime and keep db.query.* available if a later feature wants
 * a relational read.
 * ==========================================================================*/

export const usersRelations = relations(users, ({ many, one }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  runs: many(runs),
  extractions: many(extractions),
}))
export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}))
export const extractionsRelations = relations(extractions, ({ one, many }) => ({
  user: one(users, { fields: [extractions.userId], references: [users.id] }),
  photos: many(runPhotos),
}))
export const runsRelations = relations(runs, ({ one, many }) => ({
  user: one(users, { fields: [runs.userId], references: [users.id] }),
  extraction: one(extractions, { fields: [runs.extractionId], references: [extractions.id] }),
  splits: many(runSplits),
  zones: many(runZones),
  photos: many(runPhotos),
  shares: many(shares),
}))
export const runSplitsRelations = relations(runSplits, ({ one }) => ({
  run: one(runs, { fields: [runSplits.runId], references: [runs.id] }),
}))
export const runZonesRelations = relations(runZones, ({ one }) => ({
  run: one(runs, { fields: [runZones.runId], references: [runs.id] }),
}))
export const runPhotosRelations = relations(runPhotos, ({ one }) => ({
  run: one(runs, { fields: [runPhotos.runId], references: [runs.id] }),
  extraction: one(extractions, {
    fields: [runPhotos.extractionId],
    references: [extractions.id],
  }),
}))
export const sharesRelations = relations(shares, ({ one }) => ({
  run: one(runs, { fields: [shares.runId], references: [runs.id] }),
  user: one(users, { fields: [shares.userId], references: [users.id] }),
}))

export const ninaMessagesRelations = relations(ninaMessages, ({ one, many }) => ({
  user: one(users, { fields: [ninaMessages.userId], references: [users.id] }),
  run: one(runs, { fields: [ninaMessages.runId], references: [runs.id] }),
  /** The quoted message (R12). Named so `replyTo` reads as the noun it is. */
  replyTo: one(ninaMessages, {
    relationName: 'ninaMessageReplyTo',
    fields: [ninaMessages.replyToId],
    references: [ninaMessages.id],
  }),
  /** The messages quoting THIS one. The other side of the self-relation. */
  replies: many(ninaMessages, { relationName: 'ninaMessageReplyTo' }),
  images: many(ninaMessageImages),
}))

export const ninaMessageImagesRelations = relations(ninaMessageImages, ({ one }) => ({
  message: one(ninaMessages, {
    fields: [ninaMessageImages.messageId],
    references: [ninaMessages.id],
  }),
  user: one(users, { fields: [ninaMessageImages.userId], references: [users.id] }),
}))

export const ninaAvatarsRelations = relations(ninaAvatars, ({ one }) => ({
  user: one(users, { fields: [ninaAvatars.userId], references: [users.id] }),
}))

/**
 * **A folder that exists on purpose.** F34 R1, and the one thing the `folder` column cannot say.
 *
 * ── WHY A SECOND SOURCE OF FOLDERS AT ALL ───────────────────────────────────────────────────
 * `nina_avatars.folder` makes a folder exist *because a photograph is in it*. That is the right
 * primary representation — it is what makes a rename one `UPDATE` instead of an O(files) copy of
 * blobs — but it cannot represent a directory you made and have not filled yet, and the operator
 * filing hundreds of photographs makes the empty folder first and drops into it second. So this
 * table holds exactly one fact: *this path is a folder, even if it is empty.*
 *
 * ── IT IS A DECLARATION, NOT AN INDEX OF THE TRUTH ──────────────────────────────────────────
 * The danger in a second source is the two disagreeing, so neither is authoritative and the read
 * that matters (`listNinaAvatarFolders`) is a UNION: a folder appears if a row is in it **or** if
 * it is declared here. That makes both directions of disagreement degrade instead of corrupt —
 * a populated folder with no declaration still appears (the photographs carry it), and a
 * declaration left behind after its photographs are gone appears as an empty folder, which is now
 * a legal state rather than a ghost. **Nothing reads this table alone**, and nothing may start:
 * a query that trusted only these rows would hide every folder created by dropping one.
 *
 * ── THE PAIR IS THE KEY, SO A DOUBLE DECLARATION IS IMPOSSIBLE ───────────────────────────────
 * `primaryKey({ columns: [userId, folder] })` — the composite-natural-key idiom `nina_nags`
 * already uses, and for the same reason: there is no second fact about a folder to hang a
 * surrogate id on, and the constraint is what lets `declareNinaFolders` be an
 * `ON CONFLICT DO NOTHING` upsert instead of a read-then-insert that is correct until two tabs
 * race. It also gives the subtree predicate an index to walk on `(user_id, folder)`.
 *
 * ── THE ROOT IS NEVER STORED ────────────────────────────────────────────────────────────────
 * `folder = ''` is the album root. It always exists, it cannot be created and it cannot be
 * deleted, so a row asserting it would be a row asserting a tautology — and the one thing worse
 * than a fact stored twice is a fact stored once *and* implied. `declareNinaFolders` drops it,
 * which is enforced there rather than by a CHECK, because the reason is a UI invariant and not a
 * data one.
 *
 * ── NO `blob_url`, NO COUNTS, NO `is_current` ───────────────────────────────────────────────
 * A folder owns no bytes and no photograph. The count the tree pane draws comes from
 * `count(*)` over `nina_avatars` at read time, never from a column here — a stored count is a
 * cache with two writers, which is the exact failure this table's header is otherwise about.
 */
export const ninaFolders = pgTable(
  'nina_folders',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** A normalised folder path, `lib/admin/filetree.ts`'s grammar. Never `''` — see the header. */
    folder: text('folder').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.folder] })],
)
export const ninaFoldersRelations = relations(ninaFolders, ({ one }) => ({
  user: one(users, { fields: [ninaFolders.userId], references: [users.id] }),
}))

/* ============================================================================
 * Row types. Import these instead of re-deriving $inferSelect at call sites.
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
export type NinaTurn = typeof ninaTurns.$inferSelect
export type NewNinaTurn = typeof ninaTurns.$inferInsert
export type NinaMessage = typeof ninaMessages.$inferSelect
export type NewNinaMessage = typeof ninaMessages.$inferInsert
export type NinaMessageImage = typeof ninaMessageImages.$inferSelect
export type NewNinaMessageImage = typeof ninaMessageImages.$inferInsert
export type NinaMemorySlot = typeof ninaMemorySlots.$inferSelect
export type NewNinaMemorySlot = typeof ninaMemorySlots.$inferInsert
export type NinaMemoryFact = typeof ninaMemoryFacts.$inferSelect
export type NewNinaMemoryFact = typeof ninaMemoryFacts.$inferInsert
export type NinaNag = typeof ninaNags.$inferSelect
export type NewNinaNag = typeof ninaNags.$inferInsert
export type NinaAvatar = typeof ninaAvatars.$inferSelect
export type NewNinaAvatar = typeof ninaAvatars.$inferInsert
export type NinaFolder = typeof ninaFolders.$inferSelect
export type NewNinaFolder = typeof ninaFolders.$inferInsert
/**
 * `PushSubscriptionRow`, not `PushSubscription` — the latter is a DOM lib global that phase 11's
 * client code uses by that exact name, and shadowing it in a module that also talks to the
 * browser API is how a subscription gets written to the wrong shape.
 */
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert
