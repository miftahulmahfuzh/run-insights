import { relations } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { users } from '../auth'
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

/**
 * **What she pays out when he keeps his end.** R5 of the character-tuning set.
 *
 * · `'avatar'` — she changes her profile picture. The reward as F33 phase 13 shipped it: the worker
 *                writes `nina_avatars` with `announced_at: NULL`, and phase 10's `avatar_changed`
 *                trigger has her mention it on the next cron tick. **No chat message.**
 * · `'selfie'` — she sends him the photograph. `purpose: 'selfie'`, so the worker writes a
 *                `nina_messages` row plus a `nina_message_images` row and it arrives in the
 *                conversation like any other picture: quotable, gallery-able, unread-able.
 *
 * The field below is OPTIONAL and absent means `'avatar'`, so every promise written before this
 * phase behaves exactly as it always did.
 */
export type NinaPromiseReward = 'avatar' | 'selfie'

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
  /**
   * ── AND THE FOURTH FIELD IS R5, BY THE SAME ARGUMENT ─────────────────────────────────────────
   * Which camera pays this promise out. **Written by the `fire` verdict, not by the distiller**, so
   * it is decided once and then read: `lib/nina/promises.ts` derives it from the operator's
   * `steamy` dial at dispatch time and `resolvePromiseSlot` records it beside `jobId` and
   * `firedOn`. Re-deriving it at settle time instead would mean a dial moved between the dispatch
   * and the landing had the sweep watching the wrong table for a photograph that did arrive.
   *
   * `nina_memory_slots.value` is `jsonb`, so this costs **no migration** — the same argument the
   * three fields above make for themselves. And it is **optional**, so `mergePendingPromises`, its
   * tests and `tests/nina.memory.test.ts`'s `satisfies NinaPendingPromise` literals compile
   * untouched: a promise written before this phase simply has none, which reads correctly as
   * "the avatar reward", which is what it was.
   */
  reward?: NinaPromiseReward
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
 * **There was a `confidence` column and task #135 dropped it** (`drizzle/0011`), on the user's
 * explicit instruction to make the pipeline carry no confidence at all. What promotes a statement
 * to a standing slot is now `lib/nina/memory.ts`'s quote gate alone — the fact's own text had to
 * be a verbatim span of his message — which was always the load-bearing half of the pair.
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
 * **The shortcut registry (F36 R1/R2/R3).** A trigger he types, and the whole situation it stands
 * for. Nineteen emoji and five onomatopoeic tokens already live in `nina_memory_facts` in four
 * prose grammars, because there was nowhere else to put them; this table is that somewhere, and
 * phase 4's importer moves them. (Twenty-four at the time of the read. The ledger is LIVE and moved
 * during the analysis — a fact was deleted mid-read — so no count is hard-coded anywhere in this
 * plan set; phase 4 classifies at run time and reports what it found.)
 *
 * ── WHY THIS IS NOT A MEMORY FACT, AND WHY THAT IS STRUCTURAL RATHER THAN STYLISTIC ───────────
 * A fact is something true about the runner that Nina may state. A shortcut is a STANDING
 * DIRECTIVE she must act on. Four things go wrong when the ledger is asked to hold one, and all
 * four are visible in production right now: `MEMORY_FACT_LIMIT = 60` silently ages the oldest
 * shortcut out of every prompt; `prompts/system.ts` frames the ledger as *"colour, not
 * structure"*, which is the wrong instruction for a directive; every expansion is in every turn
 * whether or not it fired; and `ADMIN_FACT_TEXT_MAX = 400` already truncates the longest three.
 * A separate table fixes all four at once, and — the part that cannot be achieved any other way —
 * it makes a shortcut STRUCTURALLY UNREACHABLE by `lib/nina/distill.ts`, which writes facts. The
 * distiller cannot rewrite what it has no query for.
 *
 * ── `trigger` AND `match_key` ARE TWO COLUMNS, AND THE SECOND ONE IS THE KEY ──────────────────
 * `trigger` is what the admin typed and what `/admin/shortcuts` renders: `✌️`, `Plak!`, `nom nom`.
 * `match_key` is `normalizeNinaTrigger(trigger)` — NFC, `U+FE0F` removed, whitespace collapsed,
 * trimmed, lowercased — and it is what matching and the unique index use. Storing only the raw
 * trigger would mean normalising on every read of every turn AND would let `✌️` and `✌` be two
 * rows; storing only the key would show him a peace sign stripped of its variation selector in
 * his own table. `lib/nina/queries.ts` derives the key on write, in one place, so the two cannot
 * drift.
 *
 * ── `kind` IS PLAIN `text` WITH NO `.$type<>()` ───────────────────────────────────────────────
 * `nina_tuning.relationship`'s argument, verbatim, and it bites for the same reason:
 * `lib/nina/shortcuts.ts` MUST stay importable from a `'use client'` file, so it cannot import
 * this module — and typing the column would mean either importing UPWARD from `lib/db` into
 * `lib/nina` or restating `'glyph' | 'word'` here as a second definition. Untyped `text` costs
 * neither: `lib/nina/queries.ts` narrows it on read and falls back to `classifyNinaTrigger` for a
 * value it does not recognise, which is invariant 7 (nothing on the turn path throws for a
 * shortcut problem) made concrete at the boundary where a bad value would first be noticed.
 *
 * ── `uses` AND `last_used_at` ARE TELEMETRY, NOT STATE ────────────────────────────────────────
 * *"so the admin can see which codes actually fire"*. Nothing reads them on the turn path; they
 * exist so `/admin/shortcuts` can show a dead code as dead. `uses` is incremented IN SQL by
 * `bumpNinaShortcutUses`, never read-then-written, because the bump is fire-and-forget and two
 * concurrent turns are a real pair. **A bump also moves `updated_at`** — `$onUpdate` fires on
 * every drizzle UPDATE of this table — so `updated_at` means "the row last changed" and NOT "the
 * admin last edited it". Phase 3 must render `last_used_at` for telemetry and must not label
 * `updated_at` as "edited".
 *
 * ── NO `source_message_id`, NO `source`, NO `confidence` ──────────────────────────────────────
 * Every shortcut is authored by a human on `/admin/shortcuts` or lifted from the ledger by phase
 * 4's importer. There is no distilled shortcut and there never will be, so a provenance
 * discriminator would be a column with one value. Its absence is also what keeps
 * `removeNinaSession`'s memory purge (which matches on `source_message_id IN (…)`) structurally
 * unable to reach this table.
 *
 * ── THE TWO INDEXES ───────────────────────────────────────────────────────────────────────────
 *   · `nina_shortcuts_user_match_unq (user_id, match_key)` — UNIQUE, and it is the authority on
 *     "this trigger already exists". Phase 3 lets the insert fail and reports the violation as a
 *     sentence rather than running a check-then-write that is correct until two tabs race. The
 *     `shares_run_id_active_unq` argument. It is also the total order `listNinaShortcuts` sorts
 *     by, so the registry read is an index scan and not a sort.
 *   · `nina_shortcuts_user_enabled_idx (user_id, enabled)` — phase 2's every-turn read,
 *     `WHERE user_id = $1 AND enabled`.
 */
export const ninaShortcuts = pgTable(
  'nina_shortcuts',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** As the admin typed it. What the table renders; never what matching uses. */
    trigger: text('trigger').notNull(),
    /** `normalizeNinaTrigger(trigger)`. What matching and the unique index use. See the header. */
    matchKey: text('match_key').notNull(),
    /**
     * `NinaShortcutKind` from `lib/nina/shortcuts.ts` — `'glyph' | 'word'`, and it decides the
     * boundary rule: a glyph matches anywhere, a word only when not touching a letter or digit.
     * Untyped `text` on purpose; see the header.
     */
    kind: text('kind').notNull(),
    /** One line, what this code is for. `NINA_SHORTCUT_LABEL_MAX` = 80. */
    label: text('label').notNull(),
    /** The long context the trigger stands for. `NINA_SHORTCUT_EXPANSION_MAX` = 2000. */
    expansion: text('expansion').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** Telemetry. Bumped in SQL, fire-and-forget, off the turn's critical path. */
    uses: integer('uses').notNull().default(0),
    /** NULL = this code has never fired. A real answer, and the one phase 3 shows as "never". */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    /** Moves on ANY update, a usage bump included. See the header before reading it as "edited". */
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    /** Two rows for one code are impossible, not unlikely. The duplicate error IS the check. */
    uniqueIndex('nina_shortcuts_user_match_unq').on(t.userId, t.matchKey),
    /** Phase 2's every-turn read: `WHERE user_id = $1 AND enabled`. */
    index('nina_shortcuts_user_enabled_idx').on(t.userId, t.enabled),
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

export const ninaShortcutsRelations = relations(ninaShortcuts, ({ one }) => ({
  user: one(users, { fields: [ninaShortcuts.userId], references: [users.id] }),
}))

/* ============================================================================
 * The image-generation preferences. ONE ROW PER USER, and the second table in
 * this file whose columns are a UI's controls rather than a domain's facts.
 * ==========================================================================*/

export type NinaMemorySlot = typeof ninaMemorySlots.$inferSelect
export type NewNinaMemorySlot = typeof ninaMemorySlots.$inferInsert
export type NinaMemoryFact = typeof ninaMemoryFacts.$inferSelect
export type NewNinaMemoryFact = typeof ninaMemoryFacts.$inferInsert
/**
 * `NinaShortcutRow`, not `NinaShortcut` — the same suffix, and the same reason, as
 * `NinaTuningRow`. `kind` is bare `string` here because the column is untyped `text`; the narrowed
 * DTO is `NinaShortcutRecord` in `lib/nina/queries.ts`, and the structural minimum the matcher
 * needs is `NinaShortcutMatchable` in `lib/nina/shortcuts.ts`. Three names, three layers, no
 * duplication — see the table's header.
 */
export type NinaShortcutRow = typeof ninaShortcuts.$inferSelect
export type NewNinaShortcutRow = typeof ninaShortcuts.$inferInsert
export type NinaNag = typeof ninaNags.$inferSelect
export type NewNinaNag = typeof ninaNags.$inferInsert
