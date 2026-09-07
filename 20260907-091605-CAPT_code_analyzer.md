# Code Analysis: Nina's photo captions (`addChatPhotoAction` / `finishSelfie`)

**Type:** Bug Investigation
**Date:** 2026-09-07 09:16:05 +07
**Session ID:** 20260907-091605-CAPT
**Plan:** `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (4 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-photo-caption-from-image` — branch `feature/nina-photo-caption-from-image`, base `origin/main` @ `f839116`

---

## User Input

### Original User Request

> nina have successfully send a new chat to user everytime i uploaded an image into Chat photos
> collection (this is correct) . but , nina is not really understanding the context of the image.
> this photo is nina in a swimsuit diving. but she said "ini gw abis lari tadi". can we make llm
> understand multi modal? this is ruining user experience

### User-Provided Context

A screenshot of `runins.site/nina`. The last bubble is one of hers: an underwater photograph of a
woman in a swimsuit and fins, mask and snorkel, over a coral reef — and under it the text
**`ini gw abis lari tadi`** ("this is me after my run just now").

The bubbles above it establish that the conversation at that moment is about a photo *request*, not
about a run: *"coba foto lagi yang, tapi kamu pake g string…"*, *"okee ini deal terakhir yaa…habis
itu aku kirimin foto sesuka lo"*.

### User-Provided Files

None marked `@`. Every file below was reached from the reported behaviour.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | When a photo is added to the Chat photos collection, the chat message Nina sends with it must say something true about *that photograph* — not a canned line that contradicts it. |
| R2 | "can we make llm understand multi modal?" — the general capability: a photo Nina posts is captioned from what is actually in the picture, on **every** path that posts one, not only the admin one. |

**R2 is an inference and is marked as such.** The user reported one instance (the admin upload) and
then asked a broader question. The broader question is a real second deliverable because the caption
on the *generated-selfie* path comes from the same function and is wrong in the same way — see
"Impact Points". R1 can ship without R2; R2 cannot be reached by fixing only the admin path.

---

## Detailed Requirements Understanding

**Problem statement.** `ini gw abis lari tadi` is not a model output. It is element index 2 of a
five-element hard-coded array, `NINA_IMAGE_CAPTIONS` in `lib/nina/imagefail.ts:144-150`, selected by
`pickLine` — a 32-bit FNV-1a hash of a nanoid, modulo 5. **No model, no image, and no prompt is
involved in producing the caption at all.** The photograph's pixels have never reached any model by
the time that text is written.

The multimodal capability the user is asking for **already exists and already ran on this photo**:
`describeNinaImages` (`lib/nina/vision.ts`) posts the image to `glm-4.6v` and gets a paragraph back.
On the admin add path it is scheduled by `scheduleChatPhotoDescribe` inside `after()`
(`lib/admin/chatPhotoActions.ts:386-401`) and its result is written to
`nina_message_images.description` — a **private** column which, on this path, **nothing reads**
(see "The description on this path has no reader" below). It is never consulted when the caption bubble is written, because
the bubble is written first, in the request itself, from the canned array.

So the defect is not "the LLM cannot see images". It is that **the one text the runner reads is the
only text on this path that no model ever writes.**

Two further facts constrain the fix, and both were measured in the code rather than assumed:

1. **The existing describe prompt is written about the *runner*, not about Nina.**
   `NINA_DESCRIBE_SYSTEM_PROMPT` (`lib/nina/prompts/describe.ts`) opens *"You are the eyes of
   someone's close friend"* and its notice list is *"The state of **him**. Drenched or dry…"*, with
   rule 6 *"'Him' for whoever is clearly the runner"*. Pointed at a photo **of Nina**, that prompt
   is describing the wrong person to the wrong audience. A caption for her own photograph needs a
   second, self-subject witness prompt.
2. **The caption text is load-bearing as an identifier.** `isNinaPhotoCarrierMessage`
   (`lib/admin/chatPhotos.ts:274-275`) is `role === 'nina' && NINA_IMAGE_CAPTIONS.includes(body)`,
   and `removeChatPhotoAction` uses it to decide whether removing the last photo should delete the
   message too. Its own docstring states why the caption clause exists: *"`role === 'nina'` ALONE
   would delete a real sentence of hers the day some later path attaches a photograph to one."*
   **A free-text caption makes that predicate return `false`, and Remove then leaves exactly the
   empty caption bubble the predicate exists to prevent.** Any fix that frees the caption must
   replace the closed-set test with a structural marker first.

**Success criteria.**
- No photo Nina posts is ever captioned with a sentence that asserts a scene the picture does not
  show. (This is achievable *without any model call*, and phase 1 achieves it: the only
  scene-asserting member of the five-string pool is removed from the pool.)
- On the admin add path, the bubble's text is derived from `glm-4.6v`'s reading of that specific
  photograph, in Nina's voice, within ~30 s of the upload.
- On the generated-selfie path, the bubble's text is derived from the scene *she asked for*, which
  is already in hand as `args.scene` and needs no vision call.
- Removing the last photo from a message still deletes the message, with a free-text caption.
- A failed model call degrades to a scene-agnostic canned line and never to an invented scene, and
  never blocks the upload.

**Key considerations / assumptions.**
- `scripts/nina-image-worker.ts` — the GitHub-runner backstop that posts a selfie when the Vercel
  invocation could not — **has no z.ai key and cannot import `@/`** (`lib/nina/imagefail.ts:6-14`,
  and that file's whole "must never import anything" header). It therefore cannot make a caption
  call, and on that path the canned line is the correct and final answer. This asymmetry is
  deliberate and is stated in the plan rather than papered over.
- Server Actions are dispatched one at a time per client (Next 16 Server Actions guide, quoted at
  `lib/nina/actions.ts:1201-1206`), so an *awaited* describe+caption would add ~15-25 s to **every**
  admin add, in series. The existing code already refuses that trade for the describe call alone
  (`scheduleChatPhotoDescribe`'s "WHY `after()` AND NOT `await`"), and this analysis inherits it.
- `NINA_MESSAGE_SOURCE` is a plain `text` column with a TS union and no DB enum or check constraint
  (`lib/db/schema.ts:877`), and only one query anywhere compares it
  (`lib/nina/queries.ts:1407`, `= 'run_committed'`). Widening it needs no migration. It is
  nonetheless **not** the marker chosen — see the plan's Decisions.

---

## Analysis Scope

### Explicitly Mentioned Files

None.

### Discovered Related Files

- `lib/nina/imagefail.ts` — `NINA_IMAGE_CAPTIONS`, `pickLine`, `ninaImageCaption`. The defect.
- `lib/admin/chatPhotoActions.ts` — `addChatPhotoAction` (writes the caption), `replaceChatPhotoAction`, `removeChatPhotoAction`, `scheduleChatPhotoDescribe`.
- `lib/admin/chatPhotos.ts` — `isNinaPhotoCarrierMessage`, `ADMIN_CHAT_PHOTOS_PATH`.
- `lib/nina/vision.ts` — `describeNinaImages`, the token-floor guard, `toDataUri`.
- `lib/nina/prompts/describe.ts` — `NINA_DESCRIBE_SYSTEM_PROMPT`, `NINA_DESCRIPTION_UNAVAILABLE`, `buildDescribeUserContent`.
- `lib/nina/imagerun.ts:169-220` — `finishSelfie`, the second `ninaImageCaption` caller.
- `scripts/nina-image-worker.ts:679` — the third, on a runner with no key.
- `lib/nina/queries.ts` — `insertNinaMessages` (:1178), `updateNinaMessage` (:1332), `getNinaMessageImage`, `setNinaMessageImageDescription` (:1811), `listNinaChatPhotos` (:1574), `readNinaTuning` (:~2990).
- `lib/nina/autotitle.ts` — the closest precedent for a small, non-blocking, forced-tool `glm-5.3` call that returns one short string and degrades to silence.
- `lib/nina/title.ts` — its pure half: system prompt, tool schema, `parseNinaTitle`, sanitiser.
- `lib/nina/persona.ts` — `JAKARTA_REGISTER`, `JAKARTA_SLANG_BLOCK`, `VOICE_EXAMPLES_BLOCK`, `ninaNeverSayBlock`, `ninaManjaRegisterBlock`, `ninaGirlfriendVoiceBlock`, and the `NinaTuning`-shaped builders.
- `lib/nina/tuning.ts`, `lib/nina/selfiegen.ts` — how a non-turn path reads the live tuning (`readNinaTuning`) before building a prompt.
- `lib/llm/client.ts` — `narrativeClient()`, `narrativeModel()`.
- `scripts/check-llm-payload-boundary.mjs` — the eight-entry `GUARDED_CALLS` table that confines every model-call entry point.
- `lib/db/schema.ts:821-1004` — `nina_messages`, `nina_message_images`.
- `app/admin/photos/page.tsx`, `components/admin/ChatPhotoAdd.tsx` — the surface the operator uses.

---

## Current Dataflow

### Entry Point: `addChatPhotoAction` — the reported path

**Location:** `lib/admin/chatPhotoActions.ts:175` (`'use server'`)
**Trigger:** the operator picks a file in `components/admin/ChatPhotoAdd.tsx` on `/admin/photos`.
The browser PUTs the bytes straight to Blob via `/api/admin/nina/upload`; the action never sees
bytes (Server Action bodies are capped at 1 MB).
**Input schema:** `{ blobUrl, pathname, width, height, bytes }` via `chatPhotoAddSchema`.
**Validation:** `requireAdmin()` first, above any use of an argument; then Zod; then
`isAdminChatPhotoPathname(pathname, userId)`.

**Transform chain, in order:**

1. `resolveNinaWriteSession(userId)` → the session the bubble lands in.
2. `insertNinaMessages(userId, [{ role: 'nina', body: ninaImageCaption(newId()), source: 'chat',
   turnId: null, replyToId: null, runId: null }], sessionId)`
   — **`lib/admin/chatPhotoActions.ts:193` is the defect.** `newId()` is a fresh nanoid, so
   `pickLine` hashes it mod 5 and returns one of five fixed sentences. One of the five,
   index 2, is `'ini gw abis lari tadi'`.
3. `insertNinaMessageImages(userId, [{ messageId, kind: 'generated', blobUrl, pathname, width,
   height, bytes, description: null, prompt: null, sortOrder: 0 }])`
   — `description: null`. Nothing has looked at the picture yet.
   `[]` back is treated as failure: the message is deleted and the blob released.
4. `scheduleChatPhotoDescribe(userId, image.id)` — schedules, does not await.
5. `revalidatePath('/admin/photos')`, return `{ ok: true, id }`.

**Exit points.** The bubble is on the runner's screen as soon as `/nina` next renders (server
component reading stored messages; `lib/nina/live.ts`'s service-worker refresh can pull it in
sooner). **No Web Push is sent on this path** — `sendNinaPush` has exactly two callers,
`lib/nina/proactive.ts` and `lib/push/actions.ts`, and neither is reachable from here. So the wrong
caption is a screen state only, never a notification.

**The `after()` tail:** `scheduleChatPhotoDescribe` (`:386`) re-reads the row inside the callback,
skips if `description != null`, calls `describeNinaImages([{ blobUrl, pathname }])`, and writes the
paragraph with `setNinaMessageImageDescription`. On failure it logs a warning and leaves NULL. **It
never touches `nina_messages.text`.**

#### The description on this path has no reader

`lib/admin/chatPhotoActions.ts:379-383` and `lib/nina/queries.ts:1651-1653` both state that
`description` reaches Nina through `MessageInput.imageDescriptions`. **It does not, for a photograph
in the conversation window.** `dbNinaSourceGateway`'s `readConversation`
(`lib/nina/gateway.ts:154-165`) maps every window row with a literal `imageDescriptions: []`, under a
comment reading *"Phase 6 populates this from `nina_message_images.description`"* — and phase 6
populated the **send** path instead (`lib/nina/actions.ts:634`, built from that turn's verified
ticket claims, for images *he* just attached).

So today the vision pass on the admin add path writes a paragraph that has exactly one consumer:
`/admin`'s own detail panel (`components/admin/ChatPhotoDetail.tsx`). Nina never sees it, in that
turn or any later one. This is an observation about the code as it stands, not a defect this plan
was asked to fix — but it is the reason the caption cannot be left to be repaired "later, from her
context": there is no later, and no context.

### Entry Point: `describeNinaImages` — the multimodal capability that already exists

**Location:** `lib/nina/vision.ts:275`
**Shape:** one `fetch` to `${LLM_VISION_BASE_URL}/chat/completions`, model `LLM_VISION_MODEL`
(`glm-4.6v`), OpenAI-envelope `image_url` parts carrying a **base64 data URI** (never the hosted
Blob URL — `toDataUri`, `:241`), `thinking: { type: 'disabled' }`, `max_tokens: 500`, 25 s timeout.
**Guard:** the text-aware token floor — `estimateTextTokens(textChars) + 500 * imageCount`, checked
**above every read of `choices`**, throwing `NinaVisionTokenFloorError`. This is the layer that stops
an invented description from ever being believed, and nothing in this plan may move or weaken it.
**Prompt:** `NINA_DESCRIBE_SYSTEM_PROMPT` — runner-subject, as analysed above.
**Existing callers:** `lib/nina/actions.ts:1253` (`describeNinaImage`, the composer pre-pass),
`lib/admin/chatPhotoActions.ts:391`, `lib/admin/ninaAlbumActions.ts:118` and `:313` (avatars).

### Entry Point: `finishSelfie` — the same defect, second host

**Location:** `lib/nina/imagerun.ts:169`
**Trigger:** `runNinaImageJob`, inside `after()`, ~80-120 s after `generateNinaSelfie` dispatched.
**Transform:** resolves the quote target and session, then
`insertNinaMessages(… body: ninaImageCaption(jobId) …)` at **`:189`** — the same five strings, this
time seeded deterministically by the job id — and an image row whose `description` is
**`args.scene`**, the scene *she asked for* through the `generate_image` tool. So on this path the
truth about the picture is already in hand, in the same function, one field away from the caption,
and the caption still ignores it. Its own docstring says why no vision pass runs here: *"we wrote
the picture, so paying a vision call to be told back our own prompt would be absurd."* Correct — and
it means R2's fix on this path is a **text-only** call, not a vision one.

### Entry Point: `scripts/nina-image-worker.ts:679`

Raw SQL `INSERT` with `${ninaImageCaption(jobId)}`, run on a GitHub runner under
`node --experimental-strip-types`. `lib/nina/imagefail.ts` is imported **by relative path** and that
file's header forbids it from ever importing anything, because the `@/` alias cannot be resolved
there. The runner also has no z.ai key. **This host can never make a caption call.**

### Data Persistence

**`nina_messages`** (`lib/db/schema.ts:821`): `id`, `seq` (bigserial, the total order, never
rewritten), `user_id`, `session_id` (NOT NULL, cascade), `role` (`'runner' | 'nina'`),
`text` (NOT NULL — *"Her words or his, verbatim. Never a template, never a rendered number"*),
`source` (plain `text` + TS union, default `'chat'`), `turn_id` (plain column, no FK),
`reply_to_id` (self-FK, `ON DELETE SET NULL`), `run_id`, `sent_at`, `delivered_at`, `read_at`.

**`nina_message_images`** (`:970`): `message_id` (`ON DELETE CASCADE` — *"an image with no message is
nothing"*), `kind` (`'upload'` = his, `'generated'` = hers), `blob_url`, `pathname`, `width`,
`height`, `bytes`, **`description`** (glm-4.6v's private prose; *"Phase 6 writes it"*), `prompt`
(generated only), `sort_order`.

**The write that R1 needs already exists.** `updateNinaMessage(userId, id, body)`
(`lib/nina/queries.ts:1332`) sets `text` only, owner-scoped, and its docstring enumerates what it
deliberately does not touch: `seq` (invariant 6 — *"Rewriting a bubble is not re-sending it"*),
`sent_at` (day dividers and `daysAgo`), `read_at` (*"an edit to one of her messages is not a new
unread message"*), `turn_id`. That is exactly the semantics a late caption needs. No new query.

### Exit Points

- `/admin/photos` re-renders (`revalidatePath`).
- `/nina` renders stored messages; `lib/nina/live.ts` merges a service-worker refresh.
- The collection page is `listNinaChatPhotos` (`lib/nina/queries.ts:1574`), scoped by
  `generatedChatPhotoScope` — i.e. **every `kind='generated'` row, whoever wrote it**. So
  `removeChatPhotoAction` operates on `finishSelfie`'s messages as well as admin-added ones, and the
  carrier marker must therefore be written by **both** paths and by the worker.

---

## Key Data Structures

### `NINA_IMAGE_CAPTIONS` — the defect, in five lines

**Location:** `lib/nina/imagefail.ts:144-150`
```ts
export const NINA_IMAGE_CAPTIONS: readonly string[] = [
  'nih',
  'nih, puas?',
  'ini gw abis lari tadi',   // <- index 2. the reported bubble.
  'foto gw. jangan di-zoom',
  'udah nih, jangan minta lagi',
]
```
**Used in:** `ninaImageCaption` (`:174`) ← `lib/admin/chatPhotoActions.ts:193`,
`lib/nina/imagerun.ts:189`, `scripts/nina-image-worker.ts:679`; and **as an identifier** in
`isNinaPhotoCarrierMessage` (`lib/admin/chatPhotos.ts:275`), pinned by
`tests/admin.chatPhotos.test.ts:192-209` and `tests/nina.imagefail.test.ts:158-159`.

Four of the five are scene-agnostic and true of any photograph. **Exactly one asserts a scene**, and
it is the one the user saw. That asymmetry is the cheapest half of the whole fix.

### `NinaDescribeResult` / `NinaVisionTokenFloorError`

**Location:** `lib/nina/vision.ts:105-116`, `:74`. The description plus `promptTokens`,
`completionTokens`, `floor`, `finishReason`. The error class carries the three numbers that prove
the image was dropped. Both are reused unchanged.

### `NinaTuning`

**Location:** `lib/nina/tuning.ts`. Read live, no cache, with `readNinaTuning(userId)` — the
precedent is `lib/nina/selfiegen.ts:79` (*"A wardrobe saved on /admin/nina thirty seconds ago is in
this prompt"*). Her voice is a function of it: `ninaManjaRegisterBlock`,
`ninaGirlfriendVoiceBlock`, `ninaNeverSayBlock`, `ninaEffectiveVerbosity`.

### The `autotitle.ts` call shape — the template for a caption call

`narrativeClient()` / `narrativeModel()`, forced `tool_choice`, `thinking: { type: 'disabled' }`
sent but not relied on, a **low** `max_tokens` (600) because output tokens are wall clock at
~26-33 ms each, a 12 s timeout, `findTitleBlock` **scanning** the content array because a thinking
block can arrive in front of the answer, `stop_reason === 'max_tokens'` treated as "no answer", and
`console.warn` + `null` on every failure — *"one call → parse → silence"*.

---

## Dependencies

### Configuration / Environment

- `LLM_VISION_BASE_URL`, `LLM_VISION_MODEL`, `LLM_API_KEY` — one z.ai key serves both endpoints
  (R-40); there is no `LLM_VISION_API_KEY`.
- `LLM_BASE_URL` / `LLM_MODEL` behind `narrativeClient()` / `narrativeModel()` (`glm-5.3`).
- `lib/env.ts` validates 14 variables **at module load**, so a fresh worktree needs `.env.local`
  before `npm run build` or any `db:*` script. Already written into this worktree.

### External Services

- z.ai `glm-4.6v` (vision) — ~8-11 s for ~220 output tokens; 25 s budget.
- z.ai `glm-5.3` (text) — 15 measured calls at 10.2-16.4 s for a five-field narrative; a
  one-sentence answer sits at the bottom of that range.
- Vercel Blob — `toDataUri` GETs the object back, 8 s budget.

### Guards that will fail the build if the plan is implemented carelessly

- `scripts/check-llm-payload-boundary.mjs` — a new model-call entry point with no `GUARDED_CALLS`
  entry is unguarded; a call from an unsanctioned file fails CI. **Owned by one phase.**
- `NINA_PROMPT_VERSION` (`lib/nina/prompts/index.ts:33`) — bump by hand in the same commit as any
  edit to the system text or a tool schema. The caption prompt is a **new, separate** surface;
  `describe.ts` sets the precedent that a non-Nina-voice prompt is deliberately *not* covered by
  that version, and the plan states which side of the line each new file falls on.
- `tests/__snapshots__/nina.prompts.test.ts.snap` — pins the default render of her system prompt.
  Nothing in this plan may change it.

---

## Reference List — every site that touches a photo caption

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `NINA_IMAGE_CAPTIONS` | `lib/nina/imagefail.ts:144` | def | `lib/nina` |
| `pickLine` | `lib/nina/imagefail.ts:160` | def | `lib/nina` |
| `ninaImageCaption` | `lib/nina/imagefail.ts:174` | def | `lib/nina` |
| `ninaImageCaption(newId())` | `lib/admin/chatPhotoActions.ts:193` | call — **the bug** | `lib/admin` |
| `ninaImageCaption(jobId)` | `lib/nina/imagerun.ts:189` | call | `lib/nina` |
| `ninaImageCaption(jobId)` | `scripts/nina-image-worker.ts:679` | call (no key, no `@/`) | `scripts` |
| `NINA_IMAGE_CAPTIONS.includes(body)` | `lib/admin/chatPhotos.ts:275` | impl — the carrier test | `lib/admin` |
| `isNinaPhotoCarrierMessage` | `lib/admin/chatPhotoActions.ts:282` | call | `lib/admin` |
| caption/carrier assertions | `tests/admin.chatPhotos.test.ts:192-209` | test | `tests` |
| caption non-empty assertions | `tests/nina.imagefail.test.ts:158-159` | test | `tests` |
| `describeNinaImages` | `lib/nina/vision.ts:275` | def | `lib/nina` |
| `NINA_DESCRIBE_SYSTEM_PROMPT` | `lib/nina/prompts/describe.ts:37` | def (runner-subject) | `lib/nina` |
| `buildDescribeUserContent` | `lib/nina/prompts/describe.ts:88` | def | `lib/nina` |
| `scheduleChatPhotoDescribe` | `lib/admin/chatPhotoActions.ts:386` | def | `lib/admin` |
| `setNinaMessageImageDescription` | `lib/nina/queries.ts:1811` | def | `lib/nina` |
| `updateNinaMessage` | `lib/nina/queries.ts:1332` | def — the late-caption write | `lib/nina` |
| `insertNinaMessages` | `lib/nina/queries.ts:1178` | def | `lib/nina` |
| `finishSelfie` | `lib/nina/imagerun.ts:169` | def | `lib/nina` |
| `args.scene` → `description` | `lib/nina/imagerun.ts:213` | data | `lib/nina` |
| `GUARDED_CALLS` | `scripts/check-llm-payload-boundary.mjs:93` | config | `scripts` |
| `NinaMessageSource` | `lib/db/schema.ts:705` | def | `lib/db` |
| `source = 'run_committed'` | `lib/nina/queries.ts:1407` | the only `source` comparison | `lib/nina` |
| `listNinaChatPhotos` | `lib/nina/queries.ts:1574` | def — collection = all `generated` | `lib/nina` |
| `readNinaTuning` | `lib/nina/queries.ts:3083` | def | `lib/nina` |
| `titleNinaSessionWith` | `lib/nina/autotitle.ts:127` | precedent for the call shape | `lib/nina` |

---

## Impact Points (files that WILL need changes)

1. `lib/nina/imagefail.ts` — split the pick pool from the historical set, so no canned line ever
   asserts a scene again. **Phase 1.** This alone removes the reported sentence.
2. `lib/nina/prompts/describe.ts` — a self-subject witness prompt; the shipped one describes *him*.
   **Phase 1.**
3. `lib/nina/vision.ts` — select the witness prompt by subject. The token floor is untouched.
   **Phase 1.**
4. `lib/nina/prompts/caption.ts` *(new)* — the caption prompt and tool schema. **Phase 1.**
5. `lib/nina/caption.ts` *(new)* — the `glm-5.3` caption call, `autotitle.ts`'s shape. **Phase 1.**
6. `scripts/check-llm-payload-boundary.mjs` — a ninth `GUARDED_CALLS` entry. **Phase 1.**
7. `lib/db/schema.ts` + a generated migration — the carrier marker. **Phase 2.**
8. `lib/admin/chatPhotos.ts` — `isNinaPhotoCarrierMessage` reads the marker. **Phase 2.**
9. `lib/nina/queries.ts` — `insertNinaMessages` carries the marker. **Phase 2.**
10. `scripts/nina-image-worker.ts` — sets the marker column in its raw INSERT (marker only; it can
    never caption). **Phase 2.**
11. `lib/admin/chatPhotoActions.ts` — describe(self) → caption → `updateNinaMessage`, in `after()`.
    **Phase 3.**
12. `lib/nina/imagerun.ts` — marker (**phase 2**); caption from `args.scene` (**phase 4**).
13. `tests/nina.imagefail.test.ts` (P1), `lib/nina/vision.test.ts` (P1),
    `tests/nina.caption.test.ts` *(new, P1)*, `tests/admin.chatPhotos.test.ts` (P2, then P3),
    `tests/nina.imagerun.test.ts` or equivalent (P4).

**This document describes. The plan files prescribe.**
