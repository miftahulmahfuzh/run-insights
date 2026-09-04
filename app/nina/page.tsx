import { ChatScreen } from '@/components/nina/ChatScreen'
import { NinaAvatar } from '@/components/nina/NinaAvatar'
import type { ChatMessage } from '@/components/nina/types'
import { AppShell } from '@/components/ui/AppShell'
import { requireUserId } from '@/lib/auth/requireUserId'
import { jakartaDayOf, todayInJakarta } from '@/lib/date/ranges'
import { listRunAttachments } from '@/lib/db/queries'
import { isValidId } from '@/lib/id'
import { ATTACH_PARAM, indexAttachments, type RunAttachment } from '@/lib/nina/attach'
import { getNinaMessageImagesForMessages, listNinaMessages } from '@/lib/nina/queries'

/**
 * `/nina` — F33's conversational surface, and the fifth tab (R9).
 *
 * ── ONE READ, NO MODEL CALL ───────────────────────────────────────────────────────────────────
 * This page awaits `requireUserId()` and two indexed queries — the conversation and, since phase
 * 6, the photos hanging off it — and nothing else. A turn is a 13-16 s
 * `glm-5.3` call (fifteen measured, 10.2-16.4 s), so awaiting one here would trade a complete
 * screen for a blank one — invariant 4, the same boundary that keeps `getOrCreateInsight` out of
 * `/r/[id]`'s render path and is enforced by the same CI grep. The conversation is stored rows;
 * the model is reached only from `ChatScreen`'s send handler, after this has painted.
 *
 * ── WHY THE HEADER IS NOT `ScreenHeader` ──────────────────────────────────────────────────────
 * `ScreenHeader`'s contract is "a name on the left, at most one plain-text link on the right", and
 * a conversation's identity is a face. So this screen builds its own row: her avatar at 44px, her
 * name at the same `text-[26px] font-bold tracking-[-0.02em]` every other screen title uses, and
 * one quiet line under it. The type is identical; only the avatar is new, which is the smallest
 * possible departure. Phase 13 turns the avatar into a link to `/nina/about`; nothing else here
 * moves.
 *
 * ── WHY THERE ARE NO PER-MESSAGE TIMESTAMPS ───────────────────────────────────────────────────
 * Day dividers only. Three reasons, in order of weight. `lib/format.ts` has no time-of-day
 * formatter for an instant (`formatClock` narrows a Postgres `time`, `formatClockSec` a seconds
 * offset) and inventing one would put a rendered string outside the file that owns every rendered
 * string (invariant 3, R-23). Formatting an instant in a client component is the classic hydration
 * mismatch, because the server's timezone is UTC and the phone's is not. And the reading-app stance
 * is explicit that "if you're deciding between adding something and leaving it out, leave it out" —
 * a clock on every line of a conversation you had five minutes ago is the thing to leave out.
 * `dayISO` is therefore computed here, on the server, by the one function in the codebase that
 * converts an instant into a calendar day.
 *
 * ── WHY THE ROWS ARE MAPPED RATHER THAN PASSED ────────────────────────────────────────────────
 * `ChatMessage` is a view model, not a row. The mapping below is the only code in the phase that
 * knows a column name, which is what lets phase 1 spell `role` as a `pgEnum`, a `text` with a
 * check, or a `varchar` without touching a component. `row.role === 'nina' ? 'nina' : 'user'`
 * narrows structurally on purpose.
 */

/**
 * How much conversation the screen renders. Deliberately unrelated to RU-14's 40-message *prompt*
 * window: what Nina is given to read and what the runner can scroll back through are two different
 * questions, and conflating them would either starve the screen or bloat the payload.
 */
const CHAT_HISTORY_LIMIT = 200

/**
 * **For the Server Action, not for this render.** This page is one indexed read and is done in
 * milliseconds; `ChatScreen` then calls `sendNinaMessage` from a client event handler, and a
 * Server Action's timeout is the *page segment's*, not the action file's. `app/r/[id]/page.tsx:65`
 * already states this quoting Next's `maxDuration` reference — "If using Server Actions, set the
 * `maxDuration` at the page level to change the default timeout of all Server Actions used on the
 * page" — and `app/trends/page.tsx` and `app/r/[id]/page.tsx` both carry the line for exactly this
 * reason.
 *
 * Without it, `sendNinaMessage`'s 45 s budget is fiction: the platform default kills the action
 * mid-call and the runner gets R-17's "unavailable" for a model that was answering correctly. Worse
 * than the failure is how it reads — an intermittent bug rather than a timeout, which is the same
 * trap F31 walked into once already.
 *
 * A LITERAL `60`, for the reason `app/api/extract/route.ts` spells out at length: segment config
 * exports are statically analysed at build time and an imported constant is not a value the
 * analyser can see.
 */
export const maxDuration = 60

export default async function NinaPage({ searchParams }: PageProps<'/nina'>) {
  const userId = await requireUserId()
  const { [ATTACH_PARAM]: attachParam } = await searchParams
  const rows = await listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT })

  /*
   * The photos, in one query rather than a join. `getNinaMessageImagesForMessages` reads
   * `nina_message_images_message_idx` and comes back ordered by `(message_id, sort_order)`, so
   * grouping is a single pass and the order inside a bubble is the order he picked them in.
   *
   * `description` is deliberately dropped on the floor here. It is `glm-4.6v`'s private text; the
   * only consumer is Nina's prompt, and nothing in `components/` may read it.
   */
  const images = await getNinaMessageImagesForMessages(
    userId,
    rows.map((row) => row.id),
  )
  const urlsByMessage = new Map<string, string[]>()
  for (const image of images) {
    const list = urlsByMessage.get(image.messageId)
    if (list == null) urlsByMessage.set(image.messageId, [image.blobUrl])
    else list.push(image.blobUrl)
  }

  /*
   * F33 R13/R14. Two things need run rows: the cards inside bubbles that already have a `run_id`,
   * and the run `/r/[id]` just handed over on `?attach=`. Both are the same shape, so they are ONE
   * query — `listRunAttachments` takes the union of the ids and the two lookups below read out of
   * the same Map. Never `getRunDetail` per message: that is four statements a card has no use for.
   */
  const requested = typeof attachParam === 'string' && isValidId(attachParam) ? attachParam : null
  const attachedIds = new Set<string>()
  for (const row of rows) if (row.runId != null) attachedIds.add(row.runId)
  if (requested !== null) attachedIds.add(requested)

  const runRows = await listRunAttachments(userId, [...attachedIds])
  const attachments = indexAttachments(runRows)

  /*
   * The pending run must be REVIEWED, for the reason `/r/[id]`'s icon is only rendered for a
   * reviewed run: Nina's facts come from the reviewed history (D16), so pinning a draft would
   * promise an answer she cannot give. Unreachable through the UI and enforced anyway, because a
   * URL is not a UI. `listRunAttachments` is owner-scoped, so someone else's run id resolves to
   * nothing here and the composer simply opens empty.
   */
  const pendingRow = requested === null ? null : runRows.find((row) => row.id === requested)
  const pending: RunAttachment | null =
    pendingRow != null && pendingRow.reviewedAt != null
      ? (attachments.get(pendingRow.id) ?? null)
      : null

  const initial: ChatMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role === 'nina' ? 'nina' : 'user',
    body: row.body,
    dayISO: jakartaDayOf(row.createdAt),
    state: 'sent',
    /*
     * R12. `NinaMessageRow` has carried this since phase 1; it is the POINTER and not a resolved
     * quote, because whether it renders as one depends on whether the target is among these rows —
     * `MessageList`'s question. A target further back than `CHAT_HISTORY_LIMIT` renders as a plain
     * message, which is the documented degradation: the alternative is a second query per quoted
     * row for a target the runner cannot scroll to anyway.
     */
    replyToId: row.replyToId,
    imageUrls: urlsByMessage.get(row.id),
    /* R13. Resolved for EVERY row regardless of who wrote it, so phase 10's `run_committed`
     * proactive message — which writes the same column — gets its card for free. */
    attachment: row.runId == null ? null : (attachments.get(row.runId) ?? null),
  }))

  return (
    <AppShell bottomGap="chat">
      <header className="mb-5 flex items-center gap-3">
        <NinaAvatar size="md" />
        <div className="min-w-0">
          <h1 className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">Nina</h1>
          <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
            Reads every run. Says what she thinks.
          </p>
        </div>
      </header>

      <ChatScreen initial={initial} todayISO={todayInJakarta()} userId={userId} pending={pending} />
    </AppShell>
  )
}
