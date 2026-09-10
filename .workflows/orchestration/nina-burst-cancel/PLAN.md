# Plan: Nina burst cancel — cancel-and-retarget an in-flight turn

**Slug:** nina-burst-cancel
**Date:** 2026-09-10 09:02 WIB
**Analysis:** `20260910-090235-A7C2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-burst-cancel`
**Branch:** `feature/nina-burst-cancel` (base: `origin/main` @ `204fd34`)
**Phases:** 2
**Status:** planned
**Coordinator:** orch-nina-burst-cancel

<The Coordinator line is the peer address of the session driving this set, filled in by
`/analyze-orchestrator` when it takes the set over. Leave it `—`: a name written here by hand
addresses a session that does not exist, and the reports meant for it go nowhere.>

## Why

> there is this scenario:
> 1. user: mau kemana hari ini?
> 2. nina: ... (lagi proses jawab)
> 3. user: dan mau makan apa lunch?
> 4.
>
> in this case, make system cancel no 2 process. and start no 4, but nina now answer BOTH of no 1 and 3.
> so user can "type in fast and press enter", and nina will adapt and as long as she hasn't started answering, she will cancel her current thinking process and answer the accumulated user bubbles

The specification lives in the user's scenario: the cancel is conditional ("as long as she
hasn't started answering"), the restart replaces the cancelled thinking process, and the new
answer covers the accumulated bubbles — both messages, not just the newest.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | When a new send arrives while the current turn is still thinking, CANCEL that turn and start a fresh one in its place | 1 |
| R2 | The fresh turn answers ALL accumulated unanswered user bubbles, not only the newest | 2 |

## Scope

**In scope:** the chat claim's supersede transition; the send path's cancel attempt; the background turn's discard-on-supersede path; the accumulated-bubbles input and prompt block; tests.

**Out of scope:**
- **No client change.** `ChatScreen` already allows fast re-sends (`busy` released on action return), already keeps polling while a claim is pending, and does not branch on `turnId`. The cancel-and-restart is invisible to it by design.
- **No abort of the in-flight model HTTP request.** The superseded turn's invocation finishes its call and discards the result (see Decisions).
- **No change to the burst chain** (`NINA_TURN_CHAIN_MAX`, its bounds) — it remains the path for messages that arrive after she started answering.
- **No change to `resendNinaMessage`'s `'turn-live'` refusal** — a resend stays a recovery tool for dead turns, not a cancel.
- **No schema migration.** `status`/`error_code` on `nina_turns` already express the superseded state; `chatturn.ts`'s no-migration precedent holds.

## Invariants

1. **The tree builds and `npm run lint`, `npm run typecheck`, `npm run test` pass at the end of each phase.**
2. **The cancel and the answer are atomic against each other.** Exactly one of the two writers wins the `nina_turns` row: the send's conditional supersede (`pending`+`running` → `failed`+`superseded`) or the turn's conditional phase advance (`pending`+`running` → `pending`+`persisting`). Neither may be a read-then-write that acts outside its UPDATE's WHERE.
3. **"Hasn't started answering" is exactly `status='pending' AND error_code='running'`.** A `'persisting'` claim is never superseded; the message falls back to today's chain path.
4. **A superseded turn persists nothing.** No bubbles, no distillation, no auto-title, no chain. Its token usage still lands on the row (the money ledger stays honest), and its `error_code='superseded'` is never overwritten.
5. **Zero-byte invariant (prompt layer):** a turn with no accumulated messages renders a user turn byte-identical to today's (`lib/nina/turn.test.ts`'s existing invariant 2 discipline).
6. **No schema change, no migration, `drizzle/` gains no file** (`npm run db:check` clean).
7. **Nothing new may throw for an LLM or DB problem on the send or turn path** — invariant 7's discipline: a failed supersede or ownership check degrades to today's behavior, never loses a persisted message.
8. **No new model-call site.** `scripts/check-llm-payload-boundary.mjs`'s sanctioned caller list is unchanged.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Cancel-and-retarget: supersede a thinking turn, discard its result | R1 | `lib/nina` | 6 (2 prod + 4 test) | — | HARD | `.workflows/plan/nina-burst-cancel/phase-1.md` | — | — |
| 2 | Answer the accumulated bubbles: burst framing in the turn prompt | R2 | `lib/nina` | 5 (3 prod + 2 test) | 1 | NORMAL | `.workflows/plan/nina-burst-cancel/phase-2.md` | — | — |

### Phase 1 — Cancel-and-retarget: supersede a thinking turn, discard its result
**Satisfies:** R1
**Owns:** `lib/nina/chatturn.ts` (the conditional supersede, the ownership read, `ninaChatTurnStore.record` made conditional), `lib/nina/actions.ts` (`sendNinaMessage`'s cancel attempt; `runNinaBackgroundTurn`'s discard path), and their tests.
**Does not touch:** `lib/nina/turn.ts` (prompt layer — phase 2's), the client, the chain's bounds, `resendNinaMessage`.
**Exit criteria:** a send arriving while the claim is `pending`+`running` fails that row as `superseded`, opens and starts a fresh turn, and the old invocation — when its model call returns — writes no bubbles, no distillation, and starts no chain; a send arriving while the claim is `pending`+`persisting` (or already closed) keeps today's behavior; the superseded row keeps its token metrics and its reason.

### Phase 2 — Answer the accumulated bubbles: burst framing in the turn prompt
**Satisfies:** R2
**Owns:** `lib/nina/turn.ts` (`NinaTurnInput` gains the accumulated unanswered runner texts; `userTurnText` renders them), `lib/nina/actions.ts` — `runNinaBackgroundTurn` computes them from the context window it already loaded and passes them through, and the prompt-layer tests.
**Does not touch:** `lib/nina/chatturn.ts` (phase 1's), the claim lifecycle, the client.
**Exit criteria:** a turn opened over a burst of unanswered runner messages carries an explicit block naming every unanswered message except the newest as hers to answer together; a turn with no accumulated messages produces a byte-identical user turn to before (invariant 5); the chain path and the resend path get the same framing for free because it is computed from the window.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| `tests/nina.resend.test.ts` is edited by both phases (1: chatturn consts + factory + `beforeEach` defaults + one assertion; 2: the `@/lib/nina/turn` mock factory + a trailing describe + one import) | 1, 2 | No textual overlap — the regions are disjoint and the dependency edge is the only sequencing. Phase 2's Step 7a rewritten to state this as a fact (verified against phase 1's Files table) and to name the load-bearing part of the ordering: phase 1's `beforeEach` defaults (`supersedeNinaChatTurn`/`chatTurnWasSuperseded` → `false`) are what let phase 2's drained-turn tests reach the normal persistence path. |
| Phase 2 was written blind to phase 1 and hedged its `actions.ts`/resend-test anchors ("if phase 1 has already reworked this factory…") with stale pre-phase-1 line numbers | 1, 2 | Every anchor verified against the source and phase 1's actual insert points: phase 1's STEP 1c cancel sits in `sendNinaMessage` (between `:716` and `:718`) and its ownership exit in `runNinaBackgroundTurn` (between `:982` and `:984`) — neither touches phase 2's two anchors (`recentRunnerTexts` block `:919-923`, `runNinaTurn` input `:937-951`). Wrong current-state line numbers fixed (phase 2: `./turn` import 48→54, resend turn factory 108-115→109-114; phase 1: resend const block 80-91→82-85/87-94); phase 2's Assumptions section rewritten from hedges into verified facts. |
| Ordering constraint implicit: phase 2's window walk and `runNinaTurn` input edit must sit ABOVE phase 1's ownership exit, or the discard could skip a computation the input needed | 1, 2 | Verified true as planned (walk after `:923`, input key at `:949`, exit between `:982` and `:984`). Phase 2's Requires now states it as an explicit constraint ("both MUST STAY ABOVE phase 1's exit; nothing this phase does may move that exit"). |
| Phase 1's Verification assumed a working toolchain; the worktree has no `node_modules` and no `.env.local` | 1 | Added the same prerequisite gate phase 2 already carried: `npm install` + copy `.env.local` from the primary checkout before typecheck/lint/test (`lib/env.ts` parses at import). |
| `tests/nina.chatPhotoReattach.test.ts` — risk note claimed the suite needs its named edit, ownership unclear | 1 | No conflict — checked: the file IS in phase 1's Files table (Step 12), its `importOriginal` spread is at exactly the quoted lines (49-58), and the edit is required: the suite drives the real `sendNinaMessage` over a dummy `DATABASE_URL`, so the new real `supersedeNinaChatTurn` on the send path would reach for the network. `chatTurnWasSuperseded` needs no stub — it is unreachable on that suite's path (`openNinaChatTurn` → null, `after` inert) and catches its own errors anyway. |
| Phase 1's metrics-only fallback arm in `ninaChatTurnStore.record` covers all `status='failed'` rows, not just `superseded` | 1 | No disagreement — checked and left as designed: phase 2 never touches `record` (it mocks it out in the resend suite). The arm's own doc comment already carries the rationale — it also serves the sweep's `'stale'` on a turn that outlived its claim and turned out alive, whose metrics landed before this change and must keep landing; ledger honesty (invariant 4) for stale/crashed turns is the point, and `chatTurnWasSuperseded` still answers false for `'stale'`, so such a turn keeps its answer. |
| Phase 2's `NINA_PROMPT_VERSION` 6→7 bump exceeds the brief's two-production-file scope | 2 | Kept, and recorded as sanctioned scope: phase 1 verified to touch neither `lib/nina/prompts/index.ts` nor `lib/nina/turn.ts` (its Files table owns `chatturn.ts`, `actions.ts`, four test files), so the file's own one-owner-per-set rule holds and the version-6 entry — written for the identical assembler-only change — is the direct precedent. See Decisions. |
| Phase 2's Step 7b cap test was self-contradictory: 7 expected texts under a 6-element cap, and the walk's arithmetic keeps `pesan 2…7`, not `pesan 1…7` | 2 | Fixed in the plan: the expected array is now the six survivors `pesan 2`–`pesan 7` with the walk arithmetic spelled out (collect newest-first, reverse, `.slice(-6)` keeps the newest six — the oldest fall off). |
| Index phase table file counts (3 / 2) did not match the plans' actual file lists | — | Corrected to the real counts including tests: phase 1 = 6 (2 prod + 4 test), phase 2 = 5 (3 prod + 2 test). |
| Analysis impact-point coverage: supersede atomicity, discard path, send-path cancel attempt, accumulated-texts input + render, window-walk producer, tests, client untouched | 1, 2 | No gap — checked: impact points 1-2 and the two new test files → phase 1; impact points 3-4 and `turn.test.ts` → phase 2; the shared `resend.test.ts` is sequenced (row 1). Neither phase's Files table lists anything under `components/nina/**` or `app/nina/**` — the client is untouched by both, as the scope requires. |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Abort the superseded turn's in-flight model HTTP request (DB-poll race) vs let it finish and discard | Let it finish and discard — the cancel runs in a different serverless invocation, so an abort needs a polling harness inside the turn loop to save at most ~20 s of one invocation and tokens already being billed server-side; the complexity lands on the hottest path in the app | 6: surrounding convention — the repo prices a wasted bounded call as acceptable (`runNinaTurn`'s own prose-retry and repair budgets do the same) |
| Where "hasn't started answering" lives: a new column vs `error_code`'s existing phase meaning | `error_code` phase as-is (`'running'` cancellable, `'persisting'` not) — no migration, and the phase boundary already means exactly "the model answered and rows are going in" | 4: the index's scope (out of scope: "No schema migration") |
| Superseded turn's shortcut hits still bump `nina_shortcuts.uses` | Yes — the bump already sits above every early return on purpose, and its own rationale ("a reply she failed to produce does not un-fire it") covers a superseded turn | 3: the plan's code paths as they exist |
| Distillation of a superseded turn's runner message | Skipped on the discard path — same as today's chain, where only each turn's own runner message is distilled; the restart turn's context carries the message, so nothing is permanently lost from what she can see | 3: the plan's code paths as they exist |
| Phase 2's `NINA_PROMPT_VERSION` 6→7 bump exceeds the brief's two-production-file list (reconciliation, prompted by phase 2's flagged scope note) | The bump stays in phase 2, in the same commit as the prompt change — verified phase 1 touches neither `lib/nina/prompts/index.ts` nor `lib/nina/turn.ts`, so the constant keeps exactly one owner in the set; the version-6 entry in the same file is the direct precedent for bumping on an assembler-only change, and without it `nina_turns` cannot distinguish a turn told about the burst from one that wasn't | 7: the surrounding code's convention — the file's own changelog rule, stated by the version-6 entry the identical situation produced |

## Open Questions

*(empty — nothing here; every fork was decided above)*

## Rollback

- **Phase 1:** revert the phase-1 commit. The supersede is additive: without it, `sendNinaMessage` takes the `openNinaChatTurn → null` path exactly as today, and `ninaChatTurnStore.record`'s conditional WHERE is a no-op difference on healthy rows. No data rewrite is involved (only new `failed`/`superseded` rows, inert once written).
- **Phase 2:** revert the phase-2 commit; the prompt block is gated on an optional input that phase 2's only producer stops passing, so the revert restores byte-identical prompts.
- **Whole set:** `git revert` the two commits in reverse order on the branch; no migration to undo, no backfill to reverse.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_BURST_CANCEL_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_BURST_CANCEL_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_BURST_CANCEL_PLAN.md
