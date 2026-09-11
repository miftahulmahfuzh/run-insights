> Adopted from `SIMPLIFY_PERSONALITY_SETTINGS_PLAN.md` phase 2. Source: `.workflows/plan/simplify-personality-settings/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 2: Auto-save the Personality panel

**Plan set:** `SIMPLIFY_PERSONALITY_SETTINGS_PLAN.md`
**Analysis:** `20260909-084240-P3R5_code_analyzer.md`
**Satisfies:** R2 — remove "Discard changes" and "Reset to defaults"; the Personality panel auto-saves every time a change is made
**Depends on:** Phase 1 — "Purge the tuning revision mechanism everywhere"
**Difficulty:** HARD
**Package:** `components/admin`, `lib/admin`, `tests`

---

## Goal

`CharacterPanel` loses its staged-commit row (Save / Discard / Reset and the `confirmingReset`
block) entirely; every control commits itself through one whole-tuning Server Action — dials
debounced after the drag settles, the relationship radios and every per-parameter toggle
immediately on change, the notes on blur (never a keystroke debounce). A "Saving… / Saved /
Unsaved edits" status line replaces the "N unsaved" counter, a failed save shows its sentence
with the panel still pending, and the panel adopts the canonical stored row after every save
without clobbering edits made since dispatch. `resetNinaTuningAction` and
`ninaTuningResetSchema` are deleted. Nothing else changes: `DialSlider`'s props, the image
panels, the DB, and the turn path are untouched.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Post-phase-1 shapes this phase BUILDS ON (assumptions on Phase 1 — flag to the reconciler if
Phase 1's plan disagrees):**

- `AdminTuningResult` after Phase 1 is `{ ok: boolean; error?: string; note?: string }` — no
  `revision`. Phase 2 adds one field (below) and deletes the reset action.
- `CharacterPanelProps` after Phase 1 is `{ userId, tuning, defaults, promptPreview }` — the
  `revision` prop is gone, and the personality page no longer passes it.
- `NinaTuningWrite` is GONE. Phase 1 deletes the alias whole — its entire premise was the
  revision (`Omit<NinaTuning, 'revision'>` with no revision left to omit) — and every signature
  that named it now names `NinaTuning`: `writeNinaTuning(userId, tuning: NinaTuning)`,
  `tuningToColumns(tuning: NinaTuning)`, `toTuningWrite(input): NinaTuning`. Phase 2 uses
  `NinaTuning` directly and does not re-declare a local write shape — a second declaration is the
  "agreed rather than shared" constant `lib/admin/avatars.ts` warns about.
- `lib/admin/tuningModel.ts` still exports `tuningDraftEquals` and `changedTuningFields`
  (unchanged by Phase 1's comment tweak at its `:53`).
- Phase 1 leaves a draft-follows-prop resync block in the panel (re-keyed on content). **Phase 2
  deletes that block wholesale** — the rewrite below replaces the file, so whatever form Phase 1
  gave it (`lastRevision`, `lastPropTuning`, …) disappears here.

**Deletes:**
- `resetNinaTuningAction` (`lib/admin/tuningActions.ts:148-178`)
- `ninaTuningResetSchema`, `NinaTuningResetInput` (`lib/admin/schema.ts:494-502`, comment block included)
- From `CharacterPanel.tsx`: the Save/Discard/Reset buttons and `confirmingReset` state
  (`:428-493`), the `run()` helper (`:185-189`), the `result?.ok === true` note paragraph
  (`:424-426`), every `disabled={pending}`, the render-time draft-resync block (`:141-146` as
  Phase 1 leaves it), and the `Button` import
- From `tests/admin.tuning.test.ts`: the `ninaTuningResetSchema` import (`:5`) and the two
  `ninaTuningResetSchema` assertions (`:269-270`)

**Renames:** none (symbol-level). Inside the panel, `rowUnsaved` → `rowPending` and the `unsaved`
Set → `pendingFields` — component-local names, no external surface.

**Creates:**
- `TUNING_DIAL_COMMIT_DEBOUNCE_MS = 600` (`lib/admin/tuningModel.ts`)
- `mergeTuningAfterSave(current, sent, canonical): TuningDraft` (`lib/admin/tuningModel.ts`)

**Signature changes:**
- `AdminTuningResult` (`lib/admin/tuningActions.ts:47-54`): Phase 1's revision-free
  `{ ok, error?, note? }` **gains `tuning?: TuningDraft`** — the canonical stored draft, present
  on success. Final shape:
  ```ts
  export interface AdminTuningResult {
    ok: boolean
    error?: string
    note?: string
    /** The row as stored, after `coerceNinaTuning`. Present on success. */
    tuning?: TuningDraft
  }
  ```
  Flat and optional-fielded on purpose — `AdminMemoryResult` (`lib/admin/memoryActions.ts:63-68`)
  is the convention this file has always followed; a discriminated union would be the odd shape
  on this page.
- `saveNinaTuningAction` return: adds `tuning: toTuningDraft(stored)` to the success result; the
  success `note` becomes `'Saved. She reads it on her very next message — there is no cache on
  her turn path.'` and the failure copy becomes `'The write failed and nothing was changed —
  move any control to try again.'` (there is no retry button anymore; the copy names the retry).
- `failed(where, cause)` → `failed(cause)` (one caller left).

**Requires (from earlier phases):** Phase 1 landed — revision-free `NinaTuning` /
`writeNinaTuning` returning the stored row, revision-free panel props and strings, `tuningDraftEquals`
re-keying present (so the tree typechecks at the Phase 1 → Phase 2 boundary), migration 0016
committed and NOT applied.

**Leaves alone (owned by others):**
- `components/admin/DialSlider.tsx` **props** — Phase 2 touches that file for ONE docstring
  sentence only (Step 5); every prop, the `unsaved` dot and its `title="Unsaved"`, and the
  "default N" chip survive unchanged.
- `components/admin/ImageGenPanel.tsx` (its own Save/Discard/Reset/`confirmingReset`),
  `components/admin/ImageGenTestPanel.tsx`, `lib/admin/imageGenTestView.ts` — the
  image-generation surface, out of scope by the plan index. `lib/admin/imageGenActions.ts` sits
  in the same bucket except ONE docstring sentence (Step 5, File 3) whose citation names the
  action this phase deletes.
- `lib/nina/*`, `lib/db/*`, `drizzle/*`, `app/admin/page.tsx`, the turn path, prompt assembly.
- `app/admin/personality/page.tsx` — except ONE word in a docstring that Phase 2's own deletion
  makes stale ("in both actions" → "in the save action", Step 5). No code change on that page.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/tuningModel.ts` | modify | add `TUNING_DIAL_COMMIT_DEBOUNCE_MS` + private `mergeRecord` + `mergeTuningAfterSave` after `tuningDraftEquals` (`:246`), before `LoudDial` (`:248`) |
| `lib/admin/tuningActions.ts` | modify | full rewrite: delete `resetNinaTuningAction`, `AdminTuningResult` gains `tuning?`, save returns the canonical draft, `failed()` reworded |
| `lib/admin/schema.ts` | modify | delete `ninaTuningResetSchema` + `NinaTuningResetInput` (`:494-502`); rewrite the `ninaImagePrefsResetSchema` docstring that cites it (`:707-711`) to stand alone |
| `components/admin/CharacterPanel.tsx` | modify | full rewrite of the interaction layer (complete file below): auto-save pipeline, no Save/Discard/Reset, status line, canonical merge |
| `components/admin/DialSlider.tsx` | modify | comment-only: one sentence in the "default N chip" paragraph (`:53-54`) whose "still one Save" claim Phase 2 falsifies |
| `app/admin/personality/page.tsx` | modify | comment-only: "in both actions" → "in the save action" (`:44`) |
| `lib/admin/imageGenActions.ts` | modify | comment-only: drop the "for `resetNinaTuningAction`'s reason" citation from the image-prefs reset docstring (`:154`) — the argument stands on its own (Step 5, File 3) |
| `tests/admin.tuning.test.ts` | modify | import line, userId-empty case, two-actions → one-action structural test, new `mergeTuningAfterSave` + debounce + panel-pipeline structural cases |

Line references are against this worktree's HEAD (`557a05c`); Phase 1 shifts some of them —
anchor edits by the quoted code, not the number.

## What Replaces What (the panel's old machinery → the pipeline)

| Before (post-Phase-1 panel) | After (this phase) |
|---|---|
| `draft` + render-time draft-follows-prop resync (content-keyed) | `draft` + `saved` state pair; the prop is the mount-time baseline only, `saved` is updated exclusively from the action's returned canonical row; the resync block is deleted |
| `run(action)` transition helper | `dispatchSave(sent)` — one function, one action, whole draft |
| `confirmingReset` + Reset button + `resetNinaTuningAction` | deleted; the per-dial "default N" chip in `DialSlider` is the surviving route back to defaults and now auto-commits through the debounce |
| `dirty` + "N unsaved" header counter | `clean` (`tuningDraftEquals(draft, saved)`) + tri-state status line: "Saving…" (in flight or debounce armed) / "Saved" (idle and clean) / "Unsaved edits" (dirty, nothing pending — typing notes, or a save failed) |
| `rowUnsaved(path, key)` dots against the `tuning` prop | `rowPending(path, key)` dots against `saved` — same predicate, same `changedTuningFields` machinery, same word "unsaved" in the labels. **Decision, as the scope asked for it:** the per-row dots STAY. They now mean "this row is not what the database holds yet" — exactly the pending-save indicator — and keeping the word "unsaved" (rather than relabelling) keeps them consistent with `DialSlider`'s own `title="Unsaved"`, which this phase may not touch. |
| `disabled={pending}` on every control | nothing is disabled during a save (see the panel header's argument); `pending` drives only the status line |

## Implementation Steps

Steps 2–4 are one atomic knot (the tree compiles again once Step 4 lands); Steps 1, 5, 6 are
independently safe. Do them in order.

### Step 1: The pure machinery — settle window and the canonical merge

**File:** `lib/admin/tuningModel.ts:246` (insert after `tuningDraftEquals`, before `export interface LoudDial`)

**Change:** two exports plus one private helper. This file is where the panel's pure logic lives
by the repo's own rule — `tests/admin.tuning.test.ts`'s header: *"everything about this panel
that could be wrong in a way a human would not notice is a pure function in
`lib/admin/tuningModel.ts` … which is why they are there."* The additions import nothing (the
client-safety structural test asserts this file's only import is `@/lib/nina/tuning`).

**Code:**

```ts
/**
 * How long a dial waits after its last change before it commits — the settle window of the
 * auto-save panel (the simplify set's R2).
 *
 * A native `<input type="range">` fires `change` on every pointer move of a drag and on every
 * arrow keypress, and it KEEPS FOCUS after the thumb is released — so `MemoryTable.tsx`'s
 * measured "blur is the commit moment" rule ("HOW A CELL SAVES, AND WHY IT IS BLUR AND NOT A
 * DEBOUNCE") cannot transfer to a slider: there is no blur event that means "this edit is
 * finished". The debounce IS the settle detector. 600 ms sits above the tens-of-milliseconds
 * gaps between change events inside one continuous drag (so one drag is one save) and below the
 * time it takes to wonder whether the edit landed (so the "Saved" flip still arrives while the
 * operator is looking at the control). The timer it names is cleared on re-arm, on unmount, and
 * whenever an immediate commit has already carried everything pending — the hygiene
 * `components/admin/ImageGenTestPanel.tsx` records for its own `setTimeout` handles.
 *
 * Named here rather than in the component for the same reason every bound in this file is
 * imported rather than re-declared: one home, and a test can pin it.
 */
export const TUNING_DIAL_COMMIT_DEBOUNCE_MS = 600

/**
 * One record of a draft, merged field by field after a save lands.
 *
 * The rule is one line per key: **adopt the stored value only where the operator has not touched
 * the field since dispatch** — `current` still holds exactly what was `sent`. A field that has
 * moved on keeps the newer local value and stays pending; the next commit carries it.
 *
 * Generic and private because `TuningDraft` carries three records of different value types and
 * the rule is identical for all three. Keys are taken from the union of all three sides, so a
 * key present on one side only is decided rather than dropped.
 */
function mergeRecord<T>(
  current: Record<string, T>,
  sent: Record<string, T>,
  canonical: Record<string, T>,
): Record<string, T> {
  const merged: Record<string, T> = {}
  for (const key of Object.keys({ ...sent, ...canonical, ...current })) {
    if (current[key] !== sent[key] && current[key] !== undefined) {
      merged[key] = current[key]
    } else if (canonical[key] !== undefined) {
      merged[key] = canonical[key]
    } else if (sent[key] !== undefined) {
      merged[key] = sent[key]
    }
    /* All three undefined: the key is in nobody's draft — leave it out of the merge too. */
  }
  return merged
}

/**
 * The post-save canonical merge — what the auto-save panel does when a save comes back.
 *
 * `writeNinaTuning` coerces before it writes, and `coerceNinaNotes` trims and collapses blank
 * runs, so the stored row can differ cosmetically from what was typed ("  hello  \n\n\n\n world  "
 * is stored as "hello\n\n world"). The panel cannot keep showing the pre-coercion text after the
 * row that holds the canonical form has landed — the operator would watch the textarea "not take"
 * — but it also cannot adopt the stored row wholesale, because the operator may have kept editing
 * while the save was in flight, and a wholesale adoption would write the older stored value over
 * the newer local one. That is the one failure this merge exists to prevent.
 *
 * So: for each field, if `current` still equals what was `sent`, the field was untouched since
 * dispatch and takes the canonical value (a coerced notes appears; a clamped dial snaps to what
 * was stored); otherwise the field keeps the newer local value and remains pending — it rides the
 * next commit. `changedTuningFields` is the same per-field comparison in boolean form, which is
 * why the merge and the pending dots always agree.
 */
export function mergeTuningAfterSave(
  current: TuningDraft,
  sent: TuningDraft,
  canonical: TuningDraft,
): TuningDraft {
  return {
    traits: mergeRecord(current.traits, sent.traits, canonical.traits),
    dials: mergeRecord(current.dials, sent.dials, canonical.dials),
    enabled: mergeRecord(current.enabled, sent.enabled, canonical.enabled),
    /* The two scalars are the record rule with no loop: untouched since dispatch -> canonical. */
    relationship:
      current.relationship === sent.relationship ? canonical.relationship : current.relationship,
    notes: current.notes === sent.notes ? canonical.notes : current.notes,
  }
}
```

**Impact:** additive; nothing existing changes. The tree stays green after this step.

### Step 2: `tuningActions.ts` — one action, returning the row it wrote

**File:** `lib/admin/tuningActions.ts:1-178` (full-file replacement)

**Change:** delete `resetNinaTuningAction`; `AdminTuningResult` gains `tuning?: TuningDraft`;
the save action returns the canonical stored draft (`toTuningDraft(writeNinaTuning(...))`);
`failed()` loses its `where` parameter and its copy names the retry affordance that exists now
that no button does.

**Code (the complete new file):**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import { ninaTuningWriteSchema, type NinaTuningWriteInput } from '@/lib/admin/schema'
import { toTuningDraft, type TuningDraft } from '@/lib/admin/tuningModel'
import { writeNinaTuning } from '@/lib/nina/queries'
import type { NinaTuning } from '@/lib/nina/tuning'

/**
 * `/admin/personality`'s character panel, write side — R1, R2, R3, then R4, then the simplify
 * set: the panel commits every control by itself, and this file is the single action they all
 * ride on.
 *
 * The action follows `lib/admin/memoryActions.ts`'s four lines, in this order and for these
 * reasons:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists, and `proxy.ts` matches
 *                                 neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts`),
 *                                 so this call is the only gate on this endpoint.
 *   2. Zod                      — every field, every time. The client is not a source of truth.
 *   3. the write                — one row, through phase 1's `writeNinaTuning`, which owns the
 *                                 clamp and the upsert.
 *   4. `revalidatePath`         — re-renders THIS page, so the prompt preview shows the row that
 *                                 was just written.
 *
 * ── `revalidatePath` IS NOT HOW THE EDIT REACHES NINA, AND THAT IS THE FEATURE ──────────────
 * `memoryActions.ts` records this about the memory tables and it holds verbatim for the tuning:
 * there is no cache anywhere on the turn path, so a committed row is in her next prompt with no
 * invalidation step at all. No deploy, no distillation pass, no revalidation. That is why the
 * panel's own copy says it, and why auto-save is safe to commit a dial the moment its drag
 * settles: what lands is live on her very next message.
 *
 * ── ONE ACTION, NOT SIXTEEN — AND NOW IT IS LITERALLY ONE ───────────────────────────────────
 * Plan invariant 11, and `ninaTuningWriteSchema`'s docstring has the mechanism: Next dispatches
 * Server Actions one at a time per client, so per-dial actions would stall behind each other.
 * The simplify set made the count exact: `resetNinaTuningAction` is gone (the panel it served
 * lost its staged-commit row), this file exports exactly one action, and
 * `tests/admin.tuning.test.ts` asserts the count — "add one action per dial" remains the
 * obvious-looking change the assertion exists to refuse.
 *
 * ── THE RESULT CARRIES THE ROW IT WROTE ──────────────────────────────────────────────────────
 * The success result's `tuning` is `toTuningDraft(stored)` — the row AFTER `coerceNinaTuning`,
 * as the database holds it. The panel adopts it through `mergeTuningAfterSave` (see
 * `tuningModel.ts`): `coerceNinaNotes` trims and collapses, so the stored row can differ
 * cosmetically from what was typed, and the response carries this value and the re-rendered
 * route in one round trip anyway (`server-actions.md`, "A single response carries data and UI")
 * — reading the row off the result is the same freshness as reading it off the prop, without
 * having to tell "my save landed" apart from "the row changed under me". Nothing needs to tell
 * them apart: this panel is the row's only writer, so the only way the row changes under it is
 * this file's own save coming back.
 *
 * ── A RESULT OBJECT, NEVER A THROW ──────────────────────────────────────────────────────────
 * The panel is a `useTransition` client with plain-argument actions — the shape phase 15 set on
 * the sibling admin page. A throw from a Server Action reaches the browser as an opaque digest;
 * a sentence reaches the operator. There is no retry button any more, so the failure sentence
 * names the retry that exists: move any control and it commits again.
 */

export interface AdminTuningResult {
  ok: boolean
  error?: string
  /**
   * One sentence about what was written. The panel's status line is the success surface ("Saved"
   * with no qualifier); this stays in the shape for the result-object convention and for any
   * future caller that wants the sentence.
   */
  note?: string
  /**
   * The row as stored — `toTuningDraft` over what `writeNinaTuning` returned, i.e. AFTER
   * `coerceNinaTuning`. Present on success. The panel merges it with
   * `mergeTuningAfterSave` so coerced values appear without clobbering edits made since
   * dispatch.
   */
  tuning?: TuningDraft
}

/** The action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(cause: unknown): AdminTuningResult {
  console.error('[tune] admin tuning save failed', cause)
  return {
    ok: false,
    error: 'The write failed and nothing was changed — move any control to try again.',
  }
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
 *
 * The return type is `NinaTuning`, IMPORTED from `lib/nina/tuning.ts` rather than re-declared
 * locally. A second declaration of it here is the shape `lib/admin/avatars.ts` warns about:
 * *"a constant that is agreed rather than shared is a constant that will one day disagree."*
 */
function toTuningWrite(input: NinaTuningWriteInput): NinaTuning {
  return {
    traits: input.traits,
    dials: input.dials,
    /* R4. `ninaTuningWriteSchema` builds this shape from `NINA_TUNING_KEYS`, so it is already
     * `Record<NinaTuningKey, boolean>` and no cast is needed on this path either. */
    enabled: input.enabled,
    relationship: input.relationship,
    notes: input.notes,
  }
}

/**
 * Save the whole tuning. One action, one row — the only write the panel has, dispatched by
 * every control at its own commit moment (dials debounced, toggles and radios on change, notes
 * on blur).
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
  /** R4's per-parameter toggles, keyed by `NINA_TUNING_KEYS`. Zod narrows it; this is a comment. */
  enabled: Record<string, boolean>
  relationship: string
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
    /* `writeNinaTuning` returns the whole stored `NinaTuning` — phase 1's landed contract. The
     * row it hands back is what the database actually holds, already coerced, so the result's
     * `tuning` is the truth rather than a hope, and the panel can adopt it without a refetch. */
    const stored = await writeNinaTuning(parsed.data.userId, toTuningWrite(parsed.data))
    revalidatePath('/admin/personality')
    return {
      ok: true,
      tuning: toTuningDraft(stored),
      note: 'Saved. She reads it on her very next message — there is no cache on her turn path.',
    }
  } catch (cause) {
    return failed(cause)
  }
}
```

**Impact:** the tree does NOT compile after this step alone — `CharacterPanel.tsx` still imports
`resetNinaTuningAction`. Step 4 restores it. `NINA_TUNING_DEFAULTS` is no longer imported by this
file (it was the reset action's payload).

### Step 3: `schema.ts` — delete the reset schema, fix the comment that cites it

**File:** `lib/admin/schema.ts:494-502` and `:707-711`

**Change 1 — delete this block entirely** (the docstring, the schema, the type; the surrounding
blank line collapses so `ninaTuningWriteSchema`'s `export type` at `:492` is followed directly by
the nina-emoji-shortcuts banner comment at `:504`):

```ts
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

**Change 2 — `ninaImagePrefsResetSchema`'s docstring** (`:707-711`) cites the schema just
deleted ("for `ninaTuningResetSchema`'s reason"). The image-prefs reset itself stays — only the
citation must stop dangling. Replace:

```ts
/**
 * The reset takes no prefs at all — deliberately, for `ninaTuningResetSchema`'s reason: the
 * defaults it writes are phase 1's module constant, so accepting them from the client would be
 * accepting a client's opinion of what "default" means.
 */
```

with the same argument standing on its own:

```ts
/**
 * The reset takes no prefs at all — deliberately. The defaults it writes are the image-prefs
 * model's own module constant, so accepting them from the client would be accepting a client's
 * opinion of what "default" means.
 */
```

**Impact:** `tuningActions.ts` after Step 2 no longer imports `ninaTuningResetSchema`, so this
deletion is compile-clean. `tests/admin.tuning.test.ts` still imports it — fixed in Step 6.

### Step 4: `CharacterPanel.tsx` — the auto-save rewrite

**File:** `components/admin/CharacterPanel.tsx:1-497` (full-file replacement)

**Change:** the interaction layer rewritten per the table in "What Replaces What". The complete
new file — every surviving docstring section is carried, the staged-commit sections are replaced
by the auto-save argument, and the header now argues why auto-save is safe here and why each
control's commit moment is what it is:

```tsx
'use client'

import * as React from 'react'

import { DialSlider } from '@/components/admin/DialSlider'
import { CONTROL_CLASS } from '@/components/ui'
import { saveNinaTuningAction, type AdminTuningResult } from '@/lib/admin/tuningActions'
import {
  changedTuningFields,
  loudestDials,
  mergeTuningAfterSave,
  relationshipCopy,
  TUNING_DIAL_COMMIT_DEBOUNCE_MS,
  tuningCopy,
  tuningDraftEquals,
  type TuningDraft,
} from '@/lib/admin/tuningModel'
import { TOUCH_TARGET } from '@/components/admin/touch'
import { cn } from '@/lib/cn'
import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_TUNING_RELATIONSHIP_KEY,
} from '@/lib/nina/tuning'

/**
 * **Her character** — R1's *"full nina character tuning in /admin/nina page / make several sliding
 * bars"*, R2's relationship, R3's extra dials, R4's toggles, now on a route of its own — and,
 * since the simplify set, saving itself: every control commits at the moment its edit is
 * finished, and the staged-commit row this panel carried from the start is gone.
 *
 * ── WHY THIS IS NO LONGER A DISCLOSURE ──────────────────────────────────────────────────────
 * This file used to open with an argument for being shut: *"the album is the page's working
 * surface and must stay the first thing on it"*, because the panel shared `/admin/nina` with a
 * file manager built for *"hundreds of profile pics"*, and seventeen sliders open by default would
 * have pushed the album below the fold on every visit that was about a photograph.
 *
 * The user repealed the premise — *"right now, 'Her character' is in Nina's album. move it as a
 * new tab with name: Personality"* — and the panel now owns `/admin/personality`
 * (`app/admin/personality/page.tsx`), which it is the whole content of. Nothing shares the page,
 * so nothing has to be pushed below the fold, and the disclosure's only stated justification is
 * gone with the page it was about.
 *
 * `<details open>` would have been the wrong way to keep it, not merely a redundant one: `open`
 * was deliberately never a prop, because passing it would make React control the attribute and
 * fight the user's click, and `revalidatePath` re-renders this component after every save. So the
 * root is a plain `<section>`, and what the `<summary>` carried — the relationship, the loudest
 * dials, how many parameters are off — is carried by the section header, where it is the same
 * one-line answer to "what is she set to" that the hub card gives.
 *
 * **`id="character"` survives on that section root**, and it is not decoration: for two plan sets
 * the overview card deep-linked to this panel by that `#character` fragment on the album route.
 * The card now points at `/admin/personality`, and a bookmark someone kept still lands on the
 * panel rather than on a fragment that resolves to nothing. It costs one attribute.
 *
 * The old URL is deliberately not spelled out here: plan invariant 10 greps `app components lib
 * tests docs` for it and must come back empty, so that even a mention in a comment cannot be
 * mistaken for a live reference.
 *
 * ── EVERY CONTROL COMMITS ITSELF — AND WHY THAT IS SAFE HERE ────────────────────────────────
 * The simplify set's R2: *"remove the Discard and Reset buttons; make Personality auto-save
 * every time a change is made."* There is no Save button, no discard, no global reset, nothing
 * to confirm. Four properties make committing on every edit safe rather than reckless:
 *
 *   1. **One writer.** `nina_tuning` is one row per account, upserted on `user_id` by
 *      `writeNinaTuning` — there is no history to fork and no list to reconcile.
 *   2. **One operator.** The admin surface is one person; there is no second editor whose
 *      in-flight draft this panel could silently overwrite.
 *   3. **Sequential dispatch.** Next dispatches Server Actions one at a time per client
 *      (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "Sequential dispatch on
 *      the client"), so commits cannot interleave out of order even when several queue up.
 *   4. **The write is an idempotent whole-row upsert.** Every commit sends the complete tuning,
 *      so a commit that duplicates another or queues behind it writes the same truth. The
 *      failure mode of auto-save here is a wasted round trip, never a half-written character.
 *
 * ── THE COMMIT MOMENTS ARE `MemoryTable`'s RULE, NOT A STYLE CHOICE ─────────────────────────
 * `components/admin/MemoryTable.tsx` records the measured precedent for no-Save-button admin
 * cells ("HOW A CELL SAVES, AND WHY IT IS BLUR AND NOT A DEBOUNCE") and this panel follows it
 * control-kind by control-kind:
 *
 *   - **The notes commit on BLUR.** A keystroke debounce would queue actions AND queue
 *     `revalidatePath` re-renders, and the operator's cursor would spend the session fighting
 *     them. Blur is exactly one write per completed edit, at the moment the edit is finished —
 *     which is also what makes "no Save button" true rather than cosmetic.
 *   - **The relationship radios and every toggle commit on CHANGE.** A discrete control's change
 *     IS the finished edit — there is no "still dragging" state to wait out.
 *   - **The dials commit DEBOUNCED, `TUNING_DIAL_COMMIT_DEBOUNCE_MS` after the last change.** A
 *     range input fires `change` on every pointer move and KEEPS FOCUS after the thumb is
 *     released, so blur — the notes' moment — does not exist for a slider. The debounce is the
 *     settle detector: one continuous drag becomes one save, and the timer is cleared on re-arm,
 *     on unmount, and whenever an immediate commit has already carried everything pending.
 *
 * ── ONE ACTION PER COMMIT, AND IT ALWAYS CARRIES THE WHOLE TUNING ───────────────────────────
 * Plan invariant 3 (the character-tuning set's invariant 11) survives auto-save unchanged: one
 * Server Action, the whole row — Next dispatches actions one at a time per client, so seventeen
 * dials as seventeen actions would stall behind each other, and each action drags a re-rendered
 * route back with it. The pipeline leans on the whole-row rule three ways: two dials dragged
 * within the window coalesce into one write; an immediate commit (radio, toggle, notes blur)
 * carries any dial still waiting in the debounce and disarms the timer, so nothing pending is
 * lost and nothing is double-sent; and a debounce that matures while a save is still in flight
 * simply queues behind it and re-sends the whole draft — idempotent, and the fire-time equality
 * check makes the common case free.
 *
 * One honest consequence: a commit carries the notes as they stand, so an unfinished sentence can
 * spend a moment as the stored row if a dial settles mid-edit. The alternative — sending a stale
 * notes value to "protect" it — would write an older draft over the operator's newer words, which
 * is the one failure this pipeline exists to prevent.
 *
 * ── THE ROW THE PANEL BELIEVES IN ───────────────────────────────────────────────────────────
 * `saved` is the panel's copy of the stored row. It starts as the `tuning` prop and is updated
 * ONLY from the action's own result: the save returns the row after `coerceNinaTuning`, and the
 * response carries both that value and the re-rendered route in one round trip
 * (`server-actions.md`, "A single response carries data and UI"), so reading the row off the
 * result is the same freshness as reading it off the prop — without having to tell "my save
 * landed" apart from "the row changed under me". Nothing else writes this row (one operator), so
 * the only way it changes under the panel is the panel's own save coming back; no other sync
 * exists, and the prop is the mount-time baseline and a fresh page load, nothing more.
 *
 * The draft does NOT blindly adopt the canonical row: `coerceNinaNotes` trims and collapses, so
 * the stored row can differ cosmetically from what was typed, and the operator may have kept
 * editing while the save was in flight. `mergeTuningAfterSave(current, sent, canonical)` adopts
 * the stored value only for fields still equal to what was dispatched; a field edited since
 * keeps the newer local value and stays pending, riding the next commit.
 *
 * ── NOTHING IS DISABLED WHILE A SAVE IS IN FLIGHT ───────────────────────────────────────────
 * The staged-commit panel locked every control on `pending`. Auto-save must not: locking on
 * every debounce settle would flicker the whole panel uneditable for the length of a round trip,
 * and editing during a save is safe here — the draft keeps accepting changes, the merge above
 * protects anything typed after dispatch, and the next commit carries the newest whole draft.
 * `pending` drives only the status line.
 *
 * ── `useTransition`, NOT `<form action={…}>` ────────────────────────────────────────────────
 * `MemorySlots.tsx` states the reason and it is unchanged here: phase 15's album manager set the
 * plain-argument + result-object convention on the sibling admin page, and a desktop-only tool
 * gains nothing from progressive enhancement that it does not lose in consistency. Validation is
 * Zod on the server for every field, either way.
 *
 * ── THE TOGGLES RIDE THE SAME WHOLE-ROW COMMIT (R4) ─────────────────────────────────────────
 * *"we need an on/off toggle for each parameter, so we can exclude some parameters to make prompt
 * more accurate."* Each checkbox edits `draft.enabled[key]` and commits immediately — the same
 * one action carries the whole map with the scores. Seventeen toggles as seventeen actions is
 * the same stall the seventeen dials would have been, and for the same reason: Next dispatches
 * Server Actions one at a time per client.
 *
 * The score is NOT reset when a parameter is switched off, and that is the feature: the operator
 * parks `flirty` at 80, excludes it from tonight's prompt, and gets the 80 back with one click. A
 * toggle that cleared the number would just be a slower way of dragging it to the default.
 *
 * ── EVERY WORD BESIDE A CONTROL COMES FROM `lib/nina/tuning.ts` ─────────────────────────────
 * Labels, hints and the address words are `tuningCopy` / `relationshipCopy`, which read phase 1's
 * specs. There is no copy table in this package, so the panel cannot promise a behaviour the
 * prompt does not produce. It is also what keeps one specific promise off the page: phase 2's
 * `ANGER_CEILING_BY_BAND.off` is **4**, so there is no setting that means "she never gets angry",
 * and anger's hint is phase 1's own *"at 0 the ladder is untouched"* rather than an off switch.
 *
 * ── WHAT THIS FILE MAY NOT IMPORT ───────────────────────────────────────────────────────────
 * Nothing `server-only`, and nothing that reaches drizzle or `lib/env.ts`. `lib/nina/tuning.ts` is
 * guaranteed client-importable by phase 1 (types and plain data only, zero imports of its own) and
 * is imported directly for the key arrays and the two length bounds; the VALUES arrive as a plain
 * `TuningDraft` the page mapped, so no part of phase 1's row shape crosses the serialization
 * boundary. `saveNinaTuningAction` crosses it as a client reference the way every action in this
 * package does, and `AdminTuningResult`'s `tuning` is the same plain draft shape coming back.
 * `tests/admin.tuning.test.ts` asserts all of this.
 */

export interface CharacterPanelProps {
  userId: string
  /**
   * The tuning as the row holds it at mount — the baseline the draft and the panel's `saved`
   * copy both start from. After mount the pipeline maintains `saved` itself from the action's
   * results; see "THE ROW THE PANEL BELIEVES IN" above for why the prop is not watched.
   */
  tuning: TuningDraft
  /** `NINA_TUNING_DEFAULTS`, mapped — the baseline for "no longer the Nina who shipped". */
  defaults: TuningDraft
  /**
   * `buildNinaSystemPrompt(tuning)`, assembled on the SERVER from the SAVED tuning.
   *
   * It is not recomputed as the sliders move, and that is deliberate rather than a limitation: the
   * assembler reaches the whole persona, and shipping that into the browser to preview a string
   * would put Nina's canon in a client bundle to save one round trip. Every commit's
   * `revalidatePath` re-renders the page, so the preview catches up in the same response the
   * save returned — and its summary line below says when it is stale.
   */
  promptPreview: string
}

export function CharacterPanel({
  userId,
  tuning,
  defaults,
  promptPreview,
}: CharacterPanelProps) {
  /* What the controls show and edit. */
  const [draft, setDraft] = React.useState<TuningDraft>(tuning)
  /* What the panel believes the row holds. The predicate under every "unsaved" mark and the
   * status line is `changedTuningFields(draft, saved)` — never the prop. See the header. */
  const [saved, setSaved] = React.useState<TuningDraft>(tuning)
  const [result, setResult] = React.useState<AdminTuningResult | null>(null)
  /* Whether the dial debounce is armed — render-visible, because the timer itself lives in a ref
   * and the status line has to show the pending window. */
  const [commitArmed, setCommitArmed] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  /* The one debounce. A ref because it is a timer handle, not render state; armed/disarmed above
   * is the render-visible half. */
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /* The latest draft and saved row, for code that runs outside render (the timer's callback).
   * Mirrored in an effect — the sanctioned home for a ref write, and the shape
   * `ImageGenTestPanel.tsx` uses for its own out-of-render state. NOT setState: the
   * `react-hooks/set-state-in-effect` rule this repo enforces rejects that, and nothing here
   * needs it — the pipeline's state changes all happen in event handlers and the transition. */
  const latest = React.useRef({ draft: tuning, saved: tuning })
  React.useEffect(() => {
    latest.current = { draft, saved }
  })

  /* Timer hygiene, the `ImageGenTestPanel.tsx:94-136` shape: the handle is cleared on unmount, so
   * a navigate-away inside the settle window cannot fire a save into a dead component. Cleared,
   * not flushed — the edit was never committed, exactly as an unclicked Save was never committed
   * in the staged-commit panel this file replaced. */
  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const pendingFields = React.useMemo(
    () => new Set(changedTuningFields(draft, saved)),
    [draft, saved],
  )
  const clean = pendingFields.size === 0
  /* "Saving…" covers both halves of the pending window: a commit in flight (`pending`) and a
   * commit waiting for the settle timer (`commitArmed`). Between the timer firing and the
   * transition opening, React batches the two updates, so there is no gap where neither shows. */
  const saving = pending || commitArmed
  const loud = loudestDials(draft, defaults)
  /* How many parameters are excluded from her prompt entirely (R4). It goes in the section header
   * because it is the one setting that cannot be inferred from the numbers underneath it. */
  const off = Object.values(draft.enabled).filter((value) => value === false).length

  /**
   * One control's pending dot covers BOTH of its paths — the score and the toggle. Two dots on
   * one row would be an operator wondering which of two identical marks meant what, and the
   * answer to "is this row what the database holds" is one boolean. Same predicate and same word
   * ("unsaved") as the staged-commit panel — what changed is the baseline it is measured against:
   * `saved`, the panel's live belief, rather than a prop that only moves on a re-render.
   */
  function rowPending(path: string, key: string): boolean {
    return pendingFields.has(path) || pendingFields.has(`enabled.${key}`)
  }

  /** Disarm the settle timer. Safe to call when nothing is armed; the state write bails out. */
  function disarmCommit() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setCommitArmed(false)
  }

  /**
   * THE one dispatch. `sent` is the exact draft that left the browser — the merge's reference
   * point for "edited since dispatch". The whole row goes, every time (plan invariant 3); the
   * action's `tuning` comes back canonical and is adopted per-field.
   *
   * The previous error is cleared as the new attempt starts, the way `MemoryTable` clears a row's
   * result when its cell is edited again.
   */
  function dispatchSave(sent: TuningDraft) {
    setResult(null)
    startTransition(async () => {
      const outcome = await saveNinaTuningAction({
        userId,
        traits: sent.traits,
        dials: sent.dials,
        enabled: sent.enabled,
        relationship: sent.relationship,
        notes: sent.notes,
      })
      if (!outcome.ok || outcome.tuning === undefined) {
        /* Nothing was written, so `saved` stays where it was — the panel is still pending
         * exactly the fields it was pending before, and the sentence says what to do. */
        setResult(outcome)
        return
      }
      const canonical = outcome.tuning
      setSaved(canonical)
      setDraft((current) => mergeTuningAfterSave(current, sent, canonical))
    })
  }

  /**
   * The immediate path — radios, every toggle, the notes' blur. `next` is the draft as this
   * control just produced it (a `setState` has not landed when its own `onChange` runs —
   * `MemoryTable`'s `commitFact` passes the patch for exactly this reason).
   *
   * Disarming is not an optimization: an immediate commit carries the WHOLE draft, so it
   * subsumes any dial still waiting in the debounce — clearing the timer here is what makes
   * "nothing pending is lost and nothing is double-sent" true rather than lucky.
   */
  function commitImmediate(next: TuningDraft) {
    setDraft(next)
    disarmCommit()
    if (tuningDraftEquals(next, saved)) return
    dispatchSave(next)
  }

  /**
   * The dials' path — debounced. Every change re-arms the timer (one continuous drag is one
   * save), and the fire-time check re-reads the LIVE draft and saved row through the ref mirror:
   * if an immediate commit already sent everything while the timer ran, the dispatch is skipped
   * rather than duplicated. A draft that matches the saved row never arms at all — the second
   * half of "do not fire a save for a draft identical to the saved row" (the first half is this
   * same check on the immediate path).
   */
  function scheduleDialCommit(next: TuningDraft) {
    setDraft(next)
    if (tuningDraftEquals(next, saved)) {
      disarmCommit()
      return
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setCommitArmed(false)
      const { draft: draftNow, saved: savedNow } = latest.current
      if (tuningDraftEquals(draftNow, savedNow)) return
      dispatchSave(draftNow)
    }, TUNING_DIAL_COMMIT_DEBOUNCE_MS)
    setCommitArmed(true)
  }

  /**
   * R4's toggle — an immediate commit, like every discrete control. The score it shares a row
   * with is untouched; see the header.
   */
  function setEnabled(key: string, next: boolean) {
    commitImmediate({ ...draft, enabled: { ...draft.enabled, [key]: next } })
  }

  function setTrait(key: string, value: number) {
    scheduleDialCommit({ ...draft, traits: { ...draft.traits, [key]: value } })
  }

  function setDial(key: string, value: number) {
    scheduleDialCommit({ ...draft, dials: { ...draft.dials, [key]: value } })
  }

  /** Absent means ON, everywhere in this feature. One reader for that rule in this file. */
  function isOn(key: string): boolean {
    return draft.enabled[key] ?? true
  }

  /**
   * The notes' commit moment — `MemoryTable`'s rule verbatim: blur is exactly one write per
   * completed edit, at the moment the edit is finished. NEVER a keystroke debounce; see the
   * header. The blur carries the whole draft, so it also subsumes any dial still settling.
   */
  function commitNotes() {
    disarmCommit()
    if (tuningDraftEquals(draft, saved)) return
    dispatchSave(draft)
  }

  return (
    <section id="character" className="mb-8 rounded-card border border-rule bg-card px-5">
      {/*
       * The old `<summary>`, minus the affordances a disclosure needed: no `cursor-pointer`, no
       * `list-none`, no `[&::-webkit-details-marker]:hidden`. The CONTENT is unchanged, because it
       * is still the one-line answer to "what is she set to" and it is still worth having above
       * forty controls.
       *
       * `<h2>` and not a `<span>`: the page's `<h1>` is "Personality" and the two sections below
       * are `<h3>`, so this is the level that was missing while the panel lived inside a
       * `<summary>` that was not a heading at all.
       */}
      <div className="flex items-center justify-between gap-4 py-5">
        <h2 className="text-[15px] font-semibold text-ink">
          Her character
          {/*
           * The save-status surface, where the "N unsaved" counter used to be. Tri-state, and the
           * third state is not decoration: "Unsaved edits" is what shows while the operator TYPES
           * (a keystroke commits nothing — that is the rule) and after a FAILED save (the error
           * sentence renders below). `aria-live="polite"` because this is the one line that
           * changes on its own, and "Saved" is worth hearing without stealing focus.
           */}
          <span
            aria-live="polite"
            className={cn(
              'ml-2 text-[12px] font-semibold',
              saving || !clean ? 'text-accent' : 'text-ink-3',
            )}
          >
            {saving ? 'Saving…' : clean ? 'Saved' : 'Unsaved edits'}
          </span>
        </h2>
        <span className="text-right text-[12px] font-medium text-ink-3">
          {relationshipCopy(draft.relationship).label} &middot;{' '}
          {loud.length === 0
            ? 'every dial at its default'
            : loud
                .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                .join(', ')}
          {off > 0 && ` · ${off} off`}
        </span>
      </div>

      <div className="pb-6">
        <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every dial below goes into her system prompt, and every change saves itself — a dial
          when its drag settles, a switch the moment you flip it, the notes when you leave the
          field. <strong>There is no cache on her turn path</strong>, so a saved row is in her
          next message with no invalidation step, no distillation pass and no deploy. The defaults
          reproduce the Nina who shipped, character for character — a dial you never touch changes
          nothing about her. <strong>Clear a checkbox and that parameter leaves the prompt
          entirely</strong>, whatever it is parked at — the number stays here for when you want it
          back.
        </p>

        <fieldset className="mb-6">
          <legend className="mb-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
            {/* `TOUCH_TARGET` for the same reason `DialSlider` wraps its checkbox in `TOUCH_ICON`:
                a bare `size-4` box is 16 px, and the responsive phase's rule is that every
                interactive control in this package is ≥ 44 px on its smaller axis. The label is
                the hit target, so the height goes on the label rather than on the glyph. */}
            <label
              className={cn(
                TOUCH_TARGET,
                'inline-flex cursor-pointer items-center gap-2 align-middle',
              )}
            >
              <input
                type="checkbox"
                checked={isOn(NINA_TUNING_RELATIONSHIP_KEY)}
                aria-label="Include the relationship in her prompt"
                onChange={(event) =>
                  setEnabled(NINA_TUNING_RELATIONSHIP_KEY, event.target.checked)
                }
                className="size-4 shrink-0 accent-accent"
              />
              <span>Relationship</span>
            </label>
            {rowPending('relationship', NINA_TUNING_RELATIONSHIP_KEY) && (
              <span className="ml-2 font-semibold text-accent">unsaved</span>
            )}
            {!isOn(NINA_TUNING_RELATIONSHIP_KEY) && (
              <span className="ml-2 font-medium text-ink-3">
                off — she is the best friend who shipped
              </span>
            )}
          </legend>
          {/* R1 — "to make it a nice 3 columns x 2 rows". The BREAKPOINTS do not move (index
              decision D2: `AdminNav` is `lg:sticky` in this grid's first column, so three cards
              only have legible room from `xl`). What was ragged is ROW-TO-ROW height. Grid items
              already stretch inside their own row — the container's `align-items` is `normal`,
              which behaves as `stretch` for grid items, and the label's `items-start` below is
              the LABEL's own flex axis, aligning the radio against the text rather than the card
              against its cell. But the implicit rows are `auto`, so the row holding the longest
              hint is taller than the other, and `relationshipCopy`'s hints vary by about 3x.
              `auto-rows-fr` is `grid-auto-rows: minmax(0, 1fr)`, and in a grid whose height is
              indefinite an `fr` row resolves to the largest max-content contribution of the items
              crossing it — so every row becomes the height of the tallest card and six cards read
              as a rectangle. Left off below `sm`, where one column has no rectangle to make and
              equal rows would only pad the short cards. */}
          <div className="grid gap-2 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3">
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
                    onChange={() => commitImmediate({ ...draft, relationship: value })}
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
            Twelve dials, 0 to 100.
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
                  unsaved={rowPending(`traits.${key}`, key)}
                  enabled={isOn(key)}
                  onEnabledChange={(next) => setEnabled(key, next)}
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
                  unsaved={rowPending(`dials.${key}`, key)}
                  enabled={isOn(key)}
                  onEnabledChange={(next) => setEnabled(key, next)}
                  onChange={(value) => setDial(key, value)}
                />
              )
            })}
          </div>
        </section>

        {/*
         * ── ONE FIELD HERE NOW, AND THE GRID WENT WITH THE OTHER ONE ───────────────────────
         * This was a two-column `xl:grid-cols-2` row holding Wardrobe beside Notes. F41 R3 moved
         * the wardrobe to `/admin/image-generation` — *"remove Wardrobe field in
         * /admin/personality (this new feature is more detailed version of it)"* — and a
         * two-column grid with a single child renders that child at half width with an empty cell
         * beside it, which reads as a control that failed to load rather than as a layout. So the
         * wrapper is gone rather than left half-empty, and Notes is a plain block.
         *
         * `max-w-[70ch]` and not full width: this is a prose textarea, and 70ch is the measure
         * every hint on this page already uses (`max-w-[70ch]` on both section descriptions and on
         * the page header). An `xl` viewport would otherwise stretch it to a line length nobody
         * writes prose at, which is a worse answer than the half-empty grid was.
         *
         * The leading `*` on every line is load-bearing, not style: `ci:client-secret-guard`'s
         * Rule 3 exempts only lines a comment scanner recognises, and a JSX comment with bare
         * prose continuation lines fails the guard. `app/admin/personality/page.tsx` records the
         * same detail about its own JSX comment.
         *
         * The commit moment is on the element: `onBlur={commitNotes}`. Typing changes ONLY the
         * draft — no timer, no dispatch — which is the whole blur-not-debounce rule.
         */}
        <label className="mb-6 block max-w-[70ch]">
          <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
            Notes
            {pendingFields.has('notes') && (
              <span className="ml-2 font-semibold text-accent">unsaved</span>
            )}
          </span>
          <textarea
            className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
            value={draft.notes}
            maxLength={NINA_NOTES_MAX}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            onBlur={commitNotes}
          />
          <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
            Free text, handed to her verbatim in the system prompt. Anything no dial can say. It
            saves when you leave the field.
          </span>
        </label>

        <details className="mb-6 rounded-card bg-paper-2 p-4">
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            The assembled system prompt
            {!clean && (
              <span className="ml-2 font-medium text-ink-3">
                (as saved — the edits above are not in it yet)
              </span>
            )}
          </summary>
          <pre className="mt-3 max-h-[420px] overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {promptPreview}
          </pre>
        </details>

        {/*
         * The failure surface, and the only rendering of `result`. A successful save is the
         * status line's job ("Saved", no qualifier); this paragraph exists for the sentence an
         * operator needs to act on.
         */}
        {result?.ok === false && (
          <p className="mb-3 text-[12px] font-semibold text-red">{result.error}</p>
        )}
      </div>
    </section>
  )
}
```

**Impact:** the tree compiles again (Step 2's dangling import is gone). Notes on deliberately
unchanged things: the notes `onChange` keeps the functional `setDraft` (typing schedules nothing,
so the functional form's staleness safety is free); `commitImmediate`/`scheduleDialCommit`
compute `next` from the render-scope `draft` — `MemoryTable`'s `commitFact` accepts exactly this
closure read for the fields a control did not just produce, and within one event only one control
fires. The intro paragraph and the notes hint gain one sentence each stating the commit moments;
the `(as saved — …)` hint now keys on `!clean`, which is true for the whole pending window
(debounce armed, in flight) and clears the moment the canonical row lands.

### Step 5: Comment-only honesty fixes in the three files whose claims this phase falsifies

**File 1:** `components/admin/DialSlider.tsx:53-54`

The paragraph claims the chip "writes the default into the draft rather than saving anything, so
it is still one Save for the whole tuning" — a Save button no longer exists. Props are untouched
(this file's interface is frozen by the plan index because `ImageGenPanel` shares it). Replace:

```ts
 * Clicking "default N" is the per-dial undo. It writes the default into the draft rather than
 * saving anything, so it is still one Save for the whole tuning (plan invariant 11).
```

with:

```ts
 * Clicking "default N" is the per-dial undo, and since the simplify set it is also the surviving
 * route back to defaults: it writes the default into the draft through `onChange`, and the panel
 * commits it with the whole tuning when the settle debounce fires (plan invariant 11).
```

**File 2:** `app/admin/personality/page.tsx:44`

"in both actions" — there is one action now. Replace:

```ts
   * the tuning is per-request state that must reflect the action that just ran, and
   * `revalidatePath('/admin/personality')` in both actions is what makes that immediate.
```

with:

```ts
   * the tuning is per-request state that must reflect the action that just ran, and
   * `revalidatePath('/admin/personality')` in the save action is what makes that immediate.
```

**File 3:** `lib/admin/imageGenActions.ts:153-155`

The image-prefs reset's docstring leans on the tuning reset as its citation: *"That is the honest
record, for `resetNinaTuningAction`'s reason: a reset is a thing that happened at a revision,
not a hole where one used to be."* This phase deletes the cited symbol, and a prose citation of
a deleted function is a dangling reference — the same defect Step 3 fixes for
`ninaImagePrefsResetSchema`'s docstring, and the rule is the same one that made this phase own
File 2: deleting a symbol retires the references that name it. The image reset itself, its
action and its revision column are untouched (out of scope by the plan index); only the
citation stops pointing at nothing. Replace:

```ts
 * It **writes** the defaults rather than deleting the row, and so it bumps the revision like any
 * other save. That is the honest record, for `resetNinaTuningAction`'s reason: a reset is a thing
 * that happened at a revision, not a hole where one used to be.
```

with the argument standing on its own:

```ts
 * It **writes** the defaults rather than deleting the row, and so it bumps the revision like any
 * other save. That is the honest record: a reset is a thing that happened at a revision, not a
 * hole where one used to be.
```

**Impact:** none — comments only, no code, no props, no API, and the image-generation surface's
behaviour is untouched. (`DialSlider`'s `unsaved` dot with its `title="Unsaved"` needs no edit:
"the draft differs from the saved row for this dial" is still exactly what the prop means.)

### Step 6: Tests

**File:** `tests/admin.tuning.test.ts`

`vitest.config.ts` runs `environment: 'node'` with `include: ['tests/**/*.test.ts', ...]` — no
jsdom, no `.tsx` anywhere in the test graph. The repo's own convention (this file's header)
is: panel behaviour is tested as pure functions in `tuningModel` + Zod shapes, and panel
STRUCTURE is tested by reading source. This phase follows that convention — no jsdom is
introduced.

**Change 1 — the import block (`:5` and `:6-17`).** Drop `ninaTuningResetSchema`; add the two
new model exports. The schema import line becomes:

```ts
import { ninaTuningWriteSchema } from '@/lib/admin/schema'
```

and the `tuningModel` import gains `mergeTuningAfterSave` and `TUNING_DIAL_COMMIT_DEBOUNCE_MS`:

```ts
import {
  changedTuningFields,
  hasRelationshipCopy,
  hasTuningCopy,
  loudestDials,
  mergeTuningAfterSave,
  prettifyKey,
  relationshipCopy,
  toTuningDraft,
  tuningCopy,
  tuningDraftEquals,
  TUNING_DIAL_COMMIT_DEBOUNCE_MS,
  type TuningDraft,
} from '@/lib/admin/tuningModel'
```

**Change 2 — the userId-empty case (`:267-271`).** The reset assertions leave with the schema.
The case becomes:

```ts
  it('refuses an empty userId, which requireAdmin would never produce', () => {
    expect(ninaTuningWriteSchema.safeParse(payload({ userId: '' } as never)).success).toBe(false)
  })
```

**Change 3 — the structural action-count describe (`:325-342`).** "Exactly two actions" becomes
exactly one, and the block gains the canonical-row assertion. The complete replacement:

```ts
describe('one save, not sixteen — plan invariant 11', () => {
  it('exports exactly one action: the whole-tuning save every control rides on', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    const exported = source.match(/^export async function (\w+)/gm) ?? []
    expect(exported).toHaveLength(1)
    expect(source).toContain('export async function saveNinaTuningAction')
    /* codeOnly for the identifier, not raw source: the new file's own header names the deleted
     * reset in prose while arguing why the count is one, and prose may discuss what code may not
     * do — the codeOnly docstring's own rule, and the same split the panel cases below use. */
    expect(codeOnly(ACTIONS)).not.toContain('resetNinaTuningAction')
  })

  it('writes through phase 1s query and revalidates this page', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).toContain('writeNinaTuning(')
    /* The route the PANEL is on, which since the Personality tab is no longer the album's. A save
     * that revalidated `/admin/nina` would re-render a page the operator is not looking at and
     * leave the panel showing a stale row until a manual reload. */
    expect(source).toContain("revalidatePath('/admin/personality')")
  })

  it('returns the row it wrote, so the panel can adopt the canonical draft', () => {
    /* `coerceNinaNotes` trims and collapses — the stored row is not always the typed string —
     * so the result must carry the stored row or the panel has nothing honest to adopt. */
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).toContain('tuning: toTuningDraft(stored)')
  })
})
```

**Change 4 — new behavioural describes for the pure machinery.** Insert after the
`changedTuningFields` describe (after line `:165`):

```ts
describe('TUNING_DIAL_COMMIT_DEBOUNCE_MS — the settle window', () => {
  it('is 600ms: long enough that one drag is one save, short enough that Saved lands while you watch', () => {
    /* Pinned as a literal for the same reason the trait count above is: recalibrating the window
     * is a product decision, and this line is where it becomes an explicit one. */
    expect(TUNING_DIAL_COMMIT_DEBOUNCE_MS).toBe(600)
  })
})

describe('mergeTuningAfterSave — the post-save canonical merge', () => {
  it('adopts the stored row for every field untouched since the dispatch', () => {
    /* `coerceNinaNotes` will have trimmed and collapsed what was typed; the merge must show the
     * stored form, not keep the pre-coercion text the operator can no longer get back to. */
    const sent: TuningDraft = { ...DEFAULTS, notes: '  hello  \n\n\n\n world  ' }
    const canonical: TuningDraft = { ...sent, notes: 'hello\n\n world' }
    const merged = mergeTuningAfterSave(sent, sent, canonical)
    expect(merged.notes).toBe('hello\n\n world')
    expect(tuningDraftEquals(merged, canonical)).toBe(true)
  })

  it('keeps a field edited after the dispatch, and leaves exactly that field pending', () => {
    const key = NINA_TRAITS[0]
    const sent: TuningDraft = { ...DEFAULTS, traits: { ...DEFAULTS.traits, [key]: 40 } }
    const editedSince: TuningDraft = { ...sent, traits: { ...sent.traits, [key]: 90 } }
    const merged = mergeTuningAfterSave(editedSince, sent, sent)
    expect(merged.traits[key]).toBe(90)
    expect(changedTuningFields(merged, sent)).toEqual([`traits.${key}`])
  })

  it('does not clobber notes typed after the dispatch with the coerced stored value', () => {
    const sent: TuningDraft = { ...DEFAULTS, notes: '  padded  ' }
    const canonical: TuningDraft = { ...sent, notes: 'padded' }
    const typedSince: TuningDraft = { ...sent, notes: 'padded and more' }
    const merged = mergeTuningAfterSave(typedSince, sent, canonical)
    expect(merged.notes).toBe('padded and more')
    expect(changedTuningFields(merged, canonical)).toEqual(['notes'])
  })

  it('carries the toggle map through the same per-field rule', () => {
    const key = NINA_TRAITS[0]
    const sent: TuningDraft = { ...DEFAULTS, enabled: { ...DEFAULTS.enabled, [key]: false } }
    /* The operator re-toggles after dispatch; the stored row still says off. */
    const toggledSince: TuningDraft = { ...sent, enabled: { ...sent.enabled, [key]: true } }
    const merged = mergeTuningAfterSave(toggledSince, sent, sent)
    expect(merged.enabled[key]).toBe(true)
    expect(changedTuningFields(merged, sent)).toEqual([`enabled.${key}`])
  })
})
```

**Change 5 — new structural describe for the panel pipeline.** Insert after the
`one save, not sixteen` describe. Every `toContain` below is an exact substring of the Step 4
file — they were written against it:

```ts
describe('the panel commits itself — no staged-commit row', () => {
  it('renders none of the removed controls or the removed action', () => {
    /* The raw file for the user-facing labels, codeOnly for the identifiers — the same split the
     * `codeOnly` docstring above argues for: a comment may DISCUSS the boundary, only code may
     * cross it. The panel's header names the removed row in prose, which is exactly why the
     * label assertions must not match prose the header is free to write. */
    const source = readFileSync(PANEL, 'utf8')
    for (const gone of ['Save the whole tuning', 'Discard changes', 'Reset to defaults']) {
      expect(source, `the panel still offers "${gone}"`).not.toContain(gone)
    }
    const code = codeOnly(PANEL)
    expect(code).not.toContain('confirmingReset')
    expect(code).not.toContain('resetNinaTuningAction')
  })

  it('debounces the dials on the named settle window and clears the timer', () => {
    const code = codeOnly(PANEL)
    expect(code).toContain('TUNING_DIAL_COMMIT_DEBOUNCE_MS')
    expect(code).toContain('setTimeout(')
    /* Cleared on re-arm, on subsumption, and on unmount — the ImageGenTestPanel hygiene. */
    expect(code).toContain('clearTimeout(')
  })

  it('commits the notes on blur, and never on a keystroke timer', () => {
    const code = codeOnly(PANEL)
    expect(code).toContain('onBlur={commitNotes}')
    /* The notes field's own wiring: typing touches only setDraft — no timer, no dispatch. */
    const notesField = code.split('<textarea')[1]?.split('</label>')[0] ?? ''
    expect(notesField).not.toContain('setTimeout')
    expect(notesField).not.toContain('dispatchSave')
  })

  it('commits the relationship and every toggle immediately on change', () => {
    const code = codeOnly(PANEL)
    expect(code).toContain('onChange={() => commitImmediate({ ...draft, relationship: value })}')
    expect(code).toContain('setEnabled(NINA_TUNING_RELATIONSHIP_KEY, event.target.checked)')
    expect(code).toContain('onEnabledChange={(next) => setEnabled(key, next)}')
  })

  it('does not fire a save for a draft identical to the saved row', () => {
    const code = codeOnly(PANEL)
    /* Both paths guard with the same equality — immediate at :commitImmediate, fire-time inside
     * the debounce callback against the live ref mirror. */
    expect(code.match(/tuningDraftEquals\(/g)?.length).toBeGreaterThanOrEqual(3)
    expect(code).toContain('mergeTuningAfterSave(')
  })

  it('does not lock the controls while a commit is in flight', () => {
    /* Editing during a save is safe (sequential dispatch + the guarded merge); locking on every
     * settle would flicker the panel uneditable for a round trip each time. */
    expect(codeOnly(PANEL)).not.toContain('disabled={pending}')
  })

  it('shows the save-status surface where the counter used to be', () => {
    const source = readFileSync(PANEL, 'utf8')
    expect(source).toContain('Saving…')
    expect(source).toContain("'Saved'")
    expect(source).toContain("'Unsaved edits'")
  })
})
```

**Impact:** the full suite must pass with these cases against the Step 4 file. If an assertion
fails, the FILE is wrong or drifted from this plan — do not weaken the assertion to match a
hand-edited panel.

## Verification

**Build/typecheck/lint/tests** (run in the worktree — a fresh worktree needs `.env.local` copied
and `npm install` before any of these will run):

```
cd /home/miftah/.worktrees/run-insights/simplify-personality-settings
npm run typecheck && npm run lint && npm test
```

**Targeted re-run while iterating on one file:**

```
npx vitest run tests/admin.tuning.test.ts
```

**Manual check** (`npm run dev`, then `/admin/personality` as the admin):
- Drag a dial, pause: the header shows "Saving…" while the settle window runs, "Saved" when the
  round trip lands; dragging two dials within ~600 ms produces ONE network dispatch (DevTools,
  actions POST) — not two.
- Click a relationship radio / flip any toggle: the save fires immediately, no debounce lag.
- Type in Notes: nothing fires per keystroke; tab away — one dispatch; trailing whitespace typed
  into the notes is trimmed IN THE TEXTAREA when the save lands (the canonical merge adopting
  `coerceNinaNotes`'s output).
- No Save / Discard / Reset control anywhere; the per-dial "default N" chip still appears on a
  deviated dial and committing it takes ~600 ms.
- Failure surface: kill the DB (or break `DATABASE_URL`), move a dial, wait — the red sentence
  shows, the header says "Unsaved edits", moving any control retries.

**Exit criteria** (the plan index's, made checkable):
- [ ] `codeOnly(components/admin/CharacterPanel.tsx)` contains none of: `confirmingReset`,
      `resetNinaTuningAction`, `disabled={pending}`; raw source contains none of the three button
      labels.
- [ ] Every control commits through `saveNinaTuningAction` alone — `grep -c "export async
      function" lib/admin/tuningActions.ts` is 1; no per-dial action exists.
- [ ] Dials debounce (`TUNING_DIAL_COMMIT_DEBOUNCE_MS`), radios/toggles commit on change, notes
      commit on blur — asserted structurally in `tests/admin.tuning.test.ts`.
- [ ] `ninaTuningResetSchema` / `NinaTuningResetInput` / `resetNinaTuningAction` are gone:
      `grep -rn "ninaTuningResetSchema\|NinaTuningResetInput\|function resetNinaTuningAction" app components lib tests --include='*.ts' --include='*.tsx'`
      is empty. The `--include` keeps the sweep to code — the package `.workflows` dirs hold
      landed plan sets' historical prose, a record rather than a reference, and no phase rewrites
      them. `function` anchors the action so the new `tuningActions.ts` docstring, which names
      the deleted reset while arguing why the count is one, does not trip the grep; the
      code-level absence is what the structural test asserts, via `codeOnly`.
- [ ] A failed save renders a sentence and the panel stays pending (manual check above).
- [ ] `npm run typecheck && npm run lint && npm test` all green.

## Handoffs

- **`lib/admin/imageGenActions.ts`** — owned here for exactly one sentence (Step 5, File 3): the
  docstring citation that named `resetNinaTuningAction`. The rest of the file, and the whole
  image-generation surface, stay out of scope by the plan index. If any future set touches
  `imageGenActions.ts`, its docstrings should carry their arguments themselves (as Step 3 did
  for `ninaImagePrefsResetSchema`).
- **Post-deploy `npm run db:migrate`** — Phase 1's `0016_*.sql` is committed and NOT applied by
  any phase; applying it is the deploy step, not this set's. Nothing in Phase 2 depends on it
  having run.
- **An `aria-live` audit of the admin surface** — this phase puts the first live region on
  `/admin/personality` (the status line). If a future set standardizes announcements, that span
  is the precedent to generalize, not to special-case.

## Rollback

Revert the phase-2 commit. The staged-commit panel returns verbatim from the phase-1 commit
(Phase 1 left the Save button working, revision-free), and
`resetNinaTuningAction`/`ninaTuningResetSchema` return with it. No data implications: every row
auto-save wrote is an ordinary whole-tuning row the Save button would have written — the
`nina_tuning` shape never changed in this phase. Tests revert with the same commit.
