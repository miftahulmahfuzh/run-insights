# Phase 4: The camera, and a promise she keeps in the chat

**Plan set:** `NINA_CHARACTER_TUNING_PLAN.md`
**Analysis:** `20260904-210526-TUNE_code_analyzer.md`
**Satisfies:** R5 — *"she is proposing if i run consistently this week, then she will send me her
sexy photo in a short pants"*: a photograph as the payoff for a training commitment, wearing what
the operator dressed her in, **arriving in the chat**.
**Depends on:** Phase 1 (`lib/nina/tuning.ts`, `readNinaTuning`), Phase 2 (the wardrobe-overridable
appearance seam in `lib/nina/persona.ts`)
**Difficulty:** HARD
**Package:** `lib/nina` (plus one type in `lib/db/schema.ts`)

---

## Goal

After this phase the photograph is the operator's to dress and the promise's to deliver. The image
prompt is a function of the tuning: the hardcoded *"heather-grey racerback tank, black fitted
running shorts"* becomes whatever the `wardrobe` field says, and the `steamy` / `flirty` dials add a
standing "how she is in the photograph" clause. And a kept promise **dispatches a chat selfie**
(`purpose: 'selfie'` — a `nina_messages` + `nina_message_images` pair the worker already knows how
to write) instead of silently swapping her profile picture, with a settle test that recognises that
landing by the exact job id rather than by a same-day heuristic.

The default tuning produces today's prompt byte for byte, and a promise with no `reward` field
behaves exactly as it does today: the avatar path, settled by an avatar landing.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**

- `lib/nina/selfiegen.ts` — **NEW FILE.** `NinaSelfieRequest`, `NinaSelfieResult`,
  `generateNinaSelfie(request)`. The chat-selfie counterpart of `avatargen.ts`'s
  `generateNinaAvatar`, extracted so `promises.ts` can dispatch one without importing the chat tool
  set. Reads the tuning itself.
- `lib/nina/imagegen.ts` — **no new threshold constant.** `NINA_IMAGE_DIAL_HIGH` was cut in
  reconciliation; the camera reads phase 1's `ninaBand()` (see Decision 2).
- `lib/db/schema.ts` — `NinaPromiseReward = 'avatar' | 'selfie'` (exported type, no column, no
  migration), and the optional field `NinaPendingPromise.reward?: NinaPromiseReward`.
- `lib/nina/promise.ts` — `promiseReward(promise): NinaPromiseReward`,
  `promiseJobId(promise): string | null` (the existing private `jobIdOf`, exported under its public
  name), `promiseRewardFor(steamy: number): NinaPromiseReward`. **No
  `PROMISE_SELFIE_STEAMY_FLOOR`** — cut in reconciliation; the threshold is band `high`, from
  `ninaBand()` (see Decision 2).
- `lib/nina/queries.ts` — `listNinaSelfieJobIdsSince(userId: string, since: Date): Promise<string[]>`,
  **appended at the very bottom of the file in its own marked section (`§11`).** Phase 1 appends
  `§10 The character tuning` after today's last function (`deleteNinaFolderSubtree`, `:1875-1882`);
  this section follows it. The draft said `§12`, which would have left a hole.
- `tests/nina.promise.reward.test.ts` — **NEW FILE.** (See Handoffs for why the new cases are not
  appended to `lib/nina/promise.test.ts`; they may be merged there by the reconciler if it prefers
  one file.)

**Signature changes:**

- `buildNinaImagePrompt(input: { purpose; scene; mood? })`
  -> `buildNinaImagePrompt(input: { purpose; scene; mood?; tuning?: NinaTuning | null })`.
  **Additive and optional** — every existing call site and every existing assertion compiles
  untouched, and `tuning` absent reproduces today's string exactly.
- `PromiseEvalInput` gains **one optional** member:
  `selfieLandedForJob?: (jobId: string) => boolean`. `avatarLandedOnOrAfter` is **not** renamed and
  **not** changed.
- `PromiseDecision` gains **one optional** member: `reward?: NinaPromiseReward`.
- `NinaPromiseDeps` gains **three required** ports:
  - `generateSelfie: (input: { userId: string; scene: string; replyToId: string | null }) => Promise<{ ok: boolean; jobId?: string | null }>`
  - `readTuning: (userId: string) => Promise<NinaTuning>`
  - `readSelfieJobIdsSince: (userId: string, since: Date) => Promise<readonly string[]>`

  Safe as *required*: no file in the tree constructs a `NinaPromiseDeps` literal today — the only
  caller is `app/api/cron/nina/route.ts:123`, which calls `resolveNinaPromises(userId)` and takes
  the default, and `tests/nina.cron.test.ts:38` mocks the whole module.

**Deletes:** nothing. No symbol, no file, no config key is removed by this phase.

**Renames:** `jobIdOf` (module-private, `lib/nina/promise.ts:136`) -> `promiseJobId` (exported).
One internal call site (`promise.ts:271`) moves with it. Nothing outside the file could name it.

**Requires (from earlier phases):**

1. **Phase 1 — `lib/nina/tuning.ts`, the LANDED shape.** The draft of this plan guessed flat
   members; they are **nested**, and `wardrobe` is a plain `string`:

   ```ts
   interface NinaTuning {
     readonly traits: Readonly<Record<NinaTrait, number>>   // includes steamy, flirty
     readonly dials: Readonly<Record<NinaDial, number>>     // includes photoEagerness
     readonly relationship: NinaRelationship
     readonly wardrobe: string   // '' = no override. NEVER null, never undefined.
     readonly notes: string
     readonly revision: number
   }
   function ninaBand(value: unknown): { index: 0|1|2|3|4; name: 'off'|'low'|'mid'|'high'|'max' }
   const NINA_BAND_WIDTH = 20   // off 0-19, low 20-39, mid 40-59, high 60-79, max 80-100
   ```

   So this phase reads `tuning.traits.steamy`, `tuning.traits.flirty`,
   `tuning.dials.photoEagerness` and `tuning.wardrobe.trim()` — **no optional chain**, because `''`
   is the one empty value and phase 1's coercer guarantees it. Every emptiness test here is
   `=== ''` or a length check.
2. **Phase 1 — `NINA_TUNING_DEFAULTS` puts `steamy` and `flirty` at 0 (band `off`) and `wardrobe`
   at `''`.** Verified against phase 1's landed defaults, so plan invariant 2 holds by construction
   here: the camera adds nothing at the default. Step 8's first assertion is what keeps it true.
3. **Phase 1 — `readNinaTuning(userId: string): Promise<NinaTuning>` in `lib/nina/queries.ts`,
   returning `NINA_TUNING_DEFAULTS` (never `null`) for a user with no row.** Phase 1's stated exit
   criterion. Three call sites here depend on the non-null return:
   `selfiegen.ts`, `avatargen.ts` and `productionPromiseDeps().readTuning`.
4. **Phase 2 — `lib/nina/persona.ts` exports a wardrobe-overridable appearance function** whose
   single argument a whole `NinaTuning` satisfies, and which returns `NINA_APPEARANCE` **byte for
   byte** when the wardrobe is empty or null. This plan calls it `ninaAppearance`. If phase 2 ships
   a different name, that is a one-line retarget at `imagegen.ts`'s import plus the one call in
   `buildNinaImagePrompt` — and Step 8's first assertion fails loudly if the default render is not
   byte-identical. Taking the **whole tuning** in `buildNinaImagePrompt` is deliberate insurance
   here: a `NinaTuning` value type-checks against both `ninaAppearance(tuning: NinaTuning)` and
   `ninaAppearance(input: { wardrobe?: string | null })`, so this phase does not have to guess which
   shape phase 2 chose.
5. **Phase 2 — `NINA_APPEARANCE` survives as a constant.** `imagegen.ts` keeps importing it for the
   `tuning == null` path. Phase 2's exit criterion already promises this
   (`tests/nina.prompts.test.ts` asserts its text).

**Leaves alone (owned by others):**

- `lib/nina/prompts/tools.ts` — **phase 3.** `GENERATE_IMAGE_TOOL`'s description is not touched.
  This phase changes what the prompt *contains*, never what the tool *says* (plan invariant 7: that
  file records one extra clause taking first-attempt validity from 5/6 to 2/4).
- `lib/nina/persona.ts` — **phase 2.** Consumed, never edited.
- `lib/nina/tuning.ts` — **phase 1.** Imported for its type and its defaults, never edited.
- `lib/nina/imagerecipe.ts`, `lib/nina/imagefail.ts` — **plan invariant 9.** Both stay ZERO-IMPORT.
  This phase imports *from* them (`SEED_MAX`, `NinaImagePurpose`, `NinaImageFailure`) exactly as
  `avatargen.ts` already does, and adds no import *to* either.
- `scripts/nina-image-worker.ts` — **verified, unchanged.** See "Verified, not assumed" below.
- `NINA_IMAGE_DAILY_CAP` (`imagerecipe.ts:96`) — stays at 6. A money cap, not a feature cap.
- `lib/nina/turn.ts`, `lib/nina/tools.ts`, `lib/nina/actions.ts`, `lib/nina/proactive.ts`,
  `lib/nina/avatartools.ts`, `lib/nina/prompts/system.ts`, `lib/nina/prompts/index.ts` —
  **phase 3 or nobody.** `NinaToolContext` (`tools.ts:132`) is deliberately NOT extended: the tool
  context is built in `turn.ts:549`, which is phase 3's file, so the tuning reaches the camera by
  the generator functions reading `readNinaTuning(userId)` themselves rather than by a ctx field.
  That is also why `avatartools.ts` (the `set_avatar` chat tool) compiles and behaves correctly with
  **zero edits** — **verified in reconciliation**: `handleSetAvatar` passes only `userId` / `scene` /
  `source` and delegates the entire prompt build to `generateNinaAvatar`
  (`avatartools.ts:85` -> `avatargen.ts:69` -> `:83 buildNinaImagePrompt`), so once
  `generateNinaAvatar` reads the tuning, `set_avatar` is dressed without being touched. The same
  holds for `promises.ts:117`'s `generateAvatar` port, which is this phase's other caller of that
  function. `lib/nina/avatartools.ts` is therefore in **no** phase's Files table, deliberately, and
  the index records it as verified-no-edit rather than as unowned.
- `lib/nina/memory.ts` (`PromiseCandidateSchema` ~834, `normalisePromise` 929,
  `mergePendingPromises` 972) — **not extended.** See Decision 3.
- `lib/db/queries.ts`, `drizzle/*`, `lib/nina/context.ts`, `lib/nina/load.ts`, and anything under
  `app/`, `components/`, `lib/admin/`.

### Verified, not assumed

- **`scripts/nina-image-worker.ts` needs no change.** `runOneJob` (line 564) branches at line 592:
  `purpose === 'avatar'` -> `finishAvatar`, otherwise `finishSelfie` (line 423), which inserts a
  `nina_messages` row (`role: 'nina'`, `source: 'chat'`, `turn_id = jobId`, `reply_to_id` through an
  ownership subselect) **and** a `nina_message_images` row (`kind: 'generated'`,
  `description = args.scene`, `prompt = args.sidecar`). `closeFailed` (line 517) posts the apology
  for `purpose === 'selfie'` only. Nothing in the worker knows or cares that the job came from a
  promise. The analysis was right.
- **`nina_messages.turnId` exists** (`lib/db/schema.ts:742`, `text('turn_id')`, nullable) and the
  worker writes the job id into it. That is what makes the selfie landing test exact.
- **`nina_message_images_user_created_idx on (user_id, created_at desc)`** exists
  (`lib/db/schema.ts:834`), so Step 7's read is an indexed range scan.
- **No test constructs `NinaPromiseDeps`, `PromiseEvalInput.selfieLandedForJob`, or calls
  `handleGenerateImage`.** `lib/nina/promise.test.ts` funnels every `PromiseEvalInput` through one
  `input()` helper (line 37) and names `avatarLandedOnOrAfter` in exactly two places (lines 41,
  260), both of which keep working unchanged.
- **`server-only` is aliased to a stub** in `vitest.config.ts`, and `tests/support/setup.ts` sets a
  dummy `DATABASE_URL`, so the new `lib/nina/selfiegen.ts` is importable under vitest. It is not
  imported by any test in this phase anyway.

---

## Design decisions, and why

### Decision 1 — `buildNinaImagePrompt` takes the WHOLE `NinaTuning`, optionally

The scope invited either a narrow parameter or the whole tuning. The whole tuning wins on three
counts:

1. **It forwards to phase 2's seam whatever shape phase 2 gave it.** A `NinaTuning` value satisfies
   both a `NinaTuning` parameter and a structural `{ wardrobe?: string | null }` parameter; a
   hand-rolled `{ wardrobe, steamy, flirty }` satisfies only the second. Since phase 2's plan is
   being written concurrently and cannot be read, the argument that type-checks against both shapes
   is the one to pick.
2. **The photograph already reads three separate members** (`wardrobe`, `steamy`, `flirty`) and R3's
   photo-eagerness dial is a plausible fourth. A bespoke slice type would be a second vocabulary for
   the same row, and it would change every time a dial gained an image consequence.
3. **`NinaTuning` is a pure module** — phase 1's exit criterion makes it importable from a
   `'use client'` file, types and plain data only. Importing it into `imagegen.ts` pulls in nothing.
   (`imagegen.ts` is not on the worker's relative-import path; invariant 9 constrains
   `imagerecipe.ts` and `imagefail.ts`, and neither is touched.)

**Optional** is what preserves plan invariant 2 and keeps `tests/nina.imagerecipe.test.ts:60-82`
compiling and passing without an edit. Two things must both be true, and Step 8 asserts both:
`tuning` absent == today's string, and `tuning: NINA_TUNING_DEFAULTS` == today's string.

### Decision 2 — REVERSED IN RECONCILIATION: there is ONE band vocabulary, and it is `ninaBand()`

The draft of this plan defined two private thresholds — `NINA_IMAGE_DIAL_HIGH = 67` in `imagegen.ts`
and `PROMISE_SELFIE_STEAMY_FLOOR = 60` in `promise.ts` — on the argument that a photograph's bands
are photographic rather than conversational. **Both are cut. The camera and the promise read phase
1's `ninaBand()` and act at band `high` (60) or above.** Three reasons, and the first is decisive:

1. **The panel renders the band name.** `/admin/nina` shows the operator which band a slider is in,
   because that is the vocabulary phase 1's specs are written in. A dial whose visible band says
   `high` while the camera privately wants 67 is a dial the user cannot predict — he sets `steamy`
   to 62, the panel says `high`, and the photograph does not change. That is worse than a coarse
   threshold; it is an unfalsifiable one.
2. **The two numbers were not actually independent.** With phase 1's landed `NINA_BAND_WIDTH = 20`,
   band `high` begins at exactly 60 — so `PROMISE_SELFIE_STEAMY_FLOOR = 60` was already the band
   edge, and 67 was an arbitrary point *inside* `high` with nothing distinguishing it. Two
   vocabularies that agree on one value and disagree by seven on another is not two vocabularies,
   it is one with a typo in it.
3. **The fear it was guarding against does not exist.** "A retune of her chat voice silently
   re-dresses every photograph" is not a hazard: `steamy` and `flirty` are *her*, and the operator
   who turns them up is asking for exactly that. The photograph is supposed to follow the character.

So `imagegen.ts` imports `ninaBand` from `./tuning` — a zero-import, plain-data module, so this
costs nothing — and asks `ninaBand(value).index >= 3`. `promise.ts` does the same. Phase 6's open
ruling on this is **closed**, and its sweep should find one vocabulary rather than three.

### Decision 3 — the reward is DERIVED from the steamy dial and RECORDED at fire time. `PromiseCandidateSchema` is NOT extended.

The scope offered extending `lib/nina/memory.ts`'s `PromiseCandidateSchema` (~834) so the distiller
declares the reward, and flagged "default the reward from the steamy dial, no schema change" as
defensible. It is the better answer here, on three grounds:

1. **The schema edit is not self-contained.** `PromiseCandidateSchema`, `normalisePromise` (929) and
   `mergePendingPromises` (972) all live in `lib/nina/memory.ts`, which is in no phase's OWNS list,
   and a `reward` field the distiller is never *told* to emit is a field that is always absent —
   telling it means editing `DISTILL_SYSTEM_PROMPT` in `lib/nina/prompts/distill.ts`, which is
   **phase 6's**. Two files across two phases, for a field with a working default.
2. **A dial must work retroactively, and a schema-borne reward cannot.** Turn `steamy` up and every
   promise already sitting in the slot pays out as a photograph on its next fire. A reward frozen
   into the promise at distillation time would only ever apply to promises made *after* the slider
   moved — the opposite of what a slider is for.
3. **It is an operator setting, not a fact about the conversation.** The distiller's job is to
   record what was said. "Which camera path pays this out" is the panel's decision, and the panel is
   the tuning row.

**But the reward is recorded once and then read, never re-derived mid-flight.** The `fire` verdict
writes `reward` onto the promise entry beside `jobId` / `firedOn` / `attempts`, and the settle test
reads it back. Otherwise a dial moved between the fire and the landing would have the sweep watching
the wrong table for a photograph that did land. A `retry` clears `jobId` and leaves `reward`
in place; the next `fire` overwrites it with the current derivation, which is the right behaviour —
the dial moved, so the payout follows.

`reward` costs **no migration**, by `jobId`/`firedOn`/`attempts`'s own argument, quoted from
`lib/db/schema.ts:893`: *"`nina_memory_slots.value` is `jsonb`, so all three cost no migration; and
all three are optional, so phase 5's constructor, its `mergePendingPromises` and its tests compile
untouched — a promise written before phase 12 lands simply has none of them, which reads correctly
as 'never dispatched'."* A promise with no `reward` reads correctly as **the avatar reward**, and
behaves exactly as it does today.

### Decision 4 — the settle test is a JOB-ID match, not a same-day count

The scope specified *"a count of `nina_message_images` rows since a Jakarta day"*. The read is the
same read on the same index, but it returns the **`nina_messages.turn_id` of each generated
photograph** instead of a count, and the predicate becomes exact set membership. The reason is a
false-positive that the avatar path does not have:

`avatarLandedOnOrAfter`'s documented tolerance is *"a different generated avatar landing the same
day settles this promise … a mis-attributed true event, not a false one"* — safe, because a
*generated* avatar essentially only ever comes from a promise or from an admin clicking Generate.
Chat selfies are different: `generate_image` is a tool she calls whenever he asks for a photo, up to
six times a day. A count-since-a-day would let **a selfie he asked for himself settle a promise he
had not kept.** That is a false event, not a mis-attributed true one, and it would quietly break the
one property `evaluatePromise`'s docstring is built around.

The worker already writes `turn_id = jobId` on the selfie message (`finishSelfie`, line 436), so the
exact test is free: one indexed read, `selectDistinct` of `turn_id`, a `Set`, and membership. It also
removes the need for any tolerance argument at all.

### Decision 5 — a second optional port, not a renamed one

`PromiseEvalInput` gains `selfieLandedForJob?` and keeps `avatarLandedOnOrAfter` exactly as it is.
A single unified `rewardLandedOnOrAfter(reward, dayISO)` would have to carry two different
tolerances (a day window for avatars, an exact job id for selfies) through one signature, and would
break the two lines in `promise.test.ts` that name the port today for no gain. Optional means a
caller that supplies no selfie port can never settle a selfie promise — it waits, retries, and
expires — which is the **safe failure direction**: never a false `met`.

**The invariant `evaluatePromise`'s docstring names is preserved exactly.** *"The order of the
branches IS the state machine, and it is the reason a failed generation can never consume a promise:
`settle` is reachable only through `avatarLandedOnOrAfter`, and nothing else in this function writes
`status: 'met'`."* After this phase: `settle` is reachable only through one of the two landing
predicates, `status: 'met'` is written nowhere else, and a failed **selfie** generation lands no
`nina_message_images` row, so it settles nothing either. Step 5 rewrites that docstring to say so,
and Step 9 has a test named for it.

### Decision 6 — the generators read the tuning; no call site is threaded

`generateNinaSelfie` and `generateNinaAvatar` each call `readNinaTuning(userId)` themselves, one
indexed primary-key read on a path that already does one (`ninaImageQuotaLeft(userId)`) and then
makes an HTTP `workflow_dispatch`. The alternative — a `tuning` field on `NinaToolContext` — would
require editing `lib/nina/turn.ts:549`, which is **phase 3's file**. Reading it in the generator
also means `lib/nina/avatartools.ts` (the `set_avatar` chat tool, in nobody's OWNS list) and phase
15's admin album both get the wardrobe with **zero edits**, which is a better outcome than threading
a parameter through three callers.

### Decision 7 — `NINA_SELFIE_STYLE` and `NINA_AVATAR_STYLE` are left byte-identical

They were in scope to extend and are deliberately not extended. They are the *camera*, not the
*subject*: what the tuning changes is what she is wearing and how she is standing, and both of those
belong under `SUBJECT:` / `POSE AND PRESENCE:`. Editing the style blocks would also put a tuning
dependency in the one part of the prompt whose current text is verified output from a measured probe
(`imagegen.ts:40-43`). Recorded here so a later reader knows it was considered.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imagegen.ts` | modify | `buildNinaImagePrompt` gains `tuning?`; `ninaAppearance` replaces the hardcoded `NINA_APPEARANCE` when a tuning is given; new `POSE AND PRESENCE:` block from `traits.steamy`/`traits.flirty`, gated on phase 1's `ninaBand` |
| `lib/nina/selfiegen.ts` | **create** | `generateNinaSelfie` — the chat-selfie dispatch, extracted from `handleGenerateImage`, tuning-aware, callable from the promise sweep |
| `lib/nina/imagetools.ts` | modify | `handleGenerateImage` (55-134) delegates to `generateNinaSelfie`; the duplicated quota/seed/prompt/job/dispatch sequence goes |
| `lib/nina/avatargen.ts` | modify | `generateNinaAvatar` reads the tuning and passes it to `buildNinaImagePrompt` (line 83) |
| `lib/db/schema.ts` | modify | `NinaPromiseReward` type + optional `reward` on `NinaPendingPromise` (852-902). **No column. No migration. `drizzle/*` untouched.** |
| `lib/nina/promise.ts` | modify | `promiseReward` / `promiseJobId` / `promiseRewardFor` (band `high`, via `ninaBand`); `PromiseEvalInput.selfieLandedForJob?`; `PromiseDecision.reward?`; reward-aware Stage B (276-291); `resolvePromiseSlot`'s `fire` case records the reward (358-365) |
| `lib/nina/promises.ts` | modify | three new ports on `NinaPromiseDeps` (59-84) and their production wiring (99-126); the selfie landing read in the existing `Promise.all` (204-207); the reward-aware fire path (254-275); the D-3 docstring (38-42) |
| `lib/nina/queries.ts` | modify | **append only, after phase 1's `§10` section at the end of the file, in a new `§11` section:** `listNinaSelfieJobIdsSince`. No new imports, no edit above line 1882. |
| `tests/nina.imagerecipe.test.ts` | modify | the invariant-2 pair, the wardrobe, the two dials, the block order |
| `tests/nina.promise.reward.test.ts` | **create** | the reward default, the derivation, the selfie settle, and the "a failed generation consumes nothing" invariant for the selfie path |

Ten files, and **the index now says 10** (its draft said 7). Nothing in another phase's list appears
here: `lib/nina/queries.ts` and `lib/db/schema.ts` are shared with phase 1 and both are strictly
non-overlapping appends/additions on top of it (Handoff 6 and Decision 5 spell out where).

---

## Implementation Steps

### Step 1: the image prompt becomes a function of the tuning

**File:** `lib/nina/imagegen.ts:1` (imports) and `:54-72` (`buildNinaImagePrompt`)
**Change:** import phase 2's seam and phase 1's type; add the dial threshold and the presence
builder; rewrite `buildNinaImagePrompt` around an optional tuning. `NINA_SELFIE_STYLE`,
`NINA_AVATAR_STYLE` and `sidecarText` are untouched.

**Code — replace lines 1-8 (the import block):**

```ts
import { NINA_APPEARANCE, ninaAppearance } from '@/lib/nina/persona'
import { ninaBand, type NinaTuning } from '@/lib/nina/tuning'

import {
  NINA_IMAGE_ASPECT,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_RESOLUTION,
  type NinaImagePurpose,
} from './imagerecipe'
```

**Code — insert between `NINA_AVATAR_STYLE` (line 52) and `buildNinaImagePrompt` (line 54):**

```ts
/**
 * **Where a dial becomes photographic — and it is phase 1's band, not a private number.**
 * At band `high` or `max` (a score of 60 or more, since the bands are five equal widths of 20),
 * `steamy` and `flirty` each add a clause to `POSE AND PRESENCE:`; below that they add nothing at
 * all and the prompt is the one that shipped.
 *
 * ── ONE VOCABULARY, RECONCILED ────────────────────────────────────────────────────────────────
 * The draft of this phase had a private `NINA_IMAGE_DIAL_HIGH = 67`. It is gone: `/admin/nina`
 * renders the band name beside every slider, so a dial whose visible band says `high` while the
 * camera privately wants 67 is a dial the operator cannot predict. `ninaBand` comes from
 * `./tuning`, which is zero-import plain data, so reading it here costs nothing and couples nothing
 * that was not already coupled — `steamy` is *her*, and the operator who turns it up is asking for
 * the photograph to follow.
 *
 * `NINA_TUNING_DEFAULTS.traits.steamy` and `.flirty` are both 0 (band `off`), so the default render
 * is today's prompt; `tests/nina.imagerecipe.test.ts` asserts that rather than assuming it.
 */
const isDialHigh = (value: number): boolean => ninaBand(value).index >= 3

/**
 * How she is in the photograph, from the two dials that have anything to say about a picture.
 *
 * Returns null — and therefore adds NO block at all — when there is no tuning or when both dials
 * are below the threshold. That null is the compatibility contract: `NINA_TUNING_DEFAULTS` renders
 * the prompt that shipped, character for character.
 *
 * ── WHY `steamy` IS SELFIE-ONLY ───────────────────────────────────────────────────────────────
 * `NINA_AVATAR_STYLE` asks for head and shoulders inside a 28-44 px circle. A pose instruction
 * about her hips under a head-and-shoulders crop is a prompt arguing with itself, which this file's
 * header names as the thing that "degrades a prompt for free" (the deleted reference-image line).
 * `flirty` survives into the avatar because a look down the lens is compatible with any crop.
 *
 * ── WHERE THE CLOTHES ARE, AND ARE NOT ────────────────────────────────────────────────────────
 * Nowhere in here. What she WEARS is `tuning.wardrobe`, and it belongs to the SUBJECT paragraph via
 * phase 2's `ninaAppearance` — the operator's own words about her outfit, in the one place the
 * prompt describes her body. What these two dials add is how she is STANDING and how she is LOOKING
 * at him. Keeping the two apart is what lets the user set one without the other.
 */
function ninaPhotoPresence(
  purpose: NinaImagePurpose,
  tuning: NinaTuning | null,
): string | null {
  if (tuning == null) return null

  const clauses: string[] = []

  if (purpose === 'selfie' && isDialHigh(tuning.traits.steamy)) {
    clauses.push(
      'She is fully aware of the camera and playing to it: weight on one hip, body turned toward ' +
        'the lens, chin down, the phone held close.',
    )
  }

  if (isDialHigh(tuning.traits.flirty)) {
    clauses.push(
      'She is looking straight down the lens and half-smiling, like she knows exactly what she is ' +
        'doing.',
    )
  }

  if (clauses.length === 0) return null
  return clauses.join(' ')
}
```

**Code — replace `buildNinaImagePrompt` (lines 54-72) in full:**

```ts
/**
 * ── THE TUNING IS OPTIONAL, AND OPTIONAL IS THE POINT ─────────────────────────────────────────
 * Two things must both be true and `tests/nina.imagerecipe.test.ts` asserts both: with no `tuning`
 * this returns the string that shipped, and with `NINA_TUNING_DEFAULTS` it returns the same string
 * again. Everything the tuning adds is additive text above the default band. That is what makes
 * this feature a provable superset of the Nina who shipped rather than a rewrite of her.
 *
 * It takes the WHOLE `NinaTuning` rather than a slice of it because the picture already reads three
 * unrelated members of it (`wardrobe`, `steamy`, `flirty`), and because a whole tuning is what
 * `ninaAppearance` wants — a bespoke slice would be a second vocabulary for one row.
 */
export function buildNinaImagePrompt(input: {
  purpose: NinaImagePurpose
  scene: string
  mood?: string | null
  /** The operator's character tuning. Absent (or the defaults) renders today's prompt exactly. */
  tuning?: NinaTuning | null
}): string {
  const tuning = input.tuning ?? null

  const parts = [
    input.purpose === 'avatar' ? NINA_AVATAR_STYLE : NINA_SELFIE_STYLE,
    '',
    'SUBJECT:',
    /* Phase 2's seam. With no tuning we spell the canon constant, so this function is still a pure
     * function of its arguments when nobody has an opinion about her wardrobe. */
    tuning == null ? NINA_APPEARANCE : ninaAppearance(tuning),
  ]

  /* BEFORE the scene, because it is a standing property of the subject the operator set once — not
   * a per-photograph note. The per-photograph note is `mood`, and it stays last. */
  const presence = ninaPhotoPresence(input.purpose, tuning)
  if (presence != null) parts.push('', `POSE AND PRESENCE: ${presence}`)

  parts.push('', `SCENE: ${input.scene.trim()}`)

  const mood = input.mood?.trim()
  // After the scene, so it reads as a refinement of this photograph rather than an amendment to who
  // she is. Exactly where `gen_badge_art.py` puts `--note`, and for the same reason.
  if (mood != null && mood.length > 0) parts.push('', `EXPRESSION AND ENERGY: ${mood}`)
  return parts.join('\n')
}
```

**Impact:** with `tuning` absent the array is `[style, '', 'SUBJECT:', NINA_APPEARANCE]` then
`['', 'SCENE: …']` — identical to today's literal, joined identically. Every existing caller
(`imagetools.ts:89`, `avatargen.ts:83`, `tests/nina.imagerecipe.test.ts:60,67,76,82`) compiles and
passes unchanged until Steps 2-4 opt them in. The `not.toContain('reference')` assertion at line 83
still holds: neither new clause uses the word.

---

### Step 2: `generateNinaSelfie` — the chat selfie, as its own entry point

**File:** `lib/nina/selfiegen.ts` — **NEW FILE**
**Change:** extract the dispatch sequence that lives inline in `handleGenerateImage` today into an
entry point shaped exactly like `avatargen.ts`'s, so the promise sweep can call it without
importing the chat tool set. It reads the tuning, so every selfie is dressed.

**Why a new file and not a function in `avatargen.ts` or `imagetools.ts`:** `avatargen.ts`'s header
declares it *"the avatar-generation entry point"* and spends 20 lines on why an avatar is a
different function from a chat selfie rather than a flag on it — putting the selfie in there
contradicts the file. `imagetools.ts` is the tool table; importing it from `promises.ts` would drag
`@/lib/nina/prompts` and `@/lib/nina/tools` into the promise sweep's import graph for a function
that needs neither. This file's imports are `avatargen.ts`'s, plus `readNinaTuning`.

**Code — the whole file:**

```ts
import 'server-only'

import { fireNinaImageDispatch } from './imagedispatch'
import type { NinaImageFailure } from './imagefail'
import { buildNinaImagePrompt, sidecarText } from './imagegen'
import { ninaImageQuotaLeft, openNinaImageJob } from './imagejobs'
import { SEED_MAX } from './imagerecipe'
import { readNinaTuning } from './queries'

/**
 * **The chat-selfie entry point.** The `generate_image` tool calls this, and so does the promise
 * sweep when the reward is a photograph she sends him (R5).
 *
 * ── IT ACCEPTS, IT DOES NOT DELIVER ───────────────────────────────────────────────────────────
 * `{ ok: true, state: 'dispatched' }` means the job row exists and GitHub has been rung — NOT that
 * a photograph exists. `scripts/nina-image-worker.ts` writes the `nina_messages` +
 * `nina_message_images` pair 1-3 minutes later (`finishSelfie`), with `turn_id` set to the job id.
 * That `turn_id` is what the promise evaluator matches on, and it is the whole reason the settle
 * test can be exact instead of same-day.
 *
 * **It never throws and it never posts a message.** The worker posts — the caption on success
 * (`ninaImageCaption`), the apology on a spent retry budget (`closeFailed`). Same guarantee
 * `generateNinaAvatar` gives, for the same reason: a caller that could dispatch without saying
 * anything is a caller that will eventually do so.
 *
 * ── WHY IT IS A DIFFERENT FUNCTION FROM `generateNinaAvatar` AND NOT A FLAG ON IT ─────────────
 * `avatargen.ts` already argues this at length and nothing here weakens it: a selfie writes
 * `nina_messages`, an avatar writes `nina_avatars` under a partial unique index; a selfie's failure
 * is apologised for because somebody is waiting, an avatar's is silent because nobody asked; and
 * `announced_at IS NULL` is a trigger only the avatar path arms. Two purposes, two functions, one
 * prompt builder.
 *
 * ── WHY IT READS THE TUNING ITSELF ────────────────────────────────────────────────────────────
 * One indexed primary-key read on a path that already does one (`ninaImageQuotaLeft`) and then
 * makes an HTTP call to GitHub. The alternative was a `tuning` field on `NinaToolContext`, which is
 * built in `lib/nina/turn.ts` — another phase's file — and which would still have left the promise
 * sweep to fetch the row itself. Reading it here means every caller is dressed without being
 * changed.
 */
export interface NinaSelfieRequest {
  userId: string
  /** What the photograph shows. Becomes `nina_message_images.description` verbatim. */
  scene: string
  mood?: string | null
  /**
   * The message this photograph answers, so it quotes it when it lands (phase 7's `reply_to_id`).
   * The chat tool passes the runner's message; the promise sweep passes the message she made the
   * promise in. Null is fine, and a message that has since been deleted is fine too — the worker
   * writes this through an ownership subselect rather than trusting it.
   */
  replyToId?: string | null
}

export type NinaSelfieResult =
  | { ok: true; jobId: string; state: 'dispatched' }
  | { ok: false; jobId: string | null; kind: NinaImageFailure | 'capped' }

export async function generateNinaSelfie(request: NinaSelfieRequest): Promise<NinaSelfieResult> {
  const { userId } = request

  /*
   * THE CAP, first — before the row is opened and therefore before a cent is spent. It counts
   * failed generations too, because every attempt cost either money or a runner minute.
   * `NINA_IMAGE_DAILY_CAP` is a money cap and not a feature cap: the photo dial changes how eagerly
   * she offers, never how much the operator spends.
   */
  if ((await ninaImageQuotaLeft(userId)) <= 0) {
    return { ok: false, jobId: null, kind: 'capped' }
  }

  const scene = request.scene.trim()
  const mood = request.mood?.trim() ?? null
  const replyToId = request.replyToId ?? null
  const seed = Math.floor(Math.random() * SEED_MAX)

  /* Read live, no cache. A wardrobe saved on /admin/nina thirty seconds ago is in this prompt. */
  const tuning = await readNinaTuning(userId)
  const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene, mood, tuning })

  const jobId = await openNinaImageJob(userId, {
    purpose: 'selfie',
    scene,
    mood,
    prompt,
    seed,
    replyToId,
    source: 'chat',
    attempts: 0,
    sidecar: sidecarText({ prompt, seed, purpose: 'selfie' }),
  })

  fireNinaImageDispatch({ userId, jobId, purpose: 'selfie', replyToId })

  return { ok: true, jobId, state: 'dispatched' }
}
```

**Impact:** a new module with no callers until Steps 3 and 7. `source: 'chat'` on every selfie, as
today — `NinaImageJobArgs.source`'s comment says *"`'chat'` posts a message"*, which is exactly what
a promise payout must do, and RULING C9 already refused a sixth message source for this.

---

### Step 3: the chat tool delegates instead of duplicating

**File:** `lib/nina/imagetools.ts:15-19` (imports) and `:67-134` (the handler body from the cap
comment down)
**Change:** `handleGenerateImage` keeps the Zod gate and the two instruction strings — its real job —
and hands the dispatch to `generateNinaSelfie`. The quota check moves inside with it.

**Code — replace lines 15-19 (the relative import block):**

```ts
import { NINA_IMAGE_CAPPED_NOTE } from './imagefail'
import { generateNinaSelfie } from './selfiegen'
```

`fireNinaImageDispatch`, `buildNinaImagePrompt`, `sidecarText`, `ninaImageQuotaLeft`,
`openNinaImageJob` and `SEED_MAX` are no longer referenced in this file and their imports go with
them — `npm run lint` fails on an unused import, so this is not optional.

**Code — replace lines 67-134 (from the `THE CAP.` comment at 67 through the `}` at 134 that closes
the handler) in full:**

```ts
  /*
   * THE CAP AND THE DISPATCH, both inside `generateNinaSelfie`. This handler used to inline the
   * whole sequence — quota, seed, prompt, job row, doorbell — and phase 4 needed the same sequence
   * from the promise sweep. Two copies of it would have been two places for the tuning to be
   * forgotten, so it moved into `selfiegen.ts` and this is now the only thing left that is
   * genuinely about the TOOL: validate the arguments, and decide what she is told.
   *
   * **The refusal is HERS.** We hand the model `NINA_IMAGE_CAPPED_NOTE` — an instruction to say she
   * is out of photos, in her own words, with no number and no mention of a system — and she writes
   * the bubble in the same turn. A canned refusal string would be us talking, and the one thing
   * this feature cannot afford is Nina sounding like an API.
   *
   * `isError: false` on purpose. This is not a malformed call; it is a true answer to a legitimate
   * request, and phase 3's ruling (g) reserves `isError` for "you asked for something I cannot
   * answer".
   *
   * `capped` is the only `ok: false` `generateNinaSelfie` can return — every other failure happens
   * minutes later, in the worker, and arrives as her apology. So mapping any refusal to the capped
   * note is exhaustive rather than lossy today, and if that ever stops being true the fix is a
   * switch on `result.kind` here.
   */
  const result = await generateNinaSelfie({
    userId: ctx.userId,
    scene: parsed.data.scene,
    mood: parsed.data.mood ?? null,
    /*
     * The photograph quotes the message that asked for it (phase 7's `reply_to_id`), which is what
     * makes the answer legible when it lands two minutes after four other bubbles. Null on a
     * proactive turn, where nobody asked.
     */
    replyToId: ctx.sourceMessageId,
  })

  if (!result.ok) {
    return { answer: { taken: false, instruction: NINA_IMAGE_CAPPED_NOTE }, isError: false }
  }

  /*
   * What she is told. Deliberately spare: she must say she is taking the photo NOW, in one short
   * bubble, and must not describe the photo she has not seen yet — a bubble that narrates the
   * picture would be a fact the app never computed, and it would read absurdly if the generation
   * then failed and she apologised for a photo she had already described.
   *
   * "in a moment" and not "in two minutes": a specific duration is a promise about a GitHub queue,
   * and she does not know about GitHub queues.
   */
  return {
    answer: {
      taken: true,
      instruction:
        'The camera is running. Say — in one short message, in your own voice — that you are ' +
        'taking the photo right now and it is coming in a moment. Do NOT describe the photo: you ' +
        'have not seen it yet. Do not mention systems, jobs, queues or waiting times.',
    },
    isError: false,
  }
}
```

Lines 55-66 (the `NinaToolHandler` signature and the Zod gate) and lines 136-147
(`NINA_CHAT_TOOL_SET`) are unchanged. The file's header docstring (21-43) stays accurate: it still
describes four cheap things and a doorbell, they just now happen one call down.

**Impact:** behaviour identical, plus the wardrobe. `NINA_CHAT_TOOL_SET` and therefore
`avatartools.ts`'s `NINA_FULL_TOOL_SET` are untouched, so `lib/nina/actions.ts:523` needs no edit.

---

### Step 4: the avatar path gets dressed too

**File:** `lib/nina/avatargen.ts:1-7` (imports) and `:80-83`
**Change:** read the tuning and hand it to the prompt builder. `NinaAvatarRequest` is **not**
changed, so `avatartools.ts:85` and phase 15's album manager compile and behave correctly with no
edit — which is the point.

**Code — replace lines 3-7 (the import block):**

```ts
import { fireNinaImageDispatch } from './imagedispatch'
import type { NinaImageFailure } from './imagefail'
import { buildNinaImagePrompt, sidecarText } from './imagegen'
import { ninaImageQuotaLeft, openNinaImageJob } from './imagejobs'
import { SEED_MAX } from './imagerecipe'
import { readNinaTuning } from './queries'
```

**Code — replace lines 80-83:**

```ts
  const scene = request.scene.trim()
  const mood = request.mood?.trim() ?? null
  const seed = Math.floor(Math.random() * SEED_MAX)
  /*
   * Phase 4. Read live, no cache — same as the chat selfie, and for the same reason: a wardrobe
   * saved on /admin/nina is in the next photograph with no invalidation step at all.
   *
   * `NinaAvatarRequest` is deliberately NOT given a `tuning` field. Reading it here is what lets
   * the `set_avatar` chat tool (`avatartools.ts`) and the admin album's Generate button both get
   * the operator's wardrobe without either file being edited — and neither of those files belongs
   * to this phase.
   */
  const tuning = await readNinaTuning(userId)
  const prompt = buildNinaImagePrompt({ purpose: 'avatar', scene, mood, tuning })
```

**Impact:** every avatar generated from now on wears the wardrobe — including the one `set_avatar`
takes, with no edit to `avatartools.ts`, and including a promise payout through
`productionPromiseDeps().generateAvatar`. `sidecarText` already records the prompt as sent, so a
wardrobe override is recoverable from `nina_turns.args` for free. `steamy` adds nothing to an
avatar by construction (Step 1's `purpose === 'selfie'` guard); `flirty` adds its one look-down-the-
lens clause, which is compatible with the head-and-shoulders crop.

---

### Step 5: the reward, on the promise

**File:** `lib/db/schema.ts:852` (beside `NinaPromiseMetric`) and `:898-901` (the tail of
`NinaPendingPromise`)
**Change:** one exported union and one optional field. **No column, no `drizzle/` file, no
migration** — phase 1 owns the only migration in this set.

**Code — insert immediately after line 852 (`export type NinaPromiseMetric = …`):**

```ts
/**
 * **What she pays out when he keeps his end.** R5 of the character-tuning set.
 *
 * · `'avatar'` — she changes her profile picture. The reward as F33 phase 13 shipped it: the worker
 *                writes `nina_avatars` with `announced_at: NULL`, and phase 10's `avatar_changed`
 *                trigger has her mention it on the next cron tick. **No chat message.**
 * · `'selfie'` — she sends him the photograph. `purpose: 'selfie'`, so the worker writes a
 *                `nina_messages` row plus a `nina_message_images` row and it arrives in the
 *                conversation like any other picture: quotable, gallery-able, unread-able.
 *
 * The field below is OPTIONAL and absent means `'avatar'`, so every promise written before this
 * phase behaves exactly as it always did.
 */
export type NinaPromiseReward = 'avatar' | 'selfie'
```

**Code — replace lines 898-901 (the three RULING C3 fields) with those three plus the new one:**

```ts
  jobId?: string | null
  /** Jakarta `'YYYY-MM-DD'`. See the note above. */
  firedOn?: string | null
  attempts?: number
  /**
   * ── AND THE FOURTH FIELD IS R5, BY THE SAME ARGUMENT ─────────────────────────────────────────
   * Which camera pays this promise out. **Written by the `fire` verdict, not by the distiller**, so
   * it is decided once and then read: `lib/nina/promises.ts` derives it from the operator's
   * `steamy` dial at dispatch time and `resolvePromiseSlot` records it beside `jobId` and
   * `firedOn`. Re-deriving it at settle time instead would mean a dial moved between the dispatch
   * and the landing had the sweep watching the wrong table for a photograph that did arrive.
   *
   * `nina_memory_slots.value` is `jsonb`, so this costs **no migration** — the same argument the
   * three fields above make for themselves. And it is **optional**, so `mergePendingPromises`, its
   * tests and `tests/nina.memory.test.ts`'s `satisfies NinaPendingPromise` literals compile
   * untouched: a promise written before this phase simply has none, which reads correctly as
   * "the avatar reward", which is what it was.
   */
  reward?: NinaPromiseReward
```

**Impact:** type-only. Every existing `NinaPendingPromise` literal in the tree
(`tests/nina.memory.test.ts:356,490-503`, `lib/nina/promise.test.ts:18-33`) still satisfies the type.

---

### Step 6: the settle test becomes reward-aware, and stays the only path to `met`

**File:** `lib/nina/promise.ts` — line 2 (imports), 82-94 (`PromiseEvalInput`), 116-121
(`PromiseDecision`), 130-144 (the field readers), 254-291 (`evaluatePromise`), 358-365
(`resolvePromiseSlot`'s `fire` case)
**Change:** the pure half learns that there are two rewards, and records nothing else. This file
still has no `Date` in it, still never calls a generator, and still writes only `status`,
`resolvedOn`, `jobId`, `firedOn`, `attempts` — and now `reward`.

**Code — replace line 2 (the schema import):**

```ts
import type {
  NinaPendingPromise,
  NinaPendingPromisesSlot,
  NinaPromiseReward,
} from '@/lib/db/schema'
```

**Code — insert after `PROMISE_OPEN_ENDED_TTL_DAYS` (line 55):**

```ts
/**
 * The reward a promise pays out, given the operator's `steamy` dial: at band **`high`** or above —
 * a score of 60 or more — she SENDS him the photograph instead of changing her profile picture.
 * Below that, nothing about the promise mechanism changes at all.
 *
 * ── THE THRESHOLD IS PHASE 1'S BAND, NOT A LOCAL CONSTANT ─────────────────────────────────────
 * Reconciled: the draft had `PROMISE_SELFIE_STEAMY_FLOOR = 60` here, which was *already* the band
 * edge (`NINA_BAND_WIDTH = 20`, so `high` starts at 60) — a private constant that agreed with the
 * shared one by coincidence. `/admin/nina` shows the operator the band name, so the band is the
 * only threshold he can actually see. `ninaBand` is imported from `./tuning`, which is zero-import
 * plain data; this module keeps its independence from the tuning TYPE by still taking the raw
 * number, and `ninaBand` never throws on anything, which is why the `Number.isFinite` guard is
 * gone: garbage folds to band `off`.
 *
 * ── WHY THE DIAL AND NOT THE DISTILLER ────────────────────────────────────────────────────────
 * R5's exploit only works if turning the dial up changes the promises she is ALREADY tracking. A
 * reward frozen into each promise when it was made would apply only to promises made after the
 * slider moved, which is the opposite of what a slider is for. And the distiller's job is to record
 * what was said; which camera pays it out is the operator's decision, and the operator's decisions
 * live in the tuning row. See Decision 3, and the reconciler's ruling on `PromiseCandidateSchema`.
 */
export function promiseRewardFor(steamy: number): NinaPromiseReward {
  return ninaBand(steamy).index >= 3 ? 'selfie' : 'avatar'
}
```

**Code — replace `PromiseEvalInput` (lines 82-94) in full:**

```ts
export interface PromiseEvalInput {
  todayISO: DateISO
  facts: PromiseFacts
  /**
   * **The landing test for an `'avatar'` reward (Stage B).** True when a `nina_avatars` row with
   * `source = 'generated'` was created on or after `dayISO`. Injected as a predicate rather than as
   * a row so this module stays free of the schema and so the test can pin it.
   *
   * Its one tolerance is stated in the plan: a *different* generated avatar landing the same day
   * settles this promise. The cost is a mis-attributed true event, not a false one.
   */
  avatarLandedOnOrAfter: (dayISO: DateISO) => boolean
  /**
   * **The landing test for a `'selfie'` reward (Stage B).** True when the photograph dispatched
   * under `jobId` has actually reached the conversation — a `nina_message_images` row whose
   * message carries `turn_id = jobId`.
   *
   * ── WHY THIS ONE IS EXACT AND THE AVATAR ONE IS NOT ───────────────────────────────────────────
   * A *generated avatar* essentially only ever comes from a promise or from an operator clicking
   * Generate, so a same-day match mis-attributes a true event at worst. Chat selfies are different:
   * `generate_image` is a tool she calls whenever he asks for a photo, up to six times a day. A
   * same-day match would let a selfie HE asked for settle a promise he had not kept — a false
   * event, not a mis-attributed true one. The worker already writes the job id into
   * `nina_messages.turn_id`, so the exact test costs the same single indexed read.
   *
   * **Optional, and absent means "no selfie has landed".** A caller that supplies no selfie port
   * can never settle a selfie promise: it waits, retries, and eventually expires. That is the safe
   * failure direction, and it is why this is an added port rather than a rename of the one above.
   */
  selfieLandedForJob?: (jobId: string) => boolean
}
```

**Code — replace `PromiseDecision` (lines 116-121) in full:**

```ts
/** A verdict plus, for an accepted `fire`, the job the generator handed back. */
export interface PromiseDecision {
  verdict: PromiseVerdict
  /** The accepted job's id, or null when the generator refused. Ignored for every other kind. */
  jobId?: string | null
  /**
   * Which camera the sweep actually asked. Recorded on the entry by a `fire` so the settle test
   * reads a stable value; absent means `'avatar'`, which is what a caller that knows nothing about
   * rewards means. Ignored for every other kind.
   */
  reward?: NinaPromiseReward
}
```

**Code — replace the three field readers (lines 130-144) in full:**

```ts
/** `attempts` is optional on the entry; absent means zero. */
function attemptsOf(promise: NinaPendingPromise): number {
  const raw = (promise as { attempts?: number }).attempts
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}

/**
 * The dispatched job, or null. Exported because `promises.ts` needs it to decide whether the selfie
 * landing read is worth performing at all — a sweep with no fired selfie promise does no extra
 * read.
 */
export function promiseJobId(promise: NinaPendingPromise): string | null {
  const raw = (promise as { jobId?: string | null }).jobId
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/**
 * **Which camera this promise pays out with.** Absent, null, or anything that is not the string
 * `'selfie'` reads as `'avatar'` — so a promise written before R5 landed, and a promise
 * hand-edited in `/admin/memory`, both behave exactly as they always did. Same defensive shape as
 * `attemptsOf`, and for the same reason: a slot is `jsonb` a human can edit, and a thrown error
 * here would stop the whole sweep over one bad row.
 */
export function promiseReward(promise: NinaPendingPromise): NinaPromiseReward {
  return (promise as { reward?: unknown }).reward === 'selfie' ? 'selfie' : 'avatar'
}

function firedOnOf(promise: NinaPendingPromise): DateISO | null {
  const raw = (promise as { firedOn?: string | null }).firedOn
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}
```

**Code — insert immediately before `evaluatePromise` (line 254), and replace `evaluatePromise`'s
docstring and Stage B (lines 254-291):**

```ts
/**
 * **Has the reward this promise actually dispatched arrived?** One predicate per reward, chosen by
 * what the `fire` recorded — never by the operator's dial as it stands right now, because the dial
 * may have moved since the dispatch and the photograph that landed is the one that was asked for.
 *
 * A missing `selfieLandedForJob` returns false, so a caller that does not know about selfies cannot
 * settle one. A refused or failed generation lands nothing in either table, so it returns false as
 * well — which is the whole of "a failed generation can never consume a promise".
 */
function rewardLanded(
  promise: NinaPendingPromise,
  jobId: string,
  firedOn: DateISO | null,
  input: PromiseEvalInput,
): boolean {
  if (promiseReward(promise) === 'selfie') {
    return input.selfieLandedForJob?.(jobId) ?? false
  }
  return input.avatarLandedOnOrAfter(firedOn ?? promise.promisedOn)
}

/**
 * One promise, one verdict. The order of the branches IS the state machine, and it is the reason
 * a failed generation can never consume a promise: `settle` is reachable only through
 * `rewardLanded` — that is, only through `avatarLandedOnOrAfter` or `selfieLandedForJob` — and
 * nothing else in this function writes `status: 'met'`.
 *
 * R5 generalised the landing test from one reward to two and changed nothing else about that
 * property. A refused dispatch still returns a null `jobId` and never reaches Stage B; a generation
 * that fails in the worker still writes no `nina_avatars` row and no `nina_message_images` row, so
 * both predicates are false; and a selfie promise evaluated by a caller that supplies no selfie
 * port waits, retries and expires rather than settling. **Do not "simplify" this by settling on
 * `firedOn` alone.**
 */
export function evaluatePromise(
  promise: NinaPendingPromise,
  input: PromiseEvalInput,
): PromiseVerdict {
  const id = promise.id
  const { todayISO } = input

  /* Already resolved. Phase 5's cap ages it out; we never touch it again and never remove it. */
  if (promise.status !== 'pending') {
    return { id, kind: 'wait', reason: `already ${promise.status}` }
  }

  const jobId = promiseJobId(promise)
  const firedOn = firedOnOf(promise)
  const attempts = attemptsOf(promise)

  /* ── STAGE B: a job is on record ─────────────────────────────────────────────────────────── */
  if (jobId != null) {
    /* The photograph landed. This is the ONLY path to 'met'. */
    if (rewardLanded(promise, jobId, firedOn, input)) {
      return { id, kind: 'settle', reason: `${promiseReward(promise)} landed for job ${jobId}` }
    }
    /* Still the same Jakarta day: a GitHub Actions runner takes minutes (RU-20), so waiting is
     * the correct answer and re-firing would be the bug. */
    if (firedOn == null || firedOn >= todayISO) {
      return { id, kind: 'wait', reason: `job ${jobId} in flight` }
    }
    /* A day has passed with nothing to show. Out of attempts, this is over. */
    if (attempts >= PROMISE_MAX_ATTEMPTS) {
      return { id, kind: 'expire', reason: `${attempts} attempts, no ${promiseReward(promise)}` }
    }
    return { id, kind: 'retry', reason: `job ${jobId} produced nothing on ${firedOn}` }
  }
```

Lines 293-312 (Stage A and the tail) are unchanged.

**Code — replace `resolvePromiseSlot`'s `'fire'` case (lines 358-365):**

```ts
      case 'fire':
        changed = true
        /* `reward` is recorded HERE and read by the next sweep's Stage B, so a dial that moves
         * between the dispatch and the landing cannot make the evaluator watch the wrong table.
         * A caller that names no reward means the avatar, which is what every caller meant before
         * R5. A `retry` leaves it alone; the next `fire` overwrites it with the current dial, which
         * is right — the operator changed their mind, so the payout follows. */
        return {
          ...promise,
          reward: decision.reward ?? 'avatar',
          jobId: decision.jobId ?? null,
          firedOn: todayISO,
          attempts: attemptsOf(promise) + 1,
        }
```

**Impact:** `lib/nina/promise.test.ts` passes unchanged — the settle assertion at line 254-264 uses
a promise with no `reward`, which takes the avatar path and gets the identical reason string; the
`input()` helper at line 37 compiles because the new port is optional; no `toEqual` in that file
inspects a whole fired promise, so the new `reward` key on a fired entry breaks no assertion. The
expire reason for an avatar promise changes from `"3 attempts, no avatar"` to `"3 attempts, no
avatar"` — identical — and the test at line 274-287 asserts only `.kind`.

---

### Step 7: the sweep dispatches the right camera and reads the right landing

**File:** `lib/nina/promises.ts` — 11-20 (imports), 38-42 (the D-3 docstring), 59-84
(`NinaPromiseDeps`), 99-126 (`productionPromiseDeps`), and 195-275 inside `resolveNinaPromises`
**Change:** three injected ports, one lazy tuning read, one conditional landing read, and a fire
path that picks a camera. The module still writes to exactly one place — the `pending_promises`
slot — and still posts no message.

**Code — replace lines 11-20 (the two relative import blocks):**

```ts
import { generateNinaAvatar } from './avatargen'
import {
  evaluatePromises,
  promiseJobId,
  promiseReward,
  promiseRewardFor,
  resolvePromiseSlot,
  type PromiseDecision,
  type PromiseEarnedMarker,
  type PromiseFacts,
  type PromiseVerdict,
} from './promise'
import {
  getCurrentNinaAvatar,
  getNinaMemorySlot,
  listNinaSelfieJobIdsSince,
  readNinaTuning,
  upsertNinaMemorySlot,
} from './queries'
import { generateNinaSelfie } from './selfiegen'
import type { NinaTuning } from './tuning'
```

`NinaPromiseReward` also has to come out of `@/lib/db/schema` — replace lines 5-10:

```ts
import {
  NINA_SLOT_PENDING_PROMISES,
  type NinaMemorySource,
  type NinaPendingPromise,
  type NinaPendingPromisesSlot,
  type NinaPromiseReward,
} from '@/lib/db/schema'
```

**Code — replace the "WHY IT NEVER POSTS A MESSAGE" paragraph (lines 38-42):**

```ts
 * ── WHY IT NEVER POSTS A MESSAGE ──────────────────────────────────────────────────────────────
 * D-3, and R5 did not weaken it. This module writes to exactly one place: the `pending_promises`
 * slot. Everything a runner ever SEES is written by `scripts/nina-image-worker.ts`, minutes later,
 * in another process:
 *
 *   · an `'avatar'` reward — `insertNinaAvatarAsCurrent` leaves `announced_at` NULL, and that NULL
 *     is phase 10's `avatar_changed` trigger, so she mentions the new photograph on the next tick;
 *   · a `'selfie'` reward — the worker's `finishSelfie` writes the `nina_messages` +
 *     `nina_message_images` pair, with `ninaImageCaption` for the bubble, and the photograph is in
 *     the conversation.
 *
 * So this file dispatches a job and records that it dispatched one. It does not post, it does not
 * announce, and it does not write either image table. One announcer per reward, reached identically
 * by the promise path, the chat path, the admin path and phase 14's CLI.
```

**Code — replace `NinaPromiseDeps` (lines 58-84) in full:**

```ts
/** Injected so the whole sweep is drivable from a test with no database and no network. */
export interface NinaPromiseDeps {
  readSlot: (userId: string) => Promise<{ value: unknown; source: NinaMemorySource } | null>
  writeSlot: (
    userId: string,
    input: { key: string; value: NinaPendingPromisesSlot; source: NinaMemorySource },
  ) => Promise<void>
  readRuns: (
    userId: string,
    startISO: DateISO,
    endExclusiveISO: DateISO,
  ) => Promise<ReadonlyArray<{ occurredOn: string; distanceM: number }>>
  readRecordMarkers: (userId: string) => Promise<PromiseEarnedMarker[]>
  readBadgeMarkers: (userId: string) => Promise<PromiseEarnedMarker[]>
  /** The current avatar, for the `'avatar'` landing test. Null when there is none (D-2). */
  readCurrentAvatar: (userId: string) => Promise<{ source: string; createdAt: Date } | null>
  /**
   * The generator port for an `'avatar'` reward. **Only `ok` and `jobId` are read**, deliberately:
   * phase 12 was rewritten around GitHub Actions (RU-20) and this is the narrowest surface that
   * survived it. If its result gains or loses an `avatar` field, nothing here changes.
   */
  generateAvatar: (input: {
    userId: string
    scene: string
  }) => Promise<{ ok: boolean; jobId?: string | null }>
  /**
   * The generator port for a `'selfie'` reward — R5. Same narrow `{ ok, jobId }` surface as
   * `generateAvatar`, and one extra argument: the message she made the promise in, so the
   * photograph quotes it when it lands.
   */
  generateSelfie: (input: {
    userId: string
    scene: string
    replyToId: string | null
  }) => Promise<{ ok: boolean; jobId?: string | null }>
  /**
   * The operator's character tuning, for `promiseRewardFor`. **Called at most once per sweep, and
   * only by a sweep that actually fires something** — see `rewardOnce` below. A cron tick over a
   * slot where every promise is waiting performs no extra read.
   */
  readTuning: (userId: string) => Promise<NinaTuning>
  /**
   * The `'selfie'` landing test's raw material: the job ids (`nina_messages.turn_id`) of every
   * generated photograph that has reached the conversation since `since`. One indexed read on
   * `nina_message_images_user_created_idx`, and only performed when some pending promise both has a
   * job on record and a selfie reward.
   */
  readSelfieJobIdsSince: (userId: string, since: Date) => Promise<readonly string[]>
  now: () => Date
}
```

**Code — replace `productionPromiseDeps` (lines 99-126) in full:**

```ts
export function productionPromiseDeps(): NinaPromiseDeps {
  return {
    readSlot: (userId) => getNinaMemorySlot(userId, NINA_SLOT_PENDING_PROMISES),
    writeSlot: (userId, input) => upsertNinaMemorySlot(userId, input),
    readRuns: (userId, startISO, endExclusiveISO) =>
      getRunsBetween(userId, startISO, endExclusiveISO),
    /* `records.achieved_on` is the day of the RUN that holds the key, which is exactly what a
     * promise about breaking a record is about. `getRecords` is the reviewed-gated read
     * (invariant 9); this phase writes no SQL. */
    readRecordMarkers: async (userId) =>
      (await getRecords(userId)).map((row) => ({ key: row.key, earnedOn: row.achievedOn })),
    /* Raw award rows, not `foldAwards`: a folded `StoredBadge` reports only the LATEST earn day,
     * and a promise about a badge he has earned before needs the award that lands INSIDE the
     * window. One row per award is what `badges` stores and what this needs. */
    readBadgeMarkers: async (userId) =>
      (await getBadgeAwards(userId)).map((row) => ({ key: row.key, earnedOn: row.earnedOn })),
    readCurrentAvatar: (userId) => getCurrentNinaAvatar(userId),
    generateAvatar: async ({ userId, scene }) => {
      const result = await generateNinaAvatar({ userId, scene, source: 'generated' })
      /* `NinaAvatarResult` carries `jobId` on BOTH branches as phase 12 shipped it, so the
       * structural cast this plan wrote against an unlanded module is no longer needed — and a
       * cast that asserts less than the type knows is worse than none. Still only `ok` and
       * `jobId` are read, which is the narrow surface the port exists for. */
      return { ok: result.ok, jobId: result.jobId }
    },
    /* R5. `NinaSelfieResult` mirrors `NinaAvatarResult`, so the same two fields are all that is
     * read here — and `generateNinaSelfie` never throws, exactly as `generateNinaAvatar` never
     * does. `source: 'chat'` is set inside it, because a selfie always posts a message. */
    generateSelfie: async ({ userId, scene, replyToId }) => {
      const result = await generateNinaSelfie({ userId, scene, replyToId })
      return { ok: result.ok, jobId: result.jobId }
    },
    readTuning: (userId) => readNinaTuning(userId),
    readSelfieJobIdsSince: (userId, since) => listNinaSelfieJobIdsSince(userId, since),
    now: () => new Date(),
  }
}
```

**Code — insert as a module-level helper, immediately after `parseSlot` (line 136):**

```ts
/**
 * Midnight in Jakarta on a `'YYYY-MM-DD'`, as an instant, for a `created_at >= ?` comparison.
 *
 * The only `Date` arithmetic in the promise mechanism, and it is here rather than in `promise.ts`
 * because that file's header states there is no `Date` anywhere in its logic — a `Date` there would
 * put the server's UTC midnight between him and credit for an evening run. `imagerecipe.ts`'s
 * `jakartaDayStart` does the same conversion from the other direction (an instant, not a day
 * string) and cannot be reused for this; see Handoffs for where this belongs long-term.
 */
function jakartaMidnight(dayISO: DateISO): Date {
  return new Date(`${dayISO}T00:00:00+07:00`)
}
```

**Code — replace lines 195-275 of `resolveNinaPromises` (from the slot read through the fire
loop):**

```ts
  const row = await deps.readSlot(userId)
  if (row == null) return empty

  const slot = parseSlot(row.value)
  if (slot.promises.length === 0) return empty

  const now = deps.now()
  const todayISO = todayInJakarta(now)

  /*
   * THE SELFIE LANDING TEST'S WINDOW — and the reason it is usually not read at all.
   *
   * Only a promise that is still pending, already has a job on record, and pays out as a selfie can
   * be settled by a photograph in the chat. If no promise in the slot is all three, this stays null
   * and the read below is skipped entirely, so the common cron tick costs exactly what it costs
   * today. When it is not null it is the EARLIEST day any of those jobs was fired, which bounds the
   * scan: `PROMISE_MAX_ATTEMPTS` with a one-day cooldown puts a stuck promise out of its misery in
   * four days, and the open-ended TTL caps the worst case at 60 — 6 photographs a day against
   * `NINA_IMAGE_DAILY_CAP`, so a few hundred rows on an indexed range at the very worst.
   */
  let selfieSinceISO: DateISO | null = null
  for (const promise of slot.promises) {
    if (promise.status !== 'pending') continue
    if (promiseReward(promise) !== 'selfie') continue
    if (promiseJobId(promise) == null) continue
    const day = firedOnOfEntry(promise) ?? promise.promisedOn
    if (selfieSinceISO == null || day < selfieSinceISO) selfieSinceISO = day
  }

  const [facts, avatar, selfieJobIds] = await Promise.all([
    loadPromiseFacts(userId, slot.promises, todayISO, deps),
    deps.readCurrentAvatar(userId),
    selfieSinceISO == null
      ? Promise.resolve<readonly string[]>([])
      : deps.readSelfieJobIdsSince(userId, jakartaMidnight(selfieSinceISO)),
  ])

  /*
   * THE 'avatar' LANDING TEST. A generated avatar created on or after the day the job was fired
   * means the photograph arrived — which under RU-20 happened in a GitHub Actions runner, minutes
   * later, in a process that knew nothing about promises. Its one tolerance (a different generated
   * avatar landing the same day) is argued in the plan and costs a mis-attribution of a true event.
   *
   * `source !== 'generated'` is what keeps an ADMIN upload (phase 15) or an OPERATOR push (phase
   * 14) from settling a promise she never took a photograph for.
   */
  const avatarLandedOnOrAfter = (dayISO: DateISO): boolean => {
    if (avatar == null || avatar.source !== 'generated') return false
    return jakartaDayOf(avatar.createdAt) >= dayISO
  }

  /*
   * THE 'selfie' LANDING TEST, and it needs no tolerance at all. The worker writes the job id into
   * `nina_messages.turn_id` when it posts the photograph, so this is an exact match on the job this
   * promise dispatched. A selfie HE asked for in chat has a different job id and settles nothing —
   * which a count of photographs since a day could not have promised, and which matters here in a
   * way it does not for avatars: `generate_image` is a tool she calls up to six times a day.
   */
  const landedSelfieJobs = new Set(selfieJobIds)
  const selfieLandedForJob = (jobId: string): boolean => landedSelfieJobs.has(jobId)

  const verdicts = evaluatePromises(slot.promises, {
    todayISO,
    facts,
    avatarLandedOnOrAfter,
    selfieLandedForJob,
  })

  const byId = new Map(slot.promises.map((promise) => [promise.id, promise]))
  const decisions: PromiseDecision[] = []
  let fired = 0

  /*
   * The tuning, read at most once and only if something fires. `resolveNinaPromises` runs every
   * five minutes per user and almost every run fires nothing, so an unconditional read here would
   * be a primary-key lookup per user per tick for a value nobody uses.
   */
  let tuning: NinaTuning | null = null
  const rewardOnce = async (): Promise<NinaPromiseReward> => {
    tuning ??= await deps.readTuning(userId)
    return promiseRewardFor(tuning.traits.steamy)
  }

  const deadline = now.getTime() + NINA_PROMISE_SWEEP_BUDGET_MS

  for (const verdict of verdicts) {
    if (verdict.kind !== 'fire') {
      decisions.push({ verdict })
      continue
    }

    /* Out of budget: leave it entirely alone. A `fire` recorded without a dispatch would burn an
     * attempt for a job that was never asked for. */
    if (Date.now() > deadline) {
      decisions.push({ verdict: { ...verdict, kind: 'wait', reason: 'sweep budget spent' } })
      continue
    }

    const promise = byId.get(verdict.id)
    if (promise == null) {
      decisions.push({ verdict })
      continue
    }

    /*
     * The scene is HER promise in her own words plus his condition — the two display-ready strings
     * phase 5 already distilled. It becomes `nina_avatars.description` or
     * `nina_message_images.description` verbatim, which is precisely what R25 then reads back out
     * of the row to invent a story about. No prompt engineering happens here: `imagegen.ts` owns
     * `buildNinaImagePrompt` and `persona.ts` owns her appearance.
     */
    const scene = `${promise.text} (${promise.condition})`

    /*
     * WHICH CAMERA. R5: at a high `steamy` the payoff is a photograph she SENDS him, which is the
     * whole psychological point of the feature — a profile-picture change he has to go and look for
     * is not the reward the user described. The choice is recorded on the entry by
     * `resolvePromiseSlot` so the settle test reads it back rather than re-deriving it from a dial
     * that may have moved in the meantime.
     */
    const reward = await rewardOnce()

    /* Neither generator ever throws — both state that guarantee. The catch is belt and braces: an
     * unexpected throw must degrade to "refused", never to a half-written slot. */
    let outcome: { ok: boolean; jobId?: string | null }
    try {
      outcome =
        reward === 'selfie'
          ? await deps.generateSelfie({
              userId,
              scene,
              /* The photograph quotes the message she made the promise in — the most legible thing
               * it could possibly quote. The worker writes this through an ownership subselect, so
               * a message he has since deleted degrades to a plain photograph rather than losing
               * it. */
              replyToId: promise.sourceMessageId,
            })
          : await deps.generateAvatar({ userId, scene })
    } catch (error) {
      console.warn('[nina] promise generation threw', { promiseId: promise.id, reward, error })
      outcome = { ok: false, jobId: null }
    }

    if (outcome.ok) fired += 1
    decisions.push({ verdict, reward, jobId: outcome.ok ? (outcome.jobId ?? null) : null })
  }
```

Lines 277-296 (`resolvePromiseSlot`, the conditional write, the return) are unchanged.

**Code — one more module-level helper, needed by the window loop above. Insert it beside
`jakartaMidnight`:**

```ts
/**
 * `firedOn` off a slot entry, tolerantly. `promise.ts` keeps its own private copy of this reader
 * and deliberately does not export it — that file is the state machine and this is one field of a
 * `jsonb` row. Three lines duplicated is cheaper here than widening that module's surface.
 */
function firedOnOfEntry(promise: NinaPendingPromise): DateISO | null {
  const raw = (promise as { firedOn?: string | null }).firedOn
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}
```

**Impact:** the fire path picks a camera; the settle path recognises both landings; the sweep still
writes only the slot. `app/api/cron/nina/route.ts:123` is unchanged — it calls
`resolveNinaPromises(userId)` and gets the new production deps for free. `tests/nina.cron.test.ts`
is unchanged: it mocks `@/lib/nina/promises` wholesale.

---

### Step 8: the selfie landing query

**File:** `lib/nina/queries.ts` — **appended after line 1882, at the very end of the file**
**Change:** one `userId`-first read. **No edit anywhere above line 1882, and no new import** —
`and`, `eq`, `gte`, `isNotNull`, `ninaMessageImages` and `ninaMessages` are all already imported at
lines 1-24. Phase 1 is appending `readNinaTuning` / `writeNinaTuning` to this same file; this
section is deliberately last and self-contained so the two appends do not overlap.

The parameter is typed `string` and not `DateISO` on purpose: `DateISO` is a plain alias for
`string` in `lib/date/ranges.ts`, and importing it would mean editing this file's import block —
the one place a concurrent phase-1 edit would collide.

**Code — append at the end of the file:**

```ts
/* ============================================================================
 * §12 The promise reward's landing test (R5, phase 4)
 * ==========================================================================*/

/**
 * **The job ids of photographs that have actually reached the conversation.**
 *
 * `scripts/nina-image-worker.ts`'s `finishSelfie` writes two rows for every chat selfie: a
 * `nina_messages` row with `turn_id` set to the image job's id, and a `nina_message_images` row
 * with `kind = 'generated'`. So the existence of a `turn_id` in this result is proof that a
 * specific dispatched job produced a specific visible photograph — which is exactly what
 * `evaluatePromise`'s `selfieLandedForJob` needs, and which nothing weaker can promise.
 *
 * ── WHY IDS AND NOT A COUNT ───────────────────────────────────────────────────────────────────
 * A count of photographs since a day would let a selfie HE asked for through `generate_image`
 * settle a promise he had not kept — `NINA_IMAGE_DAILY_CAP` allows six a day, so that is not a
 * theoretical collision. The avatar landing test can afford a same-day tolerance because a
 * *generated avatar* only ever comes from a promise or an operator; a chat selfie cannot. Same
 * read, same index, exact answer.
 *
 * ── WHY IT IS INDEXED ─────────────────────────────────────────────────────────────────────────
 * `nina_message_images_user_created_idx on (user_id, created_at desc)` is the leading-column range
 * scan, and the join to `nina_messages` is on that table's primary key. `since` is the Jakarta
 * midnight of the earliest fired job the caller cares about; the caller computes it, because the
 * calendar rules for a promise live in `lib/nina/promises.ts` and not here.
 *
 * `kind = 'generated'` excludes HIS uploads, which share the table.
 */
export async function listNinaSelfieJobIdsSince(
  userId: string,
  since: Date,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ jobId: ninaMessages.turnId })
    .from(ninaMessageImages)
    .innerJoin(ninaMessages, eq(ninaMessages.id, ninaMessageImages.messageId))
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.kind, 'generated'),
        gte(ninaMessageImages.createdAt, since),
        isNotNull(ninaMessages.turnId),
      ),
    )
  return rows.map((row) => row.jobId).filter((jobId): jobId is string => jobId != null)
}
```

**Impact:** one new exported read. `scripts/check-data-layer-invariants.mjs` scopes its
`userId`-first rule to `lib/db/queries.ts`, but the convention holds here and this obeys it.

---

### Step 9: the image tests

**File:** `tests/nina.imagerecipe.test.ts` — the `describe('the prompt')` block, lines 58-93
**Change:** append five cases. The five existing ones are **not** edited — they call
`buildNinaImagePrompt` with no tuning, and that is now one half of invariant 2's assertion.

**Code — replace lines 1-3 (the import head) so the tuning is available:**

```ts
import { describe, expect, it } from 'vitest'

import { buildNinaImagePrompt, sidecarText } from '@/lib/nina/imagegen'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'
import { NINA_TUNING_DEFAULTS, type NinaTrait, type NinaTuning } from '@/lib/nina/tuning'
```

**Code — insert inside `describe('the prompt')`, after the case at line 92:**

```ts
  /** One field moved off the defaults, everything else exactly as it ships. */
  function tuned(over: Partial<NinaTuning>): NinaTuning {
    return { ...NINA_TUNING_DEFAULTS, ...over }
  }

  /** One TRAIT moved. The traits are nested under `traits` — phase 1's landed shape. */
  function withTrait(key: NinaTrait, value: number): NinaTuning {
    return tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, [key]: value } })
  }

  it('PLAN INVARIANT 2: the default tuning renders the prompt that shipped, byte for byte', () => {
    /*
     * The compatibility contract of the whole set, asserted at the one place a photograph is
     * decided. Two things are checked at once: the tuning is genuinely OPTIONAL (the left-hand
     * side names none), and `NINA_TUNING_DEFAULTS` is genuinely the today-equivalent setting (the
     * right-hand side names it). If a default `steamy` or `flirty` ever reaches band `high`, or
     * the default wardrobe stops being `''`, this is the test that says so.
     */
    const shipped = buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' })
    const defaulted = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      tuning: NINA_TUNING_DEFAULTS,
    })
    expect(defaulted).toBe(shipped)
    expect(defaulted).not.toContain('POSE AND PRESENCE')

    const shippedAvatar = buildNinaImagePrompt({ purpose: 'avatar', scene: 'x' })
    expect(buildNinaImagePrompt({ purpose: 'avatar', scene: 'x', tuning: NINA_TUNING_DEFAULTS })).toBe(
      shippedAvatar,
    )
  })

  it('R5: the WARDROBE reaches the photograph, and the canon outfit does not', () => {
    /*
     * The user's own example — "her sexy photo in a short pants". The outfit was hardcoded in
     * `NINA_APPEARANCE` and every generated photograph wore it whatever the operator set. Phase 2's
     * `ninaAppearance` is the seam; this asserts the seam is actually wired to the camera.
     */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      tuning: tuned({ wardrobe: 'a black crop top and very short white running shorts' }),
    })
    expect(prompt).toContain('very short white running shorts')
    expect(prompt).not.toContain('heather-grey racerback tank')
    /* Still HER, though: the wardrobe replaces the outfit, never the person. */
    expect(prompt).toContain('high ponytail')
  })

  it('R5: a high steamy dial adds a POSE AND PRESENCE block, before the scene', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      mood: 'smug',
      tuning: withTrait('steamy', 100),
    })
    expect(prompt).toContain('POSE AND PRESENCE:')
    /* Standing property of the subject before the scene; per-photograph note after it. */
    expect(prompt.indexOf('POSE AND PRESENCE:')).toBeLessThan(prompt.indexOf('SCENE:'))
    expect(prompt.indexOf('SCENE:')).toBeLessThan(prompt.indexOf('EXPRESSION AND ENERGY:'))
  })

  it('a high flirty dial reaches BOTH cameras; a high steamy dial reaches only the selfie', () => {
    /*
     * `NINA_AVATAR_STYLE` asks for head and shoulders in a 28-44 px circle. A pose instruction
     * about her hips under that crop is a prompt arguing with itself, which is the class of
     * contradiction `imagegen.ts`'s header says degrades a generation for free.
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

  it('still never claims a reference image is authoritative, at any dial', () => {
    /* RU-18. The new clauses must not reintroduce the word — an instruction to defer to an image
     * that is not in the payload degrades the prompt. */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      tuning: tuned({
        traits: { ...NINA_TUNING_DEFAULTS.traits, steamy: 100, flirty: 100 },
        wardrobe: 'a red bikini',
      }),
    })
    expect(prompt.toLowerCase()).not.toContain('reference')
  })
```

**Impact:** the invariant-2 assertion is what catches a phase-1 default drift or a phase-2 seam that
does not reproduce `NINA_APPEARANCE`, and it catches it at `npm test` rather than in production.

---

### Step 10: the promise tests

**File:** `tests/nina.promise.reward.test.ts` — **NEW FILE**
**Change:** the reward's default, its derivation, both selfie settle paths, and the invariant.

**Code — the whole file:**

```ts
import { describe, expect, it } from 'vitest'

import type { NinaPendingPromise, NinaPendingPromisesSlot } from '@/lib/db/schema'
import {
  evaluatePromise,
  promiseJobId,
  promiseReward,
  promiseRewardFor,
  PROMISE_MAX_ATTEMPTS,
  resolvePromiseSlot,
  type PromiseEvalInput,
  type PromiseFacts,
} from '@/lib/nina/promise'

/**
 * R5 — the photo-reward exploit, on the promise side.
 *
 * `lib/nina/promise.test.ts` already proves the state machine for the avatar reward and every one
 * of its cases still passes untouched; this file proves only what the second reward added. The one
 * property worth stating twice is the one `evaluatePromise`'s docstring is built around: **a failed
 * generation can never consume a promise**, and generalising the landing test from one reward to
 * two must not have opened a second door to `status: 'met'`.
 */

/** The user's own example from R19, plus a selfie reward and a job already on record. */
function promise(over: Partial<NinaPendingPromise> = {}): NinaPendingPromise {
  return {
    id: 'pr0000000001',
    text: 'kalo lo lari konsisten seminggu ini, gw kirim foto',
    condition: 'kalau lo lari 5x minggu ini',
    metric: 'run_count',
    target: 5,
    targetKey: null,
    byDate: '2026-09-06',
    promisedOn: '2026-09-01',
    sourceMessageId: 'ms0000000001',
    status: 'pending',
    resolvedOn: null,
    ...over,
  }
}

const FIVE_RUNS: PromiseFacts = {
  runs: [
    { occurredOn: '2026-09-01', distanceM: 5_000 },
    { occurredOn: '2026-09-02', distanceM: 5_000 },
    { occurredOn: '2026-09-03', distanceM: 5_000 },
    { occurredOn: '2026-09-04', distanceM: 5_000 },
    { occurredOn: '2026-09-05', distanceM: 5_000 },
  ],
  records: [],
  badges: [],
}

function input(over: Partial<PromiseEvalInput> = {}): PromiseEvalInput {
  return {
    todayISO: '2026-09-05',
    facts: FIVE_RUNS,
    avatarLandedOnOrAfter: () => false,
    ...over,
  }
}

/** Fired yesterday, so the same-day "in flight" branch is not what answers. */
const firedSelfie = promise({
  reward: 'selfie',
  jobId: 'jb0000000001',
  firedOn: '2026-09-04',
  attempts: 1,
})

describe('promiseReward — absent means the avatar, forever', () => {
  it('a promise written before R5 reads as the avatar reward', () => {
    expect(promiseReward(promise())).toBe('avatar')
  })

  it('an explicit selfie reads as a selfie', () => {
    expect(promiseReward(promise({ reward: 'selfie' }))).toBe('selfie')
  })

  it('a hand-edited slot with nonsense in the field reads as the avatar, and does not throw', () => {
    const junk = { ...promise(), reward: 'polaroid' } as unknown as NinaPendingPromise
    expect(promiseReward(junk)).toBe('avatar')
  })

  it('promiseJobId is the same tolerant reader it always was', () => {
    expect(promiseJobId(promise())).toBeNull()
    expect(promiseJobId(promise({ jobId: '' }))).toBeNull()
    expect(promiseJobId(firedSelfie)).toBe('jb0000000001')
  })
})

describe('promiseRewardFor — the steamy dial decides', () => {
  it('a default-ish dial keeps the avatar reward, so nothing changes until a slider moves', () => {
    /* `steamy` defaults to 0, and band `high` starts at 60 — the ONE band vocabulary, phase 1's. */
    expect(promiseRewardFor(0)).toBe('avatar')
    expect(promiseRewardFor(59)).toBe('avatar')
  })

  it('at band high and above, she sends him the photograph instead', () => {
    expect(promiseRewardFor(60)).toBe('selfie')
    expect(promiseRewardFor(100)).toBe('selfie')
  })

  it('a non-number degrades to the avatar rather than throwing', () => {
    expect(promiseRewardFor(Number.NaN)).toBe('avatar')
  })
})

describe('evaluatePromise — stage B for a selfie reward', () => {
  it('THE PHOTOGRAPH LANDED IN THE CHAT: settle. R5, end to end', () => {
    const v = evaluatePromise(
      firedSelfie,
      input({ selfieLandedForJob: (jobId) => jobId === 'jb0000000001' }),
    )
    expect(v.kind).toBe('settle')
    expect(v.reason).toContain('selfie')
  })

  it('A DIFFERENT job landing settles NOTHING — she takes six selfies a day', () => {
    /*
     * The whole reason the selfie landing test matches a job id instead of counting photographs
     * since a day: `generate_image` is a tool he can ask her to use, and a photo he asked for must
     * not pay out a promise he did not keep.
     */
    const v = evaluatePromise(
      firedSelfie,
      input({ selfieLandedForJob: (jobId) => jobId === 'some-other-job' }),
    )
    expect(v.kind).toBe('retry')
  })

  it('AN AVATAR LANDING CANNOT SETTLE A SELFIE PROMISE, and vice versa', () => {
    const selfieVerdict = evaluatePromise(
      firedSelfie,
      input({ avatarLandedOnOrAfter: () => true, selfieLandedForJob: () => false }),
    )
    expect(selfieVerdict.kind).not.toBe('settle')

    const firedAvatar = promise({ jobId: 'jb0000000002', firedOn: '2026-09-04', attempts: 1 })
    const avatarVerdict = evaluatePromise(
      firedAvatar,
      input({ avatarLandedOnOrAfter: () => false, selfieLandedForJob: () => true }),
    )
    expect(avatarVerdict.kind).not.toBe('settle')
  })

  it('THE INVARIANT: with no selfie port at all, a selfie promise never reaches met', () => {
    /*
     * `evaluatePromise`'s docstring: "settle is reachable only through the landing test, and
     * nothing else in this function writes status: 'met'". A caller that knows nothing about
     * selfies must wait, retry and expire — never settle. This is the failure direction a wrong
     * answer here would flip.
     */
    for (const todayISO of ['2026-09-04', '2026-09-05', '2026-09-30']) {
      expect(evaluatePromise(firedSelfie, input({ todayISO })).kind).not.toBe('settle')
    }
    const spent = promise({
      reward: 'selfie',
      jobId: 'jb0000000001',
      firedOn: '2026-09-04',
      attempts: PROMISE_MAX_ATTEMPTS,
    })
    const v = evaluatePromise(spent, input({ todayISO: '2026-09-06' }))
    expect(v.kind).toBe('expire')
    expect(v.reason).toContain('selfie')
  })

  it('a job dispatched TODAY still waits, whatever the reward', () => {
    const today = promise({ reward: 'selfie', jobId: 'jb1', firedOn: '2026-09-05', attempts: 1 })
    expect(evaluatePromise(today, input({ selfieLandedForJob: () => false })).kind).toBe('wait')
  })
})

describe('resolvePromiseSlot — the fire records which camera it asked', () => {
  const slot: NinaPendingPromisesSlot = { promises: [promise({ id: 'a' })] }

  it('a selfie fire writes reward beside jobId, firedOn and attempts', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, reward: 'selfie', jobId: 'jb1' }],
      '2026-09-05',
    )
    const a = out.slot.promises[0]!
    expect(promiseReward(a)).toBe('selfie')
    expect(promiseJobId(a)).toBe('jb1')
    expect(a.firedOn).toBe('2026-09-05')
    expect(a.attempts).toBe(1)
    expect(a.status).toBe('pending')
  })

  it('a fire that names NO reward writes the avatar, which is what every caller meant before R5', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, jobId: 'jb1' }],
      '2026-09-05',
    )
    expect(promiseReward(out.slot.promises[0]!)).toBe('avatar')
  })

  it('A REFUSED SELFIE CONSUMES NOTHING: the reward and the cooldown, no job, no status', () => {
    const out = resolvePromiseSlot(
      slot,
      [{ verdict: { id: 'a', kind: 'fire', reason: '' }, reward: 'selfie', jobId: null }],
      '2026-09-05',
    )
    const a = out.slot.promises[0]!
    expect(a.status).toBe('pending')
    expect(promiseJobId(a)).toBeNull()
    expect(a.attempts).toBe(1)
  })

  it('a retry leaves the reward alone, so the same camera is asked again', () => {
    const fired: NinaPendingPromisesSlot = {
      promises: [promise({ id: 'a', reward: 'selfie', jobId: 'jb1', firedOn: '2026-09-04' })],
    }
    const out = resolvePromiseSlot(
      fired,
      [{ verdict: { id: 'a', kind: 'retry', reason: '' } }],
      '2026-09-05',
    )
    const a = out.slot.promises[0]!
    expect(promiseJobId(a)).toBeNull()
    expect(promiseReward(a)).toBe('selfie')
    expect(a.firedOn).toBe('2026-09-04')
  })
})
```

**Impact:** the R5 exit criterion is asserted in a file that imports only pure modules — no
`server-only`, no database client, no `next/server`. See Handoffs for why the impure sweep
(`resolveNinaPromises`) is not driven from a test here.

---

## Verification

**Lint:** `npm run lint` — the unused-import removals in `imagetools.ts` (Step 3) are required by
this, not optional.
**Typecheck:** `npm run typecheck`
**Tests:** `npm test`, and specifically
`npx vitest run tests/nina.imagerecipe.test.ts tests/nina.promise.reward.test.ts lib/nina/promise.test.ts tests/nina.memory.test.ts tests/nina.cron.test.ts tests/db.schema.nina.test.ts`
**Guards:** `npm run ci:data-layer-guard`, `npm run ci:llm-payload-guard`,
`npm run ci:openrouter-guard`, `npm run ci:client-secret-guard`
**Worker still loads:** `node --experimental-strip-types --no-warnings -e "import('./scripts/nina-image-worker.ts').then(()=>console.log('worker loads'))"`
— plan invariant 9's real check. If either `imagerecipe.ts` or `imagefail.ts` gained an import, this
is what fails.

**Manual check (production, one Jakarta day):**

1. `/admin/nina` (phase 5) or a direct row write: `wardrobe` = *"a black crop top and very short
   white running shorts"*, `steamy` = 100 (band `max`; anything from 60 up is band `high` and enough).
2. Ask her for a photo in `/nina`. When it lands, read `nina_turns.args.prompt` for that job: it
   must contain the wardrobe line, a `POSE AND PRESENCE:` block, and **not** *"heather-grey
   racerback tank"*.
3. Put a promise in the `pending_promises` slot with a condition he has already met, and no
   `reward` field. Hit the cron. Expect `reward: 'selfie'` and a `firedOn` on the entry, a
   `nina_turns` row with `args.purpose = 'selfie'`, and — minutes later — a photograph **in the
   conversation**, quoting the message the promise was made in. The next cron tick settles it to
   `status: 'met'`.
4. Set `steamy` back to its default (0) and repeat step 3: `reward: 'avatar'`, her profile picture
   changes, and the `avatar_changed` trigger has her mention it. Identical to today.

**Exit criteria:**

- `buildNinaImagePrompt` with no tuning and with `NINA_TUNING_DEFAULTS` return the same string, and
  that string is the one that shipped.
- A non-empty `wardrobe` replaces the canon outfit in the stored prompt for both purposes; the rest
  of `NINA_APPEARANCE` survives.
- A promise fired while `steamy` is in band `high` or above (60+) dispatches `purpose: 'selfie'`, arrives as a `nina_messages`
  + `nina_message_images` pair, and settles on that exact job's landing.
- A promise with no `reward` field fires an avatar and settles on an avatar landing — today's
  behaviour, unchanged.
- No path writes `status: 'met'` except through a landing predicate. A refused dispatch, a failed
  generation, and a missing selfie port all leave the promise pending.
- `drizzle/` is untouched and `git diff --stat drizzle/` is empty.

---

## Handoffs

1. **CLOSED IN RECONCILIATION — one band vocabulary, and it is phase 1's.** Both private thresholds
   are gone; the camera and the promise both read `ninaBand()` and act at band `high`. See
   Decision 2 for the reasoning, which is that `/admin/nina` renders the band name and a dial whose
   visible band disagrees with what the camera wants is a dial the operator cannot predict. This is
   no longer an open ruling for phase 6's sweep, and its sweep should find one vocabulary.
2. **CLOSED IN RECONCILIATION — `PromiseCandidateSchema` is NOT extended, by anybody, and
   `lib/nina/memory.ts` stays untouched by this set.** This phase handed the question to phase 6 and
   phase 6 handed it back (its OQ-6); the tie is broken here, in favour of Decision 3, on three
   grounds:

   - **R5 works without it.** The dial-derived path delivers the whole requirement: at
     `steamy >= 60` a kept promise dispatches `purpose: 'selfie'` and the photograph arrives in the
     conversation. Nothing about the user's exploit depends on the model *declaring* the reward.
   - **Her own words are already hers.** The thing that made the user's example his example — *"she
     is proposing if i run consistently this week, then she will send me her sexy photo"* — is that
     **she** says it, in her voice, in the chat. That is phase 2's `steamy` band text, which at
     `max` tells her in so many words to *"attach a photograph of yourself to every training
     commitment you can — his consistency for your picture, and you make the deal out loud, in your
     own words"*. The promise she speaks is her idea; the reward field is only how the sweep knows
     which table to watch for the payout.
   - **A model-reported reward is not self-contained and would silently do nothing.** Verified:
     `PromiseCandidateSchema` (`memory.ts:834`) is a plain `z.object`, so Zod **strips** an unknown
     `reward` with no error; `normalisePromise` (`:929`) constructs `NinaPendingPromise` field by
     field and would drop it again; and the distiller would never emit it without a clause in
     `DISTILL_SYSTEM_PROMPT`. Three coordinated edits across two files in two phases' territory, for
     a field with a working default — and every one of the three failing *silently* if a phase
     forgot its part. And a reward frozen at distillation time cannot move when the slider moves,
     which is the opposite of what a slider is for.

   **If it is ever wanted, it is one card, not a hole in this set:** `reward:
   z.enum(['avatar','selfie']).optional()` on `PromiseCandidateSchema`, a pass-through in
   `normalisePromise`, one terse clause in `DISTILL_SYSTEM_PROMPT`, and `rewardOnce()` becomes
   `promiseReward(promise) ?? promiseRewardFor(tuning.traits.steamy)` — the promise's own
   declaration winning, the dial as the default. `resolvePromiseSlot` already records whatever it is
   handed, so `promise.ts` would not change at all.
3. **CLOSED IN RECONCILIATION — there is no `lib/nina` package readme to update.**
   `lib/nina/.workflows/` **does not exist** (verified: the repo has exactly three
   `package_readme.md` files — `lib/db`, `lib/admin`, `components/admin` — and none of them mentions
   the persona, the prompts or the image path). So nothing in this set made a `lib/nina` readme
   stale, and `lib/nina/selfiegen.ts` has no readme to be added to. Writing one for the largest
   package in the repo is a `/update-readme` card of its own; phase 6 keeps that as its H-5 and it
   stays out of this set.
4. **Nobody — a promise-aware caption.** A promise payout lands with a `NINA_IMAGE_CAPTIONS` line
   ("nih, puas?") drawn deterministically from the job id, exactly as a chat selfie does. It reads
   perfectly well and it is not what a friend paying off a bet would say. Changing it means
   `lib/nina/imagefail.ts`, which is **ZERO-IMPORT** under plan invariant 9 and cannot be given a
   promise-shaped argument without the worker learning about promises. The honest options are a new
   zero-import caption array keyed by `NinaImageJobArgs.source`, or leaving it. Left, on purpose.
5. **Nobody — `jakartaMidnight` belongs in `lib/date/ranges.ts`.** Step 7 defines it locally in
   `promises.ts` because `ranges.ts` is in no phase's OWNS list for this set and a shared date
   helper is not worth a cross-phase collision. `imagerecipe.ts`'s `jakartaDayStart` does the
   converse conversion and cannot be reused. Two callers would justify the move.
6. **RESOLVED — `lib/nina/queries.ts` is edited by both phase 1 and phase 4, and the order holds.**
   Phase 1 appends `§10 The character tuning` (`readNinaTuning` / `writeNinaTuning` / the two row
   mappers) after today's last function, `deleteNinaFolderSubtree` at `:1875-1882`, and edits
   `NinaTurnInsert` (`:206`) and `insertNinaTurn` (`:1011`) above it. This phase **appends only**, as
   **`§11`** — after phase 1's section, not before it, which is why the draft's `§12` was corrected
   — and adds **no import** (every symbol it needs is already imported at lines 1-24). This phase
   already depends on phase 1, so the file is quoted here as it looks AFTER phase 1: the append
   point is the end of phase 1's `§10`, and nothing this phase writes reads anything above it.
7. **RESOLVED — the two test files stay two.** The new cases could equally live at the bottom of
   `lib/nina/promise.test.ts`. They are in `tests/nina.promise.reward.test.ts` so that a phase-4
   revert is one file deletion plus one hunk, rather than a surgical excision from a 405-line suite
   nobody else in this set touches. **The reconciler kept them separate**: no other phase touches
   either file, the fixtures are self-contained, and a phase-4 revert being one file deletion plus
   one hunk is worth more than tidiness.
8. **Not done, and stated for the record — no test drives `resolveNinaPromises` itself.** The deps
   are fully injected and the sweep *is* drivable, but `lib/nina/promises.ts` imports
   `./imagedispatch`, which imports `after` from `next/server` at module scope, and no test in the
   tree imports a module on that path today. Rather than guess at a `vi.mock('next/server', …)`
   that may or may not be needed, this phase pushed every decision the sweep makes into pure
   functions (`promiseRewardFor`, `promiseReward`, `promiseJobId`, `rewardLanded` via
   `evaluatePromise`) and tested those. A future `tests/nina.promises.test.ts` with a mocked
   `next/server` would still be worth having, and would need no production change to write.

---

## Rollback

This phase is one commit on `feature/nina-character-tuning`. `git revert <sha>` backs it out
completely, in either order relative to every other phase in the set:

- **No migration, no column, nothing in `drizzle/`.** `reward` lives inside an existing `jsonb`
  value, so reverting the code leaves the key sitting in some slot rows where it is simply not read
  — a promise with a `reward` the code no longer knows about is evaluated by the reverted
  `avatarLandedOnOrAfter`, exactly as it was before this phase. Inert, and self-correcting on the
  next fire.
- **An in-flight selfie promise is the one thing to look at.** A promise fired as a selfie whose
  photograph has not landed yet will, after a revert, be watched for an *avatar* landing that will
  never come: it retries up to `PROMISE_MAX_ATTEMPTS` and expires, and the photograph still arrives
  in the chat because the worker was already told. Nothing is lost and nothing is stuck; one
  promise is marked expired that could have been met. To avoid even that, drop the `reward` keys out
  of the `pending_promises` slot before reverting.
- **`lib/nina/selfiegen.ts` disappears with the revert**, and `handleGenerateImage` returns to its
  inlined dispatch. Nothing outside `lib/nina/` imports it.
- **Behavioural rollback is cheaper than the code one, and needs no deploy:** clear `wardrobe` and
  set `steamy` and `flirty` back to their defaults (both 0) on `/admin/nina`. Step 9's invariant-2
  assertion is the guarantee that this returns the exact camera that shipped.
