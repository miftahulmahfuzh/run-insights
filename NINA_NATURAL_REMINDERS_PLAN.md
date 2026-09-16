# Plan: Nina natural-language recurring reminders

**Slug:** nina-natural-reminders
**Date:** 2026-09-16 14:41 WIB
**Analysis:** `20260916-144113-1VCB_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-natural-reminders`
**Branch:** `feature/nina-natural-reminders` (base: `origin/main` @ `991bcb9`)
**Phases:** 1
**Status:** planned
**Coordinator:** —

---

## Why

The user's own words (verbatim, from the analysis document's User Input section): he asked Nina, in
ordinary chat prose, to remind him every day at 8:45 PM to sleep, having just discussed with Gemini
why sleep *timing* and *consistency* matter — deep sleep concentrates in the first half of the
night, and consistent sleep/wake timing does more for hormonal and metabolic health than the exact
clock hours chosen. He wants Nina to actually check in with him daily at that time, in character, as
a friend would — not a one-off acknowledgement.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Recognize a natural-language "remind me daily at TIME to X" request in chat, confirm it in Nina's own reply, and actually deliver a chat message + push notification at that time every day thereafter, with no duplicate per day. | 1 |

## Scope

**In scope:**
- A new optional `reminders` field on `SEND_TOOL`'s payload (parallel to the existing
  `memoryWrites`), so the model can express "create a reminder" or "cancel a reminder" alongside
  the reply it was already producing — no extra model round trip.
- Server-side validation of that field (Zod), and a small applier that persists reminders into the
  existing `nina_memory_slots` `jsonb` mechanism (the same one `pending_promises` already uses) —
  **no new table, no migration.**
- A sixth `ProactiveTriggerKind`, `reminder_due`, wired into the existing evening engine
  (`lib/nina/proactive.ts`) exactly like the other five: a pure evaluator, a priority-list entry, a
  `PROACTIVE_COPY` instruction, and idempotent marking (this trigger's marker lives in the
  reminder's own slot entry — `lastFiredOn` — not in `nina_nags`, because a reminder's identity is
  its own record, not a shared code ledger).
- A new Jakarta-minute wall-clock helper (`HH:mm`), since nothing in the codebase currently reaches
  finer than the hour.
- Moving the existing (and ONLY) `/api/cron/nina` Vercel cron schedule later, so its actual
  (imprecise, Hobby-plan, "within the hour") firing window brackets 20:45 WIB, and updating that
  route's header comment to match — see Decisions for the exact new time and why no new cron job is
  added.
- `NINA_PUSH_KINDS` gains the sixth value, matching the existing four-of-five-triggers-already-there
  pattern.
- Active reminders become visible to the model in its per-turn context (mirroring how
  `pending_promises` already is), so it can reference an existing reminder's id to cancel it and
  avoid creating a duplicate for a request already fulfilled.
- Tests: a new pure-function test file for the reminders module, plus extensions to the existing
  proactive/prompts test files that already assert priority-ordering and cross-list parity.

**Out of scope, and why:**
- **A new Vercel cron job, or any change of Vercel plan.** The account is on Hobby (2-cron cap,
  daily-only schedules); this feature is built to fit inside the existing single evening cron
  entirely. A user who later wants a *morning* reminder cannot be served precisely by this
  mechanism without either a plan upgrade or a second cron slot — that is a real limitation of the
  chosen approach and is recorded under Decisions, not silently hidden.
- **Multiple simultaneous reminders competing for delivery on one tick.** The existing proactive
  engine already delivers **at most one** message per user per cron tick, across all six triggers
  combined, by design ("two proactive openers in one evening is not twice as proactive, it is
  spam"). A reminder is not exempt from that rule; if two reminders are due on the same tick, the
  earliest `timeOfDay` wins and the other is picked up the following day. For the one reminder this
  request actually describes, this never bites.
- **A UI for managing reminders** (a settings screen, a list view). The user asked for a chat-driven
  feature; create/cancel both happen through ordinary conversation with Nina, exactly like every
  other piece of memory in this app.
- **Editing an existing reminder's time via a partial-update tool call.** `cancel` + a fresh
  `create` covers "change my reminder to 9pm" in one turn (the model can emit both in the same
  `reminders` array) without a third `action` value to validate and test.

## Invariants

- The tree builds (`npx tsc --noEmit`) and the full test suite passes at the end of the phase.
- No new Vercel cron job is introduced; `vercel.json` still lists exactly two `crons` entries.
- No new database table or migration; reminders are `jsonb` inside the existing
  `nina_memory_slots` table, same as `pending_promises`.
- At most one proactive message (of any of the six trigger kinds) is emitted per user per cron
  tick — the existing `decideProactive` "return the first that fires" contract is preserved, not
  bypassed for reminders.
- A reminder's durable "fired today" marker is written **only after** its message rows are
  committed — the same ordering `emitProactiveMessage` already enforces for the other five
  triggers, so a mid-flight failure is retried by the next tick rather than silently lost.
- `NINA_PUSH_KINDS` (`lib/push/payload.ts`) and `ProactiveTriggerKind`
  (`lib/nina/prompts/system.ts`) stay in the pinned relationship the codebase already relies on
  (`npx tsc --noEmit` fails at the `pushNotifier satisfies ProactiveNotifier` seam if they drift).
- Every new decision function (reminder-due evaluation, reminder-write application, the slot
  parser) is a pure function over a plain input object, unit-tested with no database and no model
  call — the convention every existing file in this area (`nags.ts`, `promise.ts`, the pure half of
  `proactive.ts`) already follows.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Natural-language recurring reminders | R1 | `lib/nina`, `lib/db/schema`, `lib/push`, `app/api/cron`, root config | 18 | — | HARD | `.workflows/plan/nina-natural-reminders/phase-1.md` | — | — |

### Phase 1 — Natural-language recurring reminders
**Satisfies:** R1
**Owns:** everything in Scope above — schema/tool, pure reminders module, proactive-engine wiring,
context visibility, push-kind registration, cron schedule move, tests.
**Does not touch:** anything under Out of scope above.
**Exit criteria:** `npx tsc --noEmit` and the full `vitest` suite pass; a new
`tests/nina.reminders.test.ts` exercises create/cancel/due/idempotent-fire as pure functions; the
existing cross-list parity tests (however they currently assert `ProactiveTriggerKind` /
`NINA_PUSH_KINDS` / tool-schema completeness) pass with the sixth trigger included; `vercel.json`
still has exactly two `crons` entries.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| New table vs. existing `jsonb` memory slot for reminder storage | Reuse `nina_memory_slots` (a new `reminders` key), exactly the way `pending_promises` already stores a list of due-tracked records — no migration. | 6: surrounding convention (this codebase's own established pattern for "a schedule-tracked list per user") |
| Standalone tool (`set_reminder`, round-trip) vs. inline field on `SEND_TOOL` | Inline `reminders` field on `SEND_TOOL`, parallel to `memoryWrites`. `lib/nina/turn.ts:944-954` shows a `send` tool_use in the same message wins immediately and drops sibling tool_use blocks undispatched — a standalone tool risks being silently dropped the moment the model also calls `send`, and costs an extra round trip when it isn't. | 5: the plan's own code (turn.ts's documented, measured control flow) |
| Where the "already fired today" marker lives for `reminder_due` | In the reminder's own slot entry (`lastFiredOn`), not in `nina_nags`. `nina_nags` is keyed by a shared `code` with `level`/`count` columns for an escalation ladder that does not apply to a reminder — a reminder has no anger rung, and its identity (time, label, message) has no home in that table. | 1: stated invariant (this plan's "no new table" invariant, applied to where the marker itself lives) |
| No existing Jakarta-minute helper — where to add `HH:mm` "now" and comparison | Add it beside the other Jakarta-time helpers in `lib/nina/proactive.ts` (next to `jakartaHourOf`/`jakartaWeekdayOf`), not in `lib/date/ranges.ts`. Those two already live in `proactive.ts` for the stated reason that the DATE side goes through `todayInJakarta` while the HOUR side is proactive-engine-specific arithmetic; a minute-resolution sibling is the same kind of arithmetic, for the same one caller. | 6: surrounding convention |
| `reminder_due`'s position in `PROACTIVE_PRIORITY` | Front of the list — ahead of `avatar_changed`. The other five triggers are things Nina *infers*; a reminder is a promise the runner explicitly extracted from her ("tolong lo remind gw"), and missing it because a lower-stakes inferred trigger won the single-message-per-tick slot would be the one failure mode a user actually notices and is upset by. | 4: the plan's Why (the user's own request is a standing, explicit ask — the strongest kind of claim on her one message) |
| Cron schedule: what time to move `/api/cron/nina` to | `"0 13 * * *"` (13:00 UTC = 20:00 WIB). Vercel Hobby fires "within the hour" of the declared time, so the real window becomes ~20:00–21:00 WIB, comfortably bracketing the requested 20:45. `MISSED_DAY_EVENING_HOUR = 18` / `MISSED_DAY_LATEST_HOUR = 23` both still admit this window without any change, so the four pre-existing evening triggers are unaffected beyond firing roughly an hour later than they do today. | 3: the plan's code (this file's own invariants) plus 6: convention (the same "within the hour" tolerance the route's header already documents and relies on for the existing triggers) |
| A reminder due earlier than the cron's firing window (e.g. a hypothetical 7 AM ask) | Explicitly unsupported by this phase — recorded under Out of scope. Building the due-check generically (compare stored `HH:mm` to "now," fire once per day, no earlier) costs nothing extra, but this Hobby-plan single daily cron cannot deliver a morning reminder on time, and pretending otherwise would be building a feature that quietly fails for a future request. Not an Open Question: there is no fork here to leave to a human, because the mechanism is built correctly and the limitation is stated plainly rather than "solved" by inventing a second cron job this plan is not authorized to add. | 1: stated invariant (no new cron job) |

## Open Questions

None. Every fork above has an irreversible-free resolution stated and recorded.

## Rollback

Revert the branch / discard the worktree; nothing outside it is touched (no migration, no
production data write, no cron job added or removed — only the existing one's `schedule` string
changes, which reverts with the same commit revert). If the schedule move alone needs to be undone
independently of the rest of the feature, reverting just the `vercel.json` line puts the evening
triggers back on their original ~19:00–20:00 WIB window with no other code path affected.

## Next

Execute the phase:

    /implement -f NINA_NATURAL_REMINDERS_PLAN.md --phase 1
