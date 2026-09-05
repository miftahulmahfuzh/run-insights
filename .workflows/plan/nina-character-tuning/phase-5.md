# Phase 5: The panel on `/admin/nina`

**Plan set:** `NINA_CHARACTER_TUNING_PLAN.md`
**Analysis:** `20260904-210526-TUNE_code_analyzer.md`
**Satisfies:** R1 (eleven trait sliders), R2 (the five-way relationship selector), R3 (the extra
dials, the wardrobe line, the notes field) — the surface the user named: *"i want us to implement a
full nina character tuning in /admin/nina page / make several sliding bars"*
**Depends on:** Phase 1 (`lib/nina/tuning.ts`, `readNinaTuning`/`writeNinaTuning`), Phase 3
(`buildNinaSystemPrompt`)
**Difficulty:** NORMAL
**Package:** `components/admin` (with `lib/admin` and `app/admin`)

---

## Goal

After this phase `/admin/nina` carries a collapsed **Her character** disclosure above the album:
eleven trait sliders, a five-way relationship selector, the R3 dials, the wardrobe line, the notes
field, and a server-rendered preview of the assembled system prompt. One button writes the whole
tuning in **one** Server Action and bumps its revision; a second resets every dial to
`NINA_TUNING_DEFAULTS`. `/admin` gains a third hub card naming the current relationship and the
dials furthest from their defaults. The album — built last set for *"hundreds of profile pics"* —
is still the first thing on the page and is not pushed below the fold.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No symbol, no config key, no file.

**Renames:** nothing.

**Creates:**

| Symbol | File | Kind |
|---|---|---|
| `TuningDraft` | `lib/admin/tuningModel.ts` | interface — `{ traits: Record<string, number>; dials: Record<string, number>; relationship: string; wardrobe: string; notes: string }` |
| `TuningCopy` | `lib/admin/tuningModel.ts` | interface — `{ label: string; hint: string }` |
| `LoudDial` | `lib/admin/tuningModel.ts` | interface — `{ key: string; value: number; delta: number }` |
| ~~`ADMIN_TUNING_WARDROBE_MAX = 240`~~ | — | **cut in reconciliation.** Import `NINA_WARDROBE_MAX` (200) from `lib/nina/tuning.ts` |
| ~~`ADMIN_TUNING_NOTES_MAX = 1000`~~ | — | **cut in reconciliation.** Import `NINA_NOTES_MAX` (2000) from `lib/nina/tuning.ts` |

> **Why, in this file's own words.** `lib/admin/avatars.ts`'s rule, which the Zod section below
> quotes approvingly: *"a constant that is agreed rather than shared is a constant that will one day
> disagree."* The draft agreed on neither — 240 against phase 1's 200, and 1000 against its 2000 —
> and a Zod bound **stricter** than the model's coercion is the worse of the two failures: the panel
> would reject 210 characters of wardrobe that `coerceNinaWardrobe` would happily have stored, and a
> 1500-character note written by an operator who had read the textarea's own `maxLength` would be
> refused by the action while being perfectly storable. Two layers, one number, imported.
| `prettifyKey` | `lib/admin/tuningModel.ts` | `(key: string) => string` |
| `tuningCopy` | `lib/admin/tuningModel.ts` | `(key: string) => TuningCopy` — **reads phase 1's specs**, no local label table |
| `hasTuningCopy` | `lib/admin/tuningModel.ts` | `(key: string) => boolean` |
| `relationshipCopy` | `lib/admin/tuningModel.ts` | `(value: string) => TuningCopy` — label from `NINA_ADDRESS[v].label`, words from `.words` |
| `hasRelationshipCopy` | `lib/admin/tuningModel.ts` | `(value: string) => boolean` |
| `toTuningDraft` | `lib/admin/tuningModel.ts` | `(tuning: NinaTuning) => TuningDraft` — **read-side adaptation seam** |
| `changedTuningFields` | `lib/admin/tuningModel.ts` | `(next: TuningDraft, saved: TuningDraft) => string[]` |
| `tuningDraftEquals` | `lib/admin/tuningModel.ts` | `(a: TuningDraft, b: TuningDraft) => boolean` |
| `loudestDials` | `lib/admin/tuningModel.ts` | `(draft: TuningDraft, defaults: TuningDraft, limit?: number) => LoudDial[]` |
| `ninaTuningWriteSchema` | `lib/admin/schema.ts` | Zod object (appended section) |
| `NinaTuningWriteInput` | `lib/admin/schema.ts` | `z.infer<typeof ninaTuningWriteSchema>` |
| `ninaTuningResetSchema` | `lib/admin/schema.ts` | Zod object |
| `NinaTuningResetInput` | `lib/admin/schema.ts` | `z.infer<typeof ninaTuningResetSchema>` |
| `AdminTuningResult` | `lib/admin/tuningActions.ts` | interface — `{ ok: boolean; error?: string; note?: string; revision?: number }` |
| `saveNinaTuningAction` | `lib/admin/tuningActions.ts` | `(input: { userId: string; traits: Record<string, number>; dials: Record<string, number>; relationship: string; wardrobe: string; notes: string }) => Promise<AdminTuningResult>` |
| `resetNinaTuningAction` | `lib/admin/tuningActions.ts` | `(input: { userId: string }) => Promise<AdminTuningResult>` |
| `DialSlider` | `components/admin/DialSlider.tsx` | `'use client'` component |
| `DialSliderProps` | `components/admin/DialSlider.tsx` | interface — `{ label; hint?; value; defaultValue; min; max; step?; disabled?; unsaved?; onChange }` |
| `CharacterPanel` | `components/admin/CharacterPanel.tsx` | `'use client'` component |
| `CharacterPanelProps` | `components/admin/CharacterPanel.tsx` | interface — `{ userId: string; tuning: TuningDraft; defaults: TuningDraft; revision: number; promptPreview: string }` |

**Signature changes:** none to any existing exported symbol. `AdminNinaPage` and `AdminHomePage`
keep their signatures (`PageProps<'/admin/nina'>`, `()`); only their bodies grow.

**Requires (from earlier phases):**

- Phase 1, `lib/nina/tuning.ts`, **client-importable, value imports — the LANDED names.** The draft
  of this plan guessed four of them wrong; these are the real ones:

  | Draft assumed | Phase 1 landed |
  |---|---|
  | `NINA_TRAITS` | **`NINA_TRAITS`** (11, in the user's own order) |
  | `NINA_DIALS` | **`NINA_DIALS`** (`profanity`, `clinginess`, `photoEagerness`, `verbosity`) |
  | `NINA_SCORE_MIN` / `NINA_SCORE_MAX` | **`NINA_SCORE_MIN`** / **`NINA_SCORE_MAX`** (0 / 100) |
  | — | `NINA_RELATIONSHIPS` (unchanged), `NINA_TUNING_DEFAULTS` (unchanged) |
  | — | **`NINA_TRAIT_SPECS`**, **`NINA_DIAL_SPECS`**, **`NINA_ADDRESS`** — the label/hint/word source |
  | — | **`NINA_WARDROBE_MAX`** (200), **`NINA_NOTES_MAX`** (2000) |

  `NinaTuning` is `{ traits, dials, relationship, wardrobe, notes, revision }` with `traits` and
  `dials` as full `Record`s and `wardrobe` / `notes` as **`string`** (`''` = empty, never null).
- Phase 1, `lib/nina/queries.ts`: `readNinaTuning(userId): Promise<NinaTuning>` (defaults, never
  null, for a user with no row) and **`writeNinaTuning(userId, write): Promise<NinaTuning>`** —
  which returns the **whole stored row**, not the revision number. The draft assumed
  `Promise<number>`; the new revision is `(await writeNinaTuning(...)).revision`. Returning the row
  is the better contract and it costs this phase one property access: the upsert already has the row
  in hand from `.returning()`, and a caller that wants to render what was actually stored — rather
  than what it hoped was stored — needs it.
- Phase 3, `lib/nina/prompts` barrel: `buildNinaSystemPrompt(tuning: NinaTuning): string`, **pure**
  — no I/O, no model call (plan invariant 5).

**Leaves alone (owned by others):** `components/admin/FileExplorer.tsx`,
`components/admin/explorer/*`, `CropStudio.tsx`, `CircleFrame.tsx`, `FolderMenu.tsx`,
`PhotoMoveBar.tsx`, `SelectionPane.tsx`, `ShareToNinaItem.tsx`, `UserPicker.tsx`,
`MemorySlots.tsx`, `MemoryLedger.tsx` (Phases 15/16 and last set); `lib/admin/memoryActions.ts`,
`memoryModel.ts`, `memoryStore.ts`, `memoryVocab.ts`, `ninaAlbumActions.ts`, `filetree.ts`,
`avatars.ts`, `folderOps.ts`, `users.ts`, `requireAdmin.ts`; `app/admin/memory/page.tsx`;
`app/admin/layout.tsx`; `components/admin/AdminNav.tsx` (**decision: no edit — see Step 8**);
`components/ui/index.ts` (**decision: no edit — see Step 4**); everything under `lib/nina/` except
importing `tuning.ts`, `queries.ts` and the `prompts` barrel; `lib/db/schema.ts`, `drizzle/*`,
`lib/env.ts`, `next.config.ts`, `proxy.ts`; every `scripts/check-*.mjs`.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/tuningModel.ts` | create | The client-safe half: `TuningDraft`, the label/hint copy for eleven traits + the dials + five relationships, `toTuningDraft`, `changedTuningFields`, `loudestDials`, the two length bounds. Type-only imports, exactly like `lib/admin/memoryModel.ts`. |
| `lib/admin/schema.ts` | modify | One appended import block after line 26, and one appended section after line 372: `ninaTuningWriteSchema` + `ninaTuningResetSchema`. Nothing between them touched. |
| `lib/admin/tuningActions.ts` | create | `'use server'`. Two actions: `saveNinaTuningAction`, `resetNinaTuningAction`. `requireAdmin()` → Zod → `writeNinaTuning` → `revalidatePath('/admin/nina')`, result object, never a throw. |
| `components/admin/DialSlider.tsx` | create | The slider primitive the UI kit does not have. Native `<input type="range">`, a `<label htmlFor>`, a numeric `<output>`, an unsaved dot, a click-to-default affordance. |
| `components/admin/CharacterPanel.tsx` | create | `'use client'`. The whole disclosure: relationship radios, eleven trait sliders, the R3 dials, wardrobe, notes, the prompt preview, save / discard / reset, dirty-state. |
| `app/admin/nina/page.tsx` | modify | Imports (lines 1–7); `readNinaTuning` into the existing `Promise.all` (lines 75–81); two derived consts; `<CharacterPanel/>` between `</header>` (line 127) and the empty-album notice (line 129). |
| `app/admin/page.tsx` | modify | `readNinaTuning` into the existing `Promise.all` (lines 19–29); a third `Card` in the grid after line 67. |
| `tests/admin.tuning.test.ts` | create | The pure half (copy completeness, draft diffing, loudest dials, the Zod boundary) and the structural half (gate ordering, one save not sixteen, client-safety, no model call in the render). |

`components/admin/AdminNav.tsx` — **read and deliberately not changed.** See Step 8.

## Implementation Steps

### Step 1: The client-safe model — `lib/admin/tuningModel.ts`

**File:** `lib/admin/tuningModel.ts` (new)
**Change:** Everything both the Server Components and the `'use client'` panel need, in a module
whose only import is `lib/nina/tuning.ts` — phase 1's zero-import, client-safe module. This is the
`lib/admin/memoryModel.ts` shape and it exists for
the same two reasons: (a) `tests/admin.tuning.test.ts` runs in `environment: 'node'` with no jsdom,
so the panel's behaviour is only testable if it is a pure function down here; (b) a Server
Component **cannot read a plain export out of a `'use client'` module** — Next replaces every
export of such a module with a client reference in the server graph — so `app/admin/page.tsx`
could not have imported the label table from `CharacterPanel.tsx` even if it wanted to.

**Code:**

```ts
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
 */

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
    .map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word))
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
      hint: spec.userSaid == null ? spec.axis : `${spec.axis} He asked for it like this: "${spec.userSaid}"`,
    }
  }
  if (isNinaDial(key)) {
    const spec = NINA_DIAL_SPECS[key]
    return { label: spec.label, hint: spec.axis }
  }
  /* Unreachable for any key the panel iterates, because it iterates `NINA_TRAITS` and `NINA_DIALS`.
   * Kept so a running page degrades to a readable label rather than crashing, and asserted against
   * in Step 9 so it can never be how an unlabelled slider ships. */
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
  nobody: 'She uses his full name. Today’s prompt explicitly forbade that; this option is what repealed it.',
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
 * a draft off it, and sharing the object with a prop would make "unsaved" undetectable.
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
 * Which fields differ, as stable dotted paths (`traits.anger`, `dials.photo`, `relationship`,
 * `wardrobe`, `notes`).
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
 * **Distance from default, not highest value.** Some defaults are not zero (`chill` reproduces
 * today's Nina, who lets a lot slide), so "highest" would print a dial nobody moved and hide the
 * one that changed her. Invariant 2 makes the default the meaningful zero point: a dial at its
 * default contributes nothing to her prompt that was not already there.
 *
 * Ties break on the key so the card does not reshuffle between two renders of the same row.
 */
export function loudestDials(
  draft: TuningDraft,
  defaults: TuningDraft,
  limit = 3,
): LoudDial[] {
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
```

**Impact:** A new module. Nothing imports it yet.

---

### Step 2: The Zod boundary — appended to `lib/admin/schema.ts`

**File:** `lib/admin/schema.ts` — an import block after line 26, and a section after line 372
**Change:** One shape for the whole-tuning write, and one for the reset.

**Two edits, and the first one is above the bottom.** The imports have to be at the top; that is
not a deviation from *"appended only"* but the file's own established convention — lines 14–18 are
phase 16's appended import block and lines 20–26 are the album manager's, each added by the phase
that appended a section. This is the fourth block, in the same style, and nothing between it and
the new section is touched.

**Code — the import block, inserted immediately after line 26 (`} from './avatars'`):**

```ts
import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_WARDROBE_MAX,
} from '@/lib/nina/tuning'
```

**Code — the section, appended after line 372 (the end of the file):**

```ts
/* ============================================================================
 * nina-character-tuning phase 5 — ONE whole-tuning write.
 * Appended; nothing above this line changed.
 * ==========================================================================*/

/**
 * What `/admin/nina`'s character panel may write. R1, R2 and R3 arrive as **one object**, and that
 * is plan invariant 11 rather than a preference.
 *
 * ── ONE SAVE, NOT SIXTEEN ───────────────────────────────────────────────────────────────────
 * Next dispatches Server Actions ONE AT A TIME PER CLIENT — the same fact
 * `avatarBatchRegisterSchema` above is built around, and the tax
 * `components/nina/Composer.tsx:68-75` already pays knowingly for three chat photos. Sixteen
 * dials as sixteen sequential actions is not a design, it is a stall. The whole tuning is ~1 KB of
 * JSON against a 1 MB action body cap (`next.config.ts` sets no `serverActions.bodySizeLimit`), so
 * there is nothing to batch and nothing to chunk: it is one write of one row.
 *
 * ── TWO LAYERS OF BOUNDS, THE SAME DIVISION AS `cropWriteSchema` ────────────────────────────
 * This schema enforces the SHAPE — an integer inside phase 1's own advertised range, a
 * relationship that exists, strings under a length that cannot crowd out the canon they sit
 * beside. Phase 1's clamp is what GUARANTEES the range, because it is on every path into the row
 * and this schema is only on the path from a browser. Neither alone is sufficient: a schema cannot
 * be the invariant for a value the cron path could also write, and a clamp cannot reject
 * `anger: "banana"`.
 *
 * ── STRICT, AND THEREFORE REFUSE-DON'T-REPAIR ───────────────────────────────────────────────
 * `z.strictObject` on both dial groups, so an unknown or misspelled dial key FAILS rather than
 * being silently stripped. `lib/nina/schema.ts` argues the opposite for MODEL output — an extra
 * key the model invents is noise, and stripping it is the kind thing to do — and the difference is
 * the sender: a model improvises, a browser we wrote does not. A stripped `flirtyy` would save
 * fifteen dials and report success, and the operator would watch one slider silently refuse to
 * take. That is the invisible failure `folderPathSchema`'s `path === value` rule above exists to
 * prevent, in a different shape.
 *
 * Every bound is IMPORTED. `lib/admin/avatars.ts`'s rule holds here too: *"a constant that is
 * agreed rather than shared is a constant that will one day disagree."*
 */
const dialValueSchema = z.number().int().min(NINA_SCORE_MIN).max(NINA_SCORE_MAX)

/**
 * One `dialValueSchema` per key phase 1 declares, built from the array rather than spelled out.
 * Spelling eleven trait keys here would put phase 1's vocabulary in a second place, and the first
 * dial phase 1 adds would then pass typecheck and fail validation.
 */
function dialShape<K extends string>(keys: readonly K[]): Record<K, typeof dialValueSchema> {
  const shape = {} as Record<K, typeof dialValueSchema>
  for (const key of keys) shape[key] = dialValueSchema
  return shape
}

export const ninaTuningWriteSchema = z.object({
  userId: userIdSchema,
  traits: z.strictObject(dialShape(NINA_TRAITS)),
  dials: z.strictObject(dialShape(NINA_DIALS)),
  relationship: z.enum(NINA_RELATIONSHIPS),
  /** Goes into an IMAGE prompt, not into her voice. Empty is valid and means "the anchor outfit". */
  wardrobe: z.string().trim().max(NINA_WARDROBE_MAX),
  /** Handed to her verbatim in the system prompt. Empty is valid and is the default. */
  notes: z.string().trim().max(NINA_NOTES_MAX),
})
export type NinaTuningWriteInput = z.infer<typeof ninaTuningWriteSchema>

/**
 * The reset takes no tuning at all — deliberately. The defaults it writes are phase 1's module
 * constant, so accepting them from the client would be accepting a client's opinion of what
 * "default" means, and invariant 2 is the one thing in this set that must not be negotiable.
 */
export const ninaTuningResetSchema = z.object({
  userId: userIdSchema,
})
export type NinaTuningResetInput = z.infer<typeof ninaTuningResetSchema>
```

**Impact:** `lib/admin/schema.ts` now imports `lib/nina/tuning.ts` and `lib/admin/tuningModel.ts`.
Both are import-light and client-safe, so `tests/admin.avatars.test.ts` — which already imports
this file — keeps loading it in `environment: 'node'` with no new alias.

---

### Step 3: The two actions — `lib/admin/tuningActions.ts`

**File:** `lib/admin/tuningActions.ts` (new)
**Change:** The write side, following `lib/admin/memoryActions.ts` exactly.

**Code:**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  ninaTuningResetSchema,
  ninaTuningWriteSchema,
  type NinaTuningWriteInput,
} from '@/lib/admin/schema'
import { writeNinaTuning } from '@/lib/nina/queries'
import { NINA_TUNING_DEFAULTS, type NinaTuning } from '@/lib/nina/tuning'

/**
 * `/admin/nina`'s character panel, write side — R1, R2, R3.
 *
 * Both actions follow `lib/admin/memoryActions.ts`'s four lines, in this order and for these
 * reasons:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists, and `proxy.ts` matches
 *                                 neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts:13-16`),
 *                                 so this call is the only gate on this endpoint.
 *   2. Zod                      — every field, every time. The client is not a source of truth.
 *   3. the write                — one row, through phase 1's `writeNinaTuning`, which owns the
 *                                 clamp and the revision bump.
 *   4. `revalidatePath`         — re-renders THIS page, so the panel and the prompt preview show
 *                                 the row that was just written.
 *
 * ── `revalidatePath` IS NOT HOW THE EDIT REACHES NINA, AND THAT IS THE FEATURE ──────────────
 * `memoryActions.ts` records this about the memory tables and it holds verbatim for the tuning:
 * there is no cache anywhere on the turn path, so a committed row is in her next prompt with no
 * invalidation step at all. No deploy, no distillation pass, no revalidation. That is why the
 * panel's own copy says it, and why the slider is a live control rather than a config file.
 *
 * ── ONE SAVE, NOT SIXTEEN ───────────────────────────────────────────────────────────────────
 * Plan invariant 11, and `ninaTuningWriteSchema`'s docstring has the mechanism. There are exactly
 * two exported functions in this file and `tests/admin.tuning.test.ts` asserts the count, because
 * "add one action per dial" is the obvious-looking change that would reintroduce the stall.
 *
 * ── A RESULT OBJECT, NEVER A THROW ──────────────────────────────────────────────────────────
 * The panel is a `useTransition` client with plain-argument actions — the shape phase 15 set on the
 * sibling admin page and phase 16 followed. A throw from a Server Action reaches the browser as an
 * opaque digest; a sentence reaches the operator.
 */

export interface AdminTuningResult {
  ok: boolean
  error?: string
  /** One sentence about what was written. */
  note?: string
  /** The revision the row now carries, so the panel can name it without a refetch. */
  revision?: number
}

/** Phase 1's row, minus the field phase 1 mints. Spelled from `NinaTuning` so it cannot drift. */
type NinaTuningWrite = Omit<NinaTuning, 'revision'>

/** Every action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(where: string, cause: unknown): AdminTuningResult {
  console.error(`[tune] admin tuning ${where} failed`, cause)
  return { ok: false, error: 'The write failed and nothing was changed. Try again.' }
}

/**
 * The validated payload -> phase 1's write shape. **Adaptation seam, half two of two**
 * (`lib/admin/tuningModel.ts`'s `toTuningDraft` is half one).
 *
 * It reads like a no-op and is not: the fields are picked EXPLICITLY so that `userId` cannot ride
 * into the row, and so that a change to phase 1's field names is a compiler error in one function
 * instead of a silent extra key in a jsonb column. `parsed.data.traits` is already
 * `Record<NinaTrait, number>` and `relationship` already `NinaRelationship`, because
 * `dialShape` builds the Zod shape from phase 1's own key arrays — so no cast is needed anywhere
 * on this path.
 */
function toTuningWrite(input: NinaTuningWriteInput): NinaTuningWrite {
  return {
    traits: input.traits,
    dials: input.dials,
    relationship: input.relationship,
    wardrobe: input.wardrobe,
    notes: input.notes,
  }
}

/**
 * Save the whole tuning. One action, one row, one revision bump.
 *
 * The argument types are deliberately loose (`Record<string, number>`, `relationship: string`) and
 * Zod does the narrowing, which is the convention `saveSlotAction`'s `key: string` set: a Server
 * Action's declared parameter type is a comment as far as the runtime is concerned, so the schema
 * has to be the check, and pretending otherwise at the signature invites a caller to skip it.
 */
export async function saveNinaTuningAction(input: {
  userId: string
  traits: Record<string, number>
  dials: Record<string, number>
  relationship: string
  wardrobe: string
  notes: string
}): Promise<AdminTuningResult> {
  await requireAdmin()

  const parsed = ninaTuningWriteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'That is not a tuning this panel can save, so nothing was written.',
    }
  }

  try {
    /* `writeNinaTuning` returns the whole stored `NinaTuning`, not a number — phase 1's landed
     * contract. The row it hands back is what the database actually holds, already coerced, so
     * reading the revision off it is reading the truth rather than a hope. */
    const { revision } = await writeNinaTuning(parsed.data.userId, toTuningWrite(parsed.data))
    revalidatePath('/admin/nina')
    return {
      ok: true,
      revision,
      note: `Saved as revision ${revision}. She reads it on her very next message — there is no cache on her turn path.`,
    }
  } catch (cause) {
    return failed('save', cause)
  }
}

/**
 * Reset every dial to `NINA_TUNING_DEFAULTS` — the behavioural rollback the plan's own Rollback
 * section names as cheaper than the code one.
 *
 * It **writes** the defaults rather than deleting the row, and so it bumps the revision like any
 * other save. That is the honest record: `nina_turns` stamps the tuning revision that produced
 * each turn, so "he reset her at revision 8" has to be a revision, not a hole where one used to
 * be. Invariant 2 is what makes this a real rollback instead of a gesture: the default tuning
 * renders the prompt she shipped with, character for character.
 *
 * The defaults do NOT go through Zod. They are phase 1's module constant, not client input, and
 * validating a constant against a schema derived from the same module would only assert that phase
 * 1 agrees with itself.
 */
export async function resetNinaTuningAction(input: {
  userId: string
}): Promise<AdminTuningResult> {
  await requireAdmin()

  const parsed = ninaTuningResetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'That is not an account this panel can reset.' }
  }

  const defaults: NinaTuningWrite = {
    traits: { ...NINA_TUNING_DEFAULTS.traits },
    dials: { ...NINA_TUNING_DEFAULTS.dials },
    relationship: NINA_TUNING_DEFAULTS.relationship,
    wardrobe: NINA_TUNING_DEFAULTS.wardrobe,
    notes: NINA_TUNING_DEFAULTS.notes,
  }

  try {
    const { revision } = await writeNinaTuning(parsed.data.userId, defaults)
    revalidatePath('/admin/nina')
    return {
      ok: true,
      revision,
      note: `Every dial is back at its default, as revision ${revision}. She is the Nina who shipped.`,
    }
  } catch (cause) {
    return failed('reset', cause)
  }
}
```

**Impact:** Two new POST endpoints under the admin gate. `revalidatePath('/admin')` is
deliberately NOT called: that page is `force-dynamic` and re-reads on every visit, so its hub card
is never stale.

---

### Step 4: The slider primitive — `components/admin/DialSlider.tsx`

**File:** `components/admin/DialSlider.tsx` (new)
**Change:** The control `components/ui/` does not have.

**WHERE IT LIVES, AND WHY IT IS NOT IN `components/ui/`.** `components/ui/index.ts` is the shared
client-safe kit — its header describes a *primitive set* named by the design brief and spends thirty
lines on the one thing that must never be re-exported through it. Three arguments put this control
in `components/admin/` instead:

1. **It has exactly one caller and one audience.** The runner's app has no slider and the design
   brief names none; this is a desktop-only operator control, and `components/admin/` is where
   every one of those has lived so far — `CropStudio`, `FolderMenu`, `PhotoMoveBar`,
   `SelectionPane`, `UserPicker`.
2. **The barrel is a load-bearing bundle boundary.** Ten `'use client'` files import
   `@/components/ui`, and the `AppShell` precedent is the record of what happens when something
   with a different graph joins it. Adding an admin control there puts it in every one of those
   bundles for no caller's benefit.
3. **The nearest precedent already chose `components/admin/`.** `CropStudio.tsx:203` is this repo's
   only existing `<input type="range">` and it was not promoted to the kit either. Its
   `accent-accent` class and its `<label>`-wrapping shape are reused here verbatim, so the two
   sliders in the product look like one decision.

If a runner-facing slider ever appears, moving this file into `components/ui/` is one rename plus
one line in the barrel, and that is the moment to make the case — not now.

**WHY NOT `Field`.** `Field` owns the `label`/`hint`/`error`/`aria-describedby` wiring, but only
`Input` reads its context for the `id`, so a bare `<input type="range">` inside a `Field` would get
a `<label htmlFor>` pointing at nothing — an unlabelled control with the appearance of a labelled
one. `CONTROL_CLASS` is also a 52 px filled well, which is a text field, not a track. So this
component does its own `useId` wiring, which is four lines, and the wardrobe/notes fields below use
`CONTROL_CLASS` where it fits.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * One dial, 0–100 — the *"sliding bars"* R1 asked for, in the only shape that satisfies the two
 * conditions the plan set on them: **keyboard-operable, and showing its number.**
 *
 * ── A NATIVE `<input type="range">`, NOT A DIV WITH A DRAG HANDLER ──────────────────────────
 * Arrow keys, Home/End and PageUp/PageDown all work, focus is visible, the value is exposed to a
 * screen reader, and the thumb tracks a pointer correctly on the first try. A hand-rolled track
 * gets none of that for free and this repo has already made that call once —
 * `components/admin/CropStudio.tsx:203` is a native range with `accent-accent`, and this is the
 * same control with a label and a readout bolted on.
 *
 * ── THE NUMBER IS NOT DECORATION ────────────────────────────────────────────────────────────
 * An unlabelled slider is a dial the operator cannot report back: "flirty is quite high" is not a
 * bug report and cannot be compared against `nina_turns`' recorded revision. So the value renders
 * as an `<output>` tied to the input, and it is the number that is actually stored.
 *
 * ── TWO DIFFERENT KINDS OF "CHANGED", BOTH VISIBLE ──────────────────────────────────────────
 * `defaultValue` is the SHIPPING default, so accent type and the "default N" button mean *this is
 * no longer the Nina who shipped* — the state invariant 2 is about. `unsaved` means *this is not
 * what the row says yet*, which is a different question and gets its own dot. Collapsing the two
 * would leave the operator unable to tell a saved deviation from an unsaved keystroke.
 *
 * Clicking "default N" is the per-dial undo. It writes the default into the draft rather than
 * saving anything, so it is still one Save for the whole tuning (plan invariant 11).
 */

export interface DialSliderProps {
  label: string
  hint?: string
  value: number
  /** The shipping default for this dial. Drives the accent state and the reset affordance. */
  defaultValue: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  /** The draft differs from the saved row for this dial. */
  unsaved?: boolean
  onChange: (value: number) => void
}

export function DialSlider({
  label,
  hint,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  disabled = false,
  unsaved = false,
  onChange,
}: DialSliderProps) {
  const base = React.useId()
  const inputId = `${base}-dial`
  const hintId = hint ? `${base}-hint` : undefined
  const moved = value !== defaultValue

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={inputId}
          className="text-[12px] font-semibold tracking-[0.02em] text-ink-2"
        >
          {label}
        </label>
        <output
          htmlFor={inputId}
          className={cn(
            'text-[13px] font-semibold tabular-nums',
            moved ? 'text-accent' : 'text-ink-3',
          )}
        >
          {unsaved && (
            <span className="mr-1 text-accent" title="Unsaved">
              &bull;
            </span>
          )}
          {value}
        </output>
      </div>

      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-accent disabled:opacity-50"
      />

      <div className="mt-1 flex items-baseline justify-between gap-3">
        {hint ? (
          <p id={hintId} className="max-w-[46ch] text-[11px] font-medium text-ink-3">
            {hint}
          </p>
        ) : (
          <span />
        )}
        {moved && !disabled && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="shrink-0 text-[11px] font-semibold text-ink-3 underline decoration-dotted hover:text-ink"
          >
            default {defaultValue}
          </button>
        )}
      </div>
    </div>
  )
}
```

**Impact:** A new client component with one caller. `components/ui/index.ts` is untouched.

---

### Step 5: The panel — `components/admin/CharacterPanel.tsx`

**File:** `components/admin/CharacterPanel.tsx` (new)
**Change:** The whole surface, in `MemorySlots.tsx`'s established shape.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { DialSlider } from '@/components/admin/DialSlider'
import { Button, CONTROL_CLASS } from '@/components/ui'
import {
  resetNinaTuningAction,
  saveNinaTuningAction,
  type AdminTuningResult,
} from '@/lib/admin/tuningActions'
import {
  NINA_NOTES_MAX,
  NINA_WARDROBE_MAX,
  changedTuningFields,
  loudestDials,
  relationshipCopy,
  tuningCopy,
  type TuningDraft,
} from '@/lib/admin/tuningModel'
import { cn } from '@/lib/cn'
import {
  NINA_DIALS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_RELATIONSHIPS,
  NINA_TRAITS,
} from '@/lib/nina/tuning'

/**
 * **Her character** — R1's *"full nina character tuning in /admin/nina page / make several sliding
 * bars"*, R2's relationship, R3's extra dials.
 *
 * ── WHY THIS IS COLLAPSED, AND WHY IT IS ON THIS PAGE AT ALL ────────────────────────────────
 * The user named `/admin/nina`, and the previous plan set rebuilt that page into a paginated
 * folder-scoped file manager for a stated reason: *"i will put hundreds of profile pics in there."*
 * The album is the page's working surface and must stay the first thing on it, so this panel is a
 * native `<details>`, shut on arrival. Sixteen sliders open by default would push the album below
 * the fold on every single visit, including the hundreds of visits that are about a photograph.
 *
 * A native `<details>` rather than a `useState` toggle: it needs no JavaScript to open, it is
 * keyboard-operable for free, and its open state is DOM state — so it survives the re-render that
 * `revalidatePath` causes after a save, which a piece of React state in this component would also
 * survive but a piece of state in the page above it would not. `open` is deliberately NOT passed
 * as a prop; passing it would make React control the attribute and fight the user's click.
 *
 * ── `useTransition`, NOT `<form action={…}>` ────────────────────────────────────────────────
 * `MemorySlots.tsx` states the reason and it is unchanged here: phase 15's album manager set the
 * plain-argument + result-object convention on the sibling admin page, and a desktop-only tool
 * gains nothing from progressive enhancement that it does not lose in consistency. Validation is
 * Zod on the server for every field, either way.
 *
 * ── ONE SAVE ────────────────────────────────────────────────────────────────────────────────
 * Every control edits a local draft; nothing writes on change. One button sends the whole tuning
 * (plan invariant 11) — Next dispatches actions one at a time per client, so sixteen dials as
 * sixteen actions would stall behind each other.
 *
 * ── WHAT THIS FILE MAY NOT IMPORT ───────────────────────────────────────────────────────────
 * Nothing `server-only`, and nothing that reaches drizzle or `lib/env.ts`. `lib/nina/tuning.ts` is
 * guaranteed client-importable by phase 1 (types and plain data only) and is imported directly for
 * the key arrays; the VALUES arrive as a plain `TuningDraft` the page mapped, so no part of phase
 * 1's row shape crosses the serialization boundary. `tests/admin.tuning.test.ts` asserts both.
 */

export interface CharacterPanelProps {
  userId: string
  /** The tuning as the row holds it right now — the baseline for "unsaved". */
  tuning: TuningDraft
  /** `NINA_TUNING_DEFAULTS`, mapped — the baseline for "no longer the Nina who shipped". */
  defaults: TuningDraft
  revision: number
  /**
   * `buildNinaSystemPrompt(tuning)`, assembled on the SERVER from the SAVED tuning.
   *
   * It is not recomputed as the sliders move, and that is deliberate rather than a limitation: the
   * assembler reaches the whole persona, and shipping that into the browser to preview a string
   * would put Nina's canon in a client bundle to save one round trip. The disclosure's own label
   * says which revision it is showing.
   */
  promptPreview: string
}

export function CharacterPanel({
  userId,
  tuning,
  defaults,
  revision,
  promptPreview,
}: CharacterPanelProps) {
  const [draft, setDraft] = React.useState<TuningDraft>(tuning)
  const [result, setResult] = React.useState<AdminTuningResult | null>(null)
  const [confirmingReset, setConfirmingReset] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  // The server re-renders with the canonical row after every action, so the draft follows the prop
  // rather than diverging from it — a stale slider next to "saved as revision 5" is how a second
  // save writes the pre-canonical value back.
  //
  // Keyed on `revision` and not on the object: the prop is a fresh object on every render, so an
  // identity comparison would reset the draft on any unrelated re-render and throw away the
  // operator's keystrokes. The revision changes exactly when the row does.
  //
  // Adjusted DURING RENDER rather than in an effect, which is React's own recipe for "some state
  // derives from a prop" and the reason `MemorySlots` does it this way: an effect would paint the
  // stale value first, and `react-hooks/set-state-in-effect` rejects it for exactly that.
  const [lastRevision, setLastRevision] = React.useState(revision)
  if (revision !== lastRevision) {
    setLastRevision(revision)
    setDraft(tuning)
    setConfirmingReset(false)
  }

  const unsaved = React.useMemo(() => new Set(changedTuningFields(draft, tuning)), [draft, tuning])
  const dirty = unsaved.size > 0
  const loud = loudestDials(draft, defaults)

  function setTrait(key: string, value: number) {
    setDraft((current) => ({ ...current, traits: { ...current.traits, [key]: value } }))
  }

  function setDial(key: string, value: number) {
    setDraft((current) => ({ ...current, dials: { ...current.dials, [key]: value } }))
  }

  function run(action: () => Promise<AdminTuningResult>) {
    startTransition(async () => {
      setResult(await action())
    })
  }

  return (
    <details id="character" className="mb-8 rounded-card border border-rule bg-card px-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
        <span className="text-[15px] font-semibold text-ink">
          Her character
          {dirty && (
            <span className="ml-2 text-[12px] font-semibold text-accent">
              {unsaved.size} unsaved
            </span>
          )}
        </span>
        <span className="text-right text-[12px] font-medium text-ink-3">
          {relationshipCopy(draft.relationship).label} &middot;{' '}
          {loud.length === 0
            ? 'every dial at its default'
            : loud
                .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                .join(', ')}{' '}
          &middot; revision {revision}
        </span>
      </summary>

      <div className="pb-6">
        <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every dial below goes into her system prompt. <strong>There is no cache on her turn
          path</strong>, so a saved row is in her next message with no invalidation step, no
          distillation pass and no deploy. The defaults reproduce the Nina who shipped, character
          for character — a dial you never touch changes nothing about her.
        </p>

        <fieldset className="mb-6">
          <legend className="mb-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
            Relationship
            {unsaved.has('relationship') && (
              <span className="ml-2 font-semibold text-accent">unsaved</span>
            )}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {NINA_RELATIONSHIPS.map((value) => {
              const copy = relationshipCopy(value)
              const selected = draft.relationship === value
              return (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-card bg-paper-2 p-3',
                    selected && 'ring-2 ring-accent',
                  )}
                >
                  <input
                    type="radio"
                    name="nina-relationship"
                    value={value}
                    checked={selected}
                    disabled={pending}
                    onChange={() => setDraft((current) => ({ ...current, relationship: value }))}
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">
                      {copy.label}
                      {value === defaults.relationship && (
                        <span className="ml-1 text-[11px] font-medium text-ink-3">default</span>
                      )}
                    </span>
                    <span className="block text-[11px] font-medium text-ink-3">{copy.hint}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <section className="mb-6">
          <h3 className="text-[13px] font-semibold text-ink">Traits</h3>
          <p className="mb-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
            Eleven dials, 0 to 100.
          </p>
          <div className="grid gap-x-8 xl:grid-cols-2">
            {NINA_TRAITS.map((key) => {
              const copy = tuningCopy(key)
              return (
                <DialSlider
                  key={key}
                  label={copy.label}
                  hint={copy.hint || undefined}
                  value={draft.traits[key] ?? defaults.traits[key] ?? NINA_SCORE_MIN}
                  defaultValue={defaults.traits[key] ?? NINA_SCORE_MIN}
                  min={NINA_SCORE_MIN}
                  max={NINA_SCORE_MAX}
                  disabled={pending}
                  unsaved={unsaved.has(`traits.${key}`)}
                  onChange={(value) => setTrait(key, value)}
                />
              )
            })}
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-[13px] font-semibold text-ink">The rest of it</h3>
          <p className="mb-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
            Dials that are not moods: they change what she does, not how she feels.
          </p>
          <div className="grid gap-x-8 xl:grid-cols-2">
            {NINA_DIALS.map((key) => {
              const copy = tuningCopy(key)
              return (
                <DialSlider
                  key={key}
                  label={copy.label}
                  hint={copy.hint || undefined}
                  value={draft.dials[key] ?? defaults.dials[key] ?? NINA_SCORE_MIN}
                  defaultValue={defaults.dials[key] ?? NINA_SCORE_MIN}
                  min={NINA_SCORE_MIN}
                  max={NINA_SCORE_MAX}
                  disabled={pending}
                  unsaved={unsaved.has(`dials.${key}`)}
                  onChange={(value) => setDial(key, value)}
                />
              )
            })}
          </div>
        </section>

        <div className="mb-6 grid gap-5 xl:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Wardrobe
              {unsaved.has('wardrobe') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.wardrobe}
              maxLength={NINA_WARDROBE_MAX}
              disabled={pending}
              placeholder="heather-grey racerback tank, black fitted running shorts"
              onChange={(event) =>
                setDraft((current) => ({ ...current, wardrobe: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              What she is wearing <strong>in the photograph</strong>. This line goes into the image
              prompt, not into her voice. Leave it empty and she wears what the anchor photo shows.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Notes
              {unsaved.has('notes') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <textarea
              className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
              value={draft.notes}
              maxLength={NINA_NOTES_MAX}
              disabled={pending}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Free text, handed to her verbatim in the system prompt. Anything no dial can say.
            </span>
          </label>
        </div>

        <details className="mb-6 rounded-card bg-paper-2 p-4">
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            The assembled system prompt &middot; revision {revision}
            {dirty && (
              <span className="ml-2 font-medium text-ink-3">
                (as saved — the edits above are not in it yet)
              </span>
            )}
          </summary>
          <pre className="mt-3 max-h-[420px] overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {promptPreview}
          </pre>
        </details>

        {result?.ok === false && (
          <p className="mb-3 text-[12px] font-semibold text-red">{result.error}</p>
        )}
        {result?.ok === true && result.note && (
          <p className="mb-3 text-[12px] font-semibold text-accent">{result.note}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={pending || !dirty}
            loading={pending}
            onClick={() =>
              run(() =>
                saveNinaTuningAction({
                  userId,
                  traits: draft.traits,
                  dials: draft.dials,
                  relationship: draft.relationship,
                  wardrobe: draft.wardrobe,
                  notes: draft.notes,
                }),
              )
            }
          >
            Save the whole tuning
          </Button>

          <Button
            variant="ghost"
            disabled={pending || !dirty}
            onClick={() => {
              setDraft(tuning)
              setResult(null)
            }}
          >
            Discard changes
          </Button>

          {!confirmingReset && (
            <Button variant="destructive" disabled={pending} onClick={() => setConfirmingReset(true)}>
              Reset to defaults
            </Button>
          )}
        </div>

        {confirmingReset && (
          <div className="mt-3 rounded-card border border-rule bg-paper-2 p-3">
            <p className="mb-2 max-w-[70ch] text-[12px] font-medium text-ink-2">
              This writes <strong>every</strong> dial back to its shipping default and bumps the
              revision, so the row records that it happened rather than losing the fact. It is a
              real rollback and not a gesture: the default tuning renders the prompt she shipped
              with.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() => {
                  run(() => resetNinaTuningAction({ userId }))
                  setConfirmingReset(false)
                }}
              >
                Reset her to the defaults
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
```

**Impact:** One new client component. It is the only caller of both Server Actions and of
`DialSlider`.

---

### Step 6: The page — `app/admin/nina/page.tsx`

**File:** `app/admin/nina/page.tsx` — imports at lines 1–7, `Promise.all` at 75–81, JSX at 118–127
**Change:** Read the tuning in the existing `Promise.all`, assemble the preview, render the panel
above the album. The album's folder/page validation, its row→prop mapping and its `shareOrigin()`
prop are **not** touched.

**Code — the complete new import block, replacing lines 1–7:**

```tsx
import { CharacterPanel } from '@/components/admin/CharacterPanel'
import { FileExplorer } from '@/components/admin/FileExplorer'
import type { ExplorerFolder, ExplorerPhoto } from '@/components/admin/explorer/model'
import { NINA_FOLDER_ROOT, validateFolderPath } from '@/lib/admin/filetree'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { toTuningDraft } from '@/lib/admin/tuningModel'
import { NINA_ADMIN_PAGE_SIZE, NINA_AVATAR_FALLBACK_SRC } from '@/lib/nina/album'
import { buildNinaSystemPrompt } from '@/lib/nina/prompts'
import { listNinaAvatarFolders, listNinaAvatarsInFolder, readNinaTuning } from '@/lib/nina/queries'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'
import { shareOrigin } from '@/lib/share/origin'
```

**Code — a docstring section, appended to the existing header comment immediately before
`export const dynamic` (line 62), after the phase 7 `shareOrigin` note:**

```tsx
/*
 * ── THE CHARACTER PANEL IS ABOVE THE ALBUM AND SHUT ─────────────────────────────────────────
 * nina-character-tuning R1 named this route: *"i want us to implement a full nina character tuning
 * in /admin/nina page / make several sliding bars."* It renders above the album because that is
 * where the operator looks first for a page-level control, and it is a `<details>` shut on arrival
 * because of the sentence at the top of this file: *"i will put hundreds of profile pics in there."*
 * Sixteen sliders open by default would push the album below the fold on every visit, including
 * every visit that is about a photograph. `CharacterPanel` owns the disclosure; this page only
 * places it.
 *
 * ── THE PREVIEW IS A PURE FUNCTION, WHICH IS WHAT MAKES IT LEGAL HERE ───────────────────────
 * `buildNinaSystemPrompt(tuning)` assembles a string. It is not a model call, it awaits nothing,
 * and it is the SAME function `lib/nina/turn.ts` uses to build the system prompt — which is the
 * whole value of the preview: what the panel shows is what she is actually handed, not a
 * reconstruction of it.
 *
 * Plan invariant 5 / `scripts/check-llm-payload-boundary.mjs` Rule 2 forbids awaiting a MODEL CALL
 * from a page render, by function name. Nothing on this page appears in that table and nothing on
 * this page may: the preview is deliberately the pure assembler and never `runNinaTurn`. It shows
 * the SAVED tuning, so it changes when a save changes the row, not as a slider moves.
 *
 * The read joins the existing `Promise.all` rather than adding a second await: the album's two
 * queries and this one are independent, and three round trips in sequence on a `force-dynamic`
 * page the operator opens constantly is latency for nothing.
 */
```

**Code — the complete new `AdminNinaPage`, replacing lines 67–166:**

```tsx
export default async function AdminNinaPage(props: PageProps<'/admin/nina'>) {
  const { userId } = await requireAdmin()

  const params = await props.searchParams
  const requested = validateFolderPath(readOne(params.folder) ?? NINA_FOLDER_ROOT)
  const folder = requested.ok ? requested.path : NINA_FOLDER_ROOT
  const page = readPage(readOne(params.page))

  const [listed, folders, tuning] = await Promise.all([
    listNinaAvatarsInFolder(userId, folder, {
      limit: NINA_ADMIN_PAGE_SIZE,
      offset: (page - 1) * NINA_ADMIN_PAGE_SIZE,
    }),
    listNinaAvatarFolders(userId),
    readNinaTuning(userId),
  ])

  /*
   * The row -> prop mapping is here rather than in the client component for the reason it always
   * was: `NinaAvatarRow` carries `announcedAt`, `pathname`, `sourceKey` and `thumbPathname`, none of
   * which a browser has any use for, and none of which should cross the serialization boundary
   * wholesale.
   *
   * `filename` falls back to the id because every row written before phase 1 added the column has
   * none, and a grid tile with no label under it is worse than a tile labelled by its id.
   */
  const photos: ExplorerPhoto[] = listed.rows.map((row) => ({
    id: row.id,
    url: row.blobUrl,
    thumbUrl: row.thumbUrl,
    folder: row.folder,
    filename: row.filename ?? row.id,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    isCurrent: row.isCurrent,
    description: row.description,
    crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
    createdAt: row.createdAt.toISOString(),
  }))

  /* `NinaAvatarFolderCount`'s count field is `photos` (phase 1's name; this phase's draft assumed
   * `count`). `ExplorerFolder` keeps `count`, because that is what makes it structurally
   * assignable to phase 2's `FolderCount` and `buildTree` therefore needs no adapter. */
  const folderList: ExplorerFolder[] = folders.map((entry) => ({
    folder: entry.folder,
    count: entry.photos,
  }))

  const albumTotal = folderList.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Nina&rsquo;s album</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Drop a folder straight out of Explorer and only the new files upload. Click a photo to
          frame her face and make it her profile picture. Folders are metadata, not blob paths, so
          moving a photo moves no bytes.
        </p>
      </header>

      {/*
       * The tuning crosses to the client as a plain `TuningDraft` — `toTuningDraft` is the one
       * place on the read side that knows phase 1's field names, so no part of the row's shape
       * reaches a component. `promptPreview` is a pure string assembly, never a model call: see the
       * header, and plan invariant 5.
       */}
      <CharacterPanel
        userId={userId}
        tuning={toTuningDraft(tuning)}
        defaults={toTuningDraft(NINA_TUNING_DEFAULTS)}
        revision={tuning.revision}
        promptPreview={buildNinaSystemPrompt(tuning)}
      />

      {albumTotal === 0 ? (
        <p className="mb-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          The album is empty, so she is still showing the committed photo (
          <code className="text-ink">{NINA_AVATAR_FALLBACK_SRC}</code>). Add a folder below and the
          first photo you make hers becomes her face.
        </p>
      ) : null}

      {/*
       * `shareOrigin()` is resolved HERE, on the server, and handed down as a string — phase 7 /
       * R2. `lib/share/origin.ts` opens with `import 'server-only'`, so no client component can
       * call it, and invariant 9 (roadmap §4.1) forbids exporting it as a build-time public
       * environment variable. That is not a limitation being worked around; it is the mechanism.
       * In production this is `AUTH_URL` — `https://runins.site`, the origin the user named in the
       * requirement — and on a preview deployment it is the project's stable production hostname
       * rather than the per-deployment one, so a link minted on a preview still opens the real
       * chat instead of a hostname that dies at the next push.
       *
       * The leading `*` on every line is the same load-bearing detail `SelectionPane`'s seam
       * comment records: `ci:client-secret-guard`'s Rule 3 exempts only lines a comment scanner
       * recognises, and a JSX comment with bare prose continuation lines fails the guard while
       * explaining why it is being obeyed.
       */}
      <FileExplorer
        userId={userId}
        folders={folderList}
        photos={photos}
        page={{
          folder,
          page,
          pageSize: NINA_ADMIN_PAGE_SIZE,
          total: listed.total,
        }}
        shareOrigin={shareOrigin()}
      />
    </div>
  )
}
```

`readOne` (lines 172–175) and `readPage` (lines 178–182) are unchanged and stay exactly as they
are.

**Impact:** One extra indexed read on a page that already does two. The RSC payload grows by the
tuning (~1 KB) plus the preview string (the assembled prompt, a few KB of text) — paid once per
page render, and the alternative (a second action round trip on first open) trades a few KB for a
visible wait on a control the operator came to use.

---

### Step 7: The hub card — `app/admin/page.tsx`

**File:** `app/admin/page.tsx` — imports at lines 1–6, `Promise.all` at 19–29, grid at 40–68
**Change:** A third `Card`, matching the two already there: a fact and a link, deliberately thin.

**Code — the complete new import block, replacing lines 1–6:**

```tsx
import Link from 'next/link'

import { Card } from '@/components/ui'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { loudestDials, relationshipCopy, toTuningDraft, tuningCopy } from '@/lib/admin/tuningModel'
import { getAdminUser } from '@/lib/admin/users'
import { countNinaAvatars, getCurrentNinaAvatar, readNinaTuning } from '@/lib/nina/queries'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'
```

**Code — the complete new `AdminHomePage`, replacing lines 17–71:**

```tsx
export default async function AdminHomePage() {
  const { userId, email } = await requireAdmin()
  const [albumCount, current, me, tuning] = await Promise.all([
    /*
     * A COUNT, not the album. This page renders `albumCount` and nothing else about the rows, and
     * F34 R1 makes the album *"hundreds of profile pics"* — so `listNinaAvatars(userId)` here was
     * fetching every column of every row, including the `description` prose, to print one integer
     * on a `force-dynamic` page the operator opens constantly.
     */
    countNinaAvatars(userId),
    getCurrentNinaAvatar(userId),
    getAdminUser(userId),
    /*
     * The tuning row, for the character card below. It joins the existing `Promise.all` rather
     * than adding a fourth sequential await, and it is a single indexed read of one row.
     */
    readNinaTuning(userId),
  ])

  /*
   * "Loudest" is DISTANCE FROM DEFAULT, not highest value — `loudestDials`' docstring has the
   * argument: some defaults are not zero, so ranking by value would print a dial nobody moved and
   * hide the one that changed her.
   */
  const loud = loudestDials(toTuningDraft(tuning), toTuningDraft(NINA_TUNING_DEFAULTS))

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Admin</h1>
        <p className="mt-1 text-[13px] font-medium text-ink-2">
          Signed in as {email}. Everything here writes production.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Nina&rsquo;s album</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {albumCount === 0
              ? 'Empty — she is still using the committed photo.'
              : `${albumCount} photo${albumCount === 1 ? '' : 's'}, ${
                  current ? 'one current' : 'none current'
                }.`}
          </p>
          <Link href="/admin/nina" className="text-[13px] font-semibold text-accent">
            Manage the album &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Memory</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {me === null
              ? 'Nothing kept yet.'
              : `${me.slots} slot${me.slots === 1 ? '' : 's'} and ${me.facts} ledger row${
                  me.facts === 1 ? '' : 's'
                } for your account.`}
          </p>
          <Link href="/admin/memory" className="text-[13px] font-semibold text-accent">
            Read and edit her memory &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Her character</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {relationshipCopy(tuning.relationship).label}
            {loud.length === 0
              ? ', every dial at its default.'
              : `, loudest: ${loud
                  .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                  .join(', ')}.`}{' '}
            Revision {tuning.revision}.
          </p>
          {/* The fragment targets the panel's own `<details id="character">`. It scrolls there in
              every browser and opens the disclosure in the ones that implement fragment-targeted
              details; where it does not, the panel is the first thing on the page and is one
              click. A deep link is not worth a second copy of the panel on its own route. */}
          <Link href="/admin/nina#character" className="text-[13px] font-semibold text-accent">
            Tune her character &rarr;
          </Link>
        </Card>
      </div>
    </div>
  )
}
```

**Impact:** The grid holds three cards in a two-column layout, which lands the third alone on the
second row — the same way a fourth would pair with it later. One extra read on a `force-dynamic`
page that already does three, inside the same `Promise.all`.

---

### Step 8: `components/admin/AdminNav.tsx` — read, and deliberately not changed

**File:** `components/admin/AdminNav.tsx:20` (the `LINKS` array)
**Change:** **None.** This is the decision the phase scope asked for, recorded rather than skipped.

The panel is a **section of an existing page**, not a route. Three arguments:

1. A fourth entry would point at `/admin/nina`, which the second entry already points at. Two rows
   in a three-row sidebar leading to one URL is worse navigation than one row, not better.
2. The file's own docstring sets the threshold — *"a two-item list does not need it, and phase 16
   can revisit when there are five"* — and it is about active-link highlighting, which a duplicate
   href would make impossible to get right (both rows would highlight).
3. `/admin`'s hub card is the discoverable entry point and now names the current relationship, which
   is more useful than a link would be: it answers "what is she set to" without a navigation.

If the panel ever earns its own route, that is the edit that earns the nav entry too.

---

### Step 9: `tests/admin.tuning.test.ts`

**File:** `tests/admin.tuning.test.ts` (new)
**Change:** `tests/admin.memory.test.ts`'s exact shape — a pure half and a structural half.
`vitest.config.ts` includes only `tests/**/*.test.ts` (no `.tsx`) and runs `environment: 'node'`
with no jsdom, so there is no component render here by design; the panel's behaviour is testable
because Step 1 put it in pure functions.

**Code:**

```ts
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ninaTuningResetSchema, ninaTuningWriteSchema } from '@/lib/admin/schema'
import {
  NINA_NOTES_MAX,
  NINA_WARDROBE_MAX,
  changedTuningFields,
  hasRelationshipCopy,
  hasTuningCopy,
  loudestDials,
  prettifyKey,
  relationshipCopy,
  toTuningDraft,
  tuningCopy,
  tuningDraftEquals,
  type TuningDraft,
} from '@/lib/admin/tuningModel'
import {
  NINA_DIALS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_RELATIONSHIPS,
  NINA_TRAITS,
  NINA_TUNING_DEFAULTS,
} from '@/lib/nina/tuning'

/**
 * `/admin/nina`'s character panel — the testable surface.
 *
 * `vitest.config.ts` runs `environment: 'node'` and includes no `.tsx`, so there is no render
 * here. That is not a gap: everything about this panel that could be wrong in a way a human would
 * not notice is a pure function in `lib/admin/tuningModel.ts` or a Zod shape in
 * `lib/admin/schema.ts`, which is why they are there.
 *
 * The last five cases are STRUCTURAL — they read source files and assert a boundary, the technique
 * `tests/admin.memory.test.ts` uses for the same reason: *a structural guarantee that is only a
 * comment decays.*
 */

const DEFAULTS: TuningDraft = toTuningDraft(NINA_TUNING_DEFAULTS)

/** A valid save payload, with whatever overrides a case needs. */
function payload(overrides: Partial<TuningDraft> = {}) {
  return { userId: 'user_1', ...DEFAULTS, ...overrides }
}

describe('toTuningDraft — the read-side seam', () => {
  it('carries every trait and every dial phase 1 declares', () => {
    for (const key of NINA_TRAITS) {
      expect(DEFAULTS.traits[key]).toBe(NINA_TUNING_DEFAULTS.traits[key])
    }
    for (const key of NINA_DIALS) {
      expect(DEFAULTS.dials[key]).toBe(NINA_TUNING_DEFAULTS.dials[key])
    }
    expect(DEFAULTS.relationship).toBe(NINA_TUNING_DEFAULTS.relationship)
    expect(DEFAULTS.wardrobe).toBe(NINA_TUNING_DEFAULTS.wardrobe)
    expect(DEFAULTS.notes).toBe(NINA_TUNING_DEFAULTS.notes)
  })

  it('copies the records, so a draft edit cannot reach into the row it came from', () => {
    const draft = toTuningDraft(NINA_TUNING_DEFAULTS)
    draft.traits[NINA_TRAITS[0]] = 99
    expect(NINA_TUNING_DEFAULTS.traits[NINA_TRAITS[0]]).not.toBe(99)
  })

  it('does not carry the revision — the panel takes that as its own prop', () => {
    expect('revision' in DEFAULTS).toBe(false)
  })
})

describe('the copy is complete for phase 1s vocabulary', () => {
  // RECONCILED: this now passes BY CONSTRUCTION, because `tuningCopy` reads
  // `NINA_TRAIT_SPECS` / `NINA_DIAL_SPECS` / `NINA_ADDRESS` rather than a local table — so a dial
  // phase 1 adds arrives with its label and its hint already written. The cases stay anyway,
  // because they are what would catch a spec entry landing with an empty `label` or `axis`, and
  // because the fallback below must never be how an unlabelled slider ships.
  it('has a real label and hint for all eleven traits', () => {
    expect(NINA_TRAITS).toHaveLength(11)
    for (const key of NINA_TRAITS) {
      expect(hasTuningCopy(key), `no copy for trait ${key}`).toBe(true)
      expect(tuningCopy(key).hint.length).toBeGreaterThan(0)
    }
  })

  it('has a real label and hint for every R3 dial', () => {
    for (const key of NINA_DIALS) {
      expect(hasTuningCopy(key), `no copy for dial ${key}`).toBe(true)
      expect(tuningCopy(key).hint.length).toBeGreaterThan(0)
    }
  })

  it('names the address form for all five relationships', () => {
    expect(NINA_RELATIONSHIPS).toHaveLength(5)
    for (const value of NINA_RELATIONSHIPS) {
      expect(hasRelationshipCopy(value), `no copy for relationship ${value}`).toBe(true)
      expect(relationshipCopy(value).hint.length).toBeGreaterThan(0)
    }
  })

  it('falls back to a readable label for a key it has never heard of', () => {
    expect(tuningCopy('some_new_dial').label).toBe('Some new dial')
    expect(tuningCopy('some_new_dial').hint).toBe('')
    expect(prettifyKey('casual_friend')).toBe('Casual friend')
  })
})

describe('changedTuningFields — what the operator sees as unsaved', () => {
  it('is empty for two identical drafts', () => {
    expect(changedTuningFields(DEFAULTS, DEFAULTS)).toEqual([])
    expect(tuningDraftEquals(DEFAULTS, toTuningDraft(NINA_TUNING_DEFAULTS))).toBe(true)
  })

  it('names a moved dial by its dotted path', () => {
    const key = NINA_TRAITS[0]
    const moved: TuningDraft = {
      ...DEFAULTS,
      traits: { ...DEFAULTS.traits, [key]: DEFAULTS.traits[key] + 1 },
    }
    expect(changedTuningFields(moved, DEFAULTS)).toEqual([`traits.${key}`])
    expect(tuningDraftEquals(moved, DEFAULTS)).toBe(false)
  })

  it('names the three non-numeric fields', () => {
    const edited: TuningDraft = {
      ...DEFAULTS,
      relationship: 'something_else',
      wardrobe: 'short pants',
      notes: 'she knows about the half marathon',
    }
    expect(changedTuningFields(edited, DEFAULTS)).toEqual(['relationship', 'wardrobe', 'notes'])
  })

  it('counts a key that exists on one side only', () => {
    const missing: TuningDraft = { ...DEFAULTS, traits: {} }
    expect(changedTuningFields(missing, DEFAULTS)).toHaveLength(NINA_TRAITS.length)
  })
})

describe('loudestDials — what the hub card prints', () => {
  it('is empty when nothing was moved, so the card can say so', () => {
    expect(loudestDials(DEFAULTS, DEFAULTS)).toEqual([])
  })

  it('ranks by distance from the default rather than by value', () => {
    const [first, second] = NINA_TRAITS
    const draft: TuningDraft = {
      ...DEFAULTS,
      traits: {
        ...DEFAULTS.traits,
        [first]: NINA_SCORE_MIN,
        [second]: NINA_SCORE_MAX,
      },
    }
    const loud = loudestDials(draft, DEFAULTS, 2)
    const deltas = loud.map((dial) => dial.delta)
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a))
    expect(loud.map((dial) => dial.key).sort()).toEqual([first, second].sort())
  })

  it('caps at the limit', () => {
    const draft: TuningDraft = {
      ...DEFAULTS,
      traits: Object.fromEntries(
        NINA_TRAITS.map((key) => [
          key,
          DEFAULTS.traits[key] === NINA_SCORE_MAX ? NINA_SCORE_MIN : NINA_SCORE_MAX,
        ]),
      ),
    }
    expect(loudestDials(draft, DEFAULTS, 3)).toHaveLength(3)
  })
})

describe('ninaTuningWriteSchema — the boundary', () => {
  it('accepts the default tuning as a payload', () => {
    expect(ninaTuningWriteSchema.safeParse(payload()).success).toBe(true)
  })

  it('refuses a missing trait rather than defaulting it', () => {
    const { [NINA_TRAITS[0]]: _dropped, ...rest } = DEFAULTS.traits
    expect(ninaTuningWriteSchema.safeParse(payload({ traits: rest })).success).toBe(false)
  })

  it('refuses a dial key nobody declared, instead of stripping it', () => {
    const traits = { ...DEFAULTS.traits, flirtyy: 90 }
    expect(ninaTuningWriteSchema.safeParse(payload({ traits })).success).toBe(false)
  })

  it('refuses a value outside phase 1s own range, and a fractional one', () => {
    const key = NINA_TRAITS[0]
    for (const bad of [NINA_SCORE_MIN - 1, NINA_SCORE_MAX + 1, 42.5, Number.NaN]) {
      const traits = { ...DEFAULTS.traits, [key]: bad }
      expect(ninaTuningWriteSchema.safeParse(payload({ traits })).success, `${bad}`).toBe(false)
    }
  })

  it('refuses a relationship outside the five', () => {
    expect(ninaTuningWriteSchema.safeParse(payload({ relationship: 'wife' })).success).toBe(false)
  })

  it('bounds the wardrobe and the notes, and accepts both empty', () => {
    expect(ninaTuningWriteSchema.safeParse(payload({ wardrobe: '', notes: '' })).success).toBe(true)
    expect(
      ninaTuningWriteSchema.safeParse(payload({ wardrobe: 'x'.repeat(NINA_WARDROBE_MAX + 1) }))
        .success,
    ).toBe(false)
    expect(
      ninaTuningWriteSchema.safeParse(payload({ notes: 'x'.repeat(NINA_NOTES_MAX + 1) }))
        .success,
    ).toBe(false)
  })

  it('refuses an empty userId, which requireAdmin would never produce', () => {
    expect(ninaTuningWriteSchema.safeParse(payload({ userId: '' } as never)).success).toBe(false)
    expect(ninaTuningResetSchema.safeParse({ userId: '' }).success).toBe(false)
    expect(ninaTuningResetSchema.safeParse({ userId: 'user_1' }).success).toBe(true)
  })
})

/* ── the structural half ─────────────────────────────────────────────────────────────────────── */

const ACTIONS = 'lib/admin/tuningActions.ts'
const MODEL = 'lib/admin/tuningModel.ts'
const PANEL = 'components/admin/CharacterPanel.tsx'
const SLIDER = 'components/admin/DialSlider.tsx'
const ALBUM_PAGE = 'app/admin/nina/page.tsx'

describe('the gate cannot be forgotten', () => {
  it('opens every action with requireAdmin(), above any use of an argument', () => {
    const bodies = readFileSync(ACTIONS, 'utf8').split('export async function ').slice(1)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      const gate = body.indexOf('await requireAdmin()')
      const zod = body.indexOf('.safeParse(')
      expect(gate).toBeGreaterThan(-1)
      expect(zod).toBeGreaterThan(-1)
      expect(gate).toBeLessThan(zod)
    }
  })

  it('gates the page before it reads the tuning', () => {
    const source = readFileSync(ALBUM_PAGE, 'utf8')
    expect(source.indexOf('await requireAdmin()')).toBeLessThan(source.indexOf('readNinaTuning('))
  })
})

describe('one save, not sixteen — plan invariant 11', () => {
  it('exports exactly two actions: the whole-tuning save and the reset', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    const exported = source.match(/^export async function (\w+)/gm) ?? []
    expect(exported).toHaveLength(2)
    expect(source).toContain('export async function saveNinaTuningAction')
    expect(source).toContain('export async function resetNinaTuningAction')
  })

  it('writes through phase 1s query and revalidates this page', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).toContain('writeNinaTuning(')
    expect(source).toContain("revalidatePath('/admin/nina')")
  })
})

describe('the client half stays client-safe', () => {
  it('keeps tuningModel client-safe: its only import is phase 1s zero-import module', () => {
    /* Value imports are fine — the labels and the words come from `tuning.ts`, which has NO imports
     * of its own (phase 1 asserts that by reading its source). What must never appear here is a
     * second module: `server-only`, drizzle, or anything under `@/lib/db`. */
    const source = readFileSync(MODEL, 'utf8')
    const imports = source.match(/^import[\s\S]*?from '([^']+)'/gm) ?? []
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) expect(line).toContain("from '@/lib/nina/tuning'")
    expect(source).not.toContain('server-only')
    expect(source).not.toContain('@/lib/db')
  })

  it("declares 'use client' and reaches nothing server-only", () => {
    for (const path of [PANEL, SLIDER]) {
      const source = readFileSync(path, 'utf8')
      expect(source.startsWith("'use client'")).toBe(true)
      for (const forbidden of [
        'server-only',
        '@/lib/nina/queries',
        '@/lib/db/',
        '@/lib/env',
        '@/lib/admin/requireAdmin',
        '@/components/ui/AppShell',
      ]) {
        expect(source, `${path} reaches ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

describe('the preview is an assembly, not a call — plan invariant 5', () => {
  it('assembles the prompt with the pure builder and awaits no model entry point', () => {
    const source = readFileSync(ALBUM_PAGE, 'utf8')
    expect(source).toContain('buildNinaSystemPrompt(')
    for (const guarded of [
      'runNinaTurn',
      'distillNinaMemory',
      'describeNinaImage',
      'resolveNinaPromises',
      'getOrCreateInsight',
    ]) {
      expect(source, `the album page names ${guarded}`).not.toContain(guarded)
    }
  })
})
```

**Impact:** One new suite in the default `npm test` run. It reads five source files, so a rename
inside this phase must move the constants at the top of the structural half with it.

---

## Verification

**Build:** `npm run typecheck && npm run build`
**Tests:** `npm test` (and specifically `npx vitest run tests/admin.tuning.test.ts`)
**Guards:** `npm run lint && npm run ci:llm-payload-guard && npm run ci:client-secret-guard && npm run ci:data-layer-guard && npm run ci:f08-guard`

- `ci:llm-payload-guard` — the page must pass. It names `buildNinaSystemPrompt`, which is in no
  guard table, and none of the five guarded symbols.
- `ci:client-secret-guard` — Rule 1 scans `'use client'` modules for secret names; the panel names
  no environment variable at all.
- `ci:f08-guard` — Rule 3 fires on an interpolated value followed by `km`/`kcal`/`bpm`/`spm`. Dial
  values are unitless and no template literal in this phase is followed by a unit.

**Manual check:**

1. `/admin/nina` — the album header is the first thing, then a shut **Her character** row, then the
   album. Nothing about folders, paging, upload, crop or share behaves differently.
2. Open the disclosure. Eleven trait sliders, the R3 dials, five relationship radios, wardrobe,
   notes, the prompt preview. Tab through it: every slider takes focus, arrow keys move it, the
   number beside it changes.
3. Move `flirty` and `steamy`, pick **Girlfriend**. The summary line updates while shut; the
   changed dials show accent numbers with an unsaved dot; the header says *"3 unsaved"*.
4. **Save the whole tuning.** One request in the network panel, not sixteen. The note names a
   revision. The unsaved dots clear. The prompt preview's label names the new revision and its text
   contains the flirty/steamy/girlfriend material.
5. Reload with `?folder=…&page=2`. The panel still reads the saved row and the album is still on
   page 2 of that folder.
6. `/admin` — the third card names **Girlfriend** and the loudest dials, and links into the panel.
7. **Reset to defaults**, confirm. Every slider returns to its default, the revision bumps again,
   and the preview is once more today's prompt.
8. Send Nina a message on `/nina` and check she uses the new address form — with no deploy and no
   other step, which is the feature.

**Exit criteria:** `/admin/nina` renders eleven trait sliders, the five-way relationship selector,
the R3 dials, the wardrobe and notes fields, and a server-rendered preview of the assembled system
prompt; one Server Action writes the whole tuning and bumps its revision; a second resets it to
`NINA_TUNING_DEFAULTS`; the panel is shut on arrival so the album is still the page's working
surface; and the preview is the pure assembler with no model call anywhere in the render.

## Handoffs

**To phase 6 (the sweep and the record) — what the two readmes need to say.** I do not write them;
this is the content:

- `components/admin/.workflows/package_readme.md`: `CharacterPanel.tsx` is the character surface —
  one `<details>` shut by default, `useTransition` with plain-argument actions, and the reason it
  lives on the album page rather than a route of its own (the user named `/admin/nina`, and the
  album is the page's working surface for *"hundreds of profile pics"*). `DialSlider.tsx` is the
  repo's second `<input type="range">` and the first shared one; record **why it is not in
  `components/ui/`** (one caller, one audience, and the barrel is a bundle boundary with the
  `AppShell` precedent behind it) so the next person does not "fix" it by promoting it.
- `lib/admin/.workflows/package_readme.md`: `tuningActions.ts` is `requireAdmin()` → Zod →
  `writeNinaTuning` → `revalidatePath`, **two** actions and not sixteen (plan invariant 11), and
  `revalidatePath` is not how the edit reaches Nina — the same sentence `memoryActions.ts` already
  carries. `tuningModel.ts` is the client-safe half and the home of the read-side adaptation seam;
  `schema.ts` gained a fourth appended section.
- `CHANGELOG.md`: the panel, the one-save shape, and the fact that the behavioural rollback is
  "reset every dial" rather than a revert.

**Also for phase 6's sweep:** there is **no vocabulary mirror left in this package.** The draft's
`DIAL_COPY` / `TRAIT_COPY` / `RELATIONSHIP_COPY` tables are gone; `tuningCopy` and
`relationshipCopy` read phase 1's specs, so a dial cannot exist without a label and the panel cannot
promise a word the prompt does not use. What phase 6 should still check is the one thing that is
genuinely this package's own: `RELATIONSHIP_NOTE`'s five sentences about what choosing a level
*changes about the app*. If one of them promises something phases 2 and 3 do not produce, the fix is
the note, not the prompt.

**Left to other phases, found while planning:**

- **R4 and R6 are not mine.** The panel's hint text *describes* the behaviour each dial produces;
  producing it is phases 2 and 3. If a hint here and the prompt disagree after phase 3 lands, the
  prompt is what ships and the hint is what is wrong.
- **R5 is not mine.** The wardrobe field's copy says *"it goes into the photograph, not into her
  voice"* because phase 4 reads that field into the image prompt. Nothing in this phase reads it.
- **No `?user=` picker on this panel.** `/admin/memory` has one; this page does not, and the tuning
  is written for the signed-in admin's own `userId`. Adding a picker means the panel, the two
  actions and the album's own reads would all need to agree on a target id, and the album (which
  owns this route) is single-user today. If the operator ever needs a second account's character,
  that is one `?user=` param validated by `getAdminUser` and threaded through both actions — an
  additive change to this phase's files, and deliberately not taken now.
- **No live client-side preview.** Recomputing the prompt as the sliders move would put the whole
  persona in a browser bundle. If it is ever wanted, the shape is a third action returning the
  assembled string, not an import.

## Rollback

One commit on `feature/nina-character-tuning`, so `git revert <sha>` backs the phase out on its
own. It leaves nothing behind:

- Five new files (`lib/admin/tuningModel.ts`, `lib/admin/tuningActions.ts`,
  `components/admin/DialSlider.tsx`, `components/admin/CharacterPanel.tsx`,
  `tests/admin.tuning.test.ts`) simply disappear.
- `lib/admin/schema.ts` loses one import block and one appended section; nothing above them moved,
  so the revert cannot touch the album or memory shapes.
- `app/admin/nina/page.tsx` loses one read from the `Promise.all`, two JSX blocks and one import
  block. The album's validation, mapping and `shareOrigin()` prop were never edited.
- `app/admin/page.tsx` loses one read and one `Card`.
- **No migration, no schema change, no environment variable.** Phase 1's table and rows stay; a
  reverted panel leaves the row that was last written, and phase 3 keeps reading it — which is the
  correct behaviour, since the tuning is still in effect whether or not the editor is deployed.

To roll back *her behaviour* without touching code: **Reset to defaults** in the panel. Invariant 2
guarantees that is the Nina who shipped.

---

## Assumptions

Phase 1 and phase 3 were still being planned when this file was written
(`.workflows/plan/nina-character-tuning/phase-1.md` and `phase-3.md` did not exist), so the
following are stated for the reconciler to align rather than guessed silently. **The blast radius
of each is deliberately small: exactly two functions and one Zod section know phase 1's shape.**

**These were assumptions when this plan was written concurrently with phase 1. They are now
CONFIRMED against phase 1's landed contract, and the four wrong names are corrected throughout.**

1. **`lib/nina/tuning.ts` exports, as values:** `NINA_TRAITS` (11), `NINA_DIALS` (4 —
   `profanity`, `clinginess`, `photoEagerness`, `verbosity`), `NINA_RELATIONSHIPS` (5),
   `NINA_SCORE_MIN` (0), `NINA_SCORE_MAX` (100), `NINA_WARDROBE_MAX` (200), `NINA_NOTES_MAX`
   (2000), `NINA_TUNING_DEFAULTS`, `NINA_TRAIT_SPECS`, `NINA_DIAL_SPECS`, `NINA_ADDRESS`,
   `isNinaTrait`, `isNinaDial`, `isNinaRelationship`. **Confirmed.** The draft named
   `NINA_TRAIT_KEYS` / `NINA_DIAL_KEYS` / `NINA_DIAL_MIN` / `NINA_DIAL_MAX`, none of which exist;
   every occurrence in this plan has been retargeted.
2. **`NinaTuning` is grouped — confirmed:**
   `{ readonly traits: Readonly<Record<NinaTrait, number>>; readonly dials: Readonly<Record<NinaDial, number>>; readonly relationship: NinaRelationship; readonly wardrobe: string; readonly notes: string; readonly revision: number }`.
   `wardrobe` and `notes` are `string` and never null, so the panel's `''` is the one empty value
   and `toTuningDraft` copies them straight across. The `toTuningDraft` / `toTuningWrite` seam stays
   anyway: it is one function each and it is where a future regrouping would land.
3. **`readNinaTuning(userId): Promise<NinaTuning>`** never returns null (phase 1's exit criteria say
   so) and **`writeNinaTuning(userId, write): Promise<NinaTuning>`** returns the **whole stored
   row** — reconciled; the draft of this plan assumed `Promise<number>`. Both actions destructure
   `revision` off it. The panel's `revision` prop comes from the page's re-read either way, so the
   note is the only thing that would have lost the number.
4. **`z.enum(NINA_RELATIONSHIPS)` typechecks**, which holds if phase 1 declares the array
   `as const`. If it is typed as `readonly NinaRelationship[]`, replace that one line with:
   ```ts
   relationship: z
     .string()
     .refine(
       (value) => (NINA_RELATIONSHIPS as readonly string[]).includes(value),
       'Not a relationship this panel offers.',
     ),
   ```
   and add `as NinaRelationship` in `toTuningWrite`'s `relationship` field.
5. **`buildNinaSystemPrompt` is exported from the `@/lib/nina/prompts` barrel** (phase 3 owns
   `prompts/index.ts` and the plan index says the export goes there). If it is only in
   `prompts/system.ts`, the page imports `@/lib/nina/prompts/system` instead — one line.
6. **The R3 dial set is phase 1's, and so is its copy — RESOLVED.** The draft carried a two-entry
   `DIAL_COPY` (`verbosity`, `photo`) and a note that it was *"intentionally incomplete pending
   phase 1"*, with a completeness test that would fail until somebody hand-filled it. Phase 1's
   landed set is `profanity`, `clinginess`, `photoEagerness`, `verbosity` — so the draft was wrong
   on two of its two entries. **The table is gone entirely**: `tuningCopy` reads
   `NINA_DIAL_SPECS[key].label` and `.axis`, which phase 1 wrote for exactly this, so the set can
   never be incomplete and the completeness test in Step 9 passes by construction rather than by
   somebody remembering. The same applies to the eleven traits (`NINA_TRAIT_SPECS`) and the five
   relationships (`NINA_ADDRESS`).
7. **Phase 1's clamp is on the write path.** Everything about the range in
   `ninaTuningWriteSchema` is a boundary refusal, not the guarantee; `schema.ts`'s own header makes
   that division for `cropWriteSchema` and it is the one this phase follows.
