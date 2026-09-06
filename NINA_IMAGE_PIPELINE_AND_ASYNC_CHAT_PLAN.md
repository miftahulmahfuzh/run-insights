# Plan: Nina's image pipeline, the asynchronous chat turn, and permanent session deletion

**Slug:** `nina-image-pipeline-and-async-chat`
**Date:** 2026-09-06 20:45:33 +07:00
**Analysis:** `20260906-204533-IMG9_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-image-pipeline-and-async-chat`
**Branch:** `feature/nina-image-pipeline-and-async-chat` (base: `origin/main` @ `02dc79a`)
**Phases:** 7
**Status:** reconciled
**Coordinator:** —

---

## Why

The user's rationale, verbatim:

> up until this point , THERE ISN'T ANY PHOTO THAT IS SUCCESSFULLY GENERATED THROUGH CHAT. this is an absolute priority right now, we have to fix this problem.
>
> also, is there an asynchronous api for openrouter image generation? i think this will solve alot of our problems.
>
> make sure user message can immediately be sent, so the process of user sending message - getting answer from nina is asynchronous. right now, when i send a message, the message is in a "gray" state, until nina answered the message. but i want this to act just like whatsapp. i send the message, it quickly shown that the message is sent, then the app does not care whether user close the app or not, because nina will send the answer either way.
>
> make sure that once image generation background task has started, it wouldnt matter even if user close the app
>
> additional: make sure deleted chat sessions are deleted permanently from the db. i am using this app as my personal toy and i see that the deleted sessions polluted nina character and it gets worse as time goes on

## Requirements

This table is what `create-task` reads to shape the board's cards, so it maps every `R` to the
phases that **ended up** serving it after reconciliation, not the phases the draft guessed.

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Sidebar button → image-generation tracking page; a job opens a detail page with the exact prompt, elapsed time and error status, plus a button that jumps to the exact chat bubble that triggered it | 4 |
| R2 | No photo has ever been generated through chat — fix it. Absolute priority. | 1, 2 |
| R3 | Put the image-generation tracking section below the Media section on Nina's detail page | 5 |
| R4 | Is there an asynchronous OpenRouter image API? | 2 |
| R5 | End-to-end test: chat asks Nina to change her profpic → the profpic is truly updated | 7 |
| R6 | Send is instant and WhatsApp-like; Nina's reply arrives even if the app is closed | 3 |
| R7 | Once an image-generation background task has started, closing the app must not matter | 2 |
| R8 | Deleted chat sessions must be permanently deleted from the DB — they still pollute Nina's character | 6, **3** |

**Two `R`s moved during reconciliation, and both moves are real work changing owner, not
bookkeeping:**

- **R8 gains phase 3.** Phase 6 purges a deleted session's distilled memory in the same transaction
  as the delete — and found that phase 3, by moving `runTurnDistillation` into a background task,
  lengthens the window in which a distillation completing *after* the delete re-creates exactly the
  orphan class being purged (from milliseconds to up to 240 s). The fix lives in files phase 3 owns,
  so phase 3 took it: **Step 6d**, `ninaSessionExists` plus an abandon. R8 is not satisfied by phase
  6 alone, and a board card that said otherwise would leave the hole open.
  **Phase 3 does not depend on phase 6** and must not be made to — the guard is correct on its own
  terms, and the two phases still share no edge.
- **R2 stays with 1 and 2, but the cost-ledger half of it now spans four phases.** Invariant 9's
  "money is never spent silently" turned out to be violated by a per-attempt `cost_micro_usd` on
  both hosts; the fix touches phases 1, 2, 4 and 7. This is not a new `R` — it is R2's own success
  criterion ("the money is spent and the ledger says it was free" is one of the three measured
  defects) — so it is recorded in **Decisions** rather than split out.

**R4's answer, decided and recorded here so no phase re-derives it:** **No.** OpenRouter's image
generation (`POST /api/v1/images`) is synchronous — base64 in the response, or SSE partials with
`stream: true`. There is no job id, no polling endpoint, no `callback_url`, no webhook. The
asynchronous job API (`POST /api/v1/videos` → `GET /api/v1/videos/{id}`, `callback_url` +
`X-OpenRouter-Signature`) is **video-only**. Phase 2 records this in code comments and solves the
durability problem on our side of the wire instead — which Finding 4 of the analysis makes cheap.

## Scope

**In scope**

- The three measured defects that block every photograph (analysis Findings 1–3).
- Migrating the generator from GitHub Actions onto Vercel Fluid compute's 300 s ceiling
  (Finding 4), keeping GitHub Actions as a demoted backstop.
- Splitting `sendNinaMessage` so the runner's message persists and returns immediately and the
  model turn runs in a durable background task.
- Two new routes (`/nina/jobs`, `/nina/jobs/[id]`), a sidebar entry, and a section on
  `/nina/about`.
- Purging a deleted session's distilled memory.
- One end-to-end test over the profpic path.

**Out of scope**

- Face-anchored generation (`input_references`). RU-18 deferred it knowingly at a measured
  148.9 s vs 78.2 s; nothing here revisits that.
- Reaping orphaned `nina/` Blob objects. The `reap-orphaned-blobs` skill covers `shots/` and
  `nina/`; Finding 1 left paid-for bytes behind and that cleanup is a separate card.
- Badge and record art. D12's repeal is still scoped to `lib/nina/` only.
- Raising `NINA_IMAGE_DAILY_CAP`. Six a day is a money decision the user made; a working pipeline
  does not change the bill per photo.
- Migrating `/api/cron/rollup` or the Vercel cron count.

## Invariants

Every phase must hold all of these.

1. **The tree builds and `npm test`, `npm run lint` and `npm run typecheck` pass at the end of each
   phase.** No phase leaves the next one a broken tree.
2. **All six CI guards keep passing**: `ci:openrouter-guard`, `ci:client-secret-guard`,
   `ci:llm-payload-guard`, `ci:data-layer-guard`, `ci:f08-guard`, `ci:f11-guard`.
3. **No secret is ever `NEXT_PUBLIC_`**, and `GITHUB_DISPATCH_TOKEN` / `OPENROUTER_API_KEY` /
   `BLOB_READ_WRITE_TOKEN` are read only through `lib/env.ts` in app code, or `process.env` in
   `scripts/`.
4. **The repository is public.** Nothing that identifies a user, a prompt or a scene may travel as
   a `workflow_dispatch` input, appear in an Actions log, or be logged at `info` level in a public
   run. The opaque-nanoid rule stands.
5. **Ownership is proved in SQL.** Every read and write takes `userId` and puts it in the `WHERE`.
   No new endpoint trusts an id from a client.
6. **`nina_messages.session_id` is written by every writer of that table**, in app code and in
   `scripts/` alike. This is the invariant Finding 1 broke.
7. **No fabricated Nina prose.** App-authored words never render as her bubble; the only sanctioned
   in-character strings are `lib/nina/imagefail.ts`'s apologies and `avatartools.ts`'s
   `tool_result` notes.
8. **No new keyframe animation** (invariant 8 of the shipped app). Transitions only.
9. **Money is never spent silently.** Any path that reaches OpenRouter records `cost_micro_usd` on
   its `nina_turns` row, whether it succeeded or not.
10. **Migrations are generated, never hand-renamed** — `npm run db:generate`, then `db:check`.
    **As reconciled, this set generates none**: `drizzle/` must gain no file and `npm run db:check`
    must be clean at the end of every phase. The rule stands for whoever adds the first one.

## Phases

Reconciled scope, dependencies and file counts. `Files` is what each plan's own Files table now
lists, which differs from the draft's estimate in four places.

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Unblock the camera: the three measured defects | R2 | `scripts/`, `lib/nina` | 5 | — | HARD | `.workflows/plan/nina-image-pipeline-and-async-chat/phase-1.md` | `P1-NIN-A004` | — | miftahulmahfuzh/run-insights#96 |
| 2 | Move generation onto Vercel Fluid compute; demote GitHub Actions to backstop | R2, R4, R7 | `lib/nina`, `app/nina`, `app/api/cron/nina`, `.github/workflows` | 18 | 1 | HARD | `.workflows/plan/nina-image-pipeline-and-async-chat/phase-2.md` | `P1-NIN-A005` | — | miftahulmahfuzh/run-insights#97 |
| 3 | WhatsApp-style send: instant persist, durable background turn | R6, R8 (the delete-mid-turn guard) | `lib/nina`, `components/nina` | 9 | 2 | HARD | `.workflows/plan/nina-image-pipeline-and-async-chat/phase-3.md` | `P1-NIN-A006` | — | miftahulmahfuzh/run-insights#98 |
| 4 | Job tracking: `/nina/jobs`, the detail page, and the jump to the triggering bubble | R1 | `app/nina/jobs`, `components/nina`, `lib/nina` | 10 | 3 | NORMAL | `.workflows/plan/nina-image-pipeline-and-async-chat/phase-4.md` | `P1-NIN-A007` | — | miftahulmahfuzh/run-insights#99 |
| 5 | The tracking section on `/nina/about`, below Media | R3 | `components/nina`, `app/nina/about` | 2 | 4 | EASY | `.workflows/plan/nina-image-pipeline-and-async-chat/phase-5.md` | `P1-NIN-A008` | — | miftahulmahfuzh/run-insights#100 |
| 6 | Permanent session deletion: take the distilled memory with it | R8 | `lib/nina`, `scripts/` | 7 | — | NORMAL | `.workflows/plan/nina-image-pipeline-and-async-chat/phase-6.md` | `P1-NIN-A009` | — | miftahulmahfuzh/run-insights#101 |
| 7 | End-to-end: chat → `set_avatar` → generation → the profpic really changes | R5 | `tests/integration`, `tests/live` | 3 | 3 | NORMAL | `.workflows/plan/nina-image-pipeline-and-async-chat/phase-7.md` | `P1-RI-A017` | — | miftahulmahfuzh/run-insights#102 |

Phases 1 and 6 share no edge and start together. Phase 7 joins phase 4 once phase 3 lands. **No
phase's dependency points forward**, verified against every plan's `Requires` section.

**Scope changes absorbed from the plans, so nothing here is an unowned edit:**

- **Phase 2's package widened** from `app/api/nina` to include `app/api/cron/nina` and
  `.github/workflows`, and its file count from 8 to 18. Two absorbed items:
  `app/api/cron/nina/route.ts`'s `maxDuration` 60 → 300 (required, not cosmetic — `resolveNinaPromises`
  starts a `generateNinaAvatar` inside that route's `after()` budget, and a measured 78.2 s
  generation dies at 60 s; **no other phase touches that file**, verified), and one clause in
  `lib/nina/.workflows/package_readme.md` that still names the module phase 2 deletes.
- **Phase 2 creates NO `app/api/nina/image/route.ts`.** The analysis's impact-point row 5 expected
  one; phase 2's durability primitive is `after()` registered from the segment that already owns the
  request, so `lib/nina/imagerun.ts` stands where that row expected a route. Superseded, not
  skipped — see the Reconciliation Log.
- **Phase 3's package is unchanged but it now satisfies part of R8** (Step 6d), and its file count is
  9 rather than the draft's 7.
- **Phase 4 is 10 files, not 8** — the extra two are `tests/nina.jobview.test.ts` and
  `components/nina/NinaJobElapsed.tsx`, split out so the list and the detail share one ticker.
- **Phase 5 is 2 files, not 3** — the draft's third was a constant in `lib/nina/album.ts`, which its
  D-3 argues against.
- **Phase 6 is 7 files, not 5, and its package loses `drizzle`** — it generates no migration. The two
  extra files are the schema comment and the schema test whose prose asserts the design being
  overridden; the draft counted the mechanism and not the paper trail.

### Phase 1 — Unblock the camera: the three measured defects

**Satisfies:** R2
**Owns:**
- **Finding 1.** `scripts/nina-image-worker.ts`'s two `nina_messages` INSERTs (`finishSelfie`,
  `closeFailed`) must write `session_id`. The worker cannot import `lib/nina/queries.ts`, so the
  resolution policy must be expressed as SQL the worker owns, mirroring
  `resolveNinaSessionForMessage`: the session of `args.replyToId` when that message still exists,
  otherwise the user's most recent session, otherwise refuse to write rather than crash.
- **Finding 1's blast radius.** `closeFailed` must mark the job `failed` with `cost_micro_usd`
  **even when the apology INSERT fails** — the terminal UPDATE runs regardless, so money spent is
  never recorded as free (invariant 9).
- **Finding 1's class.** Widen `preflight` so it asserts, from `information_schema`, that every
  `NOT NULL` column without a default on each table this worker INSERTs into is covered by
  `REQUIRED_COLUMNS`. Existence checking alone is what let this ship.
- **Finding 2.** `claimJob` must claim a job named by `--job` regardless of the dispatch grace
  window. The grace exists to stop a *sweep* from stealing a job a runner is about to start; a
  named job was named by the doorbell, so the runner and the name are the same event. The
  `attempts < NINA_IMAGE_MAX_ATTEMPTS` bound stays — its own comment records that it is the only
  thing stopping an infinite reclaim loop.
- **Finding 3.** Record the measured schedule cadence (1 h 46 m – 4 h 19 m against a declared
  `*/10`) in the workflow's comments, and make `NINA_IMAGE_STALE_MS`'s derivation honest about it.
  Do **not** rebuild the backstop here — phase 2 owns that.
- **Invariant 9 on this host, RECONCILED IN.** Every `cost_micro_usd` write in the worker
  accumulates (`coalesce(cost_micro_usd, 0) + spend`): both `closeFailed` branches, **and**
  `finishSelfie` and `finishAvatar`. The draft deferred the two success paths to phase 2; that
  would have left the backstop — which is phase 2's rollback target — under-reporting a retried job
  by one whole generation. See Decisions.
- Regression tests in `tests/nina.imageworker.test.ts` for both findings: a `finishSelfie` that
  asserts `session_id` is in the statement, a `finishSelfie` that asserts the spend accumulates,
  and a `claimJob` that claims a 5-second-old `dispatched` row when named.

**Does not touch:** `app/`, `components/`, `lib/nina/actions.ts`, `lib/nina/imagejobs.ts`,
`lib/nina/imagedispatch.ts`, the dispatch host choice, any new route, any migration. It repairs the
shipped architecture in place.
**Exit criteria:** `npm run nina:worker` against a hand-opened job produces a `nina_message_images`
row and a visible bubble in the session the runner asked in; a targeted `--job` claim succeeds on a
job under 60 s old; **no `cost_micro_usd` write in the worker overwrites — every one is
`coalesce(...) + spend`**; `npm run nina:worker:dry` fails loudly on a NOT-NULL column the worker
does not write; `npm test`, `npm run lint`, `npm run typecheck` and all six guards green.

### Phase 2 — Move generation onto Vercel Fluid compute; demote GitHub Actions to backstop

**Satisfies:** R2, R4, R7
**Owns:**
- **The probe, first, and it gates everything else in this phase.** Deploy a route with
  `maxDuration = 300` that holds for ~90 s and reports its own wall clock. Finding 4 is
  documentation-derived (Vercel docs `last_updated: 2026-08-24`; project created 20 Aug 2026,
  after the 23 Apr 2025 Fluid-by-default cutoff). If the probe shows a 60 s cut-off, **stop**:
  this phase reduces to "keep GitHub Actions, fix the backstop cadence", and phases 3 and 7 are
  told so through the plan index.
- The in-platform generator: a server module that performs the OpenRouter call, the Blob `put`,
  and the finish/close writes, reusing `lib/nina/imagerecipe.ts` and `lib/nina/imagefail.ts` so the
  payload and the apology copy still have exactly one definition.
- Making it durable against the tab closing (R7): the work is started from `after()` / a fetch to
  an internal route, so it is the *server* that owns the remaining wall clock, not the browser.
- Retiring the Finding-2 deadlock at the source: with the generator in-platform there is no
  dispatch grace window to lose a job in.
- Demoting `.github/workflows/nina-image.yml` to a pure backstop, with its cadence claim corrected
  to what Finding 3 measured.
- Recording R4's answer (no async OpenRouter image API; the async job API is video-only) as a code
  comment where a future reader would otherwise go looking.
- Raising `app/nina/page.tsx`'s `maxDuration` from 60 to 300, and re-deriving the threshold chain
  in `lib/nina/imagerecipe.ts` for a host with a 300 s ceiling — **carrying phase 1's
  `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` and its test assertion forward through that rewrite.**
- **Raising `app/api/cron/nina/route.ts`'s `maxDuration` from 60 to 300** (absorbed scope, see the
  Phases table). `resolveNinaPromises` calls `generateNinaAvatar` from that route, and after this
  phase the generation runs in that route's `after()` budget; at 60 a promised photograph is killed
  at 60 s against a measured 78.2 s generation, silently, on a cron nobody watches. The loop's own
  `NINA_SOFT_DEADLINE_MS` pacing is deliberately NOT raised.
- **Invariant 9 in-platform:** `completeNinaImageJob`, `requeueNinaImageJob` and `failNinaImageJob`
  all accumulate `cost_micro_usd`, and `stale` leaves the column untouched rather than nulling a
  spend a retry already recorded. Same rule as phase 1, other host. See Decisions.
- The eighth `GUARDED_CALLS` entry in `scripts/check-llm-payload-boundary.mjs`. **This phase is the
  sole editor of that script in the set**, which is what the script's own header demands.

**Does not touch:** `components/nina/ChatScreen.tsx`, `lib/nina/actions.ts`'s send/turn split
(phase 3 owns both), the job-tracking read projection (phase 4 — `NinaImageJobRow`, `toJobRow`,
`listOpenNinaImageJobs`, `getNinaImageJob`, `PENDING_PHASES`, `sweepStaleNinaImageJobs` are all
untouched), the memory purge (phase 6), `scripts/nina-image-worker.ts` and
`tests/nina.imageworker.test.ts` (phase 1 — **not one line**), any migration.
**Exit criteria:** the probe's two measured numbers and the branch taken are recorded in the plan
file **and in this index's Decisions table**; a chat request for a photo produces a
`nina_message_images` row within ~2 minutes **with the tab closed**; a request to change her profile
picture produces the first ever `nina_avatars` row with `source='generated'`;
`lib/nina/imagedispatch.ts` and `GITHUB_DISPATCH_TOKEN` exist nowhere in `app/`, `lib/`,
`components/` or `.env.example`; the GitHub workflow still drains an orphaned job when run
manually; `db:check` clean.

### Phase 3 — WhatsApp-style send: instant persist, durable background turn

**Satisfies:** R6
**Owns:**
- Splitting `sendNinaMessage` at STEP 2. Everything up to and including the runner's row and its
  image rows stays synchronous and returns; `loadNinaContext` + `runNinaTurn` + the persist of her
  bubbles + `runTurnDistillation` move into a durable background task the server owns.
- The client contract change in `components/nina/ChatScreen.tsx`: the bubble goes to `sent` on the
  action's return, not on Nina's reply. The staggered reveal (`planReveal`) is preserved — it now
  runs on *arrival* rather than on *return*, and the file's own note about why this is not inside a
  transition still applies.
- Arrival: **a bounded poll** (`pollNinaReply`) while a turn is known to be in flight, plus the
  server-computed `flight` view so a cold load mid-turn starts polling on mount. A closed tab needs
  nothing — the rows are in the database and the next render has them.
  **RECONCILED: `lib/nina/live.ts` is NOT edited.** The draft expected arrival to ride the existing
  `mergeServerMessages` + `SW_MESSAGE_TYPE = 'nina:new'` push seam; phase 3 decided against it and
  the decision is recorded below. That seam stays untouched and keeps working for proactive
  pushes — `lib/nina/live.test.ts` must stay green without being edited, which is the proof.
- The typing indicator (`components/nina/TypingIndicator.tsx`) becomes the honest signal that a
  turn is running, replacing the gray "sending" state as the thing the user watches.
- What happens when a turn dies mid-flight: a runner message with no reply must be recoverable, not
  silently orphaned. State the mechanism explicitly. (`sweepStaleNinaChatTurns`, plus the claim on
  `nina_turns` that makes "did it die" answerable at all.)
- **R8's delete-mid-turn guard (Step 6d), taken over from phase 6's handoff.** A background turn
  whose session was deleted while it ran must abandon rather than persist — bubbles, distilled
  facts and the auto-title alike. `ninaSessionExists` + an early return, closing the turn as
  `error_code = 'session-gone'`. **This does not make phase 3 depend on phase 6**; the guard is
  correct on its own terms and the two phases still share no edge.

**Does not touch:** the image job lifecycle, the generator, the job pages, the memory purge itself
(`removeNinaSession` is phase 6's), `app/nina/page.tsx`'s `maxDuration` line (phase 2's), any
migration.
**Exit criteria:** the send action returns in under a second on a real message and the bubble reads
`sent` on that return; a reply persisted while the tab was closed is on screen after a reload; a
reply persisted while the tab was open arrives through the poll, revealed one bubble at a time; a
killed background turn leaves a `failed`/`stale` `nina_turns` row and the 'no-reply' notice —
**never a fabricated Nina bubble**; deleting a session mid-turn writes no memory row for it;
`tests/nina.*` green and all six guards pass **with no edit to any guard script**.

### Phase 4 — Job tracking: `/nina/jobs`, the detail page, and the jump to the triggering bubble

**Satisfies:** R1
**Owns:**
- Widening the job projection in `lib/nina/imagejobs.ts` beyond `NinaImageJobRow`: prompt, scene,
  purpose, status, phase, error code, `created_at`, `latency_ms`, `cost_micro_usd`, attempts,
  `replyToId`, and the session id that `replyToId` resolves to. Owner-scoped reads only.
- `app/nina/jobs/page.tsx` — the list, newest first, every job and not only the open ones. Stage,
  elapsed time (live-ticking for a running job), and the error at a glance.
- `app/nina/jobs/[id]/page.tsx` — the detail: the **exact prompt as sent**, the seed, the model,
  elapsed/total duration, status and error, cost, and attempt count.
- The jump: a control on the detail page that navigates to `/nina?s=<sessionId>&…` and pinpoints
  the triggering bubble, reusing `lib/nina/reply.ts`'s `planQuoteScroll` + `QUOTE_FLASH_MS` rather
  than inventing a second scroll-and-flash. `lib/nina/scroll.ts` already owns `CHAT_SCROLL_PARAM`;
  decide whether the deep link rides that param or a new one, and say why.
- The `ChatScreen` side of that deep link (this is why the phase depends on 3 — the same file is
  being restructured there).
- The sidebar entry in `components/nina/NinaSidebar.tsx`.
- The degradations, named rather than discovered: a job whose triggering message was deleted, an
  avatar job that never had one, and a job whose session was removed.

- The cost, rendered as a **job total** ("Biaya total") beside the attempt count — the column is
  cumulative across attempts on both hosts. See Decisions.

**Does not touch:** `/nina/about` (phase 5), the generator, `sendNinaMessage`, the write-side job
lifecycle (phase 2's), any migration. It adds two reads to `lib/nina/imagejobs.ts` and changes no
existing export in it.
**Exit criteria:** every job in `nina_turns` where `kind='image'` appears on `/nina/jobs` with a
correct stage and elapsed time, and **no `kind='chat'` row ever does**; the detail page's jump lands
on the right bubble and flashes it, and the `?jump=` param is consumed so a back-swipe does not
re-flash; a job with no resolvable bubble degrades to a sentence instead of a dead link; opening the
page **writes nothing** (no sweep); `npm run build` green — which is the real check that
`lib/nina/jobview.ts` stayed free of a `server-only` value import, since no guard script enforces
that.

### Phase 5 — The tracking section on `/nina/about`, below Media

**Satisfies:** R3
**Owns:** a section in `components/nina/NinaAboutScreen.tsx` placed **directly below** the existing
Media `<section>`, reusing phase 4's `NinaJobList` component and `listNinaImageJobs` read rather than
duplicating either, plus the extra read and the server-side `toNinaJobListItems` mapping in
`app/nina/about/page.tsx`. Each row links into `/nina/jobs/[id]`; a "Semua" link goes to
`NINA_JOBS_HREF`.
**Does not touch:** the routes, the queries' shape, the sidebar, the `?photo=` machinery, the
two-section swipe isolation, or `lib/nina/album.ts`.
**Exit criteria:** the section renders below Media with the same data, the same order and the same
stage vocabulary `/nina/jobs` shows; **no second query implementation, no second row renderer and no
second empty-state renderer exists** (`grep -rn "listNinaImageJobs\|NinaJobList" app components`
shows call sites only); the album's swipe isolation and `?photo=` deep link are unchanged.

### Phase 6 — Permanent session deletion: take the distilled memory with it

**Satisfies:** R8
**Owns:**
- The mechanism by which a deleted session's distilled memory stops reaching Nina's prompt.
  `nina_memory_facts.source_message_id` and `nina_memory_slots.source_message_id` are plain `text`
  with **no** foreign key (`lib/db/schema.ts:845` records this as deliberate), so deletion cascades
  stop at `nina_messages`. Decide and implement one of: purge in the same transaction as the
  session delete, or a real FK with `ON DELETE CASCADE` via a generated migration. **State the
  choice and the reason** — the schema's existing comment argues the opposite position ("a
  distilled fact can be true after the sentence that produced it is gone"), and this requirement
  overrides it, so the override must be written down where that comment is.
- Whatever else survives a session delete and can reach her prompt. Audit it rather than assume:
  `nina_turns` rows, `nina_avatars` rows, `nina_message_images` (cascaded), pending promises,
  proactive markers.
- A one-off cleanup for the rows already orphaned — 13 facts and 6 slots are live now, against 3
  surviving sessions (`scripts/nina-memory-reap.mjs`, dry-run by default).
- **RESOLVED: neither. It purges in the same transaction, and generates NO migration.** The choice
  and its three reasons are in Decisions. **No phase in this set generates a migration**, so
  `drizzle/` gains no file and `npm run db:check` must be clean at the end of every phase — a
  whole-set invariant, not this phase's local one.

**Does not touch:** the image pipeline, the chat turn, any UI. Shares no edge with phases 1–5 or 7.
The one file it shares with phase 3 is `lib/nina/queries.ts`, and only its `drizzle-orm` import
block — both plans now name the same merged list, and they edit disjoint functions.
**Exit criteria:** deleting a session removes, in one transaction, every `nina_memory_facts` row,
`nina_memory_slots` row and `pending_promises` entry whose `source_message_id` points into it — and
nothing else; a memory row asserted through `/admin/memory` survives any session delete; the test
proves the batch ORDER (session delete last) and the ownership scoping; `npm run nina:memory-reap`
reports zero on a second consecutive run; `npm run db:check` clean and `git status --porcelain
drizzle/` empty.

### Phase 7 — End-to-end: chat → `set_avatar` → generation → the profpic really changes

**Satisfies:** R5
**Owns:** an integration test under `tests/integration/` (the `VITEST_INTEGRATION=1` /
`npm run test:int` harness) that drives the whole path: a runner message asking Nina to change her
profile picture → the `set_avatar` tool fires → a `nina_turns` image job opens → the generator runs
→ `nina_avatars` gains a `source='generated'`, `is_current=true` row → the current avatar the chat
header reads has changed.
**The honest seams, which the plan must name rather than gloss:** the model call and the OpenRouter
call are the two things a test cannot both stub and prove. Decide which layer is faked and which is
real, and say what the test therefore does and does not guarantee. The existing `tests/live/`
convention (`LLM_LIVE_TEST=1`) is the precedent for a variant that really does spend money, if one
is warranted.
**RESOLVED, and it needed no injection point.** The model's *decision* to call `set_avatar` is
scripted; the OpenRouter call is routed at `globalThis.fetch`; **the Blob write is real** (~70
bytes, deleted in `afterAll`) because `@vercel/blob` imports `fetch` from `undici` and cannot be
stubbed. Everything from the tool boundary down is the shipping code. An opt-in `tests/live/`
variant (`LLM_LIVE_TEST=1`, $0.040 a run) buys the two halves the cheap test fakes.

**Branch-dependent, and this is the one place in the set where that bites.** This phase lands after
phase 2, so on Branch A there is no doorbell, no `GITHUB_DISPATCH_TOKEN` and nothing that writes
`error_code='dispatched'`. Phase 7's Step 1 carries both shapes with six explicit deltas; read the
probe row in Decisions before writing the file.

**Does not touch:** production code. No injection point was needed — `runOneJob(sql, jobId)` and
`runNinaImageJob(userId, jobId)` are both already exported and already take their client/ids as
arguments, and the worker's `main()` is guarded so importing it runs nothing. `vitest.config.ts` is
not touched either: both files land inside the existing `VITEST_INTEGRATION` / `LLM_LIVE_TEST` gates.
**Exit criteria:** `npm run test:int` runs the suite green and `npm test` stays untouched by it;
reverting phase 1's `session_id` fix fails cases 2 and 3 (Finding 1, both branches); on Branch B,
reverting phase 1's `claimJob` fix fails case 1 (Finding 2 end to end — on Branch A that coverage is
phase 1's unit tests, and this criterion does not apply); a generator that records `40000` where two
attempts were billed fails case 3 (invariant 9, both directions); neither suite is reachable from
`npm test`.

## Reconciliation Log

The seven planners ran concurrently and could not see each other. **23 conflicts found, 23
resolved by editing the plan files in place.** No conflict was deferred.

### Deleted-then-used

| # | Conflict | Resolution |
|---|---|---|
| 1 | Phase 2 deletes `lib/nina/imagedispatch.ts` wholesale. `fireNinaImageDispatch` is called from `lib/nina/selfiegen.ts:92` and `lib/nina/avatargen.ts:109`. | Phase 2's Step 5 already replaces both call sites — **verified by full-repo grep**, and the grep is now recorded in phase 2 so nobody re-runs it. Two further mentions are comments: `imagejobs.ts:109` (inside the doc of the function phase 2 deletes) and `imagetools.ts:36` (Step 5 updates the symbol name). `markNinaImageJobDispatched` has exactly one caller and `NINA_IMAGE_DISPATCH_TIMEOUT_MS` exactly one reader, both inside the deleted file. **No leak.** |
| 2 | Phase 2 deletes the `GITHUB_DISPATCH_TOKEN` env key. | Surviving references enumerated and each assigned: `lib/env.ts:120` and `.env.example:55-66` (phase 2 Steps 6b/6c), `tests/nina.imagedispatch.test.ts` (deleted), `.github/workflows/nina-image.yml:5` (inside the header Step 9a replaces), `ROADMAP_v0.1.0.md:140` + `NINA_CHATBOT_PLAN.md:607` (historical, explicitly out of scope). **`scripts/check-client-secret-boundary.mjs` does NOT list it** — verified by reading the script — so no guard needs editing. |
| 3 | Phase 2 deletes both writers of `error_code = 'dispatched'`, which is the exact state phase 1's Finding-2 fix guards. | Phase 1's fix **kept**, and its purpose restated: on Branch A it guards the **15 existing orphaned rows** (all of which carry `dispatched`) plus the backstop, which is phase 2's rollback target and would restore a live writer. Phase 2's `claimNinaImageJob` already admits the value as legacy. Recorded in phase 1's handoff and phase 4's D5. |
| 4 | **Phase 7's integration test is written against the doorbell phase 2 deletes** — it stubs `GITHUB_DISPATCH_TOKEN`, asserts `githubDispatches).toHaveLength(1)`, and expects `errorCode === 'dispatched'`. Phase 7 depends on 3 → 2 → 1, so it lands *after* the deletion. **Not on the known list; found in the full pass.** | Phase 7's Step 1 rewritten to carry **both shapes**, Branch A first, with six explicit deltas (A1–A6): the in-platform `runNinaImageJob` entry point, no token stub, a router arm that asserts *nothing* reaches `api.github.com` (a stronger invariant-4 statement than inspecting a payload), the `after()` collector kept but not drained, `queued` instead of `dispatched`, and the dispatch assertions removed. Finding 2's end-to-end coverage explicitly moves to phase 1's unit tests on Branch A. |
| 5 | Phase 4's Interface Contract lists `markNinaImageJobDispatched` as "untouched" and `lib/nina/imagedispatch.ts` under "Leaves alone". Both are gone before phase 4 runs. | Contract corrected; what phase 2 actually leaves in `imagejobs.ts` is enumerated instead. No step of phase 4 referenced either symbol, so no code changed. |
| 6 | Phase 6 and phase 7 both list `lib/nina/imagedispatch.ts` under "Leaves alone". | Both corrected to name phase 2's replacements. Phase 6's also corrected to note phase 2 creates no `app/api/nina/**` route. |

### Unmet assumptions

| # | Conflict | Resolution |
|---|---|---|
| 7 | **Phase 5 planned against symbols that do not exist.** It requires `JobList` from `components/nina/JobList.tsx` with a `jobs: readonly T[]` prop and "every other prop optional". Phase 4 ships `NinaJobList` from `components/nina/NinaJobList.tsx` with **required** `items` / `nowMs` / `emptyText`, and `NinaJobListItem.createdAtMs` is a **number** where `NinaImageJobRecord.createdAt` is a `Date`. | Phase 5 rewritten end to end: the guessed-contract block replaced with a resolved-differences table, §Required-from-Phase-4 replaced with the real shapes, and all three implementation steps rewritten (server-side `toNinaJobListItems`, a new `jobsNowMs` prop, `items=`, `NINA_JOBS_HREF`). |
| 8 | Phase 5's "if `JobList` is a Server Component" fallback — a `children`-slot re-plumb it flagged as *"a real code change, flag it to me"*. | **Moot and deleted, not left as a branch.** Phase 4's D3 makes the component `'use client'` deliberately, citing `/nina/about` as the reason. |
| 9 | Phase 5's fallback for a sweeping list read (which would have falsified its page docstring). | **Moot.** Phase 4's `listNinaImageJobs` is a pure, non-sweeping, owner-scoped, newest-first read with an optional `limit` — confirmed clause by clause. Phase 5's fallback prose deleted and the confirmation recorded. |
| 10 | **Phase 3 points at "phase 6's migration" for a unique index on `openNinaChatTurn`. Phase 6 generates no migration.** | Decided, not deferred — see Decisions. Phase 3 accepts the bounded race permanently and the forward reference is deleted. Two sibling false claims corrected with it: phase 1's *"phase 6's generated migration is the only migration in the set"* and phase 2's *"migrations belong to phase 6 in this set"*. **The set generates no migration in any phase.** |
| 11 | Phase 3's `startNinaBackgroundTurn` carries a conditional for "if phase 2 chose a fetch to an internal route". | **Resolved:** phase 2's contract says `after()` in as many words. The conditional is closed and the nesting sanction (Next 16.3.1 `after.md:56`) is cited on both sides. |
| 12 | Phase 7's *Requires* item 5 asks whether phase 3 exports an awaitable background-turn body. | **Resolved: it does not, deliberately** (non-exported, inside `lib/nina/actions.ts`, to stay in the payload guard's sanctioned file). Phase 7 drives `runNinaTurnWith` as written; what phase 3 *does* publish (`pollNinaReply`, `getPendingNinaChatTurn`) is named, with driving `sendNinaMessage` end to end left as an explicit card. |

### Duplicate work and file collisions

| # | Conflict | Resolution |
|---|---|---|
| 13 | Phases 1 and 2 both rewrite `lib/nina/imagerecipe.ts`'s threshold block, `.github/workflows/nina-image.yml`'s comments, and `tests/nina.imagerecipe.test.ts`'s `describe('the threshold chain')`. | **Phase 2 supersedes on all three hunks** (rule 3, one owner per region — phase 2's is the later, host-aware text). But phase 2 must carry two artefacts forward, and its plan is edited to do so: **`NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS = 6_360_000`** with its measured-cadence docblock, and **phase 1's `it()` asserting it exceeds `NINA_IMAGE_STALE_MS`**. Dropping the constant would have stopped `tests/nina.imagerecipe.test.ts` compiling. The assertion needs no numeric change: phase 2 keeps STALE at `1_200_000`. A binding collision table now sits in both plans. |
| 14 | Phases 3 and 6 both rewrite `lib/nina/queries.ts`'s `drizzle-orm` import block as a full replacement — phase 3 adding `gt`, phase 6 adding `exists` and `ne`. Neither depends on the other, so either order is possible and either would drop the other's symbol. | Both plans now name the **same merged destination list**, with the instruction to add only what that phase uses (an unused import fails lint). The two phases edit disjoint *functions* in the file, so the import block was the only shared region. |
| 15 | Phase 5's D-2 writes its own empty-state renderer while phase 4's `NinaJobList` already renders one. | Phase 4's component owns the *markup*, the caller owns the *words* via `emptyText` — which is what phase 4's own docstring specifies. Phase 5's branch deleted; D-2 rewritten with the cost named (a dashed frame where Media has a bare sentence, `className` available). |
| 16 | Phase 2 and phase 3 could both plausibly edit `scripts/check-llm-payload-boundary.mjs`, whose header asserts **"NO OTHER PHASE EDITS IT"**. | **Phase 2 is the sole editor.** Verified by reading the script that phase 3 needs no edit at all: sanctioning is strictly **per-file**, and `lib/nina/actions.ts` is already sanctioned for `runNinaTurn`, so a new non-exported caller inside that file is invisible to the guard. |

### Contract drift

| # | Conflict | Resolution |
|---|---|---|
| 17 | **`cost_micro_usd` means different things in four plans.** Phase 1 accumulates in `closeFailed` but `SET`s on success and defers the rest to phase 2; phase 2's `completeNinaImageJob` and `failNinaImageJob` `SET`, and `requeueNinaImageJob` writes **no cost at all**; phase 7 asserts a single generation's price while its own Handoffs claim the assertion is loose; phase 4 renders it unlabelled. | Decided on **rung 1, a stated invariant** — see Decisions. **Per-job cumulative total, every path, both hosts.** Six writers changed across phases 1 and 2 (including `stale` leaving the column untouched rather than nulling a spend a retry recorded); phase 4 labels it "Biaya total" beside the attempt count; phase 7 asserts `2 × NINA_IMAGE_COST_MICRO_USD` and its contradictory handoff is rewritten. A new phase-1 test asserts accumulation on the success path. |
| 18 | **Phase 3's documented Branch B values fail phase 3's own test.** `NINA_BACKGROUND_BUDGET_MS → 45_000` with `NINA_TURN_CHAIN_MAX → 0` against `(CHAIN_MAX + 1) * perLink <= BUDGET` reads `70_000 <= 45_000`. **Not on the known list; found by evaluating the arithmetic** (`NINA_TURN_BUDGET.overall = 45_000`, verified in `lib/nina/turn.ts:75`). | The inequality was wrong, not the values: it counted the **first** link against a budget that does not bound it (`runNinaTurn` bounds itself; the response has already gone out). Replaced with `CHAIN_MAX * perLink <= BUDGET - NINA_TURN_BUDGET.overall` — Branch A `140_000 <= 195_000`, Branch B `0 <= 0` — which still fails loudly on the dangerous half (budget lowered, chain left at 2). A second assertion pins the budget at ≥ one turn so it cannot be lowered alone. |
| 19 | Phase 3 claims the payload guard stays green because `runNinaBackgroundTurn` is **non-exported** and the guard matches `\brunNinaTurn\s*\(`. | **Conclusion right, mechanism wrong.** The guard cannot see export status; sanctioning is per-file. Prose corrected, with the two pre-existing holes named (`runNinaBackgroundTurn` has no entry; `runTurnDistillation` is unguarded) so nobody mistakes them for protection this phase relies on. |
| 20 | Phase 4 claims `ci:client-secret-guard` guarantees `lib/nina/jobview.ts` imports nothing from a `server-only` module. | **False** — that script has three rules and none inspects imports; **no** guard script enforces it. Corrected to name the real gate, `next build` via the `server-only` package, and phase 4's verification now says run `npm run build`, not just `typecheck`. |
| 21 | Phase 4's `formatJobLatency` docstring says `73925 ms → 1:13`; its own test asserts `'1:14'`. **Found in the full pass.** | `formatDuration(74)` really produces `'1:14'` (read the implementation). Docstring corrected; the test was right. |

### Gaps

| # | Conflict | Resolution |
|---|---|---|
| 22 | **A distillation completing after its session is deleted re-creates the orphan class phase 6 purges** — a race phase 3 widens from milliseconds to 240 s. Phase 6 found it, named phase 3's files as the right home, and phase 3's plan did not mention it. | **Assigned to phase 3** (rule 5, the phase that owns the package): new **Step 6d**, `ninaSessionExists` + abandon + `error_code='session-gone'`, guarding the persist point and the chain. R8's mapping widened to `6, 3`. Phase 6's `nina-memory-reap` cross-referenced as the backstop for the microseconds a check-then-write cannot cover. **Phase 3 does not gain a dependency on phase 6.** |
| 23 | Four stale comments that this set's own changes falsify, each in the file a reader opens first. **Found in the full pass.** | Assigned: `ChatScreen.tsx:62` (names `unavailable`/`bubbles` after phase 3 deletes both) → **phase 3**, Step 9a-pre. `ChatScreen.tsx:236/246/862` ("deletes both / two keys" after phase 4 adds a third) → **phase 4**, Step 9c. `app/nina/page.tsx:178-183` ("two indexed reads… the generation itself is on a GitHub runner") → **phase 2**, Step 8b-bis. `lib/nina/.workflows/package_readme.md:301` (names the module phase 2 deletes) → **phase 2**, Step 6d. |

### The analysis's 21 impact points, walked

All 21 have an owner. Three are **superseded by a phase decision** rather than skipped, and are
recorded here so the walk does not read as a gap:

- **Row 5, `app/api/nina/image/route.ts`** — no such route is created. Phase 2's durability
  primitive is `after()` registered from the segment that already owns the request;
  `lib/nina/imagerun.ts` stands where this row expected a route.
- **Row 10, `lib/nina/live.ts`** — not edited. Phase 3 delivers arrival by poll instead, for two
  reasons in `pollNinaReply`'s header (a push must show a notification, so every self-sent message
  would buzz the phone; and a `router.refresh()` lands through `mergeServerMessages` in one frame,
  collapsing the staggered reveal). The push seam is left working and `lib/nina/live.test.ts` must
  stay green untouched.
- **Row 19, `drizzle/…` migration** — none is generated, in any phase. See Decisions.

Two are **renames** recorded here so the reference list still resolves: row 13's
`components/nina/JobList.tsx` / `JobDetail.tsx` ship as `NinaJobList.tsx` / `NinaJobDetail.tsx`
(plus `NinaJobElapsed.tsx`), and row 20's `tests/integration/nina.profpicE2E.int.test.ts` ships as
`tests/integration/ninaImageE2E.int.test.ts` (plus `tests/live/ninaImageE2E.live.test.ts`).

### Verified against the real tree, not against the plans' claims

Reconciliation checked these rather than trusting them; each is now recorded in the plan that
depends on it. `scripts/check-llm-payload-boundary.mjs` (per-file sanctioning, `lib/nina/actions.ts`
already sanctioned for `runNinaTurn`, "SEVEN" appears **twice** in the header), `check-client-secret-boundary.mjs`
(hardcoded `SECRETS` list, no `GITHUB_DISPATCH_TOKEN`, no import inspection),
`check-data-layer-invariants.mjs` (reads **only** `lib/db/queries.ts` — phase 6's claim confirmed),
`check-f08-boundaries.mjs` (`toFixed(3)` with a `$` trips nothing), `check-openrouter-boundary.mjs`
(`lib/nina/` and `lib/env.ts` exempt); `ChatScreen.tsx`'s five anchors at `:253`/`:440`/`:272`+`:186`/`:265`/`:75`;
`nina_turns` `kind='image'` filtering on all eight readers; `countNinaTurnsSince` called only with
`'image'`; `NinaAboutScreen.tsx:190` reading `result.ok` only (so phase 3's `NinaAttachResult`
change cannot break phase 5); `runOneJob` exported at `scripts/nina-image-worker.ts:564` with
`main()` guarded at `:656`; `imagerecipe.ts`'s threshold block at exactly `:98-115`;
`NINA_TURN_BUDGET.overall = 45_000`; `formatDuration(74) === '1:14'`; `app/api/cron/nina/route.ts:56`
at `maxDuration = 60` with no other phase touching the file; and the four Next 16.3.1 `after()`
doc lines phases 2 and 3 quote (`after.md:50`, `:54`, `:56`, `:250`).

## Decisions

**This is the section every executor reads instead of asking.** A fork resolved here is not to be
re-litigated in a phase session; a fork you find that is *not* here is a genuine gap — say so rather
than deciding it alone.

| Fork | Chosen | Rung |
|---|---|---|
| R4: wait for an async OpenRouter image API, or solve durability ourselves | Solve it ourselves — the vendor has no async image API at all (video only), so waiting is not a branch | 5: the user's raw input asks the question; the vendor docs answer it |
| The GitHub Actions host (RU-19/RU-20) is a constraint, or a consequence of an expired measurement | A consequence. Vercel Hobby + Fluid is 300 s, not 60 s, and this project post-dates Fluid-by-default — so the host is revisable, **gated behind phase 2's probe** (see the propagation block below) | 5: the user's raw input makes R2 the absolute priority, and the host is the proximate cause of two of the three defects |
| `nina_memory_facts` provenance: keep dangling (schema's stated design) or purge with the session | Purge. R8 is explicit that deleted sessions still pollute her character, and the memory ledger is the only surviving channel | 5: the user's raw input overrides a code comment |
| **`nina_turns.cost_micro_usd` is a per-ATTEMPT spend, or a per-JOB total** — four phases assumed different answers, and phase 2's retry path recorded no cost at all | **A per-JOB CUMULATIVE TOTAL, on every path and both hosts.** Every writer is `coalesce(cost_micro_usd, 0) + spend`; `stale` leaves the column untouched rather than nulling a spend a retry already recorded. Phase 4 labels it "Biaya total" beside the attempt count; phase 7 asserts `2 × NINA_IMAGE_COST_MICRO_USD` on a job that burned both attempts | **1: a stated invariant.** Invariant 9 — *"money is never spent silently"*. A per-attempt overwrite discards the first bill when the second attempt writes: two OpenRouter calls, one number. It is also invariant 9 failing *quietly and differently on each host*, which is worse than failing |
| **How `openNinaChatTurn`'s read-then-write race is made safe** — phase 3 deferred a unique index to "phase 6's migration", which phase 6 is not writing | **Accept the race permanently; no index, and no migration anywhere in this set.** Next serialises Server Actions per client, so only two *different* clients inside ~50 ms can collide, and the cost of collision is one duplicate reply — both replies real, nothing fabricated, the conversation still coherent | **3: the plans' code blocks.** Phase 3's own risk analysis measures the window and prices the blast radius, and forbids a lock table. Phase 6's contract independently rules out the migration with three reasons. Neither branch is irreversible, so this is a decision, not a question |
| **Does the set generate a migration at all?** The draft's Rollback assumed phase 6 might | **No — no phase generates one.** `drizzle/` gains no file and `npm run db:check` must be clean at the end of **every** phase. Consequently: no FK on `source_message_id`, no `claimed_at` on `nina_turns`, no unique index on the chat claim | **2: the phases' exit criteria.** Phase 6's says `db:check` clean with `drizzle/` unchanged; phases 1, 2 and 3 each independently declined a column. Invariant 10 governs *how* a migration is made, not whether there is one |
| **How Nina's reply reaches an open tab** — the draft's phase-3 scope said the existing `lib/nina/live.ts` push seam *plus* a poll | **A bounded poll only. `lib/nina/live.ts` is not edited.** The push seam stays working for proactive pushes and its suite must stay green untouched | **3: the plans' code blocks.** `pollNinaReply`'s header gives two independent reasons — the platform requires a `push` handler to show a notification, so every message the runner sends while watching would buzz his phone; and a push arrives as `router.refresh()`, landing all four bubbles through `mergeServerMessages` in **one frame**, which is exactly the collapse of RU-5's staggered reveal that `ChatScreen`'s header spends a paragraph forbidding |
| **Who renders the empty state under Media** — phase 5 wrote its own; phase 4's `NinaJobList` already has one | **Phase 4's component renders it; phase 5 supplies the words via `emptyText`** | **3: the plans' code blocks.** `NinaJobList`'s docstring already assigns the sentence to the caller and warns that hard-coding either would be "a component phase 5 has to fork". Two renderers is the drift the "no second row renderer" rule exists to stop, one element down |
| **Where Finding 2's end-to-end regression coverage lives** once the grace window stops existing on the primary path | **Phase 1's `dispatchCutoffFor` / `claimJob` unit tests**, permanently. Phase 7's end-to-end version applies on Branch B only | **2: the phases' exit criteria.** Phase 1's fix still guards two live things — the manual `--job` drain of the 15 historical `dispatched` rows, and the backstop that is phase 2's rollback target — so the tests are not vestigial. Faking an end-to-end assertion for a state the primary path cannot reach would be a test that proves nothing |

### If phase 2's probe FAILS — the propagation, in full, so no session has to open phase 2's plan

**This is the single highest-consequence conditional in the set.** Phase 2's Step 1 deploys a
`maxDuration = 300` route that holds past 60 s and an `after()` that outlives a closed tab. If the
ceiling is really 60 s, phase 2 reduces to comments-only and **phases 3 and 7 change**. Neither can
discover that on its own.

**Record the outcome here, in this table, the moment the probe runs** — replace this line:

> **PROBE RESULT: `<not yet run>`.** Branch A (300 s, in-platform) is assumed until this says
> otherwise. Fill in: the date, the `?inline=1` status and wall clock, and whether
> `[nina-probe] SURVIVED` appeared with the tab closed.

**On Branch B, three edits and nothing else:**

1. **Phase 2** does Step 9 (workflow comments, recording that 60 s was *re-measured and still
   holds*) and Step 7's comment half only. **No constant changes.** `app/nina/page.tsx:128` and
   `app/api/cron/nina/route.ts:56` both stay at `maxDuration = 60`. The probe route is deleted.
2. **Phase 3** changes **two literals in `lib/nina/turnflight.ts`, together**:
   `NINA_BACKGROUND_BUDGET_MS` `240_000 → 45_000` and `NINA_TURN_CHAIN_MAX` `2 → 0`. Nothing else in
   phase 3 moves — not the split, not the poll, not the claim, not Step 6d.
   `lib/nina/turnflight.test.ts` fails loudly if the budget is lowered while the chain is left at 2.
3. **Phase 7** writes its integration suite in the **Branch B shape**, which is the one its Step 1
   spells out in full: `runGenerator()` calls `worker.runOneJob(workerSql, jobId)`, the
   `GITHUB_DISPATCH_TOKEN` stub and the `githubDispatches` router arm are kept, `after()` is drained
   before the claim so the row is genuinely `dispatched` and seconds old, and the three dispatch
   assertions stand. Do **not** apply deltas A1–A6.

**Unaffected on either branch:** phase 1 (it is the whole fix on Branch B), phase 4, phase 5, phase
6. One nuance for phase 4: on Branch B `error_code = 'dispatched'` stays a **live** stage the runner
will see on every new job, so `NINA_JOB_STAGE_LABEL.dispatched`'s copy is correct as written; on
Branch A it is a historical value carried only by pre-existing rows.

## Open Questions

**Empty, and that is the intended outcome rather than a lucky one.** Every fork above was decidable
on the ladder and was decided; none has a branch that destroys data, rewrites published history, or
runs an unrepeatable migration — the set generates no migration at all. Every `R` in the
Requirements table has at least one owning phase, and every impact point in the analysis has an
owner or a recorded supersession.

The one genuinely conditional item, phase 2's probe, is **not** parked here: it is a measurement
with a fully specified consequence on both branches (see Decisions), so the orchestrator can launch
and phase 2 can resolve it in its first step without asking anyone.

## Rollback

Per phase: each phase is one commit on `feature/nina-image-pipeline-and-async-chat` and reverts
cleanly. **No phase generates a migration**, so no revert has a schema half and none needs a
down-migration — that is the single largest thing reconciliation simplified about this section.

Phase 2 is the only phase that changes where work runs. Its rollback re-points the two call sites in
`selfiegen.ts` / `avatargen.ts` at the restored `fireNinaImageDispatch`, and **lands on a working
pipeline rather than on the broken one**, because phase 1 has by then repaired the worker's three
measured defects — which is precisely why phase 1 comes first and why the workflow was demoted
rather than deleted. Two things a phase-2 revert does not undo, neither harmful: rows already
written (no column, no `args` field and no new `error_code` value was added, so the old code reads
them all), and `GITHUB_DISPATCH_TOKEN`'s removal from the Vercel project — put it back before
deploying the revert, or `ninaEnv()` throws.

A partial phase-2 rollback exists if only the *host* is wrong: change Step 5's two lines back and
keep everything else. That is the reason those two call sites are the only place the host is named.

Phase 6's `--apply` reap is the one irreversible act in the set, and it is irreversible by
construction — it deletes rows whose provenance no longer resolves. Its plan carries the `\copy`
snapshot commands to take first.

As a whole: `git checkout main`; the worktree and branch can be deleted with
`git worktree remove` and `git branch -D`.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows:

    /analyze-orchestrator -f NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md

Or put them on the board first:

    /create-task --from-plan NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md
