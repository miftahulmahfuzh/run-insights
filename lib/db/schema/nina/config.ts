import { relations } from 'drizzle-orm'
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from '../auth'
/**
 * **Who Nina is, as data the operator can change without a commit (F35 R1/R2/R3).** Twelve trait
 * intensities, a relationship, four behaviour dials, seventeen enable flags and a notes field —
 * seventeen integers, seventeen booleans and two strings. `lib/nina/tuning.ts` owns the
 * vocabulary, the domains and the defaults; this table stores one row of it per user and nothing
 * else.
 *
 * ── WHY COLUMNS AND NOT ONE `jsonb` BLOB ──────────────────────────────────────────────────────
 * `nina_memory_slots.value` is `jsonb` because one column had to hold both a short phrase and a
 * list of records with deadlines. Nothing like that is true here: this is a fixed set of integers
 * with a fixed domain, which is what a column is for, and three arguments settle it.
 *
 *   1. **A misspelt key in a blob is indistinguishable from an unset one**, and
 *      `coerceNinaTuning` would return that key's default — which is *today's Nina*. So the
 *      failure mode of a typo would be "the slider silently does nothing", the one failure the
 *      compatibility contract makes invisible. A column named `flirtty` fails at `db:generate`.
 *   2. **The panel is a form over a fixed set of controls, not an extensible document.** A
 *      sixteenth dial should cost a reviewed `ALTER TABLE` in an `0005_*` migration. That price is
 *      the feature, not the bug: R3's discipline is that a dial must have a code path behind it,
 *      and a migration is where somebody notices it does not.
 *   3. `"what was she set to on 4 Sep"` wants columns, not `value->>'anger'`.
 *
 * ── NO SQL DEFAULTS, AND THAT IS THE POINT ────────────────────────────────────────────────────
 * Every score column is `NOT NULL` with **no** `DEFAULT`. `NINA_TUNING_DEFAULTS` in
 * `lib/nina/tuning.ts` is the compatibility contract — the setting that reproduces the Nina who
 * ships — and a `DEFAULT 50` here would be a second copy of it in a second language, drifting
 * silently. Instead:
 *
 *   · **no row means the defaults.** `readNinaTuning` returns `NINA_TUNING_DEFAULTS` for a user
 *     with no row, which is what makes every downstream caller unconditional.
 *   · `writeNinaTuning` is the only writer and always supplies every column, because it takes a
 *     whole `NinaTuning`. One save, not sixteen (plan invariant 11).
 *
 * ── `relationship` IS PLAIN `text` WITH NO `.$type<>()`, DELIBERATELY ─────────────────────────
 * The `nina_turns.trigger` argument, verbatim: *"the vocabulary belongs to phase 10, and this
 * table must not become the thing phase 10 has to migrate to add a fifth trigger."* Here it also
 * buys something stronger. `lib/nina/tuning.ts` MUST stay importable from a `'use client'` file,
 * so it cannot import this module — and typing the column would mean either importing UPWARD from
 * `lib/db` into `lib/nina` or restating the five-value union here as a second definition.
 * Untyped `text` costs neither: `coerceNinaRelationship` is where an unknown value degrades to the
 * default, and `tests/db.schema.nina.test.ts` asserts the sixteen score column names against
 * `NINA_TRAITS` and `NINA_DIALS` so the two spellings cannot drift.
 *
 * ── `user_id` IS THE PRIMARY KEY ──────────────────────────────────────────────────────────────
 * One row per user, so `user_id` alone is the natural key and there is no second fact to hang a
 * surrogate id on — the `nina_nags` / `nina_folders` idiom with a one-column key instead of two.
 * It is also what lets `writeNinaTuning` be a single `ON CONFLICT DO UPDATE` upsert of the whole
 * row, instead of a read-then-write that is correct until two tabs race.
 */
export const ninaTuning = pgTable('nina_tuning', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /**
   * `NinaRelationship` from `lib/nina/tuning.ts` — one of `'nobody' | 'casual_friend' | 'sister' |
   * 'best_friend' | 'girlfriend' | 'instructor'`. Untyped `text` on purpose; see the header.
   */
  relationship: text('relationship').notNull(),

  /* The twelve traits — R1's eleven plus R3's `horny` — in the order the user wrote them.
   * Integer percent, 0-100, the
   * smallest-sensible-unit rule (roadmap D5) applied to an intensity —
   * `nina_model_calls.cost_micro_usd` is the precedent (it was `nina_memory_facts.confidence`
   * until task #135 dropped that column). The domain is enforced by `clampNinaScore`, not by a
   * CHECK: a
   * CHECK would make widening the scale a migration, and a value outside it is a bug in one
   * writer rather than a state the reader cannot survive. */
  /** 0 = the nag ladder is untouched. Above 0 = the lowest rung she may occupy. */
  anger: integer('anger').notNull(),
  /** How little rattles her. */
  chill: integer('chill').notNull(),
  /** How much of her own low mood shows. */
  sad: integer('sad').notNull(),
  /** How much she flirts unprompted. */
  flirty: integer('flirty').notNull(),
  /** How explicit she is willing to be. The ceiling is the image provider's, never ours. */
  steamy: integer('steamy').notNull(),
  /** How much sports-science mechanism she volunteers. */
  wise: integer('wise').notNull(),
  /** How much of a pest she is. Persistence, not volume — volume is `anger`. */
  annoying: integer('annoying').notNull(),
  /** What kind of funny: deadpan at the default, jokes and teka-teki at the top. */
  funny: integer('funny').notNull(),
  /** Her baseline brightness. */
  happy: integer('happy').notNull(),
  /** How much she worries about HERSELF out loud. */
  anxious: integer('anxious').notNull(),
  /** How much she asks after HIM. Asking, not explaining — explaining is `wise`. */
  concerned: integer('concerned').notNull(),
  /**
   * R3's twelfth trait. How sexually forward she is — whether SHE takes it there, how graphic she
   * is when she does, and how much she varies the scene. Distinct from `flirty` (teasing) and from
   * `steamy` (how explicit she will go once HE has). **The ceiling is the model's, never ours** —
   * the same sentence `steamy` above carries, and it is the whole of this app's policy on the
   * subject: no refusal-detection and no re-softening retry anywhere in `lib/nina/` or `lib/llm/`.
   */
  horny: integer('horny').notNull(),

  /* The four R3 dials. Each one moves a named line of shipping code, recorded in
   * `NINA_DIAL_SPECS[key].path`; a dial with no such line was rejected rather than stored. */
  /** How freely she swears. Moves the `anjir` and `bego` fences in `JAKARTA_SLANG`. */
  profanity: integer('profanity').notNull(),
  /** How soon she speaks first. Moves `proactive.ts`'s three silence thresholds. */
  clinginess: integer('clinginess').notNull(),
  /** How readily she takes and offers a photograph. NOT the daily money cap. */
  photoEagerness: integer('photo_eagerness').notNull(),
  /** How much she says per turn. Moves `SEND_TOOL.bubbles` and `OUTPUT_RULE`. */
  verbosity: integer('verbosity').notNull(),

  /**
   * Free text appended verbatim to the system prompt (`NINA_NOTES_MAX` = 2000). The escape hatch
   * for something the operator wants that no dial expresses. `''` = nothing appended.
   *
   * ── THERE WAS A `wardrobe` COLUMN HERE, AND F41 R3 DROPPED IT ───────────────────────────────
   * *"remove Wardrobe field in /admin/personality (this new feature is more detailed version of
   * it)."* One line of operator text describing what she is wearing lived beside `notes` here,
   * baked into the image prompt at dispatch time. It is `nina_image_prefs.wardrobe` now, beside the
   * venue, the time, the prompt length and the focus set — every other parameter of the same
   * photograph. `notes` stayed because it is a SYSTEM-PROMPT field and always was: the two were
   * neighbours in this table but never on the same side of the camera.
   *
   * The drop was safe rather than lucky: the migration that created `nina_image_prefs` copied every
   * non-empty `nina_tuning.wardrobe` into it BEFORE this column was dropped, so the value survives
   * the schema change. Restoring it is re-adding the column and copying back.
   */
  notes: text('notes').notNull(),

  /**
   * ── R4's PER-PARAMETER ON/OFF SWITCH, ONE COLUMN PER PARAMETER ──────────────────────────────
   * *"we need an on/off toggle for each parameter, so we can exclude some parameters to make prompt
   * more accurate."* `lib/nina/tuning.ts`'s `NINA_TUNING_KEYS` owns the vocabulary; these are the
   * seventeen booleans behind it, in the same order as the score columns above.
   *
   * **Columns and not one `jsonb` map**, for the three reasons this table's header already gives,
   * and the first one bites harder here than it does for the scores: a misspelt key in a blob is
   * indistinguishable from an unset one, `coerceNinaEnabled` reads an unset key as `true`, and the
   * failure would therefore be *a toggle that silently does nothing* — the one failure R4 cannot
   * survive. A column named `flirtty_enabled` fails at `db:generate`, and drizzle's insert type
   * makes `tuningToColumns` a compile error if it forgets one it declares.
   *
   * ── NULLABLE, WITH NO DEFAULT, AND THAT IS THE BACKFILL ─────────────────────────────────────
   * NULLABLE with no default, and NULL means one thing only — **a row written before the toggles
   * existed**. `coerceNinaEnabled` reads anything that is not literally `false` as enabled, so an
   * existing production row is all-on the moment the migration lands, with no `UPDATE` and no
   * data step. A `DEFAULT true` would have been the second copy of `NINA_ENABLED_DEFAULTS` in a
   * second language that this table's header forbids. `writeNinaTuning` supplies all seventeen on
   * every save, so NULL never appears in a row this app has written.
   */
  relationshipEnabled: boolean('relationship_enabled'),
  angerEnabled: boolean('anger_enabled'),
  chillEnabled: boolean('chill_enabled'),
  sadEnabled: boolean('sad_enabled'),
  flirtyEnabled: boolean('flirty_enabled'),
  steamyEnabled: boolean('steamy_enabled'),
  wiseEnabled: boolean('wise_enabled'),
  annoyingEnabled: boolean('annoying_enabled'),
  funnyEnabled: boolean('funny_enabled'),
  happyEnabled: boolean('happy_enabled'),
  anxiousEnabled: boolean('anxious_enabled'),
  concernedEnabled: boolean('concerned_enabled'),
  hornyEnabled: boolean('horny_enabled'),
  profanityEnabled: boolean('profanity_enabled'),
  clinginessEnabled: boolean('clinginess_enabled'),
  photoEagernessEnabled: boolean('photo_eagerness_enabled'),
  verbosityEnabled: boolean('verbosity_enabled'),

  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
export const ninaTuningRelations = relations(ninaTuning, ({ one }) => ({
  user: one(users, { fields: [ninaTuning.userId], references: [users.id] }),
}))

/**
 * **How she is photographed, as data the operator can change without a commit (R4-R10).** One
 * slider, six emphasis flags, four lines of free text and one chosen photograph.
 * `lib/nina/imageprefs.ts` owns the vocabulary, the domains and the defaults; this table stores one
 * row of it per user and nothing else.
 *
 * It is `nina_tuning`'s sibling and NOT its extension, and the split is the plan's own decision:
 * `nina_tuning` is WHO SHE IS and reaches the system prompt on every turn; this is HOW SHE IS
 * PHOTOGRAPHED and reaches the image prompt only when a generation happens. `nina_tuning.wardrobe`
 * moves here (phase 7 drops the column) because two wardrobes silently competing is the one outcome
 * *"remove Wardrobe field in /admin/personality"* cannot mean.
 *
 * ── WHY COLUMNS AND NOT ONE `jsonb` BLOB ──────────────────────────────────────────────────────
 * `nina_tuning`'s header argues it at length and every word of it applies here, with the first
 * argument biting hardest: **a misspelt key in a blob is indistinguishable from an unset one**,
 * `coerceNinaImageFocus` reads an unset key as `false`, and the failure mode would therefore be *a
 * checkbox that silently does nothing* — the one failure a control panel cannot survive. A column
 * named `focus_bobs` fails at `db:generate`.
 *
 * ── THE FOCUS FLAGS ARE `NOT NULL`, WHICH IS THE OPPOSITE OF `nina_tuning`'s `*_enabled` ──────
 * Those columns are nullable with no default because NULL there means one thing only — *a row
 * written before the toggles existed* — and `coerceNinaEnabled` turns that into "on" with no data
 * step behind it. **There is no such row here.** This table is created in one migration with all six
 * columns present, so there is no history for NULL to describe, and `writeNinaImagePrefs` supplies
 * all six on every save. `NOT NULL` also makes drizzle's insert type refuse a mapper that forgets
 * one, which for a nullable column it cannot do. The one data step that inserts rows (see step 3)
 * supplies all six explicitly.
 *
 * ── NO SQL DEFAULTS, AND THAT IS THE POINT ────────────────────────────────────────────────────
 * `NINA_IMAGE_PREFS_DEFAULTS` in `lib/nina/imageprefs.ts` is the one definition of "unset", and a
 * `DEFAULT 50` here would be a second copy of it in a second language, drifting silently. Instead:
 *
 *   · **no row means the defaults.** `readNinaImagePrefs` returns `NINA_IMAGE_PREFS_DEFAULTS` for a
 *     user with no row, which is what makes every downstream caller unconditional.
 *   · `writeNinaImagePrefs` is the only writer and always supplies every column, because it takes a
 *     whole `NinaImagePrefsWrite`. One save, not fifteen (plan invariant 7).
 *
 * The one exception is `updated_at`, which is a timestamp and not part of the contract — exactly the
 * exception `nina_tuning` carves out and `tests/db.schema.nina.test.ts` already asserts.
 *
 * ── `reference_source` / `reference_id` HAVE NO FOREIGN KEY, AND CANNOT HAVE ONE ──────────────
 * The chosen photograph lives in `nina_avatars` (`'album'`) or in `nina_message_images`
 * (`'chat'`), and no single foreign key can point at one of two tables. Nor would one be wanted: a
 * cascade would delete a whole preferences row because one photograph was deleted, and a `SET NULL`
 * would need a nullable column and still could not name its parent. So the pair is untyped `text`,
 * `resolveNinaPhotoReference` in `lib/nina/queries.ts` is where a dangling id becomes `null`, and a
 * generation with an unresolvable reference degrades to unanchored. `reference_source` is plain
 * `text` with no `.$type<>()` for `nina_turns.trigger`'s reason — and for the stronger one
 * `nina_tuning.relationship` records: `lib/nina/imageprefs.ts` must stay importable from a
 * `'use client'` file, so it cannot import this module, and typing the column would mean either
 * importing UPWARD from `lib/db` into `lib/nina` or restating the three-value union here as a
 * second definition.
 *
 * ── `time_of_day` IS THE ONE SPELLING DIFFERENCE ──────────────────────────────────────────────
 * The model key is `time`, which is the user's own label for the field. The column is
 * `time_of_day`, because a bare `time` column is a Postgres type name that every hand-written
 * statement would have to quote — including the data step in this table's own migration.
 * `photo_eagerness` versus `photoEagerness` is the precedent for one spelling difference, and
 * `lib/nina/queries.ts` is the one place the two meet.
 *
 * ── `user_id` IS THE PRIMARY KEY ──────────────────────────────────────────────────────────────
 * One row per user, so `user_id` alone is the natural key. It is also what lets
 * `writeNinaImagePrefs` be a single `ON CONFLICT DO UPDATE` — one statement per save — instead of
 * a read-then-write that is correct until two tabs race.
 */
export const ninaImagePrefs = pgTable('nina_image_prefs', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),

  /**
   * R4. *"prompt length (sliding bar): the longer the prompt, the more detailed the prompt would
   * be"*. An integer percent 0-100, read through the repo's five bands; each band selects a rung of
   * `NINA_PROMPT_LENGTH_RUNGS`. The domain is enforced by `clampNinaImageScore`, not by a CHECK —
   * `nina_tuning`'s argument: a CHECK would make widening the scale a migration, and a value outside
   * it is a bug in one writer rather than a state the reader cannot survive.
   */
  promptLength: integer('prompt_length').notNull(),

  /* R5's six, in the order the user wrote them: *"focus on (select multi options): face, skin, big
   * boobs, bubble butt, big thighs, very long calves"*. EMPHASIS, never inclusion — the body canon
   * is unconditional prompt text (plan invariant 4), so all six false is the default and a prompt
   * built from it still names all four body facts. `lib/nina/imageprefs.ts`'s
   * `NINA_IMAGE_FOCUS_KEYS` owns the vocabulary; these are the six booleans behind it. */
  /** Her face. The one the user said he does not care about — kept because he may change his mind. */
  focusFace: boolean('focus_face').notNull(),
  /** Skin texture, sheen, sweat. */
  focusSkin: boolean('focus_skin').notNull(),
  /** *"big boobs"*. */
  focusBoobs: boolean('focus_boobs').notNull(),
  /** *"bubble butt"*. */
  focusButt: boolean('focus_butt').notNull(),
  /** *"big thighs"*. */
  focusThighs: boolean('focus_thighs').notNull(),
  /** *"very long calves"*. */
  focusCalves: boolean('focus_calves').notNull(),

  /**
   * R6. One line describing what she is wearing (`NINA_IMAGE_WARDROBE_MAX` = 200). **This is
   * `nina_tuning.wardrobe`'s new home** and this migration's data step copies every existing value
   * into it; phase 7 drops the old column afterwards. `''` means "no override" and the canon's own
   * outfit is used. NOT NULL with `''` as the empty value rather than NULL, because "no override"
   * and "not set" are the same fact.
   */
  wardrobe: text('wardrobe').notNull(),
  /** R7. Where (`NINA_IMAGE_VENUE_MAX` = 200). *"Kuta streets in Bali"*. `''` = the canon's own. */
  venue: text('venue').notNull(),
  /**
   * R8. When, and what the weather is doing (`NINA_IMAGE_TIME_MAX` = 120). *"sunny day, rainy
   * night, cold afternoon"*. Named `time_of_day` and not `time`; see the header. `''` = nothing said.
   */
  timeOfDay: text('time_of_day').notNull(),
  /**
   * R9. The escape hatch (`NINA_IMAGE_NOTES_MAX` = 600). *"nina is full of sweat"*. A different
   * field from `nina_tuning.notes`, which is a SYSTEM-prompt field and stays exactly where it is;
   * this one reaches the image prompt only. `''` = nothing appended.
   */
  notes: text('notes').notNull(),

  /**
   * The editable prompt template (the 2026-09-10 ask; `NINA_PROMPT_TEMPLATE_MAX` = 2000). A shell
   * of `{{block}}` placeholders the operator may reorder, drop or add prose to — see §6 of
   * `lib/nina/imageprefs.ts` for the vocabulary and the validator that guards both the save and
   * the read. `''` = the shipping default shell, and a stored value that fails the validator
   * READS as `''` (`coerceNinaImageTemplate`), so a hand-run SQL update can never ship a broken
   * prompt. NOT NULL with `''` as the empty value, like every other text column in this table.
   */
  promptTemplate: text('prompt_template').notNull(),

  /**
   * §8's camera (the 2026-09-10 ask): `'qwen/qwen-image-3' | 'qwen/qwen-image-3-pro'`. The
   * vocabulary and its coercion live in `lib/nina/imageprefs.ts` (`NINA_IMAGE_MODEL_IDS` /
   * `coerceNinaImageModel`) — no CHECK, for this table's standing argument: an unknown id is a
   * bug in one writer, and the reader coerces it to the measured default rather than failing a
   * generation. The id rides the job's `args.model` from here, so a RETRY reproduces on the same
   * camera.
   */
  model: text('model').notNull(),

  /**
   * R10, the storage half. Which set the chosen photograph came from — `'none' | 'album' | 'chat'`
   * from `lib/nina/imageprefs.ts`. `'none'` is the empty value; there is no NULL. Untyped `text`
   * and no FK; see the header.
   */
  referenceSource: text('reference_source').notNull(),
  /**
   * The chosen photograph's id in that set: `nina_avatars.id` for `'album'`,
   * `nina_message_images.id` for `'chat'`. `''` exactly when `reference_source = 'none'`. **No
   * foreign key** — two possible parents, and see the header for why a cascade would be wrong even
   * if one were expressible. A deleted photograph leaves an id that
   * `resolveNinaPhotoReference` reads as `null`, and the generation degrades to unanchored.
   */
  referenceId: text('reference_id').notNull(),

  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
export const ninaImagePrefsRelations = relations(ninaImagePrefs, ({ one }) => ({
  user: one(users, { fields: [ninaImagePrefs.userId], references: [users.id] }),
}))

/**
 * `NinaTuningRow`, not `NinaTuning` — the latter is the MODEL type in `lib/nina/tuning.ts`, which
 * is what every consumer in the app actually holds (nested `traits`/`dials`, coerced, with the
 * relationship as a union). The row is the flat, unvalidated storage shape and only
 * `lib/nina/queries.ts` should ever name it. Same suffix, same reason, as `PushSubscriptionRow`.
 */
export type NinaTuningRow = typeof ninaTuning.$inferSelect
export type NewNinaTuningRow = typeof ninaTuning.$inferInsert
/**
 * `NinaImagePrefsRow`, not `NinaImagePrefs` — the latter is the MODEL type in
 * `lib/nina/imageprefs.ts`, which is what every consumer actually holds (a nested `focus` record, a
 * nested `reference`, coerced). The row is the flat, unvalidated storage shape and only
 * `lib/nina/queries.ts` should ever name it. Same suffix, same reason, as `NinaTuningRow`.
 */
export type NinaImagePrefsRow = typeof ninaImagePrefs.$inferSelect
export type NewNinaImagePrefsRow = typeof ninaImagePrefs.$inferInsert
