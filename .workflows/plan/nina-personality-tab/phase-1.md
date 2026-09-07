# Phase 1: The Personality tab

**Plan set:** `NINA_PERSONALITY_TAB_PLAN.md`
**Analysis:** `20260907-071416-PRSN_code_analyzer.md`
**Satisfies:** R1 — *"right now, 'Her character' is in Nina's album. move it as a new tab with name: Personality"*
**Depends on:** none (single-phase set)
**Difficulty:** NORMAL
**Package:** `app/admin` · `components/admin` · `lib/admin`

---

## Goal

After this phase the character tuning has a route of its own — `/admin/personality` — reachable
from a fifth `AdminNav` cell (**Personality** at `lg`, **Persona** on a phone) and from the
overview hub card. `/admin/nina` is the album and nothing else: no `CharacterPanel` import, no
`readNinaTuning` call, no tuning slot in its `Promise.all`. The panel itself stops being a shut
`<details>` and becomes an always-open `<section id="character">` whose header carries exactly
the line the old `<summary>` carried — relationship · loudest dials · *N* off · revision.

**Nothing about any control changes.** Not one slider, bound, label, hint, toggle, action
signature, Zod schema, prompt string or database column. This is a placement change and the diff
should read like one.

---

## Interface Contract

**Creates:**
- route `/admin/personality` — `app/admin/personality/page.tsx`, default export
  `AdminPersonalityPage` (Server Component, no props), plus `export const dynamic = 'force-dynamic'`
- `LINKS` gains a fifth row `{ label: 'Personality', short: 'Persona' }` at index 2
  (`components/admin/AdminNav.tsx:57-72`)

**Deletes:**
- `app/admin/nina/page.tsx` — the `CharacterPanel` import (line 1), the `toTuningDraft` import
  (line 6), the `buildNinaSystemPrompt` import (line 8), the `NINA_TUNING_DEFAULTS` import
  (line 10), `readNinaTuning` from the `@/lib/nina/queries` import list (line 9), the
  `readNinaTuning(userId)` slot in the `Promise.all` (line 111), the `tuning` binding (line 105),
  the whole `/* ── THE CHARACTER PANEL IS ABOVE THE ALBUM AND SHUT ── … */` block (lines 66-90),
  the JSX comment at lines 160-165 and the `<CharacterPanel …/>` mount (lines 166-172)
- `components/admin/CharacterPanel.tsx` — the `<details>` / `<summary>` disclosure (lines 178-197,
  467). No exported symbol is removed.

**Renames:**
- `tests/admin.tuning.test.ts` — `ALBUM_PAGE` -> `PERSONALITY_PAGE`, value
  `'app/admin/nina/page.tsx'` -> `'app/admin/personality/page.tsx'` (line 282)

**Signature changes:** none. `CharacterPanelProps` keeps all five fields with the same types;
`saveNinaTuningAction` and `resetNinaTuningAction` keep their arguments, their two-export count and
their `AdminTuningResult` shape.

**Behaviour changes (exhaustive):**
- `revalidatePath('/admin/nina')` -> `revalidatePath('/admin/personality')` in
  `lib/admin/tuningActions.ts:124` and `:172`. The **eleven** `revalidatePath('/admin/nina')` calls
  in `lib/admin/ninaAlbumActions.ts` are correct as they stand and are **not** touched.
- `app/admin/page.tsx:144` — `href="/admin/nina#character"` -> `href="/admin/personality"`
- `components/admin/AdminNav.tsx:104` — `grid-cols-4` -> `grid-cols-5` in the `<ul>` class literal

**Requires (from earlier phases):** nothing — this is the only phase.

**Leaves alone (verified untouched):** `lib/nina/tuning.ts`, `lib/nina/persona.ts`,
`lib/nina/prompts/*`, `NINA_PROMPT_VERSION`, `tests/__snapshots__/nina.prompts.test.ts.snap`,
`tests/nina.tuning.test.ts`, `lib/db/*`, every migration, `lib/admin/schema.ts`,
`lib/admin/tuningModel.ts`, `lib/admin/ninaAlbumActions.ts`, `components/admin/DialSlider.tsx`,
`components/admin/touch.ts`, `components/admin/FileExplorer*`, everything under
`components/admin/explorer/`, `proxy.ts`, `app/admin/layout.tsx`, `app/globals.css`,
`next.config.ts`, `scripts/*`.

---

## Files

| File | Action | What changes |
|---|---|---|
| `app/admin/personality/page.tsx` | **create** | The Server Component that gates, reads the tuning and mounts the panel |
| `app/admin/nina/page.tsx` | modify | Drop four imports, one import member, the `Promise.all` slot, the placement docstring, the mount |
| `components/admin/CharacterPanel.tsx` | modify | `<details>`/`<summary>` -> `<section id="character">` + header row; three docstrings rewritten |
| `components/admin/AdminNav.tsx` | modify | Fifth `LINKS` row; `grid-cols-4` -> `grid-cols-5`; four docstring paragraphs re-counted |
| `app/admin/page.tsx` | modify | Hub card link target + the fragment comment above it; one docstring sentence |
| `lib/admin/tuningActions.ts` | modify | Both `revalidatePath` targets; the file docstring's opening line |
| `tests/admin.shell.test.ts` | modify | href list, `shorts` length 5, ceiling 10 -> 8, bar regex `grid-cols-5`, two comments |
| `tests/admin.tuning.test.ts` | modify | `ALBUM_PAGE` -> `PERSONALITY_PAGE`, revalidate target, two message strings, file docstring |
| `components/admin/.workflows/package_readme.md` | modify | Lines 18, 37, 97, 101 and the "The character panel" section (587-592) |
| `docs/nina/persona.md` | modify | Line 412 "The panel" row (+ four route-name lines, see Step 10b) |

---

## The `force-dynamic` question — verified, not recalled

**Verdict: yes, `app/admin/personality/page.tsx` declares `export const dynamic = 'force-dynamic'`,
and it takes no props (no `PageProps<…>`).**

Three checks, in the order they were made.

1. **Sibling convention.** Every admin page declares it:
   `app/admin/page.tsx:28`, `app/admin/nina/page.tsx:92`, `app/admin/photos/page.tsx:57`,
   `app/admin/memory/page.tsx:43`. The sibling that matches the new page's *shape* — no
   `searchParams`, one `readNinaTuning` — is `app/admin/page.tsx`, whose signature is
   `export default async function AdminHomePage() {` with no parameter at all. The new page copies
   that exactly. `PageProps<'/admin/personality'>` would be a typed promise nothing awaits, and
   `npm run lint` would be right to flag the unused binding.

2. **This repo's own Next docs, read rather than remembered.** `next@16.3.1` (the worktree has no
   `node_modules` yet; the installed copy at `/home/miftah/run-insights/node_modules/next` is the
   same version pinned by `package.json`).
   - `01-app/03-api-reference/03-file-conventions/page.md:119` — *"`searchParams` is a
     **Request-time API** whose values cannot be known ahead of time. Using it will opt the page
     into **dynamic rendering** at request time."* The new page reads no `searchParams`, so **that**
     opt-in does not apply to it.
   - `01-app/03-api-reference/03-file-conventions/page.md:125` — *"You can type pages with
     `PageProps` … `PageProps` is a globally available helper."* It is the helper for `params` /
     `searchParams`; with neither, there is nothing to type.
   - `01-app/02-guides/caching-without-cache-components.md:96-97` — `dynamic` defaults to `'auto'`,
     *"the default option to cache as much as possible without preventing any components from
     opting into dynamic behavior"*; `'force-dynamic'` *"[forces] dynamic rendering, which will
     result in routes being rendered for each user at request time."*
   - `next.config.ts` sets no `cacheComponents` / `dynamicIO`, so `'auto'` is plain `'auto'`.

3. **The functional reason, which is the one that decides it.** `requireAdmin()`
   (`lib/admin/requireAdmin.ts:69-78`) awaits `auth()`, which reads a cookie — a Request-time API
   that *would* force dynamic rendering implicitly. Relying on that is relying on the internals of
   a module three levels down to decide a route's caching, which is precisely the coupling
   `app/admin/nina/page.tsx:38-40` refuses: *"`force-dynamic` therefore stays, but its job is
   unchanged and is not about `searchParams`: the album is per-request state that must reflect the
   action that just ran."* The tuning is per-request state for the same reason — the panel must
   render the row the save just wrote, and `revalidatePath('/admin/personality')` is what makes
   that immediate. Declare it at the route.

---

## Implementation Steps

Order matters only in one place: Step 8's test edit depends on Step 1's file existing
(`existsSync` on `app/admin/personality/page.tsx`). Everything else is order-free.

### Step 0: Install dependencies in the worktree

**File:** none
**Change:** the worktree at `/home/miftah/.worktrees/run-insights/nina-personality-tab` has no
`node_modules` and no generated `.next/types`. `npm run typecheck` runs `next typegen` first, which
is what makes `PageProps` / `LayoutProps` resolvable and what registers the new route literal.
`.env.local` is present (14 vars), so `lib/env.ts` will load.

```bash
cd /home/miftah/.worktrees/run-insights/nina-personality-tab
npm install
```

**Impact:** none on the tree. Skipping it makes every verification command fail for the wrong
reason.

---

### Step 1: The new route

**File:** `app/admin/personality/page.tsx` (new file, new directory)
**Change:** create the Server Component. It is the album page's tuning half, lifted whole: the same
`readNinaTuning` read, the same `toTuningDraft` mapping, the same `buildNinaSystemPrompt` preview,
the same five props. The docstring inherits the album page's *"THE PREVIEW IS A PURE FUNCTION"*
argument, because that argument travels with the mount, not with the route.

**Code — the complete file:**

```tsx
import { CharacterPanel } from '@/components/admin/CharacterPanel'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { toTuningDraft } from '@/lib/admin/tuningModel'
import { buildNinaSystemPrompt } from '@/lib/nina/prompts'
import { readNinaTuning } from '@/lib/nina/queries'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'

/**
 * `/admin/personality` — R1 of this set, in the user's own words: *"right now, 'Her character' is
 * in Nina's album. move it as a new tab with name: Personality."*
 *
 * ── WHY A ROUTE, AND WHY A FLAT SIBLING OF THE ALBUM ────────────────────────────────────────
 * `/admin` has no in-page tab component anywhere. What it has is `components/admin/AdminNav.tsx`,
 * whose own docstring calls its cells the admin counterpart of `components/ui/TabBar.tsx` — so "a
 * new tab" beside "Nina's album" is a fifth NAV CELL and a fifth route, and this file is it.
 *
 * It is `/admin/personality` and not `/admin/nina/personality` because the user asked for the
 * panel to LEAVE the album; nesting it under the album's segment would leave it inside the thing
 * it was moved out of. The nav's other four entries are flat and this one joins them.
 *
 * ── WHAT THIS PAGE IS NOT ───────────────────────────────────────────────────────────────────
 * It is not a second copy of the panel. `components/admin/CharacterPanel.tsx` has exactly one
 * mount site in this repo and this is it; `app/admin/nina/page.tsx` no longer imports it, no
 * longer reads `readNinaTuning`, and is the album alone.
 *
 * ── THE GATE IS HERE, AS IT IS ON EVERY SIBLING ─────────────────────────────────────────────
 * `requireAdmin()` is the FIRST statement, above the read. `proxy.ts` matches neither `/admin` nor
 * `/api/*` (`lib/admin/requireAdmin.ts:13-16`), so this call and the layout's and each action's
 * are the only gates on this route — a new segment under `/admin` inherits no matcher change and
 * needs none. `app/admin/layout.tsx:60-70` explains why all three calls exist rather than one, and
 * `tests/admin.tuning.test.ts` asserts the ordering on this file structurally.
 *
 * ── `force-dynamic`, AND WHY IT IS NOT ABOUT `searchParams` ─────────────────────────────────
 * This page reads no `searchParams` and therefore takes no props — the shape `app/admin/page.tsx`
 * already has. Verified against this repo's own Next (16.3.1) rather than remembered:
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` states that
 * `searchParams` is the Request-time API that opts a page into dynamic rendering, and
 * `01-app/02-guides/caching-without-cache-components.md` that the default `'auto'` caches as much
 * as it can. Neither is the reason this is declared.
 *
 * The reason is `app/admin/nina/page.tsx`'s, verbatim: the tuning is per-request state that must
 * reflect the action that just ran, and `revalidatePath('/admin/personality')` in both actions is
 * what makes that immediate. `requireAdmin()` awaits `auth()`, which reads a cookie and would opt
 * this route in implicitly — but a route's caching decided by the internals of a module three
 * levels down is a route that loses it the day that module is refactored. It is declared here.
 *
 * ── THE PREVIEW IS A PURE FUNCTION, WHICH IS WHAT MAKES IT LEGAL HERE ───────────────────────
 * `buildNinaSystemPrompt(tuning)` assembles a string. It is not a model call, it awaits nothing,
 * and it is the SAME function `lib/nina/turn.ts` uses to build the system prompt — which is the
 * whole value of the preview: what the panel shows is what she is actually handed, not a
 * reconstruction of it.
 *
 * Plan invariant 5 / `scripts/check-llm-payload-boundary.mjs` Rule 2 forbids awaiting a MODEL CALL
 * from a page render, by function name. Nothing on this page appears in that table and nothing on
 * this page may: the preview is deliberately the pure assembler and never a turn entry point. It
 * shows the SAVED tuning, so it changes when a save changes the row, not as a slider moves.
 *
 * ── ONE READ, SO NO `Promise.all` ───────────────────────────────────────────────────────────
 * On the album page this read joined two others in a `Promise.all` so three round trips did not
 * run in sequence. Here there is one read and a bare `await` is the honest shape; a `Promise.all`
 * over a single promise is a comment pretending to be code.
 */

export const dynamic = 'force-dynamic'

export default async function AdminPersonalityPage() {
  const { userId } = await requireAdmin()

  const tuning = await readNinaTuning(userId)

  return (
    <div>
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Personality</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Who she is, not what she looks like. Her relationship to you, every dial, the wardrobe
          the camera reads and the notes she is handed verbatim. Her photographs stayed behind on
          Nina&rsquo;s album; this page is the row her system prompt is assembled from.
        </p>
      </header>

      {/*
       * The tuning crosses to the client as a plain `TuningDraft` — `toTuningDraft` is the one
       * place on the read side that knows phase 1's field names, so no part of the row's shape
       * reaches a component. `promptPreview` is a pure string assembly, never a model call: see
       * the header, and plan invariant 5.
       *
       * The leading `*` on every line is the same load-bearing detail the album page's JSX
       * comment records: `ci:client-secret-guard`'s Rule 3 exempts only lines a comment scanner
       * recognises, and a JSX comment with bare prose continuation lines fails the guard.
       */}
      <CharacterPanel
        userId={userId}
        tuning={toTuningDraft(tuning)}
        defaults={toTuningDraft(NINA_TUNING_DEFAULTS)}
        revision={tuning.revision}
        promptPreview={buildNinaSystemPrompt(tuning)}
      />
    </div>
  )
}
```

**Impact:** `/admin/personality` starts answering. Nothing else changes until Step 2 removes the
old mount, so between Step 1 and Step 2 the panel renders on two routes — build-green but
transiently duplicated. Do Step 2 in the same commit.

**Trap avoided:** `tests/admin.tuning.test.ts`'s `codeOnly()` strips `/* … */` blocks before
asserting, so the docstring above may say *"never a turn entry point"* — but do **not** write
`runNinaTurn`, `distillNinaMemory`, `describeNinaImage`, `resolveNinaPromises` or
`getOrCreateInsight` anywhere in this file **outside** a block comment. The prose above
deliberately says "turn entry point" instead of naming the symbol, which is belt to the braces:
`scripts/check-llm-payload-boundary.mjs` strips comments too, but the docstring reads fine without
the symbol and one fewer coupling is one fewer coupling.

---

### Step 2: `/admin/nina` becomes the album alone

**File:** `app/admin/nina/page.tsx` — four hunks

#### 2a — the imports (lines 1-11)

**Before:**

```tsx
import { CharacterPanel } from '@/components/admin/CharacterPanel'
import { FileExplorer } from '@/components/admin/FileExplorer'
import type { ExplorerFolder, ExplorerPhoto } from '@/components/admin/explorer/model'
import { NINA_FOLDER_ROOT, validateFolderPath } from '@/lib/admin/filetree'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { toTuningDraft } from '@/lib/admin/tuningModel'
import { NINA_ADMIN_PAGE_SIZE, NINA_AVATAR_FALLBACK_SRC } from '@/lib/nina/album'
import { buildNinaSystemPrompt } from '@/lib/nina/prompts'
import { listNinaAvatarFolders, listNinaAvatarsInFolder, readNinaTuning } from '@/lib/nina/queries'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'
import { shareOrigin } from '@/lib/share/origin'
```

**After:**

```tsx
import { FileExplorer } from '@/components/admin/FileExplorer'
import type { ExplorerFolder, ExplorerPhoto } from '@/components/admin/explorer/model'
import { NINA_FOLDER_ROOT, validateFolderPath } from '@/lib/admin/filetree'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { NINA_ADMIN_PAGE_SIZE, NINA_AVATAR_FALLBACK_SRC } from '@/lib/nina/album'
import { listNinaAvatarFolders, listNinaAvatarsInFolder } from '@/lib/nina/queries'
import { shareOrigin } from '@/lib/share/origin'
```

#### 2b — delete the placement docstring block (lines 66-90 inclusive)

Delete the entire second comment block, from `/*` on line 66 through `*/` on line 90 — the
`── THE CHARACTER PANEL IS ABOVE THE ALBUM AND SHUT ──`, `── THE PREVIEW IS A PURE FUNCTION …` and
"the read joins the existing `Promise.all`" paragraphs — and the blank line that separated it from
`export const dynamic`. The result is that the first docstring (ending `*/` at line 64) is followed
by one blank line and then `export const dynamic = 'force-dynamic'`.

**Do not touch** the first docstring's lines 38-40:

```
 * `force-dynamic` therefore stays, but its job is unchanged and is not about `searchParams`: the
 * album is per-request state that must reflect the action that just ran, and
 * `revalidatePath('/admin/nina')` in every action is what makes that immediate.
```

This stays literally true: `lib/admin/ninaAlbumActions.ts` still calls
`revalidatePath('/admin/nina')` in eleven places. The plan index's Decisions row settles it — the
tuning read was never the reason for `force-dynamic`.

#### 2c — the `Promise.all` (lines 105-112)

**Before:**

```tsx
  const [listed, folders, tuning] = await Promise.all([
    listNinaAvatarsInFolder(userId, folder, {
      limit: NINA_ADMIN_PAGE_SIZE,
      offset: (page - 1) * NINA_ADMIN_PAGE_SIZE,
    }),
    listNinaAvatarFolders(userId),
    readNinaTuning(userId),
  ])
```

**After:**

```tsx
  const [listed, folders] = await Promise.all([
    listNinaAvatarsInFolder(userId, folder, {
      limit: NINA_ADMIN_PAGE_SIZE,
      offset: (page - 1) * NINA_ADMIN_PAGE_SIZE,
    }),
    listNinaAvatarFolders(userId),
  ])
```

#### 2d — the mount (lines 159-173)

**Before** (the blank line after `</header>`, the JSX comment, the mount, the trailing blank):

```tsx
      </header>

      {/*
       * The tuning crosses to the client as a plain `TuningDraft` — `toTuningDraft` is the one
       * place on the read side that knows phase 1's field names, so no part of the row's shape
       * reaches a component. `promptPreview` is a pure string assembly, never a model call: see the
       * header, and plan invariant 5.
       */}
      <CharacterPanel
        userId={userId}
        tuning={toTuningDraft(tuning)}
        defaults={toTuningDraft(NINA_TUNING_DEFAULTS)}
        revision={tuning.revision}
        promptPreview={buildNinaSystemPrompt(tuning)}
      />

      {albumTotal === 0 ? (
```

**After:**

```tsx
      </header>

      {albumTotal === 0 ? (
```

**Impact:** `/admin/nina` renders `<h1>Nina&rsquo;s album</h1>`, the empty-album notice and
`<FileExplorer>`. Two of its three round trips remain and neither changed. Exit criterion 2 is met
after this step.

---

### Step 3: The panel loses the disclosure

**File:** `components/admin/CharacterPanel.tsx` — four hunks. No import changes, no prop changes,
no state changes, no handler changes.

#### 3a — the file docstring's placement paragraphs (lines 32-48)

**Before:**

```tsx
/**
 * **Her character** — R1's *"full nina character tuning in /admin/nina page / make several sliding
 * bars"*, R2's relationship, R3's extra dials.
 *
 * ── WHY THIS IS COLLAPSED, AND WHY IT IS ON THIS PAGE AT ALL ────────────────────────────────
 * The user named `/admin/nina`, and the previous plan set rebuilt that page into a paginated
 * folder-scoped file manager for a stated reason: *"i will put hundreds of profile pics in there."*
 * The album is the page's working surface and must stay the first thing on it, so this panel is a
 * native `<details>`, shut on arrival. Seventeen sliders open by default would push the album below
 * the fold on every single visit, including the hundreds of visits that are about a photograph.
 *
 * A native `<details>` rather than a `useState` toggle: it needs no JavaScript to open, it is
 * keyboard-operable for free, and its open state is DOM state — so it survives the re-render that
 * `revalidatePath` causes after a save, which a piece of React state in this component would also
 * survive but a piece of state in the page above it would not. `open` is deliberately NOT passed
 * as a prop; passing it would make React control the attribute and fight the user's click.
 *
```

**After:**

```tsx
/**
 * **Her character** — R1's *"full nina character tuning in /admin/nina page / make several sliding
 * bars"*, R2's relationship, R3's extra dials, now on a route of its own.
 *
 * ── WHY THIS IS NO LONGER A DISCLOSURE ──────────────────────────────────────────────────────
 * This file used to open with an argument for being shut: *"the album is the page's working
 * surface and must stay the first thing on it"*, because the panel shared `/admin/nina` with a
 * file manager built for *"hundreds of profile pics"*, and seventeen sliders open by default would
 * have pushed the album below the fold on every visit that was about a photograph.
 *
 * The user repealed the premise — *"right now, 'Her character' is in Nina's album. move it as a
 * new tab with name: Personality"* — and the panel now owns `/admin/personality`
 * (`app/admin/personality/page.tsx`), which it is the whole content of. Nothing shares the page,
 * so nothing has to be pushed below the fold, and the disclosure's only stated justification is
 * gone with the page it was about.
 *
 * `<details open>` would have been the wrong way to keep it, not merely a redundant one: `open`
 * was deliberately never a prop, because passing it would make React control the attribute and
 * fight the user's click, and `revalidatePath` re-renders this component after every save. So the
 * root is a plain `<section>`, and what the `<summary>` carried — the relationship, the loudest
 * dials, how many parameters are off, and the revision — is carried by the section header, where
 * it is the same one-line answer to "what is she set to" that the hub card gives.
 *
 * **`id="character"` survives on that section root**, and it is not decoration: `/admin/nina#character`
 * was a real deep link from the overview card for two plan sets. The card now points at
 * `/admin/personality`, and a bookmark someone kept still lands on the panel rather than on a
 * fragment that resolves to nothing. It costs one attribute.
 *
```

Everything from `── \`useTransition\`, NOT \`<form action={…}>\` ──` (line 49) to the end of the
docstring (line 84) is **unchanged**, including the *"WHAT THIS FILE MAY NOT IMPORT"* paragraph
that names `server-only` — legal, because `tests/admin.tuning.test.ts`'s `codeOnly()` strips block
comments before it asserts.

#### 3b — the `promptPreview` prop docstring (lines 93-101)

**Before:**

```tsx
  /**
   * `buildNinaSystemPrompt(tuning)`, assembled on the SERVER from the SAVED tuning.
   *
   * It is not recomputed as the sliders move, and that is deliberate rather than a limitation: the
   * assembler reaches the whole persona, and shipping that into the browser to preview a string
   * would put Nina's canon in a client bundle to save one round trip. The disclosure's own label
   * says which revision it is showing.
   */
  promptPreview: string
```

**After:**

```tsx
  /**
   * `buildNinaSystemPrompt(tuning)`, assembled on the SERVER from the SAVED tuning.
   *
   * It is not recomputed as the sliders move, and that is deliberate rather than a limitation: the
   * assembler reaches the whole persona, and shipping that into the browser to preview a string
   * would put Nina's canon in a client bundle to save one round trip. The preview's own summary
   * line — the one `<details>` this panel still has — says which revision it is showing.
   */
  promptPreview: string
```

#### 3c — the `off` counter's comment (lines 137-139)

**Before:**

```tsx
  /* How many parameters are excluded from her prompt entirely (R4). It goes on the closed summary
   * because it is the one setting that cannot be inferred from the numbers underneath it. */
  const off = Object.values(draft.enabled).filter((value) => value === false).length
```

**After:**

```tsx
  /* How many parameters are excluded from her prompt entirely (R4). It goes in the section header
   * because it is the one setting that cannot be inferred from the numbers underneath it. */
  const off = Object.values(draft.enabled).filter((value) => value === false).length
```

#### 3d — the root element and its header (lines 177-197, and the closing tag on line 467)

**Before** (opening):

```tsx
  return (
    <details id="character" className="mb-8 rounded-card border border-rule bg-card px-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
        <span className="text-[15px] font-semibold text-ink">
          Her character
          {dirty && (
            <span className="ml-2 text-[12px] font-semibold text-accent">
              {unsaved.size} unsaved
            </span>
          )}
        </span>
        <span className="text-right text-[12px] font-medium text-ink-3">
          {relationshipCopy(draft.relationship).label} &middot;{' '}
          {loud.length === 0
            ? 'every dial at its default'
            : loud
                .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                .join(', ')}
          {off > 0 && ` · ${off} off`} &middot; revision {revision}
        </span>
      </summary>

      <div className="pb-6">
```

**After** (opening):

```tsx
  return (
    <section id="character" className="mb-8 rounded-card border border-rule bg-card px-5">
      {/*
       * The old `<summary>`, minus the affordances a disclosure needed: no `cursor-pointer`, no
       * `list-none`, no `[&::-webkit-details-marker]:hidden`. The CONTENT is unchanged, because it
       * is still the one-line answer to "what is she set to" and it is still worth having above
       * forty controls.
       *
       * `<h2>` and not a `<span>`: the page's `<h1>` is "Personality" and the two sections below
       * are `<h3>`, so this is the level that was missing while the panel lived inside a
       * `<summary>` that was not a heading at all.
       */}
      <div className="flex items-center justify-between gap-4 py-5">
        <h2 className="text-[15px] font-semibold text-ink">
          Her character
          {dirty && (
            <span className="ml-2 text-[12px] font-semibold text-accent">
              {unsaved.size} unsaved
            </span>
          )}
        </h2>
        <span className="text-right text-[12px] font-medium text-ink-3">
          {relationshipCopy(draft.relationship).label} &middot;{' '}
          {loud.length === 0
            ? 'every dial at its default'
            : loud
                .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                .join(', ')}
          {off > 0 && ` · ${off} off`} &middot; revision {revision}
        </span>
      </div>

      <div className="pb-6">
```

**Before** (closing, lines 466-468):

```tsx
      </div>
    </details>
  )
}
```

**After:**

```tsx
      </div>
    </section>
  )
}
```

**Everything between `<div className="pb-6">` and its closing `</div>` is byte-identical** — the
intro paragraph, the relationship `<fieldset>`, both `<section>`s of `DialSlider`s, wardrobe,
notes, the prompt-preview `<details>` (which stays a `<details>`; it is a second, inner
disclosure and the decision to drop the outer one does not reach it), the result lines, the three
buttons and the reset confirmation. Do not reformat it.

**Impact:** the panel renders expanded. `id="character"` still resolves. `TOUCH_TARGET` and every
`DialSlider` are untouched, so invariant 8 (≥ 44 px on the smaller axis) holds unchanged.

---

### Step 4: The fifth nav cell

**File:** `components/admin/AdminNav.tsx` — five hunks.

> **Trap — read before editing.** `tests/admin.shell.test.ts` reads this file **two different
> ways**. The geometry assertions read only `className="…"` literals (`classNames()`), deliberately,
> because this file's docstrings quote the utilities being asserted. But the *href* and *short*
> assertions read the **whole file** with `/href: '(\/admin[^']*)'/g` and `/short: '([^']*)'/g`.
> So: **never write the literal text `href: '/admin…` or `short: '…'` inside a comment in this
> file.** A docstring that spelled the new short as `short: 'Persona'` would give the test a sixth
> match and fail `toHaveLength(5)`. Every rewrite below says `short` in backticks with no colon.
> The same file is also asserted with `not.toMatch(/^'use client'/m)` and
> `not.toMatch(/from 'next\/navigation'/)` — neither appears, and neither may be added.

#### 4a — the "not `TabBar`" paragraph (line 27)

**Before:**

```
 * the shape of a bottom bar, and it still stands: this bar carries the four admin routes and
 * nothing else. What it does borrow, deliberately, is `components/ui/TabBar.tsx`'s MECHANICS —
```

**After:**

```
 * the shape of a bottom bar, and it still stands: this bar carries the five admin routes and
 * nothing else. What it does borrow, deliberately, is `components/ui/TabBar.tsx`'s MECHANICS —
```

#### 4b — the label-length paragraph (lines 33-39)

**Before:**

```
 * ── STILL PLAIN TEXT, STILL FOUR WORDS, NO ICONS ────────────────────────────────────────────
 * `docs/design-brief.md`'s *"a plain-text link, never an icon button — unambiguous at a glance and
 * an icon is a guess"* is a navigation stance and it survived the move to desktop; it survives the
 * move back to a phone too. What a 414 px viewport does force is length: four cells share 414 px,
 * so each gets ~103 px and "Nina's album" does not fit. `LINKS` therefore carries BOTH strings —
 * `short` renders below `lg`, `label` at `lg` — so the pair cannot drift the way two hard-coded
 * lists would.
```

**After:**

```
 * ── STILL PLAIN TEXT, STILL FIVE WORDS, NO ICONS ────────────────────────────────────────────
 * `docs/design-brief.md`'s *"a plain-text link, never an icon button — unambiguous at a glance and
 * an icon is a guess"* is a navigation stance and it survived the move to desktop; it survives the
 * move back to a phone too. What a 414 px viewport does force is length: five cells share 414 px,
 * so each gets ~82.8 px — down from ~103 px at four — and neither "Nina's album" nor
 * "Personality" fits. `LINKS` therefore carries BOTH strings — `short` renders below `lg`,
 * `label` at `lg` — so the pair cannot drift the way two hard-coded lists would.
```

#### 4c — the `LINKS` docstring and table (lines 50-72)

**Before:**

```tsx
/**
 * The four routes, longest label first in each pair.
 *
 * `short` is the phone label and is not an abbreviation for its own sake: at `text-[11px]` in a
 * 103 px cell, anything past ~10 characters wraps or clips, and a clipped nav label is worse than
 * a shorter true one. `tests/admin.shell.test.ts` holds the 10-character ceiling.
 */
const LINKS = [
  { href: '/admin', label: 'Overview', short: 'Overview' },
  { href: '/admin/nina', label: "Nina's album", short: 'Album' },
  /*
   * R2's route. Deliberately named for the CONVERSATION and not for the person: the entry above it
   * is `nina_avatars` (her profile album) and this one is `nina_message_images` (the photographs in
   * the chat). Two different tables, adjacent in the nav so the distinction is legible, and the
   * labels are the only thing carrying it — which is the reason the segment can stay `/admin/photos`.
   *
   * `short` had to keep that distinction alive on a phone, which is why it is "Album" and "Photos"
   * and not two glyphs: they are still two different words for two different sets, where an icon
   * pair would have been a guess at both.
   */
  { href: '/admin/photos', label: 'Chat photos', short: 'Photos' },
  { href: '/admin/memory', label: 'Memory', short: 'Memory' },
] as const
```

**After:**

```tsx
/**
 * The five routes, longest label first in each pair.
 *
 * `short` is the phone label and is not an abbreviation for its own sake: at `text-[11px]` in an
 * 82.8 px cell — 414 px shared five ways on the XS Max this bar was rebuilt for — anything past
 * ~8 characters wraps or clips, and a clipped nav label is worse than a shorter true one.
 * `tests/admin.shell.test.ts` holds the 8-character ceiling, tightened from 10 when the fifth cell
 * landed. All five clear it: Overview 8, Album 5, Persona 7, Photos 6, Memory 6.
 */
const LINKS = [
  { href: '/admin', label: 'Overview', short: 'Overview' },
  { href: '/admin/nina', label: "Nina's album", short: 'Album' },
  /*
   * The character tuning, which used to be a shut disclosure on the album route until the user
   * asked for it as its own tab: *"move it as a new tab with name: Personality"*. It sits between
   * the album and the chat photos because it is the third thing about HER, and the two photo
   * routes stay adjacent below it.
   *
   * The phone label is "Persona" and not "Personality": eleven characters do not fit an 82.8 px
   * cell at `text-[11px]`, and this pair of strings exists for exactly that. It is a true short
   * form of the word rather than an invented abbreviation — `docs/nina/persona.md` is what this
   * page edits.
   */
  { href: '/admin/personality', label: 'Personality', short: 'Persona' },
  /*
   * R2's route. Deliberately named for the CONVERSATION and not for the person: `/admin/nina` is
   * `nina_avatars` (her profile album) and this one is `nina_message_images` (the photographs in
   * the chat). Two different tables, near each other in the nav so the distinction is legible, and
   * the labels are the only thing carrying it — which is the reason the segment can stay
   * `/admin/photos`.
   *
   * `short` had to keep that distinction alive on a phone, which is why it is "Album" and "Photos"
   * and not two glyphs: they are still two different words for two different sets, where an icon
   * pair would have been a guess at both.
   */
  { href: '/admin/photos', label: 'Chat photos', short: 'Photos' },
  { href: '/admin/memory', label: 'Memory', short: 'Memory' },
] as const
```

> Note the one wording change inside the `/admin/photos` comment: *"the entry above it is
> `nina_avatars`"* -> *"`/admin/nina` is `nina_avatars`"*. Inserting Personality between Album and
> Photos would otherwise have made "the entry above it" name the wrong row. This is the only
> reason that paragraph is touched.

#### 4d — the eyebrow comment (lines 86-87)

**Before:**

```tsx
      {/* The eyebrow is desktop-only: a 56 px bar has room for four words and no room for a
          fifth line above them. */}
```

**After:**

```tsx
      {/* The eyebrow is desktop-only: a 56 px bar has room for five words and no room for a
          line above them. */}
```

#### 4e — the `<ul>` geometry comment and class (lines 92-104)

**Before:**

```tsx
      {/*
       * `h-14` — 56 px, comfortably past `docs/design-brief.md`'s 44 pt minimum once the cell is
       * the whole target. **If this class changes, change `app/admin/layout.tsx`'s
       * `pb-[calc(5rem+var(--safe-bottom))]` with it**: Tailwind cannot read a constant, so the
       * geometry is spelled in two files by necessity and `tests/admin.shell.test.ts` is what
       * stops them drifting apart. `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a
       * comment for exactly this reason.
       *
       * `max-w-[470px] mx-auto` is `TabBar`'s row, borrowed: it is a no-op at 414 px and it is
       * what stops four cells stretching to 225 px each on a landscape phone or a small tablet,
       * both of which are still below `lg`.
       */}
      <ul className="mx-auto grid h-14 w-full max-w-[470px] grid-cols-4 lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1">
```

**After:**

```tsx
      {/*
       * `h-14` — 56 px, comfortably past `docs/design-brief.md`'s 44 pt minimum once the cell is
       * the whole target. The CELL COUNT changed with the fifth route and the HEIGHT deliberately
       * did not: a five-cell row is narrower per cell, not shorter. **If this class changes,
       * change `app/admin/layout.tsx`'s `pb-[calc(5rem+var(--safe-bottom))]` with it**: Tailwind
       * cannot read a constant, so the geometry is spelled in two files by necessity and
       * `tests/admin.shell.test.ts` is what stops them drifting apart.
       * `components/ui/AppShell.tsx` cites `TAB_BAR_HEIGHT_PX` in a comment for exactly this
       * reason.
       *
       * `max-w-[470px] mx-auto` is `TabBar`'s row, borrowed: it is a no-op at 414 px and it is
       * what stops five cells stretching to 180 px each on a landscape phone or a small tablet,
       * both of which are still below `lg`. At the cap each cell is 94 px; at 414 px, 82.8 px.
       */}
      <ul className="mx-auto grid h-14 w-full max-w-[470px] grid-cols-5 lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1">
```

**Impact:** five cells below `lg`, five rows at `lg`. `h-14` unchanged, so `app/admin/layout.tsx`'s
`pb-[calc(5rem+var(--safe-bottom))]` needs no change (invariant 7). No `'use client'`, no
`next/navigation`, no `usePathname()` — invariant 6 holds. Exit criterion 3 is met after this step.

---

### Step 5: The hub card points at the route

**File:** `app/admin/page.tsx` — two hunks.

#### 5a — the page docstring (lines 15-26)

**Before:**

```tsx
/**
 * `/admin` — the hub. It exists because `/admin` would otherwise 404 for an admin, which reads as
 * the gate misfiring rather than as "there is no index here".
 *
 * Deliberately thin: a fact and a link, per card. Phase 16 added the memory card,
 * admin-memory-and-chat-photos phase 2 the chat-photos one, and nina-character-tuning phase 5 the
 * character one — which names the relationship and the dials
 * furthest from their defaults, so "what is she set to" is answered without a navigation. That is
 * also why this page gets a card rather than `AdminNav` getting a fourth row: the panel is a
 * section of `/admin/nina`, not a route, and two sidebar rows pointing at one URL is worse
 * navigation than one.
 */
```

**After:**

```tsx
/**
 * `/admin` — the hub. It exists because `/admin` would otherwise 404 for an admin, which reads as
 * the gate misfiring rather than as "there is no index here".
 *
 * Deliberately thin: a fact and a link, per card. Phase 16 added the memory card,
 * admin-memory-and-chat-photos phase 2 the chat-photos one, and nina-character-tuning phase 5 the
 * character one — which names the relationship and the dials furthest from their defaults, so
 * "what is she set to" is answered without a navigation.
 *
 * That card used to be the argument AGAINST a nav row for the panel: *"the panel is a section of
 * `/admin/nina`, not a route, and two sidebar rows pointing at one URL is worse navigation than
 * one."* The user repealed the premise — the panel is a route now, `/admin/personality`, and
 * `AdminNav` carries it as a fifth cell. The card stays anyway, and for its own reason rather than
 * that one: every card here answers a question without a navigation, and this one answers "what is
 * she set to". The link below it is now just a link to a page, not a fragment into a disclosure.
 */
```

#### 5b — the card's link (lines 139-148)

**Before:**

```tsx
          {/* The fragment targets the panel's own `<details id="character">`. It scrolls there in
              every browser and opens the disclosure in the ones that implement fragment-targeted
              details; where it does not, the panel is the first thing on the page and is one
              click. A deep link is not worth a second copy of the panel on its own route. */}
          <Link
            href="/admin/nina#character"
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent"
          >
            Tune her character &rarr;
          </Link>
```

**After:**

```tsx
          {/* No fragment any more. This used to be `/admin/nina#character`, aimed at the panel's
              own `<details id="character">` in the hope that the browser would both scroll there
              and open the disclosure. The panel has a route now and is the whole of it, so the
              route IS the deep link. The id survives on the panel's section root so a bookmark
              kept from the old URL still lands on something real. */}
          <Link
            href="/admin/personality"
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent"
          >
            Tune her character &rarr;
          </Link>
```

**Impact:** exit criterion 4 and invariant 10 are both met after this step — this was the only
non-`.workflows/plan` occurrence of `nina#character` in the repo.

---

### Step 6: Both actions revalidate the route the panel is on

**File:** `lib/admin/tuningActions.ts` — three hunks.

#### 6a — the file docstring's first line (line 15)

**Before:**

```
 * `/admin/nina`'s character panel, write side — R1, R2, R3.
```

**After:**

```
 * `/admin/personality`'s character panel, write side — R1, R2, R3.
```

#### 6b — `saveNinaTuningAction` (line 124)

**Before:**

```tsx
    const { revision } = await writeNinaTuning(parsed.data.userId, toTuningWrite(parsed.data))
    revalidatePath('/admin/nina')
```

**After:**

```tsx
    const { revision } = await writeNinaTuning(parsed.data.userId, toTuningWrite(parsed.data))
    revalidatePath('/admin/personality')
```

#### 6c — `resetNinaTuningAction` (line 172)

**Before:**

```tsx
    const { revision } = await writeNinaTuning(parsed.data.userId, defaults)
    revalidatePath('/admin/nina')
```

**After:**

```tsx
    const { revision } = await writeNinaTuning(parsed.data.userId, defaults)
    revalidatePath('/admin/personality')
```

The numbered list at lines 20-28 needs no edit: item 4 says *"re-renders THIS page"*, which is
still exactly what it does. `lib/admin/ninaAlbumActions.ts` is **not** touched — its eleven
`revalidatePath('/admin/nina')` calls are the album's, and correct.

**Impact:** a save re-renders the page the operator is looking at, so the panel reports the new
revision without a manual reload (exit criterion 1). If this step is skipped, the tests still pass
until Step 9 and the bug is invisible in CI — do not skip it.

---

### Step 7: `tests/admin.shell.test.ts`

**File:** `tests/admin.shell.test.ts` — three hunks. Nothing outside `describe('the admin nav')`
and `describe('the bar and the padding that clears it')` changes; the `classNames()` docstring at
lines 35-45 is the reason for the care taken in Step 4 and stays verbatim.

#### 7a — the href list (lines 101-107)

**Before:**

```ts
  it('points every entry at a route that exists', () => {
    const hrefs = [...adminNav.matchAll(/href: '(\/admin[^']*)'/g)].map((m) => m[1])
    expect(hrefs).toEqual(['/admin', '/admin/nina', '/admin/photos', '/admin/memory'])
    for (const href of hrefs) {
      expect(existsSync(`${ROOT}app${href}/page.tsx`), `${href} has no page.tsx`).toBe(true)
    }
  })
```

**After:**

```ts
  it('points every entry at a route that exists', () => {
    const hrefs = [...adminNav.matchAll(/href: '(\/admin[^']*)'/g)].map((m) => m[1])
    expect(hrefs).toEqual([
      '/admin',
      '/admin/nina',
      '/admin/personality',
      '/admin/photos',
      '/admin/memory',
    ])
    for (const href of hrefs) {
      expect(existsSync(`${ROOT}app${href}/page.tsx`), `${href} has no page.tsx`).toBe(true)
    }
  })
```

#### 7b — the label ceiling (lines 109-120)

**Before:**

```ts
  it('carries a phone label short enough for a 103px cell', () => {
    // 414px / 4 cells = 103px. Past ~10 characters at text-[11px] the label wraps or clips, and a
    // clipped nav label is worse than a shorter true one.
    // `m[1]!` per `tests/tabbar.geometry.test.ts:86`, the sibling guard this file borrows its
    // shape from: a capture group that matched is a string, and `noUncheckedIndexedAccess`
    // cannot see that.
    const shorts = [...adminNav.matchAll(/short: '([^']*)'/g)].map((m) => m[1]!)
    expect(shorts).toHaveLength(4)
    for (const short of shorts) {
      expect(short.length, `"${short}" will not fit a nav cell`).toBeLessThanOrEqual(10)
    }
  })
```

**After:**

```ts
  it('carries a phone label short enough for an 82px cell', () => {
    // 414px / 5 cells = 82.8px, down from 103px at four. The ceiling tightened with the cell
    // count: past ~8 characters at text-[11px] the label wraps or clips, and a clipped nav label
    // is worse than a shorter true one. All five clear it — Overview 8, Album 5, Persona 7,
    // Photos 6, Memory 6 — which is why "Personality" (11) has a short form and the label does
    // not go on a phone.
    // `m[1]!` per `tests/tabbar.geometry.test.ts:86`, the sibling guard this file borrows its
    // shape from: a capture group that matched is a string, and `noUncheckedIndexedAccess`
    // cannot see that.
    const shorts = [...adminNav.matchAll(/short: '([^']*)'/g)].map((m) => m[1]!)
    expect(shorts).toHaveLength(5)
    for (const short of shorts) {
      expect(short.length, `"${short}" will not fit a nav cell`).toBeLessThanOrEqual(8)
    }
  })
```

#### 7c — the bar regex (lines 156-169)

**Before:**

```ts
   * The matched shape is `TabBar`'s own formatted row (`grid h-[58px] w-full max-w-[470px]
   * grid-cols-5`) with this bar's numbers in it, so the class sorter produces it rather than
   * breaking it.
   */
  const bar = navClasses.match(/grid h-(\d+) w-full max-w-\[470px\] grid-cols-4/)
  const clearance = layoutClasses.match(/pb-\[calc\((\d+(?:\.\d+)?)rem\+var\(--safe-bottom\)\)\]/)

  it('spells both halves in the shape this case can read', () => {
    expect(
      bar,
      'AdminNav lost its `grid h-<n> w-full max-w-[470px] grid-cols-4` row',
    ).not.toBeNull()
```

**After:**

```ts
   * The matched shape is `TabBar`'s own formatted row (`grid h-[58px] w-full max-w-[470px]
   * grid-cols-5`) with this bar's numbers in it, so the class sorter produces it rather than
   * breaking it. Since the Personality cell landed, the column count is the same as `TabBar`'s
   * too — five — which is a coincidence and not a coupling: this bar carries the admin routes and
   * may never carry the runner's.
   */
  const bar = navClasses.match(/grid h-(\d+) w-full max-w-\[470px\] grid-cols-5/)
  const clearance = layoutClasses.match(/pb-\[calc\((\d+(?:\.\d+)?)rem\+var\(--safe-bottom\)\)\]/)

  it('spells both halves in the shape this case can read', () => {
    expect(
      bar,
      'AdminNav lost its `grid h-<n> w-full max-w-[470px] grid-cols-5` row',
    ).not.toBeNull()
```

The two cases below it (`reserves more room than the bar occupies`, `gives the bar a tap target
past the 44pt minimum`) read `bar![1]` — the height — and need no change: `h-14` did not move.

**Impact:** the shell guard now describes a five-cell bar and still fails if the height and the
clearance drift apart.

---

### Step 8: `tests/admin.tuning.test.ts`

**File:** `tests/admin.tuning.test.ts` — four hunks. The pure-function half (lines 47-274) and the
R4 half (lines 385-439) are untouched.

#### 8a — the file docstring's first line (line 30)

**Before:**

```
 * `/admin/nina`'s character panel — the testable surface.
```

**After:**

```
 * `/admin/personality`'s character panel — the testable surface.
```

#### 8b — the path constant (line 282)

**Before:**

```ts
const ALBUM_PAGE = 'app/admin/nina/page.tsx'
```

**After:**

```ts
/* The panel's one mount site. It was `app/admin/nina/page.tsx` for two plan sets; the user moved
 * the panel onto a tab of its own and the structural cases moved with it, because what they assert
 * — the gate above the read, the pure assembler in the render — is a property of the page that
 * MOUNTS the panel, not of the album. `/admin/nina` no longer calls `readNinaTuning` at all, so
 * pointing these cases at it would assert a substring that is not there. */
const PERSONALITY_PAGE = 'app/admin/personality/page.tsx'
```

#### 8c — the gate-ordering case (lines 316-319)

**Before:**

```ts
  it('gates the page before it reads the tuning', () => {
    const source = readFileSync(ALBUM_PAGE, 'utf8')
    expect(source.indexOf('await requireAdmin()')).toBeLessThan(source.indexOf('readNinaTuning('))
  })
```

**After:**

```ts
  it('gates the page before it reads the tuning', () => {
    const source = readFileSync(PERSONALITY_PAGE, 'utf8')
    expect(source.indexOf('await requireAdmin()')).toBeLessThan(source.indexOf('readNinaTuning('))
  })
```

> This case is why Step 1's docstring must not contain the string `readNinaTuning(` — it does not;
> it names the function without parentheses only in the seam paragraph, and `indexOf` is a raw
> substring search with no comment stripping. Verified against the Step 1 source above: the first
> and only occurrence of `readNinaTuning(` is on the `await` line, well after `await requireAdmin()`.

#### 8d — the revalidate target (lines 331-335)

**Before:**

```ts
  it('writes through phase 1s query and revalidates this page', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).toContain('writeNinaTuning(')
    expect(source).toContain("revalidatePath('/admin/nina')")
  })
```

**After:**

```ts
  it('writes through phase 1s query and revalidates this page', () => {
    const source = readFileSync(ACTIONS, 'utf8')
    expect(source).toContain('writeNinaTuning(')
    /* The route the PANEL is on, which since the Personality tab is no longer the album's. A save
     * that revalidated `/admin/nina` would re-render a page the operator is not looking at and
     * leave the panel showing a stale revision until a manual reload. */
    expect(source).toContain("revalidatePath('/admin/personality')")
  })
```

#### 8e — the preview case (lines 369-383)

**Before:**

```ts
describe('the preview is an assembly, not a call — plan invariant 5', () => {
  it('assembles the prompt with the pure builder and awaits no model entry point', () => {
    const source = codeOnly(ALBUM_PAGE)
    expect(source).toContain('buildNinaSystemPrompt(')
    for (const guarded of [
      'runNinaTurn',
      'distillNinaMemory',
      'describeNinaImage',
      'resolveNinaPromises',
      'getOrCreateInsight',
    ]) {
      expect(source, `the album page names ${guarded}`).not.toContain(guarded)
    }
  })
})
```

**After:**

```ts
describe('the preview is an assembly, not a call — plan invariant 5', () => {
  it('assembles the prompt with the pure builder and awaits no model entry point', () => {
    const source = codeOnly(PERSONALITY_PAGE)
    expect(source).toContain('buildNinaSystemPrompt(')
    for (const guarded of [
      'runNinaTurn',
      'distillNinaMemory',
      'describeNinaImage',
      'resolveNinaPromises',
      'getOrCreateInsight',
    ]) {
      expect(source, `the personality page names ${guarded}`).not.toContain(guarded)
    }
  })
})
```

> `codeOnly()` (lines 299-301) strips `/* … */` before asserting, which is what makes Step 1's
> docstring legal even where it discusses the boundary in prose. Do not change `codeOnly`.

**Impact:** the structural half now guards the page that actually mounts the panel. `PANEL` and
`SLIDER` still point at the two components, and the client-safety case (`'use client'` first line,
no `server-only` / `@/lib/nina/queries` / `@/lib/db/` / `@/lib/env` / `@/lib/admin/requireAdmin` /
`@/components/ui/AppShell` in comment-stripped code) passes unchanged — Step 3 adds no import and
no code-level mention of any of them.

---

### Step 9: `components/admin/.workflows/package_readme.md`

**File:** `components/admin/.workflows/package_readme.md` — five hunks, prose only.

#### 9a — line 18

**Before:** `it renders four plain links and marks none of them.`
**After:** `it renders five plain links and marks none of them.`

#### 9b — line 37

**Before:**

```
runner's four-tab navigation inside `AppShell`'s 470 px column; `AdminNav` is this package's own
four-cell `fixed bottom-0 h-14 z-30 border-t` bar, still a Server Component, still with no
```

**After:**

```
runner's four-tab navigation inside `AppShell`'s 470 px column; `AdminNav` is this package's own
five-cell `fixed bottom-0 h-14 z-30 border-t` bar, still a Server Component, still with no
```

#### 9c — line 97 (the `AdminNav.tsx` row)

**Before:**

```
| `AdminNav.tsx` | **no directive** | The `/admin` nav: a fixed four-cell bottom bar (`h-14`, `border-t`, `z-30`) below `lg`, the sticky left rail at `lg`. No active-link highlighting, on purpose. |
```

**After:**

```
| `AdminNav.tsx` | **no directive** | The `/admin` nav: a fixed five-cell bottom bar (`h-14`, `border-t`, `z-30`) below `lg`, the sticky left rail at `lg`. Overview · Album · Persona · Photos · Memory on a phone; the long labels at `lg`. No active-link highlighting, on purpose. |
```

#### 9d — line 101 (the `CharacterPanel.tsx` row)

**Before:**

```
| `CharacterPanel.tsx` | `'use client'` | `/admin/nina`'s character tuning: eleven trait sliders, the five-way relationship selector, the four extra dials, wardrobe and notes, and the assembled prompt preview. One `useTransition`, one save. Collapsed by default. |
```

**After:**

```
| `CharacterPanel.tsx` | `'use client'` | `/admin/personality`'s character tuning — the whole content of that route: eleven trait sliders, the five-way relationship selector, the four extra dials, wardrobe and notes, and the assembled prompt preview. One `useTransition`, one save. Always open; `id="character"` on the section root, so the old `/admin/nina#character` bookmark still lands somewhere real. |
```

#### 9e — the "The character panel" section (lines 587-592)

**Before:**

```
## The character panel

`/admin/nina` has two screens stacked on one route, and the order is deliberate: the album is the
working surface — the previous plan set built it for *"hundreds of profile pics"* — so
`CharacterPanel` renders **above** the explorer and **collapsed**, as a summary line the operator
opens when they want to change who she is rather than what she looks like.
```

**After:**

```
## The character panel

`/admin/nina` used to be two screens stacked on one route, and the order was deliberate: the album
is the working surface — the previous plan set built it for *"hundreds of profile pics"* — so
`CharacterPanel` rendered **above** the explorer and **collapsed**, as a summary line the operator
opened when they wanted to change who she is rather than what she looks like.

That premise was repealed by the person it was written for: *"right now, 'Her character' is in
Nina's album. move it as a new tab with name: Personality."* The panel is now the whole of
`/admin/personality` and the album is the whole of `/admin/nina`. Two consequences worth writing
down, because both look like details and neither is:

- **The disclosure is gone, not defaulted open.** `open` was never a prop — passing it would make
  React control the attribute and fight the operator's click, and `revalidatePath` re-renders this
  component after every save. So the root is a `<section>` and the `<summary>`'s content is the
  section header: relationship · loudest dials · *N* off · revision, the same one-line answer to
  "what is she set to" that the hub card gives.
- **`id="character"` stayed on that section root.** It was a live deep link from the overview card
  for two plan sets. The card points at the route now, and the id costs one attribute and keeps a
  kept bookmark from landing on nothing.
```

The `## The `/admin/nina` file manager` heading (line 104) is **correct as it stands** — the album
still is that file manager. The dated entries under `## Documentation Created` (lines 1107-1141)
are a historical record and are **not** rewritten; the 2026-09-05 entry describing the panel as
*"mounted … collapsed above the explorer on `/admin/nina`"* was true of the phase it records.

**Impact:** documentation only. Adding the new dated entry and bumping `**Last Updated**` (line 4)
is `/update-readme`'s job and is left to it — see Handoffs.

---

### Step 10: `docs/nina/persona.md`

**File:** `docs/nina/persona.md`

#### 10a — the "The panel" row (line 412) — in scope

**Before:**

```
| The panel | `components/admin/CharacterPanel.tsx`, `lib/admin/tuningActions.ts`, `lib/admin/tuningModel.ts` |
```

**After:**

```
| The panel — `/admin/personality`, its own tab since the user asked for one | `app/admin/personality/page.tsx`, `components/admin/CharacterPanel.tsx`, `lib/admin/tuningActions.ts`, `lib/admin/tuningModel.ts` |
```

#### 10b — the four lines this phase makes false — *see the note*

> **Scope note for the reconciler.** `phase_scope` names only *"the 'The panel' row, line ~412"* in
> this file. Four other lines in the same file state that the tuning is edited on `/admin/nina`.
> They are **true today and false the moment Step 2 lands** — they are not drive-by cleanups, they
> are damage this phase does. They are one-token edits in a file this phase already owns. Applied
> here; cut them if the reconciler disagrees, and the phase still builds and passes either way.

Line 7:

**Before:** `**Her settings live in the database**, per user, edited on `/admin/nina`. Everything below that says`
**After:** `**Her settings live in the database**, per user, edited on `/admin/personality`. Everything below that says`

Line 258:

**Before:** `Her character is a stored row, per user, edited on `/admin/nina` and read live on every turn — no`
**After:** `Her character is a stored row, per user, edited on `/admin/personality` and read live on every turn — no`

Line 337:

**Before:**

```
review, and every one of those rules would quietly cancel a slider. `/admin/nina` renders the
assembled prompt instead, so the operator reads the contradiction they wrote and moves a slider.
```

**After:**

```
review, and every one of those rules would quietly cancel a slider. `/admin/personality` renders
the assembled prompt instead, so the operator reads the contradiction they wrote and moves a
slider.
```

Line 421:

**Before:** ``/admin/nina` and she is exactly the Nina who shipped before this set — that is what the defaults`
**After:** ``/admin/personality` and she is exactly the Nina who shipped before this set — that is what the defaults`

`docs/plans/F33-nina.md:26` (*"| 15 | `/admin/nina` — avatar upload and the circular crop |"*) is a
historical phase table and is **correct as it stands**. Not touched.

**Impact:** documentation only.

---

## Verification

Run from the worktree root, `/home/miftah/.worktrees/run-insights/nina-personality-tab`.

**Setup (once):**

```bash
npm install
```

**The gate, in order:**

```bash
npm run test
npm run typecheck   # runs `next typegen` first — this is what proves the new route literal
npm run lint
npm run build
```

Or as one line, which is invariant 1's own form:

```bash
npm run test && npm run typecheck && npm run lint && npm run build
```

**The invariant-10 grep — must print nothing:**

```bash
grep -rn 'nina#character' app components lib tests docs
```

(`components/admin/.workflows/plan/P2-CA-A000.md:1521` also holds the string, but that path is
under `.workflows/plan/` and invariant 10 excludes it by name. If you prefer the exact invariant
text as a command: `grep -rn 'nina#character' app components lib tests docs | grep -v '.workflows/plan'`
— also empty.)

**Two more greps worth running, both must print nothing:**

```bash
# no orphaned tuning read or mount left on the album route
grep -n 'CharacterPanel\|readNinaTuning\|toTuningDraft\|buildNinaSystemPrompt\|NINA_TUNING_DEFAULTS' app/admin/nina/page.tsx

# no stale four-cell geometry
grep -rn 'grid-cols-4' components/admin/AdminNav.tsx tests/admin.shell.test.ts
```

**Snapshot check — invariant 2.** `npm run test` must pass with
`tests/__snapshots__/nina.prompts.test.ts.snap` unmodified. `git status --short` after the run must
not list it. **`vitest -u` is forbidden**; if a prompt snapshot fails, something in `lib/nina/` was
touched and the fix is to revert that, not to update the snapshot.

**Manual check** (`npm run dev`, signed in as an `ADMIN_EMAILS` account):

1. `/admin/personality` — the panel renders **expanded**, no disclosure triangle, no click needed.
   Header reads `Her character` on the left and `<relationship> · <loudest dials> · N off ·
   revision <n>` on the right.
2. Move one slider. The header's `unsaved` count appears. Press **Save the whole tuning**. The note
   reports the new revision and the header's `revision <n>` increments **without a manual reload** —
   this is Step 6 working. Reload and confirm the value persisted.
3. Flip one parameter's checkbox off, save, confirm the `· 1 off` segment appears in the header and
   that the score it was parked at is still there.
4. **Reset to defaults** → confirm → the confirmation panel closes, the revision bumps, every dial
   is back at its default.
5. Open the inner `The assembled system prompt · revision <n>` disclosure — still a `<details>`,
   still opens, still shows the saved prompt.
6. Visit `/admin/personality#character` — the fragment resolves to the section, no 404, no jump to
   nowhere.
7. `/admin/nina` — `Nina's album`, the explorer, and **no character panel anywhere on the page**.
   Upload/rename/move still work (their actions were not touched).
8. `/admin` — the *Her character* card still prints the relationship and the loudest dials, and
   *"Tune her character →"* lands on `/admin/personality`.
9. Nav, at ≥ 1024 px: five sidebar rows — Overview, Nina's album, Personality, Chat photos, Memory.
10. Nav, in Safari at 414 px (or a 414 × 896 device emulation): five bottom cells reading
    **Overview · Album · Persona · Photos · Memory**, each on one line with no clipping and no
    wrap, the bar still 56 px tall, the last card on every page still clear of it. Rotate to
    landscape (896 px) and confirm the row caps at 470 px rather than stretching.
11. Sign out and hit `/admin/personality` → redirected to `/`. Sign in as a non-admin → 404.

**Exit criteria** (the plan index's, restated as observations):

1. `/admin/personality` renders the whole panel expanded; every control works and Save reports the
   new revision on that page without a reload.
2. `/admin/nina` renders `<h1>Nina's album</h1>` and the explorer, with no `CharacterPanel` import
   and no `readNinaTuning` call.
3. `AdminNav` shows five cells, **Personality** at `lg` and **Persona** below it; the bar is
   `grid-cols-5` and still `h-14`.
4. `/admin` → *"Tune her character →"* lands on `/admin/personality`.
5. `grep -rn 'nina#character' app components lib tests docs` is empty.
6. The four gate commands are green with `nina.prompts` snapshots unmodified.

---

## Handoffs

Found while planning, deliberately **not** done here.

1. **`lib/admin/.workflows/package_readme.md:507` and `:594`** name
   `revalidatePath('/admin/nina')` as how the *panel* re-renders. Both become false at Step 6.
   `lib/admin`'s readme is not in this phase's OWNS list, so it is left alone; the two lines are
   `/admin/nina` -> `/admin/personality` and nothing else. Belongs to whoever runs `/update-readme`
   over `lib/admin`.
2. **`components/admin/.workflows/package_readme.md`'s `**Last Updated**` line (4) and a new dated
   entry under `## Documentation Created` (after line 1141).** The file's own convention is that
   `/update-readme` writes these with a TaskID; writing one by hand here would mint a task
   reference this plan set does not have. The prose rows this phase falsifies **are** fixed (Step 9).
3. **`components/admin/.workflows/todos.md:36,44`** describe the character-tuning task as owning
   `app/admin/nina/page.tsx` and exiting with *"the panel is collapsed by default so the album is
   still the page's working surface."* That is a closed task's historical record, not a live
   statement, and rewriting completed todo cards is how a project loses its history. Left alone
   deliberately; noted so nobody reads it as an oversight.
4. **An active-link highlight on the fifth cell.** Five cells make "where am I" a slightly harder
   question than four did, and `usePathname()` is the obvious answer. It is forbidden by invariant
   6 and by the package readme's own rule — a static nav would become a Client Component to bold
   one word — and every page under the nav opens with an `<h1>` naming the route. Not this phase,
   and not without repealing that rule on purpose.
5. **A cross-link between the two routes.** The album and the panel were one page for two plan sets
   and an operator may want to hop between them. Step 1's lede mentions Nina's album in prose but
   adds no `<Link>`, because a `next/link` import on a page that exists to mount one component is
   scope this phase does not have. Cheap to add later.
6. **The trailing `mb-8` on the panel's section root** is now the last margin on a page that has
   nothing after it. Harmless — `app/admin/layout.tsx` reserves
   `pb-[calc(5rem+var(--safe-bottom))]` below it — and kept, because removing it is a visual change
   on a phase whose contract is that nothing visual changes except the disclosure.

---

## Rollback

One phase, one branch, one commit-set, no data. Nothing is written to the database, no migration
runs, no stored row changes shape: the same two actions read and write the same `NinaTuning` before
and after, so a rollback needs no data repair.

```bash
git checkout main
git branch -D feature/nina-personality-tab
```

Or, if it has already merged, revert the merge commit. The one thing to check after a revert is
`lib/admin/tuningActions.ts` — both `revalidatePath` targets must be back at `'/admin/nina'`, or
the panel will render on the album route and revalidate a route that no longer exists.

A **partial** rollback (keep the route, put the panel back on the album too) is not available and
should not be attempted: `CharacterPanel` has one mount site by design, and two mounts would mean
two drafts of the same row, each able to overwrite the other's save.
