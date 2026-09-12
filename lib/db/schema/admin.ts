import { relations } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './auth'

/* ============================================================================
 * App-wide settings. One row per KEY, and the POINT of the table is that a value the
 * code needs at runtime can be changed by the operator from an admin page with no
 * deploy — the same "a Vercel env edit without the deploy" shape `ninaImageDailyCap()`
 * gives the quota, for values that are decisions rather than infrastructure. `key` is
 * `text` and the vocabulary of keys is spelled where they are read; `value` is `text`
 * and every reader coerces or refuses it, so a hand-run SQL edit degrades instead of
 * breaking a turn.
 */
export const appSettings = pgTable('app_settings', {
  /** The setting's name. Lowercase snake, one row each — `text_model` is the first. */
  key: text('key').primaryKey(),
  /** The stored value. Every reader validates it against the vocabulary it owns. */
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/* ============================================================================
 * Every model call that FAILED, in full. One row per ATTEMPT — not per turn and
 * not per job, so a z.ai failure and the OpenRouter retry that also failed are
 * two rows, which is the only shape that can answer "did the fallback help".
 *
 * DELIBERATELY NOT A WIDENING OF `nina_turns`. That table is pinned by
 * `tests/db.schema.nina.test.ts` to carry NO message text and EXACTLY one index,
 * and both pins exist for good reasons stated at its declaration. A prompt and a
 * raw provider body are message text by any reading, so they live here instead.
 * The two tables answer different questions and are never joined: `nina_turns`
 * is the money/audit ledger for a whole turn, this is the diagnostic detail for
 * one attempt inside one.
 * ==========================================================================*/

/**
 * Which of Nina's three model calls failed, and the discriminator that gives
 * `/admin/error-logs` its three tabs (R2).
 *
 *   - `'text'`             — a chat or proactive reply (`lib/nina/turn.ts`)
 *   - `'multimodal'`       — a photo-understanding describe call (`lib/nina/vision.ts`)
 *   - `'image_generation'` — a selfie/photo draw (`lib/nina/imagecall.ts`)
 *
 * Plain `text` with `.$type<>()`, like every other domain in this file — see `Sex`'s note for why
 * there is no `pgEnum` anywhere here, and therefore why a fourth member would be a union edit
 * rather than a migration.
 */
export type NinaErrorCategory = 'text' | 'multimodal' | 'image_generation'

/** Tab order on `/admin/error-logs`, and the iteration order of the schema pin. One source. */
export const NINA_ERROR_CATEGORIES = ['text', 'multimodal', 'image_generation'] as const

/**
 * **One failed attempt, with enough detail to diagnose it a day later.** Written best-effort by
 * `logNinaError` (`lib/nina/errorlogs.ts`) and read only by `/admin/error-logs`.
 *
 * `full_input` is the request payload ACTUALLY SENT — for a text turn the JSON body `ninaBody()`
 * built (system + messages + tools), not the typed runner text; for a describe call the subject
 * prompt plus the instruction; for a generation `args.prompt`. The runner's own words are
 * recoverable from `nina_messages`; what the model saw is recoverable nowhere else, which is the
 * whole reason the column is here.
 *
 * `error_message` is the raw stringified cause or HTTP body, ours-not-summarised — the exact
 * opposite of `nina_turns.error_code`, which is a short internal reason like `'unavailable'`.
 * The incident this feature came from produced eleven `error_code = 'unavailable'` rows and not
 * one byte of what z.ai actually said.
 *
 * `timeout_ms` is NULLABLE because it is the ceiling configured for THAT attempt, and the three
 * paths spell it differently (`NINA_TURN_BUDGET.primary`, `NINA_DESCRIBE_TIMEOUT_MS`,
 * `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS`, …). NULL means "the caller had no single ceiling to
 * name", not "no timeout" — the admin row renders nothing rather than guessing.
 *
 * `user_id` is NULLABLE, and that is deliberate rather than lax. A failed model call is observed at
 * seams that do not always hold a runner: the text fallback client is constructed behind
 * `NinaLlmClientLike`, which carries no user, and the vision/describe path's only inputs are image
 * refs. NULL means "not attributable to one runner" — a true statement about the failure, not a
 * missing value. Making it NOT NULL would turn those writes into failed inserts, and since
 * `logNinaError` swallows its own failure by design, the loss would be invisible.
 *
 * `image_url` is the INPUT image, never an output, and NULL for `'text'`. For `'multimodal'` it
 * is the photo Nina failed to describe; for `'image_generation'` it is the reference/anchor photo
 * when one was supplied. A failed generation produces no output image at all, so linking one
 * would be linking something the server never proved exists — `planJobPhoto`'s
 * `{ kind: 'none' }` convention, one table over.
 *
 * `provider` is untyped `text`, exactly like `nina_turns.trigger` and for the same reason: the
 * vocabulary (`'zai'`, `'openrouter'`, whatever comes third) belongs to the phases that write it,
 * and this table must not become the thing they have to migrate to name a new one.
 *
 * ── ONE INDEX, AND IT IS NOT KEYED ON THE USER ───────────────────────────────────────────────
 * Every read is `/admin/error-logs` asking for "the newest N rows in this category", with no
 * per-user filter, because the admin page is not scoped to a runner. So the index is
 * `(category, created_at desc)` and there is exactly one of it — `nina_turns`' single-index
 * philosophy, applied to the read this table actually serves.
 */
export const ninaErrorLogs = pgTable(
  'nina_error_logs',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    /**
     * NULLABLE — no `.notNull()`. Whose turn it was, WHEN the failing seam knew. See the header:
     * the text fallback client and the vision describe path both observe failures with no user in
     * hand, and a NOT NULL here would silently drop those rows.
     */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').$type<NinaErrorCategory>().notNull(),
    /** `'zai'` | `'openrouter'` today. Untyped on purpose — see the header. */
    provider: text('provider').notNull(),
    /** The model id ACTUALLY ATTEMPTED, not the one configured. A fallback row names the fallback. */
    model: text('model').notNull(),
    fullInput: text('full_input').notNull(),
    errorMessage: text('error_message').notNull(),
    /** The ceiling configured for THIS attempt, in ms. NULL when the caller had none to name. */
    timeoutMs: integer('timeout_ms'),
    /** Blob URL of the INPUT image. NULL for `'text'`, and for a generation with no anchor. */
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** "the newest failures in this tab" — the only read this table has. */
    index('nina_error_logs_category_created_idx').on(t.category, t.createdAt.desc()),
  ],
)

export const ninaErrorLogsRelations = relations(ninaErrorLogs, ({ one }) => ({
  user: one(users, { fields: [ninaErrorLogs.userId], references: [users.id] }),
}))

export type AppSettingRow = typeof appSettings.$inferSelect
export type NewAppSettingRow = typeof appSettings.$inferInsert
export type NinaErrorLog = typeof ninaErrorLogs.$inferSelect
export type NewNinaErrorLog = typeof ninaErrorLogs.$inferInsert
