# Plan: Photo attach strip — icon sends + keyboard-pushed field fix

**Slug:** photo-send-chat-icons
**Date:** 2026-09-09 11:23
**Analysis:** `20260909-112330-P7K2_code_analyzer.md`
**Worktree:** `/home/miftah/run-insights/.claude/worktrees/photo-send-chat-icons`
**Branch:** `worktree-photo-send-chat-icons` (base: `origin/main` @ `5ccae06`)
**Phases:** 2
**Status:** phase 1/2 complete
**Coordinator:** orch-photo-send-chat-icons

<The Coordinator line is the peer address of the session driving this set, filled in by
`/analyze-orchestrator` when it takes the set over. Leave it `—`: a name written here by hand
addresses a session that does not exist, and the reports meant for it go nowhere.>

## Why

> cek fitur untuk melihat foto ,yang bisa kirim foto ke chat, yang ada text field (Tanya soal foto ini (opsional) :
> 1a. saat ini "Kirim ke chat" akan mengirim ke the most recent session. ganti tombol ini menjadi icon tanpa text
> 1b di row yang sama dengan 1a (bersebelahan) tambahkan icon baru, yang akan mengirim gambar ini ke new chat session (so here we always create a new chat session)
>
> tambahan bug report: mengedit nama session menunjukkan bug UI yang sama. keyboard mendorong text field ke atas , membuat text field tidak terlihat di layar

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Ganti tombol "Kirim ke chat" menjadi icon tanpa text (behavior unchanged: sends to the most recent session) | 1 |
| R2 | Di row yang sama dengan 1a (bersebelahan), tambahkan icon baru yang mengirim gambar ini ke new chat session — always a new chat session | 1 |
| R3 | Bug: mengedit nama session — keyboard mendorong text field ke atas sehingga tidak terlihat di layar; the photo-question field shares the exposure and is fixed under the same mechanism | 2 |

## Scope

**In scope:** the `/nina/about` zoomed-photo attach strip (layout + two send paths); the keyboard-overlap channel reaching `/nina/about`; the sidebar rename field surviving the keyboard's open.
**Out of scope:** `PhotoViewer` itself (shared with three review surfaces — it does not grow a send button); the composer and its geometry; any change to send semantics other than which session receives the photo; session creation rules beyond reusing `createNinaChatSession` as it stands.

## Invariants

1. The tree builds and the test suite passes at the end of each phase.
2. Send-to-most-recent keeps byte-identical server behavior (same action chain, same `sessionId: null` resolution).
3. No visible text on either send control; the accessible names carry the words (the `SessionRow` glyph rule).
4. No second concurrent `visualViewport` subscription on one screen — one publisher implementation, `:root` var broadcast, consumers read the var.
5. Keyboard rules stay pure functions in `lib/nina/chatview.ts` where they need tests (invariant 8 of the keyboard set).
6. Icon glyphs are inline SVG fetched verbatim from `unpkg.com/lucide-static` (JSX-spelled), `aria-hidden`, 18px in `currentColor` — the `SessionRow`/`AdminNav` convention.
7. Both send controls keep the mis-tap guard: `loading` on `Button`, both disabled while one is in flight.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Attach strip: two icon sends (recent + new chat) | R1, R2 | `components/nina` + `lib/nina` | 3–4 | — | NORMAL | `.workflows/plan/photo-send-chat-icons/phase-1.md` | P2-CN-A000 | — |
| 2 | Keyboard channel: about strip box fix + rename re-assert | R3 | `components/nina` + `lib/nina` | 6 | 1 | HARD | `.workflows/plan/photo-send-chat-icons/phase-2.md` | P1-CN-A001 | — |

### Phase 1 — Attach strip: two icon sends (recent + new chat)
**Satisfies:** R1, R2
**Owns:** the strip's control rows in `NinaAboutScreen.tsx` (input row + adjacent icon row), `attachNinaPhotoToChat`'s input/result and new-session branch, the two glyphs, the tests for both send paths.
**Does not touch:** `sendNinaMessage`'s resolution logic; `PhotoViewer`; the strip's positioning/`z-70` (phase 2 owns the box); the sidebar.
**Exit criteria:** two adjacent icon-only controls (recent-session send unchanged in behavior; new-chat send always lands the photo in a conversation with no prior content); the runner lands in the conversation that received the photo; both paths tested; suite green.

### Phase 2 — Keyboard channel: about strip box fix + rename re-assert
**Satisfies:** R3
**Owns:** extracting the `visualViewport` publisher out of `ChatScreen`; mounting it on `/nina/about`; the strip's `bottom: var(--nina-kb-overlap, 0px)`; the sidebar reassert's layout-change-driven trigger; the pure helpers + tests.
**Does not touch:** the strip's control rows (quotes them as phase 1 left them); `PhotoViewer`; the composer; session actions.
**Exit criteria:** on `/nina/about` the question field stays visible with the keyboard up (strip ends at the keyboard's top edge, no Safari lift); in the sidebar the rename field is re-asserted when the panel's box actually changes, not only on the fixed delay schedule; publisher still single-implementation; rules tested; suite green.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| Same file, two owners: both phases edit `NinaAboutScreen.tsx` (1 = strip children, 2 = container tag + publisher) and phase 2 wrote its hunks against the pre-phase-1 tree | 1, 2 | Division of labor verified sound — phase 1's final container `className` is byte-identical to what phase 2 quotes, and phase 1's "The strip as Phase 2 must quote it" matches phase 2's container-only edit. Phase 2's hunks re-anchored onto phase 1's output (rows below). No hunk overlap remains: phase 2 touches only the import block, the state tail, the fragment head, and the container opening tag. |
| Phase 2 Step 4a quoted the pre-phase-1 `attachNinaPhotoToChat` import; pasting that head-of-file block would delete phase 1's `type NinaAttachTarget` and break the build | 1, 2 | phase-2.md Step 4a re-quoted with `import { attachNinaPhotoToChat, type NinaAttachTarget } …` (phase 1's line) and a note that phase 2 must keep the type the `sending` state is typed by. |
| Deleted-then-used: phase 2 Step 4b anchored on `const [attaching, …]` at `:99-101`, which phase 1 renames to `sending` — the anchor no longer exists after phase 1 | 1, 2 | phase-2.md Step 4b re-anchored on phase 1's five-line state block (`:99-103`, quoting `sending` and its comment); `kbOverlap` appended after `notice`. Phase 1's rename stands (it owns the strip children). |
| Post-phase-1 line drift: phase 1's state rename (+2) and handler rewrite (+9) shift `NinaAboutScreen` positions below the handler by +11, so phase 2's `:324-326` mount and `:339` container no longer point at the right lines | 1, 2 | phase-2.md renumbered to post-phase-1 positions: mount `:335-337`, container `:350` (Contract Deletes bullet, Files table, Step 4 header, 4c, 4d). Phase 1's own refs stay pre-phase-1 (it edits the base tree). Quoted anchor text verified unchanged, so content-matching edits still work. |
| Stale cross-reference: phase 2's Handoffs said "`attach()` still navigates with a bare `router.push('/nina')`" — phase 1 changed it to `router.push(result.next)` | 1, 2 | phase-2.md Handoffs bullet rewritten as resolved: both targets push `/nina?s=<sessionId>`; no interaction with `kbOverlap` or the publisher mount. |
| Phase 2 exit criterion 2's gate (`grep visualViewport \| grep addEventListener`) cannot fail: the two tokens never share a line in this tree's style, so it matches nothing both before and after the phase — it cannot enforce the single-publisher invariant | 2 | phase-2.md Verification criterion 2 replaced with a gate that can fail: `grep -rln "window.visualViewport" components/` must return exactly `KeyboardOverlapPublisher.tsx` + the two read-only `.scale` readers (`PhotoViewer.tsx`, `MessageBubble.tsx`), with `ChatScreen.tsx` gone from the list (verified against the base tree). |
| Verified non-conflicts | 1, 2 | `lib/nina/chatview.ts`, `ChatScreen.tsx`, `NinaSidebar.tsx`, `chatview.test.ts` = phase 2 only; `lib/nina/albumActions.ts` = phase 1 only; sole caller of `attachNinaPhotoToChat` is `NinaAboutScreen` (grep). Phase 1 honors both of phase 2's `Requires` (container tag untouched, no prop/component rename). Phase 1 encodes its steps-1+2 share-one-commit rule (Implementation Steps preamble + Step 1 Impact) and builds green at its end; phase 2 builds on that end state. All seven analysis Impact Points owned. R1/R2 → 1, R3 → 2 confirmed in both plans' `Satisfies` lines. |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| "always create a new chat session" vs `createNinaChatSession`'s empty-newest reuse branch | reuse the action as-is: an empty newest session IS the new chat — the photo never lands in a conversation with content, and no second create rule is minted | 5: user raw input, read by intent ("never an ongoing conversation"), with the repo's recorded anti-litter rule as convention |

## Open Questions

## Rollback

Per phase: `git revert` of the phase's commit range on this branch restores the prior behavior; phase 1's rollback leaves the labelled "Kirim ke chat" button and the most-recent-only send; phase 2's rollback removes the about-page keyboard channel and the reassert upgrade without touching phase 1's send paths. As a whole: the branch is self-contained against `origin/main` @ `5ccae06`; dropping it costs nothing else.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f PHOTO_SEND_CHAT_ICONS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f PHOTO_SEND_CHAT_ICONS_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan PHOTO_SEND_CHAT_ICONS_PLAN.md
