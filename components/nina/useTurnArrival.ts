'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import { todayInJakarta } from '@/lib/date/ranges'
import { pollNinaReply, type SentBubble } from '@/lib/nina/actions'
import { appendNewBubbles } from '@/lib/nina/live'
import { planReveal } from '@/lib/nina/reveal'
import {
  NINA_TURN_POLL_GIVE_UP_MS,
  ninaPollDelayFor,
  type NinaFlightView,
} from '@/lib/nina/turnflight'

import type { ChatMessage } from './types'
import type { Notice } from './chatScreenCopy'

/**
 * F36 R6's arrival half of a turn: everything between "his message is in" and "her last bubble is
 * on screen". The hook owns `awaiting` (the poll runs), `typing` (mid-reveal), the conversation
 * the poll asks about and its cursor — and exposes exactly the verbs the send and resend paths
 * need from the outside. `ChatScreen` renders `showTyping` and otherwise never touches the
 * machinery; the one thing the hook writes outside its own state is her revealed bubbles, through
 * the `setMessages` the screen owns.
 */
export function useTurnArrival({
  flight,
  sessionId,
  setMessages,
  setNotice,
}: {
  /** Seeded from the server so a cold load mid-turn already shows the indicator and polls. */
  flight: NinaFlightView
  /** The conversation the poll asks about until a send's answer resolves or creates a real one. */
  sessionId: string | null
  /** The conversation list the reveal appends her bubbles to. */
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setNotice: (notice: Notice | null) => void
}) {
  /**
   * Mid-reveal: the pause between two of her bubbles. Distinct from `awaiting`; see the render.
   */
  const [typing, setTyping] = useState(false)
  /**
   * F36 R6. She has a message of his that she has not answered, so the poll is running and the
   * indicator is up. Seeded from the server so a cold load mid-turn already shows it.
   */
  const [awaiting, setAwaiting] = useState(flight.awaiting)
  /**
   * F36 R6. The conversation the poll asks about. Seeded from the prop and REPLACED by the send's
   * answer, because `sessionId` may legitimately be `null` — "he has no sessions at all" — and the
   * ACTION is what resolves or creates one. Without adopting it, the first message of a brand-new
   * runner would send fine and then be polled for in a conversation the client cannot name.
   */
  const [liveSessionId, setLiveSessionId] = useState(sessionId)
  /**
   * F36 R6. `nina_messages.seq` of the newest row this screen holds — the poll's cursor. A REF and
   * not state: it is read inside the poll loop and written by both the send and the poll, and a
   * stale closure over it would re-read the same rows for ever. Nothing renders from it.
   */
  const cursorRef = useRef(flight.cursor)

  // Every timed step checks this before touching state. StrictMode double-invokes effects in
  // development and a runner can navigate away mid-reveal; both would otherwise set state on an
  // unmounted tree. `InsightTrigger` and `ChatScreen` keep the same guard for the same reason,
  // each for its own timers — a `useRef` created HERE, not a flag from a custom hook, is what
  // keeps both react-hooks rules content (exhaustive-deps exempts a ref it can see being created;
  // the compiler treats `.current` on it as opaque).
  const alive = useRef(true)

  /*
   * The reveal's `setTimeout` handle. Separate from the poll's on purpose — see `pollTimer`.
   */
  const timer = useRef<number | null>(null)
  /*
   * Its own handle, on `timer`'s exact reasoning. The poll's backoff wait and the reveal's
   * `sleep` never overlap — the loop awaits one then the other — but sharing one handle would mean
   * the next person to add a cancel path silently cancels the wrong one.
   */
  const pollTimer = useRef<number | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current)
    }
  }, [])

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      timer.current = window.setTimeout(resolve, ms)
    })

  /**
   * RU-5's staggered reveal, lifted verbatim out of `handleSend` so the SEND path and the POLL path
   * cannot drift into two different rhythms. It is the only writer of `typing` besides the poll's
   * own start and stop.
   *
   * It guards on `alive.current` at every timed step, and on `id` presence at the append — the one
   * other guard it has, and the reason it can share a list with `mergeServerMessages`. Callers are
   * sequential by construction — the poll loop awaits this before deciding whether to keep polling
   * — so there is no second reveal to interleave with, and the single `timer` handle stays safe.
   *
   * ── WHY THE APPEND SKIPS IDS ALREADY ON SCREEN (prod "gj", 2026-09-11: 4 rows, 7 bubbles) ────
   * Every bubble here used to be appended unconditionally, and on prod session "gj" that rendered
   * seven bubbles from the four rows the database holds. A full-route RSC delivery of `/nina` had
   * landed mid-reveal — its `read_at` sits 14 ms after the turn's INSERT, so its payload carried
   * all four committed rows — and `mergeServerMessages`, correctly by its own rule, delivered the
   * three bubbles the reveal had not reached yet. The reveal then appended its own copies of the
   * same `nina_messages.id`s: two channels into one list, and only the merge deduped. The guard
   * sits INSIDE the updater (`appendNewBubbles`), so the check reads the list as React will commit
   * it — a merge that lands in any gap between two sleeps is already on screen for the next
   * iteration.
   *
   * ── WHY THE GUARD LIVES HERE AND NOT IN THE MERGE ────────────────────────────────────────────
   * Because the merge is already correct: server order, local content, id-deduped — the sanctioned
   * ONE-FRAME delivery for a refresh, whose contract the header above documents for a COMPLETED
   * list. The defect was the other writer holding no contract at all, and that defect is one
   * missing `id` check wide. Making the merge reveal-aware (routing new nina rows through the
   * stagger) would put a second writer on the reveal's rhythm to fix it. What a mid-reveal merge
   * still does — collapse the remaining stagger into one frame — is cosmetic, and explicitly
   * accepted (invariant 4 of `NINA_DUP_BUBBLE_REVEAL_PLAN.md`); what it can no longer do is render
   * an id twice.
   */
  const revealBubbles = useCallback(
    async (bubbles: readonly SentBubble[]) => {
      const plan = planReveal(bubbles.map((b) => b.body))
      for (const [index, bubble] of bubbles.entries()) {
        const gap = plan[index] ?? 0
        if (gap > 0) {
          setTyping(true)
          await sleep(gap)
          if (!alive.current) return
        }
        // The indicator stays up while there is another thought coming, and drops with the last.
        setTyping(index < bubbles.length - 1)
        /*
         * The APPEND alone is idempotent — `appendNewBubbles` returns the list untouched when the
         * merge has already delivered this id. The SLEEP above is not skipped: the stagger is keyed
         * to the batch as the poll received it, and pruning the plan for ids already on screen
         * would need a synchronous read of `messages` that this updater-only shape deliberately
         * refuses as a second source of truth. So a mid-reveal merge can leave a gap where a
         * bubble already sits — the accepted collapse — while the id itself can no longer appear
         * twice.
         */
        setMessages((current) => appendNewBubbles(current, [bubble], todayInJakarta()))
      }
      setTyping(false)
    },
    [setMessages],
  )

  /**
   * **The arrival loop (F36 R6).** Runs while `awaiting` is true and stops itself the moment the
   * server says there is nothing outstanding.
   *
   * ── ONE SEQUENTIAL ASYNC LOOP, NOT A `setInterval` ───────────────────────────────────────────
   * Because a tick must not fire while the previous request is in flight, and — the part that
   * matters — because a tick must not fire while a REVEAL is in progress. An interval would race
   * the reveal's own `sleep` for the shared timer handle and could deliver a second batch of
   * bubbles into the middle of the first batch's stagger. Awaiting each step in order makes both
   * impossible by construction rather than by a guard someone has to remember.
   *
   * ── WHY IT DOES NOT STOP ON THE FIRST BUBBLES ────────────────────────────────────────────────
   * Because a burst chains: the server may answer his first message, then open a second turn for
   * the two he sent while she was typing. The stop condition is the server's `awaiting`, which is
   * "is anything of his unanswered", not "did I just receive something".
   *
   * ── THE GIVE-UP ─────────────────────────────────────────────────────────────────────────────
   * `NINA_TURN_POLL_GIVE_UP_MS` is `NINA_BACKGROUND_BUDGET_MS` — the server's honest wall clock —
   * and no longer the 90 s stale deadline it was identical to before (asserted as the pairing in
   * `lib/nina/turnflight.test.ts`). The real stop for a DEAD turn is the server's own
   * `awaiting: false`: the claim read is authoritative, the sweep closes a dead row within
   * `NINA_TURN_STALE_MS`, and the next poll says stop within ~90 s without this backstop's help.
   * What is left for the backstop is the poll that cannot reach the server at all — an offline
   * phone, where every request fails and no server answer is ever coming — and it must span the
   * longest HONEST run so it never fires over a living turn: the first turn plus
   * `NINA_TURN_CHAIN_MAX` (2) chained follow-ups at ~50 s each is ~210 s, inside
   * `NINA_BACKGROUND_BUDGET_MS` = 240 s. At the old 90 s this loop called a living chain dead,
   * raised the notice, and her remaining replies landed unobserved.
   */
  useEffect(() => {
    if (!awaiting) return
    let cancelled = false

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        pollTimer.current = window.setTimeout(resolve, ms)
      })

    const stop = (raised: Notice | null) => {
      setAwaiting(false)
      setTyping(false)
      if (raised !== null) setNotice(raised)
    }

    const run = async () => {
      const startedAt = Date.now()
      let attempts = 0

      while (!cancelled && alive.current) {
        await wait(ninaPollDelayFor(attempts))
        if (cancelled || !alive.current) return
        attempts += 1

        let result: Awaited<ReturnType<typeof pollNinaReply>> | null = null
        try {
          result = await pollNinaReply({
            sessionId: liveSessionId,
            afterSeq: cursorRef.current,
          })
        } catch {
          result = null
        }
        if (cancelled || !alive.current) return

        const expired = Date.now() - startedAt >= NINA_TURN_POLL_GIVE_UP_MS

        if (result === null || !result.ok) {
          /* The poll itself failed. It has learned nothing, so it says nothing and tries again —
           * until the give-up, which is the only thing that ends an offline wait. */
          if (expired) {
            stop('no-reply')
            return
          }
          continue
        }

        cursorRef.current = result.cursor

        if (result.bubbles.length > 0) {
          setNotice(null)
          /*
           * `setAwaiting(false)` BEFORE the reveal when the server says nothing is outstanding, so
           * the indicator is owned by `typing` alone for the duration of the stagger. Flipping it
           * re-runs this effect's cleanup and sets `cancelled`, which is harmless: `revealBubbles`
           * guards on `alive.current`, and this iteration returns immediately afterwards.
           */
          if (!result.awaiting) setAwaiting(false)
          await revealBubbles(result.bubbles)
          if (cancelled || !alive.current) return
          if (!result.awaiting) return
          continue
        }

        if (!result.awaiting) {
          /* Nothing outstanding and nothing new: she said nothing, or the turn is dead and the
           * server has closed it. One notice covers all of it — see NOTICE_TEXT's comment. */
          stop('no-reply')
          return
        }
        if (expired) {
          stop('no-reply')
          return
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current)
    }
  }, [awaiting, liveSessionId, revealBubbles, setNotice])

  /*
   * F36 R6. The indicator is up while the SERVER owes an answer (`awaiting`) and between two of her
   * bubbles mid-reveal (`typing`). Two pieces of state and one derived flag, rather than one
   * overloaded boolean, because the poll and the reveal legitimately own different stretches of the
   * same wait and each must be able to end its own without ending the other's.
   *
   * This is the honest signal R6 asks for: it means "she is answering", where the grey bubble it
   * replaces meant "your message has not been saved yet" — which was never what the runner read it
   * as, and is no longer true for even a second.
   */
  const showTyping = awaiting || typing

  /** The send's answer resolves (or creates) the conversation the poll polls. Null stays null. */
  const adoptSession = useCallback((adopted: string | null) => {
    if (adopted !== null) setLiveSessionId(adopted)
  }, [])

  /** The send's confirmed row carries the newest `seq` — the poll asks for everything after it. */
  const takeCursor = useCallback((seq: number | null) => {
    if (seq !== null) cursorRef.current = seq
  }, [])

  /**
   * The resend's cursor is taken as a MAXIMUM: the server's answer is `>=` every row on screen, so
   * resuming there asks for exactly the rows the resent turn produces and cannot re-deliver a
   * bubble already on screen. `Math.max` covers the two ways it could still arrive stale: the
   * action degrades to the resent row's own `seq` if its cursor read fails, and a poll may
   * legitimately land between the server's read and this assignment, because `awaiting` can be
   * true while a resend is accepted.
   */
  const raiseCursor = useCallback((seq: number | null) => {
    if (seq !== null) cursorRef.current = Math.max(cursorRef.current, seq)
  }, [])

  /** A send or resend was accepted — something of his is outstanding, so the poll starts. */
  const beginAwaiting = useCallback(() => setAwaiting(true), [])

  /** The send was refused: nothing is outstanding, and no reveal is running to own `typing`. */
  const endTurn = useCallback(() => {
    setAwaiting(false)
    setTyping(false)
  }, [])

  return { showTyping, adoptSession, takeCursor, raiseCursor, beginAwaiting, endTurn }
}
