import { DEFAULT_KIND_BY_INDEX, MAX_IMAGES, type ScreenKind } from './constants'
import { rejectionReason } from './rejectionReason'

/**
 * Decide what a pick adds to the upload page — as pure logic, deciding nothing else.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
 * F04's `onPick` made these decisions from *inside* a `setTiles` updater, and launched the
 * compress-and-upload chain from in there too. `next.config.ts` sets `reactStrictMode: true`, and
 * Strict Mode double-invokes state updaters on purpose to surface impure ones — so in dev every
 * one of those side effects ran twice. Measured on card #6: one file picked, one tile rendered,
 * **two** token mints and **two distinct blobs written**, one of them orphaned in the store for
 * good. F16 rebuilt `changeKind` around exactly this hazard and left the reason in its source;
 * `onPick` was the last holdout. See docs/plans/F17-onpick-purity.md §1.
 *
 * ── WHY IT IS HERE AND NOT IN THE COMPONENT ─────────────────────────────────────────────────
 * The same reason `reassignKind.ts` gives, in the same words, because it is the same constraint:
 * `vitest.config.ts` runs `environment: 'node'` with an `include` matching `*.test.ts` only, so
 * logic living inside a `.tsx` is logic this repo cannot unit-test. The kind-default rule, the
 * room arithmetic and all three messages below are small, total, and worth proving exhaustively.
 *
 * ── WHY IT RETURNS `{ file, kind }` AND NOT FINISHED TILES ──────────────────────────────────
 * Because `newId()` is random and `URL.createObjectURL` is a browser API. A planner that minted
 * ids or previews would be impure — the very defect it was written to remove, one layer down —
 * and asserting anything about it would need a stubbed clock or RNG. So this decides *which files
 * are in and which kind each gets*, the picker mints `id`, `gen` and `previewUrl`, and every
 * branch here is deterministic with no test doubles at all.
 */

/** The shape this reads off an existing tile, and nothing more of `Tile` is needed. */
export interface KindHolder {
  kind: ScreenKind
}

export interface AcceptedPick {
  file: File
  /** Distinct from every kind already held, and from every other pick in the same batch. */
  kind: ScreenKind
}

export interface PickPlan {
  /** In pick order, capped at the remaining room, rejects dropped. */
  accepted: AcceptedPick[]
  /**
   * The one message to show, or `null` to clear whatever is showing.
   *
   * Deliberately not an array. A pick can trip several rules at once (three files where one fits,
   * one of them empty) and the picker has a single `formError` line; last message wins, which is
   * what F04 did by reassigning `setFormError` in a loop. `null` on the happy path is what lets
   * the caller write `setFormError(plan.error)` unconditionally instead of clearing first and
   * setting later.
   */
  error: string | null
}

export function planPicked(existing: readonly KindHolder[], picked: readonly File[]): PickPlan {
  const room = MAX_IMAGES - existing.length
  if (room <= 0) {
    return { accepted: [], error: `Three screenshots is the most one run can have.` }
  }

  let error: string | null = null
  if (picked.length > room) {
    error = `Only the first ${room} of those were added — three is the maximum.`
  }

  const usedKinds = new Set<ScreenKind>(existing.map((t) => t.kind))
  const accepted: AcceptedPick[] = []

  for (const file of picked.slice(0, room)) {
    const reason = rejectionReason(file)
    if (reason) {
      // Accept around it rather than abandoning the batch: picking a good screenshot and a 40 MB
      // one should add the good one and explain the other, which is what F04 did and what someone
      // who picked four things at once expects.
      error = reason
      continue
    }

    // Default by pick order (1st Heart rate, 2nd Splits, 3rd Summary — the order the device hands
    // the files over in, F29), skipping any kind a tile already claims so two tiles never start
    // out fighting over one screen.
    //
    // The fallback search reads `DEFAULT_KIND_BY_INDEX` and not `SCREEN_KINDS`, which was the same
    // array until F29 and is not any more: scanning the canonical list would make a pick that
    // cannot have its preferred kind fall back to the *Fitness app's* order, the one F29 removed.
    // Two facts make the search total — `MAX_IMAGES === DEFAULT_KIND_BY_INDEX.length`, and the
    // array being a permutation of `SCREEN_KINDS` rather than merely the right length. The test
    // asserts both directly.
    const preferred =
      DEFAULT_KIND_BY_INDEX[existing.length + accepted.length] ?? DEFAULT_KIND_BY_INDEX[0]
    const kind = usedKinds.has(preferred)
      ? (DEFAULT_KIND_BY_INDEX.find((k) => !usedKinds.has(k)) ?? preferred)
      : preferred
    usedKinds.add(kind)

    accepted.push({ file, kind })
  }

  return { accepted, error }
}
