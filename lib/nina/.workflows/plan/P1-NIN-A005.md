> Adopted from `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` phase 4. Source: `.workflows/plan/admin-responsive-nina-intimacy/phase-4.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 4: Per-parameter enable toggles

**Plan set:** `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md`
**Analysis:** `20260906-205048-K4M2_code_analyzer.md`
**Satisfies:** R4 — *"we need an on/off toggle for each parameter, so we can exclude some parameters to make prompt more accurate for what we would like nina to do"*
**Depends on:** Phase 3 (girlfriend register — lands first, and adds at least one more read of `tuning.relationship` that this phase must route through the gate) **and Phase 2** (RECONCILED: this phase edits `components/admin/DialSlider.tsx`, which phase 2 rewrites for touch; Step 11 quotes phase 2's version of that file, so phase 2 must land first. The two phases share no other file.)
**Difficulty:** HARD
**Package:** `lib/nina` (primary), `lib/admin`, `components/admin`, `lib/db`, `drizzle`, `tests`

---

## Goal

Every tuning parameter — the eleven traits, the four dials, and the relationship — carries an
`enabled` flag that the operator sets in `/admin/nina` and that the prompt assembler consults
before it looks up a single band. A disabled parameter contributes **zero bytes** to the assembled
system prompt whatever its stored score, so the operator can park `flirty` at 80 and still exclude
it from tonight's prompt without losing the number. All-enabled at `NINA_TUNING_DEFAULTS` renders
the prompt byte-identical to `origin/main` @ `02dc79a`, because "disabled" is defined as "the key's
own `defaultScore`", and the defaults *are* the shipping text.

---

## The semantics, decided and stated before any code

R4's purpose is a **shorter, more focused prompt**. The index records that as D3: a disabled
parameter renders nothing, not its identity band. This plan implements it as one sentence:

> **A disabled key is a key the operator never moved.** Its stored value stays in the row and stays
> on the slider; every reader on the prompt side reads the key's own `defaultScore` instead.

That sentence is stronger than "skip the paragraph", and the difference is why the gate is applied
at the **score seam** rather than inside `ninaTraitsBlock`:

| Consumer | "skip the paragraph only" | this plan (`defaultScore` at the seam) |
|---|---|---|
| `ninaTraitsBlock`'s band lookup | no paragraph | `atTraitIdentityBand` is true, so `continue` fires **before** the lookup — no paragraph, zero bytes |
| `ninaAngerFloor` / `ninaAngerCeiling` | a disabled `anger: 100` still floors the ladder at rung 4 and rewrites `ANGER_LADDER_BLOCK`, `angerSourceClause` and `rungClause` | band `off` -> floor 0, ceiling 4 -> the shipping ladder, exactly |
| `anyTurnedUp(BODY_REPEALED_BY)` | a disabled `flirty: 100` still repeals the body prohibition in three places | `isTurnedUp` is false -> the prohibition stands |
| `ninaIdentity`'s `funny` clause | a disabled `funny: 100` still deletes `NINA_NO_JOKES` | `NINA_NO_JOKES` survives |
| `greetingLine` / `bubblePreferenceLine` / `buildCameraBlock` | a disabled `verbosity: 100` still rewrites `OUTPUT_RULE` | `raised`/`loud`/`lowered` are all false -> the shipping lines |

Only the second column is "excluded from the prompt". The first column is a toggle that half-works,
and the half that does not work is invisible in a diff.

**Zero bytes is literal.** For every trait and dial the key's entire *additive* contribution is its
`NINA_TRAIT_BANDS` / `NINA_DIAL_BANDS` paragraph plus the clause swaps above, and all of them
vanish. What remains is the base prompt, which is not the parameter's contribution — it is the
prompt that ships whether or not the parameter exists.

### Does the relationship get a toggle? Yes. Here is the reasoning.

The index's exit criteria already say *"every trait, dial, and the relationship has a toggle"*, and
the requirement says *each* parameter. The open question was whether `nobody` is already the off
switch. **It is not**, and reading `NINA_RELATIONSHIP_BLOCKS.nobody` (`persona.ts:192-202`) settles
it:

- `nobody` is four sentences of *active* instruction plus a `history` sentence — *"You do not know
  him"*, *"You are civil and useful rather than warm"*, *"You do not ask about his life and you do
  not go first"*. That is the **coldest** setting on the axis, not the absent one, and selecting it
  to "exclude" the parameter would make the prompt **longer** and change her behaviour drastically.
  It is a value, not a null.
- There is no representable "no relationship". `ninaIdentity` needs paragraph 1 and `ninaNameRules`
  needs an address rule; emitting neither leaves the model with no instruction about what to call
  him at all — the exact failure `addressFallback` exists to prevent (*"a prompt that tells her to
  use a field that is not there teaches her to invent one"*), only worse.
- So the only coherent meaning of "excluded" for the relationship is the one every other key gets:
  the operator's setting is withdrawn and the key falls back to `NINA_DEFAULT_RELATIONSHIP`
  (`best_friend`) — the level whose `identity` and `history` **are** today's `NINA_IDENTITY`,
  character for character (`persona.ts:226-236`). Zero added bytes, uniform semantics, one helper,
  and invariant 1 held arithmetically rather than by care.
- It is also the useful behaviour: an operator trying `girlfriend` can A/B against shipping Nina
  with one checkbox instead of remembering which level shipped.

The panel says this out loud rather than leaving it a surprise: the relationship legend renders
`off — she is the best friend who shipped` when the toggle is clear.

### `wardrobe` and `notes` do NOT get a toggle, and that is the same argument inverted

`''` genuinely *is* the absence for both — `coerceNinaWardrobe`/`coerceNinaNotes` return `''` for
anything unusable, `ninaOperatorNotesBlock` returns `''` on an empty note so the whole
`── STANDING INSTRUCTIONS ──` section disappears, and `ninaAppearance` falls back to
`NINA_DEFAULT_OUTFIT`. Both already contribute zero bytes at their empty value, so a toggle would
be a second spelling for a state the field already has, and the operator would have two ways to say
one thing that can disagree. `nobody` is not that; `''` is.

---

## Interface Contract

**Creates (`lib/nina/tuning.ts`):**
- `NINA_TUNING_RELATIONSHIP_KEY` — the literal `'relationship'`
- `NINA_TUNING_KEYS` — `readonly ['relationship', ...NINA_TRAITS, ...NINA_DIALS]`, **derived by
  spread**, never hand-listed; phase 5's `horny` joins it the moment `NINA_TRAITS` grows
- `type NinaTuningKey = (typeof NINA_TUNING_KEYS)[number]`
- `isNinaTuningKey(key: string): key is NinaTuningKey`
- `NINA_ENABLED_DEFAULTS: Readonly<Record<NinaTuningKey, boolean>>` — **all true**, frozen
- `coerceNinaEnabled(value: unknown): Record<NinaTuningKey, boolean>` — only an explicit `false`
  disables; missing / null / partial / hostile all read as enabled
- `isNinaKeyEnabled(tuning: NinaTuning, key: NinaTuningKey): boolean`
- **`ninaTraitScore(tuning: NinaTuning, trait: NinaTrait): number`** ← **the helper phase 5 calls
  for `horny`**, which is a TRAIT (index decision D6). Corrected in reconciliation: this line
  originally named `ninaDialScore`, from the superseded reading of `horny` as a dial.
- **`ninaDialScore(tuning: NinaTuning, dial: NinaDial): number`**
- **`ninaActiveRelationship(tuning: NinaTuning): NinaRelationship`**

**Signature changes:**
- `NinaTuning` gains `readonly enabled: Readonly<Record<NinaTuningKey, boolean>>` (between `dials`
  and `wardrobe`). `NinaTuningWrite = Omit<NinaTuning,'revision'>` therefore requires it, so every
  writer is a compiler error until it supplies one.
- `NinaTuningInput` gains `readonly enabled?: unknown`
- `TuningDraft` (`lib/admin/tuningModel.ts`) gains `enabled: Record<string, boolean>`
- `saveNinaTuningAction(input)` gains `enabled: Record<string, boolean>`
- `ninaTuningWriteSchema` gains `enabled: z.strictObject(...)` over `NINA_TUNING_KEYS`
- `DialSliderProps` gains `enabled?: boolean` and `onEnabledChange?: (next: boolean) => void`
- `pick()` moves up in `tuning.ts` from §7 to the new §5 (same body, one shared trust-boundary
  reader, no second copy)

**Deletes:** nothing.
**Renames:** nothing.

**Requires (from earlier phases):**
- **Phase 2** has landed `components/admin/touch.ts` (`TOUCH_TARGET`, `TOUCH_ICON`) and its rewrite
  of `components/admin/DialSlider.tsx` — the 44 px track, the 44 px reset, and the header row as
  `flex items-center gap-2` with `ml-auto` on the readout. Step 11 quotes that file, not
  `origin/main`'s. This is the ONLY file the two phases share; phase 2 touches nothing under
  `lib/` and this phase touches no other `components/admin/*` file except `CharacterPanel.tsx`,
  which phase 2 read and deliberately left alone.
- **Phase 3** has landed `NINA_RELATIONSHIP_BLOCKS.girlfriend`, a relationship-gated orthography
  rule beside `JAKARTA_REGISTER`, and gated `VOICE_EXAMPLES` additions. Every one of those gates
  reads the relationship. **This phase converts each of them from `tuning.relationship` to
  `ninaActiveRelationship(tuning)`** and Step 8's guard test makes it impossible to leave one
  behind. Phase 3's own band text is not touched.

**Leaves alone (owned by others):**
- `NINA_RELATIONSHIP_BLOCKS.*`, `JAKARTA_REGISTER`, `VOICE_EXAMPLES`, `NINA_TRAIT_BANDS` and
  the band **text** — phase 3 owns girlfriend's, phase 5 owns horny's (in `NINA_TRAIT_BANDS`). This phase edits
  only the two-line gate functions above them.
- The `horny` key — phase 5 adds it to `NINA_TRAITS`/`NINA_TRAIT_SPECS` and inherits the toggle
  mechanically, because `NINA_TUNING_KEYS` is a spread and the Zod shape, the coercion walk, the
  panel walk and the R4 gate test are all loops over that array.
- `app/admin/layout.tsx`, `AdminNav.tsx`, the four admin `page.tsx` container widths (phase 1).
- `FileExplorer`, `explorer/*`, `CropStudio`, `MemoryTable`, `ChatPhoto*`, `PhotoMoveBar`
  (phase 2). **`components/admin/DialSlider.tsx` is shared with phase 2** — see Conflicts below.
- `lib/nina/imagefail.ts`, `lib/nina/context.ts`, `lib/nina/proactive.ts`.

### Cross-phase conflicts — RESOLVED in reconciliation

1. **`components/admin/DialSlider.tsx` — RESOLVED. Phase 2 lands first; this phase quotes the file
   as phase 2 leaves it.** Phase 2's plan did not exist when this was drafted, and the draft's full-
   file replacement was written against `origin/main` — landing it as drafted would have silently
   reverted every one of phase 2's touch changes to this file. Step 11's code block is rewritten to
   phase 2's version of the file plus this phase's toggle. Concretely, what this phase now inherits
   and must not undo:
   - `import { TOUCH_TARGET } from '@/components/admin/touch'`, and `h-11 touch-none` on the range
     input (the 44 px track).
   - `TOUCH_TARGET` + `inline-flex … px-1` on the "default N" reset button.
   - The header row is **already** `flex items-center gap-2` with `ml-auto shrink-0` on the
     `<output>` and `min-w-0` on the `<label>`. Phase 2 made that change *for* this toggle, so the
     draft's `items-baseline` → `items-center` edit is already done and its
     `justify-between` + wrapping `<span>` structure is superseded.
   - There is **no `leading` prop.** Phase 2 proposed one and the reconciler removed it: this phase
     owns the toggle affordance (the plan index's phase-4 **Owns** line) and needs `enabled` as a
     value anyway, for the struck label and the `off` readout, which a `ReactNode` slot cannot
     carry. `enabled` / `onEnabledChange` is the whole seam.
   - **The checkbox is wrapped in `TOUCH_ICON`.** This plan's own handoff flagged that its `size-4`
     box has no touch target; that is a 16 px control in a package where phase 2 spends fourteen
     steps making everything 44. Fixed in Step 11 rather than flagged.
2. **`lib/nina/prompts/system.ts` — RESOLVED: three phases, three disjoint regions, order 3 → 4 → 5.**
   The phase-4 scope names `persona.ts` as the home of the gate, but `buildNinaSystemPrompt` lives in
   `lib/nina/prompts/system.ts:435`, and `systemDials()` there reads three raw scores off the tuning
   (`system.ts:77-89`). Those three reads **must** go through the gate or `concerned`, `verbosity`
   and `photoEagerness` would have toggles that do not work. So this phase edits `system.ts`, and:

   | Phase | Region in `system.ts` | What |
   |---|---|---|
   | 3 (lands first) | the `../persona` import list (`:2-19`); the first three `renderSections` entries (`:437-451`) | two import names, two gated block entries |
   | **4 (this one)** | **`systemDials` (`:77-89`) only** | its three raw score reads go through `ninaTraitScore` / `ninaDialScore` |
   | 5 | `systemDials`'s single `verbosity` line (quoting this phase's version); `buildOutputRule` (`:305-321`); `proactiveTuningSuffix` / `PROACTIVE_COPY` (`:566-644`); two more import names | the `horny` verbosity floor and the proactive clause |

   No two regions overlap. **This phase must quote the import list as PHASE 3 leaves it** — phase 3
   adds `ninaGirlfriendVoiceBlock` and `ninaManjaRegisterBlock` to it and prints the resulting list
   in its Step 5. This phase adds no import to that list (`ninaTraitScore` / `ninaDialScore` come
   from `../tuning`, a different import statement).
3. **`tests/__snapshots__/nina.prompts.test.ts.snap` — RESOLVED: never regenerated, in this phase or
   any other.** Phase 3 creates it from the pristine tree as a set-wide gate on the four
   non-girlfriend renders. At `enabled` all-true those four are unchanged **by construction**, so a
   snapshot failure here is a real invariant-1 break in this phase's gate — the one bug the fixture
   exists to catch — and `vitest -u` would hide it. This phase's draft did not carry the
   prohibition; the reconciler added it here and to Verification.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/tuning.ts` | modify | new §5: key union, `enabled` defaults, coercion, effective-score readers; `enabled` on `NinaTuning`/`NinaTuningInput`/`NINA_TUNING_DEFAULTS`/`coerceNinaTuning` |
| `lib/nina/persona.ts` | modify | `traitBand`/`dialBand` (`:92-95`) and the two relationship reads (`:297`, `:490`) go through the gate; plus phase 3's relationship reads |
| `lib/nina/prompts/system.ts` | modify | `systemDials` (`:77-89`) reads through the gate |
| `lib/db/schema.ts` | modify | sixteen nullable `boolean` columns on `nina_tuning` (`:1668-1745`) |
| `lib/nina/queries.ts` | modify | `tuningFromRow` (`:2773`) and `tuningToColumns` (`:2805`) map them both ways |
| `lib/admin/schema.ts` | modify | `enabledShape` + `enabled` on `ninaTuningWriteSchema` (`:425-447`) |
| `lib/admin/tuningActions.ts` | modify | action signature, `toTuningWrite` (`:78`), reset defaults (`:153`) |
| `lib/admin/tuningModel.ts` | modify | `TuningDraft.enabled`, `toTuningDraft`, `changedTuningFields`, `loudestDials` |
| `components/admin/CharacterPanel.tsx` | modify | toggle state + UI, still ONE save |
| `components/admin/DialSlider.tsx` | modify | the per-dial toggle affordance, applied **on top of phase 2's touch rewrite** — see Step 11's stated eight-point diff |
| `drizzle/0006_*.sql` + `drizzle/meta/*` | create | **GENERATED** by `npx drizzle-kit generate`. Never renamed. RECONCILED: `0006` verified free — `drizzle/meta/_journal.json` on `origin/main` @ `02dc79a` ends at `idx: 5`, `0005_nina_persona_tuning`. Phase 5's migration is therefore `0007`. |
| `tests/nina.tuning.test.ts` | modify | key union, defaults, coercion, effective readers |
| `tests/nina.prompts.test.ts` | modify | **the R4 gate**: disabling any key at 100 renders the shipping prompt |
| `tests/admin.tuning.test.ts` | modify | draft, diffing, Zod boundary, `loudestDials` |
| `tests/db.schema.nina.test.ts` | modify | the column list is asserted exactly; it must grow |

Fifteen files, not the index's nine. The four extra (`prompts/system.ts`, `db/schema.ts`,
`nina/queries.ts`, `db.schema.nina.test.ts`) are mechanically required by an `enabled` map that has
to persist and has to reach the assembler; none of them is optional and none is a drive-by.

---

## Implementation Steps

### Step 1: The key union, the enable map, and the effective-score readers

**File:** `lib/nina/tuning.ts` — insert a new **§5** between the end of §4 (line 488, after
`NINA_DIAL_SPECS`) and the current §5 header (line 490). Renumber the two sections below it: the
free-text section becomes §6 and the tuning section becomes §7 (edit the two `§N` comment banners
and the `§5`/`§6` references inside them).

**Change:** `pick()` moves here from its current home in the tuning section (it is deleted from
there and pasted here unchanged) so that `coerceNinaEnabled` and `coerceNinaTuning` share one
trust-boundary reader without a forward reference.

**Code:**

```ts
/* ============================================================================
 * §5 The parameter keys, and the enable map (R4)
 * ==========================================================================*/

/**
 * One property of something that may not be an object at all. Never throws.
 *
 * **Moved up from the tuning section** when the enable map landed: `coerceNinaEnabled` and
 * `coerceNinaTuning` are two halves of one trust boundary and a second copy of this three-line
 * reader is a second place for `__proto__` to be handled differently.
 */
function pick(bag: unknown, key: string): unknown {
  if (typeof bag !== 'object' || bag === null) return undefined
  return (bag as Record<string, unknown>)[key]
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **THE ON/OFF TOGGLE, PER PARAMETER (R4).** The user's words: *"we need an on/off toggle for
 *  each parameter, so we can exclude some parameters to make prompt more accurate for what we
 *  would like nina to do"*. The stated purpose is a SHORTER prompt, so a disabled parameter
 *  contributes ZERO BYTES — not "renders its identity band", not "renders a neutral paragraph".
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT "DISABLED" MEANS, IN ONE SENTENCE ────────────────────────────────────────────────────
 * **A disabled key is a key the operator never moved.** The stored score stays in the row and stays
 * on the slider; every reader on the PROMPT side reads that key's own `defaultScore` instead. Which
 * is exactly zero added bytes, because `defaultScore` is defined, per key, as *the value that
 * reproduces the text that ships* (see the IDENTITY BAND note in this file's header).
 *
 * That is why the gate is here, at the score seam, and not inside `ninaTraitsBlock`'s loop. Six
 * other things read a raw score: `ANGER_FLOOR_BY_BAND` / `ANGER_CEILING_BY_BAND` via
 * `ninaAngerFloor`, `BODY_REPEALED_BY` and `THREAT_REPEALED_BY` via `anyTurnedUp`, the `funny`
 * clause in `ninaIdentity`, and `OUTPUT_RULE`'s greeting line, its bubble preference and the camera
 * block via `systemDials`. A toggle that only skipped the paragraph would leave a disabled
 * `anger: 100` still flooring the nag ladder at rung 4 — a slider the operator switched off that
 * still rewrites three blocks of the prompt, and nothing in a diff to show it.
 *
 * ── WHY THE KEY LIST IS A SPREAD AND NEVER A HAND-WRITTEN UNION ───────────────────────────────
 * A SEVENTEENTH KEY must inherit the toggle for free, and there is a known one: the next phase adds
 * `horny` as a TWELFTH TRAIT. `NINA_TUNING_KEYS` is `[relationship, ...NINA_TRAITS, ...NINA_DIALS]`,
 * so the Zod shape, the coercion walk, the panel's checkbox, the diff paths and the R4 gate test in
 * `tests/nina.prompts.test.ts` are all loops over one array — and adding a key to EITHER source
 * array adds its toggle everywhere in the same commit, with no second list to forget. Nothing in
 * this phase may hard-code the number sixteen; the two places that did are corrected, and the
 * columns are the one place where sixteen is a fact rather than an assumption, because sixteen is
 * how many this phase's own migration creates.
 *
 * ── `relationship` IS IN HERE AND `wardrobe` / `notes` ARE NOT ────────────────────────────────
 * `nobody` is NOT an off switch for the relationship. Read `NINA_RELATIONSHIP_BLOCKS.nobody` in
 * `persona.ts`: it is four sentences of active instruction — *"You do not know him"*, *"you keep
 * your distance"*, *"you do not go first"* — the COLDEST setting on the axis, not the absent one.
 * Choosing it to "exclude" the parameter makes the prompt longer and changes her behaviour
 * drastically. And there is no representable "no relationship" at all: `ninaIdentity` needs a first
 * paragraph and `ninaNameRules` needs an address rule, and a prompt that names no address form
 * teaches her to invent one. So disabling the relationship means what disabling anything else
 * means: `NINA_DEFAULT_RELATIONSHIP`, whose blocks ARE today's `NINA_IDENTITY`.
 *
 * `wardrobe` and `notes` are the mirror image and therefore have NO toggle. `''` genuinely is their
 * absence — `ninaOperatorNotesBlock` returns `''` and the whole STANDING INSTRUCTIONS section
 * disappears, `ninaAppearance` falls back to `NINA_DEFAULT_OUTFIT` — so both already contribute zero
 * bytes at their empty value, and a toggle would be a second spelling for a state the field already
 * has. Two spellings for one fact is one too many.
 */
export const NINA_TUNING_RELATIONSHIP_KEY = 'relationship'

/**
 * **Every parameter the operator can switch off, in the panel's own order** — the relationship
 * first, because it is the first control on the page and the first column in `nina_tuning`, then
 * the eleven traits and the four dials in the order the user wrote them.
 *
 * DERIVED, never restated. See the note above.
 */
export const NINA_TUNING_KEYS = [
  NINA_TUNING_RELATIONSHIP_KEY,
  ...NINA_TRAITS,
  ...NINA_DIALS,
] as const

export type NinaTuningKey = (typeof NINA_TUNING_KEYS)[number]

export function isNinaTuningKey(key: string): key is NinaTuningKey {
  return (NINA_TUNING_KEYS as readonly string[]).includes(key)
}

/** Every key on. Built by walking the array, so a new dial arrives enabled without an edit here. */
function allNinaKeysEnabled(): Record<NinaTuningKey, boolean> {
  const out = {} as Record<NinaTuningKey, boolean>
  for (const key of NINA_TUNING_KEYS) out[key] = true
  return out
}

/**
 * **ALL TRUE, and that is plan invariant 1 held arithmetically.**
 *
 * `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` must render the string that shipped. With every key
 * enabled the gate is a pass-through, every key sits at its own `defaultScore`, every identity-band
 * skip fires exactly as it did before this phase, and the default render is untouched — rather than
 * untouched-if-somebody-remembered.
 *
 * Frozen, because `NINA_TUNING_DEFAULTS` below is frozen and `readNinaTuning` hands that exact
 * object to every caller for a user with no row.
 */
export const NINA_ENABLED_DEFAULTS: Readonly<Record<NinaTuningKey, boolean>> = Object.freeze(
  allNinaKeysEnabled(),
)

/**
 * **An enable map, made safe. ONLY AN EXPLICIT `false` DISABLES.**
 *
 * This is the migration's backfill, and it is why there is no data backfill (see the plan's
 * Verification): a row written before the `*_enabled` columns existed reads them as `null`, a row
 * written by an older client omits keys entirely, and both must mean *enabled*. Anything that is
 * not literally `false` — `null`, `undefined`, a missing key, `0`, `'off'`, `{}` — reads as on.
 *
 * The asymmetry is deliberate and is the opposite of `clampNinaScore`'s per-key fallback. A score
 * we cannot read must read as "unchanged"; an enable flag we cannot read must read as "on", because
 * the failure mode of guessing wrong is a production row that silently loses her personality on
 * deploy. There is exactly one way to switch a parameter off and it is a checkbox.
 */
export function coerceNinaEnabled(value: unknown): Record<NinaTuningKey, boolean> {
  const out = {} as Record<NinaTuningKey, boolean>
  for (const key of NINA_TUNING_KEYS) out[key] = pick(value, key) !== false
  return out
}

/**
 * Whether a parameter reaches the prompt at all.
 *
 * Reads through `pick` rather than `tuning.enabled[key]` so that a hand-built `NinaTuning` with no
 * `enabled` at all — a fixture, a `psql` round trip, a `as NinaTuning` cast in a test — degrades to
 * "everything on" instead of throwing in the middle of a turn.
 */
export function isNinaKeyEnabled(tuning: NinaTuning, key: NinaTuningKey): boolean {
  return pick(tuning.enabled, key) !== false
}

/**
 * ── THE THREE READERS THE PROMPT SIDE MUST USE, AND THE ONLY ONES ─────────────────────────────
 * `lib/nina/persona.ts` and `lib/nina/prompts/system.ts` may not read `tuning.traits`,
 * `tuning.dials` or `tuning.relationship` directly any more, and
 * `tests/nina.prompts.test.ts` reads their source and fails if they do. A direct read is a
 * parameter whose toggle silently does nothing, which is the one failure R4 cannot survive and the
 * one a reviewer cannot see.
 *
 * The STORE is the exception and stays a direct read: `tuningToColumns` in `lib/nina/queries.ts`
 * writes the value the operator PARKED, not the value the prompt uses. Switching a dial off must
 * never lose the number it was parked at — that is the whole point of a toggle as opposed to
 * dragging it back to the default.
 */
export function ninaTraitScore(tuning: NinaTuning, trait: NinaTrait): number {
  return isNinaKeyEnabled(tuning, trait)
    ? tuning.traits[trait]
    : NINA_TRAIT_SPECS[trait].defaultScore
}

export function ninaDialScore(tuning: NinaTuning, dial: NinaDial): number {
  return isNinaKeyEnabled(tuning, dial) ? tuning.dials[dial] : NINA_DIAL_SPECS[dial].defaultScore
}

/** `best_friend` when the relationship is switched off — the level whose blocks ARE today's text. */
export function ninaActiveRelationship(tuning: NinaTuning): NinaRelationship {
  return isNinaKeyEnabled(tuning, NINA_TUNING_RELATIONSHIP_KEY)
    ? tuning.relationship
    : NINA_DEFAULT_RELATIONSHIP
}
```

**Impact:** `tuning.ts` still has zero imports — every one of these is plain data and pure
functions over types already declared in the file. `tests/nina.tuning.test.ts`'s source-reading
assertion continues to hold.

---

### Step 2: `enabled` on the row model

**File:** `lib/nina/tuning.ts:560-685` (the section that is §7 after Step 1)

**Change:** add the field to `NinaTuning`, to `NinaTuningInput`, to `NINA_TUNING_DEFAULTS` and to
`coerceNinaTuning`; delete the now-relocated `pick`.

**Code — `NinaTuning` (replace the interface body, keeping every existing docstring above it):**

```ts
export interface NinaTuning {
  readonly traits: Readonly<Record<NinaTrait, number>>
  readonly relationship: NinaRelationship
  readonly dials: Readonly<Record<NinaDial, number>>
  /**
   * **R4's per-parameter on/off switch.** One boolean per key in `NINA_TUNING_KEYS` — the
   * relationship, the eleven traits and the four dials. A `false` here means the key contributes
   * ZERO BYTES to the assembled prompt at any score; see §5. All true is the default and is what
   * makes `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` the prompt that ships.
   */
  readonly enabled: Readonly<Record<NinaTuningKey, boolean>>
  /** `''` = no override; phase 4 uses `NINA_APPEARANCE`'s outfit. */
  readonly wardrobe: string
  /** `''` = nothing appended to the system prompt. */
  readonly notes: string
  readonly revision: number
}
```

**Code — `NinaTuningInput`:**

```ts
export interface NinaTuningInput {
  readonly traits?: unknown
  readonly relationship?: unknown
  readonly dials?: unknown
  readonly enabled?: unknown
  readonly wardrobe?: unknown
  readonly notes?: unknown
  readonly revision?: unknown
}
```

**Code — delete the old `pick` (it now lives in §5):**

```ts
/* `pick` moved to §5, where `coerceNinaEnabled` also needs it. One reader, one trust boundary. */
```

**Code — `NINA_TUNING_DEFAULTS` (keep the banner docstring above it verbatim):**

```ts
export const NINA_TUNING_DEFAULTS: NinaTuning = Object.freeze({
  traits: defaultScores(NINA_TRAITS, NINA_TRAIT_SPECS),
  relationship: NINA_DEFAULT_RELATIONSHIP,
  dials: defaultScores(NINA_DIALS, NINA_DIAL_SPECS),
  /* Frozen and shared like the two score records above, and ALL TRUE — see §5. */
  enabled: NINA_ENABLED_DEFAULTS,
  wardrobe: '',
  notes: '',
  revision: 0,
})
```

**Code — `coerceNinaTuning` (replace the function body; keep its docstring and add the fourth
numbered behaviour):**

```ts
export function coerceNinaTuning(input: NinaTuningInput | null | undefined): NinaTuning {
  const traitsIn = input?.traits
  const dialsIn = input?.dials

  const traits = {} as Record<NinaTrait, number>
  for (const key of NINA_TRAITS) {
    traits[key] = clampNinaScore(pick(traitsIn, key), NINA_TRAIT_SPECS[key].defaultScore)
  }

  const dials = {} as Record<NinaDial, number>
  for (const key of NINA_DIALS) {
    dials[key] = clampNinaScore(pick(dialsIn, key), NINA_DIAL_SPECS[key].defaultScore)
  }

  return {
    traits,
    relationship: coerceNinaRelationship(input?.relationship),
    dials,
    /* 4. **A missing or partial enable map is ALL TRUE.** A row written before the `*_enabled`
     *    columns existed hands us sixteen nulls, and every one of them must mean "on" — the
     *    alternative is a deploy that silently mutes her personality. Only an explicit `false`
     *    disables. */
    enabled: coerceNinaEnabled(input?.enabled),
    wardrobe: coerceNinaWardrobe(input?.wardrobe),
    notes: coerceNinaNotes(input?.notes),
    revision: coerceRevision(input?.revision),
  }
}
```

**Impact:** `NinaTuningWrite = Omit<NinaTuning,'revision'>` now requires `enabled`, so
`tuningToColumns`, `toTuningWrite` and `resetNinaTuningAction` are compile errors until Steps 4, 6
and 7 land. That is deliberate — it is the compiler enumerating every writer.

---

### Step 3: The gate in the persona

**File:** `lib/nina/persona.ts:68-95` (imports and the two band readers), `:297`, `:490`

**Change:** three call sites, no text.

**Code — the import block (`persona.ts:68-80`), replaced:**

```ts
import {
  type NinaBandIndex,
  type NinaBandName,
  type NinaDial,
  type NinaRelationship,
  type NinaTrait,
  type NinaTuning,
  NINA_ADDRESS,
  NINA_DIAL_SPECS,
  NINA_TRAIT_SPECS,
  NINA_TUNING_DEFAULTS,
  ninaActiveRelationship,
  ninaBand,
  ninaDialScore,
  ninaTraitScore,
} from './tuning'
```

**Code — the two band readers (`persona.ts:84-95`), replaced docstring and all:**

```ts
/**
 * The two — and only two — places the SHAPE of `NinaTuning` is read for a score. Everything below
 * asks for a band NAME, never for a number, so a change to how the tuning is stored is a two-line
 * change here rather than a forty-line change through the text.
 *
 * ── R4'S GATE IS INSIDE THESE TWO LINES, AND THAT IS WHY THERE ARE ONLY TWO ───────────────────
 * `ninaTraitScore` / `ninaDialScore` return the key's own `defaultScore` when the operator has
 * switched that parameter OFF, so a disabled key resolves to its IDENTITY BAND and every skip below
 * fires exactly as it does for a key nobody moved: `atTraitIdentityBand` is true, `ninaTraitsBlock`
 * `continue`s BEFORE the band lookup, `isTurnedUp` is false so no repeal fires, and
 * `ANGER_FLOOR_BY_BAND` reads `off` so the ladder is arithmetically untouched. Zero bytes, at any
 * score — which is what R4 asked for: *"exclude some parameters to make prompt more accurate"*.
 *
 * **Nothing in this file may read `tuning.traits`, `tuning.dials` or `tuning.relationship`
 * directly**, and `tests/nina.prompts.test.ts` reads this file's source and fails if it does. A
 * direct read is a parameter whose toggle silently does nothing.
 *
 * `ninaBand()` returns `{ index, name }` — the index exists so the anger floor can be a rung. The
 * text below only ever wants the name.
 */
const traitBand = (tuning: NinaTuning, trait: NinaTrait): NinaBandName =>
  ninaBand(ninaTraitScore(tuning, trait)).name
const dialBand = (tuning: NinaTuning, dial: NinaDial): NinaBandName =>
  ninaBand(ninaDialScore(tuning, dial)).name
```

**Code — `ninaIdentity` (`persona.ts:296-306`), replaced:**

```ts
export function ninaIdentity(tuning: NinaTuning): string {
  /* `ninaActiveRelationship`, not `tuning.relationship`: with the relationship switched off (R4)
   * she is `best_friend`, whose `identity` and `history` ARE today's NINA_IDENTITY character for
   * character — so "excluded" costs zero bytes here too. */
  const spec = NINA_RELATIONSHIP_BLOCKS[ninaActiveRelationship(tuning)]
  const humour = isTurnedUp(tuning, 'funny') ? NINA_JOKES_ALLOWED : NINA_NO_JOKES
  return [
    `${NINA_PREAMBLE} ${spec.identity.join(' ')}`,
    NINA_WHERE_SHE_LIVES,
    NINA_HOW_SHE_RUNS,
    `${NINA_HUMOUR} ${humour}`,
    spec.history,
  ].join('\n\n')
}
```

**Code — `ninaNameRules` (`persona.ts:485-494`), the one changed line inside the existing body:**

```ts
export function ninaNameRules(tuning: NinaTuning): string {
  /* PHASE 1'S STRINGS, COMPOSED — never restated. `NINA_ADDRESS` in `./tuning` is the one home for
   * what she calls him, because phase 5's `'use client'` panel has to show the operator the same
   * words and cannot import this file's canon. `addressFallback` is `string` and never null on any
   * of the five levels, so there is no branch here: two paragraphs, always.
   *
   * `ninaActiveRelationship` and not `tuning.relationship`, for R4 — see `ninaIdentity`. */
  const address = NINA_ADDRESS[ninaActiveRelationship(tuning)]
  return `${address.addressRule}

${address.addressFallback}`
}
```

**Change — phase 3's reads:** phase 3 lands a relationship-gated orthography rule beside
`JAKARTA_REGISTER` and gated `VOICE_EXAMPLES` additions. Run

```bash
rg -n 'tuning\.relationship' lib/nina/persona.ts lib/nina/prompts lib/nina/proactive.ts
```

and replace every hit with `ninaActiveRelationship(tuning)`. Do not touch the text those gates
select — that is phase 3's. Step 8's guard test fails if one is missed.

**Impact:** every consumer of `traitBand`/`dialBand` — `atTraitIdentityBand`, `atDialIdentityBand`,
`isTurnedUp`, `anyTurnedUp`, `ninaAngerFloor`, `ninaAngerCeiling`, `ninaTraitsBlock` — is gated by
these two edits. No other line in `persona.ts` changes.

---

### Step 4: The gate in the assembler

**File:** `lib/nina/prompts/system.ts:19` (import) and `:77-89` (`systemDials`)

**Change:** the three raw score reads go through the gate. Everything else in this file already
routes through `anyTurnedUp` / `ninaAngerFloor` / `ninaAngerCeiling`, which Step 3 gated.

**Code — the tuning import (`system.ts:19`), replaced:**

```ts
import {
  NINA_TUNING_DEFAULTS,
  type NinaTuning,
  ninaDialScore,
  ninaTraitScore,
} from '../tuning'
```

**Code — `systemDials` (`system.ts:77-89`), replaced:**

```ts
function systemDials(tuning: NinaTuning): SystemDials {
  return {
    /* R4: `ninaTraitScore` / `ninaDialScore` and never `tuning.traits.x`. A parameter the operator
     * switched off resolves to its own `defaultScore`, so `raised`, `lowered` and `loud` below are
     * all false and every line this file varies is the line that shipped — zero bytes added by a
     * dial that is off, whatever it is parked at. A direct read here would have given `concerned`,
     * `verbosity` and `photoEagerness` toggles that do nothing, in the three places the operator is
     * most likely to notice: the greeting, the bubble count and the camera. */
    concerned: ninaTraitScore(tuning, 'concerned'),
    concernedBase: NINA_TUNING_DEFAULTS.traits.concerned,
    /* NESTED under `dials`, and the dial is `photoEagerness` — phase 1's landed spelling. */
    verbosity: ninaDialScore(tuning, 'verbosity'),
    verbosityBase: NINA_TUNING_DEFAULTS.dials.verbosity,
    photos: ninaDialScore(tuning, 'photoEagerness'),
    photosBase: NINA_TUNING_DEFAULTS.dials.photoEagerness,
  }
}
```

**Impact:** `buildOutputRule`, `buildCameraBlock` and `proactiveTuningSuffix` are all gated. The
assembler is now complete: `buildNinaSystemPrompt` has no ungated read of a tuning value.

---

### Step 5: The columns

**File:** `lib/db/schema.ts` — inside `ninaTuning` (`:1668-1745`), after `notes` (`:1729`) and
before `revision` (`:1740`).

**Change:** sixteen `boolean` columns, **nullable, no SQL default**. `boolean` is already imported
(`schema.ts:4`).

**Code:**

```ts
  /**
   * ── R4's PER-PARAMETER ON/OFF SWITCH, ONE COLUMN PER PARAMETER ──────────────────────────────
   * *"we need an on/off toggle for each parameter, so we can exclude some parameters to make prompt
   * more accurate."* `lib/nina/tuning.ts`'s `NINA_TUNING_KEYS` owns the vocabulary; these are the
   * sixteen booleans behind it, in the same order as the score columns above.
   *
   * **Columns and not one `jsonb` map**, for the three reasons this table's header already gives,
   * and the first one bites harder here than it does for the scores: a misspelt key in a blob is
   * indistinguishable from an unset one, `coerceNinaEnabled` reads an unset key as `true`, and the
   * failure would therefore be *a toggle that silently does nothing* — the one failure R4 cannot
   * survive. A column named `flirtty_enabled` fails at `db:generate`, and drizzle's insert type
   * makes `tuningToColumns` a compile error if it forgets one it declares.
   *
   * ── NULLABLE, WITH NO DEFAULT, AND THAT IS THE BACKFILL ─────────────────────────────────────
   * The `nina_turns.tuning_revision` idiom, verbatim: NULLABLE with no default, and NULL means one
   * thing only — **a row written before the toggles existed**. `coerceNinaEnabled` reads anything
   * that is not literally `false` as enabled, so an existing production row is all-on the moment
   * the migration lands, with no `UPDATE` and no data step. A `DEFAULT true` would have been the
   * second copy of `NINA_ENABLED_DEFAULTS` in a second language that this table's header forbids.
   * `writeNinaTuning` supplies all sixteen on every save, so NULL never appears in a row this app
   * has written.
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
  profanityEnabled: boolean('profanity_enabled'),
  clinginessEnabled: boolean('clinginess_enabled'),
  photoEagernessEnabled: boolean('photo_eagerness_enabled'),
  verbosityEnabled: boolean('verbosity_enabled'),
```

Also update the table's header docstring, first paragraph, from *"fifteen integers and three
strings"* to:

```
 * intensities, a relationship, four behaviour dials, sixteen enable flags, a wardrobe line and a
 * notes field — fifteen integers, sixteen booleans and three strings. `lib/nina/tuning.ts` owns the
 * vocabulary, the domains and the defaults; this table stores one row of it per user and nothing
 * else.
```

**Impact:** `NinaTuningRow` gains sixteen `boolean | null` fields; `NewNinaTuningRow` gains sixteen
optional ones. Step 6 fills them.

---

### Step 6: The generated migration

**File:** `drizzle/0006_<generated_name>.sql`, `drizzle/meta/0006_snapshot.json`,
`drizzle/meta/_journal.json`

**Change:** run the generator. **Do not create, rename or hand-edit any of these three files.**

```bash
cd /home/miftah/.worktrees/run-insights/admin-responsive-nina-intimacy
npx drizzle-kit generate      # or: npm run db:generate
```

`drizzle.config.ts` throws unless `DATABASE_URL_UNPOOLED` is set in `.env.local` and points at the
direct (non-`-pooler`) Neon host — set that before running.

The expected output is one file of sixteen statements:

```sql
ALTER TABLE "nina_tuning" ADD COLUMN "relationship_enabled" boolean;--> statement-breakpoint
ALTER TABLE "nina_tuning" ADD COLUMN "anger_enabled" boolean;--> statement-breakpoint
...
ALTER TABLE "nina_tuning" ADD COLUMN "verbosity_enabled" boolean;
```

**There is no backfill statement and there must not be one.** NULL is the "written before the
toggles existed" sentinel and `coerceNinaEnabled` reads it as enabled; an `UPDATE ... SET
* _enabled = true` would write the same fact a second time in SQL, and it is exactly the kind of
hand-added statement that turns a generated migration into an edited one.

**Impact:** the journal gains an `idx: 6` entry with a fresh `when`. This repo has been bitten by a
renamed migration keeping its old `when`, dropping below drizzle's watermark and being skipped
silently — hence plan invariant 8, and hence: whatever name `drizzle-kit` picks, that is the name.

Apply it with `npm run db:migrate`, then `npm run db:check`.

---

### Step 7: The row mapping

**File:** `lib/nina/queries.ts:2773` (`tuningFromRow`) and `:2805` (`tuningToColumns`)

**Code — `tuningFromRow`, replaced:**

```ts
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
      profanity: row.profanityEnabled,
      clinginess: row.clinginessEnabled,
      photoEagerness: row.photoEagernessEnabled,
      verbosity: row.verbosityEnabled,
    },
    wardrobe: row.wardrobe,
    notes: row.notes,
    revision: row.revision,
  })
}
```

**Code — `tuningToColumns`, replaced:**

```ts
function tuningToColumns(tuning: NinaTuningWrite) {
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
    profanityEnabled: tuning.enabled.profanity,
    clinginessEnabled: tuning.enabled.clinginess,
    photoEagernessEnabled: tuning.enabled.photoEagerness,
    verbosityEnabled: tuning.enabled.verbosity,
    wardrobe: tuning.wardrobe,
    notes: tuning.notes,
  }
}
```

Also extend `tuningFromRow`'s docstring: *"`lib/db/schema.ts` spells **thirty-six** snake_case
columns"*.

**Impact:** the nullable columns mean drizzle would not catch a forgotten key here at compile time,
so Step 12 adds a structural test over this file's source that walks `NINA_TUNING_KEYS` and asserts
both directions are spelled. Phase 5's `horny` is caught by the same test.

---

### Step 8: The Zod boundary

**File:** `lib/admin/schema.ts:425-447`

**Change:** add `enabledValueSchema` + `enabledShape` beside `dialValueSchema` + `dialShape`, and
one field on the write schema. Add `NINA_TUNING_KEYS` to the import block at `:29-34`.

**Code:**

```ts
const dialValueSchema = z.number().int().min(NINA_SCORE_MIN).max(NINA_SCORE_MAX)

/** R4's toggle. A boolean and nothing else — no `"true"`, no `1`. The browser we wrote sends one. */
const enabledValueSchema = z.boolean()

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

/**
 * The same idiom for R4's enable map, over `NINA_TUNING_KEYS` — which is itself
 * `[relationship, ...NINA_TRAITS, ...NINA_DIALS]`, so a seventeenth key gets a validated toggle the
 * moment it is added to either array (the next phase's `horny` joins through `NINA_TRAITS`) and
 * nothing here changes.
 */
function enabledShape<K extends string>(keys: readonly K[]): Record<K, typeof enabledValueSchema> {
  const shape = {} as Record<K, typeof enabledValueSchema>
  for (const key of keys) shape[key] = enabledValueSchema
  return shape
}

export const ninaTuningWriteSchema = z.object({
  userId: userIdSchema,
  traits: z.strictObject(dialShape(NINA_TRAITS)),
  dials: z.strictObject(dialShape(NINA_DIALS)),
  /**
   * R4. `strictObject` like the two above and for the same reason: a stripped `flirtyy` would save
   * fifteen toggles and report success, and the operator would watch one checkbox silently refuse
   * to take. Every key is REQUIRED — the panel always sends a complete map, and an absent key here
   * would be an ambiguity between "on" and "the client is old".
   */
  enabled: z.strictObject(enabledShape(NINA_TUNING_KEYS)),
  relationship: z.enum(NINA_RELATIONSHIPS),
  /** Goes into an IMAGE prompt, not into her voice. Empty is valid and means "the anchor outfit". */
  wardrobe: z.string().trim().max(NINA_WARDROBE_MAX),
  /** Handed to her verbatim in the system prompt. Empty is valid and is the default. */
  notes: z.string().trim().max(NINA_NOTES_MAX),
})
```

**Impact:** `NinaTuningWriteInput` gains `enabled: Record<NinaTuningKey, boolean>`, which is exactly
what `NinaTuningWrite` wants, so Step 9's `toTuningWrite` needs no cast.

---

### Step 9: The action

**File:** `lib/admin/tuningActions.ts:78-86`, `:96-103`, `:153-159`

**Code — `toTuningWrite`:**

```ts
function toTuningWrite(input: NinaTuningWriteInput): NinaTuningWrite {
  return {
    traits: input.traits,
    dials: input.dials,
    /* R4. `ninaTuningWriteSchema` builds this shape from `NINA_TUNING_KEYS`, so it is already
     * `Record<NinaTuningKey, boolean>` and no cast is needed on this path either. */
    enabled: input.enabled,
    relationship: input.relationship,
    wardrobe: input.wardrobe,
    notes: input.notes,
  }
}
```

**Code — the action signature (the body below it is unchanged):**

```ts
export async function saveNinaTuningAction(input: {
  userId: string
  traits: Record<string, number>
  dials: Record<string, number>
  /** R4's per-parameter toggles, keyed by `NINA_TUNING_KEYS`. Zod narrows it; this is a comment. */
  enabled: Record<string, boolean>
  relationship: string
  wardrobe: string
  notes: string
}): Promise<AdminTuningResult> {
```

**Code — the reset defaults:**

```ts
  const defaults: NinaTuningWrite = {
    traits: { ...NINA_TUNING_DEFAULTS.traits },
    dials: { ...NINA_TUNING_DEFAULTS.dials },
    /* Spread like the two records above: `NINA_ENABLED_DEFAULTS` is frozen and `writeNinaTuning`
     * must never be handed the singleton. "Reset" turns every parameter back ON, because the Nina
     * who shipped is the one with nothing excluded. */
    enabled: { ...NINA_TUNING_DEFAULTS.enabled },
    relationship: NINA_TUNING_DEFAULTS.relationship,
    wardrobe: NINA_TUNING_DEFAULTS.wardrobe,
    notes: NINA_TUNING_DEFAULTS.notes,
  }
```

**Impact:** still exactly two exported functions, which `tests/admin.tuning.test.ts` asserts. One
save, not seventeen.

---

### Step 10: The draft model

**File:** `lib/admin/tuningModel.ts`

**Change:** four edits — the type, the read seam, the diff, and the hub card.

**Code — `TuningDraft`:**

```ts
/** What a browser edits: phase 1's row, minus the revision the database mints. */
export interface TuningDraft {
  traits: Record<string, number>
  dials: Record<string, number>
  /**
   * R4's per-parameter toggles, keyed by `NINA_TUNING_KEYS` — the relationship, the eleven traits
   * and the four dials. `Record<string, boolean>` rather than the key union for the same reason the
   * two score records are loose: this is the adaptation seam, and a component that reads
   * `draft.enabled[key] ?? true` survives a key the model has and the panel has not caught up with.
   */
  enabled: Record<string, boolean>
  relationship: string
  wardrobe: string
  notes: string
}
```

**Code — `toTuningDraft`:**

```ts
export function toTuningDraft(tuning: NinaTuning): TuningDraft {
  return {
    traits: { ...tuning.traits },
    dials: { ...tuning.dials },
    /* Copied, not aliased, like the two above — and `NINA_TUNING_DEFAULTS.enabled` is FROZEN, so a
     * draft that aliased it would throw on the first checkbox. */
    enabled: { ...tuning.enabled },
    relationship: tuning.relationship,
    wardrobe: tuning.wardrobe,
    notes: tuning.notes,
  }
}
```

**Code — `changedTuningFields` (replace the whole function):**

```ts
/**
 * Which fields differ, as stable dotted paths (`traits.anger`, `dials.photoEagerness`,
 * `enabled.flirty`, `relationship`, `wardrobe`, `notes`).
 *
 * One function serves three jobs, which is why it returns names instead of a boolean: the summary
 * line counts them, each control asks whether its own path is in the set, and `tuningDraftEquals`
 * is `length === 0`. Sorted, so a test can assert the list rather than a set.
 *
 * The key union is taken from BOTH sides, so a key present in one and absent in the other counts
 * as a difference rather than being silently skipped.
 *
 * **`enabled.*` is appended LAST**, after the three scalar fields rather than beside the scores, so
 * that R4's paths are visibly a group and the existing order the tests pin is untouched.
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

  /* `?? true` on BOTH sides: an absent key means "on" everywhere in this feature, so a draft that
   * has never seen a key and a row that has never stored one must not read as a difference. */
  for (const key of Object.keys({ ...saved.enabled, ...next.enabled }).sort()) {
    if ((next.enabled[key] ?? true) !== (saved.enabled[key] ?? true)) {
      changed.push(`enabled.${key}`)
    }
  }

  return changed
}
```

**Code — `loudestDials` (replace the whole function; the interface above it is unchanged):**

```ts
/**
 * The dials furthest from their defaults, loudest first — what `/admin`'s hub card prints.
 *
 * **Distance from default, not highest value.** Phase 1's defaults are deliberately non-uniform —
 * six traits ship at 0, `profanity` at 30, the other eight at 50 — so "highest" would print a dial
 * nobody moved and hide the one that changed her. Invariant 2 makes the default the meaningful zero
 * point: a dial at its default contributes nothing to her prompt that was not already there.
 *
 * **A DISABLED dial is never loud, whatever it is parked at (R4).** It contributes zero bytes to
 * the prompt, so printing it as the thing that changed her would be the card telling the operator
 * about text that is not in there. A dial parked at 90 with its toggle off is exactly as loud as
 * one at its default: silent.
 *
 * Ties break on the key so the card does not reshuffle between two renders of the same row.
 */
export function loudestDials(draft: TuningDraft, defaults: TuningDraft, limit = 3): LoudDial[] {
  const loud: LoudDial[] = []

  for (const [key, value] of Object.entries(draft.traits)) {
    if (draft.enabled[key] === false) continue
    const delta = Math.abs(value - (defaults.traits[key] ?? 0))
    if (delta > 0) loud.push({ key, value, delta })
  }
  for (const [key, value] of Object.entries(draft.dials)) {
    if (draft.enabled[key] === false) continue
    const delta = Math.abs(value - (defaults.dials[key] ?? 0))
    if (delta > 0) loud.push({ key, value, delta })
  }

  loud.sort((a, b) => b.delta - a.delta || a.key.localeCompare(b.key))
  return loud.slice(0, limit)
}
```

**Impact:** `app/admin/page.tsx:61` and `app/admin/nina/page.tsx:168-169` need **no edit** — both
go through `toTuningDraft`, which now carries `enabled`. That is the seam doing its job.

---

### Step 11: The toggle affordance, and the panel

**File:** `components/admin/DialSlider.tsx` — full replacement below.

> **RECONCILED — this quotes the file as PHASE 2 LEAVES IT, not as `origin/main` has it.** Phase 2
> lands first and gives this file its 44 px track (`h-11 touch-none`), its 44 px reset button
> (`TOUCH_TARGET`), its `@/components/admin/touch` import, and the header row as
> `flex items-center gap-2` with `ml-auto shrink-0` on the readout — a change phase 2 made
> *specifically* so this toggle could join that row without dragging the label's baseline. The
> draft of this step was written against `origin/main` and would have reverted all of it. Every
> phase-2 class below is inherited, not authored here. **The checkbox is wrapped in `TOUCH_ICON`**,
> which is the fix for this plan's own handoff note that its `size-4` box had no touch target.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { TOUCH_ICON, TOUCH_TARGET } from '@/components/admin/touch'
import { cn } from '@/lib/cn'

/**
 * One dial, 0–100 — the *"sliding bars"* R1 asked for, in the only shape that satisfies the two
 * conditions the plan set on them: **keyboard-operable, and showing its number.**
 *
 * ── A NATIVE `<input type="range">`, NOT A DIV WITH A DRAG HANDLER ──────────────────────────
 * Arrow keys, Home/End and PageUp/PageDown all work, focus is visible, the value is exposed to a
 * screen reader, and the thumb tracks a pointer correctly on the first try. A hand-rolled track
 * gets none of that for free and this repo has already made that call once —
 * `components/admin/CropStudio.tsx` is a native range with `accent-accent`, and this is the
 * same control with a label and a readout bolted on.
 *
 * ── WHERE IT LIVES, AND WHY IT IS NOT IN `components/ui/` ───────────────────────────────────
 * `components/ui/index.ts` is the shared client-safe kit, and three arguments keep this control
 * out of it. It has exactly one caller and one audience — the runner's app has no slider and the
 * design brief names none, while every operator-only control so far (`CropStudio`, `FolderMenu`,
 * `PhotoMoveBar`, `SelectionPane`, `UserPicker`) has lived here. The barrel is a load-bearing
 * bundle boundary: ten `'use client'` files import it, and the `AppShell` precedent records what
 * happens when something with a different graph joins. And the nearest precedent already chose
 * `components/admin/`. If a runner-facing slider ever appears, moving this file is one rename plus
 * one line in the barrel, and that is the moment to make the case.
 *
 * `components/admin/touch.ts` follows exactly this reasoning and is a sibling for it.
 *
 * ── WHY NOT `Field` ─────────────────────────────────────────────────────────────────────────
 * `Field` owns the `label`/`hint`/`error`/`aria-describedby` wiring, but only `Input` reads its
 * context for the `id`, so a bare `<input type="range">` inside a `Field` would get a
 * `<label htmlFor>` pointing at nothing — an unlabelled control with the appearance of a labelled
 * one. `CONTROL_CLASS` is also a 52 px filled well, which is a text field and not a track. So this
 * component does its own `useId` wiring, which is four lines.
 *
 * ── THE NUMBER IS NOT DECORATION ────────────────────────────────────────────────────────────
 * An unlabelled slider is a dial the operator cannot report back: "flirty is quite high" is not a
 * bug report and cannot be compared against `nina_turns`' recorded revision. So the value renders
 * as an `<output>` tied to the input, and it is the number that is actually stored.
 *
 * ── THREE DIFFERENT KINDS OF "CHANGED", ALL VISIBLE ─────────────────────────────────────────
 * `defaultValue` is the SHIPPING default, so accent type means *this is no longer the Nina who
 * shipped*. `unsaved` means *this is not what the row says yet*, which is a different question and
 * gets its own dot. And `enabled` (R4) means *this parameter reaches her prompt at all*.
 *
 * The three interact in one place and it is deliberate: **a dial that is switched OFF is never
 * shown in accent**, whatever it is parked at, because a disabled parameter contributes zero bytes
 * and on that axis she IS the Nina who shipped. The "default N" button still appears, because the
 * operator may want to clear a parked value without turning the parameter back on to do it.
 *
 * Clicking "default N" is the per-dial undo. It writes the default into the draft rather than
 * saving anything, so it is still one Save for the whole tuning (plan invariant 11).
 *
 * ── THE TOGGLE IS OPTIONAL, AND ABSENT MEANS "NO TOGGLE" ────────────────────────────────────
 * `onEnabledChange` is what renders the checkbox. A caller with a parameter that has no off switch
 * — there is none today, but `wardrobe` and `notes` are exactly that shape — passes neither prop
 * and gets the control as it was before R4, rather than a checkbox that is always on and does
 * nothing.
 *
 * ── TOUCH (INHERITED FROM THE RESPONSIVE PHASE — DO NOT UNDO) ───────────────────────────────
 * `h-11` on the track, `TOUCH_TARGET` on the reset and `TOUCH_ICON` around the checkbox are the
 * 44 px rule (`docs/design-brief.md:175`); a range input's hit area is its box, and Safari draws
 * the track vertically centred in whatever height it is given, so the control looks the same and is
 * far easier to hit with a thumb. The header row is `items-center` with the readout pushed right by
 * `ml-auto` **precisely so the checkbox can sit at its head without dragging the label's baseline
 * around** — it was `items-baseline justify-between` before, which could not hold a control of
 * arbitrary height. That row shape exists for this toggle; it is not incidental.
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
  /** The draft differs from the saved row for this dial — its value OR its toggle. */
  unsaved?: boolean
  /** R4: whether this parameter reaches the assembled prompt at all. */
  enabled?: boolean
  /** R4: omit to render no toggle at all. */
  onEnabledChange?: (next: boolean) => void
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
  enabled = true,
  onEnabledChange,
  onChange,
}: DialSliderProps) {
  const base = React.useId()
  const inputId = `${base}-dial`
  const hintId = hint ? `${base}-hint` : undefined
  /* `deviates` drives the per-dial undo; `moved` drives the accent. They differ for exactly one
   * state and it is R4's: parked away from the default with the toggle OFF. */
  const deviates = value !== defaultValue
  const moved = enabled && deviates

  return (
    <div className={cn('py-2', !enabled && 'opacity-70')}>
      {/* `items-center` + `ml-auto` is phase 2's row, made for exactly this checkbox. */}
      <div className="flex items-center gap-2">
        {onEnabledChange && (
          /*
           * `TOUCH_ICON` is the 44 px box; `size-4` is the checkbox drawn inside it. A bare
           * `size-4` control is 16 px and would be the only thing in `components/admin/` under the
           * rule the responsive phase spent fourteen steps enforcing — and this is the control the
           * operator reaches for most, since it is the one that shortens the prompt.
           *
           * A wrapping `<label>` rather than `aria-label` on the input: the label makes the whole
           * 44 px box the hit target, not just the 16 px glyph inside it, which is the entire point
           * of giving it a 44 px box. The `sr-only` span is its accessible name. `-ml-2.5` pulls
           * the oversized box back so the checkbox glyph still lines up with the row's left edge;
           * the padding is hit area, not indent.
           */
          <label className={cn(TOUCH_ICON, '-ml-2.5 shrink-0 cursor-pointer')}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={disabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
              className="size-4 accent-accent disabled:opacity-50"
            />
            <span className="sr-only">Include {label} in her prompt</span>
          </label>
        )}

        <label
          htmlFor={inputId}
          className={cn(
            'min-w-0 truncate text-[12px] font-semibold tracking-[0.02em]',
            enabled ? 'text-ink-2' : 'text-ink-3 line-through',
          )}
        >
          {label}
        </label>

        <output
          htmlFor={inputId}
          className={cn(
            'ml-auto shrink-0 text-[13px] font-semibold tabular-nums',
            moved ? 'text-accent' : 'text-ink-3',
          )}
        >
          {unsaved && (
            <span className="mr-1 text-accent" title="Unsaved">
              &bull;
            </span>
          )}
          {value}
          {!enabled && <span className="ml-1 text-[11px] font-medium">off</span>}
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
        /* `h-11` is the 44 px tap target; `touch-none` keeps a slightly diagonal thumb drag from
           being claimed by the page's scroll partway through. Both inherited — do not shrink. */
        className="mt-0.5 h-11 w-full touch-none accent-accent disabled:opacity-50"
      />

      <div className="mt-1 flex items-center justify-between gap-3">
        {hint ? (
          <p id={hintId} className="max-w-[46ch] text-[11px] font-medium text-ink-3">
            {hint}
          </p>
        ) : (
          <span />
        )}
        {deviates && !disabled && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className={cn(
              TOUCH_TARGET,
              'inline-flex shrink-0 items-center px-1 text-[11px] font-semibold text-ink-3',
              'underline decoration-dotted hover:text-ink',
            )}
          >
            default {defaultValue}
          </button>
        )}
      </div>
    </div>
  )
}
```

**The diff against the file phase 2 leaves, stated exactly** — this is what to look for when
applying it, and anything else in the file is phase 2's and stays:

1. `import { TOUCH_TARGET }` becomes `import { TOUCH_ICON, TOUCH_TARGET }`.
2. The docstring's "TWO DIFFERENT KINDS OF CHANGED" section becomes "THREE", and the "TOUCH" section
   gains the checkbox's `TOUCH_ICON` to the list of things not to shrink.
3. `DialSliderProps` gains `enabled?` and `onEnabledChange?`; `unsaved`'s comment widens to cover
   the toggle path.
4. The wrapper `<div className="py-2">` gains `cn(..., !enabled && 'opacity-70')`.
5. The checkbox `<label>` is inserted as the first child of the header row.
6. The dial's `<label>` gains `truncate` and the `enabled ? … : 'text-ink-3 line-through'` pair.
7. The `<output>` gains the `off` marker, and its accent condition becomes `moved` = `enabled &&
   deviates` rather than bare `value !== defaultValue`.
8. The reset button's condition becomes `deviates` rather than `moved`.

Nothing else moves. In particular `h-11`, `touch-none`, `mt-0.5`, `TOUCH_TARGET`, `ml-auto`,
`min-w-0`, `items-center` and the `mt-1 flex items-center justify-between gap-3` footer row are all
phase 2's and are reproduced above unchanged.


---

**File:** `components/admin/CharacterPanel.tsx`

**Change:** a `setEnabled` helper, a per-key `unsaved` that unions the two paths, the toggle wired
into both slider walks and the relationship fieldset, one line of copy, and `enabled` in the save
payload. **Nothing about the draft/revision model, the ONE SAVE rule or `useTransition` changes.**

**Code — the import block (`:20-28`), one addition:**

```tsx
import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_TUNING_RELATIONSHIP_KEY,
  NINA_WARDROBE_MAX,
} from '@/lib/nina/tuning'
```

**Code — after `setDial` (`:129-131`), three new helpers:**

```tsx
  function setDial(key: string, value: number) {
    setDraft((current) => ({ ...current, dials: { ...current.dials, [key]: value } }))
  }

  /**
   * R4's toggle, into the same local draft as every other control. Nothing writes on change; the
   * one Save button still sends the whole tuning (plan invariant 11).
   */
  function setEnabled(key: string, next: boolean) {
    setDraft((current) => ({ ...current, enabled: { ...current.enabled, [key]: next } }))
  }

  /** Absent means ON, everywhere in this feature. One reader for that rule in this file. */
  function isOn(key: string): boolean {
    return draft.enabled[key] ?? true
  }

  /**
   * One control's "unsaved" dot covers BOTH of its paths — the score and the toggle. Two dots on
   * one row would be an operator wondering which of two identical marks meant what, and the answer
   * to "is this row what the database holds" is one boolean.
   */
  function rowUnsaved(path: string, key: string): boolean {
    return unsaved.has(path) || unsaved.has(`enabled.${key}`)
  }
```

**Code — the summary's right-hand column (`:150-158`), replaced:**

```tsx
        <span className="text-right text-[12px] font-medium text-ink-3">
          {relationshipCopy(draft.relationship).label} &middot;{' '}
          {loud.length === 0
            ? 'every dial at its default'
            : loud
                .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                .join(', ')}
          {off > 0 && ` · ${off} off`} &middot; revision {revision}
        </span>
```

with, beside `const loud = loudestDials(draft, defaults)` at `:123`:

```tsx
  const loud = loudestDials(draft, defaults)
  /* How many parameters are excluded from her prompt entirely (R4). It goes on the closed summary
   * because it is the one setting that cannot be inferred from the numbers underneath it. */
  const off = Object.values(draft.enabled).filter((value) => value === false).length
```

**Code — the intro paragraph (`:162-168`), one sentence appended:**

```tsx
        <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every dial below goes into her system prompt.{' '}
          <strong>There is no cache on her turn path</strong>, so a saved row is in her next message
          with no invalidation step, no distillation pass and no deploy. The defaults reproduce the
          Nina who shipped, character for character — a dial you never touch changes nothing about
          her.{' '}
          <strong>Clear a checkbox and that parameter leaves the prompt entirely</strong>, whatever
          it is parked at — the number stays here for when you want it back.
        </p>
```

**Code — the relationship fieldset legend (`:170-176`), replaced:**

```tsx
        <fieldset className="mb-6">
          <legend className="mb-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
            <label className="inline-flex cursor-pointer items-center gap-2 align-middle">
              <input
                type="checkbox"
                checked={isOn(NINA_TUNING_RELATIONSHIP_KEY)}
                disabled={pending}
                aria-label="Include the relationship in her prompt"
                onChange={(event) =>
                  setEnabled(NINA_TUNING_RELATIONSHIP_KEY, event.target.checked)
                }
                className="size-4 shrink-0 accent-accent disabled:opacity-50"
              />
              <span>Relationship</span>
            </label>
            {rowUnsaved('relationship', NINA_TUNING_RELATIONSHIP_KEY) && (
              <span className="ml-2 font-semibold text-accent">unsaved</span>
            )}
            {!isOn(NINA_TUNING_RELATIONSHIP_KEY) && (
              <span className="ml-2 font-medium text-ink-3">
                off — she is the best friend who shipped
              </span>
            )}
          </legend>
```

**Code — the traits walk (`:218-236`), replaced:**

```tsx
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
                  unsaved={rowUnsaved(`traits.${key}`, key)}
                  enabled={isOn(key)}
                  onEnabledChange={(next) => setEnabled(key, next)}
                  onChange={(value) => setTrait(key, value)}
                />
              )
            })}
          </div>
```

**Code — the dials walk (`:244-262`), replaced:**

```tsx
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
                  unsaved={rowUnsaved(`dials.${key}`, key)}
                  enabled={isOn(key)}
                  onEnabledChange={(next) => setEnabled(key, next)}
                  onChange={(value) => setDial(key, value)}
                />
              )
            })}
          </div>
```

**Code — the Save button's payload (`:336-347`), one line added:**

```tsx
            onClick={() =>
              run(() =>
                saveNinaTuningAction({
                  userId,
                  traits: draft.traits,
                  dials: draft.dials,
                  enabled: draft.enabled,
                  relationship: draft.relationship,
                  wardrobe: draft.wardrobe,
                  notes: draft.notes,
                }),
              )
            }
```

**Code — the panel docstring, one new section after `── ONE SAVE ──` (`:53-56`):**

```tsx
 * ── THE TOGGLES ARE PART OF THE SAME ONE SAVE (R4) ──────────────────────────────────────────
 * *"we need an on/off toggle for each parameter, so we can exclude some parameters to make prompt
 * more accurate."* Each checkbox edits `draft.enabled[key]` and nothing else; the same button sends
 * the whole map with the scores. Seventeen toggles as seventeen actions is the same stall sixteen
 * dials would have been, and for the same reason: Next dispatches Server Actions one at a time per
 * client.
 *
 * The score is NOT reset when a parameter is switched off, and that is the feature: the operator
 * parks `flirty` at 80, excludes it from tonight's prompt, and gets the 80 back with one click. A
 * toggle that cleared the number would just be a slower way of dragging it to the default.
```

**Impact:** the `<details>`, the `revision`-keyed draft reset adjusted during render, the
`useTransition` + result-object convention and the single Save are all unchanged.

---

### Step 12: Tests

**File:** `tests/nina.tuning.test.ts`

Add `NINA_ENABLED_DEFAULTS`, `NINA_TUNING_KEYS`, `coerceNinaEnabled`, `isNinaKeyEnabled`,
`isNinaTuningKey`, `ninaActiveRelationship`, `ninaDialScore`, `ninaTraitScore` to the import block.
Update the round-trip case, then append the new suite.

**Code — the round-trip case (`:283-297`), replaced:**

```ts
  it('round-trips a real tuning unchanged', () => {
    const traits = {} as Record<NinaTrait, number>
    for (const key of NINA_TRAITS) traits[key] = 73
    const dials = {} as Record<NinaDial, number>
    for (const key of NINA_DIALS) dials[key] = 11
    /* Every key present and one of them off, so the round trip covers both booleans rather than
     * only the one `coerceNinaEnabled` defaults to. */
    const enabled = {} as Record<NinaTuningKey, boolean>
    for (const key of NINA_TUNING_KEYS) enabled[key] = key !== 'flirty'
    const input = {
      traits,
      dials,
      enabled,
      relationship: 'girlfriend' as const,
      wardrobe: 'a black cropped tank and shorts',
      notes: 'call him yang more often',
      revision: 4,
    }
    expect(coerceNinaTuning(input)).toEqual(input)
  })
```

(and add `type NinaTuningKey` to the type imports.)

**Code — a new suite, after `NINA_TUNING_DEFAULTS is the Nina who ships today`:**

```ts
describe('the per-parameter enable map (R4)', () => {
  it('covers the relationship, every trait and every dial, and is DERIVED from those arrays', () => {
    /* Derived and not hand-listed: a seventeenth key must inherit the toggle for free, which is the
     * property that makes the next phase's `horny` a one-line addition to `NINA_TRAITS`. Note the
     * array it joins: `horny` is a TRAIT (index decision D6), so it arrives through
     * `...NINA_TRAITS` and every loop in this phase picks it up without an edit. */
    expect(NINA_TUNING_KEYS).toEqual(['relationship', ...NINA_TRAITS, ...NINA_DIALS])
    expect(NINA_TUNING_KEYS).toHaveLength(1 + NINA_TRAITS.length + NINA_DIALS.length)
    expect(new Set(NINA_TUNING_KEYS).size).toBe(NINA_TUNING_KEYS.length)
  })

  it('isNinaTuningKey admits every key and nothing else', () => {
    for (const key of NINA_TUNING_KEYS) expect(isNinaTuningKey(key), key).toBe(true)
    expect(isNinaTuningKey('wardrobe')).toBe(false)
    expect(isNinaTuningKey('notes')).toBe(false)
    expect(isNinaTuningKey('')).toBe(false)
    expect(isNinaTuningKey('__proto__')).toBe(false)
  })

  it('defaults to ALL TRUE, which is what holds the byte-identity invariant', () => {
    for (const key of NINA_TUNING_KEYS) {
      expect(NINA_ENABLED_DEFAULTS[key], key).toBe(true)
      expect(NINA_TUNING_DEFAULTS.enabled[key], key).toBe(true)
    }
    expect(Object.isFrozen(NINA_ENABLED_DEFAULTS)).toBe(true)
    expect(Object.isFrozen(NINA_TUNING_DEFAULTS.enabled)).toBe(true)
  })

  it('reads a missing map as all-on, which IS the migration backfill', () => {
    /* A row written before the `*_enabled` columns existed hands sixteen nulls to `tuningFromRow`.
     * If that read as "off" the deploy would silently mute her personality, so the rule is: ONLY an
     * explicit `false` disables. There is no data migration behind this — this function is it. */
    for (const absent of [undefined, null, {}, 'nope', 42, [], Object.create(null)]) {
      const map = coerceNinaEnabled(absent)
      for (const key of NINA_TUNING_KEYS) expect(map[key], `${String(absent)}/${key}`).toBe(true)
    }
    const nulls = Object.fromEntries(NINA_TUNING_KEYS.map((key) => [key, null]))
    for (const key of NINA_TUNING_KEYS) expect(coerceNinaEnabled(nulls)[key], key).toBe(true)
  })

  it('disables exactly and only the keys explicitly set to false', () => {
    const map = coerceNinaEnabled({ flirty: false, verbosity: false, relationship: false })
    expect(map.flirty).toBe(false)
    expect(map.verbosity).toBe(false)
    expect(map.relationship).toBe(false)
    for (const key of NINA_TUNING_KEYS) {
      if (key === 'flirty' || key === 'verbosity' || key === 'relationship') continue
      expect(map[key], key).toBe(true)
    }
    /* Truthy-but-not-true is still on. Only the boolean `false` is a switch. */
    expect(coerceNinaEnabled({ flirty: 0 }).flirty).toBe(true)
    expect(coerceNinaEnabled({ flirty: 'false' }).flirty).toBe(true)
  })

  it('is carried through coerceNinaTuning as a fresh, unfrozen record', () => {
    const coerced = coerceNinaTuning({ enabled: { steamy: false } })
    expect(coerced.enabled.steamy).toBe(false)
    expect(coerced.enabled.funny).toBe(true)
    expect(Object.isFrozen(coerced.enabled)).toBe(false)
    expect(coerced.enabled).not.toBe(NINA_ENABLED_DEFAULTS)
  })

  it('makes a disabled key read as the value the operator never moved', () => {
    /* THE contract, in three lines. The stored score is untouched — that is the point of a toggle
     * rather than dragging the slider back — and the PROMPT side reads the key's own default, which
     * is by definition the value that reproduces the text that ships. */
    const parked = coerceNinaTuning({
      traits: { flirty: 100, concerned: 100 },
      dials: { verbosity: 100 },
      relationship: 'girlfriend',
      enabled: { flirty: false, verbosity: false, relationship: false },
    })

    expect(parked.traits.flirty, 'the parked number must survive').toBe(100)
    expect(ninaTraitScore(parked, 'flirty')).toBe(NINA_TRAIT_SPECS.flirty.defaultScore)
    expect(ninaDialScore(parked, 'verbosity')).toBe(NINA_DIAL_SPECS.verbosity.defaultScore)
    expect(ninaActiveRelationship(parked)).toBe(NINA_DEFAULT_RELATIONSHIP)

    /* And an ENABLED key is a pass-through, or the toggle would be a second dial. */
    expect(ninaTraitScore(parked, 'concerned')).toBe(100)
    expect(isNinaKeyEnabled(parked, 'concerned')).toBe(true)
    expect(isNinaKeyEnabled(parked, 'flirty')).toBe(false)
  })

  it('never throws on a tuning that has no enable map at all', () => {
    /* A fixture, a `psql` round trip or an `as NinaTuning` cast can produce one, and the consumer
     * is a model call in the middle of a conversation. */
    const bare = { ...NINA_TUNING_DEFAULTS, enabled: undefined } as unknown as NinaTuning
    expect(() => ninaTraitScore(bare, 'flirty')).not.toThrow()
    expect(isNinaKeyEnabled(bare, 'flirty')).toBe(true)
    expect(ninaActiveRelationship(bare)).toBe(NINA_TUNING_DEFAULTS.relationship)
  })
})
```

(`NINA_DEFAULT_RELATIONSHIP` and `type NinaTuning` join the imports.)

---

**File:** `tests/nina.prompts.test.ts` — the R4 gate. Add `NINA_TUNING_KEYS`,
`type NinaTuningKey` and `readFileSync` / `fileURLToPath` to the imports, and append:

```ts
/**
 * ── R4, THE GATE ─────────────────────────────────────────────────────────────────────────────
 * *"we need an on/off toggle for each parameter, so we can exclude some parameters to make prompt
 * more accurate for what we would like nina to do."*
 *
 * The stated purpose is a SHORTER prompt, so the contract is ZERO BYTES and not "a neutral
 * paragraph": a parameter that is off renders **the prompt that ships**, whatever it is parked at.
 *
 * The suite walks `NINA_TUNING_KEYS`, which is `[relationship, ...NINA_TRAITS, ...NINA_DIALS]`, so
 * a key added to EITHER array in a later phase is covered here the moment it exists — including one
 * whose band text nobody has read yet. Phase 5's `horny` is a TRAIT and arrives through
 * `...NINA_TRAITS`; `parkedOn` below routes it by membership rather than by array, so neither this
 * comment nor that function needs to know which array it landed in.
 */
describe('buildNinaSystemPrompt — a disabled parameter contributes zero bytes (R4)', () => {
  /**
   * The same tuning with one key turned all the way up, rendered twice: once with every toggle ON
   * (the counter-check — a key wired to nothing must not pass this suite by being inert) and once
   * with that one key OFF.
   *
   * Two functions rather than a destructure-and-discard: `tests/admin.tuning.test.ts` records why
   * (*"the `{ [k]: _dropped, ...rest }` idiom leaves an unused binding, and a new lint warning is
   * noise the next phase has to read"*).
   */
  function parkedOn(key: NinaTuningKey): NinaTuning {
    if (key === 'relationship') return tuned({ relationship: 'girlfriend' })
    return key in NINA_TUNING_DEFAULTS.traits
      ? withTrait(key as NinaTrait, 100)
      : withDial(key as NinaDial, 100)
  }

  function parkedOff(key: NinaTuningKey): NinaTuning {
    return {
      ...parkedOn(key),
      enabled: { ...NINA_TUNING_DEFAULTS.enabled, [key]: false },
    }
  }

  it('renders the SHIPPING prompt for every parameter, parked at its loudest and switched off', () => {
    for (const key of NINA_TUNING_KEYS) {
      expect(buildNinaSystemPrompt(parkedOn(key)), `${key} at 100 changes nothing`).not.toBe(
        DEFAULT_RENDER,
      )
      expect(buildNinaSystemPrompt(parkedOff(key)), `${key} is off and still speaks`).toBe(
        DEFAULT_RENDER,
      )
    }
  })

  it('leaves every OTHER parameter speaking when one is switched off', () => {
    /* The failure this catches is a gate that reads the wrong key, or one boolean gating the lot. */
    const loud = tuned({
      traits: { ...NINA_TUNING_DEFAULTS.traits, flirty: 100, funny: 100 },
      enabled: { ...NINA_TUNING_DEFAULTS.enabled, flirty: false },
    })
    const render = buildNinaSystemPrompt(loud)
    expect(render).not.toContain('FLIRTY MAX')
    expect(render).toContain('FUNNY MAX')
    /* `flirty` is one of `BODY_REPEALED_BY`, so its repeal must not fire from a disabled key. */
    expect(render).toContain('Never comment on his body')
  })

  it('shortens rather than neutralises — the render gets SMALLER, never longer', () => {
    /* D3, as arithmetic. "Renders its identity band" would have produced a prompt at least as long
     * as the tuned one; R4 asked for a shorter one. */
    for (const key of NINA_TUNING_KEYS) {
      const off = buildNinaSystemPrompt(parkedOff(key))
      expect(off.length, key).toBeLessThanOrEqual(buildNinaSystemPrompt(parkedOn(key)).length)
      expect(off.length, key).toBe(DEFAULT_RENDER.length)
    }
  })

  it('switches off a parameter WITHOUT losing the number it is parked at', () => {
    const parked = coerceNinaTuning({
      traits: { flirty: 80 },
      enabled: { flirty: false },
    })
    expect(parked.traits.flirty).toBe(80)
    expect(buildNinaSystemPrompt(parked)).toBe(DEFAULT_RENDER)
    /* And back on, with no second edit: the same row, one boolean flipped. */
    expect(
      buildNinaSystemPrompt({ ...parked, enabled: { ...parked.enabled, flirty: true } }),
    ).not.toBe(DEFAULT_RENDER)
  })

  it('turns the relationship off to best_friend, which is the level that ships', () => {
    for (const relationship of NINA_RELATIONSHIPS) {
      const off = tuned({
        relationship,
        enabled: { ...NINA_TUNING_DEFAULTS.enabled, relationship: false },
      })
      expect(buildNinaSystemPrompt(off), relationship).toBe(DEFAULT_RENDER)
    }
  })
})

/**
 * ── R4, THE STRUCTURAL HALF ──────────────────────────────────────────────────────────────────
 * The gate is a substitution at the score seam (`ninaTraitScore` / `ninaDialScore` /
 * `ninaActiveRelationship` in `lib/nina/tuning.ts`). A file on the prompt side that reads
 * `tuning.traits.x` directly bypasses it, and the result is a toggle that silently does nothing —
 * invisible in a diff, invisible in review, and only findable by an operator wondering why the
 * checkbox did not take. So the property is checked by reading the source, the way
 * `tests/nina.tuning.test.ts` checks phase 1's zero-import rule.
 *
 * `lib/nina/queries.ts` is deliberately NOT in this list: it is the STORE, and it must write the
 * value the operator parked rather than the value the prompt uses.
 */
describe('the prompt side never reads a tuning value past the gate (R4)', () => {
  const GATED = [
    '../lib/nina/persona.ts',
    '../lib/nina/prompts/system.ts',
    '../lib/nina/proactive.ts',
  ]

  it('names no raw tuning field in any file that renders text', () => {
    for (const relative of GATED) {
      const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
      /* Comments stripped, so a docstring may quote the forbidden spelling to explain the rule —
       * the same accommodation `tests/nina.tuning.test.ts` makes for `server-only`. */
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      for (const forbidden of ['tuning.traits', 'tuning.dials', 'tuning.relationship']) {
        expect(code, `${relative} reads ${forbidden} past the R4 gate`).not.toContain(forbidden)
      }
    }
  })
})
```

**File:** `tests/admin.tuning.test.ts`

Add `NINA_TUNING_KEYS` to the imports. The `payload()` helper already spreads `DEFAULTS`, which now
carries `enabled`, so every existing Zod case keeps passing. Append:

```ts
describe('the enable map crosses the boundary (R4)', () => {
  it('is carried by the draft, copied rather than aliased', () => {
    for (const key of NINA_TUNING_KEYS) expect(DEFAULTS.enabled[key], key).toBe(true)
    const draft = toTuningDraft(NINA_TUNING_DEFAULTS)
    draft.enabled[NINA_TRAITS[0]] = false
    expect(NINA_TUNING_DEFAULTS.enabled[NINA_TRAITS[0]]).toBe(true)
  })

  it('names a flipped toggle by its own dotted path, after the scalar fields', () => {
    const key = NINA_TRAITS[0]
    const off: TuningDraft = { ...DEFAULTS, enabled: { ...DEFAULTS.enabled, [key]: false } }
    expect(changedTuningFields(off, DEFAULTS)).toEqual([`enabled.${key}`])
    expect(tuningDraftEquals(off, DEFAULTS)).toBe(false)
  })

  it('treats an absent key as ON on both sides, so it is not a spurious difference', () => {
    const bare: TuningDraft = { ...DEFAULTS, enabled: {} }
    expect(changedTuningFields(bare, DEFAULTS)).toEqual([])
  })

  it('never prints a disabled dial on the hub card, whatever it is parked at', () => {
    /* A disabled dial contributes zero bytes, so calling it "the loudest" would be the card
     * describing text that is not in the prompt. */
    const key = NINA_TRAITS.find((trait) => DEFAULTS.traits[trait] === NINA_SCORE_MIN)
    expect(key).toBeDefined()
    if (key === undefined) return
    const parked: TuningDraft = { ...DEFAULTS, traits: { ...DEFAULTS.traits, [key]: 90 } }
    expect(loudestDials(parked, DEFAULTS).map((dial) => dial.key)).toEqual([key])
    const off: TuningDraft = { ...parked, enabled: { ...parked.enabled, [key]: false } }
    expect(loudestDials(off, DEFAULTS)).toEqual([])
  })

  it('refuses a payload with a missing, unknown or non-boolean toggle', () => {
    const short = { ...DEFAULTS.enabled }
    delete short[NINA_TRAITS[0]]
    expect(ninaTuningWriteSchema.safeParse(payload({ enabled: short })).success).toBe(false)

    const extra = { ...DEFAULTS.enabled, flirtyy: true }
    expect(ninaTuningWriteSchema.safeParse(payload({ enabled: extra })).success).toBe(false)

    const stringly = { ...DEFAULTS.enabled, [NINA_TRAITS[0]]: 'false' }
    expect(ninaTuningWriteSchema.safeParse(payload({ enabled: stringly })).success).toBe(false)
  })

  it('accepts a payload with parameters switched off', () => {
    const some = { ...DEFAULTS.enabled, flirty: false, relationship: false }
    expect(ninaTuningWriteSchema.safeParse(payload({ enabled: some })).success).toBe(true)
  })
})
```

Also extend the existing structural case *"sends one action for the whole tuning"* region if it
enumerates payload fields — add `enabled` there; and extend the panel source assertion, if any,
with `setEnabled(`.

**File:** `tests/db.schema.nina.test.ts`

**Change — the column-list case (`:360-388`), replaced:**

```ts
  it('spells exactly the thirty-six columns phases 3, 4, 5 and R4 were written against', () => {
    expect(names(schema.ninaTuning)).toEqual(
      [
        'user_id',
        'relationship',
        // R1 — the eleven traits, in the order the user wrote them.
        'anger',
        'chill',
        'sad',
        'flirty',
        'steamy',
        'wise',
        'annoying',
        'funny',
        'happy',
        'anxious',
        'concerned',
        // R3 — the four dials that each name a line of shipping code.
        'profanity',
        'clinginess',
        'photo_eagerness',
        'verbosity',
        'wardrobe',
        'notes',
        // R4 — one enable flag per parameter, in the same order.
        'relationship_enabled',
        'anger_enabled',
        'chill_enabled',
        'sad_enabled',
        'flirty_enabled',
        'steamy_enabled',
        'wise_enabled',
        'annoying_enabled',
        'funny_enabled',
        'happy_enabled',
        'anxious_enabled',
        'concerned_enabled',
        'profanity_enabled',
        'clinginess_enabled',
        'photo_eagerness_enabled',
        'verbosity_enabled',
        'revision',
        'updated_at',
      ].sort(),
    )
  })
```

**Change — append two cases inside the same `describe('nina_tuning')`:**

```ts
  it('gives every parameter an enable column, derived from NINA_TUNING_KEYS (R4)', () => {
    const declared = new Set(names(schema.ninaTuning))
    for (const key of NINA_TUNING_KEYS) {
      expect(declared.has(`${snake(key)}_enabled`), key).toBe(true)
      expect(sqlType(schema.ninaTuning, `${snake(key)}_enabled`), key).toBe('boolean')
    }
    /* RECONCILED — DERIVED, never the literal 16. This assertion read `toHaveLength(16)` in the
     * draft, and phase 5 adds `horny` to `NINA_TRAITS`, which makes it 17 and turns a passing test
     * into a phase-5 failure that says nothing about phase 5's bug. The point of the case is that
     * the array is the spread and has no duplicates, and that is what it now says. */
    expect(NINA_TUNING_KEYS).toEqual(['relationship', ...NINA_TRAITS, ...NINA_DIALS])
    expect(new Set(NINA_TUNING_KEYS).size).toBe(NINA_TUNING_KEYS.length)
  })

  it('leaves every enable column NULLABLE with no default, which IS the backfill (R4)', () => {
    /* The `nina_turns.tuning_revision` idiom: NULL means one thing only — a row written before the
     * toggles existed. `coerceNinaEnabled` reads anything that is not literally `false` as ON, so
     * an existing production row is all-enabled the moment the migration lands, with no UPDATE
     * behind it. A `DEFAULT true` would be `NINA_ENABLED_DEFAULTS` restated in SQL, which this
     * table's own header forbids. */
    for (const key of NINA_TUNING_KEYS) {
      const column = columns(schema.ninaTuning).get(`${snake(key)}_enabled`)
      expect(column?.notNull, key).toBe(false)
      expect(column?.hasDefault, key).toBe(false)
    }
  })

  it('maps every enable column in BOTH directions, which drizzle cannot check for a nullable one', () => {
    /* A nullable column is optional in `NewNinaTuningRow`, so a key forgotten in `tuningToColumns`
     * is not a compile error — it is a toggle that never persists. This is the guard for that, and
     * it is what makes the next dial's toggle land with its row mapping or not at all. */
    const source = readFileSync('lib/nina/queries.ts', 'utf8')
    for (const key of NINA_TUNING_KEYS) {
      expect(source, `${key} is not read out of the row`).toContain(
        `${key}Enabled: row.${key}Enabled`,
      )
      expect(source, `${key} is not written to the row`).toContain(
        `${key}Enabled: tuning.enabled.${key}`,
      )
    }
  })
```

(`NINA_TUNING_KEYS` and `readFileSync` join that file's imports; `snake` already exists there and
`snake('photoEagerness') === 'photo_eagerness'`, so `photo_eagerness_enabled` is what it produces.)

**Change — the "carries NO SQL DEFAULT" case (`:410-425`):** leave its hand list exactly as it is.
It asserts `notNull === true` for the score columns and the enable columns are deliberately not in
it; the case above covers them with the opposite assertion.

**Impact:** the schema tests document why the enable columns break the table's own "no nulls"
convention, rather than quietly breaking it.

---

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck`
**Lint:** `npm run lint`
**Tests:** `npm run test`
**Migration:** `npm run db:generate` (once, in Step 6), then `npm run db:check`, then
`npm run db:migrate`

**Order that catches the most, soonest:**

```bash
cd /home/miftah/.worktrees/run-insights/admin-responsive-nina-intimacy
npm run typecheck                       # the NinaTuningWrite change enumerates every writer
npm run db:generate && npm run db:check # ONE generated migration, never renamed
npm run test -- tests/nina.prompts.test.ts   # the R4 gate + byte identity
npm run test && npm run lint
```

**NEVER pass `-u` / `--update` to vitest, in this phase or anywhere in this set.** Phase 3 committed
`tests/__snapshots__/nina.prompts.test.ts.snap`, pinning the four non-girlfriend renders as a
set-wide invariant-1 gate. At `enabled` all-true those four renders are unchanged **by
construction**, so if that snapshot goes red in this phase the gate has a bug — most likely a
`traitBand` / `dialBand` reader that now routes through `ninaTraitScore` and returns the wrong
score for a key at its default. Regenerating the fixture hides precisely the failure it exists to
catch. Read the diff; do not update the file.

**Manual check on a phone, one line.** Phase 2 landed the 44 px rule across
`components/admin/`, and this phase adds one new interactive control to it. At 414 px in Safari,
the new checkbox must be as easy to hit as the slider beside it — that is what `TOUCH_ICON` in
Step 11 buys. While `CharacterPanel.tsx` is open (phase 2 read it but did not edit it, and it is
this phase's file), import `TOUCH_TARGET` from `components/admin/touch.ts` for anything found under
44 px in it — its `<details>` summary and its Save / Reset buttons were never audited.

**Manual check** (`npm run dev`, `/admin/nina`, open *Her character*):

1. Drag `flirty` to 90, Save. Open *The assembled system prompt* — `FLIRTY MAX` is in it.
2. Clear `flirty`'s checkbox, Save. The paragraph is gone, the slider still reads 90, the label is
   struck through and the readout says `90 off`, and the closed summary says `1 off`. The prompt is
   the one it was before step 1.
3. Tick it again, Save — `FLIRTY MAX` is back with no re-dragging.
4. Clear the **Relationship** checkbox with `girlfriend` selected, Save. The legend says
   `off — she is the best friend who shipped`, and the opening block is `best_friend`'s two
   sentences again.
5. *Reset to defaults* turns every checkbox back on.

**Exit criteria:**

- Every trait, every dial and the relationship has a working checkbox in `/admin/nina`, saved by
  the same one button as the sliders.
- For every key in `NINA_TUNING_KEYS`: parked at 100 (or `girlfriend`) with the toggle off,
  `buildNinaSystemPrompt` returns a string **identical** to `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)`.
- `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS) === NINA_SYSTEM_PROMPT`, unchanged from
  `origin/main` @ `02dc79a` (`tests/nina.prompts.test.ts` is the gate, and it never had to be
  edited to keep passing).
- A `nina_tuning` row written before this migration reads as all-enabled — verified by
  `coerceNinaEnabled`'s null/absent cases, and by the columns being NULLABLE so no backfill exists
  to be wrong.
- `tests/__snapshots__/nina.prompts.test.ts.snap` passes **unmodified** — `git status` shows it
  untouched at the end of the phase.
- `npm run test && npm run typecheck && npm run lint` green; `npm run db:check` clean.

---

## Handoffs

- **Phase 5 (`horny`)** — `horny` is a **TRAIT**, not a dial (index decision D6, taken after this
  plan was drafted). It inherits the toggle with no work beyond adding the key to `NINA_TRAITS`
  and `NINA_TRAIT_SPECS`, plus **two mechanical additions this phase cannot make**: the
  `horny_enabled` column beside `horny` in `lib/db/schema.ts` (both generated into phase 5's own
  migration by the same `drizzle-kit generate` run), and the `hornyEnabled` pair in
  `tuningFromRow` / `tuningToColumns`. `tests/db.schema.nina.test.ts`'s three R4 cases walk
  `NINA_TUNING_KEYS` and will fail until both land. **Phase 5 must read `horny` through
  `ninaTraitScore(tuning, 'horny')`** — never `tuning.traits.horny` — everywhere it reads it: in
  `lib/nina/persona.ts` (the band table and the verbosity floor) and in
  `lib/nina/prompts/system.ts` (the bubble coupling and the proactive clause). The structural guard
  in `tests/nina.prompts.test.ts` enforces it. Nothing else about R3 belongs to this phase.
- **Phase 2 (`DialSlider` sizing) — RESOLVED, not a handoff any more.** The draft's checkbox was
  `size-4` with no 44 px touch target and this note flagged it for the reconciler. Fixed in Step 11:
  the checkbox is wrapped in `TOUCH_ICON` from `components/admin/touch.ts`, which is the module
  phase 2 creates for exactly this, and Step 11's code block now quotes the whole file as phase 2
  leaves it rather than as `origin/main` has it.
- **A toggle for `wardrobe` / `notes`** — deliberately not built, and the reasoning is recorded in
  `tuning.ts` §5 rather than left implicit. If the user later asks for one, it is a key added to
  `NINA_TUNING_KEYS` and two columns; nothing else changes.
- **`nina_turns` does not record which parameters were off.** `tuning_revision` already dates a
  voice change to a setting, and the row it points at holds the flags, so a second record would be
  a second source of truth. Noted rather than built.
- **`/admin`'s hub card** now hides a disabled dial (`loudestDials`). It does not yet say *how
  many* are off — the character panel's own summary does. Left as is; adding a second count to the
  hub card is copy work with no requirement behind it.

---

## Rollback

Code: this phase is one commit on `feature/admin-responsive-nina-intimacy`; `git revert` it. The
revert is safe with the columns still in the database — they are nullable, nothing reads them once
`tuningFromRow` is reverted, and `writeNinaTuning` stops supplying them.

Schema: to remove the columns as well, run `npx drizzle-kit generate` again **after** the revert and
apply the new `0007_*` migration it produces, which drops them. Never hand-edit or delete
`0006_*.sql` — a migration file removed or renamed after it has been applied leaves the journal and
the database disagreeing, which is the failure plan invariant 8 exists to prevent.

Behavioural: `resetNinaTuningAction` turns every parameter back on and bumps the revision, so an
operator can undo a bad set of toggles without touching the code at all.
