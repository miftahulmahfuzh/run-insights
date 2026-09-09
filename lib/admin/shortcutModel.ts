import type { NinaShortcutMatchable } from '@/lib/nina/shortcuts'

/**
 * `/admin/shortcuts`'s pure half — R1's row model, with no I/O and nothing importable-only-on-a-
 * server. `lib/admin/memoryModel.ts` is the file this one copies, and its header is the rule:
 * a `'use client'` table must not pull zod or a drizzle table module into the browser bundle, so
 * every import there is `import type` and `tests/admin.memory.test.ts` asserts it.
 *
 * ── THE ONE DOOR THIS FILE OPENS IN THAT BAN, AND WHY IT IS HERE AND NOT IN THE TABLE ───────
 * The table needs three NUMBERS in the browser — the caps `maxLength` is set from. They live in
 * `lib/nina/shortcuts.ts`, which the plan set's invariant 4 holds to ZERO imports for exactly this
 * reason, so there were two shapes available:
 *
 *   (a) `ShortcutTable.tsx` imports the bounds from `@/lib/nina/shortcuts` itself;
 *   (b) this module re-exports them, and the table names one `lib/admin` module and nothing else.
 *
 * **(b), deliberately.** Under (a) the safety rests on a property of a file in ANOTHER directory
 * that the client component now names — and the next person who needs "something else from
 * lib/nina" in an admin table copies that import line straight into `lib/nina/memory.ts`, which
 * reaches zod and `lib/db/schema.ts`. Under (b) the boundary is one file wide and testable three
 * ways: `tests/admin.shortcuts.test.ts` asserts that `ShortcutTable.tsx` names no `lib/nina`
 * specifier at all, that the re-export below is the ONLY non-type import in this file, and that
 * `lib/nina/shortcuts.ts` has zero imports of its own. That last case is phase 1's invariant, and
 * it is re-asserted here because this file is the one that depends on it.
 *
 * Everything else the page needs is built on the SERVER (`app/admin/shortcuts/page.tsx` calls
 * `buildShortcutRows`) and crosses the RSC boundary as plain strings, numbers and booleans.
 */
export {
  NINA_SHORTCUT_EXPANSION_MAX,
  NINA_SHORTCUT_LABEL_MAX,
  NINA_TRIGGER_MAX,
} from '@/lib/nina/shortcuts'

/* ── the one bound this page owns ───────────────────────────────────────────────────────────── */

/**
 * How much of the table the page renders. `ADMIN_LEDGER_PAGE`'s number and its reason: the table is
 * unbounded, the page is not. The registry holds tens of rows today, so this is a ceiling and not
 * a pager — and it is deliberately not a count of anything: the ledger this page's rows come from
 * is live, and no number from it is hard-coded anywhere in this plan set.
 */
export const ADMIN_SHORTCUT_PAGE = 200

/* ── the vocabulary ─────────────────────────────────────────────────────────────────────────── */

/**
 * The three editable text cells, as a tuple the schema and the test can iterate.
 * `ADMIN_FACT_CATEGORIES`'s idiom: a tuple, and the type derived from it, so a fourth field cannot
 * be added to one half and forgotten in the other.
 */
export const SHORTCUT_FIELDS = ['trigger', 'label', 'expansion'] as const

export type ShortcutField = (typeof SHORTCUT_FIELDS)[number]

/**
 * `'glyph' | 'word'`, derived from phase 1's own interface rather than retyped.
 *
 * `memoryModel.ts` had to retype its seven categories because `NinaFactCategory` is a type union
 * with no const tuple behind it. This one does not: `NinaShortcutMatchable` is an interface in a
 * zero-import module, so indexing its `kind` field is a pure TYPE read that cannot drift and
 * cannot put a value in the bundle.
 */
export type AdminShortcutKind = NinaShortcutMatchable['kind']

/* ── the row model ──────────────────────────────────────────────────────────────────────────── */

/**
 * **One row of `/admin/shortcuts`.** Every field is a string, a number, a boolean or `null`: this
 * crosses the RSC boundary, and the page builds it precisely so `ShortcutTable.tsx` needs neither
 * zod nor a drizzle table module.
 */
export interface ShortcutRow {
  /** `nina_shortcuts.id`. The React key, the result-map key, and what every action names. */
  id: string
  /** As the admin typed it. This is what the cell renders and what an error message quotes. */
  trigger: string
  /** `normalizeNinaTrigger(trigger)` — what matching actually uses. Read-only, shown under the cell. */
  matchKey: string
  kind: AdminShortcutKind
  label: string
  expansion: string
  enabled: boolean
  uses: number
  /** ISO 8601, or `null` when it has never fired. */
  lastUsedAt: string | null
  createdAt: string
}

/**
 * What `adminReadShortcuts` hands the page: the table's own columns, with `Date`s.
 *
 * It is declared HERE rather than in the store so that `buildShortcutRows` can stay a pure function
 * in a client-safe module — which is what lets `tests/admin.shortcuts.test.ts` drive it without
 * touching a database or importing anything `server-only`.
 */
export interface ShortcutSource {
  id: string
  trigger: string
  matchKey: string
  kind: AdminShortcutKind
  label: string
  expansion: string
  enabled: boolean
  uses: number
  lastUsedAt: Date | null
  createdAt: Date
}

/**
 * The one transformation between the two: `Date` -> ISO string.
 *
 * `MemoryRow` makes the same conversion for the same reason — a row that carries ISO strings makes
 * nothing about serialization depend on how the RSC boundary treats `Date` today.
 */
export function buildShortcutRows(sources: readonly ShortcutSource[]): ShortcutRow[] {
  return sources.map((source) => ({
    id: source.id,
    trigger: source.trigger,
    matchKey: source.matchKey,
    kind: source.kind,
    label: source.label,
    expansion: source.expansion,
    enabled: source.enabled,
    uses: source.uses,
    lastUsedAt: source.lastUsedAt?.toISOString() ?? null,
    createdAt: source.createdAt.toISOString(),
  }))
}

/**
 * The `Fired` cell, in one string.
 *
 * `'never'` rather than `'0'` because zero is the answer to a question the operator is not asking.
 * What he wants to know at a glance is which codes are dead — a shortcut that has never fired is
 * either mistyped or a scene that never comes up, and both are things to act on. The date is the
 * first ten characters of the ISO instant, the same slice `MemoryTable`'s When column takes and for
 * the same reason: a day is the resolution this is read at.
 */
export function formatFired(uses: number, lastUsedAt: string | null): string {
  if (uses <= 0) return 'never'
  if (lastUsedAt === null) return `${uses}×`
  return `${uses}× · ${lastUsedAt.slice(0, 10)}`
}

/*
 * `kind` is carried on every row and rendered nowhere: the explainer sentence that used to sit
 * under the trigger cell (`describeKind`) folded the table's narrowest column into five lines on a
 * phone and was removed on the owner's request. The field stays — the ledger has it, and the next
 * surface that needs the glyph/word split reads it from here rather than re-deriving it.
 */
