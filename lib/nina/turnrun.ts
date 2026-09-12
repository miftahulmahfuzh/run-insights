import 'server-only'

import { titleNinaSessionIfNeeded } from './autotitle'
import { NINA_FULL_TOOL_SET } from './avatartools'
import {
  chatTurnWasSuperseded,
  closeNinaChatTurn,
  ninaChatTurnStore,
  ninaSessionExists,
  openNinaChatTurn,
} from './chatturn'
import type { NinaContext } from './context'
import { runTurnDistillation } from './distill'
import { dbNinaSourceGateway, dbNinaToolGateway } from './gateway'
import { loadNinaContext } from './load'
import {
  bumpNinaShortcutUses,
  insertNinaMessages,
  listNinaMessages,
  listNinaShortcuts,
  readNinaTuning,
  type NinaMessageRow,
} from './queries'
import type { QuotedMessageInput } from './reply'
import type { NinaMemoryWrite } from './schema'
import { NINA_SHORTCUT_LOOKBACK } from './shortcuts'
import {
  NINA_BURST_MAX_MESSAGES,
  NINA_TURN_BUDGET,
  productionDeps,
  runNinaTurn,
  type NinaTurnSource,
} from './turn'
import { NINA_BACKGROUND_BUDGET_MS, NINA_TURN_CHAIN_MAX } from './turnflight'
import type { NinaRelationship } from './tuning'

/**
 * **The background chat turn, as one importable server module — and deliberately NOT a Server
 * Action module.**
 *
 * `runNinaBackgroundTurn` lived inside `lib/nina/actions.ts` from the burst-cancel set until the
 * nina-offline-reply set moved it here, unchanged, for one reason: every export of a `'use server'`
 * module is an untrusted POST endpoint (the Server Actions guide, quoted in `actions.ts`'s header),
 * and the turn's input carries a raw `userId`. `reviveNinaChatTurn` (`./turnrevive`) needs to
 * schedule this exact function from a SERVER COMPONENT render, where no Server Action boundary
 * exists — so the runner moved to a `'server-only'` module instead of gaining an export on the
 * action file. **Nothing else changed**: the four regions this module holds arrived byte-for-byte
 * from `actions.ts` (its `SentBubble`, `NinaBackgroundTurnInput`, `runNinaBackgroundTurn` and
 * `runNinaDistillation`), and `actions.ts` re-imports the runner for its `startNinaBackgroundTurn`
 * seam and re-exports the `SentBubble` type for `ChatScreen`.
 *
 * ── THE BUDGET PAIRING STILL LIVES ON THE CALLER, NOT HERE ────────────────────────────────────
 * `after()` runs for the INVOKING segment's `maxDuration`. Every current caller sits behind a
 * segment that carries the literal `300` — `app/nina/page.tsx` (the page render, the resend
 * action, and now the revive all inherit it). A caller that did not carry 300 would truncate a
 * 240 s background budget silently; `NINA_BACKGROUND_BUDGET_MS` documents the pairing.
 *
 * Nothing here calls `after()` itself: the seam (`startNinaBackgroundTurn`, in `actions.ts`) and
 * the revive (in `./turnrevive`) each own their own scheduling. A direct `await` of
 * `runNinaBackgroundTurn` is also legal and is exactly what the chain does for its follow-up
 * links, so a revive scheduled from a render and a chain running inside an existing turn share one
 * definition of "run the turn".
 */

/* ── MOVED VERBATIM from lib/nina/actions.ts:120–141 (nina-offline-reply phase 2) ──────────── */
export interface SentBubble {
  /** The `nina_messages` row id. Phase 7 quotes it; phase 4 keys its list on it. */
  id: string
  /**
   * The bubble text. Named `body` because this return type is a **DTO**, and `body` is the DTO
   * spelling all the way down: phase 1's `NinaMessageRow.body`, phase 4's destructure, phase 6's
   * `row.body`. The *column* is `text` and phase 2's prompt-layer `MessageInput` is `text` too;
   * `lib/nina/gateway.ts` is the one place those meet (RULING A1). Nobody "fixes" either side to
   * match the other.
   */
  body: string
  /**
   * Phase 7 (R12). The `nina_messages.id` THIS bubble answers, or null.
   *
   * The one place this return type widened rather than an input, and RULING B1 put it in phase 7
   * because that phase already edits this file. Without it, Nina's own quote would render only on
   * the next server render of `/nina` and not on the optimistic reveal — R12's UI lagging the
   * database by a page load, for two lines. Non-null on the FIRST bubble only, because a
   * four-bubble reply is one answer to one message (see STEP 5).
   */
  replyToId: string | null
}

/* ── MOVED VERBATIM from lib/nina/actions.ts:1207–1230 ─────────────────────────────────────── */
/**
 * Everything `sendNinaMessage` used to do between STEP 2 and STEP 7, as one value.
 *
 * `quotedRow` travels whole rather than as a pre-built `QuotedMessageInput`, because the
 * `sentAtLabel` half of that object is read out of `context.conversation.window` — which does not
 * exist until the background task loads it (invariant 3: this file does not format an instant).
 *
 * `imageDescriptions` is precomputed by the caller so the verified ticket claims and the resolved
 * attachment do not have to travel; they are the only thing the turn wanted from them.
 */
export interface NinaBackgroundTurnInput {
  userId: string
  sessionId: string
  turnId: string
  runnerMessageId: string
  runnerText: string | null
  imageDescriptions: readonly string[]
  quotedRow: NinaMessageRow | null
  attachedRunId: string | null
  /** 0 for the turn a send started; 1 and 2 for chained follow-ups. */
  depth: number
  /** `Date.now()` at the send, so every link of a chain shares one wall-clock budget. */
  startedAtMs: number
}

/* ── MOVED VERBATIM from lib/nina/actions.ts:1232–1698; the ONLY change is `export` below ──── */
/**
 * **The turn, after the response has gone out.**
 *
 * Steps 2 through 7 are the ones `sendNinaMessage` used to run inline, moved here verbatim in
 * content and in order. What is new is the bookkeeping around them: the claim opened before the
 * call is closed after her rows land, a `finally` guarantees the row never stays `pending` because
 * of a throw we could see, and a bounded chain answers messages that arrived while this was working.
 *
 * ── IT NEVER THROWS ─────────────────────────────────────────────────────────────────────────
 * There is nobody to throw at. The response left thirteen to forty-five seconds ago. Every failure
 * mode ends in a closed `nina_turns` row with a reason on it and a warning in the log, which is
 * what the ledger is for.
 */
export async function runNinaBackgroundTurn(input: NinaBackgroundTurnInput): Promise<void> {
  const { userId, sessionId, turnId, runnerMessageId } = input
  let source: NinaTurnSource = 'unavailable'
  let failure: string | undefined = 'crashed'
  let closed = false
  let bubbles: SentBubble[] = []

  try {
    /*
     * STEP 2 — the two reads, concurrently. `loadNinaContext` reads the recent-20 window and
     * `loadRunHistory` reads the whole reviewed history; both are one `db.batch` over the same
     * bounded table, and running them together makes the duplication cost one round trip of wall
     * clock instead of two. `getReviewedRunsWithChildren` therefore runs twice per turn, which is
     * ACCEPTED at this size: ~200 rows a year, one user. The clean fix is one optional parameter on
     * `loadNinaContext` and it should move together with `lib/insights/load.ts` and
     * `recomputeRecords`, in one card, because all three re-read the same history and all three
     * stop being fine at the same moment.
     *
     * **This runs AFTER his row is committed and that has not changed** — see STEP 1c's note.
     */
    const [loadedContext, history, tuning, shortcuts] = await Promise.all([
      loadNinaContext(userId, sessionId, dbNinaSourceGateway),
      dbNinaToolGateway.loadRunHistory(userId),
      /* THE TUNING, read LIVE on every turn with no cache — which is what makes a slider on
       * `/admin/nina` immediate. Third in an existing `Promise.all` on purpose: one indexed
       * single-row read against a connection this turn is opening anyway. */
      readNinaTuning(userId),
      /* THE SHORTCUTS, read LIVE on every turn with no cache for the same reason and by the same
       * arithmetic — which is what makes a row added on `/admin/shortcuts` fire on his very next
       * message, with no invalidation step anywhere on this path. Fourth in the same `Promise.all`:
       * one `(user_id, enabled)`-indexed read of a table that holds tens of rows, against a
       * connection this turn is opening anyway, so it costs no wall clock the turn was not already
       * spending.
       *
       * **`{ onlyEnabled: true }`, which is the read `nina_shortcuts_user_enabled_idx` exists for.**
       * The bare call returns the disabled rows too, and `/admin/shortcuts` wants those — a
       * disabled code is still a row he edits and re-enables. A turn does not: a disabled row can
       * never fire, so putting it on the wire is bytes for nothing. `matchNinaShortcuts` filters on
       * `enabled` regardless, so "live" still has exactly one definition; this narrows what is
       * fetched, not what counts.
       *
       * **Its rejection is swallowed and the turn continues — INVARIANT 7.** This is the one entry
       * of the four that is garnish. A tuning that will not load is a Nina with the wrong
       * character, and a context that will not load is no turn at all; a shortcut table that will
       * not load is a turn with no shortcut in it, which is what most turns are anyway. Letting it
       * reject would let one unreadable row cost him a reply. */
      listNinaShortcuts(userId, { onlyEnabled: true }).catch((cause) => {
        console.warn('[nina] could not read shortcuts; this turn carries none', {
          turnId,
          error: String(cause),
        })
        return []
      }),
    ])

    /*
     * `sentAtLabel` comes from the context window when the quoted message is in it, and is null
     * when it is not. That is invariant 3 rather than laziness: `'Tue 2 Sep 07:14'` is spelled by
     * `conversationFacts`, and formatting a second one here would make this the app's second
     * authority on how an instant is written.
     */
    const target = input.quotedRow
    const quoted: QuotedMessageInput | null =
      target === null
        ? null
        : {
            id: target.id,
            mine: target.role === 'runner',
            text: target.body,
            sentAtLabel:
              loadedContext.conversation.window.find((turn) => turn.id === target.id)
                ?.sentAtLabel ?? null,
          }

    /*
     * R2. The last few things HE said, newest first, so a shortcut that is still IN PLAY survives
     * the turn that opened it — the `🫦` case in the production ledger, whose expansion reads
     * "…selama miftah bilang terusin … sampe miftah bilang 💦" and is therefore useless if it falls
     * out of the payload the moment he answers it.
     *
     * **No new query.** `loadNinaContext` has already loaded the window, and it is OLDEST FIRST
     * with both roles in it (`ConversationFacts.window`, `lib/nina/context.ts:286`), so this is
     * three array operations over ~40 objects already in memory.
     *
     * Filtered to `role === 'runner'` because an expansion SHE quoted back would otherwise re-fire
     * itself every turn it stayed in the window (assumption A3). `runnerMessageId` is dropped
     * because that message is `input.runnerText`: a trigger in it FIRED, and letting it also count
     * as carried-over would bump one shortcut twice for one send. `reverse()` is safe — `map` has
     * already produced a fresh array, so the window itself is not mutated.
     */
    const recentRunnerTexts = loadedContext.conversation.window
      .filter((turn) => turn.role === 'runner' && turn.id !== runnerMessageId)
      .map((turn) => turn.text)
      .reverse()
      .slice(0, NINA_SHORTCUT_LOOKBACK)

    /*
     * **R2 (the burst-cancel set).** The earlier messages of the burst this turn answers — what he
     * sent in a row WITHOUT waiting for a reply, every one of them still unanswered when this turn
     * was opened. `'HE JUST SAID:'` names the newest; without this list the restart turn's prompt
     * is byte-identical to an ordinary turn's, and she answers "dan makan apa lunch?" with no way
     * to know "mau kemana hari ini?" is standing unanswered in front of it.
     *
     * **No new query**, for the reason the block above already argues: `loadNinaContext` has
     * already loaded the window, OLDEST FIRST with both roles in it
     * (`ConversationFacts.window`, `lib/nina/context.ts:286`). The walk is three predicates, and
     * each is load-bearing:
     *
     *   · `role === 'nina'` ENDS the walk — everything above her row was answered by the reply it
     *     precedes, and naming it would ask her to answer it twice;
     *   · `turn.id === runnerMessageId` is SKIPPED, not collected — that message is
     *     `input.runnerText`, already named by `'HE JUST SAID:'`, and the exclusion is BY ID
     *     because two identical texts are two messages ("eh", "eh");
     *   · `turn.text.length === 0` is SKIPPED — a photo-only message's `body` is `''` (`runnerText`
     *     is null for it on both the send and the chain path), and an empty bullet is a rendering
     *     bug, not a message. The walk does NOT stop for one: the photograph is still part of the
     *     burst, and it still reaches her through the window's `imageDescriptions`.
     *
     * The newest `NINA_BURST_MAX_MESSAGES` survive — see the constant's note in `lib/nina/turn.ts`
     * for the 40-row-window × 4 000-character arithmetic that makes the cap arithmetic, not taste.
     *
     * **All three paths get this from one computation, which is the set's exit criterion**: the
     * restart turn after phase 1's supersede, a chained follow-up, and a resend all arrive HERE,
     * so all three frame the burst identically. Cannot throw — pure array reads over rows already
     * in memory (INVARIANT 7). An empty walk is the ordinary single-message turn and costs zero
     * bytes downstream (invariant 2 of the prompt layer).
     */
    const burstTexts: string[] = []
    for (let i = loadedContext.conversation.window.length - 1; i >= 0; i -= 1) {
      const turn = loadedContext.conversation.window[i]!
      if (turn.role === 'nina') break
      if (turn.id === runnerMessageId) continue
      if (turn.text.length === 0) continue
      burstTexts.push(turn.text)
    }
    const earlierRunnerTexts = burstTexts.reverse().slice(-NINA_BURST_MAX_MESSAGES)

    /* STEP 3 — the turn. 13–45 s. Never throws for a model problem.
     *
     * INVARIANT 5 IS ENFORCED BY THIS ARGUMENT AND NOWHERE ELSE. `imageDescriptions` is TEXT.
     * There is no code path in this file that puts an image part into `runNinaTurn`, and there must
     * never be one: `glm-5.3` answers 200 and silently drops an image block, so sending one is not
     * an error, it is a lie.
     *
     * `toolSet` is `NINA_FULL_TOOL_SET` and `store` is the chat turn's own — the same one-word
     * override idiom, twice. `ninaChatTurnStore` UPDATEs the row opened before the call instead of
     * INSERTing a second one, so `nina_turns` still holds exactly one row per turn; see its header
     * for why it advances the phase rather than closing the row.
     */
    const result = await runNinaTurn(
      {
        userId,
        context: loadedContext,
        tuning,
        history,
        sourceMessageId: runnerMessageId,
        runnerText: input.runnerText,
        imageDescriptions: input.imageDescriptions,
        quoted,
        attachedRunId: input.attachedRunId,
        shortcuts,
        recentRunnerTexts,
        earlierRunnerTexts,
      },
      {
        /* `userId` so the fallback client can attribute its `nina_error_logs` rows to this runner;
         * it is the same id passed as `input.userId` twelve lines above. */
        ...(await productionDeps(userId)),
        toolSet: NINA_FULL_TOOL_SET,
        store: ninaChatTurnStore(turnId),
      },
    )
    source = result.source

    /*
     * ── R2'S TELEMETRY, AND IT LANDS ABOVE THE EARLY RETURNS ON PURPOSE ──────────────────────
     * `nina_shortcuts.uses` and `last_used_at` answer ONE question on `/admin/shortcuts`: which of
     * these codes does he actually use? A shortcut fired the moment its trigger was in his message
     * and its expansion went into the payload the model was billed for. Deleting the conversation
     * afterwards does not un-fire it, and a reply she failed to produce does not un-fire it either
     * — so counting only the turns that survived to a bubble would make the column a measure of
     * Nina's uptime rather than of his habits, and would under-count exactly the turns that are
     * most annoying to lose. Placing it here also means ONE call site covers all four exits below
     * (`session-gone`, the null payload, the happy path, and a throw) instead of three copies that
     * will drift apart the first time someone edits one of them.
     *
     * **`hits.fired` only, never `inPlay`.** A still-in-play shortcut was counted on the turn it
     * fired; counting it again on every follow-up would make `uses` measure recency, not habit.
     * `runNinaTurn` enforces that split — see `NinaTurnResult.firedShortcutIds`.
     *
     * ── FIRE AND FORGET, AND IT CANNOT REJECT INTO THE TURN. INVARIANT 7. ────────────────────
     * `void` with its own `.catch`, not an `await`. A usage counter is not worth one round trip of
     * wall clock on a path that has just spent 13-45 s, and it is certainly not worth failing a
     * turn for. `after()` was the other candidate and was declined: we are already inside one, and
     * `tests/nina.resend.test.ts` drains `after`'s queue by hand and asserts its length, so a
     * second entry would change what that suite measures.
     */
    if (result.firedShortcutIds.length > 0) {
      void bumpNinaShortcutUses(userId, result.firedShortcutIds).catch((cause) => {
        console.warn('[nina] shortcut usage bump failed', { turnId, error: String(cause) })
      })
    }

    /*
     * ── THE OWNERSHIP RE-CHECK (R1). ───────────────────────────────────────────────────────────
     * Up to 45 s passed since this turn opened its claim, and a send that arrived while the claim
     * was still `'running'` may have superseded it — closed the row `failed`/`superseded` and
     * started a fresh turn whose context contains everything this one was answering. This
     * invocation is the loser of that race, and the answer it is holding is now a DUPLICATE. So it
     * persists NOTHING and exits: no session check, no bubbles, no close, no distillation, no
     * auto-title, and — because a `return` from inside this `try` leaves the function after the
     * `finally` — no chain. `ninaChatTurnStore.record` has already landed the token usage on the
     * row (its arm 2), so the money ledger stays honest; the `superseded` reason on the row is the
     * only record this answer ever existed.
     *
     * The shortcut bump above STAYS above this exit, exactly as it stays above every other early
     * return: the trigger was in his message and the payload was billed for it — a turn the runner
     * retargeted does not un-fire it any more than a failed one does.
     *
     * `closed = true` because the row IS closed — by the cancel, not by us — so the `finally`'s
     * `closeNinaChatTurn` (conditional on `status='pending'` and a no-op here anyway) is spared
     * the statement. `failure = undefined` because 'crashed' would be a lie; the row already
     * carries the truth.
     */
    if (await chatTurnWasSuperseded(userId, turnId)) {
      console.warn('[nina] turn was superseded mid-flight; discarding its answer', {
        turnId,
        sessionId,
      })
      failure = undefined
      closed = true
      return
    }

    /*
     * ── THE SESSION MAY HAVE BEEN DELETED WHILE SHE WAS THINKING (phase 6's handoff) ──────────
     * Up to `NINA_BACKGROUND_BUDGET_MS` has passed since the response went out, and
     * `removeNinaSession` is one tap away in the sidebar the whole time. Every write below is a
     * write into a conversation that may no longer exist:
     *
     *   · her bubbles — `insertNinaMessages` already degrades to `[]` here, so this is belt;
     *   · **the distillation** — `nina_memory_facts` / `nina_memory_slots` rows stamped with a
     *     `source_message_id` whose row the cascade has already destroyed. That is precisely the
     *     orphan class phase 6 purges, re-created milliseconds after the purge ran, and it is the
     *     one that actually reaches her: `loadNinaContext` reads the session's message window but
     *     the WHOLE relationship's memory ledger, so an orphaned fact is permanent pollution;
     *   · the auto-title — naming a row that is gone.
     *
     * One indexed owner-scoped read answers it. Cheap on a path that has just spent 13-45 s on a
     * model call, and it sits HERE — immediately after the model returns and before anything is
     * persisted — so it runs ONCE per turn and covers both exits below, rather than once per write.
     *
     * ABANDONING IS THE WHOLE RESPONSE. Nothing is written, nothing is retried, nothing is
     * re-homed into another conversation — a reply to a conversation he deleted does not belong in
     * the one he kept. The claim is closed with a reason (`'session-gone'`) in the `finally`, so
     * the ledger says what happened and no sweep has to guess.
     */
    if (!(await ninaSessionExists(userId, sessionId))) {
      console.warn('[nina] session was deleted mid-turn; abandoning', { turnId, sessionId })
      failure = 'session-gone'
      return
    }

    if (result.payload == null) {
      /*
       * She could not answer, but HE still spoke, and R4 is "every single thing". His message is
       * persisted with an id, so distilling it is both possible and the honest reading of the
       * requirement — a turn where she failed is not a turn where he said nothing.
       *
       * **No bubble is written.** `runNinaTurn`'s silence is silence; app-authored prose in her
       * mouth is what invariant 7 and `ChatScreen`'s header forbid. The screen says so in its own
       * voice, through the 'no-reply' notice, once the poll sees the turn close with nothing new.
       */
      failure = undefined
      await closeNinaChatTurn(userId, turnId, source)
      closed = true
      await runNinaDistillation({
        userId,
        runnerText: input.runnerText ?? '',
        sourceMessageId: runnerMessageId,
        ninaBubbles: [],
        memoryWrites: [],
        context: loadedContext,
        relationship: tuning.relationship,
      })
      return
    }

    /*
     * STEP 4 — `replyToMessageId`, re-checked against rows this user owns. The model produced this
     * id, and a well-formed id is not proof of ownership (the Server Actions guide's own warning).
     * The context window she was given is the authoritative list of what she could legitimately be
     * answering, so it is also the cheapest check — no extra query.
     */
    const ownedIds = new Set(loadedContext.conversation.window.map((turn) => turn.id))
    const replyToId =
      result.payload.replyToMessageId != null && ownedIds.has(result.payload.replyToMessageId)
        ? result.payload.replyToMessageId
        : null

    /*
     * STEP 5 — one row per bubble (RU-5), in ONE multi-row `INSERT`.
     *
     * **Emission order comes free**, because Postgres evaluates `nextval` once per row in `VALUES`
     * order — the first bubble gets the lower `seq`, always. It is one round trip instead of four
     * and it is atomic, so a half-written four-bubble reply can no longer come from a partial
     * insert. `replyToId` goes on the FIRST bubble only: a four-bubble reply is one answer to one
     * message, and quoting the same message four times would render four identical quote headers.
     *
     * ── `turnId` IS NOW STAMPED, AND IT WAS NOT BEFORE ──────────────────────────────────────────
     * `nina_messages.turn_id`'s own schema comment says "Phase 3 stamps it onto every message the
     * turn emitted", and the analysis measured **0 of 48 rows carrying one** — because the row did
     * not exist until after the messages were written. Opening the turn first is what makes the
     * documented contract satisfiable, so it is satisfied here rather than left as a second gap.
     * Nothing renders it; it is the audit join, and the column carries no foreign key precisely so
     * that it can never block a delete.
     */
    const rows = await insertNinaMessages(
      userId,
      result.payload.bubbles.map((body, index) => ({
        role: 'nina' as const,
        body,
        turnId,
        replyToId: index === 0 ? replyToId : null,
      })),
      /* The same session his message went into. She is answering in the conversation she was asked
       * in; there is no case in which a reply belongs anywhere else. */
      sessionId,
    )
    bubbles = rows.map((row) => ({ id: row.id, body: row.body, replyToId: row.replyToId }))

    /*
     * The claim drops HERE — after her rows are committed and not one statement earlier. The poll
     * asks two questions of the server ("is a turn in flight" and "is there anything after my
     * cursor"), and closing the claim before the rows exist would let a poll land in the gap and
     * read a true "no" to both, raising 'no-reply' for a reply that was mid-insert. See
     * `ninaChatTurnStore`'s header.
     */
    failure = undefined
    await closeNinaChatTurn(userId, turnId, source)
    closed = true

    /*
     * STEP 6 — the distillation (R4). AWAITED here rather than scheduled in a nested `after()`,
     * and the change is a simplification rather than a reversal. The original reason for `after()`
     * was that awaiting a 10-20 s model call would leave him "watching an idle screen after the
     * bubbles have landed" — but there is no screen waiting on this function at all any more; the
     * response went out before the turn even started. Both forms run inside the same segment budget
     * (`after` is the platform's `waitUntil`, not a new invocation), so nesting would buy nothing
     * and would make the ordering against the chain below unpredictable.
     *
     * `runTurnDistillation` never throws, so there is no `try` around it and nothing to swallow.
     */
    await runNinaDistillation({
      userId,
      runnerText: input.runnerText ?? '',
      sourceMessageId: runnerMessageId,
      ninaBubbles: bubbles.map((bubble) => bubble.body),
      memoryWrites: result.payload.memoryWrites ?? [],
      context: loadedContext,
      relationship: tuning.relationship,
    })

    /*
     * STEP 7 — the session's name (R3). **This exit and no other**: R3's trigger is "the first
     * interaction (user then nina)", and this is the only path on which both rows exist.
     * `titleNinaSessionIfNeeded` never throws and makes no call at all for a session that already
     * has a name; its idempotence is `setNinaSessionTitleIfUntitled`'s `WHERE … AND title IS NULL`,
     * not this line's, so two racing tabs are already handled.
     */
    await titleNinaSessionIfNeeded(userId, sessionId)
  } catch (cause) {
    console.warn('[nina] background turn failed', { turnId, error: String(cause) })
  } finally {
    /*
     * The row must never be left `pending` by a throw we were in a position to see. If it is, the
     * only thing that closes it is the 90-second sweep — which is correct but slow, and the screen
     * spends that whole time showing a typing indicator for a turn that is already dead.
     * `closeNinaChatTurn`'s own `WHERE status = 'pending'` makes this a no-op when the happy path
     * already closed it, so the `closed` flag is belt to that brace rather than the guard itself.
     */
    if (!closed) {
      try {
        await closeNinaChatTurn(userId, turnId, source, failure ?? 'crashed')
      } catch (cause) {
        console.warn('[nina] could not close a chat turn', { turnId, error: String(cause) })
      }
    }
  }

  /*
   * ── THE CHAIN: MESSAGES THAT ARRIVED WHILE SHE WAS TYPING ────────────────────────────────────
   * This is the other half of `openNinaChatTurn` refusing a second claim. A burst — "eh", "nina",
   * "gimana", which is exactly how this app gets used — persists three rows and starts ONE turn.
   * The second and third messages would otherwise sit unanswered until he sent a fourth.
   *
   * So when this turn is done, it asks one indexed question: is the newest row in this conversation
   * his? If it is, it opens a fresh claim and runs one more turn for it. That turn's context
   * contains every message of the burst AND her reply to the first, so she answers the remainder
   * coherently instead of four times in parallel.
   *
   * BOUNDED TWICE, because an unbounded chain is a machine for spending money: by `depth` against
   * `NINA_TURN_CHAIN_MAX`, and by wall clock against `NINA_BACKGROUND_BUDGET_MS` measured from the
   * original send. The wall-clock bound is what makes this correct under BOTH of phase 2's
   * outcomes: with a 60 s ceiling the budget is exhausted after the first link and the chain simply
   * does not start, with no code change beyond the two literals `turnflight.ts` documents.
   *
   * Hitting either bound loses nothing. The unanswered messages are still in the database, still in
   * her next context window, and his next send starts a turn that sees all of them.
   */
  if (input.depth >= NINA_TURN_CHAIN_MAX) return
  if (Date.now() - input.startedAtMs >= NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall) return

  try {
    /* The same guard as above, on the chain. `listNinaMessages` against a deleted session already
     * returns `[]` so this would exit anyway — but exiting BY ACCIDENT is not the same as exiting
     * on purpose, and the next reader should not have to derive the safety from a second file. */
    if (!(await ninaSessionExists(userId, sessionId))) return

    const [newest] = await listNinaMessages(userId, { limit: 1, sessionId })
    if (newest == null || newest.role !== 'runner') return

    const nextTurnId = await openNinaChatTurn(userId, {
      sessionId,
      runnerMessageId: newest.id,
      depth: input.depth + 1,
    })
    if (nextTurnId === null) return

    /*
     * A DIRECT `await`, not another `after()`. We are already inside the background task's budget,
     * and nesting would add a scheduling hop without adding a second of wall clock —
     * `NINA_BACKGROUND_BUDGET_MS` is the segment's, not the callback's.
     *
     * `imageDescriptions: []` and `quotedRow: null` are correct rather than lossy. Those two inputs
     * describe what is attached to THIS message right now; the message itself is already
     * PERSISTED, so its photographs reach her the way every window row's do — through
     * `dbNinaSourceGateway.readMessageWindow`, which reads each window row's images with
     * `getNinaMessageImagesForMessages` and carries their `description` (R3, 2026-09-10; it mapped
     * every window row to a literal `[]` before that). So she can still see a photo sent mid-burst,
     * described or not. A quote is genuinely absent: the runner armed it against a send that has
     * already been answered, and re-quoting it on a follow-up would put the same quote header on
     * two turns.
     */
    await runNinaBackgroundTurn({
      userId,
      sessionId,
      turnId: nextTurnId,
      runnerMessageId: newest.id,
      runnerText: newest.body.length > 0 ? newest.body : null,
      imageDescriptions: [],
      quotedRow: null,
      attachedRunId: newest.runId,
      depth: input.depth + 1,
      startedAtMs: input.startedAtMs,
    })
  } catch (cause) {
    console.warn('[nina] chained turn failed', { turnId, error: String(cause) })
  }
}

/* ── MOVED VERBATIM from lib/nina/actions.ts:2203–2255 — still private ─────────────────────── */
/**
 * One identical distillation pass for the two exit paths of the background turn.
 *
 * **The `after()` that used to be here moved to `startNinaBackgroundTurn`, which now wraps the
 * whole turn (F36 R6).** Wrapping this again would be an `after()` inside an `after()` for no
 * budget gain — both forms run inside the same segment budget, because `after` is the platform's
 * `waitUntil` rather than a new invocation — and it would make the ordering against
 * `runNinaBackgroundTurn`'s chain unpredictable. Its two call sites are both in that function, and
 * both already sit after the response has gone out.
 *
 * **`messageCount` is an exact count and still costs no query (F35 phase 3).** It used to be
 * `context.conversation.window.length` — the 40-message window, "exact everywhere below 40", which
 * was fine while there was one conversation. Session-scoping the window (assumption A1) broke that:
 * the length resets in every new session, so `nameSlotValue`'s `FIRST_CONVERSATION_MESSAGE_LIMIT`
 * check would latch on again and she would re-offer him a nickname every time he changed topic.
 *
 * `window.length + olderMessageCount` is the repair and it is free, because phase 3 deliberately
 * left `olderCount` user-wide (see `getNinaMessageWindow`): the sum is every message he has ever
 * exchanged with her, across every session, computed from two numbers already in hand. That is
 * strictly better than what this comment used to promise, and it makes "the first conversation" a
 * property of the relationship rather than of a session — which is what the phrase means.
 */
async function runNinaDistillation(input: {
  userId: string
  runnerText: string
  sourceMessageId: string
  ninaBubbles: readonly string[]
  memoryWrites: readonly NinaMemoryWrite[]
  context: NinaContext
  /*
   * F33 / R6, the sweep: the librarian is told what she is SET to be, so the couple's own register
   * — "yang", "sayang", "bestie" — is recognised as the register and not filed as a standing fact
   * about him. It rides the input and never `context`: `NinaContext` is serialised into the USER
   * turn and is documented as the boundary of everything she may know (plan invariant 3).
   */
  relationship: NinaRelationship
}): Promise<void> {
  await runTurnDistillation({
    userId: input.userId,
    runnerText: input.runnerText,
    sourceMessageId: input.sourceMessageId,
    ninaBubbles: input.ninaBubbles,
    memoryWrites: input.memoryWrites,
    slots: input.context.memory.slots.map((slot) => ({ key: slot.key, value: slot.value })),
    identity: {
      fullName: input.context.runner.fullName,
      nickname: input.context.runner.nickname,
      messageCount:
        input.context.conversation.window.length + input.context.conversation.olderMessageCount,
    },
    relationship: input.relationship,
  })
}
