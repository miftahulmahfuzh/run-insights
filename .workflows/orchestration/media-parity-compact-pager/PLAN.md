# Plan: `/nina/about` Media parity + compact circular pagination

**Slug:** media-parity-compact-pager
**Date:** 2026-10-02 14:15:59 WIB
**Analysis:** `20261002-141559-M3K8_code_analyzer.md`
**Worktree:** `~/.worktrees/run-insights/media-parity-compact-pager`
**Branch:** `feature/media-parity-compact-pager` (base: `origin/main` @ `9010c11`)
**Phases:** 2
**Status:** landed — both phases committed, verified from git, and merged to `main` as `44243e8` (2026-10-02). Per-phase state is `ledger.json`; this line is the coordinator's, and no phase session may write it.
**Coordinator:** `orch-media-parity-compact-pager` (session `a77591e2-4026-4b3d-9394-12fc50d23033`)

---

## Why

The user's rationale, verbatim:

```
1. make sure /nina/about Media show exactly the same photos as admin page's https://runins.site/admin/nina?view=media
2. the pagination button is too big (in Media, we have 13 pages now). reduce their size, and make it circular. make sure the circular button is 30% smaller than the current button. apply to every pagination in the system
```

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | `/nina/about`'s Media tab must show exactly the same photographs as `/admin/nina?view=media` | 1 |
| R2 | Pagination cells: smaller, circular, 30% smaller than today's — applied to every pagination in the system | 2 |

## Scope

**In scope:**

- R1 — the `/nina/about` Media arm's page size and stride, its cookie name, its page-count
  arithmetic, and the tests/docstrings that spell the old number.
- R2 — the `CELL` class string in the one shared `components/ui/Pagination.tsx`, the test that pins
  its tokens, and the two docs that record the sizing decision.

**Out of scope, and why:**

- **`listNinaMediaPhotos`, `countNinaMediaPhotos`, `mediaCollectionScope`, `isOriginalPhoto`** —
  the two surfaces already share one read over one predicate. The defect is in what `/nina/about`
  *asks for*, not in what the query answers. No query-layer edit in either phase.
- **`/admin/nina`** — it is the reference surface. Nothing about it changes.
- **The Foto profil tab** — `listNinaAvatarsPage`'s ceiling already *is* `NINA_ABOUT_PAGE_SIZE`,
  so its limit and stride agree. `NINA_ABOUT_PAGE_SIZE` keeps the value 99 and
  `NINA_ABOUT_PROFILE_PAGE_COOKIE` keeps its name.
- **`NINA_CHAT_PHOTO_PAGE_SIZE`'s value (48)** — it is the cost constant the Media read's ceiling
  is built from. Phase 1 binds to it; it does not move it.
- **Any schema change or migration.** Neither phase touches `drizzle/` or `lib/db/schema/`.
- **The five pagination call sites.** R2 is a single-file change by construction: all five already
  render the shared control, so none of them is edited.
- **Ellipsis/windowing in the pager**, the `hrefForPage` XOR `onPage` union, the per-surface
  `pageCount <= 1` guards, and the four differing href grammars — all deliberate, all untouched.

## Invariants

1. **The tree builds and `npm test` passes at the end of each phase.** Both phases are independently
   shippable; neither depends on the other.
2. **`npm run typecheck` (`next typegen && tsc --noEmit`) is the gate, not `npm run build`** —
   vitest does not typecheck.
3. **One read, one predicate.** No phase adds a second query, a second count, or a second opinion
   about what the Media collection is. `listNinaMediaPhotos` / `countNinaMediaPhotos` /
   `mediaCollectionScope` are read-only in this plan.
4. **No page stride may exceed the read's own ceiling.** After phase 1 this is pinned by a test, not
   by a comment — that mismatch is the entire bug.
5. **A page-size change moves the cookie NAME.** `lib/nina/album.ts:436-452` records the measured
   2026-09-19 bug this prevents. The media cookie's name must carry the media page size.
6. **`description` never crosses into client props.** `albumPhotos`/`galleryPhotos` stay the only
   mappers; no phase bypasses them.
7. **No migration, no `db:migrate`, no backfill script.** The one database is production.
8. **R2 edits exactly one implementation file.** If a phase-2 change would need a second component
   edited, the change is wrong — every pagination in the app already renders the shared control.
9. **`min-h`/`min-w`, never `h`/`w`, on the pager cell.** A minimum cannot fight a wrapped row's
   line height, and a long page number must be allowed to be wider than it is tall.
10. **No behavioural change to pagination mechanics in phase 2** — same markup, same roles, same
    `aria-current`, same null-below-two-pages. Visual only.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Media page size binds to the read's ceiling | R1 | `lib/nina` + `app/nina/about` + `components/nina` + `tests/` | 9 | — | NORMAL | `.workflows/plan/media-parity-compact-pager/phase-1.md` | P1-NIN-A058 | — |
| 2 ✅ | One pager cell: 30.8 px, circular | R2 | `components/ui` (+ `docs/`) | 4 | — | EASY | `.workflows/plan/media-parity-compact-pager/phase-2.md` | P2-CU-A002 | — |

Neither phase depends on the other and their file sets are disjoint (verified below), so the two
may run concurrently in either order.

### Phase 1 — Media page size binds to the read's ceiling

**Satisfies:** R1

**Owns:**
- `lib/nina/album.ts` — introduce `NINA_ABOUT_MEDIA_PAGE_SIZE`, defined as
  `NINA_CHAT_PHOTO_PAGE_SIZE` so the Media tab's stride is bound by construction to the ceiling
  `listNinaMediaPhotos` enforces; re-point `NINA_ABOUT_MEDIA_PAGE_COOKIE`'s name at it
  (`nina-about-mpage-48`), per invariant 5.
- `app/nina/about/page.tsx` — the `listNinaMediaPhotos` leg's `limit` and `offset`.
- `lib/nina/aboutPageActions.ts` — `fetchNinaMediaPage`'s `limit` and `offset`.
- `components/nina/NinaAboutScreen.tsx` — `galleryPageCount`; the docstrings that say both tabs
  page at the same size.
- `components/nina/NinaPhotoGrid.tsx` — the one stale docstring line (:14-18).
- `components/nina/NinaAboutScreen.test.tsx` — the Media-tab test's totals (:330-344).
- The two halves of the invariant-4 guard: a new `describe` block in `lib/nina/album.test.ts`
  (constants) and the new file `tests/nina.aboutMediaPage.test.ts` (the bound parameters the fake
  driver actually records).
- `components/nina/.workflows/package_readme.md` — the one sentence (:394) saying both pagers fetch
  one `NINA_ABOUT_PAGE_SIZE` page.

**Does not touch:** `lib/nina/queries/*` (the reads are correct), `app/admin/nina/page.tsx`,
`NINA_ABOUT_PAGE_SIZE`'s **value**, `NINA_ABOUT_PROFILE_PAGE_COOKIE`, `NINA_CHAT_PHOTO_PAGE_SIZE`'s
**value**, anything under `components/ui/` (`Pagination.tsx`, `Pagination.test.tsx`,
`.workflows/package_readme.md` — all phase 2's), `docs/architecture.md` (D-6),
`tests/nina.avatarsPage.test.ts`. It asserts no cell dimension, class token, radius or padding
anywhere, so phase 2's restyle lands under it either way.

**Exit criteria:** `/nina/about`'s Media tab draws `ceil(total / 48)` pages and every page fetches
48 rows at offset `(page-1) * 48` — so page N is byte-for-byte the row set `/admin/nina?view=media`
page N shows. For today's 596 rows: 13 pages on both surfaces, 0 unreachable photographs. The stale
`nina-about-mpage-99` cookie is orphaned rather than reinterpreted. `tests/nina.avatarsPage.test.ts`
passes unedited. `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` green.

### Phase 2 — One pager cell: 30.8 px, circular

**Satisfies:** R2

**Owns:**
- `components/ui/Pagination.tsx` — the file header's now-stale `TOUCH_ICON` paragraph (:14-17) and
  `CELL` (:51-58) only: `min-h-11 min-w-11` → the 30 %-smaller value
  (44 px × 0.7 = **30.8 px** = `min-h-[1.925rem] min-w-[1.925rem]`, spelled in rem to track the root
  scale the way `min-h-11` does),
  `rounded-field` → **`rounded-pill`** (D-4), and the padding/type tightened just enough that a two- and
  three-digit number still fits inside the circle rather than stretching it to a pill. The
  docstring records that this is **below** the app's 44 px iOS touch floor, that it was asked for
  explicitly with a number, and therefore must not be "fixed" back.
- `components/ui/Pagination.test.tsx` — the header docstring (:8-14) and the pinned class tokens
  (:90-98).
- `components/ui/.workflows/package_readme.md` — the `min-h-11 min-w-11` decision record (:373-376)
  and the now-false "the 44 px tap floor is spelled locally in `CELL`" bullet (:381-384).
- `docs/architecture.md` — §8's "Pagination — one control, five surfaces" paragraph (:325 and a new
  fourth bullet after :335). **This file is phase 2's alone this set** (D-6).

**Does not touch:** any of the five call sites, `components/ui/index.ts`, `ACTIVE`, `INACTIVE`, the
`PaginationProps` union, the `pageCount <= 1` guard, the markup/roles, `app/globals.css`
(`--radius-pill` already exists; no new token), `components/admin/touch.ts`, and anything under
`lib/nina`, `app/nina` or `components/nina` — phase 1's whole set, including
`components/nina/.workflows/package_readme.md`, which is a **different file** from the
`components/ui/` one this phase edits.

**Exit criteria:** every pagination in the app draws circular ~30.8 px cells, with no call site
edited and no change to which element is rendered for which state. `npm test`, `npm run typecheck`,
`npm run lint`, `npm run format:check` green.

## Reconciliation Log

**No cross-phase conflicts.** The two phases delete nothing, rename no symbol, create nothing the
other reads, and their file sets are disjoint — verified from the plans' *bodies*, not their
contracts, by extracting every path either plan names as an edit target:

| Phase 1 (9) | Phase 2 (4) |
|---|---|
| `lib/nina/album.ts`, `app/nina/about/page.tsx`, `lib/nina/aboutPageActions.ts`, `components/nina/NinaAboutScreen.tsx`, `components/nina/NinaPhotoGrid.tsx`, `components/nina/NinaAboutScreen.test.tsx`, `lib/nina/album.test.ts`, `tests/nina.aboutMediaPage.test.ts` (new), `components/nina/.workflows/package_readme.md` | `components/ui/Pagination.tsx`, `components/ui/Pagination.test.tsx`, `components/ui/.workflows/package_readme.md`, `docs/architecture.md` |

Intersection: empty. The two `package_readme.md` files are **different files** in different
packages (`components/nina/` vs `components/ui/`) and must not be conflated.
`docs/architecture.md` appears in phase 2 only, per D-6.

What the reconciliation pass actually found and fixed:

| # | Class | Finding | Resolution |
|---|---|---|---|
| 1 | Broken quote (would silently break `/implement`) | Phase 1 Step 6 said "replace lines **330-343** in full" for the Media-tab test in `components/nina/NinaAboutScreen.test.tsx`. The test is lines **330-344** — its closing `  })` is line 344 — and the supplied replacement carries its own closing `  })`. Slicing 330-343 leaves a stray brace and the file stops parsing. | Range corrected to `330-344` in the step, the step header and the Files table, with an inline warning naming the brace. |
| 2 | Contract drift (index vs plan) | Index Phase 1 **Files** said 7; the plan lands on 9 (it adds `lib/nina/album.test.ts` and `components/nina/.workflows/package_readme.md` beyond the analysis's six impact points plus the new guard test). | Index corrected to 9; both extras named in Phase 1's **Owns**. Both stay inside phase 1's packages and touch nothing phase 2 owns. |
| 3 | Contract drift (index vs plan) | Index Phase 2 **Owns** said `rounded-field` → `rounded-full`; the plan overrode it to `rounded-pill`. The plan is right (D-4). | Index rewritten to `rounded-pill`. Phase 2's **Files** count of 4 confirmed correct, unchanged. |
| 4 | Stale line pointers | Phase 2's Files table said `Pagination.test.tsx:11-13` (the docstring is `8-14`) and `components/ui/.workflows/package_readme.md:375-376` (the bullet replaced is `373-376`). The *steps* already had the right ranges. | Files table aligned to the steps. |
| 5 | Prose imprecision | Phase 2 Step 2 called `CELL`'s docstring "four-line" and the string "two-line"; they are 5 lines (`51-55`) and 3 lines (`56-58`). | Restated as "lines 51 through 58 inclusive". |
| 6 | Wrong filename | Phase 2's prettier note cited `.prettierrc`; the repo has `.prettierrc.json`. | Corrected, and `printWidth: 100` added — the new `CELL`'s first line measures 98 columns, so the hand-written split survives `format:check`. `.prettierignore` lists both `*.md` and `docs`, so all three of phase 2's doc edits are outside `format:check` (claim verified). |

**Completeness of the quoted "before" state — checked file by file against the worktree at
`origin/main` @ `9010c11`.** Apart from finding 1, every line range and every quoted hunk in both
plans matched byte-for-byte: `lib/nina/album.ts` 427-454 (and `NINA_CHAT_PHOTO_PAGE_SIZE` at 105,
declared above the new constant as the plan claims); `app/nina/about/page.tsx` 7-23, the
`Promise.all` at 87-97 with the media leg at 92-95, and the 55↔57 docstring seam the insertion
targets; `lib/nina/aboutPageActions.ts` 5-14, 34-35, 60-75; `NinaAboutScreen.tsx` 23-36, 94, 100,
108-109, 309-310, 989-1011; `NinaPhotoGrid.tsx` 14-18; `NinaAboutScreen.test.tsx` 77-84;
`lib/nina/album.test.ts` 3-16 and the tail at 205; `components/nina/.workflows/package_readme.md`
394; `Pagination.tsx` 6-25, 51-55, 56-58; `Pagination.test.tsx` 8-14 and 90-98;
`components/ui/.workflows/package_readme.md` 373-376 and 381-384; `docs/architecture.md` 325 and
335. Phase 1 Step 8's collaborators also check out: `tests/support/fakeDb.ts` exports
`installFakeDb` / `uninstallFakeDb` / `FakeDb` with `queries`, `reset()` and `{ sql, params }`,
answers an unqueued statement with `[]`, and `countNinaMediaPhotos` ends `counted[0]?.total ?? 0` —
so the suite's deliberate no-enqueue cannot throw.

**Gaps — none. All ten Impact Points are owned by exactly one phase**, 1-7 by phase 1 and 8-10 by
phase 2, matching the analysis's own assignment:

| # | Impact point | Phase | Where |
|---|---|---|---|
| 1 | `lib/nina/album.ts` | 1 | Step 1 |
| 2 | `app/nina/about/page.tsx` | 1 | Step 2 |
| 3 | `lib/nina/aboutPageActions.ts` | 1 | Step 3 |
| 4 | `components/nina/NinaAboutScreen.tsx` | 1 | Step 4 |
| 5 | `components/nina/NinaAboutScreen.test.tsx` | 1 | Step 6 |
| 6 | the new guard test | 1 | Steps 7 (constants) + 8 (driver) |
| 7 | `components/nina/NinaPhotoGrid.tsx` | 1 | Step 5 |
| 8 | `components/ui/Pagination.tsx` | 2 | Steps 1 + 2 |
| 9 | `components/ui/Pagination.test.tsx` | 2 | Step 3 |
| 10 | `components/ui/.workflows/package_readme.md` + `docs/architecture.md` | 2 | Steps 4 + 5 |

A repo-wide sweep for `NINA_ABOUT_PAGE_SIZE` and `nina-about-[mp]page-` found no *source* site the
set leaves stale: `lib/nina/queries/avatars.ts` reads the constant as the avatar ceiling (value
unchanged, read-only), and neither `docs/architecture.md` nor `lib/nina/.workflows/package_readme.md`
states a `/nina/about` Media page size at all — so phase 1's handoff claim that it makes nothing in
`docs/` stale holds, and D-6 costs no coverage.

**Independent buildability — each phase is green on its own, in either order.** Phase 1 reads no
symbol phase 2 writes and asserts no cell dimension, class token, radius or padding anywhere (its
new assertions count `<li>` elements and read `aria-current`, both of which phase 2 leaves alone).
Phase 2 touches no `lib/nina`, `app/nina` or `components/nina` file. The one way a class-string
change could have reached across — a second test pinning the pager's tokens — was swept for
directly: `min-h-11` / `min-w-11` / `rounded-field` under `*.test.ts(x)` appear only in
`Pagination.test.tsx:96` (phase 2's own), in `DialSlider`/`UserPicker`/`PhotoReferencePicker` tests
reading *their own* components, and in `tests/admin.shortcuts.test.ts:288`, which scans the
shortcut table's source, not this file. `components/nina/NinaAboutScreen.test.tsx` contains no
`toHaveClass` at all, so it passes under either phase's commit alone.

## Decisions

| # | The fork | The choice | The rung that settled it |
|---|---|---|---|
| D-1 | `/nina/about` Media page size: match the admin stride (48) or widen the read's ceiling to 99 so a 99-row page is honestly served | **48 — `NINA_CHAT_PHOTO_PAGE_SIZE`** | **The user's raw input**: *"show exactly the same photos as admin page's `?view=media`"*. Matching the admin stride is what makes page N the identical row set on both surfaces; widening to 99 would also eventually show every photo but would make the two surfaces disagree page-for-page, and would double a mobile page's payload to ~99 full-size originals against the measured cost argument at `lib/nina/album.ts:80-104`. |
| D-2 | Spell the new Media size as the literal `48`, or define it as `NINA_CHAT_PHOTO_PAGE_SIZE` | **`export const NINA_ABOUT_MEDIA_PAGE_SIZE = NINA_CHAT_PHOTO_PAGE_SIZE`**, never the literal | **Surrounding convention** (`lib/nina/album.ts` is where every page-size constant lives with an argued docstring) **+ invariant 4** — the stride must be bound by construction to the ceiling the read enforces, not kept equal by vigilance. A literal `48` would pass the guard test today and be the same defect one `NINA_CHAT_PHOTO_PAGE_SIZE` edit later. |
| D-3 | On resizing one tab, reinterpret the existing cookie or orphan it | **The media cookie's NAME moves to `nina-about-mpage-48`**; `nina-about-ppage-99` is untouched | **A stated in-code invariant** (`lib/nina/album.ts:436-452`) recording a measured 2026-09-19 bug. Device-visible and accepted: every device holding the old cookie restarts Media on page 1. Nothing else is lost — it is a page number, not state. |
| D-4 | `rounded-full` (as the phase-2 brief sketched) or `rounded-pill` | **`rounded-pill`** — the planner's override, which is correct and verified | **Surrounding convention.** They render identically here (999 px and `calc(infinity * 1px)` both clamp to half a 30.8 px box), so it is purely vocabulary — and the vocabulary is settled: `rounded-pill` covers every round *control* in the app (88 occurrences across 44 files), while `rounded-full`'s surviving uses number exactly 11 and are all decorative 1-3 px dots. `rounded-field`, the token being replaced, is from the same four-step ladder, so the diff stays inside one vocabulary. |
| D-5 | Honour the 30 % number (30.8 px) or hold the app's 44 px iOS touch floor | **30.8 px, knowingly below the floor** | **The user's raw input** — asked for explicitly and with a number. The loss is recorded rather than silently taken, in three places so a later reader cannot "fix" it back: the `CELL` docstring, `components/ui/.workflows/package_readme.md`, and `docs/architecture.md` §8. What makes it survivable is that a mis-tap lands on a *neighbouring page number* — one tap to undo, nothing destructive, no state written. |
| D-6 | Which phase owns `docs/architecture.md` | **Phase 2 alone, this set** | **Set-level mechanics** — keeping the two file sets disjoint so the phases can run concurrently. Verified to cost nothing: §5 and §8 do not currently spell `/nina/about`'s Media page size, so phase 1 makes no line there stale. Phase 1 records its change in code docstrings and `components/nina/.workflows/package_readme.md` instead. |

## Open Questions

None. Every requirement id is owned (R1 → phase 1, R2 → phase 2), every impact point is owned, and
every fork above was decided on a named rung. Nothing in this set is irreversible: no migration, no
`db:migrate`, no backfill, no data write, no published history. The one device-visible side effect
(D-3's orphaned cookie) costs a remembered page number and is argued for in code.

## Rollback

- **Phase 1:** revert the commit. The only persisted artefact is a cookie *name*; the old
  `nina-about-mpage-99` cookie is still on devices and would simply be read again. No data written.
- **Phase 2:** revert the commit. Pure CSS class strings; nothing persisted.
- **Whole set:** `git branch -D feature/media-parity-compact-pager` and drop the worktree. Nothing
  in this plan writes to the database, mints a migration, or touches production state.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f MEDIA_PARITY_COMPACT_PAGER_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f MEDIA_PARITY_COMPACT_PAGER_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan MEDIA_PARITY_COMPACT_PAGER_PLAN.md
