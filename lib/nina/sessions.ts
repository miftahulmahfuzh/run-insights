/**
 * The three decisions the session list makes that are not markup, as pure functions.
 *
 * Same argument as `lib/nina/chatview.ts` and `lib/photos/gallery.ts` before it: `vitest.config.ts`
 * runs `environment: 'node'` and there is no jsdom, so a rule that lives in a component cannot be
 * tested. The same goes for a rule that lives in a SQL `ORDER BY`: `lib/nina/queries.ts` reads the
 * facts and this file decides the order, which is why `listNinaSessions` returns
 * `orderNinaSessions(rows)` rather than ordering in the statement.
 *
 * **Ordering in TypeScript is affordable here and would not be everywhere.** The sidebar lists
 * every session — R2 says "a list of all past sessions" — so there is nothing to `LIMIT` and the
 * whole set is in hand already. If a later phase ever paginates the list, the comparator has to
 * move into SQL and this test moves with it; that is the one condition under which this file's
 * approach stops being right.
 *
 * No `Date` formatting happens here and none may: rendered strings come from `lib/format.ts` on the
 * server (invariant 4). These functions compare instants and return rows.
 */

/**
 * What a session with no title is called. One string, in one place, so the list cannot show two
 * different names for the same state.
 *
 * The untitled state is transient by design — phase 4's titler names a session within one `after()`
 * of its first exchange — so at most one row shows this at a time, usually the one he just made. A
 * dated fallback ("Chat 4 Sep") was rejected: it would need a formatter and a timezone inside a
 * rule that has neither, and phase 5's row renders the activity instant beside the title anyway.
 */
export const SESSION_UNTITLED_TITLE = 'Chat baru'

/**
 * The cap on a session title, in characters. **The set's one and only title cap** — reconciled.
 *
 * 60 is generous for the 3-4 words R3 asks for and for a manual rename, and small enough that no
 * list row can be handed a paragraph. Every other phase **imports this** and declares nothing:
 * phase 3's `lib/nina/active.ts` sanitiser, phase 4's `lib/nina/title.ts` rule and phase 5's
 * `SessionRow` `maxLength` are all this number. The value the runner is allowed to TYPE and the
 * value the server STORES must be the same number, or the input silently truncates what the
 * refusal would have accepted.
 *
 * **Why here and not in phase 4's `title.ts`.** This module imports nothing at all, so it is
 * client-safe by construction and a `'use client'` row can read it with no argument about bundles.
 * Reconciliation collapsed four spellings at two values — this phase's own draft
 * `SESSION_TITLE_MAX_CHARS = 80`,
 * phase 3's `NINA_SESSION_TITLE_MAX = 60`, phase 4's `NINA_SESSION_TITLE_MAX_CHARS = 60` in
 * `title.ts`, and phase 5's import of that name from *this* path — into this single declaration.
 */
export const NINA_SESSION_TITLE_MAX_CHARS = 60

/**
 * The facts the order depends on, and nothing else. Structural rather than typed against
 * `NinaSessionListRow`, so that `lib/nina/sessions.ts` never imports the data layer and the tests
 * can build a row from four fields.
 */
export interface NinaSessionOrderable {
  id: string
  /** R4. NULL = unpinned. */
  pinnedAt: Date | null
  /** R5's key: `max(sent_at)` over `role = 'runner'` in this session. NULL = he never wrote in it. */
  lastUserMessageAt: Date | null
  createdAt: Date
}

/**
 * The instant a session is sorted by: his newest message in it, or — for a session he made and has
 * not written in yet — when he made it.
 *
 * **Why an instant and not `seq`.** `seq` is the conversation's total order (invariant 6) and
 * `listNinaMessages` still uses it, but a session with no message has no `seq`, and a brand-new
 * session has to sort to the TOP rather than the bottom: he just created it to type in it. A key
 * that mixes "his newest message" with "when this was made" must be a common scale, and the only
 * common scale is an instant. The two cannot disagree in practice — `seq` comes from `nextval` at
 * the same INSERT that stamps `sent_at` with `defaultNow()`, so they diverge only inside one
 * transaction, and one transaction's rows are all in one session.
 */
export function sessionActivityAt(session: NinaSessionOrderable): Date {
  return session.lastUserMessageAt ?? session.createdAt
}

/**
 * **R5 alone: most recent user message first, pins ignored.** This is the RESOLUTION order — "which
 * session is the current one" — and it is deliberately not the display order.
 *
 * `id` descending is the tie-break. Ids are random, so the direction carries no meaning; what it
 * carries is totality, which is what makes the sort stable and the test deterministic.
 */
export function compareNinaSessionActivity(
  a: NinaSessionOrderable,
  b: NinaSessionOrderable,
): number {
  const delta = sessionActivityAt(b).getTime() - sessionActivityAt(a).getTime()
  if (delta !== 0) return delta
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

/**
 * **R4 then R5: the DISPLAY order.** Pinned sessions form the top block; inside each block, R5.
 *
 * Pinning partitions the list and does not sort it. Sorting the pinned block by `pinned_at` was
 * rejected: an actively-used pinned session would drift downward every time he pinned something
 * else, and R5 is the order he asked for. `pinned_at` is stored as an instant anyway, so reversing
 * this needs no migration — only a change here and a case in the test.
 */
export function compareNinaSessions(a: NinaSessionOrderable, b: NinaSessionOrderable): number {
  const aPinned = a.pinnedAt !== null
  const bPinned = b.pinnedAt !== null
  if (aPinned !== bPinned) return aPinned ? -1 : 1
  return compareNinaSessionActivity(a, b)
}

/** The display order (R4 + R5), as a new array. The input is never mutated. */
export function orderNinaSessions<T extends NinaSessionOrderable>(sessions: readonly T[]): T[] {
  return [...sessions].sort(compareNinaSessions)
}

/**
 * **"His most recent session" — and this is NOT `orderNinaSessions(...)[0]`.**
 *
 * The display list puts pinned sessions on top, so if he pins a conversation from March, the top of
 * the list is March. A proactive message posted there (assumption A3) would land in a conversation
 * he stopped having, and `/nina` with no `?s=` (assumption A4) would open it. So "most recent" means
 * most recent by activity, with pins irrelevant — one linear pass over `compareNinaSessionActivity`.
 *
 * `null` means he has no sessions at all, which is a real state: a brand-new account, and the state
 * `removeNinaSession` leaves behind when he removes his last one.
 */
export function mostRecentNinaSession<T extends NinaSessionOrderable>(
  sessions: readonly T[],
): T | null {
  let best: T | null = null
  for (const session of sessions) {
    if (best === null || compareNinaSessionActivity(session, best) < 0) best = session
  }
  return best
}

/**
 * What the list shows for a session, given the stored title.
 *
 * Trimmed, and whitespace-only counts as absent: a title made of spaces would render as a blank row
 * with no way to tell it from a rendering bug. The writers in `lib/nina/queries.ts` refuse an empty
 * title, so this is the second of two guards rather than the only one — deliberately, because the
 * titler in phase 4 is a model and a model's empty string must not be able to blank a row.
 */
export function sessionTitleFor(session: { title: string | null }): string {
  const trimmed = session.title?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : SESSION_UNTITLED_TITLE
}
