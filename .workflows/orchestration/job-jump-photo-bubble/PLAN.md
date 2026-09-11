# Plan: Job jump targets the earliest bubble carrying the photo

**Slug:** job-jump-photo-bubble
**Date:** 2026-09-11 11:31 WIB
**Analysis:** `20260911-113127_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/job-jump-photo-bubble`
**Branch:** `feature/job-jump-photo-bubble` (base: `origin/main` @ `f1b0394`)
**Phases:** 1
**Status:** complete
**Coordinator:** —

<The Coordinator line is the peer address of the session driving this set, filled in by
`/analyze-orchestrator` when it takes the set over. Leave it `—`.>

## Why

> pada halaman Proses foto -> Detail foto. bisa ga ya tombol ke pesan pemicu ini, logicnya diganti jadi:
> the earliest chat bubble accross all chat sessions that attached this image (it could be nina's bubble, or user's own bubble)

The jump button on Detail foto currently targets `args.replyToId` — the bubble that *asked*. It fails on the fourteen measured production rows whose reply target resolves to nothing, and it never points at a bubble that shows the photograph. The user replaces the rule: point at the earliest bubble, in any session, that attached the job's photograph — Nina's carrier bubble or the runner's own re-attach alike.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | The Detail foto jump button targets the **earliest chat bubble, across ALL chat sessions, whose message attached this job's image** — Nina's bubble or the runner's own bubble alike. | 1 |

## Scope

**In scope:** the jump's target-selection rule (`planJobJump`), one new owner-scoped read beside `getNinaJobPhoto` (original + flattened-reference bubbles, earliest first), the refusal vocabulary (`no-message` + `gone` collapse into one arm; `avatar` kept), removal of the now-dead `replySessionId` resolution and its second read in `getNinaImageJobDetail`, page wiring, both test files.

**Out of scope:** the landing side (`?s=` + `?jump=`, `nextSoftNavJump`, the flash — already session-agnostic), `getNinaJobPhoto` itself and the photo icon (`planJobPhoto` — unchanged), the composer attach path (`resolveAttachment` — the reference writer this rule only reads), `/admin/photos`, any schema migration or index, the redo path (`args.replyToId` stays in the job args for re-fire — `jobActions.ts:122`, `imagerun.ts`), the jobs list row, `NinaAboutScreen`.

## Invariants

1. **Owner scope in every WHERE** — the new read filters `user_id` on BOTH `nina_message_images` and `nina_messages`, on `getNinaJobPhoto`'s precedent.
2. **No schema migration, no new index** — the read is a residual predicate over `nina_message_images_user_created_idx` + a PK join; `getNinaJobPhoto`'s header owns the economics argument.
3. **No `isOriginalPhoto` predicate on the new read** — a reference row IS a valid target (it is a live bubble showing the photograph); this absence is asserted in tests, on `tests/nina.photoRefs.test.ts:121`'s precedent.
4. **The tree builds and tests pass at the end of the phase** — `vitest` + `npx tsc --noEmit` in the worktree (fresh worktree: copy `.env.local` and install dependencies first; `lib/env.ts` validates at load).
5. **The landing side is untouched** — `?jump=` consumption already accepts any session; nothing on the chat side changes.
6. **Avatar jobs never run the new read** — the page's avatar skip stays; `planJobPhoto`'s avatar arm is untouched.
7. **`args.replyToId` stays in the job args** — the redo/re-fire path still reads it; only the jump display rule stops consulting it.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Jump targets the earliest bubble carrying the photo | R1 | `lib/nina`, `app/nina/jobs/[id]`, `components/nina`, `tests` | 7 | — | NORMAL | `.workflows/plan/job-jump-photo-bubble/phase-1.md` | P1-RI-A037 | — |

### Phase 1 — Jump targets the earliest bubble carrying the photo
**Satisfies:** R1
**Owns:** the new earliest-bubble read; `planJobJump`'s new input shape (`bubble` replaces `replyToId`/`replySessionId`); the refusal vocabulary collapse; the dead second read's removal; page wiring; comment updates in `NinaJobDetail`; both test files.
**Does not touch:** the landing side, `getNinaJobPhoto`/`planJobPhoto` behavior, the attach path, `/admin`, the schema, the redo path.
**Exit criteria:** a completed selfie job's button href names the earliest live bubble over (original ∪ references); `args.replyToId` no longer appears anywhere in the jump path; the union is `ready | avatar | no-photo` with a two-key note map; `vitest` + `tsc --noEmit` green.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| single phase — nothing to reconcile | | |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Pure replacement vs keeping `args.replyToId` as a fallback when no photograph resolves | Pure replacement — open/failed jobs and removed photographs show the refusal sentence; no fallback. The user said "logicnya **diganti** jadi", and a fallback would keep alive exactly the read path the replacement deletes. Consequence stated: failed jobs (the top of `/nina/jobs`) show the sentence where today a resolvable request gave a button. | 5: user's raw input |
| `no-message` + `gone` as two arms vs collapsed | Collapsed into one `no-photo` arm (sentence names: not finished yet, deleted, or its chat is gone); `avatar` keeps its own sentence — its cause (no carrier message ever) is independent of the photograph rule. | consequence of the replacement (the two arms' cause — `args.replyToId` — is no longer consulted) |
| What "earliest" orders by | `nina_messages.seq` ASC (the schema's stated total order of the whole conversation; `MessageList` renders in it), `id` as the determinism tiebreak — not timestamps. | 6: surrounding convention |
| How deep the candidate set goes | Exactly `i.id = photo OR i.source_image_id = photo` — `ninaPhotoProvenance` flattens references to name the ORIGINAL, so no recursion exists to write. | 6: schema fact (`lib/nina/attach.ts`) |
| New read's parameter: `jobId` vs photo row `id` | Photo row `id` — the page already resolved it for the photo icon; a `jobId` input would duplicate `getNinaJobPhoto`'s join. | 6: `getNinaJobPhoto`'s own economics precedent |

## Open Questions

## Rollback

Revert the phase's commits. Read-only feature — nothing was written anywhere; `getNinaImageJobDetail` regains its second read by the same revert.

## Next

Execute the phase:

    /implement -f JOB_JUMP_PHOTO_BUBBLE_PLAN.md --phase 1

Or run it as a swarm — one session, resumable:

    /analyze-orchestrator -f JOB_JUMP_PHOTO_BUBBLE_PLAN.md
