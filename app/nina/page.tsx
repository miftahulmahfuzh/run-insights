import Link from 'next/link'
import { after } from 'next/server'

import { ChatScreen } from '@/components/nina/ChatScreen'
import { NinaAvatar } from '@/components/nina/NinaAvatar'
import type { ChatMessage } from '@/components/nina/types'
import { AppShell } from '@/components/ui/AppShell'
import { requireUserId } from '@/lib/auth/requireUserId'
import { jakartaDayOf, todayInJakarta } from '@/lib/date/ranges'
import { listRunAttachments } from '@/lib/db/queries'
import { isValidId } from '@/lib/id'
import { ninaAvatarView } from '@/lib/nina/album'
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  indexAttachments,
  parseNinaPhotoParam,
  type NinaExistingPhoto,
  type RunAttachment,
} from '@/lib/nina/attach'
import { listOpenNinaImageJobs } from '@/lib/nina/imagejobs'
import {
  getCurrentNinaAvatar,
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  listNinaMessages,
  markNinaMessagesRead,
} from '@/lib/nina/queries'

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
 * possible departure. **Phase 13 kept that promise**: the avatar is now a `<Link>` to
 * `/nina/about` and its source is the album's current row, and nothing else in the header moved.
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
 *
 * ── `?photo=` IS A FOURTH READ, AND IT IS FREE WHEN THE PARAMETER IS ABSENT ───────────────────
 * F34 R2. `/nina?photo=avatar:<id>` is the link `/admin/nina`'s file explorer opens in a new tab,
 * and the whole optimisation the requirement asks for is that the photo is NOT re-uploaded: what
 * crosses is an id, and what this page does with it is one owner-scoped single-row read
 * (`getNinaAvatar` / `getNinaMessageImage`, both primary-key lookups) whose only output is a blob
 * URL. It joins the `Promise.all` below as a fourth element, and when the parameter is absent that
 * element is `Promise.resolve(null)` — so a runner who just opened the chat pays nothing at all.
 * Invariant 4 is untouched: still no model call, still nothing unindexed.
 *
 * A MISS IS NOT AN ERROR PAGE. A forged, foreign or since-deleted id resolves to `null` and the
 * composer simply opens empty — the same degradation `?attach=` takes when a run is not the
 * runner's. The hard refusal lives one layer down in `resolveAttachment`, where the id is about to
 * become a persisted row (invariant 10), and it is right that the two differ: a bad *link* is
 * something anyone can type, a bad *send* is a message about a photo he cannot see.
 *
 * `description` is NOT read out of either row. It is `glm-4.6v`'s private text, Nina's prompt is
 * its only consumer, and `resolveAttachment` copies it server-side at send time without it ever
 * touching a component (invariant 5).
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
  const { [ATTACH_PARAM]: attachParam, [PHOTO_PARAM]: photoParam } = await searchParams
  /* Parsed BEFORE the reads, because which table to read is what the grammar decides. Pure, so it
   * costs nothing and cannot fail; `null` means "no photo on this link" and every branch below
   * short-circuits on it. */
  const photoPointer = parseNinaPhotoParam(photoParam)
  /*
   * Two reads, concurrently — and the second one is here for its SIDE EFFECT.
   * `listOpenNinaImageJobs` sweeps stale image jobs first (phase 12), so ARRIVING ON THIS PAGE IS
   * ITSELF R22's LAST GUARANTEE: a job that GitHub never ran gets its apology written by the act of
   * the runner coming to look for the photo. That is the one mechanism in the phase that still
   * works when Actions is disabled, the PAT is revoked, or the workflow's `schedule:` has been
   * switched off for repository inactivity — none of which the app can detect.
   *
   * The returned rows are deliberately unused here; phase 15 is what renders "generating...". A
   * swept apology is written concurrently with this read, so it appears on the NEXT navigation
   * rather than this one — which is the same one-load lag this screen already accepts for a photo
   * that lands while the tab is open (there is no live-refresh, by design).
   *
   * Invariant 4 holds: two indexed reads and, on the rare stale path, a handful of UPDATEs. No
   * model call is awaited in a render path — the generation itself is on a GitHub runner.
   */
  const [rows, , avatarRow, photoRow] = await Promise.all([
    listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT }),
    listOpenNinaImageJobs(userId),
    /*
     * F33 phase 13 (R17). A THIRD indexed read, not a model call: `getCurrentNinaAvatar` is a
     * single-row lookup on the partial unique index `nina_avatars_user_current_unq`, so it costs
     * about what reading a column off `profiles` costs and invariant 4 is untouched.
     *
     * `null` is a real answer and not a failure — phase 13's D-2 rules that there is no seed row,
     * so "no row" means the committed `public/nina/avatar-001.png`. `ninaAvatarView` is the one
     * function that knows it, and the detail page calls the same one, so the header and the hero
     * cannot disagree about which face is hers.
     */
    getCurrentNinaAvatar(userId),
    /*
     * F34 R2. A FOURTH indexed read, and only when the link asked for one — see the header. Both
     * branches are single-row primary-key lookups scoped to `user_id`, so "not his" and "gone" come
     * back as the same `null` and neither leaks which ids exist.
     *
     * `Promise.resolve(null)` rather than a conditional `await` after the block: keeping it inside
     * the `Promise.all` means the read overlaps the other three instead of adding a round trip to
     * the critical path of a link that was clicked from another tab.
     */
    photoPointer === null
      ? Promise.resolve(null)
      : photoPointer.kind === 'avatar'
        ? getNinaAvatar(userId, photoPointer.id)
        : getNinaMessageImage(userId, photoPointer.id),
  ])
  const avatar = ninaAvatarView(avatarRow)

  /*
   * The one place a row becomes a URL, which is what makes the thumbnail a one-line change later:
   * phase 1's column is `nina_avatars.thumb_url`, surfaced as `NinaAvatarRow.thumbUrl`, so
   * preferring it is `photoRow.thumbUrl ?? photoRow.blobUrl` HERE and nowhere else — on the
   * `'avatar'` branch only, since `NinaImageRow` has no thumbnail. **Not written in this phase**,
   * because `depends_on` is empty and the column does not exist on `main`. It reads `blobUrl` and
   * `kind`/`id` and NOTHING ELSE off the row — in particular not `description` (invariant 5) and
   * not `pathname`, which is Blob's own suffixed spelling and no business of a client's.
   */
  const pendingPhoto: NinaExistingPhoto | null =
    photoPointer === null || photoRow == null
      ? null
      : { kind: photoPointer.kind, id: photoPointer.id, url: photoRow.blobUrl }

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

  /*
   * F33 phase 10 — the unread dot's other half. In `after()` and not inline, for two reasons: a
   * render must not have a side effect (Next may render a segment more than once, and PPR renders
   * it before a request even exists), and marking read BEFORE the response is sent would clear the
   * dot for a page load that failed on the way to the browser. `after` needs no request API here —
   * `userId` was resolved at the top of this component and is closed over — and
   * `markNinaMessagesRead` is one indexed UPDATE, so invariant 4 still holds.
   */
  after(() => markNinaMessagesRead(userId))

  return (
    <AppShell bottomGap="chat">
      <header className="mb-5 flex items-center gap-3">
        {/*
          R17's first tap level: her face is a door. `size-11` is already 44 px — the iOS
          tap-target floor — which phase 4 chose "for when phase 13 makes it a link", so no
          geometry changes here.

          A `<Link>` and not a `<button>`: it is a navigation, so it gets the platform's own
          long-press, middle-click and back behaviour for free, and Next prefetches the route.
        */}
        <Link href="/nina/about" aria-label="Buka detail Nina" className="rounded-pill">
          <NinaAvatar size="md" src={avatar.src} natural={avatar.natural} crop={avatar.crop} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">Nina</h1>
          <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
            Reads every run. Says what she thinks.
          </p>
        </div>
      </header>

      <ChatScreen
        initial={initial}
        todayISO={todayInJakarta()}
        userId={userId}
        pending={pending}
        pendingPhoto={pendingPhoto}
      />
    </AppShell>
  )
}
