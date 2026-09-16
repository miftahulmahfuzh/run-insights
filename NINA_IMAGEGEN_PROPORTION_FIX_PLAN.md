# Plan: Fix Selfie Framing, Head/Body Proportion and Calf/Feet Size in Nina's Image Prompt

**Slug:** nina-imagegen-proportion-fix
**Date:** 2026-09-16 12:57:31
**Analysis:** `20260916-125731-A1B2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-imagegen-proportion-fix`
**Branch:** `feature/nina-imagegen-proportion-fix` (base: `origin/main` @ `0bd3255`)
**Phases:** 1
**Status:** complete
**Coordinator:** —

---

## Why

The user reviewed six photographs from Nina's 91-photo production Media gallery
(`/nina/about`, positions 1/91, 8/91, 11/91, 16/91, 21/91, 25/91) and named three recurring
problems:

1. They usually read as selfie photos, which the user does not like.
2. Nina's head is always too big compared to her body.
3. Nina's feet are too small, especially her calves — often short and small.

The user is aware this may partly be `qwen/qwen-image-3-pro`'s own ceiling, but wants the prompt
text tuned as far as it can reasonably go first. The analysis confirmed all three by reading the
actual stored prompts and by viewing the actual images: 4 of 6 sampled photographs are literal
arm's-length selfie compositions, the full-body shots show a head that reads large against the
torso and feet compressed at the frame edge, and the crouch/kneel poses foreshorten calves that
the prompt explicitly asked to emphasise. The fix lives entirely in `lib/nina/imagegen.ts`,
because that file's output is the whole instruction the image model receives (verified: no
separate `negative_prompt` API field exists, and `GENERATE_IMAGE_TOOL`'s "take a photo of
yourself" description is never concatenated into the sent prompt).

The user's own words: *"later on, we will set this new image generation prompt as the new
default image generation prompt"* — so this plan produces the improved prompt text as a
candidate the operator can generate against and review via `/admin/image-generation` before
separately invoking the `set-current-image-gen-prompt-as-default` skill; it does not itself
declare victory as "the new default."

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Retrieve the stored generation prompt for gallery positions 1, 8, 11, 16, 21, 25 | done in analysis (no phase — a read, not a code change) |
| R2 | Read the current image-generation prompt | done in analysis (no phase — a read, not a code change) |
| R3 | Explicit instructions/negative-prompt-style clauses to fix selfie framing, head/body proportion, and calf/feet size | 1 |
| R4 | Land the change where a later, separate promotion step can pick it up | 1 |

## Scope

**In scope:**
- `lib/nina/imagegen.ts`: `NINA_SELFIE_STYLE` (anti-selfie framing, camera distance, natural
  head-to-body proportion) and `NINA_FOCUS_EMPHASIS.calves.term` (calf length + foot
  proportion/visibility).
- `lib/nina/imagegen.ts`: `ninaPhotoPresence`'s high-`steamy` clause (`the phone held close` →
  a phrase with no phone) — a one-clause widening the phase-planner identified and this index
  now ratifies; see Decisions below for why it stays in scope.
- `tests/nina.imagerecipe.test.ts`: update the one exact-string assertion
  (`:602`) that pins the current calves term text, and add coverage for the new anti-selfie /
  proportion clauses and for the steamy-clause fix.

**Out of scope, and why:**
- `GENERATE_IMAGE_TOOL.description` (`lib/nina/prompts/tools.ts`) — analysis confirmed it is
  never concatenated into the sent image prompt; the sampled `scene` values are already
  third-person. Editing it would touch the chat persona's tool-calling behavior for no measured
  benefit to the image prompt itself.
- The avatar path (`NINA_AVATAR_STYLE`, `NINA_AVATAR_STYLE_SHORT`, `NINA_AVATAR_FOCUS_KEYS`) — the
  user's complaint and the six sampled images are all `purpose: 'selfie'` (chat photographs), and
  the avatar is a deliberately different head-and-shoulders crop with its own contract
  (`tests/nina.imagerecipe.test.ts:816-830`). Nothing about "selfie framing" or "calves" applies
  to a head-and-shoulders crop.
- Resurrecting `NINA_FOCUS_EMPHASIS.calves.sentence`'s dead-code path (wiring `ninaFocusBlock`
  into the selfie template) — a prior, tested design decision
  (`tests/nina.imagerecipe.test.ts:593-623`, *"no rung brings the sentences back"*) deliberately
  collapsed per-key elaboration to one line for selfies. Reopening that mechanism is a larger,
  differently-scoped change than "tune the prompt text," and the `term` lever is sufficient to
  carry the fix.
- Promoting the result to the shipped default via `set-current-image-gen-prompt-as-default`, or
  running a live test generation — the user's own words defer that to "later on," as a separate,
  explicit step after reviewing output.
- `nina_image_prefs.prompt_template` (the DB row) — it is byte-identical to
  `NINA_PROMPT_TEMPLATE_DEFAULT` today, so the source-code edit alone is the whole fix; no data
  migration is implied and none is in scope.

## Invariants

- The tree builds and `tests/nina.imagerecipe.test.ts` passes at the end of the phase.
- No change to the avatar path's rendered output for any existing avatar test.
- No change to any `NINA_BODY_FACTS`/`NINA_BODY_SENTENCES`/`NINA_FACE` canon text (owned by
  `lib/nina/persona.ts`, out of scope — see Scope).
- RU-18 holds: no clause may claim a reference image is authoritative
  (`tests/nina.imagerecipe.test.ts:855-869` already asserts this across every setting; the new
  clauses must not introduce the word "reference" as an authority claim).
- The FOCUS line's grammar must still parse for every combination of selected keys through
  `joinTerms` (e.g. `"a, b and c"`) — the new `calves.term` must read correctly both alone and
  joined with any of the other five terms.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Tune the selfie camera block and calves focus term against the three named problems | R3, R4 | `lib/nina` | 2 | — | NORMAL | `.workflows/plan/nina-imagegen-proportion-fix/phase-1.md` | P1-NIN-A052 | — |

### Phase 1 ✅ — Tune the selfie camera block and calves focus term against the three named problems
**Status:** done (2026-09-16, TaskID `P1-NIN-A052`)
**Satisfies:** R3, R4
**Owns:** `NINA_SELFIE_STYLE`, `NINA_FOCUS_EMPHASIS.calves.term`, and the high-`steamy`
`ninaPhotoPresence` clause, all in `lib/nina/imagegen.ts`; the matching updates in
`tests/nina.imagerecipe.test.ts`.
**Does not touch:** the avatar path, `lib/nina/persona.ts` canon text,
`lib/nina/prompts/tools.ts`, `NINA_PROMPT_TEMPLATE_DEFAULT`'s block *order*, any other
`NINA_FOCUS_EMPHASIS` key, `NINA_FOCUS_EMPHASIS.calves.sentence` (left dead, per Decisions),
`nina_image_prefs.prompt_template` (the DB row — no migration, see Handoffs).
**Exit criteria:** `buildNinaImagePrompt({ purpose: 'selfie', ... })` for every existing test
scenario, including a high-`steamy` tuning, renders text that (a) explicitly rules out
arm's-length/mirror/phone-in-hand selfie framing with no contradicting clause anywhere in the
same render, (b) states a natural, undistorted head-to-body proportion and a camera distance that
does not compress the lower body, and (c) describes calves and feet as long and proportionate
rather than short or small — and `npx vitest run tests/nina.imagerecipe.test.ts` passes.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Whether to add a `negative_prompt` API field vs. inline "no X" clauses | Inline clauses only — `negative_prompt` is unverified and unused anywhere in this codebase's OpenRouter integration; the shipped prompt already uses inline negatives successfully | 6: surrounding convention |
| Whether to touch `GENERATE_IMAGE_TOOL.description` | Left untouched — it is never concatenated into the sent image prompt, and the sampled `scene` text shows no first-person bias | 5: user's raw input read literally — the user asked about "the image generation prompt," which this repo's own code makes a well-defined single file |
| Whether to re-wire `NINA_FOCUS_EMPHASIS.calves.sentence` into the selfie path | Left dead, per the standing tested decision that selfies get one FOCUS line, not per-key elaboration; fix ships through `.term` instead | 2: phase exit criteria — matches the invariant that no existing test's covered behavior changes |
| The phase-planner found `ninaPhotoPresence`'s high-`steamy` clause ends "the phone held close" — a direct textual contradiction of the new no-phone camera block whenever `steamy` is band `high`+, and the analysis's own six sampled photographs all carried a `POSE AND PRESENCE` block, so this is a live contributor to problem 1, not a hypothetical one. The planner flagged it as an optional scope-widening rather than deciding unilaterally. | Keep the fix in scope (Step 3 of phase-1.md) — grep-verified that no test pins the old text, so it costs nothing and its absence would silently violate this phase's own exit criterion (a) for exactly the tuning this repo's tests already exercise at `steamy: 100` | 2: phase exit criteria — the stated criterion ("no contradicting clause anywhere in the same render") is what settles it |

## Open Questions

None. Every fork above resolves without deleting an irreversible option — the term/camera-block
wording can be revised again in a future pass with no data loss.

## Rollback

Revert the single commit on `feature/nina-imagegen-proportion-fix` (or `git revert` it post-merge).
No migration, no data write, no production side effect — this phase only changes two string
constants and their test coverage.

## Next

All phases complete. Merge the set:

    git checkout main && git merge feature/nina-imagegen-proportion-fix

Then, as the user deferred to "later on" and as a separate explicit step, generate against the new
prompt via `/admin/image-generation`, review the output, and only then invoke the
`set-current-image-gen-prompt-as-default` skill.
