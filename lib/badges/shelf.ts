import type { DateISO } from '@/lib/date/ranges'
import { BADGE_CATALOG } from './catalog'
import type { PeriodFacts } from './evaluate'
import { BADGE_META } from './meta'
import { readProgress, type ProgressReading } from './progress'
import type { BadgeKey, StoredBadge } from './types'

/**
 * The `/me` shelf as data: all 22 rows, in catalog order, each one either earned or locked.
 *
 * Pure, so the whole of §10.2's decision is testable without rendering anything. The component's
 * only job is to draw what this returns.
 *
 * ── EVERY SLOT IS ALWAYS SHOWN, WITH ITS CONDITION AND ITS GLOSS ─────────────────────────────
 * Nothing about a locked badge is redacted or teased, which is the opposite of the spoiler-risk
 * instinct and deliberate on three counts (§10.2):
 *
 *   1. `meta.ts`' impersonal register was written specifically so **one string serves both
 *      states**. Hiding the sentence engineered for dual use defeats the reason it reads that way.
 *   2. The "no streaks-as-anxiety" tenet argues against a *checklist*, not against *information*.
 *      A fixed, always-the-same-22-rows reference page is closer to a glossary than a quest log:
 *      nothing here updates unless a commit changes it, and nothing pushes the runner back to it.
 *   3. Hiding a threshold would not remove min-maxing, only relocate it. A runner who wants
 *      `sweat_equity` finds out by running harder whether or not the number 1000 is printed —
 *      printing it is the honest option for a tool whose premise is "read your own data plainly".
 *
 * ── SORT IS CATALOG ORDER, NOT EARNED-FIRST ─────────────────────────────────────────────────
 * Earned-first is itself a progress-bar effect ("look how many are still at the bottom"). Catalog
 * order treats the shelf as a fixed reference table, which is what point 2 above depends on.
 */
export interface ShelfEntry {
  key: BadgeKey
  title: string
  condition: string
  gloss: string
  /**
   * null when the badge has never been earned. `earnedOn` is the LATEST earning and
   * `firstEarnedOn` the first — equal at a count of one, and the panel says so rather than
   * printing the same date twice.
   */
  earned: { firstEarnedOn: DateISO; earnedOn: DateISO; count: number } | null
  /**
   * R-44's locked-tile line: present only for a **locked** badge that genuinely accumulates. An
   * earned badge needs no progress, and 17 of the 22 have no honest number to show.
   */
  progress: ProgressReading | null
}

export interface Shelf {
  entries: ShelfEntry[]
  earnedCount: number
  lockedCount: number
}

export function buildShelf(stored: readonly StoredBadge[], facts: PeriodFacts): Shelf {
  /* A row whose key the catalog no longer defines never appears here: it is simply not iterated.
   * That is the retirement mechanism from §2 — a retired badge's rows stay in the table, inert, and
   * drop out of the shelf without a migration and without throwing. */
  const byKey = new Map(stored.map((row) => [row.key, row]))

  const entries = BADGE_CATALOG.map((definition): ShelfEntry => {
    const row = byKey.get(definition.key)
    const meta = BADGE_META[definition.key]
    return {
      key: definition.key,
      title: definition.title,
      condition: meta.condition,
      gloss: meta.gloss,
      earned: row
        ? { firstEarnedOn: row.firstEarnedOn, earnedOn: row.earnedOn, count: row.count }
        : null,
      progress: !row && definition.progress ? readProgress(definition.progress, facts) : null,
    }
  })

  const earnedCount = entries.filter((e) => e.earned).length
  return { entries, earnedCount, lockedCount: entries.length - earnedCount }
}
