# Phase 6: Her eyes — vision pre-pass and chat images

**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R10 — the runner sends a photo with a caption, or a photo alone, and Nina answers
what is actually in the picture.
**Depends on:** Phase 1 (schema, `lib/nina/queries.ts`), Phase 3 (turn engine, `actions.ts`,
`NinaTurnInput.imageDescriptions`), Phase 4 (the chat screen, the composer, `ChatMessage`)
**Difficulty:** HARD
**Package:** `lib/nina`, `lib/photos`, `app/api/upload`, `components/nina`

---

## Goal

After this phase the composer has a picker. A picked photo is compressed in the browser, PUT
straight to Blob, and described by `glm-4.6v` in its **own** Server Action while the runner is
still typing his caption. The signed description then rides into `sendNinaMessage` and reaches
`glm-5.3` as text on `NinaTurnInput.imageDescriptions` — the seam phase 3 already built. A message
with no text at all is a valid send. `glm-5.3` is never handed an image block (invariant 5), and a
silently dropped image is caught by a **text-aware** token floor instead of being believed.

The one thing this phase is really about: **`glm-4.6v` is not an alt-text generator here.** It is a
second pair of eyes writing down what a friend would notice — drenched or dry, dark or daylight,
road or treadmill, grinning or dying, same shirt as last Tuesday — and never a number. A bland
description makes a bland Nina.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates — `lib/nina/images.ts`** (pure, zero imports, client- and server-importable — the
`lib/extract/constants.ts` rule, and for the same reason: the picker, the Route Handler, the
Server Action and the unit suite all read it):
`NINA_MAX_CHAT_IMAGES = 3`, `NINA_CHAT_TARGET_SHORT_EDGE_PX = 768`,
`NINA_CHAT_TARGET_QUALITY = 0.75`, `NINA_CHAT_TARGET_MAX_MB = 1`,
`NINA_CHAT_MAX_UPLOAD_BYTES = 900_000`, `NINA_CHAT_MAX_SOURCE_BYTES = 25 * 1024 * 1024`,
`NINA_CHAT_CONTENT_TYPE = 'image/jpeg'`, `NINA_CHAT_ALLOWED_CONTENT_TYPES`,
`NINA_BLOB_PREFIX = 'nina/'`, `NINA_CHAT_SEGMENT = 'chat'`, `NINA_CHAT_ID_RE`;
functions `ninaChatPathname(userId, id)`, `isNinaChatRequestPathname(pathname, userId)`,
`planNinaPicked(files, opts)`; types `NinaPickCandidate`, `NinaPickedPlan`, `NinaPickRejection`,
`NinaPickRejectionReason`.

**Provides — `NINA_BLOB_PREFIX = 'nina/'` is the ONE definition of the blob prefix in the whole
repo (ruling A6), and three later phases now consume it from here:**

- **Phase 12** deletes `NINA_BLOB_PREFIX` from `lib/nina/imagerecipe.ts`'s exports and spells the
  prefix **inline** inside `ninaImagePathname`, because `imagerecipe.ts` must keep its own
  zero-import property (the GitHub Actions worker imports it under
  `--experimental-strip-types`, and a cross-module extension-bearing import there is a needless
  risk). It adds one case to `tests/nina.imagerecipe.test.ts` asserting the two agree —
  `ninaImagePathname(u, 'selfie', id).startsWith(NINA_BLOB_PREFIX)` with `NINA_BLOB_PREFIX`
  imported from `@/lib/nina/images`. A test may import both; the worker's module may not.
- **Phase 14**'s `.mjs` script imports it by relative path, `'../lib/nina/images.ts'`, on the
  `scripts/backfill-record-keys.mjs:85` precedent (`--experimental-strip-types --no-warnings`,
  `package.json:30`), instead of re-declaring it.
- **Phase 15**'s `lib/admin/avatars.ts` imports this constant instead of declaring an
  `ADMIN_AVATAR_PREFIX` of its own.

**The consequence, and it is now a load-bearing property rather than a stylistic one:
`lib/nina/images.ts` must stay pure and zero-import forever.** It was written that way for this
phase's own four readers (a `'use client'` composer, a Route Handler, a Server Action, the node
test runner); it must *stay* that way because a Node `.mjs` script under
`--experimental-strip-types` and a worker-adjacent test now depend on it too. One
`import 'server-only'` or one `@/lib/env` read in this file breaks three hosts at once, and two of
them break at runtime rather than at `tsc`.

**Dependency edges this creates:** phase 12's `depends_on` gains **6**, phase 15's gains **6**, and
phase 13's already has it.

**Creates — `lib/nina/prompts/describe.ts`** (a **new file** in a directory phase 2 owns; **it
edits no phase-2 file and is not re-exported from `prompts/index.ts`**):
`NINA_DESCRIBE_SYSTEM_PROMPT`, `NINA_DESCRIBE_REQUEST_TEXT`, `NINA_DESCRIBE_REQUEST_TEXT_MANY`,
`buildDescribeUserContent(images)`, `NINA_DESCRIPTION_UNAVAILABLE`; types `NinaDescribeImage`,
`NinaVisionContentPart`.

**Creates — `lib/nina/vision.ts`** (`server-only`):
`describeNinaImages(images, opts)`, `describeNinaImagesWithFetch(fetchImpl, images, opts)`,
`describeTokenFloor(promptChars, imageCount)`, `estimateTextTokens(chars)`,
`NINA_TOKEN_FLOOR_PER_IMAGE = 500`, `NINA_DESCRIBE_CHARS_PER_TOKEN = 3`,
`NINA_DESCRIBE_MAX_TOKENS = 500`, `NINA_DESCRIBE_TIMEOUT_MS = 25_000`,
`NINA_BLOB_FETCH_TIMEOUT_MS = 8_000`, `NinaVisionTokenFloorError`, `NinaVisionTransportError`;
types `NinaDescribeResult`, `NinaDescribeOptions`, `NinaImageRef`.

**Creates — `lib/nina/imageTicket.ts`** (`server-only`; `node:crypto`):
`signNinaImageTicket(claims, secret)`, `verifyNinaImageTicket(ticket, expect, secret)`,
`NINA_TICKET_TTL_MS = 30 * 60 * 1000`, `NINA_TICKET_VERSION = 1`, `NINA_MAX_TICKET_CHARS = 4_000`;
types `NinaImageClaims`, `NinaTicketExpectation`, `NinaTicketVerdict`.

**Creates — `lib/photos/compressForNina.ts`** (`'use client'`):
`compressForNina(file, opts)`; type `CompressedNinaImage`.

**Creates — `components/nina/ChatImages.tsx`:** `ChatImages`.

**Creates — tests:** `lib/nina/images.test.ts`, `lib/nina/vision.test.ts`,
`lib/nina/imageTicket.test.ts`.

**Signature changes:**

- `sendNinaMessage` (`lib/nina/actions.ts`) — this phase adds exactly one optional field,
  `imageTickets?: readonly string[]`. Additive and optional, so phase 4's existing single call
  site compiles unchanged.

  **The ONE final signature (ruling B1), printed here so nobody rewrites the head four times.**
  Phase 3 creates it; phases 6, 7, 8 and 13 each add exactly one optional field, each in its own
  commit:

  ```ts
  // lib/nina/actions.ts — phase 3 creates it; 6, 7, 8 and 13 each add exactly one optional field.
  export async function sendNinaMessage(input: {
    body: string
    /** phase 6 — signed describe tickets for images already in Blob. */
    imageTickets?: readonly string[]
    /** phase 7 — a `nina_messages.id` this message answers. */
    replyToMessageId?: string | null
    /** phase 8 — a run pinned to this message. */
    runId?: string | null
    /** phase 13 — a blob the server already owns (R26). */
    attachExisting?: { kind: 'avatar' | 'image'; id: string } | null
  }): Promise<SendNinaMessageResult>
  ```

  **At THIS phase's landing the head carries `body` and `imageTickets` only.** `replyToMessageId`
  arrives with phase 7, `runId` with phase 8, `attachExisting` with phase 13.

  **The ONE final refusal rule (ruling B1).** An empty `body` is refused unless the message
  carries something else:

  ```ts
  const hasAttachment =
    (input.imageTickets?.length ?? 0) > 0 ||        // phase 6
    input.runId != null ||                           // phase 8
    input.attachExisting != null                     // phase 13
  if (input.body.trim() === '' && !hasAttachment) return refuse('empty')
  ```

  **The clause this phase adds is `(input.imageTickets?.length ?? 0) > 0`, and that clause is the
  behavioural point of the whole phase.** Phase 3 ships `body.trim() === ''` alone; after this
  phase an empty body is refused only when there is no image either. That is R10's "image alone" —
  he finishes a run, takes one selfie, sends it, says nothing — and it is the one behavioural edit
  this phase makes to a phase-3 file. The rule is monotone: each phase adds its own clause in its
  own commit, so the tree is green at every boundary and no phase rewrites another's condition.
- `Composer`'s `onSend` (`components/nina/Composer.tsx`) —
  `(body: string) => void | Promise<void>` becomes
  `(draft: { body: string; images: readonly ComposerDraftImage[] }) => void | Promise<void>`, and
  `Composer` gains a required `userId: string` prop. It also **exports a new type,
  `ComposerDraftImage`** (`{ ticket: string; url: string }`). `ChatScreen.handleSend` is the only
  call site.
- `ChatScreen` (`components/nina/ChatScreen.tsx`) gains a required `userId: string` prop, passed
  from `app/nina/page.tsx`, which already has it from `requireUserId()`. It is not a secret and
  not a capability: `/api/upload` re-derives the owner from the session and refuses any pathname
  that does not match it.
- `ChatMessage` (`components/nina/types.ts`) gains `imageUrls?: readonly string[]`. **Plural**,
  deliberately — phase 4's handoff note said `imageUrl`, but a message carries up to
  `NINA_MAX_CHAT_IMAGES`. Optional, so phases 7 and 8 widen the same type without collision.

  **Upheld (ruling E2b), against two competing declarations.** Phase 4's handoff note naming a
  singular `imageUrl` is corrected, and **phase 7's declaration of `imageUrl?: string | null` has
  been deleted from its plan** — phase 7 declares only `replyToId: string | null` on this type.
  So this field has exactly one author, and it is this phase.

  The knock-on, which is the reason the ruling bothered: phase 7's `quoteMediaOf` no longer reads
  a URL at all. It reads booleans the caller computes, and `MessageList` computes the image one as
  `hasImage: (m.imageUrls?.length ?? 0) > 0` — off *this* field, plural, from *this* phase. **No
  type crosses backwards from a later phase, and no later phase edits `lib/nina/reply.ts`.**
- `MessageList` (`components/nina/MessageList.tsx`) — no prop change; it starts passing
  `MessageBubble`'s existing `above` slot. **`MessageBubble.tsx` itself is not edited.**
- `app/api/upload/route.ts` — `POST` keeps its signature. `onBeforeGenerateToken` gains a second
  pathname branch. **`ClientPayload` is unchanged and `components/extract/UploadPicker.tsx` is not
  touched** — see the ruling in Step 5.

**Creates — `lib/nina/actions.ts` (added to a phase-3 file):**
`describeNinaImage`, `NinaDescribeImageInput`, `NinaDescribeImageResult`,
`NinaDescribeFailureReason`.

**Requires (from earlier phases):**

- **Phase 1** — `nina_message_images` exists with `{ id, user_id, message_id, kind, blob_url,
  pathname, width, height, bytes, description, prompt, sort_order, created_at }`, and
  `lib/nina/queries.ts` exports `insertNinaMessageImages(userId, rows: readonly NinaImageInsert[])`
  and `getNinaMessageImagesForMessages(userId, messageIds)` with the shapes at phase-1.md:1193 and
  :1624. `NinaImageKind` includes `'upload'`.
- **Phase 1** — `lib/nina/queries.ts`'s conversation read returns `imageDescriptions: string[]`
  per message (phase-3.md:98). **This phase writes the column that populates it**; nothing else is
  needed for the history half.
- **Phase 1** — `AUTH_SECRET` is already in `lib/env.ts`'s `authEnv()` (it is, at `lib/env.ts:64`).
  No new environment variable is added by this phase.
- **Phase 3** — `NinaTurnInput.imageDescriptions?: readonly string[]` exists and `userTurnText`
  renders it (phase-3.md:1966, :2001). `lib/nina/gateway.ts` defaults the history field to `[]`
  (phase-3.md:1635). `sendNinaMessage` persists the runner's row **before** loading the context
  (phase-3.md:2461) — this phase depends on that ordering and extends it.
- **Phase 4** — `components/nina/{types,Composer,MessageList,ChatScreen}.tsx` and
  `app/nina/page.tsx` exist as written, `MessageBubble` takes `above?: React.ReactNode`, and
  `app/nina/page.tsx` carries `export const maxDuration = 60`. **Confirmed by ruling C7: the
  `maxDuration` line landed in phase 4**, which owns it, and phase 3's handoff asking for it is
  now a record that it landed there. This phase's latency arithmetic below assumes a 60 s segment
  and depends on nothing else for it — a Server Action's timeout is the page segment's
  (`app/r/[id]/page.tsx:65`, `app/trends/page.tsx`), so without that one line the 45 s turn budget
  and this phase's 25 s describe budget are both fiction.

**Leaves alone (owned by others):**

- `lib/llm/vision.ts`, `lib/llm/prompts/extraction.ts`, `lib/extract/constants.ts`,
  `lib/photos/compressForExtraction.ts`, `components/extract/*` — F04's measured extraction path,
  **read and copied from, never edited.**
- `lib/nina/turn.ts`, `tools.ts`, `gateway.ts`, `schema.ts`, `dates.ts` (Phase 3) — this phase
  touches `actions.ts` only.
- `lib/nina/prompts/{system,tools,index}.ts`, `context.ts`, `load.ts`, `persona.ts` (Phase 2).
- `lib/nina/imagegen.ts`, `app/api/nina/*`, and `nina_message_images.prompt` / `kind:'generated'`
  (Phase 12).
- `app/nina/about/*`, the gallery, `nina_avatars` (Phase 13). This phase writes the
  `nina_message_images` rows that phase 13 reads; the row shape is reported below for both.
- `components/nina/MessageBubble.tsx`, `reveal.ts`, `chatview.ts`, `TypingIndicator.tsx` (Phase 4).
- `scripts/check-llm-payload-boundary.mjs` — **phase 1 ships the complete `GUARDED_CALLS` table
  including `describeNinaImage`; nothing to add here** (ruling D1). The two sanctioned callers are
  recorded in Handoffs, and the second of them is load-bearing.

## The `nina_message_images` row this phase writes

Reported exactly, because **phase 12 writes into the same table and phase 13 reads every row in
it.** One row per picked photo, inserted through `insertNinaMessageImages`:

| column | value this phase writes |
|---|---|
| `id` | phase 1's `newId()`, inside the query layer |
| `user_id` | the authenticated user, inside the query layer |
| `message_id` | the **runner's** `nina_messages.id` for this turn (not Nina's bubbles) |
| `kind` | `'upload'` — always. `'generated'` is phase 12's |
| `blob_url` | the public Blob URL the browser's PUT returned (`result.url`) |
| `pathname` | the **stored** pathname (`result.pathname`), i.e. `nina/<userId>/chat/<id>-<suffix>.jpg` |
| `width` / `height` | the **compressed** pixel dimensions, from `compressForNina` |
| `bytes` | the compressed byte length |
| `description` | `glm-4.6v`'s private text, 60–140 words. **Never rendered.** `null` only when the describe call failed and the runner sent anyway |
| `prompt` | `null`. Phase 12's column |
| `sort_order` | the picker's index, `0..2`, ascending |
| `created_at` | default `now()` |

Three consequences the other two phases should hold to:

1. **`kind` is the discriminator, not `prompt IS NULL`.** Phase 13's gallery can style his and hers
   apart on `kind` alone.
2. **`pathname` is always under `nina/<userId>/`** (RU-7), so a future reaper can scope by prefix
   exactly as `scripts/blob-reap.mjs` does for `shots/`.
3. **`description` is private by construction.** Nothing in `components/` reads it in this phase,
   and nothing in a later phase should start: it is written in an observational third-person voice
   that is not Nina's, and showing it would break the illusion the whole feature exists for.

## Latency verdict — the describe call is NOT on the send path

The brief asked for this arithmetic explicitly, against phase 3's measured numbers and Vercel's
60 s ceiling. Here it is, and the answer changed the design.

**Phase 3's measured send path.** A two-round turn measured **13.8 s** live (plan index, "Verified
live"). `NINA_TURN_BUDGET.overall` is **45 s**, with `primary: 22 s`, `continue: 20 s`,
`repair: 16 s` clamped to `remaining()`, and phase 3's own instruction: *"Do not raise `overall`
past 50 s. The remaining 10 s is the page segment's own overhead plus the persistence of up to
four rows."* A Server Action's timeout is the **page segment's**, and `app/nina/page.tsx` carries
`maxDuration = 60`.

**What a describe call costs.** F04 measured that on this vendor **latency tracks completion
tokens at ~26–33 ms each**, with ~2–3 s of fixed overhead (25.3 s for 1,071 output tokens;
`lib/extract/constants.ts`'s `REPAIR_TIMEOUT_MS` note). A 60–140 word description is ~120–220
output tokens, so:

    blob GET (CDN, same region, ~200 KB)              ~0.3-1.0 s
    fixed request overhead                            ~2-3 s
    220 output tokens x 30 ms                         ~6.6 s
    ------------------------------------------------------------
    one image, ordinary worst case                    ~8-11 s
    three images in one batched call (~600 tokens)    ~20-22 s

**Inline on the send path (rejected):**

    describe (worst, 1 image)   11 s
    + turn (budgeted overall)   45 s
    ------------------------------------
                                56 s   -> over phase 3's own 50 s cap,
                                          and 3 images make it ~67 s: past the platform ceiling.

So it does not fit, and it does not fit by a margin no timeout tuning recovers. **The split is
mandatory, not preferred.**

**The split (chosen).** `describeNinaImage` is its **own** Server Action, one call per image, fired
by the composer the instant that image's PUT lands — which is while the runner is still typing his
caption. It runs in its own function invocation, alone, with a 25 s budget inside a 60 s segment.
`sendNinaMessage` receives an already-computed, signed description and adds **zero** model calls:
its path stays exactly the 13.8–45 s phase 3 measured and budgeted.

    pick -> compress (~0.5 s, worker) -> PUT (~1 s) -> describe (~8-11 s)   || runner types
    tap send -> sendNinaMessage: 13.8-45 s, unchanged

**Three images cost one describe latency, not three**, because each tile compresses, uploads and
describes independently and in parallel.

**The one case where the runner waits:** he picks a photo and taps send within ~10 s without
typing. The composer's send button is held until every tile is `ready` or `error`, so the wait is
**client-side and visible** (the tile shows a spinner) and never becomes server wall-clock inside
the turn. Bounded by `NINA_DESCRIBE_TIMEOUT_MS` = 25 s; when it trips, the tile goes `error` and
send is released with `description: null` and the honest fallback line below.

**What must not be done later:** do not "simplify" this by moving the describe into
`sendNinaMessage`. The arithmetic above is why it is where it is, and the failure mode is a 504
that loses the runner's message and Nina's reply together.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/images.ts` | create | chat-image constants, the `nina/<userId>/chat/` pathname pair, `planNinaPicked` |
| `lib/nina/images.test.ts` | create | pathname round-trip and cross-user rejection; picker accept/reject |
| `lib/nina/prompts/describe.ts` | create | the observational describe prompt and the OpenAI-shaped user content |
| `lib/nina/vision.ts` | create | the `glm-4.6v` describe call, plain `fetch`, with a text-aware token floor |
| `lib/nina/vision.test.ts` | create | the floor arithmetic against the measured drop signature, with a fake `fetch` |
| `lib/nina/imageTicket.ts` | create | HMAC sign/verify, so a description cannot be fabricated by the client |
| `lib/nina/imageTicket.test.ts` | create | round-trip, tamper, expiry, wrong-user |
| `lib/photos/compressForNina.ts` | create | 768 px short edge / q75, reusing `longEdgeTargetFor` |
| `app/api/upload/route.ts` | modify | `onBeforeGenerateToken:69` — a second pathname branch, chat limits |
| `lib/nina/actions.ts` | modify | add `describeNinaImage`; `sendNinaMessage:2447` accepts tickets and allows an empty body |
| `components/nina/types.ts` | modify | `ChatMessage` gains `imageUrls?` |
| `components/nina/ChatImages.tsx` | create | the bubble inset: 1–3 images, no scheme-inverting fill |
| `components/nina/MessageList.tsx` | modify | pass `above={<ChatImages …/>}` when a message has images — the images-only branch of ruling E2's final expression, which phase 8 widens |
| `components/nina/Composer.tsx` | modify | the `size-11` picker button, tile strip, image-only send |
| `components/nina/ChatScreen.tsx` | modify | `handleSend` takes a draft; optimistic row carries `imageUrls` |
| `app/nina/page.tsx` | modify | hydrate `imageUrls` from `getNinaMessageImagesForMessages` |

## Implementation Steps

### Step 1: `lib/nina/images.ts` — the pure module everything else reads

**File:** `lib/nina/images.ts` (new)
**Change:** the chat-image contract: how big a chat photo is, where in Blob it goes, and which
picked files are allowed in. Pure and import-free for the same reason `lib/extract/constants.ts`
is: a `'use client'` composer, a Route Handler, a Server Action and a Node test runner all read it.

**Why a chat photo is not a run screenshot, and what changes.** F04's recipe is **560 px short
edge, q80**, and it is a measurement — five 108/108 scores on transcribing small type: a comma
decimal in `10,67KM`, a resting-HR footnote, the splits table's smallest rows. None of that exists
here. What this phase's model has to see is a face, sweat, light and a background, and the failure
mode of going too small is not a misread digit, it is a description that says "a person outdoors"
instead of "drenched, squinting into low sun, grinning like an idiot". So:

- **768 px short edge** (not 560). At 4:3 that is ~1024x768 and ~1,700 input tokens — well clear of
  the 500/image floor, and cheap. Higher buys nothing a friend would notice.
- **q75** (not q80). A photograph tolerates more chroma loss than rendered UI type does.
- **900 KB server ceiling** (not 600 KB). At 768/q75 a selfie lands ~120–200 KB, but a dense frame
  (foliage, a crowd, a night shot with grain) can reach ~400 KB. 900 KB keeps the same
  "≈4x the expected, so a raw 5 MB original still fails loudly at token-mint" ratio
  `MAX_UPLOAD_BYTES` was chosen for.
- **`maxIteration` is left at the library default here**, unlike F04's deliberate `1`. F04 pins one
  pass because it reproduces an exact scored recipe; this phase has no scored recipe to protect and
  a byte ceiling that a dense photo can genuinely hit, which is the case iteration is for.

**Code:**

```ts
/**
 * The chat-image contract: how big a photo Nina's eyes get, where it lands in Blob, and which
 * picked files are allowed in at all.
 *
 * PURE ON PURPOSE, exactly as `lib/extract/constants.ts` is pure on purpose. No imports, no
 * `server-only`, no `@/lib/env`. This module is read by a `'use client'` composer, by
 * `app/api/upload/route.ts`, by `lib/nina/actions.ts` and by the unit suite. One import of
 * anything server-side and the client half of this phase stops compiling.
 *
 * AND BY THREE LATER PHASES, which is why the rule above is now permanent (ruling A6): phase 12's
 * `imagerecipe.ts` test, phase 14's `.mjs` backfill script (imported as
 * `'../lib/nina/images.ts'` under `--experimental-strip-types`) and phase 15's
 * `lib/admin/avatars.ts` all read `NINA_BLOB_PREFIX` from here. Two of those break at RUNTIME
 * rather than at `tsc` if this file ever grows an import. Do not add one.
 *
 * ── WHY THESE NUMBERS DIFFER FROM F04's ─────────────────────────────────────────────────────
 * F04's 560 px / q80 is a MEASUREMENT: five consecutive 108/108 scores at transcribing small
 * rendered type. A post-run selfie has no small type. What `glm-4.6v` has to resolve here is a
 * face, sweat, the light and the background, and undershooting does not produce a wrong digit —
 * it produces "a person outdoors" where the whole feature needed "drenched, squinting into low
 * sun". So the short edge goes up to 768 and the quality down to 0.75. See the plan's Step 1.
 */

/** RU-5's four-bubble reply has a three-photo counterpart; the same "enough, not endless" call. */
export const NINA_MAX_CHAT_IMAGES = 3

/** DESIGNED, not measured. ~1024x768 at 4:3 -> ~1,700 input tokens. See the header. */
export const NINA_CHAT_TARGET_SHORT_EDGE_PX = 768
/** DESIGNED. A photograph tolerates more chroma loss than rendered UI type. */
export const NINA_CHAT_TARGET_QUALITY = 0.75
/** The compressor's byte ceiling, in MB, as `browser-image-compression` wants it. */
export const NINA_CHAT_TARGET_MAX_MB = 1
/**
 * Server-side ceiling for the compressed upload, enforced at token-mint time. ~4x the expected
 * 120-200 KB, the same safety ratio `MAX_UPLOAD_BYTES` was chosen for, so "upload the raw
 * original" still fails loudly rather than quietly eating the free tier.
 */
export const NINA_CHAT_MAX_UPLOAD_BYTES = 900_000
/** Reject before decoding. Same 25 MB as F04: a photo bigger than this is a mistake. */
export const NINA_CHAT_MAX_SOURCE_BYTES = 25 * 1024 * 1024

/** The compressor always emits JPEG, so exactly one type is allowed through. */
export const NINA_CHAT_CONTENT_TYPE = 'image/jpeg'
export const NINA_CHAT_ALLOWED_CONTENT_TYPES = ['image/jpeg'] as const

/* ── Blob paths (RU-7) ───────────────────────────────────────────────────────────────────── */

/**
 * Everything Nina owns lives under here. Phases 12 and 13 write siblings of `chat/`.
 *
 * **THE ONE DEFINITION IN THE REPO (ruling A6).** Phase 12 spells it inline inside
 * `ninaImagePathname` to keep `imagerecipe.ts` zero-import for the Actions worker, and asserts the
 * two agree in a test that imports this constant; phase 14's `.mjs` script imports it from
 * `'../lib/nina/images.ts'`; phase 15's `lib/admin/avatars.ts` imports it instead of declaring an
 * `ADMIN_AVATAR_PREFIX`. Which is exactly why the file header's no-imports rule is not a style
 * preference: three hosts outside this phase now depend on this module staying reachable from
 * anywhere.
 */
export const NINA_BLOB_PREFIX = 'nina/'
/** The one segment this phase claims. `nina/<userId>/chat/<id>.jpg`. */
export const NINA_CHAT_SEGMENT = 'chat'
/** `lib/id.ts`'s `newId()` is nanoid(12) over the URL-safe alphabet. */
export const NINA_CHAT_ID_RE = /^[A-Za-z0-9_-]{12,24}$/

/**
 * A user id is a path segment here, so it must be one. Auth.js's adapter mints URL-safe ids, but
 * this throws rather than trusting that: a `..` or a `/` arriving in a user id would turn the
 * pathname check below into a path-traversal hole, and a loud throw at the one place that builds
 * the path is the cheapest possible defence.
 */
function assertPathSegment(userId: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) {
    throw new Error(`ninaChatPathname: user id is not a safe path segment: ${JSON.stringify(userId)}`)
  }
}

/** What the browser is allowed to ASK for. Vercel appends its own random suffix on top. */
export function ninaChatPathname(userId: string, id: string): string {
  assertPathSegment(userId)
  if (!NINA_CHAT_ID_RE.test(id)) {
    throw new Error(`ninaChatPathname: bad image id ${JSON.stringify(id)}`)
  }
  return `${NINA_BLOB_PREFIX}${userId}/${NINA_CHAT_SEGMENT}/${id}.jpg`
}

/**
 * The whole of the path-traversal and don't-write-beside-anything-else defence for the chat
 * branch, and **stronger than F04's `SHOT_REQUEST_PATHNAME_RE`**: this does not merely check an
 * alphabet, it binds the requested path to the AUTHENTICATED user. A signed-in runner cannot mint
 * a token that writes into another user's prefix, which matters because `proxy.ts` deliberately
 * does not match `/api/*` and `getUserId()` in the route is the only thing between the open
 * internet and a writable blob store.
 *
 * Compared segment by segment rather than by interpolating `userId` into a RegExp: a user id is
 * data, and data does not belong in a pattern.
 */
export function isNinaChatRequestPathname(pathname: string, userId: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return false
  const parts = pathname.split('/')
  if (parts.length !== 4) return false
  const [prefix, owner, segment, file] = parts
  if (prefix !== 'nina') return false
  if (owner !== userId) return false
  if (segment !== NINA_CHAT_SEGMENT) return false
  if (!file.endsWith('.jpg')) return false
  return NINA_CHAT_ID_RE.test(file.slice(0, -'.jpg'.length))
}

/* ── The picker's decision ───────────────────────────────────────────────────────────────── */

export type NinaPickRejectionReason = 'not_an_image' | 'too_large' | 'too_many'

export interface NinaPickRejection {
  name: string
  reason: NinaPickRejectionReason
}

export interface NinaPickCandidate {
  name: string
  type: string
  size: number
}

export interface NinaPickedPlan {
  accepted: NinaPickCandidate[]
  rejected: NinaPickRejection[]
}

/**
 * Which of the files he just picked are going anywhere. PURE, and separated from the component for
 * the reason invariant 6 gives and the reason F17 measured: `UploadPicker` once decided from
 * INSIDE a `setState` updater, Strict Mode double-invoked it, and one picked file minted two
 * upload tokens and orphaned a blob in the store for good. Decide here, hand `setState` a value,
 * run the effects afterwards.
 *
 * `alreadyHeld` is the count of tiles the composer is already holding, so picking twice in a row
 * cannot exceed the cap. Rejections are returned rather than thrown: three of four files being
 * fine is a normal outcome, not an error.
 */
export function planNinaPicked(
  files: readonly NinaPickCandidate[],
  opts: { alreadyHeld: number },
): NinaPickedPlan {
  const accepted: NinaPickCandidate[] = []
  const rejected: NinaPickRejection[] = []
  let room = Math.max(0, NINA_MAX_CHAT_IMAGES - opts.alreadyHeld)

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      rejected.push({ name: file.name, reason: 'not_an_image' })
      continue
    }
    if (file.size > NINA_CHAT_MAX_SOURCE_BYTES) {
      rejected.push({ name: file.name, reason: 'too_large' })
      continue
    }
    if (room === 0) {
      rejected.push({ name: file.name, reason: 'too_many' })
      continue
    }
    accepted.push(file)
    room -= 1
  }

  return { accepted, rejected }
}
```

**Impact:** nothing imports it yet. It is the vocabulary the next five steps share.

---

### Step 2: `lib/nina/prompts/describe.ts` — the prompt this phase is won or lost on

**File:** `lib/nina/prompts/describe.ts` (new)
**Change:** the observational voice. **This is the real design work in the phase**, and it is a
separate voice from Nina's: `glm-4.6v` is a witness, not a friend. Its output feeds her; it is
never shown to anyone and never quoted.

**The four rules that shape it, in order of how much they matter.**

1. **It must notice what a friend notices, not what an accessibility tool describes.** "A man in
   athletic clothing outdoors" is a correct and useless sentence. "Soaked through, shirt stuck to
   his chest, dark blue tee with a small logo — the same one as in the last photo — flat morning
   light, empty asphalt, sunglasses pushed up, grinning with his mouth open like he has just
   stopped the watch" is the same photo described usefully. The prompt asks for the second by
   enumerating the axes and by showing one example of each register.
2. **It must never transcribe a number.** This is **invariant 2 defended at the vision boundary**,
   and it is not theoretical: half the photos a runner sends are screenshots of his own watch, and
   a description reading "Distance 10.67 km, avg pace 7'22\"" would put numbers into Nina's mouth
   that did not come from `lib/format.ts` and were not computed by F06. Worse, it would put them
   there via a model whose measured failure mode on this vendor family is inventing exactly that
   kind of string. So the prompt forbids reading out any digit, and instead requires naming the
   *kind* of screen ("a screenshot of his watch's run summary") and leaving the figures to the
   app. Nina already has the real numbers in her context.
3. **It must say "I cannot tell" out loud.** The one thing worse than a bland description is a
   confident wrong one. Uncertainty is cheap here — Nina can ask.
4. **It must not judge.** No praise, no advice, no "great effort". It is a pair of eyes. She
   supplies the opinion, and a description that has already had the reaction leaves her nothing to
   do but agree with it.

**Code:**

```ts
/**
 * The `glm-4.6v` describe prompt — **Nina's eyes, and not her voice.**
 *
 * RU-12: `glm-5.3` is never sent an image, because that endpoint answers 200 and silently drops
 * the block (`lib/env.ts`, `lib/llm/vision.ts`, `IMPLEMENTATION_PLAN.md` §1.1). So an image
 * becomes TEXT first, and this file is the text it becomes. Invariant 5 in one sentence.
 *
 * ── THIS IS A WITNESS, NOT A FRIEND ──────────────────────────────────────────────────────────
 * The output of this prompt is a private observation that nothing renders and nobody reads. Its
 * only consumer is the user turn in `lib/nina/turn.ts`, where it arrives as "HE SENT AN IMAGE.
 * This is what is in it". Nina's persona lives in `lib/nina/persona.ts` and none of it belongs
 * here: a description that has already had the reaction leaves her nothing to say.
 *
 * ── AND IT NEVER READS OUT A NUMBER ──────────────────────────────────────────────────────────
 * Invariant 2 — "Nina never states a number the app did not compute" — has to be enforced HERE,
 * not downstream, because there is no downstream. Half the pictures a runner sends are
 * screenshots of his own watch, and this vendor family's measured failure mode is inventing
 * exactly that kind of figure. She already has the real numbers, spelled by `lib/format.ts`, in
 * her context. So: name the screen, never the digits.
 */

/** Mirrors F04's `VisionImagePart` shape without importing F04's `ScreenKind`-flavoured module. */
export type NinaVisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface NinaDescribeImage {
  /** `data:image/jpeg;base64,…` — a data URI, never a hosted URL. See `vision.ts`. */
  dataUri: string
}

export const NINA_DESCRIBE_SYSTEM_PROMPT = `You are the eyes of someone's close friend. She cannot see the photo; you can. Write down what she would notice if she were standing there, so that she can react to it.

You are NOT writing alt text and you are NOT being helpful. You are noticing.

WHAT TO NOTICE, when it is there to notice:
- The state of him. Drenched or dry. Sweat patches and where. Red-faced, pale, flushed neck. Hair plastered down or dry. Chalky salt marks. Chest heaving or standing easy.
- His face and posture. Grinning, gritted, blank, wrecked, mid-laugh, mock-serious, hands on knees, hands on hips, leaning on something, sprawled on the floor, arms up.
- What he is wearing, in enough detail that the same outfit is recognisable next time. Colour, sleeve length, logos, cap, sunglasses (worn, or pushed up), watch on which wrist, shoes if visible, a race bib, a jacket tied round the waist.
- The light and the hour. Flat pre-dawn grey, low hard sun, overhead midday glare, orange late sun, streetlights, indoor fluorescents, a phone flash in the dark. Say what the light tells you about the time of day, and say it as an observation, not a conclusion.
- The weather and the ground. Wet asphalt, puddles, rain on the lens, mist, dust, snow, a track's red lanes, a treadmill's console and handrails, a gym mirror, a trail, sand, a bridge, a stadium, a mall corridor.
- Everything else in the frame. Other people, and whether they are running or watching. A dog. A bike. A drink, a gel, a bowl of food and how much is left. A finish arch. A medal. A sign with a place name on it. A cat.
- Anything odd, funny or slightly embarrassing. A sock inside out. A shopping bag in one hand. Someone photobombing. A face mid-blink. This is the half a friend actually talks about, so do not tidy it away.

HARD RULES:
1. NEVER read out a number, a time, a pace, a distance, a heart rate, a date or a percentage, even if it is printed clearly in the picture. Not one digit. If the photo is a screenshot of a watch, a phone or an app, say what kind of screen it is — "a screenshot of his watch showing a finished run summary", "a splits table", "a heart-rate graph", "a map of a route that loops back on itself" — and describe how it LOOKS. The figures are not yours to hand over and she already has the real ones.
2. Never guess how hard he ran, how fast he was, how far he went, or how he felt. You can see a body and a place. You cannot see effort. "Soaked and bent over" is an observation; "clearly a hard session" is not.
3. When you cannot tell, say so plainly: "I cannot tell whether it is rain or sweat." "There is no way to tell if this is indoors." Guessing is worse than not knowing, because she will say it out loud.
4. No praise, no encouragement, no advice, no judgement, no summary of what it all means. You are not the friend. Do not congratulate him and do not worry about him.
5. If there is no person in the picture, describe what IS there with the same attention.
6. Do not name or identify anyone. "Him" for whoever is clearly the runner; "a woman in a red jacket" for anyone else.

HOW TO WRITE IT:
- Plain flat English, present tense, 60 to 140 words. One paragraph.
- Concrete nouns. No metaphors, no scene-setting, no "the image depicts", no "this photo shows". Start straight in.
- Plain text only. No markdown, no bullet points, no headings, no preamble, no sign-off.
- Write only the description. Nothing before it, nothing after it.`

/** The user-turn text. Deliberately short: the system prompt is doing the work. */
export const NINA_DESCRIBE_REQUEST_TEXT = `Describe this photo.`

/** The plural variant, for when a batched call is ever added. See `vision.ts`'s image-count note. */
export const NINA_DESCRIBE_REQUEST_TEXT_MANY = `Describe these photos, one paragraph each, in the order they are given, separated by a blank line.`

/**
 * What rides on `NinaTurnInput.imageDescriptions` when the describe call FAILED and the runner
 * sent anyway.
 *
 * It is a description of the situation, not of the picture, and it is phrased as an instruction
 * because that is the only honest thing to do: she must ask him what it is rather than invent
 * something plausible. This string is the whole of the degraded path, and it is the reason a
 * dropped image is survivable instead of a lie.
 */
export const NINA_DESCRIPTION_UNAVAILABLE =
  'He attached a photo, but you could not see it — your eyes failed on this one. ' +
  'Do not guess what is in it and do not pretend you saw it. Ask him what it is, ' +
  'the way anyone would when a picture will not load.'

/**
 * The user turn: every image, then the request. Images FIRST and the instruction last, matching
 * `buildExtractionUserContent`'s proven ordering on this endpoint.
 */
export function buildDescribeUserContent(
  images: readonly NinaDescribeImage[],
): NinaVisionContentPart[] {
  const parts: NinaVisionContentPart[] = []
  for (const image of images) {
    parts.push({ type: 'image_url', image_url: { url: image.dataUri } })
  }
  parts.push({
    type: 'text',
    text: images.length === 1 ? NINA_DESCRIBE_REQUEST_TEXT : NINA_DESCRIBE_REQUEST_TEXT_MANY,
  })
  return parts
}
```

**Impact:** a new file under `lib/nina/prompts/`, which phase 2 owns as a directory. **No phase-2
file is edited and `prompts/index.ts` does not re-export this** — the describe prompt is not part
of Nina's prompt surface and versioning it with `NINA_PROMPT_VERSION` would imply it is.

---

### Step 3: `lib/nina/vision.ts` — the describe call and a token floor that actually holds

**File:** `lib/nina/vision.ts` (new)
**Change:** one `fetch` at `LLM_VISION_BASE_URL`, plus the D3 defence ported from
`lib/llm/vision.ts` — **and corrected.**

**The correction, which is the most important paragraph in this plan.** F04's guard is
`promptTokens < TOKEN_FLOOR_PER_IMAGE * imageCount` with the floor at 500, justified because the
measured drop signature was **141 prompt tokens for the whole request**. That works for F04 because
its measurement happened with a short probe prompt. **It does not survive being ported naively**,
because `prompt_tokens` counts the SYSTEM PROMPT TOO. The describe system prompt above is ~3,300
characters — roughly 800–1,100 real tokens. A dropped image would therefore report ~1,000 prompt
tokens, sail over a flat floor of 500, and be believed. The port would ship the guard and lose the
defence, silently, and the failure mode would be Nina confidently discussing a photo she never saw.

So the floor here is **text-aware**:

    floor = estimateTextTokens(all text actually sent) + 500 x imageCount

and the estimator deliberately uses **3 characters per token** when real BPE on English runs
nearer 4. That gap is not sloppiness, it is the safety margin, and it points the right way:

    text-only request (image dropped):  reports ~chars/4  <  floor's ~chars/3   -> TRIPS
    real request (image delivered):     reports ~chars/4 + ~1,700  >>  floor    -> PASSES

The two are separated by ~1,700 tokens for one 768 px photo against a ~275-token margin, so there
is no plausible real image below the floor and no plausible dropped image above it — the same
argument F04 makes, restated for a request that carries a long prompt.

**`imageCount` still multiplies**, and the multiplication is still load-bearing even though this
phase always sends exactly one image per call: the day someone batches three, a floor that did not
multiply would let a 3-image request with one image delivered slip straight through. That is F04's
sentence and it is kept.

**One image per call, and that is the latency design, not a limitation.** Three tiles compress,
upload and describe in parallel from the browser, so three photos cost one describe latency. It
also makes the guard as strict as it can be: `imageCount` is 1, so a single dropped image is a
single failed request rather than one weak signal inside a batch.

**Code:**

```ts
import 'server-only'

import { env } from '@/lib/env'
import {
  NINA_DESCRIBE_SYSTEM_PROMPT,
  buildDescribeUserContent,
  type NinaDescribeImage,
  type NinaVisionContentPart,
} from './prompts/describe'
import { NINA_CHAT_CONTENT_TYPE } from './images'

/**
 * Nina's eyes: one `glm-4.6v` call that turns a photo into a paragraph.
 *
 * One `fetch`, no SDK, exactly as `lib/llm/vision.ts` does it and for exactly the same reason
 * (roadmap §3): `@anthropic-ai/sdk` cannot be pointed at this endpoint, whose envelope is OpenAI
 * Chat Completions with `{ type: 'image_url', image_url: { url } }` image parts rather than
 * Anthropic's `{ type: 'image', source: {…} }`.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE TOKEN-FLOOR GUARD LIVES HERE TOO, AND IT IS NOT A COPY OF F04's.
 *  `lib/llm/vision.ts`'s floor is `500 x imageCount`, flat. That works there because its
 *  measurement — 141 prompt_tokens for a whole dropped-image request, IMPLEMENTATION_PLAN.md
 *  §1.1 — was taken with a short probe prompt. `prompt_tokens` counts the SYSTEM PROMPT, and
 *  this module's system prompt is ~3,300 characters. A dropped image here would report ~1,000
 *  prompt tokens and clear a flat floor of 500 without a murmur.
 *
 *  So the floor is TEXT-AWARE: the text we actually sent, estimated at a deliberately
 *  pessimistic 3 chars/token, PLUS 500 per image. Read the plan's Step 3 before touching it.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * MEASURED, and ported verbatim from `lib/llm/vision.ts:TOKEN_FLOOR_PER_IMAGE` with its reasoning
 * intact. 500 sits 3.4x above the observed 141-token drop signature. A 768 px chat photo costs
 * ~1,700 input tokens — a wider margin than F04's 1,092, so if 500 is right there it is right
 * here.
 *
 * MULTIPLIED by the image count, and the multiplication is load-bearing: a flat floor would let a
 * 3-image request with only one image actually delivered slip straight through. This phase always
 * sends one, and the multiplication stays anyway, for whoever sends three.
 */
export const NINA_TOKEN_FLOOR_PER_IMAGE = 500

/**
 * Characters per token, for the TEXT half of the floor only. Real BPE on English/Indonesian prose
 * runs nearer 4; 3 over-estimates the text term on purpose, which raises the floor and therefore
 * errs toward "I could not see it" rather than toward believing an invented description. That is
 * the correct direction: the degraded path asks him what the photo is, and the other direction
 * puts words in Nina's mouth about a picture she never received.
 */
export const NINA_DESCRIBE_CHARS_PER_TOKEN = 3

/** 60-140 words plus slack. Not a target; the prompt sets the length. */
export const NINA_DESCRIBE_MAX_TOKENS = 500

/**
 * MEASURED-DERIVED. F04 measured this vendor at ~26-33 ms per completion token with ~2-3 s of
 * fixed overhead. ~220 output tokens is therefore ~8-11 s. 25 s covers the tail with room, and it
 * is affordable because this call runs in its OWN invocation, concurrently with the runner
 * typing — never inside `sendNinaMessage`. See the plan's latency verdict.
 */
export const NINA_DESCRIBE_TIMEOUT_MS = 25_000

/** A ~200 KB GET from a CDN in the same region. If Blob is slower than this, describing is moot. */
export const NINA_BLOB_FETCH_TIMEOUT_MS = 8_000

/**
 * The guard tripped: the response reported so little input that the image cannot have reached the
 * model. Its own class because it is the ONE failure that must never be recovered from by
 * retrying, rephrasing, or trusting the text — the text is exactly where the invention is.
 */
export class NinaVisionTokenFloorError extends Error {
  constructor(
    readonly promptTokens: number,
    readonly floor: number,
    readonly imageCount: number,
  ) {
    super(
      `nina describe reported prompt_tokens=${promptTokens} for ${imageCount} image(s); ` +
        `expected >= ${floor}. The endpoint may have silently dropped the image ` +
        `(IMPLEMENTATION_PLAN.md §1.1) — refusing to hand Nina a description that may have ` +
        `been invented.`,
    )
    this.name = 'NinaVisionTokenFloorError'
  }
}

/** Network failure, timeout, non-JSON body, empty completion, or a non-200 that cleared the floor. */
export class NinaVisionTransportError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'NinaVisionTransportError'
  }
}

/** A blob this phase already owns a row for, or is about to. */
export interface NinaImageRef {
  blobUrl: string
  pathname: string
}

export interface NinaDescribeResult {
  /** The description. Trimmed, never empty — an empty completion throws instead. */
  description: string
  promptTokens: number
  completionTokens: number
  /** The floor this response was measured against, for the log line. */
  floor: number
  finishReason: string | null
}

export interface NinaDescribeOptions {
  timeoutMs?: number
}

type FetchLike = typeof fetch

type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: NinaVisionContentPart[] }

/** Pure. Exported so the floor arithmetic is unit-testable without a request. */
export function estimateTextTokens(chars: number): number {
  if (!Number.isFinite(chars) || chars < 0) return 0
  return Math.ceil(chars / NINA_DESCRIBE_CHARS_PER_TOKEN)
}

/** Pure, and the whole of the guard's arithmetic. See the module header. */
export function describeTokenFloor(promptChars: number, imageCount: number): number {
  return estimateTextTokens(promptChars) + NINA_TOKEN_FLOOR_PER_IMAGE * imageCount
}

/**
 * How many characters of TEXT this request carries. Data URIs are excluded deliberately: they are
 * not tokenised as text, and counting them would inflate the floor past any real response.
 */
function textCharsOf(messages: readonly Message[]): number {
  let chars = 0
  for (const message of messages) {
    if (typeof message.content === 'string') {
      chars += message.content.length
      continue
    }
    for (const part of message.content) {
      if (part.type === 'text') chars += part.text.length
    }
  }
  return chars
}

/**
 * The injectable core. Production reaches it through `describeNinaImages`; the unit suite hands it
 * a fake `fetch` returning the measured drop signature and never touches the network. DI at
 * exactly this seam for the reason `lib/llm/vision.ts` gives: this module is `server-only` and
 * reads `@/lib/env`, so a fake `fetch` is the only honest way to test the guard.
 */
export async function describeNinaImagesWithFetch(
  fetchImpl: FetchLike,
  images: readonly NinaDescribeImage[],
  opts: NinaDescribeOptions = {},
): Promise<NinaDescribeResult> {
  if (images.length < 1) throw new Error('describeNinaImages expects at least one image')

  const messages: Message[] = [
    { role: 'system', content: NINA_DESCRIBE_SYSTEM_PROMPT },
    { role: 'user', content: buildDescribeUserContent(images) },
  ]
  const floor = describeTokenFloor(textCharsOf(messages), images.length)

  let res: Response
  try {
    res = await fetchImpl(`${env.LLM_VISION_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // R-40: one z.ai key serves both endpoints. There is no LLM_VISION_API_KEY.
        Authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.LLM_VISION_MODEL,
        max_tokens: NINA_DESCRIBE_MAX_TOKENS,
        // MEASURED by F04: thinking mode doubles latency for an identical score. There is no
        // trade to make. Kept for the same reason `lib/llm/vision.ts` keeps it, and noting the
        // plan index's correction: this endpoint may emit a thinking block anyway, which costs
        // output tokens and is why `max_tokens` has slack.
        thinking: { type: 'disabled' },
        messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? NINA_DESCRIBE_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new NinaVisionTransportError('nina describe request failed or timed out', cause)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch (cause) {
    throw new NinaVisionTransportError('nina describe response was not valid JSON', cause)
  }

  const body = json as {
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const promptTokens = body.usage?.prompt_tokens ?? 0
  const completionTokens = body.usage?.completion_tokens ?? 0

  /* ══ THE TOKEN-FLOOR GUARD ══════════════════════════════════════════════════════════════
   * ABOVE every read of `choices`, because it GATES parsing rather than validating alongside
   * it. Nothing downstream — not the ticket signer, not the row, not Nina's prompt — is allowed
   * to see the text of a response that fails this check, because that text is exactly where an
   * invented description would be. Never move this below the return.
   * ═════════════════════════════════════════════════════════════════════════════════════ */
  if (promptTokens < floor) {
    throw new NinaVisionTokenFloorError(promptTokens, floor, images.length)
  }

  // Checked AFTER the floor on purpose: when a response is both non-200 and below the floor, the
  // floor is the more actionable diagnosis — and F04's measured failure was itself a 200.
  if (!res.ok) {
    throw new NinaVisionTransportError(
      `nina describe endpoint returned ${res.status}: ${JSON.stringify(json).slice(0, 300)}`,
    )
  }

  const choice = body.choices?.[0]
  const description = (choice?.message?.content ?? '').trim()
  if (description.length === 0) {
    throw new NinaVisionTransportError('nina describe returned an empty completion')
  }

  return {
    description,
    promptTokens,
    completionTokens,
    floor,
    finishReason: choice?.finish_reason ?? null,
  }
}

/**
 * Fetch the blob back out and re-encode it as a base64 data URI.
 *
 * A data URI, not the hosted Blob URL, even though the bytes are already on a public CDN — the
 * same ruling `lib/llm/runExtractionJob.ts:toDataUri` makes and for the same reason: a `url:`-only
 * `image_url` has never been probed against this endpoint, and on this vendor an untested request
 * shape is not something to trust when the failure mode is "200 OK with invented content".
 */
async function toDataUri(ref: NinaImageRef, signal: AbortSignal): Promise<NinaDescribeImage> {
  const res = await fetch(ref.blobUrl, { signal, cache: 'no-store' })
  if (!res.ok) throw new NinaVisionTransportError(`blob fetch ${res.status} for ${ref.pathname}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new NinaVisionTransportError(`blob ${ref.pathname} was empty`)
  }
  // The compressor always emits JPEG and the upload route allows only image/jpeg, so the media
  // type is known rather than sniffed.
  return { dataUri: `data:${NINA_CHAT_CONTENT_TYPE};base64,${bytes.toString('base64')}` }
}

/** Production: fetch the bytes, then describe them. One image per call — see the plan's Step 3. */
export async function describeNinaImages(
  refs: readonly NinaImageRef[],
  opts: NinaDescribeOptions = {},
): Promise<NinaDescribeResult> {
  const images = await Promise.all(
    refs.map((ref) => toDataUri(ref, AbortSignal.timeout(NINA_BLOB_FETCH_TIMEOUT_MS))),
  )
  return describeNinaImagesWithFetch(fetch, images, opts)
}
```

**Impact:** the second token floor in the repo, and the first one that survives a long prompt. No
existing file changes.

---

### Step 4: `lib/nina/imageTicket.ts` — how a description crosses between two actions

**File:** `lib/nina/imageTicket.ts` (new)
**Change:** an HMAC-signed envelope, so the description that `describeNinaImage` computed can go
out to the browser and come back into `sendNinaMessage` without becoming client-controlled text.

**Why a ticket at all.** The latency verdict forced two separate actions, and
`nina_message_images.message_id` is `NOT NULL` — so at describe time there is no row to park the
description in, because the message does not exist yet. The description therefore has to survive a
round trip through the client. Three options were on the table:

| option | why not |
|---|---|
| Return the raw description and take it back on send | the client can then write anything into Nina's prompt. Not a privacy problem (RU: one user, no privacy concerns) but a **correctness** one: the "HE SENT AN IMAGE. This is what is in it" block is presented to her as ground truth, and ground truth that anything can write is not ground truth |
| A server-side cache keyed by pathname | serverless. The next invocation is a different instance |
| Ask phase 1 for a nullable `message_id` | a schema change to a written phase, for a row that would be garbage the moment a send is abandoned |

An HMAC ticket costs ~40 lines, needs no schema change, no shared state and no new environment
variable — `AUTH_SECRET` is already validated in `authEnv()` (`lib/env.ts:64`) — and it makes the
guarantee structural: `sendNinaMessage` will only accept a description **this server wrote, for
this user, for this pathname, within the last 30 minutes.**

The signing/verifying pair takes the secret as an argument, so it is testable without env
(invariant 6) and `authEnv()` is read only at the call site.

**Code:**

```ts
import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * A signed carrier for one image's description, so it can cross from `describeNinaImage` to
 * `sendNinaMessage` through the browser without becoming something the browser can write.
 *
 * WHY THIS EXISTS AT ALL: the two actions are two invocations (the plan's latency verdict), and
 * `nina_message_images.message_id` is NOT NULL, so there is no row to park the description in
 * until the message exists. It has to round-trip through the client, and a description arrives in
 * Nina's turn framed as "this is what is in the picture" — ground truth. Ground truth that the
 * client can author is not ground truth, so it is signed.
 *
 * NOT a session token, NOT an auth token, and not a substitute for `requireUserId()`. It carries
 * no capability: it proves only that this server produced this description for this user and this
 * pathname, recently.
 */

/** Bumped if `NinaImageClaims` ever changes shape, so an old ticket fails closed rather than open. */
export const NINA_TICKET_VERSION = 1

/**
 * Half an hour. Long enough to pick a photo, get distracted, come back and send; short enough that
 * a ticket found in a log is worthless. `UPLOAD_TOKEN_TTL_MS` is 10 minutes for the upload itself,
 * and this is deliberately longer: composing a message is a slower act than a PUT.
 */
export const NINA_TICKET_TTL_MS = 30 * 60 * 1000

/** A description is 60-140 words; 4,000 characters of ticket is generous and bounds the parse. */
export const NINA_MAX_TICKET_CHARS = 4_000

export interface NinaImageClaims {
  v: number
  /** The owner. Compared against `requireUserId()` on the way back in. */
  userId: string
  /** The STORED blob pathname, after Vercel's random suffix. */
  pathname: string
  blobUrl: string
  width: number
  height: number
  bytes: number
  /** `glm-4.6v`'s output, or `null` when the describe call failed and we signed the failure. */
  description: string | null
  /** Epoch ms. */
  exp: number
}

export interface NinaTicketExpectation {
  userId: string
  now?: number
}

export type NinaTicketVerdict =
  | { ok: true; claims: NinaImageClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_user' | 'bad_version' }

function b64url(input: Buffer): string {
  return input.toString('base64url')
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest())
}

export function signNinaImageTicket(
  claims: Omit<NinaImageClaims, 'v' | 'exp'>,
  secret: string,
  now: number = Date.now(),
): string {
  const full: NinaImageClaims = {
    ...claims,
    v: NINA_TICKET_VERSION,
    exp: now + NINA_TICKET_TTL_MS,
  }
  const payload = b64url(Buffer.from(JSON.stringify(full), 'utf8'))
  return `${payload}.${sign(payload, secret)}`
}

export function verifyNinaImageTicket(
  ticket: string,
  expect: NinaTicketExpectation,
  secret: string,
): NinaTicketVerdict {
  if (typeof ticket !== 'string' || ticket.length === 0 || ticket.length > NINA_MAX_TICKET_CHARS) {
    return { ok: false, reason: 'malformed' }
  }
  const dot = ticket.indexOf('.')
  if (dot <= 0 || dot === ticket.length - 1) return { ok: false, reason: 'malformed' }

  const payload = ticket.slice(0, dot)
  const given = ticket.slice(dot + 1)
  const expected = sign(payload, secret)

  /* Length-checked first: `timingSafeEqual` throws on a length mismatch rather than returning
   * false, and a forged ticket of the wrong length must be a verdict, not an exception. */
  const givenBytes = Buffer.from(given, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  if (givenBytes.length !== expectedBytes.length) return { ok: false, reason: 'bad_signature' }
  if (!timingSafeEqual(givenBytes, expectedBytes)) return { ok: false, reason: 'bad_signature' }

  let claims: NinaImageClaims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as NinaImageClaims
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  /* Shape-checked even though the signature already proves we wrote it: a deploy that changed the
   * shape would otherwise hand a stale ticket's fields straight into an INSERT. */
  if (claims.v !== NINA_TICKET_VERSION) return { ok: false, reason: 'bad_version' }
  if (typeof claims.userId !== 'string' || typeof claims.pathname !== 'string') {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof claims.blobUrl !== 'string' || typeof claims.exp !== 'number') {
    return { ok: false, reason: 'malformed' }
  }
  if (claims.description !== null && typeof claims.description !== 'string') {
    return { ok: false, reason: 'malformed' }
  }
  if (claims.userId !== expect.userId) return { ok: false, reason: 'wrong_user' }
  if ((expect.now ?? Date.now()) > claims.exp) return { ok: false, reason: 'expired' }

  return { ok: true, claims }
}
```

**Impact:** none until Step 6 uses it. No environment variable is added.

---

### Step 5: `app/api/upload/route.ts` — a second pathname branch, and nothing else

**File:** `app/api/upload/route.ts:69` (inside `onBeforeGenerateToken`)
**Change:** the route learns one more shape of pathname. Everything that makes it a security
boundary is preserved exactly.

**The ruling: branch on the PATHNAME, not on a widened `clientPayload`.** The obvious move is to
turn `ClientPayload` into a discriminated union with a `target` field — and it is the wrong one,
because it forces an edit to `components/extract/UploadPicker.tsx`, a file this phase does not own,
to add a field that carries no information. The pathname is **already** the discriminator, and it
is already the security-relevant value: it is what the token authorises a write to. So:

    SHOT_REQUEST_PATHNAME_RE.test(pathname)        -> the F04 branch, unchanged, parses `{ kind }`
    isNinaChatRequestPathname(pathname, userId)    -> the chat branch, ignores clientPayload
    neither                                        -> throw 'Invalid pathname', as today

`ClientPayload` is untouched, `UploadPicker.tsx` is untouched, and the chat branch never parses
client JSON at all — the smallest possible diff to the app's only writable-store boundary.

**What is preserved, verbatim:** `blobEnv()` at the top; `getUserId()` as the first thing inside
`onBeforeGenerateToken`, because `proxy.ts` deliberately does not match `/api/*` and this check is
the only thing between the open internet and a writable blob store; `addRandomSuffix: true`;
`allowOverwrite: false`; the short `validUntil`; the terse error messages that echo nothing back;
and `onUploadCompleted` staying inert.

**What the chat branch adds:** the pathname check is **stronger** than F04's, because
`isNinaChatRequestPathname` binds the requested path to the authenticated user rather than to an
alphabet. A signed-in runner cannot mint a token that writes under another user's prefix.

**Code** — the replacement for `onBeforeGenerateToken`'s body (`route.ts:69-92`):

```ts
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // AUTH. Without this line the route is an open upload endpoint for the internet.
        // getUserId(), not requireUserId(): the latter redirects, and handleUpload turns this
        // throw into a 400 the fetch caller can actually read.
        const userId = await getUserId()
        if (!userId) throw new Error('Not authenticated')

        /*
         * ── TWO BRANCHES, DISCRIMINATED BY THE PATHNAME ─────────────────────────────────────
         * The pathname is the value the token authorises a write to, so it is the honest
         * discriminator — and using it means `ClientPayload` and `UploadPicker.tsx` need no
         * change at all to admit a second kind of upload (F33 phase 6).
         *
         * A chat photo is not a run screenshot and does not share its limits: 768 px/q75
         * photographs land near 120-200 KB and a dense frame can reach 400, so the ceiling is
         * 900 KB rather than 600. See `lib/nina/images.ts`.
         */
        if (isNinaChatRequestPathname(pathname, userId)) {
          return {
            allowedContentTypes: [...NINA_CHAT_ALLOWED_CONTENT_TYPES],
            maximumSizeInBytes: NINA_CHAT_MAX_UPLOAD_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
            cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
            validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
            // No client JSON is parsed on this branch: there is nothing a chat photo needs to
            // declare. The owner is in the pathname and re-derived from the session anyway.
            tokenPayload: JSON.stringify({ userId, target: 'nina-chat' }),
          }
        }

        // The client picks its own pathname, so constrain it hard: our prefix, our alphabet, our
        // extension. This is the path-traversal defence and the "don't write beside anything
        // else in the store" defence, in one regex.
        if (!SHOT_REQUEST_PATHNAME_RE.test(pathname)) throw new Error('Invalid pathname')

        const payload = ClientPayload.parse(JSON.parse(clientPayload || '{}'))

        return {
          // Compression always outputs JPEG, so exactly one type is allowed through.
          allowedContentTypes: [...ALLOWED_UPLOAD_CONTENT_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true, // collision-proof; rewrites the stored pathname
          allowOverwrite: false, // never clobber an existing blob
          cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
          validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
          // Carried in the SIGNED token, so the completion webhook cannot be spoofed into
          // claiming a different kind (or a different owner) than the authenticated upload
          // session declared. The webhook has no cookies and cannot re-authorise.
          tokenPayload: JSON.stringify({ userId, kind: payload.kind }),
        }
      },
```

**And the import block gains one line** (`route.ts:5-13`):

```ts
import {
  NINA_CHAT_ALLOWED_CONTENT_TYPES,
  NINA_CHAT_MAX_UPLOAD_BYTES,
  isNinaChatRequestPathname,
} from '@/lib/nina/images'
```

**One sentence added to the route's header docstring**, per invariant 8's spirit — a boundary that
gains a branch says so:

```
 * F33 PHASE 6 ADDED A SECOND BRANCH. `nina/<userId>/chat/<id>.jpg` mints a chat-photo token with
 * its own size ceiling. It is discriminated by the PATHNAME rather than by a widened
 * `clientPayload`, so this file and `UploadPicker.tsx` keep the shapes they had, and its check is
 * strictly stronger than the shots branch's: `isNinaChatRequestPathname` binds the path to the
 * authenticated user, not merely to an alphabet.
```

**Impact:** the F04 upload path is byte-for-byte unchanged in behaviour — same regex, same
payload parse, same limits, same order. Uploaded bytes still never pass through a Vercel Function.

---

### Step 6: `lib/nina/actions.ts` — the describe action, and an empty body becoming legal

**File:** `lib/nina/actions.ts` (phase 3's file; `sendNinaMessage` is at phase-3.md:2447)
**Change:** one new exported action, and two edits inside `sendNinaMessage`.

**6a — `describeNinaImage`, the new action.** Appended after `sendNinaMessage`. It is the entire
critical-path split: its own invocation, one image, 25 s, no turn.

```ts
export type NinaDescribeFailureReason =
  /** The floor tripped. The endpoint dropped the image and may have invented a description. */
  | 'dropped'
  /** Network, timeout, non-JSON, empty completion, or a blob that would not fetch. */
  | 'transport'
  /** The pathname did not belong to this user, or was not a chat pathname at all. */
  | 'rejected'

export interface NinaDescribeImageInput {
  /** From the browser's `upload()` result. */
  blobUrl: string
  /** The STORED pathname, after Vercel's random suffix. */
  pathname: string
  width: number
  height: number
  bytes: number
}

export interface NinaDescribeImageResult {
  ok: boolean
  /**
   * Opaque and signed. The composer holds it and hands it back to `sendNinaMessage`. On failure
   * it is **still issued** — carrying `description: null` — so that an image whose description
   * failed can still be SENT, with Nina told honestly that she could not see it.
   */
  ticket: string | null
  reason: NinaDescribeFailureReason | null
}

/**
 * **The describe pre-pass, in its own invocation. RU-12 and invariant 5.**
 *
 * ── WHY THIS IS NOT PART OF `sendNinaMessage` ────────────────────────────────────────────────
 * Arithmetic, not taste. `NINA_TURN_BUDGET.overall` is 45 s and phase 3 forbids raising it past
 * 50 s because the remaining 10 s of the 60 s segment is page overhead plus up to four inserts. A
 * describe call costs ~8-11 s for one image (F04 measured ~26-33 ms per completion token plus
 * ~2-3 s fixed). 45 + 11 = 56 s, and three images would be ~67 s. It does not fit, and no timeout
 * tuning makes it fit. So it runs here, alone, while the runner is still typing his caption — and
 * `sendNinaMessage` adds zero model calls. Do not move it.
 *
 * ── AND WHY A FAILURE STILL RETURNS A TICKET ─────────────────────────────────────────────────
 * R10 is "he sends a photo and she responds to what is in it". When the eyes fail, the honest
 * outcome is not a blocked send — it is her asking what the picture is, which is what a person
 * does when an image will not load. `NINA_DESCRIPTION_UNAVAILABLE` is that instruction, and the
 * `description: null` ticket is how it gets there. What must never happen is Nina describing a
 * photo she did not receive; that is what the token floor is for, one layer down.
 */
export async function describeNinaImage(
  input: NinaDescribeImageInput,
): Promise<NinaDescribeImageResult> {
  const userId = await requireUserId()
  const secret = authEnv().AUTH_SECRET

  const blobUrl = typeof input?.blobUrl === 'string' ? input.blobUrl : ''
  const pathname = typeof input?.pathname === 'string' ? input.pathname : ''

  /*
   * The pathname arrives from the client, so it is re-checked here even though the upload route
   * already checked it: this action's own INSERT-shaped claims (pathname, blobUrl) are about to be
   * signed, and signing something unvalidated is how a signature becomes a laundering service.
   * The stored pathname carries Vercel's random suffix, so the id segment is longer than the
   * requested one — which `NINA_CHAT_ID_RE`'s 12..24 bound already admits.
   */
  if (!isNinaChatRequestPathname(pathname, userId) || !blobUrl.startsWith('https://')) {
    return { ok: false, ticket: null, reason: 'rejected' }
  }

  const claims = {
    userId,
    pathname,
    blobUrl,
    width: Number.isFinite(input.width) ? Math.round(input.width) : 0,
    height: Number.isFinite(input.height) ? Math.round(input.height) : 0,
    bytes: Number.isFinite(input.bytes) ? Math.round(input.bytes) : 0,
  }

  try {
    const result = await describeNinaImages([{ blobUrl, pathname }])
    console.log('[nina] described an image', {
      pathname,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      floor: result.floor,
      chars: result.description.length,
    })
    return {
      ok: true,
      ticket: signNinaImageTicket({ ...claims, description: result.description }, secret),
      reason: null,
    }
  } catch (cause) {
    /*
     * The floor tripping is logged LOUDLY and separately from a transport failure. It is the one
     * class that means "the vendor lied to us", and the day it starts happening the log line has
     * to say which one it was — F04's whole §1.1 lesson in one `if`.
     */
    const dropped = cause instanceof NinaVisionTokenFloorError
    if (dropped) {
      console.error('[nina] TOKEN FLOOR TRIPPED on a chat image', {
        pathname,
        message: cause.message,
      })
    } else {
      console.warn('[nina] could not describe a chat image', { pathname, error: String(cause) })
    }
    return {
      ok: false,
      ticket: signNinaImageTicket({ ...claims, description: null }, secret),
      reason: dropped ? 'dropped' : 'transport',
    }
  }
}
```

**6b — `sendNinaMessage`'s signature and its refusal rule.** Replaces phase-3.md:2447-2461.

```ts
export async function sendNinaMessage(input: {
  body: string
  /** Phase 6. Signed by `describeNinaImage`; at most `NINA_MAX_CHAT_IMAGES` of them. */
  imageTickets?: readonly string[]
}): Promise<SendNinaMessageResult> {
  const userId = await requireUserId()

  const text = typeof input?.body === 'string' ? input.body.trim() : ''
  const tickets = Array.isArray(input?.imageTickets) ? input.imageTickets : []

  /*
   * ── R10: AN IMAGE ALONE IS A VALID SEND ─────────────────────────────────────────────────────
   * This was `text.length === 0` and is now the conjunction. A photo with no caption is the most
   * natural message in this whole feature — he finishes a run, takes one selfie, sends it. The
   * oversized-paste refusal is unchanged, and a ticket count over the cap is refused rather than
   * truncated: a client sending five is a client with a bug, not a runner with five photos.
   *
   * Ruling B1's rule is MONOTONE and this is its second clause. Phases 8 and 13 each add one more
   * disjunct (`runId != null`, `attachExisting != null`) in their own commits; nobody rewrites
   * this condition, they extend it. The final form is printed in the Interface Contract.
   */
  if (text.length === 0 && tickets.length === 0) return REFUSED
  if (text.length > MAX_RUNNER_MESSAGE_CHARS) return REFUSED
  if (tickets.length > NINA_MAX_CHAT_IMAGES) return REFUSED

  /*
   * STEP 0 — verify the tickets BEFORE writing anything. A forged or expired ticket is dropped,
   * not fatal: the message he typed is still worth sending. Deduplicated by pathname, because two
   * identical tickets would otherwise insert the same photo twice into one bubble.
   */
  const secret = authEnv().AUTH_SECRET
  const seen = new Set<string>()
  const images: NinaImageClaims[] = []
  for (const ticket of tickets) {
    const verdict = verifyNinaImageTicket(ticket, { userId }, secret)
    if (!verdict.ok) {
      console.warn('[nina] refused an image ticket', { reason: verdict.reason })
      continue
    }
    if (seen.has(verdict.claims.pathname)) continue
    seen.add(verdict.claims.pathname)
    images.push(verdict.claims)
  }
  if (text.length === 0 && images.length === 0) return REFUSED

  /* STEP 1 — his message, first. See the header. One row, through the batch insert, with no
   * caller-supplied `seq` (ruling A2b: `seq` is a `bigserial` Postgres assigns and every read is
   * `ORDER BY seq`). The DTO field is `body`, per ruling A1's middle layer, and it may
   * legitimately be the empty string now: an image-only message has no words, and the column is
   * NOT NULL, so `''` is the honest value and phase 4's bubble renders just the photo. */
  let runnerMessage: NinaMessageRow
  try {
    const inserted = await insertNinaMessages(userId, [{ role: 'runner', body: text }])
    const first = inserted[0]
    if (first === undefined) throw new Error('insertNinaMessages returned no row')
    runnerMessage = first
  } catch (cause) {
    console.warn('[nina] could not persist the runner message', { error: String(cause) })
    return REFUSED
  }

  /*
   * STEP 1b — the image rows, BEFORE the context load, and the ordering is deliberate twice over.
   * First: a turn that fails must not leave a message row whose photo was never recorded, which
   * would render as an empty bubble forever. Second, and the same reason phase 3 inserts his
   * message before loading the context: `loadNinaContext` reads the conversation window out of
   * `nina_messages` + `nina_message_images`, so a description not yet written is a description
   * she cannot see — on this turn or on any later one that scrolls back to it.
   *
   * A failure here is warned and swallowed. The message and the reply are worth more than the
   * gallery row, and `imageDescriptions` below is built from the verified claims rather than from
   * the INSERT's return value, so the turn is unaffected either way.
   */
  if (images.length > 0) {
    try {
      await insertNinaMessageImages(
        userId,
        images.map((image, index) => ({
          messageId: runnerMessage.id,
          kind: 'upload' as const,
          blobUrl: image.blobUrl,
          pathname: image.pathname,
          width: image.width || null,
          height: image.height || null,
          bytes: image.bytes || null,
          description: image.description,
          sortOrder: index,
        })),
      )
    } catch (cause) {
      console.warn('[nina] could not persist chat images', { error: String(cause) })
    }
  }
```

**6c — the turn call.** Replaces phase-3.md's STEP 3 block:

```ts
  /* STEP 3 — the turn. 13-45 s. Never throws for a model problem.
   *
   * INVARIANT 5 IS ENFORCED BY THIS ARGUMENT AND NOWHERE ELSE. `imageDescriptions` is TEXT.
   * There is no code path in this file that puts an image part into `runNinaTurn`, and there must
   * never be one: `glm-5.3` answers 200 and silently drops an image block, so sending one is not
   * an error, it is a lie.
   *
   * `runnerText: null` for an image-only message, so `userTurnText` omits the "HE JUST SAID"
   * block entirely rather than emitting an empty one.
   */
  const result = await runNinaTurn({
    userId,
    context,
    history,
    sourceMessageId: runnerMessage.id,
    runnerText: text.length > 0 ? text : null,
    imageDescriptions: images.map(
      (image) => image.description ?? NINA_DESCRIPTION_UNAVAILABLE,
    ),
  })
```

**6d — the imports `actions.ts` gains:**

```ts
import { authEnv } from '@/lib/env'
import { insertNinaMessageImages } from '@/lib/nina/queries'
/* `insertNinaMessages` and `NinaMessageRow` are already imported by phase 3's own STEP 1. */
import { isNinaChatRequestPathname, NINA_MAX_CHAT_IMAGES } from './images'
import {
  signNinaImageTicket,
  verifyNinaImageTicket,
  type NinaImageClaims,
} from './imageTicket'
import { NINA_DESCRIPTION_UNAVAILABLE } from './prompts/describe'
import { describeNinaImages, NinaVisionTokenFloorError } from './vision'
```

**Impact and one accepted redundancy.** Because the image rows land before the context load, the
description reaches Nina **twice** on the turn that sends it: once inside the conversation window
(phase 1's `imageDescriptions` per message) and once in the emphatic "HE SENT AN IMAGE" block.
That is deliberate and not a defect — the two say the same thing, and the emphatic one is what
makes her *react* to a photo rather than *narrate* a log entry. Removing the duplication would mean
inserting the rows after the turn, which costs the two guarantees in 1b's comment.

---

### Step 7: `lib/photos/compressForNina.ts`

**File:** `lib/photos/compressForNina.ts` (new)
**Change:** the browser-side compressor for a chat photo. Reuses `longEdgeTargetFor` — the pure
function that exists solely to get the short-edge trap right — and does **not** edit
`compressForExtraction.ts`, whose docstring's whole point is that it reproduces one measured recipe.

**Code:**

```tsx
'use client'

import imageCompression from 'browser-image-compression'

import { COMPRESSION_LIB_URL } from '@/lib/extract/constants'
import {
  NINA_CHAT_CONTENT_TYPE,
  NINA_CHAT_MAX_UPLOAD_BYTES,
  NINA_CHAT_TARGET_MAX_MB,
  NINA_CHAT_TARGET_QUALITY,
  NINA_CHAT_TARGET_SHORT_EDGE_PX,
} from '@/lib/nina/images'
import { longEdgeTargetFor } from './resizeTarget'

/**
 * One picked chat photo -> the bytes `glm-4.6v` gets to look at.
 *
 * A SIBLING OF `compressForExtraction`, not a parameterisation of it. That module's docstring is
 * explicit that it reproduces a MEASUREMENT — 560 px/q80, five 108/108 scores — and adding an
 * options bag would make it possible to run F04's extraction at a recipe nobody scored. So this
 * file duplicates about fifteen lines of library call and shares the one thing worth sharing:
 * `longEdgeTargetFor`, which is where the actual bug lives (`maxWidthOrHeight` clamps the LONG
 * edge, so passing the short-edge target directly ships a postage stamp).
 *
 * `COMPRESSION_LIB_URL` is reused as-is: the worker is self-hosted by
 * `scripts/copy-image-compression-worker.mjs`, and the library's default is a jsDelivr CDN URL
 * that would put a third party on the hot path of every upload.
 *
 * `maxIteration` is left at the library default here, unlike F04's deliberate `1`. F04 pins one
 * pass to protect an exact scored recipe; this has no scored recipe and does have a byte ceiling
 * a dense night shot can genuinely hit, which is the case iteration exists for.
 */

export interface CompressedNinaImage {
  file: File
  width: number
  height: number
  originalBytes: number
  compressedBytes: number
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const bitmap = await createImageBitmap(file)
    return { width: bitmap.width, height: bitmap.height }
  } catch {
    // Safari without `createImageBitmap` for this type — fall back to an <img> decode.
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('This image could not be read in this browser.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function compressForNina(
  file: File,
  opts: { signal?: AbortSignal } = {},
): Promise<CompressedNinaImage> {
  const source = await readDimensions(file)
  if (!source.width || !source.height) {
    throw new Error(
      'This photo could not be read in this browser. If it is a HEIC photo, pick it from ' +
        'Photos rather than Files, or set Settings > Camera > Formats > Most Compatible.',
    )
  }

  const maxWidthOrHeight = longEdgeTargetFor(
    source.width,
    source.height,
    NINA_CHAT_TARGET_SHORT_EDGE_PX,
  )

  const out = await imageCompression(file, {
    maxWidthOrHeight,
    initialQuality: NINA_CHAT_TARGET_QUALITY,
    fileType: NINA_CHAT_CONTENT_TYPE,
    maxSizeMB: NINA_CHAT_TARGET_MAX_MB,
    useWebWorker: true,
    libURL: COMPRESSION_LIB_URL,
    /*
     * STRIP EXIF. Not "on principle" as F04 has it — here it is the point. A phone photo carries
     * GPS coordinates, and these blobs sit on a public CDN URL. Re-encoding from a canvas removes
     * the block entirely rather than trusting that there was nothing in it.
     */
    preserveExif: false,
    signal: opts.signal,
  })

  if (out.size > NINA_CHAT_MAX_UPLOAD_BYTES) {
    // Fail here rather than at token-mint, so the message names the photo and not the endpoint.
    throw new Error('That photo is unusually large even after compression. Try another one.')
  }

  const compressed = await readDimensions(out)
  return {
    file: out,
    width: compressed.width,
    height: compressed.height,
    originalBytes: file.size,
    compressedBytes: out.size,
  }
}
```

**Impact:** one new client module. `compressForExtraction.ts` and `resizeTarget.ts` are unchanged.

---

### Step 8: `components/nina/Composer.tsx` — the picker, the tiles, the image-only send

**File:** `components/nina/Composer.tsx` (phase 4's file; the seam it left is the comment at
`{/* Phases 6 and 8 add size-11 icon buttons to the left of the textarea, in this row. */}`)
**Change:** a `size-11` picker button in that row, a tile strip above it, and `canSend` becoming
"text OR a ready photo, and nothing still in flight".

**Two things carried over from F04, deliberately.** First, the F17 purity lesson: **decide with
`planNinaPicked`, hand `setTiles` a value, and run the effects afterwards.** `reactStrictMode` is
on and Strict Mode double-invokes updaters, which on F04 minted two upload tokens for one file and
orphaned a blob in the store permanently. Second, `patchIfCurrent`'s spirit: a tile that has been
removed must not be written to by its own in-flight promise.

**`userId` arrives as a prop and is not a capability.** The client needs it to build
`nina/<userId>/chat/<id>.jpg`, and the upload route re-derives the owner from the session and
refuses any path that does not match it — so a tampered value buys a 400, not a write. Passing it
as a prop is the same shape phase 11 uses for the VAPID public key, and invariant 10 is about
`NEXT_PUBLIC_`, not about props.

**Code** — the replacement file:

```tsx
'use client'

import { upload } from '@vercel/blob/client'
import { useCallback, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import { newId } from '@/lib/id'
import { describeNinaImage } from '@/lib/nina/actions'
import {
  NINA_MAX_CHAT_IMAGES,
  ninaChatPathname,
  planNinaPicked,
  type NinaPickRejectionReason,
} from '@/lib/nina/images'
import { compressForNina } from '@/lib/photos/compressForNina'

/**
 * The composer. Phase 4 wrote the textarea and the send button; phase 6 added the eye.
 *
 * (phase 4's header is kept verbatim above this paragraph — the 16px rule, the 44px send button,
 * the z-40 sticky recipe and the "disabling is not a validation message" argument all still hold.)
 *
 * ── THE PICKER, AND WHY IT UPLOADS IMMEDIATELY ───────────────────────────────────────────────
 * A picked photo is compressed, PUT straight to Blob, and DESCRIBED before he taps send. That is
 * not eagerness for its own sake: the describe call costs ~8-11 s, the turn is budgeted at 45 s,
 * and 45 + 11 does not fit in a 60 s function. Doing it while he types is the only shape that
 * fits. See the phase plan's latency verdict.
 *
 * ── AND WHY `planNinaPicked` IS A PURE FUNCTION IN `lib/` ────────────────────────────────────
 * F17 measured what happens otherwise: `UploadPicker` decided from inside a `setState` updater,
 * Strict Mode double-invoked it, and one picked file minted two upload tokens and left a blob
 * orphaned in the store for good. Decide purely, hand `setTiles` a value, run the effects after.
 */

/** Roughly five lines at 16px, after which the textarea scrolls instead of growing. */
const TEXTAREA_MAX_PX = 132

type TileState = 'compressing' | 'uploading' | 'describing' | 'ready' | 'error'

interface Tile {
  id: string
  /** `URL.createObjectURL` of the ORIGINAL pick, so the thumbnail appears instantly. */
  previewUrl: string
  state: TileState
  error: string | null
  /** Set once describe returns — success or handled failure. A tile without one cannot be sent. */
  ticket: string | null
  /** The public Blob URL, for the optimistic bubble. */
  blobUrl: string | null
}

export interface ComposerDraftImage {
  ticket: string
  url: string
}

const REJECTION_TEXT: Record<NinaPickRejectionReason, string> = {
  not_an_image: 'that is not a photo',
  too_large: 'that photo is too big',
  too_many: `Nina takes ${NINA_MAX_CHAT_IMAGES} photos at a time`,
}

export function Composer({
  onSend,
  busy,
  bottomCss,
  userId,
}: {
  /** Receives the trimmed body and whatever photos are ready. Must be referentially stable. */
  onSend: (draft: {
    body: string
    images: readonly ComposerDraftImage[]
  }) => void | Promise<void>
  /** A turn is in flight. The box stays editable; only sending is held. */
  busy: boolean
  /** From `composerBottomCss`. A CSS length, because `var(--safe-bottom)` is CSS-only. */
  bottomCss: string
  /** Needed to build `nina/<userId>/chat/<id>.jpg`. Not a capability — see the header. */
  userId: string
}) {
  const [value, setValue] = useState('')
  const [tiles, setTiles] = useState<Tile[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  /** Ids removed while their promise was still in flight. Their results are dropped. */
  const dropped = useRef(new Set<string>())

  const ready = tiles.filter((t) => t.state === 'ready' && t.ticket !== null)
  const inFlight = tiles.some((t) => t.state !== 'ready' && t.state !== 'error')
  const canSend = (value.trim().length > 0 || ready.length > 0) && !inFlight && !busy

  const patch = useCallback((id: string, next: Partial<Tile>) => {
    if (dropped.current.has(id)) return
    setTiles((current) => current.map((t) => (t.id === id ? { ...t, ...next } : t)))
  }, [])

  const process = useCallback(
    async (tile: Tile, file: File) => {
      try {
        const compressed = await compressForNina(file)
        patch(tile.id, { state: 'uploading' })

        const requested = ninaChatPathname(userId, newId())
        const result = await upload(requested, compressed.file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          // Nothing to declare: the chat branch of the route parses no client payload.
        })
        patch(tile.id, { state: 'describing', blobUrl: result.url })

        /*
         * Her eyes. A FAILED describe still returns a ticket (carrying `description: null`), so
         * the photo remains sendable and Nina is told honestly that she could not see it — which
         * is why this branch sets `state: 'ready'` on a `!ok` result too, and only a missing
         * ticket is an error.
         */
        const described = await describeNinaImage({
          blobUrl: result.url,
          pathname: result.pathname,
          width: compressed.width,
          height: compressed.height,
          bytes: compressed.compressedBytes,
        })
        if (described.ticket === null) {
          patch(tile.id, { state: 'error', error: 'Nina could not take this one.' })
          return
        }
        patch(tile.id, { state: 'ready', ticket: described.ticket })
      } catch (cause) {
        patch(tile.id, {
          state: 'error',
          error: cause instanceof Error ? cause.message : 'That photo would not upload.',
        })
      }
    },
    [patch, userId],
  )

  /**
   * Decide, then set, then run. Nothing in here is inside an updater, so Strict Mode has nothing
   * to double-invoke. See the header.
   */
  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = '' // so picking the same file twice in a row still fires onChange
    if (picked.length === 0) return

    const plan = planNinaPicked(
      picked.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      { alreadyHeld: tiles.length },
    )

    const fresh: Array<{ tile: Tile; file: File }> = []
    for (const candidate of plan.accepted) {
      const file = picked.find((f) => f.name === candidate.name && f.size === candidate.size)
      if (file == null) continue
      fresh.push({
        tile: {
          id: `tile-${newId()}`,
          previewUrl: URL.createObjectURL(file),
          state: 'compressing',
          error: null,
          ticket: null,
          blobUrl: null,
        },
        file,
      })
    }

    setTiles((current) => [...current, ...fresh.map((f) => f.tile)])
    setNotice(
      plan.rejected.length > 0 ? REJECTION_TEXT[plan.rejected[0].reason] : null,
    )
    for (const { tile, file } of fresh) void process(tile, file)
  }

  function removeTile(id: string) {
    dropped.current.add(id)
    setTiles((current) => {
      const going = current.find((t) => t.id === id)
      if (going != null) URL.revokeObjectURL(going.previewUrl)
      return current.filter((t) => t.id !== id)
    })
  }

  function resize() {
    const el = ref.current
    if (el == null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`
  }

  function submit() {
    if (!canSend) return
    onSend({
      body: value.trim(),
      images: ready.map((t) => ({ ticket: t.ticket as string, url: t.blobUrl as string })),
    })
    setValue('')
    for (const tile of tiles) URL.revokeObjectURL(tile.previewUrl)
    setTiles([])
    setNotice(null)
    const el = ref.current
    if (el != null) {
      el.style.height = 'auto'
      el.focus() // keep the keyboard up; he is going to type again
    }
  }

  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-rule bg-paper/90 backdrop-blur-md"
      style={{ bottom: bottomCss }}
    >
      <div className="mx-auto max-w-[470px] px-5 py-3">
        {tiles.length > 0 && (
          <ul className="mb-2 flex gap-2">
            {tiles.map((tile) => (
              <li key={tile.id} className="relative">
                {/* A plain <img>: the source is a blob: object URL, which next/image cannot
                    optimise and does not need to. Same call as UploadPicker's tile. */}
                <img
                  src={tile.previewUrl}
                  alt=""
                  className={cn(
                    'size-14 rounded-field object-cover',
                    tile.state !== 'ready' && 'opacity-50',
                    tile.state === 'error' && 'ring-1 ring-red',
                  )}
                />
                {tile.state !== 'ready' && tile.state !== 'error' && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="size-2 animate-pulse rounded-pill bg-card" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeTile(tile.id)}
                  aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-pill bg-ink text-[11px] leading-none font-bold text-card"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}

        {notice !== null && (
          <p className="mb-2 text-[12px] font-medium text-ink-3">{notice}</p>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={tiles.length >= NINA_MAX_CHAT_IMAGES}
            aria-label="Add a photo"
            className="grid size-11 shrink-0 place-items-center rounded-pill bg-card text-ink transition-opacity active:scale-[0.97] disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="8.5" cy="10" r="1.6" fill="currentColor" />
              <path
                d="M4 17l4.5-4.5 3.5 3.5 3-2.5L20 17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              resize()
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              if (event.nativeEvent.isComposing) return
              event.preventDefault()
              submit()
            }}
            enterKeyHint="send"
            placeholder="Message Nina"
            aria-label="Message Nina"
            className={cn(
              'max-h-[132px] min-h-11 w-full resize-none rounded-field bg-card px-4 py-2.5',
              'text-base font-medium text-ink outline-none',
              'placeholder:font-medium placeholder:text-ink-3',
              'focus-visible:ring-2 focus-visible:ring-accent',
            )}
          />

          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send"
            className="grid size-11 shrink-0 place-items-center rounded-pill bg-ink text-card transition-opacity active:scale-[0.97] disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <path
                d="M12 19V5M6 11l6-6 6 6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Impact:** `ChatScreen` must pass `userId` and accept the new `onSend` shape (Step 10). The
picker button is disabled at the cap, which is the one place phase 4's "disabling is not a
validation message" rule is satisfied by the tile strip itself being the explanation.

---

### Step 9: the bubble inset — and the answer to phase 4's open issue

**Files:** `components/nina/types.ts` (modify), `components/nina/ChatImages.tsx` (new),
`components/nina/MessageList.tsx` (modify)

**Phase 4 left this for phase 6 to solve:** *"`bg-paper-2` inside a `bg-ink` bubble inverts between
colour schemes (near-white inset on ink in light mode; near-navy inset on near-white in dark). A
per-side inset fill is probably the answer, and it is a two-token decision, not a redesign."*

**Solved, and it is one token rather than two.** The tokens involved are, from `app/globals.css`:

| token | light | dark |
|---|---|---|
| `--ink` (his bubble's fill) | `#1d2733` | `#f2f7fa` |
| `--card` (her bubble's fill) | `#ffffff` | `#1c3040` |
| `--paper-2` | `#f1f7fb` | `#162834` |
| `--ink-3` | `#93a2b0` | `#7c8d9b` |

`bg-paper-2` fails because it is a *near-white* in light and a *near-navy* in dark, while `bg-ink`
does the opposite — so the pair is a near-match in one scheme and a violent contrast in the other.
**An alpha of `ink-3` cannot fail that way**, because `ink-3` is a mid-grey in *both* schemes and
an alpha composites against whatever the bubble actually is:

    bg-ink-3/20  over #1d2733 (light, his)   -> a touch lighter than the bubble
    bg-ink-3/20  over #f2f7fa (dark, his)    -> a touch darker than the bubble
    bg-ink-3/20  over #ffffff (light, hers)  -> a touch darker than the bubble
    bg-ink-3/20  over #1c3040 (dark, hers)   -> a touch lighter than the bubble

In all four it reads as "a recessed panel inside this bubble", which is the only thing the inset
has to say.

**RULING E1: `bg-ink-3/20` IS the inset surface inside a bubble, and it is binding on phases 7, 8
and 13.** Not a recommendation any more — one class, no per-side branch, no new token, and the
verification is the table above: `app/globals.css` sets `--ink-3` to `#93a2b0` in light and
`#7c8d9b` in dark, so it really is a mid-grey in *both* schemes, which is the whole of the
argument. An alpha of a token that does not swap ends of the range cannot invert, and that is a
property of the value rather than a hope about it.

**Phase 8's `bg-current/10` loses, and the reason is not taste.** Phase 8's own plan admitted its
arbitrary-opacity-on-`currentColor` support was **unverified in this Tailwind setup**. An
unverified mechanism must not be the shared answer for four phases: if it turns out not to compile
the way phase 8 assumed, the failure lands in four places at once and in the one property —
legibility of an inset against a bubble — that nobody notices in review and everybody notices on a
phone. Phase 8's `bg-current/10` block, its `data-[role=…]` fallback and its Open Question 4 have
been deleted from its plan and replaced with a pointer to this ruling.

And for *this* phase the fill is barely visible anyway: an image is opaque and is its own surface,
so it only shows for the instant before the image paints and behind a `rounded-field` corner. The
phases it actually matters for are 7's quote stub and 8's run card, which is precisely why the
answer had to be settled here rather than three times.

**9a — `components/nina/types.ts`:** `ChatMessage` gains one optional field.

```ts
export interface ChatMessage {
  /** `nina_messages.id`, or a client-minted `local-…` id until the action returns the real one. */
  id: string
  role: ChatRole
  /** Plain text. There is no markdown renderer in this app; see `MessageBubble`. */
  body: string
  /** The Asia/Jakarta calendar day (D6) this message belongs to, from `jakartaDayOf`. */
  dayISO: string
  state: ChatMessageState
  /**
   * Phase 6. Public Blob URLs, in `sort_order`, at most `NINA_MAX_CHAT_IMAGES`.
   *
   * PLURAL, where phase 4's handoff note said `imageUrl`: one message carries up to three photos.
   * Ruling E2b upheld the plural and deleted phase 7's competing singular `imageUrl?`, so this
   * field has one author. Optional, so phase 7 (`replyToId`) and phase 8 (`attachment`) widen the
   * same interface without collision.
   *
   * Phase 7 reads it exactly once, and not directly: `MessageList` computes
   * `hasImage: (m.imageUrls?.length ?? 0) > 0` for `quoteMediaOf`, so a quote whose target is an
   * image-only message can say "Photo" without `lib/nina/reply.ts` ever knowing what a URL is.
   *
   * The `description` column is NOT here and must never be — it is written in an observational
   * voice that is not Nina's, and rendering it would break the illusion this feature exists for.
   */
  imageUrls?: readonly string[]
}
```

**9b — `components/nina/ChatImages.tsx` (new):**

```tsx
/**
 * The photos inside a bubble. Rendered through `MessageBubble`'s `above` slot, which phase 4 built
 * for exactly this. Phase 8's run card is the slot's second occupant, stacked BELOW these; phase
 * 7's quote stub is not in this slot at all — it has its own `quote` prop and sits above the whole
 * slot (ruling E2). Order inside the bubble: quote stub → images → run card → text.
 *
 * `mb-2` lives on the `<ul>` here, not on a wrapper, and phase 8's `RunAttachmentCard` does the
 * same: each inset block owns its own bottom margin, so the two stack with no wrapper margins and
 * either can be absent without leaving a gap.
 *
 * A plain `<img>`, not `next/image`, matching every other Blob-backed image in the app
 * (`ScreenshotStrip`, `PhotoViewer`, `PhotoInclusionList`, `/s/[token]`): the browser already
 * compressed these to ~120-200 KB, so a paid transformation would buy nothing. `NinaAvatar` is
 * the one `next/image` call site because it serves committed local art at unknown intrinsic size.
 *
 * `bg-ink-3/20` is the inset surface, and it is the answer to phase 4's flagged issue: `ink-3` is
 * `#93a2b0` in light and `#7c8d9b` in dark, a mid-grey in BOTH schemes, so an alpha of it
 * composites correctly over `bg-ink` and over `bg-card` in light and dark alike, where
 * `bg-paper-2` inverts. See the plan's Step 9. **Ruling E1 makes this the inset surface for
 * phases 7, 8 and 13 too**, so do not introduce a second recipe here.
 *
 * `alt=""`. The photo is the runner's own, he is looking at the thing he just sent, and there is
 * no honest alt text for it — the only description that exists is `glm-4.6v`'s, which is private.
 *
 * Not interactive in this phase. Phase 13 owns tap-to-open, and it already has
 * `components/ui/PhotoViewer.tsx` and `lib/photos/gallery.ts` to do it with.
 */
export function ChatImages({ urls }: { urls: readonly string[] }) {
  if (urls.length === 0) return null

  return (
    <ul
      className={
        urls.length === 1
          ? 'mb-2 grid grid-cols-1 gap-1'
          : 'mb-2 grid grid-cols-2 gap-1'
      }
    >
      {urls.map((url) => (
        <li
          key={url}
          className="overflow-hidden rounded-field bg-ink-3/20"
        >
          <img
            src={url}
            alt=""
            className={
              urls.length === 1
                ? 'block max-h-64 w-full object-cover'
                : 'block aspect-square w-full object-cover'
            }
          />
        </li>
      ))}
    </ul>
  )
}
```

**9c — `components/nina/MessageList.tsx`:** the one line that hangs the inset. `MessageBubble.tsx`
itself is **not** edited — its `above` prop already exists.

```tsx
            <MessageBubble
              key={message.id}
              message={message}
              above={
                message.imageUrls != null && message.imageUrls.length > 0 ? (
                  <ChatImages urls={message.imageUrls} />
                ) : undefined
              }
            />
```

plus `import { ChatImages } from './ChatImages'`.

**The final composition (ruling E2), so this phase writes the branch phase 8 widens rather than a
shape phase 8 has to unpick.** `MessageList` owns the whole expression. Phase 6 ships the
images-only branch above; phase 8 widens the *same* expression to the two-branch stack and adopts
this verbatim:

```tsx
<MessageBubble
  message={m}
  quote={resolveQuote(m, index)}          // phase 7 — its own prop, rendered ABOVE `above`
  above={
    m.imageUrls?.length || m.attachment != null ? (
      <div className="space-y-2">
        {m.imageUrls?.length ? <ChatImages urls={m.imageUrls} /> : null}   {/* phase 6 */}
        {m.attachment != null ? <RunAttachmentCard attachment={m.attachment} /> : null}  {/* phase 8 */}
      </div>
    ) : undefined
  }
/>
```

**The quote is NOT in `above`.** Phase 7 gives it its own `quote` prop on `MessageBubble`,
rendered above the `above` slot — phase 7 won that argument (ruling E2) and phase 8's competing
expression, which nested `ReplyQuote` inside `above`, has been overruled in phase 8's plan. So the
render order inside the bubble, top to bottom, is **quote stub → images → run card → text**: the
quote says what he is answering, the images and the card are what he is handing over, the text is
the message.

**Which is why `ChatImages` owns its own `mb-2`** (Step 9b, on the `<ul>`), matching what phase
8's `RunAttachmentCard` does. Each inset block carries its own bottom margin, so a stack of two of
them needs no wrapper margins and either one can be absent without leaving a gap. Do not move that
margin onto the wrapper: phase 6 lands with no wrapper at all, and the wrapper only appears when
phase 8 widens the branch.

**Impact:** a message with no `imageUrls` renders exactly as it did in phase 4 — `above` is
`undefined` and `MessageBubble` already handles that.

---

### Step 10: `components/nina/ChatScreen.tsx` — the draft, and the optimistic photo

**File:** `components/nina/ChatScreen.tsx` (phase 4's file; `handleSend` and the `<Composer>` call)
**Change:** `handleSend` takes a draft instead of a string, the optimistic row carries the photo,
and the action gets the tickets. Everything else in the file — the `alive` ref, the
`visualViewport` effect, the reveal loop, the notices — is untouched.

**The optimistic bubble shows the real Blob URL, not the object URL.** The photo has already been
uploaded by the time send is possible (that is the whole point of the pre-pass), so there is no
object URL to manage, nothing to revoke, and no flicker when the server row arrives with the same
URL.

**Code** — the replacement for `handleSend`'s first eleven lines and its one action call:

```tsx
  const handleSend = useCallback(
    async (draft: { body: string; images: readonly ComposerDraftImage[] }) => {
      if (busy) return

      const body = draft.body
      const imageUrls = draft.images.map((image) => image.url)
      const localId = `local-${crypto.randomUUID()}`
      const dayISO = todayInJakarta()
      setNotice(null)
      setMessages((current) => [
        ...current,
        {
          id: localId,
          role: 'user',
          body,
          dayISO,
          state: 'sending',
          /* Already on the CDN — the describe pre-pass uploaded it before send was possible — so
           * the optimistic row shows the same URL the server row will carry. No object URL to
           * revoke, and no flicker when the real row lands. */
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        },
      ])
      setBusy(true)
      setTyping(true)

      let result: Awaited<ReturnType<typeof sendNinaMessage>> | null = null
      try {
        result = await sendNinaMessage({
          body,
          imageTickets: draft.images.map((image) => image.ticket),
        })
      } catch {
        result = null
      }
      if (!alive.current) return
```

...and the rest of `handleSend` is unchanged, as is the `<Composer>` element apart from one prop:

```tsx
      <Composer
        onSend={handleSend}
        busy={busy}
        bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}
        userId={userId}
      />
```

`ChatScreen`'s props gain `userId: string`, and its import block gains
`import type { ComposerDraftImage } from './Composer'`.

**Impact:** the only caller of `sendNinaMessage` and of `describeNinaImage`'s consumer chain stays
inside `components/nina/`, which keeps invariant 4's grep satisfied with `lib/nina/actions.ts` as
the sanctioned boundary.

---

### Step 11: `app/nina/page.tsx` — hydrate the photos

**File:** `app/nina/page.tsx` (phase 4's file; the `rows.map` at phase-4.md:2015)
**Change:** one more read, one more field in the mapper, one more prop.

**`row.body` and `row.createdAt` are correct and settled (ruling A1).** `listNinaMessages` returns
`lib/nina/queries.ts`'s DTO, which spells the message text `body` and its instant `createdAt` in
**every** function, because they all `select(messageColumns)`. The `text` / `sent_at` spelling
belongs to the columns, and `text` / `sentAt` belongs to phase 2's `MessageInput`; the single
translation point between them is `lib/nina/gateway.ts` (phase 3). Nothing here is to be "fixed" to
match a column name — see Assumptions 1 for the three-layer table.

**Code:**

```tsx
export default async function NinaPage() {
  const userId = await requireUserId()
  const rows = await listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT })

  /*
   * The photos, in one query rather than a join. `getNinaMessageImagesForMessages` reads
   * `nina_message_images_message_idx` and comes back ordered by `(message_id, sort_order)`, so
   * grouping is a single pass and the order inside a bubble is the order he picked them in.
   *
   * `description` is deliberately dropped on the floor here. It is `glm-4.6v`'s private text; the
   * only consumer is Nina's prompt, and nothing in `components/` may read it.
   */
  const images = await getNinaMessageImagesForMessages(
    userId,
    rows.map((row) => row.id),
  )
  const urlsByMessage = new Map<string, string[]>()
  for (const image of images) {
    const list = urlsByMessage.get(image.messageId)
    if (list == null) urlsByMessage.set(image.messageId, [image.blobUrl])
    else list.push(image.blobUrl)
  }

  const initial: ChatMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role === 'nina' ? 'nina' : 'user',
    body: row.body,
    dayISO: jakartaDayOf(row.createdAt),
    state: 'sent',
    imageUrls: urlsByMessage.get(row.id),
  }))

  return (
    <AppShell bottomGap="chat">
      <header className="mb-5 flex items-center gap-3">
        <NinaAvatar size="md" />
        <div className="min-w-0">
          <h1 className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">Nina</h1>
          <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
            Reads every run. Says what she thinks.
          </p>
        </div>
      </header>

      <ChatScreen initial={initial} todayISO={todayInJakarta()} userId={userId} />
    </AppShell>
  )
}
```

plus `import { getNinaMessageImagesForMessages, listNinaMessages } from '@/lib/nina/queries'`.

**Impact:** one extra indexed query per page load, on a bounded 200-row window. `maxDuration = 60`
and the two awaits stay the only awaits — no model call enters the render path (invariant 4).

---

### Step 12: the tests

**Invariant 6 applies: vitest is `environment: 'node'`, no jsdom.** So nothing here renders a
component. Everything tested is a pure function or a `fetch`-injected call — which is exactly the
three things the brief named: the token-floor arithmetic, the pathname convention, and the picker's
accept/reject decision. `tests/support/setup.ts` already seeds `LLM_VISION_BASE_URL`,
`LLM_VISION_MODEL` and `LLM_API_KEY`, so `lib/nina/vision.ts` imports cleanly and never reaches the
network. `AUTH_SECRET` is **not** seeded there, which is precisely why
`signNinaImageTicket`/`verifyNinaImageTicket` take the secret as an argument.

**12a — `lib/nina/images.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'

import {
  NINA_CHAT_MAX_SOURCE_BYTES,
  NINA_MAX_CHAT_IMAGES,
  isNinaChatRequestPathname,
  ninaChatPathname,
  planNinaPicked,
} from './images'

describe('ninaChatPathname', () => {
  it('round-trips through its own validator', () => {
    const p = ninaChatPathname('user_abc123', 'aaaaaaaaaaaa')
    expect(p).toBe('nina/user_abc123/chat/aaaaaaaaaaaa.jpg')
    expect(isNinaChatRequestPathname(p, 'user_abc123')).toBe(true)
  })

  it('refuses a user id that is not a single safe path segment', () => {
    expect(() => ninaChatPathname('../evil', 'aaaaaaaaaaaa')).toThrow()
    expect(() => ninaChatPathname('a/b', 'aaaaaaaaaaaa')).toThrow()
  })

  it('refuses a bad image id', () => {
    expect(() => ninaChatPathname('user_abc123', 'short')).toThrow()
    expect(() => ninaChatPathname('user_abc123', 'has.a.dot12')).toThrow()
  })
})

describe('isNinaChatRequestPathname', () => {
  const mine = 'nina/user_abc123/chat/aaaaaaaaaaaa.jpg'

  it("refuses another user's prefix — the whole point of binding the path to the session", () => {
    expect(isNinaChatRequestPathname(mine, 'user_someoneelse')).toBe(false)
  })

  it('accepts the stored pathname, which carries Vercel’s random suffix', () => {
    expect(
      isNinaChatRequestPathname('nina/user_abc123/chat/aaaaaaaaaaaa-Xy7.jpg', 'user_abc123'),
    ).toBe(true)
  })

  it('refuses traversal, extra segments, other prefixes and other extensions', () => {
    for (const bad of [
      'nina/user_abc123/chat/../../shots/x.jpg',
      'nina/user_abc123/chat/sub/aaaaaaaaaaaa.jpg',
      'nina/user_abc123/avatars/aaaaaaaaaaaa.jpg',
      'shots/aaaaaaaaaaaa.jpg',
      'nina/user_abc123/chat/aaaaaaaaaaaa.png',
      'nina/user_abc123/chat/.jpg',
      '/nina/user_abc123/chat/aaaaaaaaaaaa.jpg',
    ]) {
      expect(isNinaChatRequestPathname(bad, 'user_abc123')).toBe(false)
    }
  })

  it('refuses a malformed user id rather than throwing', () => {
    expect(isNinaChatRequestPathname(mine, '../evil')).toBe(false)
  })
})

describe('planNinaPicked', () => {
  const jpeg = (name: string, size = 1_000) => ({ name, type: 'image/jpeg', size })

  it('accepts up to the cap and rejects the rest as too_many', () => {
    const plan = planNinaPicked(
      [jpeg('a'), jpeg('b'), jpeg('c'), jpeg('d')],
      { alreadyHeld: 0 },
    )
    expect(plan.accepted).toHaveLength(NINA_MAX_CHAT_IMAGES)
    expect(plan.rejected).toEqual([{ name: 'd', reason: 'too_many' }])
  })

  it('counts what the composer already holds', () => {
    const plan = planNinaPicked([jpeg('a'), jpeg('b')], { alreadyHeld: 2 })
    expect(plan.accepted.map((f) => f.name)).toEqual(['a'])
    expect(plan.rejected).toEqual([{ name: 'b', reason: 'too_many' }])
  })

  it('rejects a non-image and an oversized source without spending a slot on them', () => {
    const plan = planNinaPicked(
      [
        { name: 'notes.pdf', type: 'application/pdf', size: 10 },
        jpeg('huge', NINA_CHAT_MAX_SOURCE_BYTES + 1),
        jpeg('fine'),
      ],
      { alreadyHeld: 0 },
    )
    expect(plan.accepted.map((f) => f.name)).toEqual(['fine'])
    expect(plan.rejected).toEqual([
      { name: 'notes.pdf', reason: 'not_an_image' },
      { name: 'huge', reason: 'too_large' },
    ])
  })

  it('is a no-op on an empty pick', () => {
    expect(planNinaPicked([], { alreadyHeld: 0 })).toEqual({ accepted: [], rejected: [] })
  })
})
```

**12b — `lib/nina/vision.test.ts`.** The important one. It pins the *correction*, not just the port.

```ts
import { describe, expect, it, vi } from 'vitest'

import { NINA_DESCRIBE_SYSTEM_PROMPT } from './prompts/describe'
import {
  NINA_TOKEN_FLOOR_PER_IMAGE,
  NinaVisionTokenFloorError,
  NinaVisionTransportError,
  describeNinaImagesWithFetch,
  describeTokenFloor,
  estimateTextTokens,
} from './vision'

const IMAGE = { dataUri: 'data:image/jpeg;base64,AAAA' }

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch
}

describe('the floor arithmetic', () => {
  it('over-estimates the text term on purpose, in the safe direction', () => {
    // 3 chars/token here, ~4 in reality: the gap IS the margin, and it points at "I could not
    // see it" rather than at believing an invented description.
    expect(estimateTextTokens(3_300)).toBe(1_100)
    expect(estimateTextTokens(0)).toBe(0)
  })

  it('adds 500 PER IMAGE, and the multiplication is load-bearing', () => {
    expect(describeTokenFloor(0, 1)).toBe(NINA_TOKEN_FLOOR_PER_IMAGE)
    expect(describeTokenFloor(0, 3)).toBe(NINA_TOKEN_FLOOR_PER_IMAGE * 3)
    // A flat floor would let a 3-image request with one image delivered slip through.
    expect(describeTokenFloor(300, 3)).toBeGreaterThan(describeTokenFloor(300, 1))
  })

  it('separates a dropped image from a delivered one, with THIS prompt', () => {
    // The real system prompt, tokenised the way the endpoint would (~4 chars/token) — the number
    // a DROPPED-image response would report, which a flat floor of 500 would happily accept.
    const droppedReport = Math.ceil(NINA_DESCRIBE_SYSTEM_PROMPT.length / 4)
    const floor = describeTokenFloor(NINA_DESCRIBE_SYSTEM_PROMPT.length + 20, 1)

    expect(droppedReport).toBeGreaterThan(NINA_TOKEN_FLOOR_PER_IMAGE) // F04's flat floor fails
    expect(droppedReport).toBeLessThan(floor) // this one does not
    // A real 768px photo is ~1,700 input tokens on top of the text.
    expect(droppedReport + 1_700).toBeGreaterThan(floor)
  })
})

describe('describeNinaImagesWithFetch', () => {
  it('trips the floor on the measured drop signature and never reads the text', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 141, completion_tokens: 40 },
      choices: [{ message: { content: 'He is soaked and grinning on wet asphalt.' } }],
    })
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTokenFloorError,
    )
  })

  it('trips the floor on a plausible text-only report, which is the F04 port’s hole', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 900, completion_tokens: 120 },
      choices: [{ message: { content: 'A man running.' } }],
    })
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTokenFloorError,
    )
  })

  it('returns a trimmed description when the image really arrived', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 2_800, completion_tokens: 180 },
      choices: [
        { message: { content: '  Soaked through, dark tee stuck to his chest.  ' }, finish_reason: 'stop' },
      ],
    })
    const result = await describeNinaImagesWithFetch(fetchImpl, [IMAGE])
    expect(result.description).toBe('Soaked through, dark tee stuck to his chest.')
    expect(result.promptTokens).toBe(2_800)
    expect(result.finishReason).toBe('stop')
  })

  it('reports the floor before the status, when a response fails both', async () => {
    const fetchImpl = respond({ usage: { prompt_tokens: 10 }, error: 'nope' }, 500)
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTokenFloorError,
    )
  })

  it('is a transport error on a non-200 that cleared the floor', async () => {
    const fetchImpl = respond({ usage: { prompt_tokens: 2_800 }, error: 'nope' }, 502)
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTransportError,
    )
  })

  it('is a transport error on an empty completion, not a silent empty description', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 2_800, completion_tokens: 0 },
      choices: [{ message: { content: '   ' } }],
    })
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTransportError,
    )
  })

  it('sends an OpenAI-shaped envelope with an image_url part and thinking disabled', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 2_800, completion_tokens: 100 },
      choices: [{ message: { content: 'ok' } }],
    })
    await describeNinaImagesWithFetch(fetchImpl, [IMAGE])
    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]
    const body = JSON.parse(String(init.body))
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.messages[1].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: IMAGE.dataUri },
    })
  })
})

describe('the describe prompt', () => {
  it('forbids reading out numbers — invariant 2 at the vision boundary', () => {
    expect(NINA_DESCRIBE_SYSTEM_PROMPT).toMatch(/NEVER read out a number/)
  })
})
```

**12c — `lib/nina/imageTicket.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'

import {
  NINA_TICKET_TTL_MS,
  signNinaImageTicket,
  verifyNinaImageTicket,
} from './imageTicket'

const SECRET = 'unit-test-secret'
const CLAIMS = {
  userId: 'user_abc123',
  pathname: 'nina/user_abc123/chat/aaaaaaaaaaaa-Xy7.jpg',
  blobUrl: 'https://blob.example/nina/user_abc123/chat/aaaaaaaaaaaa-Xy7.jpg',
  width: 1024,
  height: 768,
  bytes: 150_000,
  description: 'Soaked through, grinning, low sun behind him.',
}

describe('the image ticket', () => {
  it('round-trips every claim', () => {
    const ticket = signNinaImageTicket(CLAIMS, SECRET, 1_000)
    const verdict = verifyNinaImageTicket(ticket, { userId: CLAIMS.userId, now: 2_000 }, SECRET)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) {
      expect(verdict.claims.description).toBe(CLAIMS.description)
      expect(verdict.claims.pathname).toBe(CLAIMS.pathname)
      expect(verdict.claims.exp).toBe(1_000 + NINA_TICKET_TTL_MS)
    }
  })

  it('carries a null description, so a failed describe is still sendable', () => {
    const ticket = signNinaImageTicket({ ...CLAIMS, description: null }, SECRET)
    const verdict = verifyNinaImageTicket(ticket, { userId: CLAIMS.userId }, SECRET)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.claims.description).toBeNull()
  })

  it('refuses a tampered description — the reason this exists', () => {
    const ticket = signNinaImageTicket(CLAIMS, SECRET)
    const [payload, signature] = ticket.split('.')
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    forged.description = 'He set a new personal best of 3 minutes per kilometre.'
    const rewritten = `${Buffer.from(JSON.stringify(forged), 'utf8').toString('base64url')}.${signature}`
    expect(verifyNinaImageTicket(rewritten, { userId: CLAIMS.userId }, SECRET)).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('refuses another secret, another user, and an expired ticket', () => {
    const ticket = signNinaImageTicket(CLAIMS, SECRET, 1_000)
    expect(verifyNinaImageTicket(ticket, { userId: CLAIMS.userId }, 'other').ok).toBe(false)
    expect(verifyNinaImageTicket(ticket, { userId: 'user_other' }, SECRET)).toEqual({
      ok: false,
      reason: 'wrong_user',
    })
    expect(
      verifyNinaImageTicket(
        ticket,
        { userId: CLAIMS.userId, now: 1_000 + NINA_TICKET_TTL_MS + 1 },
        SECRET,
      ),
    ).toEqual({ ok: false, reason: 'expired' })
  })

  it('returns a verdict, never throws, on garbage', () => {
    for (const bad of ['', '.', 'nodot', 'a.', '.b', 'x'.repeat(5_000)]) {
      expect(verifyNinaImageTicket(bad, { userId: CLAIMS.userId }, SECRET).ok).toBe(false)
    }
  })
})
```

**Impact:** three new suites, no existing suite touched.

---

## Verification

**Build:**

```
npm run format && npm run typecheck && npm run lint
```

`format` first, not as an afterthought: `prettier-plugin-tailwindcss` sorts class strings and this
phase writes a composer, a tile strip and an image grid.

**Tests:**

```
npm test
npm run ci:client-secret-guard   # the Composer is 'use client' and imports lib/nina/images.ts
npm run ci:llm-payload-boundary  # sendNinaMessage is still the only sanctioned turn caller
npm run ci:openrouter-guard      # unchanged; this phase touches no OpenRouter path
```

`ci:client-secret-guard` is the one worth naming: `components/nina/Composer.tsx` is a client
component that now imports `lib/nina/images.ts` and calls a Server Action. `lib/nina/images.ts` is
import-free by design and `lib/nina/actions.ts` is `'use server'`, so nothing server-only crosses
the boundary — **and if the implementer is ever tempted to import a constant from
`lib/nina/vision.ts` into the composer, this guard is what will stop it, because that module opens
with `import 'server-only'` and reads `@/lib/env`.**

**A live check, opt-in, following F04's `tests/live/**` precedent.** Not part of `npm test`:

```
LLM_LIVE_TEST=1 npx vitest run tests/live/ninaVision.live.test.ts
```

One case, and it is the case that cannot be faked: send a real photograph through
`describeNinaImages` and assert three things — the call clears its own floor, the description is
between 200 and 1,200 characters, and **it contains no digit** (`expect(description).not.toMatch(/\d/)`).
That last assertion is invariant 2 measured rather than asserted in a prompt, and it is the one
regression this phase could ship silently. Add it to `package.json` as
`"test:live:nina-vision"` beside F04's existing live script.

**Manual check** — the four things the exit criteria are actually about, on a phone:

1. **Image-only.** Pick one photo, tap send without typing. It must send. Her reply must mention
   something that is genuinely in the picture — the light, the sweat, the place — and not a number.
2. **Image plus text.** Pick a photo, type a caption, send. The photo appears in the bubble above
   the caption, and her reply answers both.
3. **The floor.** Temporarily point `LLM_VISION_BASE_URL` at `https://api.z.ai/api/anthropic` in
   `.env.local` and send a photo. The server log must show `[nina] TOKEN FLOOR TRIPPED on a chat
   image`, the tile must still become sendable, and Nina must **ask what the photo is** rather
   than describe it. Put the URL back. This is the one manual step nobody should skip: it is the
   exact failure `lib/env.ts` warns about and the only way to see the guard work.
4. **The upload path.** Watch the network panel. The 4xx-free sequence is
   `POST /api/upload` (a tiny JSON handshake) then a `PUT` **straight to
   `*.public.blob.vercel-storage.com`**. If image bytes ever appear in the body of a request to
   `/api/upload`, the branch was written wrong.

**Exit criteria:**

- An image-only message is a valid send and produces a reply that references what is actually in
  the picture.
- `glm-5.3` receives `imageDescriptions` as text and there is no image block anywhere in a request
  to `LLM_BASE_URL`. (`grep -rn "image_url\|type: 'image'" lib/nina/` returns hits only in
  `prompts/describe.ts` and `vision.ts`.)
- A dropped image trips `NinaVisionTokenFloorError` and reaches Nina as
  `NINA_DESCRIPTION_UNAVAILABLE` — she asks, she does not invent.
- Uploaded bytes never pass through a Vercel Function; `/api/upload` still only mints tokens, and
  the chat branch's pathname check binds the write to the authenticated user.
- `nina_message_images` rows exist with `kind: 'upload'`, a non-null `description`, ascending
  `sort_order`, and a `pathname` under `nina/<userId>/chat/`.
- `npm run typecheck && npm run lint && npm test` and every `ci:*` guard pass.

## Assumptions

Things this phase quotes as they will look **after** phases 1, 3 and 4 land. Item 1 is no longer an
assumption at all — it was ruled on (A1) and is recorded here as the settled boundary.

1. **`listNinaMessages`'s DTO field for the message text: `body`. SETTLED (ruling A1), and this
   phase was right.** Step 11's `row.body` is correct, and so is phase 4's mapper. The seam has
   **three layers, three spellings and exactly one mapper**, and every one of them is deliberate:

   | layer | owner | the message fields |
   |---|---|---|
   | `lib/db/schema.ts` — the columns | phase 1 | `text`, `sent_at` (Drizzle: `ninaMessages.text`, `ninaMessages.sentAt`) |
   | `lib/nina/queries.ts` — the data-access DTO (`NinaMessageRow`, `NinaMessageInsert`) | phase 1 | **`body`, `createdAt`** — uniformly, in **every** function, because they all `select(messageColumns)` |
   | `lib/nina/context.ts` — the prompt-layer input (`MessageInput`) | phase 2 | `text`, `sentAt` |

   The single translation point is `lib/nina/gateway.ts`'s `dbNinaSourceGateway` (phase 3), which
   maps `NinaMessageRow → MessageInput` with `text: row.body` and `sentAt: row.createdAt`. **No
   side is to be "fixed" to match the other** — the three spellings are the three layers, and
   collapsing them would either put a column name in a prompt type or a prompt name in a column.
   Phase 3's earlier "the reconciler should pick `text` and edit phase 4's one destructure" is
   deleted from phase 3's plan. Step 11 stands exactly as written, `row.body` included, alongside
   its `row.id` and `row.createdAt` reads.
2. **The message insert accepts an empty body.** An image-only message has no words and the column
   is `NOT NULL`, so the empty string is the value. Phase 1's `NinaMessageInsert` types its text
   field — `body`, per A1's middle row — as `string` with no `.min(1)` anywhere, so this holds as
   written; if a check constraint is ever added to `nina_messages.text`, it must permit `''`. The
   write path is `insertNinaMessages(userId, rows)` (batch, and **no caller-supplied `seq`**:
   ruling A2b makes `seq` a `bigserial` Postgres assigns), so this phase's one row goes in as
   `[{ role: 'runner', body: text }]`.
3. **Phase 3's `NinaTurnInput.imageDescriptions` is optional** (`readonly string[] | undefined`),
   so omitting it — every non-image turn, and every turn before this phase lands — compiles.
4. **`MessageBubble`'s `above` prop exists and is optional**, and phase 4 never passes it. Step 9c
   is therefore the first and only caller, and `MessageBubble.tsx` is not edited.
5. **`AUTH_SECRET` is present at runtime wherever `describeNinaImage` and `sendNinaMessage` run.**
   It is in `authEnv()` (`lib/env.ts:64`), which F02 already calls at module scope in `auth.ts`, so
   a missing value is a boot crash rather than a mid-request one. No new variable, no
   `.env.example` change, and nothing for phase 1 to add.

## Handoffs

Work found and deliberately left, with its owner. The first four are **records of decisions already
taken**, not asks.

- **RECORD — `describeNinaImage` is in the guard, and it landed in phase 1 (ruling D1).** This
  phase's ask was accepted: `scripts/check-llm-payload-boundary.mjs`'s rule 1 is deleted (RU-1) and
  its rule 2 is now a `GUARDED_CALLS` table that **phase 1 ships whole**, including this symbol.
  Nothing to add here, and this phase's Files table no longer lists the file.

  **The sanctioned callers for `describeNinaImage` are two, and the second one is the point:**
  `lib/nina/actions.ts` (the definition site) **and `components/nina/Composer.tsx`**. The guard
  greps the symbol across `app/`, `lib/` **and** `components/`, and the real caller is the
  composer's client event handler (Step 8's `describeNinaImage({ blobUrl, pathname, … })` inside
  the per-tile upload effect) — so a table listing only `actions.ts` would fail CI the moment this
  phase lands. That is the whole reason the row reads as it does:

  | symbol | sanctioned callers | why |
  |---|---|---|
  | `describeNinaImage` | `lib/nina/actions.ts`, `components/nina/Composer.tsx` | phase 6 |

- **RECORD — a second describe prompt for a photo *of Nina* is PHASE 15's, and it is
  `lib/nina/prompts/describe.ts`'s second constant.** This phase flagged the gap and it is real:
  `NINA_DESCRIBE_SYSTEM_PROMPT` is written as "the eyes of someone's close friend" describing
  *him*, and pointed at a photo of Nina it would produce a careful description of the wrong
  person's outfit. R25 wants "where is she and what is she doing", which is a different prompt.

  **Assigned to phase 15**, which writes `NINA_DESCRIBE_AVATAR_SYSTEM_PROMPT` (or whatever it
  names it) as an **additive constant in `lib/nina/prompts/describe.ts`** — this phase's file,
  appended to, never rewritten. Phase 15 is the phase that actually runs the pre-pass over a
  hand-uploaded avatar and it is the phase that knows what R25's story needs. **Phase 14 does not
  describe at all**: its script uploads and re-anchors, and phase 15's page is where a description
  is filled or retried. Everything else in `lib/nina/vision.ts` is reusable exactly as it stands —
  `describeNinaImages(refs, opts)` takes `{ blobUrl, pathname }` and knows nothing about chat, and
  `describeTokenFloor`, `NinaVisionTokenFloorError` and `NinaVisionTransportError` are reusable
  as-is with no edit to this phase's files.
- **RECORD — this phase is now in the `depends_on` of phases 12, 13 and 15.** Worth knowing when
  reading this plan, because it changes what "additive" means for its two pure modules: three
  later phases import from `lib/nina/images.ts` (`NINA_BLOB_PREFIX`, ruling A6) and from
  `lib/nina/vision.ts` (`describeNinaImages`, `describeTokenFloor` and the two error classes, for
  the avatar pre-pass phase 15 owns). Edges: **12 gains 6, 15 gains 6, 13 already had it.** The
  practical rule that follows: a rename or a signature change in either module is no longer a
  phase-6-local edit, and `lib/nina/images.ts` must stay pure and zero-import forever — see the
  Interface Contract's **Provides** note.
- **Phase 12's `kind: 'generated'` rows.** The row shape is reported in full above. The two columns
  this phase leaves for it are `prompt` (null here, always set there) and `description` (which
  phase 12 fills from its own generation prompt rather than by running the describe pre-pass —
  cheaper, and more accurate, since it knows what it asked for).
- **Phase 13's gallery.** Every row this phase writes is already indexed for it
  (`nina_message_images_user_created_idx`, newest first, no join). Two notes: `kind` is the
  his/hers discriminator, and `ChatImages` is deliberately **not interactive** — tap-to-open is
  phase 13's, using `components/ui/PhotoViewer.tsx` and `lib/photos/gallery.ts` unchanged, and it
  should widen `ChatImages` with an `onOpen` prop rather than write a second image grid.
- **RULING E1 — `bg-ink-3/20` IS the inset surface inside a bubble, binding on phases 7, 8 and
  13.** This phase's argument won: `app/globals.css` sets `--ink-3` to `#93a2b0` in light and
  `#7c8d9b` in dark, so it is a mid-grey in both schemes and an alpha of it composites correctly
  over `bg-ink` and over `bg-card` alike, where `bg-paper-2` inverts. Step 9 shows the four-way
  composite. One class, no per-side branch, no new token. Phase 8's `bg-current/10` loses because
  phase 8's own plan admitted that arbitrary-opacity mechanism was **unverified in this Tailwind
  setup**, and an unverified mechanism must not be the shared answer for four phases; its
  `bg-current/10` block, its `data-[role=…]` fallback and its Open Question 4 are deleted from its
  plan in favour of this.
- **RULING E2 — the final `above` composition, which this phase ships half of.** `MessageList`
  owns the expression; phase 6 ships the images-only branch and phase 8 widens the same expression
  to the two-branch stack, verbatim:

  ```tsx
  <MessageBubble
    message={m}
    quote={resolveQuote(m, index)}          // phase 7 — its own prop, rendered ABOVE `above`
    above={
      m.imageUrls?.length || m.attachment != null ? (
        <div className="space-y-2">
          {m.imageUrls?.length ? <ChatImages urls={m.imageUrls} /> : null}   {/* phase 6 */}
          {m.attachment != null ? <RunAttachmentCard attachment={m.attachment} /> : null}  {/* phase 8 */}
        </div>
      ) : undefined
    }
  />
  ```

  The quote is **not** in `above` — phase 7 gives it its own `quote` prop on `MessageBubble`,
  rendered above the slot, and phase 8's competing nested-`ReplyQuote` expression is overruled. The
  render order inside the bubble is **quote stub → images → run card → text**. `ChatImages` owns
  its own `mb-2`, as `RunAttachmentCard` does, so the stack needs no wrapper margins.
- **A blob reaper for `nina/`: one named follow-up card, and it is not this phase's.** Teach
  `scripts/blob-reap.mjs` a second `nina/` prefix with reference sites
  `nina_message_images.pathname` and `nina_avatars.pathname`, and update
  `.claude/skills/reap-orphaned-blobs/SKILL.md` (ruling D4 — the card is named in the index, and
  it cannot be written before its reference sites exist, which the skill's own doc requires).

  For the record on *this* phase's share of it: the two orphan paths here — a tile removed after
  its PUT landed, and a describe that succeeded on a message never sent — are cheap, are not bugs,
  and are the same trade `UploadPicker`'s kind-change abandonment already makes. The one
  **genuine** orphan producer in the whole set is phase 12's store-then-row-write-fails, and phase
  12 has been given a compensating best-effort `del()` inside the `catch` that closes the job. So
  the deferred card covers only harmless bytes, which is why deferring it is bounded rather than a
  leak.
- **No `nina_message_images` row for a *removed* tile.** Deliberate: nothing is written until the
  message is sent, so a removed tile leaves only bytes, never a row. That is why the reaper note
  above exists instead of a cleanup path here.
- **HEIC.** `compressForNina` inherits F04's fallback message ("pick it from Photos rather than
  Files"). iOS's own share sheet transcodes to JPEG in almost every path, so this is a message and
  not a feature. A real HEIC decoder is a separate card and probably never needed.
- **Multi-image describe in one call.** `describeNinaImagesWithFetch` and the floor already take
  an image array and `NINA_DESCRIBE_REQUEST_TEXT_MANY` exists, so batching is a two-line change.
  Not done: three parallel single-image calls are *faster* than one batched call and give a
  strictly stronger guard. Only revisit if per-request pricing ever beats per-token.
- **`ChatScreen` still does not `router.refresh()`** after a turn (phase 4's decision, unchanged
  here), so a photo sent in one tab does not appear in another until reload. Phase 10 owns that
  hook if it ever wants it.

## Rollback

Additive except for four surgical edits, so reverting the phase's commit is sufficient — and the
tree is green at every point in between.

**The seven new files** (`lib/nina/images.ts`, `prompts/describe.ts`, `vision.ts`,
`imageTicket.ts`, `lib/photos/compressForNina.ts`, `components/nina/ChatImages.tsx`, plus the three
test suites) can simply be deleted; nothing outside this phase imports them.

**The four edits, and how each backs out:**

| file | how to revert |
|---|---|
| `app/api/upload/route.ts` | delete the `isNinaChatRequestPathname` branch and the one import block. The F04 branch below it was never modified, so its behaviour is unchanged either way |
| `lib/nina/actions.ts` | delete `describeNinaImage`; restore `sendNinaMessage`'s refusal to `text.length === 0`, drop `imageTickets`, drop STEP 1b, and drop `imageDescriptions` from the `runNinaTurn` call. Phase 3's `NinaTurnInput.imageDescriptions` is optional, so the turn compiles with it absent |
| `components/nina/{types,MessageList,ChatScreen,Composer}.tsx` | `imageUrls` is optional and `above` is optional, so 9a and 9c revert independently. `Composer`'s `onSend` and `userId` must revert **together with** `ChatScreen`'s call site — that pair is the only ordering constraint in the rollback |
| `app/nina/page.tsx` | drop the second query, the `Map`, the `imageUrls` field and the `userId` prop |

**Nothing to undo in the database.** Phase 1 owns the migration; this phase only writes rows.
Rolling back leaves existing `nina_message_images` rows in place, which is harmless: phase 4's
mapper ignores columns it does not read, so those messages simply render as text again.

**Nothing to undo in Blob.** Blobs already written stay written and stay referenced by their rows.
See the reaper handoff.

**One thing that survives a revert and should be kept:** the `[nina] TOKEN FLOOR TRIPPED` log line
and the text-aware floor are the only record in the repo that a flat 500-token floor does not
survive a long prompt. If this phase is ever reverted and rewritten, **re-read Step 3 first.**
