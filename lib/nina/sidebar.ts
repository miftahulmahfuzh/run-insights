import { formatDayCompact } from '@/lib/format'

/**
 * The hidden full-screen sidebar's rules — F35 R6/R7/R4/R11, phase 5.
 *
 * ── WHY THESE ARE HERE AND NOT IN THE COMPONENT ───────────────────────────────────────────────
 * Invariant 7. `vitest.config.ts` runs `environment: 'node'` with no jsdom, so a decision that
 * lives inside a `'use client'` component cannot be asserted by anything in this repo. Four of the
 * five functions below decide something a reviewer would otherwise have to take on trust: which
 * query string the panel writes, which row is marked open, what a row's day says, and where the
 * screen goes when the runner removes the conversation he is reading. `lib/nina/chatview.ts` is
 * the same carve-out one screen over.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────────────────────────
 * **The ordering.** Pinned-first-then-most-recent-runner-message is phase 1's rule, decided by
 * `orderNinaSessions` and asserted in `lib/nina/sessions.test.ts`. `planSessionList` PRESERVES the
 * order it is given and the suite asserts that it does; a second opinion about "newest" living next
 * to the query that answers it is the thing `lib/nina/album.ts` warns about in the same words.
 *
 * **The title fallback.** Also phase 1's (`sessionTitleFor`), resolved on the server before a
 * `SidebarSession` is built, so an untitled chat reads the same in the list as anywhere else.
 */

/** The query parameter that holds the panel open. `usePanelParam`'s habit: UI state in the URL. */
export const SIDEBAR_PARAM = 'sidebar'

/**
 * The only value that opens it.
 *
 * A strict grammar rather than truthiness, for `parseNinaSessionParam`'s reason: a parameter whose
 * spelling is loose is a parameter two writers disagree about, and this URL already has two other
 * writers (phase 3's `?s=`, and `ChatScreen`'s `useLayoutEffect` that strips `?attach=`/`?photo=`).
 */
export const SIDEBAR_OPEN_VALUE = '1'

/**
 * The chat, with nothing named.
 *
 * Load-bearing twice: it is the base of every row's `href`, and it is the value phase 3's
 * `removeNinaChatSession` returns as `next` when the runner deleted the chat he was reading.
 * Navigating HERE asks phase 3 "which session is the most recent one" instead of answering it in a
 * component. See the phase 5 plan, D-3.
 */
export const NINA_CHAT_HREF = '/nina'

/** One row's worth of session, as the panel needs it. Every string is server-resolved. */
export interface SidebarSession {
  id: string
  /** Already through phase 1's `sessionTitleFor`, so this is never null and never a placeholder
   *  this phase invented. */
  title: string
  /** `/nina?s=<id>`, built on the server so the parameter's spelling lives in one place. */
  href: string
  pinned: boolean
  /** `'Today'`, `'3 Sep'`, or null when nothing has been said in this chat yet. */
  dayLabel: string | null
}

export interface SidebarRow {
  session: SidebarSession
  /** True for the one session open behind the panel. See D-9 for how that reads. */
  active: boolean
}

export type SidebarList = { kind: 'empty' } | { kind: 'rows'; rows: SidebarRow[] }

export type SessionRemovalPlan = { kind: 'refresh' } | { kind: 'navigate'; href: string }

/** Is the panel open, according to the URL? */
export function isSidebarOpen(raw: string | null | undefined): boolean {
  return raw === SIDEBAR_OPEN_VALUE
}

/**
 * The query string to write when opening or closing the panel.
 *
 * A `URLSearchParams` copy of what is already there, never a hand-built string: `/nina` carries
 * `?s=` from phase 3 and may carry `?attach=` or `?photo=`, and none of them may be dropped by a
 * panel opening on top of them. `URLSearchParams.set` keeps an existing key in place, so opening
 * twice is idempotent rather than duplicative.
 *
 * Returns `''` when nothing is left, which the caller spells as the bare pathname — the same
 * `query ? '?' + query : window.location.pathname` shape `usePanelParam` and `ChatScreen` both use.
 *
 * The caller passes `window.location.search` and NOT `useSearchParams().toString()`, deliberately:
 * `ChatScreen`'s mount-time `replaceState` strips `?attach=`/`?photo=` behind React's back, so a
 * snapshot from the hook can be one write stale and would resurrect a parameter that was
 * deliberately consumed. `window.location` is the only reading that cannot be stale.
 */
export function withSidebarParam(search: string, open: boolean): string {
  const params = new URLSearchParams(search)
  if (open) params.set(SIDEBAR_PARAM, SIDEBAR_OPEN_VALUE)
  else params.delete(SIDEBAR_PARAM)
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/**
 * A row's day, in the conversation's own vocabulary.
 *
 * `MessageList`'s divider is `day.dayISO === todayISO ? 'Today' : formatDayCompact(day.dayISO)`,
 * and this is the same expression so that the list and the chat cannot name a day two ways. Called
 * on the SERVER (invariant 4): `app/nina/page.tsx` already holds `todayInJakarta()` and
 * `jakartaDayOf`, and a formatted instant in a client component is the hydration mismatch that
 * file documents in three places.
 *
 * `null` in, `null` out — a chat with no runner message yet renders no day rather than
 * `lib/format.ts`'s missing-value marker, which beside a live chat would read as a fault.
 */
export function sessionDayLabel(dayISO: string | null, todayISO: string): string | null {
  if (dayISO === null) return null
  if (dayISO === todayISO) return 'Today'
  return formatDayCompact(dayISO)
}

/**
 * The list, as rows, with the open one marked — or the empty state.
 *
 * ORDER IS PRESERVED, NOT DECIDED. `listNinaSessions` already ordered these (R4 pinned-first, then
 * R5's most-recent-runner-message descending) and the suite asserts this function does not touch
 * it. `map` rather than a re-sort is the whole point.
 *
 * `activeSessionId` is null only when the runner has no sessions at all, or on a URL phase 3
 * declined to resolve; nothing matches, nothing is marked, and the panel still lists every row.
 */
export function planSessionList(input: {
  sessions: readonly SidebarSession[]
  activeSessionId: string | null
}): SidebarList {
  const { sessions, activeSessionId } = input
  if (sessions.length === 0) return { kind: 'empty' }
  return {
    kind: 'rows',
    rows: sessions.map((session) => ({
      session,
      active: activeSessionId !== null && session.id === activeSessionId,
    })),
  }
}

/**
 * Where the screen goes after a session is removed (R11).
 *
 * Two answers, and the *href* is the valuable half of them. Removing a chat the runner is not
 * reading is a list change: refresh, the row disappears, the panel stays open on the list he is
 * still tidying. Removing the one he IS reading has to land somewhere real — and it lands on the
 * BARE `/nina`, which asks phase 3 "which session opens when none is named" instead of this phase
 * re-deriving "the most recent remaining one" in a component that cannot be tested.
 *
 * That is also, at no extra cost, the answer to "he removed his last session": `/nina` with none
 * left is phase 3's empty screen, which is already in phase 3's exit criteria.
 *
 * The caller takes the navigate branch with `router.replace`, never `push`. The entry being
 * replaced is the panel's own pushed entry, and the one under it is `?s=<the id just deleted>`.
 *
 * ── THE INPUT IS PHASE 3'S ANSWER, NOT A SECOND OPINION ───────────────────────────────────────
 * This rule used to take `removedIsActive: boolean` and derive the href itself, which meant the
 * client and phase 3's `removeNinaChatSession` were each deciding where to land. Phase 3's action
 * already returns `next: string | null` — `'/nina'` when the removed session was the open one,
 * `null` when it was not — and it decides that with the session ids it has just proved ownership
 * of. So this function maps that answer onto the two things a screen can do. The two halves still
 * agree on every case (`'/nina'` + `replace`, or stay + `refresh`) and both are still asserted in
 * the suite; the difference is that only one of them decides.
 *
 * `href` is therefore a plain `string` and not `typeof NINA_CHAT_HREF`: the value arrives from the
 * server at runtime, so narrowing it to the literal here would be a type claiming a guarantee the
 * data does not carry. The suite pins the value instead, which is where that claim belongs.
 */
export function planSessionRemoval(input: { next: string | null }): SessionRemovalPlan {
  return input.next === null ? { kind: 'refresh' } : { kind: 'navigate', href: input.next }
}
