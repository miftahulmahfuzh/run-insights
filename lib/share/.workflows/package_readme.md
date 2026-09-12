# Package: profile & share (four-directory estate)

**Location**: `lib/profile`, `components/profile`, `lib/share`, `components/share` — ONE readme for all four
**Last Updated**: 2026-09-12 (initial creation; every module in the estate read in full against the
tree at `6b5cd47`, every reverse dependency re-grepped this date, the estate totals below taken from
the same-day YAGNI audit they cite)
**Documentation Created**: 2026-09-12 (until this date none of the four directories had a
`.workflows/` at all — verified by the same-day `profile-share-yagni` audit before this file existed)

> **IF YOU CAME LOOKING FOR A PER-DIRECTORY README, THIS IS IT.** One file deliberately covers all
> four directories; update THIS file and do not create a sibling under `lib/profile/.workflows/`,
> `components/profile/.workflows/`, or `components/share/.workflows/`. The estate is small (17
> files, 2,506 lines at the 2026-09-12 audit) and the two feature pairs are read together by
> design — four per-directory readmes would be four half-empty files, and the rules that matter
> here (see *Estate invariants*) span the directories, so a rule documented four times would drift
> four ways. If a future split of this estate ever becomes real (a directory growing past ~10
> modules, or a third consumer of `lib/share` appearing outside these features), split the readme
> then — along the profile/share seam, not per directory.

## Overview

This estate is two feature pairs that share one discipline. **Profile** (`lib/profile` +
`components/profile`) is who the runner is: the skippable onboarding form, its `/me` edit twin, and
the badge shelf and personal-records table that reward history. **Share** (`lib/share` +
`components/share`) is what a stranger may see: the owner-side share panel, per-photo inclusion,
revocation with blob rotation, and the read-side projector behind `/s/[token]`.

They are documented together because their hard parts are the same kind of hard part: both are
built as a **pure decision core with a thin I/O rim** — `schema.ts`/`config.ts`/`copy.ts`/
`types.ts`/`project.ts` are importable by client components and testable in node, and only
`actions.ts`, `origin.ts`, `read.ts`, `rotateBlobs.ts` (plus the Server Actions in
`app/actions/share.ts`, which lives outside this estate) touch auth, env, database or Blob. And
both are governed by invariants written down once, in this file or in a module header, that no
single directory can enforce alone.

**Key responsibilities:**

- **Profile forms** — one validation surface, one `age → birth_year` conversion, three Server
  Actions (save onboarding, skip onboarding, update profile), every field optional (D11).
- **Badges & records UI** — the `/me` shelf and table, their two detail panels, and the URL-held
  panel selection that makes the phone's back gesture work.
- **Share decisions** — what the public page may publish, as one flag each with its argument
  attached (`config.ts`), and the projection that enforces those flags structurally.
- **Share owner UI** — the header share button (Web Share → clipboard → manual link ladder), the
  link state panel with R-38's revocation confirm, and per-photo inclusion with optimistic toggle.
- **Share mechanics** — link origin resolution, the memoised public read, the `%HRmax` computation
  from frozen values, and R-15's blob rotation on revoke.

## The estate's invariants

These are the rules that span directories. Each one is cheap to break locally and each has a
reason; the module headers carry the long forms.

1. **INVARIANT A — every write opens with `requireUserId()`** (`lib/profile/actions.ts`). The
   three profile actions never trust a `userId` argument; `upsertProfile` receives one the auth
   layer produced. No new write path may take a caller-supplied userId.
2. **INVARIANT B — the shared page renders from stored values only.** `/s/[token]` must never
   resolve HRmax at view time: `avgHrPctMax` divides two already-stored integers and has **no
   fallback formula** — missing half ⇒ `null`, never a guess. Mechanically,
   `lib/share/types.ts` imports `HrMaxSource` as `import type` so `lib/metrics/hrMax.ts` never
   enters the page's runtime graph; `tests/share.bundle.test.ts` asserts exactly that. Do not turn
   the type-only import into a value import.
3. **Two narrowings, two layers.** `getRunByShareToken` (query layer) refuses to select
   `user_id`, `note`, extraction internals — a security boundary, pinned by
   `tests/db.queries.shares.test.ts`. `toSharedRunView` (product layer) decides which of the
   returned fields the feature *publishes*, under which flag. Different questions, different
   reviewers; do not collapse them.
4. **Named fields, nothing spread.** Every object crossing to `/s/[token]`'s JSX is built key by
   key. `ownerName` and `id` disappear *structurally* in the projector, because an accidental
   `{...run}` into a client component ships the whole object in the RSC flight payload — rendered
   or not (F11 §3.7, §5).
5. **Hand-written view types, not `Pick`.** `SharedRunView` & co. are independent interfaces on
   purpose: a `Pick` keeps compiling while the object under it grows; a hand-edited interface
   makes a new field reaching the public page cost somebody a decision (`types.ts` header).
6. **Owner copy and public copy never meet.** `lib/share/copy.ts` speaks to the runner ("your
   screenshots", "Stop sharing"); `app/(public)/s/[token]/copy.ts` speaks to a stranger — and is
   never imported by this estate. One module holding both is how a "your" ends up in front of
   someone who is not you.
7. **Every user-visible string is a named constant.** The 22 constants in `copy.ts` were verified
   consumed on 2026-09-12 (same-day YAGNI audit); R-38's `REVOKE_BODY` is verbatim, by decision —
   do not soften it, do not move it into a tooltip. `SHARE_SHOWS_NOTE` and
   `SHARE_SHOWS_COACHING_ADVICE` are `false` with their arguments attached and are test-pinned
   (`tests/share.config.test.ts`); a future sweep that re-flags them should re-read `config.ts`'s
   header first.
8. **Catalog copy is rendered, never reworded.** `RECORD_LABELS` / `formatRecordValue` /
   `formatDay` / `lib/format.ts` are the only printers for record labels, values and dates, so
   `/me` and `/s/[token]` cannot disagree about what `10.67 km` looks like (R-23), and a panel
   that paraphrased a condition would be R-42's second source of truth for a threshold.
9. **Panel selection lives in the URL.** Badge and record panels resolve a *key* through
   `usePanelParam` (`?panel=badge.<key>` / `?panel=record.<key>`, one exclusive parameter), so the
   back gesture closes a panel, returning from `/r/<id>` restores it, and a hand-typed nonsense
   key resolves to "closed" for free. Components hold no `useState` for selection; the earn-date
   expander's flag rides the same machinery.
10. **R-15: rotate, don't proxy.** Revocation kills the page by token and kills old *image* links
    by moving every blob to a fresh pathname inside the store. No photo proxy route exists — D7's
    fixed route list stays fixed. What rotation cannot reach (a copy already saved) is said
    plainly in `REVOKE_BODY`, not papered over.
11. **Pure / server-only / pure-on-purpose.** Client components may import `copy.ts`, `config.ts`,
    `types.ts`, `project.ts`, `schema.ts` and nothing else from `lib/` in this estate.
    `origin.ts`, `read.ts`, `rotateBlobs.ts` open with `import 'server-only'` so a accidental
    client import fails the build. When adding a module, pick a side explicitly.
12. **Sanity, not coaching** (profile) — form validation validates shape only; advice belongs to
    the narrative layer. And its twin on the share side, **R-27**: coaching advice
    (`doNext[]`, `questionForRunner`) never reaches a stranger — enforced by *omission* in
    `readSharedInsight`, so no stored payload shape can leak it.

## Modules

### `lib/profile/schema.ts` — PURE (zod)

The form's validation surface and the single `age → birth_year` conversion point.

- `profileFormSchema` — all six fields optional; `''` from FormData becomes `undefined`
  (`blankToUndefined`), so a cleared field is a real submission, not a crash; weight rounds to one
  decimal (the column is `numeric(4,1)`); cross-field refine: `restingHr < maxHr`.
- `toProfileWrite(input, now?)` — form shape → column shape (`birthYear` replaces `age`); the
  `now` parameter keeps the conversion pure and testable. Nullable, not optional, throughout —
  clearing a field must clear the column; an omitted key would silently keep the old value.
- `ProfileFormValues` — what `/onboarding` and `/me` render back into the inputs.
- `ProfileFormState` + `IDLE_PROFILE_FORM_STATE` — the `useActionState` contract. Declared HERE,
  not in `actions.ts`, because a `'use server'` file may only export async functions.
- `fieldErrorsOf(error)` — flattens a ZodError to `{ field: firstMessage }` for `<Field error>`.
- `profileWriteSchema` — the write-shape re-validation. **Currently exercised by
  `tests/profile.schema.test.ts` alone** (production validates via `profileFormSchema` +
  `toProfileWrite`); flagged by the 2026-09-12 YAGNI audit — decide: wire it into production
  enforcement, or remove it together with its tests (see *Notes*).

### `lib/profile/actions.ts` — `'use server'`

- `saveOnboardingAction(prev, formData)` — upsert + `onboardedAt`; revalidates `/` and `/me`;
  redirects to `/`. `redirect()` sits outside any try/catch (it throws `NEXT_REDIRECT`).
- `skipOnboardingAction()` — writes ONLY `onboarded_at`. Deliberately leaves every other column
  untouched: revisiting `/onboarding` must not wipe data a stray tap never meant to clear.
- `updateProfileAction(prev, formData)` — same schema, no `onboarded_at` side effect, stays on the
  page and reports `{ status: 'saved' }` (an edit form that navigates away confirms nothing).

`onboarded_at` means "made a decision about onboarding", not "filled in every field" — set by both
a filled-in form and a skipped one; a later edit never touches it.

### `components/profile/`

- **`ProfileForm.tsx`** — one form, two modes (`onboarding` shows Skip, `edit` pre-fills and
  doesn't). Asks age, never birth year, and always shows the freshly derived value, so nothing
  goes stale. `SexField` is a `fieldset`/`legend` (a `Field` labels ONE input) of native radios
  styled as chips via `peer-checked:`; **nothing is preselected** — a default would be the app
  recording a decision nobody made. Skip is its own `<form>`, not a nested button: skipping must
  not carry typed values along, and nested forms are invalid HTML.
- **`BadgeShelf.tsx`** — the badge catalog as a LIST, not the design's grid (at 414 px a grid
  cannot carry condition + gloss; §10.2). 22 badges in catalog order as of 2026-09-12. Rows are
  `<button>`s wrapping `<span className="block">`s (a button takes phrasing content only). The
  patch is the one saturated object in the app — `art.twill` background, tokenised everything
  around it (R-36/R-43); the `×N` count pill sits OUTSIDE the patch's `overflow-hidden` box and is
  absent at a count of 1.
- **`BadgeDialog.tsx`** — a body, not a dialog: `DetailPanel` owns the `<dialog>` mechanics. Adds
  what the row has no room for: art at legible size, the count spelled out, and the F27
  disclosure — "Earned N times" is a `<button>` expander (not `<details>`) whose open flag lives
  in the URL. `EarnedDayList` is **exported for tests** (this repo has no jsdom;
  `tests/badges.render.test.ts` renders it directly — the F21 `commitStatusLine` precedent). An
  index key is justified there: derived, sorted-once data with no reorder. `count` can exceed
  `earnedDays.length` (pre-F13 aggregate rows); the gap renders as "N earlier, dates not recorded"
  — the panel never invents days.
- **`RecordsTable.tsx`** — one line per record, in `RECORD_CATALOG` order (11 keys as of
  2026-09-12); a key with no holder is ABSENT, not zero. Exports `RecordRowView`. Imports
  `EmptySlot` **by path, not through the `@/components/ui` barrel** — a `'use client'` module
  importing the barrel would put `SplitsTable`, `ZoneBar`, `TabBar` and `AppShell` on the client
  boundary for one 40-line empty state.
- **`RecordDialog.tsx`** — the second `DetailPanel` body. Four uniform lines (eyebrow, title,
  value, date-link, plus the always-present `previousValue` branch: "Beat X to get here." /
  "No earlier value recorded." — its absence read as a bug in round 2, and null does not mean
  "first": a deleted holding run legitimately erases history, `records.run_id` is
  `ON DELETE CASCADE`). No dim state and no unreachable branches here — that asymmetry with badges
  (`ON DELETE SET NULL`) is schema-derived, both sides documented.

### `lib/share/config.ts` — PURE ("pure on purpose")

Every visibility decision `/s/[token]` makes, one constant each with the paragraph that put it
there: `SHARE_SHOWS_LOCATION`, `SHARE_SHOWS_TIME_OF_DAY`, `SHARE_SHOWS_NOTE`,
`SHARE_SHOWS_COACHING_ADVICE` — all `false` in the shipped default, each for its own written
reason (note is the deliberate OPPOSITE of expense-tracking's F09, coaching advice merges
`doNext[]` + `questionForRunner` under one flag on purpose). Plus the static `SHARE_OG_IMAGE*`
trio — **no per-run `opengraph-image.tsx`**: a meta-scraper CDN caches the preview beyond
revocation's reach, so every link gets one branded thumbnail, forever. And `SHARE_PHOTO_WARNING`,
shown once above the per-photo list because the risk is per-photo.

### `lib/share/copy.ts` — PURE

All owner-side strings (title/link states/copy link/revoke ladder/per-photo inclusion).
`PHOTO_ZOOM_HINT` is also rendered by `SheetSource` in `components/review/ScreenshotStrip.tsx`
(since 2026-09-12, commit `6b5cd47`) — the two tap-to-zoom surfaces share the constant, so the
identical wording is a construction, not a sync discipline. That import makes `components/review`
a consumer of this estate's copy module; nothing else outside the four directories imports
`components/share` or `components/profile` (measured 2026-09-12).

### `lib/share/origin.ts` — server-only

`shareOrigin()`: `AUTH_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `http://localhost:$PORT`. Never
`window.location.origin` (dies with the tab) and never `VERCEL_URL` (dies with the deployment) —
a share link outlives both. `shareUrl(token)` is the one place a token becomes a URL. Consumers
that cannot import `server-only` code (admin page's client tree) receive the value as a prop,
computed server-side — see the SEAM note in `app/admin/nina/page.tsx`.

### `lib/share/read.ts` — server-only

`readSharedRun = cache(async token => …)` — the public page's ONE read, memoised per request
because `generateMetadata` and the page body each call it. The `cache()` wrap deliberately lives
here and not on `getRunByShareToken`: the raw query must stay callable from the cron handler, the
extraction job and Vitest, and `scripts/check-data-layer-invariants.mjs` asserts on `queries.ts`'s
export shape. A syntactically impossible token 404s before the database; a revoked token and a
never-existing token resolve to the identical `null` (anti-oracle, §3.2, falls out of the query's
`WHERE … AND revoked_at IS NULL`).

### `lib/share/project.ts` — PURE

`SharedRun` → `SharedRunView`, the second narrowing (see invariant 3). `avgHrPctMax(avgHr,
hrMaxUsed)` — the whole of the feature's INVARIANT B compliance; frozen denominator
(`insights.payload.hrMaxUsed`, R-11) so a months-old page cannot silently contradict its own
prose; `null` when either half is missing. Exported but production-used only intra-module —
`tests/share.project.test.ts` also imports it; flagged by the 2026-09-12 YAGNI audit as a
keep-or-privatise decision, not dead code. `readSharedInsight` applies R-27 by omission and is
deliberately tolerant of old payload shapes; nothing readable ⇒ no analysis section, except a
frozen `hrMaxUsed` alone still renders (a %HRmax with no prose is legitimate content).

### `lib/share/types.ts` — PURE

`SharedPhotoView`, `SharedInsightView`, `SharedSplitView`, `SharedZoneView`, `SharedRunView` —
the flight-payload contract. `intent`'s absence is documented ON THE FIELD (F03 beat F11 §5's
include table; a tested exclusion in the app's one unscoped read wins over a nice-to-have in a
plan table). `HrMaxSource` is a type-only import (invariant 2).

### `lib/share/rotateBlobs.ts` — server-only

`rotateRunPhotoBlobs(userId, photos)` → `{ rotated, failed }`. R-15. `@vercel/blob`'s `rename`
(copy-then-delete inside the store: no egress through the function; "copy fails ⇒ source
untouched" is exactly the wanted failure mode). **Sequential, not `Promise.all`** — max three
photos, and a rate-limited store must leave a clean rotated prefix plus a reported tail, not three
simultaneous half-moves. On blob-moved-but-row-write-failed it renames BACK to the old pathname
(`addRandomSuffix: false` — a random suffix here would "restore" bytes to a third URL nothing
knows about) and reports the id in `failed`; the caller turns a non-empty `failed` into
`REVOKE_PARTIAL` ("try Stop sharing again"), never silence, never a rolled-back revoke.

### `components/share/`

- **`ShareButton.tsx`** — the `/r/[id]` header glyph. The hard problem is Safari's transient
  activation: `navigator.share()` must be reached inside the gesture, so the token mint is WARMED
  on `pointerdown`/`onFocus` (safe: `createShareLinkAction` is idempotent — no second link, no
  unasked link). Ladder: Web Share → clipboard → selectable read-only `ManualLink`; `AbortError`
  (sheet dismissed) is a person changing their mind and produces SILENCE. The tick is
  `SHARE_COPIED` for `COPIED_HOLD_MS` (2 s), backed by an `sr-only` live region — deleting either
  silently un-fixes the copy path. It is a glyph, not the word "Share" (card #108), which is why
  the tick exists at all.
- **`ShareLinkPanel.tsx`** — the state panel ("what have I already published?"), a different
  question from the button's "send this"; they share no client state — the mint's
  `revalidatePath('/r/<id>')` re-renders this panel from the server. The revoke confirm is inline,
  not a modal: the consequence must be readable in the same glance as the button that causes it.
  R-38's copy verbatim (invariant 7). `readOnly` + select-on-focus inputs everywhere a URL is
  shown (a disabled input cannot be selected, defeating its whole purpose).
- **`PhotoInclusionList.tsx`** — per-photo opt-out (§3.3.2), default all included, optimistic
  flip with REAL rollback (`PHOTO_TOGGLE_FAILED` on failure — a control that lies about a privacy
  setting is worse than one that is slow). Two targets per row (card #8): left opens the viewer,
  right 72 px toggles — the old all-wrapping `<label>` had to go because HTML forbids a `<button>`
  inside a `<label>`. The viewer's list is EVERY row, excluded ones too: every row is listed, so
  every row is reachable.

## Dependencies

### Internal (why each)

- `lib/db/queries` — `upsertProfile` (profile actions), `getRunByShareToken`,
  `updatePhotoBlobLocation` (rotation). All take the INVARIANT-A userId.
- `lib/db/schema` — `SEX_VALUES`/`Sex`: the form's domain IS the column's domain (one tuple, two
  consumers — they cannot drift).
- `lib/metrics/age` — `birthYearFromAge`, the other half of the age↔birthYear pair.
- `lib/metrics/hrMax` — type-only (`HrMaxSource`); must stay type-only (invariant 2).
- `lib/auth/requireUserId`, `lib/env` (`authEnv`, `blobEnv`), `lib/id` (`newId` for rotated
  pathnames), `lib/extract/constants` (`SHOT_PREFIX`, `UPLOAD_CONTENT_TYPE`,
  `BLOB_CACHE_MAX_AGE`, `SCREEN_KIND_LABEL`), `lib/badges/*` + `lib/records/*` (art decks,
  catalogs, labels, `buildShelf` stays server-side), `lib/panel/param`, `lib/panel` UI
  (`DetailPanel`, `usePanelParam`), `components/ui` (by path where the barrel would widen the
  client boundary), `lib/format`, `lib/cn`.

### External

- `zod` — the entire profile validation surface (schema-level, not ad-hoc).
- `@vercel/blob` — `rename` only; its documented copy-fails⇒source-intact behaviour is load-bearing
  for R-15's failure ladder.
- `react` — `cache` (request-scope memoisation in `read.ts`), `useActionState`, client state.

## Reverse dependencies (measured 2026-09-12, grep across the repo)

| Consumer | Imports | Use |
|---|---|---|
| `app/me/page.tsx` | `lib/profile` (schema, actions), `components/profile` | renders the `/me` forms, shelf, records |
| `app/onboarding/page.tsx` | `lib/profile`, `components/profile` | onboarding mode of the same form |
| `app/r/[id]/page.tsx` | `components/share` (all three), `shareUrl` | builds the initial URL server-side, renders owner share UI |
| `app/(public)/s/[token]/page.tsx` | `readSharedRun`, `SHARE_OG_IMAGE*`, `SharedPhotoView` | the public page; its own copy module, deliberately |
| `app/actions/share.ts` | `shareUrl`, `rotateRunPhotoBlobs` | mint / revoke / toggle Server Actions (outside this estate) |
| `app/robots.ts`, `app/admin/nina/page.tsx` | `shareOrigin` | canonical origin for sitemap-adjacent URLs; admin passes it down as a prop |
| `components/review/ScreenshotStrip.tsx` | `PHOTO_ZOOM_HINT` | `SheetSource`'s zoom hint (since 2026-09-12) |
| `tests/` | `profile.schema`, `share.project`, `share.config`, `badges.render` | the four suites importing estate modules DIRECTLY (grep 2026-09-12); `share.actions`, `share.rotate`, `share.bundle`, `db.queries.shares` exercise the estate through its collaborators |

`components/share` has exactly one page-level consumer (`app/r/[id]`); `components/profile` has
exactly two (`/me`, `/onboarding`). These are feature components, not a kit; do not add a second
consumer without asking whether it belongs in `components/ui` instead.

## Concurrency

No locks, no shared mutable state. The interesting points: `readSharedRun` is memoised per
REQUEST (`cache()`), not globally — two strangers sharing a token get independent memoisations.
`rotateRunPhotoBlobs` is deliberately sequential (see module notes). Client components hold only
per-mount state; the URL is the shared state between server renders and panels. Server Actions
guard double-submission with `pending`/`loading` props, and the share mint is idempotent at the
action layer, which is what makes `ShareButton`'s pointerdown warming safe.

## Error handling

- **Forms**: `ProfileFormState` discriminates `idle`/`saved`/`error`; Zod issues flatten to
  per-field messages via `fieldErrorsOf`; one top-level `role="alert"` message.
- **Photo toggle**: optimistic write, rollback + `PHOTO_TOGGLE_FAILED` on failure.
- **Share button**: every failure has a next rung (share → clipboard → manual field); the ONLY
  silent path is the user's own `AbortError`.
- **Revoke**: `REVOKE_FAILED` (link still live — do not claim otherwise),
  `REVOKE_PARTIAL` (link dead, some old image links live, retry offered), `REVOKE_DONE`. The link
  is never un-killed to make the report cleaner.
- **Rotation**: per-photo try/catch with a compensating restore (see module notes); failures are
  reported, never thrown past the action boundary.
- **Public page**: `readSharedInsight` never throws on old payload shapes; absent ≠ crash.

## Performance

Nothing hot. The deliberate calls: rotation renames inside the store (no byte egress);
`read.ts`'s `cache()` halves Neon round trips per pageview AND per link-preview scrape; badge art
is pre-sized, content-hashed, `unoptimized`, `loading="lazy"` (22 images, only a few above the
fold); share thumbnails are `<img>` with an eslint waiver each — already compressed to ~55 KB at
upload (F04 §3), so `next/image` would re-optimise on a paid quota for nothing; the OG image is
one static file.

## Gotchas

- `''` is a meaningful FormData value: `blankToUndefined` exists because `z.coerce.number()('')`
  is `0`, which would silently store a zero resting heart rate.
- A cleared profile field must reach the column as `null` (`toProfileWrite`'s nullables) — an
  omitted key keeps the old value.
- `redirect()` after `revalidatePath()`, outside try/catch, in the onboarding action.
- The client-boundary cost of `@/components/ui`'s barrel — import by path in client components
  that need one small thing (`RecordsTable.tsx` header).
- `<button>` takes phrasing content only — `<span className="block">`, never `<p>` inside rows.
- `<label>` may not wrap a `<button>` — the reason `PhotoInclusionList`'s row has two targets.
- `PanelArt.twill` is handed over even when the art fills the band: it is the colour behind a slow
  decode.
- Badge `count` can exceed the number of listed days (pre-F13 aggregates) — render the gap as
  words, never invent dates.
- `usePanelParam` selection is a KEY resolved against current props, never a held object — props
  are replaced wholesale on navigation.

## Notes

Known decisions a future sweep should not re-flag (full arguments in
`docs/token_maxxing/2026-09-12-profile-share-yagni.md`, whose per-file export table is the
starting point for any future dead-code pass here):

- `SHARE_SHOWS_NOTE` / `SHARE_SHOWS_COACHING_ADVICE` — test-pinned decision documentation
  (`config.ts` header). Staying.
- `avgHrPctMax` exported, production-used only intra-module — exported-for-testability pattern;
  keep or privatise consciously, never silently.
- `profileWriteSchema` — test-only in production terms; decide (wire it in, or remove schema +
  tests together).
- `ShareButton`/`ShareLinkPanel` render a near-identical select-on-focus link input — the ONE
  duplication the 2026-09-12 audit found in the estate; consolidation candidate (a shared
  "copy link" field), not dead code.

Estate history: YAGNI-audited 2026-09-12 (`profile-share-yagni`: 7 speculative type exports
removed, 68 → 61 export sites measured at the audit, zero dead files/helpers/branches found);
citation repairs in `copy.ts` the same day (`ui-share-polish`, which also deferred and thereby
named this readme's companion fix — the `PHOTO_ZOOM_HINT` import, landed as `6b5cd47`).
