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

/**
 * The whole database, in one file. ROADMAP_v0.1.0.md §4.3 is authoritative for every column;
 * RECONCILIATION_v0.1.0.md amends it in six places and each amendment is marked with its ruling
 * (R-1, R-5, R-7, R-8, R-9, R-11, R-12, R-22). Where this file and a feature plan disagree, the
 * roadmap-plus-reconciliation pair wins — see docs/plans/F03-data-layer.md §10.
 *
 * Two rules that are invisible in the column list but govern the whole schema:
 *
 *   - **Integers in the smallest sensible unit** (roadmap D5). Distance is metres, duration and
 *     pace are seconds. `profiles.weight_kg` is the single deliberate exception. Floats summed
 *     over a month drift visibly; integers do not.
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

export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** The YEAR, not an age and not a birthday. Age is derived at read time or not at all. */
  birthYear: integer('birth_year'),
  heightCm: integer('height_cm'),
  /**
   * kg, one decimal — the one non-integer measured column in the schema (roadmap §4.2).
   * D15/R-28: this value must never enter an LLM payload. It is stored because the profile
   * screen collects it, and it is read by nothing that talks to a model.
   */
  weightKg: numeric('weight_kg', { precision: 4, scale: 1, mode: 'number' }),
  restingHr: integer('resting_hr'),
  /**
   * MEASURED only (roadmap §4.4 / D11). A Tanaka estimate never lands here — the resolver
   * computes it on the fly and labels it `estimated`, so that a stored number always means a
   * human or a watch actually observed it.
   */
  maxHr: integer('max_hr'),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true, mode: 'date' }),
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
     * R-22 — the ONE non-cascade FK in the schema, and deliberately so. A badge is a fact about
     * the past; deleting the run that earned it must not delete the history that it happened.
     * Do not "fix" this to cascade by pattern-matching the other FKs in this file.
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
