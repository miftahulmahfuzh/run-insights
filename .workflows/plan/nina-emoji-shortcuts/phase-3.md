# Phase 3: `/admin/shortcuts`

**Plan set:** `NINA_EMOJI_SHORTCUTS_PLAN.md`
**Analysis:** `20260907-185401-SHRT_code_analyzer.md`
**Satisfies:** R1 — *"an explicit shortcuts mechanism, separate from memory: an admin surface to add, edit, disable and remove shortcuts"*
**Depends on:** Phase 1
**Difficulty:** HARD
**Package:** `lib/admin` (with `components/admin`, `app/admin`, `tests`)

> **Reconciled against phase 1.** This plan was written before `phase-1.md` existed, so its first
> draft guessed at the query layer's signatures and guessed two of them wrong. Those guesses have
> been resolved against phase 1, which owns `lib/nina/queries.ts` and is the authority:
>
> - `insertNinaShortcut(userId, { trigger, label, expansion, enabled? })` returns
>   `Promise<NinaShortcutRecord>` and **THROWS** on a duplicate. It does not take `matchKey` or
>   `kind`, and it does not return `null`.
> - `updateNinaShortcut(userId, id, patch)` returns `Promise<NinaShortcutRecord | null>`, not a
>   boolean, and its patch type has no `matchKey` / `kind` either.
> - **The derived columns are computed one layer further down than this plan first placed them.**
>   `lib/nina/queries.ts` derives `match_key` and `kind` from `trigger` inside every write. That is
>   the same *"a caller cannot mislabel a row because there is nowhere to put the label"* guarantee
>   this phase asked for — and it is stronger, because it is enforced by the TYPE (`NinaShortcutInsert`
>   and `NinaShortcutPatch` have no field to put them in) rather than by this file remembering to
>   call two functions. `lib/admin/shortcutStore.ts` therefore does not compute `kind` at all, and
>   uses `normalizeNinaTrigger` only to answer *"does this trigger fold away to nothing?"*.
> - **The admin read is `listNinaShortcuts(userId)`, not a bespoke `SELECT`.** Phase 1's bare call
>   returns every row including the disabled ones, with `uses`, `lastUsedAt`, `createdAt` and
>   `updatedAt` on it — there is no column this page needs that it lacks. See Step 2.
>
> Everything else below stood up unchanged.

---

## Goal

`/admin/shortcuts` exists as the sixth admin route: one table of `(trigger, label, expansion)` rows
per user, where the operator adds, edits, disables and deletes a shortcut on a phone with no
confirmation anywhere. The trigger's `match_key` and `kind` are computed by the store on every write
and are impossible to pass in, and a duplicate trigger is refused by the unique index and reported
as a sentence naming the trigger. After this phase the concept the operator has been hand-encoding
into the memory ledger has a first-class home he can operate.

## Interface Contract

**Creates:**

| Symbol | File | Signature |
|---|---|---|
| `NINA_TRIGGER_MAX` | `lib/admin/shortcutModel.ts` | re-export from `@/lib/nina/shortcuts` |
| `NINA_SHORTCUT_LABEL_MAX` | `lib/admin/shortcutModel.ts` | re-export from `@/lib/nina/shortcuts` |
| `NINA_SHORTCUT_EXPANSION_MAX` | `lib/admin/shortcutModel.ts` | re-export from `@/lib/nina/shortcuts` |
| `ADMIN_SHORTCUT_PAGE` | `lib/admin/shortcutModel.ts` | `const = 200` |
| `SHORTCUT_FIELDS` | `lib/admin/shortcutModel.ts` | `readonly ['trigger','label','expansion']` |
| `ShortcutField` | `lib/admin/shortcutModel.ts` | `type = (typeof SHORTCUT_FIELDS)[number]` |
| `AdminShortcutKind` | `lib/admin/shortcutModel.ts` | `type = NinaShortcutMatchable['kind']` |
| `ShortcutRow` | `lib/admin/shortcutModel.ts` | `interface` — all-serializable row |
| `ShortcutSource` | `lib/admin/shortcutModel.ts` | `interface` — same, with `Date`s |
| `buildShortcutRows` | `lib/admin/shortcutModel.ts` | `(sources: readonly ShortcutSource[]) => ShortcutRow[]` |
| `formatFired` | `lib/admin/shortcutModel.ts` | `(uses: number, lastUsedAt: string \| null) => string` |
| `describeKind` | `lib/admin/shortcutModel.ts` | `(kind: AdminShortcutKind) => string` |
| `AdminShortcutDraft` | `lib/admin/shortcutStore.ts` | `interface { trigger; label; expansion }` |
| `AdminShortcutWrite` | `lib/admin/shortcutStore.ts` | `type = 'ok' \| 'duplicate' \| 'missing' \| 'empty'` |
| `adminCreateShortcut` | `lib/admin/shortcutStore.ts` | `(userId: string, draft: AdminShortcutDraft) => Promise<AdminShortcutWrite>` |
| `adminSaveShortcutField` | `lib/admin/shortcutStore.ts` | `(userId: string, id: string, field: ShortcutField, value: string) => Promise<AdminShortcutWrite>` |
| `adminSetShortcutEnabled` | `lib/admin/shortcutStore.ts` | `(userId: string, id: string, enabled: boolean) => Promise<'ok' \| 'missing'>` |
| `adminDeleteShortcut` | `lib/admin/shortcutStore.ts` | `(userId: string, id: string) => Promise<'ok' \| 'missing'>` |
| `adminReadShortcuts` | `lib/admin/shortcutStore.ts` | `(userId: string, limit: number) => Promise<ShortcutSource[]>` |
| `AdminShortcutResult` | `lib/admin/shortcutActions.ts` | `interface { ok: boolean; error?: string; note?: string }` |
| `addShortcutAction` | `lib/admin/shortcutActions.ts` | `(input: { userId; trigger; label; expansion }) => Promise<AdminShortcutResult>` |
| `saveShortcutCellAction` | `lib/admin/shortcutActions.ts` | `(input: { userId; id; field: string; value: string }) => Promise<AdminShortcutResult>` |
| `toggleShortcutAction` | `lib/admin/shortcutActions.ts` | `(input: { userId; id; enabled: boolean }) => Promise<AdminShortcutResult>` |
| `deleteShortcutAction` | `lib/admin/shortcutActions.ts` | `(input: { userId; id }) => Promise<AdminShortcutResult>` |
| `shortcutInsertSchema` / `ShortcutInsert` | `lib/admin/schema.ts` | zod object |
| `shortcutCellSchema` / `ShortcutCell` | `lib/admin/schema.ts` | zod discriminated union on `field` |
| `shortcutToggleSchema` / `ShortcutToggle` | `lib/admin/schema.ts` | zod object |
| `shortcutDeleteSchema` / `ShortcutDelete` | `lib/admin/schema.ts` | zod object |
| `ShortcutTable` | `components/admin/ShortcutTable.tsx` | `({ userId, rows }) => JSX` — `'use client'` |
| `AdminShortcutsPage` | `app/admin/shortcuts/page.tsx` | default export, `force-dynamic` |

**Deletes:** none.

**Renames:** none.

**Signature changes:**

- `UserPicker({ users, selectedId })` -> `UserPicker({ users, selectedId, basePath = '/admin/memory' })`
  (`components/admin/UserPicker.tsx:15`). **Purely additive, optional, defaulted; the existing call
  sites in `app/admin/memory/page.tsx:58,87` are not edited.** See Step 8 for why this deviates from
  the brief's "reuse `UserPicker` unmodified".
- `components/admin/AdminNav.tsx` — `LINKS` gains a sixth entry, `grid-cols-5` -> `grid-cols-6`.
  The exported `AdminNav()` signature does not change.

**The final `LINKS` array, verbatim (comments elided here; the full block is Step 7):**

```ts
const LINKS = [
  { href: '/admin', label: 'Overview', short: 'Overview' },
  { href: '/admin/nina', label: "Nina's album", short: 'Album' },
  { href: '/admin/personality', label: 'Personality', short: 'Persona' },
  { href: '/admin/photos', label: 'Chat photos', short: 'Photos' },
  { href: '/admin/memory', label: 'Memory', short: 'Memory' },
  { href: '/admin/shortcuts', label: 'Shortcuts', short: 'Shortcut' },
] as const
```

**Requires (from earlier phases):**

Phase 1 must land before this phase. These are its **actual** signatures, taken from
`phase-1.md`'s Interface Contract at reconciliation — not guesses, and there are no fallbacks left
to choose between.

| What phase 1 provides | Exact shape | Used by |
|---|---|---|
| `lib/nina/shortcuts.ts` exports `NINA_TRIGGER_MAX` (16), `NINA_SHORTCUT_LABEL_MAX` (80), `NINA_SHORTCUT_EXPANSION_MAX` (2000), `normalizeNinaTrigger`, `classifyNinaTrigger`, `type NinaShortcutKind`, `interface NinaShortcutMatchable` | — | `shortcutModel.ts` (the three caps and the kind union), `shortcutStore.ts` (`normalizeNinaTrigger` only) |
| `lib/nina/shortcuts.ts` has **zero** import statements (invariant 4) | — | the whole client-safety argument. `tests/admin.shortcuts.test.ts` re-asserts it here because this phase is one of the two consumers that depend on it |
| `NinaShortcutRecord` | `{ id, trigger, matchKey, kind: NinaShortcutKind, label, expansion, enabled, uses, lastUsedAt: Date \| null, createdAt: Date, updatedAt: Date }` | `ShortcutSource` maps from it 1:1 (it ignores `updatedAt`) |
| `listNinaShortcuts(userId, opts?: { onlyEnabled?: boolean })` | `Promise<NinaShortcutRecord[]>`. **Bare = every row, disabled included.** Ordered by `match_key ASC, id ASC` | `adminReadShortcuts` — which re-sorts newest-first and slices, see Step 2 |
| `insertNinaShortcut(userId, { trigger, label, expansion, enabled? })` | `Promise<NinaShortcutRecord>`. **THROWS the 23505 on a duplicate.** No `matchKey`/`kind` in the input; both are derived inside | `adminCreateShortcut` |
| `updateNinaShortcut(userId, id, patch)` | `Promise<NinaShortcutRecord \| null>`, `null` = no such row for that user. Patch is `{ trigger?, label?, expansion?, enabled? }` — **no `matchKey`, no `kind`**; passing `trigger` re-derives both | `adminSaveShortcutField`, `adminSetShortcutEnabled` |
| `deleteNinaShortcut(userId, id)` | `Promise<boolean>` | `adminDeleteShortcut` |
| the unique index is named `nina_shortcuts_user_match_unq` | on `(user_id, match_key)` | `isDuplicateTrigger`. If the driver omits the constraint name, `isUniqueViolation` alone still answers — it is the only constraint a form on this page can reach |

**Leaves alone (owned by others):** everything under `lib/nina/` (Phase 1), `lib/db/schema.ts`
(Phase 1), `drizzle/` (Phase 1), `lib/nina/turn.ts` / `actions.ts` / `prompts/` (Phase 2),
`scripts/` and `package.json` (Phase 4), `app/admin/layout.tsx`, `lib/admin/memoryModel.ts`,
`lib/admin/memoryStore.ts`, `lib/admin/memoryActions.ts`, `lib/admin/memoryVocab.ts`,
`app/admin/memory/page.tsx`, `components/admin/MemoryTable.tsx`, `tests/admin.memory.test.ts`.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/shortcutModel.ts` | **create** | the client-safe row model; the ONE door through which the bounds reach the browser |
| `lib/admin/shortcutStore.ts` | **create** | `'server-only'`; the only module under `lib/admin` that writes a shortcut; owns the duplicate catch, the empty-trigger refusal and the admin read's ordering. **Derives nothing** — `lib/nina/queries.ts` computes `matchKey`/`kind` |
| `lib/admin/schema.ts` | modify | append a new section after `ninaTuningResetSchema` (`:481`); one import block after `:18` |
| `lib/admin/shortcutActions.ts` | **create** | `'use server'`; the four actions |
| `components/admin/ShortcutTable.tsx` | **create** | `'use client'`; six columns, blur-to-save, optimistic delete only |
| `app/admin/shortcuts/page.tsx` | **create** | `force-dynamic`, `requireAdmin`, `?user=`, server-built rows, two-branch render |
| `components/admin/UserPicker.tsx` | modify | `:15-24` gains an optional `basePath`; `:37` uses it |
| `components/admin/AdminNav.tsx` | modify | `:25-27`, `:36-38`, `:51-57`, `:59-87`, `:101`, `:107-120`, `:121` |
| `tests/admin.shell.test.ts` | modify | `:103-109`, `:115-125`, `:167-179` |
| `tests/admin.shortcuts.test.ts` | **create** | the pure half and the structural half |

---

## Implementation Steps

### Step 1: `lib/admin/shortcutModel.ts` — the client-safe row model, and the one door

**File:** `lib/admin/shortcutModel.ts` (new)

**Change:** The pure half of the page. `lib/admin/memoryModel.ts` is the file this copies, including
its value-import ban — with one deliberate, argued exception.

**THE DECISION THE BRIEF ASKED FOR, STATED ONCE:** `ShortcutTable.tsx` does **not** import from
`@/lib/nina/shortcuts`. This module re-exports the three bounds and the table names one `lib/admin`
module and no `lib/nina` module at all. The reason is not that `lib/nina/shortcuts.ts` is unsafe —
invariant 4 makes it zero-import and therefore safe today — it is that a `@/lib/nina/...` specifier
sitting in a `'use client'` file is a template. The next person who needs "something from lib/nina"
in an admin table copies that line and lands in `lib/nina/memory.ts`, which reaches zod and
`lib/db/schema.ts`. Under the re-export the boundary is one file wide and
`tests/admin.shortcuts.test.ts` asserts three things instead of one: that the table names no
`@/lib/nina/` specifier (strictly stronger than `MemoryTable.tsx`'s list of five banned strings),
that the only non-type import in *this* file is the re-export below, and that
`lib/nina/shortcuts.ts` really does have zero imports — the premise the whole arrangement rests on,
asserted here as well as in phase 1 because it is this file that depends on it.

**Code:**

```ts
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
 * ways: `tests/admin.shortcuts.test.ts` asserts that `ShortcutTable.tsx` names no `@/lib/nina/`
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

/**
 * What the trigger's classification MEANS, in the words the operator needs.
 *
 * `kind` is not user input and is not editable, so the only useful thing the cell can do with it is
 * explain the boundary rule it selected — which is the one behaviour that surprises people
 * (`yumm` deliberately does not fire inside `yummy`; `🍑` deliberately fires anywhere).
 */
export function describeKind(kind: AdminShortcutKind): string {
  return kind === 'glyph'
    ? 'glyph — fires anywhere in his message'
    : 'word — fires on its own only, never inside a longer word'
}
```

**Note on the three non-ASCII characters above.** `formatFired` returns strings containing `×`
(U+00D7 MULTIPLICATION SIGN, *not* the letter x) and `·` (U+00B7 MIDDLE DOT), and the docstrings use
`—` (U+2014 EM DASH). They are written literally in this plan and must be written literally in the
source — do **not** transcribe them as `×`-style escapes, which is how a real control character
ends up in a file and how `grep` starts calling that file binary. `tests/admin.shortcuts.test.ts`
asserts the exact output strings, so a substituted ASCII `x` fails loudly.

**Impact:** nothing yet — no importer exists until Step 2.

---

### Step 2: `lib/admin/shortcutStore.ts` — the only writer, and the one place a refusal becomes a word

**File:** `lib/admin/shortcutStore.ts` (new)

**Change:** `lib/admin/memoryStore.ts`'s pattern. Every write goes through `lib/nina/queries.ts`,
and this module's whole job is turning what that layer does into the four words the page can say.

**RECONCILED — where the derived columns are computed, and why not here.** This plan's first draft
computed `match_key` and `kind` in this file and passed them down, borrowing `memoryStore.ts`'s
argument about `source`: *"a caller cannot mislabel a row because there is nowhere to put the
label."* Phase 1 achieves the same property **one layer further down and more strongly**:
`insertNinaShortcut` and `updateNinaShortcut` derive both from `trigger` themselves, and their
input types (`NinaShortcutInsert`, `NinaShortcutPatch`) have **no field to put either in**. So the
guarantee is enforced by the compiler rather than by this file remembering two calls, and there is
exactly one function in the tree that knows how to spell a `match_key`. This module therefore:

- **does not import `classifyNinaTrigger` at all**, and
- calls `normalizeNinaTrigger` for exactly one purpose — answering *"does this trigger fold away to
  nothing?"*, which is a message for the operator (`'empty'`) and not a derivation.

**RECONCILED — the read is `listNinaShortcuts`, not a bespoke `SELECT`.** The draft issued its own
statement on the belief that `listNinaShortcuts` returned the enabled-only, telemetry-free
`NinaShortcutMatchable`. It does not. It returns `NinaShortcutRecord[]` — every column including
`uses`, `lastUsedAt`, `createdAt` and `updatedAt` — and the *bare* call returns **every row,
disabled included**, which is exactly this page's question. `{ onlyEnabled: true }` is the turn
path's narrowing and this page simply does not pass it. There is no column left for a second
statement to fetch, so a second statement would be duplicate work with a second `WHERE` to keep
`user_id`-first.

What this module still owns about the read is the **ordering and the ceiling**, and they are the
one place the two callers genuinely differ. `listNinaShortcuts` sorts by `match_key` because a
registry is scanned by trigger and `(user_id, match_key)` is a total order. `/admin/shortcuts`
wants **newest first**, because the add row sits at the top of the table and the row he just
created has to appear directly under it (this phase's manual check 4). That is a sort over tens of
rows already in memory, so it is done here rather than by widening phase 1's signature with an
`orderBy` an admin page is the only caller of.

**Why there is no pre-flight SELECT on the trigger.** `(user_id, match_key)` is a unique index, and
a check-then-write races itself: two dispatches from two tabs both read "free", both insert, and one
of them gets a 500 instead of a sentence. `lib/db/.workflows/package_readme.md:479` states it as a
rule for this codebase — *"Never check-then-insert against a unique index. Catch `23505` via
`isUniqueViolation`"* — and that is what this file does.

**Code:**

```ts
import 'server-only'

import type { ShortcutField, ShortcutSource } from '@/lib/admin/shortcutModel'
import { isUniqueViolation } from '@/lib/db/queries'
import {
  deleteNinaShortcut,
  insertNinaShortcut,
  listNinaShortcuts,
  updateNinaShortcut,
  type NinaShortcutRecord,
} from '@/lib/nina/queries'
import { normalizeNinaTrigger } from '@/lib/nina/shortcuts'

/**
 * **The only file in `/admin/shortcuts` that writes a shortcut row.**
 *
 * ── `match_key` AND `kind` ARE NOT USER INPUT — AND THEY ARE NOT THIS FILE'S EITHER ─────────
 * `match_key` is `normalizeNinaTrigger(trigger)` and `kind` is `classifyNinaTrigger(match_key)`.
 * They are DERIVED, and they are the two columns the matcher actually reads: `match_key` is the
 * unique index and the haystack comparison, `kind` selects the boundary rule. A row whose
 * `match_key` disagrees with its `trigger` is a shortcut that renders one thing in the admin table
 * and fires on another — invisible until the operator wonders why his emoji stopped working.
 *
 * `lib/nina/queries.ts` derives both, inside every write, from `trigger`. **`NinaShortcutInsert`
 * and `NinaShortcutPatch` have no field for either**, so this file could not supply a mismatched
 * key if it wanted to — the property `lib/admin/memoryStore.ts` states as *"a caller cannot
 * mislabel a row because there is nowhere to put the label"*, enforced by the type rather than by
 * this module remembering two function calls. `AdminShortcutDraft` likewise has three fields and
 * none of them is a derived column.
 *
 * That is why the only `normalizeNinaTrigger` call below is a QUESTION, not a derivation: *"does
 * what he typed survive folding?"* A trigger of nothing but variation selectors is a row that can
 * never match anything, and the operator deserves that as a sentence rather than as a mysterious
 * `not-null` failure. `classifyNinaTrigger` is not imported at all.
 *
 * ── THE READ IS `listNinaShortcuts(userId)`, BARE ───────────────────────────────────────────
 * Bare means EVERY row, disabled included, which is exactly this page's question — a disabled
 * shortcut is still a row the operator edits and re-enables, and hiding it would make "off" look
 * like "deleted". `{ onlyEnabled: true }` is the turn path's narrowing and this page does not pass
 * it. The record carries `uses` and `lastUsedAt` for the `Fired` column, so there is nothing left
 * for a second statement here to fetch and no second `WHERE` to keep `user_id`-first.
 *
 * What is done here is the ORDERING and the ceiling — see `adminReadShortcuts`.
 *
 * ── AND WHY A DUPLICATE IS CAUGHT, NOT CHECKED FOR ──────────────────────────────────────────
 * `(user_id, match_key)` is a unique index and `insertNinaShortcut` deliberately lets the violation
 * THROW (phase 1's ruling: *"a pre-flight SELECT would be correct until two tabs raced"*). A
 * pre-flight `SELECT … WHERE match_key = $2` races itself: two dispatches both read "free", both
 * insert, and the loser gets a 500 where it should have got a sentence.
 * `lib/db/.workflows/package_readme.md`'s rule, verbatim: *"Never check-then-insert against a
 * unique index. Catch `23505` via `isUniqueViolation`."*
 */

/* ── the vocabulary a caller is allowed ─────────────────────────────────────────────────────── */

/** What a person types. No `match_key`, no `kind`, no `uses` — see the header. */
export interface AdminShortcutDraft {
  trigger: string
  label: string
  expansion: string
}

/**
 * What every write here can report, and nothing else:
 *
 *   `'ok'`        — the statement landed.
 *   `'duplicate'` — the unique index refused it; that trigger already folds to a taken `match_key`.
 *   `'missing'`   — no row with that id, for that user. Someone deleted it in another tab.
 *   `'empty'`     — the trigger folds away to nothing (all variation selectors, or all whitespace).
 *
 * A union of four strings rather than a thrown error, because three of the four are things the
 * operator did and one sentence is the whole correct response to each. Anything that is NOT one of
 * these four is a real fault and is thrown, so `shortcutActions.ts`'s `failed()` logs it.
 */
export type AdminShortcutWrite = 'ok' | 'duplicate' | 'missing' | 'empty'

/**
 * The unique index a person can actually violate from this page. The other unique constraint on
 * this table is the primary key, and a `newId()` nanoid collision reported as "that trigger is
 * taken" would send the operator hunting for a row that does not exist.
 */
const MATCH_UNIQUE = 'nina_shortcuts_user_match_unq'

/** Walks `.constraint` through `.cause` / `.sourceError`, exactly as `isUniqueViolation` walks `.code`. */
function violatedConstraint(err: unknown): string | null {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { constraint?: unknown; cause?: unknown; sourceError?: unknown }
    if (typeof record.constraint === 'string') return record.constraint
    current = record.cause ?? record.sourceError
  }
  return null
}

/**
 * A 23505 that this page can explain. When the driver hands back a constraint name we use it; when
 * it does not — and the Neon HTTP driver does not always — we still answer yes, because
 * `(user_id, match_key)` is the only constraint a form on this page can reach.
 */
function isDuplicateTrigger(cause: unknown): boolean {
  if (!isUniqueViolation(cause)) return false
  const constraint = violatedConstraint(cause)
  return constraint === null || constraint === MATCH_UNIQUE
}

/**
 * `updateNinaShortcut` answers with the saved record or `null`; `deleteNinaShortcut` answers with a
 * boolean. Two shapes, one meaning, so two one-line readers rather than a union parameter that
 * would make `settle(false)` and `settle(null)` look like different questions.
 *
 * The record itself is discarded on purpose. `revalidatePath` re-renders the page from
 * `adminReadShortcuts` in the same response, so the row the table shows comes from the read and
 * never from a write's return value — one source of truth for what is on screen. (Phase 1 returns
 * the record because a caller MIGHT want it; this one does not.)
 */
function settleWrite(row: NinaShortcutRecord | null): 'ok' | 'missing' {
  return row === null ? 'missing' : 'ok'
}

function settleDelete(deleted: boolean): 'ok' | 'missing' {
  return deleted ? 'ok' : 'missing'
}

/* ── writes ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * The add row. Three fields go down, and `insertNinaShortcut` derives the folded key and the
 * boundary rule inside the same statement that writes the row — so there is no window in which a
 * row exists with a stale key, and no way for this function to hand down a key that disagrees with
 * its own trigger.
 *
 * The `normalizeNinaTrigger` call here is a QUESTION and not a derivation: a trigger that folds
 * away to nothing (all whitespace, or nothing but variation selectors) can never match anything,
 * and the operator gets that as a sentence instead of a row that silently never fires. The key the
 * database actually stores is computed one layer down, from the same function.
 *
 * **A duplicate arrives as a THROW, not as a `null`.** Phase 1 lets the 23505 out on purpose —
 * `(user_id, match_key)` is the authority on "this code already exists" and a check-then-write
 * races itself. `insertNinaShortcut` resolves to a record or throws; there is no third outcome.
 */
export async function adminCreateShortcut(
  userId: string,
  draft: AdminShortcutDraft,
): Promise<AdminShortcutWrite> {
  if (normalizeNinaTrigger(draft.trigger).length === 0) return 'empty'

  try {
    await insertNinaShortcut(userId, {
      trigger: draft.trigger.trim(),
      label: draft.label,
      expansion: draft.expansion,
    })
    return 'ok'
  } catch (cause) {
    if (isDuplicateTrigger(cause)) return 'duplicate'
    throw cause
  }
}

/**
 * One cell. The `label` and `expansion` branches are a single-column UPDATE; the `trigger` branch
 * causes `updateNinaShortcut` to rewrite all three derived-and-derived-from columns together, and
 * is therefore the only one that can hit the unique index.
 *
 * The three branches are spelled out rather than built from a computed key (`{ [field]: value }`),
 * because a computed key widens to an index signature and the patch type stops checking anything —
 * and the patch type refusing `matchKey` and `kind` is precisely the guarantee this page rests on.
 */
export async function adminSaveShortcutField(
  userId: string,
  id: string,
  field: ShortcutField,
  value: string,
): Promise<AdminShortcutWrite> {
  if (field === 'label') {
    return settleWrite(await updateNinaShortcut(userId, id, { label: value }))
  }
  if (field === 'expansion') {
    return settleWrite(await updateNinaShortcut(userId, id, { expansion: value }))
  }

  if (normalizeNinaTrigger(value).length === 0) return 'empty'

  try {
    return settleWrite(await updateNinaShortcut(userId, id, { trigger: value.trim() }))
  } catch (cause) {
    if (isDuplicateTrigger(cause)) return 'duplicate'
    throw cause
  }
}

/**
 * On or off. It cannot collide and it cannot be empty, so its return type is narrower than the
 * other two — which is what lets `toggleShortcutAction` answer a refusal with one sentence instead
 * of a switch over states it can never see.
 */
export async function adminSetShortcutEnabled(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<'ok' | 'missing'> {
  return settleWrite(await updateNinaShortcut(userId, id, { enabled }))
}

/** One click on the table's `✕`, and nothing survives it. Invariant 6. */
export async function adminDeleteShortcut(userId: string, id: string): Promise<'ok' | 'missing'> {
  return settleDelete(await deleteNinaShortcut(userId, id))
}

/* ── the read ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Every shortcut this user has, **including the disabled ones**, newest first.
 *
 * ── ONE STATEMENT IN THE TREE, AND IT IS PHASE 1'S ──────────────────────────────────────────
 * `listNinaShortcuts(userId)` bare returns every row as a `NinaShortcutRecord` — `id`, `trigger`,
 * `matchKey`, `kind` already narrowed to the union, `label`, `expansion`, `enabled`, `uses`,
 * `lastUsedAt`, `createdAt`, `updatedAt`. There is no column this page renders that it lacks, so a
 * second `SELECT` here would be the same read written twice, with a second `WHERE` to keep
 * `user_id`-first (invariant 5) and a second place for the column list to fall behind the schema.
 *
 * `kind` needs no ternary and no `as`: phase 1's `toShortcutRecord` is where the `text` column
 * becomes the union, and it re-derives an unrecognised value through `classifyNinaTrigger` rather
 * than trusting it — the boundary this page would otherwise have had to guard itself.
 *
 * ── THE ORDERING AND THE CEILING ARE THIS PAGE'S, AND THEY ARE DONE IN MEMORY ───────────────
 * `listNinaShortcuts` sorts by `match_key` because a registry is scanned by trigger. This page
 * wants **newest first**, because the add row sits at the top of the table and a row he just
 * created has to appear directly under the form that made it. Rather than widen phase 1's
 * signature with an `orderBy` an admin page would be the only caller of, the sort happens here:
 * the registry holds tens of rows, all of them already in memory and already capped by
 * `ADMIN_SHORTCUT_PAGE`.
 *
 * `createdAt DESC, id DESC` matches `listNinaMemoryFacts`: an import run writes several rows in
 * one statement and they share an instant, and `id` is a random nanoid — an arbitrary but STABLE
 * tiebreak, which is all a re-render needs to stop rows swapping places under a cursor. `sort` is
 * called on a fresh array (`[...rows]`) so nothing mutates what the query layer handed back.
 */
export async function adminReadShortcuts(
  userId: string,
  limit: number,
): Promise<ShortcutSource[]> {
  const rows = await listNinaShortcuts(userId)

  return [...rows]
    .sort((a, b) => {
      const byCreated = b.createdAt.getTime() - a.createdAt.getTime()
      if (byCreated !== 0) return byCreated
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      trigger: row.trigger,
      matchKey: row.matchKey,
      kind: row.kind,
      label: row.label,
      expansion: row.expansion,
      enabled: row.enabled,
      uses: row.uses,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    }))
}
```

**Impact:** `lib/admin/` gains a second `server-only` store module. It reaches no drizzle table and
no `db` handle of its own — every statement is `lib/nina/queries.ts`'s — which is a simpler shape
than `memoryStore.ts` and is only available because phase 1's query layer already answers both of
this page's questions. `tests/admin.memory.test.ts`'s sweep over `lib/admin/*.ts` (*"keeps every
memory-table write inside memoryStore"*) still passes: this file names `ninaMemoryFacts` and
`ninaMemorySlots` nowhere at all.

---

### Step 3: `lib/admin/schema.ts` — the four zod schemas

**File:** `lib/admin/schema.ts` — an import block after `:18`, and a new section appended after
`:481` (the end of `ninaTuningResetSchema`).

**Change:** Four schemas, one per action. The bounds are imported from `@/lib/admin/shortcutModel`
and not from `@/lib/nina/shortcuts`, which keeps the one-door rule true for every consumer and
matches how this file already reaches `memoryModel.ts` for `ADMIN_FACT_TEXT_MAX`.

**Code — the import block, inserted immediately after the existing `memoryModel` import at `:14-18`:**

```ts
import {
  NINA_SHORTCUT_EXPANSION_MAX,
  NINA_SHORTCUT_LABEL_MAX,
  NINA_TRIGGER_MAX,
} from '@/lib/admin/shortcutModel'
```

**Code — the new section, appended at the end of the file:**

```ts
/* ============================================================================
 * nina-emoji-shortcuts phase 3 — /admin/shortcuts. Appended; nothing above
 * this line changed.
 * ==========================================================================*/

/**
 * The four shortcut actions' input bounds. Same home and same reason as the memory four above:
 * *"two homes for one concern is worse than one additive edit to a landed file."*
 *
 * ── NEITHER DERIVED COLUMN APPEARS ANYWHERE IN THIS SECTION, AND THAT IS THE POINT ──────────
 * A shortcut row has two columns that are computed rather than typed — the folded key the matcher
 * compares against, and the glyph/word classification that picks the boundary rule.
 * `lib/admin/shortcutStore.ts` computes both from the trigger on every insert and every trigger
 * edit. If either were a FIELD here, a forged POST could hand the matcher a key that does not
 * belong to the trigger the table renders, and the row would fire on something nobody can see.
 * They are absent from every schema below, so the payload has nowhere to put them.
 * `tests/admin.shortcuts.test.ts` reads this section and asserts it.
 *
 * ── AND NOTHING HERE NORMALISES ─────────────────────────────────────────────────────────────
 * `trim()` yes, fold no. Unicode normalisation is `normalizeNinaTrigger`'s, in the store, on the
 * server, once. Running it here as well would put the fold in two places, and the day they
 * disagree is the day a row's key stops matching its own trigger.
 */

/** A `nina_shortcuts.id` — `newId()`, a nanoid. Same shape and same bound as `memoryIdSchema`. */
const shortcutIdSchema = z.string().trim().min(1).max(64)

/** As typed, trimmed, and no longer than phase 1's ceiling. */
const shortcutTriggerSchema = z.string().trim().min(1).max(NINA_TRIGGER_MAX)

/** One line in a phone table cell. */
const shortcutLabelSchema = z.string().trim().min(1).max(NINA_SHORTCUT_LABEL_MAX)

/** The long context. Five times the ledger cap that is currently binding on these same sentences. */
const shortcutExpansionSchema = z.string().trim().min(1).max(NINA_SHORTCUT_EXPANSION_MAX)

/**
 * The add row. All three at once, because a shortcut with no expansion is not a shortcut — there is
 * nothing for it to stand in for — and a shortcut with no label is a row the operator cannot scan.
 */
export const shortcutInsertSchema = z.object({
  userId: userIdSchema,
  trigger: shortcutTriggerSchema,
  label: shortcutLabelSchema,
  expansion: shortcutExpansionSchema,
})
export type ShortcutInsert = z.infer<typeof shortcutInsertSchema>

/**
 * **One cell.** A discriminated union rather than three optional strings, for the reason
 * `memoryDeleteSchema` gives: there is one control per cell, the cell knows which field it is, and
 * the three fields have three different caps. A flat `{ field: string; value: string }` would have
 * to check the longest cap for all three, so a 900-character trigger would pass validation and be
 * refused by the column instead — a 500 where a sentence belongs.
 *
 * Unlike the ledger's cell save this sends ONE field and not the whole row, because the three are
 * genuinely independent here: a shortcut's label has no bearing on its expansion, and the trigger
 * edit is the only one that can be refused. Sending all three would make every label typo a
 * candidate for a duplicate-trigger error.
 */
export const shortcutCellSchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('trigger'),
    userId: userIdSchema,
    id: shortcutIdSchema,
    value: shortcutTriggerSchema,
  }),
  z.object({
    field: z.literal('label'),
    userId: userIdSchema,
    id: shortcutIdSchema,
    value: shortcutLabelSchema,
  }),
  z.object({
    field: z.literal('expansion'),
    userId: userIdSchema,
    id: shortcutIdSchema,
    value: shortcutExpansionSchema,
  }),
])
export type ShortcutCell = z.infer<typeof shortcutCellSchema>

/** On or off. A boolean and not a toggle-what-it-is-not: the client sends the state it wants. */
export const shortcutToggleSchema = z.object({
  userId: userIdSchema,
  id: shortcutIdSchema,
  enabled: z.boolean(),
})
export type ShortcutToggle = z.infer<typeof shortcutToggleSchema>

/** The one destructive action, and it takes an id and nothing else. No `confirm` field. */
export const shortcutDeleteSchema = z.object({
  userId: userIdSchema,
  id: shortcutIdSchema,
})
export type ShortcutDelete = z.infer<typeof shortcutDeleteSchema>
```

**Impact:** `lib/admin/schema.ts` grows by one import block and one section. Nothing above the
banner is touched, so `tests/admin.tuning.test.ts` and the memory schemas are unaffected.

> **Careful when writing the section:** `tests/admin.shortcuts.test.ts` asserts this slice contains
> no `matchKey` and no `kind:`. The prose above therefore never spells either — it says "the folded
> key" and "the glyph/word classification". Keep it that way, and the guard keeps working. This is
> the same trap `tests/admin.shell.test.ts`'s `classNames()` helper exists for.

---

### Step 4: `lib/admin/shortcutActions.ts` — four actions, four things a person can do

**File:** `lib/admin/shortcutActions.ts` (new)

**Change:** `requireAdmin()` -> zod -> the store -> `revalidatePath('/admin/shortcuts')`, four
times. No confirmations, no typed words, no two-step flows.

**Code:**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  shortcutCellSchema,
  shortcutDeleteSchema,
  shortcutInsertSchema,
  shortcutToggleSchema,
} from '@/lib/admin/schema'
import { NINA_TRIGGER_MAX } from '@/lib/admin/shortcutModel'
import {
  adminCreateShortcut,
  adminDeleteShortcut,
  adminSaveShortcutField,
  adminSetShortcutEnabled,
} from '@/lib/admin/shortcutStore'

/**
 * `/admin/shortcuts`'s write side — R1's *"admin can add shortcuts that entails some situations or
 * what miftah and nina were doing"*.
 *
 * **Four actions, because there are four things a person can do to this table**: add a shortcut,
 * change one of its cells, turn it off, throw it away. There is no fifth, and in particular there
 * is no confirm, no purge gate and no "are you sure" — the standing ruling of this admin surface,
 * carried in `lib/admin/memoryActions.ts`'s own header in the owner's words: *"i am the only one
 * using this app, no need for all these bullshit confirmation."*
 *
 * Every action follows the same four lines, in this order and for these reasons — the rule is
 * `memoryActions.ts`'s and it is repeated rather than referenced because it is the thing a future
 * edit is most likely to skip:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists
 *                                 (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`,
 *                                 "Security"), and `proxy.ts` does not match `/admin`.
 *   2. Zod                      — every field, every time. Validation is not confirmation. It is
 *                                 also what keeps the two derived columns out of the payload: they
 *                                 are absent from every schema, so a forged POST has nowhere to put
 *                                 a key that disagrees with its own trigger.
 *   3. the write                — through `lib/admin/shortcutStore.ts` only, which is where the
 *                                 folded key and the classification are computed.
 *   4. `revalidatePath`         — re-renders THIS page, and the re-rendered RSC payload rides back
 *                                 in the SAME response as the return value, which is what lets the
 *                                 table delete a row optimistically without guessing. It is **not**
 *                                 how the edit reaches Nina: nothing on the turn path caches a
 *                                 shortcut, so a committed row is live on her next matching
 *                                 message with no invalidation step at all.
 *
 * ── A DUPLICATE TRIGGER IS A SENTENCE, NOT A STACK TRACE ────────────────────────────────────
 * The store turns the unique-index violation into `'duplicate'` and `refusal()` turns that into a
 * sentence naming the trigger. Nothing here does a pre-flight SELECT: see the store's header for
 * why a check-then-write races itself.
 */

export interface AdminShortcutResult {
  ok: boolean
  error?: string
  /** One sentence about what was written. Rendered under the cell that caused it. */
  note?: string
}

/** Every action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(where: string, cause: unknown): AdminShortcutResult {
  console.error(`[f36] admin shortcuts ${where} failed`, cause)
  return { ok: false, error: 'The write failed and nothing was changed. Try again.' }
}

/** The sentence the operator gets when the row is gone from under him. */
const GONE = 'That shortcut is no longer in the table. Nothing changed.'

/**
 * A refused write, in one sentence that names the trigger. `'duplicate'` quotes it because the
 * operator has to go find the row it collided with, and `(user_id, match_key)` means the collision
 * may be with a trigger that LOOKS different — `✌️` and `✌` fold to the same key, which is the whole
 * point and is also the most confusing five seconds this page can produce.
 */
function refusal(status: 'duplicate' | 'missing' | 'empty', trigger: string): string {
  if (status === 'duplicate') {
    return `"${trigger}" already matches a shortcut this user has — variation selectors and case are folded away before the comparison, so it may be spelled differently in the table. Edit that row instead.`
  }
  if (status === 'empty') {
    return `"${trigger}" folds away to nothing once whitespace and variation selectors come out. A trigger needs at least one character that survives that.`
  }
  return GONE
}

/**
 * **The add row.** The first click of a create, not a second click on anything. The row is live the
 * moment it lands: nothing caches a shortcut, so his next message carrying that trigger takes the
 * whole expansion with it.
 */
export async function addShortcutAction(input: {
  userId: string
  trigger: string
  label: string
  expansion: string
}): Promise<AdminShortcutResult> {
  await requireAdmin()

  const parsed = shortcutInsertSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `A shortcut needs all three: a trigger of at most ${NINA_TRIGGER_MAX} characters, a one-line label, and the expansion it stands for.`,
    }
  }
  const { userId, trigger, label, expansion } = parsed.data

  try {
    const status = await adminCreateShortcut(userId, { trigger, label, expansion })
    if (status !== 'ok') return { ok: false, error: refusal(status, trigger) }
  } catch (cause) {
    return failed('add', cause)
  }

  revalidatePath('/admin/shortcuts')
  return { ok: true, note: 'Live. The next message he sends with that in it carries the whole expansion.' }
}

/**
 * A cell save. One field, because the three are independent and only one of them can be refused —
 * sending all three would make every label typo a candidate for a duplicate-trigger error.
 *
 * Editing the trigger re-derives the folded key and the boundary rule in the same statement, which
 * is why this is the branch that can come back `'duplicate'`.
 */
export async function saveShortcutCellAction(input: {
  userId: string
  id: string
  field: string
  value: string
}): Promise<AdminShortcutResult> {
  await requireAdmin()

  const parsed = shortcutCellSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not an edit this page can make.' }
  const { userId, id, field, value } = parsed.data

  try {
    const status = await adminSaveShortcutField(userId, id, field, value)
    if (status !== 'ok') return { ok: false, error: refusal(status, value) }
  } catch (cause) {
    return failed('saveCell', cause)
  }

  revalidatePath('/admin/shortcuts')
  return {
    ok: true,
    note:
      field === 'trigger'
        ? 'Saved. The row now shows the folded key it will actually match on.'
        : 'Saved. She reads it on the next message that fires this one.',
  }
}

/**
 * Off is not delete, and that distinction is the reason this action exists rather than making the
 * operator delete and retype. A disabled row keeps its expansion, its usage count and its place in
 * the table; the matcher filters it out before matching and nothing can fire it.
 */
export async function toggleShortcutAction(input: {
  userId: string
  id: string
  enabled: boolean
}): Promise<AdminShortcutResult> {
  await requireAdmin()

  const parsed = shortcutToggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a toggle this page can make.' }
  const { userId, id, enabled } = parsed.data

  try {
    const status = await adminSetShortcutEnabled(userId, id, enabled)
    if (status !== 'ok') return { ok: false, error: GONE }
  } catch (cause) {
    return failed('toggle', cause)
  }

  revalidatePath('/admin/shortcuts')
  return {
    ok: true,
    note: enabled
      ? 'On. It can fire again from his next message.'
      : 'Off. The row stays and keeps its count; nothing can fire it.',
  }
}

/**
 * **The one destructive action on this page, and it destroys on the first click.** No typed word,
 * no panel, no record written first, no dialog. Invariant 6.
 *
 * A successful delete returns no `note`: the row being gone IS the message, and a sentence under a
 * row that no longer exists has nowhere to render.
 */
export async function deleteShortcutAction(input: {
  userId: string
  id: string
}): Promise<AdminShortcutResult> {
  await requireAdmin()

  const parsed = shortcutDeleteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a row this page can delete.' }
  const { userId, id } = parsed.data

  try {
    const status = await adminDeleteShortcut(userId, id)
    if (status !== 'ok') return { ok: false, error: GONE }
  } catch (cause) {
    return failed('delete', cause)
  }

  revalidatePath('/admin/shortcuts')
  return { ok: true }
}
```

**Impact:** four Server Actions exist. Each has exactly one `.safeParse(input)`, exactly one
`  await requireAdmin()` at two-space body indent, and exactly one
`revalidatePath('/admin/shortcuts')` — the three counts `tests/admin.shortcuts.test.ts` asserts.

---

### Step 5: `components/admin/ShortcutTable.tsx` — the table

**File:** `components/admin/ShortcutTable.tsx` (new)

**Change:** `MemoryTable.tsx`'s mechanics, verbatim where they transfer: `CELL_CONTROL` / `CELL` /
`CELL_WIDE_ONLY` / `HEAD_CELL` / `HEAD_CELL_WIDE_ONLY` as the same strings, blur-to-save, `Escape`
reverts, `Cmd`/`Ctrl+Enter` commits, a `<select>` saving on change, and optimistic DELETE only.
`Button`, `Card`, `cn` and `TOUCH_ICON` unmodified; no new palette.

Six columns: **trigger · label · expansion · on · fired · ✕**. `Fired` is the one hidden below `lg`,
with `hidden lg:table-cell` on the `<th>` and the `<td>` — **not** a `<colgroup>`;
`MemoryTable.tsx:103-110` explains at length why a `<col>` cannot be hidden and that bug is not
being reintroduced here. The expansion cell is a `<textarea>` and not an `<input>` because it holds
up to 2000 characters.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { TOUCH_ICON } from '@/components/admin/touch'
import { Button, Card } from '@/components/ui'
import {
  addShortcutAction,
  deleteShortcutAction,
  saveShortcutCellAction,
  toggleShortcutAction,
  type AdminShortcutResult,
} from '@/lib/admin/shortcutActions'
import {
  ADMIN_SHORTCUT_PAGE,
  NINA_SHORTCUT_EXPANSION_MAX,
  NINA_SHORTCUT_LABEL_MAX,
  NINA_TRIGGER_MAX,
  describeKind,
  formatFired,
  type ShortcutField,
  type ShortcutRow,
} from '@/lib/admin/shortcutModel'
import { cn } from '@/lib/cn'

/**
 * **R1's surface, in one element**: *"in shortcuts admin can add shortcuts that entails some
 * situations or what miftah and nina were doing."*
 *
 * It is `MemoryTable.tsx` with different columns, and that is deliberate rather than lazy: the two
 * pages are operated in the same session, by the same thumb, and a second set of table mechanics
 * would be a second set of ways to lose an edit. Everything below that is not about shortcuts —
 * the cell tokens, the blur-to-save rule, the optimism rule, the delete control — is that file's,
 * with its reasoning kept where it is load-bearing and pointed at where it is not.
 *
 * ── WHY THIS FILE NAMES NOTHING UNDER `lib/nina/` ───────────────────────────────────────────
 * The three caps below come from `@/lib/admin/shortcutModel`, which re-exports them from
 * `lib/nina/shortcuts.ts`. It could have imported them from there directly — that module is
 * zero-import and therefore client-safe — and it deliberately does not.
 * `lib/admin/shortcutModel.ts`'s header has the argument; `tests/admin.shortcuts.test.ts` asserts
 * that this file names no `@/lib/nina/` specifier at all.
 *
 * ── AND WHY THERE IS NO CONFIRMATION ────────────────────────────────────────────────────────
 * Invariant 6, and the owner's sentence in `lib/admin/memoryActions.ts`'s header. The `✕` deletes
 * on the first click. The test asserts the absence of `window.confirm`, `<dialog`, `showModal` and
 * the rest, because "no second step" is a property a future edit can quietly reintroduce.
 */

/** The row id under which the add row's result is stored. Not a `ShortcutRow`; it has no id yet. */
const ADD_ROW_ID = 'add:shortcut'

/**
 * `CONTROL_CLASS`'s tokens at table density — the same string `MemoryTable.tsx` uses, and its
 * docstring is the full argument. The two rules that must not be softened here, because this page
 * is even more nothing-but-form-controls than that one:
 *
 *   · `text-base` below `lg` — 16 px. Safari zooms the viewport when a control smaller than that
 *     takes focus and leaves it zoomed. `app/globals.css` sets `font-size: max(16px, 1rem)` in
 *     `@layer base`, and a Tailwind utility sits in `@layer utilities`, which beats it — so a
 *     `text-[13px]` here would re-open the exact hole the global rule exists to close.
 *     13 px density returns at `lg`, where there is no viewport to zoom.
 *   · `min-h-11` — the 44 px tap target, back to `min-h-0` at `lg` so a long table is still one
 *     screen of scanning.
 */
const CELL_CONTROL =
  'min-h-11 w-full rounded-field bg-paper-2 px-2 py-1.5 text-base font-medium text-ink outline-none ' +
  'placeholder:font-normal placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent ' +
  'lg:min-h-0 lg:text-[13px]'

const CELL = 'border-t border-rule px-2 py-2 align-top'

/**
 * **`Fired`, below `lg`, is not there** — and it is the only column that goes.
 *
 * Five of the six are things the operator ACTS on: the trigger, the label, the expansion, the
 * on/off, and the delete. `Fired` is telemetry he READS — a count and a date, both answers to
 * "is this code dead?", which is a question asked at a desk and not with a thumb. It is
 * `MemoryTable`'s own reasoning for dropping Origin and When, applied to the one column here that
 * matches the description.
 *
 * ── AND IT IS DONE WITH `hidden lg:table-cell`, NOT A `<colgroup>` ──────────────────────────
 * `MemoryTable.tsx`'s header has the whole argument and it is not being re-litigated: a `<col>`
 * maps to a column by POSITION among the cells actually rendered, so hiding a `<td>` with
 * `display:none` slides every later column into the wrong `<col>`; and `display:none` on a `<col>`
 * is not defined to hide a column at all. The widths live on the `<th>`s, which carry them whether
 * the cell is rendered or not.
 */
const CELL_WIDE_ONLY = `${CELL} hidden lg:table-cell`

const HEAD_CELL = 'px-2 py-2 text-[11px] font-semibold tracking-[0.02em] text-ink-2'

const HEAD_CELL_WIDE_ONLY = `${HEAD_CELL} hidden lg:table-cell`

export function ShortcutTable({ userId, rows }: { userId: string; rows: readonly ShortcutRow[] }) {
  /*
   * The optimistic frame, and it is a plain filter — unlike the ledger's, where deleting one of the
   * eight closed slot keys leaves the KEY behind as a blank row. A shortcut has no closed
   * vocabulary: the row is gone, and nothing manufactures it again.
   */
  const [visible, markDeleted] = React.useOptimistic<readonly ShortcutRow[], string>(
    rows,
    (current, id) => current.filter((row) => row.id !== id),
  )

  const [results, setResults] = React.useState<Readonly<Record<string, AdminShortcutResult>>>({})
  const [, startTransition] = React.useTransition()

  const report = React.useCallback((rowId: string, result: AdminShortcutResult | null) => {
    setResults((previous) => {
      if (result === null) {
        if (previous[rowId] === undefined) return previous
        const next = { ...previous }
        delete next[rowId]
        return next
      }
      return { ...previous, [rowId]: result }
    })
  }, [])

  const run = React.useCallback(
    (rowId: string, action: () => Promise<AdminShortcutResult>) => {
      startTransition(async () => {
        report(rowId, await action())
      })
    },
    [report],
  )

  const remove = React.useCallback(
    (row: ShortcutRow) => {
      startTransition(async () => {
        // Inside the transition, which is what `useOptimistic` requires.
        markDeleted(row.id)
        const result = await deleteShortcutAction({ userId, id: row.id })
        // A successful delete says nothing: the row being gone IS the message.
        report(row.id, result.ok ? null : result)
      })
    },
    [markDeleted, report, userId],
  )

  return (
    /* `overscroll-x-contain`: without it, flicking the table past its right edge hands the
        remaining horizontal scroll to the page, and on iOS a horizontal overscroll at the left
        edge is the back-swipe gesture — so scrolling a table would navigate away from it. */
    <Card className="mt-8 overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[460px] border-collapse text-left lg:min-w-[1000px]">
        <caption className="sr-only">
          Every shortcut this account has. A trigger, what it is for, and the context it stands in
          for. A cell saves when you leave it; the on/off control saves the moment it changes; the
          delete control removes a row on the first click, with no confirmation. On a narrow screen
          the Fired column is not shown; the table scrolls sideways inside its own box.
        </caption>

        {/* No `<colgroup>` — the widths live on the header cells. `CELL_WIDE_ONLY`'s docstring has
            the argument. */}
        <thead>
          <tr className="bg-paper-2">
            <th scope="col" className={cn(HEAD_CELL, 'w-[96px] lg:w-[150px]')}>
              Trigger
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'w-[120px] lg:w-[220px]')}>
              Label
            </th>
            <th scope="col" className={HEAD_CELL}>
              Expansion
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'w-[76px] lg:w-[84px]')}>
              On
            </th>
            <th scope="col" className={cn(HEAD_CELL_WIDE_ONLY, 'lg:w-[132px]')}>
              Fired
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'w-[56px] lg:w-[48px]')}>
              <span className="sr-only">Delete</span>
            </th>
          </tr>
        </thead>

        <tbody>
          <AddRow
            userId={userId}
            result={results[ADD_ROW_ID]}
            onResult={(result) => report(ADD_ROW_ID, result)}
          />

          {visible.map((row) => (
            <Row
              key={row.id}
              userId={userId}
              row={row}
              result={results[row.id]}
              onRun={run}
              onReport={report}
              onDelete={remove}
            />
          ))}
        </tbody>
      </table>

      {visible.length === 0 && (
        <p className="mt-3 border-t border-rule pt-3 text-[11px] font-medium text-ink-3">
          No shortcuts yet. The row above is where the first one goes — a trigger he will actually
          type, and the whole scene it stands for.
        </p>
      )}

      {rows.length >= ADMIN_SHORTCUT_PAGE && (
        <p className="mt-3 border-t border-rule pt-3 text-[11px] font-medium text-ink-3">
          Showing the newest {ADMIN_SHORTCUT_PAGE}. Any older ones are still in the table and still
          fire; they are just not listed here.
        </p>
      )}
    </Card>
  )
}

function Row({
  userId,
  row,
  result,
  onRun,
  onReport,
  onDelete,
}: {
  userId: string
  row: ShortcutRow
  result: AdminShortcutResult | undefined
  onRun: (rowId: string, action: () => Promise<AdminShortcutResult>) => void
  onReport: (rowId: string, result: AdminShortcutResult | null) => void
  onDelete: (row: ShortcutRow) => void
}) {
  const [trigger, setTrigger] = React.useState(row.trigger)
  const [label, setLabel] = React.useState(row.label)
  const [expansion, setExpansion] = React.useState(row.expansion)

  /*
   * Each draft follows its prop, adjusted DURING RENDER rather than in an effect — React's own
   * recipe for "some state derives from a prop", and `react-hooks/set-state-in-effect` rejects the
   * alternative. The comparison is against the VALUE and never against the row object:
   * `revalidatePath` hands every row a fresh object on every write, so comparing identity would
   * wipe out a draft in a cell nobody had touched every time any other cell saved.
   *
   * `row.enabled` deliberately has NO draft. The select renders the prop, and the server's answer
   * is what changes it — an optimistic toggle would show "on" for a row the write is about to
   * refuse, and `MemoryTable`'s rule is that only the DELETE is optimistic.
   */
  const [lastTrigger, setLastTrigger] = React.useState(row.trigger)
  if (row.trigger !== lastTrigger) {
    setLastTrigger(row.trigger)
    setTrigger(row.trigger)
  }
  const [lastLabel, setLastLabel] = React.useState(row.label)
  if (row.label !== lastLabel) {
    setLastLabel(row.label)
    setLabel(row.label)
  }
  const [lastExpansion, setLastExpansion] = React.useState(row.expansion)
  if (row.expansion !== lastExpansion) {
    setLastExpansion(row.expansion)
    setExpansion(row.expansion)
  }

  /**
   * One commit path for all three text cells. `committed` is the prop — the last thing the server
   * agreed to — and `revert` puts the draft back to it.
   *
   * An emptied cell deliberately does NOT delete the row: a stray select-all-and-tab would destroy
   * a shortcut silently, and the one-click delete is four columns away. The refusal is reported
   * before the round trip, because the schema would make it anyway.
   */
  function commit(field: ShortcutField, draft: string, committed: string, revert: () => void) {
    if (draft === committed) return
    if (draft.trim().length === 0) {
      revert()
      onReport(row.id, {
        ok: false,
        error: `A shortcut's ${field} cannot be empty. Delete the row instead — one click, no confirmation.`,
      })
      return
    }
    onRun(row.id, () => saveShortcutCellAction({ userId, id: row.id, field, value: draft }))
  }

  /** `Escape` reverts the cell; `Cmd`/`Ctrl+Enter` commits without leaving it. */
  function keys(
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    revert: () => void,
  ) {
    if (event.key === 'Escape') {
      event.preventDefault()
      revert()
      onReport(row.id, null)
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  const revertTrigger = () => setTrigger(row.trigger)
  const revertLabel = () => setLabel(row.label)
  const revertExpansion = () => setExpansion(row.expansion)

  return (
    <tr className={cn(!row.enabled && 'opacity-60')}>
      <td className={CELL}>
        <input
          aria-label="Trigger"
          className={CELL_CONTROL}
          value={trigger}
          maxLength={NINA_TRIGGER_MAX}
          onChange={(event) => {
            setTrigger(event.target.value)
            if (result !== undefined) onReport(row.id, null)
          }}
          onBlur={() => commit('trigger', trigger, row.trigger, revertTrigger)}
          onKeyDown={(event) => keys(event, revertTrigger)}
        />
        {/* The folded key, which is what matching actually compares against. It is shown and not
            hidden because `✌️` and `✌` are the same shortcut and nothing else on the page says so. */}
        <code className="mt-1 block px-2 text-[11px] font-medium break-all text-ink-3">
          {row.matchKey}
        </code>
        <span className="mt-0.5 block px-2 text-[11px] font-medium text-ink-3">
          {describeKind(row.kind)}
        </span>
      </td>

      <td className={CELL}>
        <input
          aria-label="Label"
          className={CELL_CONTROL}
          value={label}
          maxLength={NINA_SHORTCUT_LABEL_MAX}
          placeholder="what this code is for"
          onChange={(event) => {
            setLabel(event.target.value)
            if (result !== undefined) onReport(row.id, null)
          }}
          onBlur={() => commit('label', label, row.label, revertLabel)}
          onKeyDown={(event) => keys(event, revertLabel)}
        />
      </td>

      <td className={CELL}>
        <textarea
          aria-label="Expansion"
          className={cn(CELL_CONTROL, 'resize-y leading-snug')}
          rows={2}
          value={expansion}
          maxLength={NINA_SHORTCUT_EXPANSION_MAX}
          onChange={(event) => {
            setExpansion(event.target.value)
            if (result !== undefined) onReport(row.id, null)
          }}
          onBlur={() => commit('expansion', expansion, row.expansion, revertExpansion)}
          onKeyDown={(event) => keys(event, revertExpansion)}
        />
        {result?.ok === false && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-red">{result.error}</p>
        )}
        {result?.ok === true && result.note !== undefined && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-accent">{result.note}</p>
        )}
      </td>

      <td className={CELL}>
        {/*
         * A `<select>` and not a checkbox, for two reasons that both come from files in this
         * directory. `CELL_CONTROL` gives it the 44 px target and the 16 px font for free, where a
         * checkbox would need both bolted on; and `docs/design-brief.md`'s *"a plain-text link,
         * never an icon button — unambiguous at a glance and an icon is a guess"* is the stance
         * `AdminNav` cites for refusing glyphs. "on" and "off" are two words that cannot be
         * misread. It saves on CHANGE, because a select's change IS the finished edit.
         */}
        <select
          aria-label="On or off"
          className={cn(CELL_CONTROL, 'appearance-none')}
          value={row.enabled ? 'on' : 'off'}
          onChange={(event) => {
            const next = event.target.value === 'on'
            onRun(row.id, () => toggleShortcutAction({ userId, id: row.id, enabled: next }))
          }}
        >
          <option value="on">on</option>
          <option value="off">off</option>
        </select>
      </td>

      <td className={cn(CELL_WIDE_ONLY, 'text-[11px] font-medium text-ink-3 tabular-nums')}>
        {formatFired(row.uses, row.lastUsedAt)}
      </td>

      <td className={cn(CELL, 'text-right')}>
        <button
          type="button"
          aria-label={`Delete the ${row.trigger} shortcut`}
          title="Delete this shortcut. No confirmation."
          className={cn(
            TOUCH_ICON,
            'rounded-field text-[15px] leading-none font-semibold text-ink-3',
            'transition-colors hover:bg-red/10 hover:text-red',
            'focus-visible:ring-2 focus-visible:ring-red focus-visible:outline-none',
          )}
          onClick={() => onDelete(row)}
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

/**
 * **The one add affordance, and it is a row of the table rather than a card above it.**
 *
 * It sits at the TOP, because the table is newest-first and the row just added should appear
 * immediately under the form that made it. `Enter` in either single-line cell and the `+` button
 * both commit; that is the FIRST click of a create, not a second click on anything.
 *
 * The expansion is a `<textarea>`, so `Enter` there means newline — it is up to 2000 characters of
 * scene and it will have paragraphs in it. `Cmd`/`Ctrl+Enter` commits from inside it, the same
 * chord the editable cells use.
 */
function AddRow({
  userId,
  result,
  onResult,
}: {
  userId: string
  result: AdminShortcutResult | undefined
  onResult: (result: AdminShortcutResult | null) => void
}) {
  const [trigger, setTrigger] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [expansion, setExpansion] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const ready =
    trigger.trim().length > 0 && label.trim().length > 0 && expansion.trim().length > 0

  function add() {
    if (!ready) return
    startTransition(async () => {
      const next = await addShortcutAction({ userId, trigger, label, expansion })
      onResult(next)
      if (next.ok) {
        setTrigger('')
        setLabel('')
        setExpansion('')
      }
    })
  }

  function clearResult() {
    if (result !== undefined) onResult(null)
  }

  /** `Enter` on a single-line cell adds. The textarea gets the chord instead. */
  function enterAdds(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      add()
    }
  }

  return (
    <tr className="bg-paper-2/40">
      <td className={CELL}>
        <input
          aria-label="The trigger to add"
          className={CELL_CONTROL}
          value={trigger}
          maxLength={NINA_TRIGGER_MAX}
          disabled={pending}
          placeholder="🍑"
          onChange={(event) => {
            setTrigger(event.target.value)
            clearResult()
          }}
          onKeyDown={enterAdds}
        />
      </td>

      <td className={CELL}>
        <input
          aria-label="What the new shortcut is for"
          className={CELL_CONTROL}
          value={label}
          maxLength={NINA_SHORTCUT_LABEL_MAX}
          disabled={pending}
          placeholder="what it is for"
          onChange={(event) => {
            setLabel(event.target.value)
            clearResult()
          }}
          onKeyDown={enterAdds}
        />
      </td>

      <td className={CELL}>
        <textarea
          aria-label="The context the new shortcut stands for"
          className={cn(CELL_CONTROL, 'resize-y leading-snug')}
          rows={2}
          value={expansion}
          maxLength={NINA_SHORTCUT_EXPANSION_MAX}
          disabled={pending}
          placeholder="The whole thing it stands in for. She is handed this verbatim, as an instruction, on the turn it fires."
          onChange={(event) => {
            setExpansion(event.target.value)
            clearResult()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              add()
            }
          }}
        />
        {result?.ok === false && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-red">{result.error}</p>
        )}
        {result?.ok === true && result.note !== undefined && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-accent">{result.note}</p>
        )}
      </td>

      <td className={cn(CELL, 'text-[11px] font-medium text-ink-3')}>on</td>

      <td className={cn(CELL_WIDE_ONLY, 'text-[11px] font-medium text-ink-3')}>
        New shortcuts start on. Nothing has fired yet.
      </td>

      <td className={cn(CELL, 'text-right')}>
        {/* `size="md"` IS `h-11` (`components/ui/Button.tsx:41-44`). No height override: two
            same-property utilities would leave the winner to Tailwind's emission order, which
            `lib/cn.ts` does not arbitrate. The 56 px column holds `h-11 px-4` plus a `+`. */}
        <Button
          size="md"
          className="text-[15px]"
          aria-label="Add this shortcut"
          loading={pending}
          disabled={!ready}
          onClick={add}
        >
          +
        </Button>
      </td>
    </tr>
  )
}
```

**Impact:** a second client table under `components/admin/`. It imports `@/lib/admin/shortcutActions`
and `@/lib/admin/shortcutModel` and nothing else from `lib/`.

---

### Step 6: `app/admin/shortcuts/page.tsx` — the route

**File:** `app/admin/shortcuts/page.tsx` (new)

**Change:** `app/admin/memory/page.tsx`'s shape: `force-dynamic`, `requireAdmin()`, `?user=` with
the signed-in admin as the default, `UserPicker`, rows built server-side, and the two-branch "no
such user" render sharing one `<Header>`.

**Code:**

```tsx
import { ShortcutTable } from '@/components/admin/ShortcutTable'
import { UserPicker } from '@/components/admin/UserPicker'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { ADMIN_SHORTCUT_PAGE, buildShortcutRows } from '@/lib/admin/shortcutModel'
import { adminReadShortcuts } from '@/lib/admin/shortcutStore'
import { getAdminUser, listAdminUsers } from '@/lib/admin/users'

/**
 * `/admin/shortcuts` — R1: *"i want a mechanism that is more explicit, that is shortcuts. in
 * shortcuts admin can add shortcuts that entails some situations or what miftah and nina were
 * doing."*
 *
 * ── ONE ROUTE, A `?user=` PARAM ─────────────────────────────────────────────────────────────
 * `/admin/memory`'s ruling, unchanged: there is one user today, so `/admin/shortcuts/[userId]`
 * would make the picker a mandatory click-through past a list of one. The page is nonetheless
 * per-user in every respect — the param is validated, `getAdminUser` confirms the account exists,
 * and every read and write takes that id FIRST (invariant 5). Absent `?user`, the default is the
 * signed-in admin's own id.
 *
 * `PageProps<'/admin/shortcuts'>` is Next 16's globally available helper — not an import — and
 * `searchParams` is a PROMISE that must be awaited
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, "Page Props
 * Helper" and "searchParams (optional)"). `npm run typecheck` runs `next typegen` first, which is
 * what generates the literal for this new route.
 *
 * ── `force-dynamic` ─────────────────────────────────────────────────────────────────────────
 * Per-request state that must reflect the action that just ran, exactly like `/admin/memory` and
 * `/admin/nina`. Each action's `revalidatePath('/admin/shortcuts')` makes that immediate, and the
 * re-rendered payload rides back in the action's own response.
 *
 * ── WHY THE ROWS ARE BUILT HERE AND NOT IN THE TABLE ────────────────────────────────────────
 * `adminReadShortcuts` is `server-only` and hands back `Date`s. Building the rows here means
 * `ShortcutTable` receives plain serializable props and imports one `lib/admin` module with no
 * value import except three numbers — so no drizzle table and no zod schema is ever bundled for
 * the browser. `tests/admin.shortcuts.test.ts` asserts that structurally rather than intending it.
 */

export const dynamic = 'force-dynamic'

export default async function AdminShortcutsPage(props: PageProps<'/admin/shortcuts'>) {
  const { userId: adminUserId } = await requireAdmin()

  const search = await props.searchParams
  const requested = typeof search.user === 'string' ? search.user : null
  const targetId = requested ?? adminUserId

  const [users, target] = await Promise.all([listAdminUsers(), getAdminUser(targetId)])

  if (target == null) {
    return (
      <div>
        <Header />
        <UserPicker users={users} selectedId={null} basePath="/admin/shortcuts" />
        <p className="mt-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          No account with that id. Pick one above — this is &ldquo;whose shortcuts&rdquo;, not
          &ldquo;no shortcuts&rdquo;.
        </p>
      </div>
    )
  }

  // `ShortcutSource` carries `Date`s; a `ShortcutRow` carries ISO strings, so nothing about
  // serialization depends on how the RSC boundary treats `Date` today.
  const rows = buildShortcutRows(await adminReadShortcuts(target.id, ADMIN_SHORTCUT_PAGE))

  return (
    <div>
      <Header />
      <UserPicker users={users} selectedId={target.id} basePath="/admin/shortcuts" />
      <ShortcutTable userId={target.id} rows={rows} />
    </div>
  )
}

/**
 * Split out only so the "no such user" branch and the normal branch share it verbatim. It says the
 * three things the operator has to know before touching anything: this writes production, she reads
 * it on her very next message, and a shortcut only fires when its trigger is in something HE typed.
 */
function Header() {
  return (
    <header className="mb-5 lg:mb-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Shortcuts</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
        A short <strong>trigger</strong> and the whole long context it stands in for. A cell saves
        when you leave it, on/off saves the moment it changes, and a row deletes on one click — no
        confirmation anywhere. Edits here write production and she reads them on her very next
        message; there is no distillation pass and no cache in between. A shortcut fires only when
        its trigger appears in something <strong>you</strong> type — never in something she says —
        and a message with no trigger in it carries none of this at all.
      </p>
    </header>
  )
}
```

**Impact:** `existsSync('app/admin/shortcuts/page.tsx')` is true, which is what
`tests/admin.shell.test.ts`'s *"points every entry at a route that exists"* case needs from Step 7.

---

### Step 7: `components/admin/AdminNav.tsx` — the sixth cell

**File:** `components/admin/AdminNav.tsx` — `:25-27`, `:36-38`, `:51-57`, `:59-87`, `:101`,
`:107-120`, `:121`

**Change:** One `LINKS` entry, `grid-cols-5` -> `grid-cols-6`, and every docstring that counts the
cells re-counted. `h-14` does **not** change, so `app/admin/layout.tsx`'s
`pb-[calc(5rem+var(--safe-bottom))]` does not either.

**The arithmetic, once:** the XS Max is 414 px, `max-w-[470px]` is a no-op there. Six cells share
414 px, so a cell is **69 px** and its content box **61 px** after `px-1`. Eight characters of
Poppins semibold at `text-[11px]` measure ≈ **51 px**, leaving ≈ **10 px**. At the 470 px cap a cell
is 78.3 px. `'Shortcut'` is exactly 8 characters and sits exactly on the ceiling, which stays 8.

> **A trap when editing this file.** `tests/admin.shell.test.ts` reads the WHOLE source for the
> `hrefs` (`/href: '(\/admin[^']*)'/g`) and `shorts` (`/short: '([^']*)'/g`) matches — only the two
> geometry cases go through `classNames()`. So a docstring must never contain the literal
> `href: '/admin…'` or `short: '…'`. None of the existing ones do; none of the new prose below
> does either. Keep it that way.

**Code — `:25-27`, inside the "IT IS NOT `TabBar`" paragraph:**

```
 * runner's five-cell `<TabBar />`, and *"an admin tool that borrows it invites the runner to tap
 * into it"*. That argument is about the runner's five tabs appearing on an admin page, not about
 * the shape of a bottom bar, and it still stands: this bar carries the six admin routes and
```

**Code — `:36-38`, inside "WHY THE BOTTOM":**

```
 * move back to a phone too. What a 414 px viewport does force is length: six cells share 414 px,
 * so each gets 69 px — down from ~82.8 px at five and ~103 px at four — and neither "Nina's album"
 * nor "Personality" fits. `LINKS` therefore carries BOTH strings — the phone one renders below
 * `lg`, the desktop one at `lg` —
```

(the rest of that sentence, `so the pair cannot drift the way two hard-coded lists would.`, is
unchanged; note the two field names had to leave the prose here to keep the `short:` regex honest —
they were already only in backticks, and backticks do not carry a colon, so **either wording is
safe**; the reworded version above is the one to write.)

**Code — the full replacement for the `LINKS` docstring and array, `:50-87`:**

```ts
/**
 * The six routes, longest label first in each pair.
 *
 * The phone label is not an abbreviation for its own sake: at `text-[11px]` in a 69 px cell —
 * 414 px shared six ways on the XS Max this bar was rebuilt for — anything past ~8 characters wraps
 * or clips, and a clipped nav label is worse than a shorter true one. `tests/admin.shell.test.ts`
 * holds the 8-character ceiling, tightened from 10 when the fifth cell landed and NOT loosened when
 * the sixth did: 8 characters of Poppins semibold at 11 px measure ≈ 51 px against a 61 px content
 * box (69 px less `px-1`), so there are ≈ 10 px left. All six clear it — Overview 8, Album 5,
 * Persona 7, Photos 6, Memory 6, Shortcut 8 — and two of them are now exactly on it. A seventh
 * route is 59 px a cell and 51 px of content box, which does not fit eight characters; that is what
 * the next person to add one is spending.
 */
const LINKS = [
  { href: '/admin', label: 'Overview', short: 'Overview' },
  { href: '/admin/nina', label: "Nina's album", short: 'Album' },
  /*
   * The character tuning, which used to be a shut disclosure on the album route until the user
   * asked for it as its own tab: *"move it as a new tab with name: Personality"*. It sits between
   * the album and the chat photos because it is the third thing about HER, and the two photo
   * routes stay adjacent below it.
   *
   * The phone label is "Persona" and not "Personality": eleven characters do not fit a 69 px
   * cell at `text-[11px]`, and this pair of strings exists for exactly that. It is a true short
   * form of the word rather than an invented abbreviation — `docs/nina/persona.md` is what this
   * page edits.
   */
  { href: '/admin/personality', label: 'Personality', short: 'Persona' },
  /*
   * R2's route. Deliberately named for the CONVERSATION and not for the person: `/admin/nina` is
   * `nina_avatars` (her profile album) and this one is `nina_message_images` (the photographs in
   * the chat). Two different tables, near each other in the nav so the distinction is legible, and
   * the labels are the only thing carrying it — which is the reason the segment can stay
   * `/admin/photos`.
   *
   * The phone pair had to keep that distinction alive, which is why they are "Album" and "Photos"
   * and not two glyphs: they are still two different words for two different sets, where an icon
   * pair would have been a guess at both.
   */
  { href: '/admin/photos', label: 'Chat photos', short: 'Photos' },
  { href: '/admin/memory', label: 'Memory', short: 'Memory' },
  /*
   * `nina-emoji-shortcuts` R1's route, and it goes LAST because it is the newest surface and
   * Memory is the one it grew out of: most of the rows in the production memory ledger were
   * shortcuts written in prose, for want of anywhere else to put them, and this page is where they
   * stop being that. Adjacency to Memory is the whole of what tells the operator these two are
   * related.
   *
   * The phone label is the singular "Shortcut". Not an invented abbreviation — the plural is nine
   * characters and the ceiling is eight, and a cell reads as a label for the thing you will be
   * looking at rather than as a count. It is the only pair here where the two strings differ by
   * grammatical number rather than by word.
   */
  { href: '/admin/shortcuts', label: 'Shortcuts', short: 'Shortcut' },
] as const
```

**Code — `:101`, the eyebrow comment:**

```
      {/* The eyebrow is desktop-only: a 56 px bar has room for six words and no room for a
          line above them. */}
```

**Code — `:107-120`, the `h-14` comment (the two counted sentences):**

```
       * `h-14` — 56 px, comfortably past `docs/design-brief.md`'s 44 pt minimum once the cell is
       * the whole target. The CELL COUNT has now changed twice — the fifth route and the sixth —
       * and the HEIGHT deliberately did not either time: more cells make the row narrower per
       * cell, not shorter. **If this class changes, change `app/admin/layout.tsx`'s
       * `pb-[calc(5rem+var(--safe-bottom))]` with it**: Tailwind cannot read a constant, so the
       * geometry is spelled in two files by necessity and `tests/admin.shell.test.ts` is what stops
       * them drifting apart. `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a comment
       * for exactly this reason.
       *
       * `max-w-[470px] mx-auto` is `TabBar`'s row, borrowed: it is a no-op at 414 px and it is
       * what stops six cells stretching to 150 px each on a landscape phone or a small tablet,
       * both of which are still below `lg`. At the cap each cell is 78.3 px; at 414 px, 69 px.
```

**Code — `:121`, the one class change:**

```tsx
      <ul className="mx-auto grid h-14 w-full max-w-[470px] grid-cols-6 lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1">
```

**Impact:** the bar has six cells. `h-14` is unchanged, so the layout's clearance still passes
`tests/admin.shell.test.ts`'s *"reserves more room than the bar occupies"* (80 px > 57 px) and
*"gives the bar a tap target past the 44pt minimum"* (56 ≥ 44).

---

### Step 8: `components/admin/UserPicker.tsx` — an optional `basePath`

**File:** `components/admin/UserPicker.tsx:15-24` (the props) and `:37` (the `href`)

**Change:** one optional, defaulted prop. **This is a deliberate, minimal deviation from the brief's
"reuse `UserPicker` unmodified", and here is the reason:** the component hardcodes
`` href={`/admin/memory?user=${…}`} ``. Rendered unmodified on `/admin/shortcuts` it becomes a
picker that navigates *away* from the page it is picking for — one tap and the operator is on
`/admin/memory`. There is no third option that is both unmodified and correct: `usePathname()` would
turn a Server Component into a Client Component to fix a string, which is the exact thing
`components/admin/.workflows/package_readme.md:1072` forbids by name for this component; and
duplicating the pill row in the shortcuts page would be two pickers to keep in step.

The change is additive, defaulted, and touches no existing call site — `app/admin/memory/page.tsx:58`
and `:87` compile unchanged. **No other phase in this set touches this file** — confirmed at
reconciliation by sweeping all four plans; `UserPicker` appears in phase 3 and nowhere else. The
deviation is accepted and this file is counted in the index's Files column for this phase (10, not
the draft's 9).

**Code — the replacement for `:15-24`:**

```tsx
export function UserPicker({
  users,
  selectedId,
  basePath = '/admin/memory',
}: {
  users: readonly AdminUserRow[]
  selectedId: string | null
  /**
   * Which per-user admin route the pills navigate within. Defaults to `/admin/memory`, which is
   * where this component was born and its only caller until `/admin/shortcuts`.
   *
   * It is a PROP and not a `usePathname()` read, because
   * `components/admin/.workflows/package_readme.md` names this component in the rule: *"Do not add
   * active-link highlighting to `AdminNav` or `UserPicker`. `usePathname()` would turn a static nav
   * into a Client Component to bold one word."* Going client to fix a href would be the same trade
   * for less. Both callers are Server Components and both already know their own route.
   *
   * The counts in each pill stay MEMORY counts — `AdminUserRow` is `lib/admin/users.ts`'s shape and
   * says how many slots and ledger rows an account has. On `/admin/shortcuts` that is still a true
   * statement about the account, just not about this page; adding a shortcut count would mean
   * widening `listAdminUsers` and `getAdminUser`, which are `/admin/memory`'s and are not this
   * phase's to change.
   */
  basePath?: string
}) {
```

**Code — the replacement for the `href` at `:37`:**

```tsx
            href={`${basePath}?user=${encodeURIComponent(user.id)}`}
```

**Impact:** none on `/admin/memory` — the default reproduces the previous string exactly.

---

### Step 9: `tests/admin.shell.test.ts` — the three assertions that encode the cell count

**File:** `tests/admin.shell.test.ts:103-109`, `:115-125`, `:167-179`

**Change:** the `hrefs` array gains its sixth element, `shorts` goes 5 -> 6, and the bar regex goes
`grid-cols-5` -> `grid-cols-6`. The **8-character ceiling stays 8**. The comment carries the
arithmetic, because the existing one does the same job for the fifth cell and that is what tells the
next person what a seventh costs.

**Code — the replacement for `:101-113` (the whole `it`):**

```ts
  it('points every entry at a route that exists', () => {
    const hrefs = [...adminNav.matchAll(/href: '(\/admin[^']*)'/g)].map((m) => m[1])
    expect(hrefs).toEqual([
      '/admin',
      '/admin/nina',
      '/admin/personality',
      '/admin/photos',
      '/admin/memory',
      '/admin/shortcuts',
    ])
    for (const href of hrefs) {
      expect(existsSync(`${ROOT}app${href}/page.tsx`), `${href} has no page.tsx`).toBe(true)
    }
  })
```

**Code — the replacement for `:115-129` (the whole `it`, comment included):**

```ts
  it('carries a phone label short enough for a 69px cell', () => {
    // 414px / 6 cells = 69px, down from 82.8px at five and 103px at four. The ceiling did NOT move
    // with the sixth cell and it is worth writing down why, because the next route is where this
    // stops being free:
    //
    //   cell           414 / 6            = 69.0px
    //   content box    69 - px-1 (4+4)    = 61.0px
    //   8 characters   Poppins semibold, text-[11px], ~6.4px/char measured on the existing
    //                  "Overview" cell    = ~51.0px
    //   slack                             = ~10.0px
    //
    // So 8 still fits, and two labels now sit exactly on it — Overview 8, Album 5, Persona 7,
    // Photos 6, Memory 6, Shortcut 8. A SEVENTH route makes the cell 59.1px and the content box
    // 51.1px, which is the width of the eight characters themselves with nothing to spare: the
    // ceiling has to come down to 7 the day that happens, and two of the six labels above would
    // have to be reworded to meet it. That is the cost, stated before it is spent.
    //
    // `m[1]!` per `tests/tabbar.geometry.test.ts:86`, the sibling guard this file borrows its
    // shape from: a capture group that matched is a string, and `noUncheckedIndexedAccess`
    // cannot see that.
    const shorts = [...adminNav.matchAll(/short: '([^']*)'/g)].map((m) => m[1]!)
    expect(shorts).toHaveLength(6)
    for (const short of shorts) {
      expect(short.length, `"${short}" will not fit a nav cell`).toBeLessThanOrEqual(8)
    }
  })
```

**Code — the replacement for `:158-182` (the describe's preamble, the two `const`s and the first
`it`; the two numeric cases below them are unchanged):**

```ts
describe('the bar and the padding that clears it', () => {
  /*
   * THE CASE THIS FILE EXISTS FOR. The bar's height lives in `AdminNav`'s `h-14` and the clearance
   * under `<main>` lives in the layout's `pb-[calc(5rem+var(--safe-bottom))]`; Tailwind can read
   * neither from a TypeScript constant, so the geometry is spelled twice by necessity —
   * `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a comment for the same reason. If the
   * bar grows and the padding does not, the last card of every admin page sits under it, on the one
   * device this phase was written for.
   *
   * The matched shape is `TabBar`'s own formatted row (`grid h-[58px] w-full max-w-[470px]
   * grid-cols-5`) with this bar's numbers in it, so the class sorter produces it rather than
   * breaking it. The column count parted ways with `TabBar`'s when the Shortcuts cell landed —
   * six here, five there — which is the coupling this comment always denied existing: this bar
   * carries the admin routes and may never carry the runner's.
   */
  const bar = navClasses.match(/grid h-(\d+) w-full max-w-\[470px\] grid-cols-6/)
  const clearance = layoutClasses.match(/pb-\[calc\((\d+(?:\.\d+)?)rem\+var\(--safe-bottom\)\)\]/)

  it('spells both halves in the shape this case can read', () => {
    expect(
      bar,
      'AdminNav lost its `grid h-<n> w-full max-w-[470px] grid-cols-6` row',
    ).not.toBeNull()
    expect(clearance, 'the admin layout lost its --safe-bottom clearance on <main>').not.toBeNull()
  })
```

**Impact:** the three assertions move together, as they must — any one alone fails.

---

### Step 10: `tests/admin.shortcuts.test.ts` — the pure half and the structural half

**File:** `tests/admin.shortcuts.test.ts` (new)

**Change:** `tests/admin.memory.test.ts`'s two halves, transposed. The pure half drives
`buildShortcutRows`, `formatFired` and `describeKind`; the structural half reads sources and asserts
the boundaries — including the value-import decision from Step 1, spelled out as three cases.

**Code:**

```ts
import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_SHORTCUT_PAGE,
  NINA_SHORTCUT_EXPANSION_MAX,
  NINA_SHORTCUT_LABEL_MAX,
  NINA_TRIGGER_MAX,
  SHORTCUT_FIELDS,
  buildShortcutRows,
  describeKind,
  formatFired,
  type ShortcutSource,
} from '@/lib/admin/shortcutModel'

/**
 * `/admin/shortcuts`'s testable surface — R1's exit criteria, encoded.
 *
 * The structural half at the bottom reads source files and asserts boundaries, the same technique
 * and the same reason as `tests/admin.memory.test.ts` and `tests/nina.distill.test.ts` case 14:
 * *a structural guarantee that is only a comment decays.* Three of those properties are the ones
 * this phase was most able to get wrong — the two derived columns must not be reachable from a
 * payload, the client table must not name a `lib/nina` module, and there must be no second click
 * anywhere on the page.
 */

const SOURCE: ShortcutSource = {
  id: 's1',
  trigger: '🍑',
  matchKey: '🍑',
  kind: 'glyph',
  label: 'remes pantat',
  expansion: 'ahh remes pantat aku sayang',
  enabled: true,
  uses: 3,
  lastUsedAt: new Date('2026-09-05T04:31:00Z'),
  createdAt: new Date('2026-09-01T00:00:00Z'),
}

describe('the bounds this page renders against', () => {
  it('re-exports phase 1s three caps rather than retyping them', () => {
    // The numbers are phase 1's; asserting them here is what catches a re-export that silently
    // stopped resolving (an `export … from` of a name that no longer exists is a build error, but
    // an export of the WRONG name is not).
    expect(NINA_TRIGGER_MAX).toBe(16)
    expect(NINA_SHORTCUT_LABEL_MAX).toBe(80)
    expect(NINA_SHORTCUT_EXPANSION_MAX).toBe(2000)
  })

  it('renders one page of the table, and the ledgers number is the one it borrows', () => {
    expect(ADMIN_SHORTCUT_PAGE).toBe(200)
  })

  it('names the three editable cells once, in a stable order', () => {
    expect(SHORTCUT_FIELDS).toEqual(['trigger', 'label', 'expansion'])
  })
})

describe('buildShortcutRows', () => {
  it('turns every Date into an ISO string and changes nothing else', () => {
    const [row] = buildShortcutRows([SOURCE])
    expect(row).toEqual({
      id: 's1',
      trigger: '🍑',
      matchKey: '🍑',
      kind: 'glyph',
      label: 'remes pantat',
      expansion: 'ahh remes pantat aku sayang',
      enabled: true,
      uses: 3,
      lastUsedAt: '2026-09-05T04:31:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
    })
  })

  it('keeps a never-fired row, with a null instant rather than an epoch', () => {
    const [row] = buildShortcutRows([{ ...SOURCE, uses: 0, lastUsedAt: null }])
    expect(row?.lastUsedAt).toBeNull()
    expect(row?.uses).toBe(0)
  })

  it('keeps a disabled row — off is not deleted, and the table still renders it', () => {
    const [row] = buildShortcutRows([{ ...SOURCE, enabled: false }])
    expect(row?.enabled).toBe(false)
  })

  it('preserves order, because the store already decided it', () => {
    const rows = buildShortcutRows([SOURCE, { ...SOURCE, id: 's2' }, { ...SOURCE, id: 's3' }])
    expect(rows.map((row) => row.id)).toEqual(['s1', 's2', 's3'])
  })

  it('gives every row a unique id, because it is the React key and the result-map key', () => {
    const rows = buildShortcutRows([SOURCE, { ...SOURCE, id: 's2' }])
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
  })
})

describe('formatFired', () => {
  it('says never rather than zero, because zero is not the question being asked', () => {
    expect(formatFired(0, null)).toBe('never')
    // A stale instant with a zeroed count is still "never": the count is what the sentence is about.
    expect(formatFired(0, '2026-09-05T04:31:00.000Z')).toBe('never')
  })

  it('reads as a count and a day', () => {
    expect(formatFired(3, '2026-09-05T04:31:00.000Z')).toBe('3× · 2026-09-05')
  })

  it('drops the day when there is a count and no instant', () => {
    expect(formatFired(3, null)).toBe('3×')
  })
})

describe('describeKind', () => {
  it('explains the boundary rule, which is the one thing about kind that surprises people', () => {
    expect(describeKind('glyph')).toMatch(/anywhere/i)
    expect(describeKind('word')).toMatch(/inside a longer word/i)
  })
})

/* ── the structural half ────────────────────────────────────────────────────────────────────── */

const MODEL = 'lib/admin/shortcutModel.ts'
const STORE = 'lib/admin/shortcutStore.ts'
const ACTIONS = 'lib/admin/shortcutActions.ts'
const SCHEMA = 'lib/admin/schema.ts'
const TABLE = 'components/admin/ShortcutTable.tsx'
const PURE = 'lib/nina/shortcuts.ts'

const read = (path: string) => readFileSync(path, 'utf8')

describe('the derived columns cannot be forgotten, and cannot be supplied', () => {
  it('leaves the derivation to the query layer and does not classify anything itself', () => {
    // `lib/nina/queries.ts` derives `match_key` and `kind` from `trigger` inside every write, and
    // `NinaShortcutInsert` / `NinaShortcutPatch` have NO FIELD for either — so this file could not
    // supply a mismatched key even by accident. That guarantee is the compiler's, and it is
    // stronger than the one this phase originally planned (two calls in this file, remembered by
    // hand). What is left for a test is the observable half: the classifier is not here at all.
    //
    // Read against the CODE with comments stripped, `lib/nina/shortcuts.test.ts`'s technique and
    // for the identical reason: the store's header names `classifyNinaTrigger` in the very
    // sentence that explains why it is absent, and deleting that sentence to satisfy a substring
    // search would delete the reason the rule exists. This is the same trap
    // `tests/admin.shell.test.ts`'s `classNames()` helper exists for.
    const code = read(STORE)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('classifyNinaTrigger')

    // The two `normalizeNinaTrigger` calls that DO remain are the empty-trigger QUESTION — one in
    // the insert path, one in the trigger branch of the cell save — and not derivations. Neither
    // result is passed to the query layer; both only decide whether to answer `'empty'`. A third
    // is either a new write path (fine, extend this) or a derivation creeping back in (not fine).
    expect(code.match(/normalizeNinaTrigger\(/g)).toHaveLength(2)

    // And neither derived column is handed DOWN. `matchKey` appears once in this file, in
    // `adminReadShortcuts`' projection of a row it read; it never appears inside a write call.
    for (const write of ['insertNinaShortcut(', 'updateNinaShortcut(']) {
      const calls = code.split(write).slice(1)
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) {
        const args = call.slice(0, call.indexOf('\n\n') === -1 ? 200 : call.indexOf('\n\n'))
        expect(args, `${write} must not be handed a derived column`).not.toContain('matchKey')
        expect(args, `${write} must not be handed a derived column`).not.toMatch(/\bkind\b/)
      }
    }
  })

  it('leaves nowhere in the payload to put either of them', () => {
    // The zod section: no field for the folded key, no field for the classification. Anchored to
    // the section banner so the memory schemas above it are not searched, and asserted on the
    // CAMEL-CASE spelling and on the property form, because the section's own prose has to be able
    // to explain the rule without failing it — the same trap `tests/admin.shell.test.ts`'s
    // `classNames()` helper exists for.
    const section = read(SCHEMA).slice(read(SCHEMA).indexOf('nina-emoji-shortcuts phase 3'))
    expect(section.length).toBeGreaterThan(0)
    expect(section).not.toContain('matchKey')
    expect(section).not.toMatch(/\bkind:/)

    const actions = read(ACTIONS)
    expect(actions).not.toContain('matchKey')
    expect(actions).not.toMatch(/\bkind:/)
  })

  it('routes every shortcut write through shortcutStore, never straight at the query layer', () => {
    const source = read(ACTIONS)
    expect(source).not.toMatch(/from '@\/lib\/nina\/queries'/)
    for (const writer of ['insertNinaShortcut', 'updateNinaShortcut', 'deleteNinaShortcut']) {
      expect(source).not.toContain(writer)
    }
  })

  it('keeps every shortcut write inside shortcutStore, and nowhere else under lib/admin', () => {
    // The writers live in `lib/nina/queries.ts` and exactly one `lib/admin` module may name them.
    // The old form of this case looked for `.insert(ninaShortcuts` and now passes vacuously — no
    // module under `lib/admin` touches the drizzle table at all — so it looks for the IMPORTS
    // instead, which is what a second writer would actually need.
    for (const entry of readdirSync('lib/admin', { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
      if (entry.name === 'shortcutStore.ts') continue
      const source = read(`lib/admin/${entry.name}`)
      for (const writer of ['insertNinaShortcut', 'updateNinaShortcut', 'deleteNinaShortcut']) {
        expect(source, `lib/admin/${entry.name} must not call ${writer}`).not.toContain(writer)
      }
      expect(source, `lib/admin/${entry.name} must not write nina_shortcuts`).not.toMatch(
        /\.(insert|update|delete)\(\s*ninaShortcuts/,
      )
    }
  })

  it('keeps the store on the server', () => {
    expect(read(STORE).startsWith("import 'server-only'")).toBe(true)
  })

  it('reads the registry through the query layer, not a second statement of its own', () => {
    const source = read(STORE)
    // One read exists in the tree and it is `lib/nina/queries.ts`'s. A `db.select` reappearing here
    // is the duplicate the reconciliation removed: `NinaShortcutRecord` already carries every
    // column this page renders, so a second statement can only fall behind the schema.
    expect(source).toContain('listNinaShortcuts')
    expect(source).not.toContain('db.select')
    expect(source).not.toContain("from '@/lib/db/schema'")
  })

  it('catches the unique violation instead of selecting first', () => {
    const source = read(STORE)
    // The rule from `lib/db/.workflows/package_readme.md`: "Never check-then-insert against a
    // unique index." A pre-flight read would race itself — and `insertNinaShortcut` THROWS the
    // 23505 precisely so this file can turn it into a sentence.
    expect(source).toContain('isUniqueViolation')
    expect(source).toContain('nina_shortcuts_user_match_unq')
    expect(source).not.toMatch(/\.where\([^)]*ninaShortcuts\.matchKey/)
  })
})

describe('the client boundary — one door, and it is shortcutModel', () => {
  it('lets shortcutModel through with exactly one value import, and it is the pure module', () => {
    const source = read(MODEL)

    // Every module specifier this file reaches for, however the statement is wrapped. Two of them
    // exist and both name the same module: one `import type` for the kind union, one value
    // re-export for the three caps. Matching the specifier rather than the statement keeps this
    // independent of how prettier wraps a multi-line `export { … } from '…'`.
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(specifiers).toEqual(['@/lib/nina/shortcuts', '@/lib/nina/shortcuts'])

    // And exactly one of the two is a value statement. `import type` may not be the thing that
    // carries the caps, and a plain `import {…}` of them would be a value import with no
    // re-export — both would still satisfy the check above, and neither is the shape argued for in
    // this module's header.
    expect(source.match(/^import type /gm)).toHaveLength(1)
    expect(source.match(/^export \{$/gm)).toHaveLength(1)
    expect(source).not.toMatch(/^import \{/m)
  })

  it('rests on lib/nina/shortcuts.ts having zero imports, so it asserts that too', () => {
    // Phase 1's invariant 4, re-asserted here because this file is one of the two things that
    // depend on it: the re-export above is only safe while that module pulls nothing into the
    // bundle behind it, and phase 4's `.mjs` importer only BOOTS while the same holds. One rule,
    // two consumers, asserted in all three places.
    const source = read(PURE)
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/\brequire\(/)
  })

  it('keeps the table client-safe: it names no lib/nina module and no server-only module', () => {
    const source = read(TABLE)
    for (const banned of [
      "from 'zod'",
      '@/lib/db/schema',
      '@/lib/db',
      '@/lib/nina/',
      '@/lib/admin/shortcutStore',
      '@/lib/admin/schema',
      '@/lib/admin/users',
    ]) {
      expect(source, `${TABLE} must not name ${banned}`).not.toContain(banned)
    }
  })

  it('hides the telemetry column with table-cell utilities and not a colgroup', () => {
    const source = read(TABLE)
    // `MemoryTable.tsx`'s header has the argument: a `<col>` maps to a column by position among
    // the cells actually rendered, so hiding a `<td>` slides every later column into the wrong
    // `<col>`; and `display:none` on a `<col>` is not defined to hide a column at all.
    expect(source).not.toContain('<colgroup')
    expect(source).toContain('hidden lg:table-cell')
  })

  it('keeps every control 16px and 44px below lg, on a page that is nothing but controls', () => {
    const source = read(TABLE)
    // Safari zooms the viewport when a control under 16px takes focus, and leaves it zoomed.
    // `CELL_CONTROL`'s docstring in `MemoryTable.tsx` has the cascade argument.
    expect(source).toContain('text-base')
    expect(source).toContain('min-h-11')
    expect(source).toContain('lg:min-h-0')
    expect(source).toContain('lg:text-[13px]')
  })
})

describe('R1 — no confirmation, anywhere on this page', () => {
  it('never asks a second time', () => {
    const source = read(TABLE)
    for (const banned of [
      'window.confirm',
      'PURGE',
      '<dialog',
      'showModal',
      'Are you sure',
      'confirming',
    ]) {
      expect(source, `${TABLE} must not contain "${banned}"`).not.toContain(banned)
    }
  })

  it('exports exactly the four actions the table calls', () => {
    const exported = [...read(ACTIONS).matchAll(/^export async function (\w+)/gm)].map(
      ([, name]) => name,
    )
    expect(exported.sort()).toEqual([
      'addShortcutAction',
      'deleteShortcutAction',
      'saveShortcutCellAction',
      'toggleShortcutAction',
    ])
  })

  it('keeps requireAdmin, Zod and the revalidate at every one of those four boundaries', () => {
    const source = read(ACTIONS)
    expect(source.match(/\.safeParse\(input\)/g)).toHaveLength(4)
    // Anchored to the STATEMENT form (start of line, two-space body indent) so the numbered list in
    // this module's own header does not count as a fifth call site.
    expect(source.match(/^ {2}await requireAdmin\(\)$/gm)).toHaveLength(4)
    expect(source.match(/revalidatePath\('\/admin\/shortcuts'\)/g)).toHaveLength(4)
  })

  it('names the trigger when the unique index refuses it', () => {
    const source = read(ACTIONS)
    const refusal = source.slice(source.indexOf('function refusal'))
    expect(refusal).toContain('${trigger}')
  })
})
```

**A note for whoever implements the "one door" case.** The two-statement `specifiers` assertion above
depends on prettier's formatting of a multi-line `export { … } from '…'`, whose closing line is
`} from '@/lib/nina/shortcuts'`. The regex is written `[\s\S]*?` with the `m` flag so it spans the
braces. **Run it and read the failure before adjusting the source** — if prettier formats the block
differently than expected, fix the regex, never the module's shape.

**Impact:** `npm test` gains one file. Nothing in `tests/admin.memory.test.ts` is touched, and the
`lib/admin` sweep in that file still passes because no new module writes a memory table.

---

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck` (runs `next typegen` first, which is what generates
`PageProps<'/admin/shortcuts'>`)
**Lint:** `npm run lint`
**Format:** `npm run format:check` — and note the memory in this repo: `npm run format` is
repo-wide, so run `npx prettier --write` on the ten files instead if peers are live in the worktree.
**Tests:** `npm test`, and specifically `npx vitest run tests/admin.shortcuts.test.ts tests/admin.shell.test.ts tests/admin.memory.test.ts`

**Manual check** (a local production build; `/admin` is not servable from a Vercel preview — the
`ADMIN_EMAILS` / `AUTH_URL` scoping is Production-only, and port 3000 belongs to a stranger, so
`npm run build && npx next start -p 3210`):

1. `/admin/shortcuts` at a 414 px viewport: the page does not scroll sideways; the TABLE does, inside
   its own box. Five columns are visible; `Fired` is not.
2. Every control is at least 44 px tall and no control zooms the viewport when it takes focus.
3. The bottom bar shows six cells and no label wraps or clips. `Shortcut` is the last.
4. Add a shortcut: one click, the row appears above nothing and below the add row, `on`, `never`.
5. Add the same trigger again with a variation selector (`✌️` after `✌`): refused with a sentence
   naming it, and no row is created.
6. Edit the trigger of an existing row to one that is taken: refused with a sentence, and the cell
   reverts to the committed value on the next render.
7. Change a cell and tab away: it saves. Press `Escape` in a cell: it reverts. `Cmd+Enter`: it saves
   without leaving.
8. Flip a row to `off`: the row dims, the count survives, and no dialog appears.
9. Click `✕`: the row goes on the first click, with no dialog.
10. The `?user=` pills navigate within `/admin/shortcuts`, not to `/admin/memory`.

**Exit criteria:** `/admin/shortcuts` renders on a 414 px viewport with no horizontal *page* scroll;
add, edit, toggle and delete each write production and re-render in the same response; a duplicate
trigger is refused with a sentence naming it and nothing changes; the admin nav has six cells and
still `h-14`; `npm run lint && npm run typecheck && npm test && npm run build` are green and
`tests/__snapshots__/nina.prompts.test.ts.snap` is unmodified.

## Handoffs

- **`components/admin/.workflows/package_readme.md`** — line 100 describes `UserPicker` as *"whose
  memory is being edited"* and line 1168 records the `grid-cols-4 -> grid-cols-5` move. Both are now
  one revision behind. Left to the `readme-updater` pass that normally follows this set, not done
  inline: the readme is one document for the whole directory and editing it from a phase session
  that owns two of its fourteen components invites a conflict with any peer doing the same.
- **`lib/admin/.workflows/package_readme.md`** — same, for the three new `lib/admin` modules.
- **A shortcut count in the user pills.** `AdminUserRow` carries `slots` and `facts` and now renders
  on a page about neither. Adding `shortcuts` means widening `listAdminUsers` and `getAdminUser` in
  `lib/admin/users.ts`, which `/admin/memory` also reads — out of scope here, and worth doing only
  if a second account ever exists.
- **Phase 4 (R3), explicitly.** The importer's rows land in the table this page renders, with a
  `label` that is the first ~60 characters of the expansion. **This page is where that placeholder
  gets rewritten**, and nothing in this phase does it or should: rewriting the imported labels is
  the operator reading each scene back, not a migration. The label column is an `<input>` with
  blur-to-save for exactly that session.
- **Phase 2 (R2).** Nothing here reads or writes `uses` / `last_used_at`; the `Fired` column
  displays what phase 2's `bumpNinaShortcutUses` writes. Until phase 2 lands, that column reads
  `never` for every row, which is true.
- **`/admin`'s hub card.** `app/admin/page.tsx` has a card per admin route. A seventh card for
  Shortcuts is a reasonable follow-up and is **not** in this phase's scope — `app/admin/page.tsx` is
  not in the OWNS list, and the nav is what the exit criteria are written against.

## Rollback

One commit on `feature/nina-emoji-shortcuts`; `git revert` it. Nothing outside the worktree changes:
no production write happens anywhere in this phase — the four Server Actions exist but are only
reachable from a running admin session, and the implementing session does not sign in to one.

Reverting alone is safe with phase 1 landed and phases 2 and 4 landed or not: the four new modules
have no importer outside this phase, `UserPicker`'s prop is defaulted so `/admin/memory` is
unaffected, and `AdminNav` returns to five cells with `tests/admin.shell.test.ts` reverting in the
same commit. The `nina_shortcuts` table and its rows survive the revert and are simply unreachable
from the admin UI — inert, and exactly the state phase 1's own rollback note describes.
