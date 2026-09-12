import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTuning, type NinaTuningRow } from '@/lib/db/schema'
import { coerceNinaTuning, NINA_TUNING_DEFAULTS, type NinaTuning } from '@/lib/nina/tuning'

/**
 * Split from `lib/nina/queries.ts` on 2026-09-12: this file carries that barrel's §10
 * "The character tuning — F35 R1/R2/R3", moved byte-identical; `lib/nina/queries.ts` remains
 * the public barrel and re-exports everything here.
 *
 * The flat name `lib/nina/tuning.ts` is the MODEL layer — the vocabulary and coercion, zero
 * imports, client-safe. This is its persistence module; the mirror naming is deliberate.
 */
/* ============================================================================
 * §10 The character tuning — F35 R1/R2/R3
 * ==========================================================================*/

/**
 * **The one place the flat row and the nested model meet.** `lib/db/schema.ts` spells
 * **thirty-seven** snake_case columns; `lib/nina/tuning.ts` spells `traits.anger` and
 * `dials.photoEagerness`. The three-layer boundary this file's own header describes for
 * `nina_messages.text` -> `body`, one table over: two spellings, ONE translation point, reviewable
 * in one diff.
 *
 * It ends in `coerceNinaTuning`, so a row hand-edited in `psql` to `anger = 900` reaches the prompt
 * as 100 rather than as a band index of 45.
 */
function tuningFromRow(row: NinaTuningRow): NinaTuning {
  return coerceNinaTuning({
    relationship: row.relationship,
    traits: {
      anger: row.anger,
      chill: row.chill,
      sad: row.sad,
      flirty: row.flirty,
      steamy: row.steamy,
      wise: row.wise,
      annoying: row.annoying,
      funny: row.funny,
      happy: row.happy,
      anxious: row.anxious,
      concerned: row.concerned,
      horny: row.horny,
    },
    dials: {
      profanity: row.profanity,
      clinginess: row.clinginess,
      photoEagerness: row.photoEagerness,
      verbosity: row.verbosity,
    },
    /* R4's toggles. Every one of these is `boolean | null`, and a NULL is a row written before the
     * columns existed — `coerceNinaEnabled` reads anything that is not literally `false` as on, so
     * an existing production row arrives here all-enabled with no data migration behind it. */
    enabled: {
      relationship: row.relationshipEnabled,
      anger: row.angerEnabled,
      chill: row.chillEnabled,
      sad: row.sadEnabled,
      flirty: row.flirtyEnabled,
      steamy: row.steamyEnabled,
      wise: row.wiseEnabled,
      annoying: row.annoyingEnabled,
      funny: row.funnyEnabled,
      happy: row.happyEnabled,
      anxious: row.anxiousEnabled,
      concerned: row.concernedEnabled,
      horny: row.hornyEnabled,
      profanity: row.profanityEnabled,
      clinginess: row.clinginessEnabled,
      photoEagerness: row.photoEagernessEnabled,
      verbosity: row.verbosityEnabled,
    },
    notes: row.notes,
  })
}

/**
 * The other direction: the nested model back into the flat columns. The SAME object is both the
 * INSERT values and the `ON CONFLICT` set, so a save writes every column whether the row is new or
 * not — there is no partial row to write and none to smuggle in.
 */
function tuningToColumns(tuning: NinaTuning) {
  return {
    relationship: tuning.relationship,
    anger: tuning.traits.anger,
    chill: tuning.traits.chill,
    sad: tuning.traits.sad,
    flirty: tuning.traits.flirty,
    steamy: tuning.traits.steamy,
    wise: tuning.traits.wise,
    annoying: tuning.traits.annoying,
    funny: tuning.traits.funny,
    happy: tuning.traits.happy,
    anxious: tuning.traits.anxious,
    concerned: tuning.traits.concerned,
    horny: tuning.traits.horny,
    profanity: tuning.dials.profanity,
    clinginess: tuning.dials.clinginess,
    photoEagerness: tuning.dials.photoEagerness,
    verbosity: tuning.dials.verbosity,
    /* R4. The RAW score above and the RAW flag here — this is the store, and switching a dial off
     * must never lose the number it was parked at. The gate that substitutes `defaultScore` lives
     * on the PROMPT side (`ninaTraitScore` / `ninaDialScore`), which is the whole point of a toggle
     * as opposed to dragging the slider back. */
    relationshipEnabled: tuning.enabled.relationship,
    angerEnabled: tuning.enabled.anger,
    chillEnabled: tuning.enabled.chill,
    sadEnabled: tuning.enabled.sad,
    flirtyEnabled: tuning.enabled.flirty,
    steamyEnabled: tuning.enabled.steamy,
    wiseEnabled: tuning.enabled.wise,
    annoyingEnabled: tuning.enabled.annoying,
    funnyEnabled: tuning.enabled.funny,
    happyEnabled: tuning.enabled.happy,
    anxiousEnabled: tuning.enabled.anxious,
    concernedEnabled: tuning.enabled.concerned,
    hornyEnabled: tuning.enabled.horny,
    profanityEnabled: tuning.enabled.profanity,
    clinginessEnabled: tuning.enabled.clinginess,
    photoEagernessEnabled: tuning.enabled.photoEagerness,
    verbosityEnabled: tuning.enabled.verbosity,
    notes: tuning.notes,
  }
}

/**
 * **Her character, right now. Never null.**
 *
 * A user with no row gets `NINA_TUNING_DEFAULTS`, and that is the whole design: it is what makes
 * every downstream caller unconditional — no `?? defaults` at four call sites, no "is she tuned
 * yet" branch in `turn.ts`, and no way for a first-run user to get a prompt with holes in it.
 * `NINA_TUNING_DEFAULTS` is frozen, so the shared object cannot be mutated by a caller that
 * receives it.
 *
 * Read live on every turn with no cache, like everything else on this path.
 * `memoryActions.ts` under `lib/admin/` records the consequence: a committed row is in her next
 * prompt with no invalidation step at all, which is what makes R1's slider immediate. (Directory
 * split off the filename deliberately — see `lib/nina/tuning.ts`'s header: `tests/admin.memory.
 * test.ts` proves the boundary by forbidding the joined path as a substring in every file here.)
 *
 * `SELECT *` rather than a column list, and this is the one place in the file where that is right:
 * the table is one row of twenty columns and every one of them is wanted, so a list would be
 * twenty lines that can only ever be wrong.
 */
export async function readNinaTuning(userId: string): Promise<NinaTuning> {
  const rows = await db.select().from(ninaTuning).where(eq(ninaTuning.userId, userId)).limit(1)
  const row = rows[0]
  return row ? tuningFromRow(row) : NINA_TUNING_DEFAULTS
}

/**
 * **One save, not seventeen** (plan invariant 11). Upsert on `user_id` and return what was stored
 * — one statement, so two tabs racing is last-write-wins on whole rows rather than a read-then-write
 * that can lose the newer one.
 *
 * ── IT COERCES BEFORE IT WRITES ───────────────────────────────────────────────────────────────
 * `coerceNinaTuning` runs here as well as in phase 5's Zod boundary, on purpose. Zod's job is a
 * good error message for a human at a form; this is the store defending its own invariants against
 * every other caller — a script, a test, a future migration. A row that cannot be read back as a
 * valid `NinaTuning` never gets written in the first place.
 *
 * ── RESETTING TO DEFAULTS IS A WRITE, NOT A DELETE ────────────────────────────────────────────
 * Phase 5's "reset" calls this with the defaults, and a row of defaults and NO row read identically
 * (`readNinaTuning` returns `NINA_TUNING_DEFAULTS` for a user with no row, and `coerceNinaTuning`
 * maps a defaults row back to those same values), so deleting would be a second code path answering
 * a question this one write already answers with the one writer this table has.
 */
export async function writeNinaTuning(userId: string, tuning: NinaTuning): Promise<NinaTuning> {
  const safe = coerceNinaTuning(tuning)
  const columns = tuningToColumns(safe)

  const rows = await db
    .insert(ninaTuning)
    .values({ userId, ...columns })
    .onConflictDoUpdate({
      target: ninaTuning.userId,
      set: { ...columns, updatedAt: new Date() },
    })
    .returning()

  const row = rows[0]
  /* `.returning()` on an upsert always yields the row, so this is unreachable in practice — but
   * this file returns a usable answer rather than throwing, everywhere, and the defaults are the
   * usable answer. See the header: "these functions return null, [] or false rather than
   * throwing". */
  return row ? tuningFromRow(row) : NINA_TUNING_DEFAULTS
}
