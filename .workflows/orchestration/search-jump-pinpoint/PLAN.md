# Plan: Search-result taps pinpoint the bubble like a reply-to tap

**Slug:** search-jump-pinpoint
**Date:** 2026-09-08T14:25 (+07)
**Analysis:** `20260908-142555-A3F7_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/search-jump-pinpoint`
**Branch:** `feature/search-jump-pinpoint` (base: `HEAD` = `9db3113` — the checkout was dirty
and 20 commits ahead of `origin/main`, so the plans are pinned to the tree the analysis read)
**Phases:** 1
**Status:** planned
**Coordinator:** —

## Why

> buat sehingga fitur search bisa mempunyai kapabilitas yang sama [seperti reply-to]. jika user
> klik item di search result, kita langsung masuk ke chat sessionnya, dan langsung scroll ke
> bubble yang di refer oleh search. buat efek yang sama dengan meng klik kotak reply to
> (auto scroll plus ada outline biru pada bubble yang direplied)

The pinpoint mechanism (`?jump=`) already exists, built for the job pages; search just does not
use it, and `?jump=` is not consumed on a same-session soft navigation. One seam, one phase.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Klik item di search result → masuk ke chat session terkait → auto-scroll ke bubble yang direferensikan | 1 |
| R2 | Outline biru pada bubble yang direferensikan — efek yang sama dengan klik kotak reply-to | 1 |

R1 and R2 are served by the same phase because the same mechanism (`?jump=` landing: instant
scroll + flash) delivers both; a phase boundary between them would ship a half-working seam.

## Scope

**In scope:** `searchHitHref`'s grammar; the ChatScreen landing's soft-nav complement; the pure
one-shot guard and its tests; the href tests.

**Out of scope:** `?at=` / `useChatScroll` / `MessageList` restore (R14 contract untouched);
`NinaSearchField`'s render (it already renders `hit.href`); reply-to's own behaviour
(`handleJumpToQuote` unchanged); the search action, SQL, ranking; any DB/env/model surface.

## Invariants

1. The tree builds and `npm run typecheck`, `npm run lint` and `npx vitest run` pass at the end
   of the phase.
2. `?at=`'s contract is untouched: written by `saveMark`, read by the restore, surviving the
   jump strip.
3. `?jump=` stays one-shot in **both** arrival paths: consumed on arrival, stripped from the
   entry **by name** (so `?s=` and `?at=` survive), never re-armed by a back-swipe.
4. Reply-to tap behaviour is byte-unchanged; the search landing **reuses**
   `measureQuoteScroll` / `flashMessage` — no second scroll-and-flash arithmetic.
5. Rules live in `lib/` as pure, tested functions (vitest is `environment: 'node'`, no jsdom).
6. No new motion: the flash is the existing `transition-shadow` ring.
7. Session-title hits (`messageId: null`) open the session plain — no `jump`, no `at`.
8. No third URL grammar: `searchHitHref` delegates to `ninaJumpHref`; `JOB_JUMP_PARAM` stays
   the one spelling.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Search hits deep-link through `?jump=` and the landing survives a same-session soft nav | R1, R2 | `lib/nina` | 5 | — | NORMAL | `.workflows/plan/search-jump-pinpoint/phase-1.md` | — | — |

### Phase 1 — Search hits deep-link through `?jump=` and the landing survives a same-session soft nav
**Satisfies:** R1, R2
**Owns:** `lib/nina/search.ts` (`searchHitHref` + doc), `lib/nina/search.test.ts` (href suite),
`lib/nina/jobview.ts` (the soft-nav one-shot guard, appended), `tests/nina.jobview.test.ts`
(guard tests, appended), `components/nina/ChatScreen.tsx` (landing extraction + watcher).
**Does not touch:** `MessageList`, `MessageBubble`, `useChatScroll`, `scroll.ts`, `reply.ts`,
`NinaSearchField`, `app/nina/page.tsx`, the search action.
**Exit criteria:** a message hit's href is `/nina?s=<sid>&jump=<mid>` (session hit: `/nina?s=<sid>`),
produced by `ninaJumpHref`; a jump arriving on a soft nav (no remount) scrolls instantly and
flashes exactly as the mount path does, once, and strips itself from the entry; the mount path's
behaviour is unchanged; all gates green.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| — | — | single phase — nothing to reconcile |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Reuse `?jump=` vs extend `?at=` with a flash | `?jump=` — `jobview.ts`'s four-reason contract (arithmetic, no offset to give, opposite lifetimes, coexistence) already settles it for any arrival that never measured the conversation | 1: plan invariant 8 / existing code contract |
| Same-session soft nav: watcher effect vs adding `jump` to the ChatScreen key | watcher effect — a key change remounts and loses the composer draft, a regression `?at=` does not have today | 6: surrounding convention + tie-break "narrower blast radius" |
| Where the one-shot guard lives | `lib/nina/jobview.ts`, appended — it is `JOB_JUMP_PARAM`'s rule, and interleaving into that file invites conflicts with the unmerged `origin/main` land | 5: task scope / file ownership |
| The strip effect's header forbids "a third `replaceState`" | The watcher's strip is a sanctioned second writer — the header's real rule is "never two writers in ONE commit", and the watcher writes in the navigation's commit, which the `[]`-deps effect does not run in; the header is amended to say so rather than left contradicting the code | 6: surrounding convention (tie-break: reversible, narrower blast radius) |

## Open Questions

*(empty — nothing here is irreversible)*

## Rollback

Single phase, single revert: `git revert <phase commit>` restores the `at=` href and removes the
watcher. No migration, no data.

## Next

Execute the phase:

    /implement -f SEARCH_JUMP_PINPOINT_PLAN.md --phase 1

Or run it as a one-phase swarm:

    /analyze-orchestrator -f SEARCH_JUMP_PINPOINT_PLAN.md
