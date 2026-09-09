# Todos: components/nina

**Package Path**: `components/nina`
**Package Code**: CN
**Last Updated**: 2026-09-09
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1

---

## Active Tasks

### [P0] Critical

### [P1] High

- [ ] **P1-CN-A002** Phase 2: The rail's `up` reveals the main bar
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns the bar state's move into a shared provider (new `components/nina/NinaBarProvider.tsx`, `AppShell` wiring, `ChatChrome` consumption + panel-dialog focus rule); the pure panel-lift arithmetic and tests in `lib/nina/chatview.ts`; the rail `up` button rewrite (glyph flip, `aria-expanded`/`aria-controls`, 5 s auto-hide, keyboard rule), the panel `bottom` gaining the bar-lift term, `RAIL_PAD_BOTTOM_CSS`'s matching gate, and the removal of `onScrollToTop`/the scroll-to-top use of `listScrollRef` — all in `NinaSidebar.tsx` **as it looks after phase 1** (ten hunks 6a-6j, none inside phase 1's replaced base 357-442); and the provider-placement structural guard in `tests/nina.sidebarProvider.test.ts`. Does not touch phase 1's guard block inside the `[open]` effect, `TabBar.tsx`, `lib/nina/chrome.ts`'s state machine (consumed as-is), or the search field. Exit criteria: rail `up` toggles the bar with chat-page semantics (5 s auto-hide, glyph flip, `aria-expanded`/`aria-controls`, hide on panel-field focus); the bar renders in a reachable strip below the lifted panel; the chat page toggle still works off the same state; typecheck/build/suite green; new pure arithmetic covered in `chatview.test.ts`; the placement guard green in `tests/nina.sidebarProvider.test.ts`.
  - **Status**: open
  - **Plan Set**: `SEARCH_KBD_AND_UP_BTN_PLAN.md` (phase 2 of 2)
  - **Satisfies**: R2 — The rail's `up` button shows the main app bottom bar, exactly like the chat page's up button
  - **Depends on**: `P1-CN-A001`
  - **Plan**: `.workflows/plan/P1-CN-A002.md`

### [P2] Medium

### [P3] Low

### [P4] Backlog

### 🚫 Blocked

---

## Completed Tasks

### [P1] High

- [x] **P1-CN-A001** Phase 1: The panel pins the window over its focused field
  - **Difficulty**: HARD
  - **Type**: Bug
  - **Context**: Owns everything inside `NinaSidebar`'s `[open]` effect in `components/nina/NinaSidebar.tsx`: window-scroll capture/pin (to 0) while a panel text field is focused, restore of the field's pre-focus `scrollY` on blur, and focus-schedule arming/disarming of the existing deck re-assert. No file outside `NinaSidebar.tsx` changes; does not touch `NinaSearchField.tsx`, `lib/nina/chatview.ts` (the schedule and its tests are not the defect), `ChatScreen.tsx`, the composer, the rail, or the panel's `bottom` style. Exit criteria: while a text field inside the open panel is focused, any window scroll is pinned to 0 and the field's pre-focus scroll position is restored on blur; the deck assert arms on focus and disarms on blur; typecheck/build/suite at base-green; invariant greps (2, 3) hold.
  - **Status**: completed
  - **Plan Set**: `SEARCH_KBD_AND_UP_BTN_PLAN.md` (phase 1 of 2)
  - **Satisfies**: R1 — The sidebar search field stays visible above the keyboard when it opens (typed text legible); the earlier fix did not hold
  - **Plan**: `.workflows/plan/P1-CN-A001.md`
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

---

## Archive
