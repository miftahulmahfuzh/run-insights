import 'server-only'

import { after } from 'next/server'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTurns } from '@/lib/db/schema'

import { openNinaChatTurn, sweepStaleNinaChatTurns } from './chatturn'
import { NINA_DESCRIPTION_UNAVAILABLE } from './prompts/describe'
import {
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  listNinaMessages,
  type NinaMessageRow,
} from './queries'
import { runNinaBackgroundTurn, type NinaBackgroundTurnInput } from './turnrun'

/**
 * **The chat turn's self-repair: arriving at `/nina` answers what an invocation dropped.**
 *
 * > "nina harus menjawabnya regardless user udah nutup app nya / offline"
 *
 * `sweepStaleNinaImageJobs`'s chat sibling, `sweepStaleNinaChatTurns` (`lib/nina/chatturn.ts:390`),
 * closes a dead claim and **deliberately retries nothing** — its header records the decision and
 * its reason: "an automatic retry on a render path is a model call the runner did not ask for, on a
 * path that just proved it can die, with no bound on how often a page load can fire it." That
 * decision was made against a spec that said best-effort. The runner's own words above are the spec
 * now, and they ask for the render-path recovery by name — so this module exists, and every bound
 * the old note demanded is here, in one place, priced:
 *
 *   1. **One candidate per render** — the newest row of the ONE session being painted, the same
 *      bound `NINA_IMAGE_REVIVE_BUDGET = 1` gives the image revive. A buried unanswered message is
 *      recovered by the conversation moving, not by a scan.
 *   2. **The claim, not a counter** — `openNinaChatTurn` refuses while a FRESH claim lives
 *      (`lib/nina/chatturn.ts:161`), so a turn that is genuinely running suppresses this entirely.
 *      A duplicate she answers twice remains the priced-and-accepted race it has always been.
 *   3. **`NINA_TURN_REVIVE_ATTEMPT_CAP` per runner message, counting the original send** — so a
 *      permanently-`unavailable` vendor cannot turn every page load into a model call: at most two
 *      revives per message, ever, then never again. His tap (`resendNinaMessage`) stays outside the
 *      cap as the manual override.
 *
 * ── THE PRECEDENT, AND THE ONE WAY IT IS DIFFERENT ─────────────────────────────────────────────
 * `reviveNinaImageJobs` (`lib/nina/imagerun.ts:786`) is the shipped pattern this follows: arriving
 * is the repair, the work goes to `after()`, the result is a log line. It differs in one load-bearing
 * way: an image job's row carries its own reproducible args, so a revive RE-FIRES the row. A chat
 * claim is only a LEASE on a process — the reproducible thing is the `nina_messages` row underneath
 * it — so a chat revive reads the MESSAGE and re-derives the turn input the way `resendNinaMessage`
 * does (`lib/nina/actions.ts:1919–1933`), field by field, with the same `NINA_DESCRIPTION_UNAVAILABLE`
 * substitution for an undescribed photograph (invariant 5: text, never an image part).
 *
 * ── WHY THE COUNT RUNS BEFORE THE OPEN ─────────────────────────────────────────────────────────
 * `openNinaChatTurn` INSERTs the attempt row it opens, so a count taken after it would count the
 * row being opened. The sharper reason is the failure mode the other order creates: open, THEN
 * count, then abandon on the cap — that strands a FRESH claim with no process behind it, and
 * `openNinaChatTurn`'s own refusal would then block the runner's next real send for
 * `NINA_TURN_STALE_MS` with nothing running to chain onto it. Counting first can only refuse; it
 * can never strand.
 *
 * ── EVERY FAILURE DEGRADES TOWARD SILENCE, EXCEPT ONE ──────────────────────────────────────────
 * The sweep, the newest-row read, the images read, the quote re-resolve and the open each swallow
 * their own failure with a log line, because a recovery path must never be able to 500 the render
 * that hosts it (`reviveNinaImageJobs`' catch at `lib/nina/imagerun.ts:791` is the precedent). The
 * one deliberate exception is the attempt-count read: if IT fails, the revive PROCEEDS —
 * `chatTurnWasSuperseded`'s recorded rule (`lib/nina/chatturn.ts:320`): a failed read can cost at
 * most a duplicate answer, which is acceptable, while a failed revive costs the whole reply the
 * user just asked for by name. The open's fresh-claim refusal is still the safety net; the worst
 * case of a flapping database is one extra attempt per render, capped on the next successful read.
 *
 * ── WHO MAY CALL THIS ──────────────────────────────────────────────────────────────────────────
 * The server render of `app/nina/page.tsx` (userId already in hand from `requireUserId()`), and
 * nothing else. This module is `'server-only'` and deliberately NOT a Server Action module — its
 * caller hands it a trusted `userId` and the input to the model call is rebuilt server-side from
 * owner-scoped rows, so there is no request shape to validate and no export to defend (invariant 4).
 *
 * ── THE ORDERING CONTRACT WITH THE PAGE (G1 × G3) ─────────────────────────────────────────────
 * The page AWAITS this before it reads the pending claim and computes the flight view. Otherwise a
 * revive that just swept a dead claim and opened a fresh one would be invisible to the very render
 * that caused it: `awaiting` would read false, no poll would start, and her answer would land into
 * a tab that is not looking — Phase 1's G1, re-created by this phase's own fix. Her reply then
 * arrives as ordinary rows the poll delivers, which is R2's whole mechanism.
 */

/**
 * Total `nina_turns` chat attempts allowed per runner message — the send's own turn included, so
 * this allows at most **two** revives of any one message. Walked against the table's single pinned
 * index (see `countPriorChatTurnAttempts`); no migration, no new index (invariant 2).
 */
export const NINA_TURN_REVIVE_ATTEMPT_CAP = 3

/**
 * **Revive the newest dead turn of one session, or do nothing.** Returns 1 when a turn was
 * scheduled, 0 on every other outcome — the count is a log line, exactly as
 * `reviveNinaImageJobs`' is. Never throws.
 *
 * `sessionId === null` is the page's real "he has no sessions" state, not an error: nothing to
 * revive and nothing to sweep, so the revive costs zero queries.
 */
export async function reviveNinaChatTurn(
  userId: string,
  sessionId: string | null,
  now: Date = new Date(),
): Promise<number> {
  if (sessionId === null) return 0

  /*
   * (a) The sweep. The page render is the one moment a dead claim's deadness starts to matter —
   * the same reasoning that puts it first on the send path (`lib/nina/actions/send.ts`) and on a resend
   * (`lib/nina/actions/resend.ts`). `openNinaChatTurn` applies `NINA_TURN_STALE_MS` itself, so even a failed
   * sweep cannot block the open below; the sweep is what makes the LEDGER honest.
   */
  try {
    await sweepStaleNinaChatTurns(userId, now)
  } catch (cause) {
    console.warn('[nina] chat turn sweep failed on revive', { error: String(cause) })
  }

  /*
   * (b) The candidate: the newest row of THIS session. `limit: 1`, owner-scoped, newest first —
   * the same single read the chain uses to pick up a burst (`lib/nina/actions/resend.ts`'s cursor read). Read here rather
   * than reused from the page's history list because the revive's own sweep may have just changed
   * what "the turn state" is, and because the page's list is capped at CHAT_HISTORY_LIMIT while
   * this is the authoritative newest at this instant.
   */
  let newestRows: NinaMessageRow[]
  try {
    newestRows = await listNinaMessages(userId, { limit: 1, sessionId })
  } catch (cause) {
    console.warn('[nina] could not read the newest row for a revive', { error: String(cause) })
    return 0
  }
  const newest = newestRows[0]
  /* Her bubble on top means the last thing that happened was an answer — nothing to revive. An
   * empty session is the same answer. */
  if (newest === undefined || newest.role !== 'runner') return 0

  /*
   * (c) The attempt cap, BEFORE the open — see the module docstring for why that order is
   * load-bearing. A count-read failure degrades OPEN, not shut.
   */
  let attempts: number
  try {
    attempts = await countPriorChatTurnAttempts(userId, newest.id, newest.createdAt)
  } catch (cause) {
    console.warn('[nina] could not count prior chat attempts; reviving anyway', {
      runnerMessageId: newest.id,
      error: String(cause),
    })
    attempts = 0
  }
  if (attempts >= NINA_TURN_REVIVE_ATTEMPT_CAP) {
    /* The honest stop. `resendNinaMessage` remains the tap that overrides this, exactly as it
     * overrides a dead turn today. */
    console.info('[nina] revive capped for this message', {
      sessionId,
      runnerMessageId: newest.id,
      attempts,
    })
    return 0
  }

  /*
   * (d) His photographs, read off THE ROW exactly as a resend reads them (`lib/nina/actions/resend.ts`): the
   * 40-row window would carry them for a recent message, but the newest unanswered row can be
   * days old, and a turn rebuilt from the row must not depend on window membership. An undescribed
   * row becomes the honest "her eyes failed" sentence (invariant 5). A failed read degrades to []
   * — she still sees the photographs through the window's own `readMessageWindow`, so the revive
   * never withholds the answer over a description.
   */
  let images: Awaited<ReturnType<typeof getNinaMessageImagesForMessages>> = []
  try {
    images = await getNinaMessageImagesForMessages(userId, [newest.id])
  } catch (cause) {
    console.warn('[nina] could not read a revived message’s photos', { error: String(cause) })
  }

  /*
   * (e) `resendNinaMessage`'s 'empty' guard, asked of the row (`lib/nina/actions/resend.ts`): a runner row
   * with no text, no photograph and no run is nothing for her to answer, and a revive that spent a
   * model call to be told nothing would be the one unbounded-feeling spend left on this path.
   * Reachable without any client bug — an operator can strip the photo from a caption-less message.
   */
  const runnerText = newest.body.trim().length > 0 ? newest.body : null
  if (runnerText === null && images.length === 0 && newest.runId === null) return 0

  /*
   * (f) The quote, re-resolved against owner scope — resend's shape and its degradation
   * (`lib/nina/actions/resend.ts`): a since-deleted target (`reply_to_id` is `ON DELETE SET NULL`) or a read
   * that fails both mean "no quote", and the answer still happens.
   */
  let quotedRow: NinaMessageRow | null = null
  if (newest.replyToId !== null) {
    try {
      const found = await getNinaMessagesByIds(userId, [newest.replyToId])
      quotedRow = found[0] ?? null
    } catch (cause) {
      console.warn('[nina] could not resolve the reply target for a revive', {
        error: String(cause),
      })
    }
  }

  /*
   * (g) The claim. A non-null return is what makes this a revive instead of a second concurrent
   * turn: `openNinaChatTurn` refuses while a FRESH claim lives (`chatturn.ts:161`), which is the
   * whole of the live-turn suppression — a turn that is genuinely running will chain this message
   * itself, and the render's claim read (AFTER this await — the ordering contract) will already
   * see the truth.
   */
  let turnId: string | null = null
  try {
    turnId = await openNinaChatTurn(userId, { sessionId, runnerMessageId: newest.id, depth: 0 })
  } catch (cause) {
    console.warn('[nina] could not open a chat turn for a revive', { error: String(cause) })
    return 0
  }
  if (turnId === null) return 0

  /*
   * (h) The turn, rebuilt field by field from the row — `resendNinaMessage`'s spell, and for the
   * same reason: every field has a reason and `tsc` should be what notices if
   * `NinaBackgroundTurnInput` ever gains one this path forgot.
   *
   * `depth: 0` — this is a turn answering HIS message, not a chained follow-up; the chain bound is
   * measured from `startedAtMs`, which is NOW, not the message's `created_at` (the message may be
   * days old — dating the budget from it would exhaust it before the first link ran, which is
   * exactly the arithmetic the resend's note rejects (`lib/nina/actions/resend.ts`).
   */
  const input: NinaBackgroundTurnInput = {
    userId,
    sessionId,
    turnId,
    runnerMessageId: newest.id,
    runnerText,
    imageDescriptions: images.map((image) => image.description ?? NINA_DESCRIPTION_UNAVAILABLE),
    quotedRow,
    attachedRunId: newest.runId,
    depth: 0,
    startedAtMs: Date.now(),
  }

  /*
   * (i) Schedule. `after()` in a Server Component render is documented Next behavior (`after`'s
   * reference: usable in Server Components; no Request-time APIs inside the callback — `userId`
   * and `sessionId` are resolved above and closed over, the page's own `after()` pattern at
   * `app/nina/page.tsx:458`). The model call is ALWAYS inside this callback (invariant 3); the
   * segment's literal `maxDuration = 300` is the budget it runs on.
   */
  after(() => runNinaBackgroundTurn(input))

  console.warn('[nina] revived a dead chat turn', {
    userId,
    sessionId,
    runnerMessageId: newest.id,
    attempt: attempts + 1,
    cap: NINA_TURN_REVIVE_ATTEMPT_CAP,
  })
  return 1
}

/**
 * How many `nina_turns` chat attempts this runner message has already had, up to the cap.
 *
 * ── THE WALK, AND WHY IT IS CHEAP WITHOUT A NEW INDEX ──────────────────────────────────────────
 * `nina_turns` keeps exactly one index — `nina_turns_user_created_idx` on `(user_id, created_at
 * desc)` (`lib/db/schema.ts:711`), pinned by `tests/db.schema.nina.test.ts:839` — so the query is
 * shaped to be served by exactly that index and nothing else:
 *
 *   · `user_id =` equality + `created_at >= since` range + `created_at DESC` order — all three
 *     are the index itself;
 *   · `kind = 'chat'` and the `args ->> 'runnerMessageId'` match are HEAP filters on the tuples
 *     the walk fetches anyway (the same shape the deleted-at discussion priced at
 *     `lib/db/schema.ts:694`), and the jsonb key cannot be indexed without the migration this set
 *     forbids;
 *   · `since = the message's own created_at` is what makes the walk PROPORTIONAL instead of
 *     historical: no turn answering this message can predate the message — a claim is opened after
 *     the runner's row is committed (the send path's documented contract) — so the range bound can
 *     never exclude a match, and a message from this morning walks a morning's rows, not a
 *     lifetime's.
 *
 * `LIMIT` is the cap itself: the walk stops at three matching rows, which is the exact question —
 * "have three attempts already been spent?" — and nothing more.
 *
 * THROWS on a database problem. The caller degrades OPEN on purpose (see the module docstring):
 * `chatTurnWasSuperseded`'s rule — duplicates are acceptable, lost replies are not — with the
 * open's own fresh-claim refusal as the net.
 */
async function countPriorChatTurnAttempts(
  userId: string,
  runnerMessageId: string,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ id: ninaTurns.id })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'chat'),
        gte(ninaTurns.createdAt, since),
        sql`${ninaTurns.args} ->> 'runnerMessageId' = ${runnerMessageId}`,
      ),
    )
    .orderBy(desc(ninaTurns.createdAt))
    .limit(NINA_TURN_REVIVE_ATTEMPT_CAP)
  return rows.length
}
