import { relations } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { users } from '../auth'

/** Which collection the source photo was picked from — decides which table a replace/add writes. */
export type NinaPhotoshopSourceKind = 'avatar' | 'message_image'

/**
 * `'anchor'` reuses the existing photo-anchor mechanism (`NINA_IMAGE_MODEL_IDS`): the source photo
 * is sent as `input_references` to a model that treats it as a likeness anchor for a fresh
 * generation — pose/background may drift. `'edit'` sends the same photo to a model that is
 * documented to support real image editing (the rest of the photo stays put). Same request shape
 * on the wire either way; only the offered model list differs. See `lib/nina/photoshopPresets.ts`.
 */
export type NinaPhotoshopMode = 'anchor' | 'edit'

export type NinaPhotoshopStatus = 'pending' | 'ok' | 'failed'

/** Set once the admin acts on a finished job's result. `null` while still pending review. */
export type NinaPhotoshopResolution = 'replaced' | 'added' | 'discarded'

/**
 * One photoshop attempt on one existing photo. Deliberately its own table rather than a `kind` on
 * `nina_turns`: unlike every other model call Nina makes, a successful photoshop job does NOT
 * write into `nina_avatars`/`nina_message_images` on completion — the result sits here, unresolved,
 * until the admin picks Replace, Add as new, or Cancel on the before/after screen. Folding that
 * into `nina_turns`' existing pending -> ok auto-finish state machine would mean carving an
 * exception into a state machine several other features and tests already depend on.
 */
export const ninaPhotoshopJobs = pgTable(
  'nina_photoshop_jobs',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceKind: text('source_kind').$type<NinaPhotoshopSourceKind>().notNull(),
    /** The row's id in whichever table `sourceKind` names. No FK: the two candidate tables can't
     * share one constraint, and a source row deleted mid-job must not block closing this one. */
    sourceId: text('source_id').notNull(),
    /** The source photo's `content_hash` at dispatch time, for audit — never read back. */
    sourceContentHash: text('source_content_hash'),
    mode: text('mode').$type<NinaPhotoshopMode>().notNull(),
    model: text('model').notNull(),
    /** Which preset (if any) seeded the instruction text — audit only; the text is what was sent. */
    presetKey: text('preset_key'),
    promptText: text('prompt_text').notNull(),
    status: text('status').$type<NinaPhotoshopStatus>().notNull().default('pending'),
    /** Job phase (`'queued' | 'running'`) while pending; failure kind once failed. Null on success —
     * the same overloaded-by-status convention `nina_turns.error_code` uses. */
    errorCode: text('error_code'),
    attempts: integer('attempts').notNull().default(0),
    costMicroUsd: integer('cost_micro_usd'),
    resultBlobUrl: text('result_blob_url'),
    resultPathname: text('result_pathname'),
    resultContentHash: text('result_content_hash'),
    resultWidth: integer('result_width'),
    resultHeight: integer('result_height'),
    resultBytes: integer('result_bytes'),
    resolvedAction: text('resolved_action').$type<NinaPhotoshopResolution>(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('nina_photoshop_jobs_user_created_idx').on(t.userId, t.createdAt.desc())],
)

export const ninaPhotoshopJobsRelations = relations(ninaPhotoshopJobs, ({ one }) => ({
  user: one(users, { fields: [ninaPhotoshopJobs.userId], references: [users.id] }),
}))

export type NinaPhotoshopJob = typeof ninaPhotoshopJobs.$inferSelect
export type NewNinaPhotoshopJob = typeof ninaPhotoshopJobs.$inferInsert
