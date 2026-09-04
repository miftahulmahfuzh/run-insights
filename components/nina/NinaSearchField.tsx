'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { CONTROL_CLASS } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  SEARCH_QUERY_MAX_CHARS,
  isDegradedSearch,
  normalizeSearchQuery,
  searchDebounceMs,
  shouldRunSearch,
  shouldRunSemantic,
  type NinaSearchResponse,
} from '@/lib/nina/search'
import { searchNinaChats } from '@/lib/nina/searchActions'
import { useSemanticPref } from './useSemanticPref'

/**
 * R6's second half: *"at the top of the sidebar we can search all chat as well. add a toggle at the
 * right side of the search field (persist the toggle across app usage) to enable semantic search,
 * so we can search using llm as well."*
 *
 * ── THIS COMPONENT MEASURES; `lib/nina/search.ts` DECIDES ─────────────────────────────────────
 * Invariant 7, and `lib/nina/chatview.ts` / `lib/nina/reply.ts` are the shape. Every rule below —
 * the minimum query length, the debounce, whether the model pass runs, the snippet, the ranking,
 * the href — is a tested function in `lib/nina/search.ts`, because `vitest.config.ts` is
 * `environment: 'node'` with no jsdom and a rule that lives here cannot be tested at all.
 *
 * ── WHY THE RESULTS PUSH THE SESSION LIST DOWN INSTEAD OF REPLACING IT ────────────────────────
 * Replacing it would mean owning phase 5's render of the list, which is another phase's file and
 * another phase's state. This component renders its own block and the list follows it in the
 * sidebar's scroll container. That keeps the seam to a single element with a single prop — which is
 * the difference between a coordination point and a merge conflict.
 *
 * ── WHY A `<Link>` AND NOT `history.pushState` ───────────────────────────────────────────────
 * This is the one place the `usePanelParam` idiom must NOT be copied. `?panel=` is read only by a
 * client hook, which is exactly why `pushState` works there and why `app/me/page.tsx` deliberately
 * never re-runs. `?s=` is resolved by `app/nina/page.tsx` **during the server render** (phase 3),
 * so `pushState` would change the URL and leave the old session's messages on screen. A real
 * navigation also gets prefetch, long-press and middle-click for free — `app/nina/page.tsx`'s
 * argument for making Nina's avatar a `<Link>` rather than a `<button>`.
 *
 * ── MOTION (INVARIANT 8) ─────────────────────────────────────────────────────────────────────
 * The only transition here is `transition-colors` on the toggle. `app/globals.css` is explicit that
 * the `transition-*` utilities in `Chip`, `KindSelector` and `Button` are "deliberately untouched"
 * because they "animate colour only, which is not motion". So there is no new keyframe and nothing
 * for `prefers-reduced-motion` to answer.
 */

export interface NinaSearchFieldProps {
  /**
   * Close the sidebar. **Required, and deliberately not optional**: a hit is a navigation to
   * `/nina?s=…`, and a sidebar left open over the session it just opened is the bug. Making it
   * required means `tsc` fails if phase 5's seam does not wire it, which is a better guarantee than
   * a comment asking phase 5 to remember.
   */
  onNavigate: () => void
}

export function NinaSearchField({ onNavigate }: NinaSearchFieldProps) {
  const [text, setText] = useState('')
  const [semantic, setSemantic] = useSemanticPref()

  /**
   * **The last search that finished, tagged with the input that produced it** — and NOT a separate
   * `response` plus `pending` pair.
   *
   * The plan wrote those as two states set synchronously at the top of the effect. That trips
   * `react-hooks/set-state-in-effect`, which this repo enforces as an error and whose reasoning is
   * the same one React gives for "you might not need an effect": both flags are FUNCTIONS of the
   * typed query, so deriving them during render is strictly better than re-deriving them into state
   * a render later. Idle and pending fall out of the tag below, the effect sets state only from its
   * async callback, and the behaviour the plan specified is unchanged — with one flash fewer, since
   * there is no frame in which a stale response is on screen next to a fresh query.
   */
  const [result, setResult] = useState<{
    query: string
    semantic: boolean
    response: NinaSearchResponse | null
  } | null>(null)

  /**
   * **A Server Action cannot be cancelled, and pretending otherwise would be the bug.** There is no
   * `AbortSignal` on an action call and a serverless invocation cannot be recalled. What IS
   * cancellable is its effect: every effect run takes the next id, and a response whose id is no
   * longer current is dropped. So the last keystroke always wins the render and a stale 8 s
   * semantic response can never overwrite a fresh one — including the case the tag alone cannot
   * catch, where the slow answer to an EARLIER query lands after the fast answer to the current one
   * and would otherwise put a settled field back into "searching".
   *
   * `useExtractionStatus`'s `cancelled` flag is the same idiom for the same reason.
   */
  const requestRef = useRef(0)

  const query = normalizeSearchQuery(text)
  const active = shouldRunSearch(query)

  useEffect(() => {
    /* Bump on every run, so an in-flight response cannot repaint a field the runner has since
       cleared or retyped. */
    requestRef.current += 1
    if (!shouldRunSearch(query)) return

    const id = requestRef.current

    const timer = window.setTimeout(
      () => {
        void searchNinaChats({ query, semantic })
          .then((next) => {
            if (requestRef.current !== id) return
            setResult({ query, semantic, response: next })
          })
          .catch(() => {
            /* A transport failure of the ACTION, not of the model — the model's own failure comes
               back as `mode: 'text'`. Nothing to say beyond clearing the spinner; the field is
               still typed in and the next keystroke tries again. */
            if (requestRef.current !== id) return
            setResult({ query, semantic, response: null })
          })
      },
      /* 250 ms for text, 700 ms when a pause costs a `glm-5.3` call. `shouldRunSemantic` is what
         decides which, so the field and the action agree on the same rule. */
      searchDebounceMs(shouldRunSemantic(query, semantic)),
    )

    return () => window.clearTimeout(timer)
  }, [query, semantic])

  /* Fresh means: what is on screen answers what is in the field. Anything else is still in flight,
     which covers the debounce window as well as the call — the runner sees one continuous
     "searching" from the keystroke to the answer rather than a gap and then a spinner. */
  const fresh = result !== null && result.query === query && result.semantic === semantic
  /* Idle is NOT "no matches": below `SEARCH_MIN_CHARS` the field renders nothing at all. */
  const response = active && fresh ? result.response : null
  const pending = active && !fresh

  const hits = response?.hits ?? []
  const showEmpty = response !== null && hits.length === 0

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search all chats</span>
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={SEARCH_QUERY_MAX_CHARS}
            placeholder="Search all chats"
            /* No `autoFocus`: the sidebar opens to a session list, and raising the phone keyboard
               over it on every open would hide the thing the runner came for. */
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            /* `CONTROL_CLASS` carries the `text-base` that stops Safari zooming the viewport on
               focus — an iOS rule `components/ui/Field.tsx` says beats the design. */
            className={cn(CONTROL_CLASS, 'h-11')}
          />
        </label>

        {/*
          `role="switch"` with `aria-checked`, and not `Chip`'s `aria-pressed`. `Chip`'s own comment
          argues for exactly this distinction: "a screen reader that announces 'selected' for a
          filter chip has told the user nothing about whether tapping it again turns it off". A
          persisted setting is a switch, and a switch announces "on"/"off".

          `h-11` is 44 px, the iOS tap-target floor that `Chip` and `NinaAvatar` both hold to.
        */}
        <button
          type="button"
          role="switch"
          aria-checked={semantic}
          onClick={() => setSemantic(!semantic)}
          title="Rank results by meaning, using the language model"
          className={cn(
            'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-pill px-3.5',
            'text-[13px] font-semibold transition-colors',
            semantic ? 'bg-ink text-card' : 'bg-paper-2 text-ink-2',
          )}
        >
          <span aria-hidden="true">✨</span>
          <span>AI</span>
        </button>
      </div>

      {/*
        The degraded notice, and it is the whole point of `requested` versus `mode`.
        `lib/llm/narrate.ts` rules that "the only safe fallback for prose is the absence of prose";
        the analogue for a RANKING is the opposite, because the fallback is a real answer we can
        compute. Falling back silently would let an empty list read as "your conversation does not
        contain this", which is a false claim about the runner's own history.

        `aria-live="polite"` so it is announced when it appears, rather than only on a re-read.
      */}
      {isDegradedSearch(response) && (
        <p aria-live="polite" className="mt-2 text-[11px] font-semibold text-ink-3">
          Semantic ranking is unavailable right now — showing text matches.
        </p>
      )}

      {pending && (
        <p className="mt-2 text-[11px] font-medium text-ink-3">
          {shouldRunSemantic(normalizeSearchQuery(text), semantic)
            ? 'Reading through your chats…'
            : 'Searching…'}
        </p>
      )}

      {showEmpty && <p className="mt-2 text-[11px] font-medium text-ink-3">No matches.</p>}

      {hits.length > 0 && (
        <ul className="mt-2 space-y-1">
          {hits.map((hit) => (
            <li key={`${hit.kind}:${hit.messageId ?? hit.sessionId}`}>
              <Link
                href={hit.href}
                onClick={onNavigate}
                className="block rounded-field bg-paper-2 px-3 py-2.5 active:opacity-70"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] font-semibold text-ink-3">
                    {hit.sessionTitle}
                  </span>
                  {/* Server-formatted by `formatDay` in the action — invariant 4. Nothing in this
                      file formats a date, and a title hit carries no day to render. */}
                  {hit.day !== '' && (
                    <span className="shrink-0 text-[11px] font-medium text-ink-3">{hit.day}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-[13px] font-medium text-ink">
                  {hit.kind === 'message' && (
                    <span className="font-semibold text-ink-2">
                      {hit.mine ? 'You: ' : 'Nina: '}
                    </span>
                  )}
                  {hit.snippet}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* The SQL cap, said out loud. At the cap this search saw the newest 200 matches and not the
          conversation, so "that is all of them" is a claim it cannot make. */}
      {response?.capped === true && (
        <p className="mt-2 text-[11px] font-medium text-ink-3">
          Showing the most recent matches — narrow the search to see older ones.
        </p>
      )}
    </div>
  )
}
