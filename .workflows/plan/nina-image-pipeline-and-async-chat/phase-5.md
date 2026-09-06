# Phase 5: The tracking section on `/nina/about`, below Media

**Plan set:** `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md`
**Analysis:** `20260906-204533-IMG9_code_analyzer.md`
**Satisfies:** R3 — *"put this image generation tracking section below media section (after user click nina profpic)"*
**Depends on:** Phase 4
**Difficulty:** EASY
**Package:** `components/nina`

---

## RECONCILED AGAINST PHASE 4'S REAL CONTRACT

This plan was written while `.workflows/plan/nina-image-pipeline-and-async-chat/phase-4.md` did not
yet exist, so it guessed phase 4's exported names from the analysis's impact-point table and carried
a fallback for each way phase 4 might differ. **Phase 4 has since been read and every fallback is
now resolved.** Four of the six guesses were wrong, and the corrections are applied throughout this
file — this section records them so a reviewer can see what moved and why.

| What this plan assumed | What phase 4 actually ships | Applied |
|---|---|---|
| `components/nina/JobList.tsx`, export `JobList` | **`components/nina/NinaJobList.tsx`, export `NinaJobList`** | Steps 2, 3 |
| prop `jobs: readonly T[]` | **prop `items: readonly NinaJobListItem[]`** | Steps 2, 3 |
| "every other prop is optional" | **`nowMs` and `emptyText` are both REQUIRED**; `className` optional | Steps 1, 3 |
| rows carry `Date` values across the boundary | **`NinaJobListItem.createdAtMs` is a NUMBER**; `NinaImageJobRecord.createdAt` is a `Date`, and a server-side mapper `toNinaJobListItems` converts | Step 1 |
| the list might be a Server Component (fallback: a `children` slot) | **it is `'use client'`** — phase 4's D3 makes this the single most important contract in that phase, precisely so this screen can render it | fallback deleted |
| `listNinaImageJobs(userId, { limit })`, owner-scoped, newest first, no sweep | **exactly that** — phase 4's D1 argues the non-sweeping read at length, for the same reason this plan wanted one | Step 1, unchanged |

Two consequences worth stating plainly, because they are more than renames:

1. **The mapping happens on the server.** `app/nina/about/page.tsx` calls
   `toNinaJobListItems(jobs)` and passes `Date.now()` as `jobsNowMs`. It cannot happen in
   `NinaAboutScreen`, which is a Client Component that never sees a `Date`.
2. **`NinaJobList` renders its own empty state**, worded by the caller through `emptyText`. This
   plan's D-2 originally wrote a second empty renderer; that is now deleted. See the rewritten D-2.

The fallback that mattered most — *"if phase 4's list is a Server Component, this is a real code
change, flag it to me"* — did not fire. Phase 4 made it a client component deliberately, citing
this screen.

## Goal

`/nina/about` — the page reached by tapping Nina's profile picture — grows a third section,
directly below Media, that shows her most recent image-generation jobs and their stage. Each row is
a link into `/nina/jobs/[id]`, and a "Semua" link in the section header goes to the full
`/nina/jobs` list. The section reuses phase 4's list component and phase 4's read verbatim: no
second query, no second row renderer, no new state, and no change to the `?photo=` codec, the
two-section swipe isolation or the `pushState`/`replaceState` discipline this screen already owns.

## Interface Contract

**Deletes:** none
**Renames:** none

**Creates:**

- `NinaAboutScreen`'s two new required props `jobs` and `jobsNowMs`
  (`components/nina/NinaAboutScreen.tsx`)
- module-local `const ABOUT_JOB_LIMIT = 5` (`app/nina/about/page.tsx`) — not exported

**Signature changes:**

- `NinaAboutScreen({ avatar, album, gallery })` ->
  `NinaAboutScreen({ avatar, album, gallery, jobs, jobsNowMs })`.
  `app/nina/about/page.tsx` is its **only** call site (verified: `grep -rn NinaAboutScreen app components lib tests`
  finds one import and one JSX use, both in that file, plus three prose mentions in comments/plans).

**Requires (from earlier phases):** `NinaJobList`, `NinaJobListItem` + `toNinaJobListItems` +
`NINA_JOBS_HREF`, and `listNinaImageJobs` — all from Phase 4. See §What this phase imports from
Phase 4 for the exact shapes, which have been checked against phase 4's Interface Contract.

**Leaves alone (owned by others):**

- `app/nina/jobs/*` — Phase 4
- `components/nina/NinaJobList.tsx`, `NinaJobDetail.tsx`, `NinaJobElapsed.tsx` — Phase 4
  (`NinaJobList` is imported, never edited; the other two are never touched)
- `lib/nina/jobview.ts` — Phase 4 (imported, never edited)
- `components/nina/NinaSidebar.tsx` — Phase 4
- `lib/nina/imagejobs.ts` — Phase 4 owns the projection and every read in it
- `components/nina/ChatScreen.tsx` — Phases 3, 4
- `lib/nina/actions.ts` and `lib/nina/albumActions.ts` — Phase 3
- `lib/nina/album.ts` — untouched by this phase, deliberately; see D-3
- `lib/nina/queries.ts`, `drizzle/*` — Phase 6
- `scripts/nina-image-worker.ts`, `lib/nina/imagerecipe.ts`, `lib/nina/imagecall.ts`,
  `lib/nina/imagerun.ts` — Phases 1, 2

  (`lib/nina/imagedispatch.ts` was on this list; phase 2 deletes it.)
- `tests/integration/*`, `tests/live/*` — Phase 7

**One thing that reaches into this phase's file from Phase 3, checked so it does not surprise
anyone.** Phase 3 deletes `NinaAttachResult.unavailable` and reshapes `attachNinaPhotoToChat`'s
result to `{ ok, userMessageId }`. `components/nina/NinaAboutScreen.tsx` **is** a caller of that
action (`:185`), which made it the one place this phase could have broken through no fault of its
own. **It does not break: verified by reading the call site — it destructures nothing and reads
`result.ok` and nothing else (`:190`, `if (!result.ok)`). No edit is needed here, and phase 3's
claim that "phase 5's file is not touched" is correct.**

## What this phase imports from Phase 4

Exactly **three** symbols, and all three are confirmed against phase 4's Interface Contract.

### From `components/nina/NinaJobList.tsx`

```tsx
'use client'
export function NinaJobList(props: {
  items: readonly NinaJobListItem[]   // REQUIRED. Already ordered newest-first; never re-sorted.
  nowMs: number                       // REQUIRED. The server's clock at render.
  emptyText: string                   // REQUIRED. What absence says on THIS surface.
  className?: string
}): React.ReactElement
```

- **`'use client'`, and phase 4 chose that because of this screen.** `NinaAboutScreen` is a Client
  Component (it holds the photo viewer's state and calls `useRouter`), and Next 16.3.1 forbids
  importing a Server Component into one. Phase 4's D3 calls this "the single most important
  contract in this phase" and names `/nina/about` as the reason. There is no slot workaround to
  build.
- **`nowMs` is required and must be the SERVER's clock**, read once per render. Phase 4's
  `NinaJobElapsed` takes it as a prop specifically so the first client render agrees with the server
  render; reading `Date.now()` in the browser instead is a hydration mismatch on a component whose
  entire content is a number.
- **Rows are `<Link href={item.href}>`**, and `item.href` is `ninaJobHref(id)` = `/nina/jobs/<id>`.
  So R3's "each row links into `/nina/jobs/[id]`" is satisfied by reuse, with no second row renderer
  and no `router.push` callback.
- **The component renders the empty case itself**, using `emptyText`. See D-2.

### From `lib/nina/jobview.ts` (a pure module — no `server-only`, safe in a client component)

```ts
export function toNinaJobListItems(rows: readonly JobLike[]): NinaJobListItem[]
export const NINA_JOBS_HREF = '/nina/jobs'
export interface NinaJobListItem { id; href; stage; stageLabel; purpose; scene; attempts;
                                   createdAtMs: number; errorLabel; latencyMs; open }
```

`toNinaJobListItems` is **not optional plumbing**: `NinaImageJobRecord.createdAt` is a `Date` and
`NinaJobListItem.createdAtMs` is a number, and the conversion is the whole reason the function
exists. It must be called on the **server**, in `app/nina/about/page.tsx`. `NINA_JOBS_HREF` is
imported so the "Semua" link and the sidebar entry cannot disagree about the path.

### From `lib/nina/imagejobs.ts`

```ts
export async function listNinaImageJobs(
  userId: string, opts?: { limit?: number },
): Promise<NinaImageJobRecord[]>
```

Owner-scoped with `userId` first (invariant 5); **every** job rather than only the open ones, newest
first (`ORDER BY created_at DESC`) with a real `LIMIT`; and — the property this plan needed most —
**it does not sweep.** Phase 4's D1 reaches that conclusion independently and for the same reason
this plan wanted it: `listOpenNinaImageJobs` calls `sweepStaleNinaImageJobs` for its side effect and
`app/nina/page.tsx` awaits it for exactly that, but a page reached by tapping her face must not
write terminal UPDATEs and an apology message. Both surfaces get the pure read; `/nina` keeps its
guarantee. The Step 1 docstring's "three indexed reads and nothing else" claim therefore stands as
written.

## Files

| File | Action | What changes |
|---|---|---|
| `app/nina/about/page.tsx` | modify | third read added to the existing `Promise.all` (`:31`); `ABOUT_JOB_LIMIT` added; `jobs` passed to `NinaAboutScreen` (`:40`); the "two indexed reads" docstring paragraph (`:10-14`) rewritten to say three |
| `components/nina/NinaAboutScreen.tsx` | modify | `Link` + `NinaJobList` + `NinaJobListItem` imports; the `jobs` / `jobsNowMs` props (`:70-78`); `mb-7` added to the Media `<section>` and the new tracking `<section>` inserted directly after it (`:233-244`) |

Two files, and the reconciled index now says two. The draft index budgeted three; the third would
have been a constant in `lib/nina/album.ts`, and D-3 explains why it is not taken.

## Decisions

**D-1 — The section shows 5 jobs and links out to `/nina/jobs` for the rest.**
`/nina/jobs` is the full list; this is a summary on a page that already performs three reads and
whose whole aesthetic is "one paint, no skeleton". Five is one screen-third on a phone below a
three-column grid, and at `NINA_IMAGE_DAILY_CAP = 6` it is *today and a bit* — which is the window
a runner who just asked for a photo is actually looking at. Ten would push the album and Media off
the first scroll on the page whose subject is the album and Media.

**D-2 — The section always renders; the empty sentence is this screen's words, but `NinaJobList`
is what draws it. RECONCILED.**

Three parts, and the third changed during reconciliation.

*It renders on empty rather than disappearing.* Media, twelve lines above, renders its `<h2>` plus a
plain sentence when `gallery.length === 0` (`components/nina/NinaAboutScreen.tsx:237-240`), so
hiding this section on empty would make two adjacent sections behave differently for the same
reason. It also matters more here than usual: R2's premise is that **no photo has ever been
generated through chat**, and `nina_message_images` has zero rows ever. Until phases 1–2 land, the
empty state *is* the render. It must explain, not vanish.

*It is not `components/ui/EmptyState.tsx`.* That component is *"a dashed outline… the outline of a
card that has nothing in it yet"*, and `/nina/about` has no cards at all. The app-wide `EmptyState`
convention is a convention **about card surfaces**; this screen is not one, which is why Media did
not reach for it either. Nothing here uses it.

*But this phase does NOT write its own empty renderer, and the draft did.* The draft branched on
`jobs.length === 0` and rendered a bespoke `<p>`, which would have been a second empty state for
job rows — the same drift the "no second row renderer" rule exists to prevent, one element down.
Phase 4's `NinaJobList` already renders the empty case, and its docstring assigns the *words* to
the caller in as many words: *"absence is one sentence, worded by the CALLER: `/nina/jobs` says
something different from a section under Media, and a component that hard-coded either would be a
component phase 5 has to fork."* That is exactly this division of labour. So: render
`<NinaJobList>` unconditionally, pass this screen's own `emptyText`, and delete the branch. One
renderer, two sentences.

The visible cost is that phase 4's empty markup is a dashed frame rather than Media's bare
sentence, which is a shade more structure than the sibling section has. `className` is available if
that reads badly on the device; changing phase 4's component is not, because `/nina/jobs` is a card
screen where the frame is right.

**D-3 — `ABOUT_JOB_LIMIT` is module-local to `app/nina/about/page.tsx`, not a constant in
`lib/nina/album.ts`.**
`NINA_GALLERY_LIMIT` lives in `album.ts` because it is a shared *fact* — its docstring ties it to
`CHAT_HISTORY_LIMIT` so the gallery and the chat describe the same conversation. This number has no
second reader and no such coupling; it is one route's render budget. Putting it in `album.ts` would
also pull a job concept into a file whose header states it is *"her album and the conversation's
photographs"* and whose purity argument is about view models. One caller, one constant, one file —
and one fewer shared file for a concurrent phase to collide with.

**D-4 — The section header carries a "Semua" link to `/nina/jobs`, shown only when there is at
least one job.**
It is the navigational answer to "and the rest?", and it is the only thing on this page that
reaches phase 4's full list from here without going through the sidebar. It is **not** a
"more exist" indicator: knowing whether more exist would need a count query or a `limit + 1` probe,
and the page docstring's whole boast is about how few reads it does. Hidden on empty because
`/nina/jobs` is empty too, and a link into a blank page is worse than no link.

**D-5 — Nothing in this phase touches the `?photo=` machinery.**
The new section renders no photographs, opens no viewer, and adds no `Section` value. `encodePhoto`
/ `decodePhoto`, `open`, `pushedRef`, `urlWithPhoto`, `openAt`, `onIndex`, `close` and `attach` are
all unmodified — the diff does not enter the region between `:45` and `:205`. In particular the
`Section` union stays `'album' | 'chat'`, so the two-section swipe isolation and `stepIndex`'s wrap
are structurally unable to change.

## Implementation Steps

### Step 1: The third read on `/nina/about`

**File:** `app/nina/about/page.tsx` (whole file, 47 lines -> ~78)
**Change:** add `listNinaImageJobs` to the existing two-member `Promise.all` at `:31`, add
`ABOUT_JOB_LIMIT`, **map the rows to `NinaJobListItem`s on the server with
`toNinaJobListItems`**, pass `jobs` and `jobsNowMs` to `NinaAboutScreen` at `:40`, and rewrite the
docstring paragraph at `:10-14` that claims two reads. The `loading.tsx` paragraph (`:16-20`) and the current-photo
paragraph (`:22-26`) are unchanged and are reproduced verbatim below.

**Code:** complete replacement file.

```tsx
import { AppShell } from '@/components/ui/AppShell'
import { NinaAboutScreen } from '@/components/nina/NinaAboutScreen'
import { requireUserId } from '@/lib/auth/requireUserId'
import { albumPhotos, galleryPhotos, NINA_GALLERY_LIMIT, ninaAvatarView } from '@/lib/nina/album'
import { listNinaImageJobs } from '@/lib/nina/imagejobs'
import { toNinaJobListItems } from '@/lib/nina/jobview'
import { listNinaAvatars, listNinaMessageImages } from '@/lib/nina/queries'

/**
 * `/nina/about` — her detail page (R17), reached by tapping her avatar in the chat header.
 *
 * ── THREE INDEXED READS AND NOTHING ELSE ──────────────────────────────────────────────────────
 * It was two until R3 put the image-generation tracking section below Media, and the claim it
 * replaces is the one worth keeping intact: every read here is an index lookup, none of them
 * joins, and none of them writes.
 *
 * `listNinaAvatars` reads `nina_avatars_user_created_idx`; `listNinaMessageImages` reads
 * `nina_message_images_user_created_idx` with no join, which is phase 1's stated reason for that
 * table existing rather than a `jsonb` column; `listNinaImageJobs` reads `nina_turns` scoped to
 * `(user_id, kind = 'image')` and bounded by `ABOUT_JOB_LIMIT`. No model call, so invariant 4 is
 * satisfied structurally: there is nothing here for the payload-boundary grep to object to.
 *
 * **The job read is deliberately the non-sweeping one.** `listOpenNinaImageJobs` sweeps stale jobs
 * before it answers, and `app/nina/page.tsx` awaits it for exactly that side effect — but a page
 * reached by tapping her face is not a place to write terminal UPDATEs and an apology message. The
 * sweep already runs on every `/nina` render and on the backstop schedule; this page only looks.
 *
 * ── WHY THERE IS NO `loading.tsx`, HERE OR AT `app/nina/` ─────────────────────────────────────
 * D-4. One at `app/nina/` would wrap this route too, which is the specific thing phase 4 declined
 * to impose on a page it did not own; and this page's index lookups resolve inside one paint, so a
 * skeleton would flash and be replaced. `app/(app)/loading.tsx`'s docstring records the measured
 * cost of getting that wrong in the other direction.
 *
 * ── THE CURRENT PHOTO IS TAKEN FROM THE ALBUM, NOT RE-QUERIED ─────────────────────────────────
 * `listNinaAvatars` already returns the row with `is_current`, so calling `getCurrentNinaAvatar`
 * here as well would be a second round trip for a row we are holding. `ninaAvatarView(null)` is
 * what an empty album means (D-2) and it is the same function the chat header uses, so the two
 * surfaces cannot disagree about which face is hers.
 */

/**
 * How many image jobs the tracking section shows before deferring to `/nina/jobs`.
 *
 * **A summary, not the list.** `/nina/jobs` is the full history with its stages, elapsed times and
 * errors; this is the head of it on a page whose subject is her album. Five is one screen-third
 * under a three-column grid, and at `NINA_IMAGE_DAILY_CAP`'s six a day it is today and a little of
 * yesterday — the window a runner who just asked for a photo is actually looking at.
 *
 * Module-local on purpose. `NINA_GALLERY_LIMIT` lives in `lib/nina/album.ts` because it is tied by
 * its own docstring to `CHAT_HISTORY_LIMIT`, so that the gallery and the chat describe the same
 * conversation. This number has no second reader and no such coupling: it is one route's render
 * budget, and a constant with one caller belongs beside that caller.
 */
const ABOUT_JOB_LIMIT = 5

export default async function NinaAboutPage() {
  const userId = await requireUserId()

  const [avatars, images, jobs] = await Promise.all([
    listNinaAvatars(userId),
    listNinaMessageImages(userId, { limit: NINA_GALLERY_LIMIT }),
    listNinaImageJobs(userId, { limit: ABOUT_JOB_LIMIT }),
  ])

  const current = avatars.find((row) => row.isCurrent) ?? null

  return (
    <AppShell>
      {/*
        **The mapping happens HERE, on the server, and it is not plumbing.**
        `NinaImageJobRecord.createdAt` is a `Date`; `NinaJobListItem.createdAtMs` is a number.
        `NinaAboutScreen` is a Client Component and never sees a `Date`, so `toNinaJobListItems` is
        what makes the rows crossable — and calling phase 4's mapper rather than writing a second
        one is what keeps this section and `/nina/jobs` from ever naming the same stage two ways.

        `jobsNowMs` is ONE reading of the clock for this render, shared by every ticking row, so two
        rows a millisecond apart cannot show two different elapsed times for jobs opened in the same
        second. It is the SERVER's clock on purpose: phase 4's `NinaJobElapsed` uses it for its
        first render on both sides of the boundary, and reading `Date.now()` in the browser instead
        is a hydration mismatch on a component whose whole content is a number. The same move
        `app/nina/page.tsx` makes with `todayInJakarta()`.
      */}
      <NinaAboutScreen
        avatar={ninaAvatarView(current)}
        album={albumPhotos(avatars)}
        gallery={galleryPhotos(images)}
        jobs={toNinaJobListItems(jobs)}
        jobsNowMs={Date.now()}
      />
    </AppShell>
  )
}
```

**Impact:** one extra concurrent index lookup on a page that already ran two. No new module in the
route's server graph beyond `lib/nina/imagejobs.ts`, which is `import 'server-only'` and stays
server-side — the client-secret guard has nothing to object to, because nothing new crosses into a
component except the returned rows. `NinaAboutScreen` gains a required prop and this file is its
only call site, so the tree typechecks in one edit pair.

*No fallback applies: phase 4's `listNinaImageJobs` takes the optional `limit` this plan wanted,
is owner-scoped, is newest-first, and does not sweep. The `{ limit: ABOUT_JOB_LIMIT }` form above
is the one that ships.*

### Step 2: The prop and the imports on `NinaAboutScreen`

**File:** `components/nina/NinaAboutScreen.tsx:1-16` (imports) and `:70-78` (signature)
**Change:** import `Link`, `NinaJobList` and the `NinaJobListItem` type; add `jobs` and `jobsNowMs`
to the destructure and the props type.

> **The `React.ComponentProps<typeof JobList>['jobs']` trick from the draft is gone.** It was
> designed to import exactly one phase-4 symbol, and it fails twice against the real contract: the
> prop is `items`, not `jobs`, and the element type is `NinaJobListItem`, which is exported from
> `lib/nina/jobview.ts` — a **pure** module with no `server-only` pill, imported by three of phase
> 4's own client components. Importing the type directly is simpler, is what phase 4 expects, and
> costs nothing this screen was protecting: `jobview.ts` has no edge to the database, which is the
> property that made the indirection worth having in the first place.

**Code:** the import block — complete replacement of lines 1-16.

```tsx
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/Button'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import { NinaJobList } from './NinaJobList'
import { NinaPhotoGrid, type NinaGridCell } from './NinaPhotoGrid'
import { NinaAvatar } from './NinaAvatar'
import { attachNinaPhotoToChat } from '@/lib/nina/albumActions'
import {
  NINA_ATTACH_MAX_CHARS,
  type NinaAlbumPhoto,
  type NinaAvatarView,
  type NinaGalleryPhoto,
} from '@/lib/nina/album'
import { NINA_JOBS_HREF, type NinaJobListItem } from '@/lib/nina/jobview'
```

**Code:** the component signature — complete replacement of lines 70-78. No local type is
declared: `NinaJobListItem` is phase 4's, imported above.

```tsx
export function NinaAboutScreen({
  avatar,
  album,
  gallery,
  jobs,
  jobsNowMs,
}: {
  avatar: NinaAvatarView
  album: readonly NinaAlbumPhoto[]
  gallery: readonly NinaGalleryPhoto[]
  /**
   * **R3's rows, in phase 4's own shape and never in this screen's words.**
   *
   * This section is a summary of `/nina/jobs`, so the one thing it must never do is describe a job
   * row for itself — that is how two surfaces start disagreeing about what `dispatched` looks like,
   * and the one the runner sees is whichever page he happened to open. `NinaJobListItem` is
   * `lib/nina/jobview.ts`'s, already mapped by `toNinaJobListItems` on the server (its
   * `createdAtMs` is a number precisely so it can cross this boundary), and when phase 4 widens the
   * projection again nothing here changes.
   */
  jobs: readonly NinaJobListItem[]
  /** The server's clock at render, for the elapsed tickers. See the page. */
  jobsNowMs: number
}) {
```

**Impact:** both props are required, not optional — an optional prop would let a future caller
render the page with the section silently missing, which is the failure R3 is complaining about in
the first place. The only call site is `app/nina/about/page.tsx`, updated in Step 1, so the tree
typechecks in one edit pair.

### Step 3: The section, directly below Media

**File:** `components/nina/NinaAboutScreen.tsx:233-244`
**Change:** give the Media `<section>` the `mb-7` its siblings have (it currently has none because
it was last), and insert the tracking section after its closing tag — before the
`{open != null && (` viewer block at `:246`.

**Code:** complete replacement of lines 233-244.

```tsx
      <section className="mb-7">
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Media
        </h2>
        {gallery.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            Belum ada foto di chat. Kirim satu ke Nina, atau minta dia kirim.
          </p>
        ) : (
          <NinaPhotoGrid cells={gallery.map(toCell)} onOpen={(index) => openAt('chat', index)} />
        )}
      </section>

      {/*
        ── R3: THE IMAGE-GENERATION TRACKING SECTION, DIRECTLY BELOW MEDIA ─────────────────────
        Verbatim: *"put this image generation tracking section below media section (after user
        click nina profpic)"*. "After user click nina profpic" is this route, and "below media
        section" is this position — the last section on the page, after the album and the chat
        photos, which is also the honest ordering: the album is what she has, Media is what the
        conversation has, and this is what is still on its way.

        ── IT REUSES PHASE 4'S LIST, IT DOES NOT REIMPLEMENT IT ───────────────────────────────
        `NinaJobList` is `/nina/jobs`'s own list component and `listNinaImageJobs` is `/nina/jobs`'s
        own read, bounded here by `ABOUT_JOB_LIMIT`. A second row renderer is exactly the drift F18
        unified away for `ScreenshotStrip`'s arrows and their swipe, and the same argument holds
        harder for a job's stage: two renderers means two opinions about what `dispatched` looks
        like, and the one the runner sees is whichever page he happened to open.

        ── AND THAT INCLUDES THE EMPTY CASE ──────────────────────────────────────────────────
        There is no `jobs.length === 0` branch here, deliberately. `NinaJobList` renders absence
        itself and takes the WORDS from `emptyText`, which is the division of labour its own
        docstring sets out: "absence is one sentence, worded by the CALLER — /nina/jobs says
        something different from a section under Media." So this screen supplies its sentence and
        phase 4 supplies the markup. Branching here would be a second empty renderer for job rows,
        which is the same drift one element down.

        The section still renders when there is nothing to show. Media, twelve lines up, renders
        its caption and a sentence rather than disappearing, and two adjacent sections disagreeing
        about that is louder than either choice on its own. It is also the likelier render than it
        looks: `nina_message_images` has had zero rows for the life of the app, which is the whole
        reason this plan set exists.

        NOT `components/ui/EmptyState.tsx`, and nothing here reaches for it. That component is a
        dashed *card outline* for a whole screen; this screen has no cards.

        ── "SEMUA" IS NAVIGATION, NOT A COUNT ────────────────────────────────────────────────
        It goes to the full list; it does not claim more exist. Knowing that would cost a count
        query or a `limit + 1` probe, and this page's docstring is a promise about how few reads it
        makes. `NINA_JOBS_HREF` rather than the literal, so this link, the sidebar entry and the
        detail page's "SEMUA JOB" cannot drift apart. Hidden when there are no jobs, because
        `/nina/jobs` is empty then too and a link into a blank page is worse than no link.
      */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            Pembuatan foto
          </h2>
          {jobs.length > 0 && (
            <Link
              href={NINA_JOBS_HREF}
              className="text-[11px] font-semibold text-ink-2 transition-colors hover:text-ink"
            >
              Semua
            </Link>
          )}
        </div>
        <NinaJobList
          items={jobs}
          nowMs={jobsNowMs}
          emptyText="Belum ada foto yang dibuat. Minta Nina kirim foto lewat chat."
        />
      </section>
```

**Impact:**

- The Media section moves up by nothing and gains 1.75rem of bottom margin, which is the gap the
  album section already puts below itself (`mb-7` at `:226`). The page's rhythm is unchanged; it
  simply now has a third section instead of ending at the second.
- `transition-colors` and `hover:text-ink` are the app's existing link idiom
  (`components/admin/AdminNav.tsx:44`, `components/admin/DialSlider.tsx:129`) and satisfy invariant
  8: a transition, not a keyframe. No `@keyframes`, no `animate-*` class is added anywhere in this
  phase.
- Copy is Indonesian, matching the sibling sentence at `:238-239` and the rest of this screen. It is
  UI chrome in the app's own voice — **not** Nina's words, so invariant 7 is untouched: nothing here
  renders as her bubble.
- `tests/nina.chatPhoto.test.ts:99` asserts `readRepoCode('components/nina/NinaAboutScreen.tsx')`
  does **not** contain `actions=`. The new markup contains no `actions=` and passes no slot to
  `PhotoViewer`; that test stays green. It is the only test in the suite that reads this file.

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck` (`next typegen && tsc --noEmit`)
**Lint:** `npm run lint`
**Tests:** `npm test` — `tests/nina.chatPhoto.test.ts` is the one that reads this file; it must stay
green without being edited.
**Guards:** `npm run ci:client-secret-guard && npm run ci:llm-payload-guard && npm run ci:data-layer-guard`
(the first two because a server module's rows now reach a client component; the third is a no-op
here — it only reads `lib/db/queries.ts`).

**Manual check:**

1. `npm run dev`, open `/nina`, tap her avatar in the header.
2. Below **Media** there is a **Pembuatan foto** caption. With no jobs: one grey sentence and no
   "Semua" link. With jobs: phase 4's rows, newest first, at most five, and a "Semua" link.
3. Tap a row -> `/nina/jobs/[id]`. Tap "Semua" -> `/nina/jobs`. Both are real history entries; the
   back gesture returns to `/nina/about`.
4. **The regression that matters:** tap the hero photo, swipe through the album, swipe past the end
   and confirm it wraps within the album and never into the chat photos; press back once and land
   on `/nina/about` with no `?photo=`; deep-link `/nina/about?photo=album.<id>` in a fresh tab and
   confirm closing it does not navigate off the app. None of that should have moved, and this step
   is how you prove it.

**Exit criteria:** `/nina/about` renders a tracking section directly below Media showing the same
jobs, in the same order, with the same stage rendering as `/nina/jobs`; each row opens
`/nina/jobs/[id]`; `grep -rn "listNinaImageJobs\|NinaJobList" app components` shows this phase added
call sites only — zero new query implementations, zero new row renderers and zero new empty-state
renderers; build, lint, typecheck and `npm test` all green.

## Handoffs

1. **Phase 4 — the `/nina/jobs` link target and the sidebar.** This section's "Semua" link and its
   rows both point at routes phase 4 creates. Until phase 4 lands they 404. That is R1's surface,
   not R3's, and nothing here should be built to survive its absence.
2. **Phase 4 — a non-sweeping list read. RESOLVED, no action.** Phase 4's `listNinaImageJobs` is a
   pure read: it writes nothing, returns every status, and leaves `sweepStaleNinaImageJobs` where it
   is on `/nina`. Its D1 reaches that independently and for this plan's reason. The Step 1 page
   docstring's "three indexed reads and nothing else" therefore stands as written.
3. **Phase 4 — live ticking on this surface. RESOLVED, and it is deliberate.** `NinaJobList` renders
   `NinaJobElapsed` with `running` for any open job, which is a one-second `setInterval` on a page
   that otherwise has no timers. That is phase 4's component behaving consistently across both
   surfaces and this phase does not override it. It ticks only while a job is open — at
   `NINA_IMAGE_DAILY_CAP = 6` and a ~2-minute generation, that is a rare and short-lived state. If
   it is ever unwanted here, the knob belongs on `NinaJobList` (phase 4), not on this screen.
4. **Not this phase (R1):** an "elapsed" or "generating…" affordance in the chat itself, and the
   sidebar entry. Both are phase 4's, both were tempting from here, neither is R3.
5. **Not this phase (no requirement):** `/nina/about` still has no `loading.tsx` and the third read
   does not change that argument — but if phase 4's read ever becomes slow, revisit D-4 in the page
   docstring rather than adding a skeleton reflexively.
6. **Drive-by declined:** `components/nina/NinaAboutScreen.tsx`'s two `<h2>` caption classes are now
   spelled three times identically and want a local `SectionHeading`. Not in an R3 diff.

## Rollback

`git revert` this phase's single commit. It touches two files, adds no exported symbol, no
constant in a shared module, no migration, no route and no test. Reverting restores
`NinaAboutScreen`'s three-prop signature and the page's two-member `Promise.all`; nothing in phases
1–4, 6 or 7 references anything this phase creates, so the revert is self-contained in both
directions.

To disable the section without reverting the read: delete the second `<section>` block from Step 3
and drop `mb-7` from the Media section.
