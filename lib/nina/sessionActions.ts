'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

import { SESSION_PARAM, mostRecentSessionId, sanitizeNinaSessionTitle } from './active'
import {
  createNinaSession,
  listNinaMessages,
  listNinaSessions,
  removeNinaSession,
  renameNinaSession,
  setNinaSessionPinned,
} from './queries'

/**
 * **The session lifecycle: create (R2), rename (R3's manual half), pin (R4), remove (R11).**
 *
 * ── WHY A SEPARATE FILE FROM `lib/nina/actions.ts` ────────────────────────────────────────────
 * The same isolation argument `lib/nina/albumActions.ts` makes in its own header, and it is
 * stronger here: `actions.ts` is edited by phases 3, 4 and (through `SentBubble`) 7, while these
 * four functions are read by phase 5 and nothing else. Keeping them apart means phase 5's sidebar
 * imports a file no other phase is holding open.
 *
 * ── WHY EVERY ACTION RETURNS A RESULT AND NAVIGATES NOTHING ───────────────────────────────────
 * Next 16.3.1 permits `redirect()` inside a Server Action — it performs a client-side navigation,
 * pushing a history entry by default. This file does not use it, for two reasons. The repo has no
 * precedent: all ten of its action modules return a result object and call `revalidatePath`, and
 * the caller navigates (`lib/push/actions.ts`, `app/actions/share.ts`, and the admin memory-editor
 * actions — named without its path here on purpose, because `tests/admin.memory.test.ts` greps this
 * directory for that string to prove the admin store stays unreachable from `lib/nina`).
 * And the caller here belongs to ANOTHER PHASE — phase 5 owns the sidebar and the destructive
 * control's confirmation, so a redirect buried in this file would take a decision away from it and
 * default to a pushed entry pointing at a session that no longer exists.
 *
 * `next` is therefore the seam: a URL when the caller MUST move, `null` for "stay exactly where you
 * are, the revalidate has already refreshed the list".
 *
 * ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────────────────────────
 * **It does not confirm anything.** `removeNinaChatSession` deletes a conversation and, through two
 * cascades, its photographs' rows — permanently, with no archive flag and no undo (assumption A8).
 * There is no confirm dialog anywhere in this codebase today, so the confirmation is the only thing
 * standing between a mis-tap and a lost conversation, and it is PHASE 5's, on the control that calls
 * this. If phase 5 ships the control without one, that is the bug — not this file.
 *
 * **It makes no model call**, so it has no entry in `scripts/check-llm-payload-boundary.mjs` and
 * phase 4 remains that file's only editor (invariant 2). R3's titler is a model call and lives in
 * phase 4's `lib/nina/title.ts`; `renameNinaChatSession` below is the manual path only.
 *
 * ── OWNERSHIP IS PROVED IN SQL, ONCE ──────────────────────────────────────────────────────────
 * Invariant 3. Every `queries.ts` function below takes `userId` first and puts it in the `WHERE`, so
 * a foreign session id comes back `false` and there is no separate `getNinaSession` pre-check to go
 * stale beside it. A session id from a client is a claim; a row that came back from an owner-scoped
 * write is a fact.
 */

export interface NinaSessionActionResult {
  ok: boolean
  /**
   * Where the caller should navigate, or `null` for "stay put".
   *
   * Only `removeNinaChatSession` ever returns non-null, and only when it deleted the session the
   * screen was reading. `revalidatePath('/nina')` has already re-rendered the list, so a rename or a
   * pin needs no navigation at all.
   */
  next: string | null
}

export interface NinaSessionCreateResult {
  ok: boolean
  sessionId: string | null
  next: string | null
}

/**
 * **"New chat" (R2).** Creates the session EAGERLY and hands back the URL that opens it.
 *
 * ── WHY EAGER AND NOT LAZY ────────────────────────────────────────────────────────────────────
 * A lazy session has no id, so the URL cannot name it — and then the first send has to guess which
 * conversation it belongs to. The only answer available to a send with no id is "the most recent
 * session", which is the OLD one: he taps "new chat" to focus on a new topic and his first message
 * lands in the topic he was trying to leave. That is R2 failing at its one sentence. Eager also
 * keeps the write in a write path: `app/nina/page.tsx` may not create a session during render,
 * because *"Next may render a segment more than once, and PPR renders it before a request even
 * exists"* — its own words about why `markNinaMessagesRead` sits in `after()`.
 *
 * ── THE COST OF EAGER, AND THE ONE MITIGATION WORTH HAVING ────────────────────────────────────
 * An empty session shows in the list. So: if his newest session has no messages at all, that IS the
 * new chat and this returns it instead of creating a second one. Tapping "new chat" three times in a
 * row therefore yields one empty session rather than three. One `limit: 1` indexed read buys that.
 *
 * It is deliberately not more clever than that. Create a session, chat in an older one, then create
 * again and you get one empty row — and one empty row, in a list he can delete from (R11), is not
 * worth a second mechanism.
 *
 * No `revalidatePath` on the reuse branch: nothing was written, so there is nothing to invalidate.
 */
export async function createNinaChatSession(): Promise<NinaSessionCreateResult> {
  const userId = await requireUserId()

  const sessions = await listNinaSessions(userId)
  const newestId = mostRecentSessionId(sessions)
  if (newestId !== null) {
    const anyMessage = await listNinaMessages(userId, { limit: 1, sessionId: newestId })
    if (anyMessage.length === 0) {
      return { ok: true, sessionId: newestId, next: `/nina?${SESSION_PARAM}=${newestId}` }
    }
  }

  /* No title argument: phase 1's `createNinaSession` returns `title: null`, and `sessionTitleFor` is
   * the one sanctioned way to render that state. A title from a model call here would be a model
   * call in a mutation the runner is waiting on, and phase 4's titler runs in `after()` after the
   * first real exchange instead. */
  const created = await createNinaSession(userId)
  revalidatePath('/nina')
  return { ok: true, sessionId: created.id, next: `/nina?${SESSION_PARAM}=${created.id}` }
}

/**
 * **A manual rename (R3's second half).**
 *
 * The sanitising is `sanitizeNinaSessionTitle`'s, in `lib/nina/active.ts`, where it is pure and
 * unit-tested (invariant 7) and where phase 4 can replace its body with the rule from
 * `lib/nina/title.ts` without touching this call site. A blank rename is refused rather than
 * written: a session with no name is a blank row in the sidebar, which is worse than the placeholder
 * it replaced, and "clear the title" is not a capability anyone asked for.
 *
 * **This action does not touch `title_source`.** Phase 4 owns the field and the rule it exists for —
 * that a manually chosen name is never overwritten by the titler — and phase 1 owns the column,
 * whose `renameNinaSession` already stamps `title_source = 'manual'` in the same statement as the
 * title so the two cannot disagree.
 */
export async function renameNinaChatSession(input: {
  sessionId: string
  title: string
}): Promise<NinaSessionActionResult> {
  const userId = await requireUserId()
  if (!isValidId(input?.sessionId)) return { ok: false, next: null }

  const title = sanitizeNinaSessionTitle(input?.title)
  if (title === null) return { ok: false, next: null }

  const ok = await renameNinaSession(userId, input.sessionId, title)
  if (ok) revalidatePath('/nina')
  return { ok, next: null }
}

/**
 * **Pin or unpin (R4).** One action for both directions rather than two, because the caller is a
 * toggle and it already knows which way it is going — and because two actions would let a
 * double-tap send "pin" twice and read as flaky.
 *
 * The ORDERING that pinning buys is phase 1's pure rule, rendered by phase 5. This action only flips
 * the instant; `revalidatePath('/nina')` is what makes the list reorder, and Next's own note is that
 * revalidation in a Server Function *"updates the UI immediately (if viewing the affected path)"*,
 * which is the whole interaction.
 */
export async function setNinaChatSessionPinned(input: {
  sessionId: string
  pinned: boolean
}): Promise<NinaSessionActionResult> {
  const userId = await requireUserId()
  if (!isValidId(input?.sessionId)) return { ok: false, next: null }

  const ok = await setNinaSessionPinned(userId, input.sessionId, input?.pinned === true)
  if (ok) revalidatePath('/nina')
  return { ok, next: null }
}

/**
 * **Remove a session (R11), and the two edge cases that are the whole difficulty.**
 *
 * A HARD DELETE (assumption A8). `nina_messages.session_id` cascades, and through
 * `nina_message_images.message_id`'s existing cascade the photos' rows go with it. Not an archive
 * flag: the runner's stated reason for the neighbouring requirement is that stale history pollutes
 * Nina's context, and an archived session that still answered `getNinaMessageWindow` would defeat
 * R11 exactly the way it would defeat R8.
 *
 * **What is deliberately NOT cleaned up, stated rather than discovered later.** The Vercel Blob
 * objects behind those image rows stay — nothing dereferences them and the `reap-orphaned-blobs`
 * skill does not cover `nina/` yet (the plan's scope section says so and gives it its own card). And
 * `nina_memory_facts.source_message_id` / `nina_memory_slots.source_message_id` are plain `text`
 * columns with **no** foreign key, so a distilled fact whose source message just vanished keeps a
 * dangling pointer instead of cascading away — which is the right outcome and the same one
 * assumption A5 reaches for a deleted message: a fact may still be true after the sentence that
 * produced it is gone.
 *
 * ── EDGE CASE 1: HE REMOVED THE SESSION HE WAS READING ────────────────────────────────────────
 * `next: '/nina'` — bare, with no `?s=`. The page re-resolves to his newest remaining chat, so he
 * lands somewhere real rather than on an empty screen with a dead id in the URL.
 *
 * ── EDGE CASE 2: HE REMOVED HIS LAST SESSION ──────────────────────────────────────────────────
 * The same `next: '/nina'`, and the same resolution answers it: `chooseActiveSession([], null)` is
 * `null`, the page renders its empty state with a clean URL, and a send from there carries
 * `sessionId: null`, which `resolveNinaWriteSession` turns into a fresh session. The cron survives by
 * calling that same function. The screen and the cron are one mechanism, which is the only reason
 * they cannot disagree.
 *
 * ── AND WHEN IT WAS SOME OTHER SESSION: `next: null` ──────────────────────────────────────────
 * He tidied up a chat he was not reading. `revalidatePath('/nina')` has already re-rendered the
 * list; navigating would yank him out of the conversation he is in, which would be a bug.
 *
 * `activeSessionId` is REQUIRED and nullable for the reason `ChatScreen`'s `pendingPhoto` is
 * (RULING E2b): the caller is one component, and `tsc` should be the thing that notices if it stops
 * passing it. An optional field defaulting to "not the open one" would silently strand him on a
 * deleted session exactly once — the case that matters most.
 */
export async function removeNinaChatSession(input: {
  sessionId: string
  activeSessionId: string | null
}): Promise<NinaSessionActionResult> {
  const userId = await requireUserId()
  if (!isValidId(input?.sessionId)) return { ok: false, next: null }

  const removed = await removeNinaSession(userId, input.sessionId)
  /* Not his, or already gone. Same outcome, no navigation, nothing invalidated — and the caller is
   * told, because a delete control that reports success on a row that is still there is worse than
   * one that reports failure. */
  if (!removed) return { ok: false, next: null }

  revalidatePath('/nina')

  const wasOpen = input.activeSessionId === input.sessionId
  return { ok: true, next: wasOpen ? '/nina' : null }
}
