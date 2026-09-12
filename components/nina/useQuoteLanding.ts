'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { TAB_BAR_OUTER_HEIGHT_PX } from '@/components/ui/TabBar'
import { JOB_JUMP_PARAM, nextSoftNavJump, parseNinaJumpParam } from '@/lib/nina/jobview'
import { flashHoldMs, planQuoteScroll, type QuoteScroll } from '@/lib/nina/reply'

import type { Notice } from './chatScreenCopy'

/**
 * The chrome the composer sits above: the bar's **outer** height — its 39 px grid plus the 1 px
 * `border-t` the grid sits under, which is the bar's actual top edge.
 *
 * MEASURED (R2): the border was never in this sum, so the composer's bottom edge landed a pixel
 * below the bar's top border and the scrolling conversation showed through the seam between them.
 * `ChatChrome`'s `BAR_CLEARANCE_PX` is the same constant for the same reason.
 */
export const COMPOSER_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX

/**
 * Fallback for `obstructedBottomPx` if `#nina-composer` cannot be measured — the clearance plus
 * one composer row. Only reachable if the composer has not mounted, which it always has by the
 * time a quote is tappable.
 *
 * 60 is `COMPOSER_RESTING_PX` in `lib/nina/chrome.ts`, written again here because this module
 * cannot import a `lib/nina/chrome` constant without pulling the chrome state machine into the
 * screen's module graph for one number. It is one of four sites that hand-copy it — the markup in
 * `Composer.tsx` (`py-2` + `min-h-11`), that constant, this literal, and `BOTTOM_GAP.chat` in
 * `components/ui/AppShell.tsx` — and a change to any of them changes all four. It was 68, from
 * `py-3`, until the repo owner asked for the query field to take less space.
 */
const COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 60

/**
 * The landing: everything that decides WHERE the conversation shows a specific bubble, and the
 * flash that says "this one".
 *
 * Three arrivals feed it, and they share one scroll-and-flash arithmetic on purpose — R12's quote
 * tap (`handleJumpToQuote`), R1's mount deep link (`?jump=`, the effect below), and R1's
 * same-session soft navigation (the watcher below it). `planQuoteScroll` stays the one decision
 * function; this hook only decides WHEN each arrival lands, never HOW.
 *
 * The landing tint is `flashId`, held for `flashHoldMs(flashBlinks)`; `clearFlashId` is R8's
 * delete un-tinting a message that just went away.
 */
export function useQuoteLanding({
  flashBlinks,
  setNotice,
}: {
  flashBlinks: number
  setNotice: (notice: Notice | null) => void
}) {
  /** Phase 7. The message a jump just landed on. Held for `QUOTE_FLASH_MS`, then cleared. */
  const [flashId, setFlashId] = useState<string | null>(null)

  /*
   * ── R1's DEEP LINK: `?jump=<messageId>` ───────────────────────────────────────────────────
   * `/nina/jobs/[id]`'s "Buka chat-nya" lands here with `?s=<session>&jump=<message>`. The session
   * opened the right conversation on the server; this is the bubble to pinpoint.
   *
   * **READ ON THE FIRST RENDER AND HELD IN A REF**, for two reasons that both bite:
   *
   *   - `ChatScreen`'s strip layout effect CONSUMES the parameter (see its header), so by the time
   *     the jump runs `useSearchParams()` no longer has it. `useRef`'s initialiser is evaluated on
   *     every render and React keeps only the first result, which is precisely the one-shot
   *     semantics this needs;
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

  // Every timed step checks this before touching state. StrictMode double-invokes effects in
  // development and a runner can navigate away mid-reveal; both would otherwise set state on an
  // unmounted tree. `InsightTrigger` and `ChatScreen` keep the same guard for the same reason.
  // A `useRef` created HERE — not a flag returned by a custom hook — is what keeps both
  // react-hooks rules content: exhaustive-deps exempts a ref it can see being created, and the
  // React Compiler treats `.current` on it as opaque, so no deps array has to mention either.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /*
   * `flashTimer`'s own handle. The poll's backoff wait and the reveal's `sleep` never overlap —
   * the loop awaits one then the other — but sharing one timer handle would mean the next person
   * to add a cancel path silently cancels the wrong one.
   */
  const flashTimer = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    }
  }, [])

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
   * The landing flash, held for `flashHoldMs(flashBlinks)`.
   *
   * It runs whether or not the page moved: `kind: 'none'` means the target was already on screen,
   * which is exactly the case where a scroll alone would identify nothing. Since 2026-09-09 the
   * visible effect is `nina-flash-blink` in `MessageBubble` — hard blinks of a 2px ring, the
   * count owner-tuned through `NINA_FLASH_BLINKS` — with a still redefinition under
   * `@media (prefers-reduced-motion: reduce)` that `tests/motion.reducedMotion.test.ts` guards.
   * The timer outlives the blink train by one full cycle on purpose: it is what bounds the state,
   * so a second landing inside its window restarts the flash rather than racing a clearing timer.
   *
   * `flashBlinks` is a dep and that is safe rather than incidental: it is constant per mount (a
   * server-resolved number), and the effects that key on this callback's identity re-run to
   * no-ops — the mount path returns on the cleared `jumpRef`, the watcher on the stripped URL.
   */
  const flashMessage = useCallback(
    (targetId: string) => {
      setNotice(null)
      setFlashId(targetId)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => {
        if (alive.current) setFlashId(null)
      }, flashHoldMs(flashBlinks))
    },
    [flashBlinks, setNotice],
  )

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
    [measureQuoteScroll, flashMessage, setNotice],
  )

  /**
   * **The landing: something said "this bubble", so pinpoint it.** One callback so the two ways a
   * `?jump=` can arrive — a MOUNT (`/nina/jobs/[id]`'s "Buka chat-nya", or a search hit for a
   * different conversation) and a same-session SOFT NAVIGATION (a search hit for the conversation
   * already on screen, handled by the watcher below) — cannot drift into two
   * scroll-and-flash arithmetics. The extraction follows `measureQuoteScroll`'s own precedent one
   * position up: that one was pulled out of `handleJumpToQuote` so the mount landing would reuse
   * the quote tap's arithmetic rather than invent a second one, and this callback now sits under
   * both arrivals for the same reason.
   *
   * ── WHY IT REUSES `planQuoteScroll` ───────────────────────────────────────────────────────
   * The user asked for it in those words — "just like how we can click and directly pinpoint
   * reply_to message". A second scroll-and-flash would be a second set of rules about the band the
   * composer leaves over, and the two would drift the first time the composer's geometry changed.
   *
   * ── WHY `'instant'`, OVERRIDING THE PLAN'S OWN `behavior` ─────────────────────────────────
   * `planQuoteScroll` chooses `'smooth'` because a quote tap is a movement WITHIN a screen the
   * runner is already reading, and watching the page travel is what tells them they went backwards.
   * This is an ARRIVAL: the runner navigated here from elsewhere and has not seen this
   * conversation yet, so there is no "from" to animate out of — smooth-scrolling a screen that
   * just painted only shows them the bottom of the chat on the way past. `MessageList`'s R14
   * restore takes `'instant'` for the same reason and says so. (`handleJumpToQuote` keeps the
   * plan's `'smooth'` on purpose: it is the within-screen case.)
   *
   * ── WHY AN ANIMATION FRAME, AND WHY TWICE ─────────────────────────────────────────────────
   * The callers schedule this inside one `requestAnimationFrame` so layout has settled; the second
   * application below is `MessageList`'s restore idiom, verbatim and for its reason: a web font
   * settling or an image finishing decode moves the target after the first measurement, and
   * re-deriving the same pure number from the element's new position is cheap. When nothing moved,
   * `planQuoteScroll` returns `'none'` under its 8px tolerance and the second call is a no-op.
   *
   * ── IT MUST NOT CALL `revealBubbles` ──────────────────────────────────────────────────────
   * That callback is phase 3's staggered reveal of rows Nina has just sent, and it is the SOLE
   * appender of her bubbles. This callback appends nothing: every row it can land on was already
   * rendered. Scrolling is not arriving.
   *
   * A missing element is the `'quote-missing'` notice, which is already the right sentence: the
   * message is real (the job page resolved it against the database; the search SQL read it) but it
   * is not among the `CHAT_HISTORY_LIMIT` rows this screen renders.
   */
  const landOn = useCallback(
    (targetId: string) => {
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
    },
    [measureQuoteScroll, flashMessage, setNotice],
  )

  /* R1's mount landing. `jumpRef`'s block above states the one-shot reasoning; the short version:
   * the ref is cleared inside the frame rather than the effect body so StrictMode's first,
   * immediately torn-down run leaves the target for the second run, and the frame is cancelled on
   * cleanup so a navigation away mid-flight lands on nothing. The landing itself is `landOn`'s —
   * this effect only decides WHEN, never HOW. */
  useEffect(() => {
    if (jumpRef.current === null) return

    const frame = window.requestAnimationFrame(() => {
      const targetId = jumpRef.current
      if (targetId === null || !alive.current) return
      jumpRef.current = null
      landOn(targetId)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [landOn])

  /*
   * ── R1's OTHER ARRIVAL: A `?jump=` THAT DOES NOT REMOUNT ─────────────────────────────────
   * `app/nina/page.tsx` keys the screen by the session id, so a jump naming a DIFFERENT
   * conversation remounts and the effect above delivers it. A jump naming the one already open —
   * a search hit tapped while its own session is on screen — is a soft navigation: same key, no
   * remount, `jumpRef`'s initialiser never runs, and `ChatScreen`'s strip effect (deps `[]`)
   * never re-runs. Before search switched onto `?jump=`, `?at=` covered this case through
   * `MessageList`'s restore, so leaving it unhandled would be a regression, not a gap.
   *
   * ── WHY THE GUARD REF IS INITIALISED TO THE MOUNT VALUE ────────────────────────────────────
   * On a mount that CARRIES a `?jump=`, this effect's first run sees the same raw string its ref
   * was initialised to, `nextSoftNavJump` answers "already seen", and the landing belongs to the
   * mount path above. Without the initialised ref, a deep-linked mount would scroll and flash
   * TWICE. `nextSoftNavJump` (in `lib/nina/jobview.ts`, tested there because `vitest` has no
   * jsdom) owns the rest of the rule: the ref records the raw value after every run, and a `null`
   * raw resets it — so once the strip has consumed the parameter, a FRESH navigation to the same
   * id still counts as new (a genuine second tap on the same hit lands again).
   *
   * ── WHY THE STRIP RUNS BEFORE THE FRAME ───────────────────────────────────────────────────
   * The landing reads the DOM (`measureQuoteScroll` → `getElementById`), never the URL, so
   * removing the parameter first cannot starve it — and stripping in the same tick closes the
   * re-arm window a frame earlier. It deletes BY NAME on a `URLSearchParams` copy of
   * `window.location.search`, the idiom of ChatScreen's mount-time strip, so `?s=` and `?at=`
   * survive; it reads `window.location.search` rather than the `searchParams` snapshot for the
   * reason `saveMark` states ("the write has to be against whatever the URL is at the moment");
   * and it skips itself when the key is already gone, which is the case where the mount-time
   * strip won the race on a freshly mounted screen. `replaceState`, not a navigation, for the
   * reason that header gives — this entry is where we already are — and Next 16 patches it so
   * `useSearchParams` stays in sync afterwards, which is what delivers the `null` render that
   * resets the guard.
   *
   * RESIDUAL EDGE, accepted: a second tap of the SAME hit re-navigates to a byte-identical URL,
   * which the router may deduplicate into no render at all — no re-land. The first tap landed,
   * so nothing is lost; telling a repeat tap from a repeat render is not worth a nonce in the URL.
   *
   * ── WHY THE LANDING FRAME IS NEVER CANCELLED (measured in production, 2026-09-09) ─────────
   * This effect has no cleanup, and that is load-bearing. The strip ABOVE schedules its own
   * teardown: Next's patched `replaceState` dispatches an `ACTION_RESTORE` in a transition, which
   * re-renders this component with `jumpRaw === null` and re-runs this effect — the very
   * re-run that resets `softNavSeen`. With a `return () => cancelAnimationFrame(frame)` cleanup,
   * that second run first tore down the frame the FIRST run had just scheduled, and whether the
   * landing survived was a race between the rAF and the transition: a cold navigation (the first
   * tap of a hit — RSC over the wire, slow commit) usually landed; a warm one (the same hit
   * tapped again, payload already in the segment cache, fast commit) reliably did not. The owner
   * measured it as "search ↔ chat ↔ search, the second and third tap never flash". The frame
   * therefore guards itself and nothing else: `alive.current` inside it is the unmount
   * protection, and a newer arrival re-lands on top of an older frame's landing, which is the
   * correct final state. The MOUNT landing above keeps its cleanup — its deps are `[landOn]`,
   * a stable callback, so nothing in this file can re-run it mid-frame; only unmount can, and
   * StrictMode's dev double-run is exactly what its `jumpRef`-cleared-inside-the-frame shape is
   * written against. Do not "symmetrise" this file onto one shape: the two effects have
   * different re-run surfaces, and each cleanup policy is load-bearing for its own.
   */
  const jumpRaw = searchParams.get(JOB_JUMP_PARAM)
  const softNavSeen = useRef<string | null>(jumpRaw)
  useEffect(() => {
    const targetId = nextSoftNavJump(softNavSeen.current, jumpRaw)
    softNavSeen.current = jumpRaw
    if (targetId === null) return

    const params = new URLSearchParams(window.location.search)
    if (params.has(JOB_JUMP_PARAM)) {
      params.delete(JOB_JUMP_PARAM)
      const query = params.toString()
      window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
    }

    /* Deliberately NOT cancelled — see the header paragraph above. `alive` is the unmount
     * guard; a second run of this effect with a fresh target supersedes rather than cancels. */
    window.requestAnimationFrame(() => {
      if (alive.current) landOn(targetId)
    })
  }, [jumpRaw, landOn])

  /** Drop the landing tint when its message goes away under it (R8's delete). */
  const clearFlashId = useCallback((targetId: string) => {
    setFlashId((current) => (current === targetId ? null : current))
  }, [])

  return { flashId, handleJumpToQuote, clearFlashId }
}
