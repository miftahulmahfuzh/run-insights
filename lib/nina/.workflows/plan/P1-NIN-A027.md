> Adopted from `NINA_IMAGE_GENERATION_TAB_PLAN.md` phase 6. Source: `.workflows/plan/nina-image-generation-tab/phase-6.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 6: Test prompt, its verdict, and the photo in Chat photos

**Plan set:** `NINA_IMAGE_GENERATION_TAB_PLAN.md`
**Analysis:** `20260907-124015-IMGN_code_analyzer.md`
**Satisfies:** R11 (a test-prompt button that reports whether the provider's guardrails allowed it), R12 (the test result lands in Chat photos automatically)
**Depends on:** Phase 2, Phase 3, Phase 4
**Difficulty:** HARD
**Package:** `lib/nina` (primary), plus `lib/admin`, `components/admin`, `app/admin`

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

After this phase `/admin/image-generation` has a button that spends one generation off the daily cap
to find out whether the provider will draw the prompt the saved prefs assemble — and says which of
four things happened, with `policy` (and only `policy`) rendered as a refusal. The button opens a
job and returns; it never awaits 78–220 s inside a browser POST. R12 needs no new writer at all:
the job is an ordinary `purpose: 'selfie'` job, so `finishSelfie` mints the `nina_messages` +
`nina_message_images (kind: 'generated')` pair that **is** the collection `/admin/photos` lists.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts.

**Deletes:** none. This phase deletes no symbol, no column, no config key.

**Renames:** none.

**Creates:**

- `lib/nina/imagetest.ts` (new file)
  - `NINA_IMAGE_TEST_SCENE` — the `string` constant that fills `buildNinaImagePrompt`'s required
    `scene` slot for a prompt test.
  - `assembleNinaImageTestPrompt(input: { tuning; prefs }): string` — **pure.** No await, no model,
    no I/O. The preview and the dispatch call the same function, which is the only way the
    "prompt as sent" preview can be honest.
  - `NinaImageTestDispatch` (type) — `{ ok: true; jobId: string; prompt: string; seed: number }`
    `| { ok: false; jobId: null; kind: NinaImageFailure | 'capped' }`
  - `dispatchNinaImageTest(userId: string): Promise<NinaImageTestDispatch>` — `selfiegen.ts`'s
    sibling. Cap first, then seed, then prompt, then one `openNinaImageJob`, then one
    `fireNinaImageGeneration`. Never throws, never posts a message.
- `lib/admin/imageGenTestView.ts` (new file) — pure, client-safe, zero server imports, node-testable
  (`lib/nina/jobview.ts`'s precedent, and phase 5's `photoReferenceModel.ts`'s).
  - `NINA_IMAGE_TEST_VERDICTS`, `NinaImageTestVerdict`
  - `NinaImageTestJobView` (structural interface, `createdAtMs: number` not a `Date`)
  - `imageTestVerdict(job: NinaImageTestJobView | null): NinaImageTestVerdict`
  - `imageTestVerdictIsOpen(verdict): boolean`
  - `NINA_IMAGE_TEST_VERDICT_LINE`, `NINA_IMAGE_TEST_VERDICT_WHY`, `NINA_IMAGE_TEST_REASON`
  - `NINA_IMAGE_TEST_POLL_INTERVALS_MS`, `NINA_IMAGE_TEST_POLL_MID_AFTER_ATTEMPTS`,
    `NINA_IMAGE_TEST_POLL_LATE_AFTER_ATTEMPTS`, `imageTestPollDelayFor`,
    `NINA_IMAGE_TEST_GIVE_UP_MS = 480_000`
- `lib/admin/imageGenActions.ts` (**phase 4's file — appended, not created**)
  - `NinaImageTestDispatchResult` (type)
  - `NinaImageTestReadResult` (type)
  - `runNinaImageTestAction(): Promise<NinaImageTestDispatchResult>` — **takes no arguments.**
  - `readNinaImageTestAction(jobId: string | null): Promise<NinaImageTestReadResult>`
- `components/admin/ImageGenTestPanel.tsx` (new file) — `ImageGenTestPanel`, default-exportless named
  export, props `{ dirty?: boolean }` (both optional, so `<ImageGenTestPanel />` compiles).
- `tests/admin.imagegenTest.test.ts` (new file)

**Signature changes:** none to any existing symbol.

**Modifies (one edit each, both in another phase's file, both granted by the index):**

- `app/admin/image-generation/page.tsx` — adds `export const maxDuration = 300` as a **literal**.
- `components/admin/ImageGenPanel.tsx` — replaces phase 4's `SEAM — PHASE 6` comment and the
  placeholder `<p>` under it with `<ImageGenTestPanel dirty={dirty} />` plus one import line.
  **RECONCILED: `dirty` is passed.** Phase 4's seam comment predicted
  `<ImageGenTestPanel userId={userId} dirty={dirty} revision={revision} />`; this component's prop
  list is `{ dirty?: boolean }` and this phase owns it, so `userId` and `revision` are dropped
  (`runNinaImageTestAction` takes no arguments and reads `requireAdmin()` server-side, and the panel
  polls an action rather than depending on this page re-rendering). Passing `dirty` closes this
  phase's own Handoff 4; it is in scope at the seam as phase 4's `unsaved.size > 0`.

**Requires (from earlier phases):**

- Phase 1 — `readNinaImagePrefs(userId): Promise<NinaImagePrefs>` **and
  `resolveNinaPhotoReference(userId, reference): Promise<NinaPhotoRef | null>`** exported from
  `lib/nina/queries.ts`; `NinaImagePrefs`, `NinaImageReference` and `NinaPhotoRef` exported from
  `lib/nina/imageprefs.ts`. **RECONCILED: the prefs row holds `reference: { source, id }`, NOT a
  Blob URL** — this phase resolves it (see Step 1 and Assumptions A1).
- Phase 2 — `buildNinaImagePrompt` accepts the prefs (Assumptions A2). `sidecarText` keeps accepting
  `{ prompt, seed, purpose }` (Assumptions A3).
- Phase 3 — `NinaImageJobArgs.referenceUrl: string | null` exists on the args type
  (`lib/nina/imagerecipe.ts`), and `callNinaImageModel` picks the anchored timeout off it. The index
  states this field's name and type, so it is treated as settled rather than assumed.
- Phase 4 — `app/admin/image-generation/page.tsx` exists and is a server component opening with
  `requireAdmin()`; `components/admin/ImageGenPanel.tsx` exists and carries a comment containing the
  literal `SEAM — PHASE 6`; `lib/admin/imageGenActions.ts` exists with `'use server'` as its first
  statement.

**Leaves alone (owned by others):**

- `lib/nina/imagerun.ts` — **especially `finishSelfie`.** It already writes the message + image pair
  and that pair *is* R12. A second writer of it would violate plan invariant 12.
- `lib/nina/imagejobs.ts`, `lib/nina/imagefail.ts`, `lib/nina/imagecall.ts`, `lib/nina/jobview.ts`,
  `lib/nina/imagerecipe.ts` — read from, never edited.
- `lib/db/schema.ts` and `drizzle/` — **this phase adds no column and generates no migration.** See
  Decision D4.
- `scripts/check-llm-payload-boundary.mjs` — its own header says *"NO OTHER PHASE EDITS IT"*. See
  Decision D6.
- `lib/nina/imagegen.ts`, `lib/nina/persona.ts` (phase 2); `scripts/nina-image-worker.ts` (phase 3);
  `lib/admin/schema.ts`, `lib/admin/imageGenModel.ts`, `components/admin/AdminNav.tsx`,
  `app/admin/layout.tsx`, `app/admin/page.tsx` (phase 4);
  `components/admin/PhotoReferencePicker.tsx`, `components/admin/photoReferenceModel.ts` (phase 5);
  `components/admin/CharacterPanel.tsx`, `lib/nina/tuning.ts`, `lib/admin/tuningModel.ts`,
  `lib/admin/tuningActions.ts` (phase 7).

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imagetest.ts` | create | `selfiegen.ts`'s sibling: cap first, seed, prompt from the saved prefs, `source: 'admin'`, `purpose: 'selfie'`, phase 3's `referenceUrl`, one job row, one fire. Plus the pure assembler both the preview and the dispatch use. |
| `lib/admin/imageGenTestView.ts` | create | The verdict: seven kinds, one honest sentence each, the poll bounds. Pure and client-safe. |
| `lib/admin/imageGenActions.ts` | modify (append at EOF, ~line 1) | Two actions appended after phase 4's save + reset; four imports added to its header. |
| `components/admin/ImageGenTestPanel.tsx` | create | The button, the remaining quota, the prompt-as-sent preview, the verdict line. |
| `components/admin/ImageGenPanel.tsx` | modify (1 edit) | Phase 4's `SEAM — PHASE 6` comment and its placeholder `<p>` become `<ImageGenTestPanel dirty={dirty} />`; one import added. |
| `app/admin/image-generation/page.tsx` | modify (1 edit) | `export const maxDuration = 300`, a literal, above the component. |
| `tests/admin.imagegenTest.test.ts` | create | The verdict table, the poll bounds, the `maxDuration` literal, and the source-level guards. |

---

## Decisions settled inside this phase

Recorded here because the reconciler and the implementer both need them, and because two of them
are things a later reader would otherwise "fix".

**D1 — The button does not await the generation.** It opens a job and returns; the panel polls a
Server Action on an interval. The index's *Decisions* table settles it and `app/r/[id]/page.tsx:65-79`
quotes Next's own `maxDuration` reference: a Server Action's ceiling is the **page segment's**, and
78–150 s unanchored / up to 220 s anchored inside a browser POST is precisely what `after()` exists
to avoid. `fireNinaImageGeneration` is the same handoff `generateNinaSelfie` uses.

**D2 — The poll is a Server Action in a sequential async loop, not `router.refresh()` and not
`setInterval`.** Three reasons for the first half, and the first is the decisive one:

1. `router.refresh()` re-renders phase 4's whole page — its prefs read, its picker's union read over
   `nina_avatars` + `nina_message_images`, and its form — every four seconds for up to eight
   minutes. The action re-reads **one indexed row** (`getNinaImageJobDetail`) plus one indexed count
   (`ninaImageQuotaLeft`).
2. It keeps this phase's runtime inside this phase's files. A `router.refresh()` poll would make the
   verdict depend on phase 4's page being re-rendered and on props threaded through phase 4's panel;
   the action needs neither, which is what lets the seam edit be one propless line.
3. The quota it reports is live. A chat selfie spent between renders would make a server-rendered
   quota a lie, and the number's whole job is to be true *before* the click.

And for the second half — the loop shape — the repo has already settled it twice, and both
precedents are copied rather than re-argued:

- `components/nina/ChatScreen.tsx:845-850` states the rule for exactly this situation:
  *"── ONE SEQUENTIAL ASYNC LOOP, NOT A `setInterval` ── Because a tick must not fire while the
  previous request is in flight…"*. A generation is 78–220 s and a poll is a Server Action round
  trip; an interval would stack requests the moment one was slow.
- `components/extract/useExtractionStatus.ts:84-123` is the same loop against a job whose duration
  is the same order of magnitude, with the same three parts: a `cancelled` flag, one
  `setTimeout` handle cleared on unmount, and a wall-clock give-up.

**D3 — The poll is bounded in both directions, and the schedule escalates.** Following
`POLL_INTERVALS_MS` / `NINA_TURN_POLL_INTERVALS_MS`, which are the two shipped precedents:

```
initial 3_000 (attempts 1-6)   ->  the first 18 s
mid     5_000 (attempts 7-18)  ->  through ~78 s, the measured unanchored latency
late    8_000 (thereafter)     ->  the anchored tail and the retry
```

`NINA_IMAGE_TEST_GIVE_UP_MS = 480_000` (8 minutes) is **derived, not chosen**:
`NINA_IMAGE_MAX_ATTEMPTS = 2` and phase 3's anchored ceiling is 220 s, so two attempts can
legitimately take `2 × 220 = 440 s` before anything is terminal. 480 s clears that with slack and
stays well under `NINA_IMAGE_STALE_MS = 1_200_000` — so when the clock runs out the panel says
*"still open; a job that never finishes is given up at twenty minutes"*, which is true, rather than
*"failed"*, which would not be. `NINA_TURN_POLL_GIVE_UP_MS` is set to the server's own deadline for
the analogous reason; here the two numbers must **differ**, because a give-up equal to
`NINA_IMAGE_STALE_MS` would keep a tab reading the database for twenty minutes to learn something
the operator can see on `/nina/jobs`.

The loop also stops the instant `imageTestVerdictIsOpen` goes false, and on unmount. A single failed
poll is **not** a failed test — `useExtractionStatus`'s comment says it best (*"the job is still
running on the server"*) — so it is reported quietly and the loop continues.

**D4 — The provider's own refusal words are NOT surfaced, and that is a deliberate, recorded
limitation.** `NinaImageCallResult.detail` carries them (`lib/nina/imagecall.ts:67` — *"Never
rendered. Log only."*) and it reaches exactly two `console.warn` calls:

- `lib/nina/imagerun.ts:275-280` — `'[nina] in-platform generation failed'` with `{ jobId, kind, attempts, detail }`
- `lib/nina/imagejobs.ts:520` — `'[nina] image job failed'` with `{ jobId, kind, purpose, detail }`

Persisting it needs somewhere to put it. `nina_turns` has no free-text column for it, so the options
are a new column (a **third** migration in a set whose rollback story names exactly two, in the same
wave as phase 7's `DROP COLUMN` — the collision hazard the memory note *"Migration collisions:
regenerate, never rename"* is about) or widening the `args` jsonb, which is `NinaImageJobArgs` and
therefore phase 3's, written at open and never updated. Neither is worth it inside this phase.

So the panel gives the operator **the classification, the exact prompt as sent, the job id, and the
grep**: `[nina] image job failed` filtered by that job id in the Vercel logs. That is a verdict with
a reason he can reach in one search, and it is honest about the fact that the reason itself is
provider text and not user text — see the copy in Step 2. Raised in **Handoffs** as a follow-up card
rather than as another phase's work, because no other phase in this set owns it.

**D5 — `SCENE:` is a neutral constant, not the prefs' venue/time/notes.** `buildNinaImagePrompt`
requires a `scene: string` and an admin prompt test has no chat scene. Two candidates were rejected:

- *The word "test" in the scene.* `SCENE: a test photograph` invites `qwen-image-3-pro` to draw a
  test card — corrupting the exact thing the operator is measuring.
- *The venue/time/notes prose.* Phase 2 already emits those as their own `VENUE:` / `TIME:` /
  `NOTES:` blocks from the prefs. Repeating them in `SCENE:` would double every one of them in the
  one prompt whose purpose is to be *representative*.

So `NINA_IMAGE_TEST_SCENE` is a plain full-body selfie scene that names nothing the prefs name. It
also lands verbatim in `nina_message_images.description` (`finishSelfie` passes `args.scene`), which
is what `/admin/photos` shows — so it has to read as a sentence a human wrote, and it does.

**D6 — the payload guard is not edited, and no new name trips it. RE-VERIFIED AGAINST THE GUARD AS
IT NOW STANDS.** `scripts/check-llm-payload-boundary.mjs` matches
`new RegExp(\`\\b${guard.symbol}\\s*\\(\`)` against comment-stripped source, over
**NINE symbols, not eight** — the ninth arrived in the `origin/main` merge. `GUARDED_CALLS` is
`:99-213` and the scan loop is `:215-224`; it walks every `.ts`/`.tsx` under `app/`, `lib/` and
`components/` (not `scripts/`, not `tests/`), skips co-located `*.test.ts`, strips comments first,
and sanctions **whole files by exact path** — there is no directory-prefix or glob allowance, so a
new file is never sanctioned by living next to a sanctioned one.

The nine: `getOrCreateInsight`, `runNinaTurn`, `distillNinaMemory`, `resolveNinaPromises`,
`describeNinaImage`, `titleNinaSessionIfNeeded`, `rankNinaSearchHits`, `runNinaImageJob`,
`captionNinaPhoto`. **Three of them are image symbols now, not one:**

| Symbol | Guard lines | Sanctioned paths |
|---|---|---|
| `describeNinaImage` | `:147-154` | `lib/nina/actions.ts`, `components/nina/Composer.tsx` |
| `runNinaImageJob` | `:183-195` | `lib/nina/imagerun.ts` **only** |
| `captionNinaPhoto` | `:196-212` | `lib/nina/caption.ts`, `lib/admin/chatPhotoActions.ts`, `lib/nina/imagerun.ts` |

**Nothing this phase writes names any of the nine.** `dispatchNinaImageTest` calls
`fireNinaImageGeneration`, which is unguarded on purpose — it *schedules*, it does not await — and
which is exactly what `generateNinaSelfie` (also unguarded, also unsanctioned) already does.
`captionNinaPhoto` matters to note rather than to call: `finishSelfie` reaches it from
`lib/nina/imagerun.ts`, which is sanctioned, so a test generation gets a model-written caption
without this phase or `lib/admin/imageGenActions.ts` ever naming the symbol. **Do not** "improve"
the caption from this phase's files — `lib/admin/imageGenActions.ts` is unsanctioned for all nine
and the guard would fail, and its own header (`:25`) forbids other phases from adding a path.

Plan invariant 5 is therefore intact and re-checked: `buildNinaImagePrompt`,
`assembleNinaImageTestPrompt`, `sidecarText` and `buildImageRequestBody` are **not** in
`GUARDED_CALLS`, so a pure preview in a Server Component render passes. The guard is a name
allowlist, not a purity or cost analysis — which cuts both ways: purity is no defence for a *named*
symbol.

The names were chosen with the grep in mind: `dispatchNinaImageTest` and
`assembleNinaImageTestPrompt` share no symbol with the table, and `assemble…` is honest — that
function awaits nothing and reaches no provider, which is what makes the render-side preview legal
under invariant 5. **Do not rename either to `run…` or `generate…`;** `runNinaImageTest` would read
as a sibling of the one guarded symbol while being sanctioned nowhere, which is a trap for the next
reader even though the current regex would not fire on it.

**D7 — R12 costs a VISIBLE bubble in the runner's chat, knowingly — and `photo_only` does not
change that. REVISED against the `origin/main` merge; read this instead of the version you may
remember.**

`nina_message_images.message_id` is `NOT NULL` with an FK to `nina_messages`
(`lib/db/schema.ts:1066-1068`), so **a chat photo without a message is not representable.** That
half is unchanged.

What is new is `nina_messages.photo_only boolean NOT NULL DEFAULT false` (`:964`, migration
`drizzle/0009_nina_message_photo_only.sql`) — *"this bubble exists ONLY to carry a photograph"*. It
looks like it should make the caption bubble avoidable. **It does not, and the difference is
load-bearing:**

- **`photo_only` is a DELETION marker, not a render suppressor.** Its only consumer in the whole
  repo is `isNinaPhotoCarrierMessage` (`lib/admin/chatPhotos.ts:309-316`), whose only caller is
  `removeChatPhotoAction` (`lib/admin/chatPhotoActions.ts:308`). It exists so Remove can delete the
  message along with the last picture on it instead of leaving a caption with nothing under it.
- **The chat UI never reads it.** `grep -rn photoOnly components/ app/` returns zero hits; it is not
  carried across the RSC boundary (`app/nina/page.tsx`'s `ChatMessage` mapping has no such field)
  and `components/nina/MessageBubble.tsx:463` renders `{message.body}` unconditionally, with no
  `photoOnly` branch anywhere in the render path.
- **Every writer still puts real text in the bubble, deliberately.** `lib/nina/imagerun.ts:240-243`
  is explicit: *"Never empty. `nina_messages.text` is notNull and would accept `''`, but an empty
  bubble is not a message."* A caption-less bubble would be **new UI work in
  `components/nina/`**, which no phase in this set owns and which R11/R12 did not ask for.

So the trade-off stands, and `addChatPhotoAction` makes the identical one. **But two facts about it
improve, and both are free to this phase:**

1. **`finishSelfie` already sets `photoOnly: true`** (`lib/nina/imagerun.ts:249`; the backstop
   worker does the same in raw SQL at `scripts/nina-image-worker.ts:690-698`). So a test
   photograph's carrier bubble is **cleanly removable**: `removeChatPhotoAction` on `/admin/photos`
   deletes the bubble along with the photograph, and that no longer depends on the caption happening
   to be one of the five `NINA_IMAGE_CAPTIONS` strings. This phase adds **no** `photo_only` work of
   its own — not a column, not an argument, not a flag — because the writer it delegates to already
   does it. That is the whole reason R12 needs no new writer.
2. **The caption is now model-written, not canned.** `finishSelfie` calls `captionNinaPhoto`
   (`lib/nina/imagerun.ts:231-233`) with `ninaImageCaption(jobId)` as the fallback. Two consequences
   worth stating rather than discovering: the bubble reads as a real sentence of hers rather than
   "nih", and **a successful test spends one extra model call** on top of the image. It is a caption
   call, not an image call, so it does not touch `NINA_IMAGE_DAILY_CAP` — but invariant 8 says money
   is never spent silently, so the panel's copy must not claim a test costs exactly one generation
   and nothing else. Say *"one generation off today's cap, plus its caption"*.

**Do not "fix" the visible bubble later** by writing the image row without a message, or by deleting
the message afterwards: the first is impossible and the second is `removeChatPhotoAction`'s job, not
this feature's. If a genuinely text-free carrier is ever wanted, it is a `components/nina/` change
gated on `photo_only` — a follow-up card, and it is filed as one in **Handoffs**.

`replyToId` is `null` — nobody asked in chat — so `finishSelfie`'s `quoted` is `null`, the bubble
quotes nothing, and the session comes from `resolveNinaWriteSession(userId)`
(`lib/nina/sessionResolve.ts:42`), which is assumption A3 of the image pipeline plan and *creates* a
session rather than giving up. Concretely: the test photograph lands in his most recent conversation,
or in a fresh one if he has deleted every session. On failure, `failNinaImageJob` posts one of the
`policy` apologies to the same place because `purpose === 'selfie'` — an in-character apology for a
photograph nobody asked for. Accepted for the same reason: `purpose: 'avatar'` is the only way to
avoid it and an avatar job writes `nina_avatars`, changing her face, which is not what a prompt test
is for.

**D8 — the operator must save before testing, and the panel says so.** `dispatchNinaImageTest` reads
`readNinaImagePrefs(userId)` server-side, live and uncached, exactly as `generateNinaSelfie` reads
the tuning and for the same stated reason. An unsaved draft in phase 4's form is not in the row and
therefore not in the test. The panel labels its preview **"assembled from the saved settings"** and
carries a refresh, and it accepts an optional `dirty?: boolean` so phase 4 (or the reconciler) can
wire its own dirty flag in one prop with no change to this file.

---

## Implementation Steps

### Step 1: `lib/nina/imagetest.ts` — the dispatch and the pure assembler

**File:** `lib/nina/imagetest.ts` (new; sits beside `lib/nina/selfiegen.ts`)
**Change:** create the file. It is the admin-initiated twin of `generateNinaSelfie`: same order of
operations, same never-throws guarantee, same "it accepts, it does not deliver" contract.

**Code:**

```ts
import 'server-only'

import { buildNinaImagePrompt, sidecarText } from './imagegen'
import type { NinaImageFailure } from './imagefail'
import type { NinaImagePrefs } from './imageprefs'
import { ninaImageQuotaLeft, openNinaImageJob } from './imagejobs'
import { SEED_MAX } from './imagerecipe'
import { fireNinaImageGeneration } from './imagerun'
import { readNinaImagePrefs, readNinaTuning } from './queries'
import type { NinaTuning } from './tuning'

/**
 * **R11: the prompt test.** `/admin/image-generation` asks the provider whether it will draw the
 * prompt the saved prefs assemble, and the answer is one generation off the daily cap.
 *
 * The user's words: *"add a test prompt button, so we can see if this prompt is actually allowed by
 * Alibaba (qwen 3 devs) guardrails. and the photo result will automatically be added to Chat
 * photos"*. Both halves are answered by reusing the shipped pipeline rather than by building a
 * second one:
 *
 *   · "allowed by the guardrails" is `classifyImageFailure`'s `'policy'`
 *     (`lib/nina/imagefail.ts:75-85`), which already lands in `nina_turns.error_code` via
 *     `failNinaImageJob`. This phase SURFACES it; it does not compute it a second time.
 *   · "added to Chat photos" is `finishSelfie` (`lib/nina/imagerun.ts:167`), which writes the
 *     `nina_messages` + `nina_message_images (kind: 'generated')` pair that `/admin/photos` lists.
 *     So `purpose` is `'selfie'` and R12 needs no new writer at all. A second writer of that pair
 *     would violate plan invariant 12.
 *
 * ── IT IS `selfiegen.ts`'s SIBLING, AND NOT A FLAG ON IT ──────────────────────────────────────
 * `avatargen.ts` argues the shape and `selfiegen.ts` repeats it: a different caller with a
 * different provenance and a different failure meaning is a different function. Concretely, this
 * one takes no `scene` and no `mood` (the operator has no per-photograph opinion — that is what the
 * prefs replaced), stamps `source: 'admin'`, and returns the prompt and the seed to its caller so
 * the panel can show what was sent without a second read.
 *
 * ── IT ACCEPTS, IT DOES NOT DELIVER ──────────────────────────────────────────────────────────
 * `{ ok: true }` means the job row exists and the generation has been scheduled on this server's
 * remaining wall clock — NOT that a photograph exists. `app/admin/image-generation/page.tsx`
 * declares `maxDuration = 300` for that reason: `after()` inherits the route segment's ceiling.
 *
 * **It never throws and it never posts a message.** A database that will not open the row comes
 * back as `kind: 'transport'`, because a Server Action that threw would reach the browser as an
 * opaque digest and the operator would be told nothing at all.
 */

/**
 * The `scene` slot, for a photograph nobody asked for in a chat.
 *
 * ── WHY IT IS NOT THE WORD "TEST" ────────────────────────────────────────────────────────────
 * `buildNinaImagePrompt` renders `SCENE: <this>` into the prompt the provider actually reads.
 * `SCENE: a test photograph` invites the model to draw a test card, which would corrupt the exact
 * thing being measured. It is also the string `finishSelfie` writes verbatim into
 * `nina_message_images.description`, which is what `/admin/photos` shows under the picture — so it
 * has to read as a sentence a human wrote.
 *
 * ── WHY IT IS NOT THE PREFS' VENUE / TIME / NOTES ────────────────────────────────────────────
 * Phase 2 already emits those as their own `VENUE:` / `TIME:` / `NOTES:` blocks from the same prefs
 * row. Splicing them in here too would double every one of them in the one prompt whose whole
 * purpose is to be representative of the real thing.
 *
 * Full body in frame, deliberately: R1's body canon is what this test is testing.
 */
export const NINA_IMAGE_TEST_SCENE =
  'Nina taking a photograph of herself at arm’s length, standing, her whole body in frame, ' +
  'the phone visible in one hand.'

/**
 * **The prompt, assembled and nothing else. Pure: no await, no I/O, no provider.**
 *
 * This exists as its own export so that the preview the operator reads and the prompt the provider
 * gets are produced by ONE function. A preview computed a second way is a preview that will
 * eventually disagree with the thing it previews, and the operator would be rewriting a prompt he
 * was never shown.
 *
 * It is `assemble…` and not `run…`/`generate…` on purpose. `scripts/check-llm-payload-boundary.mjs`
 * Rule 2 forbids awaiting a MODEL CALL from a render, matching by function name over eight guarded
 * symbols; this function awaits nothing and reaches no provider, and its name says so. Plan
 * invariant 5 is satisfied structurally rather than by exemption — see `buildNinaSystemPrompt` on
 * `/admin/personality`, which is the same move.
 */
export function assembleNinaImageTestPrompt(input: {
  tuning: NinaTuning
  prefs: NinaImagePrefs
}): string {
  return buildNinaImagePrompt({
    /*
     * `'selfie'` and NOT `'avatar'`. An avatar job writes `nina_avatars` through `finishAvatar` and
     * would change her face — and it writes no `nina_messages` row, so R12 would go unsatisfied.
     * A prompt test is not a re-anchoring of who she is.
     */
    purpose: 'selfie',
    scene: NINA_IMAGE_TEST_SCENE,
    /* No per-photograph mood. `EXPRESSION AND ENERGY` is the chat model's line, and an operator
     * testing his standing settings has not been asked for one. `buildNinaImagePrompt` omits the
     * block entirely for null (`lib/nina/imagegen.ts:155-157`). */
    mood: null,
    tuning: input.tuning,
    prefs: input.prefs,
  })
}

export type NinaImageTestDispatch =
  | { ok: true; jobId: string; prompt: string; seed: number }
  | { ok: false; jobId: null; kind: NinaImageFailure | 'capped' }

export async function dispatchNinaImageTest(userId: string): Promise<NinaImageTestDispatch> {
  /*
   * THE CAP, FIRST — before the row is opened and therefore before a cent is spent.
   * `generateNinaSelfie` states the rule and `NINA_IMAGE_DAILY_CAP` counts FAILURES, which is
   * exactly why a test costs one: every attempt cost either money or a runner minute
   * (`lib/nina/imagerecipe.ts:119`, plan invariant 8). The order is not cosmetic — refusing
   * after the insert would leave a `queued` row nobody will ever run.
   */
  if ((await ninaImageQuotaLeft(userId)) <= 0) {
    return { ok: false, jobId: null, kind: 'capped' }
  }

  const seed = Math.floor(Math.random() * SEED_MAX)

  /* Read live, no cache — `generateNinaSelfie`'s comment, and it matters more here: a wardrobe
   * saved on this very page thirty seconds ago is the thing being tested. This is also why the
   * operator must SAVE before testing: an unsaved draft is not in this row. */
  const [tuning, prefs] = await Promise.all([readNinaTuning(userId), readNinaImagePrefs(userId)])

  const prompt = assembleNinaImageTestPrompt({ tuning, prefs })

  try {
    const jobId = await openNinaImageJob(userId, {
      purpose: 'selfie',
      scene: NINA_IMAGE_TEST_SCENE,
      mood: null,
      prompt,
      seed,
      /* Nobody asked in chat. `finishSelfie` falls through to `resolveNinaWriteSession`, so the
       * photograph and its caption land in his most recent conversation (or a fresh one). The
       * bubble is the price of `nina_message_images.message_id` being NOT NULL — see the plan
       * index's Decisions table and this phase's D7. */
      replyToId: null,
      /* Already in the union and already used (`lib/admin/ninaAlbumActions.ts:482`). No fourth
       * source value. */
      source: 'admin',
      attempts: 0,
      /*
       * ── THE SAVED PHOTO REFERENCE, THREADED ONTO PHASE 3'S FIELD ──────────────────────────
       * **RECONCILED.** Phase 1 stores an **id plus a set** (`prefs.reference: { source, id }`),
       * NOT a Blob URL — `updateNinaChatPhotoBlob` changes a chat photograph's `blob_url` and keeps
       * its `id`, so a stored URL would point at a deleted Blob object while the picker still drew
       * the chosen tile. So it is resolved here, owner-scoped, immediately above this call:
       *
       *     const reference = await resolveNinaPhotoReference(userId, prefs.reference)
       *
       * added to the `Promise.all` above or awaited after it (`'none'` returns `null` on a branch
       * with no statement, so the ordinary unanchored case costs no round trip).
       *
       * `null` is the ORDINARY answer, not an error: there is no foreign key on the two reference
       * columns — two possible parents, and a cascade would delete a whole prefs row because one
       * photograph was deleted — so a photograph the operator later deleted leaves an id pointing
       * at nothing. Phase 3 degrades an unfetchable reference to an unanchored generation, and this
       * is the same degrade one layer earlier. It must never throw and must never block the test.
       *
       * `blobUrl` and not a URL from a request body: phase 3's contract requires
       * *"the `blob_url` of a `nina_avatars` row or a `nina_message_images` row — resolved
       * server-side from the operator's selection — never a string that came off a request body."*
       * `resolveNinaPhotoReference` is exactly that resolution, and it is owner-scoped.
       *
       * The URL is captured at OPEN and stored in `args`, so a retry uses the URL the job was
       * opened with — which is phase 1's own Handoff instruction and what keeps
       * `reopenNinaImageJob`'s `{ ...args, attempts: 0 }` correct for an anchored job.
       */
      referenceUrl: reference?.blobUrl ?? null,
      sidecar: sidecarText({ prompt, seed, purpose: 'selfie' }),
    })

    /*
     * The generation, on this server, in `after()`. Identical handoff to `generateNinaSelfie`'s,
     * and the reason the button can return immediately: 78-220 s inside a browser POST is what
     * `after()` exists to avoid, and a Server Action's ceiling is the PAGE SEGMENT's.
     *
     * `purpose: 'selfie'` and `replyToId: null` are passed as they are stored, so the run path
     * cannot disagree with the row about what it is doing.
     */
    fireNinaImageGeneration({ userId, jobId, purpose: 'selfie', replyToId: null })

    return { ok: true, jobId, prompt, seed }
  } catch (cause) {
    /*
     * The row could not be opened, so nothing was dispatched and nothing was billed. `'transport'`
     * is the honest kind: `lib/nina/imagefail.ts:56` reserves `'policy'` for "the provider looked
     * at this and said no", and reporting our own database failure as a refusal would send the
     * operator rewriting a prompt that was never seen by anybody.
     */
    console.error('[nina] image test could not be opened', { userId, error: String(cause) })
    return { ok: false, jobId: null, kind: 'transport' }
  }
}
```

**Impact:** one new module under `lib/nina/`. It reads no secret (`ci:openrouter-guard` is satisfied
trivially — `lib/nina/imagecall.ts` owns `OPENROUTER_API_KEY` and this file never mentions it), calls
no guarded symbol, and adds no import to `lib/nina/imagerecipe.ts` (invariant 2 untouched).

---

### Step 2: `lib/admin/imageGenTestView.ts` — the verdict, and the sentences it may say

**File:** `lib/admin/imageGenTestView.ts` (new)
**Change:** create the file. Pure, client-safe, and node-testable — the property
`lib/nina/jobview.ts` exists for (*"a rule that lives inside a `'use client'` component cannot be
asserted by anything in this repo"*), and the reason the verdict rules are here rather than inside
the panel.

**Code:**

```ts
import { jobStage } from '@/lib/nina/jobview'

/**
 * **R11's answer, in words an operator can act on.** Nothing here classifies anything: the
 * classification is `classifyImageFailure`'s (`lib/nina/imagefail.ts:59`), it already lands in
 * `nina_turns.error_code` through `failNinaImageJob`, and this module is a LOOKUP over whatever
 * that column says — `NINA_JOB_ERROR_LABEL`'s relationship to the same union, for the same stated
 * reason. A second classifier would be a second thing to keep in step, and the copy is always the
 * one that goes stale.
 *
 * ── WHY IT IS NOT `NINA_JOB_ERROR_LABEL` ─────────────────────────────────────────────────────
 * That map is the RUNNER's screen vocabulary and it is in Indonesian, in his register: *"Ditolak
 * filter konten provider"*. This is an operator's diagnosis on an English admin surface, and the
 * load-bearing thing it adds is the clause that map has no reason to carry — **"this is not a
 * refusal"** on the three kinds that are not one. `jobStage` IS reused, because that is a rule
 * about a column with two meanings and there must be exactly one of those.
 *
 * ── THE VERDICT MUST NOT LIE IN EITHER DIRECTION ─────────────────────────────────────────────
 * `'refused'` is reachable from `error_code === 'policy'` and from nothing else, and every other
 * terminal failure is `'inconclusive'` or `'unknown'`. A timeout is not a refusal: telling the
 * operator his prompt was banned when the network dropped would send him rewriting a prompt that
 * was fine, which is the single most expensive wrong answer this panel can give. In the other
 * direction, `'allowed'` requires `status === 'ok'` — a photograph that exists — and not merely
 * "did not fail".
 *
 * ── THE RETRY WINDOW IS ITS OWN VERDICT, BECAUSE IT IS ITS OWN FACT ──────────────────────────
 * `NINA_IMAGE_MAX_ATTEMPTS = 2`, so a `policy` failure on attempt 1 is REQUEUED by `closeFailed`
 * (`lib/nina/imagerun.ts:283-291`) rather than going terminal. `requeueNinaImageJob` puts
 * `error_code` back to `'queued'` and does not record which kind failed — only `console.warn` sees
 * it. So the observable state is `status='pending'`, `error_code='queued'`, `attempts >= 1`, and
 * the only honest reading of it is *"the first attempt failed and it is being retried; what failed
 * is not recorded until the retry budget is spent"*. Rendering that as `'running'` would hide a
 * failure; rendering it as `'refused'` would invent one.
 */

export const NINA_IMAGE_TEST_VERDICTS = [
  'idle',
  'running',
  'retrying',
  'allowed',
  'refused',
  'inconclusive',
  'unknown',
] as const

export type NinaImageTestVerdict = (typeof NINA_IMAGE_TEST_VERDICTS)[number]

/**
 * What the panel needs off a `nina_turns` row, structurally — `JobLike`'s precedent and its stated
 * reason: the row's shape belongs to `lib/nina/imagejobs.ts`, which is `server-only`, and this
 * module is imported by a client component.
 *
 * `createdAtMs` is epoch milliseconds and not a `Date`, which is the same conversion
 * `toNinaJobListItems` makes and for the same reason: it is the one shape a client and a server
 * cannot disagree about.
 */
export interface NinaImageTestJobView {
  jobId: string
  status: string
  /** Phase while pending, failure reason when failed, `null` on success. Two meanings, one column. */
  errorCode: string | null
  attempts: number
  latencyMs: number | null
  costMicroUsd: number | null
  /** The exact prompt as sent, off `args.prompt`. `null` only for a row with no args. */
  prompt: string | null
  createdAtMs: number
}

export function imageTestVerdict(job: NinaImageTestJobView | null): NinaImageTestVerdict {
  if (job == null) return 'idle'

  const stage = jobStage({ status: job.status, errorCode: job.errorCode })

  if (stage === 'failed') {
    /* THE ONE PATH TO 'refused'. `POLICY_STATUSES` + `POLICY_BODY_RE` decided this upstream. */
    if (job.errorCode === 'policy') return 'refused'
    if (job.errorCode === 'timeout' || job.errorCode === 'transport' || job.errorCode === 'stale') {
      return 'inconclusive'
    }
    /* A fifth failure kind added to `NINA_IMAGE_FAILURES` lands here rather than being silently
     * read as one of the four. Ugly and true, in that order — `jobErrorLabel`'s rule. */
    return 'unknown'
  }

  if (stage === 'done') {
    /* `jobStage` maps BOTH `'ok'` and `'repaired'` to `'done'`. No image writer produces
     * `'repaired'`, and calling it `'allowed'` would assert a photograph this panel has not seen
     * evidence of. */
    return job.status === 'ok' ? 'allowed' : 'unknown'
  }

  /* Still pending. `attempts` is incremented by `claimNinaImageJob`, so `>= 1` on a row that is
   * back in a pending stage means an attempt has already been made and requeued. */
  return job.attempts >= 1 ? 'retrying' : 'running'
}

/** True while the answer can still change — the only states a poll is honest for. */
export function imageTestVerdictIsOpen(verdict: NinaImageTestVerdict): boolean {
  return verdict === 'running' || verdict === 'retrying'
}

/** The headline. One sentence, and `'refused'` is the only one that says the provider said no. */
export const NINA_IMAGE_TEST_VERDICT_LINE: Record<NinaImageTestVerdict, string> = {
  idle: 'No test has been run yet.',
  running: 'Running. The provider has not answered yet.',
  retrying: 'The first attempt failed and the job was requeued.',
  allowed: 'Allowed. The provider drew this prompt.',
  refused: 'Refused. The provider declined this prompt on content-policy grounds.',
  inconclusive: 'No verdict. The generation failed before the provider answered.',
  unknown: 'Failed with a reason this panel does not recognise.',
}

/** The clause that stops each headline being misread. This is the half that protects the operator. */
export const NINA_IMAGE_TEST_VERDICT_WHY: Record<NinaImageTestVerdict, string> = {
  idle: 'One test spends one of today’s generations, and the daily cap counts failures too.',
  running:
    'A generation measured 78 s without a reference photo and up to 220 s with one. Nothing has ' +
    'been refused and nothing has succeeded yet.',
  retrying:
    'Two attempts are allowed, so this is not a verdict yet. What went wrong on the first attempt ' +
    'is not written to the database until the retry budget is spent — it is in the server ' +
    'log now, and the verdict here will name it if the retry fails too.',
  allowed:
    'The photograph is in Chat photos, and a caption bubble from Nina is in the conversation — ' +
    'a chat photo cannot exist without a message to hang on.',
  refused:
    'This is the only state that means the guardrails said no. The provider’s own words are ' +
    'not stored; they are in the server log for this job id, under "[nina] image job failed".',
  inconclusive:
    'This is NOT a refusal. The prompt may be perfectly acceptable — run the test again ' +
    'before changing a word of it.',
  unknown:
    'Not a refusal either. Treat it as inconclusive and check the server log for this job id.',
}

/**
 * The three non-refusal failures, spelled out. Keyed on the raw `error_code` string rather than on
 * a union, so a kind added to `NINA_IMAGE_FAILURES` cannot make this file fail to compile — the
 * caller falls back to the raw code, which is `jobErrorLabel`'s rule.
 */
export const NINA_IMAGE_TEST_REASON: Readonly<Record<string, string>> = {
  timeout: 'the call was aborted at the timeout — the provider was still thinking',
  transport: 'the request never completed — a dropped connection, a throttle, or a bad payload',
  stale: 'nothing ever picked the job up, and it was given up at the deadline',
  policy: 'the provider looked at the prompt and declined it',
}

export function imageTestReason(errorCode: string | null): string | null {
  if (errorCode === null || errorCode === '') return null
  return NINA_IMAGE_TEST_REASON[errorCode] ?? errorCode
}

/**
 * **The escalating poll schedule**, on `POLL_INTERVALS_MS` (`lib/extract/constants.ts:187-189`) and
 * `NINA_TURN_POLL_INTERVALS_MS` (`lib/nina/turnflight.ts:36`) — the two shipped precedents, both
 * against jobs of this order of magnitude.
 *
 * The bands are pinned to the measured latencies rather than picked: `initial` covers the first
 * 18 s (nothing can have finished), `mid` runs through ~78 s (RU-18's unanchored measurement), and
 * `late` carries the anchored tail and the retry. A flat interval would either waste round trips in
 * the first minute or answer late in the fourth.
 */
export const NINA_IMAGE_TEST_POLL_INTERVALS_MS = {
  initial: 3_000,
  mid: 5_000,
  late: 8_000,
} as const

export const NINA_IMAGE_TEST_POLL_MID_AFTER_ATTEMPTS = 6
export const NINA_IMAGE_TEST_POLL_LATE_AFTER_ATTEMPTS = 18

/** `pollDelayFor`'s shape, exactly — a pure function of the attempt count, so it is testable. */
export function imageTestPollDelayFor(attempts: number): number {
  if (attempts >= NINA_IMAGE_TEST_POLL_LATE_AFTER_ATTEMPTS) {
    return NINA_IMAGE_TEST_POLL_INTERVALS_MS.late
  }
  if (attempts >= NINA_IMAGE_TEST_POLL_MID_AFTER_ATTEMPTS) {
    return NINA_IMAGE_TEST_POLL_INTERVALS_MS.mid
  }
  return NINA_IMAGE_TEST_POLL_INTERVALS_MS.initial
}

/**
 * **The bound, and it is derived rather than chosen.** `NINA_IMAGE_MAX_ATTEMPTS = 2` and phase 3's
 * anchored call ceiling is 220 s, so two legitimate attempts can take 440 s before anything is
 * terminal. 480 s clears that with slack.
 *
 * ── AND WHY IT IS NOT `NINA_IMAGE_STALE_MS` ──────────────────────────────────────────────────
 * `NINA_TURN_POLL_GIVE_UP_MS` is deliberately set to the server's own deadline, because a chat turn
 * that has not answered by then never will. This one must NOT be: the server's deadline for an
 * image job is twenty minutes, and a tab that read the database for twenty minutes to learn
 * something already visible on `/nina/jobs` would be a poll with no bound in practice. So when this
 * clock runs out the panel says the job is STILL OPEN — which is true — rather than "failed", which
 * would not be. `STALE_PENDING_MS` makes the same distinction for extractions.
 */
export const NINA_IMAGE_TEST_GIVE_UP_MS = 480_000
```

**Impact:** a new pure module in `lib/admin/`. It imports exactly one thing (`jobStage`), which is
already imported by three client components, so it is safe in a browser bundle and in a bare node
test alike. No drizzle type and no Zod schema crosses into the client (invariant 9's second half).

---

### Step 3: append the two actions to `lib/admin/imageGenActions.ts`

**File:** `lib/admin/imageGenActions.ts` — phase 4 creates it with `'use server'` on line 1 and the
save + reset actions below. **Append at end of file**, and add the imports listed below to its
existing import block.

**Change:** two actions. `requireAdmin()` is the first statement of each (invariant 6 —
`proxy.ts` matches neither `/admin` nor `/api/*`, so this line *is* the authorization). Both return a
result object; neither throws, because a throw from a Server Action reaches the browser as an opaque
digest and a sentence reaches the operator.

**Imports to add** (merge into phase 4's block, keeping its ordering):

```ts
import { revalidatePath } from 'next/cache'

import { ADMIN_CHAT_PHOTOS_PATH } from '@/lib/admin/chatPhotos'
import {
  imageTestVerdict,
  type NinaImageTestJobView,
} from '@/lib/admin/imageGenTestView'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { isValidId } from '@/lib/id'
import { getNinaImageJobDetail, ninaImageQuotaLeft } from '@/lib/nina/imagejobs'
import { NINA_IMAGE_DAILY_CAP } from '@/lib/nina/imagerecipe'
import { assembleNinaImageTestPrompt, dispatchNinaImageTest } from '@/lib/nina/imagetest'
import { readNinaImagePrefs, readNinaTuning } from '@/lib/nina/queries'
```

**Code (appended verbatim at end of file):**

```ts
/* ── R11 / R12: the prompt test ──────────────────────────────────────────────────────────────
 *
 * Two actions, and the split is the whole design: one SPENDS a generation and returns without
 * waiting for it, and one READS what happened. The index's Decisions table settles why they are not
 * one action that blocks — a Server Action's timeout is the page segment's, and 78-220 s inside a
 * browser POST is precisely what `after()` exists to avoid.
 *
 * NEITHER TAKES A PAYLOAD WORTH VALIDATING, and that is deliberate rather than lazy.
 * `runNinaImageTestAction` takes NO arguments at all: everything it needs is the saved row and the
 * id `requireAdmin()` returns, so there is no shape to forge and no Zod schema to keep in step with
 * `lib/admin/schema.ts`. `readNinaImageTestAction` takes one job id, which is a CLAIM and is turned
 * into a fact by `isValidId` (shape) plus `getNinaImageJobDetail`'s owner-scoped `WHERE` (identity)
 * — `parseNinaJumpParam` and `/nina/jobs/[id]` are the precedent for exactly that pair.
 */

export type NinaImageTestDispatchResult =
  | { ok: true; jobId: string; quotaLeft: number }
  | { ok: false; message: string }

export interface NinaImageTestReadResult {
  /** Live, because a chat selfie can spend it between renders. Shown BEFORE the click. */
  quotaLeft: number
  /** The prompt the button would send right now, from the SAVED prefs. Pure assembly, no model. */
  promptPreview: string
  /** The saved photo reference, so the panel can say whether this test is anchored. */
  referenceUrl: string | null
  /** `null` until a test has been dispatched, or when the id names nothing of ours. */
  job: NinaImageTestJobView | null
}

/**
 * Spend one generation to find out whether the provider will draw the saved prompt.
 *
 * The order is the cap, then the row, then the handoff — `dispatchNinaImageTest` owns all
 * three and states why. This action's only job is to turn its three outcomes into a sentence and a
 * job id.
 *
 * **No `revalidatePath` here.** Nothing has landed: the photograph does not exist for another
 * 78-220 s. The quota HAS changed, and the panel gets the new number in this very result rather
 * than by re-rendering a page.
 */
export async function runNinaImageTestAction(): Promise<NinaImageTestDispatchResult> {
  const { userId } = await requireAdmin()

  const dispatched = await dispatchNinaImageTest(userId)

  if (!dispatched.ok) {
    if (dispatched.kind === 'capped') {
      return {
        ok: false,
        message:
          `Today’s ${NINA_IMAGE_DAILY_CAP} generations are spent, so nothing was sent and ` +
          'nothing was billed. The cap counts failed generations too, and it rolls over at ' +
          'midnight in Jakarta.',
      }
    }
    return {
      ok: false,
      message:
        'The job could not be opened, so nothing was sent and nothing was billed. This is not a ' +
        'refusal — see the server log and try again.',
    }
  }

  return { ok: true, jobId: dispatched.jobId, quotaLeft: await ninaImageQuotaLeft(userId) }
}

/**
 * The read behind the panel: the quota, the prompt as it would be sent, and — once a test has
 * been dispatched — the job's state.
 *
 * `jobId === null` is the mount case and is not an error: there is a quota to show and a prompt to
 * preview before anything has been spent.
 *
 * ── THE `source !== 'admin'` FILTER ──────────────────────────────────────────────────────────
 * `getNinaImageJobDetail` already proves the job is this user's. This adds that it is one of HIS
 * PROMPT TESTS: a chat selfie's id polled here would otherwise be reported as "your prompt test",
 * which is a true row described by a false sentence. `source: 'admin'` is stamped by
 * `dispatchNinaImageTest` and is the value `NinaImageJobArgs` already carries for this purpose.
 *
 * ── WHY THE PREVIEW MAY BE AWAITED HERE ──────────────────────────────────────────────────────
 * `assembleNinaImageTestPrompt` is a PURE string join over two indexed reads. No model call is
 * awaited, which is what `ci:llm-payload-guard` Rule 2 and plan invariant 5 forbid — the same
 * standing `buildNinaSystemPrompt` has on `/admin/personality`.
 */
export async function readNinaImageTestAction(
  jobId: string | null,
): Promise<NinaImageTestReadResult> {
  const { userId } = await requireAdmin()

  const [quotaLeft, tuning, prefs] = await Promise.all([
    ninaImageQuotaLeft(userId),
    readNinaTuning(userId),
    readNinaImagePrefs(userId),
  ])

  const base = {
    quotaLeft,
    promptPreview: assembleNinaImageTestPrompt({ tuning, prefs }),
    referenceUrl: prefs.referenceUrl,
  }

  if (!isValidId(jobId)) return { ...base, job: null }

  const detail = await getNinaImageJobDetail(userId, jobId)
  if (detail == null || detail.source !== 'admin') return { ...base, job: null }

  const job: NinaImageTestJobView = {
    jobId: detail.id,
    status: detail.status,
    errorCode: detail.errorCode,
    attempts: detail.attempts,
    latencyMs: detail.latencyMs,
    costMicroUsd: detail.costMicroUsd,
    prompt: detail.prompt,
    /* Epoch milliseconds, not a `Date`: the one shape a client and a server cannot disagree about.
     * `toNinaJobListItems` makes the same conversion for the same reason. */
    createdAtMs: detail.createdAt.getTime(),
  }

  /*
   * R12's "automatically", made literal. The photograph is written by `finishSelfie` on a
   * background invocation that has no idea `/admin/photos` exists, so its cached render would keep
   * showing the old collection until something invalidated it. Doing it HERE — once, on the
   * poll that first sees `status='ok'` — costs nothing and means the operator finds the
   * picture already there.
   */
  if (imageTestVerdict(job) === 'allowed') revalidatePath(ADMIN_CHAT_PHOTOS_PATH)

  return { ...base, job }
}
```

**Impact:** phase 4's action file grows two exports. No existing export changes. If phase 4's file
already imports `revalidatePath` or `requireAdmin`, keep its line and drop the duplicate.

---

### Step 4: `components/admin/ImageGenTestPanel.tsx` — the button and the verdict

**File:** `components/admin/ImageGenTestPanel.tsx` (new)
**Change:** create the client component. It owns the whole test interaction: the quota it shows
before the click, the click, the bounded poll, and the verdict.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { Button } from '@/components/ui'
import {
  readNinaImageTestAction,
  runNinaImageTestAction,
  type NinaImageTestReadResult,
} from '@/lib/admin/imageGenActions'
import {
  imageTestPollDelayFor,
  imageTestReason,
  imageTestVerdict,
  imageTestVerdictIsOpen,
  NINA_IMAGE_TEST_GIVE_UP_MS,
  NINA_IMAGE_TEST_VERDICT_LINE,
  NINA_IMAGE_TEST_VERDICT_WHY,
  type NinaImageTestVerdict,
} from '@/lib/admin/imageGenTestView'
import { formatJobLatency, formatMicroUsd } from '@/lib/nina/jobview'

/**
 * **R11's surface.** *"add a test prompt button, so we can see if this prompt is actually allowed
 * by Alibaba (qwen 3 devs) guardrails."*
 *
 * ── IT DOES NOT AWAIT THE GENERATION ─────────────────────────────────────────────────────────
 * The click opens a job and returns (`dispatchNinaImageTest`). This component then asks
 * `readNinaImageTestAction` on an escalating schedule until the verdict is terminal or
 * `NINA_IMAGE_TEST_GIVE_UP_MS` has passed. Both are derived in `lib/admin/imageGenTestView.ts`
 * against `NINA_IMAGE_MAX_ATTEMPTS ×` phase 3's anchored ceiling.
 *
 * ── ONE SEQUENTIAL ASYNC LOOP, NOT A `setInterval` ───────────────────────────────────────────
 * `components/nina/ChatScreen.tsx:845-850` states the rule and this is the same situation: a tick
 * must not fire while the previous request is in flight, and a poll here is a Server Action round
 * trip against a job that takes 78-220 s. `components/extract/useExtractionStatus.ts:84-123` is
 * the same loop with the same three parts — a `cancelled` flag, one `setTimeout` handle cleared on
 * unmount, and a wall-clock give-up. A single failed poll is NOT a failed test: the generation is
 * still running on the server, so it is reported quietly and the loop continues.
 *
 * ── IT READS THE QUOTA ITSELF RATHER THAN TAKING IT AS A PROP ────────────────────────────────
 * Two reasons. The number must be true at the moment of the click, and a chat selfie can spend it
 * between renders — a server-rendered quota would be a stale promise about money. And it keeps
 * this component propless, so the one edit this phase makes to `ImageGenPanel.tsx` is a single
 * line that cannot conflict with phase 4's or phase 5's edits to the same file.
 *
 * ── THE PREVIEW IS THE SAVED PREFS, NOT THE DRAFT ────────────────────────────────────────────
 * `dispatchNinaImageTest` reads the row, so an unsaved field is not in the test. The label says
 * "saved settings" in as many words, and `dirty` — optional, so this file needs no change if
 * nobody passes it — turns that into a warning when phase 4 wires its own dirty flag.
 *
 * ── NO CONFIRMATION DIALOG ───────────────────────────────────────────────────────────────────
 * `lib/admin/chatPhotoActions.ts`'s header states the standing ruling for this whole surface:
 * *"i am the only one using this app, no need for all these bullshit confirmation"*. One click, it
 * happens. The remaining quota IS the disclosure, and it is on screen before the click.
 */
export function ImageGenTestPanel({ dirty = false }: { dirty?: boolean }) {
  const [view, setView] = React.useState<NinaImageTestReadResult | null>(null)
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pollNote, setPollNote] = React.useState<string | null>(null)
  const [gaveUp, setGaveUp] = React.useState(false)

  /* `useExtractionStatus`'s `cancelled` guard, hoisted so the click handler honours it too. */
  const alive = React.useRef(true)
  React.useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = React.useCallback(async (id: string | null): Promise<boolean> => {
    try {
      const next = await readNinaImageTestAction(id)
      if (!alive.current) return true
      setView(next)
      setPollNote(null)
      return true
    } catch {
      /* A failed READ is not a failed test — the generation is still running on the server. Say so
       * quietly and leave whatever is on screen on screen. `useExtractionStatus` makes exactly
       * this distinction, and it is the reason the loop keeps going. */
      if (alive.current) setPollNote('Could not reach the server on that check. Still watching.')
      return false
    }
  }, [])

  /* The mount read: the quota and the prompt preview, before anything has been spent. */
  React.useEffect(() => {
    void load(null)
  }, [load])

  const verdict: NinaImageTestVerdict = imageTestVerdict(view?.job ?? null)
  const open = imageTestVerdictIsOpen(verdict)

  /*
   * The poll: ONE sequential async loop. See the header — a tick must not fire while the previous
   * request is in flight. Bounded three ways: the verdict going terminal, the wall-clock give-up,
   * and unmount.
   */
  React.useEffect(() => {
    if (jobId === null || !open || gaveUp) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      const startedAt = Date.now()
      let attempts = 0

      const step = async () => {
        if (cancelled) return

        if (Date.now() - startedAt > NINA_IMAGE_TEST_GIVE_UP_MS) {
          setGaveUp(true)
          return
        }

        attempts += 1
        await load(jobId)
        if (cancelled) return

        timer = setTimeout(() => void step(), imageTestPollDelayFor(attempts))
      }

      timer = setTimeout(() => void step(), imageTestPollDelayFor(attempts))
    }

    void run()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [jobId, open, gaveUp, load])

  const onTest = async () => {
    if (busy || open) return
    setBusy(true)
    setError(null)
    setPollNote(null)
    setGaveUp(false)
    try {
      const result = await runNinaImageTestAction()
      if (!result.ok) {
        setError(result.message)
        /* The refusal already told us nothing was spent; re-read so the quota on screen is the
         * server's number and not our arithmetic. */
        await load(null)
        return
      }
      setJobId(result.jobId)
      await load(result.jobId)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `The test could not be started: ${cause.message}. Nothing was sent and nothing was billed — this is not a refusal.`
          : 'The test could not be started. Nothing was sent and nothing was billed — this is not a refusal.',
      )
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const quotaLeft = view?.quotaLeft ?? null
  const capped = quotaLeft !== null && quotaLeft <= 0
  const job = view?.job ?? null
  const reason = job === null ? null : imageTestReason(job.errorCode)

  return (
    <section className="mb-8 rounded-card border border-rule bg-card px-5">
      <div className="flex items-center justify-between gap-4 py-5">
        <h2 className="text-[15px] font-semibold text-ink">Test this prompt</h2>
        <p className="text-right text-[12px] font-medium text-ink-3">
          {quotaLeft === null
            ? 'checking today’s quota'
            : capped
              ? 'no generations left today'
              : `${quotaLeft} of today’s generations left`}
        </p>
      </div>

      <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Sends the prompt below to the provider and reports whether it was allowed. It spends one of
        today&rsquo;s generations, and the daily cap counts failures too. A successful test lands in
        Chat photos &mdash; along with a caption bubble from Nina in the conversation, because a chat
        photo cannot exist without a message to hang on.
      </p>

      {dirty && (
        <p className="mb-3 text-[12px] font-semibold text-accent">
          You have unsaved changes. The test reads the saved settings, so save first or you will be
          testing the previous prompt.
        </p>
      )}

      {error !== null && <p className="mb-3 text-[12px] font-semibold text-red">{error}</p>}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button
          disabled={busy || capped || open}
          loading={busy}
          onClick={() => void onTest()}
        >
          {open ? 'Waiting for the provider' : 'Test prompt'}
        </Button>
        {capped && (
          <span className="text-[12px] font-medium text-ink-3">
            Nothing will be sent. The cap rolls over at midnight in Jakarta.
          </span>
        )}
      </div>

      {/*
       * ── THE VERDICT ────────────────────────────────────────────────────────────────────────
       * `NINA_IMAGE_TEST_VERDICT_LINE` is the headline and `..._WHY` is the clause that stops it
       * being misread; both come from `lib/admin/imageGenTestView.ts` and neither is written here.
       * The leading `*` on every line is load-bearing: `ci:client-secret-guard`'s Rule 3 exempts
       * only lines a comment scanner recognises, which `app/admin/personality/page.tsx:88-90`
       * records.
       */}
      <div className="mb-6 rounded-card bg-paper-2 p-4">
        <h3 className="text-[13px] font-semibold text-ink">
          {NINA_IMAGE_TEST_VERDICT_LINE[verdict]}
        </h3>
        <p className="mt-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
          {NINA_IMAGE_TEST_VERDICT_WHY[verdict]}
        </p>
        {reason !== null && (verdict === 'inconclusive' || verdict === 'refused') && (
          <p className="mt-1 max-w-[70ch] text-[11px] font-medium text-ink-2">
            What the pipeline recorded: {reason}.
          </p>
        )}
        {pollNote !== null && (
          <p className="mt-1 text-[11px] font-medium text-ink-3">{pollNote}</p>
        )}
        {gaveUp && (
          <p className="mt-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
            Stopped watching after eight minutes. The job is still open and nothing has gone wrong
            yet &mdash; one that never finishes is given up at twenty minutes. Reload to look again,
            or open it on the job list.
          </p>
        )}
        {job !== null && (
          <p className="mt-2 text-[11px] font-medium text-ink-3 tabular-nums">
            job {job.jobId} &middot; attempt {job.attempts} &middot; {job.status}
            {job.errorCode === null ? '' : ` / ${job.errorCode}`} &middot;{' '}
            {formatJobLatency(job.latencyMs)} &middot; {formatMicroUsd(job.costMicroUsd)}
          </p>
        )}
      </div>

      {/* ── the prompt as sent ────────────────────────────────────────────────────────────── */}
      <div className="pb-5">
        <h3 className="text-[13px] font-semibold text-ink">Prompt as sent</h3>
        <p className="mb-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
          Assembled from the <strong>saved</strong> settings by the same function the button uses.{' '}
          {view?.referenceUrl == null
            ? 'No photo reference is selected, so this generation is unanchored.'
            : 'Anchored to the selected photo reference.'}
        </p>
        <pre className="mt-3 max-h-[420px] overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
          {job?.prompt ?? view?.promptPreview ?? ''}
        </pre>
      </div>
    </section>
  )
}
```

**Impact:** one new client component. It imports `Button` from the UI barrel, one pure module, one
pure view module and one `'use server'` module — and none of `server-only`, `@/lib/nina/queries`,
`@/lib/db/`, `@/lib/env`, `@/lib/admin/requireAdmin` or `@/components/ui/AppShell`, which is the
list `tests/admin.tuning.test.ts:359-376` bans from an admin client component. No drizzle type and
no Zod schema crosses the boundary (invariant 9). It renders no secret and no user id.

**Conventions this follows, each verified against a shipped file:**

| Convention | Precedent |
|---|---|
| `import * as React from 'react'`, `React.useState` | `components/admin/CharacterPanel.tsx:3` |
| `<Button loading disabled>` from `@/components/ui`, never a hand-classed `<button>` | `CharacterPanel.tsx:425-464` |
| `void handler()` inside `onClick` for an async handler | `components/admin/ChatPhotoControls.tsx:110` |
| async handler + `busy` state + `try/catch/finally`, result object read with `if (!result.ok)` | `ChatPhotoControls.tsx:75-89` |
| Props as an inline anonymous type in the destructure, not a named interface | `ChatPhotoGrid.tsx:49-66`, `NinaJobList` |
| Semantic colour tokens (`text-ink`, `text-ink-2`, `text-ink-3`, `text-red`, `text-accent`, `bg-card`, `bg-paper-2`, `border-rule`, `rounded-card`) | `CharacterPanel.tsx` throughout |
| No `router.refresh()` after a mutation — the read action carries the new state | `ChatPhotoControls.tsx:33-37` |
| No `window.confirm`, no `<dialog>`, no `confirming` state | `ChatPhotoControls.tsx:13-18`, `tests/admin.memory.test.ts:400-412` |
| A leading `*` on every continuation line of a JSX block comment | `app/admin/personality/page.tsx:88-90` |

> **Implementer note.** `formatJobLatency` and `formatMicroUsd` are `lib/nina/jobview.ts`'s and are
> already used by `NinaJobDetail`; do not re-format those two numbers here. If `Button` does not
> accept `loading` at the version this lands on, drop the prop — `disabled` alone is the mis-tap
> protection this surface uses.

---

### Step 5: fill phase 4's seam in `components/admin/ImageGenPanel.tsx`

**File:** `components/admin/ImageGenPanel.tsx` — phase 4 creates it with a comment containing the
literal `SEAM — PHASE 6` (per that phase's exit criteria: *"the test button (phase 6 — same, a
seam)"*).
**Change:** exactly one edit, plus one import. Replace the seam comment with the mounted panel.

**Code (the import, added to the existing block):**

```tsx
import { ImageGenTestPanel } from '@/components/admin/ImageGenTestPanel'
```

**Code (the seam, in the returned JSX):**

```tsx
      {/* R11 / R12. Propless on purpose: the panel reads the live quota and the saved-prefs prompt
        * preview through its own action, so this line cannot conflict with phase 4's form state or
        * with phase 5's picker mount. `dirty` is optional — pass this panel's own dirty flag here
        * if one is in hand. */}
      <ImageGenTestPanel dirty={dirty} />
```

**Impact:** one component mounts. Phase 4's props, state and save path are untouched.

> **Implementer note.** If phase 4's panel tracks a dirty flag under a different name, pass it:
> `<ImageGenTestPanel dirty={isDirty} />`. The prop is optional, so a mismatch degrades to the
> honest default (the panel still says its preview comes from the saved settings) rather than to a
> type error.

---

### Step 6: the route's `maxDuration`

**File:** `app/admin/image-generation/page.tsx` — phase 4 creates it. Add the export directly under
the imports, above the metadata and the component.
**Change:** one segment config export, spelled as a **literal**.

**Code:**

```tsx
/**
 * **300, and it must be a literal.** Segment config exports are statically analysed at build time,
 * so `export const maxDuration = NINA_HOST_MAX_DURATION_MS / 1000` is not a value the analyser can
 * see — it would compile, ship, and leave this route on the platform default. `app/nina/page.tsx`
 * and `app/api/cron/nina/route.ts` spell the same number the same way for the same reason.
 *
 * ── WHY A FORM PAGE NEEDS A FIVE-MINUTE CEILING ──────────────────────────────────────────────
 * `runNinaImageTestAction` calls `fireNinaImageGeneration`, which schedules the generation in
 * `after()` — and `after()` inherits the ROUTE SEGMENT's `maxDuration`, not the action's own
 * wishes. A Server Action POSTed to this segment therefore runs the generation under this number.
 * At the platform default the call would be killed mid-flight, the row would be left `running`,
 * and the operator would be told "timeout" about a prompt the provider never finished looking at
 * — the one wrong answer this feature exists to avoid.
 *
 * 300 is `NINA_HOST_MAX_DURATION_MS`, and the threshold chain (plan invariant 3) is what fixes it:
 * `NINA_TURN_SPENT_MS (45) + phase 3's anchored call ceiling (220) +
 * NINA_IMAGE_FINISH_RESERVE_MS (20) = 285 <= 300`.
 *
 * `app/nina/jobs/page.tsx:26-44` is the precedent line for line — it carries this export for the
 * identical reason (`NinaJobActions` calls `redoNinaImageJob`, which registers a generation in
 * `after()`), and `lib/nina/imagerun.ts` predicted this one: *"`app/nina/page.tsx` and
 * `app/api/cron/nina/route.ts` are the two segments that can start a generation, and a third
 * caller would need the same line."* `/nina/jobs` was the third. **This is the fourth, and the
 * first under `/admin` — no `/admin/*` route declares `maxDuration` today.**
 */
export const maxDuration = 300
```

**Impact:** the segment's ceiling. Nothing else on the page changes.

> **Implementer note.** Phase 4's page will already carry `export const dynamic = 'force-dynamic'`
> (all five existing `/admin/*` pages do). Put `maxDuration` **beside** it, not instead of it: they
> answer different questions, and the pair is what `app/nina/jobs/page.tsx` ships.
> `tests/admin.imagegenTest.test.ts` asserts the literal by reading the file as text — the technique
> `tests/extract.pollSchedule.test.ts:70` already uses on this exact export — so a later refactor to
> a computed value fails CI rather than silently reverting the segment to the platform default.

---

### Step 7: `tests/admin.imagegenTest.test.ts`

**File:** `tests/admin.imagegenTest.test.ts` (new)
**Change:** create the file. The verdict table is the important half — it is the part that can lie
to the operator — and it is testable precisely because Step 2 put it in a pure module rather than
inside the component.

**Code:**

```ts
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  imageTestPollDelayFor,
  imageTestReason,
  imageTestVerdict,
  imageTestVerdictIsOpen,
  NINA_IMAGE_TEST_GIVE_UP_MS,
  NINA_IMAGE_TEST_POLL_INTERVALS_MS,
  NINA_IMAGE_TEST_POLL_LATE_AFTER_ATTEMPTS,
  NINA_IMAGE_TEST_POLL_MID_AFTER_ATTEMPTS,
  NINA_IMAGE_TEST_VERDICT_LINE,
  NINA_IMAGE_TEST_VERDICT_WHY,
  NINA_IMAGE_TEST_VERDICTS,
  type NinaImageTestJobView,
  type NinaImageTestVerdict,
} from '@/lib/admin/imageGenTestView'
import { NINA_IMAGE_FAILURES } from '@/lib/nina/imagefail'
import {
  NINA_HOST_MAX_DURATION_MS,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_STALE_MS,
} from '@/lib/nina/imagerecipe'

/**
 * R11 and R12's testable surface.
 *
 * `vitest.config.ts` is `environment: 'node'` and its `include` matches no `.tsx`, so there is no
 * render here — the carve-out `tests/admin.tuning.test.ts` states for the same reason: everything
 * about this panel that could be wrong in a way a human would not notice is a pure function in
 * `lib/admin/imageGenTestView.ts`. **That is exactly why the verdict rules are in that module and
 * not inside the component**: a verdict that could lie to the operator has to be assertable.
 *
 * The second half is STRUCTURAL — `tests/admin.memory.test.ts`'s technique, and its stated reason:
 * *a structural guarantee that is only a comment decays.*
 */

const IMAGETEST = 'lib/nina/imagetest.ts'
const ACTIONS = 'lib/admin/imageGenActions.ts'
const VIEW = 'lib/admin/imageGenTestView.ts'
const PANEL = 'components/admin/ImageGenTestPanel.tsx'
const FORM = 'components/admin/ImageGenPanel.tsx'
const PAGE = 'app/admin/image-generation/page.tsx'

/**
 * A source file with its block comments removed — `admin.tuning.test.ts:302`'s `codeOnly`, copied
 * because it is load-bearing here rather than merely tidy. `lib/nina/imagetest.ts`'s docstring
 * explains at length why it does NOT re-implement `finishSelfie`, so a `not.toContain('finishSelfie')`
 * assertion over the raw text would fail on the prose that proves the property.
 */
function codeOnly(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function job(over: Partial<NinaImageTestJobView> = {}): NinaImageTestJobView {
  return {
    jobId: 'jobjobjobjo',
    status: 'pending',
    errorCode: 'queued',
    attempts: 0,
    latencyMs: null,
    costMicroUsd: null,
    prompt: 'SUBJECT: ...',
    createdAtMs: 1_760_000_000_000,
    ...over,
  }
}

describe('R11 — the verdict never lies in either direction', () => {
  it('reports a refusal for policy and for nothing else', () => {
    expect(imageTestVerdict(job({ status: 'failed', errorCode: 'policy' }))).toBe('refused')

    /* The property that protects the operator: no other terminal state may read as a refusal.
     * Driven off NINA_IMAGE_FAILURES so a fifth kind added upstream is covered automatically. */
    for (const kind of NINA_IMAGE_FAILURES) {
      if (kind === 'policy') continue
      expect(imageTestVerdict(job({ status: 'failed', errorCode: kind }))).not.toBe('refused')
    }
    /* Including one nobody has invented yet. */
    expect(imageTestVerdict(job({ status: 'failed', errorCode: 'wat' }))).toBe('unknown')
    expect(imageTestVerdict(job({ status: 'failed', errorCode: null }))).toBe('unknown')
  })

  it('classifies timeout, transport and stale as inconclusive, not as a refusal', () => {
    for (const kind of ['timeout', 'transport', 'stale'] as const) {
      expect(imageTestVerdict(job({ status: 'failed', errorCode: kind }))).toBe('inconclusive')
    }
    expect(NINA_IMAGE_TEST_VERDICT_WHY.inconclusive).toContain('NOT a refusal')
  })

  it('reports allowed only for a job that actually succeeded', () => {
    expect(imageTestVerdict(job({ status: 'ok', errorCode: null }))).toBe('allowed')
    /* `jobStage` folds 'repaired' into 'done'; no image writer produces it, and asserting a
     * photograph exists on that evidence would be an invention. */
    expect(imageTestVerdict(job({ status: 'repaired', errorCode: null }))).toBe('unknown')
  })

  it('distinguishes "still running" from "already failed once"', () => {
    expect(imageTestVerdict(job({ attempts: 0 }))).toBe('running')
    /* NINA_IMAGE_MAX_ATTEMPTS = 2, so a first failure is requeued: pending, error_code back to
     * 'queued', attempts incremented. That is a different fact from "still running". */
    expect(NINA_IMAGE_MAX_ATTEMPTS).toBe(2)
    expect(imageTestVerdict(job({ attempts: 1, errorCode: 'queued' }))).toBe('retrying')
    expect(imageTestVerdict(job({ attempts: 1, errorCode: 'running' }))).toBe('retrying')
    expect(NINA_IMAGE_TEST_VERDICT_LINE.retrying).not.toContain('refus')
  })

  it('is idle before anything has been dispatched', () => {
    expect(imageTestVerdict(null)).toBe('idle')
    expect(imageTestVerdictIsOpen('idle')).toBe(false)
  })

  it('polls only while the answer can still change', () => {
    const openStates: NinaImageTestVerdict[] = ['running', 'retrying']
    for (const verdict of NINA_IMAGE_TEST_VERDICTS) {
      expect(imageTestVerdictIsOpen(verdict)).toBe(openStates.includes(verdict))
    }
  })

  it('has a line and a why for every verdict', () => {
    for (const verdict of NINA_IMAGE_TEST_VERDICTS) {
      expect(NINA_IMAGE_TEST_VERDICT_LINE[verdict].length).toBeGreaterThan(0)
      expect(NINA_IMAGE_TEST_VERDICT_WHY[verdict].length).toBeGreaterThan(0)
    }
    /* Exactly one headline may say the provider declined. */
    const declining = NINA_IMAGE_TEST_VERDICTS.filter((v) =>
      /declined|refused/i.test(NINA_IMAGE_TEST_VERDICT_LINE[v]),
    )
    expect(declining).toEqual(['refused'])
  })

  it('falls through to the raw code for a reason it does not know', () => {
    expect(imageTestReason(null)).toBeNull()
    expect(imageTestReason('')).toBeNull()
    expect(imageTestReason('timeout')).toContain('aborted')
    expect(imageTestReason('brand-new-kind')).toBe('brand-new-kind')
  })
})

describe('the poll is bounded, and the bound is derived', () => {
  it('covers two anchored attempts and stops well before the server gives up', () => {
    /* Two attempts at phase 3's anchored ceiling (220 s) is 440 s of legitimate work. */
    expect(NINA_IMAGE_TEST_GIVE_UP_MS).toBeGreaterThan(NINA_IMAGE_MAX_ATTEMPTS * 220_000)
    /* And it must stop long before a stale job is given up, or "stopped watching" would be read
     * as "failed" — see the constant's docstring on why this is NOT NINA_IMAGE_STALE_MS. */
    expect(NINA_IMAGE_TEST_GIVE_UP_MS).toBeLessThan(NINA_IMAGE_STALE_MS)
  })

  it('escalates the interval, and never returns zero', () => {
    expect(imageTestPollDelayFor(0)).toBe(NINA_IMAGE_TEST_POLL_INTERVALS_MS.initial)
    expect(imageTestPollDelayFor(NINA_IMAGE_TEST_POLL_MID_AFTER_ATTEMPTS)).toBe(
      NINA_IMAGE_TEST_POLL_INTERVALS_MS.mid,
    )
    expect(imageTestPollDelayFor(NINA_IMAGE_TEST_POLL_LATE_AFTER_ATTEMPTS)).toBe(
      NINA_IMAGE_TEST_POLL_INTERVALS_MS.late,
    )
    expect(imageTestPollDelayFor(9_999)).toBe(NINA_IMAGE_TEST_POLL_INTERVALS_MS.late)
    /* Monotonic, and bounded below — a zero would be a spin loop. */
    let previous = 0
    for (const attempts of [0, 1, 6, 12, 18, 40]) {
      const delay = imageTestPollDelayFor(attempts)
      expect(delay).toBeGreaterThan(0)
      expect(delay).toBeGreaterThanOrEqual(previous)
      previous = delay
    }
  })

  it('reaches the give-up in a sane number of round trips', () => {
    let elapsed = 0
    let attempts = 0
    while (elapsed <= NINA_IMAGE_TEST_GIVE_UP_MS && attempts < 500) {
      elapsed += imageTestPollDelayFor(attempts)
      attempts += 1
    }
    /* Enough to answer inside the first minute, few enough that a forgotten tab is not a load
     * generator. */
    expect(attempts).toBeGreaterThan(20)
    expect(attempts).toBeLessThan(120)
  })
})

describe('the dispatch reuses the shipped pipeline', () => {
  const source = codeOnly(IMAGETEST)

  it('checks the cap before it opens a row', () => {
    expect(source.indexOf('ninaImageQuotaLeft')).toBeLessThan(source.indexOf('openNinaImageJob'))
  })

  it('opens one job and fires one generation, and never awaits it', () => {
    expect(source.match(/openNinaImageJob\(/g)).toHaveLength(1)
    expect(source.match(/fireNinaImageGeneration\(/g)).toHaveLength(1)
    expect(source).not.toMatch(/await\s+fireNinaImageGeneration/)
    /* The guarded symbol. It runs from lib/nina/imagerun.ts and nowhere else. */
    expect(source).not.toMatch(/\brunNinaImageJob\s*\(/)
  })

  it('is a selfie job stamped as admin, so finishSelfie satisfies R12', () => {
    expect(source).toContain("purpose: 'selfie'")
    expect(source).toContain("source: 'admin'")
    expect(source).not.toContain("purpose: 'avatar'")
  })

  it('writes no message and no image row of its own (plan invariant 12)', () => {
    for (const forbidden of [
      'insertNinaMessages',
      'insertNinaMessageImages',
      'finishSelfie',
      'nina_message_images',
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })

  it('reads no provider secret', () => {
    expect(source).not.toContain('OPENROUTER_API_KEY')
  })
})

describe('the gate cannot be forgotten', () => {
  /*
   * Scoped to THIS PHASE'S TWO ACTIONS BY NAME rather than looping over every
   * `export async function` in the file, because phase 4 owns the other exports in it and this
   * phase must not assert anything about their shape. See this plan's Handoffs, item 6 — the
   * `admin.tuning.test.ts:308-321` loop additionally requires a `.safeParse(` in every action, and
   * `runNinaImageTestAction` deliberately has no payload to parse.
   */
  it('opens both actions with requireAdmin as the first statement', () => {
    const actions = readFileSync(ACTIONS, 'utf8')
    for (const name of ['runNinaImageTestAction', 'readNinaImageTestAction']) {
      const at = actions.indexOf(`export async function ${name}`)
      expect(at, `${name} is not exported from ${ACTIONS}`).toBeGreaterThan(-1)

      /* This action's body only: up to the next export, or the end of the file. */
      const rest = actions.slice(at)
      const nextExport = rest.indexOf('\nexport ', 1)
      const body = nextExport === -1 ? rest : rest.slice(0, nextExport)

      const gate = body.indexOf('await requireAdmin()')
      expect(gate, `${name} does not call requireAdmin()`).toBeGreaterThan(-1)
      /* And it is the FIRST statement — before any read and before any use of an argument. */
      for (const later of ['ninaImageQuotaLeft(', 'dispatchNinaImageTest(', 'isValidId(']) {
        const useAt = body.indexOf(later)
        if (useAt > -1) expect(gate, `${name} reaches ${later} before the gate`).toBeLessThan(useAt)
      }
    }
  })

  it('gates the page before it reads anything', () => {
    const source = readFileSync(PAGE, 'utf8')
    expect(source).toContain('await requireAdmin()')
  })

  it('reports a refusal as a value, never as a throw', () => {
    const source = codeOnly(ACTIONS)
    const at = source.indexOf('export async function runNinaImageTestAction')
    expect(at).toBeGreaterThan(-1)
    const body = source.slice(at)
    expect(body).toContain('ok: false')
    expect(body).not.toMatch(/throw new Error/)
  })
})

describe('the surface holds the admin invariants', () => {
  it('declares the route ceiling as a literal, because segment config is statically analysed', () => {
    const source = readFileSync(PAGE, 'utf8')
    /* `extract.pollSchedule.test.ts:70`'s regex, on the same export. */
    const match = /export const maxDuration = (\d+)/.exec(source)
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBe(300)
    expect(NINA_HOST_MAX_DURATION_MS).toBe(300_000)
    /* Paired with the dynamic export every other /admin page carries, not instead of it. */
    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })

  it('mounts the test panel at phase 4’s seam, exactly once, and the seam is gone', () => {
    const source = readFileSync(FORM, 'utf8')
    expect(source.match(/<ImageGenTestPanel\b/g)).toHaveLength(1)
    expect(source).toContain("from '@/components/admin/ImageGenTestPanel'")
    expect(source).not.toContain('SEAM — PHASE 6')
  })

  it("declares 'use client' and reaches nothing server-only", () => {
    /* `admin.tuning.test.ts:359-376`, verbatim rule and verbatim list. */
    expect(readFileSync(PANEL, 'utf8').startsWith("'use client'")).toBe(true)
    const source = codeOnly(PANEL)
    for (const forbidden of [
      'server-only',
      '@/lib/nina/queries',
      '@/lib/db/',
      '@/lib/env',
      '@/lib/admin/requireAdmin',
      '@/components/ui/AppShell',
    ]) {
      expect(source, `${PANEL} reaches ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('keeps the view module client-safe and free of a second classifier', () => {
    const source = codeOnly(VIEW)
    expect(source).not.toContain('server-only')
    expect(source).not.toContain('@/lib/db')
    /* It LOOKS UP the classification; it must not recompute it. */
    expect(source).not.toContain('POLICY_BODY_RE')
    expect(source).not.toContain('POLICY_STATUSES')
    expect(source).not.toContain('classifyImageFailure')
    /* And it reuses the one rule about a column with two meanings. */
    expect(source).toContain('jobStage(')
  })

  it('shows the quota before the click and disables the button when capped', () => {
    const source = codeOnly(PANEL)
    expect(source).toContain('quotaLeft')
    expect(source).toMatch(/disabled=\{[^}]*capped/)
    /* The verdict copy is the view module's, not the component's. */
    expect(source).toContain('NINA_IMAGE_TEST_VERDICT_LINE[verdict]')
    expect(source).toContain('NINA_IMAGE_TEST_VERDICT_WHY[verdict]')
  })

  it('asks a second time about nothing — R1, the standing ruling for this surface', () => {
    const source = readFileSync(PANEL, 'utf8')
    for (const banned of [
      'window.confirm',
      '<dialog',
      'showModal',
      'Are you sure',
      'confirming',
    ]) {
      expect(source, `${PANEL} must not contain "${banned}"`).not.toContain(banned)
    }
  })

  it('polls in a sequential loop and cleans the timer up', () => {
    const source = codeOnly(PANEL)
    /* ChatScreen.tsx:845-850's rule: a tick must not fire while the previous request is in
     * flight. So: setTimeout re-armed after the await, never setInterval. */
    expect(source).not.toContain('setInterval')
    expect(source).not.toContain('clearInterval')
    expect(source).toContain('setTimeout')
    expect(source).toContain('clearTimeout')
    expect(source).toContain('cancelled')
    expect(source).toContain('NINA_IMAGE_TEST_GIVE_UP_MS')
    /* And no page-wide refresh: the read action carries the new state. */
    expect(source).not.toContain('router.refresh')
  })

  it('awaits no guarded model entry point in any of this phase’s files', () => {
    /* Plan invariant 5 / ci:llm-payload-guard Rule 2, restated where a reader will see it. */
    for (const path of [IMAGETEST, ACTIONS, VIEW, PANEL, FORM, PAGE]) {
      const source = codeOnly(path)
      for (const guarded of [
        'runNinaImageJob',
        'runNinaTurn',
        'distillNinaMemory',
        'describeNinaImage',
        'resolveNinaPromises',
        'getOrCreateInsight',
        'rankNinaSearchHits',
        'titleNinaSessionIfNeeded',
      ]) {
        expect(source, `${path} names ${guarded}`).not.toContain(guarded)
      }
    }
  })
})
```

**Impact:** a new test file. It asserts behaviour through the pure module and asserts the rest at
source level, which is the pattern the repo already uses for rules that live inside a
`'use client'` component (see `lib/nina/jobview.ts`'s header on why that carve-out exists).

> **Implementer notes.**
>
> 1. **`codeOnly` is not optional.** `lib/nina/imagetest.ts`'s docstring argues at length why it does
>    *not* re-implement `finishSelfie`, and `lib/admin/imageGenTestView.ts`'s explains why it is not
>    a second classifier. A `not.toContain(...)` over raw text would fail on the prose that proves
>    the property. `admin.tuning.test.ts:302` is where the helper comes from; do not add a second
>    copy if a shared one has since appeared.
> 2. **Paths are bare repo-relative strings**, as in `admin.tuning.test.ts:278-283` (vitest's cwd is
>    the repo root). `admin.shell.test.ts:28-29` uses a `fileURLToPath` root instead; either is
>    accepted, but do not mix them in one file.
> 3. `vitest.config.ts` sets `globals: false`, so the `import { describe, expect, it } from 'vitest'`
>    line is mandatory.
> 4. There is **no render test anywhere in this repo** — `include` matches only `.test.ts`, never
>    `.tsx`. Do not add a testing-library dependency to assert the panel; that is what putting the
>    verdict in a pure module bought.

---

## Verification

**Precondition (this worktree has neither):**

```
npm install
cp <a valid .env.local>   # lib/env.ts validates 14 vars at load; build, db:*, lint and vitest all
                          # die without it
```

**Typecheck:** `npm run typecheck` (`next typegen && tsc --noEmit`)
**Lint:** `npm run lint`
**Build:** `npm run build`
**Tests:** `npx vitest run tests/admin.imagegenTest.test.ts`, then the whole suite: `npm test`
**Guards** (all four exist as scripts; there is no composite `ci` script):

```
npm run ci:llm-payload-guard     # must still report all 8 guarded symbols confined
npm run ci:openrouter-guard
npm run ci:client-secret-guard
npm run ci:data-layer-guard
```

`ci:llm-payload-guard` is the one that matters most here, and it must pass with
`scripts/check-llm-payload-boundary.mjs` **unedited** — its header says *"NO OTHER PHASE EDITS IT"*.

**Manual check** (needs `.env.local` and a local prod build — `/admin` cannot be probed on a Vercel
preview, because `ADMIN_EMAILS`, `VAPID_*` and `AUTH_URL` are Production-scope only; and port 3000
is held by a stranger, so use another port):

1. `/admin/image-generation` shows **"N generations left today"** before anything is clicked, with N
   matching `6 − (today's image turns)`.
2. Click **Test prompt**. The button returns immediately — no multi-minute spinner — and the verdict
   goes `Running` → `Allowed` (or `Refused` / `No verdict`) without a reload.
3. On `Allowed`, `/admin/photos` shows the new photograph **with no further action**, its description
   being `NINA_IMAGE_TEST_SCENE`, and `/nina` shows one new Nina bubble with a caption from
   `NINA_IMAGE_CAPTIONS`. That bubble is expected — D7.
4. Set the quota to spent (six image turns today) and click: the panel says so and **no `nina_turns`
   row is created** (`select count(*) from nina_turns where kind='image' and created_at > <jakarta
   midnight>` is unchanged).
5. `select status, error_code, attempts, cost_micro_usd from nina_turns where id = '<jobId>'` — one
   row, `source: 'admin'` in `args`, and a non-null `cost_micro_usd` whether it succeeded or failed.

**Exit criteria:**

- The button dispatches exactly one generation and returns without awaiting it.
- The panel reports `running` → `retrying` → `allowed` / `refused` / `inconclusive`, and
  **`policy` is rendered as "the provider refused this prompt" and nothing else is.**
- A successful test appears in `/admin/photos` with no further action (R12).
- A capped operator is told so and no row is opened (invariant 8's other half).
- `app/admin/image-generation/page.tsx` declares a literal `maxDuration = 300`.
- No model call is awaited in any render; `ci:llm-payload-guard` still passes unedited.
- The whole suite is green.

---

## Assumptions

**RECONCILED — every item below has been checked against the landed plans and the tree at
`4a7588e`, and each now carries its verdict.** When this was drafted, phases 1-5 had written no plan
file and no code (`git log` at `b0e492a`; `lib/nina/imageprefs.ts`, `lib/admin/imageGenActions.ts`
and `app/admin/image-generation/` all absent), so each item named its single point of contact for
the reconciler to fix in one place. That has now happened: **A1 was wrong and is corrected** (the
prefs row holds `{ source, id }`, not a Blob URL, so the reference is resolved through
`resolveNinaPhotoReference`); **A3, A5, A6, A7 and A8 are confirmed against the other phases' plans
and the current source**; A2 and A4 are confirmed with their one remaining tolerance noted.

Read these as the settled contract, not as guesses. Nothing in this section still needs a decision,
and nothing here is a reason to pause a phase-6 session.

**A1 — the prefs' reference field. RESOLVED — no longer an assumption, and the assumed shape was
wrong.**

The draft assumed `NinaImagePrefs.referenceUrl: string | null`. **Phase 1 stores
`reference: { source: NinaImageReferenceSource; id: string }`** — a set and an id, never a URL —
because `updateNinaChatPhotoBlob` changes a chat photograph's `blob_url` and keeps its `id`, so a
stored URL would point at a deleted Blob object while the picker still drew the chosen tile. `id` is
`''` exactly when `source === 'none'`; `NINA_IMAGE_REFERENCE_NONE` is the one representable "no
reference"; a half-selection is coerced into it rather than stored.

Phase 1's plan hands this phase the bridge in as many words: *"Phase 3 resolves the reference
through `resolveNinaPhotoReference`, not through the row. … `null` is the ordinary answer for a
deleted photograph and must degrade to an unanchored generation, never to a crash. Phase 3's
`NinaImageJobArgs.referenceUrl` should be filled from `blobUrl` at dispatch time, so a retry uses
the URL the job was opened with."* This phase is the dispatcher, so that instruction lands here.

**The two call sites, corrected:**

```ts
// dispatchNinaImageTest — beside the existing prefs/tuning reads
const [tuning, prefs] = await Promise.all([readNinaTuning(userId), readNinaImagePrefs(userId)])
const reference = await resolveNinaPhotoReference(userId, prefs.reference)
// … then, on the openNinaImageJob args:
referenceUrl: reference?.blobUrl ?? null,
```

```ts
// readNinaImageTestAction — for the "anchored / no reference" line only
const prefs = await readNinaImagePrefs(userId)
const anchored = prefs.reference.source !== 'none'
```

The second needs **no** extra round trip: whether a reference was *chosen* is readable off the prefs
row, and whether it was *resolvable* is a fact about the job, which `args.referenceUrl` already
carries. Do not resolve twice.

**A2 — `buildNinaImagePrompt`'s prefs parameter.** Assumed `prefs` on the existing input object,
typed `NinaImagePrefs` (or `NinaImagePrefs | null`), alongside the existing `purpose`, `scene`,
`mood`, `tuning`. One call site: `assembleNinaImageTestPrompt`. If phase 2 makes `prefs` required
and drops `tuning`, delete the `tuning` line from that call and the `readNinaTuning` read from both
Step 1 and Step 3.

**A3 — `sidecarText` keeps its three-field input.** Called as
`sidecarText({ prompt, seed, purpose: 'selfie' })`, exactly as `lib/nina/selfiegen.ts:91` does. **CONFIRMED: neither phase 2 nor phase 3 widens it.** Phase 2's contract says the
`reference: none (RU-18)` line is *"**not** edited here"*, and phase 3's keeps
`tests/nina.imagerecipe.test.ts:98`'s assertion of it intact. So the output says
`reference:  none (RU-18)` unconditionally (`lib/nina/imagegen.ts:171`), which **is** wrong on the
sidecar of an anchored test and stays wrong after this wave. It is cosmetic — the sidecar lands in
`nina_message_images.prompt` and only a human ever reads it — and it is filed in **Handoffs** as a
follow-up card rather than smuggled into a file this phase does not own. Do not fix it here: a
second edit to `imagegen.ts` in the same wave as phase 2's rewrite is a merge conflict in a file
whose output this phase merely displays.

**A4 — phase 4's seam and file shapes.** `components/admin/ImageGenPanel.tsx` carries a comment
containing the literal `SEAM — PHASE 6`; `lib/admin/imageGenActions.ts` exists with `'use server'`
first; `app/admin/image-generation/page.tsx` exists and is a server component opening with
`requireAdmin()`. If phase 4 spells the seam differently, Step 5 targets whatever marker it wrote.

**A5 — phase 3's `referenceUrl` on `NinaImageJobArgs`. CONFIRMED against phase 3's plan.** Declared
`referenceUrl?: string | null` — **optional AND nullable**, and phase 3 says the optionality is
load-bearing (an old `nina_turns` row written before phase 3 has no such key and must stay
readable). Passing an explicit `null` is correct and is what this phase does;
`ninaImageReferenceUrl(args)` on phase 3's side normalises both absence and `null` to "unanchored".
Phase 3 also confirms `reopenNinaImageJob` copies args with `{ ...args, attempts: 0 }`, so a redo of
an anchored test stays anchored for free.

**A6 — `requireAdmin()` returns `{ userId }`.** Confirmed, not assumed:
`lib/admin/requireAdmin.ts:69` returns `AdminIdentity { userId, email }`, and both exits are
framework control-flow throws (`redirect('/')` / `notFound()`) — so it must be statement 1 and must
never be wrapped in a bare try/catch. Both actions honour that.

**A7 — `Button` accepts `loading` and `disabled`.** Confirmed at
`components/admin/CharacterPanel.tsx:425-431` and `components/ui/Button.tsx:36-61`
(`disabled:pointer-events-none disabled:opacity-50` is in the base class, so a disabled button needs
no extra styling). Exported from the `@/components/ui` barrel alongside `CONTROL_CLASS`.

**A8 — phase 4's page carries `export const dynamic = 'force-dynamic'`. CONFIRMED.** Phase 4's
Interface Contract declares `dynamic` as one of that page's two exports, and every existing
`/admin/*` route does the same (`app/admin/page.tsx:32` among them), and Step 6's test asserts
the pair. If phase 4 omits it, add it in the same edit as `maxDuration` and note the widened scope
— it is one line and the alternative is a test that fails for a reason nobody chose.

---

## Handoffs

Work found and deliberately not done here.

1. **The provider's own refusal text is not stored.** D4 explains it: `NinaImageCallResult.detail`
   is log-only, and persisting it needs either a `nina_turns` column (a third migration, in the same
   wave as phase 7's `DROP COLUMN`) or a widened `NinaImageJobArgs` (phase 3's type, written once at
   open). **Not assigned to another phase in this set** — no phase owns it — so it belongs on a
   follow-up card: *"persist `NinaImageCallResult.detail` so `/admin/image-generation` can quote the
   provider's refusal."* It would strengthen R11; the classification, the prompt, the job id and the
   log grep already satisfy it.

2. **`sidecarText`'s `reference:  none (RU-18)` line becomes a lie for an anchored generation**
   (`lib/nina/imagegen.ts:171`). It is phase 2's file and phase 3's fact. Whichever of the two
   touches it should make the line conditional; this phase only calls the function. Serves R10, not
   R11/R12.

3. **`ninaAppearance`'s missing sentence boundary** (`lib/nina/persona.ts:401`, the
   `${wardrobe} She still has` splice the analysis names as defect 1) will be visible in this
   panel's prompt preview. It is **phase 2's** to fix — its Owns list names it explicitly. Do not
   fix it here; a second fix would be a merge conflict in the one file whose output this phase
   merely displays.

4. **The dirty flag.** `ImageGenTestPanel` accepts `dirty?: boolean` and nothing passes it. Phase 4
   owns the form's dirty state; wiring it is one prop at Step 5's line. Left optional so neither
   phase blocks the other.

5. **RESOLVED BY THE RECONCILER — phase 4's structural test over `lib/admin/imageGenActions.ts`
   would have failed on this phase's two actions, and phase 4's plan has been edited so it does
   not.** This was the one concrete cross-phase collision this planner found, and it turned out to
   be two:

   - the `requireAdmin` + `.safeParse` loop over every `export async function` (below), and
   - a second case in the same file asserting `toHaveLength(2)` over the exported actions, which
     phase 4's Handoffs told this phase to "raise to 3" — wrong twice over, since this phase appends
     **two** actions (making four) and `tests/admin.imagegen.test.ts` is **phase 4's file**, on no
     other phase's Owns list.

   **Both are fixed on phase 4's side, which is where the file lives. This phase edits no test of
   phase 4's — do not.** Phase 4 now (a) keeps the `requireAdmin`-is-first loop over *every* export,
   so invariant 6 stays asserted for these two actions the moment they exist, (b) scopes the
   `.safeParse` half to `saveNinaImagePrefsAction` / `resetNinaImagePrefsAction` by name, and
   (c) replaces the count with an **allowlist that already names `runNinaImageTestAction` and
   `readNinaImageTestAction`** — so nothing in phase 4's suite needs touching when this phase lands.
   The reconciler took this plan's option (b) over its option (a), because scoping the whole loop
   would have quietly stopped asserting invariant 6 over these two actions, which is the half that
   matters.

   The original argument, kept because it is the reason the shape is right:

   `tests/admin.tuning.test.ts:308-321` is the template phase 4 will copy, and it loops over *every*
   `export async function` in the action file asserting both `await requireAdmin()` **and**
   `.safeParse(`, with the gate first:

   ```ts
   const bodies = readFileSync(ACTIONS, 'utf8').split('export async function ').slice(1)
   for (const body of bodies) {
     const gate = body.indexOf('await requireAdmin()')
     const zod = body.indexOf('.safeParse(')
     expect(gate).toBeGreaterThan(-1)
     expect(zod).toBeGreaterThan(-1)      // <- this line fails on runNinaImageTestAction
     expect(gate).toBeLessThan(zod)
   }
   ```

   `runNinaImageTestAction` **takes no arguments at all** — that is the point: there is no payload to
   forge, so there is nothing to parse, and adding an empty Zod object to satisfy a grep would be
   cargo cult. `readNinaImageTestAction` shape-checks its one argument with `isValidId`
   (`parseNinaJumpParam`'s and `/nina/jobs/[id]`'s precedent) rather than with Zod, for the same
   reason: a nanoid is not a shape Zod adds anything to.

   **Resolution, in order of preference:** (a) phase 4 scopes its loop to its own two action names,
   exactly as this phase's test does; or (b) the loop keeps the `requireAdmin` half for every export
   and applies the `.safeParse` half only to actions that declare a parameter. Either way the
   `requireAdmin`-is-first property stays asserted for all four actions, which is the invariant that
   matters (invariant 6). This phase's own test already covers its two.

6. **`/nina/jobs` already renders these test jobs**, because they are ordinary `kind='image'`
   `nina_turns` rows and `listNinaImageJobs` filters only on `kind` and `deleted_at`. So a prompt
   test appears in the runner's own job list, labelled in Indonesian. Nothing is broken and no
   filtering is added: the ledger being honest is the same argument `reopenNinaImageJob` makes about
   showing both rows after a redo.

---

## Rollback

This phase is one commit on `feature/nina-image-generation-tab` and `git revert` is the unit. It has
**no database step**: no column, no migration, no table. Nothing outside its own files is deleted or
renamed, so the revert is complete on its own even with phases 1–5 landed.

The revert restores phase 4's `SEAM — PHASE 6` comment and removes `maxDuration` from
`app/admin/image-generation/page.tsx`. Note the second one if any other phase later fires `after()`
from that segment — the segment goes back to the platform default.

`nina_turns` rows already written by a test are left where they are, deliberately: they carry real
`cost_micro_usd`, and *money spent must be written down* (invariant 8). A photograph a test put in
Chat photos is removed the way any other one is, through `removeChatPhotoAction` on `/admin/photos`,
which already releases the Blob object only when nothing else references it.
