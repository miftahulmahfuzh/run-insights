# Plan: Nina duplicate answer bubbles — idempotent reveal append

**Slug:** nina-dup-bubble-reveal
**Date:** 2026-09-11 12:00 WIB
**Analysis:** `20260911-120011-EGEX_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-dup-bubble-reveal`
**Branch:** `feature/nina-dup-bubble-reveal` (base: `origin/main` @ `285805f`)
**Phases:** 1
**Status:** planned
**Coordinator:** —

## Why

> coba cek prod session chat terbaru (nama chat session nya "gj") disitu nina ngasih jawaban duplikat , total dia harus nya jawab cuma 4 bubble, tapi 3 bubble terakhir di duplikat, jadi dia jawab total 7 bubble. please find out the root cause

The database holds exactly 4 rows for the reported turn; the screen rendered 7. Root cause (measured, in the analysis document): `revealBubbles` appends polled bubbles without an id check, and a full-route RSC delivery landing mid-reveal pre-delivers the same rows through `mergeServerMessages`. Two channels, one list, only one idempotent.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Find the root cause of Nina's duplicate answer bubbles in prod chat "gj" (4 expected, last 3 duplicated → 7 shown) | 1 |

## Scope

**In scope:** the client-side append path — one pure append-decision function in `lib/nina/`, its call site in `revealBubbles`, unit tests. Nothing server-side, nothing in the DB.

**Out of scope:** data repair (nothing to repair — the DB is clean), the poll/cursor protocol, `mergeServerMessages` itself, the reveal *schedule* (`planReveal` is untouched), identifying which event fired the racing render (indeterminate from retained telemetry; the fix is trigger-independent), and Web Push plumbing.

## Invariants

1. The tree builds and `npm test` passes at the end of the phase (`npx tsc --noEmit` included — vitest does not typecheck).
2. No server behavior changes: same rows, same writes, same poll contract.
3. The staggered reveal (RU-5) is unchanged on the happy path: `planReveal`'s gaps, the typing indicator between bubbles, and the sole-appender role of `revealBubbles` all hold.
4. A mid-reveal merge may collapse the remaining stagger (bubbles appear at once) but must never render one `nina_messages.id` twice.
5. `mergeServerMessages`'s contract ("same array reference when nothing changed") is untouched.
6. New prose in touched files matches the surrounding comment density and argument style of `ChatScreen.tsx` / `lib/nina/live.ts` — this repo treats the reasoning as load-bearing.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Idempotent reveal append (pure helper + call site + tests) | R1 | `components/nina`, `lib/nina` | 3 | — | NORMAL | `.workflows/plan/nina-dup-bubble-reveal/phase-1.md` | — | — |

### Phase 1 — Idempotent reveal append
**Satisfies:** R1
**Owns:** the append decision inside `revealBubbles` (`components/nina/ChatScreen.tsx`), a pure `appendNewBubbles`-style helper in `lib/nina/reveal.ts` or `lib/nina/live.ts`, and its unit tests.
**Does not touch:** `pollNinaReply`, the cursor protocol, `mergeServerMessages`, `planReveal`'s schedule arithmetic, any server module, any DB migration.
**Exit criteria:** for every interleaving of (poll batch, merge delivery) — none, partial overlap, full overlap — the rendered list contains each `nina_messages.id` at most once; `appendNewBubbles` returns the same array reference when nothing is new; `npm test` and `npx tsc --noEmit` pass.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| single phase — nothing to reconcile | — | — |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| guard the reveal only, vs. also making the merge reveal-aware (route new nina rows through the stagger) | guard the reveal only — it is the minimal change that makes both channels idempotent; a mid-reveal merge collapsing the remaining stagger is cosmetic and rare, and restructuring the merge would put a second writer on the reveal's rhythm | 4: user's raw input asks for the root cause's removal, not a redesign; `ChatScreen`'s header already rules the merge the sanctioned one-frame delivery |

## Open Questions

(none — every fork was decidable from the evidence; the racing render's trigger is indeterminate but does not fork the fix)

## Rollback

Revert the single commit on `feature/nina-dup-bubble-reveal`; no migrations, no data, no config. The set as a whole rolls back the same way — one branch, one merge.

## Next

Execute the phase:

    /implement -f NINA_DUP_BUBBLE_REVEAL_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f NINA_DUP_BUBBLE_REVEAL_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_DUP_BUBBLE_REVEAL_PLAN.md
