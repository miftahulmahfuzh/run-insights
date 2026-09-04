# Phase 10: Proactivity: triggers, cron, unread

> ## ⚠ RECONCILIATION — binding rulings not yet folded into the body of this plan
>
> `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md` is **normative** and outranks anything
> below it. Applied mechanically already: **A4**, the avatar query names
> (`getUnannouncedCurrentNinaAvatar` / `markNinaAvatarAnnounced` — phase 1 owns
> `lib/nina/queries.ts`). Still to apply while implementing:
>
> - **E4 — delete this plan's `DAY_TOKENS` table and its own `parseRunningDays` body** (§"phase 5's
>   slot, parsed") and re-export phase 5's parser instead:
>   `return [...parseRunningDaysAsJsWeekday(value)] as Weekday[]`. Phase 5 owns the vocabulary and
>   supplies both typed views (ISO 1–7 for phase 9, 0–6 here). Two behaviours change for the
>   better: "Senin sampe Jumat" yields five days rather than two, and "tiap hari kecuali senin"
>   *disables* the trigger instead of firing every Monday.
> - **A1 — the DTO boundary.** `lib/nina/queries.ts` speaks `body`/`createdAt`; the columns are
>   `text`/`sent_at`; phase 3's `gateway.ts` is the only translator. Do not "fix" either side.
> - **E3 — accepted:** the `after()` hook stays in `lib/review/actions.ts`, not `commit.ts`.
> - **D2 — you add the fifth sanctioned route handler.** Phase 12's rewrite adds none, so the
>   roadmap count goes four → **five**, not six.
> - **G6 — you own the exit test** that the pattern gateway stops returning stubs.


**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R3 (proactivity is the iron rule; Nina is integrated, not bolted on), R8 (she reacts
to a newly committed run and to what it earned)
**Depends on:** Phase 1, 3, 4, 5, 9
**Difficulty:** HARD
**Package:** `lib/nina` (with edits in `lib/review`, `lib/derived`, `app/api/cron`, `components/ui`)

---

## Goal

Nina speaks first. After this phase a committed run makes her react within seconds of the redirect
— naming the records it took and the badges it earned — without adding a millisecond to the commit
response. A single daily cron at 19:00 Asia/Jakarta evaluates the other four reasons she opens a
conversation (a usual running day with no run yet, a pattern that crossed its line, prolonged
silence, a hand-changed avatar), fires at most one of them per user per invocation, and can be
re-invoked all evening without saying the same thing twice. The Nina tab carries an unread dot.

**The five triggers, and their durable idempotence markers** — the table the rest of this plan
implements:

| # | Kind | Fires from | Marker (durable, survives a cold invocation) |
|---|---|---|---|
| 1 | `run_committed` | `after()` in the commit Server Action | a `nina_messages` row with `source='run_committed'` and `run_id = <this run>` |
| 2 | `missed_usual_day` | cron | `nina_nags` row `trigger:missed_usual_day`, `last_mentioned_on` |
| 3 | `pattern_crossed` | cron | phase 9's own `nina_nags` row for that pattern code, `last_mentioned_on` |
| 4 | `silence` | cron | `nina_nags` row `trigger:silence`, `last_mentioned_on` |
| 5 | `avatar_changed` | cron (incl. phase 14's nudge) | `nina_avatars.announced_at IS NULL` |

**Two decisions this phase makes that other phases asked for, up front:**

1. **Phase 10 owns the fifth trigger, `avatar_changed`.** Phase 14's plan flags it unclaimed; it is
   claimed here. Phase 13 owns *writing* the avatar row (and phase 14's script owns pushing the
   file); phase 10 owns noticing that a current avatar has never been announced and making her
   mention it. RU-17 is therefore delivered whole: the script writes the row and nudges the cron,
   the cron emits the message. See Step 4 and the Interface Contract's `announced_at` requirement.
2. **Live arrival inside an open `/nina` is NOT in this phase.** Phase 4 flagged that `ChatScreen`
   never `router.refresh()`es. A message written by cron or by `after()` appears on the next load,
   and the unread dot on the tab is this phase's answer to "how do I know". Making it live properly
   needs a signal, and the only honest signal in this plan set is phase 11's service worker
   `push` event `postMessage`-ing its clients — phase 11's file, phase 11's call. The exact recipe
   is written out under **Handoffs** so phase 11 does not have to rediscover it. Polling `/nina` on
   a timer is explicitly rejected: it burns a serverless invocation per tick to learn nothing on
   almost every tick.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing.

**Renames:** nothing.

**Creates — `lib/nina/proactive.ts`** (the phase's centre; the pure half is above the
`import 'server-only'` boundary in the *file order*, but the whole module is server-only):

- types `ProactiveTriggerKind` (re-exported from phase 2, not redeclared), `Weekday`,
  `TriggerMarker`, `ProactiveFacts`, `ProactiveDecision`, `ProactiveDetail`,
  `RunCommittedDetail`, `PatternCrossedDetail`, `MissedUsualDayDetail`, `SilenceDetail`,
  `AvatarChangedDetail`, `EmitResult`, `ProactiveNotifier`, `ProactiveDeps`
- pure functions `parseRunningDays`, `jakartaHourOf`, `jakartaWeekdayOf`, `markerFor`,
  `evaluateAvatarChanged`, `evaluatePatternCrossed`, `evaluateMissedUsualDay`, `evaluateSilence`,
  `decideProactive`, `triggerBlock`
- constants `PROACTIVE_PRIORITY`, `RUNNING_DAYS_SLOT_KEY = 'running_days'`,
  `MISSED_DAY_EVENING_HOUR = 18`, `MISSED_DAY_LATEST_HOUR = 23`,
  `SILENCE_NO_RUN_DAYS = 5`, `SILENCE_NO_CHAT_DAYS = 4`, `SILENCE_COOLDOWN_DAYS = 3`,
  `TRIGGER_MARKER_PREFIX = 'trigger:'`, `MISSED_DAY_MARKER_CODE`, `SILENCE_MARKER_CODE`,
  `JAKARTA_UTC_OFFSET_HOURS = 7`, `NOOP_NOTIFIER`
- impure functions `loadProactiveFacts`, `emitProactiveMessage`, `emitRunCommitted`,
  `evaluateAndEmitForUser`

**Creates — `app/api/cron/nina/route.ts`:** `GET`, `runtime = 'nodejs'`, `maxDuration = 60`.
**Creates — `components/nina/NinaUnreadBadge.tsx`:** `NinaUnreadBadge` (async Server Component).
**Creates — `tests/nina.proactive.test.ts`**, **`tests/nina.cron.test.ts`**.

**Signature changes:**

- `lib/derived/invalidate.ts` — `InvalidateOutcome` gains one field:
  `recordsMovedToThisRun: readonly RecordKey[]`. Additive; both `return` statements in
  `onRunCommitted` are updated. **No existing caller reads it, so no call site changes.**
- `lib/review/commit.ts` — `CommitOutcome`'s success arm gains two fields:
  `{ ok: true; runId: string; newlyEarned: BadgeKey[]; recordsMoved: RecordKey[]; isNewRun: boolean }`.
  Additive.
- `components/ui/TabBar.tsx` — `TabBar()` -> `TabBar({ ninaBadge }: { ninaBadge?: React.ReactNode })`,
  and module-local `Tab` gains `badge?: React.ReactNode`. **Both optional**, so `app/trends/loading.tsx`
  and `app/(app)/loading.tsx` compile untouched.
- `components/ui/AppShell.tsx` — `AppShell({ children, className, bottomGap })` (phase 4's shape)
  gains nothing in its props; its *body* renders `<TabBar ninaBadge={…} />`.

**Requires (from earlier phases).** Nine items. Each is named so the reconciler can push it into
the owning phase's plan rather than leaving it for implementation to discover:

1. **Phase 1 — `nina_messages.source`**, `text NOT NULL DEFAULT 'chat'`, domain exactly
   `'chat' | 'run_committed' | 'missed_usual_day' | 'pattern_crossed' | 'silence' | 'avatar_changed'`
   — i.e. `'chat'` plus every member of phase 2's `ProactiveTriggerKind`. Phase 1 exports the type
   `NinaMessageSource` from `lib/nina/queries.ts` (it is a column domain, so it lives with the
   schema, not with the prompts — and putting it there keeps `turn.ts` from having to import a
   type out of `proactive.ts`, which would be a cycle). A test asserts the union equals
   `'chat' | ProactiveTriggerKind`.
2. **Phase 1 — `nina_messages.read_at`**, `timestamptz NULL`. The unread count is
   `role = 'nina' AND read_at IS NULL`. Per-message rather than a single `last_read_at` marker
   because RU-5's multi-bubble turn writes four rows and "three of these four are new" is a
   question a watermark cannot answer after an edit reorders anything.
3. **Phase 1 — an index** on `(user_id, read_at)` filtered `WHERE read_at IS NULL`, or plainly
   `(user_id, role, read_at)`. The unread count runs on **every page render of every tabbed
   screen** (Step 8); it must be an index-only count, not a scan of the conversation.
4. **Phase 1 — `nina_nags`** carries `user_id`, `code` (text), `level` (int), `last_mentioned_on`
   (date), with `PRIMARY KEY (user_id, code)` or an equivalent unique index, and
   `lib/nina/queries.ts` exports `listNinaNags(userId): Promise<TriggerMarker[]>` and
   `upsertNinaNag(userId, code, { level, lastMentionedOn }): Promise<void>`. **This phase writes
   only codes prefixed `trigger:`;** phase 9's pattern codes are written through phase 9's own API
   (item 7) so escalation stays in one place.
5. **Phase 1 — `nina_avatars.announced_at`**, `timestamptz NULL`, alongside `is_current`. A row
   inserted by phase 12, phase 13 or phase 14's script leaves it `NULL`; that NULL *is* the pending
   `avatar_changed` trigger. `lib/nina/queries.ts` exports
   `getUnannouncedCurrentNinaAvatar(userId): Promise<{ id: string } | null>` and
   `markNinaAvatarAnnounced(userId, avatarId): Promise<void>`.
6. **Phase 3 — `lib/nina/turn.ts` exports a proactive entry point.** This is the single largest
   adaptation point in the phase and the exact shape it needs is:

   ```ts
   export interface NinaTurnOptions {
     /** Already built by `loadNinaContext`; the caller owns loading it. */
     context: NinaContext
     /** Appended verbatim to the system prompt, after everything phase 2 assembles. */
     extraInstruction?: string
     /** Written to `nina_messages.source` on every row this turn persists. */
     source: NinaMessageSource
     /** Written to `nina_messages.run_id` on every row this turn persists. */
     runId?: string | null
     /** No runner message precedes a proactive turn; the loop must not require one. */
     runnerMessageId?: string | null
   }

   export interface NinaTurnResult {
     ok: boolean
     bubbles: Array<{ id: string; body: string }>
     unavailable: boolean
   }

   export function runNinaTurn(userId: string, options: NinaTurnOptions): Promise<NinaTurnResult>
   ```

   Phase 4's `sendNinaMessage` is the chat-side wrapper of the same function with
   `source: 'chat'`. **Two behavioural requirements:** a proactive turn must tolerate a
   conversation whose last message is Nina's own (she is allowed to speak twice in a row), and it
   must persist its rows with the `source` and `runId` it was handed — the `run_committed` marker
   in the table above depends on that write.
7. **Phase 9 — `lib/nina/nags.ts` exports the read and the write:**
   `loadNagStates(userId): Promise<NagState[]>` and
   `recordNagMention(userId, code, onISO): Promise<{ level: number }>`, where the returned `level`
   is the rung *after* this mention. This phase calls `recordNagMention` exactly once, immediately
   after a `pattern_crossed` message is persisted — **never before**, so a model failure does not
   burn a rung. If phase 9 ships only the computation, fall back to item 4's `upsertNinaNag` with
   the pattern's own code and `level + 1`, and note it as a follow-up.
8. **Phase 9 — `lib/nina/patterns.ts` exports** `computeFiredPatterns(userId): Promise<FiredPattern[]>`
   (or whatever phase 9's loader is called), returning phase 2's `FiredPattern[]` shape with raw
   unrounded `value` and a `unit` from `PatternUnit`. If phase 2's `loadNinaContext` already
   attaches them to `NinaContext.patterns`, **this phase reads them off the context and calls
   nothing extra** — see Step 3's note.
9. **Phase 5 — the `running_days` memory slot.** A `nina_memory_slots` row whose `key` is
   `'running_days'` and whose `value` is display-ready text naming the days he usually runs
   (`"Selasa, Kamis, Sabtu"` or `"Tue, Thu, Sat"`). Phase 10 parses it tolerantly in both languages
   (Step 2's `parseRunningDays`) and treats an unparseable or absent slot as "no usual days", which
   disables trigger 2 rather than guessing.

**Leaves alone (owned by others):**

- **Web Push delivery (Phase 11).** This phase produces the message rows and the unread state and
  calls a notifier seam that defaults to a no-op. It sends nothing.
- **Pattern computation and the escalation ladder (Phase 9).** Read, and one write through phase
  9's own API. No threshold is defined here and no code is coined here.
- **The slots (Phase 5).** `running_days` is read, never written.
- **`components/nina/ChatScreen.tsx`, `MessageList.tsx`, `Composer.tsx` (Phase 4).** Untouched.
  `app/nina/page.tsx` gains exactly two lines (Step 9).
- **`lib/nina/turn.ts`, `tools.ts`, `actions.ts` (Phase 3).** Consumed, not edited.
- **`lib/records/*`, `lib/badges/*`.** Nothing recomputed. The whole point of Step 5 is that
  `onRunCommitted` already knows what the run earned and this phase threads it through.
- **`app/api/cron/rollup/route.ts`.** Read as the template; not edited. Nina gets her own route
  because her budget, her cadence and her failure policy are hers.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/proactive.ts` | create | the whole engine: five evaluators, the priority resolver, the emitter |
| `tests/nina.proactive.test.ts` | create | one test per evaluator at and past its line, plus the idempotence pair |
| `app/api/cron/nina/route.ts` | create | triggers 2–5, on the rollup cron's shape |
| `tests/nina.cron.test.ts` | create | soft deadline, per-user isolation, auth guard |
| `vercel.json` | modify | second cron entry, `"0 12 * * *"` (`vercel.json:4–9`) |
| `lib/derived/invalidate.ts` | modify | `InvalidateOutcome` gains `recordsMovedToThisRun` (`:65–67`, `:217`, `:226`) |
| `lib/review/commit.ts` | modify | `CommitOutcome` gains `recordsMoved` + `isNewRun` (`:72–73`, `:129`, `:204–223`) |
| `lib/review/actions.ts` | modify | the `after()` hook, above the `redirect()` (`:36–47`) |
| `app/x/[extractionId]/page.tsx` | modify | `export const maxDuration = 60` — the action's timeout is this segment's |
| `app/r/[id]/edit/page.tsx` | modify | `export const maxDuration = 60`, same reason |
| `lib/nina/queries.ts` | modify | four reads/writes phase 1 may not have shipped (Step 1) |
| `components/ui/TabBar.tsx` | modify | `ninaBadge` prop; `Tab` gains `badge` and a positioned dot (`:36`, `:79–103`) |
| `components/nina/NinaUnreadBadge.tsx` | create | the async Server Component that counts and draws the dot |
| `components/ui/AppShell.tsx` | modify | renders the badge into `TabBar`, inside `<Suspense>` (`AppShell.tsx:41`) |
| `app/nina/page.tsx` | modify | `after(() => markNinaMessagesRead(userId))` (phase 4's file, two lines) |

Fifteen files against the index's "~9" — the extra six are the two one-line `maxDuration` exports,
the two-line `app/nina/page.tsx` edit, and the three-file badge seam. None of them is new logic.

---

## Timezone arithmetic — shown explicitly, because it is the easiest thing here to get wrong

**The facts.** Vercel cron `schedule` strings are **UTC**, always, regardless of `regions`. The
deployment region is `sin1`, which is irrelevant to cron scheduling and irrelevant to date
arithmetic — the app's calendar day is **Asia/Jakarta = UTC+7, with no DST, ever, and no historical
transition inside any date this app will see**. `lib/date/ranges.ts:155`'s `todayInJakarta(now)` is
the only sanctioned answer to "what day is it".

**Choosing the schedule.** Trigger 2 is the time-of-day-sensitive one: "a usual running day with no
run landed **by evening**". Target 19:00 WIB.

```
19:00 WIB − 7 h = 12:00 UTC          ->  schedule "0 12 * * *"
```

**The rollover check, which is the part that bites.** At 12:00 UTC the Jakarta wall clock reads
12 + 7 = **19:00 on the same UTC date**. 19 < 24, so `todayInJakarta(now)` at cron time returns the
UTC date unchanged, and "today" in the trigger means the day the runner is living in. Contrast the
existing rollup at `"0 20 * * *"`: 20 + 7 = **27**, i.e. 03:00 WIB on the **next** UTC date — which
is why that job's `todayInJakarta()` call is load-bearing there and why copying its schedule would
have been wrong here. The two jobs are 8 hours apart on the clock and never overlap.

**Vercel's Hobby-plan slop is inside the tolerance on purpose.** Hobby crons are triggered within
the hour of the scheduled time and are capped at one invocation per day per job, with at most two
jobs — which is exactly `rollup` + `nina`, and exactly why a second Nina cron (a morning one, say)
is not proposed. A 19:00 target may therefore fire anywhere in 19:00–20:00 WIB, so
`MISSED_DAY_EVENING_HOUR` is **18**, not 19: the guard has to admit the whole window rather than
demand an exact hour. `MISSED_DAY_LATEST_HOUR = 23` closes the other side, so a manual invocation
at 02:00 WIB does not ask about a day that has barely started.

**Weekday, without a second timezone library.** `jakartaWeekdayOf(dateISO)` parses the *already
Jakarta-local* `YYYY-MM-DD` at UTC midnight and reads `getUTCDay()`. Because the string is already
the Jakarta calendar date, no offset is applied twice — the same trick `isoWeekKeyOf` uses at
`ranges.ts:104`. **The bug to avoid is `new Date(dateISO).getDay()`**, which applies the *server's*
local zone (UTC on Vercel) to a date-only string and lands on the wrong day for anyone west of
Greenwich.

**Hour, without a second timezone library.** `jakartaHourOf(instant)` is
`(instant.getUTCHours() + 7) % 24`. Correct for all time because UTC+7 is fixed. Phase 2 owns
`JAKARTA_TIME_ZONE` and computes a `partOfDay`; **if phase 2's `NowFacts` already exposes a numeric
Jakarta hour, the reconciler should delete `jakartaHourOf` and read that field instead** — one
call site, and one fewer place that knows the offset.

---

## Implementation Steps

### Step 1: `lib/nina/queries.ts` — the six reads and three writes this phase needs

**File:** `lib/nina/queries.ts` (phase 1's file; append at the end)
**Change:** Phase 1 owns this module and its "Requires" items 1–5 above ask for most of these. If
phase 1 shipped them, **delete this step** — it is written out in full so that implementation is
never blocked on a name that did not land. Appending exported functions to the end of a file
another phase created is a merge-append, not a conflict.

**Code:**

```ts
/* ── Phase 10: proactivity ─────────────────────────────────────────────────────────────────────
 * Unread state, the nag ledger's raw rows, and the avatar announcement flag. Every one is keyed by
 * `userId` (invariant 7) and every one is a single indexed statement — `countUnreadNinaMessages`
 * in particular runs on every render of every tabbed screen, so it counts through
 * `(user_id, role, read_at)` and never touches a message body.
 */

/** The tab's dot. `role = 'nina'` because the runner's own messages are never unread to him. */
export async function countUnreadNinaMessages(userId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(ninaMessages)
    .where(
      and(
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

/**
 * Called from `/nina`'s `after()` (Step 9), never during render. Unconditional on purpose: an
 * UPDATE that matches nothing is cheaper than the SELECT that would tell us it would.
 */
export async function markNinaMessagesRead(userId: string, at: Date = new Date()): Promise<void> {
  await db
    .update(ninaMessages)
    .set({ readAt: at })
    .where(
      and(
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.role, 'nina'),
        isNull(ninaMessages.readAt),
      ),
    )
}

/**
 * Trigger 1's idempotence marker, read as a question rather than a count: has a message with this
 * source ever been written *for this run*? A `LIMIT 1` existence check, because the answer is
 * boolean and the row may be one of four.
 */
export async function hasProactiveMessageForRun(userId: string, runId: string): Promise<boolean> {
  const rows = await db
    .select({ id: ninaMessages.id })
    .from(ninaMessages)
    .where(
      and(
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.runId, runId),
        eq(ninaMessages.source, 'run_committed'),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/** Every nag row, raw. Phase 9 interprets pattern codes; phase 10 reads its own `trigger:*` ones. */
export async function listNinaNags(
  userId: string,
): Promise<Array<{ code: string; level: number; lastMentionedOn: DateISO | null }>> {
  const rows = await db
    .select({
      code: ninaNags.code,
      level: ninaNags.level,
      lastMentionedOn: ninaNags.lastMentionedOn,
    })
    .from(ninaNags)
    .where(eq(ninaNags.userId, userId))
    .orderBy(asc(ninaNags.code))
  return rows
}

/**
 * The one write that makes a trigger fire once. `ON CONFLICT` on `(user_id, code)` so that two
 * invocations racing on the same evening produce one row and one mention date, not two rows.
 */
export async function upsertNinaNag(
  userId: string,
  code: string,
  patch: { level: number; lastMentionedOn: DateISO },
): Promise<void> {
  await db
    .insert(ninaNags)
    .values({
      userId,
      code,
      level: patch.level,
      lastMentionedOn: patch.lastMentionedOn,
    })
    .onConflictDoUpdate({
      target: [ninaNags.userId, ninaNags.code],
      set: { level: patch.level, lastMentionedOn: patch.lastMentionedOn },
    })
}

/** Trigger 5's marker: a current avatar nobody has mentioned yet. */
export async function getUnannouncedCurrentNinaAvatar(
  userId: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: ninaAvatars.id })
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, true),
        isNull(ninaAvatars.announcedAt),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

export async function markNinaAvatarAnnounced(
  userId: string,
  avatarId: string,
  at: Date = new Date(),
): Promise<void> {
  await db
    .update(ninaAvatars)
    .set({ announcedAt: at })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, avatarId)))
}

/** The last day a reviewed run occurred on. `null` for a runner with no runs at all. */
export async function getLastRunDate(userId: string): Promise<DateISO | null> {
  const rows = await db
    .select({ occurredOn: runs.occurredOn })
    .from(runs)
    .where(and(eq(runs.userId, userId), isNotNull(runs.reviewedAt)))
    .orderBy(desc(runs.occurredOn))
    .limit(1)
  return rows[0]?.occurredOn ?? null
}

/** Invariant 9: `reviewed_at IS NOT NULL` gates this the way it gates every aggregate. */
export async function hasRunOn(userId: string, dateISO: DateISO): Promise<boolean> {
  const rows = await db
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        eq(runs.occurredOn, dateISO),
        isNotNull(runs.reviewedAt),
      ),
    )
    .limit(1)
  return rows.length > 0
}
```

**Impact:** Nine additive exports. `count`, `isNull`, `isNotNull`, `desc`, `asc`, `and`, `eq` all
come from `drizzle-orm` and are already imported by `lib/db/queries.ts`; add whichever
`lib/nina/queries.ts` does not yet import. No existing behaviour changes.

---

### Step 2: `lib/nina/proactive.ts` — the pure half

**File:** `lib/nina/proactive.ts` (new, lines 1–~330)
**Change:** The whole decision layer, as pure functions over a plain facts object. Invariant 6 in
spirit: everything worth testing is a pure function, and the impure half (Step 3) does nothing but
load the facts, call `decideProactive`, and write.

**Code:**

```ts
import 'server-only'

import { addDays, daysBetween, type DateISO } from '@/lib/date/ranges'
import type { ProactiveTriggerKind } from '@/lib/nina/prompts'

export type { ProactiveTriggerKind }

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * PROACTIVITY — R3's iron rule, made mechanical
 *
 * Five reasons Nina opens a conversation (RU-15's four plus RU-17's avatar). Phase 2 owns the words
 * (`PROACTIVE_INSTRUCTIONS`); this module owns WHEN, ONCE, and WHICH ONE.
 *
 * ── THE THING THAT MATTERS MOST HERE IS IDEMPOTENCE ─────────────────────────────────────────────
 * Firing "jadi ga lari selasa ini?" twice on one Tuesday is the exact failure that makes her feel
 * like a cron job instead of a friend, and it is the failure a naive in-memory guard cannot
 * prevent: a serverless invocation has no memory of the previous one. Every trigger therefore has a
 * DURABLE marker, and the marker is checked against the Jakarta calendar day rather than against a
 * clock interval:
 *
 *   run_committed     a `nina_messages` row with source='run_committed' and run_id = that run
 *   missed_usual_day  nina_nags['trigger:missed_usual_day'].last_mentioned_on = today
 *   pattern_crossed   phase 9's own nag row for that code (so escalation lives in ONE ledger)
 *   silence           nina_nags['trigger:silence'].last_mentioned_on, plus a 3-day cooldown
 *   avatar_changed    nina_avatars.announced_at IS NULL means "not said yet"
 *
 * No new table. `nina_nags` is phase 1's, phase 9 fills it with pattern codes, and this module
 * reserves the `trigger:` prefix for the two schedule-driven nags that are not patterns. The
 * namespace split is the reconciliation: a `trigger:*` code can never collide with a pattern code
 * because phase 9's codes name conditions (`late_starts`, `high_hr`), not schedules.
 *
 * ── AT MOST ONE PROACTIVE MESSAGE PER USER PER EVALUATION ────────────────────────────────────────
 * `decideProactive` resolves the five candidates by `PROACTIVE_PRIORITY` and returns ONE. Two
 * openers in one evening is not twice as proactive, it is spam — and it is also twice the model
 * cost for a personal app on a Hobby plan. Ordering: the avatar first because it is the one the
 * runner just caused and is waiting on; then the pattern, because tough love that arrives late is
 * worthless; then the missed day, which is time-boxed to this evening; then silence, which by
 * definition is not urgent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════ */

/** Sunday = 0, matching `Date#getUTCDay()`, so no mapping table is needed anywhere. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const JAKARTA_UTC_OFFSET_HOURS = 7

export const PROACTIVE_PRIORITY: readonly ProactiveTriggerKind[] = [
  'avatar_changed',
  'pattern_crossed',
  'missed_usual_day',
  'silence',
  /* `run_committed` is never a cron candidate — it fires from `after()` at the moment of the
   * commit, so it is listed for completeness of the union and never reached by `decideProactive`. */
  'run_committed',
]

export const RUNNING_DAYS_SLOT_KEY = 'running_days'

/**
 * The window in which "by evening, and there is still no run" is a fair thing to ask. The cron is
 * scheduled for 19:00 WIB but Vercel's Hobby plan triggers within the hour, so the floor is 18 and
 * not 19 — see the timezone section of this plan. The ceiling stops a manual 02:00 invocation
 * asking about a day that has barely begun.
 */
export const MISSED_DAY_EVENING_HOUR = 18
export const MISSED_DAY_LATEST_HOUR = 23

/** Silence, in the two units it comes in. Either alone is enough; neither is a hair trigger. */
export const SILENCE_NO_RUN_DAYS = 5
export const SILENCE_NO_CHAT_DAYS = 4
export const SILENCE_COOLDOWN_DAYS = 3

export const TRIGGER_MARKER_PREFIX = 'trigger:'
export const MISSED_DAY_MARKER_CODE = `${TRIGGER_MARKER_PREFIX}missed_usual_day`
export const SILENCE_MARKER_CODE = `${TRIGGER_MARKER_PREFIX}silence`

/** A `nina_nags` row, read structurally so phase 9's richer `NagState` assigns to it. */
export interface TriggerMarker {
  code: string
  level: number
  lastMentionedOn: DateISO | null
}

/**
 * A pattern phase 9 says has fired, read structurally: only these four fields are used here, so
 * phase 2's `FiredPattern` and phase 9's own row shape both assign without an import.
 * `value` is raw and unrounded (phase 2 formats it); this module never formats it either.
 */
export interface ProactivePattern {
  code: string
  value: number
  unit: string
  nagLevel: number
}

export interface ProactiveFacts {
  /** Jakarta calendar day, from `todayInJakarta()`. Never the server's local day. */
  todayISO: DateISO
  /** 0–23, Jakarta wall clock. */
  jakartaHour: number
  /** Parsed from phase 5's `running_days` slot. Empty disables trigger 2 rather than guessing. */
  runningDays: readonly Weekday[]
  hasRunToday: boolean
  lastRunOn: DateISO | null
  /** `null` when he has never sent a message — a fresh account is not a silent one. */
  daysSinceRunnerSpoke: number | null
  patterns: readonly ProactivePattern[]
  nags: readonly TriggerMarker[]
  unannouncedAvatarId: string | null
}

export interface RunCommittedDetail {
  kind: 'run_committed'
  runId: string
  occurredOn: DateISO
  /** From `onRunCommitted`'s own answer. NOTHING is recomputed to produce these. */
  recordKeys: readonly string[]
  badgeKeys: readonly string[]
}

export interface MissedUsualDayDetail {
  kind: 'missed_usual_day'
  todayISO: DateISO
  weekday: Weekday
}

export interface PatternCrossedDetail {
  kind: 'pattern_crossed'
  code: string
  value: number
  unit: string
  nagLevel: number
}

export interface SilenceDetail {
  kind: 'silence'
  daysSinceLastRun: number | null
  daysSinceRunnerSpoke: number | null
}

export interface AvatarChangedDetail {
  kind: 'avatar_changed'
  avatarId: string
}

export type ProactiveDetail =
  | RunCommittedDetail
  | MissedUsualDayDetail
  | PatternCrossedDetail
  | SilenceDetail
  | AvatarChangedDetail

export type ProactiveDecision =
  | { fire: false; reason: string }
  | { fire: true; detail: ProactiveDetail }

const NO = (reason: string): ProactiveDecision => ({ fire: false, reason })

/* ── time, in the one timezone this app has ──────────────────────────────────────────────────── */

/**
 * The Jakarta hour of an instant. Plain arithmetic rather than `Intl` because UTC+7 is fixed for
 * all time: Asia/Jakarta has no DST and no transition inside any date this app can see. The date
 * side still goes through `jakartaDayOf` (`lib/date/ranges.ts`), which is where the timezone
 * decision is spent exactly once — this is the hour, which that function does not expose.
 */
export function jakartaHourOf(instant: Date): number {
  return (instant.getUTCHours() + JAKARTA_UTC_OFFSET_HOURS) % 24
}

/**
 * The weekday of a Jakarta calendar day. The argument is ALREADY a Jakarta date string, so it is
 * parsed at UTC midnight and read with `getUTCDay()` — no offset is applied twice.
 *
 * **The bug this exists to prevent** is `new Date(dateISO).getDay()`, which applies the server's
 * local zone (UTC on Vercel) to a date-only string and returns the previous day for anyone west of
 * Greenwich. `isoWeekKeyOf` avoids it the same way.
 */
export function jakartaWeekdayOf(dateISO: DateISO): Weekday {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay() as Weekday
}

/* ── phase 5's slot, parsed ──────────────────────────────────────────────────────────────────── */

/**
 * Every token that names a day, in both of the languages this app speaks. Exact-token matching,
 * never prefixes: `sun`/`senin` and `min`/`mon` are one letter apart and prefix matching gets them
 * wrong in a way no test would notice until a Tuesday nag arrived on a Sunday.
 */
const DAY_TOKENS: Readonly<Record<string, Weekday>> = {
  // Sunday
  minggu: 0, min: 0, ahad: 0, sunday: 0, sun: 0,
  // Monday
  senin: 1, sen: 1, monday: 1, mon: 1,
  // Tuesday
  selasa: 2, sel: 2, tuesday: 2, tue: 2, tues: 2,
  // Wednesday
  rabu: 3, rab: 3, wednesday: 3, wed: 3,
  // Thursday
  kamis: 4, kam: 4, thursday: 4, thu: 4, thur: 4, thurs: 4,
  // Friday
  jumat: 5, jumaat: 5, jum: 5, friday: 5, fri: 5,
  // Saturday
  sabtu: 6, sab: 6, saturday: 6, sat: 6,
}

/**
 * Phase 5's `running_days` slot value is display-ready text (RU-6: slots are text, already spelled
 * the way a screen would spell them) — `"Selasa, Kamis, Sabtu"` or `"Tue, Thu, Sat"` or
 * `"tuesdays and thursdays"`. This turns it into weekday numbers.
 *
 * **Unrecognised input yields `[]`, which disables trigger 2.** That is the whole policy: a nag
 * built on a guess about which days he runs is worse than no nag, because it is a friend
 * confidently misremembering. Returned sorted and deduplicated so the result is stable.
 */
export function parseRunningDays(value: string | null | undefined): Weekday[] {
  if (!value) return []
  const found = new Set<Weekday>()
  for (const raw of value.toLowerCase().split(/[^a-z']+/)) {
    const token = raw.replace(/'/g, '')
    if (!token) continue
    const day = DAY_TOKENS[token]
    if (day !== undefined) found.add(day)
  }
  return [...found].sort((a, b) => a - b)
}

/* ── the five evaluators ─────────────────────────────────────────────────────────────────────── */

/** RU-17. The marker is the NULL itself, so there is nothing to compare against a date. */
export function evaluateAvatarChanged(facts: ProactiveFacts): ProactiveDecision {
  if (!facts.unannouncedAvatarId) return NO('no unannounced avatar')
  return { fire: true, detail: { kind: 'avatar_changed', avatarId: facts.unannouncedAvatarId } }
}

/**
 * R11's tough love, delivered. The pattern with the HIGHEST `nagLevel` wins when several fired —
 * the one she has already raised twice is the one that needs raising a third time, not the novel
 * one. Ties break on `code` so the choice is deterministic and the test can assert it.
 *
 * Idempotence is phase 9's ledger, read here and written by phase 9's `recordNagMention` after the
 * message lands: a pattern already mentioned TODAY is not mentioned again today.
 */
export function evaluatePatternCrossed(facts: ProactiveFacts): ProactiveDecision {
  const byCode = new Map(facts.nags.map((nag) => [nag.code, nag]))
  const candidates = facts.patterns
    .filter((pattern) => byCode.get(pattern.code)?.lastMentionedOn !== facts.todayISO)
    .sort((a, b) => b.nagLevel - a.nagLevel || a.code.localeCompare(b.code))

  const pattern = candidates[0]
  if (!pattern) return NO('no pattern crossed, or every crossed pattern was raised today')
  return {
    fire: true,
    detail: {
      kind: 'pattern_crossed',
      code: pattern.code,
      value: pattern.value,
      unit: pattern.unit,
      nagLevel: pattern.nagLevel,
    },
  }
}

/**
 * "Today is one of his usual days and there is still no run on it." Four guards, and every one of
 * them has a failure it prevents:
 *
 *   no usual days      -> she would be inventing a schedule he never told her about
 *   not a usual day    -> she would be nagging about a rest day
 *   a run already      -> she would be asking a question the database has already answered
 *   too early / late   -> "the day is not over" is phase 2's own instruction; honour it
 *
 * The fifth guard is the marker, and it is the one this phase exists to get right.
 */
export function evaluateMissedUsualDay(facts: ProactiveFacts): ProactiveDecision {
  if (facts.runningDays.length === 0) return NO('no running_days slot')

  const weekday = jakartaWeekdayOf(facts.todayISO)
  if (!facts.runningDays.includes(weekday)) return NO('today is not a usual running day')
  if (facts.hasRunToday) return NO('he already ran today')
  if (facts.jakartaHour < MISSED_DAY_EVENING_HOUR) return NO('too early in the day to ask')
  if (facts.jakartaHour > MISSED_DAY_LATEST_HOUR) return NO('past the window')

  const marker = facts.nags.find((nag) => nag.code === MISSED_DAY_MARKER_CODE)
  if (marker?.lastMentionedOn === facts.todayISO) return NO('already asked today')

  return { fire: true, detail: { kind: 'missed_usual_day', todayISO: facts.todayISO, weekday } }
}

/**
 * Prolonged silence, in the two units it actually comes in: no run for `SILENCE_NO_RUN_DAYS`, or
 * nothing said to her for `SILENCE_NO_CHAT_DAYS`. Either alone fires.
 *
 * **"The app unopened for N days" is deliberately read as "he has not spoken to Nina for N days".**
 * There is no last-seen column on `users` or `profiles` and this phase does not add one — a column
 * whose only consumer is one nag threshold is not worth a migration in a phase that already needs
 * five. `daysSinceRunnerSpoke` comes from phase 2's `ConversationFacts` and is the honest proxy: a
 * runner who opens the app daily and never types is a runner she has nothing to react to anyway.
 * If a real last-seen is ever wanted it is a `profiles.last_seen_on` touched by `AppShell`, and it
 * is a separate card (see Handoffs).
 *
 * `null` on either count means "never" and does NOT fire: a brand-new account is not a silent one.
 * The cooldown is against the marker so this cannot become a daily "you have been quiet" drip.
 */
export function evaluateSilence(facts: ProactiveFacts): ProactiveDecision {
  const daysSinceLastRun =
    facts.lastRunOn === null ? null : daysBetween(facts.lastRunOn, facts.todayISO)

  const quietOnRuns = daysSinceLastRun !== null && daysSinceLastRun >= SILENCE_NO_RUN_DAYS
  const quietInChat =
    facts.daysSinceRunnerSpoke !== null && facts.daysSinceRunnerSpoke >= SILENCE_NO_CHAT_DAYS
  if (!quietOnRuns && !quietInChat) return NO('not quiet enough on either count')

  const marker = facts.nags.find((nag) => nag.code === SILENCE_MARKER_CODE)
  if (
    marker?.lastMentionedOn &&
    daysBetween(marker.lastMentionedOn, facts.todayISO) < SILENCE_COOLDOWN_DAYS
  ) {
    return NO('inside the silence cooldown')
  }

  return {
    fire: true,
    detail: {
      kind: 'silence',
      daysSinceLastRun,
      daysSinceRunnerSpoke: facts.daysSinceRunnerSpoke,
    },
  }
}

/**
 * The resolver. Runs the four cron-eligible evaluators in `PROACTIVE_PRIORITY` order and returns
 * the first that fires, or the LAST refusal's reason so a log line says something useful. Pure, so
 * `tests/nina.proactive.test.ts` can assert the whole priority table without a database.
 */
export function decideProactive(facts: ProactiveFacts): ProactiveDecision {
  const evaluators = {
    avatar_changed: evaluateAvatarChanged,
    pattern_crossed: evaluatePatternCrossed,
    missed_usual_day: evaluateMissedUsualDay,
    silence: evaluateSilence,
  } as const

  const reasons: string[] = []
  for (const kind of PROACTIVE_PRIORITY) {
    const evaluate = evaluators[kind as keyof typeof evaluators]
    if (!evaluate) continue
    const decision = evaluate(facts)
    if (decision.fire) return decision
    reasons.push(`${kind}: ${decision.reason}`)
  }
  return NO(reasons.join('; '))
}

/**
 * `markerFor` — the durable write a fired decision earns, or `null` when the marker is not a nag
 * row (`avatar_changed` sets `announced_at`; `run_committed` is marked by the message row itself).
 *
 * `level` on a `trigger:*` row is a mention COUNT, not phase 9's escalation rung: nothing reads it
 * yet, and it is incremented rather than pinned so that "how many Tuesdays has she asked about"
 * is answerable later without a schema change.
 */
export function markerFor(
  detail: ProactiveDetail,
  facts: ProactiveFacts,
): { code: string; level: number } | null {
  const bump = (code: string) =>
    (facts.nags.find((nag) => nag.code === code)?.level ?? 0) + 1

  switch (detail.kind) {
    case 'missed_usual_day':
      return { code: MISSED_DAY_MARKER_CODE, level: bump(MISSED_DAY_MARKER_CODE) }
    case 'silence':
      return { code: SILENCE_MARKER_CODE, level: bump(SILENCE_MARKER_CODE) }
    case 'pattern_crossed':
      /* Phase 9's ledger, phase 9's rung. Written through `recordNagMention`, not through this. */
      return { code: detail.code, level: detail.nagLevel + 1 }
    case 'avatar_changed':
    case 'run_committed':
      return null
  }
}

/**
 * The structured half of the proactive prompt: the facts the trigger knows that
 * `PROACTIVE_INSTRUCTIONS` can only refer to. Emitted as one JSON line under a heading, exactly
 * the way phase 2's context blocks read, so the model has one parsing convention and not two.
 *
 * **Invariant 2 lives here.** Record and badge KEYS come from the commit path; their LABELS are
 * resolved by the caller out of the already-built `NinaContext`, which is the sanctioned boundary.
 * This function never invents a label and never formats a number — `value` is passed through raw
 * and phase 2's `PATTERN_VALUE_FORMAT` is what spells it.
 */
export function triggerBlock(
  detail: ProactiveDetail,
  label: { record: (key: string) => string; badge: (key: string) => string },
): string {
  const body = (() => {
    switch (detail.kind) {
      case 'run_committed':
        return {
          kind: detail.kind,
          runId: detail.runId,
          occurredOn: detail.occurredOn,
          recordsTaken: detail.recordKeys.map(label.record),
          badgesEarned: detail.badgeKeys.map(label.badge),
        }
      case 'missed_usual_day':
        return { kind: detail.kind, date: detail.todayISO, weekday: detail.weekday }
      case 'pattern_crossed':
        return {
          kind: detail.kind,
          code: detail.code,
          value: detail.value,
          unit: detail.unit,
          nagLevel: detail.nagLevel,
        }
      case 'silence':
        return {
          kind: detail.kind,
          daysSinceLastRun: detail.daysSinceLastRun,
          daysSinceRunnerSpoke: detail.daysSinceRunnerSpoke,
        }
      case 'avatar_changed':
        return { kind: detail.kind }
    }
  })()

  return `TRIGGER\n${JSON.stringify(body)}`
}
```

**Impact:** New module, no callers yet. Imports `addDays` only if the tests use it; drop it from
the import if unused so `npm run lint` stays clean. Everything above is pure and unit-testable in
`environment: 'node'`.

---

### Step 3: `lib/nina/proactive.ts` — the impure half (loading, emitting)

**File:** `lib/nina/proactive.ts` (append; lines ~330–560)
**Change:** Four functions. They load facts, call Step 2, run phase 3's turn, and write the marker.
Nothing decides anything here — that is the point of the split, and it is why the test file needs no
database.

**Two boundaries worth naming before the code:**

- **Labels.** `badgeDefinition(key)?.title` (`lib/badges/catalog.ts:95–117`) and
  `RECORD_LABELS[key]` (`lib/records/labels.ts:25`) are the same strings the badge shelf and the
  records shelf render. Invariant 3 satisfied by construction: the label she reads is the label he
  sees. **Nothing is recomputed** — the KEYS come from `onRunCommitted`'s own answer, threaded
  through Steps 5 and 6.
- **Phase 11's seam.** `ProactiveDeps.notify` defaults to `NOOP_NOTIFIER`. Phase 11 changes the
  default to its own sender in ONE place, marked in the code below.

**Code:**

```ts
import { badgeDefinition } from '@/lib/badges/catalog'
import { RECORD_LABELS } from '@/lib/records/labels'
import { isRecordKey } from '@/lib/records/catalog'
import { todayInJakarta } from '@/lib/date/ranges'
import { PROACTIVE_INSTRUCTIONS } from '@/lib/nina/prompts'
import { loadNinaContext } from '@/lib/nina/load'
import { dbNinaGateway } from '@/lib/nina/gateway'
import { recordNagMention } from '@/lib/nina/nags'
import { runNinaTurn } from '@/lib/nina/turn'
import {
  getLastRunDate,
  getUnannouncedCurrentNinaAvatar,
  hasProactiveMessageForRun,
  hasRunOn,
  listNinaNags,
  markNinaAvatarAnnounced,
  upsertNinaNag,
} from '@/lib/nina/queries'

/** What phase 11 will implement. Called AFTER the rows are committed, never instead of writing. */
export type ProactiveNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: ProactiveTriggerKind,
) => Promise<void>

/** PHASE 11: change this default to the real sender. It is the only line that needs to move. */
export const NOOP_NOTIFIER: ProactiveNotifier = async () => {}

export interface ProactiveDeps {
  now?: () => Date
  notify?: ProactiveNotifier
  /** Overridable so `tests/nina.cron.test.ts` can drive the route without a model or a database. */
  runTurn?: typeof runNinaTurn
}

export interface EmitResult {
  emitted: boolean
  kind: ProactiveTriggerKind | null
  messageIds: string[]
  /** Always populated, including on success — a cron log that says only "false" is useless. */
  reason: string
}

const NOT_EMITTED = (reason: string): EmitResult => ({
  emitted: false,
  kind: null,
  messageIds: [],
  reason,
})

/**
 * Everything the four cron triggers need, in one pass of cheap indexed reads and no model call.
 *
 * **Patterns come off the context, not from a second query.** Phase 2's `loadNinaContext` already
 * attaches `patterns` (its `PatternFact[]`) and the nag levels that go with them, because every
 * chat turn needs them too. Loading them again here would be a second computation of the same
 * longitudinal scan for one invocation — so this function takes the already-built context.
 */
export async function loadProactiveFacts(
  userId: string,
  context: NinaContext,
  now: Date,
): Promise<ProactiveFacts> {
  const todayISO = todayInJakarta(now)

  const [nags, avatar, lastRunOn, ranToday] = await Promise.all([
    listNinaNags(userId),
    getUnannouncedCurrentNinaAvatar(userId),
    getLastRunDate(userId),
    hasRunOn(userId, todayISO),
  ])

  const runningDaysSlot = context.memory.slots.find(
    (slot) => slot.key === RUNNING_DAYS_SLOT_KEY,
  )?.value

  return {
    todayISO,
    jakartaHour: jakartaHourOf(now),
    runningDays: parseRunningDays(runningDaysSlot ?? null),
    hasRunToday: ranToday,
    lastRunOn,
    daysSinceRunnerSpoke: context.conversation.daysSinceRunnerSpoke,
    patterns: context.patterns.map((pattern) => ({
      code: pattern.code,
      value: pattern.value,
      unit: pattern.unit,
      nagLevel: pattern.nagLevel ?? 0,
    })),
    nags,
    unannouncedAvatarId: avatar?.id ?? null,
  }
}

/**
 * The one place a proactive message is written. Every trigger goes through here, so the ordering
 * guarantee below is made once rather than five times.
 *
 * ── ORDER OF OPERATIONS, AND WHY ────────────────────────────────────────────────────────────────
 *   1. build the prompt appendix          pure
 *   2. run the turn                       the model call — this is where 15 s goes
 *   3. write the durable marker           ONLY on success
 *   4. notify (phase 11)                  best effort, never fails the write
 *
 * **Step 3 is after step 2 and that is the whole idempotence design.** Marking first would make a
 * model failure permanent: the trigger would be spent, the message would not exist, and she would
 * silently skip a Tuesday. Marking after means a failure is retried by the next invocation, and the
 * duplicate risk it opens — two invocations racing to emit the same trigger — is closed by the
 * `ON CONFLICT` in `upsertNinaNag` plus the fact that Vercel runs one cron invocation per day.
 * For a personal app that is the right side of the trade: a repeated nag is annoying, a swallowed
 * one is a friend who forgot.
 */
export async function emitProactiveMessage(
  userId: string,
  detail: ProactiveDetail,
  facts: ProactiveFacts,
  context: NinaContext,
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())
  const notify = deps.notify ?? NOOP_NOTIFIER
  const runTurn = deps.runTurn ?? runNinaTurn

  const instruction = `${PROACTIVE_INSTRUCTIONS[detail.kind]}\n\n${triggerBlock(detail, {
    record: (key) => (isRecordKey(key) ? RECORD_LABELS[key] : key),
    badge: (key) => badgeDefinition(key)?.title ?? key,
  })}`

  const turn = await runTurn(userId, {
    context,
    extraInstruction: instruction,
    source: detail.kind,
    runId: detail.kind === 'run_committed' ? detail.runId : null,
    runnerMessageId: null,
  })

  if (!turn.ok || turn.bubbles.length === 0) {
    return NOT_EMITTED(`turn produced nothing (unavailable=${turn.unavailable})`)
  }

  /* The marker. Its own try: a written message with a missing marker repeats at worst once, while
   * throwing here would lose the report and tell the caller nothing was emitted when something was. */
  try {
    if (detail.kind === 'avatar_changed') {
      await markNinaAvatarAnnounced(userId, detail.avatarId, now())
    } else if (detail.kind === 'pattern_crossed') {
      /* Phase 9's ledger owns the rung, so phase 9's function writes it — after the message, so a
       * failed turn never burns an escalation step. */
      await recordNagMention(userId, detail.code, facts.todayISO)
    } else {
      const marker = markerFor(detail, facts)
      if (marker) {
        await upsertNinaNag(userId, marker.code, {
          level: marker.level,
          lastMentionedOn: facts.todayISO,
        })
      }
    }
  } catch (cause) {
    console.warn('[nina proactive] marker write failed', {
      userId,
      kind: detail.kind,
      error: String(cause),
    })
  }

  try {
    await notify(userId, turn.bubbles, detail.kind)
  } catch (cause) {
    console.warn('[nina proactive] notify failed', { userId, error: String(cause) })
  }

  return {
    emitted: true,
    kind: detail.kind,
    messageIds: turn.bubbles.map((bubble) => bubble.id),
    reason: 'emitted',
  }
}

/**
 * **R8, trigger 1.** Called from `after()` in `lib/review/actions.ts`, so nothing here is on the
 * commit's critical path — the runner has already been redirected to `/r/[id]` by the time the
 * first token comes back.
 *
 * `recordKeys` and `badgeKeys` are handed in, never derived: `onRunCommitted` recomputed the
 * records and evaluated the badges during the commit and already knows exactly which ones moved to
 * this run. Re-deriving them here would mean a second `recomputeRecords` (a full scan) and a
 * `getBadgeAwardsForRun` (an extra query), and worse, it would compute them at a LATER instant
 * than the commit, so a run edited twice in a minute could report a record that had already moved
 * on. The commit's answer is the only correct one.
 */
export async function emitRunCommitted(
  input: {
    userId: string
    runId: string
    occurredOn: DateISO
    recordKeys: readonly string[]
    badgeKeys: readonly string[]
  },
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())

  /* Idempotence for trigger 1 is the message row itself: two tabs committing the same extraction,
   * or a retried `after()`, must not produce two reactions to one run. */
  if (await hasProactiveMessageForRun(input.userId, input.runId)) {
    return NOT_EMITTED('already reacted to this run')
  }

  const context = await loadNinaContext(input.userId, dbNinaGateway, now())
  const facts = await loadProactiveFacts(input.userId, context, now())

  return emitProactiveMessage(
    input.userId,
    {
      kind: 'run_committed',
      runId: input.runId,
      occurredOn: input.occurredOn,
      recordKeys: input.recordKeys,
      badgeKeys: input.badgeKeys,
    },
    facts,
    context,
    deps,
  )
}

/**
 * One user's whole cron pass: load, decide, and emit at most one message. The route calls this and
 * does nothing else per user, so the deadline logic and the failure isolation stay in the route
 * where they can be read next to each other.
 */
export async function evaluateAndEmitForUser(
  userId: string,
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())
  const at = now()

  const context = await loadNinaContext(userId, dbNinaGateway, at)
  const facts = await loadProactiveFacts(userId, context, at)

  const decision = decideProactive(facts)
  if (!decision.fire) return NOT_EMITTED(decision.reason)

  return emitProactiveMessage(userId, decision.detail, facts, context, deps)
}
```

**Impact:** Three imports whose exact names belong to other phases and are the reconciler's job:
`loadNinaContext` + `NinaContext` (phase 2), `dbNinaGateway` (phase 3's concrete
`NinaSourceGateway` — phase 2's plan explicitly ships no gateway and hands it to phase 3),
`recordNagMention` (phase 9), `runNinaTurn` (phase 3). `NinaContext` is a type-only import and must
be added to Step 2's import block as `import type { NinaContext } from '@/lib/nina/context'`.

Two shape assumptions on phase 2's `NinaContext`, both one-liners if wrong:
`context.memory.slots` is an array of `{ key, value }`, and `context.patterns` is an array carrying
`code`, `value`, `unit` and a nag level. `context.conversation.daysSinceRunnerSpoke` is quoted
verbatim from phase 2's own `silence` instruction, so that one is certain.

---

### Step 4: `app/api/cron/nina/route.ts` — triggers 2–5

**File:** `app/api/cron/nina/route.ts` (new)
**Change:** The fifth sanctioned route handler, on `app/api/cron/rollup/route.ts`'s shape. Four of
that route's properties are requirements here and are reproduced deliberately: the `CRON_SECRET`
guard, the `listActiveUserIds` walk, the sequential loop with every user in its own `try`, and the
soft deadline checked before each unit of work.

**One property is different and it is the interesting one.** The rollup puts its cheap work (the
badge sweep) before its expensive work (two model calls) so that a deadline expiry drops the model
call. Nina's job has the same shape but the split falls inside `evaluateAndEmitForUser`: the cheap
half is the evaluation (four indexed reads, no model), and the expensive half is the emission. So
the deadline is checked **twice** — once as "is there time for another user at all", and once as
"is there time for a model call for THIS user" via `NINA_MIN_SLOT_MS`. A user whose evaluation says
"nothing to say" costs ~30 ms and is never skipped by the deadline.

**Code:**

```ts
import { addDays, todayInJakarta } from '@/lib/date/ranges'
import { listActiveUserIds } from '@/lib/db/queries'
import { cronEnv } from '@/lib/env'
import { evaluateAndEmitForUser } from '@/lib/nina/proactive'

/**
 * `GET /api/cron/nina` — the evening proactivity pass. Triggers 2–5 of RU-15/RU-17; trigger 1
 * (`run_committed`) fires from `after()` at the moment of the commit and never comes through here.
 *
 * ── WHY 19:00 ASIA/JAKARTA, AND HOW THE SCHEDULE SPELLS IT ──────────────────────────────────────
 * Vercel cron `schedule` strings are UTC. Asia/Jakarta is UTC+7 with no DST, ever. 19:00 WIB is
 * therefore `"0 12 * * *"`, and because 12 + 7 = 19 < 24 the Jakarta calendar day at cron time is
 * the same date as the UTC date — no rollover, unlike `/api/cron/rollup`'s `"0 20 * * *"`, which
 * lands at 03:00 WIB the following day. `todayInJakarta()` is still the only thing asked what day
 * it is; nothing here does its own offset arithmetic on a date.
 *
 * The Hobby plan triggers a cron within the hour of its schedule, so the real firing window is
 * 19:00–20:00 WIB. `MISSED_DAY_EVENING_HOUR` is 18 to admit the whole window rather than demand an
 * exact hour, and it exists as a constant precisely so this route contains no time-of-day logic.
 *
 * ── AT MOST ONE MESSAGE PER USER PER INVOCATION ─────────────────────────────────────────────────
 * `evaluateAndEmitForUser` resolves the four candidates by priority and emits one. Two proactive
 * openers in one evening is not twice as proactive, it is spam.
 *
 * ── IT IS ALSO THE NUDGE ENDPOINT ───────────────────────────────────────────────────────────────
 * Phase 14's `/update-nina-profpic` skill GETs this route with `Authorization: Bearer $CRON_SECRET`
 * after it pushes a hand-uploaded avatar, as a best-effort "say something about it now" rather than
 * waiting for the evening. That works because `avatar_changed` is the highest-priority trigger and
 * because its marker is `nina_avatars.announced_at`, so the nudge is safe to repeat: the second
 * call finds nothing unannounced and emits nothing. **Any authenticated caller may hit this route
 * as often as they like; idempotence is what makes that harmless, not rate limiting.**
 *
 * ── SEQUENTIAL, AND ONE USER'S FAILURE STOPS NOTHING ────────────────────────────────────────────
 * Same two reasons as the rollup, unchanged: there is no evidence z.ai's rate limit tolerates a
 * burst and a personal app is not where to find out; and a cron that aborts on the first bad row
 * silently stops serving everyone after it in the list.
 */

export const runtime = 'nodejs'
/**
 * A LITERAL, not an imported constant: segment config exports are statically analysed at build
 * time and `next build` rejects an identifier here (the trap `/api/extract` and
 * `/api/cron/rollup` both document).
 */
export const maxDuration = 60

/** 50 s against a 60 s ceiling: the response itself plus a call already in flight when it passes. */
const NINA_SOFT_DEADLINE_MS = 50_000
/**
 * A proactive turn is one `glm-5.3` call plus a persist — measured siblings run 13–16 s, and RU-4's
 * pre-injected context makes this one no cheaper. Starting one with less than this left buys a
 * half-finished invocation, a truncated log and no message, so the loop declines instead.
 */
const NINA_MIN_SLOT_MS = 20_000

/** Same 60-day window as the rollup: an evaluation for an inactive user is four indexed reads. */
const ACTIVE_WINDOW_DAYS = 60

export async function GET(request: Request): Promise<Response> {
  // Read inside the handler, never at module scope: `cronEnv()` is lazy so `next build` and CI
  // (which set no CRON_SECRET) can collect this route's page data without the variable set.
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const startedAt = Date.now()
  const deadline = startedAt + NINA_SOFT_DEADLINE_MS

  const todayISO = todayInJakarta()
  const userIds = await listActiveUserIds(addDays(todayISO, -ACTIVE_WINDOW_DAYS))

  let emitted = 0
  let quiet = 0
  let failed = 0
  let skipped = 0
  const kinds: Record<string, number> = {}

  for (const [index, userId] of userIds.entries()) {
    /* The coarse check: no time for even the cheap evaluation. */
    if (Date.now() > deadline) {
      skipped = userIds.length - index
      console.warn('[cron nina] out of budget', { skipped })
      break
    }

    /* Every user in its own try. A user whose context fails to load — a bad memory row, a null
     * where the gateway expected a number — must not cost every user after them their evening. */
    try {
      /* The fine check: enough room for a model call if the evaluation decides to make one. Passed
       * as a deps clock rather than consulted here, because the evaluation itself is cheap and
       * should run regardless — it is the emission that needs the budget. */
      const remaining = deadline - Date.now()
      if (remaining < NINA_MIN_SLOT_MS) {
        skipped = userIds.length - index
        console.warn('[cron nina] not enough budget for a turn', { userId, skipped, remaining })
        break
      }

      const result = await evaluateAndEmitForUser(userId)
      if (result.emitted) {
        emitted++
        if (result.kind) kinds[result.kind] = (kinds[result.kind] ?? 0) + 1
      } else {
        quiet++
        console.info('[cron nina] nothing to say', { userId, reason: result.reason })
      }
    } catch (cause) {
      failed++
      console.warn('[cron nina] user failed', { userId, error: String(cause) })
    }
  }

  return Response.json({
    ok: true,
    users: userIds.length,
    emitted,
    quiet,
    failed,
    skipped,
    kinds,
    todayISO,
    elapsedMs: Date.now() - startedAt,
  })
}
```

**Impact:** A new route. `cronEnv()` already exists and already returns `CRON_SECRET`
(`lib/env.ts`, used at `app/api/cron/rollup/route.ts:70`) — no env change, so phase 1's `lib/env.ts`
edits are untouched by this phase. **Phase 14's nudge contract is confirmed:** `GET`, with
`Authorization: Bearer $CRON_SECRET`, is exactly what this accepts, and repeating it is harmless.

---

### Step 5: `vercel.json` — the second cron entry

**File:** `vercel.json:4–9`
**Change:** One entry. The Hobby plan allows two cron jobs; this is the second and last, which is
why there is no separate morning pass.

**Code:**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"],
  "crons": [
    {
      "path": "/api/cron/rollup",
      "schedule": "0 20 * * *"
    },
    {
      "path": "/api/cron/nina",
      "schedule": "0 12 * * *"
    }
  ]
}
```

**Impact:** `"0 12 * * *"` UTC = 19:00 Asia/Jakarta, same calendar day. Eight hours clear of the
rollup's 03:00 WIB, so the two jobs never contend for the same connection pool or the same z.ai
rate window.

---

### Step 6: `lib/derived/invalidate.ts` — surface what the commit already knows

**File:** `lib/derived/invalidate.ts:61–67`, `:217`, `:226`
**Change:** `InvalidateOutcome` gains one field. `onRunCommitted` already computes
`recordsMovedToThisRun` at `:167–177` — "the keys whose holder is now THIS run, computed at the
exact moment it happened", in that function's own words — and then throws it away after handing it
to the badge evaluator. R8 needs exactly that list, and re-deriving it later is both a full record
recompute and a lie: `changed` is only true at this instant.

**Code** — replace the `InvalidateOutcome` declaration and its docstring at `:61–67`:

```ts
/**
 * What the commit path learns from invalidation.
 *
 * `newlyEarned` is F09 §1.1 step 6: the badge keys this commit actually wrote. `recordsMovedToThisRun`
 * is F06's equivalent — the record keys whose holder became this run, `changed` rather than `rows`
 * for the reason spelled out at the computation below.
 *
 * Insights are absent from this type on purpose: they are read back from their own table, so there
 * is nothing here a caller could not query. Records and badges are different — F33's phase 10 needs
 * "what did THIS run earn" to react to it, and this is the one moment that answer exists for free.
 * After the redirect it costs a query for badges and is unrecoverable for records.
 */
export interface InvalidateOutcome {
  newlyEarned: BadgeAwardResult['newlyEarned']
  recordsMovedToThisRun: readonly RecordKey[]
}
```

Then both `return` statements in `onRunCommitted`. At `:217`:

```ts
  try {
    const { newlyEarned } = await evaluateBadges(event.userId, event.runId, recordsMovedToThisRun)
    return { newlyEarned, recordsMovedToThisRun }
  } catch (error) {
    console.error('[invalidate] badge evaluation failed', {
      runId: event.runId,
      userId: event.userId,
      phase: event.phase,
      error,
    })
    /* The records still moved even though the badges did not save — reporting them is correct and
     * is what lets Nina congratulate a record whose badge write failed. */
    return { newlyEarned: [], recordsMovedToThisRun }
  }
```

**Impact:** Additive. `lib/review/commit.ts:215` reads `outcome?.newlyEarned` and keeps compiling.
`tests/derived.invalidate.test.ts` may assert on a whole returned object with `toEqual`; if it does,
add `recordsMovedToThisRun: []` (or the expected keys) to those expectations — that is the only test
edit this step needs, and it is the test correctly noticing a widened contract.

---

### Step 7: `lib/review/commit.ts` — thread it out, and say whether this is a new run

**File:** `lib/review/commit.ts:72–73`, `:128–130`, `:204–223`
**Change:** `CommitOutcome`'s success arm gains `recordsMoved` and `isNewRun`. **No `after()` call
is added to this file** — see the note under Step 8 for why the hook moved one file up.

`isNewRun` is the guard that stops her reacting to a *correction* as though it were a run. Fixing
km 4 on Tuesday's run on Thursday is not an event she should open a conversation about, and the
already-committed short-circuit at `:128` is not one either.

**Code** — the type at `:72–73`:

```ts
/**
 * `newlyEarned` is F09 §1.1 step 6: the badge keys this commit actually wrote, so a screen can say
 * "you earned Fashionably Late" without a second round trip. `recordsMoved` is F06's equivalent from
 * the same invalidation pass. Both are `[]` rather than absent when nothing happened, when
 * invalidation failed, and on the already-committed short-circuit below — a caller never has to
 * distinguish "nothing earned" from "we did not look".
 *
 * `isNewRun` is F33 R8's gate: true only when this commit CREATED the run. A post-review edit and
 * the already-committed short-circuit are both `false`, because Nina reacting to a corrected split
 * as though the runner had just come home is the failure that makes proactivity feel automated.
 *
 * `commitReviewAction` is the consumer: it redirects, so the review screen has no response to
 * render these into, and instead schedules F33's reaction in `after()`.
 */
export type CommitOutcome =
  | {
      ok: true
      runId: string
      newlyEarned: BadgeKey[]
      recordsMoved: RecordKey[]
      isNewRun: boolean
    }
  | { ok: false; state: CommitReviewState }
```

Add `import type { RecordKey } from '@/lib/records/types'` beside the existing `BadgeKey` import at
`:10`.

The short-circuit at `:128–130`:

```ts
  if (context.mode === 'review' && context.committedRunId) {
    return {
      ok: true,
      runId: context.committedRunId,
      newlyEarned: [],
      recordsMoved: [],
      isNewRun: false,
    }
  }
```

Step 5's block at `:204–223`:

```ts
  /* 5 — invalidation. Never allowed to fail the save (plan §7.3). Records, then badges, then the
   * insight sweep — the order lives inside `onRunCommitted`, which is also where the reasoning for
   * it is written down. */
  let newlyEarned: BadgeKey[] = []
  let recordsMoved: RecordKey[] = []
  try {
    const outcome = await invalidate({
      runId: committedRunId,
      userId,
      changedFieldPaths,
      occurredOn: draft.occurredOn,
      previousOccurredOn:
        context.baseline.occurredOn !== draft.occurredOn ? context.baseline.occurredOn : null,
      phase,
    })
    newlyEarned = outcome?.newlyEarned ?? []
    recordsMoved = [...(outcome?.recordsMovedToThisRun ?? [])]
  } catch (err) {
    console.error('[review] onRunCommitted failed; derived data is behind', {
      runId: committedRunId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  /* `context.runId` was null on entry exactly when this commit created the run — the same branch
   * at step 3 that chose `commitExtractedRun` over `applyRunCorrections`. Read before the write
   * would be wrong; `committedRunId` is set either way. */
  return {
    ok: true,
    runId: committedRunId,
    newlyEarned,
    recordsMoved,
    isNewRun: context.runId === null,
  }
```

**Impact:** `tests/review.commit.test.ts` asserts on `CommitOutcome`. Every success expectation
gains `recordsMoved: []` and `isNewRun: true | false`; if the suite uses
`expect(outcome).toMatchObject({ ok: true, runId })` nothing changes at all. **This file remains
free of any request-scoped API, so it stays unit-testable exactly as it is today** — which is the
reason the `after()` call is not here.

---

### Step 8: `lib/review/actions.ts` — the `after()` hook

**File:** `lib/review/actions.ts:1–47`
**Change:** Schedule Nina's reaction after the response, above the `redirect()`.

**WHY THIS FILE AND NOT `commit.ts`, which the phase brief named.** `after()` throws
`` `after` was called outside a request scope `` when there is no work store —
`node_modules/next/dist/server/after/after.js` raises `E468` unconditionally in that case. Every
one of `tests/review.commit.test.ts`'s cases calls `commitReview()` directly, with no request
scope, so putting the call in `commit.ts` breaks the suite the moment it lands, and invariant 1
says the suite passes at every phase boundary. Hiding it behind an injectable dep whose default is
the real `after` breaks the same tests; hiding it behind a default that swallows the throw makes a
production misconfiguration silent. `actions.ts` is already the boundary file for exactly this
class of API — it is where `revalidatePath` and `redirect` live, and its own header says
"Everything real lives in `commit.ts`. This file is the boundary: identity, cache, navigation."
Scheduling is navigation-adjacent, and it belongs with them.

**WHY `after()` AND NOT `void promise`.** Next's docs are explicit that `after` runs for the
platform's configured max duration and that **it executes even when the response did not complete
successfully — including when `redirect()` is called**, which is precisely what happens on the next
line. A bare floating promise in a serverless function is killed when the invocation's response is
sent; `after` is what maps onto Vercel's `waitUntil` and keeps the invocation alive until it
settles. It is also the reason the redirect is not delayed by one millisecond: the callback is
registered, not awaited.

**Code** — the whole file after the edit:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'

import { requireUserId } from '@/lib/auth/requireUserId'
import { emitRunCommitted } from '@/lib/nina/proactive'
import { commitReview } from './commit'
import type { CommitReviewState } from './schema'

/**
 * D7 — a Server Action, not a Route Handler. The review screen posts the whole draft as one JSON
 * object rather than as `FormData`: the draft is a nested structure (eleven split rows, five zone
 * rows), and flattening it into form fields only to reassemble it on the server would put the
 * dot-path syntax in two places and give it two chances to drift.
 *
 * Everything real lives in `commit.ts`. This file is the boundary: identity, cache, navigation —
 * and, since F33, scheduling.
 */

/**
 * Commit a reviewed run and go to it.
 *
 * `requireUserId()` is line 1, before the payload is even looked at (INVARIANT A), and it sits
 * above every `try` in the call graph — it signals by throwing `NEXT_REDIRECT`, and so does the
 * `redirect()` at the bottom, so neither may ever be caught here.
 *
 * On success this never returns: it redirects to the run. On failure it returns the state the
 * screen renders inline, because a validation error is not an exception — it is the normal
 * outcome of a human typing into a form, and it belongs next to the field that caused it.
 *
 * ── F33 R8: A RUN BECOMING REAL IS THE EVENT ────────────────────────────────────────────────────
 * Nina reacts to a committed run, naming the records it took and the badges it earned. That is a
 * `glm-5.3` call, ~15 s, and **the runner must not wait on it** — invariant 4 forbids a model call
 * in a render path and common decency forbids one in a redirect. `after()` is the primitive: the
 * callback is registered rather than awaited, it maps onto Vercel's `waitUntil`, and Next's
 * reference is explicit that it still runs when the response ended in a `redirect()`. The
 * `maxDuration = 60` on the invoking page segments (`/x/[extractionId]` and `/r/[id]/edit`) is what
 * gives it room; a Server Action's timeout is the page segment's, not the action's.
 *
 * Three things it deliberately does NOT do: it does not await, it does not touch `outcome.state`,
 * and it does not run for a post-review edit (`isNewRun`). It also cannot throw into the response —
 * `emitRunCommitted` returns a result rather than raising, and the `catch` here is the backstop for
 * a failure below that, because an unhandled rejection inside `after` is a logged crash for a
 * message nobody was promised.
 */
export async function commitReviewAction(
  _previous: CommitReviewState,
  payload: unknown,
): Promise<CommitReviewState> {
  const userId = await requireUserId()

  const outcome = await commitReview(userId, payload)
  if (!outcome.ok) return outcome.state

  if (outcome.isNewRun) {
    const { runId, newlyEarned, recordsMoved } = outcome
    after(async () => {
      try {
        const result = await emitRunCommitted({
          userId,
          runId,
          occurredOn: occurredOnOf(payload),
          recordKeys: recordsMoved,
          badgeKeys: newlyEarned,
        })
        console.info('[review] nina reacted', { runId, ...result })
      } catch (err) {
        console.error('[review] nina reaction failed; the run itself is saved', {
          runId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  }

  // The runs list, the profile totals and the run itself all change shape on a commit. `/trends`
  // and `/me` are F08/F09's screens and do not exist yet; revalidating a route with no page is a
  // no-op, and listing them here is what stops the sweep being forgotten when they land.
  revalidatePath('/')
  revalidatePath('/trends')
  revalidatePath('/me')
  revalidatePath(`/r/${outcome.runId}`)

  redirect(`/r/${outcome.runId}`)
}

/**
 * The committed run's calendar day, read back off the payload the action was handed.
 *
 * It is not on `CommitOutcome` because nothing else needs it and widening that type a third time
 * for one string is worse than reading the one field back. The payload has already been validated
 * by `ReviewDraftSchema` inside `commitReview` by the time this runs, so the shape is known good;
 * the guard is here only so a malformed payload produces an empty string rather than a throw inside
 * `after`, and an empty string makes Nina's trigger block say nothing about the date rather than
 * lie about it.
 */
function occurredOnOf(payload: unknown): string {
  const draft = (payload as { draft?: { occurredOn?: unknown } } | null)?.draft
  return typeof draft?.occurredOn === 'string' ? draft.occurredOn : ''
}
```

**Impact:** `after()` needs a request scope, which a Server Action always has. `redirect()` still
throws `NEXT_REDIRECT` on the last line and the registered callback still runs — that is documented
behaviour, not a hope. No test covers this file today (it contains `redirect`), and none is added:
what is worth testing is `emitRunCommitted`, and that is Step 12's job.

---

### Step 9: `maxDuration` on the two segments that invoke the action

**Files:** `app/x/[extractionId]/page.tsx` (after the imports, before the default export),
`app/r/[id]/edit/page.tsx` (same position)
**Change:** One export each.

**Code** (identical in both files, with the path in the first line changed to match):

```ts
/**
 * A Server Action's timeout is the **page segment's**, not the action's — Next's `maxDuration`
 * reference: "If using Server Actions, set the `maxDuration` at the page level to change the
 * default timeout of all Server Actions used on that page." `app/r/[id]/page.tsx:65–77` records the
 * same finding for `ensureRunInsight`.
 *
 * `commitReviewAction` posts from this screen and, since F33, schedules Nina's reaction to the new
 * run in `after()`. `after` runs for the platform's configured max duration of the route, so
 * without this line her ~15 s model call is cut off by the default limit and the reaction is lost
 * silently — the redirect having already succeeded, there is nothing to surface the failure. A
 * LITERAL, not an imported constant: segment config is statically analysed at build time.
 */
export const maxDuration = 60
```

**Impact:** These are the only two callers of `commitReviewAction` (`ReviewScreen` is rendered by
both). No behaviour changes for a commit that does not fire the trigger — `maxDuration` is a
ceiling, not a reservation.

---

### Step 10: `components/ui/TabBar.tsx` — `Tab` gains a badge, `TabBar` gains a slot

**File:** `components/ui/TabBar.tsx` (phase 4's five-tab version: `TabBar` at `:36`, `Tab` at `:79`)
**Change:** Phase 4's Handoffs asked for exactly `badge?: React.ReactNode` on `Tab`, and this is it.
`TabBar` takes the badge as a **`ReactNode` prop**, not a number, and that is the load-bearing
choice: `TabBar` is `'use client'` and a client component cannot `await` a count, but it *can*
render a Server Component it was handed as a prop. The count therefore never crosses into the
client bundle and no route handler is invented to fetch it.

**Code** — the two changed functions in full:

```tsx
export function TabBar({ ninaBadge }: { ninaBadge?: React.ReactNode } = {}) {
  const pathname = usePathname()

  // `/` matches only itself; every other tab owns its subtree, so `/r/abc` highlights Runs — a
  // pushed run-detail screen is still "in" the Runs tab even though it is not a tab itself. The
  // same rule already covers F33's second screen: `/nina/about` (phase 13) highlights Nina.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/r/') : pathname.startsWith(href)

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 backdrop-blur-sm"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="relative mx-auto grid h-[58px] w-full max-w-[470px] grid-cols-5 items-center">
        <Tab {...TABS[0]} active={isActive(TABS[0].href)} />
        {/* F33 phase 10: `ninaBadge` is a Server Component rendered by `AppShell` and passed down
            as a node. A client component may render a server child it was handed, which is how the
            unread count reaches the bar without a client fetch and without a route handler. */}
        <Tab {...TABS[1]} active={isActive(TABS[1].href)} badge={ninaBadge} />

        {/* The FAB owns the middle cell of five and overflows upward out of the bar. */}
        <div className="flex justify-center">
          <Link
            href="/upload"
            aria-label="Upload a run"
            aria-current={pathname.startsWith('/upload') ? 'page' : undefined}
            className="absolute -top-5 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full bg-z5 text-white shadow-card active:scale-[0.97]"
          >
            <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        </div>

        <Tab {...TABS[2]} active={isActive(TABS[2].href)} />
        <Tab {...TABS[3]} active={isActive(TABS[3].href)} />
      </div>
    </nav>
  )
}

/**
 * One tab. `badge` is an optional node pinned to the icon's top-right — currently only Nina's
 * unread dot uses it.
 *
 * The wrapper around the icon is `relative` and sized to the icon rather than to the whole link,
 * so the dot lands on the glyph and not in the corner of a 58px-tall tap target. The label stays
 * outside it, which is why the dot does not shift when a label is one character longer.
 */
function Tab({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string
  label: string
  icon: (props: { className: string }) => React.ReactNode
  active: boolean
  badge?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold',
        active ? 'text-ink' : 'text-ink-3',
      )}
    >
      <span className="relative grid size-5 place-items-center">
        <Icon className="size-5" />
        {badge}
      </span>
      {label}
    </Link>
  )
}
```

**Impact:** `TabBar()`'s parameter has a `= {}` default so the two `loading.tsx` files and any other
`<TabBar />` keep compiling with no props. The `<span>` around the icon is a new element in every
tab; it is `size-5` `grid place-items-center`, i.e. exactly the box the icon already occupied, so no
tab moves by a pixel.

---

### Step 11: `components/nina/NinaUnreadBadge.tsx` and `AppShell`

**Files:** `components/nina/NinaUnreadBadge.tsx` (new), `components/ui/AppShell.tsx:41`
**Change:** The dot itself, and the one place it is mounted.

**Code — `components/nina/NinaUnreadBadge.tsx`:**

```tsx
import { Suspense } from 'react'

import { getUserId } from '@/lib/auth/requireUserId'
import { countUnreadNinaMessages } from '@/lib/nina/queries'

/**
 * The unread dot on the Nina tab — F33 R3's cheapest and most constant piece of proactivity. A
 * message she wrote in `after()` or in the evening cron is invisible until the runner opens the
 * app; this is what tells him there is something there.
 *
 * ── WHY A SERVER COMPONENT INSIDE A CLIENT TAB BAR ──────────────────────────────────────────────
 * `TabBar` is `'use client'` (it needs `usePathname` for `aria-current`) and a client component
 * cannot await a count. The three alternatives were all worse: a `NEXT_PUBLIC_`-free client fetch
 * needs a route handler, and D7 sanctions four of those for reasons that have not changed; a poll
 * burns a serverless invocation per tick to learn nothing on almost every tick; and threading a
 * number down from every page means editing seven call sites including two `loading.tsx` files that
 * cannot fetch at all. Passing a server-rendered node into a client component as a prop is the
 * framework's own answer, and it keeps the count out of the client bundle entirely.
 *
 * ── WHEN IT UPDATES ─────────────────────────────────────────────────────────────────────────────
 * On every server render of a tabbed screen, which in practice means every navigation. Open `/nina`,
 * the page marks everything read in `after()`, navigate anywhere, the dot is gone. It is
 * deliberately NOT live: making it live needs a signal, and the only honest one in this plan set is
 * phase 11's service worker (see Handoffs). A dot that is at most one navigation stale is a fair
 * trade for zero polling.
 *
 * ── WHY `getUserId` AND NOT `requireUserId` ─────────────────────────────────────────────────────
 * This renders inside `AppShell`, which `/`'s signed-out state also renders (R-24), and which the
 * two `loading.tsx` files render with no session resolved at all. `requireUserId()` would
 * `redirect('/')` from inside a loading fallback, which is a soft-404 of the kind
 * `app/(app)/loading.tsx`'s docstring already warns about. No session means no dot.
 */
export async function NinaUnreadBadge() {
  const userId = await getUserId()
  if (!userId) return null

  const unread = await countUnreadNinaMessages(userId)
  if (unread === 0) return null

  return (
    <span
      /* `-right-1 -top-1` against the `size-5` icon box from `Tab`. Absolute so it never
         participates in the icon's grid and never nudges the label. */
      className="absolute -right-1 -top-1 size-2.5 rounded-full bg-z5 ring-2 ring-card"
      /* A count is not rendered: at one user and one Nina, "there is something" is the entire
         message, and a number on a 10px tab label is noise. The screen-reader text carries the
         count because there it costs nothing. */
      role="status"
      aria-label={`${unread} unread ${unread === 1 ? 'message' : 'messages'} from Nina`}
    />
  )
}

/**
 * The mountable wrapper: the badge is an async component and `AppShell` renders synchronously, so
 * the suspense boundary lives here rather than being repeated at the call site. `fallback={null}`
 * because a skeleton dot would be a lie — the honest states are "no dot yet" and "dot".
 */
export function NinaUnreadBadgeSlot() {
  return (
    <Suspense fallback={null}>
      <NinaUnreadBadge />
    </Suspense>
  )
}
```

**Code — `components/ui/AppShell.tsx`**, the one changed line at `:41` (phase 4's version of this
file also carries a `bottomGap` prop; only the `<TabBar />` line changes):

```tsx
      <TabBar ninaBadge={<NinaUnreadBadgeSlot />} />
```

with the import added at the top:

```tsx
import { NinaUnreadBadgeSlot } from '@/components/nina/NinaUnreadBadge'
```

**Impact:** `AppShell` has no `'use client'` and gains none, so it can construct the server-rendered
element. One extra indexed `COUNT(*)` per tabbed page render (Interface Contract item 3 is the index
that makes that acceptable). `components/ui/index.ts` gains nothing: the badge lives under
`components/nina/`, and `components/ui` importing from `components/nina` in one file is the same
direction of dependency `AppShell` -> `TabBar` already has.

---

### Step 12: `app/nina/page.tsx` — mark read after the response

**File:** `app/nina/page.tsx` (phase 4's file; two lines added)
**Change:** Clear the unread state once the conversation has actually been sent to the runner.

**Code** — the added import and the added call, in phase 4's page:

```tsx
import { after } from 'next/server'
// …
import { listNinaMessages, markNinaMessagesRead } from '@/lib/nina/queries'

export default async function NinaPage() {
  const userId = await requireUserId()
  const rows = await listNinaMessages(userId, { limit: CONTEXT_MESSAGE_WINDOW })

  /* F33 phase 10. In `after()` and not inline for two reasons: a render must not have a side
   * effect (Next may render a segment more than once, and PPR renders it before a request even
   * exists), and marking read BEFORE the response is sent would clear the dot for a page load that
   * failed on the way to the browser. `after` needs no request API here — `userId` is read above,
   * during the component's own lifecycle, and closed over. */
  after(() => markNinaMessagesRead(userId))

  return <ChatScreen initial={rows.map(toChatMessage)} />
}
```

**Impact:** Phase 4's page is otherwise untouched — its `requireUserId` + `listNinaMessages` shape
is exactly as its plan specifies, and invariant 4 still holds because `after` is not a model call
and `markNinaMessagesRead` is one indexed UPDATE.

---

### Step 13: the tests

**Files:** `tests/nina.proactive.test.ts` (new), `tests/nina.cron.test.ts` (new)
**Change:** `tests/*.test.ts` rather than co-located, matching the forty existing files;
`vitest.config.ts:36` includes both patterns so either works.

**`tests/nina.proactive.test.ts`** — pure, no database, no model. Every case builds a
`ProactiveFacts` from one `facts()` helper with overrides:

1. `parseRunningDays` — `"Selasa, Kamis, Sabtu"` -> `[2, 4, 6]`; `"Tue, Thu, Sat"` -> `[2, 4, 6]`;
   `"tuesdays and thursdays"` -> `[2, 4]`; `"jum'at"` -> `[5]`; `""`, `null` and
   `"whenever I feel like it"` -> `[]`. Plus the collision case that motivates exact-token
   matching: `"senin"` -> `[1]` and `"sun"` -> `[0]`, asserted in the same test.
2. `jakartaWeekdayOf('2026-09-03')` is 4 (a Thursday). The regression guard: assert it does NOT
   depend on `process.env.TZ`, by asserting the value directly rather than against `getDay()`.
3. `jakartaHourOf` — `new Date('2026-09-03T12:00:00Z')` -> 19 (the cron's own instant), and
   `new Date('2026-09-03T20:00:00Z')` -> 3 (the rollup's, next day in Jakarta).
4. **The exit criterion, as a pair:** `evaluateMissedUsualDay` fires with an empty nag list, and
   does NOT fire when `nags` contains `{ code: 'trigger:missed_usual_day', lastMentionedOn: today }`.
   Same facts otherwise. This is "fires once and not twice".
5. `evaluateMissedUsualDay` at `jakartaHour: 17` does not fire and at `18` does — the boundary on
   both sides, per phase 9's own test convention.
6. `evaluateMissedUsualDay` does not fire when `hasRunToday`, when today is not in `runningDays`,
   and when `runningDays` is empty.
7. `evaluateSilence` — fires at `SILENCE_NO_RUN_DAYS` and not at one day less; fires on chat
   silence alone with a recent run; does not fire with `lastRunOn: null` and
   `daysSinceRunnerSpoke: null`; does not fire inside the cooldown.
8. `evaluatePatternCrossed` picks the highest `nagLevel`, breaks ties on `code`, and skips a
   pattern already mentioned today.
9. `decideProactive` priority: with an unannounced avatar AND a crossed pattern AND a missed day
   all true, the result is `avatar_changed` — and `messageIds`-free, since it returns a decision.
10. `markerFor` returns `null` for `avatar_changed` and `run_committed`, and bumps `level` from an
    existing marker row.
11. `triggerBlock` for `run_committed` contains `"Longest distance"` and `"The Long Way Home"` for
    `['longest_distance']` / `['long_way_home']` — **the R8 assertion**: the labels are the shelf's
    labels, not the keys, and an unknown key falls back to itself rather than to `undefined`.

**`tests/nina.cron.test.ts`** — the route, with `evaluateAndEmitForUser` and `listActiveUserIds`
stubbed via `vi.mock`, mirroring `tests/insights.cron.test.ts`:

1. no `Authorization` header -> 401, and `listActiveUserIds` was never called.
2. a wrong bearer -> 401.
3. three users, all quiet -> `{ emitted: 0, quiet: 3, failed: 0 }`.
4. **one user's failure stops nothing:** user 2 rejects, and the response reports
   `failed: 1, quiet: 2` with user 3 having been visited.
5. **the soft deadline:** a stubbed `evaluateAndEmitForUser` that advances a fake clock past
   `NINA_SOFT_DEADLINE_MS - NINA_MIN_SLOT_MS` makes the loop stop and report a non-zero `skipped`
   equal to the number of users not reached. `vi.useFakeTimers()` with `Date.now` advanced by the
   stub, exactly as the rollup test does it.
6. `kinds` tallies by trigger kind, so the report distinguishes "she said four things" from "she
   said the same thing four times".

**No test calls a model and no test touches a database**, per §4.9 and `vitest.config.ts`'s note.

---

## Verification

**Build:** `npm run typecheck && npm run lint && npm run build`
**Guards:** `npm run ci:llm-payload-boundary && npm run ci:openrouter-boundary && npm run ci:client-secret-guard`
(whatever the full `ci:*` set is after phase 1's rewrites — invariant 1 requires all of them).

Note for the payload-boundary guard: **`lib/nina/proactive.ts` and `app/api/cron/nina/route.ts`
must be added to its `SANCTIONED` set** alongside phase 3's `lib/nina/actions.ts`. Rule 2 guards
Nina's turn entry point against render-path callers; a cron route and an `after()` callback are both
legitimate callers and both are outside a render path, which is the whole point of this phase.
`lib/review/actions.ts` becomes a third sanctioned caller for the same reason. If the guard is a
plain grep, the three paths go in its allowlist with a comment naming `after()` as the mechanism.

**Tests:** `npm test` — and specifically
`npx vitest run tests/nina.proactive.test.ts tests/nina.cron.test.ts tests/review.commit.test.ts tests/derived.invalidate.test.ts`
(the last two because Steps 6 and 7 widen types they assert on).

**Manual check, in this order:**

1. `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/nina` — expect
   `{"ok":true,...}` with `quiet` equal to the user count on a day with nothing to say. Then
   `curl` it with no header and expect `401`.
2. Set the `running_days` slot to today's weekday, ensure no run today, and hit the cron between
   18:00 and 23:00 WIB. Expect one bubble in `/nina` asking about it. **Hit it again immediately:
   expect `emitted: 0` and `reason` containing `already asked today`.** That second call is the
   exit criterion, and it is the one to actually run rather than reason about.
3. Commit a run that takes a record — a longer run than any on file. Watch the redirect to
   `/r/[id]` land **immediately**, with no perceptible delay; then open `/nina` and find a message
   naming the record by its shelf label. Check the server log for `[review] nina reacted`.
4. Commit, then immediately edit a split on the same run and commit again. Expect **no** second
   reaction (`isNewRun` is false on the edit).
5. With an unread message, load `/` and see the dot on the Nina tab. Open `/nina`, go back to `/`,
   and the dot is gone.
6. Insert a `nina_avatars` row with `is_current = true` and `announced_at = NULL`, hit the cron,
   and expect an `avatar_changed` message — then hit it again and expect nothing. This is phase
   14's nudge path, tested without phase 14.

**Exit criteria:**

- Committing a run writes a Nina message naming the records and badges that run earned, and the
  commit's redirect is not measurably slower than before the phase.
- A missed usual day fires exactly one message on the day, however many times the cron is invoked.
- The cron returns a report, stops itself before 60 s, and one user throwing changes only that
  user's line in the report.
- The Nina tab shows an unread dot, and opening `/nina` clears it.
- `npm run typecheck && npm run lint && npm test` and every `ci:*` guard pass.

## Handoffs

- **Phase 11 — the notifier.** `ProactiveDeps.notify` defaults to `NOOP_NOTIFIER` in
  `lib/nina/proactive.ts`. Change that one default to phase 11's sender. It is called **after** the
  message rows are committed and inside its own `try`, so a failed push never costs a written
  message. Its arguments are `(userId, bubbles, kind)`: `bubbles` are the persisted rows in reveal
  order, so the notification body is `bubbles[0].body` and its `data.url` is `/nina`.
- **Phase 11 — making an open `/nina` live.** Explicitly not done here, and here is the recipe so
  it is not rediscovered. The service worker's `push` handler already has the event; add
  `clients.matchAll({ type: 'window' })` and `postMessage({ type: 'nina:new' })` to each. In
  `ChatScreen`, a `useEffect` registering a `navigator.serviceWorker.addEventListener('message', …)`
  that calls `router.refresh()`, plus **the `useEffect` on `initial` that phase 4 flagged as
  missing** — `router.refresh()` re-renders the server component and hands `ChatScreen` a new
  `initial`, which its `useState` initialiser will ignore without it. Both edits are in phase 11's
  files or in a component phase 11 is already touching for the subscribe button.
- **Phase 13 — leave `announced_at` NULL.** When the promise-kept avatar swap inserts a
  `nina_avatars` row and flips `is_current`, it must not set `announced_at`. That NULL is trigger
  5, and this phase's cron will make her mention the new picture. **If phase 13 would rather
  announce the swap inside the same chat turn that promised it** — which is arguably better
  storytelling — then it should set `announced_at` itself at that moment, and trigger 5 correctly
  goes quiet. Either is fine; doing neither means she never mentions it, and doing both means she
  mentions it twice.
- **Phase 14 — the nudge is confirmed.** `GET /api/cron/nina` with
  `Authorization: Bearer $CRON_SECRET` is accepted, is safe to repeat, and will emit the
  `avatar_changed` message on the first call after the row lands. Phase 14 needs no change.
- **Phase 9 — `recordNagMention(userId, code, onISO)`.** If phase 9 ships only the computation and
  no write, Step 3's `pattern_crossed` branch falls back to `upsertNinaNag(userId, detail.code,
  { level: detail.nagLevel + 1, lastMentionedOn: facts.todayISO })`. That works, but it puts
  escalation arithmetic in two files, so phase 9 exposing the write is the better landing.
- **A real "app unopened" signal is a separate card.** `evaluateSilence` reads chat silence as the
  proxy, documented in its own docstring. A true last-seen is a `profiles.last_seen_on` touched
  once per day from `AppShell` (cheap: one conditional UPDATE, and `AppShell` already renders on
  every tabbed screen). It is a migration plus a write on a render path, and neither belongs in a
  phase that already carries five triggers.
- **A morning trigger is out of reach, not out of scope.** The Hobby plan caps crons at two and
  both are now spent. "Good luck on your run this morning" needs a paid plan or a merge of the two
  jobs into one route with an hour-of-day switch. Worth a card, not worth a guess.
- **The unread count is not shown as a number.** `NinaUnreadBadge` renders a dot and puts the count
  only in `aria-label`. If a number is ever wanted the component already has it; the container in
  `Tab` would need to grow from `size-2.5` to a pill, and that is a design decision.
- **`ROADMAP_v0.1.0.md` §4.1's "four sanctioned route handlers" is now five.** Phase 1 owns every
  roadmap amendment this cycle (RU-1, RU-2, RU-3, D12) and should add `/api/cron/nina` to that
  list; a second phase editing the same file is a merge conflict for nothing. The sentence to add:
  the fifth handler is a cron, guarded by the same `CRON_SECRET` as the fourth, and D7's reasoning
  for the limit is unchanged by it.

## Rollback

Ordered so the tree is green after each step, which matters because the schema changes are phase
1's and cannot be reverted from here.

1. Delete `app/api/cron/nina/route.ts`, `tests/nina.cron.test.ts`, `lib/nina/proactive.ts`,
   `tests/nina.proactive.test.ts`, `components/nina/NinaUnreadBadge.tsx`.
2. Remove the second entry from `vercel.json`'s `crons` array.
3. Revert `lib/review/actions.ts` to its four-import form: drop the `after` and `emitRunCommitted`
   imports, the `if (outcome.isNewRun)` block, and `occurredOnOf`.
4. Revert the `<TabBar ninaBadge={…} />` line in `AppShell.tsx` to `<TabBar />` and drop its import;
   revert `TabBar`'s parameter to `()` and drop `badge` from `Tab` together with the `<span>`
   wrapper around `<Icon>`.
5. Drop the `after(() => markNinaMessagesRead(userId))` line and the `after` import from
   `app/nina/page.tsx`.
6. Remove the nine appended functions from `lib/nina/queries.ts`.
7. The `maxDuration = 60` exports on `app/x/[extractionId]/page.tsx` and `app/r/[id]/edit/page.tsx`
   are harmless on their own and can stay; they are a ceiling, not a reservation.
8. `CommitOutcome.recordsMoved` / `.isNewRun` and `InvalidateOutcome.recordsMovedToThisRun` can also
   stay — they are additive, they cost one array allocation, and reverting them means re-editing two
   test files. Revert them only if the phase is being abandoned rather than deferred.

**What rollback cannot undo:** the `nina_nags` `trigger:*` rows, the `nina_messages.source` values
and the `nina_avatars.announced_at` timestamps already written. All three are inert without this
phase's code — no query outside `lib/nina/proactive.ts` reads them — so leaving them is correct.
Re-landing the phase after a rollback therefore re-lands into a consistent ledger and will not
re-fire a trigger it already spent, which is the behaviour the durable-marker design was chosen for.
