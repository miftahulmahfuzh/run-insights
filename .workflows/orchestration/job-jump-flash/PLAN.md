# Plan: The job deep-link landing, in the bubble's own color

**Slug:** job-jump-flash
**Date:** 2026-09-10 09:00 WIB
**Analysis:** `20260910-090042_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/job-jump-flash`
**Branch:** `feature/job-jump-flash` (base: `origin/main` @ `204fd34`)
**Phases:** 1
**Status:** orchestrated
**Coordinator:** orch-job-jump-flash

---

<The Coordinator line is the peer address of the session driving this set, filled in by
`/analyze-orchestrator` when it takes the set over. Leave it `—`: a name written here by hand
addresses a session that does not exist, and the reports meant for it go nowhere.>

## Why

> kita sudah punya teknik "auto point to precise bubble + flicker" pada reply to bubble dan search
> result. namun sekarang image generation job item tidak punya mekanisme ini.
> di halaman Proses foto , klik item teratas dan klik button "Buka chat-nya" , harus nya button
> ini langsung pinpoint to the exact bubble , plus flicker bubble nya.
>
> additional request: kayanya flicker putih di user's bubble masih kurang conspicuous. coba ganti
> warna nya jadi warna yang sama dengan warna user's bubble itu sendiri

The user's R1 premise is answered by the analysis, not by new plumbing: the pinpoint+flicker
mechanism for the jobs deep link is fully wired on `origin/main` and lands through byte-identical
code to a search hit. What the user could not see is the ring on HIS bubble — `#fff`, a 2px white
ring on light sky paper `#c9e9fb`. The mechanism's only missing property is visibility, which is
exactly R2's change. The one new requirement the analysis adds on its own: the phase must PROVE
the chain end-to-end on the real flow, because "the mechanism exists on paper" is not what R1
asked for.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | "Buka chat-nya" must pinpoint the exact bubble and flicker it, like reply-to and search | 1 |
| R2 | The user-bubble flicker color becomes the user bubble's own color | 1 |

R1 and R2 share phase 1 and cannot be split: R1's only live defect IS the R2 color (the analysis
found no broken link in the chain), and a verification-only phase beside a color-only phase would
be one phase with no code and one with nothing to verify against. The coupling is a fact about the
work, not a convenience.

## Scope

**In scope:** the flash ring color on his bubbles (`#fff` → the bubble's own fill, `var(--ink)`),
the three comment blocks that record the white decision, and a live end-to-end verification of the
Proses-foto → "Buka chat-nya" → pinpoint+flicker flow.

**Out of scope:** the `'quote-missing'` degradation for trigger messages older than
`CHAT_HISTORY_LIMIT` (200) — measured population zero today (the dead recent jobs are dead at the
SESSION level, not the window level); a window-around-target server read is a real feature with
poll-cursor consequences nobody asked for yet. The three degraded jump sentences (`avatar`,
`no-message`, `gone`) — already honest. Scroll arithmetic, one-shot param semantics, the
`--nina-flash-count` plumbing, the reduce-mode keyframes — all unchanged.

## Invariants

1. Her bubbles keep blinking `--accent`: `@keyframes nina-flash-blink`'s default
   (`var(--nina-flash-ring-color, var(--accent))`, `app/globals.css:291,303`) is untouched.
2. No behavior change outside the ring color: scroll rules (`planQuoteScroll`, `decideAutoScroll`),
   param lifetimes (`?jump=` consumed; `?s=`/`?at=` survive), blink count, and hold timing are
   byte-preserved.
3. The reduce-mode escapes in `app/globals.css:299-306` still hold still; they read the same
   `--nina-flash-ring-color` variable, so they follow the new color automatically — and
   `tests/motion.reducedMotion.test.ts` must still pass unmodified.
4. The tree builds, lint passes, `vitest` passes at the end of the phase.
5. Every comment this phase rewrites records the NEW owner ask verbatim
   ("warna yang sama dengan warna user's bubble itu sendiri", 2026-09-10) beside the old one it
   supersedes — this codebase's comments are load-bearing history.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Flash the landing in the bubble's own color — and prove the jobs jump end-to-end | R1, R2 | `components/nina` | 3 | — | NORMAL | `.workflows/plan/job-jump-flash/phase-1.md` | P2-CN-A003 | — |

### Phase 1 — Flash the landing in the bubble's own color — and prove the jobs jump end-to-end
**Satisfies:** R1, R2
**Owns:** `components/nina/MessageBubble.tsx` (the ring-color literal :485 + comments :61-64,
:470-483), `app/globals.css` (keyframe header color paragraph :260-266), `lib/nina/search.ts`
(landing prose :331-334); the live verification protocol.
**Does not touch:** `lib/nina/reply.ts`, `lib/nina/chatview.ts`, `lib/nina/jobview.ts`,
`ChatScreen.tsx`, `MessageList.tsx`, the keyframe stops and defaults, tests, schema.
**Exit criteria:** the class reads `[--nina-flash-ring-color:var(--ink)]`; her bubbles still blink
`--accent` (keyframe default untouched); gates green (build, lint, vitest, format-clean); the live
probe from the plan's verification section passes against the real top job on `/nina/jobs` — the
target `nina-msg-<id>` carries `data-flash="true"` and rests in the readable band — or, if the
probe exposes a genuine break in the chain, that break is fixed within this phase and recorded in
the phase file's verification log.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| single phase — nothing to reconcile | — | |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Ring color: a literal (`#1d2733`) vs the token (`var(--ink)`) | `var(--ink)` — the user said "the same color as the user's bubble itself", and the bubble's color IS the theme-flipping token; a light-mode literal would vanish against dark paper `#0e1b26` | 5: user's raw input, read through the token system it names |
| R1 treatment: new plumbing vs color + verification | color + verification — the analysis traced every link (jobview → ButtonLink → ChatScreen → landOn → flash) and found the chain complete and shared with the working search path; measured production data puts the exact top job's target alive and in-window | 1: analysis document (Step 2/3), measured |
| On-screen targets: force a scroll vs keep `'none'` | keep `'none'` — `planQuoteScroll`'s tolerance is deliberate ("the flash alone identifies the target", reply.ts:316) and is shared with quote taps; once the ring is visible, flash-alone is the correct signal | 2: phase exit criteria over an invented behavior change |
| Out-of-window fix: build the window-around-target read now | out of scope — zero measured live cases; real server-read + poll-cursor complexity; recorded in the analysis for a future ask | 3: plan scope boundary, measured |

## Open Questions

None.

## Rollback

Whole set (and each phase — there is one): `git revert` of the phase's single commit on
`feature/job-jump-flash`, or abandoning the branch; `origin/main` is untouched until a merge. The
change is one class literal and comments — no data, no schema, no env, nothing to migrate back.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f JOB_JUMP_FLASH_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f JOB_JUMP_FLASH_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan JOB_JUMP_FLASH_PLAN.md
