# Package: app (the App Router route tree)

**Location**: `app`
**Last Updated**: 2026-09-17
**Documentation Created**: 2026-09-15

## Overview

`app` is the Next.js App Router tree and nothing else: every URL this application answers is a file
here, and every file here is a URL, a layout, a boundary, a metadata route, a `'use server'` action
module, a co-located route-handler test, or an icon. It holds **no components, no domain logic and
no database access of its own** — a route gates the caller, parses what the URL claims, calls one or
more `lib/` reads, and hands plain serialisable props to a component in `components/`.

That is the whole shape of the package, and it is why this readme is mostly *rules about routes*
rather than an API surface: `app` exports almost nothing that another module imports. Its contracts
point outward — at the browser (a URL, a status code, a manifest), at the platform (segment config),
and at the service worker (a notification's `url`).

**Key responsibilities:**
- Authenticate the caller, at the route, with the gate that matches the response type — and never
  rely on `proxy.ts` to have done it.
- Decide what a *miss* looks like for each surface — a 404, a redirect, or a silently empty screen —
  and keep every miss of a given surface indistinguishable from every other.
- Declare route segment config (`runtime`, `maxDuration`, `dynamic`) where the platform default is
  wrong, always as a literal.
- Map rows to props, stripping anything a client component may not see.
- Own the URL grammars: which path and query shapes exist, and which module spells each one.

**This file does not restate the root readme.** `.workflows/package_readme.md` at the repo root owns
the shell contract (`AppShell`, the chrome/gap prop, the reveal rules), the two-manifest install
contract, and the auth edge (`auth.ts`, `auth.config.ts`, `proxy.ts`). What follows is the route tree
and the rules routes obey.

## The boundary: what may live under `app/`

*Verified 2026-09-15.* Every file under `app/` is one of: `page.tsx`, `layout.tsx`, `route.ts`,
`loading.tsx`, `not-found.tsx`, a metadata route (`manifest.ts`, `robots.ts`), a co-located
`route.test.ts`, an icon asset (`icon.png`, `apple-icon.png`), `globals.css`, or one of the two
non-route modules called out below.

**There are no colocated components anywhere in this tree, and that is a rule, not an accident.**
A route's client half goes in `components/<feature>/`, named for the route it serves —
`ReviewScreen`, `ChatScreen`, `NinaAboutScreen`, `PhotoDeepLinkScreen`. Two live exceptions, both
deliberate:

| File | Why it is not a route and still belongs here |
| --- | --- |
| `app/actions/share.ts` | A `'use server'` module. Server Actions POST to the page they are used on, so `proxy.ts` governs them incidentally at best; the file is its own security boundary and opens every export with `requireUserId()`. |
| `app/(public)/s/[token]/copy.ts` | Public-facing strings for the share segment. It **imports nothing from `lib/share/copy.ts`, deliberately** — that file is *owner* copy, and "one module holding both is exactly how a 'your' ends up in front of a stranger." |

The visual shell is a **component** (`AppShell`), not a route-group layout, because `/upload`,
`/x/*`, `/r/[id]/edit`, `/onboarding` and `/photo/*` own full-bleed chrome of their own, and
"wrapping them by directory would take a layout decision away from the feature that owns them."

## The auth contract — four gates, and which one a route must use

`lib/auth/requireUserId.ts` states the rule this package is built on: **"This file, not `proxy.ts`,
is the actual security boundary of the application."** `proxy.ts`'s matcher is a UX redirect and its
own header says so; `/nina`, `/admin/**` and `/photo/**` are deliberately absent from it.

| Gate | Where it belongs | On failure |
| --- | --- | --- |
| `requireUserId()` | Server Components and Server Actions | `redirect('/')` — throws `NEXT_REDIRECT`, returns `never` |
| `getUserId()` | **Only** where signed-out is a legitimate state to render | returns `null`; the caller branches |
| `requireAdmin()` | Every `/admin/**` page **and** the layout | `redirect('/')` signed out, `notFound()` for a non-admin email |
| `requireUserIdApi()` / `requireAdminApi()` | Route handlers only | throws; the handler maps to `unauthorizedJson()` / `forbiddenJson()` |

Four rules that follow from that table, each of which a route has been written wrong against before:

1. **Call it first** — before reading `params`, `searchParams` or `formData`, before validating,
   before any database access. It is a cookie decrypt with zero round trips.
2. **Never wrap it in a bare `try`/`catch`.** `redirect()` signals by throwing; a
   `catch { return { error } }` around it swallows the sign-in bounce into a confusing toast. Hoist
   the call above the `try`. `app/actions/share.ts` is the worked example.
3. **A route handler must not use `requireUserId()`** — "a 307 to an HTML page is a terrible answer
   to `fetch()`." Use the `*Api` variant and the JSON envelope.
4. **The `/admin` layout is not enough on its own, and every page repeats the gate.** A layout does
   not re-run on every navigation within its subtree. *Measured 2026-09-15:* seven `requireAdmin()`
   call sites under `app/admin/` — the layout plus every page — at one cookie decrypt and zero round
   trips each.

`getUserId()` has exactly two legitimate callers today (*measured 2026-09-15*): `app/(app)/page.tsx`,
which is the runs list **and** the signed-out sign-in screen, and `/api/upload`'s
`onBeforeGenerateToken` callback, where "the latter redirects, and `handleUpload` turns this throw
into a 400 the `fetch` caller can actually read."

## The route tree

*Measured 2026-09-17:* 21 `page.tsx`, 11 `route.ts` handlers, 3 `layout.tsx`, 2 `loading.tsx`, 1
`not-found.tsx`, 5 co-located `route.test.ts`.

### Runner-facing pages

| Route | File | Gate | Chrome | Segment config |
| --- | --- | --- | --- | --- |
| `/` | `(app)/page.tsx` | `getUserId` | `AppShell` + `ScreenHeader` | — |
| `/upload` | `upload/page.tsx` | `requireUserId` | own full-bleed | — |
| `/x/[extractionId]` | `x/[extractionId]/page.tsx` | `requireUserId` | own `Shell` | `maxDuration = 60` |
| `/r/[id]` | `r/[id]/page.tsx` | `requireUserId` | `AppShell` + hand-rolled header | `maxDuration = 60` |
| `/r/[id]/edit` | `r/[id]/edit/page.tsx` | `requireUserId` | own full-bleed | `maxDuration = 60` |
| `/trends` | `trends/page.tsx` | `requireUserId` | `AppShell` + `ScreenHeader` | `maxDuration = 60` |
| `/me` | `me/page.tsx` | `requireUserId` | `AppShell` + `ScreenHeader` | — |
| `/onboarding` | `onboarding/page.tsx` | `requireUserId` | own, centred | — |
| `/nina` | `nina/page.tsx` | `requireUserId` | `AppShell screen="chat"` | `maxDuration = 300` |
| `/nina/about` | `nina/about/page.tsx` | `requireUserId` | `AppShell` | — |
| `/nina/jobs` | `nina/jobs/page.tsx` | `requireUserId` | `AppShell` + `ScreenHeader` | `maxDuration = 300` |
| `/nina/jobs/[id]` | `nina/jobs/[id]/page.tsx` | `requireUserId` | `AppShell` + `ScreenHeader` | — |
| **`/photo/[kind]/[id]`** | `photo/[kind]/[id]/page.tsx` | `requireUserId` | **none** — the viewer is `fixed inset-0` | — |
| `/s/[token]` | `(public)/s/[token]/page.tsx` | **none — public** | own layout | `dynamic = 'force-dynamic'` |

### Operator pages

Every `/admin/**` page is a Server Component, gated by `requireAdmin()` as its first statement, and
declares `dynamic = 'force-dynamic'`. The reason is stated once and applies to all of them: a
route whose caching is "decided by the internals of a module three levels down is a route that loses
it the day that module is refactored." `/admin/error-logs` has a second, stronger reason — the log
table is written by background `after()` work that never calls `revalidatePath`, so a cached render
would show an operator a stale "no failures".

Two `/admin/*` pages carry a `maxDuration` of `300` (*measured 2026-09-17*: `/admin/image-generation`
and `/admin/nina`), because `after()` inherits the **route segment's** budget, not the action's own
wishes. The rule, not the list: an admin page that starts deferred work needs a budget that covers
the work, not the render.

### Route handlers

| Route | Verbs | Auth | Segment config |
| --- | --- | --- | --- |
| `/api/auth/[...nextauth]` | GET, POST | n/a — it *is* the auth surface | none (Node is the Next 16 default) |
| `/api/upload` | POST | session, inside `onBeforeGenerateToken` | `runtime = 'nodejs'` |
| `/api/extract` | POST | `requireUserIdApi` | `runtime = 'nodejs'`, `maxDuration = 60` |
| `/api/extract/[id]` | GET | `requireUserIdApi` | `runtime = 'nodejs'` |
| `/api/health` | GET | **none — public** | `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` |
| `/api/cron/nina` | GET | `CRON_SECRET` bearer | `runtime = 'nodejs'`, `maxDuration = 300` |
| `/api/cron/rollup` | GET | `CRON_SECRET` bearer | `runtime = 'nodejs'`, `maxDuration = 60` |
| `/api/admin/nina/upload` | POST | `requireAdminApi`, **before** `handleUpload` | `runtime = 'nodejs'` |
| `/api/admin/nina/backfill-descriptions` | GET, POST | `requireAdminApi`, first statement | `maxDuration = 300` |
| `/api/admin/nina/backfill-media-descriptions` | GET, POST | `requireAdminApi`, first statement | `maxDuration = 300` |
| `/admin/manifest.webmanifest` | GET | none — four constants | `dynamic = 'force-static'` |

**The shared error envelope is `Response.json({ error: <string> }, { status })`**, with two canonical
helpers so every route answers identically: `unauthorizedJson()` (401) and `forbiddenJson()` (404 —
an admin refusal says "Not found", never "Forbidden"). Two documented deviations: the crons answer a
bad bearer with a bare `new Response('unauthorized', { status: 401 })`, and `/api/health` uses an
`{ ok, error }` shape because it is a probe, not an API.

**Neither upload route ever receives image bytes.** Both mint a short-lived signed Vercel Blob token
and the browser PUTs straight to the store — "a Vercel Function rejects bodies over ~4.5 MB,
streaming an upload through a function bills wall-clock for zero computation, and only a direct
browser PUT can report honest per-file progress." Three rules hold in both:

- The **pathname regex is the path-traversal defence**, and the user id in it is interpolated from
  the session, never read from the request.
- The size cap, the content types and the owner live in the **signed token payload**, so the
  completion webhook cannot be spoofed — "the webhook has no cookies and cannot re-authorise."
- `onUploadCompleted` is **production-only observability and never a writer**. `POST /api/extract`
  and `registerNinaAvatarsAction` are the writers.

The admin route exists separately rather than as a third branch of `/api/upload` because all four
values that matter differ: the authorisation rule (admin, not merely signed in), the size cap, the
allowed content types, and the pathname shape. Its three pathname predicates are deliberately not
one alternation, because "a 512 KB rule that silently becomes an 8 MB rule is exactly the mistake
worth making structurally impossible."

### The backfill routes — one shape, one per searchable table

`/api/admin/nina/backfill-descriptions` (album, `nina_avatars`) and
`/api/admin/nina/backfill-media-descriptions` (media, `nina_message_images`) are the same handler
twice, and a third searchable table would be a third copy rather than a `?table=` parameter. Five
properties are the shape, and a new one must keep all five:

1. **`GET` reports, `POST` does one slice.** `GET` spends nothing — it is two counts — so an operator
   may poll it freely. `POST` drains what fits in a budget constant and answers `remaining`.
2. **`requireAdminApi()` is the first statement, before any read.** `proxy.ts` matches neither
   `/admin` nor `/api/*`, so this gate is the only thing between the open internet and a route that
   spends vendor money per call. `userId` comes from the session and is never read from the request.
3. **`maxDuration = 300`, a bare literal, with the budget constant strictly under it.** The slow work
   runs on the handler's own clock and *not* in `after()` — the handler's whole job **is** the slow
   work, so there is no response to get out of the way of. The budget (`240_000` ms today for both)
   reserves headroom so a vendor call in flight at the deadline still writes its row.
4. **`remaining` is re-read, never computed** as `targets.length - done`. Parallel `after()` work can
   fill a row mid-slice, and `remaining` is what the operator's loop condition tests.
5. **Idempotent, so a double-POST is harmless.** The backlog read is oldest-first and the write is an
   UPDATE with equal values; nothing here is a transaction and nothing needs to be.

**What counts as backlog belongs in the query layer, not in the route.** Both routes take their
predicate from `lib/nina/queries` so that every statement reading the set reads the same set by
construction — including the media route's `isOriginalPhoto()` exclusion, without which a *reference*
row (a re-show of a photograph that lives elsewhere, which can never carry a vector of its own by
design) would be reported as permanent, unfixable work forever.

**A route is not always the cheapest drain, and `scripts/` is the other half.** Where a backlog needs
only an embedding and no vision call, `npm run nina:backfill-embeddings` (album) and
`npm run nina:backfill-media-embeddings` (media) do it with no session and no dev server. The routes
remain the permanent tool, because they are the only surface that can *describe* a row whose caption
pass failed. Those scripts live outside this package and are documented by their own.

The crons are scheduled in `vercel.json`, and **Vercel cron `schedule` strings are UTC, always,
regardless of `regions`.** Both are idempotent by design, and `/api/cron/nina` says why that matters:
*"Any authenticated caller may hit this route as often as they like; idempotence is what makes that
harmless, not rate limiting."* Neither has rate limiting, and neither should grow one instead of
idempotence.

## Route segment config — the rules

1. **`maxDuration` is for the Server Action and the `after()` work the page starts, not for the
   render.** A Server Action and an `after()` callback inherit the *page segment's* budget. This is
   why `/r/[id]` and `/r/[id]/edit` carry `60` on pages that render in milliseconds, and why
   `/nina/jobs` grew one when a redo button started scheduling a generation. A page with no action
   and no model call declares nothing — `/photo/[kind]/[id]` is the current example.
2. **It must be a bare numeric literal.** Segment config exports are statically analysed at build
   time; `export const maxDuration = NINA_HOST_MAX_DURATION_MS / 1000` is not a value the analyser
   can see. The failure modes differ by route and are both bad: `next build` rejecting the route
   with "Invalid segment configuration export detected", or shipping on the platform default. Where
   a literal shadows a constant, a test pins the two together.
3. **`runtime = 'nodejs'` is explicit on every handler** except the Auth.js re-export, which
   documents its reliance on the Next 16 default.
4. **`revalidate` is never exported anywhere in this tree** (*verified 2026-09-15*), and `dynamic` is
   declared only where a stale render would be a lie: the admin pages, `/api/health`, the public
   share page, and the static admin manifest.

## The two route groups, and the soft-404 they exist to fix

`(app)` and `(public)` carry **no layout** and change no URL. They exist solely to control which
routes have a `loading.tsx` above them, and the reason is a measured bug:

> `loading.tsx` wraps its segment **and every segment below it** … once a Suspense fallback can
> render, the response body starts streaming, the headers are already on the wire, **and the HTTP
> status can no longer change**. Every `notFound()` in the app was therefore answering **200 with a
> 404 body**.

*Measured:* `/s/<unknown-token>` answered 200 before the split and 404 after, with the page code
unchanged. Hence: **do not move `app/(app)/loading.tsx` back up to `app/loading.tsx`**, and do not
add a `loading.tsx` at `app/nina/` or above any segment that can `notFound()`. `app/trends/loading.tsx`
is safe because `/trends` has no dynamic children. Guarded by `tests/share.bundle.test.ts` and
`scripts/check-f11-share-boundaries.mjs`.

## The three photo deep-link grammars

Three surfaces under `app/` open something by pointing at a photograph, and **each has its own
grammar, its own union and its own parser module**. They must not be merged.

| Surface | Grammar | Parser | What it does |
| --- | --- | --- | --- |
| `/nina` | query `?photo=<kind>:<id>`, **colon**, `kind ∈ {avatar, image}` | `parseNinaPhotoParam` — `lib/nina/attach.ts` | arms the **composer's** pending attachment |
| `/nina/about` | query `?photo=<section>.<id>`, **dot**, `section ∈ {album, chat}` | `decodeAboutPhoto` — `lib/nina/album.ts` | opens the viewer over a **list** |
| `/photo/[kind]/[id]` | **path segments**, `kind ∈ {shot, avatar, image}` | `parsePhotoViewerSegments` — `lib/photos/pointer.ts` | opens the viewer over **one** row, cold |

The first two share the *key* `photo` but not the *value* grammar — which is why `lib/nina/album.ts`
declares `NINA_ABOUT_PHOTO_PARAM` rather than reusing `PHOTO_PARAM`, and why `ChatScreen` deletes
both in one `replaceState`.

The third is a **path** and not a query because the service worker's `notificationclick` handler
compares `new URL(client.url).pathname === target` literally, so a trailing `/` or a `?x=1` turns
"focus the window already showing this photo" into "navigate it again."

**`PhotoPointerKind` must never be merged into `NinaPhotoKind`.** The `/nina` union is resolved by a
ternary, not an exhaustive switch: adding `'shot'` there "would compile, would parse, and would read
a `run_photos` id out of `nina_message_images`." If a fourth image table ever appears, the two places
to change are `lib/photos/pointer.ts` and `resolveDeepLinkPhoto`'s arms.

### `/photo/[kind]/[id]` — the deep-link viewer

The click target of the `duplicate_image` push (R2). The service worker is already generic; this
route is the other end of that navigation and the reason a push payload's `url` may finally be
something other than `/nina`.

```
requireUserId()  →  parsePhotoViewerSegments(kind, id)  →  one ownership-scoped point read  →  render | redirect('/')
```

- **The parse happens before the read**, because which table to read is what the grammar decides. A
  hand-typed `/photo/run/xyz` costs the page not one round trip.
- **One read, and it *is* the authorization check.** `getRunPhoto` scopes through `runPhotoOwnedBy`'s
  correlated EXISTS; `getNinaAvatar` / `getNinaMessageImage` scope through their `user_id` predicate.
  There is no separate authorization step because there is nothing to authorize separately: a row
  that is not his does not come back.
- **Every miss is one answer.** Malformed kind, malformed id, foreign id, deleted id — all
  `redirect('/')`, with no error page and no response that distinguishes "not yours" from "does not
  exist". It is a redirect and not `notFound()` because this URL arrives from the **notification
  tray**, possibly days old: "answering a stale bookmark with an error page would be the app telling
  a runner his own chat is broken."
- **Both Nina arms go through `albumPhotos` / `galleryPhotos`, and that is the invariant, not a
  convenience** — those mappers are what strip `description`, `glm-4.6v`'s private prose. The three
  fields are copied out of the result rather than spread, because the mapper's own row carries more
  than a `ViewerPhoto` prop may. The `shot` arm needs no mapper: `RunPhotoPoint` carries four
  columns, none of them private.
- **Closing lands on the photograph's own home**, decided server-side: a committed shot closes onto
  `/r/<runId>`, an uncommitted one onto `/`, and both Nina kinds onto `/nina/about`. Not
  `router.back()` — a notification tap reaches the page through `clients.openWindow()` with no in-app
  history beneath it, and `back()` navigates off the app entirely. `router.replace`, not `push`, so a
  back-swipe does not re-open a viewer on top of the page the runner just asked for.
- **No `AppShell`**: `PhotoViewer` is `fixed inset-0 z-60` and covers the tab bar completely, so the
  shell would ship a nav the runner can never see. **No `maxDuration`**: no Server Action, no model
  call.

The one read this route added to `lib/db/queries/photos.ts` is `getRunPhoto(userId, photoId)`,
returning `RunPhotoPoint | null`. Two properties of it are load-bearing and should not be relaxed:
ownership goes through `runPhotoOwnedBy` rather than a `user_id` column (`run_photos` has none by
design, and the correlated EXISTS covers **both** parents — so a screenshot whose `run_id` is still
`NULL` is as reachable as one on a committed run; a `runs`-only check would make every pre-commit
screenshot a silent 404), and the projection is **explicit, not a bare `select()`** (drizzle expands
a bare select into every column it knows about, so a schema edit this read has no opinion about
would otherwise change its shape).

## Data flow

**A page.** `requireUserId()` → parse `params`/`searchParams` with a `lib/` helper → one `Promise.all`
of indexed reads, or one `db.batch` → map rows to plain serialisable props → render a
`components/` screen. Model calls never happen in a render path; they are scheduled in `after()` by a
Server Action, which is what the page's `maxDuration` is for.

**An upload.** Browser picks and compresses → `POST /api/upload` mints a signed token → browser PUTs
to Blob → `POST /api/extract` writes `extractions` + `run_photos` and returns `202 { extractionId }`
in one INSERT's time → `runExtractionJob` runs in `after()` → the client polls
`GET /api/extract/[id]` (`Cache-Control: no-store`) until a terminal status → `/x/[extractionId]`
renders the review → commit creates the `runs` row and backfills `run_id`.

**A notification tap.** Push payload's `url` (built by `photoViewerPath`) → service worker focuses or
opens it → `/photo/<kind>/<id>` → parse → one scoped point read → `PhotoViewer` full-screen, or `/`.

**A share.** `createShareLinkAction` → token → `/s/<token>`, read by `readSharedRun` (one `cache()`-
memoised query serving both `generateMetadata` and the body) → `revokeShareLinkAction` kills the link
**then** rotates the blobs, in that order, because the order is the design.

## Dependencies

### External
`next` (routing, `redirect`/`notFound`, `after`, metadata routes, `PageProps`/`LayoutProps`/`RouteContext`
generated types), `next/font/google` (self-hosted Poppins), `@vercel/blob/client` (`handleUpload` in
both upload routes), `@neondatabase/serverless` (`/api/health`'s own `select 1` probe — the one place
in this tree that talks to a driver directly), `zod` (request validation), `react`.

### Internal
*Measured 2026-09-15* over non-test route source, by import count: `@/lib/auth/requireUserId` (22),
`@/lib/db/queries` (13), `@/lib/admin/requireAdmin` (10), `@/lib/nina/queries` (8), `@/lib/env` (8),
`@/lib/id` (7), `@/lib/date/ranges` (7), `@/lib/format` (6), then `@/lib/share/origin`, `@/lib/pwa`
and `@/lib/nina/album` at 4 each, and a long tail of one-offs.

The duplicate-image feature's three modules each have exactly one consumer in this tree:
`@/lib/photos/pointer` in the deep-link route, and `@/lib/photos/globalDuplicate` plus
`@/lib/push/duplicateImage` in `POST /api/extract`.

The shape of that list is the package's boundary rule restated: `app` reaches for gates, queries,
pure formatters and constants, and for nothing that decides anything.

## Reverse dependencies

**Nothing imports from `app/`.** *Verified 2026-09-15.* Routes are leaves; the framework is their
only caller. Three things nonetheless depend on this tree's **shape**, and each breaks silently:

- `lib/service-worker.js` navigates to a path string minted elsewhere. A renamed route directory
  produces no compile error — it produces a notification that opens a 404. `tests/photo.deepLink.test.ts`
  is the gate.
- `proxy.ts`'s matcher enumerates paths as string literals; `tests/auth.proxy.matcher.test.ts` asserts
  every line against Next's own matcher compiler.
- `app/robots.ts` and `next.config.ts`'s `X-Robots-Tag` header enumerate path prefixes.

## Concurrency

Route handlers and page renders are independent per-request invocations with no shared mutable module
state. The three places where ordering is a decision rather than an accident:

- **`after()`** runs its callback once the response has been sent but still inside the same
  invocation, extending its lifetime up to the segment's `maxDuration`. Everything slow lives here.
- **The crons are sequential on purpose**, with a per-user `try` so one user's failure stops nothing:
  "a cron that aborts on the first bad row silently stops serving everyone after it in the list."
  Each stops itself before the platform does, against its own soft deadline.
- **Revoke-then-rotate** in `app/actions/share.ts`: kill the link first, so a store failure cannot
  abort before the revoke and leave a page live that the runner believes is gone.

## Error handling

There are no custom error types in this package; the vocabulary is *which miss answer a surface
gives*, and the rule is that a surface gives exactly one, so no response is an oracle.

| Surface | A miss is | Why |
| --- | --- | --- |
| `/x/[extractionId]`, `/r/[id]`, `/r/[id]/edit`, `/nina/jobs/[id]` | `notFound()` | reached from inside the runner's own app, where a 404 is honest |
| `/s/[token]` | `notFound()` → one byte-identical page | three different causes, one response — the anti-oracle property |
| `/photo/[kind]/[id]` | `redirect('/')` | arrives from the notification tray, possibly days stale |
| `/nina`, `/nina/about` | silent `null` — the composer or viewer just opens empty | a forged, foreign or deleted id is not an error state |
| `/trends`, `/` | silent clamp to a valid default | "a 404 for `?key=banana` teaches the reader nothing" |
| route handlers | `{ error }` JSON, 400/401/404 | terse, echoing nothing a probe could use |

Ownership is baked into the read in every case, so a foreign id and a nonexistent id return the same
`null` and become the same response. **Do not add a branch that distinguishes them** — not a "was
this recently revoked?" message, not a 403.

Server Actions **return result objects rather than throwing**, because they are called from Client
Components "where a thrown error is a red screen and the honest outcome is a sentence next to the
button."

## Performance

The costs in this tree are round trips and model calls, and the rules are about not multiplying
either:

- **One query per screen where the numbers must agree.** `/` reduces its week dividers from the rows
  it already returned rather than issuing a second query that could disagree; `/trends` issues one
  `db.batch` of three statements for one consistent snapshot, the alternative being "six chances for
  two charts on one screen to disagree."
- **Count, don't list.** The admin hub prints one integer from a `COUNT`, not from every column of
  every row, on a `force-dynamic` page an operator opens constantly.
- **Memoise a query shared by `generateMetadata` and the body.** `readSharedRun` is `cache()`-wrapped,
  so a scrape costs one round trip, not four.
- **No model call in a render path.** This is enforced, not intended:
  `scripts/check-llm-payload-boundary.mjs` Rule 2 forbids awaiting a model call from a page render,
  by function name.
- **Don't ship machinery for an empty state.** `/` imports no chart code on its empty path — "a user
  with no runs must not download Recharts to be told they have none."
- `/trends`' single-snapshot query is right *because this is a single-user personal app with a
  bounded history*; if a user ever has thousands of runs, that page and `recomputeRecords` need the
  same rethink, **and neither should be changed alone**.

## Testing

Three kinds of test cover this package, and the split is a consequence of the runner's configuration
(`vitest.config.ts`, `environment: 'node'`, no jsdom):

1. **Handler tests** — a route handler is importable under `node`, so its behaviour is asserted
   directly. Two homes, and either is fine: **co-located** `app/**/*.test.ts` (in `vitest.config.ts`'s
   `include`; *measured 2026-09-17:* five), or a named suite in `tests/` when the subject is a feature
   rather than a file — `tests/admin.mediaBackfillRoute.test.ts` is the current example. The posture
   in both is the same: mock only the **edges** (the gate, `next/server`'s `after`, the vendor
   modules) and let the real query builders run against `tests/support/fakeDb`, so the assertions are
   about generated SQL and execution order rather than about spies.
2. **Structural source scans** in `tests/`, using `readRepoCode` / `repoFileExists` / `isClientModule`
   from `tests/support/importGraph`. A page cannot be rendered under `node`, so what is provable about
   it is proven about its source: that the gate is called, that a symbol is absent, that a file exists
   at the path a builder spells. `readRepoCode` **strips comments**, which is what lets a route's doc
   comment name `notFound` or `description` while explaining why neither appears in its code.
3. **Integration tests** in `tests/integration/**`, against a real Postgres. Reach for one only when
   the claim is about what the **database** decides — whether two query arms are genuinely
   complementary, whether a write through a redirect reads back — because `tests/support/fakeDb` is a
   *recording* driver that never evaluates a predicate, and so cannot answer either.

**The integration tier is doubly opt-in, and a green from it must be read carefully.**
`vitest.config.ts` excludes `tests/integration/**` unless `VITEST_INTEGRATION=1`, and each suite
additionally skips itself without `TEST_DATABASE_URL` (never `DATABASE_URL` — this repo has one
database and it is production). So a plain `npm test` matches **zero** integration files and exits 0:
a green answering a different question. `npm run test:int` is the one that asks. Rows hang off one
throwaway user with a unique suffix, removed in `afterAll`.

`tests/photo.deepLink.test.ts` is the second kind, and its subject is the seam nothing else can see:
that `app/photo/[kind]/[id]/page.tsx` is a real directory at the path `photoViewerPath` spells. A
drift there is otherwise silent — the worker navigates, the page refuses to parse, and the runner
lands on `/` with nothing logged anywhere.

Other structural gates that read files in this tree: `tests/pwa.install.test.ts` (slices the
`viewport` export out of source), `tests/auth.proxy.matcher.test.ts`, `tests/admin.shell.test.ts`,
`tests/share.bundle.test.ts`, plus the `ci:*` guard scripts.

*Measured 2026-09-15 (`P1-APP-M4TZ`):* the phase's targeted suites ran 26/26 green, with
`npm run typecheck` (`next typegen && tsc --noEmit`), `npm run build`, `npm run lint`,
`npm run ci:data-layer-guard` and `npm run ci:client-secret-guard` all clean.

## Gotchas

- **`npm run typecheck`, never a bare `tsc --noEmit`.** `PageProps<'/photo/[kind]/[id]'>`,
  `LayoutProps` and `RouteContext` are *generated*; without the `next typegen` leg they are unknown
  names, and a fresh worktree reports a wall of errors that are not real.
- **`maxDuration` and friends must be literals.** An imported constant either fails the build or
  silently ships the default. See the segment-config rules above.
- **A `loading.tsx` above a segment that can `notFound()` turns its 404 into a 200.** The route groups
  exist for this; do not undo them.
- **`viewportFit: 'cover'` in the root layout is what makes every `env(safe-area-inset-*)` non-inert**,
  and it must not be repeated in `app/admin/layout.tsx`'s `viewport` — nested viewport merges key by
  key, and the failure mode of adding it is silent. `tests/pwa.install.test.ts` asserts it does not
  appear there, by slicing the export out of the source, which is why that object literal carries **no
  comments inside it**.
- **Nested `metadata` keys are REPLACED, not merged.** `app/admin/layout.tsx` spreads `...APPLE_WEB_APP`
  for exactly this reason: writing `appleWebApp: { title }` would drop `capable: true`, the single line
  that stops the install from being a Safari bookmark. For the same reason the admin layout must not
  gain an `icons` key — it would silently delete `app/admin/apple-icon.png`.
- **The admin manifest's `scope` is `'/'`, not `/admin`.** A narrower scope would eject the installed
  admin app into Safari on exactly the day the cookie expired — the day the redirect to the sign-in
  screen is the point.
- **`/api/auth/[...nextauth]` must keep that exact directory name**, lowercase catch-all, or Google
  answers every sign-in with `redirect_uri_mismatch`. And `proxy.ts` must never match `/api/auth/*`,
  or the sign-in flow redirects to itself.
- **`app/robots.ts`'s `Disallow` is not a security control** — `requireUserId()` is. It exists to keep
  a human out of a search result that lands them on a sign-in page. `/s` is deliberately *allowed*,
  because disallowing it removes the only `noindex` a crawler would ever read and kills the WhatsApp
  preview card. *Measured 2026-09-15:* the disallow list names `/upload`, `/r/`, `/x/`, `/trends`,
  `/me`, `/onboarding`, `/api/`; `/nina`, `/photo` and `/admin` are not in it (a crawler gets the
  sign-in redirect from all three, and `/admin` carries `robots: { index: false }` in its layout).
- **Never build a `/photo/...` URL by hand.** `photoViewerPath` is the only speller, and its test is
  what keeps the notification and the route agreeing.
- **`description` must not appear in a route's code.** Both Nina point reads project it; the mappers
  are what strip it, and `tests/photo.deepLink.test.ts` asserts the route never names the field.
- **`/admin/nina`'s JSX comments need their leading `*`** — `ci:client-secret-guard` Rule 3 reads them.
- **`npm test` proves nothing about `tests/integration/**`** — it excludes the directory and exits 0
  on zero matched files. If a phase's evidence rests on an integration invariant, the command in the
  record must be `npm run test:int` with `TEST_DATABASE_URL` set, or the green answered a different
  question.
- Several route doc comments cite sibling files by `:NN` line number. Those drift. **Locate anchors by
  name**, and treat a quoted line number as a hint, not an address.

## Notes

`app` is where this application's *policies about strangers* are written: what a signed-out visitor
sees, what a stale notification deserves, what a revoked share link says, what an operator's refusal
looks like. Almost every rule in this file is downstream of one idea — **a response must not be an
oracle**. A miss is a miss, uniformly, on every surface, and the moment one grows a branch that says
*why* it missed, the property is gone.

The second idea is that the route is an adapter. When a route starts deciding something, the decision
belongs in `lib/` and the route should call it. The three deep-link grammars are the worked example:
the routes dispatch on them, and not one of them spells one.

### The duplicate-image round trip, end to end

*As of 2026-09-15* both ends of the `/photo/<kind>/<id>` grammar live in this tree: `POST /api/extract`
asks the question, and `/photo/[kind]/[id]` answers the tap. The producer side follows the rules
above rather than inventing new ones, and three of its choices are worth keeping:

- **It is registered in its own `after()`, placed *before* the extraction job's.** The client waits
  for one INSERT, and "a cross-table lookup plus a web-push fan-out is not something a 202 may wait
  on." Ordering it first keeps the notification from queuing behind a ~34 s model call, and because
  the job measures its soft deadline from `invocationStartedAt`, a job that runs second *sees* the
  shortened budget rather than overshooting it — "the safe direction, and the reason this ordering is
  not a gamble."
- **The whole batch is excluded from the lookup, not just the asking row.** One upload submits up to
  three shots whose kinds must differ but whose bytes need not; excluding only the asking row would
  make two of them match each other and fire two pushes for one upload. The question is "already",
  meaning before now.
- **Every failure is silent.** A failed lookup or a failed send warns and moves on. The photos are
  committed; nothing on this path may ever be load-bearing for them — the invariant every
  `notifyNinaPush` call site already keeps.

`/api/admin/nina/upload`'s side of the same feature is phase 4's, in `lib/admin/**`.

## Recent Changes

**2026-09-17 — `P2-APP-A001` (phase 4 of 4, `MEDIA_ALBUM_UNIFIED_SEARCH`)**
- Added the route handler `app/api/admin/nina/backfill-media-descriptions/route.ts` — the media twin
  of the album's backfill route, `GET` reporting the backlog and `POST` draining one slice under
  `NINA_MEDIA_BACKFILL_BUDGET_MS` / `NINA_MEDIA_BACKFILL_SLICE` from
  `lib/admin/ninaMediaDeferredDescribe.ts`. It is a copy of the album route's shape on purpose; the
  five properties that make it that shape are written up under "The backfill routes" above, and a
  third searchable table would be a third copy, not a parameter. Tenth and eleventh handler in the
  tree; the album route (landed the same day this readme was created) was missing from the handler
  table and is now in it.
- No new URL grammar, no new gate, no page, no layout, and no existing route edited by this phase.
  `/admin/nina`'s page had already gained its `maxDuration = 300` in an earlier phase; the "only
  `/admin/*` route with a `maxDuration`" claim above was stale and is corrected.
- Established the **integration tier** as a documented third kind of test for this package
  (`tests/integration/mediaAlbumUnifiedSearch.int.test.ts`), for the two plan invariants the
  recording fake driver structurally cannot prove: that a pointer Album row stores no
  description/keywords/embedding of its own and redirects both reads and writes to its linked Media
  row, and that a physical photograph appears at most once in a merged result. With it came the
  double opt-in gate and the "a plain `npm test` matches zero files" trap, both now in Testing and
  Gotchas.
- The drain was actually run against production. *Measured 2026-09-17:* 118 original media rows
  embedded, 0 failed, 0 skipped; a read-only count afterwards reported originals 118,
  missing_description 0, missing_embedding 0. That is a measurement of one day's data, not a standing
  property — the route is a permanent tool, because `scheduleChatPhotoCaption` still writes prose
  with no vector.
- The rest of the phase — `scripts/backfill-media-embeddings.mjs`, its `nina:backfill-media-embeddings`
  script line, and the `removeChatPhotoAction` pointer-refusal cases — lands outside this package and
  is documented by its own.

**2026-09-15 — `P1-APP-M4TZ` (phase 2 of 4, `DUP_IMAGE_PUSH_NOTIFY_PLAN.md`)**
- Added the route `app/photo/[kind]/[id]/page.tsx` — `PhotoDeepLinkPage`, with module-private
  `resolveDeepLinkPhoto` and `DEEP_LINK_MISS_HREF = '/'`. Satisfies R2: tapping the `duplicate_image`
  push opens a full-screen view of the image already saved. First route in this tree to declare no
  chrome *and* no `maxDuration` on purpose, and the first whose every miss is a `redirect('/')`.
- Established the **third** photo deep-link grammar under `app/` — the first that is a path rather
  than a query parameter, and the first with an arm for `run_photos`. Parsed by phase 1's
  `parsePhotoViewerSegments`; `lib/nina/attach.ts`'s two-way union is untouched.
- Consumed one new query, `getRunPhoto` / `RunPhotoPoint` in `lib/db/queries/photos.ts` (that
  package's own readme owns its documentation).
- Its client half is `components/photo/PhotoDeepLinkScreen.tsx`, a new directory — a sixth
  `PhotoViewer` caller, not a second overlay. `components/ui/.workflows/package_readme.md`'s caller
  table still names five (*measured 2026-09-15*); updating it belongs to that package.
- No existing route, layout, boundary or metadata route was edited.

**2026-09-15 — `P1-EXT-R9WD` (phase 3 of 4), this package's half only**
- `POST /api/extract` gained the producer end of the same grammar: a second `after()`, registered
  ahead of the extraction job's, that asks `findGlobalDuplicatePhoto` once per distinct content hash
  and sends `notifyDuplicateImagePush` on a hit. Documented under "The duplicate-image round trip"
  above. The rest of that phase lands outside `app/` and is documented by its own packages.
