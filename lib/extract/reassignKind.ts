import { MAX_IMAGES, SCREEN_KINDS, type ScreenKind } from './constants'

/**
 * Give one screenshot a different kind, and keep the kinds distinct — by SWAPPING, not subtracting.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
 * F04's picker kept the kinds distinct by *disabling* every kind another tile already held. The
 * arithmetic ran out: there were exactly as many kinds as slots (three), so on a full three-screen
 * upload every kind was claimed, every non-selected button was disabled, and the control froze
 * solid at exactly the moment a mislabel is most likely. A heart-rate screen arrived labelled
 * Summary and there was no way back. See docs/plans/archive/F16b-upload-kind-swap.md §1.
 *
 * Since the Workout Details kind landed there are four kinds for three slots, so a free kind always
 * exists and subtraction would no longer freeze outright — but swapping stays the right rule for the
 * reason that made it right in the first place: two screens are mislabelled *as each other*, and one
 * tap fixes both. Swapping keeps the invariant true after every single tap, so there is never an
 * invalid state to render, explain, or dig back out of.
 *
 * ── WHY IT IS HERE AND NOT IN THE COMPONENT ─────────────────────────────────────────────────
 * `vitest.config.ts` runs `environment: 'node'` with an `include` matching `*.test.ts` only. Logic
 * living inside a `.tsx` component is logic this repo cannot unit-test. The rule is small, total,
 * and worth proving exhaustively, so it lives in `lib/`.
 *
 * Kept out of `constants.ts` deliberately: that file is pure-on-purpose and stays constants-only.
 */

/** The shape this operates on — `Tile` in the picker, and nothing else needed. */
export interface KindHolder {
  id: string
  kind: ScreenKind
}

interface Reassignment<T extends KindHolder> {
  /** The whole set, in input order. A fresh array; elements are only cloned where kind changed. */
  entries: T[]
  /**
   * Exactly the ids whose kind moved — one for a free kind, two for a swap, none for a no-op.
   *
   * This is the load-bearing half of the return. The picker has to re-compress and re-PUT every
   * tile it changed (the kind is baked into the signed upload token — see `app/api/upload/route.ts`
   * and plan §3), and reading it off here is what stops the caller diffing two arrays to find out.
   */
  changed: readonly string[]
}

/**
 * Assign `next` to `targetId`, handing that tile's old kind to whoever held `next`.
 *
 * | Situation                      | `entries`          | `changed`      |
 * |--------------------------------|--------------------|----------------|
 * | `targetId` not present         | input, unchanged   | `[]`           |
 * | target already holds `next`    | input, unchanged   | `[]`           |
 * | no other entry holds `next`    | target takes it    | `[targetId]`   |
 * | another entry holds `next`     | the two exchange   | both ids       |
 *
 * Never mutates its input, and never returns a set containing a duplicate kind.
 *
 * The holder lookup is a `find`, not a filter-all: the invariant is maintained by construction —
 * `onPick` only ever assigns a kind no tile holds (there is always one free, by the inequality
 * asserted below), and this function preserves distinctness — so a second holder cannot exist. A
 * loop here would be dead code pretending to be a safety net.
 */
export function reassignKind<T extends KindHolder>(
  entries: readonly T[],
  targetId: string,
  next: ScreenKind,
): Reassignment<T> {
  const target = entries.find((e) => e.id === targetId)
  if (!target || target.kind === next) return { entries: [...entries], changed: [] }

  const holder = entries.find((e) => e.id !== targetId && e.kind === next)
  const previous = target.kind

  return {
    entries: entries.map((entry) => {
      if (entry.id === targetId) return { ...entry, kind: next }
      if (holder && entry.id === holder.id) return { ...entry, kind: previous }
      return entry
    }),
    changed: holder ? [targetId, holder.id] : [targetId],
  }
}

/**
 * The inequality the design rests on: with at least as many kinds as slots, a free kind always
 * exists, so `onPick` can never seat a tile on a kind that is taken. It was an equality
 * (`MAX_IMAGES === SCREEN_KINDS.length`) until the Workout Details kind made it four kinds for three
 * slots; `>=` is what the picker actually needs. Exported so the suite asserts it rather than assumes it.
 */
export const A_FREE_KIND_ALWAYS_EXISTS = SCREEN_KINDS.length >= MAX_IMAGES
