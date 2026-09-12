'use server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

import { getPendingNinaChatTurn, sweepStaleNinaChatTurns } from '../chatturn'
import { listNinaMessages, listNinaMessagesAfter, type NinaMessageRow } from '../queries'
import { NINA_TURN_STALE_MS, ninaAwaitingByMessage } from '../turnflight'
import type { SentBubble } from '../turnrun'

export interface NinaReplyPoll {
  ok: boolean
  /**
   * **"Is there a message of his that has not been answered yet?"** — the client's whole stop
   * condition, in one boolean, answered by the server so the screen never has to guess.
   *
   * TRUE while a `nina_turns` chat claim is live for this conversation, and ALSO true in the
   * hand-off gap where one chained turn has closed and the next has not yet opened — because the
   * second disjunct is "the newest row is his and it is fresh", which is exactly what is true in
   * that gap. Without the disjunct the screen would stop polling for a quarter of a second and miss
   * the whole of a chained reply.
   */
  awaiting: boolean
  /** Her new bubbles since `afterSeq`, oldest first. Empty while she is still thinking. */
  bubbles: SentBubble[]
  /** The cursor to send next time. Unchanged from the input when nothing new arrived. */
  cursor: number
}

/**
 * **How an open tab learns that Nina has answered (F36 R6).**
 *
 * ── WHY A POLL AND NOT THE PUSH SEAM THAT ALREADY EXISTS ─────────────────────────────────────
 * `lib/nina/live.ts`'s `SW_MESSAGE_TYPE = 'nina:new'` and `lib/service-worker.js`'s
 * `notifyOpenWindows` are a real, shipped wake-up channel, and this phase leaves them completely
 * untouched: a proactive push still refreshes the screen exactly as it does today. They are the
 * wrong mechanism for THIS path, for two independent reasons.
 *
 *   1. **A push must show a notification.** The service worker's own comment records the platform
 *      rule — a `push` handler that shows nothing "counts against the app's push budget" on iOS —
 *      so the worker cannot suppress the tray for a tab the runner is staring at. Pushing every
 *      chat reply would buzz his phone for every message he sends while watching the screen. That
 *      is a worse app than the one he has.
 *   2. **A push arrives as `router.refresh()`, which hands down a whole new `initial` and lands
 *      through `mergeServerMessages` — in ONE frame.** RU-5's staggered reveal is a sequence of
 *      `setState` calls separated by real time, and `ChatScreen`'s header spends a paragraph on why
 *      it must not be collapsed. Delivering four bubbles at once is precisely that collapse. The
 *      poll returns the bubbles as DATA, so `planReveal` still runs on them.
 *
 * ── AND A CLOSED TAB NEEDS NOTHING AT ALL ────────────────────────────────────────────────────
 * Say it plainly, because it is the part of R6 people build for twice: her rows are committed by
 * the background task, `app/nina/page.tsx` reads them with `listNinaMessages` on the next render,
 * and they are simply there. No queue, no replay, no reconnection. The only thing the tab being
 * closed changes is that nobody is watching, and the requirement is that this does not matter.
 *
 * ── COST ─────────────────────────────────────────────────────────────────────────────────────
 * ONE round trip: three indexed reads issued together. Against the measured 13-16 s turn the
 * backoff spends about nine of them, and it stops the instant `awaiting` goes false.
 * `lib/extract/constants.ts` is the precedent — a polled 34 s job with the same shape.
 *
 * ── IT IS AN UNTRUSTED POST ENDPOINT LIKE EVERY OTHER ACTION ─────────────────────────────────
 * `requireUserId()` first; `sessionId` is shape-checked and then proved by `messageScope`'s
 * `user_id AND session_id` predicate, so a forged id returns `[]` rather than another
 * conversation. It writes nothing except, on the rare expired-claim path, the sweep's own
 * conditional UPDATE.
 */
export async function pollNinaReply(input: {
  sessionId: string | null
  afterSeq: number
}): Promise<NinaReplyPoll> {
  const userId = await requireUserId()

  const afterSeq = Number.isFinite(input?.afterSeq) ? Math.max(0, Math.floor(input.afterSeq)) : 0
  const sessionId =
    typeof input?.sessionId === 'string' && isValidId(input.sessionId) ? input.sessionId : null
  /* No conversation, nothing to wait for. Reachable for a runner who has never messaged. */
  if (sessionId === null) return { ok: true, awaiting: false, bubbles: [], cursor: afterSeq }

  let fresh: NinaMessageRow[]
  let newestRows: NinaMessageRow[]
  let pending: Awaited<ReturnType<typeof getPendingNinaChatTurn>>
  try {
    /* Three indexed reads, one round trip. Spelled as three separate `let`s and a plain tuple
     * destructure rather than a nested pattern, so `tsc` infers each element rather than widening
     * the tuple to a union of the three row shapes. */
    ;[fresh, newestRows, pending] = await Promise.all([
      listNinaMessagesAfter(userId, { sessionId, afterSeq }),
      listNinaMessages(userId, { limit: 1, sessionId }),
      getPendingNinaChatTurn(userId, sessionId),
    ])
  } catch (cause) {
    console.warn('[nina] reply poll failed', { error: String(cause) })
    /* `ok: false` and `awaiting: true`: a poll that could not read the database has learned
     * NOTHING, and reporting "she is not answering" would be a claim it cannot make. The client
     * treats this as "try again", and its own give-up at `NINA_TURN_POLL_GIVE_UP_MS` is what stops
     * a database outage from polling for ever. */
    return { ok: false, awaiting: true, bubbles: [], cursor: afterSeq }
  }

  const newest = newestRows[0] ?? null
  const now = Date.now()
  const expired = pending !== null && now - pending.createdAt.getTime() >= NINA_TURN_STALE_MS
  if (expired) {
    /*
     * The claim outlived its deadline, so the process behind it is gone. Close it HERE rather than
     * only on his next send: this is the moment the screen is asking, and `lib/extract`'s own note
     * is the argument — "the poll that gives up is the poll that closes the row, so the runner's
     * last request is the one that makes the state honest". One conditional UPDATE, on the rare
     * path only, and never on the ~29 healthy polls of a turn that is simply still running.
     */
    try {
      await sweepStaleNinaChatTurns(userId, new Date(now))
    } catch (cause) {
      console.warn('[nina] chat turn sweep failed in poll', { error: String(cause) })
    }
  }

  const live = pending !== null && !expired
  /*
   * The two disjuncts. `live` is authoritative and covers a turn that is running. The message
   * predicate covers the hand-off gap between two chained turns, and it is the SAME pure function
   * `app/nina/page.tsx` uses for its cold-load heuristic — one definition of "unanswered", asserted
   * in `lib/nina/turnflight.test.ts`, so the screen and the server cannot come to disagree.
   */
  const awaiting = live || ninaAwaitingByMessage(newest, now)

  /*
   * HER bubbles only. His own rows come back from `listNinaMessagesAfter` too — a second tab may
   * have sent one — and appending them here would duplicate a bubble the sending tab already has
   * optimistically. The other tab gets them the way it always has, on the next server render.
   */
  const hers = fresh.filter((row) => row.role === 'nina')

  return {
    ok: true,
    awaiting,
    bubbles: hers.map((row) => ({ id: row.id, body: row.body, replyToId: row.replyToId })),
    /* The cursor advances past EVERY row read, not just hers, so a message from another tab is not
     * re-read on every subsequent poll. */
    cursor: fresh.length === 0 ? afterSeq : (fresh[fresh.length - 1]?.seq ?? afterSeq),
  }
}
