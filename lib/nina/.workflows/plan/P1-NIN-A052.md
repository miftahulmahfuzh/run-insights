> Adopted from `NINA_IMAGEGEN_PROPORTION_FIX_PLAN.md` phase 1. Source: `.workflows/plan/nina-imagegen-proportion-fix/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: Tune the selfie camera block and calves focus term against the three named problems

**Plan set:** `NINA_IMAGEGEN_PROPORTION_FIX_PLAN.md`
**Analysis:** `20260916-125731-A1B2_code_analyzer.md`
**Satisfies:** R3 (explicit instructions / inline negative clauses against selfie framing, oversized head, undersized feet and calves), R4 (landed in `lib/nina/imagegen.ts`, the code path a later promotion step picks up)
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

`buildNinaImagePrompt({ purpose: 'selfie', ... })` renders a camera block that names the
photographer (someone else, a few steps away), rules out arm's-length / phone-in-hand / mirror
framing in the inline "no X" style this codebase already proves, and states a flat-perspective
lens, distance and head-to-body proportion with the whole body — feet included — inside the frame.
The `calves` focus term stops asking only for length and asks for full, in-proportion, uncropped
feet at the end of those calves. Every unrelated clause of the camera block (`no studio lighting,
no retouching, no text, no watermark, no logo, no border`, `Realistic photograph, not an
illustration and not a render`) survives verbatim, and RU-18 still holds — the word "reference"
appears nowhere in any render.

## Interface Contract

**Deletes:** nothing (no symbol removed)
**Renames:** nothing
**Creates:** nothing (no new exported symbol; two new `it(...)` blocks in `tests/nina.imagerecipe.test.ts`)
**Signature changes:** none
**Value changes (module-private constants, no type change):**
- `NINA_SELFIE_STYLE` (`lib/nina/imagegen.ts:82`) — 284 chars -> 1075 chars. It is interpolated
  into the exported `NINA_PROMPT_TEMPLATE_DEFAULT` (`lib/nina/imagegen.ts:432`), which therefore
  grows from ~1234 to ~2025 chars — still well under `NINA_PROMPT_TEMPLATE_MAX` (4000,
  `lib/nina/imageprefs.ts:686`) and under `lib/admin/schema.ts:796`'s `.max()`.
- `NINA_FOCUS_EMPHASIS.calves.term` (`lib/nina/imagegen.ts:334`) — `'her very long calves'` ->
  `'her very long calves down to full, in-proportion, uncropped feet'`.
- `ninaPhotoPresence`'s `steamy` clause (`lib/nina/imagegen.ts:143-147`) — the trailing phrase
  `the phone held close` -> `holding the pose for the person photographing her`. **This is a
  one-clause widening of the phase's stated Owns list; see Step 3 for why it is required rather
  than optional, and Handoffs for the alternative that was rejected.**

**Requires (from earlier phases):** nothing — this is the only phase in the set.
**Leaves alone (not this phase's, and asserted so by the tests that must keep passing):**
- `NINA_AVATAR_STYLE` / `NINA_AVATAR_STYLE_SHORT` / `NINA_AVATAR_FOCUS_KEYS` (`imagegen.ts:90,97,352`)
- `NINA_FOCUS_EMPHASIS.calves.sentence` and every other key's `.term` / `.sentence`
- `NINA_PROMPT_TEMPLATE_DEFAULT`'s line order and token set (`imagegen.ts:431-455`) — only the
  interpolated `NINA_SELFIE_STYLE` value moves
- `lib/nina/persona/appearance.ts` (`NINA_BODY_FACTS` still spells `big boobs and very long calves`,
  which is what `tests/nina.imagerecipe.test.ts:191`'s `BODY_FACTS` checks on every render)
- `lib/nina/prompts/tools.ts` (`GENERATE_IMAGE_TOOL.description`)
- `NINA_IMAGE_FOCUS_SPECS.calves.label` (`lib/nina/imageprefs.ts:220`, `'Very long calves'`) — the
  admin checkbox label is copy, not prompt text; it stays as the user's own words.
- `nina_image_prefs.prompt_template` (the DB row) — no migration, no data write (see Handoffs).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imagegen.ts` | modify | `NINA_SELFIE_STYLE` + its docblock (`:69-82`); `NINA_FOCUS_EMPHASIS.calves.term` (`:334`); the `steamy` presence clause (`:143-147`) |
| `tests/nina.imagerecipe.test.ts` | modify | update the exact-string FOCUS assertion (`:601-603`); add one camera-block test after `:256`; add one FOCUS-join test after `:623` |

**Grep evidence that the file list is complete** (run in the worktree, `--include="*.ts"
--include="*.tsx"`, `node_modules` excluded):

- `her very long calves` as a **prompt term** appears in exactly one test assertion,
  `tests/nina.imagerecipe.test.ts:602`.
- `very long calves` elsewhere is either canon text owned by `lib/nina/persona/appearance.ts`
  (`NINA_BODY_FACTS`, reached by `tests/nina.imagerecipe.test.ts:191`'s `BODY_FACTS` — unchanged by
  this phase, so those assertions keep passing), an admin **label**
  (`lib/nina/imageprefs.ts:220`), or prose in a docblock/comment
  (`tests/admin.imagegen.test.ts:101`, `components/admin/ImageGenPanel.tsx:55`,
  `lib/admin/imageGenModel.ts:46`, `lib/db/schema/nina/config.ts:259,273`,
  `lib/nina/persona/appearance.ts:24,34,58`, `tests/nina.shortcutsImport.test.ts:88`).
- `NINA_SELFIE_STYLE`'s current text (`DSLR photograph`, `slightly imperfect framing`, `as if taken
  and sent in a chat app`) is asserted nowhere. The only camera assertion on the selfie path is
  `tests/nina.imagerecipe.test.ts:234`, `expect(prompt).toContain('Realistic photograph')`, which
  the new text keeps.
- `the phone held close` / `weight on one hip` / `fully aware of the camera` appear **only** at
  `lib/nina/imagegen.ts:144-145`. No test pins them.
- `tests/admin.imagegen.test.ts`, `tests/admin.imageGenActions.test.ts`,
  `tests/admin.imagegenTest.test.ts`, `components/admin/ImageGenPanel.test.tsx` and
  `components/admin/ImageGenTestPanel.test.tsx` contain **no** assertion on the old calves term or
  on any `NINA_SELFIE_STYLE` text. **The phase scope does not need to widen for them.**

## Implementation Steps

### Step 1: Rewrite `NINA_SELFIE_STYLE` and the docblock that justifies it

**File:** `lib/nina/imagegen.ts:69-82` (replace the whole docblock + the `const` line)
**Change:** the camera block names the photographer, the lens, the distance, the proportion and the
whole-body framing; the negatives that have nothing to do with the three problems are carried over
character for character. The docblock's "asks for a phone photograph on purpose" / "verified
output — a convincing phone mirror-selfie" paragraph is the very claim the six sampled photographs
falsified, so it is replaced rather than left standing.

**Code (complete replacement for lines 69-82):**

```ts
/**
 * The photographic half. `NINA_APPEARANCE` is the WHO and this is the HOW; the scene she chose is
 * the WHAT.
 *
 * It still asks for a casual photograph rather than a magazine shoot. `GENERATE_IMAGE_TOOL`'s
 * description is "take a photo of yourself and send it", and a runner who receives a glossy studio
 * portrait has received something a friend did not send. This is the one place in the phase where
 * the aesthetic is decided, and it is decided here rather than in the tool schema so the model
 * cannot drift it — the tool description never reaches this string.
 *
 * ── WHY IT NO LONGER SAYS "A DSLR PHOTOGRAPH, AS IF TAKEN AND SENT IN A CHAT APP" ─────────────
 * That sentence named a camera nobody holds at arm's length and a habit everybody performs at
 * arm's length, and the ambiguity resolved the wrong way. Of the six production photographs
 * sampled on 2026-09-16 (gallery positions 1, 8, 11, 16, 21, 25 of 91), four are literal
 * arm's-length selfie compositions — an arm reaching toward the lens, the head filling the frame,
 * the legs foreshortened — and the full-body ones put the feet hard against the bottom edge. The
 * six `scene` arguments the chat model wrote are all third person ("She sits at a wooden table"),
 * so the selfie was coming from HERE and from nowhere else.
 *
 * So the block now names the photographer (another person, a few steps back), the lens and the
 * distance, the head-to-body proportion, and a frame with the whole body in it. Head size and
 * cropped feet share the near-field cause with the selfie framing, which is why one paragraph
 * addresses all three.
 *
 * ── WHY THE NEGATIVES ARE INLINE ──────────────────────────────────────────────────────────────
 * There is no `negative_prompt` field on this provider's `images/generations` call —
 * `buildImageRequestBody` (`lib/nina/imagerecipe.ts`) sends `model, prompt, resolution,
 * aspect_ratio, n, seed, input_references` and nothing else. Inline "no X" clauses in the positive
 * prompt are the mechanism this file has always used (the watermark/border/retouching run below),
 * and the new anti-selfie clauses use it too rather than inventing an unverified parameter.
 *
 * RU-18 still holds: no clause here may claim a picture that is not in the payload is
 * authoritative, and the word "reference" does not appear (`tests/nina.imagerecipe.test.ts:855`).
 */
const NINA_SELFIE_STYLE = `A candid photograph of her, taken by another person standing a few steps away. This is not a selfie: no raised arm reaching toward the camera, no phone and no hand held near the lens, no mirror and no mirror reflection, and she is not holding the camera herself. Shot on a 50 mm lens from about three metres back, at chest height, so the perspective is flat and human: her head is normal-sized and in natural proportion to her body, her legs read their full length, and nothing is stretched or squeezed by a close wide-angle. Frame her whole body with room to spare, the top of her head and her feet both comfortably inside the picture and floor visible below her feet; her feet and lower legs are never cropped, never flattened against the bottom edge and never shrunk by perspective. Natural daylight, slightly imperfect framing, shallow depth of field, visible skin texture, no studio lighting, no retouching, no text, no watermark, no logo, no border. Realistic photograph, not an illustration and not a render, the kind of picture a friend takes and sends in a chat app.`
```

**Impact:**
- Every selfie render (and `NINA_PROMPT_TEMPLATE_DEFAULT`, which interpolates this constant) grows
  by 791 characters. `/admin/image-generation`'s counter will read ~2025 / 4000 after a "Reset to
  default template".
- Existing assertions that must still pass, and do: `toContain('Realistic photograph')` (`:234`);
  `toLowerCase()).not.toContain('reference')` (`:255`, `:874`); the default-render leak check for
  `POSE AND PRESENCE` / `FOCUS:` / `VENUE:` / `TIME:` / `NOTES:` (`:449-451`) — none of those
  substrings occurs in the new text; `not.toContain('narrow shoulders')` (`:398`);
  `/\bx\b/` counting at `:1239` (that test supplies its own template and the new text has no
  standalone `x` anyway).
- The avatar path is untouched: `NINA_AVATAR_STYLE` / `_SHORT` are separate constants.

### Step 2: Widen `NINA_FOCUS_EMPHASIS.calves.term` to carry the feet

**File:** `lib/nina/imagegen.ts:333-336`
**Change:** `term` is the only part of this record that ever reaches a selfie prompt
(`ninaFocusBlock` — the only reader of `.sentence` — is avatar-only, and `calves` is not in
`NINA_AVATAR_FOCUS_KEYS`), so the feet clause has to ride on the term. The phrase is deliberately
built with **no internal `and` and no trailing preposition**, because the template appends
`above everything else in this photograph.` and `joinTerms` may prepend up to five other terms
(`a, b and c`). `.sentence` is left byte-identical — it is dead on every path today and reviving it
is out of scope per the plan's Decisions table.

**Code (complete replacement for lines 333-336):**

```ts
  calves: Object.freeze({
    /* The feet ride on the TERM and not on the sentence below, because `.sentence` is read only by
     * `ninaFocusBlock`, which is avatar-only, and `calves` is not an avatar focus key — so the
     * sentence never reaches a photograph. No internal "and" and no trailing preposition: the
     * template appends "above everything else in this photograph." and `joinTerms` can put five
     * other terms in front of this one. */
    term: 'her very long calves down to full, in-proportion, uncropped feet',
    sentence: `Her very long calves run most of the length of the frame, full and sharply defined all the way down to a narrow ankle.`,
  }),
```

**Rendered results (checked by hand against `joinTerms` at `imagegen.ts:355-358`, with `calves`
last in `NINA_IMAGE_FOCUS_KEYS`):**

```
FOCUS: Emphasise her very long calves down to full, in-proportion, uncropped feet above everything else in this photograph.
FOCUS: Emphasise her big boobs and her very long calves down to full, in-proportion, uncropped feet above everything else in this photograph.
FOCUS: Emphasise her face, her skin, her big boobs, her bubble butt, her big thighs and her very long calves down to full, in-proportion, uncropped feet above everything else in this photograph.
```

**Impact:** `tests/nina.imagerecipe.test.ts:602`'s exact string no longer matches — fixed in Step 4.
`BODY_FACTS`'s `'very long calves'` (`:191`) still matches, both from the SUBJECT paragraph
(`NINA_BODY_FACTS`) and from inside the new term. `oneFocus.length > noFocus.length` (`:590`) still
holds. The avatar assertions at `:828` (`not.toContain('narrow ankle')`) and `:842` (body-only focus
keys produce no `FOCUS:` on the avatar) are unaffected, because the term never reaches the avatar.

### Step 3: Stop the `steamy` presence clause from re-ordering the selfie back in

**File:** `lib/nina/imagegen.ts:142-147`
**Change:** the high-`steamy` clause currently ends `the phone held close`. After Step 1 the camera
block says there is no phone and she is not holding the camera, so at `steamy` band `high`+ the
prompt would argue with itself — the exact failure this file's header calls "a prompt arguing with
itself", and a direct contradiction of this phase's own exit criterion (a), which is stated for
*every existing test scenario* (`tests/nina.imagerecipe.test.ts:768`, `:786`, `:864` all render at
`steamy: 100`). The analysis also records that the POSE AND PRESENCE block was present in the
production prompts behind all six sampled photographs, so this clause is a live contributor to
problem 1 and not a hypothetical one.

**Scope note:** the plan index's Owns line for this phase names `NINA_SELFIE_STYLE` and
`NINA_FOCUS_EMPHASIS.calves.term`. This is one further clause in the same file, serving the same
requirement (R3, which this phase owns) and needed for this phase's own exit criteria to hold.
There is no other phase in the set, so no cross-phase conflict is possible. If a reviewer prefers
the narrower reading, dropping Step 3 leaves the tree green — it costs only the contradiction at
`steamy` band `high`+, and the phase must then say so in its exit criteria.

**Code (complete replacement for lines 142-147):**

```ts
  if (purpose === 'selfie' && isDialHigh(tuning.traits.steamy)) {
    clauses.push(
      'She is fully aware of the camera and commanding it: weight on one hip, body turned toward ' +
        'the lens, chin down, holding the pose for the person photographing her.',
    )
  }
```

**Impact:** no test asserts `the phone held close` (grep evidence above), so nothing goes red. The
clause keeps its register, its length and its `weight on one hip` / `body turned toward the lens`
opening; only the device in her hand goes away.

### Step 4: Update the one exact-string FOCUS assertion

**File:** `tests/nina.imagerecipe.test.ts:601-603` (inside
`it('R5, after the template: one emphasis line at every band — the rung sentences are gone from selfies')`, which starts at `:593`)
**Change:** swap the pinned string for the new term. Every other assertion in the test is kept
verbatim: the calves `.sentence` must still never appear on the selfie path, and the avatar `skin`
rung behaviour is unrelated and untouched.

**Code (complete replacement for the `it` block at lines 593-623):**

```ts
  it('R5, after the template: one emphasis line at every band — the rung sentences are gone from selfies', () => {
    const at = (promptLength: number) =>
      buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'x',
        prefs: prefsWith({ promptLength, focus: focusOnly('boobs', 'calves') }),
      })
    for (const promptLength of [0, 50, 100]) {
      expect(at(promptLength)).toContain(
        'FOCUS: Emphasise her big boobs and her very long calves down to full, in-proportion, uncropped feet above everything else in this photograph.',
      )
      /* The per-key elaboration sentences were rung-spent canon; the template's one line is the
       * whole emphasis now, and no rung brings the sentences back. */
      expect(at(promptLength)).not.toContain('deep cleavage line')
      expect(at(promptLength)).not.toContain('run most of the length of the frame')
    }
    /* The avatar path keeps the rung's sentence elaboration — the ladder lives there — for the
     * two keys the crop can honour (face, skin). `skin`'s sentence is the probe. */
    const avatarTerse = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      prefs: prefsWith({ promptLength: 0, focus: focusOnly('skin') }),
    })
    const avatarFull = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100, focus: focusOnly('skin') }),
    })
    expect(avatarTerse).not.toContain('visible pores')
    expect(avatarFull).toContain('visible pores')
  })
```

**Impact:** the one red this phase creates is closed. Note the line is long; prettier does not break
string literals, so `format:check` is satisfied by leaving it on one line (Step 5's verification
runs prettier to confirm).

### Step 5: Add the two new tests

**File A:** `tests/nina.imagerecipe.test.ts` — insert immediately **after** the existing
`it('never claims a reference image is authoritative', ...)` block, which closes at `:256`, and
before `it('the sidecar records prompt, model and seed, ...')` at `:258`. `prefsWith` (`:204`) and
`BAND_FLOORS` (`:228`) are already in scope there.

**Code (new block, inserted verbatim):**

```ts
  it('R3: the camera block rules out the selfie and states a human head-to-body proportion', () => {
    /*
     * 2026-09-16: four of six sampled production photographs (gallery positions 1, 8, 11, 16, 21,
     * 25 of 91) were literal arm's-length selfies, with an oversized head and feet crushed against
     * the bottom edge — one near-field cause behind all three complaints. There is no
     * `negative_prompt` field on this provider's call, so these are inline "no X" clauses in the
     * positive prompt, the same mechanism the watermark/border run has always used. The selfie
     * shell is one fixed string, so the assertion holds at every band floor.
     */
    for (const promptLength of BAND_FLOORS) {
      const prompt = buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'on the track',
        prefs: prefsWith({ promptLength }),
      })
      const where = `band floor ${promptLength}`
      // (a) somebody else is holding the camera, and none of the three selfie tells is allowed.
      expect(prompt, where).toContain('taken by another person standing a few steps away')
      expect(prompt, where).toContain('no raised arm reaching toward the camera')
      expect(prompt, where).toContain('no phone and no hand held near the lens')
      expect(prompt, where).toContain('no mirror and no mirror reflection')
      // (b) the optics that decide head size, and (c) the framing that decides whether feet survive.
      expect(prompt, where).toContain('Shot on a 50 mm lens from about three metres back')
      expect(prompt, where).toContain(
        'her head is normal-sized and in natural proportion to her body',
      )
      expect(prompt, where).toContain('her feet and lower legs are never cropped')
      /* The clauses that have nothing to do with the three problems were carried over character
       * for character — the R3 rewrite is not allowed to quietly drop them. */
      expect(prompt, where).toContain(
        'Natural daylight, slightly imperfect framing, shallow depth of field, visible skin texture',
      )
      expect(prompt, where).toContain(
        'no studio lighting, no retouching, no text, no watermark, no logo, no border',
      )
      expect(prompt, where).toContain('Realistic photograph, not an illustration and not a render')
    }
  })

  it('R3: a high steamy dial no longer puts a phone back in her hand', () => {
    /* The pose clause used to end "the phone held close", which contradicted the camera block
     * above at `steamy` band high+ — a prompt arguing with itself. */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      tuning: { ...NINA_TUNING_DEFAULTS, traits: { ...NINA_TUNING_DEFAULTS.traits, steamy: 100 } },
    })
    expect(prompt).toContain('POSE AND PRESENCE:')
    expect(prompt).toContain('holding the pose for the person photographing her')
    expect(prompt).not.toContain('the phone held close')
  })
```

> If Step 3 is dropped, drop this second `it(...)` block with it.

**File B:** `tests/nina.imagerecipe.test.ts` — insert immediately **after** the R5 block updated in
Step 4 (which closes at `:623` today) and before the `R6` comment banner at `:625`.

**Code (new block, inserted verbatim):**

```ts
  it('R3: the calves term asks for the feet too, and still reads as English when joined', () => {
    /*
     * `.term` is the ONLY part of `NINA_FOCUS_EMPHASIS.calves` that reaches a selfie —
     * `ninaFocusBlock`, the only reader of `.sentence`, is avatar-only and `calves` is not an
     * avatar focus key — so "her feet are too small" has to be fixed here. The term carries no
     * internal "and" and no trailing preposition precisely so that `joinTerms` and the template's
     * trailing "above everything else in this photograph." both still parse.
     */
    const alone = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ focus: focusOnly('calves') }),
    })
    expect(alone).toContain(
      'FOCUS: Emphasise her very long calves down to full, in-proportion, uncropped feet above everything else in this photograph.',
    )

    const joined = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ focus: focusOnly('boobs', 'calves') }),
    })
    expect(joined).toContain(
      'FOCUS: Emphasise her big boobs and her very long calves down to full, in-proportion, uncropped feet above everything else in this photograph.',
    )

    /* And with the whole vocabulary ticked: `calves` is last in `NINA_IMAGE_FOCUS_KEYS`, so the
     * long term lands at the end of the `a, b and c` list rather than inside it. */
    const everything = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ focus: focusOnly(...NINA_IMAGE_FOCUS_KEYS) }),
    })
    expect(everything).toContain(
      'FOCUS: Emphasise her face, her skin, her big boobs, her bubble butt, her big thighs and her very long calves down to full, in-proportion, uncropped feet above everything else in this photograph.',
    )
  })
```

**Impact:** `tests/nina.imagerecipe.test.ts` goes from 85 tests to 88 (85 baseline, measured green
before the change, plus three new `it` blocks — or 87 if Step 3 and its test are dropped). No
imports need to be added: `NINA_TUNING_DEFAULTS` (`:30`) and `NINA_IMAGE_FOCUS_KEYS` (`:13`) are
already imported at the top of the file.

## Verification

**Build:** `cd /home/miftah/.worktrees/run-insights/nina-imagegen-proportion-fix && npx tsc --noEmit`
(vitest does not typecheck; `next build`/`tsc` is the gate that does)

**Tests:**
```
cd /home/miftah/.worktrees/run-insights/nina-imagegen-proportion-fix
npx vitest run tests/nina.imagerecipe.test.ts
npx vitest run tests/nina.imageprefs.test.ts tests/admin.imagegen.test.ts tests/admin.imageGenActions.test.ts tests/admin.imagegenTest.test.ts
npx vitest run components/admin/ImageGenPanel.test.tsx components/admin/ImageGenTestPanel.test.tsx
npx prettier --check lib/nina/imagegen.ts tests/nina.imagerecipe.test.ts
```

**What was already checked while planning (so /implement knows what is measurement and what is
prediction):**
1. **Baseline measured green.** `npx vitest run tests/nina.imagerecipe.test.ts` in this worktree at
   `feature/nina-imagegen-proportion-fix`: `Test Files 1 passed (1) / Tests 85 passed (85)`. The
   worktree has a real `node_modules`.
2. **Every literal in Steps 1, 2 and 5 was machine-checked**, not eyeballed, with a scratch script
   (`/tmp/claude-1000/-home-miftah-run-insights/147730c8-1f32-4287-bc02-19e477b4c006/scratchpad/check.mjs`)
   that ran the real `joinTerms` grammar over the new term and searched the new camera block for:
   - every forbidden substring: `reference`, `POSE AND PRESENCE`, `FOCUS:`, `VENUE:`, `TIME:`,
     `NOTES:`, `narrow shoulders`, `narrow ankle`, `Lean, visibly muscular runner's build`,
     `heather-grey racerback tank`, `run most of the length of the frame`, `deep cleavage line`,
     `visible pores`, and a standalone `\bx\b` — **all absent**;
   - every substring Step 5 asserts and every carried-over clause — **all present**;
   - lengths: old 284, new 1075, delta +791 (default template ~1234 -> ~2025, cap 4000).
3. **The source edits themselves were not applied** — this is a planning task, so the post-change
   vitest run is /implement's to make. Steps 1-5 were written against the code as it stands at
   `lib/nina/imagegen.ts:69-82,142-147,333-336` and `tests/nina.imagerecipe.test.ts:593-623`, read
   in this worktree.

**Manual check (operator, not CI):** open `/admin/image-generation`, press **Reset to default
template** (`components/admin/ImageGenPanel.tsx:771`) so the textarea reloads the new shell, check
the counter reads about `2025 / 4000`, then use the test-generate button on a full-body scene and
look for: no arm reaching toward the lens, a head that reads normal against the torso, and both
feet inside the frame with floor under them.

**Exit criteria:** `npx vitest run tests/nina.imagerecipe.test.ts` passes with 88 tests; a selfie
render at every band floor contains the anti-selfie, lens/proportion and whole-body-framing clauses
and still contains every negative clause and `Realistic photograph, not an illustration and not a
render`; the FOCUS line names the feet alone and in every join; no render contains the word
`reference`; `npx tsc --noEmit` and `prettier --check` are clean.

## Handoffs

1. **The live prefs row will keep winning until the operator resets it.** The analysis records that
   `nina_image_prefs.prompt_template` for the sampled account is a **non-empty** byte-copy of the
   *old* `NINA_PROMPT_TEMPLATE_DEFAULT`. `effectiveNinaImageTemplate` (`imagegen.ts:495-501`) uses
   the stored template whenever it is non-empty and valid, so **this code change alone does not
   change production output** — the stored old shell still renders. Closing that is an operator
   action (press "Reset to default template" and save, or set the column to `''`), and the DB row is
   explicitly out of this plan's scope. The plan's own framing agrees: this phase produces a
   candidate the operator reviews and then promotes with
   `set-current-image-gen-prompt-as-default`. **Do not add a migration here.**
2. **`NINA_FOCUS_EMPHASIS.calves.sentence` stays dead and now also stale.** It still says "down to a
   narrow ankle" while the term now asks for full feet. It reaches no prompt on any path at any
   setting (`ninaFocusBlock` is avatar-only; `calves` is not in `NINA_AVATAR_FOCUS_KEYS`), and
   `tests/nina.imagerecipe.test.ts:607` pins its absence from selfies. Either wiring it up or
   deleting it is a separate, differently-scoped change — the plan's Decisions table already
   rejected reviving it for this pass.
3. **The narrower reading of Step 3.** If the reviewer wants this phase to touch only the two
   symbols the index names, drop Step 3 and its test; the tree stays green, and the phase's exit
   criterion (a) then has to be qualified with "except at `steamy` band high+, where the pose clause
   still says the phone is held close".
4. **`GENERATE_IMAGE_TOOL.description`** (`lib/nina/prompts/tools.ts:275-300`) still says "Take a
   photo of yourself and send it." It never reaches the image prompt (analysis-verified), so it is
   left alone; if a future pass wants Nina to *narrate* differently when she sends a picture, that
   is the string to edit, and it is a chat-persona change, not an image-prompt one.
5. **No live generation was run.** Whether the model actually honours the new clauses is a
   measurement only the operator's test generation can make; the phase's claim is limited to what
   the prompt now says.

## Rollback

`git revert` (or `git checkout HEAD~1 --`) the single commit touching `lib/nina/imagegen.ts` and
`tests/nina.imagerecipe.test.ts`. Nothing else in the tree depends on the changed values, there is
no migration, no data write and no production side effect: reverting restores the old camera block,
the old calves term and the old pose clause, and the previous test file passes unchanged. Because
the live `nina_image_prefs.prompt_template` row is untouched by this phase, a revert also needs no
DB action — unless the operator has meanwhile pressed "Reset to default template" and saved, in
which case the same button after the revert restores the old shell.
