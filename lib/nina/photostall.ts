import 'server-only'

import { dbNinaSourceGateway } from './gateway'
import {
  NINA_PHOTO_STALL_GAP_MS,
  NINA_PHOTO_STALL_INSTRUCTION,
  shouldStallAgain,
  stallBudgetLeft,
} from './imagestall'
import { isNinaImageJobOpen } from './imagejobs'
import { loadNinaContext } from './load'
import { insertNinaMessages } from './queries'
import type { NinaRunHistory } from './tools'
import { productionDeps, runNinaTurn } from './turn'
import type { NinaTuning } from './tuning'

/**
 * **Task #76. She keeps talking while the camera is running.**
 *
 * The transcript on the card, which is the whole specification:
 *
 * ```
 * m2. me:   ini foto dmn
 * m3. nina: itu dp gw doang mif, santay
 * m4. nina: nih sebentar, gw foto kondisi sekarang deh
 *           ← and then nothing, for 80+ seconds
 * ```
 *
 * Generation is 57–60 s measured and up to 235 s against `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS`,
 * and the chat turn that promised the photograph **ends** — `runNinaBackgroundTurn` commits her
 * bubbles, closes its claim, and the next thing written to the conversation is the photograph a
 * minute later. The runner's ask is point 2 of three: *"nina will just steer the topic to keep
 * user from waiting awkwardly … talk with user so he don't realize the time it takes"*.
 *
 * ── THE MECHANISM, AND WHY IT NEEDED NO NEW DELIVERY CHANNEL ──────────────────────────────────
 * A filler bubble is useless if the tab cannot see it, and the tab stops looking the moment
 * `pollNinaReply` answers `awaiting: false`. Its FIRST disjunct is *"a fresh `nina_turns` chat
 * claim exists for this session"* — so this function runs **while the dispatching turn's claim is
 * still open**, and `runNinaBackgroundTurn` closes it afterwards rather than before. The tab that
 * is already polling simply keeps polling, `planReveal` staggers the filler exactly like every
 * other bubble, and nothing in `lib/nina/actions/poll.ts`, `components/nina/useTurnArrival.ts` or
 * the photograph's own delivery path was touched.
 *
 * That is also why `NINA_PHOTO_STALL_DEADLINE_MS` is derived from `NINA_TURN_STALE_MS` rather than
 * chosen: a claim held past 90 s is swept as dead, and the stall has to be over before that.
 *
 * ── WHY A FULL TURN AND NOT A CANNED LINE ─────────────────────────────────────────────────────
 * `lib/nina/imagefail.ts` argues the opposite case at length — an apology IS canned, because a
 * canned line *closes a promise* and asserts no measurement. A filler closes nothing. It has to be
 * about THIS conversation ("gimana lutut lo abis long run kemaren?"), which is precisely what a
 * canned line cannot be, and a generic "eh btw" twice a week is the cron-job voice the proactive
 * header names as the failure that matters most.
 *
 * ── IT IS `emitProactiveMessage`'S SHAPE, DELIBERATELY ────────────────────────────────────────
 * `runnerText: null`, `sourceMessageId: null`, the instruction on `proactive` — the same three
 * arguments `lib/nina/proactive.ts` passes, because this is the same thing: Nina speaking with
 * nothing of his to answer. What differs is only that the trigger is a job in flight rather than a
 * clock, which is why it is NOT a seventh `ProactiveTriggerKind`: that union is pinned by hand to
 * `NINA_PUSH_KINDS` and to the `nina_messages.source` column domain, so a seventh member is a
 * schema change for a value nothing would read.
 *
 * ── THE CAMERA IS NOT IN THE TOOL SET, AND THAT IS THE ONLY GUARD THAT WORKS ──────────────────
 * The card's constraint: *"whatever conversational filler she does while stalling must not itself
 * trigger more image jobs"*. `hasNinaImageJobForMessage` cannot help — it keys on
 * `ctx.sourceMessageId`, and a proactive turn has none, so the duplicate guard is structurally
 * blind here and the daily cap would be spent by an unlucky afternoon of waiting. The fix is that
 * the model is never offered the tool: `productionDeps` defaults to `NINA_CORE_TOOL_SET`, which is
 * exactly `NINA_FULL_TOOL_SET` minus `generate_image`, `set_avatar` and `set_avatar_from_photo`.
 * **Do not pass a `toolSet` override here.** The default is load-bearing, not an omission.
 *
 * ── AND IT DOES NOT PUSH ──────────────────────────────────────────────────────────────────────
 * Every other writer of `nina_messages` in this codebase calls `notifyNinaPush` and this one does
 * not. The tab that is watching gets the filler from the poll; a tab that is not watching is a
 * runner who put the phone down, and the photograph's own `photo_delivered` push
 * (`lib/nina/imagerun.ts`) is what brings him back. A second buzz twenty seconds after the first,
 * for "eh btw lo udah makan belom", is a worse app than the one he has.
 *
 * ── IT NEVER THROWS ───────────────────────────────────────────────────────────────────────────
 * There is nobody to throw at — the response left a minute ago — and its caller has already
 * committed her reply and pushed it. Every failure ends as a warning and a count, exactly like
 * `runNinaDistillation` beside it.
 */

export interface NinaPhotoStallInput {
  userId: string
  sessionId: string
  /**
   * The DISPATCHING turn's `nina_turns.id`, stamped onto every filler row.
   *
   * `nina_messages.turn_id` is the audit join, and the honest answer to "which turn emitted this"
   * is the turn whose promise it is covering — the filler's own `nina_turns` row (written by
   * `dbNinaTurnStore` inside `runNinaTurn`) is a cost record, not a conversation. Stamping that
   * one instead would scatter one wait across three unrelated ids.
   */
  turnId: string
  /** The image job being waited on. `isNinaImageJobOpen` is asked about it once per iteration. */
  jobId: string
  /** `Date.now()` at the send — the same clock `runNinaBackgroundTurn`'s chain is bounded by. */
  startedAtMs: number
  /** Read once by the caller; a dial cannot move inside one wait. */
  tuning: NinaTuning
  /** `loadRunHistory`'s rows, read once by the caller — the reviewed history does not change here. */
  history: NinaRunHistory
}

/**
 * `ProactiveDeps`' shape (`lib/nina/proactive.ts`), one entry wider — one convention in
 * `lib/nina`, not two.
 */
export interface NinaPhotoStallDeps {
  now?: () => number
  runTurn?: typeof runNinaTurn
  /** Overridable so the suite does not spend `NINA_PHOTO_STALL_GAP_MS` of real time per filler. */
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** How many filler bubbles-worth of turns actually went out. Logged by the caller; never rendered. */
export async function runNinaPhotoStall(
  input: NinaPhotoStallInput,
  deps: NinaPhotoStallDeps = {},
): Promise<number> {
  const now = deps.now ?? (() => Date.now())
  const runTurn = deps.runTurn ?? runNinaTurn
  const sleep = deps.sleep ?? realSleep
  const { userId, sessionId, turnId, jobId } = input

  let emitted = 0

  for (;;) {
    /*
     * THE FREE HALF OF THE RULE FIRST — the cap and the wall clock, which need no I/O and no
     * waiting. Asking it here is what stops the last iteration of every stall from sleeping six
     * seconds and then loading a conversation it is about to decline to use; the suite caught
     * exactly that as "3 context loads for a cap of 2". `stallBudgetLeft` is not a second copy of
     * the policy — `shouldStallAgain` below is defined in terms of it.
     */
    const budget = stallBudgetLeft({ elapsedMs: now() - input.startedAtMs, emitted })
    if (!budget.go) {
      console.info('[nina] photo stall done', { jobId, emitted, reason: budget.reason })
      return emitted
    }

    /*
     * THE BEAT. Before the reads and before the model call, so the gate below is asked about the
     * world as it is when she would actually speak rather than six seconds earlier — and so the
     * job-open check gets the freshest answer available. It is also what stops her answering her
     * own promise in the same breath; `planReveal` staggers bubbles WITHIN a turn and nothing
     * staggers the gap between two.
     */
    await sleep(NINA_PHOTO_STALL_GAP_MS)

    let jobOpen: boolean
    try {
      jobOpen = await isNinaImageJobOpen(userId, jobId)
    } catch (cause) {
      /* A read we cannot make is not permission to keep talking. Ending the stall costs a filler;
       * guessing `true` would keep her monologuing at a photograph that already landed. */
      console.warn('[nina] photo stall could not read the job; stopping', {
        jobId,
        error: String(cause),
      })
      return emitted
    }

    /*
     * The context load is the expensive read of the pair (one `db.batch`), so it is SKIPPED when
     * the cheap one has already decided — the common exit, because the photograph landing is what
     * usually ends a stall. `shouldStallAgain` still makes the decision; this only declines to
     * pay for an input it cannot use.
     *
     * It is re-read every iteration rather than carried from the caller: the second filler must
     * see the first one, or she writes the same thought twice.
     */
    let context: Awaited<ReturnType<typeof loadNinaContext>> | null = null
    if (jobOpen) {
      try {
        context = await loadNinaContext(userId, sessionId, dbNinaSourceGateway, new Date(now()))
      } catch (cause) {
        console.warn('[nina] photo stall could not load her context; stopping', {
          jobId,
          error: String(cause),
        })
        return emitted
      }
    }

    /* OLDEST FIRST (`ConversationFacts.window`), so the newest row is the last one. This is also
     * the "did he speak" read — one load answers both what she knows and whether it is her turn,
     * instead of a second `listNinaMessages(limit: 1)` against the same table. */
    const newest = context === null ? null : (context.conversation.window.at(-1) ?? null)

    const verdict = shouldStallAgain({
      jobOpen,
      newestRowIsHis: newest !== null && newest.role === 'runner',
      elapsedMs: now() - input.startedAtMs,
      emitted,
    })
    if (!verdict.go) {
      console.info('[nina] photo stall done', { jobId, emitted, reason: verdict.reason })
      return emitted
    }
    /* Narrowing only — `jobOpen` is true on this branch, so the load above ran. */
    if (context === null) return emitted

    let bubbles: string[]
    try {
      const result = await runTurn(
        {
          userId,
          context,
          tuning: input.tuning,
          history: input.history,
          /* Nobody said anything. `runNinaTurn` renders "NOBODY SAID ANYTHING. You are starting
           * this." in front of the instruction for exactly this pair, and a memory write distilled
           * from such a turn has nothing of his to point at — because there is nothing of his. */
          sourceMessageId: null,
          runnerText: null,
          proactive: NINA_PHOTO_STALL_INSTRUCTION,
        },
        /*
         * **No `toolSet` override, and no `store` override.** The default tool set is
         * `NINA_CORE_TOOL_SET` — the camera-free set this function's header argues is the only
         * working guard — and the default store is `dbNinaTurnStore`, which INSERTs this filler's
         * own `nina_turns` row so its tokens are billed to themselves. Passing
         * `ninaChatTurnStore(turnId)` instead would UPDATE the dispatching turn's row and
         * overwrite the real reply's cost with the filler's.
         */
        await productionDeps(userId),
      )
      if (result.payload == null) {
        /* She had nothing to say. Her silence is silence — no app-authored bubble, the rule
         * `runNinaBackgroundTurn`'s null-payload exit states — and a model that declined once will
         * decline again, so the stall ends rather than paying for a second refusal. */
        console.info('[nina] photo stall produced nothing', { jobId, source: result.source })
        return emitted
      }
      bubbles = result.payload.bubbles
    } catch (cause) {
      console.warn('[nina] photo stall turn failed', { jobId, error: String(cause) })
      return emitted
    }

    try {
      const rows = await insertNinaMessages(
        userId,
        bubbles.map((body) => ({
          role: 'nina' as const,
          body,
          turnId,
          /*
           * **Never a quote, even when she produced a `replyToMessageId`.** A filler starts a new
           * thread — that is its entire job — and a quote header on it would point at her own
           * promise, which is the bubble the PHOTOGRAPH is about to quote (R2). Two bubbles
           * quoting the same promise, one of them for no reason, reads as a bug.
           * `emitProactiveMessage` ignores the field for the same reason and does not explain it;
           * this does.
           */
          replyToId: null,
        })),
        sessionId,
      )
      if (rows.length === 0) {
        /* `insertNinaMessages` degrades to `[]` for a session that is not this user's or has been
         * deleted mid-wait. Nothing was written, so there is nothing to continue for. */
        console.warn('[nina] photo stall wrote nothing; the session is gone', { jobId, sessionId })
        return emitted
      }
      emitted += 1
    } catch (cause) {
      console.warn('[nina] photo stall could not persist her filler', {
        jobId,
        error: String(cause),
      })
      return emitted
    }
  }
}
