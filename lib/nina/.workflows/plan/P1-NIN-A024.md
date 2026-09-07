> Adopted from `NINA_IMAGE_GENERATION_TAB_PLAN.md` phase 2. Source: `.workflows/plan/nina-image-generation-tab/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 2: The prompt — body canon, length ladder, focus, venue, time, notes

**Plan set:** `NINA_IMAGE_GENERATION_TAB_PLAN.md`
**Analysis:** `20260907-124015-IMGN_code_analyzer.md`
**Satisfies:** R1 (the body canon, unconditionally), R4, R5, R6, R7, R8, R9 — the **prompt half** of each. The storage half is phase 1's and the UI half is phase 4's.
**Depends on:** Phase 1
**Difficulty:** HARD
**Package:** `lib/nina`

> ### ⚠ THE BASE MOVED AFTER THIS PLAN WAS WRITTEN — READ THIS FIRST
>
> This plan was written against `b0e492a`, which was local `main` and **30 commits behind
> `origin/main`**. `origin/main` has since been merged into the branch and the worktree is now at
> **`4a7588e`**. That is the tree this plan must be applied to.
>
> Two feature sets landed in that merge and both changed facts this plan set depends on:
> **`nina-photo-caption-from-image`** (migration `0009_nina_message_photo_only.sql` — `nina_messages.photo_only`)
> and **`nina-photo-refs-and-bubble-actions`** (migration `0010_nina_image_provenance.sql` —
> `nina_message_images.source_avatar_id` / `source_image_id`).
>
> **Consequences for every plan in this set:**
>
> 1. **The migration watermark is `0010`**, not `0008`. The journal has eleven entries (`idx` 0-10).
>    Phase 1 generates **`0011`**; phase 7 generates **`0012`**. No other phase generates one.
> 2. **Hand-written backfill SQL is appended AFTER `npm run db:generate`, and regeneration silently
>    drops it.** Both landed migrations say so in banner comments. Never hand-name, never rename, and
>    if a migration is ever regenerated, diff the old file against the new one and re-append before
>    deleting anything.
> 3. **A row in `nina_message_images` is a *reference* when `source_avatar_id` OR `source_image_id`
>    is non-null** — see plan invariant 13. The three collection reads already exclude them through
>    `isOriginalPhoto()` (`lib/nina/queries.ts:1616-1618`).
> 4. **`lib/nina/prompts/` now exists** (`caption.ts`, `describe.ts`, `distill.ts`, `index.ts`,
>    `system.ts`, `tools.ts`) and `lib/nina/persona.ts` gained the Instructor character
>    (`isInstructor` :730, `INSTRUCTOR_COACHING` :813, `ninaInstructorCoachingBlock` :839).
>    **Image-prompt assembly did NOT move** — `buildNinaImagePrompt` and `sidecarText` are still in
>    `lib/nina/imagegen.ts`, and `ninaAppearance` / `NINA_FACE` / `NINA_APPEARANCE` are still in
>    `persona.ts`. Nothing under `lib/nina/prompts/` imports any of them.
> 5. **`scripts/check-llm-payload-boundary.mjs` now guards NINE symbols, not eight** — the ninth is
>    `captionNinaPhoto`, sanctioned in `lib/nina/caption.ts`, `lib/admin/chatPhotoActions.ts` and
>    `lib/nina/imagerun.ts`. Three of the nine are image symbols (`runNinaImageJob`,
>    `describeNinaImage`, `captionNinaPhoto`). The guard is a name allowlist over `app/`, `lib/`,
>    `components/`; `buildNinaImagePrompt` is not in it, so a pure preview in a render still passes
>    (plan invariant 5 re-verified against the guard as it now stands).
> 6. **EVERY `file:line` CITATION BELOW IS ADVISORY.** Line numbers shifted in `persona.ts` (+~13 to
>    +139), `queries.ts` (+~130), `tuning.ts` (+~22), `schema.ts` (+~64), `CharacterPanel.tsx` (+13),
>    `app/admin/layout.tsx` (+31) and `imagegen.ts` (-7). The reconciler corrected the load-bearing
>    ones in place; **grep for the symbol before editing, never `sed -n` a line range.**

---

## Goal

After this phase, every string `buildNinaImagePrompt` can return names all four body facts the user
asked for — `big boobs`, `bubble butt`, `big thighs`, `very long calves` — for every combination of
every preference, on both the selfie and the avatar path, and with no prefs at all. The subject
paragraph leads with her body and the face follows it. The operator's stored prompt-length slider
selects one of five assembly rungs that differ materially in how much canon prose is spent; the six
focus keys add emphasis clauses **on top of** the canon rather than deciding what is in it; and the
wardrobe, venue, time and notes she typed reach the camera as `VENUE:`, `TIME:` and `NOTES:` blocks
and as a wardrobe paragraph that finally ends its sentence before the next one starts.

The camera stops reading `nina_tuning.wardrobe`. The column and `NinaTuning.wardrobe` still exist
after this phase — phase 7 removes them — but nothing in the image path reads them, and a test
asserts that.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Exact and exhaustive.

**Deletes:**
- the sentence `Lean, visibly muscular runner's build — defined quadriceps and calves, narrow shoulders.` out of `NINA_FACE` (`lib/nina/persona.ts:367`). Its surviving content is relocated into `NINA_BODY_SENTENCES[3]` and `[4]`; `Lean` and `narrow shoulders` are repealed in place with the reason recorded. **This is not a face sentence** — it is the one body clause in a face constant, and the analysis names it as defect 2. `NINA_FACE`'s four actual face sentences all survive verbatim.
- `NINA_APPEARANCE` from `lib/nina/imagegen.ts`'s import list (the constant itself stays exported from `persona.ts`; only this file stops importing it).
- the `tuning == null ? NINA_APPEARANCE : ninaAppearance(tuning)` ternary at `lib/nina/imagegen.ts:142`.
- the test `PLAN INVARIANT 2: the default tuning renders the prompt that shipped, byte for byte` (`tests/nina.imagerecipe.test.ts:112-133`) — **restated, not removed** (see Step 6).
- the `── THE TUNING IS OPTIONAL, AND OPTIONAL IS THE POINT ──` claim in `imagegen.ts`'s `buildNinaImagePrompt` docblock (`:116-126`), which asserts a "provable superset of the Nina who shipped". R1 repeals it. Replaced by an explicit restatement, not left standing.

**Renames:** none.

**Creates:**
- `persona.NINA_BODY_SENTENCES` (`lib/nina/persona.ts`) — `readonly string[]`, five elements, the ladder's rungs of body prose
- `persona.NINA_BODY` (`lib/nina/persona.ts`) — all five joined; the full render
- `persona.NINA_BODY_AVATAR` (`lib/nina/persona.ts`) — the one-sentence, crop-compatible form
- `persona.ninaBodyBlock` (`lib/nina/persona.ts`) — `(sentences: number) => string`, clamped to `[1, 5]`
- `persona.withSentenceStop` (`lib/nina/persona.ts`) — module-private
- `persona.NinaAppearanceDetail` (`lib/nina/persona.ts`) — `{ body: string; face: boolean; outfit: boolean }`
- `persona.NINA_APPEARANCE_FULL_DETAIL` (`lib/nina/persona.ts`)
- `imagegen.NINA_SELFIE_STYLE_SHORT`, `imagegen.NINA_AVATAR_STYLE_SHORT` (`lib/nina/imagegen.ts`)
- `imagegen.NinaPromptRung`, `imagegen.NINA_PROMPT_RUNGS`, `imagegen.ninaPromptRung` (`lib/nina/imagegen.ts`)
- `imagegen.NINA_PROMPT_LENGTH_FALLBACK` (`lib/nina/imagegen.ts`) — `70`
- private in `imagegen.ts`: `NINA_FOCUS_EMPHASIS`, `NINA_AVATAR_FOCUS_KEYS`, `joinTerms`, `ninaFocusBlock`, `ninaFreeTextBlock`

**Signature changes:**
- `persona.ninaAppearance(tuning: NinaTuning) => string` **->** `persona.ninaAppearance(prefs: NinaImagePrefs, detail?: NinaAppearanceDetail) => string`. **Phase 7: this is the signature you were told to wait for.** It is deliberately *nominal* on `NinaImagePrefs` rather than structural on `{ wardrobe: string }` — a structural parameter would keep accepting a `NinaTuning`, and "two wardrobes silently competing" is the one outcome the index's Decisions table says R3 cannot mean. A leftover `ninaAppearance(tuning)` call is therefore a **type error**, which is the point.
- `imagegen.buildNinaImagePrompt(input: { purpose; scene; mood?; tuning? })` **->** `imagegen.buildNinaImagePrompt(input: { purpose; scene; mood?; tuning?; prefs? })`. Every member stays optional except `purpose` and `scene`, so **phase 6's `imagetest.ts` is a third caller with no signature change** and **phase 4's pure preview can call it from a Server Component**.

**Requires (from earlier phases) — Phase 1, `lib/nina/imageprefs.ts` and `lib/nina/queries.ts`:**
This phase imports exactly these five names and nothing else from phase 1. It re-declares none of
them (index invariant: *"import the focus keys and the band mapping, never re-declare them"*).

| Name | Shape this phase compiles against |
|---|---|
| `type NinaImagePrefs` | `{ readonly promptLength: number; readonly focus: Readonly<Record<NinaImageFocusKey, boolean>>; readonly wardrobe: string; readonly venue: string; readonly time: string; readonly notes: string; ... }` — the four free-text members are `string` and never `null`, `''` being the one empty value, exactly as `NinaTuning.wardrobe` is today (`lib/nina/tuning.ts:784`). Extra members (`reference: { source, id }` and `revision`) are ignored here — note it is `reference`, an id plus a set, **not** a `referenceUrl`. |
| `type NinaImageFocusKey` | `'face' \| 'skin' \| 'boobs' \| 'butt' \| 'thighs' \| 'calves'` |
| `NINA_IMAGE_FOCUS_KEYS` | `readonly NinaImageFocusKey[]`, the user's own order: face, skin, boobs, butt, thighs, calves |
| `NINA_IMAGE_PREFS_DEFAULTS` | all six focus booleans `false`; all four free-text members `''` |
| `readNinaImagePrefs(userId: string): Promise<NinaImagePrefs>` in `lib/nina/queries.ts` | returns `NINA_IMAGE_PREFS_DEFAULTS` for a user with no row, exactly as `readNinaTuning` does (`lib/nina/queries.ts:3266-3269`) |

`promptLength` is a 0-100 integer read through `ninaBand` from `./tuning` (index Decisions: *"a 0-100
slider read through the repo's existing five bands"*). **This phase does not depend on
`NINA_IMAGE_PREFS_DEFAULTS.promptLength`'s value** — see Step 3's `NINA_PROMPT_LENGTH_FALLBACK` —
so no test here breaks whatever phase 1 chose.

**RECONCILED — phase 1 chose `50`, and this plan's recommendation of `60` is withdrawn.** Phase 1
owns the defaults and its reason is the stronger one: `NINA_IMAGE_PROMPT_LENGTH_DEFAULT = 50` is the
middle of the slider, which is the middle rung of the ladder, so an operator who never touches the
control gets the neutral rung rather than one this plan happened to prefer. `50` is band `mid`,
index 2, phase 1's rung **`Standard` — "Two sentences of detail. The neutral rung, and the default."**

**The consequence is a requirement on this phase, and it is the substantive half of what the
withdrawn recommendation was reaching for: rung 2 must keep the face and the outfit.** The `60`
recommendation existed because band `high` was assumed to be the lowest rung that does; if that is
in fact rung 3, then the shipping default drops the face, and *"an operator who never opens the tab"*
gets a materially poorer photograph than the one that ships today — for a feature whose entire
origin is *"this long prompt only created a mediocre result"*. So Step 1's
`NINA_APPEARANCE_FULL_DETAIL` and Step 3's rung table must place the face/outfit cut **at or below
rung 2**, and Step 6 asserts it directly:

```ts
it('keeps the face and the outfit at the DEFAULT rung, not only above it', () => {
  /* RECONCILED: phase 1's NINA_IMAGE_PROMPT_LENGTH_DEFAULT is 50 -> band `mid` -> rung 2. An
   * operator who never opens the tab gets this rung, and it must not be a downgrade on today's
   * prompt. Deliberately asserted against the DEFAULT rather than a literal 2, so that a later
   * change to either number fails here instead of silently shortening every first-run prompt. */
  const text = prompt({ prefs: prefsAt(NINA_IMAGE_PROMPT_LENGTH_DEFAULT) })
  expect(text).toContain('ponytail')                    // NINA_FACE survived
  expect(text).toContain('heather-grey racerback tank') // NINA_DEFAULT_OUTFIT survived
  for (const fact of BODY_FACTS) expect(text).toContain(fact) // and R1, unconditionally
})
```

Note this does **not** make rung 0 or 1 illegal — they may legitimately spend fewer generated
sentences, and R1's four body facts survive at every rung (invariant 4). It constrains only where
the face/outfit cut sits relative to the default.

**Phase 1's focus keys are `face`, `skin`, `boobs`, `butt`, `thighs`, `calves`** — short, because
they become the column names `focus_boobs` … . **That is exactly what this phase already assumed**,
so `NINA_FOCUS_EMPHASIS` (Step 3) and the `focusOnly(...)` arguments in three tests (Step 6) need no
edit. The user's own words live in `NINA_IMAGE_FOCUS_SPECS[key].userSaid` (`'big boobs'`,
`'bubble butt'`, …) and this phase may quote them into prompt text but may not rephrase them.
**Reconciler: this was the one name-level coupling between phases 1 and 2, and it agrees.**

**Requires nothing from phases 3, 4, 5, 6, 7.** In particular the reference image is a *payload*
concern: this phase writes no sentence about a reference image into the prompt, and keeps the
existing assertion that the word `reference` never appears (`tests/nina.imagerecipe.test.ts:87-92`,
`imagegen.ts`'s RU-18 header note).

**Leaves alone (owned by others):**
- `lib/nina/tuning.ts` — not one line. `NINA_WARDROBE_MAX`, `coerceNinaWardrobe`, `NinaTuning.wardrobe` and `NINA_TUNING_DEFAULTS.wardrobe` all survive this phase (Phase 7)
- `lib/db/schema.ts`, `drizzle/` (Phases 1, 7)
- `lib/nina/imageprefs.ts`, `lib/nina/queries.ts` (Phase 1)
- `lib/nina/imagerecipe.ts` — payload, `NinaImageJobArgs`, timeouts (Phase 3). `sidecarText`'s `reference: none (RU-18)` line is **not** edited here
- `lib/nina/imagecall.ts`, `scripts/nina-image-worker.ts` (Phase 3)
- `lib/nina/imagetools.ts`, `lib/nina/avatartools.ts`, `lib/nina/promises.ts` — **zero edits, verified below**
- `app/**`, `components/**`, `lib/admin/**` (Phases 4, 5, 6, 7)
- `lib/nina/imagetest.ts` (Phase 6)
- `tests/nina.tuning.test.ts`, `tests/admin.tuning.test.ts`, `tests/db.schema.nina.test.ts` (Phase 7)
- `lib/nina/.workflows/package_readme.md`, `CHANGELOG.md` (Phase 7)

**Shares one file with Phase 7 — `docs/nina/persona.md`.** This phase rewrites the *"What she looks
like"* section (lines 239-255) because `lib/nina/persona.ts:1-5` makes it a rule: *"When they
disagree, the document is the intent and this file is what ships: fix this file, then fix the
document, in one commit."* Phase 7 edits the same section later, for the wardrobe's retirement.
Phase 7 depends on phase 2, so the two edits are sequential and cannot conflict; the reconciler
should confirm phase 7's plan expects the rewritten text rather than today's.

---

## Verified facts (not assumptions)

Read at the worktree HEAD. Each one is load-bearing and each is checked rather than believed.

1. **`persona.ts`'s appearance constants reach the image prompt and nothing else.**
   `lib/nina/prompts/system.ts:1-21` imports twenty names from `../persona` and **none** of them is
   `NINA_FACE`, `NINA_DEFAULT_OUTFIT`, `NINA_APPEARANCE` or `ninaAppearance`. The only importer in
   the tree is `lib/nina/imagegen.ts:1`, plus `tests/nina.prompts.test.ts:10`. So editing them
   **cannot** move `NINA_SYSTEM_PROMPT`, and the `buildNinaSystemPrompt` snapshot in
   `tests/nina.prompts.test.ts` is untouched by this phase.
2. **`tests/nina.prompts.test.ts:139-140` survives with no edit.** It asserts
   `NINA_APPEARANCE` contains `'ponytail'` and `'heather-grey racerback tank'`. Step 1 keeps
   `NINA_APPEARANCE` as `NINA_BODY + NINA_FACE + NINA_DEFAULT_OUTFIT`, and both substrings are in
   the last two. Verified against the exact literals at `persona.ts:367,369`.
3. **`lib/nina/avatartools.ts` needs zero edits, and it is structural rather than lucky.**
   `handleSetAvatar` calls `generateNinaAvatar({ userId, scene, source })` at `avatartools.ts:85-89`
   — three fields, and `NinaAvatarRequest` (`avatargen.ts:60-66`) has no `tuning` member. This phase
   adds **no** `prefs` member either; `generateNinaAvatar` reads both rows itself (Step 5). So
   `set_avatar` picks up the prefs with the file unopened, which is the property `avatargen.ts:86-94`
   says out loud and the analysis (Entry Point B) says is *"a fact to preserve rather than a
   coincidence"*. The same argument covers `lib/nina/imagetools.ts` and `lib/nina/promises.ts`,
   which call `generateNinaSelfie` with `{ userId, scene, mood, replyToId }`.
4. **`buildNinaImagePrompt` is safe for phase 4's render.** Neither `imagegen.ts`, `persona.ts`,
   `tuning.ts` nor `imagerecipe.ts` carries `import 'server-only'` and none does I/O. Phase 1's
   `imageprefs.ts` is zero-import. So the whole assembly chain is pure and client-importable, and
   `ci:llm-payload-guard` Rule 2 (which matches *model call* function names) has nothing to say
   about it. **Phase 4: the function to call for the preview is `buildNinaImagePrompt` itself.**
5. **The `${wardrobe} She still has` defect is real and is in the user's own paste.**
   `persona.ts:401` interpolates with no terminating punctuation; the paste reads
   `long pants She still has the black digital watch`. Fixed in Step 1, asserted in Step 6.
6. **The two numeric claims in the tests were computed against the literal strings below before
   this plan was written, not estimated.** Selfie, `scene: 'on the track'`, no mood, no focus:
   band `off` renders **387** characters and band `max` renders **1642** — a ratio of **0.236**,
   comfortably inside the `< 0.6` assertion. With `flirty: 100`, all six focus keys and a mood, the
   five rungs render **568, 836, 1544, 2459, 2646** characters — strictly increasing, which is what
   makes the "all five rungs are distinct" assertion pass rather than hope. If the prose in Step 1
   or Step 3 is edited, re-check the 0.6 before committing.
7. **`ninaBand` is imported, never re-derived.** `imagegen.ts:72`'s `isDialHigh` already reads
   `ninaBand(value).index >= 3` and `tuning.ts:121-124` defines the five equal bands
   `0-19 off, 20-39 low, 40-59 mid, 60-79 high, 80-100 max`. The length ladder keys off
   `ninaBand(promptLength).name` and declares no private threshold — the fork `imagegen.ts:55-71`
   already recorded and settled.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/persona.ts` | modify | `:352-402` — the whole *"What she looks like"* section: `NINA_BODY_SENTENCES`, `NINA_BODY`, `NINA_BODY_AVATAR`, `ninaBodyBlock`; `NINA_FACE` loses its one body clause; `NINA_APPEARANCE` reordered body-first; `ninaAppearance` re-pointed at `NinaImagePrefs`, given a detail parameter and a sentence boundary |
| `lib/nina/imagegen.ts` | modify | `:1-9` imports; `:45-53` the two short camera forms; `:93-157` the rung table, the focus block, the free-text blocks, and `buildNinaImagePrompt` rebuilt; the header's repealed compatibility claim restated |
| `lib/nina/selfiegen.ts` | modify | `:8` import, `:78-80` read the prefs beside the tuning and pass them |
| `lib/nina/avatargen.ts` | modify | `:8` import, `:86-96` the same |
| `tests/nina.imagerecipe.test.ts` | modify | `:1-32` imports; the whole `describe('the prompt', ...)` at `:66-210` restated. The payload, pathname, cost, `jakartaDayStart` and threshold-chain describes are untouched |
| `docs/nina/persona.md` | modify | `:239-255` — the *"What she looks like"* prose, per `persona.ts`'s same-commit rule |

Six files. The index's row for this phase says 7; the seventh was `tests/nina.prompts.test.ts`,
which verified fact 2 shows needs **no** edit. Recorded here so the reconciler does not go looking
for a missing file.

---

## Implementation Steps

### Step 1: `persona.ts` — the body canon, the reorder, and the sentence boundary

**File:** `lib/nina/persona.ts:352-402`
**Change:** Replace everything from the `What she looks like` section banner through the end of
`ninaAppearance` (i.e. `persona.ts:336` up to and including the closing brace at `:389`, stopping
before the blank line and `export const NINA_EXPERTISE` at `:391`) with the block below.

`persona.ts` gains one import. Add to the top-of-file import list, beside the existing
`./tuning` import:

```ts
import type { NinaImagePrefs } from './imageprefs'
```

`imageprefs.ts` is zero-import plain data (phase 1), so this costs `persona.ts` nothing it did not
already pay for `./tuning` and keeps the file importable from a `'use client'` module — the property
its own header claims at `:11-13`.

**Code:**

```ts
/* ============================================================================
 * What she looks like
 * ==========================================================================*/

/**
 * **THE BODY CANON (R1). It is unconditional, it leads the subject paragraph, and no setting can
 * switch it off.**
 *
 * The user's words, verbatim: *"i dont care about her face, i care a lot about her voluptuous body:
 * big boobs, bubble butt, big thighs , very long calves. always explicitly instruct these in the
 * prompt."* He said that while pasting a real `sidecarText()` dump whose subject paragraph spent
 * four of its five sentences on hair, eyes, eyebrows, makeup and a smile, and whose only silhouette
 * instruction was `narrow shoulders`. So this is a measured defect and not a taste.
 *
 * ── WHY IT IS AN ARRAY AND NOT A PARAGRAPH ────────────────────────────────────────────────────
 * R4 asks for a prompt-length slider where "the longer the prompt, the more detailed the prompt
 * would be". `ninaBodyBlock(n)` spends the first `n` of these, so the slider buys body detail
 * rather than buying whether there is a body at all. **Element 0 names all four facts on its own**,
 * which is what makes PLAN INVARIANT 4 structural: the lowest rung of the shortest possible prompt
 * still carries `big boobs`, `bubble butt`, `big thighs` and `very long calves`.
 *
 * ── THE ONE SENTENCE THAT MOVED, AND THE TWO WORDS THAT WERE REPEALED ─────────────────────────
 * `NINA_FACE` used to carry *"Lean, visibly muscular runner's build — defined quadriceps and
 * calves, narrow shoulders."* That is a BODY clause living in a FACE constant, and it is the exact
 * opposite of R1. Its surviving content — the muscle, the defined calves — is in elements 3 and 4
 * below. `Lean` and `narrow shoulders` are REPEALED, in as many words in element 4, because a model
 * given both "lean, narrow shoulders" and "voluptuous, wide hips" is a model being argued with —
 * the failure mode `imagegen.ts`'s header calls degrading a prompt for free.
 *
 * The face itself is NOT deleted. The index's Decisions table settles that: *"the face keeps its
 * sentences and loses its primacy"*. All four of `NINA_FACE`'s actual face sentences survive
 * verbatim below; what changed is that the body is now read first.
 */
export const NINA_BODY_SENTENCES: readonly string[] = [
  `She is voluptuous: big boobs, a bubble butt, big thighs and very long calves. This silhouette is the point of the photograph and it must be visible in it.`,
  `Her chest is full and heavy, her hips are wide and her waist is narrow, so the curve from waist to hip reads clearly through whatever she is wearing.`,
  `Her butt is round, high and prominent, standing out from her back rather than flattening into it.`,
  `Her thighs are thick and strong, filling whatever she is wearing, with a runner's muscle visible under soft skin.`,
  `Her calves are very long and full, defined all the way down to a narrow ankle, on legs that are unusually long for her height. She is curvy and heavy-bodied, never lean and never slight.`,
]

/** The full render. Every sentence, in order. */
export const NINA_BODY = NINA_BODY_SENTENCES.join(' ')

/**
 * **The avatar variant, and the one place in the canon that names its own crop.**
 *
 * `NINA_AVATAR_STYLE` asks for head and shoulders inside a 28-44 px circle. Five sentences about
 * her hips, butt and calves under a face crop is the same self-contradiction that makes `steamy`
 * selfie-only in `imagegen.ts` — a prompt arguing with itself.
 *
 * Dropping the body on the avatar path was the alternative, and it is rejected: PLAN INVARIANT 4
 * says no value of any pref may produce a prompt that does not name the body, and `purpose` is not
 * a pref but "always" would still be false for half the generations. So the body survives as ONE
 * sentence naming all four facts as facts about HER, and the crop is reconciled out loud in the
 * clause after the dash rather than left for the model to guess at.
 */
export const NINA_BODY_AVATAR = `She is voluptuous — big boobs, a bubble butt, big thighs and very long calves — even though this photograph is cropped to her head and shoulders and shows almost none of it.`

/**
 * The first `sentences` elements of the body canon, joined.
 *
 * **Clamped to at least one, always.** That clamp is PLAN INVARIANT 4 held by construction rather
 * than by every caller remembering: a rung table with a typo, a `0` from a hand-run SQL update, a
 * `NaN` from a coercion that got away — every one of them still returns element 0, and element 0
 * names all four facts.
 */
export function ninaBodyBlock(sentences: number): string {
  const wanted = Number.isFinite(sentences) ? Math.floor(sentences) : 1
  const take = Math.min(NINA_BODY_SENTENCES.length, Math.max(1, wanted))
  return NINA_BODY_SENTENCES.slice(0, take).join(' ')
}

/**
 * The anchor image in words, minus the body clause that moved to `NINA_BODY_SENTENCES`.
 *
 * Transcribed from `nina.png` rather than invented, because R20 makes that image the anchor for
 * every generation after it: a description that contradicts the anchor would fight the reference
 * on every single generation.
 *
 * ── WHY THE BODY, THE FACE AND THE OUTFIT ARE THREE CONSTANTS ─────────────────────────────────
 * Three things vary independently and each has its own operator. The BODY is the user's standing
 * instruction and never varies (R1). The OUTFIT is `nina_image_prefs.wardrobe`, one free-text line
 * he retypes per shoot (R6). Her FACE is the anchor and must never move, or every generation after
 * a change fights the reference. Three concerns, three paragraph boundaries, one source for each
 * sentence — `NINA_APPEARANCE` is derived from the three halves rather than written a fourth time.
 */
export const NINA_FACE = `A woman in her late twenties, mixed Southeast Asian and Mediterranean features, olive skin with a warm undertone. Long dark brown hair pulled into a high ponytail with loose strands at the temples. Dark brown eyes, thick straight eyebrows, no makeup, a wide open smile. Usually a little sweaty.`

export const NINA_DEFAULT_OUTFIT = `Her default outfit is a heather-grey racerback tank, black fitted running shorts, white running shoes, and a black digital watch on her left wrist. Often a white towel over one shoulder and a blue water bottle in one hand. Her home ground is a red 400 m athletics track beside a green field, in flat morning sun.`

/**
 * The whole canon, at full detail, with no wardrobe override. **BODY FIRST** — that reorder is R1's
 * other half: the user does not care about her face, so the face no longer opens the paragraph the
 * model reads first.
 *
 * `tests/nina.prompts.test.ts:139-140` asserts this constant contains `'ponytail'` and
 * `'heather-grey racerback tank'`, and both survive here unchanged. That test needs no edit.
 */
export const NINA_APPEARANCE = `${NINA_BODY}

${NINA_FACE}

${NINA_DEFAULT_OUTFIT}`

/**
 * **The defect from the user's own paste, fixed.**
 *
 * `ninaAppearance` used to interpolate `${wardrobe}` and continue with ` She still has...`, so an
 * operator line that did not end in a full stop produced `long pants She still has the black
 * digital watch` — two sentences the provider reads as one. He pasted that. It is evidence.
 *
 * `?`, `!` and `.` all count as an ending, so an operator who writes their own stop does not get a
 * doubled one. A trailing `,` or `;` is NOT an ending: a comma before `She still has` is the same
 * run-on with a different mark.
 */
function withSentenceStop(text: string): string {
  if (text.length === 0) return text
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/**
 * How much of the canon to spend. Chosen by `imagegen.ts`'s prompt-length rung, which is the only
 * caller that has an opinion; everybody else takes the default and gets the whole canon.
 *
 * `body` is a STRING and not a sentence count because the avatar path substitutes a different
 * sentence entirely (`NINA_BODY_AVATAR`) rather than taking fewer of the same ones. Passing the
 * text keeps that decision where the crop is known — in `imagegen.ts`, next to
 * `NINA_AVATAR_STYLE` — instead of teaching this file about purposes.
 */
export interface NinaAppearanceDetail {
  /** The body paragraph. Empty is repaired, not honoured — PLAN INVARIANT 4. */
  readonly body: string
  /** Spend the face paragraph. */
  readonly face: boolean
  /** Spend `NINA_DEFAULT_OUTFIT` when the operator set no wardrobe. */
  readonly outfit: boolean
}

/** Everything, which is what `NINA_APPEARANCE` is. `ninaAppearance(prefs)` with an empty wardrobe
 * returns exactly that constant, and `tests/nina.imagerecipe.test.ts` asserts the identity. */
export const NINA_APPEARANCE_FULL_DETAIL: NinaAppearanceDetail = Object.freeze({
  body: NINA_BODY,
  face: true,
  outfit: true,
})

/**
 * **The wardrobe seam, re-pointed at `nina_image_prefs`.**
 *
 * ── WHY THE PARAMETER IS `NinaImagePrefs` AND NOT `{ wardrobe: string }` ──────────────────────
 * A structural parameter would keep accepting a `NinaTuning`, because `NinaTuning` still has a
 * `wardrobe` member until phase 7 removes it. The index's Decisions table is explicit that *"two
 * wardrobes silently competing is the one outcome R3 cannot mean"*, so this parameter is nominal:
 * a leftover `ninaAppearance(tuning)` anywhere in the tree is a compile error rather than a
 * photograph quietly wearing the wrong clothes. `tests/nina.imagerecipe.test.ts` asserts the
 * runtime half of the same thing — a tuning wardrobe set to something distinctive does not appear
 * in the prompt.
 *
 * ── WHAT THE WARDROBE REPLACES, AND WHAT IT NEVER TOUCHES ─────────────────────────────────────
 * When set it replaces `NINA_DEFAULT_OUTFIT` and nothing else. The body paragraph, the face
 * paragraph and her home ground are untouched: the body is the user's standing instruction, the
 * face is the anchor, and the track is a place rather than a garment.
 *
 * ── THE LADDER NEVER DROPS WHAT THE OPERATOR TYPED ────────────────────────────────────────────
 * `detail.outfit === false` suppresses the CANON outfit paragraph. It does not suppress a wardrobe
 * the operator wrote — a control that silently discards a field somebody filled in is the failure
 * mode `lib/db/schema.ts`'s `nina_tuning` header argues against (*"a control that silently does
 * nothing"*). Same rule as `VENUE`, `TIME` and `NOTES` in `imagegen.ts`.
 *
 * This does NOT reach the system prompt. `NINA_APPEARANCE` never did — `prompts/system.ts:1-21`
 * imports twenty names from this file and none of these four is among them — and a paragraph
 * telling her what she is wearing would be a fact about a photograph that has not been taken yet.
 */
export function ninaAppearance(
  prefs: NinaImagePrefs,
  detail: NinaAppearanceDetail = NINA_APPEARANCE_FULL_DETAIL,
): string {
  /* PLAN INVARIANT 4, once more by construction. A caller that computed an empty body gets element
   * 0 rather than a prompt with no body in it. */
  const body = detail.body.trim().length > 0 ? detail.body : NINA_BODY_SENTENCES[0]!

  const paragraphs: string[] = [body]
  if (detail.face) paragraphs.push(NINA_FACE)

  /* `wardrobe` is `string` and never null — phase 1's coercer returns `''` for anything unusable
   * and has already collapsed the whitespace to single spaces and capped the length. `''` is the
   * ONE empty value, so this is a length check and not a null check. `.trim()` survives only
   * because a hand-run SQL update can still write ' '. */
  const wardrobe = withSentenceStop(prefs.wardrobe.trim())
  if (wardrobe.length > 0) {
    paragraphs.push(
      `Her outfit for this photograph: ${wardrobe} She still has the black digital watch on her left wrist unless the outfit says otherwise. Her home ground is a red 400 m athletics track beside a green field, in flat morning sun.`,
    )
  } else if (detail.outfit) {
    paragraphs.push(NINA_DEFAULT_OUTFIT)
  }

  return paragraphs.join('\n\n')
}
```

**Impact:**
- `NINA_APPEARANCE` grows by one paragraph and reorders. Only `imagegen.ts` and
  `tests/nina.prompts.test.ts` read it, and neither breaks (verified facts 1 and 2).
- `ninaAppearance`'s call site at `imagegen.ts:142` no longer type-checks. Step 3 rewrites it in
  the same commit, so the tree never sits broken.
- `persona.ts:1473`'s comment (*"`wardrobe`, which is `ninaAppearance`'s"*) is still true. No edit.
- Nothing else in `persona.ts` — the anger ladder, the registers, `ninaTraitsBlock`, the twenty
  names `prompts/system.ts` imports — is touched.

---

### Step 2: `imagegen.ts` — imports, the header repeal, and the two short camera forms

**File:** `lib/nina/imagegen.ts:1-53`
**Change:** Replace the import block (`:1-9`), append two paragraphs to the file header's RU-18
section, and add the two short camera constants beside the two existing ones.

**Code — the import block, replacing `:1-9` verbatim:**

```ts
import {
  NINA_BODY_AVATAR,
  ninaAppearance,
  ninaBodyBlock,
  type NinaAppearanceDetail,
} from '@/lib/nina/persona'
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_PREFS_DEFAULTS,
  type NinaImageFocusKey,
  type NinaImagePrefs,
} from '@/lib/nina/imageprefs'
import { ninaBand, type NinaBandName, type NinaTuning } from '@/lib/nina/tuning'

import {
  NINA_IMAGE_ASPECT,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_RESOLUTION,
  type NinaImagePurpose,
} from './imagerecipe'
```

`NINA_APPEARANCE` is gone from the list: there is no longer a `prefs == null` branch that spells the
constant (Step 3 collapses null to a named fallback instead), and an unused import fails
`npm run lint`. The constant itself stays exported from `persona.ts` for the canon test and the doc.

**Code — append to the file header, after the `── NO REFERENCE IMAGE (RU-18) ──` paragraph that
ends at `:29`, inside the same block comment:**

```ts
/**
 * ── THE COMPATIBILITY CONTRACT, REPEALED AND RESTATED (R1) ────────────────────────────────────
 * This file used to promise that `tuning == null` and `tuning === NINA_TUNING_DEFAULTS` rendered
 * the prompt that shipped, character for character — "a provable superset of the Nina who shipped
 * rather than a rewrite of her". **That promise is repealed, deliberately, and this is the record
 * of it.** R1 is the user's word "always": the body canon is unconditional, so there is no longer
 * any setting that renders the old subject paragraph. Keeping the claim in a comment while the
 * code had stopped honouring it would be worse than the change.
 *
 * TWO WEAKER PROPERTIES SURVIVE AND ARE STILL ASSERTED IN `tests/nina.imagerecipe.test.ts`:
 *
 *   1. **Optionality.** A caller with neither a tuning nor prefs and a caller holding
 *      `NINA_TUNING_DEFAULTS` plus default prefs get the SAME string. This is still a pure
 *      function of its arguments, and no default reaches out to a database.
 *   2. **Additivity above the canon.** Everything the tuning and the prefs contribute is text
 *      ADDED to an unconditional canon. Nothing any setting can do removes a body fact — PLAN
 *      INVARIANT 4, asserted as a property over every combination rather than as four examples.
 *
 * ── WHAT THE OPERATOR TYPED IS NEVER DROPPED BY THE LADDER ────────────────────────────────────
 * The prompt-length rungs below spend more or less CANON prose. They never suppress a wardrobe, a
 * venue, a time, a note or a focus selection: a control that silently discards a field somebody
 * filled in is the failure mode `lib/db/schema.ts`'s `nina_tuning` header argues against. The one
 * exception is stated where it lives — the avatar crop drops the four whole-body focus keys, for
 * the same reason `steamy` is selfie-only.
 */
```

**Code — the camera constants. `NINA_SELFIE_STYLE` at `:52` and `NINA_AVATAR_STYLE` at `:60` are
unchanged; add these two immediately after each:**

```ts
/**
 * The short form, spent at rungs `off`, `low` and `mid`. It keeps every instruction that changes
 * what the provider RETURNS — a phone photograph, daylight, real skin, no text, no watermark, no
 * border, a photograph and not a render — and drops the three that only refine it: the imperfect
 * framing, the shallow depth of field, and the two negations already implied by "no retouching".
 *
 * It still contains `Realistic photograph`, which is what
 * `tests/nina.imagerecipe.test.ts:67-72` asserts, so the style guarantee holds at every rung.
 */
export const NINA_SELFIE_STYLE_SHORT = `A casual smartphone photograph, as if taken and sent in a chat app. Natural daylight, visible skin texture, no text, no watermark, no border. Realistic photograph, not an illustration and not a render.`
```

```ts
/**
 * The avatar's short form. The CROP sentence is untouched at every rung — it is the whole reason
 * this style block exists, and `tests/nina.imagerecipe.test.ts:83-85` asserts
 * `head and shoulders` — so the saving comes out of the lighting refinements only.
 */
export const NINA_AVATAR_STYLE_SHORT = `A casual smartphone photograph framed as a profile picture: head and shoulders, her face filling most of the frame, looking at the camera. Natural daylight, no text, no watermark, no border. Realistic photograph, not an illustration and not a render.`
```

**Impact:** the file header no longer claims something untrue; two new exported constants; no
behaviour change until Step 3 wires them.

---

### Step 3: `imagegen.ts` — the rung table, the focus block, and `buildNinaImagePrompt`

**File:** `lib/nina/imagegen.ts:93-157`
**Change:** `isDialHigh` (`:82`) and `ninaPhotoPresence` (`:100-121`) are **unchanged, including
every line of their docblocks** — `steamy` stays selfie-only, `flirty` stays on both cameras, and
the band comes from `ninaBand`. Insert the block below between `ninaPhotoPresence` and
`buildNinaImagePrompt`, then replace `buildNinaImagePrompt` (`:129-160`) entirely.

One line inside `ninaPhotoPresence`'s docblock is now stale and is corrected in place:

- **old** (`:88-90`): `What she WEARS is` `tuning.wardrobe`, and it belongs to the SUBJECT paragraph via phase 2's `ninaAppearance`
- **new**: `What she WEARS is` `prefs.wardrobe`, and it belongs to the SUBJECT paragraph via `ninaAppearance`

**Code:**

```ts
/* ============================================================================
 * THE PROMPT-LENGTH LADDER (R4)
 * ==========================================================================*/

/**
 * **What one rung of the length slider buys.**
 *
 * The user asked for a sliding bar where *"the longer the prompt, the more detailed the prompt
 * would be"*. The index's Decisions table settles the units: a 0-100 slider read through the repo's
 * existing five bands, *"not a character budget"* — `/admin` already renders the band name beside
 * every slider, and a private scale is a slider the operator cannot predict.
 *
 * ── WHAT THE LADDER MAY AND MAY NOT SPEND ─────────────────────────────────────────────────────
 * It spends CANON prose: how many body sentences, whether the face paragraph is there, whether the
 * default outfit is there, how verbose the focus emphasis is, and which of the two camera forms is
 * used. It NEVER spends what the operator typed. `VENUE`, `TIME`, `NOTES` and a non-empty wardrobe
 * appear at every one of the five rungs, and a selected focus key always produces a `FOCUS:` block
 * — only its wording gets shorter.
 *
 * ── WHY `off` DROPS `POSE AND PRESENCE` AND NOTHING ELSE DOES ─────────────────────────────────
 * `off` is the one rung whose contract is "as short as this can be while still being a photograph
 * of her". Something has to go, and the pose block is the only candidate that is neither the
 * operator's own words nor a body fact: it is a derived clause from two character dials that have
 * a home of their own on `/admin/personality`. From `low` up, every block is present and the ladder
 * varies only how much is said.
 *
 * ── EVERY RUNG NAMES THE BODY ─────────────────────────────────────────────────────────────────
 * `bodySentences` is never 0, and `ninaBodyBlock` clamps it to at least 1 even if this table were
 * edited to say otherwise. `NINA_BODY_SENTENCES[0]` names all four facts on its own. That is PLAN
 * INVARIANT 4 twice over, which is proportionate: it is the requirement the user actually wrote
 * down.
 */
export interface NinaPromptRung {
  /** The band this rung answers, so a reader can line it up with what `/admin` shows. */
  readonly band: NinaBandName
  /** How many of `NINA_BODY_SENTENCES` to spend. Never 0. */
  readonly bodySentences: number
  /** Spend `NINA_FACE`. */
  readonly face: boolean
  /** Spend `NINA_DEFAULT_OUTFIT` when the operator set no wardrobe. */
  readonly outfit: boolean
  /** Spend `POSE AND PRESENCE:` when the dials have something to say. */
  readonly presence: boolean
  /** `list` = the emphasis lead only. `sentences` = the lead plus one sentence per selected key. */
  readonly focus: 'list' | 'sentences'
  /** Which of the two camera forms. */
  readonly camera: 'short' | 'full'
}

/**
 * The five rungs. **All five are distinct** — a slider with two settings that render the same
 * string is a slider the operator cannot trust, and `tests/nina.imagerecipe.test.ts` asserts
 * strictly increasing length across the five band floors.
 *
 * | band | body | face | outfit | pose | focus     | camera |
 * |------|------|------|--------|------|-----------|--------|
 * | off  |  1   |  no  |   no   |  no  | list      | short  |
 * | low  |  2   |  no  |   no   | yes  | list      | short  |
 * | mid  |  3   | yes  |  yes   | yes  | list      | short  |
 * | high |  4   | yes  |  yes   | yes  | sentences | full   |
 * | max  |  5   | yes  |  yes   | yes  | sentences | full   |
 */
export const NINA_PROMPT_RUNGS: Readonly<Record<NinaBandName, NinaPromptRung>> = Object.freeze({
  off: Object.freeze({
    band: 'off',
    bodySentences: 1,
    face: false,
    outfit: false,
    presence: false,
    focus: 'list',
    camera: 'short',
  }),
  low: Object.freeze({
    band: 'low',
    bodySentences: 2,
    face: false,
    outfit: false,
    presence: true,
    focus: 'list',
    camera: 'short',
  }),
  mid: Object.freeze({
    band: 'mid',
    bodySentences: 3,
    face: true,
    outfit: true,
    presence: true,
    focus: 'list',
    camera: 'short',
  }),
  high: Object.freeze({
    band: 'high',
    bodySentences: 4,
    face: true,
    outfit: true,
    presence: true,
    focus: 'sentences',
    camera: 'full',
  }),
  max: Object.freeze({
    band: 'max',
    bodySentences: 5,
    face: true,
    outfit: true,
    presence: true,
    focus: 'sentences',
    camera: 'full',
  }),
})

/**
 * A stored `promptLength` resolved to a rung, through phase 1's band and no private threshold —
 * the fork this file already settled once for `isDialHigh` (see its docblock).
 */
export function ninaPromptRung(promptLength: number): NinaPromptRung {
  return NINA_PROMPT_RUNGS[ninaBand(promptLength).name]
}

/**
 * **What a caller with no prefs at all gets.** Band `high`: the face, the outfit, the pose, the
 * full camera, four body sentences.
 *
 * It is spelled HERE rather than read from `NINA_IMAGE_PREFS_DEFAULTS.promptLength` on purpose.
 * `buildNinaImagePrompt` must be a pure function of its arguments with a render this file can
 * state, and a test that asserted "no prefs keeps the face" would otherwise be asserting phase 1's
 * choice of default number. Phase 1 is free to default the stored slider anywhere.
 */
export const NINA_PROMPT_LENGTH_FALLBACK = 70

/* ============================================================================
 * THE FOCUS EMPHASIS (R5)
 * ==========================================================================*/

/**
 * **Emphasis, layered on an unconditional canon. Never inclusion.**
 *
 * The user listed six things to be able to "focus on": face, skin, big boobs, bubble butt, big
 * thighs, very long calves. Four of those six are already in the body canon at every rung, which
 * is the whole of R1 — so selecting `butt` cannot be what puts a butt in the prompt. It is what
 * tells the camera the butt is the point of THIS shoot. Deselecting all six leaves a prompt that
 * still names all four body facts; the index's Decisions table settles this and PLAN INVARIANT 4
 * is the test.
 *
 * `term` is the phrase for the emphasis lead, in the user's own words so the operator reads back
 * what he typed. `sentence` is the extra instruction spent at rungs `high` and `max`.
 *
 * **The key spellings are phase 1's vocabulary, imported as `NINA_IMAGE_FOCUS_KEYS`.** This record
 * is keyed by that type, so a key phase 1 adds or renames is a compile error here rather than a
 * silently missing clause.
 */
const NINA_FOCUS_EMPHASIS: Readonly<
  Record<NinaImageFocusKey, { readonly term: string; readonly sentence: string }>
> = Object.freeze({
  face: Object.freeze({
    term: 'her face',
    sentence: `Her face is sharp and clearly visible, lit well enough to read her expression.`,
  }),
  skin: Object.freeze({
    term: 'her skin',
    sentence: `Her bare skin is what the photograph is about: olive, faintly sweat-sheened, with visible pores and fine texture rather than a retouched surface.`,
  }),
  boobs: Object.freeze({
    term: 'her big boobs',
    sentence: `Her big boobs are full and heavy and read clearly through whatever she is wearing, with real weight to them and a deep cleavage line.`,
  }),
  butt: Object.freeze({
    term: 'her bubble butt',
    sentence: `Her bubble butt is round, high and prominent, and the pose and the framing are chosen so that it is unmistakable.`,
  }),
  thighs: Object.freeze({
    term: 'her big thighs',
    sentence: `Her big thighs are thick and powerful, filling whatever she is wearing, with the muscle showing under soft skin.`,
  }),
  calves: Object.freeze({
    term: 'her very long calves',
    sentence: `Her very long calves run most of the length of the frame, full and sharply defined all the way down to a narrow ankle.`,
  }),
})

/**
 * **Which focus keys survive the avatar crop, and why the other four do not.**
 *
 * `NINA_AVATAR_STYLE` asks for head and shoulders inside a 28-44 px circle. `FOCUS: Emphasise her
 * bubble butt above everything else` under that crop is a prompt arguing with itself, which is
 * exactly the rule that already makes `steamy` selfie-only two functions up. So the four
 * whole-body keys are dropped on the avatar path and the two that a face crop can actually honour
 * are kept.
 *
 * They are DROPPED and not substituted: if the operator selected only body keys, the avatar gets no
 * `FOCUS:` block at all rather than an invented one. `NINA_BODY_AVATAR` is still in its subject
 * paragraph, so PLAN INVARIANT 4 holds without this block having to fake anything.
 */
const NINA_AVATAR_FOCUS_KEYS: readonly NinaImageFocusKey[] = ['face', 'skin']

/** `a`, `a and b`, `a, b and c`. No Oxford comma, matching every other prose list in the canon. */
function joinTerms(terms: readonly string[]): string {
  if (terms.length <= 1) return terms[0] ?? ''
  return `${terms.slice(0, -1).join(', ')} and ${terms[terms.length - 1]!}`
}

/** The `FOCUS:` block's body, or null when nothing the crop can honour was selected. */
function ninaFocusBlock(
  purpose: NinaImagePurpose,
  prefs: NinaImagePrefs,
  rung: NinaPromptRung,
): string | null {
  const keys = NINA_IMAGE_FOCUS_KEYS.filter(
    (key) => prefs.focus[key] && (purpose === 'selfie' || NINA_AVATAR_FOCUS_KEYS.includes(key)),
  )
  if (keys.length === 0) return null

  const lead = `Emphasise ${joinTerms(
    keys.map((key) => NINA_FOCUS_EMPHASIS[key].term),
  )} above everything else in this photograph.`
  if (rung.focus === 'list') return lead
  return [lead, ...keys.map((key) => NINA_FOCUS_EMPHASIS[key].sentence)].join(' ')
}

/**
 * One of the operator's free-text blocks, or null when he left the field empty.
 *
 * `''` is the ONE empty value for all four fields (phase 1's coercers), so this is a length check
 * and not a null check — the same contract `ninaAppearance` reads the wardrobe under. `.trim()`
 * survives because a hand-run SQL update can still write ' '.
 */
function ninaFreeTextBlock(label: string, value: string): string | null {
  const text = value.trim()
  if (text.length === 0) return null
  return `${label}: ${text}`
}
```

**Code — `buildNinaImagePrompt`, replacing `:115-160` (the docblock and the function):**

```ts
/**
 * **The words the camera is given, in one pure function of its arguments.**
 *
 * ── THE BLOCK ORDER IS LOAD-BEARING AND EVERY POSITION IS ARGUED ──────────────────────────────
 *
 *  1. **the camera block** — the aesthetic, first, so everything after it is read as a
 *     photograph. The measured probe used a prompt of exactly this shape.
 *  2. **`SUBJECT:`** — who she is: body, then face, then clothes. Body first is R1's reorder.
 *  3. **`FOCUS:`** — emphasis on the subject just described, so it sits immediately after the
 *     sentences it amplifies and BEFORE the pose: what to emphasise decides how she stands,
 *     rather than the other way round.
 *  4. **`POSE AND PRESENCE:`** — before the scene, because it is a standing property of the
 *     subject the operator set once and not a per-photograph note. UNCHANGED reasoning, and the
 *     ordering assertion that has always been in `tests/nina.imagerecipe.test.ts`.
 *  5. **`VENUE:`** then 6. **`TIME:`** — the operator's standing opinion about where and when she
 *     is photographed. They go immediately BEFORE `SCENE:` so the model reads
 *     general-then-specific: a scene that names its own place is the later and more specific
 *     instruction and wins. Putting them AFTER the scene was the alternative and it is rejected —
 *     it would read as a correction of the scene, and the index's Scope keeps the scene hers per
 *     photograph.
 *  7. **`SCENE:`** — the model's own `generate_image` argument. What this photograph is of.
 *  8. **`EXPRESSION AND ENERGY:`** — after the scene, so it reads as a refinement of THIS
 *     photograph rather than an amendment to who she is. UNCHANGED, and it is exactly where
 *     `tools/gen_badge_art.py` puts `--note`, for the same reason.
 *  9. **`NOTES:`** — LAST. It is the operator's catch-all amendment to this photograph ("nina is
 *     full of sweat"), the same category as `--note` and one step later, because last is where an
 *     instruction that must be able to amend everything above it belongs.
 *
 * ── WHAT IT TAKES, AND WHY BOTH ROWS ──────────────────────────────────────────────────────────
 * `tuning` is her CHARACTER (`/admin/personality`) and only `steamy` and `flirty` have anything to
 * say about a picture. `prefs` is the operator's standing opinion about how she is PHOTOGRAPHED
 * (`/admin/image-generation`). Two rows, two surfaces, two arguments; the camera reads
 * `prefs.wardrobe` and no longer reads `tuning.wardrobe` at all.
 *
 * Every member but `purpose` and `scene` is optional, which is what lets phase 6's
 * `lib/nina/imagetest.ts` be a third caller and phase 4's prompt preview call this straight from a
 * render. It is pure, does no I/O, and is not a model call, so `ci:llm-payload-guard` Rule 2 has
 * nothing to say about it.
 */
export function buildNinaImagePrompt(input: {
  purpose: NinaImagePurpose
  scene: string
  mood?: string | null
  /** Her character. Only `steamy` and `flirty` reach a photograph. */
  tuning?: NinaTuning | null
  /** The operator's image preferences. Absent renders `NINA_PROMPT_LENGTH_FALLBACK`'s rung. */
  prefs?: NinaImagePrefs | null
}): string {
  const tuning = input.tuning ?? null
  const prefs: NinaImagePrefs =
    input.prefs ?? { ...NINA_IMAGE_PREFS_DEFAULTS, promptLength: NINA_PROMPT_LENGTH_FALLBACK }
  const rung = ninaPromptRung(prefs.promptLength)
  const isAvatar = input.purpose === 'avatar'

  const camera = isAvatar
    ? rung.camera === 'full'
      ? NINA_AVATAR_STYLE
      : NINA_AVATAR_STYLE_SHORT
    : rung.camera === 'full'
      ? NINA_SELFIE_STYLE
      : NINA_SELFIE_STYLE_SHORT

  const detail: NinaAppearanceDetail = {
    /* One sentence on the avatar path at EVERY rung. More body prose under a head-and-shoulders
     * crop is more contradiction, not more detail — see `NINA_BODY_AVATAR`. */
    body: isAvatar ? NINA_BODY_AVATAR : ninaBodyBlock(rung.bodySentences),
    /* The avatar IS a face crop, so the face paragraph is never what the ladder saves on it. */
    face: isAvatar ? true : rung.face,
    outfit: rung.outfit,
  }

  const parts = [camera, '', 'SUBJECT:', ninaAppearance(prefs, detail)]

  const focus = ninaFocusBlock(input.purpose, prefs, rung)
  if (focus != null) parts.push('', `FOCUS: ${focus}`)

  const presence = rung.presence ? ninaPhotoPresence(input.purpose, tuning) : null
  if (presence != null) parts.push('', `POSE AND PRESENCE: ${presence}`)

  const venue = ninaFreeTextBlock('VENUE', prefs.venue)
  if (venue != null) parts.push('', venue)

  const time = ninaFreeTextBlock('TIME', prefs.time)
  if (time != null) parts.push('', time)

  parts.push('', `SCENE: ${input.scene.trim()}`)

  const mood = input.mood?.trim()
  if (mood != null && mood.length > 0) parts.push('', `EXPRESSION AND ENERGY: ${mood}`)

  const notes = ninaFreeTextBlock('NOTES', prefs.notes)
  if (notes != null) parts.push('', notes)

  return parts.join('\n')
}
```

**Impact:**
- `sidecarText` (`:163-176`) is untouched, including its `reference:  none (RU-18)` line. Phase 3
  owns that line.
- `ninaPhotoPresence` and `isDialHigh` keep every behaviour: `steamy` selfie-only, `flirty` both
  cameras, band from `ninaBand`. The only new gate on the block is `rung.presence`, which is false
  at band `off` alone.
- The two existing call sites (`selfiegen.ts:80`, `avatargen.ts:96`) still compile before Step 4/5
  because `prefs` is optional — but they would render the fallback rung and read no prefs, which is
  why Steps 4 and 5 land in the same commit.

---

### Step 4: `selfiegen.ts` — read the prefs beside the tuning

**File:** `lib/nina/selfiegen.ts:8` and `:78-80`
**Change:** import `readNinaImagePrefs` and issue both reads together.

**Code — replace `:8`:**

```ts
import { readNinaImagePrefs, readNinaTuning } from './queries'
```

**Code — replace `:78-80` (the comment, the `readNinaTuning` await and the `buildNinaImagePrompt`
call):**

```ts
  /*
   * Read live, no cache, BOTH rows — the habit this file already had, extended to the second
   * surface. A wardrobe or a venue saved on /admin/image-generation thirty seconds ago is in this
   * prompt, with no invalidation step anywhere.
   *
   * Two indexed primary-key reads, issued together rather than in series, on a path that already
   * did one (`ninaImageQuotaLeft`) and is about to spend eighty seconds at OpenRouter. Neither can
   * fail independently in a way the other could recover from, so `Promise.all` is the honest shape.
   */
  const [tuning, prefs] = await Promise.all([readNinaTuning(userId), readNinaImagePrefs(userId)])
  const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene, mood, tuning, prefs })
```

**Code — extend the `── WHY IT READS THE TUNING ITSELF ──` docblock at `:35-40`, appending one
paragraph inside the same block comment:**

```ts
 * The same argument now covers `nina_image_prefs`, and it is why `NinaSelfieRequest` gained no
 * `prefs` field: reading both rows here is what lets `imagetools.ts` and `promises.ts` get the
 * operator's wardrobe, venue, time, notes, focus set and prompt length without either file being
 * edited. Neither belongs to this phase, and neither was touched.
```

**Impact:** `lib/nina/imagetools.ts` and `lib/nina/promises.ts` get every new preference with zero
edits, because both call `generateNinaSelfie({ userId, scene, mood, replyToId })` and
`NinaSelfieRequest` is unchanged.

---

### Step 5: `avatargen.ts` — the same, and the avatar's zero-edit property preserved

**File:** `lib/nina/avatargen.ts:8` and `:86-96`
**Change:** the same two edits.

**Code — replace `:8`:**

```ts
import { readNinaImagePrefs, readNinaTuning } from './queries'
```

**Code — replace `:86-96` (the comment block, the `readNinaTuning` await and the
`buildNinaImagePrompt` call):**

```ts
  /*
   * Read live, no cache, BOTH rows — same as the chat selfie and for the same reason: a wardrobe or
   * a venue saved on /admin/image-generation is in the next photograph with no invalidation step.
   *
   * `NinaAvatarRequest` is deliberately NOT given a `tuning` or a `prefs` field. VERIFIED, not
   * assumed: `lib/nina/avatartools.ts:85-89` calls this function with exactly
   * `{ userId, scene, source }`, so reading both rows here is what lets the `set_avatar` chat tool
   * and the admin album's Generate button pick up every new preference with those files unopened.
   * That property is why the wardrobe landed with zero edits to `avatartools.ts` when F34 R5
   * shipped, and it is preserved here on purpose rather than by luck.
   */
  const [tuning, prefs] = await Promise.all([readNinaTuning(userId), readNinaImagePrefs(userId)])
  const prompt = buildNinaImagePrompt({ purpose: 'avatar', scene, mood, tuning, prefs })
```

**Impact:** `lib/nina/avatartools.ts` unchanged, asserted by inspection above and by
`npm run typecheck` passing without touching it.

---

### Step 6: `tests/nina.imagerecipe.test.ts` — the new contract, stated

**File:** `tests/nina.imagerecipe.test.ts:1-32` and `:66-210`
**Change:** extend the imports; replace the whole `describe('the prompt', ...)` block. The four
other describes (`the payload`, `the pathname`, `the reported cost`, `jakartaDayStart`,
`the threshold chain`) are **not touched** — in particular `sends NO reference image (RU-18)` at
`:57-63` stays exactly as it is, because it is phase 3's to restate.

**Code — add to the imports at the top of the file, after the existing `@/lib/nina/imagegen` line:**

```ts
import {
  buildNinaImagePrompt,
  NINA_PROMPT_LENGTH_FALLBACK,
  NINA_PROMPT_RUNGS,
  sidecarText,
} from '@/lib/nina/imagegen'
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_PREFS_DEFAULTS,
  type NinaImageFocusKey,
  type NinaImagePrefs,
} from '@/lib/nina/imageprefs'
import { NINA_APPEARANCE, ninaAppearance } from '@/lib/nina/persona'
import { NINA_BAND_NAMES } from '@/lib/nina/tuning'
```

(The existing `import { buildNinaImagePrompt, sidecarText } from '@/lib/nina/imagegen'` at `:3` is
replaced by the first of these; the existing
`import { NINA_TUNING_DEFAULTS, type NinaTrait, type NinaTuning } from '@/lib/nina/tuning'` at `:5`
stays and `NINA_BAND_NAMES` is added to it rather than imported twice.)

**Code — replace `describe('the prompt', ...)` at `:66-210` in full:**

```ts
describe('the prompt', () => {
  /** The four facts R1 says must ALWAYS be explicitly instructed, in the user's own words. */
  const BODY_FACTS = ['big boobs', 'bubble butt', 'big thighs', 'very long calves'] as const

  /** One field moved off the defaults, everything else exactly as it ships. */
  function tuned(over: Partial<NinaTuning>): NinaTuning {
    return { ...NINA_TUNING_DEFAULTS, ...over }
  }

  /** One TRAIT moved. The traits are nested under `traits`. */
  function withTrait(key: NinaTrait, value: number): NinaTuning {
    return tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, [key]: value } })
  }

  /** One or more prefs moved off phase 1's defaults. */
  function prefsWith(over: Partial<NinaImagePrefs>): NinaImagePrefs {
    return { ...NINA_IMAGE_PREFS_DEFAULTS, ...over }
  }

  /** Exactly these focus keys on, every other one off. Keyed by NAME, not by index, so it does not
   * care what order phase 1 declared the vocabulary in. */
  function focusOnly(
    ...on: readonly NinaImageFocusKey[]
  ): Readonly<Record<NinaImageFocusKey, boolean>> {
    const focus = {} as Record<NinaImageFocusKey, boolean>
    for (const key of NINA_IMAGE_FOCUS_KEYS) focus[key] = on.includes(key)
    return focus
  }

  /** The 2^6 subsets of the focus vocabulary, as a bit mask over its declared order. */
  function focusMask(mask: number): Readonly<Record<NinaImageFocusKey, boolean>> {
    const focus = {} as Record<NinaImageFocusKey, boolean>
    NINA_IMAGE_FOCUS_KEYS.forEach((key, i) => {
      focus[key] = (mask & (1 << i)) !== 0
    })
    return focus
  }

  /** One score inside each of the five bands, lowest first. */
  const BAND_FLOORS = [0, 20, 40, 60, 80] as const

  it('carries her appearance, the scene, and the photographic style', () => {
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' })
    expect(prompt).toContain('on the track')
    expect(prompt).toContain('high ponytail')
    expect(prompt).toContain('Realistic photograph')
  })

  it('puts the mood AFTER the scene, as a refinement', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      mood: 'smug, out of breath',
    })
    expect(prompt.indexOf('smug')).toBeGreaterThan(prompt.indexOf('on the track'))
  })

  it('the avatar variant asks for head and shoulders', () => {
    expect(buildNinaImagePrompt({ purpose: 'avatar', scene: 'x' })).toContain('head and shoulders')
  })

  it('never claims a reference image is authoritative', () => {
    // The first draft's subject line said "this is the same woman as the reference image". RU-18
    // removed the reference, and an instruction to defer to an absent image degrades the prompt.
    // The reference this plan set adds is a PAYLOAD concern and stays out of the prompt.
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'x' })
    expect(prompt.toLowerCase()).not.toContain('reference')
  })

  it('the sidecar records prompt, model and seed, and says there is no reference', () => {
    const text = sidecarText({ prompt: 'p', seed: 42, purpose: 'selfie' })
    expect(text).toContain(NINA_IMAGE_MODEL)
    expect(text).toContain('seed:       42')
    expect(text).toContain('reference:  none (RU-18)')
    expect(text).toContain('--- prompt as sent ---')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R1 — THE BODY CANON
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('PLAN INVARIANT 4: EVERY combination of prefs names all four body facts', () => {
    /*
     * The requirement the user actually wrote down — *"always explicitly instruct these in the
     * prompt"* — proved as a PROPERTY over the whole input space rather than as four examples,
     * because "always" is a claim about every setting and four examples cannot be that.
     *
     * 2 purposes x 5 bands x all 64 focus subsets x {every free-text field empty, every one set}
     * = 1280 prompts. The focus multi-select is EMPHASIS layered on an unconditional canon, so
     * mask 0 (nothing selected) must name the body exactly as loudly as mask 63 does.
     */
    let checked = 0
    for (const purpose of ['selfie', 'avatar'] as const) {
      for (const promptLength of BAND_FLOORS) {
        for (let mask = 0; mask < 1 << NINA_IMAGE_FOCUS_KEYS.length; mask += 1) {
          for (const text of ['', 'Kuta streets in Bali']) {
            const prompt = buildNinaImagePrompt({
              purpose,
              scene: 'on the track',
              mood: text,
              tuning: text === '' ? null : NINA_TUNING_DEFAULTS,
              prefs: prefsWith({
                promptLength,
                focus: focusMask(mask),
                wardrobe: text,
                venue: text,
                time: text,
                notes: text,
              }),
            })
            for (const fact of BODY_FACTS) {
              expect(
                prompt,
                `${purpose} / length ${promptLength} / focus ${mask} / text "${text}" lost "${fact}"`,
              ).toContain(fact)
            }
            checked += 1
          }
        }
      }
    }
    expect(checked).toBe(2 * BAND_FLOORS.length * 64 * 2)
  })

  it('PLAN INVARIANT 4: and with no prefs at all, and at the stored defaults', () => {
    // The two boundary inputs the property loop cannot express: a caller that passes nothing, and
    // a user with no row (`readNinaImagePrefs` returns exactly this object).
    for (const prefs of [null, NINA_IMAGE_PREFS_DEFAULTS]) {
      for (const purpose of ['selfie', 'avatar'] as const) {
        const prompt = buildNinaImagePrompt({ purpose, scene: 'x', prefs })
        for (const fact of BODY_FACTS) expect(prompt).toContain(fact)
      }
    }
  })

  it('R1: the SUBJECT paragraph leads with the body and the face follows it', () => {
    /*
     * *"i dont care about her face, i care a lot about her voluptuous body"* is a priority
     * statement, so the face keeps its sentences and loses its primacy. This asserts the ORDER,
     * which is the half of R1 a containment check cannot see.
     */
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'x' })
    expect(prompt.indexOf('big boobs')).toBeLessThan(prompt.indexOf('high ponytail'))

    // The canon constant and the assembled prompt agree, because there is one source and not two.
    expect(NINA_APPEARANCE.indexOf('big boobs')).toBeLessThan(
      NINA_APPEARANCE.indexOf('high ponytail'),
    )
    expect(ninaAppearance(NINA_IMAGE_PREFS_DEFAULTS)).toBe(NINA_APPEARANCE)
  })

  it("R1: the old subject paragraph's contradicting body clause is gone", () => {
    /*
     * `NINA_FACE` used to carry "Lean, visibly muscular runner's build — defined quadriceps and
     * calves, narrow shoulders", which the analysis names as defect 2: a body clause in a face
     * constant, and the opposite of what the user asked for. Its muscle survives in the body
     * canon; `Lean` and `narrow shoulders` are repealed, and this is the assertion that says so.
     */
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'x' })
    expect(prompt).not.toContain("Lean, visibly muscular runner's build")
    expect(prompt).not.toContain('narrow shoulders')
    expect(prompt).toContain('never lean and never slight')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE RESTATED COMPATIBILITY CONTRACT
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('RESTATED CONTRACT: the arguments are optional, and the defaults render the same string', () => {
    /*
     * ── WHAT THIS TEST USED TO SAY, AND WHY IT NO LONGER SAYS IT ──────────────────────────────
     * It used to be `PLAN INVARIANT 2: the default tuning renders the prompt that shipped, byte
     * for byte` — `imagegen.ts`'s "provable superset of the Nina who shipped". **R1 repeals that
     * half on purpose**: the body canon is unconditional, so no setting renders the old subject
     * paragraph any more. The claim is gone from the file header too, in the same commit; a comment
     * promising something the code stopped honouring would be worse than the change.
     *
     * TWO WEAKER PROPERTIES SURVIVE, AND THEY ARE THE ONES THAT CATCH A MISTAKE:
     *   1. OPTIONALITY — no arguments and the explicit defaults produce the SAME string, so this
     *      is still a pure function and no default reaches out to a database.
     *   2. ADDITIVITY — at the defaults, nothing the tuning or the prefs can contribute is
     *      present. A tuned or preferred clause leaking into the default render is a change nobody
     *      asked for, and it would pass every containment assertion in this file.
     */
    const none = buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' })
    const defaulted = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      tuning: NINA_TUNING_DEFAULTS,
      prefs: { ...NINA_IMAGE_PREFS_DEFAULTS, promptLength: NINA_PROMPT_LENGTH_FALLBACK },
    })
    expect(defaulted).toBe(none)

    for (const label of ['POSE AND PRESENCE', 'FOCUS:', 'VENUE:', 'TIME:', 'NOTES:']) {
      expect(defaulted, `${label} leaked into the default render`).not.toContain(label)
    }

    const noneAvatar = buildNinaImagePrompt({ purpose: 'avatar', scene: 'x' })
    expect(
      buildNinaImagePrompt({
        purpose: 'avatar',
        scene: 'x',
        tuning: NINA_TUNING_DEFAULTS,
        prefs: { ...NINA_IMAGE_PREFS_DEFAULTS, promptLength: NINA_PROMPT_LENGTH_FALLBACK },
      }),
    ).toBe(noneAvatar)
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R4 — THE PROMPT-LENGTH LADDER
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('R4: there is one rung per band, and the ladder is phase 1s vocabulary', () => {
    // Not a private scale. `/admin` renders the band name beside every slider, so a rung table with
    // a band the operator cannot see would be a slider he cannot predict.
    for (const band of NINA_BAND_NAMES) {
      expect(NINA_PROMPT_RUNGS[band].band).toBe(band)
      expect(NINA_PROMPT_RUNGS[band].bodySentences).toBeGreaterThanOrEqual(1)
    }
  })

  it('R4: the lowest rung is MATERIALLY shorter than the highest, and both name the body', () => {
    const at = (promptLength: number) =>
      buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'on the track',
        prefs: prefsWith({ promptLength }),
      })

    const shortest = at(0)
    const longest = at(100)
    // "Materially" made checkable: the bottom rung is under 60% of the top one.
    expect(shortest.length).toBeLessThan(longest.length * 0.6)
    for (const fact of BODY_FACTS) {
      expect(shortest).toContain(fact)
      expect(longest).toContain(fact)
    }
    // And the saving comes out of CANON prose, never out of a body fact.
    expect(shortest).not.toContain('high ponytail')
    expect(shortest).not.toContain('heather-grey racerback tank')
    expect(longest).toContain('high ponytail')
    expect(longest).toContain('heather-grey racerback tank')
  })

  it('R4: all five rungs are distinct and strictly longer than the one below', () => {
    // A slider with two settings that render the same string is a slider the operator cannot trust.
    const lengths = BAND_FLOORS.map(
      (promptLength) =>
        buildNinaImagePrompt({
          purpose: 'selfie',
          scene: 'on the track',
          mood: 'smug',
          tuning: withTrait('flirty', 100),
          prefs: prefsWith({ promptLength, focus: focusOnly(...NINA_IMAGE_FOCUS_KEYS) }),
        }).length,
    )
    for (let i = 1; i < lengths.length; i += 1) {
      expect(lengths[i]!, `band ${i} is not longer than band ${i - 1}`).toBeGreaterThan(
        lengths[i - 1]!,
      )
    }
  })

  it('R4: two scores in the same band render the same string — one vocabulary', () => {
    const at = (promptLength: number) =>
      buildNinaImagePrompt({ purpose: 'selfie', scene: 'x', prefs: prefsWith({ promptLength }) })
    expect(at(80)).toBe(at(100))
    expect(at(60)).toBe(at(79))
    expect(at(60)).not.toBe(at(80))
  })

  it('R4: only band `off` drops POSE AND PRESENCE; every rung above keeps it', () => {
    for (const promptLength of BAND_FLOORS) {
      const prompt = buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'x',
        tuning: withTrait('flirty', 100),
        prefs: prefsWith({ promptLength }),
      })
      if (promptLength < 20) expect(prompt).not.toContain('POSE AND PRESENCE:')
      else expect(prompt, `band at ${promptLength}`).toContain('POSE AND PRESENCE:')
    }
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R5 — FOCUS
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('R5: FOCUS is emphasis layered on the canon, never inclusion', () => {
    const noFocus = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100 }),
    })
    expect(noFocus).not.toContain('FOCUS:')
    for (const fact of BODY_FACTS) expect(noFocus).toContain(fact)

    const oneFocus = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100, focus: focusOnly('thighs') }),
    })
    expect(oneFocus).toContain('FOCUS: Emphasise her big thighs above everything else')
    expect(oneFocus).not.toContain('her bubble butt')
    expect(oneFocus.length).toBeGreaterThan(noFocus.length)
  })

  it('R5: the emphasis is a terse list at a low rung and full sentences at a high one', () => {
    const terse = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptLength: 0, focus: focusOnly('boobs', 'calves') }),
    })
    expect(terse).toContain(
      'FOCUS: Emphasise her big boobs and her very long calves above everything else in this photograph.',
    )
    expect(terse).not.toContain('deep cleavage line')

    const full = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100, focus: focusOnly('boobs', 'calves') }),
    })
    expect(full).toContain('deep cleavage line')
    expect(full).toContain('run most of the length of the frame')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R6 — THE WARDROBE, AND THE DEFECT IN THE USER'S OWN PASTE
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it("R6: the wardrobe gets a sentence boundary — the user's paste had none", () => {
    /*
     * The measured defect, from the dump he sent: `long pants She still has the black digital
     * watch`. `persona.ts:401` interpolated with no terminating punctuation, so the provider read
     * two sentences as one.
     */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      prefs: prefsWith({ wardrobe: 'long pants' }),
    })
    expect(prompt).toContain('long pants. She still has')
    expect(prompt).not.toContain('long pants She still has')
  })

  it('R6: and it does not double a stop the operator wrote himself', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ wardrobe: 'long hugging leggings with a string bra.' }),
    })
    expect(prompt).toContain('string bra. She still has')
    expect(prompt).not.toContain('string bra.. She still has')
  })

  it('R6: the PREFS wardrobe reaches the photograph and the TUNING wardrobe does NOT', () => {
    /*
     * The index's Decisions table: *"two wardrobes silently competing is the one outcome R3 cannot
     * mean"*. `nina_tuning.wardrobe` still EXISTS at this phase — phase 7 removes it — so this is
     * the assertion that proves the camera has stopped READING it.
     *
     * PHASE 7: delete the `tuning:` line below when `NinaTuning.wardrobe` goes, and keep every
     * other assertion in this test.
     */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      tuning: tuned({ wardrobe: 'a beige trench coat' }),
      prefs: prefsWith({ wardrobe: 'a black crop top and very short white running shorts' }),
    })
    expect(prompt).toContain('very short white running shorts')
    expect(prompt).not.toContain('a beige trench coat')
    // The wardrobe replaces the canon OUTFIT, never the person and never her home ground.
    expect(prompt).not.toContain('heather-grey racerback tank')
    expect(prompt).toContain('high ponytail')
    expect(prompt).toContain('red 400 m athletics track')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R7, R8, R9 — VENUE, TIME, NOTES
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('R7 R8 R9: what the operator typed is honoured at EVERY rung and on BOTH cameras', () => {
    // The ladder spends canon prose. It never discards a field somebody filled in — that would be a
    // control that silently does nothing, which is the failure `nina_tuning`'s header argues about.
    for (const promptLength of BAND_FLOORS) {
      for (const purpose of ['selfie', 'avatar'] as const) {
        const prompt = buildNinaImagePrompt({
          purpose,
          scene: 'on the track',
          prefs: prefsWith({
            promptLength,
            venue: 'Kuta streets in Bali',
            time: 'sunny day',
            notes: 'nina is full of sweat',
            wardrobe: 'long hugging leggings with a string bra',
          }),
        })
        const where = `${purpose} at band floor ${promptLength}`
        expect(prompt, where).toContain('VENUE: Kuta streets in Bali')
        expect(prompt, where).toContain('TIME: sunny day')
        expect(prompt, where).toContain('NOTES: nina is full of sweat')
        expect(prompt, where).toContain('long hugging leggings with a string bra.')
      }
    }
  })

  it('an empty free-text field adds no block at all', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      // ' ' rather than '' — a hand-run SQL update can write whitespace past phase 1's coercer.
      prefs: prefsWith({ venue: '   ', time: '', notes: ' ' }),
    })
    expect(prompt).not.toContain('VENUE:')
    expect(prompt).not.toContain('TIME:')
    expect(prompt).not.toContain('NOTES:')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE BLOCK ORDER
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('the block order is SUBJECT, FOCUS, POSE, VENUE, TIME, SCENE, EXPRESSION, NOTES', () => {
    /*
     * Every position is argued in `buildNinaImagePrompt`'s docblock. The two that were already
     * load-bearing are unchanged: POSE before SCENE because it is a standing property of the
     * subject, EXPRESSION after SCENE because it refines this photograph (the
     * `gen_badge_art.py --note` precedent). VENUE and TIME go before SCENE so the model reads
     * general-then-specific and a scene that names its own place wins. NOTES goes last, because it
     * must be able to amend everything above it.
     */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'at home in her rented room in Tebet',
      mood: 'smug, out of breath',
      tuning: withTrait('flirty', 100),
      prefs: prefsWith({
        promptLength: 100,
        focus: focusOnly(...NINA_IMAGE_FOCUS_KEYS),
        venue: 'Kuta streets in Bali',
        time: 'rainy night',
        notes: 'nina is full of sweat',
      }),
    })
    const order = [
      'SUBJECT:',
      'FOCUS:',
      'POSE AND PRESENCE:',
      'VENUE:',
      'TIME:',
      'SCENE:',
      'EXPRESSION AND ENERGY:',
      'NOTES:',
    ]
    let cursor = -1
    for (const label of order) {
      const at = prompt.indexOf(label)
      expect(at, `${label} is missing or out of order`).toBeGreaterThan(cursor)
      cursor = at
    }
    expect(prompt.trimEnd().endsWith('NOTES: nina is full of sweat')).toBe(true)
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE TWO DIALS — UNCHANGED BEHAVIOUR
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('a high steamy dial adds a POSE AND PRESENCE block, before the scene', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      mood: 'smug',
      tuning: withTrait('steamy', 100),
    })
    expect(prompt).toContain('POSE AND PRESENCE:')
    expect(prompt.indexOf('POSE AND PRESENCE:')).toBeLessThan(prompt.indexOf('SCENE:'))
    expect(prompt.indexOf('SCENE:')).toBeLessThan(prompt.indexOf('EXPRESSION AND ENERGY:'))
  })

  it('a high flirty dial reaches BOTH cameras; a high steamy dial reaches only the selfie', () => {
    /*
     * `NINA_AVATAR_STYLE` asks for head and shoulders in a 28-44 px circle. A pose instruction
     * about her hips under that crop is a prompt arguing with itself. UNCHANGED by this phase, and
     * the same rule now decides which focus keys the avatar honours.
     */
    const steamyAvatar = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      tuning: withTrait('steamy', 100),
    })
    expect(steamyAvatar).not.toContain('POSE AND PRESENCE')

    const flirtyAvatar = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      tuning: withTrait('flirty', 100),
    })
    expect(flirtyAvatar).toContain('POSE AND PRESENCE:')
    expect(flirtyAvatar).toContain('straight down the lens')
  })

  it('a dial just below the threshold adds nothing at all', () => {
    const quiet = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      /* 59 is the top of band `mid`; 60 is the first score in `high`. One vocabulary. */
      tuning: tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, steamy: 59, flirty: 59 } }),
    })
    expect(quiet).toBe(buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' }))
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE AVATAR CROP
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('the avatar names the body ONCE and reconciles the crop in words', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100, focus: focusOnly(...NINA_IMAGE_FOCUS_KEYS) }),
    })
    expect(prompt).toContain('head and shoulders')
    for (const fact of BODY_FACTS) expect(prompt).toContain(fact)
    // The contradiction is resolved out loud instead of being left for the model.
    expect(prompt).toContain('even though this photograph is cropped to her head and shoulders')
    // One sentence, not five, at EVERY rung: more body prose under a face crop is more
    // contradiction, not more detail.
    expect(prompt).not.toContain('narrow ankle')
    expect(prompt).not.toContain('flattening into it')
  })

  it('the avatar FOCUS keeps face and skin and drops the four whole-body keys', () => {
    const bodyOnly = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      prefs: prefsWith({
        promptLength: 100,
        focus: focusOnly('boobs', 'butt', 'thighs', 'calves'),
      }),
    })
    // Dropped, never substituted. The body is still named by `NINA_BODY_AVATAR`.
    expect(bodyOnly).not.toContain('FOCUS:')
    for (const fact of BODY_FACTS) expect(bodyOnly).toContain(fact)

    const cropSafe = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100, focus: focusOnly('face', 'skin') }),
    })
    expect(cropSafe).toContain('FOCUS:')
    expect(cropSafe).toContain('lit well enough to read her expression')
    expect(cropSafe).not.toContain('her bubble butt')
  })

  it('still never claims a reference image is authoritative, at any setting', () => {
    /* RU-18. None of the new clauses may reintroduce the word — an instruction to defer to an
     * image that is not in the payload degrades the prompt, and phase 3 puts the reference in the
     * PAYLOAD and not in the prose. */
    for (const purpose of ['selfie', 'avatar'] as const) {
      const prompt = buildNinaImagePrompt({
        purpose,
        scene: 'x',
        mood: 'smug',
        tuning: tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, steamy: 100, flirty: 100 } }),
        prefs: prefsWith({
          promptLength: 100,
          focus: focusOnly(...NINA_IMAGE_FOCUS_KEYS),
          wardrobe: 'a red bikini',
          venue: 'Kuta streets in Bali',
          time: 'sunny day',
          notes: 'nina is full of sweat',
        }),
      })
      expect(prompt.toLowerCase()).not.toContain('reference')
    }
  })
})
```

**Impact:** the file's other five describes are unchanged, so phase 3 can restate
`sends NO reference image (RU-18)` and the threshold chain without touching a line this phase wrote.

---

### Step 7: `docs/nina/persona.md` — the canon in prose, in the same commit

**File:** `docs/nina/persona.md:239-255`
**Change:** `lib/nina/persona.ts:1-5` makes this mandatory: *"When they disagree, the document is
the intent and this file is what ships: fix this file, then fix the document, in one commit."*
Replace from `The anchor is` through the end of the `**The wardrobe is overridable (F34 R5).**`
paragraph (ending `...a photograph that has not been taken.`) with the text below. The
`## What she looks like` heading above it and the `## The tuning` heading below it both stay.

**Code:**

```markdown
The anchor is `assets/nina/_anchor.png` (`nina.png`, promoted in phase 1). `NINA_APPEARANCE` is
her in words, in three paragraphs — body, face, outfit — and phase 12 sends that text alongside the
anchor:

She is voluptuous: big boobs, a bubble butt, big thighs and very long calves. This silhouette is
the point of the photograph and it must be visible in it. Her chest is full and heavy, her hips are
wide and her waist is narrow. Her butt is round, high and prominent. Her thighs are thick and
strong, with a runner's muscle under soft skin. Her calves are very long and full, defined down to
a narrow ankle, on legs that are unusually long for her height. She is curvy and heavy-bodied,
never lean and never slight.

A woman in her late twenties, mixed Southeast Asian and Mediterranean features, olive skin with a
warm undertone. Long dark brown hair in a high ponytail with loose strands at the temples. Dark
brown eyes, thick straight eyebrows, no makeup, a wide open smile. Usually a little sweaty.

Default outfit: heather-grey racerback tank, black fitted running shorts, white running shoes, a
black digital watch on her left wrist, a white towel over one shoulder, a blue water bottle in one
hand. Her home ground is a red 400 m athletics track beside a green field, in flat morning sun.

**The body is unconditional and it leads (R1).** The user asked for it in writing — *"i dont care
about her face, i care a lot about her voluptuous body: big boobs, bubble butt, big thighs, very
long calves. always explicitly instruct these in the prompt"* — and "always" is the whole
requirement. No setting on `/admin/image-generation` can remove a body fact: the focus multi-select
adds emphasis clauses on top of the canon, and the prompt-length slider spends more or fewer body
sentences but never fewer than one, which names all four. `NINA_FACE` keeps every one of its
sentences and loses its primacy; the one body clause it used to carry — "Lean, visibly muscular
runner's build, narrow shoulders" — moved into the body paragraph, and `Lean` and `narrow shoulders`
were repealed there because they contradict it.

**The wardrobe is overridable, and it lives on the image surface.** `NINA_FACE` is the anchor and
never moves — a description that fights `assets/nina/_anchor.png` fights it on every generation. The
outfit paragraph is separate, and `nina_image_prefs.wardrobe` replaces it: `ninaAppearance(prefs)`
swaps the clothes, keeps the body, keeps the face and keeps the track. This reaches the image prompt
only. It is not in her system prompt, because what she is wearing is a fact about a photograph that
has not been taken.
```

**Impact:** the doc matches the code. Phase 7 edits this same section again to retire
`nina_tuning.wardrobe` from the prose; it depends on this phase, so the edits are sequential.

---

## Verification

**Precondition — this worktree has no `node_modules` and no `.env.local`.** Both are required
before any command below: `lib/env.ts` validates fourteen variables at module load, so `vitest`,
`tsc` and `eslint` all die on a fresh worktree until both exist.

```bash
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab
cp /home/miftah/run-insights/.env.local .env.local   # or however this machine keeps it
npm install
```

**Build:**

```bash
npm run typecheck
npm run lint
```

`typecheck` is the load-bearing one: it proves `ninaAppearance`'s nominal `NinaImagePrefs`
parameter has no remaining `NinaTuning` caller anywhere in the tree, and it proves
`avatartools.ts`, `imagetools.ts` and `promises.ts` compile **unedited**.

**Tests:**

```bash
npm test -- tests/nina.imagerecipe.test.ts
npm test -- tests/nina.prompts.test.ts
npm test
```

The middle command is not redundant: it is the check that `NINA_APPEARANCE`'s reorder did not move
`NINA_SYSTEM_PROMPT` or its snapshot. Verified fact 1 says it cannot; the test says it did not.

**Guards** (none of them should have anything to say about this phase, and that is worth
confirming rather than assuming):

```bash
npm run ci:openrouter-guard
npm run ci:llm-payload-guard
npm run ci:data-layer-guard
```

**Manual check — read one prompt.** The user's complaint was about a real
`sidecarText()` dump, so the deliverable is inspectable text. In a Node REPL after `npm install`:

```bash
npx vitest run --reporter=verbose tests/nina.imagerecipe.test.ts
```

then read the failure messages if any; for a positive look at the output, temporarily
`console.log` the result of the block-order test's prompt. What to look for, in order:
the subject paragraph opens with `She is voluptuous: big boobs, a bubble butt, big thighs and very
long calves.`; the wardrobe line reads `long pants. She still has` and not `long pants She still
has`; `VENUE:` and `TIME:` sit above `SCENE:`; `NOTES:` is the last line in the string.

**Exit criteria:**

1. `git diff --stat` touches exactly six files: `lib/nina/persona.ts`, `lib/nina/imagegen.ts`,
   `lib/nina/selfiegen.ts`, `lib/nina/avatargen.ts`, `tests/nina.imagerecipe.test.ts`,
   `docs/nina/persona.md`.
2. `git diff --stat drizzle/ lib/db/ lib/admin/ components/ app/ scripts/` is **empty**.
3. `grep -n 'tuning.wardrobe\|tuning\.wardrobe' lib/nina/persona.ts lib/nina/imagegen.ts` returns
   nothing, and `grep -rn 'wardrobe' lib/nina/tuning.ts` still returns its four hits — the column's
   retirement is phase 7's and this phase did not start it.
4. `npm test` is green, whole suite.
5. The property test reports `checked === 1280` and passes: every combination names all four body
   facts.
6. The five rungs are strictly increasing in length, and band `off` is under 60% of band `max`.
7. `npm run typecheck` passes with `lib/nina/avatartools.ts` unmodified.

---

## Handoffs

**To Phase 1 — the exact contract this phase compiled against** is the Requires table above. The
one name-level coupling is the six focus-key spellings; everything else this phase reads is a type
or a default value it does not depend on numerically.

**To Phase 3 — the reference stays out of the prose.** `sidecarText`'s `reference:  none (RU-18)`
line and `tests/nina.imagerecipe.test.ts`'s `sends NO reference image (RU-18)` describe are both
untouched here and are yours to restate. Note that this phase's tests assert
`prompt.toLowerCase()).not.toContain('reference')` at **every** setting including all six focus keys
and all four free-text fields — so if a reference sentence is ever wanted in the prompt, that
assertion is the one to argue with first, and `imagegen.ts`'s header records why the first draft's
version of it was deleted.

**To Phase 4 — three things you can rely on.**
- The pure assembler for the preview is `buildNinaImagePrompt` itself. It is not a model call, does
  no I/O, and its whole import chain is free of `server-only`, so `ci:llm-payload-guard` Rule 2 is
  satisfied by construction. Call it with `{ purpose: 'selfie', scene: <a sample>, mood: null,
  tuning, prefs: draft }`.
- `NINA_PROMPT_RUNGS` is exported and is the honest source for a "what this rung includes"
  explainer beside the slider, if you want one. The band name to show comes from `ninaBand`.
- The prompt-length slider's units are the repo's five bands, so `DialSlider` needs no new scale.

**To Phase 6 — `buildNinaImagePrompt`'s signature is third-caller-safe.** `purpose` and `scene` are
the only required members; `mood`, `tuning` and `prefs` are all optional. `imagetest.ts` should read
the **saved** prefs (`readNinaImagePrefs`) rather than a draft, so the test measures the prompt the
chat would actually send.

**To Phase 7 — four precise things.**
1. `ninaAppearance(prefs: NinaImagePrefs, detail?: NinaAppearanceDetail): string`. It reads
   `prefs.wardrobe` and nothing from `NinaTuning`. The parameter is nominal on purpose, so nothing
   in the tree can still hand it a tuning.
2. `tests/nina.imagerecipe.test.ts`'s test *"R6: the PREFS wardrobe reaches the photograph and the
   TUNING wardrobe does NOT"* holds `tuning: tuned({ wardrobe: 'a beige trench coat' })`. Delete
   that one line when `NinaTuning.wardrobe` goes, and keep every other assertion in the test.
3. `docs/nina/persona.md`'s *"What she looks like"* section was rewritten by this phase. Your prose
   edit lands on that text, not on today's.
4. `lib/nina/.workflows/package_readme.md` lines 275, 291, 333-334, 443 and 1090 describe
   `ninaAppearance`, `NINA_FACE`, `NINA_APPEARANCE` and the image prompt as they were before this
   phase. They are stale from this phase's commit onward. The index gives the two
   `package_readme.md` files to phase 7; the readme-updater subagent that runs after each phase is
   the other route.

**Found and deliberately not done here:**
- `NINA_WARDROBE_MAX = 200` (`lib/nina/tuning.ts:711`) is a sentence about clothes. The new
  free-text bounds for wardrobe / venue / time / notes are phase 1's, in `imageprefs.ts`. This
  phase asserts nothing about a length because it never truncates — it takes whatever phase 1's
  coercers hand it.
- `lib/nina/prompts/tools.ts:216`'s comment says `scene` deliberately does not ask her to describe
  herself "because `NINA_APPEARANCE` does". Still true and even truer now. No edit.
- `NINA_IMAGE_RESOLUTION = '1K'` and `NINA_IMAGE_ASPECT = '3:4'` are the other two candidate
  explanations for "mediocre result", and the index puts both out of scope. Left alone.

---

## Rollback

`git revert <this phase's commit>`. Nothing else.

There is no database step, no migration, no Blob pathname change and no wire-format change, so the
revert is total. Specifically:

- `nina_turns.args.prompt` holds the fully assembled prompt as a plain string
  (`imagerecipe.ts:294-311`), so a job **already in flight** when the revert lands is unaffected:
  the worker sends the stored bytes and never re-assembles. A photograph generated from a
  body-canon prompt still arrives after the revert, which is correct.
- `nina_image_prefs` rows written by phase 1 or phase 4 simply stop being read. No cleanup.
- `nina_tuning.wardrobe` was never modified by this phase, so reverting restores the old reader and
  the old value is still in the column.

If only part of the phase needs undoing, the natural seam is Step 3's `NINA_PROMPT_RUNGS` table:
setting all five rungs to the `max` row turns the length ladder off without touching the body canon,
the focus clauses or the three free-text blocks.
