# Package: components/ui

**Location**: `components/ui`
**Last Updated**: 2026-09-12 — initial creation, written after reading every source file in the
directory and grepping every importer in the repo. **Every count below is measured at commit
`6759f26` on 2026-09-12** (the method, once per number: a module-resolved import graph over the
whole repo — the same discipline the 2026-09-12 YAGNI sweep used — not a name grep). Volatile
numbers carry their measure date; re-measure before quoting them forward. The reverse-wiring map
in the middle of this document is the reason it exists: until now no file answered "who imports
this primitive, and how".

## Overview

`components/ui` is the app's shared component kit: fifteen components (ScreenHeader shares
`AppShell.tsx`'s module), two client hooks, and one barrel. It is the base of the dependency graph's component half —
**77 files outside this directory import from it** (72 production files across `app/` and
`components/`, 5 test files; measured 2026-09-12), which makes every decision in here a
decision everyone else inherits. The directory is 5,213 lines over 33 files (measured
2026-09-12): 16 source modules, one `index.ts` barrel, and 16 colocated happy-dom suites —
every source file has one, 203 tests, **green at `6759f26`** (`vitest components/ui`:
203/203).

Two rules organise everything, and both are import-graph rules:

1. **The barrel is client-safe, and stays that way by audit.** `index.ts` re-exports exactly
   15 names, every one reachable from a browser bundle. `AppShell` and `ScreenHeader` are
   deliberately NOT re-exported: `AppShell` became a Server Component in F33 phase 10 (it
   renders Nina's unread badge through `NinaUnreadBadgeSlot`, which reaches `auth.ts` and
   `lib/env.ts`), and a Server Component in the barrel would turn every
   `import { Card } from '@/components/ui'` in a `'use client'` file into a build error.
   `tests/share.bundle.test.ts` asserts the public share route's module graph contains
   neither `components/ui/index.ts` nor `AppShell.tsx` nor `TabBar.tsx` — the audit that
   keeps the rule from eroding.
2. **Directive-free primitives compile into whichever graph imports them.** `Button`,
   `Card`, `Chip`, `EmptyState`, `RunDateLink`, `SplitsTable`, `ZoneBar`, `FlagList` and
   `ScreenHeader` carry no `'use client'`: no hooks, no effects, no event handlers beyond
   what markup allows. A server page renders them to HTML with no client JS shipped; a
   client component gets interactivity for free. Only seven of the sixteen source modules
   are genuinely client — `Field.tsx`, `Sheet.tsx`, `TabBar.tsx`, `PhotoViewer.tsx`,
   `DetailPanel.tsx`, `useSavePhoto.ts`, `usePanelParam.ts` — and each carries its reason
   in its header. (`AppShell.tsx` is the directive-free Server Component: no directive, and
   no hooks either.)

The kit implements the design brief (`docs/design-brief.md`) and the v2 tokens in
`app/globals.css`; the F-numbers scattered through the docstrings are cards of the archived
build-out plan (`docs/plans/archive/F*.md`). The §-references (§3.2, §9, roadmap §4.8) are
that plan's sections. Where a docstring and this readme disagree, the docstring wins — it
sits next to the code — and this readme should be corrected.

**Key Responsibilities:**

- Provide the one `<button>`, the one surface (`Card`), the one form-control shell
  (`Field` + `CONTROL_CLASS`), the one pill (`Chip`), the one absence (`EmptyState` /
  `EmptySlot`), the one bottom sheet (`Sheet`), the one full-screen image overlay
  (`PhotoViewer`) and the one detail dialog (`DetailPanel`) — "one" is the point; a second
  of any of these is a second way for two screens to disagree.
- Own the run-domain presentations (read-only): `SplitsTable`, `ZoneBar`, `FlagList` —
  deliberately separate from `components/review`'s editable twins.
- Own the app chrome: `AppShell` (the 470 px column, the bottom-gap arithmetic, the
  tab-bar/chat-chrome selection) and `TabBar` (the five-tab bar and its geometry
  constants).
- Own the two client behaviours every photo surface shares: the download ladder
  (`useSavePhoto`) and the URL-held panel (`usePanelParam`).

## Module map

| File | Kind | Exports | Purpose |
|---|---|---|---|
| `index.ts` | barrel | 15 names | The client-safe surface. Screens import from `@/components/ui`; only components inside the directory import each other by path. Re-exports a name only once a screen pulls it through. |
| `Button.tsx` | **no directive** | `Button`, `ButtonLink`, `buttonClasses`, `LoadingDots` | The app's one button, its link twin, the borrowed look, and the three-dot loading state. `bg-ink text-card` primary for WCAG contrast; `type="button"` by default; `loading` keeps the label's box and swaps in dots. |
| `Card.tsx` | **no directive** | `Card`, `Eyebrow`, `Stat` | The one surface (white, `rounded-card`, soft shadow, no border), the small accent label, and the label-over-value tile (`tabular-nums`, three sizes). |
| `Field.tsx` | `'use client'` | `Field`, `CONTROL_CLASS`, `Input`, `NumberInput` | The label/hint/error/`aria-describedby`/`id` wiring via context, the 52 px control shell class, and the two inputs that read it. `text-base` is the iOS focus-zoom floor, not taste. |
| `Chip.tsx` | **no directive** | `Chip`, `CHIP_CLASS` | The filter/fact pill. `aria-pressed`, 44 px floor, selected = the ink slab (same pair as Button's primary/secondary). |
| `EmptyState.tsx` | **no directive** | `EmptyState`, `EmptySlot` | The one shape absence takes: dashed outline (the outline of a card that has nothing in it yet), and the one-line slot twin. Zero client JS, zero chart imports. |
| `Flag.tsx` | **no directive** | `FlagList` | The fired coaching flags. Copy lives in `lib/flags/copy.ts`; severity on three channels (glyph, tint, sr-only name). `Flag` itself is module-private. |
| `SplitsTable.tsx` | **no directive** | `SplitsTable` | §3.3's read-only splits table — the pace/HR chart's accessible twin. Partial row on four channels; numeric columns carry their own `pl-3` (see Gotchas). |
| `ZoneBar.tsx` | **no directive** | `ZoneBar` | §3.2's five-zone bar: five divs, **zero Recharts**, 3 px minimum segment, surface-coloured gaps, a `<details>` table twin. No data renders `EmptySlot`, never five 0% segments. |
| `RunDateLink.tsx` | **no directive** | `RunDateLink` | A day in a detail panel: link or plain text. `runId === null` is the ordinary case for period badges, and the text branch must not look tappable. |
| `Sheet.tsx` | `'use client'` | `Sheet` | The bottom sheet — the app's one modal surface for *detours*. Body scroll-lock, focus in and out, 88 dvh cap with pinned header/footer, and the `onCloseRef` pattern (see its section). |
| `PhotoViewer.tsx` | `'use client'` | `PhotoViewer`, `ViewerPhoto` | The one full-screen image overlay in the authenticated app. Zoom is the browser's (`touch-action: pinch-zoom`); swipe is read-only on the gesture; `actions` is a slot, absent renders nothing. |
| `DetailPanel.tsx` | `'use client'` | `DetailPanel`, `PanelArt` | `/me`'s native `<dialog>` detail panel: art band flush to three edges, scrolling body, `showModal()`'s UA-supplied focus trap. Deliberately NOT a `Sheet`, and deliberately not in the barrel. |
| `TabBar.tsx` | `'use client'` | `TabBar`, `TAB_BAR_HEIGHT_PX`, `TAB_BAR_BORDER_PX`, `TAB_BAR_OUTER_HEIGHT_PX`, `TAB_BAR_CONTENT_DROP_CSS` | The five-tab bottom bar and its geometry constants. `'use client'` for exactly one `usePathname`. Hide transform is a plain `100%`; the axis of the content drop is spelled (`0 <y>`) because the single-value form is X. |
| `AppShell.tsx` | **no directive** (Server Component) | `AppShell`, `ScreenHeader` | The frame every tabbed screen sits in: 470 px column, `screen: 'tabs' \| 'chat'` selecting both the chrome and the bottom gap (one prop, because they cannot be allowed to disagree). Owns the Nina provider nesting. NOT in the barrel — import `@/components/ui/AppShell`. |
| `useSavePhoto.ts` | `'use client'` | `useSavePhoto`, `SaveNotice`, `SAVE_NOTICE_TEXT` | The machinery behind every "download this photograph" control: the share → object-URL anchor → open ladder, warmed on `pointerdown` to survive Safari's transient-activation window. |
| `usePanelParam.ts` | `'use client'` | `usePanelParam` | `/me`'s open panel held in the URL via `window.history` (`pushState` on open, `back()` only when we pushed, `replaceState` otherwise and for the date list). |

The sixteen colocated suites (`*.test.tsx`, `// @vitest-environment happy-dom`) are not
listed above; they are one per source file, 203 tests, and they are why the YAGNI sweeps of
2026-09-11/12 could prune this directory on evidence rather than nerve.

## The two import grammars

Every consumer faces a choice the barrel's header states as law: **screens import from
`@/components/ui`; only the components themselves import each other by path.** The measured
state (2026-09-12, 77 external importing files):

- **42 files import through the barrel** (`@/components/ui`) — the default.
- **45 files import by direct path** (`@/components/ui/PhotoViewer`,
  `@/components/ui/AppShell`, `../ui/TabBar`, …). Ten files do both, because they import a
  barrel primitive *and* a path-only one (`MediaPane`: `Button` via the barrel,
  `useSavePhoto` by path).
- **20 of the 35 exported names are direct-path-only** — not re-exported by the barrel —
  falling into four deliberate groups:
  1. **Server-bound or bundle-audited**: `AppShell`, `ScreenHeader` (Server Component;
     test-audited out of the share graph).
  2. **Not yet pulled through** ("Re-add one only when a screen imports it from here"):
     `Chip` (2 path consumers), `EmptySlot` (5, all `charts/`+`insights/`+`profile/`),
     `Input` (1, `SessionRow`), `TabBar` (1, `ChatChrome`).
  3. **Mount-site-specific surfaces** the barrel comment predates but the rule covers:
     `Sheet`, `PhotoViewer`, `DetailPanel`, `RunDateLink`, `PanelArt`, `ViewerPhoto`.
  4. **Hooks and their types**: `useSavePhoto`, `SaveNotice`, `SAVE_NOTICE_TEXT`,
     `usePanelParam` — imported where the behaviour lives, not where the styling does.
  Plus the four `TAB_BAR_*` constants, whose consumers are geometry-coupled files and one
  geometry test (`tests/tabbar.geometry.test.ts`).

The direct-path list is not second-class; it is the mechanism that keeps the barrel's
client-safety claim small enough to audit. The one place the choice is *forced* rather than
taste: anything the public share route (`app/(public)/s/[token]`) needs must come by path —
it imports `@/components/ui/Card` directly, and the bundle test holds the line.

## The reverse-wiring map

**Every exported name — all 35 over 16 modules — has at least one consumer outside the
directory** (measured 2026-09-12 at `6759f26`). Counts are files, not call sites; a file
counted once may import several names. This table is the map that did not exist before
2026-09-12; when you add a consumer, move the count, and when a count surprises you,
re-measure it before trusting either state.

| Symbol | Consumers | Who (by surface) |
|---|---|---|
| `Button` | 27 | admin ×15 (FileExplorer, FolderMenu, ImageGenPanel, ImageGenTestPanel, LogTextDialog\*, MemoryTable, PhotoMoveBar, PhotoReferencePicker, ShortcutTable, explorer/{MediaAdd, MediaControls, MediaPane, PhotoDescription, SelectionPane, UploadQueue}); auth ×2 (SignInCard, SignOutButton); extract (UploadPicker); nina ×3 (MessageActionsSheet, NinaAboutScreen\*, SessionRow\*); profile (ProfileForm); push (PushSetupCard); review ×3 (ReviewClient, SplitsTable, ZoneBar); share (ShareLinkPanel\*) |
| `Card` | 18 | app ×7 (s/[token]\*, admin, me, onboarding, r/[id], trends/loading, trends); admin ×2 (MemoryTable, ShortcutTable); charts (ChartFrame\*); extract ×3 (ExtractingSkeleton, ExtractionGate, UploadPicker); insights (InsightCard\*); nina (NinaJobDetail); review (ReviewClient); share ×2 (PhotoInclusionList\*, ShareLinkPanel\*) |
| `AppShell` | 10 | every tabbed server page: (app)/{loading, page}, me, nina/{about, jobs, jobs/[id]}, r/[id], trends/{loading, page} — all by path |
| `CONTROL_CLASS` | 10 | admin ×6 (CharacterPanel, FolderMenu, ImageGenPanel, PhotoMoveBar, TextModelSelect, explorer/PhotoDescription); nina (NinaSearchField); review ×3 (HeroFields, MoreDetails, ParsedInput). Deliberately NOT used by MemoryTable/ShortcutTable (`CELL_CONTROL` at table density) or DialSlider (a range control ui does not have) |
| `EmptyState` | 9 | app ×4 ((app)/page, admin/error-logs, me, trends); admin ×2 (PhotoReferencePicker, explorer/PhotoGrid); nina ×2 (ChatScreen\*, SessionList\*); `tests/views.render` |
| `ScreenHeader` | 7 | (app)/{loading, page}, me, nina/jobs, nina/jobs/[id], trends/{loading, page} — all by path. `/nina` and `/nina/about` deliberately build their own header (a conversation's identity is a face and a name); `r/[id]` uses `AppShell` without it |
| `Eyebrow` | 8 | travels with `Card`: s/[token]\*, me, r/[id], trends, ChartFrame\*, InsightCard\*, PhotoInclusionList\*, ShareLinkPanel\* |
| `ButtonLink` | 6 | (app)/page, admin/error-logs, me, trends/page, explorer/PhotoGrid, NinaJobDetail |
| `Stat` | 6 | s/[token]\*, me, r/[id], trends/page, NinaJobDetail, AcwrTile\* |
| `PhotoViewer` | 5 | admin (ErrorLogList\*), nina ×2 (ChatScreen\*, NinaAboutScreen\*), review (ScreenshotStrip\*), share (PhotoInclusionList\*) — the four zoom surfaces; the public share page is deliberately not a fifth |
| `ViewerPhoto` (type) | 2 | ErrorLogList, NinaAboutScreen (both \*) |
| `EmptySlot` | 5 | charts ×3 (PaceHrChart, PaceTrendChart, ZoneDriftChart\*), insights (InsightCard\*), profile (RecordsTable\*) — all by path; not in the barrel |
| `TAB_BAR_OUTER_HEIGHT_PX` | 5 | nina ×3 (ChatChrome\*, ChatScreen\*, NinaSidebar\*), ChatChrome's suite, `tests/tabbar.geometry` |
| `ZoneBar` | 4 | s/[token]\*, r/[id], trends/page, `tests/views.render` — the read-only twin (the editable one is `components/review/ZoneBar`) |
| `useSavePhoto` | 4 | admin ×2 (explorer/{MediaPane, SelectionPane}\*), nina ×2 (ChatPhotoActions\*, NinaAboutScreen\*) |
| `SplitsTable` | 3 | s/[token]\*, r/[id], `tests/views.render` — read-only twin of `components/review/SplitsTable` |
| `Field` | 3 | admin (FolderMenu), nina (SessionRow\*), profile (ProfileForm) |
| `LoadingDots` | 3 | admin (ShareToNinaItem), extract (UploadPicker), nina (TypingIndicator\*) |
| `SAVE_NOTICE_TEXT` | 3 | nina ChatPhotoActions\*, NinaAboutScreen\*, + ChatPhotoActions' suite |
| `Sheet` | 3 | nina (MessageActionsSheet\*), review ×2 (SplitsTable\*, ZoneBar\*) — the three call sites the `onCloseRef` comment names |
| `DetailPanel` | 3 | profile ×2 (BadgeDialog\*, RecordDialog\*), `tests/panel.render` |
| `RunDateLink` | 3 | profile ×2 (BadgeDialog\*, RecordDialog\*), `tests/panel.render` |
| `FlagList` | 2 | r/[id], `tests/views.render` (via `@/components/ui/Flag`) |
| `SaveNotice` (type) | 2 | explorer/{MediaPane, SelectionPane}\* |
| `Chip` | 2 | charts (PaceTrendChart\*), runs (IntentChips\*) — by path; not in the barrel |
| `usePanelParam` | 2 | profile ×2 (BadgeShelf\*, RecordsTable\*) |
| `buttonClasses` | 1 | admin (ShareToNinaItem) — a non-`<button>` borrowing the look |
| `TabBar` (component) | 1 | nina (ChatChrome\*) — the only surface that re-reveals the bar |
| `Input` | 1 | nina (SessionRow\*) — by path; not in the barrel |
| `CHIP_CLASS` | 1 | profile (ProfileForm) |
| `NumberInput` | 1 | profile (ProfileForm) |
| `TAB_BAR_HEIGHT_PX` / `_BORDER_PX` / `_CONTENT_DROP_CSS` | 1 each | `tests/tabbar.geometry` only — deliberate test seams (cited in comments by `AppShell`, `PhotoViewer`, `admin.shell`'s guard); their keep-verdict is conditional on that test's geography |

\* = imported by direct path (all other names in a row arrive through the barrel).

Two readings worth taking away from the map:

- **`Button` is in 27 files and `Card` in 18 — the kit's centre of gravity.** Anything that
  changes their contract (a new required prop, a renamed variant) fans out across every
  surface in the repo the same day.
- **The rarest names are rare on purpose.** `Input` has one consumer because forms are
  supposed to reach for `Field`; `TabBar` has one because the bar belongs to the shell and
  `ChatChrome`'s reveal; the three test-only `TAB_BAR_*` constants are geometry seams, not
  dead exports — the 2026-09-12 YAGNI sweep classified and kept them deliberately.

## Dependencies

### External

- `react` — the only runtime dependency of the client halves; hooks in six modules, and
  `React.ComponentProps<'button'>`-style prop derivation in `Button` (React 19: a ref is an
  ordinary prop, and `...rest` forwards it).
- `next/link` — `ButtonLink`, `RunDateLink`, `TabBar`'s tabs.
- `next/navigation` — `usePathname` (TabBar, once), `useSearchParams` (usePanelParam).
- `next/image` — `DetailPanel`'s art band only, `unoptimized` (the masters are already
  sized and content-hashed for the box; the optimizer would bill a transform for nothing).

### Internal

- `@/lib/cn` — class merge; the most-repeated import in the kit.
- `@/lib/format` — `formatDay` (RunDateLink), `formatDuration`/`formatPercent`/
  `formatZoneBounds` (ZoneBar), `formatDistanceM`/`formatPace` (SplitsTable). Every date and
  number in the kit goes through it, so `/me` and the share page cannot render one day two
  ways.
- `@/lib/charts` — `ZoneShare`, `PaceHrPoint`, `zoneOfHr` (ZoneBar, SplitsTable). Types and
  the pure zone lookup; **no Recharts anywhere in this directory**.
- `@/lib/metrics` — `Flag`/`ZoneRow` types.
- `@/lib/flags/copy` — `flagCopy`: `FlagList` contains no copy of its own, on purpose.
- `@/lib/photos/save` — `chooseSaveStrategy`, `saveFilenameFor`: the pure half of the
  download ladder (unit-tested in node), split from `useSavePhoto`'s impure half.
- `@/lib/photos/gallery` — `decideSwipe`, `stepIndex`: the swipe verdict and the wrapping
  pager, pure and tested outside the browser.
- `@/lib/panel/param` — the `?panel=`/`?dates=` grammar: encode/decode and the param names,
  so writer and reader cannot disagree.
- `@/lib/extract/constants` — `SCREEN_KIND_LABEL`/`ScreenKind` (PhotoViewer's default
  naming).
- `@/components/nina` — **the one backward arrow.** `AppShell` imports `ChatChrome`,
  `NinaBarProvider`, `NinaSidebarProvider` and `NinaUnreadBadgeSlot`. The frame depends on
  the chat surface's chrome because the providers must sit above BOTH the page body and the
  chrome that toggles it — measured in production: when the sidebar provider lived in
  `app/nina/page.tsx`, its trigger mounted outside it and rendered `null` (one wrong word in
  a comment, two symptoms). Do not "fix" this dependency direction without re-reading
  `AppShell.tsx`'s header; it is the load-bearing exception, not an accident.

No module here imports `zod`, `server-only`, the database, or any Server Action. The kit is
bundle-safe by construction, and `tests/share.bundle.test.ts` audits the one route where
that would matter most.

## Reverse dependencies (by package, files importing ui, measured 2026-09-12)

| Package | Files | Reads most |
|---|---|---|
| `components/admin` | 20 | `Button` (15 of 20 files), `CONTROL_CLASS`, `EmptyState` |
| `components/nina` | 13 (incl. 2 suites) | `Button`, `PhotoViewer`, `useSavePhoto`, `TAB_BAR_OUTER_HEIGHT_PX` |
| `components/review` | 7 | `Button`, `CONTROL_CLASS`, `Sheet` |
| `components/profile` | 5 | `DetailPanel`, `RunDateLink`, `usePanelParam`, `EmptySlot` |
| `components/charts` | 4 | `Card`/`Eyebrow`, `EmptySlot`, `Chip` |
| `components/extract` | 3 | `Card`, `Button`, `LoadingDots` |
| `app/nina` | 4 | `AppShell` |
| `app/(app)`, `app/admin`, `app/trends` | 2 each | `AppShell`, `ScreenHeader`, `Card`, `EmptyState` |
| `components/{auth,share}` | 2 each | `Button`, `Card` |
| `app/{me,onboarding,r,(public)}` | 1 each | `AppShell`, `Card`, `SplitsTable`, `ZoneBar` |
| `components/{insights,push,runs,trends}` | 1 each | `EmptySlot`, `Button`, `Chip`, `Stat` |
| `tests/` | 3 | `views.render`, `panel.render`, `tabbar.geometry` |

Plus five text-reading suites in `tests/` that hold properties of this directory no runtime
test can carry: `share.bundle.test.ts` (the barrel and `AppShell`/`TabBar` stay out of the
share route's graph), `tabbar.geometry.test.ts` (the bar's height constants and the source's
`h-[39px]` agree), `ui.sheetFocus.test.ts` (`Sheet`'s focus/`onCloseRef` shape),
`ui.photoViewer.test.ts` (the viewer lives here and its callers import it by path),
`nina.sidebarProvider.test.ts` (the provider nesting `AppShell` owns). `admin.shell.test.ts`
and `admin.imagegen*.test.ts` cite ui files while guarding `components/admin`'s own
boundaries.

## Component notes — the decisions a consumer inherits

### Buttons (`Button`, `ButtonLink`, `buttonClasses`, `LoadingDots`)

- `type="button"` by default; an unlabelled `<button>` inside a `<form>` submits it. Pass
  `type="submit"` when that is what you mean.
- `loading` disables, keeps the label's exact box (the label goes `invisible`, not
  removed), swaps in `LoadingDots`, and sets `aria-busy`. A button that changes width while
  loading is a button that moves under the thumb.
- The primary is `bg-ink text-card`, not `bg-accent text-white`: white on the cyan accent
  lands near 2:1; ink-on-card is ~14:1 and inverts correctly in dark mode. The accent is for
  labels and links.
- `buttonClasses` exists so a non-`<button>` can borrow the look — its one consumer is
  `ShareToNinaItem`'s anchor. Prefer `ButtonLink` for navigation.
- `Button` forwards a `ref` through `...rest` (React 19); `DetailPanel` uses exactly that to
  focus its Close button after `showModal()`.

### Surfaces (`Card`, `Eyebrow`, `Stat`)

`Card` is the app's one surface — white fill, 22 px radius, soft shadow, **no border** (the
v2 design's whole elevation vocabulary). `EmptyState` is the deliberate exception that
proves it: dashed, because it is the *outline* of a card that has nothing in it yet.
`Stat`'s value is always `tabular-nums` so a column of stats lines up.

### Forms (`Field`, `CONTROL_CLASS`, `Input`, `NumberInput`)

`Field` owns the accessibility wiring through context — a feature cannot accidentally ship
an unlabelled input or an error invisible to a screen reader. `Input` reads the context for
`id`, `aria-describedby` and `aria-invalid`; `NumberInput` is `type="text"` with
`inputMode="numeric"` because Safari's number input silently discards values, drops decimal
points per locale, and scroll-wheels itself. Validation belongs to the caller's schema,
which sees the raw string. `CONTROL_CLASS` is 52 px with `text-base`: the iOS 16 px
focus-zoom rule beats the design. Hint and error never show together — the error supersedes
the instruction that failed to prevent it.

### Pills (`Chip`, `CHIP_CLASS`)

`aria-pressed`, not `aria-selected`: toggles in a group, not tabs in a tablist. Selected is
the ink slab and unselected the page tint — the same pair as Button, so a chip and a button
never disagree about what "chosen" looks like. The 44 px floor wins over the design's nicer
32 px pill.

### Absence (`EmptyState`, `EmptySlot`)

Two sizes of the same honest sentence. The rule `EmptySlot` protects: a zone bar with no
data renders this, **never five 0% segments** — five zeros is a claim that the run was
effortless. Neither has a `className` prop, removed by the 2026-09-12 YAGNI sweep under the
`RunDateLink` round-3 rule: *a prop with no caller is a second way to render, waiting.*
Do not re-add one.

### Run domain (`SplitsTable`, `ZoneBar`, `FlagList`)

Server-rendered, zero Recharts, table twins included — the dataviz non-negotiable that every
chart ships its numbers reachable without hover. `SplitsTable`'s numeric columns carry their
own `pl-3` because the `w-full` pace-bar cell starves its siblings under `table-auto`
(removing it as redundant re-opens issue #2). The partial kilometre is marked on four
independent channels and there is deliberately no TIME column — km 11's raw 4:48 would read
as a closing sprint. `FlagList` renders `lib/flags/copy.ts`'s sentences and nothing else;
colour is never the only channel for severity.

These are the **read-only** twins. `components/review`'s `SplitsTable` and `ZoneBar` are the
**editable** controls (draft state, correction chips, a sheet per row). The duplication is
deliberate and documented in the barrel's header; merging them would put a review-only
concern into the run detail page and a display-only concern into the review screen.

### Chrome (`TabBar`, `AppShell`, `ScreenHeader`)

`TabBar` is `'use client'` for one `usePathname` read; everything else is links, so the bar
works before hydration. Its geometry is a triple-entry ledger: the `h-[39px]` class,
`TAB_BAR_HEIGHT_PX`, and `tests/tabbar.geometry.test.ts` must move together — Tailwind
cannot read a TypeScript constant, so the number is spelled twice by necessity and the test
is the third copy that makes the drift loud. Positioning against the bar wants
`TAB_BAR_OUTER_HEIGHT_PX` (grid + border), which is what `/nina`'s composer reads. The
content drop is spelled `0 calc(...)` because `translate`'s single-value form is **X** —
both earlier spellings moved tabs sideways, which is why the axis is written out. `hidden`
on the bar is `inert`, not `aria-hidden`: off screen but painted and animatable, and out of
the tab order.

`AppShell` takes `screen: 'tabs' | 'chat'` — one prop selecting both the chrome rendered and
the bottom gap reserved, because a screen whose padding clears a bar it does not render and
one that renders a bar its padding does not clear are the two states two props would
express. `/r/[id]` renders the bar (the wireframe wins over the roadmap: a screen with no
way out is worse). The file stays a Server Component — ten imports measured 2026-09-12 —
and owns the Nina provider nesting for the chat screen.

### Overlays (`Sheet`, `PhotoViewer`, `DetailPanel`, `RunDateLink`)

Three modal surfaces, and the boundaries between them are the design:

- **`Sheet`** — a *detour* from a table you must not lose your place in. Rises from the
  bottom, pins a footer, scroll-locks the body, caps at 88 dvh. Its `onCloseRef` pattern is
  load-bearing: every call site passes an inline arrow, so keying the open-effect on
  `onClose` tore the effect down on every parent re-render and dropped iOS's keyboard one
  digit into each correction. The listener reads a ref; the effect keys on `open` alone.
  Fixing it here — not memoising at three call sites — is the point.
- **`DetailPanel`** — native `<dialog>` + `showModal()`, because nothing in it is edited and
  the UA supplies the focus trap, Escape, focus restoration and backdrop that `Sheet`
  hand-rolls. **Do not add `role="dialog" aria-modal="true"`** — a redundant explicit role
  on a `<dialog>` is a known screen-reader hazard. The one effect reconciles declarative
  `open` with imperative `showModal()`/`close()`, both `el.open` guards required
  (`InvalidStateError`; Strict Mode double-invoke). Focus goes to the Close button by ref,
  explicitly, after `showModal()` — positional queries and `autoFocus` both lose to
  Chromium's scroll-container focus delegate.
- **`PhotoViewer`** — the zoom is the browser's (`touch-action: pinch-zoom`); the swipe
  handlers only *read* the gesture (`decideSwipe` is pure, in `lib/photos/gallery`), so
  native pinch, momentum and vertical scroll keep working and nothing calls
  `preventDefault`. `actions` is a slot, not callbacks — a working download is five props
  and a fetch this file has no business knowing about; `ChatPhotoActions` owns that.
  Absent `actions` renders nothing, which is what keeps the three review surfaces
  byte-identical. The **public share page must never become a caller**: there the platform's
  own image viewer (real pinch, real save, real back) is the feature.

`RunDateLink` is the affordance rule in miniature: the primitive owns what tappable looks
like (underline, offset); the caller owns size, weight and colour; and `runId: null` is the
ordinary case for period badges, so the text branch must not invite a thumb to a dead end.

### Hooks (`useSavePhoto`, `usePanelParam`)

`useSavePhoto` is the whole download ladder in one copy: `share` (phone: bytes → `File` →
`navigator.share`, whose sheet offers Save Image), `download` (object-URL anchor — the one
branch where `<a download>` works, because the object URL is same-origin; blob URLs on
`https://<store>.public.blob.vercel-storage.com/…` are not, and the attribute is silently ignored), `open`
(the rung below — never a dead end). The fetch is warmed on `pointerdown` because Safari's
transient-activation window does not survive an await, and this repo has already lost a
share to it once. `AbortError` is a person changing their mind: silence, no fallback. No
success notice — the browser's own chrome is the feedback; the only notice is `SaveNotice`
(`opened`/`unavailable`), stored *with* the URL it was reported for and derived against the
current one, so a stale "opened" never sits beside a different photograph.

`usePanelParam` holds `/me`'s panel in the URL via `window.history` — verified against this
repo's own Next docs, not memory: `pushState` integrates with the router and re-runs the
hook without re-running the page (one `Promise.all` of six database reads). Close calls
`back()` only when this mount pushed (else a deep link would walk the user off the app, or
back *into* the run they just left); the date list `replaceState`s, because a pushed entry
there costs a second back-swipe and collapses the list the runner came back to see.

## Concurrency

Not designed for concurrent use — this is a UI kit of React components and hooks; there are
no workers, no locks, no shared mutable state. What deserves recording is the **effect and
gesture hygiene** the suites pin:

- `Sheet`'s `onCloseRef` (latest-callback ref; effect keys on `open` alone).
- `DetailPanel`'s `el.open` guards (Strict Mode double-invoke; `InvalidStateError`).
- `PhotoViewer`'s drag ref, written per `touchmove`, read once on `touchend`; the touch-count
  maximum disarms the pinch-releases-one-finger page.
- `usePanelParam`'s `pushedRef`, reset whenever the selection goes null.
- `useSavePhoto`'s warmed fetch, keyed by URL — a ref, not state, so warming never
  re-renders and paging invalidates it by comparison.

## Error handling

No custom error types, no sentinel errors, no deliberate throws anywhere in the kit.
Failures are either *absent* (components render what their props say) or *reported as
words*: `Field`'s `error` paragraph wired into `aria-describedby`; `SaveNotice`'s two
sentences (Indonesian, runner-facing, in `SAVE_NOTICE_TEXT` — the admin rails word their own
English, which is why the words belong to the caller); `EmptyState`'s title/description.
`useSavePhoto` swallows fetch failures into the ladder's bottom rung by design — offline, a
reaped blob and a CORS surprise all mean "there are no bytes", and the anchor still gives
the person their photograph. Console noise is not used as a surface.

## Performance

- **Server-rendered by default.** Nine of the fifteen primitives carry no directive and
  render to HTML with zero client JS on server pages; `ZoneBar` and `SplitsTable` exist as
  divs and tables precisely so the run page's most load-bearing visuals ship no Recharts,
  hydrate nothing, and repaint free on a light/dark flip (colours are CSS custom
  properties).
- **One keyframe in the app** (`ri-pulse`, `LoadingDots`); everything else animated here is
  a `transition` (invariant 8, guarded by `tests/motion.reducedMotion.test.ts`).
  `TabBar`'s hide is `transition-[translate]`, named longhand because Tailwind v4 compiles
  `translate` and `scale` to separate CSS longhands.
- **Images:** `PhotoViewer` uses a plain `<img>` with an eslint-disable on record (blob
  files already compressed client-side; `next/image` would bill a transform for nothing) —
  the repo's standing ruling for Blob-hosted photos. `DetailPanel` uses `next/image`
  `unoptimized` for the opposite reason that is the same reason: the art is pre-sized and
  content-hashed for exactly its box.
- `LoadingDots` keeps buttons width-stable; `TabBar`'s badge span is sized to the icon so a
  badge moves no tab.

## Usage

### Importing

```tsx
// Screens: through the barrel (client-safe surface).
import { Button, Card, EmptyState, CONTROL_CLASS } from '@/components/ui'

// Server components needing the shell, or anything the barrel does not re-export: by path.
import { AppShell, ScreenHeader } from '@/components/ui/AppShell'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import { useSavePhoto, SAVE_NOTICE_TEXT } from '@/components/ui/useSavePhoto'
```

Re-add a name to the barrel only when a screen actually imports it from there — the barrel
re-exports exactly what is pulled through, and the 2026-09-12 sweep verified all 15 names
have non-test consumers.

### The patterns the kit expects

```tsx
// A form field — the shell owns label/id/error wiring; you own validation.
<Field label="Height" suffix="cm" error={errors.height}>
  <NumberInput decimal value={h} onChange={setH} />
</Field>

// Absence with one action — the dashed card, not a plain Card with a sentence.
<EmptyState
  title="No runs yet"
  description="Upload a screenshot of your run and it lands here."
  action={<ButtonLink href="/upload">Upload your first run</ButtonLink>}
/>

// A detour — Sheet for correction, DetailPanel for display, PhotoViewer for images.
<Sheet open={editing !== null} onClose={() => setEditing(null)} title="Split 11" footer={...}>
```

### Gotchas

- **Do not add a `className` prop to `EmptyState`, `Field` or `AppShell`.** Removed by the
  2026-09-12 YAGNI sweep; the rule is `RunDateLink`'s round-3 ruling — a prop with no caller
  is a second way to render, waiting. `RunDateLink` and `DetailPanel`-style callers pass
  size/colour via the props the primitive chose to expose.
- **Do not put `AppShell` (or any Server Component) back in the barrel.** It turned every
  client import of the barrel into a build error once; `tests/share.bundle.test.ts` now
  asserts the share route's graph never contains it.
- **Do not grow the public share route's imports through the barrel.** It imports `Card` by
  path; the bundle test audits the graph module by module.
- **Do not write a `Toast`.** The design brief names one; the barrel's doc deliberately
  records that it has no caller and is not written on spec. Write it the day something
  reaches for it.
- **Do not merge the ui `SplitsTable`/`ZoneBar` into their `components/review` twins**, or
  vice versa. Read-only vs editable is the distinction; the barrel's header holds the
  argument.
- **Do not remove `SplitsTable`'s numeric-column `pl-3`**, the partial row's four channels,
  or the no-TIME-column decision. Each is a measured regression waiting to reopen.
- **Do not render zone data as five 0% segments.** No rows → `EmptySlot`. This is the one
  rule `EmptySlot` exists to enforce.
- **Do not key `Sheet`'s open-effect on `onClose`** (or "fix" it by memoising at the call
  sites). The ref pattern is the fix; the comment in `Sheet.tsx` names the keyboard-dropping
  failure it prevents.
- **Do not add `role="dialog"`/`aria-modal` to `DetailPanel`** — redundant on a native
  `<dialog>` and a known screen-reader hazard.
- **Do not make `PhotoViewer` a JS-pinch carousel or add `preventDefault` to its touch
  handlers.** The zoom is the platform's; the design follows from never needing that call.
- **Do not pass `aria-selected` to `Chip`** — it is `aria-pressed`, and a screen reader that
  announces "selected" has told the user nothing about toggling.
- **Do not change a `TabBar` literal without its constant and its test** — `h-[39px]`,
  `TAB_BAR_HEIGHT_PX` and `tests/tabbar.geometry.test.ts` are three copies of one number,
  and the test is the loud one.
- **Do not add a fixed bar to any screen without reconciling `AppShell`'s bottom-gap
  literal** — the arithmetic lives in `BOTTOM_GAP` and names every term it sums; a stale
  literal there reads as a mysterious gap, not a bug, and has survived review that way
  twice.
- **Do not import from `@/lib/nina/*` (or anything server-shaped) into this directory.**
  The kit's one internal dependency beyond `lib/` is `AppShell`'s deliberate reach into
  `components/nina` for the chat chrome providers, documented there.
- **MemoryTable-style tables use `CELL_CONTROL`, not `CONTROL_CLASS`** — a 52 px form shell
  is not table density; `components/admin` built its own tokens from the same vocabulary
  rather than override four utilities and depend on Tailwind's emission order.

## Notes

- **Doc drift found and fixed while writing this readme** (2026-09-12): `AppShell.tsx`'s
  Server-Component comment claimed "nine pages, a layout and two loading states" import it;
  the measured set is **eight pages and two loading states** (10 files, no layout —
  `app/(app)/` holds only `loading.tsx` and `page.tsx`). Fixed in the same commit as this
  readme; a guard test asserts the file's provider structure, not this comment, so nothing
  was pinned to the wrong number.
- **The YAGNI verdict on this tree is on the record** (2026-09-11 curated the barrel and
  de-exported the prop types; 2026-09-12 `dba8f17` un-exported 3 internal types
  (`AppShellScreen`, `SheetProps`, `PanelParam`), removed 3 test-only `className` props, and
  verified the other claims: all 15 barrel re-exports alive, `Toast` still nonexistent, the
  `TAB_BAR_*` constants kept as out-of-fence test seams). Retire "audit `components/ui`"
  from future idea menus; the next sweep here should re-read `tests/tabbar.geometry.test.ts`'s
  location before re-classifying the constants.
- **Known, accepted duplication:** the tab-bar height is spelled in a class, a constant and
  a test; `BOTTOM_GAP`'s literals are spelled Tailwind-strings that name their terms.
  Tailwind cannot read TypeScript constants; the test is the drift alarm.
- **The kit grows by extraction, not by anticipation.** `useSavePhoto` exists because four
  surfaces needed one download; `DetailPanel` is `BadgeDialog`'s chrome promoted when a
  second caller appeared; `PhotoViewer` is `ScreenshotStrip`'s private overlay lifted when
  card #8's three asks blocked on it. `Toast` is the counter-example that proves the rule:
  named by the brief, unwritten with no caller. `DialSlider` lives in `components/admin`,
  not here, for the same reason.
- **Test-count history:** 205 tests landed 2026-09-11 (16 files); the 2026-09-12 sweep
  removed 2 `className` cases and rewrote 1, leaving **203/203 at `6759f26`** — this
  readme's own measured run. One pre-existing `react/no-unescaped-entities` pair sits in
  `Card.test.tsx:90` on main (recorded by the sweep as out of its mandate; it is a two-line
  escape fix whenever someone is next in this directory).

## Documentation log

- **2026-09-12** — created via `/update-readme` (worker session `pkg-readme-ui`, coordinator
  `tokenmax-orch-2026-09-12`). This file is the recorded follow-up to the same day's
  `ui-primitives-yagni` sweep, which deferred it ("the directory's readme is another
  session's assignment"). First document to carry the reverse-wiring map: a module-resolved
  import graph over the repo, 77 external files, 35/35 exports with ≥1 consumer, barrel vs
  direct-path split measured, per-symbol consumer lists, by-package census, and the five
  text-guard suites enumerated. Every source file in the directory was read in full while
  writing it; every count is stamped with its measure date. One source comment drifted
  against the same measurement that built the map (`AppShell`'s importer count) and was
  corrected in the same commit — the only non-readme file this session touched.
