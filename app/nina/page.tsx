import { after } from 'next/server'

import { ChatScreen } from '@/components/nina/ChatScreen'
import { NinaSidebar } from '@/components/nina/NinaSidebar'
import { NinaUnreadSync } from '@/components/nina/NinaUnreadSync'
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
import { getPendingNinaChatTurn } from '@/lib/nina/chatturn'
import { SESSION_PARAM, chooseActiveSession, parseNinaSessionParam } from '@/lib/nina/active'
import { listOpenNinaImageJobs } from '@/lib/nina/imagejobs'
import { reviveNinaImageJobs } from '@/lib/nina/imagerun'
import { sessionTitleFor } from '@/lib/nina/sessions'
import { ninaFlightView } from '@/lib/nina/turnflight'
import { flashBlinkCount } from '@/lib/nina/reply'
import { NINA_CHAT_HREF, sessionDayLabel, type SidebarSession } from '@/lib/nina/sidebar'
import {
  getCurrentNinaAvatar,
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  listNinaMessages,
  listNinaSessions,
  markNinaMessagesRead,
  type NinaMessageRow,
} from '@/lib/nina/queries'
import { hasUnreadFromNina } from '@/lib/nina/unread'

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
 * ── WHY THERE IS NO HEADER AT ALL (R7) ────────────────────────────────────────────────────────
 * Until phase 5 this screen built its own header row — her face at 44px, her name at the same
 * `text-[26px] font-bold tracking-[-0.02em]` every other screen title uses, one quiet line under
 * it — because `ScreenHeader`'s contract is "a name on the left, at most one plain-text link on
 * the right" and a conversation's identity is a face, not a title and a link.
 *
 * **That argument was right and it is why the row is now gone.** What changed is where an identity
 * belongs. On a phone the conversation IS the screen (R1 took the tab bar off it for the same
 * reason), and 96px of reading surface spent restating which of five tabs you are on is the most
 * expensive caption in the app. R7 moves the identity to where it is a DESTINATION instead of a
 * label: `components/nina/NinaSidebar.tsx`, at the top of the list of her conversations, where the
 * circle is also still the door to `/nina/about` that phase 13 made it. Same avatar, same 44px,
 * same `<Link>`, same `ninaAvatarView` source — the markup moved and nothing about it changed.
 *
 * So `/nina` still declines `ScreenHeader`, now for a stronger reason than before: it has no
 * header. `getCurrentNinaAvatar` is still read here, because the sidebar is rendered from this
 * Server Component and a client component cannot await her face.
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
 * **For the Server Action AND for the generation it starts, not for this render.** This page is a
 * handful of indexed reads and is done in milliseconds; `ChatScreen` then calls `sendNinaMessage`
 * from a client event handler, and a Server Action's timeout is the *page segment's*, not the
 * action file's. `app/r/[id]/page.tsx:65` already states this quoting Next's `maxDuration`
 * reference — "If using Server Actions, set the `maxDuration` at the page level to change the
 * default timeout of all Server Actions used on the page".
 *
 * Without it, `sendNinaMessage`'s budget is fiction: the platform default kills the action mid-call
 * and the runner gets R-17's "unavailable" for a model that was answering correctly.
 *
 * ── WHY IT IS 300 AND NOT 60 ──────────────────────────────────────────────────────────────────
 * Everything Nina does off the response path runs in `after()`, and the Next 16 `after` reference
 * is explicit that "`after` will run for the platform's default or configured max duration of your
 * route". So THIS NUMBER is the wall clock that owns a photograph. At 60 it could not own one: the
 * shipping generation is 78.2 s measured, which is why the work used to be exiled to a GitHub
 * Actions runner reached through a `workflow_dispatch` doorbell.
 *
 * Vercel Hobby + Fluid compute gives 300 s by default and as a maximum (`/docs/fluid-compute`,
 * `/docs/functions/configuring-functions/duration`, both `last_updated: 2026-08-24`; fluid on by
 * default for projects created after 2025-04-23, and this one was created 2026-08-20). **Measured
 * on this deployment before it was relied on** — see the phase plan's probe. 45 s of turn plus a
 * 200 s generation budget is 245 s inside it.
 *
 * Fluid bills active CPU rather than wall clock, so a function that spends 150 s awaiting
 * OpenRouter costs about what a function that returns in 150 ms costs. Raising the ceiling buys
 * headroom, not a bill.
 *
 * A LITERAL `300`, for the reason `app/api/extract/route.ts` spells out at length: segment config
 * exports are statically analysed at build time and an imported constant is not a value the
 * analyser can see. `NINA_HOST_MAX_DURATION_MS` in `lib/nina/imagerecipe.ts` is the same number
 * for the arithmetic; these two must be changed together.
 */
export const maxDuration = 300

export default async function NinaPage({ searchParams }: PageProps<'/nina'>) {
  const userId = await requireUserId()
  const {
    [ATTACH_PARAM]: attachParam,
    [PHOTO_PARAM]: photoParam,
    [SESSION_PARAM]: sessionParam,
  } = await searchParams
  /* Parsed BEFORE the reads, because which table to read is what the grammar decides. Pure, so it
   * costs nothing and cannot fail; `null` means "no photo on this link" and every branch below
   * short-circuits on it. */
  const photoPointer = parseNinaPhotoParam(photoParam)

  /*
   * ── F35 R2's ROUTING DECISION, AND WHY IT IS ITS OWN READ ────────────────────────────────────
   * `?s=<id>` names the open conversation (assumption A4), and `listNinaMessages` cannot run until
   * it is known — so this one indexed read sits on the critical path ahead of the `Promise.all`
   * below rather than inside it. That extra round trip is the price of A4 and it is worth paying:
   * `listNinaMessages` is owner-scoped, so passing a forged `?s=` straight through would come back
   * `[]` and paint an EMPTY conversation with a dead id still in the address bar. One index scan on
   * `(user_id, …)` buys the difference between that and "your newest chat". Invariant 4 is
   * untouched — still no model call, still nothing unindexed.
   *
   * A MISS DEGRADES SILENTLY, exactly as `?attach=` and `?photo=` do: a forged id, another runner's
   * id and an id he deleted on his other phone all resolve to his most recently active session.
   * `chooseActiveSession` carries the argument, including why it ignores `pinnedAt`.
   *
   * `null` IS A REAL ANSWER — he has no sessions at all. Reachable two ways: a runner who has never
   * messaged, and R11's runner who just removed his last one. The screen renders `ChatScreen`'s
   * existing empty state, and a send from it carries `sessionId: null`, which the ACTION
   * resolves-or-creates. Creating one here would be a database write in a render path, which the
   * `after()` below exists to avoid.
   *
   * Phase 5 renders this same list in the sidebar, ordered by phase 1's pinned-first rule; this page
   * reads it only to answer "which one". Two questions, one query.
   */
  const sessions = await listNinaSessions(userId)
  const activeSessionId = chooseActiveSession(sessions, parseNinaSessionParam(sessionParam))

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
   * Invariant 4 holds, and it holds for a longer reason than it used to. SIX reads now, all
   * indexed; on the rare stale path a handful of UPDATEs; and `reviveNinaImageJobs`, which
   * SCHEDULES a generation and awaits nothing. No model call is awaited in a render path. The
   * generation itself no longer runs on a GitHub runner: it runs on THIS invocation, inside
   * `after()`, which is why `maxDuration` above is 300 and why the runner may close the tab the
   * moment this page paints (R7). `.github/workflows/nina-image.yml` is the backstop behind it.
   */
  const [rows, , avatarRow, photoRow, , pendingTurn] = await Promise.all([
    /*
     * F35 R2. ONE session's messages. `Promise.resolve` on the empty branch rather than a
     * conditional `await` after the block, on the `?photo=` branch's precedent below: keeping it
     * inside the `Promise.all` means the empty case costs nothing and the ordinary case still
     * overlaps the other three reads.
     */
    activeSessionId === null
      ? Promise.resolve<NinaMessageRow[]>([])
      : listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT, sessionId: activeSessionId }),
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
    /*
     * **R7's second net, and the reason `maxDuration` above is 300.** `listOpenNinaImageJobs`
     * above sweeps a 20-minute-old job into an apology — that is the DEADLINE. This is the
     * RESCUE, and it runs alongside: a job whose invocation was killed at `maxDuration`, or whose
     * dispatch was lost back when there was a dispatch, is RE-FIRED here on a fresh 300 s
     * invocation inside `after()`. Arriving on this page is therefore not only R22's last
     * guarantee, it is the pipeline's self-repair.
     *
     * It schedules and returns; it awaits no model and writes no row, so plan invariant 4 holds —
     * the generation itself is in `after()`, which the Next reference documents as running "after
     * the response (or prerender) is finished". The runner may close the tab the moment this page
     * paints and the photograph still arrives.
     *
     * Bounded to `NINA_IMAGE_REVIVE_BUDGET` (one) per render. Its result is deliberately unused:
     * the count is a log line, and what the screen shows is `listOpenNinaImageJobs`' business.
     */
    reviveNinaImageJobs(userId),
    /*
     * **The claim read (offline-reply set, R2 — analysis gap G1).** The session's pending
     * `nina_turns` row: the SAME indexed read `pollNinaReply` makes as the third leg of its own
     * `Promise.all` (`lib/nina/actions.ts:2016`), so the cold load answers "is she thinking" from
     * the same truth the open tab polls. `null` when there is no active session, on the
     * `?photo=` branch's `Promise.resolve(null)` idiom right above — a runner with no conversation
     * pays nothing at all.
     *
     * `ninaFlightView` below applies the freshness, because `getPendingNinaChatTurn` deliberately
     * returns an EXPIRED pending row too (its docstring says so). The fresh claim is the disjunct
     * the message window could never be: the window expires at `NINA_TURN_STALE_MS` while a turn
     * — a chained burst especially — honestly runs to `NINA_BACKGROUND_BUDGET_MS`, so a runner
     * who reopened at t ∈ (90 s, 240 s) got a quiet screen, no poll, and a reply that landed
     * unobserved. With the claim, the cold load and the poll share one definition of
     * "unanswered", which `lib/nina/turnflight.test.ts` asserts (plan invariant 5).
     *
     * ── SEAM FOR PHASE 2 — THE ORDERING IS ALREADY PINNED ────────────────────────────────────────
     * Phase 2's chat-turn revive must speak BEFORE this read: it sweeps stale claims and may open
     * a fresh one, and a read that raced it could compute "not awaiting" for a turn it just
     * re-fired — G1 re-created by the fix for G3. RESOLVED IN RECONCILIATION, one way, no fork:
     * phase 2 inserts `await reviveNinaChatTurn(...)` ABOVE the `Promise.all` below, and THIS read
     * STAYS its sixth element, exactly where it is. That is the whole fix — the `Promise.all` is
     * awaited after the revive, so this read already observes what revive did, and nothing in
     * phase 1's layout moves. (The read is kept in this ONE named element (`pendingTurn`) with
     * this ONE consumption site — the `ninaFlightView` call below — so the guarantee is checkable
     * by eye.)
     *
     * READ-ONLY, like everything else in this render: an expired claim is passed through as-is
     * and `ninaFlightView` declines to trust it. Sweeping it is a write, and this page stays
     * "indexed reads + `after()`" — the write belongs to phase 2's revive (and
     * `sweepStaleNinaChatTurns`'s own docstring already rules the page out as its caller).
     */
    activeSessionId === null
      ? Promise.resolve(null)
      : getPendingNinaChatTurn(userId, activeSessionId),
  ])
  const avatar = ninaAvatarView(avatarRow)

  /* The landing flash's blink count, from the owner's Vercel tuning knob
   * (`NINA_FLASH_BLINKS`; `flashBlinkCount` survives it being unset or malformed). Read per
   * render — the page is dynamic — so a dashboard retune lands with the next deployment. Pure
   * and env-only: no query, no model, nothing to keep warm. */
  const flashBlinks = flashBlinkCount(process.env.NINA_FLASH_BLINKS)

  /* One reading of the clock for this render, shared by the conversation's day dividers and the
   * sidebar's row labels. Hoisted out of `<ChatScreen>`'s prop so the same instant answers both —
   * two calls could straddle midnight in Jakarta and name the same day two ways. */
  const todayISO = todayInJakarta()

  /*
   * **F36 R6 + offline-reply R2. Is a turn already in flight for the conversation this render is
   * painting?**
   *
   * Two disjuncts, and `ninaFlightView` owns both, spelled exactly the way `pollNinaReply` spells
   * its own answer (`lib/nina/actions.ts:2052`): a FRESH live claim for this session —
   * `pendingTurn` above, whose expiry the flight view applies because `getPendingNinaChatTurn`
   * hands back expired rows too — OR the message window (the newest row is his and younger than
   * `NINA_TURN_STALE_MS`, which covers the half-second hand-off gap between two chained turns
   * where no claim is open). One definition of "unanswered" for the cold load and the poll, and
   * the suite asserts the agreement. One honest silence too: with no fresh claim AND an old
   * message there is nothing in flight, so the screen opens quiet — the dead turn is phase 2's
   * revive, not this render's business.
   *
   * `cursor` rides along because the screen needs somewhere to resume from, and the newest row's
   * `seq` is exactly that. Invariant 4 is untouched: one extra indexed read inside the
   * `Promise.all` above, arithmetic over rows already in hand, no model call anywhere near the
   * render.
   *
   * `Date.now()` stays in ARGUMENT position on purpose: `react-hooks/purity` lets a Server
   * Component's one-shot render read the clock there and would flag a binding —
   * `app/nina/jobs/page.tsx` quotes this exact call as its own precedent.
   */
  const flight = ninaFlightView(rows, Date.now(), pendingTurn?.createdAt ?? null)

  /*
   * The sidebar's rows — F35 R6/R4/R11, phase 5.
   *
   * **Every cross-phase dependency in this phase is concentrated here, on purpose.** The three
   * client components below take a plain view model and import nothing from phase 1: the ordering
   * came out of `listNinaSessions`, the title fallback is `sessionTitleFor`, the day string is
   * `lib/format.ts` on the server (invariant 4), and `?s=`'s spelling comes from phase 3's
   * `SESSION_PARAM` rather than a literal. So a rename anywhere upstream is fixed in this block and
   * nowhere else.
   *
   * `map` and not `sort`: R4 (pinned first) and R5 (most recent runner message descending) were
   * decided by `orderNinaSessions`, and `planSessionList` asserts in its own suite that nothing
   * downstream re-orders them.
   */
  const sidebarSessions: SidebarSession[] = sessions.map((row) => ({
    id: row.id,
    title: sessionTitleFor(row),
    href: `${NINA_CHAT_HREF}?${SESSION_PARAM}=${row.id}`,
    /* Phase 1 stores `pinnedAt: Date | null` (its D4 — an instant, so pins can be ordered among
     * themselves). The sidebar only ever asks "is it pinned", so the boolean is derived here, once,
     * on the server. */
    pinned: row.pinnedAt !== null,
    dayLabel: sessionDayLabel(
      row.lastUserMessageAt == null ? null : jakartaDayOf(row.lastUserMessageAt),
      todayISO,
    ),
  }))

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
  const photosByMessage = new Map<string, { urls: string[]; ids: string[]; kinds: string[] }>()
  for (const image of images) {
    /*
     * `message_id` is nullable since R1 (a deleted session orphans its photographs instead of
     * destroying them), but this list came out of
     * `getNinaMessageImagesForMessages(userId, rows.map(...))`, whose WHERE is
     * `message_id IN (…)` — so every row here matched one of those ids and cannot be an orphan.
     * The guard is for the type system, not for a case that happens: it is what keeps the Map
     * keyed by `string` instead of widening the bubble grouping to accept a photograph that
     * belongs to no bubble.
     */
    if (image.messageId === null) continue
    const group = photosByMessage.get(image.messageId)
    if (group == null) {
      photosByMessage.set(image.messageId, {
        urls: [image.blobUrl],
        ids: [image.id],
        kinds: [image.kind],
      })
    } else {
      group.urls.push(image.blobUrl)
      group.ids.push(image.id)
      group.kinds.push(image.kind)
    }
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
    imageUrls: photosByMessage.get(row.id)?.urls,
    /* F35 R10. `id` so the overlay's attach control can reuse `attachExisting: { kind: 'image',
     * id }` rather than re-uploading a blob we already own; `kind` so `photoSideOf` can tell his
     * photograph from hers, which `row.role` cannot for a re-attached selfie.
     *
     * The private prose is STILL dropped on the floor here and must stay dropped (invariant 5) —
     * `imageColumns` selects it, and this mapping is the boundary that stops it. */
    imageIds: photosByMessage.get(row.id)?.ids,
    imageKinds: photosByMessage.get(row.id)?.kinds,
    /* R13. Resolved for EVERY row regardless of who wrote it, so phase 10's `run_committed`
     * proactive message — which writes the same column — gets its card for free. */
    attachment: row.runId == null ? null : (attachments.get(row.runId) ?? null),
  }))

  /*
   * F33 phase 10 — the unread dot's other half, now session-scoped (R2) and no longer stale (R9).
   *
   * IN `after()` AND NOT INLINE, for the two reasons phase 10 gave and this phase does not
   * re-litigate: a render must not have a side effect (Next may render a segment more than once,
   * and PPR renders it before a request even exists), and marking read BEFORE the response is sent
   * would clear the dot for a page load that failed on the way to the browser. `after` needs no
   * request API here — `userId` and the session were resolved at the top of this component and are
   * closed over — and `markNinaMessagesRead` is one indexed UPDATE, so invariant 4 still holds.
   *
   * SESSION-SCOPED, because opening this conversation says nothing about another one. Marking
   * every session read on any visit would clear a dot raised by messages he has not seen, which is
   * the one direction of error that loses information. The dot's own COUNT stays global
   * (`countUnreadNinaMessages`, unchanged, still reading the partial index
   * `nina_messages_user_unread_idx`): "there is something of hers you have not read" is true
   * wherever it sits. Assumption A3 then makes R9 fall out — proactive messages land in the most
   * recent session, which is the one this page opens by default (A4), so opening the chat is what
   * clears them. The `null` guard is phase 3's rule kept: a runner with no session at all (never
   * messaged, or just removed his last one) is a real state, and a render path must not create one.
   *
   * `hadUnread` IS WHAT MAKES THE DOT GO AWAY WITHOUT A NAVIGATION. This render is delivering rows
   * that `after()` is about to mark read, so the badge in this very payload is already wrong.
   * `NinaUnreadSync` reads the flag and asks for exactly one fresh render — see its docstring for
   * why a `revalidatePath` from here cannot work in Next 16.3.1, and `lib/nina/unread.ts` for why
   * the sequence terminates. It costs nothing when there was nothing unread, which is most visits:
   * `read_at` is already on every row (`messageColumns`), so the flag is a pass over an array, not
   * a query.
   */
  const hadUnread = hasUnreadFromNina(rows)
  if (activeSessionId !== null) {
    after(() => markNinaMessagesRead(userId, { sessionId: activeSessionId }))
  }

  return (
    <AppShell screen="chat">
      {/* R9. Renders nothing. It exists so the tab bar's dot agrees with what he just read: this
          payload was built before `after()` marked the session read, so on a visit that cleared
          something the screen asks for one fresh render. See `components/nina/NinaUnreadSync.tsx`.
          Deliberately OUTSIDE `ChatScreen`, which owns the conversation and is phases 3/7/9's file;
          this is chrome bookkeeping and has no business inside the message list. */}
      <NinaUnreadSync hadUnread={hadUnread} />

      {/*
        R7: no header row. The face, the name and the quiet line all moved into `NinaSidebar`; see
        the block at the top of this file for why that is the same argument and not a reversal.

        `NinaSidebarProvider` IS NOT HERE, and that is the fix for a bug this page shipped with.
        It lives in `components/ui/AppShell.tsx`, wrapping the whole shell when `screen === 'chat'`.
        The reason: the `>` trigger lives inside phase 2's `ChatChrome`, which is rendered by
        `AppShell` as a sibling of `<main>` — NOT by `ChatScreen`, as this comment used to claim.
        A provider here wraps only `{children}`, so the trigger was a consumer mounted outside its
        own provider, `useNinaSidebar()` returned `null`, and it rendered nothing: the chat list
        was reachable only by typing `?sidebar=1` by hand. Do not re-add a provider here — two of
        them would give the trigger and the panel one `pushedRef` each, which is the same bug with
        a subtler symptom. See the block in `AppShell` for the full account.

        The panel is LAST in the tree. It is `fixed inset-0`, so paint order does not depend on it,
        but the linear reading order does: the conversation is this screen's content and a list of
        other conversations is not.
      */}
      <>
        {/*
        ── `key` IS LOAD-BEARING (F35 PHASE 3, D8). DO NOT REMOVE IT. ───────────────────────────
        `ChatScreen` holds the conversation in `useState` and reconciles a changed `initial` prop
        DURING RENDER through `mergeServerMessages`, which is "server order + local content" and
        deliberately keeps optimistic rows the server has not seen yet. Navigating from `?s=A` to
        `?s=B` is the same route with different search params, so without a key React reconciles the
        SAME component instance and merges session B's server rows into session A's local state:
        leftover bubbles from the previous chat, plus a draft quote and an armed attachment pointing
        at messages in a conversation he has left.

        A different conversation is a different screen, so remounting and discarding every piece of
        local state is not a workaround — it is the correct semantics. `'none'` covers the
        no-sessions case so the key is never `undefined`.
      */}
        {/*
          R1. `avatar` is destructured field by field, NOT spread — `ninaAvatarView`'s
          `description` is `glm-4.6v`'s private prose (invariant 5) and must not cross into a
          client component. Identical care to the `<NinaSidebar>` call below, and identical
          VALUE: both circles render the row `getCurrentNinaAvatar` returned, so the 28 px face
          beside the typing dots and the 44 px face in the sidebar cannot disagree about which
          photo is current or where it is cropped.
        */}
        <ChatScreen
          key={activeSessionId ?? 'none'}
          initial={initial}
          todayISO={todayISO}
          userId={userId}
          sessionId={activeSessionId}
          pending={pending}
          pendingPhoto={pendingPhoto}
          flight={flight}
          avatar={{ src: avatar.src, natural: avatar.natural, crop: avatar.crop }}
          flashBlinks={flashBlinks}
        />

        {/*
          `avatar` is destructured field by field rather than spread, so `ninaAvatarView`'s
          `description` — `glm-4.6v`'s private prose, invariant 5 — cannot travel into a client
          component by accident. The same care `pendingPhoto` takes above.
        */}
        <NinaSidebar
          avatar={{ src: avatar.src, natural: avatar.natural, crop: avatar.crop }}
          sessions={sidebarSessions}
          activeSessionId={activeSessionId}
        />
      </>
    </AppShell>
  )
}
