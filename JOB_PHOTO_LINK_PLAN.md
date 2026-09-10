# Plan: Detail foto icon row + full-screen photo access

**Slug:** job-photo-link
**Date:** 2026-09-10 10:40 WIB
**Analysis:** `20260910-104042_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/job-photo-link`
**Branch:** `feature/job-photo-link` (base: `origin/main` @ `ac9cf03`)
**Phases:** 2
**Status:** phase 1/2 complete (P1-RI-A032)
**Coordinator:** —

**Plan: 2 phases — 10 files across `app/`, `components/`, `lib/`, `tests/` (Phase 1: 4, Phase 2: 6, zero overlap); the shared about-viewer codec must exist before the linking side consumes it. R1 -> 2 · R2 -> 2 · R3 -> 1,2 · R4 -> 1,2.**

## Why

> you know, in Detail foto , kita bisa klik tombol "Buka chat-nya" . ubah tombol ini menjadi icon tanpa text.
> lalu , pada row yang sama, tambahkan tombol icon yang mengklik ini akan redirect user untuk melihat full screen foto (kita sudah punya ini, misalnya pas klik salah satu foto di Media) , di halaman itu ada juga tombol untuk send to most recent chat session, atau send to a new chat session.
> jadi, selama admin tidak menghapus foto ini di halaman admin, maka user selalu bisa mengakses foto nya dari laman Detail foto.
> walaupun foto sudah di Replace (admin bisa mereplace generated image) . tetap make sure user bisa mengklik foto yang baru dari Detail foto

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | "Buka chat-nya" becomes an icon-only button (no text) | 2 |
| R2 | Same row gains an icon button opening the existing full-screen photo view (with its send-to-recent / send-to-new chat controls) | 2 |
| R3 | The photo stays reachable from Detail foto for as long as the admin has not deleted it | 1, 2 |
| R4 | After an admin Replace, Detail foto opens the NEW photo | 1, 2 |

## Scope

**In scope:** the Detail foto row (`/nina/jobs/[id]`), the about-viewer's ability to open a deep-linked photo outside its 200-newest window, the shared `?photo=` codec for `/nina/about`, one new owner-scoped job→photo read, one pure href/plan helper beside `planJobJump`, tests.

**Out of scope:** `PhotoViewer` itself, the attach strip's controls (`attachNinaPhotoToChat`, recent/new sends — they already exist and are exactly what R2 wants to reuse), `/admin/photos` (Replace/Remove already behave as R3/R4 require), the chat page's `?photo=kind:id` grammar (`lib/nina/attach.ts`), the jobs LIST row (`/nina/jobs`, `NinaJobList` — the user named Detail foto), avatar jobs' photo access (no job→avatar key exists — see Decisions), any schema migration.

## Invariants

1. The tree builds and the test suite passes at the end of each phase.
2. Every new read is owner-scoped (`user_id` in the `WHERE`); a foreign id and a missing id answer identically (invariant 3, the detail page's stated rule).
3. `nina_message_images.description` never crosses into client props — single rows are mapped through `galleryPhotos` (invariant 5).
4. No schema migration. No new column, no new index.
5. The two `?photo=` grammars stay separate: `/nina?photo=kind:id` (`lib/nina/attach.ts`) is untouched; this plan only shares the `/nina/about` `section.id` codec.
6. Icon-only controls keep the words as the accessible name (`aria-label`, `aria-hidden` glyph), 44px floor (`size md`), Lucide glyphs copied verbatim per `NinaAboutScreen.tsx`'s documented convention.
7. The jump refusal sentences (`NINA_JOB_JUMP_NOTE`) stay, unchanged, for the three no-bubble kinds.
8. A deep link never changes what the Media GRID shows — the resolved out-of-window photo is viewer-only.
9. No `description` reaches the client; no read filters `isOriginalPhoto()` where the render reads (the render-reads rule in `lib/nina/queries.ts` — Phase 2 registers its new read in that docstring's inventory, making five).

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | About-viewer codec + any-age photo deep link | R3, R4 | `lib/nina`, `app/nina/about`, `components/nina` | 4 | — | NORMAL | `.workflows/plan/job-photo-link/phase-1.md` | P1-RI-A032 | — |
| 2 | Detail foto icon row (jump + photo) | R1, R2 | `lib/nina`, `app/nina/jobs/[id]`, `components/nina` | 6 | 1 | NORMAL | `.workflows/plan/job-photo-link/phase-2.md` | P1-RI-A033 | — |

### Phase 1 — About-viewer codec + any-age photo deep link
**Satisfies:** R3, R4 (receiving side)
**Owns:** moving the about-viewer `?photo=` codec (`PHOTO_PARAM`/`encodePhoto`/`decodePhoto`) out of `NinaAboutScreen.tsx` into a pure lib module and adding the href builder; `/nina/about`'s server page reading `searchParams` (Next 16 `PageProps<'/nina/about'>`, awaited) and resolving a `chat.<id>` that misses the 200-newest gallery via the existing single-row deep-link read (`getNinaMessageImage`), mapped through `galleryPhotos` so `description` is stripped; `NinaAboutScreen` rendering the viewer over `gallery + resolvedPhoto` while the GRID keeps rendering `gallery` alone.
**Does not touch:** `PhotoViewer`, the attach strip, `lib/nina/attach.ts`, the jobs screens, any admin surface, the database.
**Exit criteria:** a hand-built `/nina/about?photo=chat.<old-id>` opens the viewer for a photo outside the newest 200; a deleted id still resolves to a closed viewer (no error); the grid is unchanged by the URL; codec round-trip unit-tested; `npm run lint`, `npm run typecheck`, `npx vitest run` green.

### Phase 2 — Detail foto icon row (jump + photo)
**Satisfies:** R1, R2 (with R3/R4's linking side)
**Owns:** the new owner-scoped read in `lib/nina/queries.ts` (job → photo via `nina_message_images ⋈ nina_messages.turn_id = jobId`, `kind='generated'`, deterministic order, limit 1); a pure `planJobPhoto`/href helper beside `planJobJump` in `lib/nina/jobview.ts` consuming Phase 1's codec; the detail page resolving the photo fact (a sequential read, skipped entirely for avatar jobs — `purpose` is only knowable from the detail read; per Decisions) and passing it down; `NinaJobDetail`'s row becoming icon-only controls — jump icon ("Buka chat-nya" as `aria-label`) beside the photo icon (opens the `/nina/about?photo=…` link) — with the refusal sentences unchanged when a control has no fact.
**Does not touch:** `getNinaImageJobDetail`'s contract beyond callers, `NinaJobList`/`/nina/jobs` list rows, the chat page, admin surfaces, the attach strip.
**Exit criteria:** on a completed selfie job the row shows [chat icon][photo icon]; on `no-message` the photo icon shows beside its sentence; on `avatar`/`gone` (and any job whose photo row is gone — admin Remove, runner message delete) the photo icon is absent; after an admin Replace the photo icon still opens the NEW bytes; `npm run lint`, `npm run typecheck`, `npx vitest run` green.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| Phase 2's `Requires` was written (concurrently, blind) as a GUESS about Phase 1's codec export: expected name/home/signature/return for the href builder | 1, 2 | Verified verbatim agreement, no movement needed: `aboutPhotoHref`, home `lib/nina/album.ts`, `(section: 'album' \| 'chat', id: string): string`, returning `/nina/about?photo=<section>.<id>` — Phase 2's import line and its single `aboutPhotoHref('chat', …)` call site match Phase 1's export exactly. Phase 2's `Requires` now states the contract as a reconciled fact instead of an expectation; `phase-2.md`'s Step 2a fallback guard stays but is inert. |
| Phase 2's scope asked for BOTH a parallel photo read (`Promise.all` with the detail read) AND an avatar skip that runs no query — impossible together, since `purpose` is a fact only the detail read produces | 2 | Accepted Phase 2's own resolution: a SEQUENTIAL read, skipped entirely for avatar jobs, with the avatar RULE kept in `planJobPhoto`'s avatar arm where a test reaches it. This index's Phase-2 boundary was the draft's stale half ("parallel read, avatar jobs short-circuited to none") and is rewritten above to match the plan. Rung 6: the plan's reasoned resolution plus the Decisions rows it cites. |
| Draft file counts did not match the plans ("8 files" total; "4-5" per phase) | — | Corrected to the plans' actual Files tables: Phase 1 = 4 files, Phase 2 = 6 files, zero overlap between the two sets, 10 files total. |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Avatar jobs: no job→avatar key exists (`finishAvatar` writes no job id onto `nina_avatars`; matching by `description`/`created_at` would be a guess that can name the wrong face) | No photo icon for avatar jobs; the `avatar` refusal sentence stays the whole answer | 6: schema fact — the link cannot be derived, only guessed |
| A removed session orphans its photos (`message_id` SET NULL) and severs the job→photo chain; fixing it needs a `job_id` column = migration | Join-only resolution; an orphaned photo stays reachable from Media but not from Detail foto. R3's stated condition (admin deletion) is fully honored — admin Remove deletes the row outright, which the absent icon answers honestly | 6: schema fact, plus no-migration invariant 4 — a migration for the session-removed case is the loser of the trade |
| Which read resolves an out-of-gallery `chat.<id>` on `/nina/about` | The existing `getNinaMessageImage` — its own docstring already names it "the `?photo=` deep link" read and it deliberately never filters references; the membership check over the already-read 200 runs first so the common case costs nothing | 5: convention — the read's stated purpose |
| When the photo icon is drawn | Whenever the job's photo row resolves — independent of the jump state. `no-message` + photo → icon beside the sentence (that job's photo exists and R3 says reachable); `gone`/`avatar`/failed → absent (no row to name). Never a link the server has not proved | 1: user's raw input — "selalu bisa mengakses … dari laman Detail foto" |
| Glyphs | Jump = Lucide `message-circle` (the conversation exists), photo = Lucide `maximize-2` (full screen), copied verbatim per the file's documented convention; accessible names "Buka chat-nya" (verbatim words) and "Lihat foto ukuran penuh" | 3: surrounding convention (`NinaAboutScreen`'s glyph register + `SessionRow`'s words-as-aria-label rule) |
| Where the new SQL read lives | `lib/nina/queries.ts` — the schema's own header: Nina reads through it and nowhere else | 6: stated convention |

## Open Questions

(None — every fork above was decided at planning time; see Decisions.)

## Rollback

- Phase 1: revert the branch's phase-1 commits — the codec returns to being screen-private, the about page stops reading `searchParams`; no data was written, so a revert is total.
- Phase 2: revert the phase-2 commits — Detail foto returns to the labelled `ButtonLink`; the new read becomes dead code removed with the commit; no data was written.
- Whole set: `git worktree remove` the worktree and delete `feature/job-photo-link` — nothing outside it is affected.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f JOB_PHOTO_LINK_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f JOB_PHOTO_LINK_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan JOB_PHOTO_LINK_PLAN.md
