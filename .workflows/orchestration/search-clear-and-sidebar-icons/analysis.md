# Code Analysis: Nina sidebar — search field keyboard bug, clear buttons, action icons, bottom icon rail

**Type:** Bug Investigation + Feature Update
**Date:** 2026-09-09T01:21:56Z
**Session ID:** 20260909-082156-S3AR
**Plan:** `SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md` (3 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/search-clear-and-sidebar-icons` — branch `feature/search-clear-and-sidebar-icons` (base `origin/main` @ `557a05c`)

---

## User Input

### Original User Request

> work on a new worktree from origin/main
> I.search
> 1. bug: saat ini, saat saya mengklik "Search all chats" , text search field nya terangkat keatas oleh keyboard. sehingga apa yang diketik user tidak kelihatan
> 2. tolong tambahkan tombol x didalam search field (diujung kanan) . jika user mengklik tombol x, maka otomatis:
> 2a. search query DAN search results dihapus
> 2b. keyboard langsung muncul, sehingga user langsung bisa ngetik query search nya
>
> II.session item
> 1. apakah saat ini kita sudah menggunakan suatu icons library? jika sudah, pilih icons yang paling
>    sesuai untuk menggantikan "Pin ke atas" "Ganti nama" "Hapus"
> 2. saat user klik "Ganti nama", tolong tambahkan tombol x didalam text field nama session nya (diujung
>    kanan) . jika user mengklik tombol x, maka otomatis:
> 2a. isi text (nama session saat ini) dihapus
> 2b. keyboard langsung muncul, sehingga user langsung bisa ngetik nama session nya
>
> III.icons in sidebar
> 1. saat ini "Chat baru" dan "Proses foto" memakan 2 baris di layar xs max yang kecil. kita sudah punya 2
>    tombol (< dan up) di halaman chat,
> 1a. di sidebar, buat 4 icon based tombol : > , up , + , dan icon untuk "Proses foto"
> 1b. sehingga kita bisa menghapus existing tombol "Chat baru" dan "Proses foto" yang memakan 2 baris pada
>     screen
> 1c. pastikan posisi 4 tombol ini dekat dengan xsmax bottom screen, gunakan jarak yang sama dengan jarak
>     chat query input field <-> bottom screen pada halaman chat

### User-Provided Context

- Device of record: iPhone XS Max (414×896 CSS px, `--safe-top` 44, `--safe-bottom` 34). The repo's
  comments repeatedly use XS Max numbers; the user names it explicitly in III.1.
- The user's "2 tombol (< dan up) di halaman chat" are the floating pair in `ChatChrome`: the sidebar
  trigger `>` (`NinaSidebarTrigger`) and the tab-bar toggle chevron (`^`/`v`, glyph `M6 14l6-6 6 6`) —
  `components/nina/ChatChrome.tsx:244-273`.

### User-Provided Files

- None (`@`-mentioned). Targets inferred from the prose: `components/nina/NinaSearchField.tsx`,
  `components/nina/SessionRow.tsx`, `components/nina/NinaSidebar.tsx`, `components/nina/NewChatButton.tsx`.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Bug fix: tapping "Search all chats" lifts the search field off the top of the screen behind the keyboard; typed text is invisible |
| R2 | An ✕ button inside the search field (right end) that clears the query AND the results, and keeps/raises the keyboard so the user can type immediately |
| R3 | Answer whether an icon library is in use; if so, pick the most fitting icons to replace the text buttons "Pin ke atas" / "Ganti nama" / "Hapus" in the session item menu |
| R4 | An ✕ button inside the rename field (right end) that clears the current name and keeps/raises the keyboard so the user can type immediately |
| R5 | In the sidebar, replace the two full-width buttons "Chat baru" + "Proses foto" (two rows) with 4 icon buttons — `>`, `up`, `+`, and a "Proses foto" icon — pinned near the XS Max screen bottom, using the same gap the chat page uses between query input field and screen bottom |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

Five changes to `/nina`'s sidebar panel and its fields:

1. **R1 — the keyboard still eats the search field.** A fix already shipped (`8cd8c1b`, on
   `origin/main`): the panel ends at the keyboard's measured top edge via
   `bottom: var(--nina-kb-overlap, 0px)`. The user reports the lift *persists on the current
   build*: tap "Search all chats" → keyboard rises → the field rides up off the top of the glass →
   the typed text is invisible. The remaining mechanism is the panel's own scroll (analysis below).
2. **R2 — explicit clear in the search field.** An ✕ inside the field's right end. Native
   `type="search"` clear affordances are inconsistent (iOS Safari shows one; Chrome Android does
   not) and do not implement 2a+2b as one tap.
3. **R3 — icons for the session menu.** The three menu actions are currently text `Button`s.
   Replace with icon buttons per the repo's icon conventions (inventory below).
4. **R4 — explicit clear in the rename field.** Same shape as R2, applied to the rename draft input
   in `SessionRow`.
5. **R5 — a pinned bottom icon rail.** The sidebar currently spends two full-width rows (44 px each
   + margins) on "Chat baru" and "Proses foto". Replace with four icon buttons in a rail pinned to
   the panel's bottom: `>` closes the sidebar, `up` scrolls the session list to top, `+` creates a
   chat, the fourth opens "Proses foto" (`/nina/jobs`). The rail's bottom gap must equal the chat
   page's query-input-to-glass gap.

**Success Criteria**

- On XS Max: tap "Search all chats" → the field remains fully visible above the keyboard; every
  keystroke is visible on screen.
- The search ✕ appears when there is text; tapping it empties the field, removes the results block
  (hits, pending line, "No matches.", degraded notice), and leaves focus in the input so the
  keyboard is up.
- The rename ✕ appears when the draft is non-empty; tapping it empties the draft and leaves focus
  in the input.
- The session `⋯` menu shows three icon buttons with the same actions, same 44 px targets, same
  pending/error behaviour, accessible names preserved in Indonesian.
- The sidebar shows no full-width "Chat baru"/"Proses foto" rows; the four icon buttons sit in a
  rail at the panel bottom whose gap to the glass equals the composer's floor (8 px row padding +
  `max(0px, var(--safe-bottom)/2 - 3.25px)` = 21.75 px on XS Max), flush above the keyboard when the
  keyboard is up.
- `npm run build`, `npm run typecheck`, `npm test` pass; no new motion (invariant 8) and no new
  `visualViewport` subscription.

**Key Considerations**

- **The single-subscription rule.** `ChatScreen` owns the ONE `visualViewport` subscription on the
  screen; `ChatChrome`'s and `Nina_KEYBOARD_OVERLAP_VAR`'s docstrings both forbid a second. Any new
  keyboard reactivity must ride the existing channel (the CSS var) or avoid `visualViewport`.
- **iOS fixed-position reality.** The layout viewport does not shrink on iOS when the keyboard
  opens; `position: fixed` overlays run behind the glass and Safari's focus reveal moves things.
  The composer's shipped answer is "measure the overlap, position the chrome yourself, never trust
  Safari to scroll it into view" (`lib/nina/chatview.ts:125-180`).
- **The rename field shares the panel's keyboard exposure** (R4 lives mid-list, the search field at
  the top of the scroll content) — the R1 fix must cover both, which an element-level assertion
  does and a "reset panel scrollTop" hack does not.
- **Motion invariant 8** (`app/globals.css`): no new keyframes; `transition-colors` is fine; smooth
  scrolls must respect `prefers-reduced-motion`.
- **16px input rule**: `app/globals.css` forces `input { font-size: max(16px, 1rem) }` (Safari zoom
  guard); do not shrink field text.
- **The sidebar's Link/close race rule**: nothing inside the panel may fire `closeSidebar()` in the
  same tick as a `<Link>` push (`NinaSearchField`'s and `NinaSidebar`'s headers document the
  measured production incident). The rail's `>` and `+` and `up` are buttons, not Links; the
  "Proses foto" control is a Link and must NOT call `closeRef`.
- **No component tests exist** (`vitest.config.ts` is `environment: 'node'`, no jsdom): every new
  *rule* (timings, spacing arithmetic) must live as a pure function in `lib/nina/` with a
  co-located test; components stay thin.

**Assumptions**

- Production runs `origin/main` (repo convention; local `main` at `85c98f6` is stale/divergent — the
  worktree is cut from `origin/main` @ `557a05c` per the user's instruction).
- The R1 report is against the build that already contains the `--nina-kb-overlap` panel-bottom fix
  (it is on `origin/main`); i.e. the fix is insufficient on its own, not unbuilt.
- "Menggantikan" in R3 means icon-only buttons (with the Indonesian labels preserved as accessible
  names), matching `NinaJobActions`' row-action pattern.
- The user's `>` for the rail means *close the sidebar* — the mirror of the chat page's `>` trigger
  which *opens* it; the header ✕ stays (its removal was not asked for).

---

## Analysis Scope

### Explicitly Mentioned Files

- `components/nina/NinaSearchField.tsx` (R1, R2)
- `components/nina/SessionRow.tsx` (R3, R4)
- `components/nina/NinaSidebar.tsx` (R1 mechanism, R5)
- `components/nina/NewChatButton.tsx` (R5)

### Discovered Related Files

- `components/nina/ChatScreen.tsx:583-632` — the single `visualViewport` subscription; publishes
  `--nina-kb-overlap` on `:root`.
- `lib/nina/chatview.ts:125-326` — `keyboardOverlapPx`, `KEYBOARD_MIN_PX`,
  `NINA_KEYBOARD_OVERLAP_VAR`, `composerBottomCss`, `composerPadBottomCss` (the spacing R5 must
  mirror).
- `lib/nina/chrome.ts` — `NINA_CHROME_CONTROL_CLASS`, `controlBottomCss`, `CHROME_CONTROL_PX` (the
  floating controls' geometry on the chat page).
- `components/nina/ChatChrome.tsx` — the chat page's floating pair (`>` + `^`/`v`), the visual
  reference for R5's rail buttons.
- `components/nina/NinaJobActions.tsx:108-235` — the repo's existing icon-only row-action pattern
  (`RedoIcon`, `TrashIcon`: 44 px pill, `aria-label`, `aria-busy`/`disabled={pending}`).
- `components/admin/AdminNav.tsx:216-320` — the newest icon convention: verbatim `lucide-static`
  (1.42.0, ISC) SVG copies with attribution comment; also defines the photo-trio semantics
  (`ImagesIcon` album / `WandSparklesIcon` image generation / `CameraIcon` chat photos).
- `components/ui/Field.tsx` — `Field` (has `relative` wrapper + `suffix` slot), `Input` (forwards
  `ref`, reads Field context), `CONTROL_CLASS`.
- `components/ui/Button.tsx` — `variant`/`size`/`loading` (loading = `disabled` + dots replace
  children).
- `components/nina/SessionList.tsx`, `lib/nina/sidebar.ts` — list planning; `SessionList` renders
  `SessionRow` rows.
- `lib/nina/search.ts`, `lib/nina/searchActions.ts` — search rules (`normalizeSearchQuery`,
  `shouldRunSearch`, `searchDebounceMs`, `SEARCH_QUERY_MAX_CHARS`) and the server action.
- `lib/nina/sessions.ts` — `NINA_SESSION_TITLE_MAX_CHARS`.
- `lib/nina/sessionActions.ts` — `createNinaChatSession`, `renameNinaChatSession`,
  `setNinaChatSessionPinned`, `removeNinaChatSession`.
- `lib/nina/jobview.ts` — `NINA_JOBS_HREF` (the "Proses foto" destination).
- Tests: `lib/nina/chatview.test.ts`, `lib/nina/chrome.test.ts`, `lib/nina/sidebar.test.ts`,
  `tests/nina.sidebarProvider.test.ts` — the assertion surface for any new pure rules.

---

## Current Dataflow

### Entry Point: opening the sidebar

**Location:** `components/nina/NinaSidebar.tsx:116-162, 203-448`
**Trigger:** the floating `>` (`NinaSidebarTrigger`, rendered by `ChatChrome`) pushes `?sidebar=1`
via `window.history.pushState`; `NinaSidebarProvider` reads `useSearchParams` → `isSidebarOpen`.
**On open:** panel takes focus (`panelRef.focus()`), `document.body.style.overflow = 'hidden'`,
Escape closes, close restores previous focus. The panel is always-mounted, `inert={!open}`,
`fixed inset-0 overflow-y-auto overscroll-contain`, translated `-translate-x-full ↔ translate-x-0`,
`z-50`, column `max-w-[470px]`, and — since `8cd8c1b` —
`style.bottom = var(--nina-kb-overlap, 0px)` (inline, to beat `inset-0`).

Panel content order today: header (avatar link, "Nina", ✕ close) → `searchSlot ?? <NinaSearchField/>`
→ `newChatSlot ?? <NewChatButton/>` → "Proses foto" `<Link href={NINA_JOBS_HREF}>` → `<SessionList/>`.
Everything after the header lives in ONE scroll container (the panel itself,
`overflow-y-auto`).

### Processing Chain: the keyboard overlap

1. **Function:** `keyboardOverlapPx` — `lib/nina/chatview.ts:167`
   - `innerHeight - visualHeight - visualOffsetTop`, zeroed below `KEYBOARD_MIN_PX` (120), while
     `scale > 1` (pinch), and for non-finite reads.
2. **Subscription:** `ChatScreen.tsx:589-609` — the ONE `visualViewport` listener
   (`resize` + `scroll`), calls `setOverlap(...)`.
3. **Broadcast:** `ChatScreen.tsx:622-632` — sets `--nina-kb-overlap: <n>px` on
   `document.documentElement` while > 0; REMOVES it at 0 and on unmount (absent = resting
   geometry).
4. **Consumers:** the composer (`composerBottomCss`/`composerPadBottomCss`) and the sidebar panel's
   inline `bottom`.
5. **Reassertion: none.** Nothing ever corrects the panel's (or the document's) scroll position
   after Safari performs its focus reveal. This is the gap R1 lives in.

### The R1 bug: what the shipped fix did and did not cover

**The shipped theory** (NinaSidebar.tsx:319-340, chatview.ts:201-226): iOS does not shrink the
layout viewport; a `fixed inset-0` panel runs behind the keyboard; Safari's focus reveal "lifts the
whole fixed overlay"; ending the panel at the keyboard's top edge should leave the field inside the
visible region so the reveal has nothing to do.

**What persists (the user's report, on the build containing that fix):** the field still exits the
top of the glass when the keyboard opens. The distinguishing fact: the search field sits at the TOP
of a tall scrollable content block inside the panel's own `overflow-y-auto` container (header
~100 px + field, then new-chat button, jobs link, and the whole session list below — far taller
than the panel). When the keyboard opens over a field inside a scrollable container, iOS Safari
scrolls that container (its "reveal"/safe-area adjustment) — the container's `scrollTop` becomes
non-zero even though the field was already visible. The panel then shrinks (the var lands a beat
later, through React state → effect → style), the container keeps its scrolled offset, and the
field — pinned at the top of the *content* — rides up out of the container's top edge. Typed text
invisible; `bottom: var(--nina-kb-overlap)` cannot help because the panel's *box* is already
correct — its *scroll* is wrong.

Supporting evidence from the same screen: the composer never exhibits the lift, and it is the one
fixed element that is NOT inside any scroll container. The document itself is also scrollable (the
conversation scrolls `window` — `MessageList.tsx:163,223`), so a document-level reveal scroll is a
secondary candidate carrier; an assertion applied to the focused element corrects every scrollable
ancestor at once (`scrollIntoView({ block: 'nearest' })` walks them all), so the same fix covers
both candidates without needing to prove which one fired.

**Testability:** the exact Safari scroll cannot be reproduced in this repo (`environment: 'node'`,
no jsdom). The fix must therefore be an *idempotent assertion over the keyboard-open window* —
"after the keyboard opens, whatever scroll Safari performed, make the focused field visible again"
— with the schedule (the timings) as the pure, tested part.

### Processing Chain: the search field (R2's surface)

**Location:** `components/nina/NinaSearchField.tsx:70-284`
**State:** `text` (raw), `result: { query, semantic, response } | null` (tagged), `requestRef`
(monotonic id — a Server Action cannot be cancelled; stale responses are dropped by id),
`semantic` toggle (persisted via `useSemanticPref`).
**Flow:** `text → normalizeSearchQuery → shouldRunSearch (min chars)` → effect debounces
(`searchDebounceMs`: 250 ms text / 700 ms semantic) → `searchNinaChats({query, semantic})` →
`setResult` → derived `response`/`pending`/`hits`/`showEmpty`/degraded-notice render.
**Already-shipped keyboard behaviours:** Enter/blue-SEARCH blurs the field (folds the keyboard,
`isComposing`-guarded); no `autoFocus`; `CONTROL_CLASS` keeps 16 px text.
**Native clear:** the input is `type="search"` — iOS Safari draws its own small clear glyph; Chrome
Android does not. There is no app-owned clear, and nothing clears `result` together with the text
(R2a) today.

### Processing Chain: the session row (R3/R4's surface)

**Location:** `components/nina/SessionRow.tsx:115-329`
**State:** `mode: 'idle' | 'menu' | 'rename'`, `draft` (prefilled from `session.title` on
`open('rename')`), `error`, `pending`.
**Menu today:** three full `Button`s — `Pin ke atas`/`Lepas pin` (secondary), `Ganti nama`
(secondary), `Hapus` (destructive) — `loading={pending}` on pin/hapus; refusal keeps the panel open
with the error line ("Tidak bisa. Coba nama lain.").
**Rename today:** `Field label="Nama chat"` + `Input` (`maxLength = NINA_SESSION_TITLE_MAX_CHARS`,
`enterKeyHint="done"`), `Simpan`/`Batal` buttons; NO clear control; focus behaviour relies on the
panel's effect-keyed-on-`open`-alone rule (NinaSidebar.tsx:253-270) to keep the keyboard up while
typing.
**Server:** `renameNinaChatSession` (`sanitizeNinaSessionTitle` refuses empty/invisible/over-cap —
the rule is the server's; the row supplies the words).

### Exit Points: the two buttons R5 replaces

- **`NewChatButton`** (`components/nina/NewChatButton.tsx`): `createNinaChatSession()` → newest
  empty session is reused (never a second empty one) → `router.replace(outcome.next)`; refusal →
  `onNavigate()` (closes the sidebar). Renders `+ Chat baru` full-width, `h-11`, ink slab.
- **"Proses foto" Link** (`NinaSidebar.tsx:425-438`): plain `<Link href={NINA_JOBS_HREF}>`
  (`/nina/jobs`), `paper-2` tint, `◔` text glyph, deliberately does NOT call `closeRef` (the
  Link/close race rule).

### Key Data Structures

- `SidebarSession`, `planSessionList`, `SIDEBAR_PARAM`, `withSidebarParam` — `lib/nina/sidebar.ts`.
- `NinaSearchResponse { hits, capped, mode, … }` — `lib/nina/search.ts`.
- `NinaSessionActionResult { ok, next }` — `lib/nina/sessionActions.ts`.
- CSS vars on `:root`: `--nina-kb-overlap` (keyboard), `--nina-bar-visible` (tab bar),
  `--safe-top` / `--safe-bottom` (notch insets).

### Dependencies

- No icon npm package exists (`lucide-react` absent from `package.json`). Icons are inline SVG.
- `--nina-kb-overlap` is produced only on `/nina` (ChatScreen) and only while mounted; the sidebar
  panel substitutes `0px` elsewhere/pre-hydration.
- The composer's bottom-gap arithmetic (`composerBottomCss` + `composerPadBottomCss` +
  the row's `py-2` = 8 px) yields the number R5-c must reproduce: **8 px + max(0px, 34/2 − 3.25) =
  21.75 px on XS Max**, and `0px` extra when the keyboard is up (keyboard top edge is the floor).

---

## The icon inventory (R3's question, answered)

The repo has **no icon *package*** — and a very definite icon *system*, in three generations:

| Generation | Where | Shape |
|---|---|---|
| Hand-written Feather-style paths | `components/ui/TabBar.tsx`, `SessionRow`'s `PinIcon`, `NinaJobActions`' `RedoIcon`/`TrashIcon`, `NinaSidebar`'s `>` chevron, `ChatChrome`'s `^`/`v` | `viewBox 0 0 24 24`, `strokeWidth 2` (2.4 for chevrons), round caps, `currentColor`, `aria-hidden` |
| Verbatim `lucide-static` copies | `components/admin/AdminNav.tsx` (7 glyphs, since 2026-09-08) | same grid/stroke idiom, fetched from `unpkg.com/lucide-static@1.42.0` (ISC), attribution comment in the file |
| Text glyphs | `✕` (close, header), `⋯` (disclosure), `+` (NewChatButton), `◔` (Proses foto) | prose characters, styled by font |

**Answer to "apakah sudah menggunakan icons library?":** no dependency, but the de-facto standard is
Lucide (Feather-lineage) inline SVG — and `AdminNav` is the recorded, most-recent convention:
*"Lucide is the smallest that covers all seven semantics in one weight … it is the exact idiom this
repo already draws … seven glyphs is not worth a package either."*

**Selections that follow from it** (planners verify against the live glyph sources):

| Slot | Glyph | Why |
|---|---|---|
| Pin ke atas / Lepas pin | Lucide `pin` (stroke) | the row already renders a hand-written thumbtack *state* glyph (`PinIcon`); the *action* gets the same silhouette — one shape for one concept |
| Ganti nama | Lucide `pencil` | the standard "rename" glyph in every Lucide-era app; unambiguous at 18 px beside a title |
| Hapus | the existing `TrashIcon` idiom (`NinaJobActions`) / Lucide `trash-2` | already the repo's delete shape — reuse the path verbatim rather than a second trash |
| Rail `>` | the exact `NinaSidebarTrigger` chevron path (`m9 6 6 6-6 6`, `strokeWidth 2.4`) | the user asked for the mirror of the chat page's trigger |
| Rail `up` | the exact `ChatChrome` up-chevron (`M6 14l6-6 6 6`) | "kita sudah punya 2 tombol (< dan up)" — reuse the same glyph |
| Rail `+` | `+` as the existing NewChatButton glyph, or Lucide `plus` at the same weight | continuity with the button it replaces |
| Rail "Proses foto" | Lucide `wand-sparkles` (AdminNav's fetched copy) | AdminNav's own trio comment assigns the wand to *image generation* — `/nina/jobs` is the runner's image-processing queue |

---

## Impact Points (files that WILL need changes)

1. `components/nina/NinaSidebar.tsx` — R1: the focus-assert effect on the panel; R5: the flex
   restructure (scroll area + pinned bottom rail), removal of the two full-width rows, rail
   composition and spacing. Owned by phases 1 and 3 (sequenced).
2. `lib/nina/chatview.ts` + `lib/nina/chatview.test.ts` — R1: the pure reassertion schedule (and
   nothing else; `keyboardOverlapPx` and the composer functions are already correct). Phase 1.
3. `components/nina/NinaSearchField.tsx` — R2: the ✕ button, clear semantics (text + `result` +
   in-flight guard), focus retention. Phase 1.
4. `components/nina/SessionRow.tsx` — R3: icon buttons for pin/rename/remove; R4: the ✕ in the
   rename field. Phase 2.
5. `components/nina/NewChatButton.tsx` — R5: becomes the rail's `+` (icon-only) or is absorbed into
   the rail; its create/refuse logic is unchanged. Phase 3.
6. `lib/nina/chrome.ts` — touched only if the rail reuses `NINA_CHROME_CONTROL_CLASS`/
   `controlBottomCss` arithmetic; no rule changes expected. Phase 3 (read-only unless a shared
   helper is extracted).

**Not touched:** `ChatScreen.tsx` (the subscription is correct; no second listener may be added),
`lib/nina/search.ts` (rules unchanged), `SessionList.tsx`, the server actions, any route/migration
(no schema change anywhere in this set).

**This document describes. The plan files prescribe.**
