# Code Analysis: Nina composer geometry/skin + the `/admin` install notch tint

**Type:** Feature Update
**Date:** 2026-09-07 13:05:00 +07
**Session ID:** 20260907-130500-CMPZ
**Plan:** `COMPOSER_FROST_AND_ADMIN_NOTCH_PLAN.md` (2 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/composer-frost-and-admin-notch`, branch `feature/composer-frost-and-admin-notch` (base `origin/main` @ `e6c68d6`)

---

## User Input

### Original User Request

> UI update: ada gap diantara chat query field dengan bagian bawah. hilangkan gap ini
> sekalian bikin section query field dibawah itu lebih kecil jadi lebih makan lesser space,
> trus bikin backgroundnya frosted glass, persis kaya small buttons < and up
>
> selain itu.. kita sudah berhasil bikin homepage shortcut untuk profile page.. make sure batas
> atas di xs max top notch is white, so it is kind of blend in with the UI

Follow-up, on being asked whether "profile page" meant `/admin`:

> yes /admin is the profile page, that's correct

### User-Provided Context

No error text, no logs. Two visual reports against the running app on the design target
(iPhone XS Max, `docs/design-brief.md`). The second one is scoped to an **installed**
home-screen launch, which is the only place a status-bar tint is visible at all.

### User-Provided Files

None marked with `@`. Every file below was reached by exploration.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Remove the gap between the chat query field and the bottom of the screen — *"ada gap diantara chat query field dengan bagian bawah. hilangkan gap ini"* |
| R2 | Make the query-field section take less vertical space — *"bikin section query field dibawah itu lebih kecil jadi lebih makan lesser space"* |
| R3 | Give it a frosted-glass background, exactly like the small `<` and `up` buttons — *"bikin backgroundnya frosted glass, persis kaya small buttons < and up"* |
| R4 | On the `/admin` home-screen shortcut, make the top notch band white so it blends with the UI — *"make sure batas atas di xs max top notch is white, so it is kind of blend in with the UI"* |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

R1–R3 are three changes to one element: the `fixed` composer bar on `/nina`
(`components/nina/Composer.tsx:353`). R1 is a geometry bug — an unpainted strip of the
home-indicator inset below the bar. R2 is a size reduction of the same bar. R3 is its skin.

R4 is a separate, single-line-of-metadata defect on a different surface: the installed `/admin`
tile paints its status-bar band from the **root** layout's `theme-color`, because
`app/admin/layout.tsx` never exported a `viewport`.

**Success Criteria**

- R1: with the tab bar in its resting hidden state, no conversation shows between the composer's
  bottom edge and the bottom of the screen, and the textarea still clears the home indicator.
- R2: the composer's resting height is measurably smaller than 68 px, with the 44 px control
  floor and the 16 px font intact.
- R3: the bar's fill, blur and saturation are the ones `NINA_CHROME_CONTROL_CLASS` uses.
- R4: an installed `/admin` tile opens with a notch band matching the admin shell's ground
  rather than the runner's sky blue, in both colour schemes.

**Key Considerations**

- **44 px is the iOS tap floor** and the composer's controls are all `size-11` for that reason
  (`Composer.tsx` docstring). R2's space must come from padding, not from control heights.
- **16 px in the textarea is not negotiable.** `app/globals.css` sets
  `input, select, textarea { font-size: max(16px, 1rem) }` because Safari zooms the viewport on
  focus at anything smaller, and `Composer.tsx`'s docstring records that as an iOS rule that beats
  the design.
- **The composer's resting height is hard-coded in four places** (see Reference List). Tailwind
  cannot read a TypeScript constant, so `AppShell`'s literal is arithmetic done by hand.
- **`--nina-bar-visible` is 0 or 1**, unitless, so it multiplies terms inside `calc()`.
- R4's surface is only observable in an installed standalone launch; a Safari tab shows no band.

**Assumptions**

- The gap in R1 is the home-indicator inset in the bar-hidden state. This is derived from the
  arithmetic below rather than measured on a device — stated as a Decision with its rung in the
  plan index, because the same arithmetic also says it is the only unpainted region in the stack.

---

## Analysis Scope

### Explicitly Mentioned Files

None.

### Discovered Related Files

- `components/nina/Composer.tsx` — the bar itself (R1, R2, R3)
- `lib/nina/chatview.ts` — `composerBottomCss`, the bar's `bottom` (R1)
- `lib/nina/chatview.test.ts` — its assertions (R1)
- `lib/nina/chrome.ts` — `NINA_CHROME_CONTROL_CLASS` (R3), `COMPOSER_RESTING_PX`,
  `controlBottomCss`, `CHROME_CONTROL_PX`, `CHROME_CONTROL_GAP_PX` (R2)
- `components/ui/AppShell.tsx` — `BOTTOM_GAP.chat`, the document's own bottom padding (R2)
- `components/nina/ChatScreen.tsx` — `COMPOSER_CLEARANCE_PX`, `COMPOSER_FALLBACK_PX`, the
  `#nina-composer` measurement (R1, R2)
- `components/nina/ChatChrome.tsx` — the floating control lane whose `bottom` follows the
  composer's measured height (R2 consequence)
- `components/ui/TabBar.tsx` — `TAB_BAR_OUTER_HEIGHT_PX`, the 59 in the offset (R1)
- `app/admin/layout.tsx` — has `metadata`, has **no** `viewport` (R4)
- `app/layout.tsx` — the root `viewport.themeColor` pair that consequently still wins (R4)
- `lib/pwa.ts` — `INSTALL`, `ADMIN_INSTALL`, `APPLE_WEB_APP` (R4)
- `app/admin/manifest.webmanifest/route.ts` — the admin manifest's own `theme_color` (R4)
- `app/globals.css` — `--paper`, `--paper-2`, `--safe-top`, `--safe-bottom` (R2, R4)
- `tests/pwa.install.test.ts` — existing install-metadata assertions (R4)

---

## Current Dataflow

### Entry Point: the `/nina` conversation screen

**Location:** `components/nina/ChatScreen.tsx`
**Trigger:** navigation to `/nina`
**Chrome state:** the tab bar is **hidden** at rest — `lib/nina/chrome.ts:41`, *"`'hidden'` is
`/nina`'s resting state"*. This is the state R1 is reported in.

### The composer's vertical position

1. **`ChatScreen`** computes the offset and hands it down as a prop:
   - `COMPOSER_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX` — `ChatScreen.tsx:150`
   - `bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}` — `ChatScreen.tsx:1169`
2. **`composerBottomCss`** — `lib/nina/chatview.ts:235`:
   ```ts
   if (Number.isFinite(overlapPx) && overlapPx > 0) return `${Math.round(overlapPx)}px`
   const clearance = Number.isFinite(chromeClearancePx) ? Math.round(chromeClearancePx) : 0
   return `calc(${clearance}px * var(${NINA_BAR_VISIBLE_VAR}, 0) + var(--safe-bottom))`
   ```
3. **`Composer`** applies it as an inline style — `Composer.tsx:353-356`:
   ```tsx
   className="fixed inset-x-0 z-40 border-t border-rule bg-paper/90 backdrop-blur-md"
   style={{ bottom: bottomCss }}
   ```

**The arithmetic, and where the gap is.** `TAB_BAR_OUTER_HEIGHT_PX` is 59 — a 58 px grid plus the
1 px `border-t` it sits under. The tab bar is `fixed bottom-0` and **pads itself** by
`--safe-bottom`, so when shown it occupies `0 … 59 + safe-bottom`.

| Bar state | `--nina-bar-visible` | composer `bottom` | What is under the composer |
|---|---|---|---|
| shown | 1 | `59px + safe-bottom` | the tab bar, flush |
| **hidden (resting)** | **0** | **`safe-bottom`** | **nothing — conversation shows through** |
| keyboard up | (hidden) | `overlapPx` | the keyboard |

The hidden row is R1. `Composer.tsx`'s docstring states the intent — *"The home-indicator inset
rides in that same offset rather than in this element's padding, because the tab bar below already
pads by it and counting it twice would open a gap"* — which is correct **while the bar is
showing** and is precisely what leaves the inset unpainted when it is not.

### The composer's height, and the four places it is written down

The bar has no fixed height; it is `py-3` around a `min-h-11` textarea, so 24 + 44 = **68 px** at
rest. That 68 is then re-stated as a constant three more times, because the consumers cannot
measure it in time or at all:

1. `Composer.tsx:357` — `mx-auto max-w-[470px] px-5 py-3` — the source of truth (markup)
2. `lib/nina/chrome.ts:115` — `COMPOSER_RESTING_PX = 68`, used by `controlBottomCss` before the
   ResizeObserver's first callback
3. `ChatScreen.tsx:157` — `COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 68`, the fallback for
   `obstructedBottomPx`
4. `AppShell.tsx:81` — `chat: 'pb-[calc(7.5rem+var(--safe-bottom))]'` — 120 px, documented at
   `AppShell.tsx:60-73` as `68 + 8 + 32 + 12`, i.e. `COMPOSER_RESTING_PX + CHROME_CONTROL_GAP_PX +
   CHROME_CONTROL_PX + 12`. Its own comment says the quiet part out loud: *"Tailwind cannot read a
   constant, so a change to any of them changes this literal."*

Site 4 has a recorded precedent for exactly this class of miss: when `CHROME_CONTROL_PX` went
44 → 32 the literal went `8.5rem` → `7.5rem`, and the comment notes that failing to follow it
*"reads as a gap under the conversation rather than as a bug, and so would have survived review."*

### The floating controls' position and skin

**`controlBottomCss`** — `lib/nina/chrome.ts:188-205`:
```ts
return `calc(${clearance + composer + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`
```
where `composer` is `#nina-composer`'s **measured** height, falling back to
`COMPOSER_RESTING_PX`. So the lane tracks the composer's height automatically — shrinking the
composer moves the `<` and `up` buttons down with it, with no further change.

**`NINA_CHROME_CONTROL_CLASS`** — `lib/nina/chrome.ts:103-106`, the recipe R3 names:
```
grid size-8 place-items-center rounded-pill bg-card/40 text-ink-2
shadow-sm ring-1 ring-rule/50 backdrop-blur-md backdrop-saturate-150
transition-[opacity,transform] active:scale-[0.97]
```
Its docstring is the direct precedent for R3 and identifies which parts carry the effect:
*"FROSTED GLASS, as asked for: a translucent fill (`bg-card/40`) over a real backdrop blur, rather
than the near-opaque `bg-card/95` these had — at 95% the blur was decorative, since almost nothing
showed through it. `backdrop-saturate-150` is what keeps the conversation's colour from going grey
behind the glass, which is the difference between frosted and merely dim. The hairline
`ring-rule/50` is what gives the disc an edge once the fill stops providing one."*

The same file records that `CHROME_CONTROL_PX = 32` is below the 44 px floor *"at the repo owner's
explicit request: 'much smaller (take much smaller space in the chat UI)'"* — the same voice and
the same intent as R2, one iteration earlier.

### The composer's current skin, for contrast

`bg-paper/90 backdrop-blur-md` with a hard `border-t border-rule`. At 90 % opacity the blur is
decorative by that same docstring's argument. `ReviewClient`'s sticky action bar is the app's only
other second fixed bar and shares the `bg-paper/90` recipe (`Composer.tsx` docstring: *"`bg-paper/90
backdrop-blur-md` is that file's recipe too"*).

### Entry Point: an installed `/admin` tile's status bar

1. **`app/manifest.ts`** — the runner's manifest: `start_url: '/'`,
   `theme_color: INSTALL.paper`.
2. **`app/admin/manifest.webmanifest/route.ts`** — the admin manifest, added by `dd78bb4`:
   `start_url: '/admin'`, `display: 'standalone'`,
   `background_color`/`theme_color: ADMIN_INSTALL.paper`.
3. **`app/admin/layout.tsx:68-`** — `export const metadata` sets `manifest:
   '/admin/manifest.webmanifest'` and spreads `appleWebApp`. Its own comments explain that
   metadata resolves root → nested with duplicate keys **replaced**, which is what makes the
   second install contract work. **There is no `viewport` export in this file.**
4. **`app/layout.tsx:79`** — the root `viewport.themeColor` media-matched pair, therefore still
   the resolved value for `/admin`:
   ```ts
   themeColor: [
     { media: '(prefers-color-scheme: light)', color: INSTALL.paper },     // #c9e9fb
     { media: '(prefers-color-scheme: dark)',  color: INSTALL.paperDark }, // #0e1b26
   ]
   ```

**Which colour paints which surface.** `lib/pwa.ts:53-58` states the split: *"A manifest carries a
single `theme_color`, so it carries the light one; only the `<meta name="theme-color" media="…">`
pair in the layout's `viewport` export can vary by scheme, and that pair is what Safari actually
reads to tint the status bar."*

| Surface | Resolved from | Value |
|---|---|---|
| splash screen, tile background | admin manifest `theme_color` → `ADMIN_INSTALL.paper` | `#f1f7fb` |
| **live status bar / notch band** | root `viewport.themeColor` → `INSTALL.paper` | `#c9e9fb` |
| the page under it | `app/admin/layout.tsx:77` `bg-paper-2` | `#f1f7fb` |

So the band is `#c9e9fb` over an `#f1f7fb` page: R4's report exactly. `ADMIN_INSTALL` has a
`paper` and **no `paperDark`** (`lib/pwa.ts:101-108`), so a media-matched pair has only one of its
two values available today.

`app/admin/layout.tsx:78` already pads `pt-[calc(1rem+var(--safe-top))]` and the other three
insets, so page content is correctly clear of the notch — R4 is purely the tint.

**`statusBarStyle` stays `'default'`.** `lib/pwa.ts:70-88` carries the argument: translucent draws
the page *under* the status bar and is only safe when every fixed top element pads by
`env(safe-area-inset-top)`, which is true of `/admin` and of `ScreenshotStrip` but not of
`ScreenHeader` or the pages under `app/`. The prerequisite is explicitly *"half done"*.

### How a nested `viewport` resolves — verified in Next's own source

`node_modules/next/dist/lib/metadata/resolve-metadata.js:315`, `mergeViewport`:

```js
const newResolvedViewport = structuredClone(resolvedViewport);
if (viewport) {
    for (const key_ in viewport) {
        ...
        case 'viewportFit':
            // always override the target with the source
            newResolvedViewport[key] = viewport[key];
```

It clones the already-resolved parent viewport and overwrites **only the keys present** in the
child's object. A nested `viewport: { themeColor: [...] }` therefore overrides `themeColor` alone
and **inherits** the root's `width`, `initialScale` and `viewportFit: 'cover'`.

This matters because `viewportFit: 'cover'` is what makes `env(safe-area-inset-*)` non-inert
(`app/layout.tsx:69-71`), and the admin shell's four-inset padding depends on it. The docs
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`) do not
state the merge rule; the source does, and the metadata doc's `### Merging` section states the
analogous shallow-merge/replace rule for `metadata`.

---

## Key Data Structures

### `INSTALL` / `ADMIN_INSTALL`
**Location:** `lib/pwa.ts:60-68` and `lib/pwa.ts:101-108`
```ts
export const INSTALL = { name, shortName, description, paper: '#c9e9fb', paperDark: '#0e1b26' }
export const ADMIN_INSTALL = { name, shortName, description, paper: '#f1f7fb' }  // no paperDark
```
**Used in:** `app/layout.tsx` (`viewport.themeColor`, `appleWebApp`), `app/manifest.ts`,
`app/admin/manifest.webmanifest/route.ts`, `tests/pwa.install.test.ts`.

### `Viewport` (Next)
**Location:** `next` package types; resolved by `resolve-metadata.js`
**Fields used here:** `width`, `initialScale`, `viewportFit`, `themeColor`.

---

## Dependencies

### Configuration / Environment

- `app/globals.css:23-24` — `--paper: #c9e9fb`, `--paper-2: #f1f7fb` (light);
  `:80-81` — `#0e1b26`, `#162834` (dark)
- `app/globals.css:61` — `--safe-top: env(safe-area-inset-top, 0px)`; `--safe-bottom` likewise
- `app/globals.css` — `input, select, textarea { font-size: max(16px, 1rem) }`
- `NINA_BAR_VISIBLE_VAR` — `--nina-bar-visible`, 0 or 1, set by `ChatChrome`

### External Services

None. No network, no database, no migration in either phase.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| composer bar element | `components/nina/Composer.tsx:352-356` | def (markup) | `components/nina` |
| composer inner padding `py-3` | `components/nina/Composer.tsx:357` | def (markup) | `components/nina` |
| textarea `min-h-11` | `components/nina/Composer.tsx:~497` | def (markup) | `components/nina` |
| `composerBottomCss` | `lib/nina/chatview.ts:235-239` | def | `lib/nina` |
| `composerBottomCss` assertions | `lib/nina/chatview.test.ts:218-253` | test | `lib/nina` |
| `NINA_BAR_VISIBLE_VAR` | `lib/nina/chatview.ts` | def | `lib/nina` |
| `COMPOSER_RESTING_PX = 68` | `lib/nina/chrome.ts:115` | def | `lib/nina` |
| `controlBottomCss` | `lib/nina/chrome.ts:188-205` | call (consumes resting px) | `lib/nina` |
| `NINA_CHROME_CONTROL_CLASS` | `lib/nina/chrome.ts:103-106` | def (R3 source) | `lib/nina` |
| `CHROME_CONTROL_PX = 32` | `lib/nina/chrome.ts:78` | def (in `BOTTOM_GAP.chat` sum) | `lib/nina` |
| `CHROME_CONTROL_GAP_PX = 8` | `lib/nina/chrome.ts:81` | def (in the sum) | `lib/nina` |
| `COMPOSER_CLEARANCE_PX` | `components/nina/ChatScreen.tsx:150` | def | `components/nina` |
| `COMPOSER_FALLBACK_PX = … + 68` | `components/nina/ChatScreen.tsx:157` | def | `components/nina` |
| `#nina-composer` measurement | `components/nina/ChatScreen.tsx:610-613` | call | `components/nina` |
| `bottomCss` prop wiring | `components/nina/ChatScreen.tsx:1169` | call | `components/nina` |
| `BOTTOM_GAP.chat` `7.5rem` | `components/ui/AppShell.tsx:81` | def (hand arithmetic) | `components/ui` |
| `TAB_BAR_OUTER_HEIGHT_PX` | `components/ui/TabBar.tsx` | def | `components/ui` |
| `NINA_CHROME_CONTROL_CLASS` consumer | `components/nina/ChatChrome.tsx:252` | call | `components/nina` |
| `app/admin/layout.tsx` `metadata` | `app/admin/layout.tsx:68-` | def (no `viewport` sibling) | `app/admin` |
| root `viewport.themeColor` | `app/layout.tsx:79-82` | def | `app` |
| `ADMIN_INSTALL` | `lib/pwa.ts:101-108` | def (no `paperDark`) | `lib` |
| `INSTALL.paper` / `.paperDark` | `lib/pwa.ts:65-67` | def | `lib` |
| `APPLE_WEB_APP.statusBarStyle` | `lib/pwa.ts:97` | def (must not change) | `lib` |
| admin manifest `theme_color` | `app/admin/manifest.webmanifest/route.ts:75-76` | def | `app/admin` |
| install-metadata assertions | `tests/pwa.install.test.ts` | test | `tests` |
| `mergeViewport` | `node_modules/next/dist/lib/metadata/resolve-metadata.js:315` | reference (framework) | — |

---

## Impact Points (files that WILL need changes)

1. `lib/nina/chatview.ts` — `composerBottomCss` must stop leaving the inset unpainted; a
   companion pure function is needed for the bar's own bottom padding. **Phase 1.**
2. `lib/nina/chatview.test.ts` — its `composerBottomCss` block asserts the exact string.
   **Phase 1.**
3. `components/nina/Composer.tsx` — the `bottom`/padding pair (R1), `py-3` (R2), the fill and
   blur (R3). **Phase 1.**
4. `lib/nina/chrome.ts` — `COMPOSER_RESTING_PX` follows R2. **Phase 1.**
5. `components/nina/ChatScreen.tsx` — `COMPOSER_FALLBACK_PX`'s literal follows R2. **Phase 1.**
6. `components/ui/AppShell.tsx` — `BOTTOM_GAP.chat`'s literal follows R2. **Phase 1.**
7. `app/admin/layout.tsx` — gains a `viewport` export. **Phase 2.**
8. `lib/pwa.ts` — `ADMIN_INSTALL` gains `paperDark`. **Phase 2.**
9. `tests/pwa.install.test.ts` — assert the admin viewport pair. **Phase 2.**

No file appears in both phases, so the two phases share no edge.

**This document describes. The plan files prescribe.**
