/**
 * R9's two decisions: whether the render that is happening now is delivering something the runner
 * has not read, and whether the screen should therefore ask the server for one fresh render.
 *
 * ── WHY THERE IS A MODULE HERE AT ALL ─────────────────────────────────────────────────────────
 * Invariant 7. `vitest.config.ts` runs `environment: 'node'` and there is no jsdom in this repo, so
 * a rule that lives inside `NinaUnreadSync` is a rule nothing can assert. The component keeps the
 * `useEffect` and the ref; the *decision* lives here. `lib/nina/chatview.ts` and `lib/nina/reveal.ts`
 * are the shape being copied.
 *
 * ── WHY THE ROW TYPE IS STRUCTURAL ────────────────────────────────────────────────────────────
 * `lib/nina/live.ts`'s `LiveMessage` precedent, and for the same reason: `NinaMessageRow` gained a
 * `sessionId` in phase 1 and may gain an `editedAt` in phase 7, and neither has anything to do
 * with this question. Two fields is the whole dependency.
 *
 * ── WHY THIS IS NOT A QUERY ───────────────────────────────────────────────────────────────────
 * `app/nina/page.tsx` has already read the session's rows, and `messageColumns` already projects
 * `read_at`, so the answer is a pass over an array that is in memory. A second `count(*)` here
 * would be a query added to a render path to learn something the render path already knows — and
 * the schema is emphatic that the unread predicate is the one place in this feature where an extra
 * scan would be felt.
 */

/** The two columns the rule needs. Any `NinaMessageRow` satisfies it. */
export interface ReadableMessage {
  role: 'runner' | 'nina'
  readAt: Date | null
}

/**
 * Was anything of **hers** unread among the rows this render is delivering?
 *
 * `role === 'nina'` because the runner's own messages are never unread to him and the dot's query
 * says the same thing (`role = 'nina' AND read_at IS NULL`). Keeping the two predicates spelled
 * identically is deliberate: this function's whole job is to predict what
 * `countUnreadNinaMessages` will return after `markNinaMessagesRead` has run.
 *
 * The rows are the ACTIVE SESSION's window (phase 3 scopes the read, `CHAT_HISTORY_LIMIT` caps it
 * at 200). Both narrowings are the right ones: mark-read is session-scoped, and unread messages are
 * by construction the newest, so they are inside the window. A conversation with more than 200
 * unread messages of hers in one session would answer `true` anyway — the newest 200 contain them.
 */
export function hasUnreadFromNina(rows: readonly ReadableMessage[]): boolean {
  return rows.some((row) => row.role === 'nina' && row.readAt === null)
}

/** What `NinaUnreadSync` knows when it decides. */
export interface UnreadSyncState {
  /** `hasUnreadFromNina` over the rows of the render currently on screen. */
  hadUnread: boolean
  /**
   * The `hadUnread` value this mount has already reacted to, or `null` before the first reaction.
   * Held in a ref by the component, which is why it is a parameter here and not module state.
   */
  syncedFor: boolean | null
}

/**
 * Should the screen ask the server for one fresh render?
 *
 * Only when this render delivered something unread — the render whose `after()` is marking it read
 * — and only once per value of that flag. That second clause is the whole safety argument:
 *
 *   - a render with nothing unread asks for nothing, so an ordinary visit costs zero extra work;
 *   - a refresh that succeeds flips the flag to `false`, which is not a refreshable state, so the
 *     sequence terminates after exactly one extra render;
 *   - a refresh that raced `after()` and lost leaves the flag `true` — the same value already
 *     reacted to — so it does NOT retry. The dot then clears on the next navigation, which is the
 *     pre-R9 behaviour, and an unterminated refresh loop (the one genuinely bad failure available
 *     here) is unreachable;
 *   - a message that arrives later and is delivered by a service-worker refresh flips the flag
 *     `false` → `true` again, so it is reacted to again. One refresh per arrival, not per tick.
 */
export function shouldRefreshUnreadDot({ hadUnread, syncedFor }: UnreadSyncState): boolean {
  if (!hadUnread) return false
  return syncedFor !== hadUnread
}
