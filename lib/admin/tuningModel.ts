import {
  isNinaDial,
  isNinaRelationship,
  isNinaTrait,
  NINA_ADDRESS,
  NINA_DIAL_SPECS,
  NINA_TRAIT_SPECS,
  type NinaTuning,
} from '@/lib/nina/tuning'

/**
 * `/admin/nina`'s character panel, as data and pure functions — the client-safe half.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────────────────────
 * Two callers, one vocabulary. `app/admin/nina/page.tsx` and `app/admin/page.tsx` are Server
 * Components and `components/admin/CharacterPanel.tsx` is `'use client'`; a Server Component
 * cannot read a plain export out of a `'use client'` module (every export becomes a client
 * reference in the server graph), so the copy and the diffing cannot live in the panel. And
 * `lib/admin/memoryModel.ts` already established the answer for exactly this split.
 *
 * **This file imports exactly one module, `@/lib/nina/tuning`, and a test asserts that.** Values as
 * well as types, because the labels, the hints and the words all come from there — and that is
 * safe, and checked, precisely because `tuning.ts` has **zero imports of its own** (phase 1's own
 * test reads its source and fails on an `import` line, so the property is verified rather than
 * assumed). `memoryModel.ts` next door is type-imports-only because its vocabulary lives in a
 * `server-only` module; this one's does not, and re-declaring phase 1's labels here to preserve a
 * type-only rule would be the drift the file exists to prevent. The property that actually matters
 * is the same either way: loadable in a browser bundle and in a vitest `node` environment.
 *
 * ── THE READ-SIDE ADAPTATION SEAM ────────────────────────────────────────────────────────────
 * `toTuningDraft` is ONE of exactly TWO functions in this phase that know phase 1's field names
 * (`lib/admin/tuningActions.ts`'s `toTuningWrite` is the other). Everything above the seam works
 * in `TuningDraft`, whose dial values are plain `Record<string, number>` — so if phase 1 groups or
 * names its fields differently, two small functions change and no component does.
 *
 * ── THE COPY IS KEYED, NOT POSITIONAL ────────────────────────────────────────────────────────
 * `tuningCopy` falls back to `prettifyKey`, so a dial phase 1 adds still renders with a readable
 * label instead of crashing or vanishing. It renders WITHOUT A HINT, though, and
 * `tests/admin.tuning.test.ts` fails on any key in `NINA_TRAITS` or `NINA_DIALS` that has
 * no real entry below — the fallback is a safety net for a running page, never a licence to ship
 * an unlabelled dial. An unlabelled slider is a dial the operator cannot report back.
 *
 * ── THE TWO LENGTH BOUNDS ARE PHASE 1'S, AND ARE NOT RE-DECLARED HERE ────────────────────────
 * The draft of this file carried `ADMIN_TUNING_WARDROBE_MAX = 240` and
 * `ADMIN_TUNING_NOTES_MAX = 1000` against phase 1's 200 and 2000. Both were cut in reconciliation
 * and every caller imports `NINA_WARDROBE_MAX` / `NINA_NOTES_MAX` from `@/lib/nina/tuning`
 * directly. A Zod bound STRICTER than the model's coercion is the worse of the two failures: the
 * panel would refuse 210 characters of wardrobe that `coerceNinaWardrobe` would happily have
 * stored. `lib/admin/avatars.ts`'s rule, which `lib/admin/schema.ts` quotes approvingly: *"a
 * constant that is agreed rather than shared is a constant that will one day disagree."*
 */

/** What a browser edits: phase 1's row, minus the revision the database mints. */
export interface TuningDraft {
  traits: Record<string, number>
  dials: Record<string, number>
  relationship: string
  wardrobe: string
  notes: string
}

/** One control's user-facing text. The label goes beside the control; the hint goes under it. */
export interface TuningCopy {
  label: string
  hint: string
}

/**
 * ── THE COPY IS PHASE 1'S, AND THAT IS THE RECONCILED DECISION ───────────────────────────────
 * The draft of this file carried three tables of its own — eleven trait labels and hints, a dial
 * table, and five relationship labels with the address words retyped into their hints. **All three
 * are gone.** `lib/nina/tuning.ts` already carries, per key, exactly what a control needs:
 *
 *   `NINA_TRAIT_SPECS[key].label`   the panel's label, sentence case
 *   `NINA_TRAIT_SPECS[key].axis`    one line on what the dial moves — written as help text
 *   `NINA_TRAIT_SPECS[key].userSaid` the user's own sentence for the six he named, verbatim
 *   `NINA_DIAL_SPECS[key].label` / `.axis` / `.path`   the same, plus the code path it moves
 *   `NINA_ADDRESS[rel].label` / `.words`               the radio label and the words she uses
 *
 * Three reasons a second table was the wrong answer, and the third is the one that decided it:
 *
 *   1. **Its drift is invisible.** A hint that says one thing while the prompt does another is a
 *      panel that lies, and nothing fails — the operator moves a slider, reads a stale promise
 *      about what it does, and reports the wrong bug.
 *   2. **It would have shipped wrong on day one.** The draft's dial table had `verbosity` and
 *      `photo`; the landed dial set is `profanity`, `clinginess`, `photoEagerness`, `verbosity`.
 *      Two of four keys wrong, one missing, one that does not exist — and the draft's own
 *      completeness test would have failed until somebody hand-filled it from phase 1.
 *   3. **The words the user named must live in one place.** `bro`, `bestie`, `my man`, `yang`,
 *      `sayang`, `beb`, `baby` are a requirement, not copy. They are `NINA_ADDRESS[rel].words`, the
 *      prompt composes `NINA_ADDRESS[rel].addressRule`, and the panel renders `.words` — one home,
 *      two readers, no chance of the panel promising `bestie` while the prompt says something else.
 *
 * It also settles a hazard phase 2 flagged by name. `ANGER_CEILING_BY_BAND.off` is **4**, not 0:
 * there is no setting that means "she never gets angry", and the quietest band is `low`. Reading
 * anger's hint off `NINA_TRAIT_SPECS.anger.axis` — *"At 0 the ladder is untouched"* — is what keeps
 * this panel from promising an off switch that does not exist. A local table is exactly where that
 * promise would have been written.
 *
 * What stays local is genuinely local: a **hint of the panel's own**, per relationship, saying what
 * choosing it *changes about the app* (*"today's prompt explicitly forbade this; this option is
 * what repealed it"*). That is editorial about the feature rather than a description of her, and it
 * has no counterpart in `tuning.ts`. It is additive — the label and the words still come from phase
 * 1 — so it cannot contradict anything.
 */
/** `casual_friend` -> `Casual friend`. The last resort when a key has no copy of its own. */
export function prettifyKey(key: string): string {
  const words = key.split(/[_-]/).filter((word) => word.length > 0)
  if (words.length === 0) return key
  return words
    /* `charAt` rather than `word[0]`: `noUncheckedIndexedAccess` types the index access as
     * `string | undefined` even behind the `length > 0` filter above, and `charAt` is total. */
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}

/**
 * Copy for a trait or a dial, **read off phase 1's specs**. One lookup, because the panel treats
 * traits and dials identically.
 *
 * The hint is the spec's `axis` — one line on what the dial moves, which is what it was written for
 * — with the user's own sentence appended for the six traits he gave one. His words are the
 * specification for R4, so showing them beside the slider is the operator seeing the requirement
 * rather than somebody's summary of it.
 */
export function tuningCopy(key: string): TuningCopy {
  if (isNinaTrait(key)) {
    const spec = NINA_TRAIT_SPECS[key]
    return {
      label: spec.label,
      hint:
        spec.userSaid == null
          ? spec.axis
          : `${spec.axis} He asked for it like this: "${spec.userSaid}"`,
    }
  }
  if (isNinaDial(key)) {
    const spec = NINA_DIAL_SPECS[key]
    return { label: spec.label, hint: spec.axis }
  }
  /* Unreachable for any key the panel iterates, because it iterates `NINA_TRAITS` and `NINA_DIALS`.
   * Kept so a running page degrades to a readable label rather than crashing, and asserted against
   * in `tests/admin.tuning.test.ts` so it can never be how an unlabelled slider ships. */
  return { label: prettifyKey(key), hint: '' }
}

/** Whether a key is one phase 1 actually declares. The test reads this. */
export function hasTuningCopy(key: string): boolean {
  return isNinaTrait(key) || isNinaDial(key)
}

/**
 * The relationship's label and words come from `NINA_ADDRESS`; only the note about what choosing it
 * changes *about the app* is this file's own. `words` is joined rather than retyped, so the panel
 * cannot promise a word the prompt does not use.
 */
const RELATIONSHIP_NOTE: Readonly<Record<string, string>> = {
  nobody:
    'She uses his full name. Today’s prompt explicitly forbade that; this option is what repealed it.',
  casual_friend: 'His nickname — and she asks for one first if she has none.',
  sister: 'Family bluntness, and she takes liberties.',
  best_friend: 'This is the relationship she shipped with.',
  girlfriend: 'Affectionate by default, and she flirts at least as much as the flirty dial says.',
}

export function relationshipCopy(value: string): TuningCopy {
  if (!isNinaRelationship(value)) return { label: prettifyKey(value), hint: '' }
  const address = NINA_ADDRESS[value]
  const words = address.words.length > 0 ? `${address.words.join(', ')}. ` : ''
  return { label: address.label, hint: `${words}${RELATIONSHIP_NOTE[value] ?? ''}`.trim() }
}

export function hasRelationshipCopy(value: string): boolean {
  return isNinaRelationship(value)
}

/**
 * Phase 1's row -> what a browser edits. **Adaptation seam, half one of two.**
 *
 * The records are COPIED rather than aliased: the panel holds the result in `useState` and mutates
 * a draft off it, and sharing the object with a prop would make "unsaved" undetectable. It is also
 * what makes this safe against `NINA_TUNING_DEFAULTS`, which phase 1 freezes along with both of its
 * records — a draft spread off a frozen singleton would throw on the first slider move.
 */
export function toTuningDraft(tuning: NinaTuning): TuningDraft {
  return {
    traits: { ...tuning.traits },
    dials: { ...tuning.dials },
    relationship: tuning.relationship,
    wardrobe: tuning.wardrobe,
    notes: tuning.notes,
  }
}

/**
 * Which fields differ, as stable dotted paths (`traits.anger`, `dials.photoEagerness`,
 * `relationship`, `wardrobe`, `notes`).
 *
 * One function serves three jobs, which is why it returns names instead of a boolean: the summary
 * line counts them, each control asks whether its own path is in the set, and `tuningDraftEquals`
 * is `length === 0`. Sorted, so a test can assert the list rather than a set.
 *
 * The key union is taken from BOTH sides, so a key present in one and absent in the other counts
 * as a difference rather than being silently skipped.
 */
export function changedTuningFields(next: TuningDraft, saved: TuningDraft): string[] {
  const changed: string[] = []

  for (const key of Object.keys({ ...saved.traits, ...next.traits }).sort()) {
    if (next.traits[key] !== saved.traits[key]) changed.push(`traits.${key}`)
  }
  for (const key of Object.keys({ ...saved.dials, ...next.dials }).sort()) {
    if (next.dials[key] !== saved.dials[key]) changed.push(`dials.${key}`)
  }
  if (next.relationship !== saved.relationship) changed.push('relationship')
  if (next.wardrobe !== saved.wardrobe) changed.push('wardrobe')
  if (next.notes !== saved.notes) changed.push('notes')

  return changed
}

export function tuningDraftEquals(a: TuningDraft, b: TuningDraft): boolean {
  return changedTuningFields(a, b).length === 0
}

export interface LoudDial {
  key: string
  value: number
  /** Distance from the shipping default. */
  delta: number
}

/**
 * The dials furthest from their defaults, loudest first — what `/admin`'s hub card prints.
 *
 * **Distance from default, not highest value.** Phase 1's defaults are deliberately non-uniform —
 * six traits ship at 0, `profanity` at 30, the other eight at 50 — so "highest" would print a dial
 * nobody moved and hide the one that changed her. Invariant 2 makes the default the meaningful zero
 * point: a dial at its default contributes nothing to her prompt that was not already there.
 *
 * Ties break on the key so the card does not reshuffle between two renders of the same row.
 */
export function loudestDials(draft: TuningDraft, defaults: TuningDraft, limit = 3): LoudDial[] {
  const loud: LoudDial[] = []

  for (const [key, value] of Object.entries(draft.traits)) {
    const delta = Math.abs(value - (defaults.traits[key] ?? 0))
    if (delta > 0) loud.push({ key, value, delta })
  }
  for (const [key, value] of Object.entries(draft.dials)) {
    const delta = Math.abs(value - (defaults.dials[key] ?? 0))
    if (delta > 0) loud.push({ key, value, delta })
  }

  loud.sort((a, b) => b.delta - a.delta || a.key.localeCompare(b.key))
  return loud.slice(0, limit)
}
