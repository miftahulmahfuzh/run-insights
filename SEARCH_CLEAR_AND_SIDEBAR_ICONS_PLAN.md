# Plan: Nina sidebar — search-field keyboard fix, clear buttons, action icons, bottom icon rail

**Slug:** search-clear-and-sidebar-icons
**Date:** 2026-09-09T01:21:56Z
**Analysis:** `20260909-082156-S3AR_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/search-clear-and-sidebar-icons`
**Branch:** `feature/search-clear-and-sidebar-icons` (base: `origin/main` @ `557a05c`)
**Phases:** 3
**Status:** complete
**Coordinator:** —

## Why

The user's rationale, verbatim (translated structure preserved; the original Indonesian is in the
analysis document's User Input section):

1. **I.search** — (1) bug: tapping "Search all chats" lifts the field off the top of the screen
   behind the keyboard, so typed text is invisible. (2) an ✕ inside the search field (right end)
   that (2a) clears query AND results and (2b) keeps the keyboard up so the user can retype
   immediately.
2. **II.session item** — (1) if an icon library is in use, replace the text buttons "Pin ke atas" /
   "Ganti nama" / "Hapus" with the most fitting icons; (2) an ✕ inside the rename field (right
   end) that (2a) clears the current name and (2b) keeps the keyboard up.
3. **III.icons in sidebar** — "Chat baru" + "Proses foto" waste two rows on a small XS Max screen;
   the chat page already has a floating `<`/`up` pair — (1a) build a 4-icon rail in the sidebar
   (`>`, `up`, `+`, a "Proses foto" icon), (1b) deleting the two full-width buttons, (1c) pinned
   near the XS Max screen bottom with the same gap the chat page uses between query input field
   and screen bottom.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Bug: the search field is lifted off-screen by the keyboard; typed text invisible | 1 |
| R2 | ✕ in the search field (right end): clears query AND results, keyboard stays/raises | 1 |
| R3 | Icon-library answer + icons replacing the "Pin ke atas"/"Ganti nama"/"Hapus" text buttons | 2 |
| R4 | ✕ in the rename field (right end): clears the current name, keyboard stays/raises | 2 |
| R5 | Sidebar bottom rail: 4 icon buttons (`>`, `up`, `+`, "Proses foto") replacing the two full-width rows, composer-gap spacing from the glass | 3 |

## Scope

**In scope:** `components/nina/NinaSidebar.tsx`, `components/nina/NinaSearchField.tsx`,
`components/nina/SessionRow.tsx`, `components/nina/NewChatButton.tsx`, `lib/nina/chatview.ts`
(pure schedule only) + `lib/nina/chatview.test.ts`, and new co-located tests for any new pure rule.

**Out of scope:** `ChatScreen.tsx` (its `visualViewport` subscription is correct and must remain
the only one), `lib/nina/search.ts` rules, `SessionList.tsx`, server actions, schema/migrations,
any admin surface. No new npm dependencies — icons stay inline SVG.

## Invariants

1. The tree builds and `npm test` passes at the end of every phase.
2. **One `visualViewport` subscription per screen** — no phase adds a second listener; keyboard
   reactivity rides the existing `--nina-kb-overlap` channel or avoids `visualViewport` entirely.
3. **No new motion** (invariant 8): no new keyframes; colour-only transitions are fine; any smooth
   scroll respects `prefers-reduced-motion`.
4. **44 px tap targets** for every new button (`size-11` or `Button`'s `md`).
5. **The Link/close race rule**: no control inside the panel fires `closeSidebar()` in the same
   tick as a `<Link>` push; cross-route Links never call `closeRef`.
6. **Accessible names stay Indonesian** ("Pin ke atas"/"Lepas pin", "Ganti nama", "Hapus", "Chat
   baru", "Proses foto", "Tutup daftar chat", "Ke atas").
7. Inputs keep ≥16 px text (the Safari zoom guard in `app/globals.css`).
8. Every new *rule* (reassertion schedule, rail spacing arithmetic) is a pure function in
   `lib/nina/` with a co-located test; components measure, libs decide.
9. One-tap destructive safety is not weakened: `Hapus` keeps `loading={pending}` (disabled during
   the round trip) and stays behind the `⋯` disclosure.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The keyboard stops eating the sidebar's fields; the search field clears | R1, R2 | `components/nina` + `lib/nina` | 4 | — | HARD | `.workflows/plan/search-clear-and-sidebar-icons/phase-1.md` | `P1-RI-A025` | — |
| 2 ✅ | Session actions become icons; the rename field clears | R3, R4 | `components/nina` | 1 | — | NORMAL | `.workflows/plan/search-clear-and-sidebar-icons/phase-2.md` | `P1-RI-A026` | — |
| 3 ✅ | The sidebar's bottom icon rail | R5 | `components/nina` | 2 | 1 | NORMAL | `.workflows/plan/search-clear-and-sidebar-icons/phase-3.md` | `P1-RI-A027` | — |

### Phase 1 — The keyboard stops eating the sidebar's fields; the search field clears
**Satisfies:** R1, R2
**Owns:** the panel-level focus-reassertion effect (`NinaSidebar.tsx`) and its pure schedule
(`lib/nina/chatview.ts` + test); the search field's ✕ button and clear semantics
(`NinaSearchField.tsx`).
**Does not touch:** `SessionRow.tsx`, `NewChatButton.tsx`, `ChatScreen.tsx`, the panel's layout
beyond the new effect (the rail restructure is phase 3's).
**Exit criteria:** on keyboard-open over ANY field inside the open panel (search today, rename via
the same mechanism), the focused field is re-asserted visible over the keyboard-animation window
(`scrollIntoView({ block: 'nearest', behavior: 'instant' })`, idempotent, scheduled purely); the
search ✕ renders when text is non-empty, clears `text` + `result` (query AND results), keeps focus
in the input; `chatview.test.ts` covers the new schedule; build + tests green.

### Phase 2 — Session actions become icons; the rename field clears
**Satisfies:** R3, R4
**Owns:** `SessionRow.tsx` — the three menu buttons become icon-only (Lucide-lineage inline SVG,
44 px, `aria-label` preserved, pending/error behaviour unchanged); the rename `Input` gains a ✕
(inside the field's right end) that empties `draft` and refocuses the input.
**Does not touch:** `NinaSidebar.tsx`, `NinaSearchField.tsx`, `NewChatButton.tsx`, any lib file
(no new rules — the phase-1 panel effect already covers the rename field's keyboard exposure).
**Exit criteria:** menu renders pin/pencil/trash icon buttons with identical actions, targets,
pending gating and error line; the ✕ appears only when `draft` is non-empty, clears it, and focus
stays in the input (keyboard up); no `Button` API changes leak; build + tests green.

### Phase 3 — The sidebar's bottom icon rail
**Satisfies:** R5
**Owns:** `NinaSidebar.tsx` restructure (scroll area for the list + pinned bottom rail; removal of
the two full-width rows; rail spacing = the composer's floor arithmetic), `NewChatButton.tsx`
becoming the rail's icon-only `+`.
**Does not touch:** `NinaSearchField.tsx`, `SessionRow.tsx`, `ChatScreen.tsx`, `lib/nina/chatview.ts`
(composer arithmetic is imported/quoted, not edited); phase 1's focus-assert effect must survive
the restructure quoted as it looks AFTER phase 1.
**Exit criteria:** sidebar shows no full-width "Chat baru"/"Proses foto" rows; a 4-button rail
(`>` close = the trigger's chevron mirrored, `up` = scroll list to top with reduced-motion
respect, `+` = create chat via the existing action/semantics, wand-sparkles Link =
`NINA_JOBS_HREF` never calling `closeRef`) is pinned at the panel bottom; the rail's gap to the
glass equals the composer's (8 px + `max(0px, var(--safe-bottom)/2 - 3.25px)` = 21.75 px on XS
Max; flush when the keyboard is up because the panel already ends at the keyboard top); the
`searchSlot`/`newChatSlot` seams are updated honestly; build + tests green.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| ✕-button convention fork: phase 1 prescribed an `onClick`-only clear + `focus()` (its prose claimed "on iOS the input never lost focus to the tap"), no `rounded-pill`; phase 2 prescribed `onPointerDown` preventDefault + `focus()` in the click handler, a `text-[17px]` glyph wrapped in an `aria-hidden` span | 1, 2 | Aligned into ONE convention, phase 2's event strategy winning: the pointerdown `preventDefault()` is the mechanism that actually guarantees both phases' shared exit criterion "keyboard stays up" — a bare tap blurs the input on iOS and folds the keyboard before the click's `focus()` can re-raise it. Phase 1 adopted `onPointerDown` preventDefault + `focus()` in click and the panel-header ✕ skin (`rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70`, raw glyph child — the header's own classes at `NinaSidebar.tsx:377`); phase 2 moved 17px→19px, added `active:opacity-70`, dropped the span. The structural pattern (relative wrapper + absolute `w-11` ✕ + conditional `pr-11`, `HeroFields` source-order precedent) already matched in both. Labels deliberately differ per field: "Hapus pencarian" (search) / "Kosongkan nama" (rename). |
| Phase 3 quoted `NinaSidebar.tsx` from the plan index (phase-1.md did not exist at its planning time): its Step-3 whole-`return` replacement omitted phase 1's appended `bottom:`-style comment paragraph, and its import note ignored phase 1's `KEYBOARD_REASSERT_DELAYS_MS` import — a same-file collision where the later phase quoted pre-change state | 1, 3 | Phase 3's baseline updated to the post-phase-1 `NinaSidebar`: the Step-3 quote now carries phase 1's paragraph ("This edge fixes the panel's BOX…") verbatim ahead of phase 3's own rail paragraph, the Files note records phase 1's import as present and load-bearing, and the anchors carry a line-drift caveat. Edit regions verified non-overlapping (phase 1: import / `[open]` effect / style-comment append; phase 3: module constants / component tail / `return` / `newChatSlot` docstring) — the declared sequence 1→3 holds, and only phase 1's comment paragraph crosses the boundary, now quoted. |
| Phase 3 left a conditional runtime decision to the executor ("if phase 1's effect touches `panelRef.current.scrollTop`, redirect that access to `listScrollRef`") | 1, 3 | Retired as moot: phase 1's landed prescription is element-level `scrollIntoView({ block: 'nearest', behavior: 'instant' })` on the focused field with zero `scrollTop` access, and its dep array stays exactly `[open]`. Phase 3's Preamble rewritten from "flagged to the reconciler" to "verified", and the same redirect clause removed from its Handoffs. The restructure's obligations are restated as invariants it provably meets: all text fields stay descendants of the panel div (search field and rename rows sit inside the scroll deck; the rail holds none), listener + teardown untouched. |
| `NewChatButton`'s pending label misquoted as "Membuat chat baru…" — the tree reads "Membuka chat baru…" (`NewChatButton.tsx:78`) | 3 | Corrected in phase 3's Interface Contract, Step-1 docstring and Handoffs. Cosmetic to the outcome (the sentence is deleted either way), but the contract must quote the tree truthfully. |

Verified with no edit needed: R1→1, R2→1, R3→2, R4→2, R5→3 (all owned, no creep); all six analysis impact points owned (chrome.ts read-only by phase 3, as the analysis expected); `PinIcon`→`PinnedIcon` is module-private in `SessionRow.tsx` with no referent in any other phase's plan; `NinaSearchField.tsx` is phase 1's alone and phase 3 keeps the bare `<NinaSearchField />` the `tests/nina.sidebarProvider.test.ts:116` source assertion requires; the rail formula's kb-overlap term matches `composerPadBottomCss`'s keyboard branch (floor 0 extra px keyboard-up, the row's `py-2` the whole gap, per `chatview.ts:299`); 44 px targets and Indonesian accessible names are consistent across all three plans (phase 3's `size-11` rail explicitly overrides the chat pair's 32 px exception with the reasoning recorded in its R5 docstring).

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| ✕-button clear mechanism: bare tap + `focus()` in click (phase 1) vs `onPointerDown` `preventDefault()` + `focus()` in click (phase 2) | Phase 2's: pointerdown `preventDefault()` — the tap never blurs the input, so the keyboard never folds; `focus()` covers keyboard-Enter and focus-elsewhere entry | 2: phase exit criteria ("keyboard stays up" is promised by both; only preventDefault guarantees it) |
| R3's "menggantikan": icon-only buttons, or icons beside the text? | Icon-only, 44 px, with the Indonesian labels preserved as `aria-label`s — matching `NinaJobActions`' row-action shape; the space-saving motive of the set (III.1) is the same | 5: user raw input |
| The rail's `>` closes the sidebar — and does the header ✕ go? | `>` closes (mirror of the chat page's `>` trigger); the header ✕ STAYS — its removal was not asked for and two ways out of a modal panel is the safer default | 5: user raw input |
| R1 approach: restructure the panel now (pin the field outside the scroll container) vs additive focus-reassertion | Additive reassertion (`scrollIntoView({block:'nearest'})` over the keyboard window) — it covers the rename field mid-list too, adds no second `visualViewport` listener, and leaves the restructure to phase 3, which needs it for the rail anyway | 1: plan invariants (2 and 1) |
| The search input's `type="search"`: keep (native clear) vs `type="text"` + our own ✕ | `type="text"` + our ✕ — iOS Safari's native clear glyph would double ours and Chrome Android shows none; `enterKeyHint="search"` keeps the blue SEARCH key | 3: phase-1 plan's code blocks (reasoned from convention) |
| Rail button size: the chat pair's 32 px owner exception vs the 44 px floor | 44 px (`size-11`) — the exception's own defence (missed tap hits nothing) fails in a 6 px-gap rail holding two consequential actions (`+` creates, `>` closes) | 1: plan invariant 4 |
| "Proses foto" rail glyph: camera vs wand-sparkles vs the current `◔` text glyph | `wand-sparkles` (AdminNav's verbatim lucide-static copy) — its own trio comment assigns the wand to *how a photograph is MADE*, which is what `/nina/jobs` is | 6: surrounding convention |

## Open Questions

<None. Every fork encountered was decidable on the ladder above; nothing in this set is
irreversible until the merge to `main`.>

## Rollback

Each phase is one commit (or one small series) on `feature/search-clear-and-sidebar-icons`:
`git revert` the phase's commit(s) independently. Whole-set rollback = delete the branch; the
merge to `main` is the point of no return and happens outside this plan.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md
