# Todos: components/nina

**Package Path**: `components/nina`
**Package Code**: CN
**Last Updated**: 2026-09-10
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 6

---

## Active Tasks

### [P0] Critical

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

- [x] **P1-CN-A004** Phase 2: Write-time dedup: jalur upload chat runner
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns: `Composer.tsx` hash `compressed.file` via util P1; pre-check server (action owner-scoped baru di `actions.ts`, finder P1) SEBELUM `upload()`; bila duplikat → tile memakai foto existing sebagai attachment reference (seam `?photo=image:<id>` / `resolveAttachment`, bukan insert arm baru); bila tidak → klaim hash ikut `sendNinaMessage`, divalidasi 64-hex. Race-close di STEP 1b: bila original lain dengan hash sama sudah ada saat insert → baris baru REFERENCE (copy `blob_url`/`pathname` keeper + `source_image_id`) dan blob baru di-release (`releaseBlobIfUnreferenced`, row-first-blob-second). Exit: pick file sama dua kali → hanya satu objek blob baru, kedua jadi reference tersembunyi dari Media; dua send balapan → satu objek + satu original; test unit skip + race-close.
  - **Status**: done
  - **Plan Set**: `MEDIA_DEDUPE_PLAN.md` (phase 2 of 4)
  - **Satisfies**: R1, R2, R3 — R2: Konsumsi storage prod minimum (tidak ada bytes duplikat tersimpan); R3: Section Media tetap tidy (foto sama tidak muncul dua kali di feed).
  - **Depends on**: `P1-DB-A006`
  - **Plan**: `.workflows/plan/P1-CN-A004.md`
  - **Completed**: 2026-09-10 12:47
  - **Method**: /do
  - **Files**: lib/nina/dedupe.ts, components/nina/Composer.tsx, components/nina/ChatScreen.tsx, lib/nina/actions.ts, tests/nina.dedupe.test.ts, tests/nina.chatDedupe.test.ts
  - **Drift**: Plan Step 1 doc comment cited `photoSideOf` at `lib/nina/album.ts:146`; it actually sits at album.ts:173 — wrote the reference without the line number. Cosmetic.
    Plan Step 2a's placement clause contradicted its own justification: it said to put `contentHashOf` "directly above" the compressForNina import but justified with "compressForNina sorts before contentHash" (which implies below). No eslint import-order rule exists; repo convention is alphabetical within the @/lib group → contentHashOf placed directly BELOW compressForNina. Cosmetic.
    The code commit (4478758) was made by the main context, not pusher: explicit pathspec of exactly the six modified files, --stat verified. Reason: peer sessions impl-media-dedupe-p3 and impl-media-dedupe-p4 are concurrently implementing in THIS SAME WORKTREE (its only worktree) with half-written files in it (lib/nina/imageDedupe.ts, scripts/nina-image-worker.ts, tests mid-edit, scripts/nina-dedupe-*.mjs, modified package.json/imagerun.ts) — ANY broad `git add` would sweep their files in. The follow-up docs commit must likewise add ONLY its own docs files by name.
    Verification state, honest: `npm run typecheck` clean after the phase's edits; full suite green (171 files / 3643 tests) at 12:40:57; the plan's regression set (nina.dedupe, nina.chatDedupe, nina.attach, nina.chatPhotoReattach, nina.resend, nina.blobRelease) re-ran green (6 files / 65 tests) AFTER the peer writes. `npm run build` currently fails ONLY inside peer P3's mid-flight tests/nina.imageworker.test.ts (WorkerStoredImage now requires contentHash/duplicateOf — phase 3's own surface, consistent with phase 3's plan); no phase-2 file implicated; the whole-tree build must be re-run by the coordinator after P3/P4 settle.
  - **Decided**: contentHashOf import placement (plan self-contradiction) → below compressForNina, alphabetical (rung 6: surrounding code convention; plan's own justification clause agreed)
  - **Decided**: ResolvedNinaAttachment docstrings → applied the plan's condensed named interface verbatim (rung 3: code blocks complete by construction)
  - **Decided**: Landing under concurrent peer sessions in one shared worktree → pathspec-scoped commit 4478758 now rather than waiting, then coordinator sequences P3/P4 landings (tie-break: narrower blast radius; an uncommitted verified phase sitting in a tree two other sessions are rewriting is the greater risk)

- [x] **P2-CN-A003** Phase 1: Flash the landing in the bubble's own color — and prove the jobs jump end-to-end
  - **Difficulty**: NORMAL
  - **Type**: Bug
  - **Context**: Owns `components/nina/MessageBubble.tsx` (ring-color literal :485 + comments :61-64, :470-483), `app/globals.css` (keyframe header color paragraph :260-266), `lib/nina/search.ts` (landing prose :331-334); the live verification protocol. Exit: the class reads `[--nina-flash-ring-color:var(--ink)]`; her bubbles still blink `--accent`; gates green (build, lint, vitest, format-clean); live probe of the /nina/jobs → "Buka chat-nya" flow passes — target `nina-msg-<id>` carries `data-flash="true"` and rests in the readable band.
  - **Status**: done
  - **Plan Set**: `JOB_JUMP_FLASH_PLAN.md` (phase 1 of 1)
  - **Satisfies**: R1 — "Buka chat-nya" must pinpoint the exact bubble and flicker it, like reply-to and search; R2 — the user-bubble flicker color becomes the user bubble's own color
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P2-CN-A003.md`
  - **Completed**: 2026-09-10 09:56
  - **Method**: /do
  - **Files**: components/nina/MessageBubble.tsx, app/globals.css, lib/nina/search.ts
  - **Drift**: Probe port 3100 was held by an unrelated process (EADDRINUSE) — the live probe served on 3777 instead; the plan's requirement ("not 3000", our server answering 307→/ on /nina/jobs) was met.
    Plan Step 9's `git commit -- <paths> -m …` spelling put -m after the pathspec separator; git rejects that. Flags moved before `--`, same three-path pathspec. Commit landed clean.
    Repo-wide `npm run format` re-dirtied lib/nina/queries.ts and tests/db.schema.nina.test.ts — HEAD itself is prettier-dirty under the freshly installed prettier (verified by prettier-checking the HEAD blob inside the repo). Both strays reverted; the commit contains exactly the three owned files. Any later format run in this worktree will re-dirty those two files until main fixes them.
    Production data drift since the 09:00 analysis: jobs TBYflEJGPMfd and xyzLWZds8jfP now also carry live replyToIds. Harmless — the probe resolves the top job dynamically and still probed xZoxXUCsWUzq.
    Verification Log filled in BOTH the source phase plan (.workflows/plan/job-jump-flash/phase-1.md) and the adopted copy (components/nina/.workflows/plan/P2-CN-A003.md).
    Bookkeeping files in the working tree, uncommitted, and INTENTIONAL — carried in the docs commit: components/nina/.workflows/todos.md, components/nina/.workflows/plan/P2-CN-A003.md (adopted plan, new file), JOB_JUMP_FLASH_PLAN.md (untracked), .workflows/plan/job-jump-flash/ (untracked), 20260910-090042_code_analyzer.md (untracked).
  - **Decided**: Probe server port 3100 vs alternative → 3777, because 3100 was held by a stranger (tie-break: reversible option; plan's own requirement met)
  - **Decided**: Plan Step 9 commit command spelling vs git's argument grammar → flags before `--` separator, identical pathspec set (rung 3: the phase plan's code blocks — intent taken, shell spelling corrected)
  - **Decided**: Prettier strays in two non-phase files → revert, keep the commit at exactly the three owned files (plan's own rule: 'if it names more, revert the strays before committing')

- [x] **P2-CN-A000** Phase 1: Attach strip: two icon sends (recent + new chat)
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns the strip's control rows in `NinaAboutScreen.tsx` (input row + adjacent icon row), `attachNinaPhotoToChat`'s input/result and new-session branch, the two glyphs, the tests for both send paths. Exit: two adjacent icon-only controls (recent-session send unchanged in behavior; new-chat send always lands the photo in a conversation with no prior content); the runner lands in the conversation that received the photo; both paths tested; suite green.
  - **Status**: done
  - **Plan Set**: `PHOTO_SEND_CHAT_ICONS_PLAN.md` (phase 1 of 2)
  - **Satisfies**: R1 — Ganti tombol "Kirim ke chat" menjadi icon tanpa text (behavior unchanged: sends to the most recent session); R2 — Di row yang sama dengan 1a (bersebelahan), tambahkan icon baru yang mengirim gambar ini ke new chat session — always a new chat session
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P2-CN-A000.md`
  - **Completed**: 2026-09-09 12:23
  - **Method**: /do
  - **Files**: lib/nina/albumActions.ts, components/nina/NinaAboutScreen.tsx, tests/nina.attachTargets.test.ts
  - **Decided**: Plan-internal contradiction in phase 1's test block: the first 'new'-target test expected result.sessionId to carry the CREATE's session id while its mocked send landed in a different id — contradicting the plan's own Interface Contract ('sessionId' is sendNinaMessage's own answer, null iff !ok), the reconciled action code (ships result.sessionId), and the same suite's fourth test (next follows the landed id, not the create's copy). → The TEST's expectation was corrected to the landed id (LANDED_SESSION_ID), with a comment. Rung 1 (stated invariant/Interface Contract) + rung 3 (reconciled code block); the alternative repair (re-pointing the shared SENT fixture at the created id) breaks the 'recent'-target tests, so it was not a candidate.

- [x] **P1-CN-A001** Phase 2: Keyboard channel: about strip box fix + rename re-assert
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns extracting the `visualViewport` publisher out of `ChatScreen`; mounting it on `/nina/about`; the strip's `bottom: var(--nina-kb-overlap, 0px)`; the sidebar reassert's layout-change-driven trigger; the pure helpers + tests. Exit: on `/nina/about` the question field stays visible with the keyboard up (strip ends at the keyboard's top edge, no Safari lift); in the sidebar the rename field is re-asserted when the panel's box actually changes, not only on the fixed delay schedule; publisher still single-implementation; rules tested; suite green.
  - **Status**: done
  - **Plan Set**: `PHOTO_SEND_CHAT_ICONS_PLAN.md` (phase 2 of 2)
  - **Satisfies**: R3 — Bug: mengedit nama session — keyboard mendorong text field ke atas sehingga tidak terlihat di layar; the photo-question field shares the exposure and is fixed under the same mechanism
  - **Depends on**: `P2-CN-A000`
  - **Plan**: `.workflows/plan/P1-CN-A001.md`
  - **Completed**: 2026-09-09 12:54
  - **Method**: /do
  - **Files**: components/nina/KeyboardOverlapPublisher.tsx, components/nina/ChatScreen.tsx, components/nina/NinaAboutScreen.tsx, components/nina/NinaSidebar.tsx, lib/nina/chatview.ts, lib/nina/chatview.test.ts
  - **Drift**: Exit criterion 2's grep gate now also matches the phase's own adopted plan copy (components/nina/.workflows/plan/P1-CN-A001.md quotes the grep pattern in its text). The gate's intent holds: among real components the matches are exactly KeyboardOverlapPublisher.tsx, PhotoViewer.tsx, MessageBubble.tsx, and ChatScreen.tsx is gone.
    The phase-2 plan docstring prose contained scrambled/duplicated text spans (no control chars — planner-written). Code blocks were applied verbatim; garbled docstring spans were transcribed as meaning-preserving clean English. No semantic change.
  - **Decided**: Plan-internal contradiction in phase 1's test block: the first 'new'-target test expected result.sessionId to carry the CREATE's session id while its mocked send landed in a different id — contradicting the plan's own Interface Contract ('sessionId' is sendNinaMessage's own answer, null iff !ok), the reconciled action code (ships result.sessionId), and the same suite's fourth test (next follows the landed id, not the create's copy). → The TEST's expectation was corrected to the landed id (LANDED_SESSION_ID), with a comment. Rung 1 (stated invariant/Interface Contract) + rung 3 (reconciled code block); the alternative repair (re-pointing the shared SENT fixture at the created id) breaks the 'recent'-target tests, so it was not a candidate.
### [P1] High

- [x] **P1-CN-A001** Phase 1: The panel pins the window over its focused field
  - **Difficulty**: HARD
  - **Type**: Bug
  - **Context**: Owns everything inside `NinaSidebar`'s `[open]` effect in `components/nina/NinaSidebar.tsx`: window-scroll capture/pin (to 0) while a panel text field is focused, restore of the field's pre-focus `scrollY` on blur, and focus-schedule arming/disarming of the existing deck re-assert. No file outside `NinaSidebar.tsx` changes; does not touch `NinaSearchField.tsx`, `lib/nina/chatview.ts` (the schedule and its tests are not the defect), `ChatScreen.tsx`, the composer, the rail, or the panel's `bottom` style. Exit criteria: while a text field inside the open panel is focused, any window scroll is pinned to 0 and the field's pre-focus scroll position is restored on blur; the deck assert arms on focus and disarms on blur; typecheck/build/suite at base-green; invariant greps (2, 3) hold.
  - **Status**: completed
  - **Plan Set**: `SEARCH_KBD_AND_UP_BTN_PLAN.md` (phase 1 of 2)
  - **Satisfies**: R1 — The sidebar search field stays visible above the keyboard when it opens (typed text legible); the earlier fix did not hold
  - **Plan**: `.workflows/plan/search-kbd-and-up-btn/phase-1.md`
  - **Completed**: 2026-09-09 12:39
  - **Method**: /do
  - **Files**: components/nina/NinaSidebar.tsx
  - **Drift**: Plan anchor table's "end of file" row says base 699 → after 804; the file is actually 698 → 803 lines (cosmetic off-by-one in the plan's counting — the splice was anchor-verified at both ends, base 357 `React.useEffect(() => {` and base 442 `}, [open])`, and all other anchors confirmed exact: 549/557/566/570/619/632/758/796).
  - **Drift**: The plan's "13 hunks" structural check is a `git diff -U0` measurement (base-side starts 373, 383, 393, 395, 398, 400, 402, 403, 414, 421, 426, 437, 438 — reproduced exactly); default -U3 merges them into 5 hunks over the same region.
  - **Drift**: DECISIVE R1 GATE STILL OPEN (plan invariant 8): the on-device checklist (fresh-bundle check + steps 1-7 of the phase plan's Verification) is pending owner confirmation on an iPhone (device of record: iPhone XS Max). The automated gates are NOT proof of the fix by the plan's own statement — the phase plan's Verification section lists the exact checklist and the bundle-freshness trap (fully quit/re-open the installed PWA or hard-reload; no service worker, so no cache purge needed; verify the pin via a manual window.scrollTo(0,300) snapping back to 0 with the field focused).
  - **Outstanding**: the decisive on-device R1 confirmation (plan invariant 8) — fresh-bundle check + steps 1-7 of the phase plan's Verification on the iPhone XS Max; the automated gates are not proof of the fix by the plan's own statement.
  - **Decided**: Anchor-table end-of-file off-by-one (698 vs 699) treated as a cosmetic counting artifact, not drift requiring re-plan → both splice anchors verified byte-exact before applying (rung 3: the phase plan's code blocks and its own anchor checks).
  - **Decided**: 13-vs-5 hunk-count discrepancy resolved by reproducing the plan's exact 13-hunk list under `git diff -U0` — the plan's measurement context, not a wrong application (rung 3: the phase plan's stated verification commands).
  - **Decided**: Application method: the 191-line replacement block was spliced programmatically from the plan file's tsx code fence (not retyped), then verified by the plan's full structural-check battery — all exact.

- [x] **P1-CN-A002** Phase 2: The rail's `up` reveals the main bar
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns the bar state's move into a shared provider (new `components/nina/NinaBarProvider.tsx`, `AppShell` wiring, `ChatChrome` consumption + panel-dialog focus rule); the pure panel-lift arithmetic and tests in `lib/nina/chatview.ts`; the rail `up` button rewrite (glyph flip, `aria-expanded`/`aria-controls`, 5 s auto-hide, keyboard rule), the panel `bottom` gaining the bar-lift term, `RAIL_PAD_BOTTOM_CSS`'s matching gate, and the removal of `onScrollToTop`/the scroll-to-top use of `listScrollRef` — all in `NinaSidebar.tsx` **as it looks after phase 1** (ten hunks 6a-6j, none inside phase 1's replaced base 357-442); and the provider-placement structural guard in `tests/nina.sidebarProvider.test.ts`. Does not touch phase 1's guard block inside the `[open]` effect, `TabBar.tsx`, `lib/nina/chrome.ts`'s state machine (consumed as-is), or the search field. Exit criteria: rail `up` toggles the bar with chat-page semantics (5 s auto-hide, glyph flip, `aria-expanded`/`aria-controls`, hide on panel-field focus); the bar renders in a reachable strip below the lifted panel; the chat page toggle still works off the same state; typecheck/build/suite green; new pure arithmetic covered in `chatview.test.ts`; the placement guard green in `tests/nina.sidebarProvider.test.ts`.
  - **Status**: completed
  - **Plan Set**: `SEARCH_KBD_AND_UP_BTN_PLAN.md` (phase 2 of 2)
  - **Satisfies**: R2 — The rail's `up` button shows the main app bottom bar, exactly like the chat page's up button
  - **Depends on**: `P1-CN-A001`
  - **Plan**: `.workflows/plan/P1-CN-A002.md`
  - **Completed**: 2026-09-09 13:11
  - **Method**: /do
  - **Files**: lib/nina/chatview.ts, lib/nina/chatview.test.ts, components/nina/NinaBarProvider.tsx, components/ui/AppShell.tsx, components/nina/ChatChrome.tsx, components/nina/NinaSidebar.tsx, tests/nina.sidebarProvider.test.ts
  - **Drift**: Plan's invariant-3 grep promised exactly 3 dependency arrays in NinaSidebar.tsx; the grep actually returns 5 at BOTH base 5ccae06 and after this phase — the plan miscounted base (the two `}, [])` useCallback arrays predate the phase). Invariant 3 itself holds: the [open]-keyed panel effect's array is exactly [open] and no array gained a dependency. No code change implied.
  - **Outstanding**: the decisive on-device manual checklist (phase plan Verification steps 1-8 on the iPhone XS Max) remains open per index invariant 8 — typecheck/build/the 3497-test suite and the invariant greps are not proof of the fix by the plan's own statement. Phase 1's R1 on-device checklist (steps 1-7) is still open too, and step 4 here rides on it.

---

## Archive
