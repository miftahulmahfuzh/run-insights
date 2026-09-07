# Code Analysis: `/admin/nina` — "Her character" as its own tab

**Type:** Feature Update
**Date:** 2026-09-07 07:14:16 +07
**Session ID:** 20260907-071416-PRSN
**Plan:** `NINA_PERSONALITY_TAB_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-personality-tab` — branch `feature/nina-personality-tab` (base `origin/main` @ `3902c58`)

---

## User Input

### Original User Request

```
update /admin/nina UI
right now, "Her character" is in Nina's album. move it as a new tab with name : Personality
```

### User-Provided Context

None beyond the prompt. No error messages, no logs.

### User-Provided Files

None marked with `@`. Everything below was discovered by exploration.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Move the "Her character" panel off `/admin/nina` (Nina's album) and onto a new tab named **Personality** |

One paragraph, one deliverable — R1 alone. The "update /admin/nina UI" line is the *site* of the
change, not a second ask: what makes `/admin/nina` different afterwards is precisely that the panel
left it.

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

`components/admin/CharacterPanel.tsx` — sixteen-plus sliders, a five-way relationship selector, the
wardrobe/notes fields, per-parameter toggles and the assembled system-prompt preview — currently
renders **inside** `app/admin/nina/page.tsx`, above the file-manager album, as a `<details>` shut on
arrival. Its own docstring says why it is there and shut:

> *"The user named `/admin/nina`, and the previous plan set rebuilt that page into a paginated
> folder-scoped file manager for a stated reason: 'i will put hundreds of profile pics in there.'
> The album is the page's working surface and must stay the first thing on it, so this panel is a
> native `<details>`, shut on arrival."*
> — `components/admin/CharacterPanel.tsx:36-40`

The user is now repealing the premise: the panel gets its own destination.

**What "tab" means here.** `/admin` has no in-page tab component anywhere. What it has is
`components/admin/AdminNav.tsx`, whose own docstring describes its cells as the admin equivalent of
the runner's tab bar — *"this bar carries the four admin routes and nothing else… What it does
borrow, deliberately, is `components/ui/TabBar.tsx`'s MECHANICS"* — rendered as a fixed
five-…er, **four**-cell bottom bar below `lg` and as a sticky sidebar at `lg`. Those four cells
(Overview · Album · Photos · Memory) are the only thing on this surface a user would call tabs, and
"a new tab with name: Personality" sitting alongside "Nina's album" is a fifth cell and a fifth
route. See **Decisions** in the plan index.

**Success Criteria**

1. `/admin/personality` exists, is admin-gated, and renders the full character panel — every
   control that works today still works and still saves.
2. `/admin/nina` renders the album and nothing else; no `CharacterPanel` import remains in it.
3. `AdminNav` carries a fifth entry labelled **Personality**, pointing at `/admin/personality`, in
   both the phone bar and the desktop sidebar.
4. The overview card's *"Tune her character →"* link points at the new route, not at
   `/admin/nina#character`.
5. `saveNinaTuningAction` / `resetNinaTuningAction` revalidate the route the panel is now on.
6. `npm run test && npm run typecheck && npm run lint && npm run build` green.

**Key Considerations**

- **The nav goes from four cells to five, and that is a geometry change, not a list edit.**
  `tests/admin.shell.test.ts` hard-codes `grid-cols-4` in the regex that reads the bar's height, and
  asserts `shorts` has length 4 with each ≤ 10 characters. 414 px / 5 = 82.8 px per cell, so the
  phone-label ceiling has to tighten with the cell count.
- **"Personality" is 11 characters** and will not fit an 82 px cell at `text-[11px]`. The `LINKS`
  table already carries a `short`/`label` pair for exactly this, and existing shorts are Overview
  (8), Album (5), Photos (6), Memory (6).
- **The `<details>` disclosure loses its justification.** Its only stated reason is that the album
  must stay the working surface of the page it shares. On a route of its own there is nothing to
  push below the fold.
- **`revalidatePath('/admin/nina')`** in `lib/admin/tuningActions.ts` is asserted by
  `tests/admin.tuning.test.ts:334`. If the panel moves and this does not, a save re-renders a page
  the operator is not looking at and the panel shows a stale revision.
- **No database, schema, action-signature or prompt change.** `lib/nina/tuning.ts`,
  `lib/nina/persona.ts`, `lib/nina/prompts/*`, the migrations and
  `tests/__snapshots__/nina.prompts.test.ts.snap` are all untouched. This is a routing and
  placement change.

---

## Analysis Scope

### Explicitly Mentioned Files

None.

### Discovered Related Files

- `app/admin/nina/page.tsx` — mounts `CharacterPanel` (line 166), reads `readNinaTuning` and
  `buildNinaSystemPrompt` into it (lines 108-117)
- `components/admin/CharacterPanel.tsx` — the panel itself, `'use client'`, 469 lines
- `components/admin/AdminNav.tsx` — the four-cell `LINKS` table (lines 58-73)
- `app/admin/layout.tsx` — the shell; `pb-[calc(5rem+var(--safe-bottom))]` clears the bar
- `app/admin/page.tsx` — the "Her character" hub card and its `/admin/nina#character` link (129-149)
- `lib/admin/tuningActions.ts` — `saveNinaTuningAction`, `resetNinaTuningAction`, both revalidating
  `/admin/nina`
- `lib/admin/tuningModel.ts` — `toTuningDraft`, `changedTuningFields`, `loudestDials`, copy readers
- `lib/nina/queries.ts` — `readNinaTuning`
- `lib/nina/prompts` (via `buildNinaSystemPrompt`) — pure assembler used for the preview
- `lib/admin/requireAdmin.ts` — the gate every admin page and action opens with
- `tests/admin.shell.test.ts` — nav route list, cell count, label ceiling, bar/clearance geometry
- `tests/admin.tuning.test.ts` — `ALBUM_PAGE` constant, gate-ordering assertion, revalidate target
- `components/admin/.workflows/package_readme.md` — documents the panel as `/admin/nina`'s
- `docs/nina/persona.md:412` — the "where the panel lives" table

---

## Current Dataflow

### Entry Point: `GET /admin/nina`

**Location:** `app/admin/nina/page.tsx:104` (`AdminNinaPage`)
**Trigger:** navigation; `export const dynamic = 'force-dynamic'`
**Input:** `PageProps<'/admin/nina'>` — `searchParams.folder`, `searchParams.page`
**Validation:** `requireAdmin()` first statement (line 105); `validateFolderPath`; `readPage` floor 1 / ceiling `PAGE_CEILING = 1000`
**Next step:** one `Promise.all` of three independent reads (line 111)

### Processing Chain

1. **`requireAdmin()`** — `lib/admin/requireAdmin.ts`. Returns `{ userId }`; 404s a non-admin.
   Called in the layout, in this page, and again in every action — three cookie decrypts, zero
   round trips.
2. **`readNinaTuning(userId)`** — `lib/nina/queries.ts:~3065`. Returns the stored `NinaTuning` row.
   *"Her character, right now. Never null."* Joins the album's two queries in the same `Promise.all`
   so three round trips do not run in sequence.
3. **`toTuningDraft(tuning)`** — `lib/admin/tuningModel.ts`. Maps the row to the client-safe
   `TuningDraft`; this is the only place on the read side that knows phase-1 field names, so no part
   of the row shape crosses the serialization boundary.
4. **`buildNinaSystemPrompt(tuning)`** — pure string assembly, the same function `lib/nina/turn.ts`
   uses. Never a model call: plan invariant 5 and `scripts/check-llm-payload-boundary.mjs` Rule 2
   forbid awaiting a model call from a render, by function name.
5. **`<CharacterPanel …/>`** — `components/admin/CharacterPanel.tsx:104`. `'use client'`. Copies
   `tuning` into a local `draft`, re-syncing when `revision` changes (during render, not in an
   effect). Every control edits the draft; nothing writes on change.
6. **`<FileExplorer …/>`** — the album, below the panel.

### Data Persistence

**Write path (unchanged by this work):** the panel's Save button calls
`saveNinaTuningAction(draft)` → `requireAdmin()` → `ninaTuningWriteSchema.safeParse` →
`writeNinaTuning(...)` → `revalidatePath('/admin/nina')`. Reset is the same shape through
`ninaTuningResetSchema`. `tests/admin.tuning.test.ts` asserts the gate precedes the Zod parse in
every exported action, and that exactly two actions are exported.

### Exit Points

- HTML for `/admin/nina`: `<h1>Nina's album</h1>`, the `<details id="character">` panel, the empty
  -album notice, `<FileExplorer>`
- `revalidatePath('/admin/nina')` after every tuning mutation
- Deep link in from `app/admin/page.tsx:144` — `href="/admin/nina#character"`, targeting the
  panel's `<details id="character">`

---

## Key Data Structures

### `LINKS` (the nav table)

**Location:** `components/admin/AdminNav.tsx:65-73`
**Shape:** `readonly { href: string; label: string; short: string }[]`, `as const`
**Contract:** `short` renders below `lg`, `label` at `lg`; carrying both in one row is what stops
two hard-coded lists drifting. Currently four rows.
**Consumed by:** `AdminNav`'s `<ul className="… grid h-14 w-full max-w-[470px] grid-cols-4 …">`,
and by `tests/admin.shell.test.ts` as text.

### `CharacterPanelProps`

**Location:** `components/admin/CharacterPanel.tsx:86-103`
**Fields:** `userId: string`, `tuning: TuningDraft`, `defaults: TuningDraft`, `revision: number`,
`promptPreview: string`
**Used in:** `app/admin/nina/page.tsx:166` — the only mount site in the repo.

### `TuningDraft`

**Location:** `lib/admin/tuningModel.ts`
**Client-safe by contract:** imports only `lib/nina/tuning.ts`, which has zero imports of its own.
`tests/admin.tuning.test.ts` asserts it, on code with block comments stripped.

---

## Dependencies

**Configuration / Environment** — `ADMIN_EMAILS` (gates every `/admin/*` route;
`tests/env.admin.test.ts` names `/admin/nina` and `/admin/memory` in its docstring prose only).
`AUTH_URL` via `shareOrigin()`, used by the album only.

**External services** — none on this path. `readNinaTuning` is one Postgres read;
`buildNinaSystemPrompt` is pure.

**Middleware** — `proxy.ts` matches neither `/admin` nor `/api/*`
(`lib/admin/requireAdmin.ts:13-16`), so a new `/admin/*` segment inherits no matcher change and no
new gate beyond `requireAdmin()`.

---

## Reference List

Every site that touches the panel's placement.

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `CharacterPanel` (import) | `app/admin/nina/page.tsx:1` | call | `app/admin/nina` |
| `<CharacterPanel …/>` mount | `app/admin/nina/page.tsx:166-172` | call | `app/admin/nina` |
| "THE CHARACTER PANEL IS ABOVE THE ALBUM AND SHUT" docstring | `app/admin/nina/page.tsx:66-92` | doc | `app/admin/nina` |
| `readNinaTuning` in the album's `Promise.all` | `app/admin/nina/page.tsx:116` | call | `app/admin/nina` |
| `toTuningDraft` / `NINA_TUNING_DEFAULTS` / `buildNinaSystemPrompt` imports | `app/admin/nina/page.tsx:6,8,10` | call | `app/admin/nina` |
| `export function CharacterPanel` | `components/admin/CharacterPanel.tsx:104` | def | `components/admin` |
| `<details id="character" …>` | `components/admin/CharacterPanel.tsx:178` | def | `components/admin` |
| `Her character` summary heading | `components/admin/CharacterPanel.tsx:181` | def | `components/admin` |
| "WHY THIS IS COLLAPSED, AND WHY IT IS ON THIS PAGE AT ALL" docstring | `components/admin/CharacterPanel.tsx:32-46` | doc | `components/admin` |
| `LINKS` (four rows) | `components/admin/AdminNav.tsx:65-73` | def | `components/admin` |
| `grid-cols-4` on the bar | `components/admin/AdminNav.tsx:~118` | def | `components/admin` |
| `Her character` hub card + `/admin/nina#character` | `app/admin/page.tsx:129-149` | call | `app/admin` |
| `revalidatePath('/admin/nina')` ×2 | `lib/admin/tuningActions.ts` | call | `lib/admin` |
| nav href list assertion | `tests/admin.shell.test.ts:103` | test | `tests` |
| `shorts` length 4 / ≤ 10 chars | `tests/admin.shell.test.ts:~110-118` | test | `tests` |
| `grid-cols-4` in the bar/clearance regex | `tests/admin.shell.test.ts:~163` | test | `tests` |
| `ALBUM_PAGE = 'app/admin/nina/page.tsx'` | `tests/admin.tuning.test.ts:282` | test | `tests` |
| gate-before-`readNinaTuning` on the page | `tests/admin.tuning.test.ts:~316` | test | `tests` |
| `revalidatePath('/admin/nina')` assertion | `tests/admin.tuning.test.ts:334` | test | `tests` |
| panel row: *"`/admin/nina`'s character tuning … Collapsed by default."* | `components/admin/.workflows/package_readme.md:101` | doc | `components/admin` |
| *"`CharacterPanel` renders **above** the explorer and **collapsed**"* | `components/admin/.workflows/package_readme.md:591` | doc | `components/admin` |
| "The panel" row | `docs/nina/persona.md:412` | doc | `docs` |

**Not in scope, verified untouched:** `lib/nina/tuning.ts`, `lib/nina/persona.ts`,
`lib/nina/prompts/*`, `lib/db/schema.ts`, every migration,
`tests/__snapshots__/nina.prompts.test.ts.snap`, `tests/nina.tuning.test.ts`,
`components/admin/DialSlider.tsx`, `lib/admin/schema.ts`, `lib/admin/tuningModel.ts` (logic).

---

## Impact Points (files that WILL need changes)

1. `app/admin/personality/page.tsx` — **new.** The Server Component that gates, reads the tuning and
   mounts the panel. Owned by phase 1.
2. `app/admin/nina/page.tsx` — drop the import, the mount, the tuning read from the `Promise.all`,
   the three now-unused imports, and the docstring block that explains a placement that no longer
   exists. Phase 1.
3. `components/admin/CharacterPanel.tsx` — the `<details>`/`<summary>` becomes an always-open
   section, and the docstring's "why it is on this page and shut" paragraph is rewritten to say
   where it lives now. Phase 1.
4. `components/admin/AdminNav.tsx` — a fifth `LINKS` row, `grid-cols-4` → `grid-cols-5`. Phase 1.
5. `app/admin/page.tsx` — the hub card's link target. Phase 1.
6. `lib/admin/tuningActions.ts` — both `revalidatePath` targets. Phase 1.
7. `tests/admin.shell.test.ts` — the href list, the cell count, the label ceiling, the bar regex.
   Phase 1.
8. `tests/admin.tuning.test.ts` — `ALBUM_PAGE` becomes the personality page; the revalidate target.
   Phase 1.
9. `components/admin/.workflows/package_readme.md`, `docs/nina/persona.md` — the two prose rows that
   name `/admin/nina` as the panel's home. Phase 1.

**This document describes. The plan files prescribe.**
