import 'server-only'

import { and, desc, eq, lt } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaChatSessions, ninaTurns } from '@/lib/db/schema'

import { STATUS_BY_SOURCE } from './gateway'
import { insertNinaTurn } from './queries'
import { ninaModel, type NinaTurnSource, type NinaTurnStore } from './turn'
import { NINA_TURN_STALE_MS } from './turnflight'

/**
 * **The chat turn's life on `nina_turns`, once the turn stopped happening inside the request that
 * asked for it (F36 R6).**
 *
 * ── WHY A ROW AT ALL, WHEN "THE NEWEST MESSAGE IS HIS" ALREADY SAYS SHE IS THINKING ───────────
 * Because that predicate answers one of the three questions and this row answers all three.
 *
 *   1. *Is she still answering?* — the predicate answers it, and `ninaAwaitingByMessage` is exactly
 *      it. But it cannot tell a turn that is running from a turn that died four seconds in.
 *   2. *May this send start a model call?* — it cannot answer this at all. Without a claim, a
 *      three-message burst ("eh" / "nina" / "gimana", which is how this app is actually used)
 *      starts three concurrent turns, spends three times the money, and paints up to twelve
 *      bubbles. The claim makes the second and third sends free: they persist, they return, and the
 *      turn already running picks them up (see `runNinaBackgroundTurn`'s chain).
 *   3. *Did it die?* — a sweep needs something to claim exactly once, or two tabs rendering at the
 *      same moment both "recover" the same turn. A conditional UPDATE on a row is the repo's
 *      existing answer to that, and it is `sweepStaleNinaImageJobs`'s answer verbatim.
 *
 * ── WHY `nina_turns` AND NOT A NINTH TABLE ────────────────────────────────────────────────────
 * `lib/nina/imagejobs.ts`'s header already argued this and the argument is unchanged: a chat turn IS
 * a model call Nina makes, the table exists for exactly one row per model call, and it already
 * carries `status`, `error_code`, `latency_ms`, `input_tokens`, `output_tokens` and `tool_calls`.
 * The only thing that changes is WHEN the row is written: `dbNinaTurnStore` inserts it after the
 * call, and this module opens it before, so there is something to claim. **It is still one row per
 * turn** — see `ninaChatTurnStore`, which UPDATEs rather than INSERTs.
 *
 * ── PHASE, NOT STATUS ─────────────────────────────────────────────────────────────────────────
 * The same two-meanings-in-one-column convention `imagejobs.ts` documents. While `status='pending'`,
 * `error_code` is the phase: `'running'` (the model is being called) then `'persisting'` (the model
 * answered and her rows are going in). When `status` leaves `'pending'`, `error_code` is a failure
 * reason or NULL.
 *
 * **No migration and no schema change.** `nina_turns` already carries `kind='chat'` (written today
 * by `dbNinaTurnStore`), `status`, `error_code`-as-phase and `args jsonb`. Nothing counts chat turns
 * — `countNinaTurnsSince` is called only with `'image'` — and every image read filters
 * `kind='image'`, so a `pending` chat row is invisible to phases 1, 2 and 4.
 */

export const CHAT_TURN_PHASE_RUNNING = 'running'
export const CHAT_TURN_PHASE_PERSISTING = 'persisting'

const PENDING_PHASES: readonly string[] = [CHAT_TURN_PHASE_RUNNING, CHAT_TURN_PHASE_PERSISTING]

/**
 * What the row carries in `args` for a chat turn. **`nina_turns.args` is untyped `jsonb` on
 * purpose** — the schema's own words, "this table must not become the thing phase 12 has to migrate
 * to add a tenth field to its own job shape" — and the same latitude covers this shape. It is
 * written for the sweep and for a human reading the ledger; nothing renders it. Phase 4's job pages
 * read `args` only on `kind='image'` rows, so they never see this.
 */
export interface NinaChatTurnArgs {
  sessionId: string
  /** The `nina_messages.id` this turn is answering. */
  runnerMessageId: string
  /** 0 for the turn a send started; 1 and 2 for chained follow-ups. */
  depth: number
}

export interface PendingNinaChatTurn {
  id: string
  createdAt: Date
  phase: string
}

/**
 * The live claim for one session, or null. **Returns an EXPIRED pending row too** — the caller
 * applies `NINA_TURN_STALE_MS` and decides whether to sweep it, because "there is a dead row here"
 * and "there is no row here" call for different things.
 *
 * `desc(createdAt) limit 1`: there is at most one pending chat row per session by construction, and
 * taking the newest is the correct degradation if the accepted race in `openNinaChatTurn` ever
 * produced two.
 */
export async function getPendingNinaChatTurn(
  userId: string,
  sessionId: string,
): Promise<PendingNinaChatTurn | null> {
  const rows = await db
    .select({
      id: ninaTurns.id,
      createdAt: ninaTurns.createdAt,
      errorCode: ninaTurns.errorCode,
      args: ninaTurns.args,
    })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'chat'),
        eq(ninaTurns.status, 'pending'),
      ),
    )
    .orderBy(desc(ninaTurns.createdAt))
    .limit(8)

  for (const row of rows) {
    const args = row.args as Partial<NinaChatTurnArgs> | null
    if (args?.sessionId !== sessionId) continue
    if (row.errorCode == null || !PENDING_PHASES.includes(row.errorCode)) continue
    return { id: row.id, createdAt: row.createdAt, phase: row.errorCode }
  }
  return null
}

/**
 * Open the claim, or refuse because one is already live for this session.
 *
 * Returns the new `nina_turns.id`, or **null when a live turn already owns this conversation** —
 * which is not a failure and must not be reported as one: his message IS saved, and the turn that
 * is already running will chain onto it.
 *
 * ── THE RACE, NAMED, PRICED, AND ACCEPTED PERMANENTLY ─────────────────────────────────────────
 * This is a read-then-write and there is no unique index to make it atomic. **That is a settled
 * decision, not a deferral.** An earlier draft of this plan pointed at "phase 6's migration" —
 * there is no such thing: phase 6 deliberately generates NO migration (its own contract argues an
 * FK cannot tell a deleted sentence from a deleted conversation, and cannot be added against a
 * database that already holds dangling pointers), and **no phase in this set generates one**.
 * `npm run db:check` must be clean at the end of every phase and `drizzle/` must gain no file.
 * See the plan index's *Decisions*.
 *
 * So the race is priced instead. Next dispatches Server Actions **one at a time per client** (its
 * own Server Actions guide, quoted in `sendNinaMessage`'s header), so the ordinary double-text
 * cannot race at all: the second send waits for the first to return. The window is two DIFFERENT
 * clients — two tabs, or a phone and a laptop — sending inside the same ~50 ms. For one user with
 * one toy, that is rare enough to name and cheap enough to lose.
 *
 * The blast radius of losing it is that she answers twice. Both replies are real replies to real
 * messages, nothing is fabricated (invariant 7), and the second turn's context contains the first
 * message, so the conversation stays coherent. A duplicate, not a corruption. **Do not "fix" it
 * with a lock table, and do not add an index to this table without re-opening the whole
 * no-migration decision** — the index would be the set's only migration, and the reason there are
 * none is that every one of them was found to cost more than the thing it prevented.
 */
export async function openNinaChatTurn(
  userId: string,
  args: NinaChatTurnArgs,
): Promise<string | null> {
  const live = await getPendingNinaChatTurn(userId, args.sessionId)
  if (live !== null && Date.now() - live.createdAt.getTime() < NINA_TURN_STALE_MS) return null

  return insertNinaTurn(userId, {
    kind: 'chat',
    /* Stamped at open, not at close, for `openNinaImageJob`'s reason: a row that failed should
     * still say which model it was reaching for. `ninaChatTurnStore` overwrites it with the model
     * the call actually used, which is the same string unless the env changed mid-turn. */
    model: ninaModel(),
    status: 'pending',
    errorCode: CHAT_TURN_PHASE_RUNNING,
    args,
  })
}

/**
 * **The `NinaTurnStore` `runNinaTurn` is handed for a background chat turn, so the pre-opened row
 * is UPDATED instead of a second row being INSERTed.**
 *
 * Injected through `{ ...productionDeps(), store: ninaChatTurnStore(turnId) }` — the same one-word
 * override `sendNinaMessage` already uses for `toolSet`, and the reason `productionDeps` is
 * exported at all (`lib/nina/turn.ts:842`). Nothing in `turn.ts` changes.
 *
 * ── IT DOES NOT CLOSE THE ROW, AND THAT IS THE WHOLE POINT ────────────────────────────────────
 * `runNinaTurn` calls `store.record` the moment the model answers — BEFORE her bubbles are
 * persisted. If this set `status='ok'` there, the claim would drop while the screen still had
 * nothing to show, and the very next poll would report "not in flight, no new rows" and raise the
 * 'no-reply' notice for a reply that was one insert away. So this records the METRICS and advances
 * the phase to `'persisting'`, and `closeNinaChatTurn` — called after the bubbles land — is what
 * ends the turn. Two writes, one row, and no window in which the truth is unreadable.
 */
export function ninaChatTurnStore(turnId: string): NinaTurnStore {
  return {
    async record(userId, row) {
      await db
        .update(ninaTurns)
        .set({
          model: row.model,
          promptVersion: row.promptVersion,
          tuningRevision: row.tuningRevision,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          toolCalls: row.toolCalls,
          latencyMs: row.latencyMs,
          errorCode: CHAT_TURN_PHASE_PERSISTING,
        })
        .where(
          and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, turnId), eq(ninaTurns.kind, 'chat')),
        )
    },
  }
}

/**
 * End the turn. Called after her rows are in — or from the background task's `finally`, so a throw
 * anywhere between the model answering and the insert committing still leaves a closed row with a
 * reason on it instead of a `pending` row for the sweep.
 *
 * `source` is `NinaTurnSource` and `STATUS_BY_SOURCE` is `gateway.ts`'s one map (see its header).
 * `failure` overrides it for the case the model answered fine and OUR write threw: `'ok'` would be
 * a lie and `'unavailable'` would blame the vendor.
 */
export async function closeNinaChatTurn(
  userId: string,
  turnId: string,
  source: NinaTurnSource,
  failure?: string,
): Promise<void> {
  const status = failure != null ? 'failed' : STATUS_BY_SOURCE[source]
  const errorCode = failure != null ? failure : source === 'unavailable' ? 'unavailable' : null

  await db
    .update(ninaTurns)
    .set({ status, errorCode })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, turnId),
        eq(ninaTurns.kind, 'chat'),
        /* Idempotent: a row somebody else already closed is left exactly as they closed it. */
        eq(ninaTurns.status, 'pending'),
      ),
    )
}

/**
 * **The recovery mechanism, and it is the whole of "a runner message with no reply must not be
 * silently orphaned".**
 *
 * A chat turn still `pending` after `NINA_TURN_STALE_MS` is a turn whose process is gone: the
 * instance was killed, the segment's ceiling cut it, or the persist threw somewhere the `finally`
 * could not reach. This closes it `failed`/`stale`, and that single UPDATE is what makes the state
 * legible: the ledger says a turn died and when, the poll stops reporting it as in flight, and the
 * next send is free to open a new one.
 *
 * ── WHAT IT DELIBERATELY DOES *NOT* DO, AND WHY ───────────────────────────────────────────────
 * It does not retry, and it does not write an apology bubble. `sweepStaleNinaImageJobs` does both —
 * correctly, for images, because `lib/nina/imagefail.ts`'s apologies are the plan's *sanctioned*
 * in-character strings (invariant 7) and because an image job's arguments are in the row so a retry
 * is exactly reproducible. Neither holds here. Any sentence this code put in Nina's mouth about a
 * turn that failed would be app-authored prose rendered as her bubble, which invariant 7 and
 * `ChatScreen`'s own header forbid in as many words; and an automatic retry on a render path is a
 * model call the runner did not ask for, on a path that just proved it can die, with no bound on
 * how often a page load can fire it.
 *
 * **The recovery he actually gets is better than either.** His message was persisted before the
 * model was ever called — that ordering is `sendNinaMessage`'s documented contract and this phase
 * preserves it — so nothing is lost. The screen tells him plainly ('no-reply', whose existing copy
 * already reads *"Your message is saved — send another and she will pick it up"*), and that
 * sentence is now literally true rather than nearly true: `loadNinaContext` reads the session's
 * message window, so his unanswered message is in the very next turn's context. One tap recovers
 * it, and the tap is his, so no money moves without him.
 *
 * Called from `sendNinaMessage` (before opening a turn — the cheapest possible place, and the exact
 * moment it matters) and from `pollNinaReply` only when the poll has actually seen an expired
 * pending row. It is NOT called from `app/nina/page.tsx`: that file is phase 2's this cycle, and
 * putting it there would buy nothing the send does not already buy.
 */
export async function sweepStaleNinaChatTurns(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const olderThan = new Date(now.getTime() - NINA_TURN_STALE_MS)

  const closed = await db
    .update(ninaTurns)
    .set({ status: 'failed', errorCode: 'stale' })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'chat'),
        eq(ninaTurns.status, 'pending'),
        lt(ninaTurns.createdAt, olderThan),
      ),
    )
    .returning({ id: ninaTurns.id })

  if (closed.length > 0) {
    console.warn('[nina] swept dead chat turns', { userId, count: closed.length })
  }
  return closed.length
}

/**
 * Does this conversation still exist, and is it his?
 *
 * One row, one index (`nina_chat_sessions`' primary key plus the owner predicate — invariant 5: a
 * foreign id is indistinguishable from a deleted one, and both mean "do not write here").
 *
 * It lives in this module rather than in `lib/nina/queries.ts` for a reconciliation reason worth
 * recording: `lib/nina/queries.ts` is phase 6's file this cycle, and this is the one read this
 * phase needs that phase 6 does not provide. One extra function in a module this phase already
 * creates costs nothing; a fourth cross-phase edit to a shared file costs a merge.
 */
export async function ninaSessionExists(userId: string, sessionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: ninaChatSessions.id })
    .from(ninaChatSessions)
    .where(and(eq(ninaChatSessions.userId, userId), eq(ninaChatSessions.id, sessionId)))
    .limit(1)
  return rows.length > 0
}
