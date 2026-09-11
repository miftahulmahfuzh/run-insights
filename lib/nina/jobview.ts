import { formatDuration, MISSING } from '@/lib/format'
import { isValidId } from '@/lib/id'
import { aboutPhotoHref } from '@/lib/nina/album'

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
 *      with a 16px margin when it is taller than the band — and then FLASH it (`nina-flash-blink`;
 *      `flashHoldMs` bounds the state). R1 asked for the second one by name ("just like how we
 *      can click and directly pinpoint reply_to message").
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
 *
 * ── `'dispatched'` IS A HISTORICAL STAGE, AND IT STILL HAS TO RENDER ──────────────────────────
 * Phase 2 moved generation onto Vercel Fluid compute and deleted both writers of
 * `error_code = 'dispatched'` (`markNinaImageJobDispatched` and `lib/nina/imagedispatch.ts`), so
 * nothing enters that stage any more. The branch below is NOT dead code: the fifteen orphaned
 * `failed`/`stale` rows the analysis measured were written before that landed, they are the first
 * thing on `/nina/jobs`, and they are the reason a runner opens it. What changed is the tense of
 * the words, not the mapping — see `NINA_JOB_STAGE_LABEL`.
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

/* ── the per-row controls ─────────────────────────────────────────────────────────────────── */

/**
 * **R1's redo, as a rule rather than as a `&&` inside a component.**
 *
 * `vitest.config.ts` is `environment: 'node'`, so a condition written inside
 * `components/nina/NinaJobActions.tsx` is a condition nothing in this repo can assert — the same
 * reason `jobIsOpen` and `planJobJump` live here rather than in `NinaJobList`. This function is one
 * comparison, and it is here because the plan set's invariant 6 says a rule a screen obeys is a
 * rule a test reaches.
 *
 * ── WHY `failed` AND NOTHING ELSE (plan index, *Decisions*, rung 5) ───────────────────────────
 * The user's own words are *"clicking this will redo the **failed** job"*, and each of the other
 * four stages has its own reason to be refused:
 *
 *   · `queued` / `dispatched` / `running` — the job is ALREADY being retried. `reviveNinaImageJobs`
 *     re-fires a `queued` row on the next `/nina` render and `claimNinaImageJob` bounds the whole
 *     thing at `NINA_IMAGE_MAX_ATTEMPTS`. A redo here would open a SECOND row for one photograph
 *     and bill twice for it.
 *   · `done` — the photograph exists and is in the chat. Re-rolling it is a different feature
 *     nobody asked for, and it costs one of six generations a day.
 *
 * ── AND WHY THE SERVER CHECKS IT AGAIN ANYWAY ─────────────────────────────────────────────────
 * **A control is not a guard.** This function decides whether a button is DRAWN; `redoNinaImageJob`
 * refuses a non-failed job independently, from the row it read under the runner's own `userId`,
 * because a `jobId` arriving from a browser is a claim and never a fact (plan invariant 3).
 *
 * Purpose is deliberately NOT part of the rule. A failed AVATAR job is redoable too: it re-runs
 * through `finishAvatar`, writes `nina_avatars`, and leaves `announced_at` NULL so the next cron
 * tick makes her mention it — which is exactly what a redo of that job should do.
 */
export function jobCanRedo(stage: NinaJobStage): boolean {
  return stage === 'failed'
}

/**
 * **Why a per-row action refuses, as a CODE and never as a sentence.**
 *
 * `NinaSessionActionResult` is `{ ok, next }` and carries no error prose: the server decides, the
 * calling component supplies the words, and `SessionRow`'s header records why ("there is exactly
 * one place a rule lives"). That arrangement is kept — and widened by exactly one field, because a
 * bare `ok: false` cannot distinguish "your daily photo budget is spent" from "that job is not
 * yours", and those two deserve different sentences in a language the server has no business
 * writing.
 *
 * So the wire carries a DISCRIMINANT, not copy — `NINA_JOB_JUMP_NOTE` below is the same shape one
 * screen over, and `components/nina/NinaJobActions.tsx` owns the `Record<NinaJobRefusal, string>`
 * that turns it into Indonesian.
 *
 * ── WHY IT LIVES IN THIS FILE AND NOT IN `lib/nina/jobActions.ts` ─────────────────────────────
 * Three modules need to agree about these four strings: `lib/nina/imagejobs.ts` (`server-only`,
 * produces them), `lib/nina/jobActions.ts` (`'use server'`, forwards them) and a `'use client'`
 * button (renders them). This module is the only one all three can import — it is pure, it is
 * already imported by three client components, and it imports nothing but `lib/format` and
 * `lib/id`. Declaring the union in `imagejobs.ts` would put a `server-only` import in a browser
 * bundle's type graph; declaring it in `jobActions.ts` would make a `server-only` module import a
 * `'use server'` one, which is backwards.
 *
 *   · `not-found`  — no such job of his. Covers a malformed id, another runner's id, and an id
 *                    that never existed: one answer, so nothing leaks which ids are real.
 *   · `not-failed` — the row is `pending`, `ok` or `repaired`. See `jobCanRedo`.
 *   · `no-args`    — the row cannot be redone FROM. `lib/db/schema.ts` says it in as many words:
 *                    *"a job whose args were only ever in the dispatch payload is a job that can
 *                    never be retried"*, and three production rows predate the column.
 *   · `capped`     — `ninaImageQuotaLeft` is 0. A money cap, not a feature cap.
 *
 * PHASE 2's delete action reuses this union and needs no new member: a delete is refused only when
 * the row is not his, which is `'not-found'`.
 */
export type NinaJobRefusal = 'not-found' | 'not-failed' | 'no-args' | 'capped'

/**
 * `'Nunggu worker'` rather than `'Dijadwalkan'` for `dispatched`, and that one word is the whole of
 * this phase's Branch A adjustment (plan index, Branch A consequences: *"phase 4 renders
 * `NINA_JOB_STAGE_LABEL.dispatched` but must not present it as a live stage"*). "Dijadwalkan"
 * promises something is about to happen, and since phase 2 nothing enters this stage — a row
 * wearing it was handed to the old GitHub Actions worker and is still holding. `worker`, not
 * `runner`: in this codebase the runner is the human, and telling him the job is waiting for HIM
 * would be the one reading worse than the label it replaced.
 */
export const NINA_JOB_STAGE_LABEL: Record<NinaJobStage, string> = {
  queued: 'Antre',
  dispatched: 'Nunggu worker',
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
  /**
   * Whether R1's redo control is drawn on this row — `jobCanRedo(stage)`, resolved HERE so the
   * only surface that draws it cannot disagree with the only test that asserts it.
   *
   * REQUIRED and not optional, deliberately. Both callers of `toNinaJobListItems` go through that
   * one function, so there is no third construction site for an optional field to be forgotten at,
   * and `tsc` is the right thing to notice if one ever appears. `/nina/about` receives the field
   * and ignores it: the controls are opt-in per SURFACE (`NinaJobList`'s `actions` prop), not per
   * item, so a read-only surface simply never looks at it.
   */
  canRedo: boolean
}

/**
 * What a row is CALLED — the scene if it has one, otherwise what kind of photograph it was.
 *
 * It exists because R1's control needs an accessible name and **an icon button's accessible name
 * must be the visible label of the thing it acts on**, or a screen reader announces "Coba lagi" six
 * times in a list of six rows. `NinaJobList` renders this expression as the row's title and
 * `NinaJobActions` renders it inside `aria-label`; two copies of it would drift the first time the
 * fallback wording changed, and the drift would be invisible to everyone who can see the screen.
 *
 * `Pick`-shaped rather than taking a whole `NinaJobListItem`, on `planJobJump`'s precedent: the
 * function needs two fields and a test should be able to hand it two fields.
 */
export function ninaJobTitle(item: Pick<NinaJobListItem, 'scene' | 'purpose'>): string {
  return item.scene ?? (item.purpose === 'avatar' ? 'Foto profil' : 'Selfie')
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
      canRedo: jobCanRedo(stage),
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
 * `Intl.NumberFormat` in `lib/format.ts` alone, and that exception is deliberately a literal set
 * rather than a pattern.
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

/* ── the jump, and its two honest failures ────────────────────────────────────────────────── */

export type NinaJobJump =
  | { kind: 'ready'; href: string }
  /** An avatar job — no carrier message ever exists for one, so there is no bubble at all. */
  | { kind: 'avatar' }
  /** The photograph resolves to no live bubble: not made yet, removed, or its chat is gone. */
  | { kind: 'no-photo' }

/**
 * **The jump's target is the EARLIEST bubble carrying the job's photograph — and the two ways
 * there is no such bubble.**
 *
 * The original rule targeted `args.replyToId`, the bubble that ASKED. The runner replaced the rule
 * in as many words: *"logicnya diganti jadi — the earliest chat bubble across all chat sessions
 * that attached this image (it could be nina's bubble, or user's own bubble)."* So the input is no
 * longer the request; it is the photograph's BUBBLE — `{ sessionId, messageId }`, resolved by
 * `getNinaJobPhotoBubble` over the photograph row `getNinaJobPhoto` already produced, earliest
 * first across every session. `null` arrives from the page as one value for several causes, and
 * the sentence (`NINA_JOB_JUMP_NOTE['no-photo']`) names them without asserting one — the old
 * `gone` arm's honesty, kept.
 *
 *   - **`avatar`.** `finishAvatar` writes an `nina_avatars` row and NO carrier message, so no job
 *     id ever reaches the conversation and no bubble can exist — the same decided rule
 *     `planJobPhoto`'s avatar arm states. Checked HERE first, so a caller that forgot the page's
 *     read-skip still cannot draw a button: the arm is the rule, the skip is its cost half.
 *   - **`no-photo`.** The photograph is not made yet (queued, running, failed), was removed (admin
 *     Remove, single-message delete), or its chat is gone (session cascade). MEASURED: fourteen
 *     `kind='image'` rows in production whose `args.replyToId` resolves to nothing — under the old
 *     rule that was this screen's common refusal; under this rule most of those rows have a live
 *     bubble to jump to, because the target follows the photograph and not the request.
 *
 * ── WHY THERE IS NO `replyToId` FALLBACK ─────────────────────────────────────────────────────
 * A failed job used to keep a button when the photograph did not exist but the request did. That
 * asymmetry is gone deliberately: the user said the logic is REPLACED ("diganti"), and a fallback
 * would keep alive exactly the second read (`replySessionId`'s) that the replacement deletes. Open
 * and failed jobs now show the sentence — which is also the honest answer, because the button's
 * name says nothing about a request; it opens a bubble that SHOWS the photograph.
 *
 * `bubble` is a fact and not a claim: non-null only when an owner-scoped read returned a live
 * message in a live session. See `getNinaJobPhotoBubble`.
 */
export function planJobJump(input: {
  purpose: 'selfie' | 'avatar'
  /** The earliest live bubble carrying the photograph, or `null` when no read proved one. */
  bubble: { sessionId: string; messageId: string } | null
  /** `SESSION_PARAM` from `lib/nina/active.ts`. Passed in so this module declares no second `'s'`. */
  sessionParam: string
}): NinaJobJump {
  if (input.purpose === 'avatar') return { kind: 'avatar' }
  if (input.bubble === null) return { kind: 'no-photo' }
  return {
    kind: 'ready',
    href: ninaJumpHref({
      sessionId: input.bubble.sessionId,
      messageId: input.bubble.messageId,
      sessionParam: input.sessionParam,
    }),
  }
}

/** What each refusal says. One sentence, no error code, no button — `EmptySlot`'s register. */
export const NINA_JOB_JUMP_NOTE: Record<Exclude<NinaJobJump['kind'], 'ready'>, string> = {
  avatar:
    'Foto ini bukan dari chat — Nina ganti foto profilnya sendiri, jadi nggak ada bubble yang memicunya.',
  'no-photo':
    'Fotonya belum jadi, kehapus, atau chatnya dihapus — nggak ada bubble yang bisa dituju.',
}

/* ── the photograph link ─────────────────────────────────────────────────────────────────── */

/**
 * What the Detail foto row needs to know about the job's photograph — `NinaJobJump`'s shape, one
 * refusal fewer.
 *
 * ── WHY A DISCRIMINATED UNION AND NOT `string | null` ──────────────────────────────────────────
 * Three reasons, in the order a reviewer meets them.
 *
 *   1. **Parity of idiom.** `photo` renders beside `jump` and answers with the same idiom —
 *      `kind === 'ready'` — so a reader of the component reads two facts in one grammar instead of
 *      a union and a nullable string.
 *   2. **The fact crosses the boundary decided.** The prop is REQUIRED and non-nullable, so a page
 *      that forgot to resolve the photograph cannot glide past the question the way a missing prop
 *      (and therefore `undefined`) would sail through a `string | null` check. The component's own
 *      header states the arrangement: the server decides, the client renders.
 *   3. **The refusal has room to speak.** If a future requirement ever needs to say WHY there is
 *      no photograph, the union grows an arm and nothing downstream changes shape; `string | null`
 *      would have to become this union anyway.
 *
 * What it deliberately does NOT have is the jump's TWO refusal arms: each of those carries a
 * sentence (`NINA_JOB_JUMP_NOTE`), while the photograph's absence carries NONE — the plan index's
 * decided rule is that the icon is simply not drawn ("never a link the server has not proved"), so
 * `{ kind: 'none' }` is the renderer's signal to draw nothing. An arm with no sentence is not
 * redundancy here; it is the difference between "no fact" and "no prop".
 */
export type NinaJobPhoto = { kind: 'ready'; href: string } | { kind: 'none' }

/**
 * **R2's "open the full-screen photo" link, as a rule rather than as a `&&` inside the component —
 * and the plan index's avatar decision, kept where a test can reach it.**
 *
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, which is why `planJobJump` lives in
 * this file and not in `NinaJobDetail`; this function has exactly the same reason to sit beside
 * it. The page passes three facts it read under the runner's own `userId` — the job's `purpose`,
 * the photograph row's id (`getNinaJobPhoto`'s projection) and the job's own id, which becomes
 * the deep link's RETURN leg (`NINA_ABOUT_RETURN_PARAM`): the runner asked that closing the
 * viewer opened from Detail foto land back on Detail foto, and the origin has to travel in the
 * link because history cannot be presumed behind a deep link — and gets back the value the
 * client renders without re-deriving anything.
 *
 * ── THE AVATAR ARM IS A DECIDED RULE, NOT JUST A SAVED QUERY ───────────────────────────────────
 * `finishAvatar` writes an `nina_avatars` row and NO carrier message, so no job id ever reaches
 * the conversation photographs: there is no job→avatar key, and matching one by `description` or
 * date would be a guess that can name the wrong face (plan index, *Decisions*). So an avatar job
 * answers `{ kind: 'none' }` EVEN IF a row id somehow arrived — this arm is the rule, and the
 * page's skip of the reads is merely the rule's cost half, exactly as its skip of the jump's
 * bubble read is the cost half of `planJobJump`'s avatar arm.
 *
 * ── WHY `'chat'` IS A LITERAL HERE AND NOT A PARAMETER ──────────────────────────────────────────
 * A job photograph is by construction a conversation photograph — the read filters
 * `kind = 'generated'`, and `finishAvatar` writes album rows, not message images. The `'album'`
 * section is the codec's other half and no job can ever name one, so the literal is spelled once
 * rather than threaded through a parameter a caller could get wrong.
 *
 * ── WHY THE HREF COMES FROM THE CODEC MODULE AND IS NOT SPELLED HERE ────────────────────────────
 * The app carries TWO `?photo=` grammars that must stay separate (plan invariant 5): `/nina`'s
 * `kind:id` colon grammar (`lib/nina/attach.ts`, the composer attach) and `/nina/about`'s
 * `section.id` dot grammar (the viewer state this link writes). The about codec module owns the
 * second spelling — the parameter name, the dot, the route — and this module only names the fact,
 * the same division `ninaJumpHref` keeps with `SESSION_PARAM`. The codec's other consumers are
 * `NinaAboutScreen` itself; this is the first OUTBOUND writer of its grammar, which is why the
 * codec had to move to `lib/` at all.
 */
export function planJobPhoto(input: {
  /** The job's id — the RETURN leg of the deep link, so closing the viewer lands back here. */
  jobId: string
  purpose: 'selfie' | 'avatar'
  /** The job photograph's row id, or `null` when `getNinaJobPhoto` resolved nothing. */
  imageId: string | null
}): NinaJobPhoto {
  if (input.purpose === 'avatar') return { kind: 'none' }
  if (input.imageId === null) return { kind: 'none' }
  return {
    kind: 'ready',
    href: aboutPhotoHref('chat', input.imageId, `/nina/jobs/${input.jobId}`),
  }
}

/* ── the soft-navigation guard ────────────────────────────────────────────────────────────── */

/**
 * **The one-shot rule for a `?jump=` that arrives WITHOUT a remount, as a function rather than as
 * a `useRef` comparison buried inside `ChatScreen`.**
 *
 * `app/nina/page.tsx` keys `ChatScreen` by the session id, so a `?jump=` naming a DIFFERENT
 * conversation remounts the screen and the mount path delivers it: `jumpRef`'s initialiser runs on
 * the first render and nowhere else, which is already one-shot by construction. But a `?jump=`
 * naming the session already on screen — a search hit tapped while its own conversation is open —
 * is a soft navigation: same key, no remount, that initialiser never runs. Somebody has to notice
 * the NEW arrival without also firing on the mount value, and this is that rule.
 *
 * `prev` is the last RAW value the caller saw on a render (its ref is initialised to the first
 * render's value, so the mount case answers "already seen" and never double-lands beside the
 * `jumpRef` path); `raw` is the value on THIS render. Three answers:
 *
 *   - `raw === null` — nothing arrived. `null`, and the caller resets `prev` to `null`, which is
 *     what makes a repeat GENUINE: the landing strips the parameter from the entry, so a later
 *     arrival of the same id is a second tap the runner meant, not a repeat render.
 *   - `raw === prev` — this render's value has been handled (or is the mount value). `null`.
 *   - anything else — a new arrival: `parseNinaJumpParam(raw)`, which is `null` when the value
 *     cannot be one of our ids. The caller records `raw` as `prev` regardless, so a malformed
 *     value is not retried on every render.
 *
 * It lives beside `JOB_JUMP_PARAM` for the same reason `parseNinaJumpParam` does: this is that
 * parameter's rule, and `vitest` runs `environment: 'node'` with no jsdom — a comparison written
 * inside a `'use client'` component is a comparison nothing in this repo can assert. The caller's
 * obligations after calling are one line: assign the raw value it was handed onto the ref.
 */
export function nextSoftNavJump(prev: string | null, raw: string | null): string | null {
  if (raw === null) return null
  if (raw === prev) return null
  return parseNinaJumpParam(raw)
}
