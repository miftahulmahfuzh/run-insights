# Plan: The sidebar field survives the keyboard; the rail's `up` reveals the main bar

**Slug:** search-kbd-and-up-btn
**Date:** 2026-09-09 11:28 +0700
**Analysis:** `20260909-112804-K4B7_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/search-kbd-and-up-btn`
**Branch:** `feature/search-kbd-and-up-btn` (base: `origin/main` @ `5ccae06`)
**Phases:** 2
**Status:** complete
**Coordinator:** orch-search-kbd-and-up-btn

---

<The Coordinator line is the peer address of the session driving this set, filled in by
`/analyze-orchestrator` when it takes the set over. Leave it `—`: a name written here by hand
addresses a session that does not exist, and the reports meant for it go nowhere.>

## Why

> 1. bug: saat ini, saat saya mengklik "Search all chats" , text search field nya terangkat keatas
> oleh keyboard. sehingga apa yang diketik user tidak kelihatan. kita sudah coba fix ini , tapi bug
> still persists, saat keyboard muncul, search query field masih terangkat keatas
> 2. UI change: kita sudah tambahkan tombol up yang merupakan bagian dari 4 tombol icons yang baru,
> ubah fungsinya untuk menunjukkan main app bottom bar. persis sama dengan tombol up di chat page

R1 is a repeat report: `64034d0` (the panel-box var + the focusin scrollIntoView assert) shipped
earlier today and the owner still sees the field lifted. The analysis traces the surviving
mechanism to the one channel no shipped code touches — the window/root-scroller reveal, which a
`nearest` assert provably cannot see on a `position: fixed` element — and to the assert's blindness
to scrolls arriving after its last tick. R2 repurposes the rail's `up` from scroll-list-to-top to
the chat page's bar-reveal semantics, which requires shared bar state (today it is `ChatChrome`
local `useState`) and a panel lift keyed on the existing `--nina-bar-visible` var so the revealed
bar is not hidden behind the opaque z-50 panel.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | The sidebar search field stays visible above the keyboard when it opens (typed text legible); the earlier fix did not hold | 1 |
| R2 | The rail's `up` button shows the main app bottom bar, exactly like the chat page's up button | 2 |

## Scope

**In scope:** the open panel's keyboard-reveal guard (window-scroll pin/restore, deck re-assert
arm/disarm — `NinaSidebar`'s `[open]` effect); the bar state moving into a shared provider
(`AppShell` wiring, `ChatChrome` consumption, panel-dialog focus rule); the panel's bar-lift
arithmetic (`lib/nina/chatview.ts`, pure, var-gated) and the rail floor's matching gate; the rail
`up` button's rewrite to the bar toggle (glyph flip, `aria-expanded`, `aria-controls`,
auto-hide 5 s, keyboard rule).

**Out of scope:** `NinaSearchField`'s internals (the ✕, the debounce, the semantic toggle — all
shipped and not implicated); `keyboardOverlapPx` and the ONE `visualViewport` subscription; the
composer's own keyboard arithmetic; Android keyboard behaviour (no `interactive-widget` meta
change — `keyboardOverlapPx` is 0 there by construction and the panel needs no help); the
`session list` scrolling behaviour beyond removing `onScrollToTop`'s tap handle; `lib/nina/sidebar.ts`
list ordering; any DB/schema/route change.

## Invariants

1. Each phase ends with `npm run typecheck`, `npm run build` and the vitest suite as green as the
   base. **Base measured in this worktree at 5ccae06, 2026-09-09 11:33: typecheck green (after
   `npx next typegen` — a fresh worktree has no `.next/types`, which is an environment artifact,
   not a gate result) and the suite 3489/3489 green in 163 files.** The 4 load-dependent timeouts
   seen in `tests/nina.jobActions.test.ts` during `64034d0`'s run did not reproduce; treat any
   timeout in that file as flakiness to re-run, not a phase failure.
2. Exactly ONE `visualViewport` subscription exists on `/nina` (`ChatScreen.tsx:590`, inside the
   `:583-599` effect). Neither phase adds a READER. After each phase, grep `NinaSidebar.tsx` for
   actual readers — `window\.visualViewport|visualViewport\.` — → 0 hits. (Count readers, not
   mentions: `grep -c visualViewport NinaSidebar.tsx` is **1** at base — a doc comment at line
   391 — and 1 after phase 1, whose rewritten comment keeps one mention. Both phases' verification
   sections grep the reader form, never the bare word.)
3. The `[open]`-keyed effect's dependency array stays exactly `[open]` (the `Sheet.tsx` trap).
   Every new listener, timer and ref lives inside that effect or is read through a ref.
4. All scroll corrections are `behavior: 'instant'` and idempotent no-ops when nothing is wrong.
   No new keyframes; no new `transition-*` beyond what `TabBar` already carries (invariant 8).
5. `lib/` never imports `components/` — the panel-lift arithmetic takes the bar clearance as an
   argument (`controlBottomCss`'s rule).
6. The chat page's toggle and the rail's `up` share ONE bar state; no second writer on
   `NINA_BAR_VISIBLE_VAR` beyond `ChatChrome`'s existing effect (owner unchanged, reader set grows).
7. No behavior change on any route other than `/nina`, and none on `/nina` while the panel is
   closed (the panel effect is `[open]`-gated; the bar provider's resting state is `'hidden'`).
8. The decisive R1 verification is on-device and manual; the plan says so and does not dress
   automated gates up as proof of the fix.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The panel pins the window over its focused field | R1 | `components/nina` | 1 | — | HARD | `.workflows/plan/search-kbd-and-up-btn/phase-1.md` | P1-CN-A001 | — |
| 2 ✅ | The rail's `up` reveals the main bar | R2 | `components/nina` + `components/ui` + `lib/nina` + `tests` | 7 | 1 | HARD | `.workflows/plan/search-kbd-and-up-btn/phase-2.md` | P1-CN-A002 | — |

### Phase 1 — The panel pins the window over its focused field
**Satisfies:** R1
**Owns:** everything inside `NinaSidebar`'s `[open]` effect: window-scroll capture/pin/restore
while a panel text field is focused, and focus-schedule arming/disarming of the existing deck
re-assert. No file outside `NinaSidebar.tsx` changes.
**Does not touch:** `NinaSearchField.tsx`, `lib/nina/chatview.ts` (the schedule and its tests are
not the defect), `ChatScreen.tsx`, the composer, the rail, the panel's `bottom` style.
**Exit criteria:** while a text field inside the open panel is focused, any window scroll is
pinned to 0 and the field's pre-focus scroll position is restored on blur; the deck assert arms on
focus and disarms on blur; typecheck/build/suite at base-green; invariant greps (2, 3) hold.

### Phase 2 — The rail's `up` reveals the main bar
**Satisfies:** R2
**Owns:** the bar state's move into a shared provider (`components/nina/NinaBarProvider.tsx` new,
`AppShell` wiring, `ChatChrome` consumption + panel-dialog focus rule); the pure panel-lift
arithmetic and tests in `lib/nina/chatview.ts`; the rail `up` button rewrite, the panel `bottom`
gaining the bar-lift term, `RAIL_PAD_BOTTOM_CSS`'s matching gate, and the removal of
`onScrollToTop`/the scroll-to-top use of `listScrollRef` — all in `NinaSidebar.tsx` **as it looks
after phase 1** (its ten hunks, 6a-6j, all sit outside phase 1's replaced base 357-442; hunks
6f-6j carry after-phase-1 line numbers); and the provider-placement structural guard in
`tests/nina.sidebarProvider.test.ts`.
**Does not touch:** phase 1's guard block inside the `[open]` effect (quoted verbatim through its
edit); `TabBar.tsx`; `lib/nina/chrome.ts`'s state machine (consumed as-is); the search field.
**Exit criteria:** rail `up` toggles the bar with chat-page semantics (5 s auto-hide, glyph flip,
`aria-expanded`/`aria-controls`, hide on panel-field focus); the bar renders in a reachable strip
below the lifted panel; the chat page toggle still works off the same state; typecheck/build/suite
green; new pure arithmetic covered in `chatview.test.ts`; the placement guard green in
`tests/nina.sidebarProvider.test.ts`.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| Deleted-then-used: phase 2 deletes `onScrollToTop`, `listScrollRef` and the deck div's `ref` — does phase 1's code touch them? | 1 → 2 | Not a conflict — verified against phase 1's actual 191-line replacement block: neither name appears in it (its guards are a delegated `focusin`/`focusout` pair and a `window` listener; no ref is read). Phase 1's own verification greps prove no `+`/`-` line touches either symbol. No edit. |
| Phase 2's hunks 6f-6j sit below base `:443`, inside phase 1's +105 shift, but their headers quoted only base `5ccae06` line numbers — and hunk 6g (the panel's `style` block, base 482-515 → after 587-620) quoted no old text at all | 1 → 2 | Headers now carry both numbers (after-phase-1 first, base second; content is the anchor). 6g's OLD text is now quoted from base — byte-identical after phase 1, per phase 1's anchor table, which was itself verified against the tree (`452→557`, `514→619`, `527→632`, `653→758`, `699→804` all check out). |
| Step 5's ChatChrome toggle-button edit said "replace lines 246-252" while its replacement block ends with the `>` that closes the opening tag (old line 253) — applying as written strands a stray `>` and breaks the build | 2 | Range corrected to 246-253 (and the prose "the glyph `<svg>` at 254-272" corrected — 254 is the button's comment opener). Rung 3: phase 2's own code block. |
| The `onToggle` deletion prose said "the blank line **after** it" while its own range 177-180 is the blank line **above** it; deleting 178-181 instead would leave a double blank the scoped `prettier --check` rejects | 2 | Prose corrected to match the range: delete 177-180, old line 181 stays as the separator between the var-publisher effect and `const glyph`. |
| Step 6's preamble said "Seven hunks"; the contract's own hunk list names ten (6a-6j) | 2 | Corrected to ten. |
| Stale line refs: `chatview.ts` "append after line 375" (the file ends at 374); `tests/nina.sidebarProvider.test.ts` consts ":19-23", "after line 23 `const FIELD`", describe "ends near line 95" (actual: :36-40, after line 40, ends at :81) | 2 | Corrected against the tree at `5ccae06`. |
| Index invariant 2 was unsatisfiable as written — `grep -c visualViewport NinaSidebar.tsx` is **1** at base (a doc comment at line 391), not 0 — and pointed at `ChatScreen.tsx:584` where the read is `:590` | index, 1, 2 | Invariant 2 reworded to count readers (`window\.visualViewport\|visualViewport\.` → 0), the pointer corrected to `:590`; phase 2's comment-filtered raw-string grep replaced with the reader grep phase 1 already used; phase 1's drift note and handoff marked done. |
| Phase-2 file count: index said 6, phase 2's contract says 7 (adds `tests/nina.sidebarProvider.test.ts` for the provider-placement guard) | index, 2 | 7 accepted — the test is the repo's measured precedent for exactly the silent misplacement failure step 4 can cause. Index phase row (files 7, package `+ tests`), phase-2 boundary block and rollback updated; phase 2's "deviation to flag" note marked accepted. |
| Invariant-6 grep promised `grep -rn "nextBarState" components/` → exactly `NinaBarProvider.tsx`, but phase 2's own new rail-button comment and `ChatChrome` docstring mention the name in prose | 2 | Grep re-scoped to what the invariant means: import lines only → exactly the provider's import, plus a dispatch-only check over the two consumer files (no `setBar`, no direct `nextBarState` call outside the provider). |
| Hunk 6g's rewritten `style` comment described the `[open]`-keyed effect as assert-only — false after phase 1, whose effect carries two correctors | 1 → 2 | The paragraph now names both channels (the deck assert on `KEYBOARD_REASSERT_DELAYS_MS`' schedule and the window pin on the root scroller). Rung 1: phase 1's stated contract. |
| Verified clean — no remaining cross-phase conflict | 1, 2 | Phase 1's five new closure-local bindings (`focusedField`, `capturedScroll`, `onWindowScroll`, `disarmPin`, `onPanelFocusOut`) collide with nothing phase 2 adds, and phase 2 edits no region of the effect. Phase 2's new names (`NinaBarProvider`, `useNinaBar`, `panelBottomCss`, `PANEL_BOTTOM_CSS`, `isTextFocusInDialog`, `keyboardEngaged`, `ninaBar`, `glyph`) are unclaimed in phase 1's surface. Every analysis impact point is owned — `NinaSidebar.tsx` is the one shared file, split by region (base 357-442 → phase 1; everything else → phase 2, no overlap). Phase 2's `ChatChrome` import replacement drops exactly the symbols whose last uses its own hunks delete (`useCallback`, `nextBarState`, `type NinaBarState`). Both phases build green at their boundaries; R1 → phase 1 only, R2 → phase 2 only, no unowned requirement. |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| R1's surviving mechanism is not device-observable from code (deck vs root-scroller reveal vs a stale tested bundle) | Fix closes BOTH code channels (deck assert kept + window pin) with idempotent no-op-when-correct corrections; the plan also demands a fresh-load on-device check | 5: user's raw input ("bug still persists") taken at face value |
| Bar state owner for R2: context provider vs CustomEvent one-way channel vs panel-local mirror | Shared provider mounted in `AppShell` beside `NinaSidebarProvider` — the toggle's glyph/`aria-expanded` need read-back, and two controls must not disagree; `AppShell`'s own docstring records this exact sibling-state precedent | 3: `AppShell`'s measured precedent (provider moved there for precisely this reason) |
| How the revealed bar escapes the opaque z-50 panel: z-index raise vs panel lift | Panel lifts by the bar's clearance gated on the existing `NINA_BAR_VISIBLE_VAR` — the composer's own shipped answer to the same geometry; no new z order, no new var | 3: surrounding convention (`composerBottomCss`) |
| Focusing a panel text field while the bar is shown | Hides the bar (extends `ChatChrome`'s focus rule to text fields inside the panel dialog) — `chrome.ts`'s own docstring: a bar shown under a keyboard is shown and invisible | 3: `chrome.ts`'s stated rule |
| Window pin vs capture-and-restore for R1 | Pin to 0 only while a panel field is focused; capture the pre-focus `scrollY` at focus-in and restore it at blur — the conversation behind the panel keeps its reading position | 4: index invariant 7 (no behavior change while the panel is closed/collapses) |
| R1 adds no new pure/tested surface | Accepted: the schedule (`KEYBOARD_REASSERT_DELAYS_MS`) and all DOM behaviour are existing or un-assertable in node-env vitest; the phase's verification is structural greps + base-green suite + the on-device checklist | 1: stated index invariant 8 |

## Open Questions

(none — every fork above was decided and recorded; the on-device confirmation is a verification
step inside phase 1, not an open fork)

## Rollback

- Phase 1: revert `components/nina/NinaSidebar.tsx` to `5ccae06` — single file, no schema, no data.
- Phase 2: revert the six existing files and delete the new one — seven in all — restoring
  `NinaSidebar.tsx` from its **phase-1-complete** state, not from `5ccae06` (a base checkout would
  silently drop phase 1). The bar state's move back into `ChatChrome` is a pure refactor reversal;
  `NINA_BAR_VISIBLE_VAR`'s publisher set and readers return to today's shape.
- Whole set: `git reset --hard 5ccae06` on the branch; nothing outside this worktree is touched
  until land.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f SEARCH_KBD_AND_UP_BTN_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f SEARCH_KBD_AND_UP_BTN_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan SEARCH_KBD_AND_UP_BTN_PLAN.md
