# Code Analysis: Nina Image Generation admin tab

**Type:** Feature Implementation
**Date:** 2026-09-07 12:40:15 +07:00
**Session ID:** 20260907-124015-IMGN
**Plan:** `NINA_IMAGE_GENERATION_TAB_PLAN.md` (7 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-image-generation-tab` — branch `feature/nina-image-generation-tab`, base `HEAD` @ `b0e492a`

Base is `HEAD` and not `origin/main`: the checkout is four commits ahead of `origin/main` and dirty
(orchestration ledgers). Every line quoted below was read at `b0e492a`.

---

## User Input

### Original User Request

```
look at this long ass prompt that you created:
--- prompt as sent ---
A casual smartphone photograph, as if taken and sent in a chat app. Natural daylight, slightly imperfect framing, shallow depth of field, visible skin texture, no studio lighting, no retouching, no text, no watermark, no logo, no border. Realistic photograph, not an illustration and not a render.

SUBJECT:
A woman in her late twenties, mixed Southeast Asian and Mediterranean features, olive skin with a warm undertone. Lean, visibly muscular runner's build — defined quadriceps and calves, narrow shoulders. Long dark brown hair pulled into a high ponytail with loose strands at the temples. Dark brown eyes, thick straight eyebrows, no makeup, a wide open smile. Usually a little sweaty.

Her outfit for this photograph: long pants She still has the black digital watch on her left wrist unless the outfit says otherwise. Her home ground is a red 400 m athletics track beside a green field, in flat morning sun.

POSE AND PRESENCE: She is fully aware of the camera and playing to it: weight on one hip, body turned toward the lens, chin down, the phone held close. She is looking straight down the lens and half-smiling, like she knows exactly what she is doing.

SCENE: Nina at home in her rented room in Tebet, wearing very short black running shorts and a crop top, standing stretching one leg up on a chair by the window, morning light, showing off her long legs and thighs, looking back over her shoulder at the camera with a smirk

EXPRESSION AND ENERGY: flirty, teasing, looking back over her shoulder
---
this long prompt only created a mediocre result. i dont care about her face, i care a lot about her voluptuous body: big boobs, bubble butt, big thighs , very long calves. always explicitly instruct these in the prompt.

we need to change image generation prompt. in fact : make a new tab in admin: Image Generation
for now add these parameters and fields:
1. remove Wardrobe field in /admin/personality (this new feature is more detailed version of it)
1. prompt length (sliding bar): the longer the prompt , the more detailed the prompt would be
2. focus on (select multi options): face, skin, big boobs, bubble butt, big thighs, very long calves
3. wardrobe (free text) : e.g: long hugging leggings with string bra
4. venue (free text): Kuta streets in Bali
5. time (free text): e.g: sunny day , rainy night, cold afternoon
6. notes: e.g: nina is full of sweat
7. photo reference: user can select all photos in Nina's album and Chat photos . can you make something like a simple photos grid without any captions (just like ios album app). user can select one out of all these photos.

also, add a test prompt button, so we can see if this prompt is actually allowed by Alibaba (qwen 3 devs) guardrails. and the photo result will automatically be added to Chat photos
```

### User-Provided Context

The pasted block is a **verbatim `sidecarText()` dump** from a real generation — `lib/nina/imagegen.ts:163-176`
writes exactly that `--- prompt as sent ---` framing into `nina_message_images.prompt`. So the
complaint is evidence, not a paraphrase, and every line of it is traceable to a named constant:

| Line in the paste | Where it comes from |
|---|---|
| `A casual smartphone photograph…` | `NINA_SELFIE_STYLE` — `lib/nina/imagegen.ts:52` |
| `SUBJECT:` first paragraph | `NINA_FACE` — `lib/nina/persona.ts:354` |
| `Her outfit for this photograph: long pants She still has…` | `ninaAppearance()` — `lib/nina/persona.ts:379-389`, with `nina_tuning.wardrobe = 'long pants'` |
| `POSE AND PRESENCE:` | `ninaPhotoPresence()` — `lib/nina/imagegen.ts:100-121`, both clauses fired, so `steamy` and `flirty` are both at band `high` or `max` |
| `SCENE:` | the model's own `generate_image` `scene` argument |
| `EXPRESSION AND ENERGY:` | the model's own `mood` argument |

Two defects are visible in the paste itself, independent of the user's complaint:

1. **A missing sentence boundary.** `ninaAppearance` interpolates `${wardrobe}` and then continues
   with ` She still has…` with no terminating punctuation, so a wardrobe that does not end in a full
   stop produces `long pants She still has the black digital watch` (`lib/nina/persona.ts:387`).
2. **The subject paragraph is all face and no body.** `NINA_FACE` spends four of its five sentences
   on hair, eyes, eyebrows, makeup and smile, and its one body clause is *"Lean, visibly muscular
   runner's build — defined quadriceps and calves, narrow shoulders"* — which is the opposite of
   what the user says he wants, and `narrow shoulders` is the only silhouette instruction in the
   whole prompt.

### User-Provided Files

None marked `@`. The paste identified the code path; everything below was discovered by tracing it.

### Requirement IDs

The user's own numbering has two items labelled `1.` (the wardrobe removal and the prompt-length
slider). They are separate deliverables and are numbered separately here; the rest follow his order.

| ID | What the user asked for |
|---|---|
| R1 | *"i dont care about her face, i care a lot about her voluptuous body: big boobs, bubble butt, big thighs, very long calves. always explicitly instruct these in the prompt."* — the body canon reaches **every** image prompt, unconditionally |
| R2 | *"make a new tab in admin: Image Generation"* |
| R3 | *"remove Wardrobe field in /admin/personality (this new feature is more detailed version of it)"* |
| R4 | *"prompt length (sliding bar): the longer the prompt, the more detailed the prompt would be"* |
| R5 | *"focus on (select multi options): face, skin, big boobs, bubble butt, big thighs, very long calves"* |
| R6 | *"wardrobe (free text): e.g: long hugging leggings with string bra"* |
| R7 | *"venue (free text): Kuta streets in Bali"* |
| R8 | *"time (free text): e.g: sunny day, rainy night, cold afternoon"* |
| R9 | *"notes: e.g: nina is full of sweat"* |
| R10 | *"photo reference: user can select all photos in Nina's album and Chat photos … a simple photos grid without any captions (just like ios album app). user can select one out of all these photos."* |
| R11 | *"add a test prompt button, so we can see if this prompt is actually allowed by Alibaba (qwen 3 devs) guardrails"* |
| R12 | *"the photo result will automatically be added to Chat photos"* |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

The image prompt is assembled from two sources today and neither is operator-facing at the level
the user wants: `lib/nina/persona.ts`'s canon (fixed at build time) and a **single** free-text line,
`nina_tuning.wardrobe`, on `/admin/personality`. Everything else about a photograph — where, when,
what to emphasise, how much detail to spend — is decided by the chat model's `scene` and `mood`
arguments, which the operator cannot reach. The request is to promote all of that to an admin
surface of its own, add a body canon the prompt has never had, and give the operator a way to test
a prompt against the provider's guardrails without going through the chat.

**Success Criteria**

1. Every prompt `buildNinaImagePrompt` produces names the body explicitly — big boobs, bubble butt,
   big thighs, very long calves — with no toggle able to remove it (R1).
2. `/admin` carries a sixth nav cell and a sixth route, "Image Generation" (R2).
3. `/admin/personality` no longer renders a Wardrobe field, and the wardrobe the camera reads comes
   from the new surface instead (R3, R6).
4. The new page persists: a prompt-length slider (R4), a multi-select focus set over the six named
   options (R5), and four free-text fields — wardrobe, venue, time, notes (R6–R9).
5. A caption-less selectable grid over **both** photo sets — `nina_avatars` (album) and
   `nina_message_images` where `kind = 'generated'` (chat photos) — with single selection (R10).
6. A button that runs the assembled prompt at the provider and reports back whether it was refused
   on policy grounds, distinguishably from a timeout or a transport failure (R11).
7. A successful test generation appears in `/admin/photos` with no further action (R12).

**Key Considerations**

- **`lib/nina/imagerecipe.ts` must stay import-free.** Its header states the rule twice and
  `scripts/nina-image-worker.ts:62-81` is why: the worker imports it by relative path under
  `node --experimental-strip-types`. Any new vocabulary the *worker* needs goes in that file or in
  another zero-import module; anything that imports `@/` cannot be reached from the worker.
- **The threshold chain is an asserted invariant.** `tests/nina.imagerecipe.test.ts` checks the
  arithmetic between `NINA_TURN_SPENT_MS`, `NINA_IMAGE_CALL_TIMEOUT_MS`,
  `NINA_IMAGE_FINISH_RESERVE_MS`, `NINA_IMAGE_RUN_BUDGET_MS` and `NINA_HOST_MAX_DURATION_MS`.
  A reference image changes the measured latency (see the RU-18 measurement below) and therefore
  changes that arithmetic; it cannot be added without re-deriving the chain.
- **RU-18's measurement is the whole cost of R10.** `lib/nina/imagerecipe.ts:44-49`: an anchored
  generation was measured at **148.9 s** against **78.2 s** unanchored. The shipping in-platform
  call timeout is **150 s**. So R10 as-built would abort roughly half of its own generations.
- **`nina_message_images.message_id` is `notNull` with an FK to `nina_messages`**
  (`lib/db/schema.ts:1600-1604`). A photograph cannot exist in the chat-photos collection without a
  message to hang on. R12 therefore implies a message row, and both existing writers
  (`finishSelfie` at `lib/nina/imagerun.ts:167-205`, `addChatPhotoAction` at
  `lib/admin/chatPhotoActions.ts:175-240`) mint one.
- **`NINA_IMAGE_DAILY_CAP = 6` counts failures.** `lib/nina/imagerecipe.ts:129-136` argues it
  deliberately: *"a cap that only counts successes is a cap an unlucky afternoon can spend ten
  times over"*. A test-prompt button is a generation and costs the same $0.040.
- **`AdminNav` is at its cell budget.** `tests/admin.shell.test.ts:115-128` asserts exactly five
  `short:` strings, each ≤ 8 characters, against a 414 px / 5 = 82.8 px cell; `:173-186` asserts the
  literal `grid h-<n> w-full max-w-[470px] grid-cols-5` row and pairs its height against
  `app/admin/layout.tsx`'s `pb-[calc(5rem+var(--safe-bottom))]`. A sixth cell touches all three.
- **`nina_tuning` has no `jsonb` anywhere and the table header forbids one.** A multi-select (R5) is
  a set; stored the way this schema stores things, it is one boolean column per option.

**Assumptions**

- "focus on" is *emphasis*, not *inclusion* — the body canon ships unconditionally (R1's "always"),
  and selecting `big thighs` adds a clause about thighs on top of it. Deselecting everything must
  not produce a prompt with no body in it, which would contradict R1.
- "prompt length" is an operator-visible slider over the repo's existing 0–100 / five-band scale
  (`NINA_BAND_NAMES`, `ninaBand` — `lib/nina/tuning.ts:80-122`), not a character budget.
- "Alibaba (qwen 3 devs) guardrails" means the `policy` classification `lib/nina/imagefail.ts`
  already computes; the model is `qwen/qwen-image-3-pro` via OpenRouter.

---

## Analysis Scope

### Explicitly Mentioned Files

None. The paste is `sidecarText()` output; the files below were reached from it.

### Discovered Related Files

| File | How it was reached |
|---|---|
| `lib/nina/imagegen.ts` | grep for `POSE AND PRESENCE` — the only source of that literal |
| `lib/nina/persona.ts` | `imagegen.ts:1` imports `NINA_APPEARANCE`, `ninaAppearance` |
| `lib/nina/imagerecipe.ts` | `imagegen.ts:4-9` imports the model/aspect constants |
| `lib/nina/tuning.ts` | `imagegen.ts:2` imports `ninaBand`, `NinaTuning` |
| `lib/nina/selfiegen.ts` | calls `buildNinaImagePrompt` for the chat path |
| `lib/nina/avatargen.ts` | calls it for the avatar path (`imagerun.ts:finishAvatar`) |
| `lib/nina/imagejobs.ts` | `openNinaImageJob`, the cap, claim/complete/fail |
| `lib/nina/imagerun.ts` | `attemptOnce` → `callNinaImageModel` → `finishSelfie` / `finishAvatar` |
| `lib/nina/imagecall.ts` | the one in-platform `fetch` to OpenRouter |
| `lib/nina/imagefail.ts` | `classifyImageFailure` — where `policy` is decided |
| `scripts/nina-image-worker.ts` | the second host; imports `imagerecipe.ts` by relative path |
| `tools/gen_badge_art.py` | the only verified `input_references` payload in the repo (`:326-365`) |
| `lib/nina/queries.ts` | `readNinaTuning`/`writeNinaTuning`, the avatar and chat-photo readers |
| `lib/db/schema.ts` | `ninaTuning` (`:1741`), `ninaMessageImages` (`:1590`), `ninaAvatars` |
| `app/admin/personality/page.tsx` | mounts `CharacterPanel`; the page R3 edits |
| `components/admin/CharacterPanel.tsx` | the Wardrobe input, `:356-378` |
| `lib/admin/schema.ts` | `ninaTuningWriteSchema`, `:454-471` — the Zod boundary |
| `lib/admin/tuningActions.ts` | `saveNinaTuningAction`, `toTuningWrite` (`:60-88`) |
| `lib/admin/tuningModel.ts` | `TuningDraft`, `toTuningDraft`, `changedTuningFields` |
| `components/admin/AdminNav.tsx` | the five nav cells |
| `app/admin/layout.tsx` | the bottom reserve paired with the nav's height |
| `app/admin/photos/page.tsx`, `components/admin/ChatPhotoGrid.tsx` | the chat-photo collection and its tile markup |
| `lib/admin/chatPhotoActions.ts` | `addChatPhotoAction` — the existing "mint a message, then an image row" pattern |
| `app/admin/nina/page.tsx`, `components/admin/explorer/` | the album surface |
| `lib/nina/album.ts` | `photoSideOf`, page sizes, `NINA_ADMIN_PAGE_SIZE` |
| `tests/nina.imagerecipe.test.ts` | asserts the prompt is byte-stable under defaults |
| `tests/admin.tuning.test.ts`, `tests/nina.tuning.test.ts`, `tests/db.schema.nina.test.ts` | the wardrobe assertions R3 breaks |
| `tests/admin.shell.test.ts` | the nav cell count and the height pairing |
| `drizzle/0008_thankful_cardiac.sql`, `drizzle.config.ts` | migration output dir and naming |

---

## Current Dataflow

### Entry Point A: the chat tool — `generate_image`

**Location:** `lib/nina/imagetools.ts:52` (`handleGenerateImage`)
**Trigger:** the chat model emits a `generate_image` tool call during a turn
**Input Schema:** `{ scene: string (3..600), mood?: string (..200) }` — `imagetools.ts:47-50`
**Validation:** Zod, in the handler. A malformed call returns a `tool_result`, never throws.
**Next Step:** `generateNinaSelfie()` — `lib/nina/selfiegen.ts:76`

### Entry Point B: the avatar tool — `set_avatar`

**Location:** `lib/nina/avatartools.ts:85` → `generateNinaAvatar()` at `lib/nina/avatargen.ts:83`
**Note:** passes only `userId` / `scene` / `source` and delegates the whole prompt build, which is
why it picked up the wardrobe with zero edits when that feature landed. It will pick up this one the
same way, and that is a fact to preserve rather than a coincidence.

### Entry Point C: the promise reward

**Location:** `lib/nina/promises.ts` → `generateNinaSelfie()`. Same path as A, different caller.

### Processing Chain

1. **`generateNinaSelfie(request)`** — `lib/nina/selfiegen.ts:76`
   - `ninaImageQuotaLeft(userId)` first, **before a row is opened** (`:88`). `<= 0` →
     `{ ok: false, kind: 'capped' }`.
   - mints `seed = Math.floor(Math.random() * SEED_MAX)` (`:97`)
   - **`readNinaTuning(userId)`** (`:100`) — live, uncached. The comment says it in as many words:
     *"A wardrobe saved on /admin/nina thirty seconds ago is in this prompt."*
   - `buildNinaImagePrompt({ purpose: 'selfie', scene, mood, tuning })` (`:101`)
   - `openNinaImageJob(userId, args)` (`:103`) — one `nina_turns` row, `kind = 'image'`,
     `status = 'pending'`, `error_code = 'queued'`, and the whole `NinaImageJobArgs` in `args` jsonb
   - `fireNinaImageGeneration(...)` (`:127`) — schedules `runNinaImageJob` in `after()`
   - returns `{ ok: true, jobId, state: 'dispatched' }` **without waiting**

2. **`buildNinaImagePrompt(input)`** — `lib/nina/imagegen.ts:130`
   - **Input:** `{ purpose, scene, mood?, tuning? }`
   - **Transform:** joins a `string[]` with `'\n'`, in this fixed order:

     | # | Part | Source | Conditional? |
     |---|---|---|---|
     | 1 | style block | `NINA_AVATAR_STYLE` if `purpose === 'avatar'`, else `NINA_SELFIE_STYLE` | no |
     | 2 | `''` | — | no |
     | 3 | `'SUBJECT:'` | literal | no |
     | 4 | subject prose | `NINA_APPEARANCE` when `tuning == null`, else `ninaAppearance(tuning)` | no |
     | 5 | `POSE AND PRESENCE: …` | `ninaPhotoPresence(purpose, tuning)` | only when non-null |
     | 6 | `SCENE: …` | `input.scene.trim()` | no |
     | 7 | `EXPRESSION AND ENERGY: …` | `input.mood?.trim()` | only when non-empty |

   - **Output:** the exact string in the user's paste.
   - **Guarantee under test:** `tests/nina.imagerecipe.test.ts` asserts that `tuning == null` and
     `tuning === NINA_TUNING_DEFAULTS` produce the *same* string, character for character. Anything
     added unconditionally (R1) breaks that assertion by design, and the test is the place to
     re-state the new contract rather than to delete.

3. **`ninaAppearance(tuning)`** — `lib/nina/persona.ts:379`
   - `tuning.wardrobe.trim()`; empty → returns `NINA_APPEARANCE` (`NINA_FACE` + blank line +
     `NINA_DEFAULT_OUTFIT`)
   - non-empty → `NINA_FACE` + blank line + `Her outfit for this photograph: ${wardrobe} She still
     has the black digital watch on her left wrist unless the outfit says otherwise. Her home ground
     is a red 400 m athletics track beside a green field, in flat morning sun.`
   - **This is the only operator-controlled text in the whole image prompt today**, and it is one
     line capped at `NINA_WARDROBE_MAX = 200` (`lib/nina/tuning.ts:689`).
   - The `${wardrobe} She still has` splice at `:387` is the missing-sentence-boundary defect.

4. **`ninaPhotoPresence(purpose, tuning)`** — `lib/nina/imagegen.ts:100`
   - `isDialHigh(v) = ninaBand(v).index >= 3` (`imagegen.ts:82`) — i.e. score ≥ 60
   - `steamy` high **and** `purpose === 'selfie'` → the "weight on one hip" clause
   - `flirty` high → the "straight down the lens" clause
   - both null/low → returns `null` and the block is omitted entirely

5. **`runNinaImageJob` → `attemptOnce`** — `lib/nina/imagerun.ts:315`
   - `claimNinaImageJob` → `{ args, attempts }`
   - **`callNinaImageModel(args.prompt, args.seed)`** — `lib/nina/imagecall.ts:70`
   - success → `storeNinaImage` → `finishSelfie` or `finishAvatar`
   - failure → `closeFailed`: requeue while `attempts < NINA_IMAGE_MAX_ATTEMPTS (2)`, else
     `failNinaImageJob` (terminal + her apology)

6. **`callNinaImageModel(prompt, seed)`** — `lib/nina/imagecall.ts:70`
   - `ninaEnv().OPENROUTER_API_KEY`, read inside the function inside a `try`
   - `POST` `OPENROUTER_IMAGE_URL` with `buildImageRequestBody({ prompt, seed })`
   - `signal: AbortSignal.timeout(NINA_IMAGE_CALL_TIMEOUT_MS)` — **150 s**
   - parses `data[0].b64_json`; a 200 with no image is classified, not crashed
   - **never throws**; every failure is a `NinaImageFailure`

7. **`buildImageRequestBody({ prompt, seed })`** — `lib/nina/imagerecipe.ts:262`
   - returns exactly `{ model, prompt, resolution, aspect_ratio, n: 1, seed }`
   - **has no reference parameter, deliberately** (RU-18). This is the single function both hosts
     call, so R10's plumbing is one signature change with two call sites.

8. **`classifyImageFailure(...)`** — `lib/nina/imagefail.ts`
   - `NINA_IMAGE_FAILURES = ['timeout', 'policy', 'transport', 'stale']` (`:41`)
   - HTTP status → `policy` at `:76`; a 200 whose body matches `POLICY_BODY_RE` → `policy` at `:84`
   - **This is R11's answer already computed.** What is missing is a surface that shows it: the
     `policy` string is written to `nina_turns.error_code` and turned into an in-character apology
     for the runner, and nothing reports the raw classification to an operator.

### Data Persistence

**`nina_turns`** — the job row.
`kind = 'image'`, `status ∈ {pending, ok, failed}`, `error_code` doubles as the job phase while
pending (`queued` / `dispatched` / `running`) and as the failure kind when failed, and `args` holds
`NinaImageJobArgs` (`lib/db/schema.ts`, the `args` docstring). `tuning_revision` stamps
`nina_tuning.revision` at call time.

**`NinaImageJobArgs`** — `lib/nina/imagerecipe.ts:294-311`:
```
{ purpose, scene, mood, prompt, seed, replyToId, source, attempts, sidecar }
```
`prompt` is fully assembled on Vercel and stored verbatim, which is what lets the worker stay
persona-free and a retry reproduce the same photograph.

**`nina_tuning`** — one row per user, `user_id` primary key.
12 trait columns, 4 dial columns, 17 `*_enabled` booleans, `relationship`, **`wardrobe text NOT NULL`**,
`notes text NOT NULL`, `revision`, `updated_at`. No `jsonb`. The header's rule is one column per
parameter, argued at `:1825-1840`: *"a misspelt key in a blob is indistinguishable from an unset
one"*.

**`nina_message_images`** — `lib/db/schema.ts:1590`.
`message_id text NOT NULL` → `nina_messages.id` `ON DELETE CASCADE`; `kind ∈ {upload, generated}`;
`blob_url`, `pathname`, `width`, `height`, `bytes`, `description`, `prompt`, `sort_order`,
`created_at`. **No `thumb_url`** — so any grid over this table loads originals.
Indexes: `(message_id)`, `(user_id, created_at desc)`.

**`nina_avatars`** — the album. Has `folder`, `filename`, `thumb_url`, `thumb_pathname`,
`source`, crop columns, `is_current` (partial unique index), `announced_at`, `source_key` (unique).

**Blob** — `ninaImagePathname(userId, purpose, id)` = `nina/<userId>/<purpose>-<id>.png`
(`imagerecipe.ts:250`), `addRandomSuffix: true`, one-year cache.

### Exit Points

- **Chat selfie success:** `finishSelfie` (`imagerun.ts:167`) resolves the reply-to message's
  session, inserts one `nina_messages` row with `ninaImageCaption(jobId)` as the body, then one
  `nina_message_images` row with `kind: 'generated'`, `description: args.scene`,
  `prompt: args.sidecar`. **This row IS a chat photo** — `/admin/photos` lists exactly this set.
- **Avatar success:** `finishAvatar` (`imagerun.ts:303`) → `insertNinaAvatarAsCurrent`, leaves
  `announced_at` NULL, writes no message.
- **Failure:** `failNinaImageJob` → terminal `nina_turns` row + her apology message (selfie only).
- **Admin add:** `addChatPhotoAction` (`lib/admin/chatPhotoActions.ts:175`) mints the same
  message+image pair from an uploaded file, and **undoes the message if the image insert returns
  `[]`** — the pattern any new writer of this pair must copy.

### State Changes

| Write | Table / store | Where |
|---|---|---|
| job row | `nina_turns` | `openNinaImageJob` — `imagejobs.ts:102` |
| claim / requeue / complete / fail | `nina_turns` | `imagejobs.ts:283,362,396,485` |
| bytes | Vercel Blob | `storeNinaImage` — `imagerun.ts` |
| caption bubble | `nina_messages` | `finishSelfie`, `addChatPhotoAction` |
| chat photo | `nina_message_images` | same two |
| avatar | `nina_avatars` | `finishAvatar`, `registerNinaAvatarsAction` |
| tuning | `nina_tuning` | `writeNinaTuning` — bumps `revision` inside the upsert |

---

## Key Data Structures

### `NinaImageJobArgs`
**Location:** `lib/nina/imagerecipe.ts:294`
**Fields:** `purpose: 'selfie'|'avatar'`, `scene: string`, `mood: string|null`, `prompt: string`,
`seed: number`, `replyToId: string|null`, `source: 'chat'|'generated'|'admin'`, `attempts: number`,
`sidecar: string`
**Used In:** `openNinaImageJob`, `claimNinaImageJob`, `attemptOnce`, `finishSelfie`, `finishAvatar`,
`closeFailed`, and `scripts/nina-image-worker.ts` (relative import, `:81`)
**Note:** `source: 'admin'` already exists and is already used (`lib/admin/ninaAlbumActions.ts:482`
for album rows), so an admin-initiated generation has a provenance value waiting for it.

### `NinaTuning`
**Location:** `lib/nina/tuning.ts:755-770`
**Fields:** `traits: Readonly<Record<NinaTrait, number>>`, `dials`, `enabled`, `relationship`,
**`wardrobe: string`** (`''` is the one empty value, never null), `notes: string`, `revision: number`
**Used In:** `buildNinaSystemPrompt`, `buildNinaImagePrompt`, `ninaAppearance`, `toTuningDraft`,
`writeNinaTuning`
**Note:** `NINA_TUNING_DEFAULTS.wardrobe === ''` and `tests/nina.tuning.test.ts:403` asserts it.

### `NinaImageCallResult`
**Location:** `lib/nina/imagecall.ts:60-68`
**Fields:** `{ ok: true, b64, costMicroUsd, latencyMs }` | `{ ok: false, kind: NinaImageFailure,
latencyMs, costMicroUsd: number|null, detail: string }`
**Note:** `kind === 'policy'` is precisely R11's answer, and `detail` (never rendered today, log
only) is the provider's own refusal text.

### `NinaAvatarRow` / `ChatPhoto`
**Locations:** `lib/nina/queries.ts:321`, `components/admin/chatPhotoModel.ts`
**Note:** the album has `thumbUrl`, the chat set does not. A grid over both (R10) must accept a
nullable thumbnail and fall back to the original.

### `TuningDraft`
**Location:** `lib/admin/tuningModel.ts`
**Fields:** `{ traits, dials, enabled, relationship, wardrobe, notes }`
**Note:** the one adaptation seam between the row and the client. R3 removes a member of it.

---

## Dependencies

### Configuration / Environment

- `OPENROUTER_API_KEY` — `ninaEnv()`, a lazy Zod group read **inside** the call function.
  `ci:openrouter-guard` (`scripts/check-openrouter-boundary.mjs`) permits the literal only under
  `lib/nina/` and `lib/env.ts` (RU-2).
- `BLOB_READ_WRITE_TOKEN` — `@vercel/blob` `put`.
- `DATABASE_URL_UNPOOLED` — drizzle-kit only; `drizzle.config.ts` refuses a pooled host.
- Segment config: `export const maxDuration = 300` on `app/nina/page.tsx:145` and
  `app/api/cron/nina/route.ts:68`, spelled as literals because segment exports are statically
  analysed. **No `/admin/*` segment declares one**, so every admin page and every Server Action
  under it runs on the platform default.

### External Services

- **OpenRouter** `POST /api/v1/images/generations`, model `qwen/qwen-image-3-pro`, synchronous.
  `resolution: '1K'`, `aspect_ratio: '3:4'` → 768×1024 PNG, ~$0.040, 78.2 s measured unanchored /
  148.9 s anchored. **There is no async image job API** — `imagecall.ts:16-31` records the check.
- **Vercel Blob** — immutable objects with a random suffix.
- **GitHub Actions** — `.github/workflows/nina-image.yml`, the demoted backstop. Measured
  `schedule:` gaps of 1 h 46 m to 4 h 19 m.

### CI guards that constrain the implementation

| Script | What it forbids |
|---|---|
| `ci:openrouter-guard` | the `OPENROUTER_API_KEY` literal outside `lib/nina/` + `lib/env.ts` |
| `ci:client-secret-guard` | its Rule 3 exempts only lines a comment scanner recognises — a JSX comment needs a leading `*` on every line |
| `ci:llm-payload-guard` | Rule 2 forbids awaiting a **model call** from a page render, by function name |
| `ci:data-layer-guard` | data-layer invariants over `lib/db` / `lib/nina/queries.ts` |

---

## Reference List

Every site that touches the two things being changed: the image prompt, and `nina_tuning.wardrobe`.

### The image prompt

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `NINA_SELFIE_STYLE` | `lib/nina/imagegen.ts:52` | def | `lib/nina` |
| `NINA_AVATAR_STYLE` | `lib/nina/imagegen.ts:60` | def | `lib/nina` |
| `isDialHigh` | `lib/nina/imagegen.ts:82` | def (private) | `lib/nina` |
| `ninaPhotoPresence` | `lib/nina/imagegen.ts:100` | def (private) | `lib/nina` |
| `buildNinaImagePrompt` | `lib/nina/imagegen.ts:130` | **def — gains every new parameter** | `lib/nina` |
| `sidecarText` | `lib/nina/imagegen.ts:163` | def | `lib/nina` |
| `buildNinaImagePrompt` | `lib/nina/selfiegen.ts:101` | call | `lib/nina` |
| `buildNinaImagePrompt` | `lib/nina/avatargen.ts` | call | `lib/nina` |
| `NINA_FACE` | `lib/nina/persona.ts:354` | def | `lib/nina` |
| `NINA_DEFAULT_OUTFIT` | `lib/nina/persona.ts:356` | def | `lib/nina` |
| `NINA_APPEARANCE` | `lib/nina/persona.ts:359` | def | `lib/nina` |
| `ninaAppearance` | `lib/nina/persona.ts:379` | **def — the wardrobe seam** | `lib/nina` |
| `buildImageRequestBody` | `lib/nina/imagerecipe.ts:262` | **def — gains the reference** | `lib/nina` |
| `buildImageRequestBody` | `lib/nina/imagecall.ts:110` | call | `lib/nina` |
| `buildImageRequestBody` | `scripts/nina-image-worker.ts:470` | call | `scripts` |
| `NinaImageJobArgs` | `lib/nina/imagerecipe.ts:294` | **def — gains the reference** | `lib/nina` |
| `NINA_IMAGE_CALL_TIMEOUT_MS` | `lib/nina/imagerecipe.ts:196` | def | `lib/nina` |
| `NINA_WORKER_CALL_TIMEOUT_MS` | `lib/nina/imagerecipe.ts:216` | def | `lib/nina` |
| `input_references` | `tools/gen_badge_art.py:352` | the one verified payload | `tools` |
| prompt assembly assertions | `tests/nina.imagerecipe.test.ts:100-215` | test | `tests` |

### `nina_tuning.wardrobe`

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `wardrobe: text(...)` | `lib/db/schema.ts:1804` | column def | `lib/db` |
| `NINA_WARDROBE_MAX` | `lib/nina/tuning.ts:689` | def | `lib/nina` |
| `coerceNinaWardrobe` | `lib/nina/tuning.ts:~703` | def | `lib/nina` |
| `NinaTuning.wardrobe` | `lib/nina/tuning.ts:762` | type member | `lib/nina` |
| `NINA_TUNING_DEFAULTS.wardrobe` | `lib/nina/tuning.ts:831` | def (`''`) | `lib/nina` |
| `coerceNinaTuning` | `lib/nina/tuning.ts:882` | call | `lib/nina` |
| `ninaAppearance` reader | `lib/nina/persona.ts:385` | read | `lib/nina` |
| `readNinaTuning` / `writeNinaTuning` | `lib/nina/queries.ts` | row ↔ model | `lib/nina` |
| `tuningFromRow` | `lib/nina/queries.ts:3017` | **row → model map — MISSED on the first pass, found by phase 7's re-grep; without it the removal does not compile** | `lib/nina` |
| `tuningToColumns` | `lib/nina/queries.ts:3067` | **model → row map — same; without it every tuning save breaks** | `lib/nina` |
| `TuningDraft.wardrobe` | `lib/admin/tuningModel.ts` | type member | `lib/admin` |
| `toTuningDraft` | `lib/admin/tuningModel.ts:~297` | map | `lib/admin` |
| `changedTuningFields` | `lib/admin/tuningModel.ts:~323` | compare | `lib/admin` |
| `ninaTuningWriteSchema.wardrobe` | `lib/admin/schema.ts:467` | Zod | `lib/admin` |
| `NINA_WARDROBE_MAX` import | `lib/admin/schema.ts:36` | import | `lib/admin` |
| `toTuningWrite` | `lib/admin/tuningActions.ts:85` | map | `lib/admin` |
| `saveNinaTuningAction({ wardrobe })` | `lib/admin/tuningActions.ts:~103` | param | `lib/admin` |
| the Wardrobe `<input>` | `components/admin/CharacterPanel.tsx:356-378` | **UI — R3 deletes this** | `components/admin` |
| `wardrobe: draft.wardrobe` | `components/admin/CharacterPanel.tsx:436` | save payload | `components/admin` |
| `NINA_WARDROBE_MAX` import | `components/admin/CharacterPanel.tsx:28` | import | `components/admin` |
| "the wardrobe the camera reads" copy | `app/admin/personality/page.tsx:88-90` | doc copy | `app/admin` |
| column-name assertions | `tests/db.schema.nina.test.ts:396,493` | test | `tests` |
| coercion / defaults | `tests/nina.tuning.test.ts:330,357,364,403,482` | test | `tests` |
| draft / schema | `tests/admin.tuning.test.ts:63,153,156,244-262` | test | `tests` |
| prompt assertions | `tests/nina.imagerecipe.test.ts:118,144,148,205` | test | `tests` |
| persona doc | `docs/nina/persona.md` | doc | `docs` |
| package readme | `lib/db/.workflows/package_readme.md` | doc — also missed on the first pass | `lib/db` |
| package readme | `lib/admin/.workflows/package_readme.md` | doc — also missed on the first pass | `lib/admin` |
| changelog line | `CHANGELOG.md:19` | doc | root |

### The admin shell

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `LINKS` (5 cells) | `components/admin/AdminNav.tsx:75-104` | **def — gains a sixth** | `components/admin` |
| `grid h-14 … grid-cols-5` | `components/admin/AdminNav.tsx:~120` | class | `components/admin` |
| `pb-[calc(5rem+var(--safe-bottom))]` | `app/admin/layout.tsx:~176` | class | `app/admin` |
| 5-cell / 8-char / height assertions | `tests/admin.shell.test.ts:115-128,173-186` | test | `tests` |
| hub cards | `app/admin/page.tsx:80+` | UI | `app/admin` |

---

## Impact Points (files that WILL need changes)

1. `lib/db/schema.ts` — the new `nina_image_prefs` table; later the `nina_tuning.wardrobe` drop. **P1, P7**
2. `drizzle/00NN_*.sql` — the add-only migration, then the drop migration. Regenerate, never rename (a renamed file keeps its old `when` and falls below the watermark). **P1, P7**
3. `lib/nina/imageprefs.ts` *(new)* — the vocabulary: focus keys, the prompt-length ladder, bounds, defaults, coercion. Zero-import, like `tuning.ts`. **P1**
4. `lib/nina/queries.ts` — `readNinaImagePrefs` / `writeNinaImagePrefs`; the union read behind the picker. **P1**
5. `lib/nina/persona.ts` — the body canon (R1), the reordered subject paragraph, `ninaAppearance` re-pointed at the prefs, the `${wardrobe} She still has` splice fixed. **P2, P7**
6. `lib/nina/imagegen.ts` — `buildNinaImagePrompt` takes prefs and grows the length ladder, the focus clauses, `VENUE`, `TIME`, `NOTES`. **P2**
7. `lib/nina/selfiegen.ts`, `lib/nina/avatargen.ts` — read the prefs beside the tuning and pass them. **P2**
8. `lib/nina/imagerecipe.ts` — `buildImageRequestBody` gains the reference; `NinaImageJobArgs` gains `referenceUrl`; the anchored call timeout and the re-derived threshold chain. **P3**
9. `lib/nina/imagecall.ts` — fetch the reference bytes, pass them, use the anchored timeout. **P3**
10. `scripts/nina-image-worker.ts` — the same at the second host. **P3**
11. `components/admin/AdminNav.tsx` — the sixth cell and the 3×2 phone grid. **P4**
12. `app/admin/layout.tsx` — the bottom reserve, paired with the nav's new height. **P4**
13. `app/admin/image-generation/page.tsx` *(new)* — the route. **P4**
14. `components/admin/ImageGenPanel.tsx` *(new)* — the form, with the picker seam. **P4**, wired **P5**
15. `lib/admin/imageGenModel.ts` *(new)* — the draft type and the copy accessors. **P4**
16. `lib/admin/schema.ts` — the Zod boundary for the prefs; later the wardrobe removal. **P4, P7**
17. `lib/admin/imageGenActions.ts` *(new)* — save, reset, and the test dispatch. **P4, P6**
18. `components/admin/PhotoReferencePicker.tsx` *(new)* — the caption-less iOS-style grid. **P5**
19. `lib/nina/imagetest.ts` *(new)* — the admin test dispatch, `selfiegen.ts`'s sibling. **P6**
20. `components/admin/ImageGenTestPanel.tsx` *(new)* — the button, the assembled-prompt preview, the verdict. **P6**
21. `components/admin/CharacterPanel.tsx` — the Wardrobe field deleted. **P7**
22. `lib/admin/tuningModel.ts`, `lib/admin/tuningActions.ts` — `wardrobe` out of the draft and the write. **P7**
23. `app/admin/personality/page.tsx` — the header copy loses "the wardrobe the camera reads". **P7**
24. `app/admin/page.tsx` — a hub card for the new surface. **P4**
25. `lib/nina/tuning.ts` — `NinaTuning.wardrobe`, `NINA_WARDROBE_MAX`, `coerceNinaWardrobe`, the default. **P7**
26. Tests: `nina.imagerecipe`, `nina.imageprefs` *(new)*, `admin.imagegen` *(new)*, `admin.shell`, `admin.tuning`, `nina.tuning`, `db.schema.nina`. **all phases**
27. `docs/nina/persona.md`, `CHANGELOG.md`, `lib/nina/.workflows/package_readme.md`, `components/admin/.workflows/package_readme.md`. **P7**

**This document describes. The plan files prescribe.**
