# Code Analysis: Nina's image pipeline, the asynchronous chat turn, and permanent session deletion

**Type:** Bug Investigation + Feature Implementation
**Date:** 2026-09-06 20:45:33 +07:00
**Session ID:** 20260906-204533-IMG9
**Plan:** `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md` (7 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-image-pipeline-and-async-chat`, branch `feature/nina-image-pipeline-and-async-chat` (base `origin/main` @ `02dc79a`)

---

## User Input

### Original User Request

> feat: in sidebar, add a button that will redirect user to a new page: a page feature to track the stage of each image generation. just like how we can click and directly pinpoint reply_to message, we can also click one item in the job list , it will redirect us to a new page: image generation detail page, and here there is a button that will redirect us to the chat, at the exact bubble that trigger this job. user can also see the exact prompt of image generation, how long the job has been going on, what is the error status , etc.
> up until this point , THERE ISN'T ANY PHOTO THAT IS SUCCESSFULLY GENERATED THROUGH CHAT. this is an absolute priority right now, we have to fix this problem.
> put this image generation tracking section below media section (after user click nina profpic).
> also, is there an asynchronous api for openrouter image generation? i think this will solve alot of our problems.
> try to make an end to end test , from chat asking nina to change profpic, until that profpic truly being updated
> make sure user message can immediately be sent, so the process of user sending message - getting answer from nina is asynchronous. right now, when i send a message, the message is in a "gray" state, until nina answered the message. but i want this to act just like whatsapp. i send the message, it quickly shown that the message is sent, then the app does not care whether user close the app or not, because nina will send the answer either way.
> make sure that once image generation background task has started, it wouldnt matter even if user close the app
> additional: make sure deleted chat sessions are deleted permanently from the db. i am using this app as my personal toy and i see that the deleted sessions polluted nina character and it gets worse as time goes on
>
> ask me any questions. let's start cooking.

### User-Provided Context

No files were marked with `@`. No error logs were pasted. Every measurement in this document was
taken by this session against the live GitHub Actions history and the production Neon database.

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | A sidebar button opening a new page that tracks the stage of each image generation; tapping a job opens an **image generation detail page** showing the exact prompt, how long the job has been running and the error status; that page carries a button that jumps back to the **exact chat bubble that triggered the job**, the way tapping a `reply_to` quote pinpoints its target |
| R2 | **No photo has ever been successfully generated through chat.** Fix it. Absolute priority. |
| R3 | Put the image-generation tracking section **below the Media section** on Nina's detail page (reached by tapping her profile picture) |
| R4 | Is there an asynchronous API for OpenRouter image generation? |
| R5 | An end-to-end test: from a chat message asking Nina to change her profile picture, through to that profile picture actually being updated |
| R6 | The user's message must send **immediately** — WhatsApp-style. Send → shown as sent at once; Nina's reply arrives independently, and closing the app must not stop it |
| R7 | Once an image-generation background task has started, closing the app must not matter |
| R8 | Deleted chat sessions must be **permanently** deleted from the database — the user observes deleted sessions still polluting Nina's character, worsening over time |

---

## Detailed Requirements Understanding

### Problem / Requirement Statement

Two distinct classes of work, plus one question.

**A broken pipeline (R2, R7).** Nina can ask for a photograph — `generate_image` and `set_avatar`
are live tools, the job rows are written, GitHub Actions is dispatched, the workflow runs — and yet
not one photograph has ever reached a chat bubble. This session found **three independent,
individually sufficient defects**, each measured, documented under *Root Cause Analysis* below. Two
of them are structural: one makes a targeted dispatch mathematically incapable of claiming the job
it was dispatched for, and one makes every successful generation crash on the write that would have
saved it — **after** the money was spent.

**A blocking send (R6).** `sendNinaMessage` is a Server Action that persists the runner's message
and then *awaits* a 13–45 s model turn before returning. The composer holds the bubble in its
"sending" state for the whole turn, and navigating away kills the client half of the interaction.

**A leaking delete (R8).** `removeNinaChatSession` already hard-deletes the session and cascades to
messages and image rows. What survives — deliberately, per `lib/db/schema.ts:845` — is the distilled
**memory ledger**: `nina_memory_facts` and `nina_memory_slots` carry `source_message_id` as a plain
`text` column with **no foreign key**, so a fact distilled from a deleted conversation stays in
Nina's prompt forever. That ledger is global, read on every turn, and 13 facts + 6 slots are live
right now. This is the observed "pollution", and it is the only surviving channel by which a deleted
session can still reach her.

**A question (R4).** Answered below, from the vendor documentation, with a consequence that changes
the architecture.

**Three surfaces (R1, R3, R5).** Job tracking pages, a tracking section on her detail page, and an
end-to-end test.

### Success Criteria

1. A chat message asking Nina for a photo produces a `nina_message_images` row with
   `kind = 'generated'` and a visible bubble. Today that table has **zero rows, ever**.
2. A chat message asking Nina to change her profile picture produces a `nina_avatars` row with
   `source = 'generated'` and `is_current = true`. Today `nina_avatars` holds **only** `source =
   'admin'` rows.
3. Send returns in well under a second with the bubble marked sent; the reply lands afterwards
   whether or not the tab is open.
4. Closing the app during a generation changes nothing about the outcome.
5. `/nina/jobs` lists every image job with stage, elapsed time and error; `/nina/jobs/[id]` shows the
   prompt and jumps to the triggering bubble.
6. `/nina/about` grows a tracking section directly below Media.
7. Deleting a session leaves nothing of it in the database that can reach Nina's prompt.
8. An end-to-end test drives 1–2 above and fails loudly when they regress.

### Key Considerations, Constraints and Assumptions

- **The repository is public.** `workflow_dispatch` inputs are world-readable; the current design
  deliberately publishes only an opaque nanoid. Any replacement must not regress that.
- **Money is real.** Generation is $0.040 per image, cap 6/day (`NINA_IMAGE_DAILY_CAP`). Two of the
  measured failures **spent that money and stored nothing** — see the 55.6 s and 73.9 s latencies in
  the job table below.
- **One user, one toy.** Correctness and legibility beat throughput at every fork.
- **Assumption:** the user wants the photograph, not the GitHub Actions design. RU-19/RU-20 are
  treated as revisable facts, not as constraints — and *Finding 4* shows the measurement they rest on
  has expired.

---

## Analysis Scope

### Explicitly Mentioned Files

None.

### Discovered Related Files

The image pipeline, end to end:

| File | Role |
|---|---|
| `lib/nina/imagerecipe.ts` | Zero-import shared constants: model, endpoint, thresholds, `NinaImageJobArgs`, `buildImageRequestBody` |
| `lib/nina/imagejobs.ts` | App-side job lifecycle on `nina_turns`: open, mark dispatched, fail + apologise, stale sweep, list |
| `lib/nina/imagedispatch.ts` | The GitHub `workflow_dispatch` doorbell, fired inside `after()` |
| `lib/nina/imagegen.ts` | Prompt assembly and sidecar text |
| `lib/nina/imagefail.ts` | Zero-import failure classification and Nina's apology copy |
| `lib/nina/selfiegen.ts` | Chat-selfie entry point |
| `lib/nina/avatargen.ts` | Avatar entry point (`set_avatar`, promise evaluator, admin) |
| `lib/nina/imagetools.ts` | `generate_image` tool handler |
| `lib/nina/avatartools.ts` | `set_avatar` tool handler; `NINA_FULL_TOOL_SET` |
| `scripts/nina-image-worker.ts` | The generator. Runs on GitHub Actions. Writes its own SQL. |
| `.github/workflows/nina-image.yml` | `workflow_dispatch` + `schedule: */10` |

The chat turn:

| File | Role |
|---|---|
| `lib/nina/actions.ts` | `sendNinaMessage` — the blocking Server Action |
| `components/nina/ChatScreen.tsx` | The client half; the staggered reveal; deliberately **not** in a transition |
| `components/nina/Composer.tsx` | Send button, draft state |
| `lib/nina/live.ts` | `mergeServerMessages`, `SW_MESSAGE_TYPE = 'nina:new'` — the service-worker wake-up seam |
| `lib/nina/turn.ts` | The model turn itself |
| `app/nina/page.tsx` | `maxDuration = 60`; awaits `listOpenNinaImageJobs` (which sweeps) |
| `app/api/cron/nina/route.ts` | The evening proactive pass; also the profpic-announcement nudge endpoint |

Sessions, memory, and the surfaces:

| File | Role |
|---|---|
| `lib/nina/sessionActions.ts` | `removeNinaChatSession` — the hard delete |
| `lib/nina/queries.ts` | `removeNinaSession`, `insertNinaMessages`, memory reads/writes |
| `lib/nina/sessionResolve.ts` | `resolveNinaSessionForMessage` — the policy the worker does not use |
| `lib/nina/distill.ts` | Writes `nina_memory_facts` / `nina_memory_slots` with `sourceMessageId` |
| `lib/nina/context.ts` | Assembles her prompt: session window + **global** memory ledger |
| `components/nina/NinaSidebar.tsx` | The overlay sidebar (R1's button lands here) |
| `components/nina/NinaAboutScreen.tsx` | Album + Media sections (R3 lands below Media) |
| `app/nina/about/page.tsx` | Her detail page |
| `lib/nina/reply.ts` | `planQuoteScroll`, `QUOTE_FLASH_MS` — the pinpoint mechanism R1 imitates |
| `lib/nina/scroll.ts` | `CHAT_SCROLL_PARAM = 'at'`, scroll-mark encode/decode |
| `lib/db/schema.ts` | `nina_turns`, `nina_messages`, `nina_message_images`, `nina_avatars`, memory tables |

---

## Root Cause Analysis — why no photograph has ever arrived (R2)

Four findings. The first three are defects; the fourth is an expired premise that makes the first
three cheap to fix permanently rather than expensive to patch.

### Finding 1 — the worker writes `nina_messages` without `session_id`, which is `NOT NULL`

**MEASURED.** GitHub Actions run `33986082744` (2026-09-05T19:06:09Z), job `pF5c6V8YbxAR`:

```
[nina-worker] claimed { jobId: 'pF5c6V8YbxAR', purpose: 'selfie', attempt: 1 }
[nina-worker] generation failed {
  jobId: 'pF5c6V8YbxAR', kind: 'transport', attempts: 1,
  detail: 'finish: NeonDbError: null value in column "session_id" of relation
           "nina_messages" violates not-null constraint'
}
[nina-worker] claimed { jobId: 'pF5c6V8YbxAR', purpose: 'selfie', attempt: 2 }
[nina-worker] generation failed { ... same ... attempts: 2 ... }
[nina-worker] fatal NeonDbError: null value in column "session_id" ...
    at async closeFailed (scripts/nina-image-worker.ts:539:5)
  detail: 'Failing row contains (EssIq6dte6wZ, 1111, 24076314-…, nina,
           gagal ngirim, internet gw lagi ngaco. bentar ya, chat, pF5c6V8YbxAR,
           rwMw9yUP8b-i, null, 2026-09-05 19:09:20.626802+00, null, null, null).'
```

**Mechanism.** `scripts/nina-image-worker.ts` writes its own SQL because it cannot import
`lib/nina/queries.ts` (that module uses `server-only` and `@/` aliases). Its two `nina_messages`
INSERTs — `finishSelfie` at line 434 and `closeFailed` at line 533 — enumerate
`(id, user_id, role, text, source, turn_id, reply_to_id)` and **omit `session_id`**.
`lib/db/schema.ts:855` made that column `.notNull()` in migration 0004, after this worker was
written. The app-side twin, `postNinaApologyMessage` in `lib/nina/imagejobs.ts`, resolves it
correctly through `resolveNinaSessionForMessage`; the worker has no equivalent.

**Blast radius — both branches.** `finishSelfie` is the *success* path: the picture was generated,
paid for, and stored in Blob, and the INSERT that would have made it visible throws. `runOneJob`
catches it and calls `closeFailed`, which — on the final attempt — performs the *same* unsafe INSERT
for the apology, throws again, and takes the whole process down before the `update nina_turns … set
status='failed'` ever runs. So the job stays `pending`, and the app's 20-minute sweep later marks it
`stale` with `cost_micro_usd: null`. **The money is spent and the ledger says it was free.**

**Why the preflight did not catch it.** `REQUIRED_COLUMNS` in the worker checks that every column it
writes *exists*. It does not check the converse — that every `NOT NULL` column without a default is
*written*. That is exactly the drift direction that occurred.

**Confirmation in the data.** `nina_turns` rows `pF5c6V8YbxAR` (`latency_ms` 73 925) and
`ChfwHZ2GJT4I` (`latency_ms` 55 600) both reached `attempts: 2` with real latency — the OpenRouter
call succeeded both times — and both ended `failed`/`stale` with `cost_micro_usd` NULL.

### Finding 2 — a targeted dispatch can never claim the job it was dispatched for

**MEASURED.** Runs `34007993636`, `34007845838`, `34007244364`, `34007211221`, `34006244544` — every
`workflow_dispatch` run on 2026-09-06 — logged exactly one line of work:

```
Run node … scripts/nina-image-worker.ts --job "ke20AUHNE0TB"
[nina-worker] finished { attempted: 0 }
```

**Mechanism — a two-line arithmetic contradiction.**

- `fireNinaImageDispatch` (`lib/nina/imagedispatch.ts:154`) calls `markNinaImageJobDispatched`
  **first**, setting `error_code = 'dispatched'`, and *then* POSTs to GitHub. The ordering is
  deliberate and documented ("two concurrent dispatch attempts therefore cannot both call the API").
- `claimJob` (`scripts/nina-image-worker.ts:262`) will claim a `dispatched` row only when
  `created_at < now − NINA_IMAGE_DISPATCH_GRACE_MS`, i.e. **older than 60 seconds**.
- A GitHub Actions run takes ~25–40 s from dispatch to the `Generate` step. Job `ke20AUHNE0TB` was
  created at `03:02:31.897Z`; the worker ran at `03:03:00.4Z` — **28.5 seconds old**.

The row is `dispatched`, and it is younger than the grace window, so the `WHERE` clause excludes it.
The `--job` argument narrows the selection but does not relax the phase predicate. **The doorbell
therefore rings a runner that is structurally forbidden from opening the door.** Not a race, not a
flake: no targeted dispatch can ever succeed on the first try, and the same job is equally excluded
on a retry until the schedule finds it.

**Confirmation in the data.** Of 18 image jobs ever opened, **15 sit at `attempts = 0`** — claimed by
nobody, ever — and every one of those 15 is `failed`/`stale`.

### Finding 3 — the `schedule:` backstop fires hours apart, not every ten minutes

The workflow declares `cron: '*/10 * * * *'` and the design leans on it: Finding 2's jobs would still
be rescued at ~10 minutes, comfortably inside the 20-minute `NINA_IMAGE_STALE_MS` give-up.

**MEASURED — actual `schedule` run times over the last two days:**

```
2026-09-06T13:01:11Z   2026-09-06T09:21:01Z   2026-09-06T05:02:58Z   2026-09-06T00:35:29Z
2026-09-05T22:56:43Z   2026-09-05T21:10:08Z   2026-09-05T19:06:09Z   2026-09-05T17:17:15Z
2026-09-05T15:06:34Z   2026-09-05T12:03:18Z   2026-09-05T08:38:38Z   2026-09-05T04:45:49Z
```

Gaps of **1 h 46 m to 4 h 19 m** — never ten minutes. GitHub documents `schedule:` as best-effort and
heavily deprioritises it on low-activity public repositories; the workflow's own comment anticipates
this ("delayed under load", "a good retry engine and a bad deadline") but the threshold chain was
derived as if `*/10` were honoured.

**Consequence.** The rescue path is one to two orders of magnitude slower than the deadline it is
supposed to beat. Every Finding-2 job goes `stale` long before any backstop looks at it. Findings 2
and 3 compose into a closed loop with no exit: **the fast path cannot claim, and the slow path
arrives after the job has already been declared dead.**

### Finding 4 — the 60-second ceiling that forced this architecture no longer exists

The entire off-platform design rests on one measurement, restated in five files:

> *"the shipping generation is 78.2 s measured and the Hobby ceiling in `sin1` is 60 s, so the work
> cannot happen on Vercel at all — not in a Server Action, not in a route handler, not in
> `after()`."* — `lib/nina/imagedispatch.ts`

**That number is stale.** Vercel's current documentation (`/docs/fluid-compute` and
`/docs/functions/configuring-functions/duration`, both `last_updated: 2026-08-24`) gives, for Fluid
compute:

| Plan | Default duration | Max duration |
|---|---|---|
| **Hobby** | **300 s (5 minutes)** | **300 s (5 minutes)** |
| Pro | 300 s | 800 s (1800 s beta) |
| Enterprise | 300 s | 800 s (1800 s beta) |

and states: *"As of April 23, 2025, fluid compute is enabled by default for new projects."*

**This project qualifies.** `vercel project inspect run-insights` reports **Created At: 20 August
2026** — sixteen months after that cutoff — so Fluid compute is on by default and the ceiling is
300 s, not 60 s. A 78.2 s generation fits with 3.8× headroom. A 45 s chat turn fits with 6.6×.

**Consequence.** The GitHub Actions host, the `workflow_dispatch` doorbell, the dispatch grace
window, the reclaim window, the `*/10` backstop and the two-host SQL duplication that produced
Finding 1 are all consequences of a constraint that has been lifted. They can be retired rather than
repaired. **This is treated as a docs-derived claim and the plan gates the migration behind an
empirical probe** — a deployed route with `maxDuration = 300` that sleeps past 60 s and reports back.

### Finding 5 (R4) — OpenRouter has no asynchronous image API

Checked against the vendor documentation:

- **Image generation is synchronous.** `POST /api/v1/images` returns base64 bytes in the response;
  `stream: true` yields SSE partial renders. There is no job id, no polling endpoint, no
  `callback_url`, no webhook. Supporting endpoints are discovery only (`GET /api/v1/images/models`,
  `GET /api/v1/images/models/{id}/endpoints`).
- **The async job API exists but is video-only.** `POST /api/v1/videos` → `GET /api/v1/videos/{id}`
  → `GET /api/v1/videos/{jobId}/content`, with `callback_url` webhooks signed by
  `X-OpenRouter-Signature` and deduplicated by `X-OpenRouter-Idempotency-Key`. Images are not
  eligible.

So the answer to the user's question is **no** — and it does not matter, because Finding 4 removes
the constraint that made an async provider API attractive. The durable-background problem is solved
on our side of the wire, not theirs.

### The measured state of the database

```
nina_turns where kind='image':
  failed / stale : 15   (oldest 2026-09-04T11:21Z, newest 2026-09-06T03:02Z)
  ok             :  3   (all 2026-09-04, ids include the literal fixtures
                         'e2e73tkuf82' and 'gha73tkufhj')

nina_message_images  : 0 rows, of any kind, ever
nina_avatars         : 13 rows — all source='admin'; zero source='generated'
nina_messages        : 48 rows; 0 rows carry a turn_id
nina_chat_sessions   : 3
nina_memory_facts    : 13
nina_memory_slots    : 6
```

**`nina_message_images` is empty and no message carries a `turn_id`.** The user's statement is exact:
not one photograph, and — because the apology path shares Finding 1's crash — not one apology either.
The three `ok` rows are dated before the sessions migration and two carry obvious fixture ids; none
of them left an image row or a generated avatar behind.

---

## Current Dataflow

### Entry point A — the runner asks for a photo in chat

**Location:** `components/nina/ChatScreen.tsx:647` → `lib/nina/actions.ts:225`
**Trigger:** the Send button.

1. `sendNinaMessage` validates, resolves reply target / run / attachment / **session** (STEP 0–0e).
2. **STEP 1** — the runner's `nina_messages` row is written. `session_id` supplied.
3. **STEP 2** — `loadNinaContext` + `loadRunHistory` + `readNinaTuning`, concurrently.
4. **STEP 3** — `runNinaTurn`, **13–45 s, awaited**. Tool set is `NINA_FULL_TOOL_SET`.
5. If the model calls `generate_image` → `handleGenerateImage` → `generateNinaSelfie`; if it calls
   `set_avatar` → `handleSetAvatar` → `generateNinaAvatar`. Both:
   - check `ninaImageQuotaLeft`,
   - `openNinaImageJob` → `insertNinaTurn` with `kind='image'`, `status='pending'`,
     `error_code='queued'`, `args` = the finished prompt + seed + `replyToId`,
   - `fireNinaImageDispatch(...)` — schedules the doorbell in `after()`.
6. Nina's bubbles are persisted and returned. The action resolves. **Only now** does the client mark
   the runner's bubble sent.

**Exit points:** `SendNinaMessageResult` to the client; a `nina_turns` row in `pending`/`queued`; an
`after()` callback pending.

### Entry point B — the doorbell (`after()`)

**Location:** `lib/nina/imagedispatch.ts:154`

1. `markNinaImageJobDispatched` — conditional UPDATE `queued → dispatched`. **Returns true once.**
2. `dispatchNinaImageJob` — `POST api.github.com/.../nina-image.yml/dispatches`, 8 s timeout,
   body `{ ref: 'main', inputs: { job_id } }`. 204 = accepted.
3. Config missing → `leaveForBackstop`, row left `dispatched`. GitHub refused → `failNinaImageJob`.

**State change:** `nina_turns.error_code = 'dispatched'`, **stamped ~25–40 s before the runner boots**
— Finding 2.

### Entry point C — the GitHub Actions worker

**Location:** `scripts/nina-image-worker.ts`, `.github/workflows/nina-image.yml`

1. `preflight` — env vars + `information_schema` column existence.
2. `claimJob` — the single conditional UPDATE. **Finding 2 lives in its `WHERE`.**
3. `generate` — `POST /api/v1/images/generations`, 240 s timeout, `{model, prompt, resolution,
   aspect_ratio, n, seed}`.
4. `store` — `put()` to Blob at `nina/<userId>/<purpose>-<id>.png`.
5. `finishSelfie` → `nina_messages` + `nina_message_images` + `nina_turns.status='ok'`
   — **Finding 1 kills this.**
   `finishAvatar` → `nina_avatars` transaction + `nina_turns.status='ok'` — survives Finding 1 (it
   writes no `nina_messages` row) but is never reached, because Finding 2 stops the claim.
6. `closeFailed` → retry (`error_code='queued'`) or terminal + apology — **Finding 1 kills the
   terminal branch.**

### Entry point D — the app-side sweep

**Location:** `lib/nina/imagejobs.ts:210`, called from `app/nina/page.tsx:194` on every render.

`pending` older than `NINA_IMAGE_STALE_MS` (20 min) → `failed`/`stale` + apology into the session
resolved from `replyToId`. **This is the only mechanism that has actually run**, and it is why all 15
orphaned jobs read `stale`.

### Entry point E — session deletion

**Location:** `components/nina/SessionRow.tsx` → `lib/nina/sessionActions.ts:removeNinaChatSession`
→ `lib/nina/queries.ts:827:removeNinaSession`

`DELETE FROM nina_chat_sessions WHERE user_id = $1 AND id = $2`. Cascades:
`nina_messages.session_id` → `nina_message_images.message_id`. **Does not touch**
`nina_memory_facts` / `nina_memory_slots` (no FK, by design) or `nina_turns` (no FK to session).

### Entry point F — the memory ledger reaches her prompt

`lib/nina/distill.ts:runTurnDistillation` (in `after()`) writes facts and slots stamped with
`sourceMessageId`. `lib/nina/context.ts:loadNinaContext(userId, sessionId, …)` reads **the session's
message window** plus **the whole-relationship memory ledger**. So the window is scoped and the
ledger is not — and the ledger is what survives a delete. **This is R8's mechanism.**

---

## Key Data Structures

### `NinaImageJobArgs` — `lib/nina/imagerecipe.ts`
`{ purpose, scene, mood, prompt, seed, replyToId, source, attempts, sidecar }`, stored in
`nina_turns.args` (`jsonb`). Carries everything R1's detail page needs: the exact prompt, the seed,
and `replyToId` — **the message id R1's "jump to the bubble" button resolves against**.

### `nina_turns` — `lib/db/schema.ts:579`
`kind='image'` rows are the job table. `error_code` doubles as the phase while `status='pending'`
(`queued`/`dispatched`/`running`) and as the failure reason when `status='failed'`. `created_at`,
`latency_ms`, `cost_micro_usd` give R1 its elapsed time and cost. **No `claimed_at` column exists** —
`claimJob`'s own comment flags this as the reason its `created_at` cutoff is a proxy.

### `nina_messages` — `lib/db/schema.ts:821`
`session_id text NOT NULL references nina_chat_sessions on delete cascade`. **The column Finding 1
omits.** `turn_id` is a plain column pointing at `nina_turns.id` — the join R1's job→bubble link
uses in the other direction.

### `NinaImageJobRow` — `lib/nina/imagejobs.ts`
`{ id, phase, purpose, attempts, createdAt }`. R1 needs strictly more: prompt, scene, status, error
code, latency, cost, `replyToId`, session id. The projection widens.

---

## Dependencies

**Configuration:** `GITHUB_DISPATCH_TOKEN`, `OPENROUTER_API_KEY`, `DATABASE_URL`,
`BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `AUTH_SECRET`. `ninaEnv()` is one zod group, so a missing
member throws for every member — the coupling `imagedispatch.ts` documents and tolerates.

**External services:** OpenRouter (`qwen/qwen-image-3-pro`), z.ai (`glm-5.3`, `glm-4.6v`), Vercel
Blob, Neon, GitHub Actions, Web Push.

**Platform:** Vercel Hobby, region `sin1`, Fluid compute (**300 s**, Finding 4), two crons at the
account cap (`/api/cron/rollup`, `/api/cron/nina`).

**CI guards** that constrain any change: `ci:openrouter-guard`, `ci:client-secret-guard`,
`ci:llm-payload-guard`, `ci:data-layer-guard`, `ci:f08-guard`, `ci:f11-guard`.

---

## Reference List

| Symbol / key | File:line | Kind | Notes |
|---|---|---|---|
| `finishSelfie` INSERT | `scripts/nina-image-worker.ts:434` | def | **Finding 1** — omits `session_id` |
| `closeFailed` INSERT | `scripts/nina-image-worker.ts:533` | def | **Finding 1** — omits `session_id` |
| `claimJob` WHERE | `scripts/nina-image-worker.ts:262` | def | **Finding 2** — grace excludes the named job |
| `REQUIRED_COLUMNS` | `scripts/nina-image-worker.ts:167` | def | existence only, not NOT-NULL coverage |
| `NINA_IMAGE_DISPATCH_GRACE_MS` | `lib/nina/imagerecipe.ts` | const | 60 000 |
| `NINA_IMAGE_STALE_MS` | `lib/nina/imagerecipe.ts` | const | 1 200 000 |
| `NINA_IMAGE_RECLAIM_MS` | `lib/nina/imagerecipe.ts` | const | 420 000 |
| `markNinaImageJobDispatched` | `lib/nina/imagejobs.ts:110` | def | stamps `dispatched` before the POST |
| `fireNinaImageDispatch` | `lib/nina/imagedispatch.ts:154` | def | `after()` doorbell |
| `sweepStaleNinaImageJobs` | `lib/nina/imagejobs.ts:210` | def | the only path that ran |
| `listOpenNinaImageJobs` | `lib/nina/imagejobs.ts:296` | def | R1 widens this |
| `getNinaImageJob` | `lib/nina/imagejobs.ts:330` | def | R1's detail read |
| `resolveNinaSessionForMessage` | `lib/nina/sessionResolve.ts` | def | the policy the worker lacks |
| `sendNinaMessage` | `lib/nina/actions.ts:225` | def | **R6** — awaits the turn |
| `ChatScreen` send handler | `components/nina/ChatScreen.tsx:647` | call | **R6** — the gray state |
| `mergeServerMessages` / `SW_MESSAGE_TYPE` | `lib/nina/live.ts` | def | R6's delivery seam |
| `maxDuration = 60` | `app/nina/page.tsx:128` | config | **Finding 4** — can be 300 |
| `maxDuration = 60` | `app/api/cron/nina/route.ts:56` | config | same |
| `removeNinaSession` | `lib/nina/queries.ts:827` | def | **R8** — cascade stops at messages |
| `nina_memory_facts.source_message_id` | `lib/db/schema.ts:1170` | schema | **R8** — no FK |
| `nina_memory_slots.source_message_id` | `lib/db/schema.ts:1126` | schema | **R8** — no FK |
| `runTurnDistillation` | `lib/nina/distill.ts:350` | def | R8 — the writer |
| `loadNinaContext` | `lib/nina/context.ts` | def | R8 — reads the global ledger |
| `planQuoteScroll` / `QUOTE_FLASH_MS` | `lib/nina/reply.ts:368` | def | **R1** — the pinpoint to imitate |
| `CHAT_SCROLL_PARAM = 'at'` | `lib/nina/scroll.ts:32` | const | R1 — existing chat URL param |
| `NinaSidebar` | `components/nina/NinaSidebar.tsx:201` | def | **R1** — the button's home |
| `NinaAboutScreen` Media `<section>` | `components/nina/NinaAboutScreen.tsx:233` | def | **R3** — insert below this |
| `nina-image.yml` | `.github/workflows/nina-image.yml` | config | **Finding 3** — `*/10` is not honoured |

---

## Impact Points (files that WILL need changes)

| # | File | Why | Phase |
|---|---|---|---|
| 1 | `scripts/nina-image-worker.ts` | Finding 1 (`session_id`), Finding 2 (claim), preflight widening | 1 |
| 2 | `lib/nina/imagerecipe.ts` | shared session-resolution helper for the worker; threshold changes | 1, 2 |
| 3 | `tests/nina.imageworker.test.ts` | regression tests for Findings 1 and 2 | 1 |
| 4 | `tests/nina.imagerecipe.test.ts` | the threshold chain changes | 1, 2 |
| 5 | *(new)* `app/api/nina/image/route.ts` | in-platform generation, `maxDuration = 300` | 2 |
| 6 | `lib/nina/imagedispatch.ts` | Vercel becomes primary; GitHub becomes backstop | 2 |
| 7 | `app/nina/page.tsx` | `maxDuration` 60 → 300 | 2 |
| 8 | `lib/nina/actions.ts` | R6 — split persist from turn | 3 |
| 9 | `components/nina/ChatScreen.tsx` | R6 — instant sent state; async arrival. R1 — deep-link scroll | 3, 4 |
| 10 | `lib/nina/live.ts` | R6 — arrival merge/poll | 3 |
| 11 | `lib/nina/imagejobs.ts` | R1 — widen the job projection; add the list/detail reads | 4 |
| 12 | *(new)* `app/nina/jobs/page.tsx`, `app/nina/jobs/[id]/page.tsx` | R1 | 4 |
| 13 | *(new)* `components/nina/JobList.tsx`, `JobDetail.tsx` | R1 | 4 |
| 14 | `components/nina/NinaSidebar.tsx` | R1 — the button | 4 |
| 15 | `components/nina/NinaAboutScreen.tsx` | R3 — section below Media | 5 |
| 16 | `app/nina/about/page.tsx` | R3 — the extra read | 5 |
| 17 | `lib/nina/queries.ts` | R8 — delete the session's memory too | 6 |
| 18 | `lib/nina/sessionActions.ts` | R8 — call it | 6 |
| 19 | *(new)* `drizzle/…` migration | R8 — optional FK/index to make the purge cheap | 6 |
| 20 | *(new)* `tests/integration/nina.profpicE2E.int.test.ts` | R5 | 7 |
| 21 | `.github/workflows/nina-image.yml` | Finding 3 — demoted to backstop, cadence honesty | 2 |

**This document describes. The plan files prescribe.**
