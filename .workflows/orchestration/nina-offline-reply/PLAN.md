# Plan: Nina answers regardless of the app — close the three offline-reply gaps

**Slug:** nina-offline-reply
**Date:** 2026-09-11 12:42 WIB
**Analysis:** `20260911-124226-N1RA_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-offline-reply`
**Branch:** `feature/nina-offline-reply` (base: `origin/main` @ `c6a56b7`)
**Phases:** 2
**Status:** planned
**Coordinator:** —

## Why

> coba buat nina ngejawab pesan itu tidak dependent dengan user membuka app halaman chat atau tidak. ketika user sudah mengirim pesan, nina harus menjawabnya regardless user udah nutup app nya / offline.
> nanti, ketika user buka chat nya, jawaban nina sudah langsung kelihatan sebagai part of chat history di chat session itu

The persist-then-background-turn architecture this asks for already ships (`nina-burst-cancel`, merge `64c3d4b`): the runner's row is written before the response, `runNinaBackgroundTurn` runs inside `after()` on the server's wall clock, and her bubbles are ordinary `nina_messages` rows the next render reads. This set does not rebuild that — it closes the three measured gaps where visibility or answering still depends on a client being open, and the one case where "harus menjawab" still needs a human tap (analysis G1–G3).

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Nina answers a sent message regardless of the app being closed / device offline — no client involvement in answering | 2 |
| R2 | On reopening the chat, her answer is immediately visible as part of that session's history | 1, 2 |

## Scope

**In scope:** the cold load's in-flight truth (claim read), the open tab's give-up backstop, and a bounded revive-on-arrival for dead turns. Files: `lib/nina/turnflight.ts`, `app/nina/page.tsx`, `components/nina/ChatScreen.tsx`, `lib/nina/actions.ts` (runner relocation only), a new runner module `lib/nina/turnrun.ts`, a new revive module `lib/nina/turnrevive.ts`, `scripts/check-llm-payload-boundary.mjs` (sanctioned-list entries only), and their tests.

**Out of scope:** push notifications for landed replies (history-on-open already delivers R2's letter); any cron change (Hobby cap = 2, both used); the describe pre-pass; `resendNinaMessage` and its UI (stays as the manual override); the send path's synchronous half (STEP 0–1c stays byte-for-byte); prompt/tuning layers.

## Invariants

1. **Persist-before-model-call is untouched.** The runner's row is committed before the response and before any turn — the send path's ordering is the contract R6 stands on.
2. **No migration, no schema change.** `nina_turns` keeps exactly one index (`tests/db.schema.nina.test.ts` pins it); attempt counts walk `nina_turns_user_created_idx` newest-first in the heap.
3. **No model call awaited in a render path.** Revive reads, decides, and schedules via `after()`; the page only ever awaits cheap indexed reads. `maxDuration = 300` stays literal on `app/nina/page.tsx`; revive inherits the segment's budget (`NINA_BACKGROUND_BUDGET_MS` pairing).
4. **No new exported server actions.** Every `'use server'` export is an untrusted POST endpoint; `runNinaBackgroundTurn` (whose input carries a raw `userId`) must become importable by non-action code without becoming callable by a client.
5. **One definition of "unanswered"** — the cold load and the poll share the `fresh-claim || heuristic` disjunct, and `lib/nina/turnflight.test.ts` keeps asserting their agreement.
6. **Invariant 7 (no app-authored prose in her mouth) and invariant 5 (image descriptions as text only) are untouched** — revive reuses the turn pipeline, it does not write bubbles.
7. **The tree builds and tests green at the end of each phase** (`next typegen && tsc --noEmit`, `vitest run`).

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | In-flight truth on reopen: claim-read cold load + honest give-up | R2 | `lib/nina` + page/screen | 5 | — | NORMAL | `.workflows/plan/nina-offline-reply/phase-1.md` | — | — |
| 2 | Self-repair on arrival: revive dead chat turns when the session opens | R1, R2 | `lib/nina` + page | 6 (3 new: 2 modules + 1 test) | 1 | HARD | `.workflows/plan/nina-offline-reply/phase-2.md` | — | — |

### Phase 1 — In-flight truth on reopen
**Satisfies:** R2
**Owns:** `app/nina/page.tsx` reads `getPendingNinaChatTurn` for the active session and the cold-load `awaiting` becomes the poll's own disjunct (`fresh claim || ninaAwaitingByMessage`) instead of the 90 s heuristic alone (G1). `NINA_TURN_POLL_GIVE_UP_MS` moves from the 90 s identity to `NINA_BACKGROUND_BUDGET_MS` (G2); `ChatScreen`'s give-up comment is rewritten to the new rationale (the server's `awaiting: false` is the real stop; the backstop's remaining job is the unreachable server). `lib/nina/turnflight.test.ts` asserts the new agreement and the budget pairing.
**Does not touch:** the send path, `chatturn.ts` writers, the revive, the reveal/poll mechanics, any constant except the give-up.
**Exit criteria:** reopening `/nina` while a turn or chain is genuinely live (any age up to the budget) starts the typing indicator and the poll, and bubbles land without a refresh; a dead turn still stops the poll via the server's own `awaiting: false` within ~90 s; typegen + tsc + vitest green.

### Phase 2 — Self-repair on arrival
**Satisfies:** R1, R2
**Owns:** a new server-only (non-`'use server'`) revive module: on `/nina` render of a session, sweep stale chat claims, and if the newest row is his, no fresh claim exists, and the attempt cap allows, open a claim and schedule `runNinaBackgroundTurn` via `after()` (G3). `runNinaBackgroundTurn` + `NinaBackgroundTurnInput` + `SentBubble` + the private `runNinaDistillation` move to a non-action server module (`lib/nina/turnrun.ts`) so the revive shares the runner without exporting a new action endpoint (invariant 4); `actions.ts` re-imports the runner for its `after()` seam and type-re-exports `SentBubble` for `ChatScreen`. `scripts/check-llm-payload-boundary.mjs` gains `lib/nina/turnrun.ts` in two sanctioned lists. The page composition is pinned: the revive is awaited between `chooseActiveSession` and the `Promise.all`, phase 1's claim read stays that `Promise.all`'s sixth element, and `ninaFlightView` consumes it — sessions read → `chooseActiveSession` → `await reviveNinaChatTurn` → `Promise.all` (incl. the claim read) → flight view (the G1×G3 ordering trap; reconciled, no fork). Attempt cap: count prior `kind='chat'` turns whose `args->>'runnerMessageId'` matches, walked newest-first over the one pinned index; cap is small (3 total attempts per runner message, send included).
**Does not touch:** `turnflight.ts`'s flight predicates (Phase 1 owns them), `ChatScreen`, phase 1's claim read and its seam comment inside the page, the cron routes, `resendNinaMessage` (unchanged, still the manual override).
**Exit criteria:** a message whose turn died (claim swept `stale`) is answered automatically the next time its session is opened, with no tap; a permanently-unavailable message costs at most the cap, then never again; a live claim suppresses revive entirely; renders with nothing to revive pay a few indexed reads; typegen + tsc + vitest green.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| Both phases edit `app/nina/page.tsx`; phase 2's revive placement was written as a fork ("move the claim read out of the `Promise.all`" vs "land before it") because the plans were written in parallel | 1, 2 | PINNED, fork deleted from both plans: phase 2 hoists `await reviveNinaChatTurn(...)` above the `Promise.all` and relocates nothing — phase 1's claim read stays its sixth element (`pendingTurn`), consumed by `ninaFlightView(rows, Date.now(), pendingTurn?.createdAt ?? null)`. Final page sequence: sessions read → `chooseActiveSession` → `await reviveNinaChatTurn` (only when `activeSessionId !== null`) → `Promise.all` (incl. the claim read) → flight view. Since the `Promise.all` is awaited after the revive, the read already observes the sweep and any fresh claim. Phase 1's seam comment and Handoffs now state this one composition; phase 2's step 4 quotes phase 1's actual final page (destructure, sixth element, flight call) instead of the base page |
| Deleted-then-used: phase 2 moves `SentBubble`/`NinaBackgroundTurnInput`/`runNinaBackgroundTurn`/`runNinaDistillation` out of `actions.ts` | 2 | Verified against source: the only external importer is `components/nina/ChatScreen.tsx:16` (`type SentBubble`), covered by the planned `export type { SentBubble }`; `startNinaBackgroundTurn` (stays) needs the runner + input type, covered by the planned `turnrun` import; `NinaReplyPoll.bubbles: SentBubble[]` (stays) covered by the same import; `runNinaDistillation`'s only two call sites sit inside the moved runner. Tests (`nina.resend`, `nina.burstCancel`, `nina.sendDescriptions`) reference the moved names only in comments and drain through the unchanged seam with edge mocks that already cover every name `turnrun.ts` imports — the move is invisible to them |
| Broken build: phase 2's `turnrun.ts` import block omitted `listNinaMessages`, which the moved chain actually calls (`actions.ts:1658`, the follow-up link's newest-row read) | 2 | Added `listNinaMessages` to the `./queries` import in phase 2's step 1b (the new test's queries mock already listed it, so the suite stays honest). Every other moved-region identifier was re-derived from the four regions with comments stripped: the import block is now exactly complete |
| Broken build (anchor): region 4's docstring starts at `actions.ts:2203`, not 2206 — the planned range would have cut the `/**` opener mid-comment and left a dangling `*/` | 2 | Corrected to `2203–2255` in the step 1a table and the step 1b marker; the file is 2255 lines, so "through end of file" now reads exactly |
| Broken build (count): the `queries` rewrite said "the other eleven names stay" — the import holds fifteen names and drops three | 2 | Corrected to twelve, matching the rewritten block's twelve names |
| Broken build (test): phase 2's new drain test mocks HIS row as the newest; the drained turn's chain then re-fires `runNinaTurn` down to `NINA_TURN_CHAIN_MAX` (3 calls) and `expect(runNinaTurn).toHaveBeenCalledOnce()` fails | 2 | The test now re-points `listNinaMessages` at HER row before draining — the revive has consumed its candidate read, the chain read exits on `role !== 'runner'`, and the arrangement is the resend suite's own fixture (`tests/nina.resend.test.ts:173`) |
| Duplicate work / file ownership | 1, 2 | Disjoint and now stated: `turnflight.ts` + `turnflight.test.ts` + `ChatScreen` + the claim read + its seam comment → phase 1 only; `turnrun.ts` + `turnrevive.ts` + the `actions.ts` surgery + the revive call + the guard script → phase 2 only. The page is the one shared file and the two edit regions do not overlap (phase 2 inserts one import and one statement between `chooseActiveSession` and the `Promise.all`) |
| Scope creep: two comment-only fixes ride along with phase 1 | 1 | Both verified against source and KEPT — each states a fact phase 1 makes false, not style: `ChatScreen`'s flight-prop docstring claims "zero extra queries … not a fifth read" and "a cold load has no claim row in hand" (both false once the page reads the claim as a sixth element), and `lib/admin/imageGenTestView.ts:200-206` argues from "`NINA_TURN_POLL_GIVE_UP_MS` is deliberately set to the server's own deadline" — the exact identity step 2 ends |
| Guard entries: phase 2 adds `lib/nina/turnrun.ts` to `scripts/check-llm-payload-boundary.mjs` | 2 | Verified exact: the guard greps `\bSYMBOL\s*\(` over non-test `.ts` under `app/ lib/ components/`; the moved regions call `runNinaTurn(` and `titleNinaSessionIfNeeded(`, so `turnrun.ts` fails both lists without the entries; `reviveNinaChatTurn`/`runNinaBackgroundTurn` match no guarded symbol and `distillNinaMemory` needs nothing (the moved code calls unguarded `runTurnDistillation`). The quoted entries match the script's current arrays plus the one addition each |
| Index drift: phase-1 Files said 4 (plan touches 5), phase-2 Files said "4 (+1 new module)" (plan touches 6) | index | Corrected: phase 1 → 5 (`turnflight.ts`, `page.tsx`, `ChatScreen.tsx`, `turnflight.test.ts`, `imageGenTestView.ts`); phase 2 → 6, 3 new (`turnrun.ts`, `turnrevive.ts`, `tests/nina.turnrevive.test.ts` + `actions.ts`, `page.tsx`, `check-llm-payload-boundary.mjs`). Scope's file list extended to match |
| Phase 1 builds alone | 1 | Verified: no reference to `turnrun.ts`/`turnrevive.ts` anywhere in phase-1.md; `actions.ts` untouched by phase 1, so the relocation cannot land under it. Phase 1's gates: `turnflight.test.ts`, `nina.burstCancel.test.ts`, `chatturn.test.ts`, then `npm test` |
| Phase 2 builds after phase 1 | 2 | The relocation compiles independently of phase 1's page edit (different files), and its step 4 applies on top of phase 1's page. Gates: `nina.turnrevive.test.ts` (new), `nina.resend`, `nina.burstCancel`, `nina.sendDescriptions`, `nina.jobActions`, full `vitest run`, `ci:llm-payload-guard`, `db:check` |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Revive-on-arrival vs `chatturn.ts`'s standing "no automatic retry on a render path" | revive on arrival, bounded — the user asked for "harus menjawabnya regardless" by name, which is the render-path recovery that note declined | 6: user's raw input |
| Give-up identity (`POLL_GIVE_UP_MS == NINA_TURN_STALE_MS`, test-asserted) vs the server's 240 s honest wall clock | backstop = `NINA_BACKGROUND_BUDGET_MS`; the server's `awaiting: false` is the real stop, the backstop covers the unreachable-server case | 3: analysis measurement (G2) |
| Cold-load awaiting: widen the 90 s heuristic window vs read the claim | read the claim — `pollNinaReply`'s disjunct, one indexed read, no false typing past a swept claim | 3: analysis measurement (G1) |
| Revive trigger: cron vs page arrival | page arrival — Hobby caps crons at the 2 already used, and `reviveNinaImageJobs` is the shipped precedent | 7: surrounding convention |
| How revive shares `runNinaBackgroundTurn` without widening the action surface | move the runner + input type to a server-only non-action module; actions.ts keeps the `after()` seam | 4: invariant 4 |
| Attempt cap without a new index | count matching `kind='chat'` rows newest-first over `nina_turns_user_created_idx`, heap-filtered; cap 3 per runner message | 2: schema pin test |
| G1×G3 composition: hoist the revive above the page's `Promise.all` vs relocate phase 1's claim read under the revive | hoist the revive; the claim read stays the `Promise.all`'s sixth element — the block is awaited after the revive, so the read observes it with zero relocation | 3: analysis measurement (the G1×G3 ordering trap) |

## Open Questions

None — every fork above was decidable from the analysis and is recorded with its rung, and reconciliation left no fork undecided: the one composition fork (revive placement vs claim-read relocation) was fully reversible and is pinned as a decision above, not an open question.

## Rollback

- **Phase 1:** revert the branch's first commit range — the give-up constant and the claim read are additive reads; the pre-Phase-1 behavior (heuristic-only cold load, 90 s give-up) is restored exactly.
- **Phase 2:** stop calling the revive from the page (one line) — the module and the runner relocation are inert without a caller; or revert the phase commit range. `resendNinaMessage` and the send path never changed, so manual recovery survives every rollback state.
- **Whole set:** `git merge` was never the vehicle — the branch lands as a normal merge to `main` after gates; reverting the merge commit restores today's behavior wholesale.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_OFFLINE_REPLY_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f NINA_OFFLINE_REPLY_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_OFFLINE_REPLY_PLAN.md
