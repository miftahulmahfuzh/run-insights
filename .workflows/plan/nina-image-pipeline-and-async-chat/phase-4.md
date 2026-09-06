# Phase 4: Job tracking: `/nina/jobs`, the detail page, and the jump to the triggering bubble

**Plan set:** `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md`
**Analysis:** `20260906-204533-IMG9_code_analyzer.md`
**Satisfies:** R1 — a sidebar button opens a page that tracks every image generation; tapping a job
opens a detail page with the exact prompt, elapsed time and error status, and a control that jumps
to the exact chat bubble that triggered it.
**Depends on:** Phase 3 (it restructures `components/nina/ChatScreen.tsx`; this phase layers a
deep-link scroll on top of that file)
**Difficulty:** NORMAL
**Package:** `app/nina/jobs`, `components/nina`, `lib/nina`

---

## Goal

Every `nina_turns` row with `kind = 'image'` becomes visible and legible: a list at `/nina/jobs`
ordered newest first with its stage, its live elapsed time and its error at a glance, and a detail
page at `/nina/jobs/[id]` carrying the exact prompt as sent, the seed, the model, the cost, the
attempt count and one control that lands the runner on the bubble that asked — pinpointed with the
same `planQuoteScroll` + `QUOTE_FLASH_MS` mechanism a reply quote already uses. A job whose
triggering message cannot be resolved says so in a sentence instead of offering a dead link.

## Interface Contract

**Creates (server reads — `lib/nina/imagejobs.ts`):**

- `NinaImageJobRecord` (interface) — the widened projection of one `kind='image'` row.
- `NinaImageJobDetail` (interface, `extends NinaImageJobRecord`) — adds `replySessionId`.
- `NINA_JOB_LIST_LIMIT` (`const = 60`).
- `listNinaImageJobs(userId: string, opts?: { limit?: number }): Promise<NinaImageJobRecord[]>`
  — **every** image job, newest first, **no sweep**.
- `getNinaImageJobDetail(userId: string, jobId: string): Promise<NinaImageJobDetail | null>`
  — owner-scoped, plus one owner-scoped resolution of `args.replyToId` → `session_id`.

**Creates (pure view model — new file `lib/nina/jobview.ts`, zero value imports from any
`server-only` module):**

- `NINA_JOBS_HREF = '/nina/jobs'`
- `ninaJobHref(jobId: string): string`
- `JOB_JUMP_PARAM = 'jump'`
- `parseNinaJumpParam(raw: unknown): string | null`
- `ninaJumpHref(input: { sessionId: string; messageId: string }): string`
- `NinaJobStage` (`'queued' | 'dispatched' | 'running' | 'done' | 'failed'`)
- `NINA_JOB_STAGE_LABEL: Record<NinaJobStage, string>`
- `NINA_JOB_ERROR_LABEL: Readonly<Record<string, string>>`
- `jobStage(input: { status: string; errorCode: string | null }): NinaJobStage`
- `jobErrorLabel(errorCode: string | null): string | null`
- `JobLike` (structural input interface — the `album.ts` habit, so this file imports no row type)
- `NinaJobListItem` (interface — the serializable row a client component renders)
- `toNinaJobListItems(rows: readonly JobLike[]): NinaJobListItem[]`
- `jobElapsedSeconds(startedAtMs: number, nowMs: number): number`
- `formatMicroUsd(micro: number | null | undefined): string`
- `NinaJobJump` (`{ kind: 'ready'; href: string } | { kind: 'avatar' } | { kind: 'no-message' } | { kind: 'gone' }`)
- `planJobJump(input: { purpose: 'selfie' | 'avatar'; replyToId: string | null; replySessionId: string | null }): NinaJobJump`
- `NINA_JOB_JUMP_NOTE: Record<Exclude<NinaJobJump['kind'], 'ready'>, string>`

**Creates (components):**

- `components/nina/NinaJobElapsed.tsx` → `NinaJobElapsed` (**`'use client'`**)
- `components/nina/NinaJobList.tsx` → `NinaJobList` (**`'use client'`**)
- `components/nina/NinaJobDetail.tsx` → `NinaJobDetail` (**`'use client'`**)

**Creates (routes):** `app/nina/jobs/page.tsx`, `app/nina/jobs/[id]/page.tsx`

**Signature changes:** none. `NinaImageJobRow`, `listOpenNinaImageJobs`, `getNinaImageJob`,
`toJobRow`, `PENDING_PHASES`, `sweepStaleNinaImageJobs`, `failNinaImageJob` and
`postNinaApologyMessage` are **untouched**.

> **RECONCILED — two symbols this contract used to name no longer exist by the time this phase
> runs.** `markNinaImageJobDispatched` and the whole of `lib/nina/imagedispatch.ts` are **deleted by
> phase 2**, which lands three phases before this one. Neither is referenced by any step here, so
> nothing in the plan breaks — but this contract must not list a deleted symbol as "untouched", and
> the Leaves-alone list below must not point a later reader at a file that is gone.
>
> What phase 2 leaves in `lib/nina/imagejobs.ts` for this phase to find, all of it additive and
> none of it colliding with the two reads added here: `claimNinaImageJob`, `completeNinaImageJob`,
> `requeueNinaImageJob`, `listRevivableNinaImageJobs`, and a widened `failNinaImageJob`. Phase 2
> declares the read projection explicitly out of its scope, so `toJobRow` and friends are exactly
> as this plan quotes them.

**Deletes:** none.

**Renames:** none.

**Requires (from earlier phases):** `components/nina/ChatScreen.tsx`, after Phase 3, still contains
these five anchors. They are named by TEXT, not by line, because Phase 3 moves them:

1. the mount-time `useLayoutEffect` that strips `ATTACH_PARAM`/`PHOTO_PARAM` with a single
   `window.history.replaceState` (its own docstring forbids a *second* `replaceState` in this
   component — this phase adds none, it extends that one);
2. `handleJumpToQuote`, and its `planQuoteScroll` measurement of `#nina-msg-<id>` and
   `#nina-composer`;
3. the `flashTimer` ref and `const [flashId, setFlashId] = useState<string | null>(null)`;
4. the `alive` ref;
5. the `'quote-missing'` member of `Notice` and its sentence in `NOTICE_TEXT`.

**RECONCILED — all five verified against the shipped file AND against phase 3's actual code blocks,
rather than against its claim.** Phase 3's plan asserted the five were untouched; that assertion was
plausible but unproven, since phase 3 adds a required `flight` prop and rewrites the send handler.
Checked anchor by anchor:

| # | Anchor | Shipped at | Phase 3's nearest edit | Verdict |
|---|---|---|---|---|
| 1 | the strip `useLayoutEffect` + its single `replaceState` | `:253-260`, `replaceState` at `:259` | none — no phase-3 step enters `:230-262` | **survives** |
| 2 | `handleJumpToQuote` + `planQuoteScroll` | `:440-475`, `planQuoteScroll` at `:454` | `revealBubbles` inserted *after* it, before `handleSend` | **survives** |
| 3 | `flashTimer` ref / `flashId` state | `:272` / **`:186`** | phase 3 replaces the state block ending at `overlap` and *appends* `pollTimer` beside `flashTimer` | **survives** — and phase 3's plan now carries an explicit boundary note that `flashId` at `:186` is outside its replacement, because that was the one genuinely close call |
| 4 | the `alive` ref | `:265` | read by phase 3's poll and reveal, never redeclared | **survives** |
| 5 | `'quote-missing'` Notice + copy | `:75` / `:87` | phase 3 adds a comment above `'no-reply'` only | **survives** |

Also verified for Step 9a's import edits: `ChatScreen.tsx:4` currently imports `{ useRouter }` from
`next/navigation` (so `useSearchParams` is a genuine addition), and `QuoteScroll` **is** exported
from `lib/nina/reply.ts` (`:341`), so the widened `@/lib/nina/reply` import resolves.

The collision surface is therefore import ordering only, as phase 3 predicted. No re-targeting is
needed. Two rules phase 3 hands over and this phase obeys: the `:253` effect stays the file's only
`replaceState` writer (Step 9c adds a `delete`, not a writer), and `revealBubbles` is the sole
appender of Nina's rows (Step 9d's deep-link effect never calls it).

**Leaves alone (owned by others):**

- `components/nina/NinaAboutScreen.tsx`, `app/nina/about/page.tsx` — Phase 5.
- `scripts/nina-image-worker.ts`, `.github/workflows/nina-image.yml`, `lib/nina/imagerecipe.ts`,
  `lib/nina/imagegen.ts`, `lib/nina/imagefail.ts`, and phase 2's new `lib/nina/imagecall.ts` /
  `lib/nina/imagerun.ts` — Phases 1, 2. (`lib/nina/imagedispatch.ts` used to be on this list; phase
  2 deletes it, so there is nothing left to leave alone.)
- `lib/nina/actions.ts`, `lib/nina/live.ts` — Phase 3.
- **`app/nina/page.tsx` — Phase 2** (`maxDuration`). This phase needs **no** change there: the
  deep link's `?jump=` is read by `useSearchParams()` in the client, and an unrecognised search
  param is simply not destructured by `NinaPage`.
- `lib/nina/queries.ts`, `lib/nina/sessionActions.ts`, `drizzle/*` — Phase 6.
- `lib/nina/scroll.ts`, `lib/nina/reply.ts`, `components/nina/MessageList.tsx`,
  `components/nina/useChatScroll.ts` — **read and imported, never edited.**
- `tests/integration/*` — Phase 7.

---

## Decisions this phase makes, and why

### D1 — the list read does **not** sweep, and `listOpenNinaImageJobs` keeps its sweep

`listOpenNinaImageJobs` returns only `status='pending'` rows and calls `sweepStaleNinaImageJobs`
first, for its stated reason: `app/nina/page.tsx` awaits it *for the side effect*, and that sweep is
"R22's last guarantee". R1 wants **every** job, not the open ones, so the shape is wrong twice over,
and a *list* read that silently closes jobs and writes apology messages is a surprise a tracking
page must not spring. So:

- `listOpenNinaImageJobs` is untouched. `/nina` keeps its guarantee.
- `listNinaImageJobs` is a new, pure read: no writes, all statuses, newest first.

The visible consequence is deliberate and is the honest one: a job that has been `pending` for three
hours shows as `pending` with a three-hour clock on `/nina/jobs`, instead of being retro-labelled
`stale` by the act of looking at it. That is more information, not less, and it is exactly the
symptom R2's findings produce.

### D2 — the deep link rides a **new** parameter, `?jump=<messageId>`, not `?at=`

`lib/nina/scroll.ts` owns `CHAT_SCROLL_PARAM = 'at'` and it is not the right key, for four reasons:

1. **Different arithmetic, different outcome.** `?at=` is an anchor-AND-OFFSET restoration mark
   (`<messageId>~<offset>`), decoded by `decodeChatScrollMark` and honoured by `MessageList`'s
   layout effect through `resolveRestoreTop` — it puts a message at a *recorded pixel offset* and
   flashes nothing. R1 asks for the reply-quote pinpoint, which is `planQuoteScroll` (centred in
   the band left over after the composer, aligned to the top when the bubble is taller than the
   band) plus the `QUOTE_FLASH_MS` tint. Two rules, and the user asked for the second one by name.
2. **A job link has no offset to give.** Riding `?at=` would mean fabricating `~0`, i.e. writing a
   measurement that was never measured into a key whose whole contract is "this is where the screen
   actually was".
3. **Opposite lifetimes.** `?at=` must *survive* — it is written by `saveMark` on the way out and
   read on the way back. `?jump=` must be *consumed* on arrival, or a back-swipe into the chat
   re-flashes a bubble the runner already saw. Consuming `at` would break R14; keeping `jump` would
   break R1. One key cannot have both lifetimes.
4. **They must coexist.** Back-swiping from `/nina/jobs/[id]` into `/nina` and then leaving again
   writes a real `at` onto that entry. A `jump` that had stolen the key would be silently
   overwritten by `saveMark`.

The link is `/nina?s=<sessionId>&jump=<messageId>`: `SESSION_PARAM` (`lib/nina/active.ts`) is the
only thing that opens the right conversation, and a message id means nothing outside its own.

### D3 — `NinaJobList` is a **client** component

Not a stylistic choice. `NinaAboutScreen.tsx` is `'use client'`, and Phase 5 renders this list
inside it. A Server Component cannot be rendered from a client component except through a
`children` slot, so a server `NinaJobList` would force Phase 5 either to duplicate the markup or to
re-plumb `app/nina/about/page.tsx` around a slot. A client component taking only serializable props
(strings, numbers, nulls) is reusable from both a Server Component page and a client screen without
either side changing shape. **This is the single most important contract in this phase.**

### D4 — a terminal job shows `latency_ms`, not a wall clock

`nina_turns` has **no `finished_at` column** (the analysis records this; `claimJob`'s own comment
already flags the absence). So for a job that has ended there is no honest "total duration" —
elapsed-since-`created_at` would keep growing forever. The rule:

- **pending** (`queued`/`dispatched`/`running`) → a **live-ticking** clock from `created_at`;
- **ok / failed** → `latency_ms` as "Lama generate", plus `created_at` as when it was opened, and
  **no ticker**. When `latency_ms` is null (nothing ever ran — the `stale` case) it renders `—`.

### D5 — tolerant of Phase 2's vocabulary, and `dispatched` is now a HISTORICAL stage

Phase 2 may add or repurpose `nina_turns.args` fields and may change which `error_code` phases
exist. `jobStage` therefore mirrors `toJobRow`'s existing tolerance — an unrecognised phase while
`status='pending'` degrades to `queued` rather than throwing — and `jobErrorLabel` falls back to
rendering the raw code when it is not one of `NINA_IMAGE_FAILURES`. Adding a phase or a failure kind
in Phase 2 therefore cannot break this phase; it only makes one label less pretty until a line is
added to `NINA_JOB_STAGE_LABEL` / `NINA_JOB_ERROR_LABEL`.

**RECONCILED — what phase 2 actually did, and the one consequence for this screen.** Phase 2 added
no `args` field and no column, so every row here is exactly the shape this plan quotes. It did,
however, delete both writers of `error_code = 'dispatched'` (`markNinaImageJobDispatched` and
`lib/nina/imagedispatch.ts`), so **on Branch A that value is carried only by rows written before
phase 2 landed** — which is, concretely, the 15 orphaned `failed`/`stale` jobs the analysis
measured, plus any job in flight across the deploy.

`NINA_JOB_STAGE_LABEL.dispatched` and `jobStage`'s `dispatched` branch both **stay**, and this is
not dead code: those 15 rows are the first thing on `/nina/jobs` and they are the reason a runner
opens it. What changes is only the copy's tense. "Dijadwalkan" is right for a live stage and
slightly wrong for a stage nothing enters any more — so render it, but do not present it as
something that is about to happen. Phase 2's own handoff says the same in one line: *"the detail
page should not present it as a live stage."*

**On Branch B** (phase 2's probe fails, GitHub Actions stays the host) none of this applies:
`dispatched` remains a live stage the runner will see on every new job, and the copy is correct as
written. Nothing else in this phase differs between the branches.

### D6 — the sidebar entry is a plain `<Link>` and does **not** call `closeSidebar`

`NinaSidebar` is an overlay driven by `?sidebar=1`, with a shared `pushedRef` in
`NinaSidebarProvider` and a documented argument about back-gesture entries. The file already
contains the precedent for exactly this case, on the avatar link to `/nina/about`:

> *"Navigating to `/nina/about` drops `?sidebar=1`, so the panel closes on its own, and the back
> gesture returns to it open. Nothing extra is wired for that."*

`SessionRow` confirms the rule from the other side: an **inactive** row is a `<Link>` and does *not*
call `onClose`, while the **active** row (which navigates nowhere) is a `<button>` that does. A
cross-route `<Link>` closes the panel through the URL, because the new history entry has no
`sidebar` key.

Calling `closeRef.current()` on this link would be the bug, not the fix: `pushedRef.current` is
`true` whenever the trigger opened the panel, so `closeSidebar` would fire `window.history.back()`
into the same tick as the `<Link>`'s push — a back and a forward racing over one entry. So the
sidebar entry is a bare `<Link href={NINA_JOBS_HREF}>` with no callback, and its docstring says why.

The one accepted cost is the one `/nina/about` already pays and documents: after a back gesture the
provider remounts with `pushedRef = false`, so a subsequent ✕ closes by `replaceState` and the
runner needs one extra back-swipe to leave `/nina`. That is pre-existing behaviour of every
cross-route link out of this panel, and this phase does not change it.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/jobview.ts` | create | pure view model: stage/error vocabulary, elapsed + money formatting, `?jump=` grammar, the jump-degradation rule |
| `tests/nina.jobview.test.ts` | create | unit suite over every pure function above |
| `lib/nina/imagejobs.ts` | modify | append `NinaImageJobRecord`, `NinaImageJobDetail`, `NINA_JOB_LIST_LIMIT`, `listNinaImageJobs`, `getNinaImageJobDetail` after `toJobRow` (`:369`) |
| `components/nina/NinaJobElapsed.tsx` | create | the ticking clock, client, hydration-safe |
| `components/nina/NinaJobList.tsx` | create | the list, client, reused verbatim by Phase 5 |
| `components/nina/NinaJobDetail.tsx` | create | the detail body and the jump control |
| `app/nina/jobs/page.tsx` | create | `requireUserId` + one indexed read + `AppShell` |
| `app/nina/jobs/[id]/page.tsx` | create | `requireUserId` + `isValidId` + one owner-scoped read + `notFound()` |
| `components/nina/NinaSidebar.tsx` | modify | one `<Link>` between the new-chat slot (`:363-365`) and `<SessionList>` (`:367`) |
| `components/nina/ChatScreen.tsx` | modify | extract `measureQuoteScroll`/`flashMessage` out of `handleJumpToQuote` (`:440`), extend the strip effect (`:253`), add the one-shot deep-link effect |

Ten files, and the reconciled index now says ten. The draft index said eight; the delta is the test
file and `NinaJobElapsed.tsx`, split out
because both the list and the detail need the same ticker and two copies of a `setInterval` would
be two things to keep in step.

---

## Implementation Steps

### Step 1: The pure view model

**File:** `lib/nina/jobview.ts` (new)
**Change:** everything about a job a screen has to decide, in a file with `environment: 'node'` and
no jsdom — the carve-out `lib/nina/sidebar.ts`, `lib/nina/reply.ts` and `lib/nina/album.ts` each
make for the same reason. `JobLike` is a structural interface rather than an import of
`NinaImageJobRecord`, which is `album.ts`'s exact habit (`AvatarLike`, `ImageLike`) and is what
keeps this file free of any edge to a `server-only` module.

**Code:**

```ts
import { formatDuration, MISSING } from '@/lib/format'
import { isValidId } from '@/lib/id'

/**
 * **R1's whole vocabulary: what a job's row says, and where its "go to the bubble" button points.**
 *
 * ── WHY THIS FILE IS PURE, AND WHY IT IMPORTS NO ROW TYPE ─────────────────────────────────────
 * `vitest.config.ts` is `environment: 'node'` with an `include` matching `*.test.ts`, so a rule
 * that lives inside a `'use client'` component cannot be asserted by anything in this repo —
 * the carve-out `lib/nina/sidebar.ts`, `lib/nina/reply.ts` and `lib/nina/chatview.ts` each make.
 * Four of the decisions below are worth a reviewer's trust rather than a reader's: which stage a
 * row is in, what its error says, which query string the deep link writes, and — the one that
 * actually protects the runner — WHETHER THERE IS A BUBBLE TO JUMP TO AT ALL.
 *
 * `JobLike` is structural, on `lib/nina/album.ts`'s precedent (`AvatarLike` / `ImageLike`): the
 * shape of a `nina_turns` row belongs to `lib/nina/imagejobs.ts`, which is `server-only`, and this
 * module is imported by three client components. A structural interface is the boundary that keeps
 * this file loadable in a browser bundle and in a bare node test alike.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────────────────────────
 * **The failure vocabulary.** `NINA_IMAGE_FAILURES` is `lib/nina/imagefail.ts`'s, phases 1 and 2
 * own that file, and `NINA_JOB_ERROR_LABEL` below is a LOOKUP over whatever it says rather than a
 * second list. A code with no entry renders as itself — see `jobErrorLabel`.
 *
 * **The job phases.** `NinaImageJobPhase` is `lib/nina/imagerecipe.ts`'s. `jobStage` accepts an
 * unrecognised phase as `'queued'`, mirroring `toJobRow`'s existing tolerance, so phase 2 adding a
 * fourth phase cannot break a screen.
 */

/* ── the routes ───────────────────────────────────────────────────────────────────────────── */

/** The tracking list. Spelled once; the sidebar, the detail page and phase 5 all import it. */
export const NINA_JOBS_HREF = '/nina/jobs'

/** One job's detail page. */
export function ninaJobHref(jobId: string): string {
  return `${NINA_JOBS_HREF}/${jobId}`
}

/* ── the deep link back into the chat ─────────────────────────────────────────────────────── */

/**
 * `/nina?s=<sessionId>&jump=<messageId>` — the parameter that says "pinpoint this bubble".
 *
 * ── WHY THIS IS NOT `lib/nina/scroll.ts`'s `CHAT_SCROLL_PARAM` ('at') ─────────────────────────
 * Four reasons, and any one of them is enough.
 *
 *   1. **Different arithmetic.** `?at=` is an anchor AND AN OFFSET (`<messageId>~<offset>`),
 *      resolved by `resolveRestoreTop` into "put that message back where it was". This is
 *      `planQuoteScroll`: centre the target in the band the composer leaves over, or top-align it
 *      with a 16px margin when it is taller than the band — and then FLASH it for
 *      `QUOTE_FLASH_MS`. R1 asked for the second one by name ("just like how we can click and
 *      directly pinpoint reply_to message").
 *   2. **There is no offset to give.** A job page never measured this conversation. Writing `~0`
 *      would be putting a fabricated measurement into a key whose entire contract is that it holds
 *      a real one.
 *   3. **Opposite lifetimes.** `?at=` must SURVIVE — `useChatScroll.ts` writes it on the way out
 *      and reads it on the way back. `?jump=` must be CONSUMED on arrival, or a back-swipe into
 *      the chat re-flashes a bubble the runner has already seen.
 *   4. **They must coexist.** Coming back from a job page and then leaving the chat again writes a
 *      real `at` onto that entry. A `jump` that had stolen the key would be overwritten by
 *      `saveMark` and the link would silently stop working.
 *
 * `s` is not optional. A message id names nothing outside its own conversation, and
 * `SESSION_PARAM` is the only thing that opens the right one.
 */
export const JOB_JUMP_PARAM = 'jump'

/**
 * `unknown -> id | null`, on `parseNinaSessionParam`'s precedent and for its stated reason: a
 * `searchParams` value is `string | string[] | undefined`, and a shape check that refuses to be
 * handed the wrong shape is a shape check with a second bug in it. A miss is `null`, and `null` is
 * "no jump on this link" — never an error.
 */
export function parseNinaJumpParam(raw: unknown): string | null {
  if (!isValidId(raw)) return null
  return raw
}

/**
 * The chat URL that opens `sessionId` and pinpoints `messageId`.
 *
 * `URLSearchParams` rather than a template literal so the two keys are spelled once each and the
 * encoding is the platform's — the habit `withSidebarParam` and `useChatScrollMark` both keep.
 * `SESSION_PARAM` is imported by the CALLER (`lib/nina/imagejobs.ts` has no business owning it and
 * this module has no business re-declaring it), so it arrives as an argument name rather than as a
 * literal: see `sessionParam` below.
 */
export function ninaJumpHref(input: {
  sessionId: string
  messageId: string
  /** `SESSION_PARAM` from `lib/nina/active.ts`. Passed in so this module declares no second `'s'`. */
  sessionParam: string
}): string {
  const params = new URLSearchParams()
  params.set(input.sessionParam, input.sessionId)
  params.set(JOB_JUMP_PARAM, input.messageId)
  return `/nina?${params.toString()}`
}

/* ── the stage ────────────────────────────────────────────────────────────────────────────── */

export type NinaJobStage = 'queued' | 'dispatched' | 'running' | 'done' | 'failed'

/**
 * `nina_turns.error_code` carries the PHASE while `status='pending'` and the FAILURE REASON when
 * `status='failed'` — two meanings in one column, disambiguated by `status`, which is
 * `lib/db/schema.ts`'s stated design and not something to be re-litigated here.
 *
 * An unrecognised phase degrades to `'queued'`, exactly as `toJobRow` already does, so phase 2
 * introducing a fourth phase changes a label and not a screen. A `status` this function has never
 * heard of is `'queued'` too: `'repaired'` exists in `NinaTurnStatus` and no image writer produces
 * it, and a tracking page that threw on an unexpected status would be a tracking page that goes
 * blank precisely when something unexpected happened.
 */
export function jobStage(input: { status: string; errorCode: string | null }): NinaJobStage {
  if (input.status === 'ok' || input.status === 'repaired') return 'done'
  if (input.status === 'failed') return 'failed'
  if (input.errorCode === 'dispatched') return 'dispatched'
  if (input.errorCode === 'running') return 'running'
  return 'queued'
}

/** True while the clock is still running — the only stages a live ticker is honest for. See D4. */
export function jobIsOpen(stage: NinaJobStage): boolean {
  return stage === 'queued' || stage === 'dispatched' || stage === 'running'
}

export const NINA_JOB_STAGE_LABEL: Record<NinaJobStage, string> = {
  queued: 'Antre',
  dispatched: 'Dijadwalkan',
  running: 'Lagi digambar',
  done: 'Selesai',
  failed: 'Gagal',
}

/**
 * `nina_turns.error_code`'s failure half, in words.
 *
 * A `Record<string, string>` and not a `Record<NinaImageFailure, string>`: the union lives in
 * `lib/nina/imagefail.ts`, phases 1 and 2 own that file, and this map must not be the thing that
 * has to be migrated when a fifth kind appears. `jobErrorLabel` falls through to the raw code,
 * which is ugly and true — the two properties a diagnostic string should have in that order.
 */
export const NINA_JOB_ERROR_LABEL: Readonly<Record<string, string>> = {
  timeout: 'Kelamaan — waktunya habis sebelum fotonya jadi',
  policy: 'Ditolak filter konten provider',
  transport: 'Koneksi ke provider putus',
  stale: 'Nggak ada yang ngerjain sampai batas waktu',
}

export function jobErrorLabel(errorCode: string | null): string | null {
  if (errorCode === null || errorCode === '') return null
  return NINA_JOB_ERROR_LABEL[errorCode] ?? errorCode
}

/* ── the row a screen renders ─────────────────────────────────────────────────────────────── */

/**
 * What `toNinaJobListItems` needs off a row. Structural — see the header.
 *
 * `createdAt` is a `Date` here and a NUMBER in `NinaJobListItem`, and that conversion is the whole
 * reason this function exists: `NinaJobList` is a client component, and epoch milliseconds are the
 * shape a client and a server cannot disagree about. `app/nina/page.tsx` makes the same move with
 * `jakartaDayOf` for the same reason.
 */
export interface JobLike {
  id: string
  status: string
  errorCode: string | null
  purpose: 'selfie' | 'avatar'
  scene: string | null
  attempts: number
  createdAt: Date
  latencyMs: number | null
}

export interface NinaJobListItem {
  id: string
  href: string
  stage: NinaJobStage
  stageLabel: string
  purpose: 'selfie' | 'avatar'
  /** The scene the prompt was built around, or null for a row written before `args` carried one. */
  scene: string | null
  attempts: number
  createdAtMs: number
  /** Present only on a failed job. Already in words; `null` on every other stage. */
  errorLabel: string | null
  /** The generation call's own latency, or null. `null` on an open job by construction. */
  latencyMs: number | null
  /** Whether a live clock is honest for this row. See D4. */
  open: boolean
}

export function toNinaJobListItems(rows: readonly JobLike[]): NinaJobListItem[] {
  return rows.map((row) => {
    const stage = jobStage({ status: row.status, errorCode: row.errorCode })
    return {
      id: row.id,
      href: ninaJobHref(row.id),
      stage,
      stageLabel: NINA_JOB_STAGE_LABEL[stage],
      purpose: row.purpose,
      scene: row.scene,
      attempts: row.attempts,
      createdAtMs: row.createdAt.getTime(),
      errorLabel: stage === 'failed' ? jobErrorLabel(row.errorCode) : null,
      latencyMs: row.latencyMs,
      open: jobIsOpen(stage),
    }
  })
}

/* ── the numbers ──────────────────────────────────────────────────────────────────────────── */

/**
 * Whole seconds between two instants, floored at zero.
 *
 * Clamped because the two clocks are not the same clock: `createdAtMs` came from Postgres through
 * a server render and `nowMs` may come from the browser one tick later, so a few milliseconds of
 * skew is normal and "-0:01" is not a thing a screen may say.
 */
export function jobElapsedSeconds(startedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
}

/**
 * `40000` → `'$0.040'`. Millionths of a dollar is `nina_turns.cost_micro_usd`'s unit
 * (`lib/db/schema.ts`: *"never a float, never dollars"*), and this is the one place it becomes a
 * rendered string.
 *
 * ── WHY NOT `lib/format.ts` ───────────────────────────────────────────────────────────────────
 * That module's vocabulary is a RUN's measurements — distance, pace, heart rate — and F08's third
 * boundary rule ("no chart or screen hand-rolls a unit") polices exactly those four units. Money
 * in micro-USD is a `nina_turns` concept with one consumer, so it lives beside the other
 * `nina_turns` rules rather than being a ninth entry in a file about running. `MISSING` is still
 * imported from there, because "no value" must read the same everywhere in the app.
 *
 * `toFixed(3)` rather than `Intl.NumberFormat`: `scripts/check-f08-boundaries.mjs` allows
 * `Intl.NumberFormat` in `lib/format.ts` and nowhere else, and that exception is deliberately a
 * literal set rather than a pattern.
 */
export function formatMicroUsd(micro: number | null | undefined): string {
  if (typeof micro !== 'number' || !Number.isFinite(micro)) return MISSING
  return `$${(micro / 1_000_000).toFixed(3)}`
}

/** `4716` seconds → `1:18:36`. Re-exported so a screen imports one module, not two. */
export function formatJobSeconds(seconds: number | null | undefined): string {
  return formatDuration(seconds)
}

/** `73925` ms → `1:14`. The generation call's own latency; `null` renders as `MISSING`. */
export function formatJobLatency(latencyMs: number | null | undefined): string {
  if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs)) return MISSING
  return formatDuration(Math.round(latencyMs / 1000))
}

/* ── the jump, and its three honest failures ──────────────────────────────────────────────── */

export type NinaJobJump =
  | { kind: 'ready'; href: string }
  /** An avatar job. `args.replyToId` is null BY CONSTRUCTION — see `lib/nina/avatargen.ts`. */
  | { kind: 'avatar' }
  /** A selfie job whose `args` never carried a reply target, or a row written before `args` did. */
  | { kind: 'no-message' }
  /** There was a message and it is gone: deleted, or its session was removed. */
  | { kind: 'gone' }

/**
 * **R1's "button that will redirect us to the chat, at the exact bubble that trigger this job" —
 * and the three ways there is no such bubble.**
 *
 * Named rather than discovered, because each one is reachable today:
 *
 *   - **`avatar`.** `lib/nina/avatargen.ts` opens its job with `replyToId: null` and dispatches
 *     with `replyToId: null`. Nobody asked for an avatar in the chat; `failNinaImageJob` already
 *     skips the apology for these for the same structural reason. There is nothing to jump to and
 *     that is not a fault.
 *   - **`no-message`.** A selfie job whose `args` carry no `replyToId`, or one of the three
 *     pre-sessions rows whose `args` are null altogether. Rare, real, and a button that navigates
 *     to `/nina?s=&jump=` would be worse than a sentence.
 *   - **`gone`.** `replyToId` names a message the owner-scoped read did not return. Two causes and
 *     ONE answer: the message was deleted (`nina_messages.reply_to_id` is `ON DELETE SET NULL`, so
 *     a delete leaves `args.replyToId` in the jsonb pointing at nothing), or its session was
 *     removed and the cascade took the row with it. **This survives phase 6**: phase 6 purges the
 *     memory ledger and does not change the fact that a removed session's messages are gone, so
 *     the resolution still comes back empty and still lands here.
 *
 * The resolution itself is a fact and not a claim: `replySessionId` is non-null only when an
 * owner-scoped read returned a row. See `getNinaImageJobDetail`.
 */
export function planJobJump(input: {
  purpose: 'selfie' | 'avatar'
  replyToId: string | null
  replySessionId: string | null
  sessionParam: string
}): NinaJobJump {
  if (input.purpose === 'avatar' && input.replyToId === null) return { kind: 'avatar' }
  if (input.replyToId === null) return { kind: 'no-message' }
  if (input.replySessionId === null) return { kind: 'gone' }
  return {
    kind: 'ready',
    href: ninaJumpHref({
      sessionId: input.replySessionId,
      messageId: input.replyToId,
      sessionParam: input.sessionParam,
    }),
  }
}

/** What each refusal says. One sentence, no error code, no button — `EmptySlot`'s register. */
export const NINA_JOB_JUMP_NOTE: Record<Exclude<NinaJobJump['kind'], 'ready'>, string> = {
  avatar: 'Foto ini bukan dari chat — Nina ganti foto profilnya sendiri, jadi nggak ada bubble yang memicunya.',
  'no-message': 'Job ini nggak nyimpen pesan pemicunya, jadi nggak ada bubble yang bisa dituju.',
  gone: 'Pesan yang minta foto ini sudah nggak ada — kehapus, atau chatnya dihapus.',
}
```

**Impact:** one new pure module. Nothing imports it yet.

---

### Step 2: The widened reads

**File:** `lib/nina/imagejobs.ts` — append after `toJobRow` (currently ends at `:369`); add
`desc` to the `drizzle-orm` import at `:3` and `getNinaMessagesByIds` to the `./queries` import at
`:19`.

**Change:** two owner-scoped reads and the two row types R1 needs. `NinaImageJobRow`,
`listOpenNinaImageJobs`, `getNinaImageJob` and `toJobRow` are **untouched** — see D1.

**Code (the two import lines, replacing what is there):**

```ts
import { and, asc, desc, eq, lt } from 'drizzle-orm'
```

```ts
import {
  countNinaTurnsSince,
  getNinaMessagesByIds,
  insertNinaMessages,
  insertNinaTurn,
} from './queries'
```

**Code (appended at the end of the file):**

```ts
/*
 * ── R1's READS. WHY THEY ARE NOT `listOpenNinaImageJobs` WIDENED ──────────────────────────────
 *
 * `listOpenNinaImageJobs` is two things at once, and both of them are wrong for a tracking page.
 * It returns only `status = 'pending'` rows, and R1 wants EVERY job — a runner opening this screen
 * is usually asking why a photo never arrived, which is a question only the closed rows answer.
 * And it SWEEPS first, deliberately, because `app/nina/page.tsx` awaits it for that side effect and
 * that sweep is R22's last guarantee.
 *
 * A list read that silently marks jobs failed and writes apology messages into a conversation is a
 * surprise, and a tracking screen is the last place to spring one: the runner would be looking at a
 * page that CHANGED WHAT IT WAS DESCRIBING by being looked at. So the sweep stays exactly where it
 * is, on `/nina`, and these two reads write nothing.
 *
 * The visible consequence is deliberate and honest: a job stuck `pending` for three hours shows as
 * `pending` with a three-hour clock here, rather than being retro-labelled `stale` by the act of
 * opening the page. That is the symptom findings 2 and 3 actually produce, and hiding it behind a
 * sweep would hide the bug this whole plan set exists to fix.
 */

/**
 * How many jobs the list renders. Six a day is `NINA_IMAGE_DAILY_CAP`, so sixty is ten days of
 * flat-out use — `NINA_ALBUM_MAX`'s reasoning, one table over. A real `LIMIT`, not a `slice`: this
 * table grows forever and a tracking page has no business reading all of it.
 */
export const NINA_JOB_LIST_LIMIT = 60

/**
 * One image job, as R1's screens need it — strictly wider than `NinaImageJobRow`.
 *
 * `errorCode` keeps the column's own dual meaning (the PHASE while `status='pending'`, the FAILURE
 * REASON when `status='failed'`) rather than being split into two fields here. `lib/nina/jobview.ts`
 * is where that ambiguity is resolved, once, by `jobStage` — resolving it in the read as well would
 * be two places that have to agree about a rule neither of them owns.
 *
 * Every `args`-derived field is NULLABLE even where `NinaImageJobArgs` declares it required: three
 * `kind='image'` rows in production predate that shape and carry `args = null`, and phase 2 may
 * widen the shape again. A projection that assumed the args are there would be a projection that
 * throws on the oldest rows in the table — which are exactly the rows a tracking page is for.
 */
export interface NinaImageJobRecord {
  id: string
  status: NinaTurnStatus
  /** Phase while pending, failure reason when failed, `null` on success. */
  errorCode: string | null
  model: string
  createdAt: Date
  latencyMs: number | null
  costMicroUsd: number | null
  purpose: NinaImagePurpose
  scene: string | null
  mood: string | null
  /** **The exact prompt as sent.** R1 asks for this by name. */
  prompt: string | null
  /** The prompt-as-sent record that lands in `nina_message_images.prompt`. */
  sidecar: string | null
  seed: number | null
  attempts: number
  source: NinaImageJobArgs['source'] | null
  /** The runner message that asked, per `NinaImageJobArgs`. `null` for every avatar job. */
  replyToId: string | null
}

export interface NinaImageJobDetail extends NinaImageJobRecord {
  /**
   * The session `replyToId` lives in — **resolved, not assumed.**
   *
   * `null` means one of two things and they need the same answer: the message was deleted
   * (`reply_to_id` is `ON DELETE SET NULL`, so the jsonb keeps pointing at nothing) or its session
   * was removed and the cascade took it. `planJobJump` turns both into `{ kind: 'gone' }`.
   */
  replySessionId: string | null
}

const JOB_COLUMNS = {
  id: ninaTurns.id,
  status: ninaTurns.status,
  errorCode: ninaTurns.errorCode,
  model: ninaTurns.model,
  createdAt: ninaTurns.createdAt,
  latencyMs: ninaTurns.latencyMs,
  costMicroUsd: ninaTurns.costMicroUsd,
  args: ninaTurns.args,
}

function toJobRecord(row: {
  id: string
  status: NinaTurnStatus
  errorCode: string | null
  model: string
  createdAt: Date
  latencyMs: number | null
  costMicroUsd: number | null
  args: unknown
}): NinaImageJobRecord {
  const args = (row.args ?? null) as Partial<NinaImageJobArgs> | null
  return {
    id: row.id,
    status: row.status,
    errorCode: row.errorCode,
    model: row.model,
    createdAt: row.createdAt,
    latencyMs: row.latencyMs,
    costMicroUsd: row.costMicroUsd,
    /* `toJobRow`'s rule, kept verbatim so the two projections cannot disagree about a purpose. */
    purpose: args?.purpose === 'avatar' ? 'avatar' : 'selfie',
    scene: typeof args?.scene === 'string' ? args.scene : null,
    mood: typeof args?.mood === 'string' ? args.mood : null,
    prompt: typeof args?.prompt === 'string' ? args.prompt : null,
    sidecar: typeof args?.sidecar === 'string' ? args.sidecar : null,
    seed: typeof args?.seed === 'number' ? args.seed : null,
    attempts: typeof args?.attempts === 'number' ? args.attempts : 0,
    source:
      args?.source === 'chat' || args?.source === 'generated' || args?.source === 'admin'
        ? args.source
        : null,
    replyToId: typeof args?.replyToId === 'string' ? args.replyToId : null,
  }
}

/**
 * **R1's list. Every image job, newest first, and NOTHING is written.** See the block above.
 *
 * One indexed read on `nina_turns_user_created_idx` (`(user_id, created_at DESC)`), with `kind`
 * as a heap filter over rows that are already this user's — the same access path
 * `countNinaTurnsSince` uses for the daily cap.
 */
export async function listNinaImageJobs(
  userId: string,
  opts: { limit?: number } = {},
): Promise<NinaImageJobRecord[]> {
  const rows = await db
    .select(JOB_COLUMNS)
    .from(ninaTurns)
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.kind, 'image')))
    .orderBy(desc(ninaTurns.createdAt))
    .limit(opts.limit ?? NINA_JOB_LIST_LIMIT)

  return rows.map((row) => toJobRecord(row))
}

/**
 * **R1's detail read, and invariant 5 in one function.**
 *
 * A job id in a URL is a CLAIM. `eq(ninaTurns.userId, userId)` in the `WHERE` is what turns it into
 * a fact: somebody else's id and an id that never existed both come back `null`, so the page 404s
 * identically for both and nothing leaks which ids exist. The route still shape-checks with
 * `isValidId` first, on `/r/[id]`'s precedent — a segment that cannot be one of ours should 404
 * without a query.
 *
 * The second read resolves the triggering message. `getNinaMessagesByIds` is owner-scoped too, so
 * a `replyToId` belonging to another runner — or to a message that has since been deleted, or whose
 * session was removed — comes back empty and `replySessionId` stays `null`. That is deliberately
 * the SAME mechanism `resolveNinaSessionForMessage` uses to place an apology, so the two features
 * cannot disagree about which conversation a job belongs to.
 *
 * It is a second round trip rather than a join, for the reason `postNinaApologyMessage` gives about
 * the same lookup: it is one indexed read, on a page that is already one indexed read, opened at
 * most a handful of times a day. A hand-written join against a `jsonb` field would buy a
 * millisecond and cost the ownership scope being visible in one place.
 */
export async function getNinaImageJobDetail(
  userId: string,
  jobId: string,
): Promise<NinaImageJobDetail | null> {
  const [row] = await db
    .select(JOB_COLUMNS)
    .from(ninaTurns)
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.kind, 'image')))

  if (row == null) return null

  const record = toJobRecord(row)
  if (record.replyToId === null) return { ...record, replySessionId: null }

  const [message] = await getNinaMessagesByIds(userId, [record.replyToId])
  return { ...record, replySessionId: message?.sessionId ?? null }
}
```

**Code (the type imports this adds — extend the existing `./imagerecipe` import block at `:9-18`
and add one from the schema):**

```ts
import type { NinaTurnStatus } from '@/lib/db/schema'
```

placed directly under the existing `import { ninaTurns } from '@/lib/db/schema'` at `:6`.
`NinaImagePurpose` and `NinaImageJobArgs` are already imported at `:15` and `:17`.

**Impact:** `lib/nina/imagejobs.ts` grows two reads and two exported types. No existing export
changes shape, so `app/nina/page.tsx`, `lib/nina/avatargen.ts`, `lib/nina/selfiegen.ts` and the
worker are unaffected. Phase 2 may edit the *other* functions in this file freely; the conflict
surface is the two import lines at the top.

---

### Step 3: The ticking clock

**File:** `components/nina/NinaJobElapsed.tsx` (new)
**Change:** the one live number on both screens, in one component so there is one `setInterval`.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { formatJobSeconds, jobElapsedSeconds } from '@/lib/nina/jobview'

/**
 * **R1's "how long the job has been going on", ticking.**
 *
 * ── WHY IT TAKES `nowMs` AS A PROP AND STILL READS `Date.now()` ───────────────────────────────
 * Hydration. The server renders this component with the clock it read during the render; if the
 * first CLIENT render read `Date.now()` instead, the two strings would differ by however long the
 * payload spent on the wire and React would report a mismatch on a screen whose whole content is
 * a number. So the first render on both sides is `nowMs - startedAtMs`, from props, and the
 * browser's own clock is only consulted from the interval — after mount, where a difference is a
 * tick rather than a mismatch. `app/nina/page.tsx` hoists `todayInJakarta()` out of `<ChatScreen>`
 * for exactly this reason and states it.
 *
 * ── WHY THERE IS NO ANIMATION (INVARIANT 8) ───────────────────────────────────────────────────
 * A number that changes is not a transition and not a keyframe. Nothing here is animated, nothing
 * pulses, and `tests/motion.reducedMotion.test.ts` has nothing to guard.
 *
 * ── `running: false` IS NOT A DEGRADED CASE ───────────────────────────────────────────────────
 * `nina_turns` has NO `finished_at` column, so a terminal job has no recorded wall-clock end and
 * counting up from `created_at` forever would be a lie that gets worse every second. The caller
 * passes `running: false` for a closed job and renders `latency_ms` beside this instead — see the
 * phase plan's D4. This component then renders one frozen string and starts no timer.
 */
export function NinaJobElapsed({
  startedAtMs,
  nowMs,
  running,
  className,
}: {
  startedAtMs: number
  /** The clock at render, from the server. Both first renders use it; see the header. */
  nowMs: number
  running: boolean
  className?: string
}) {
  const [seconds, setSeconds] = React.useState(() => jobElapsedSeconds(startedAtMs, nowMs))

  React.useEffect(() => {
    if (!running) return
    /* One immediate correction for the wire time, then one tick a second. `window.setInterval`
       rather than a chain of timeouts: the value is re-derived from the clock every time, so a
       throttled background tab catches up on its next tick instead of drifting. */
    setSeconds(jobElapsedSeconds(startedAtMs, Date.now()))
    const handle = window.setInterval(() => {
      setSeconds(jobElapsedSeconds(startedAtMs, Date.now()))
    }, 1000)
    return () => window.clearInterval(handle)
  }, [running, startedAtMs])

  return (
    <span className={className} suppressHydrationWarning>
      {formatJobSeconds(seconds)}
    </span>
  )
}
```

**Impact:** none yet — nothing renders it until Step 4.

---

### Step 4: The list

**File:** `components/nina/NinaJobList.tsx` (new)
**Change:** the reusable list. **`'use client'` is load-bearing — see D3.**

**Code:**

```tsx
'use client'

import Link from 'next/link'

import { cn } from '@/lib/cn'
import { formatJobLatency, type NinaJobListItem } from '@/lib/nina/jobview'
import { NinaJobElapsed } from './NinaJobElapsed'

/**
 * **R1's job list — and PHASE 5 RENDERS THIS EXACT COMPONENT.**
 *
 * ── WHY IT IS A CLIENT COMPONENT, AND WHY THAT IS NOT NEGOTIABLE ──────────────────────────────
 * `components/nina/NinaAboutScreen.tsx` is `'use client'` (it holds the photo viewer's state and
 * calls `useRouter`), and phase 5 puts this list inside it, directly below the Media section. A
 * Server Component cannot be rendered from a client component except through a `children` slot, so
 * a server-side list would force phase 5 to either duplicate this markup or re-plumb
 * `app/nina/about/page.tsx` around a slot — and the plan is explicit that phase 5 must not write a
 * second implementation of anything. A client component taking only serializable props is the one
 * shape both a Server Component page and a client screen can render unchanged.
 *
 * Every prop is therefore a string, a number, a boolean or null. `createdAtMs` is epoch
 * milliseconds and not a `Date` for the same reason `NinaJobElapsed` takes `nowMs`: a number is a
 * thing the two halves cannot disagree about.
 *
 * ── WHAT IT DOES NOT DECIDE ───────────────────────────────────────────────────────────────────
 * The ORDER. `listNinaImageJobs` already ordered these newest-first in SQL, and this component
 * maps rather than sorts — `planSessionList`'s rule one screen over, for its stated reason.
 *
 * The STAGE and the ERROR WORDS. Both come out of `lib/nina/jobview.ts`, pre-resolved on whichever
 * side built the items, so the list on `/nina/jobs` and the section on `/nina/about` cannot name
 * the same stage two ways.
 *
 * ── NO EMPTY-STATE COMPONENT ──────────────────────────────────────────────────────────────────
 * `EmptyState` is a dashed card with a title and an action, which is the right shape for a whole
 * screen and the wrong one for a section inside somebody else's page. So absence is one sentence,
 * worded by the CALLER: `/nina/jobs` says something different from a section under Media, and a
 * component that hard-coded either would be a component phase 5 has to fork.
 */
export function NinaJobList({
  items,
  nowMs,
  emptyText,
  className,
}: {
  /** Already ordered newest-first by `listNinaImageJobs`. Never re-sorted below this line. */
  items: readonly NinaJobListItem[]
  /** The server's clock at render. See `NinaJobElapsed`. */
  nowMs: number
  /** What absence says on this surface. */
  emptyText: string
  className?: string
}) {
  if (items.length === 0) {
    return (
      <p className={cn('rounded-field border border-dashed border-rule px-4 py-6 text-center text-[12px] font-medium text-ink-2', className)}>
        {emptyText}
      </p>
    )
  }

  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className={cn(
              'block rounded-card px-3 py-2.5',
              /* `Card.tsx`'s one surface for a row that is still doing something; bare paper for a
                 row that has finished. `SessionRow` makes the same distinction the same way. */
              item.open ? 'bg-card shadow-card' : 'bg-transparent',
            )}
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[15px] leading-[1.35] font-semibold text-ink">
                {item.scene ?? (item.purpose === 'avatar' ? 'Foto profil' : 'Selfie')}
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-ink-2 tabular-nums">
                {item.open ? (
                  <NinaJobElapsed
                    startedAtMs={item.createdAtMs}
                    nowMs={nowMs}
                    running
                  />
                ) : (
                  formatJobLatency(item.latencyMs)
                )}
              </span>
            </span>

            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-ink-3">
              <span className={item.stage === 'failed' ? 'font-semibold text-red' : undefined}>
                {item.stageLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span>{item.purpose === 'avatar' ? 'Foto profil' : 'Selfie'}</span>
              {item.attempts > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{item.attempts}x dicoba</span>
                </>
              )}
            </span>

            {item.errorLabel !== null && (
              <span className="mt-1 block max-w-[54ch] text-[12px] leading-[1.45] font-medium text-red">
                {item.errorLabel}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

**Impact:** the component Phase 5 imports. Its props are the contract; changing them breaks Phase 5.

---

### Step 5: The detail body and the jump control

**File:** `components/nina/NinaJobDetail.tsx` (new)

**Code:**

```tsx
'use client'

import { ButtonLink, Card, Stat } from '@/components/ui'
import {
  NINA_JOB_JUMP_NOTE,
  formatJobLatency,
  formatMicroUsd,
  type NinaJobJump,
  type NinaJobStage,
} from '@/lib/nina/jobview'
import { NinaJobElapsed } from './NinaJobElapsed'

/**
 * **R1's image-generation detail page: "the exact prompt of image generation, how long the job has
 * been going on, what is the error status, etc." — plus the button back to the bubble that asked.**
 *
 * ── EVERY PROP IS SERIALIZABLE, AND THE JUMP ARRIVES ALREADY DECIDED ──────────────────────────
 * `planJobJump` ran on the server, against an ownership-scoped resolution of `args.replyToId`. This
 * component renders the answer; it does not re-derive it. That is the same split
 * `planSessionRemoval` keeps one screen over, and for the same reason: the client must not hold a
 * second opinion about a question the database already answered.
 *
 * ── WHY A `ButtonLink` AND NOT A BUTTON ───────────────────────────────────────────────────────
 * It is a navigation to a URL that exists, so it keeps the platform's long-press, middle-click and
 * back behaviour and Next prefetches the chat. The same argument `NinaSidebar`'s avatar link makes,
 * and the same one `NewChatButton` makes in the other direction (its destination does not exist
 * until an action has run, so it is a button).
 *
 * ── WHY THE PROMPT IS RENDERED AT ALL ─────────────────────────────────────────────────────────
 * R1 asks for it by name. It is Nina's own generated text about her own photograph, not the private
 * `nina_message_images.description` prose that invariant 5 keeps on the server — and the runner
 * asking "why did that come out like that" has no other way to find out.
 */
export function NinaJobDetail({
  stage,
  stageLabel,
  errorLabel,
  purpose,
  scene,
  mood,
  prompt,
  sidecar,
  seed,
  model,
  attempts,
  costMicroUsd,
  latencyMs,
  createdAtMs,
  createdAtLabel,
  nowMs,
  jump,
}: {
  stage: NinaJobStage
  stageLabel: string
  errorLabel: string | null
  purpose: 'selfie' | 'avatar'
  scene: string | null
  mood: string | null
  prompt: string | null
  sidecar: string | null
  seed: number | null
  model: string
  attempts: number
  costMicroUsd: number | null
  latencyMs: number | null
  createdAtMs: number
  /** Formatted on the SERVER — a formatted instant in a client component is a hydration mismatch. */
  createdAtLabel: string
  nowMs: number
  jump: NinaJobJump
}) {
  const open = stage === 'queued' || stage === 'dispatched' || stage === 'running'

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={
              stage === 'failed'
                ? 'text-[19px] font-semibold text-red'
                : 'text-[19px] font-semibold text-ink'
            }
          >
            {stageLabel}
          </p>
          <p className="text-[19px] font-semibold text-ink tabular-nums">
            {open ? (
              <NinaJobElapsed startedAtMs={createdAtMs} nowMs={nowMs} running />
            ) : (
              formatJobLatency(latencyMs)
            )}
          </p>
        </div>
        <p className="mt-1 text-[11px] font-medium text-ink-3">
          {open ? `Jalan sejak ${createdAtLabel}` : `Dibuka ${createdAtLabel}`}
        </p>

        {errorLabel !== null && (
          <p className="mt-3 max-w-[54ch] rounded-field bg-paper-2 px-3 py-2 text-[13px] leading-[1.5] font-semibold text-red">
            {errorLabel}
          </p>
        )}

        {/*
          The jump. `'ready'` is a control; the other three are a sentence, because a button that
          navigates nowhere is the one thing R1's degradations must not become. See `planJobJump`.
        */}
        <div className="mt-4">
          {jump.kind === 'ready' ? (
            <ButtonLink href={jump.href} size="md" fullWidth>
              Buka chat-nya
            </ButtonLink>
          ) : (
            <p className="max-w-[54ch] rounded-field border border-dashed border-rule px-3 py-2.5 text-[12px] leading-[1.5] font-medium text-ink-2">
              {NINA_JOB_JUMP_NOTE[jump.kind]}
            </p>
          )}
        </div>
      </Card>

      <Card className="grid grid-cols-2 gap-4 p-5">
        <Stat label="Jenis" value={purpose === 'avatar' ? 'Foto profil' : 'Selfie'} size="sm" />
        <Stat label="Percobaan" value={String(attempts)} size="sm" />
        {/*
          **"Biaya total", not "Biaya", and it sits beside "Percobaan" for a reason.**
          `nina_turns.cost_micro_usd` is a per-JOB CUMULATIVE TOTAL across attempts — reconciled
          across phases 1, 2, 4 and 7 under invariant 9 (see the plan index's Decisions). Every
          writer on both hosts accumulates: the worker's `finishSelfie`/`finishAvatar`/`closeFailed`
          and the in-platform `completeNinaImageJob`/`requeueNinaImageJob`/`failNinaImageJob`. So a
          job that burned both attempts legitimately reads $0.080, and the attempt count next to it
          is what makes that number legible rather than alarming. Labelling it "Biaya" would invite
          the reader to divide by nothing.
        */}
        <Stat label="Biaya total" value={formatMicroUsd(costMicroUsd)} size="sm" />
        <Stat label="Seed" value={seed === null ? '—' : String(seed)} size="sm" />
        <Stat label="Model" value={model} size="sm" />
        <Stat label="Suasana" value={mood ?? '—'} size="sm" />
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Prompt
        </h2>
        {scene !== null && (
          <p className="mb-2 text-[13px] font-semibold text-ink-2">{scene}</p>
        )}
        {prompt === null ? (
          <p className="text-[13px] font-medium text-ink-3">
            Job ini nggak nyimpen prompt-nya — barisnya dibuat sebelum kolom itu ada.
          </p>
        ) : (
          <p className="text-[13px] leading-[1.55] font-medium whitespace-pre-wrap text-ink">
            {prompt}
          </p>
        )}
        {sidecar !== null && sidecar !== prompt && (
          <>
            <h2 className="mt-4 mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
              Catatan foto
            </h2>
            <p className="text-[13px] leading-[1.55] font-medium whitespace-pre-wrap text-ink-2">
              {sidecar}
            </p>
          </>
        )}
      </Card>
    </div>
  )
}
```

**Impact:** none until Step 7.

---

### Step 6: The list route

**File:** `app/nina/jobs/page.tsx` (new)

**Code:**

```tsx
import { NinaJobList } from '@/components/nina/NinaJobList'
import { AppShell, ScreenHeader } from '@/components/ui/AppShell'
import { requireUserId } from '@/lib/auth/requireUserId'
import { listNinaImageJobs } from '@/lib/nina/imagejobs'
import { toNinaJobListItems } from '@/lib/nina/jobview'

/**
 * `/nina/jobs` — R1's tracking page: every image generation, newest first, with its stage, its
 * elapsed time and its error at a glance.
 *
 * ── ONE INDEXED READ AND NOTHING ELSE ─────────────────────────────────────────────────────────
 * `listNinaImageJobs` reads `nina_turns_user_created_idx` with `kind` as a heap filter and a real
 * `LIMIT`. No model call, so invariant 4 is satisfied structurally — there is nothing here for
 * `scripts/check-llm-payload-boundary.mjs` to object to — and `app/nina/about/page.tsx` is the
 * precedent for the whole shape.
 *
 * **NO SWEEP.** `listOpenNinaImageJobs` runs `sweepStaleNinaImageJobs` for its side effect and
 * `/nina` still awaits it; this page deliberately does not. See the block above `listNinaImageJobs`
 * for why a tracking screen must not change what it is describing by being looked at.
 *
 * ── WHY THERE IS NO `loading.tsx` ─────────────────────────────────────────────────────────────
 * `app/nina/about/page.tsx`'s D-4, unchanged: one index lookup resolves inside one paint, so a
 * skeleton would flash and be replaced. One at `app/nina/` would wrap the conversation too, which
 * is the specific thing that page declined to impose on a route it did not own.
 *
 * ── NO `maxDuration` ──────────────────────────────────────────────────────────────────────────
 * That export exists on `/nina` and `/r/[id]` because a Server Action's timeout is the page
 * SEGMENT's. This route calls no action and awaits no model; the platform default is correct and an
 * export claiming otherwise would be cargo.
 *
 * ── `nowMs` IS READ ONCE, HERE ────────────────────────────────────────────────────────────────
 * One reading of the clock for this render, shared by every ticking row, so two rows a millisecond
 * apart cannot show two different elapsed times for jobs opened in the same second.
 * `app/nina/page.tsx` hoists `todayInJakarta()` out of `<ChatScreen>` for exactly this reason.
 */
export default async function NinaJobsPage() {
  const userId = await requireUserId()
  const jobs = await listNinaImageJobs(userId)

  return (
    <AppShell>
      <ScreenHeader title="Proses foto" />
      <NinaJobList
        items={toNinaJobListItems(jobs)}
        nowMs={Date.now()}
        emptyText="Belum ada foto yang pernah digenerate. Minta Nina kirim satu di chat."
      />
    </AppShell>
  )
}
```

**Impact:** a new route. `AppShell`'s default `screen='tabs'` renders the tab bar and its bottom gap,
which is what `/nina/about` does too.

---

### Step 7: The detail route

**File:** `app/nina/jobs/[id]/page.tsx` (new)

**Code:**

```tsx
import { notFound } from 'next/navigation'

import { NinaJobDetail } from '@/components/nina/NinaJobDetail'
import { AppShell, ScreenHeader } from '@/components/ui/AppShell'
import { requireUserId } from '@/lib/auth/requireUserId'
import { jakartaDayOf } from '@/lib/date/ranges'
import { formatDayCompact } from '@/lib/format'
import { isValidId } from '@/lib/id'
import { SESSION_PARAM } from '@/lib/nina/active'
import { getNinaImageJobDetail } from '@/lib/nina/imagejobs'
import {
  NINA_JOBS_HREF,
  NINA_JOB_STAGE_LABEL,
  jobErrorLabel,
  jobStage,
  planJobJump,
} from '@/lib/nina/jobview'

/**
 * `/nina/jobs/[id]` — R1's image-generation detail page.
 *
 * ── THE ID IN THE URL IS A CLAIM; THE `WHERE` IS THE FACT (INVARIANT 5) ───────────────────────
 * `isValidId` first, on `/r/[id]`'s precedent — a segment that cannot be one of ours 404s without a
 * query. Then `getNinaImageJobDetail(userId, id)`, which puts `user_id` in the `WHERE`, so a
 * foreign id and a nonexistent id come back as the same `null` and 404 identically. Nothing here
 * discloses which ids exist.
 *
 * `PageProps<'/nina/jobs/[id]'>` is Next 16's globally available helper — not an import — and
 * `params` is a PROMISE that must be awaited
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, "Page Props
 * Helper"). The types are generated by `next typegen`, which `npm run typecheck` runs first; the
 * route is new, so a bare `tsc --noEmit` against a stale `.next/types` will not know this literal.
 *
 * ── WHERE THE JUMP IS DECIDED ─────────────────────────────────────────────────────────────────
 * HERE, on the server, from an ownership-scoped resolution — never in the component. `planJobJump`
 * turns the four cases (a live bubble, an avatar job that never had one, a job whose args carry no
 * reply target, and a message that has been deleted or whose session was removed) into one value
 * the client renders without re-deriving anything.
 *
 * `SESSION_PARAM` is imported HERE and passed down, so `?s=`'s spelling still lives in exactly one
 * place — `app/nina/page.tsx` concentrates its cross-phase dependencies the same way and says so.
 *
 * ── THE DAY LABEL IS FORMATTED ON THE SERVER ──────────────────────────────────────────────────
 * Invariant 4's habit and `sessionDayLabel`'s stated reason: a formatted instant inside a client
 * component is the hydration mismatch `app/nina/page.tsx` documents in three places.
 */
export default async function NinaJobDetailPage({ params }: PageProps<'/nina/jobs/[id]'>) {
  const userId = await requireUserId()
  const { id } = await params
  if (!isValidId(id)) notFound()

  const job = await getNinaImageJobDetail(userId, id)
  if (job === null) notFound()

  const stage = jobStage({ status: job.status, errorCode: job.errorCode })

  return (
    <AppShell>
      <ScreenHeader
        title="Detail foto"
        action={
          <a href={NINA_JOBS_HREF} className="text-[13px] font-semibold text-accent">
            SEMUA JOB
          </a>
        }
      />
      <NinaJobDetail
        stage={stage}
        stageLabel={NINA_JOB_STAGE_LABEL[stage]}
        errorLabel={stage === 'failed' ? jobErrorLabel(job.errorCode) : null}
        purpose={job.purpose}
        scene={job.scene}
        mood={job.mood}
        prompt={job.prompt}
        sidecar={job.sidecar}
        seed={job.seed}
        model={job.model}
        attempts={job.attempts}
        costMicroUsd={job.costMicroUsd}
        latencyMs={job.latencyMs}
        createdAtMs={job.createdAt.getTime()}
        createdAtLabel={formatDayCompact(jakartaDayOf(job.createdAt))}
        nowMs={Date.now()}
        jump={planJobJump({
          purpose: job.purpose,
          replyToId: job.replyToId,
          replySessionId: job.replySessionId,
          sessionParam: SESSION_PARAM,
        })}
      />
    </AppShell>
  )
}
```

**Note on the `action` link:** a bare `<a>` rather than `<Link>`, matching `ScreenHeader`'s
docstring ("at most one plain-text link"). If the repo's other `ScreenHeader` actions use `<Link>`,
match them — this is cosmetic and not part of the contract.

**Impact:** a new dynamic route. `npm run typecheck` runs `next typegen` first, which is what makes
`PageProps<'/nina/jobs/[id]'>` resolve.

---

### Step 8: The sidebar entry

**File:** `components/nina/NinaSidebar.tsx:363-366` — between the `newChatSlot` block and
`<SessionList>`.
**Change:** one `<Link>`. Add `NINA_JOBS_HREF` to the imports.

**Code (the import, added to the existing block at `:10-16`):**

```tsx
import { NINA_JOBS_HREF } from '@/lib/nina/jobview'
```

**Code (inserted after the `newChatSlot` `<div>` at `:363-365`, before `<SessionList>`):**

```tsx
        {/*
          **R1's sidebar button — "in sidebar, add a button that will redirect user to a new page".**

          ── A PLAIN `<Link>`, AND IT DELIBERATELY DOES NOT CALL `closeRef` ─────────────────────
          This panel is an OVERLAY held open by `?sidebar=1`, and its close path is not symmetric:
          `closeSidebar` calls `window.history.back()` when this session pushed the entry, and
          `replaceState` when it did not. Firing it in the same tick as a `<Link>`'s push would put
          a back and a forward on one entry and race them.

          It does not need to. `/nina/jobs` is a DIFFERENT ROUTE, so the pushed entry carries no
          `sidebar` key and the panel closes through the URL that opened it — which is exactly what
          the avatar link to `/nina/about` above already relies on, in its own words: "Navigating to
          `/nina/about` drops `?sidebar=1`, so the panel closes on its own, and the back gesture
          returns to it open. Nothing extra is wired for that." `SessionRow` states the same rule
          from the other side: an inactive row is a `<Link>` and does NOT call `onClose`; only the
          ACTIVE row, which navigates nowhere, is a button that does.

          The one cost is the one that link already pays: after a back gesture the provider
          remounts with `pushedRef` false, so a later ✕ closes by `replaceState` and leaving `/nina`
          takes one extra back-swipe. Pre-existing for every cross-route link out of this panel, and
          not this phase's to change.

          `secondary`'s tint rather than `NewChatButton`'s ink slab: starting a conversation is the
          primary act on this panel and there may be only one primary.
        */}
        <div className="mb-4">
          <Link
            href={NINA_JOBS_HREF}
            className={cn(
              'flex h-11 w-full items-center justify-center gap-2 rounded-field bg-paper-2 px-4',
              'text-[14px] font-semibold text-ink transition-opacity active:opacity-80',
            )}
          >
            <span aria-hidden="true" className="text-[15px] leading-none">
              ◔
            </span>
            <span>Proses foto</span>
          </Link>
        </div>
```

**Impact:** one row in the panel. `Link` and `cn` are already imported in this file (`:3`, `:7`).

---

### Step 9: The `ChatScreen` side of the deep link

**File:** `components/nina/ChatScreen.tsx`. Line numbers are `origin/main`'s and **Phase 3 moves
them**; the anchor text is authoritative.

**Change 9a — imports (`:3-4` and `:27`).**

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
```

```tsx
import {
  QUOTE_FLASH_MS,
  buildQuote,
  planQuoteScroll,
  type QuoteScroll,
  type QuoteView,
} from '@/lib/nina/reply'
import { JOB_JUMP_PARAM, parseNinaJumpParam } from '@/lib/nina/jobview'
```

**Change 9b — capture the jump target on the first render.** Add directly below
`const { mark } = useChatScrollMark()` (`:227`).

```tsx
  /*
   * ── R1's DEEP LINK: `?jump=<messageId>` ───────────────────────────────────────────────────
   * `/nina/jobs/[id]`'s "Buka chat-nya" lands here with `?s=<session>&jump=<message>`. The session
   * opened the right conversation on the server; this is the bubble to pinpoint.
   *
   * **READ ON THE FIRST RENDER AND HELD IN A REF**, for two reasons that both bite:
   *
   *   - the layout effect below CONSUMES the parameter (see its header), so by the time the jump
   *     runs `useSearchParams()` no longer has it. `useRef`'s initialiser is evaluated on every
   *     render and React keeps only the first result, which is precisely the one-shot semantics
   *     this needs;
   *   - `useSearchParams()` resolves during the SERVER render on this dynamically rendered route,
   *     so the first client render agrees with it and nothing here is a hydration hazard.
   *
   * The ref is cleared inside the animation frame rather than in the effect body. StrictMode
   * double-invokes effects in development: clearing it up front would let the first (immediately
   * torn down) run consume the target and the second run find nothing — the jump would work in
   * production and never in dev, which is the worst of the two ways to be wrong.
   */
  const searchParams = useSearchParams()
  const jumpRef = useRef<string | null>(parseNinaJumpParam(searchParams.get(JOB_JUMP_PARAM)))
```

**Change 9c — consume `?jump=` in the effect that already consumes `?attach=` and `?photo=`**
(`:253-260`). The file's own docstring forbids adding a *second* `replaceState`; this extends the
one that exists, deleting a third key by name so `?s=` and `?at=` still survive untouched.

> **The effect's own docstring counts the keys, in two places, and both must be updated with the
> code.** Verified verbatim in the shipped file: `:236` reads *"ONE effect deleting both, not
> two"*, and `:245-247` reads *"this effect copies the query and deletes two keys BY NAME rather
> than rebuilding it"*. After this change it deletes **three**. Say three in both sentences, and
> add `?jump=` to the list. Leave the two rules that follow exactly as they are — *"do not
> 'simplify' the two `delete` calls into a freshly built `URLSearchParams`"* (now three) and *"do
> not add a third `replaceState` to this component"* — because this change obeys both: it adds a
> `delete`, not a `replaceState`, which is precisely why it goes inside the existing effect. A
> third rule is worth appending while you are there: **the deletes are by name so that `?s=` and
> `?at=` survive; a fourth parameter belongs in this same list, never in a new effect.**
>
> There is one more stale count in the file: `:862-863` quotes the same *"one effect deleting both
> parameters"* line inside an unrelated comment about the attach path. Fix it to match, or the
> next reader finds two numbers and trusts the wrong one.

Replace:

```tsx
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(ATTACH_PARAM) && !params.has(PHOTO_PARAM)) return
    params.delete(ATTACH_PARAM)
    params.delete(PHOTO_PARAM)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])
```

with:

```tsx
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (
      !params.has(ATTACH_PARAM) &&
      !params.has(PHOTO_PARAM) &&
      !params.has(JOB_JUMP_PARAM)
    ) {
      return
    }
    params.delete(ATTACH_PARAM)
    params.delete(PHOTO_PARAM)
    /*
     * R1's `?jump=` is consumed here for the same reason as the other two, and for one more that
     * is specific to it: it is a ONE-SHOT INSTRUCTION, not state. Leaving it on the entry would
     * mean every back-swipe into this chat re-scrolls and re-flashes a bubble the runner has
     * already read. That is exactly the property `?at=` must NOT have — which is why the two are
     * different keys; see `lib/nina/jobview.ts`.
     */
    params.delete(JOB_JUMP_PARAM)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])
```

**Change 9d — split `handleJumpToQuote` into a measurement and a flash, and reuse both.**
Replace the whole `handleJumpToQuote` callback (`:440-475`, docstring kept and extended):

```tsx
  /**
   * Where the page has to move so `targetId` is comfortably readable — or `null` when that message
   * is not in the document.
   *
   * The DOM read is deliberate and is the only DOM read on this screen besides the keyboard's.
   * `getElementById` on phase 4's `nina-msg-${id}` anchor is the one honest source for where a
   * message actually is: React knows the order of the rows, not their pixel heights, which depend
   * on wrapping, on a quote stub, and on an image. A missing element is the degradation path, not
   * an error — the row was on screen when the page rendered and is not now, or (F35 phase 4's deep
   * link) it is further back than `CHAT_HISTORY_LIMIT` reaches.
   *
   * `getBoundingClientRect().top` on the composer, rather than a constant, because the obstruction
   * is the composer's height (which the reply strip, a tile row and a multi-line draft all change)
   * plus its offset (clearance, or the keyboard).
   *
   * **Extracted from `handleJumpToQuote` so R1's deep link reuses the same arithmetic rather than
   * inventing a second scroll-and-flash.** `planQuoteScroll` stays the one decision function.
   */
  const measureQuoteScroll = useCallback((targetId: string): QuoteScroll | null => {
    const element = document.getElementById(`nina-msg-${targetId}`)
    if (element === null) return null

    const composer = document.getElementById('nina-composer')
    const obstructedBottomPx =
      composer === null
        ? COMPOSER_FALLBACK_PX
        : Math.max(0, window.innerHeight - composer.getBoundingClientRect().top)

    const rect = element.getBoundingClientRect()
    return planQuoteScroll({
      targetTop: rect.top + window.scrollY,
      targetHeight: rect.height,
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: window.innerHeight,
      /* This screen's header scrolls away with the document; nothing is fixed at the top. */
      obstructedTopPx: 0,
      obstructedBottomPx,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
  }, [])

  /**
   * The landing tint, held for `QUOTE_FLASH_MS`.
   *
   * It runs whether or not the page moved: `kind: 'none'` means the target was already on screen,
   * which is exactly the case where a scroll alone would identify nothing. Transition-based in
   * `MessageBubble`, so invariant 8 has nothing to guard.
   */
  const flashMessage = useCallback((targetId: string) => {
    setNotice(null)
    setFlashId(targetId)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      if (alive.current) setFlashId(null)
    }, QUOTE_FLASH_MS)
  }, [])

  /**
   * R12's second half: tapping a quote scrolls to the message it names, and says which one it
   * landed on.
   */
  const handleJumpToQuote = useCallback(
    (targetId: string) => {
      const plan = measureQuoteScroll(targetId)
      if (plan === null) {
        setNotice('quote-missing')
        return
      }
      if (plan.kind === 'scroll') window.scrollTo({ top: plan.top, behavior: plan.behavior })
      flashMessage(targetId)
    },
    [measureQuoteScroll, flashMessage],
  )

  /**
   * **R1's landing: a job page said "this bubble", so pinpoint it.**
   *
   * ── WHY IT REUSES `planQuoteScroll` ───────────────────────────────────────────────────────
   * The user asked for it in those words — "just like how we can click and directly pinpoint
   * reply_to message". A second scroll-and-flash would be a second set of rules about the band the
   * composer leaves over, and the two would drift the first time the composer's geometry changed.
   *
   * ── WHY `'instant'`, OVERRIDING THE PLAN'S OWN `behavior` ─────────────────────────────────
   * `planQuoteScroll` chooses `'smooth'` because a quote tap is a movement WITHIN a screen the
   * runner is already reading, and watching the page travel is what tells them they went backwards.
   * This is an ARRIVAL: the runner navigated here from another route and has not seen this
   * conversation yet, so there is no "from" to animate out of — smooth-scrolling a screen that just
   * painted only shows them the bottom of the chat on the way past. `MessageList`'s R14 restore
   * takes `'instant'` for the same reason and says so.
   *
   * ── WHY AN ANIMATION FRAME, AND WHY TWICE ─────────────────────────────────────────────────
   * Child effects run before parent effects, so `MessageList`'s mount jump-to-newest has already
   * happened by the time this effect runs; one frame later, layout is settled and this wins. The
   * second application is `MessageList`'s restore idiom, verbatim and for its reason: a web font
   * settling or an image finishing decode moves the target after the first measurement, and
   * re-deriving the same pure number from the element's new position is cheap. When nothing moved,
   * `planQuoteScroll` returns `'none'` under its 8px tolerance and the second call is a no-op.
   *
   * A missing element is the `'quote-missing'` notice, which is already the right sentence: the
   * message is real (the job page resolved it against the database) but it is not among the
   * `CHAT_HISTORY_LIMIT` rows this screen renders.
   */
  useEffect(() => {
    if (jumpRef.current === null) return

    const frame = window.requestAnimationFrame(() => {
      const targetId = jumpRef.current
      if (targetId === null || !alive.current) return
      jumpRef.current = null

      const plan = measureQuoteScroll(targetId)
      if (plan === null) {
        setNotice('quote-missing')
        return
      }
      if (plan.kind === 'scroll') window.scrollTo({ top: plan.top, behavior: 'instant' })
      flashMessage(targetId)

      window.requestAnimationFrame(() => {
        if (!alive.current) return
        const again = measureQuoteScroll(targetId)
        if (again !== null && again.kind === 'scroll') {
          window.scrollTo({ top: again.top, behavior: 'instant' })
        }
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [measureQuoteScroll, flashMessage])
```

**Impact:** `handleJumpToQuote` keeps its exact behaviour and signature (`MessageList`'s
`onJumpToQuote` prop is unchanged). One new effect, one new ref, one extra `params.delete`. No new
`replaceState`, no new state, no change to any prop of any child.

---

### Step 10: The tests

**File:** `tests/nina.jobview.test.ts` (new)
**Change:** the suite over Step 1. `vitest.config.ts` is `environment: 'node'`, which is exactly why
Step 1 is a pure module.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { SESSION_PARAM } from '@/lib/nina/active'
import { CHAT_SCROLL_PARAM } from '@/lib/nina/scroll'
import {
  JOB_JUMP_PARAM,
  NINA_JOBS_HREF,
  NINA_JOB_JUMP_NOTE,
  NINA_JOB_STAGE_LABEL,
  formatJobLatency,
  formatMicroUsd,
  jobElapsedSeconds,
  jobErrorLabel,
  jobIsOpen,
  jobStage,
  ninaJobHref,
  ninaJumpHref,
  planJobJump,
  toNinaJobListItems,
} from '@/lib/nina/jobview'

describe('the deep link is its own parameter', () => {
  it('does not reuse the scroll-mark key', () => {
    /* D2. `?at=` is an anchor AND an offset with the opposite lifetime; see `jobview.ts`. */
    expect(JOB_JUMP_PARAM).not.toBe(CHAT_SCROLL_PARAM)
  })

  it('carries the session and the message, and nothing else', () => {
    const href = ninaJumpHref({
      sessionId: 'aaaaaaaaaaaa',
      messageId: 'bbbbbbbbbbbb',
      sessionParam: SESSION_PARAM,
    })
    const url = new URL(href, 'https://example.test')
    expect(url.pathname).toBe('/nina')
    expect(url.searchParams.get(SESSION_PARAM)).toBe('aaaaaaaaaaaa')
    expect(url.searchParams.get(JOB_JUMP_PARAM)).toBe('bbbbbbbbbbbb')
    expect([...url.searchParams.keys()]).toHaveLength(2)
  })

  it('refuses anything that cannot be one of our ids', () => {
    expect(parseGuard('bbbbbbbbbbbb')).toBe('bbbbbbbbbbbb')
    expect(parseGuard('short')).toBeNull()
    expect(parseGuard(['a', 'b'])).toBeNull()
    expect(parseGuard(undefined)).toBeNull()
  })
})

/* Imported separately so the block above reads as four assertions about one grammar. */
import { parseNinaJumpParam as parseGuard } from '@/lib/nina/jobview'

describe('jobStage resolves error_code’s two meanings by status', () => {
  it('reads the phase while pending', () => {
    expect(jobStage({ status: 'pending', errorCode: 'queued' })).toBe('queued')
    expect(jobStage({ status: 'pending', errorCode: 'dispatched' })).toBe('dispatched')
    expect(jobStage({ status: 'pending', errorCode: 'running' })).toBe('running')
  })

  it('reads the failure reason as a failure, never as a phase', () => {
    expect(jobStage({ status: 'failed', errorCode: 'stale' })).toBe('failed')
    expect(jobStage({ status: 'failed', errorCode: 'running' })).toBe('failed')
  })

  it('tolerates a phase and a status it has never heard of', () => {
    /* D5: phase 2 may add a phase. A tracking page must not go blank when it does. */
    expect(jobStage({ status: 'pending', errorCode: 'generating-in-platform' })).toBe('queued')
    expect(jobStage({ status: 'pending', errorCode: null })).toBe('queued')
    expect(jobStage({ status: 'weird', errorCode: null })).toBe('queued')
  })

  it('counts repaired as done', () => {
    expect(jobStage({ status: 'ok', errorCode: null })).toBe('done')
    expect(jobStage({ status: 'repaired', errorCode: null })).toBe('done')
  })

  it('marks only the pending stages as open', () => {
    expect(jobIsOpen('queued')).toBe(true)
    expect(jobIsOpen('dispatched')).toBe(true)
    expect(jobIsOpen('running')).toBe(true)
    expect(jobIsOpen('done')).toBe(false)
    expect(jobIsOpen('failed')).toBe(false)
  })

  it('names every stage', () => {
    for (const stage of ['queued', 'dispatched', 'running', 'done', 'failed'] as const) {
      expect(NINA_JOB_STAGE_LABEL[stage].length).toBeGreaterThan(0)
    }
  })
})

describe('jobErrorLabel', () => {
  it('puts the four known failures into words', () => {
    for (const kind of ['timeout', 'policy', 'transport', 'stale']) {
      expect(jobErrorLabel(kind)).not.toBe(kind)
      expect(jobErrorLabel(kind)).not.toBeNull()
    }
  })

  it('renders an unknown code as itself rather than dropping it', () => {
    expect(jobErrorLabel('quota')).toBe('quota')
  })

  it('has nothing to say about a job that did not fail', () => {
    expect(jobErrorLabel(null)).toBeNull()
    expect(jobErrorLabel('')).toBeNull()
  })
})

describe('toNinaJobListItems', () => {
  const base = {
    id: 'aaaaaaaaaaaa',
    status: 'pending',
    errorCode: 'running',
    purpose: 'selfie' as const,
    scene: 'sore di kos',
    attempts: 1,
    createdAt: new Date('2026-09-06T03:02:31.897Z'),
    latencyMs: null,
  }

  it('preserves the order it is given', () => {
    const items = toNinaJobListItems([
      { ...base, id: 'aaaaaaaaaaaa' },
      { ...base, id: 'bbbbbbbbbbbb' },
    ])
    expect(items.map((row) => row.id)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])
  })

  it('serialises the instant as a number', () => {
    const [item] = toNinaJobListItems([base])
    expect(item!.createdAtMs).toBe(base.createdAt.getTime())
  })

  it('carries an error label only on a failed row', () => {
    const [open] = toNinaJobListItems([base])
    expect(open!.errorLabel).toBeNull()
    const [failed] = toNinaJobListItems([{ ...base, status: 'failed', errorCode: 'stale' }])
    expect(failed!.errorLabel).not.toBeNull()
  })

  it('links each row at its own detail page', () => {
    const [item] = toNinaJobListItems([base])
    expect(item!.href).toBe(`${NINA_JOBS_HREF}/aaaaaaaaaaaa`)
    expect(item!.href).toBe(ninaJobHref('aaaaaaaaaaaa'))
  })
})

describe('planJobJump names each way there is no bubble', () => {
  const p = { sessionParam: SESSION_PARAM }

  it('jumps when the message resolved', () => {
    const jump = planJobJump({
      ...p,
      purpose: 'selfie',
      replyToId: 'bbbbbbbbbbbb',
      replySessionId: 'cccccccccccc',
    })
    expect(jump.kind).toBe('ready')
    expect(jump.kind === 'ready' && jump.href).toContain('bbbbbbbbbbbb')
    expect(jump.kind === 'ready' && jump.href).toContain('cccccccccccc')
  })

  it('an avatar job never had a triggering message', () => {
    expect(
      planJobJump({ ...p, purpose: 'avatar', replyToId: null, replySessionId: null }).kind,
    ).toBe('avatar')
  })

  it('a selfie job with no reply target says so separately', () => {
    expect(
      planJobJump({ ...p, purpose: 'selfie', replyToId: null, replySessionId: null }).kind,
    ).toBe('no-message')
  })

  it('an unresolvable message is gone, whether it or its session was deleted', () => {
    expect(
      planJobJump({ ...p, purpose: 'selfie', replyToId: 'bbbbbbbbbbbb', replySessionId: null })
        .kind,
    ).toBe('gone')
  })

  it('every refusal has a sentence', () => {
    for (const kind of ['avatar', 'no-message', 'gone'] as const) {
      expect(NINA_JOB_JUMP_NOTE[kind].length).toBeGreaterThan(0)
    }
  })
})

describe('the numbers', () => {
  it('never reports negative elapsed time', () => {
    expect(jobElapsedSeconds(1000, 900)).toBe(0)
    expect(jobElapsedSeconds(0, 74_000)).toBe(74)
  })

  it('renders micro-USD as dollars, three places', () => {
    expect(formatMicroUsd(40_000)).toBe('$0.040')
    expect(formatMicroUsd(0)).toBe('$0.000')
  })

  it('says nothing rather than zero when the cost was never recorded', () => {
    /* Invariant 9's other half: a NULL cost is "we do not know", not "it was free". */
    expect(formatMicroUsd(null)).not.toBe('$0.000')
  })

  it('renders latency as a duration and a miss as the missing marker', () => {
    expect(formatJobLatency(73_925)).toBe('1:14')
    expect(formatJobLatency(null)).not.toMatch(/\d/)
  })
})
```

**Note:** the mid-file `import { parseNinaJumpParam as parseGuard }` above is written that way only
to keep one describe block self-contained; fold it into the top import block when implementing —
`eslint` will ask for it.

**Impact:** one new suite. No existing test changes.

---

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck` (runs `next typegen` first — required, because
`PageProps<'/nina/jobs/[id]'>` does not exist until the new route is generated)
**Lint:** `npm run lint`
**Tests:** `npm test`
**Guards:** `npm run ci:data-layer-guard && npm run ci:client-secret-guard && npm run ci:llm-payload-guard && npm run ci:f08-guard && npm run ci:f11-guard && npm run ci:openrouter-guard`

Two guards are worth checking by hand rather than trusting:

- **`ci:f08-guard` rule 3** scans `app`, `lib` and `components` for a hand-rolled unit and allows
  `Intl.NumberFormat` in `lib/format.ts` alone. `formatMicroUsd` therefore uses `toFixed(3)`; the
  guard's patterns look for `km|kcal|bpm|spm` after an interpolation, which nothing here emits.
- **`ci:client-secret-guard` does NOT check what this phase needs it to check.** Verified by
  reading the script: it has exactly three rules — a `'use client'` module may not name a secret
  from its hardcoded `SECRETS` list; no file outside `lib/env.ts` / `lib/db/index.ts` may read
  `process.env.<SECRET>` raw; and `NEXT_PUBLIC_` is forbidden everywhere. **It never inspects
  imports**, so it cannot tell you that `lib/nina/jobview.ts` has stayed free of a value import
  from a `server-only` module. Nothing in `scripts/` enforces that rule.
  
  The real enforcement is the `server-only` npm package failing at `next build` — which is a
  genuine gate, just a different one, and it means **`npm run build` is the check that matters
  here, not a guard script.** `JobLike` being structural is what keeps the build green; run
  `npm run build` (not just `typecheck`) before believing the boundary holds. Run the guard anyway
  as a regression check on the other three rules.

**Manual check:**

1. `/nina/jobs` lists all 18 image jobs, newest first. The 15 `failed`/`stale` rows read "Gagal ·
   Selfie" with the stale sentence; the three `ok` rows read "Selesai" with a latency, not a clock.
2. Open a `pending` job (or hand-open one): the list's clock and the detail page's clock both tick
   once a second and agree.
3. The detail page shows the exact `args.prompt`, the seed, `qwen/qwen-image-3-pro`, `$0.040`, and
   the attempt count.
4. Tap "Buka chat-nya" on a selfie job whose triggering message still exists → `/nina` opens the
   right session, lands on that bubble, tints it for 1600 ms, and the URL is left as `/nina?s=<id>`
   with no `jump` on it. Back-swipe → the chat does **not** re-flash.
5. Tap into a job whose message was deleted → no button, one sentence.
6. Open an avatar job → no button, the avatar sentence.
7. Sidebar → "Proses foto" navigates to `/nina/jobs` and the panel is closed on arrival; the back
   gesture returns to the panel open, over the same conversation.
8. `/nina/jobs/<a valid-shaped id that is not yours>` → 404, identical to a nonexistent id.

**Exit criteria:** every `nina_turns` row with `kind='image'` appears on `/nina/jobs` with a correct
stage and elapsed time; the detail page's jump lands on the right bubble and flashes it; a job with
no resolvable bubble degrades to a sentence instead of a dead link; `npm test`, `npm run lint`,
`npm run typecheck` and all six CI guards pass.

---

## Handoffs

**To Phase 5 (R3 — the section on `/nina/about`, below Media). This is the contract; import these
and write no second implementation:**

```ts
// app/nina/about/page.tsx — add to the existing Promise.all
import { listNinaImageJobs } from '@/lib/nina/imagejobs'
import { toNinaJobListItems } from '@/lib/nina/jobview'

const [avatars, images, jobs] = await Promise.all([
  listNinaAvatars(userId),
  listNinaMessageImages(userId, { limit: NINA_GALLERY_LIMIT }),
  listNinaImageJobs(userId),
])

// …then pass SERIALIZABLE props down, because NinaAboutScreen is 'use client':
<NinaAboutScreen
  …
  jobs={toNinaJobListItems(jobs)}
  jobsNowMs={Date.now()}
/>
```

```tsx
// components/nina/NinaAboutScreen.tsx — directly below the Media <section> (:233-244)
import { NinaJobList } from './NinaJobList'
import type { NinaJobListItem } from '@/lib/nina/jobview'

<section className="mt-7">
  <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
    Proses foto
  </h2>
  <NinaJobList items={jobs} nowMs={jobsNowMs} emptyText="…" />
</section>
```

Five things Phase 5 must know. **Phase 5's plan was written before this file existed and has been
rewritten against this contract during reconciliation; these five are the differences that
mattered.**

1. **The component is `NinaJobList` in `components/nina/NinaJobList.tsx`**, not `JobList` in
   `components/nina/JobList.tsx`. The analysis's impact-point table guessed the latter; this phase
   prefixes for the same reason every other component in `components/nina/` does.
2. **`NinaJobList` is `'use client'` on purpose** (D3). Do not try to render a Server Component
   inside `NinaAboutScreen`, and do not build a `children`-slot workaround — there is nothing to
   work around.
3. **The prop is `items`, not `jobs`, and its element type is `NinaJobListItem`.** Deriving the
   type with `React.ComponentProps<typeof NinaJobList>['jobs']` will not compile; it is `['items']`
   — or just import `NinaJobListItem`, which is exported from `lib/nina/jobview.ts` and is a pure
   module a client component may import freely.
4. **The mapping happens on the SERVER**, in `app/nina/about/page.tsx`, and it is not optional:
   `NinaImageJobRecord.createdAt` is a `Date` and `NinaJobListItem.createdAtMs` is a number. Call
   `toNinaJobListItems(jobs)` there and pass `Date.now()` as `jobsNowMs`. `NinaJobList` also takes
   **two other REQUIRED props**, `nowMs` and `emptyText` — nothing about this component is
   "everything else is optional".
5. **`emptyText` is the caller's words, and `NinaJobList` renders the empty case itself.** That is
   the division of labour this component's docstring sets out, and it settles a question phase 5's
   draft answered the other way: phase 5 renders `<NinaJobList>` unconditionally with its own
   `emptyText` rather than branching on `jobs.length === 0` and writing a second empty renderer.
   The sentence under Media is not the sentence on `/nina/jobs`; the *markup* is the same one, once.
   (`className` is available if the section needs to soften the dashed frame under Media.)

**To Phase 2:** if the in-platform generator introduces a new `nina_turns.error_code` phase or a
fifth `NinaImageFailure`, add one line to `NINA_JOB_STAGE_LABEL` / `NINA_JOB_ERROR_LABEL` in
`lib/nina/jobview.ts`. Nothing breaks without it (D5) — the stage degrades to `queued` and the error
renders as its raw code — but the label will be ugly until you do.

**To Phase 6:** the `{ kind: 'gone' }` degradation depends only on `getNinaMessagesByIds` coming
back empty, so it survives a session delete however you implement it. If Phase 6 ever *soft*-deletes
a session instead of cascading, tell the reconciler: a soft delete would make the message resolvable
again and the jump would land in a conversation the runner believes is gone.

**To Phase 3:** this phase does not change the sent-state, the arrival path, `planReveal`,
`mergeServerMessages` or any prop of `MessageList`. If your restructure renames `handleJumpToQuote`,
`flashTimer`, `flashId`, `alive` or the `?attach=`/`?photo=` strip effect, the reconciler needs to
re-target Step 9.

**Deliberately not done here (drive-by work found and left):**

- `listOpenNinaImageJobs` and `getNinaImageJob` now share a projection shape with
  `listNinaImageJobs`/`getNinaImageJobDetail` and could collapse into one mapper. Left alone: Phase 2
  edits this file's lifecycle functions in the same wave, and collapsing them would maximise the
  merge conflict for zero user-visible gain.
- `/nina/jobs` does not auto-refresh when a job's stage changes; the clock ticks but the stage is
  the render's. A poll or a service-worker hook belongs with Phase 3's arrival seam, not here.
- The 15 orphaned `failed`/`stale` rows with `cost_micro_usd: null` (money spent, ledger says free —
  analysis Finding 1) are not backfilled. That is a data repair, and it belongs to whoever fixes the
  writer, not to the page that displays it.

---

## Rollback

`git revert` the phase's single commit. Nothing else depends on it at that point except Phase 5,
which lands after. Concretely:

- delete `app/nina/jobs/` (both routes), `components/nina/NinaJob*.tsx`, `lib/nina/jobview.ts` and
  `tests/nina.jobview.test.ts`;
- drop the two reads, the two types, `NINA_JOB_LIST_LIMIT`, `JOB_COLUMNS` and `toJobRecord` from the
  end of `lib/nina/imagejobs.ts`, and revert its two import lines;
- revert the one `<Link>` block and the one import in `components/nina/NinaSidebar.tsx`;
- revert `components/nina/ChatScreen.tsx` to a single `handleJumpToQuote` (inline
  `measureQuoteScroll`/`flashMessage` back into it), drop the `?jump=` ref, the deep-link effect and
  the third `params.delete`.

No migration, no schema change, no data written by this phase, so there is nothing to undo in the
database. Phase 5 would have to be reverted first if it has already landed, since it imports
`NinaJobList`, `listNinaImageJobs` and `toNinaJobListItems`.
