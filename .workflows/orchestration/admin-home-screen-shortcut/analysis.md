# Code Analysis: the iOS home-screen install of `/admin`

**Type:** Feature Update
**Date:** 2026-09-07 09:11:06 +07
**Session ID:** 20260907-091106-ADMN
**Plan:** `ADMIN_HOME_SCREEN_SHORTCUT_PLAN.md` (2 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-home-screen-shortcut`, branch `feature/admin-home-screen-shortcut` (base `origin/main` @ `f839116`)

---

## User Input

### Original User Request

> i use /admin page so much, i want to make it into a shortcut (ios safari -> create into a
> homepage). i could do this, but the resulting shortcut only opens to runins.site/ (the homepage,
> not the admin page). what should we to to achieve this? should i buy a new domain, and put /admin
> into that new domain?

### User-Provided Context

The observed symptom is the whole bug report: Add to Home Screen from `/admin` produces a tile that
launches `https://runins.site/` — the runner's runs list — and not `/admin`. Nothing was pasted;
the behaviour is reproducible on the repo owner's iPhone XS Max, which is `docs/design-brief.md`'s
design target and the device `admin-responsive-nina-intimacy` R1 rebuilt this surface for.

### User-Provided Files

None marked with `@`.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | *"i want to make [/admin] into a shortcut (ios safari -> create into a homepage)"* — a home-screen tile that opens on `/admin`, not on `/` |
| R2 | *"should i buy a new domain, and put /admin into that new domain?"* — an answer to the second-domain question, decided rather than left hanging |

---

## Detailed Requirements Understanding

**Problem statement.** `app/manifest.ts` sets `start_url: '/'`. Safari on iOS ≥ 16.4 honours the
web app manifest of the document that was on screen when Add to Home Screen was tapped: it reads
`start_url`, not the current URL. Every page of this app — `/admin` included — links the one
manifest, via `metadata.manifest: '/manifest.webmanifest'` in `app/layout.tsx:47`. So the tile
created from `/admin` is *correctly* implementing an install contract that says the app starts at
`/`. The shortcut is not broken; it is installing the runner's app from an admin page.

This is also why the fix is not a bookmarklet, a query string, or a redirect: those all still
launch through `start_url`.

**What must change.** `/admin` must link a *second* manifest whose `start_url` is `/admin`, and
that manifest must be distinguishable from the first so iOS treats the two installs as two apps.

**Success criteria.**

1. `GET /admin/manifest.webmanifest` answers `200` with `Content-Type: application/manifest+json`
   and a body whose `start_url` is `/admin`.
2. The rendered `<head>` of `/admin` (and every route under it) carries
   `<link rel="manifest" href="/admin/manifest.webmanifest">` and **not** the root manifest.
3. The rendered `<head>` of `/`, `/nina`, `/trends`, `/me`, `/r/*`, `/x/*`, `/s/*` is byte-for-byte
   unchanged — the runner's install contract, which `tests/pwa.install.test.ts` guards, does not
   move.
4. Add to Home Screen from `/admin` on the target device produces a tile that launches `/admin`
   full-screen with no Safari chrome, and a tile visually distinct from the runner's.
5. Both tiles can coexist on one home screen without one replacing the other.

**Key considerations.**

- **`scope` must stay `/`.** Anything outside scope opens in a browser tab instead of in the
  installed app. `lib/admin/requireAdmin.ts:75` answers a session-less request with
  `redirect('/')`, so a narrower `scope: '/admin'` would eject the admin app to Safari on the one
  day the session cookie has expired — which is exactly when a redirect to the sign-in screen is
  the point. The root manifest's own comment (`app/manifest.ts:27-31`) makes the same argument for
  the runner.
- **`id` must differ.** A manifest `id` is what an installer uses to decide whether it is looking
  at an app it already has. Two manifests both claiming `id: '/'` on one origin is asking iOS to
  treat the second install as a re-install of the first. `app/manifest.ts:25` currently sets
  `id: '/'` explicitly, so the admin manifest must set `id: '/admin'`.
- **`short_name` has ~12 characters.** `lib/pwa.ts:47-51` records that iOS truncates past roughly
  twelve, and `tests/pwa.install.test.ts:66` asserts it. `'Run Insights'` is exactly twelve, so an
  admin variant cannot be a suffix of it.
- **Two identical tiles are a usability regression, not a cosmetic one.** Both manifests would
  advertise `public/icons/icon-*.png` and both segments would inherit `app/apple-icon.png`. The
  user's stated motive is *"i use /admin page so much"* — a second tile they cannot tell apart from
  the first defeats it. This is why phase 2 exists.
- **The status-bar/translucency question stays shut.** `lib/pwa.ts:73-89` and
  `tests/pwa.install.test.ts:128-141` both hold `statusBarStyle: 'default'` on the grounds that the
  RUNNER's screens do not pad `--safe-top`. `appleWebApp` is a root-layout concern and the admin
  layout already pads all four insets, but flipping this value would flip it for the runner too —
  the meta tag is emitted once, from the root. Out of scope, and the existing assertion is the
  reminder.

---

## Analysis Scope

### Explicitly Mentioned Files

None. The target was inferred from the symptom.

### Discovered Related Files

| File | Why it is in scope |
|---|---|
| `app/manifest.ts` | the `start_url: '/'` that produces the symptom |
| `app/layout.tsx` | `metadata.manifest` — the one `<link rel="manifest">` every page inherits |
| `lib/pwa.ts` | `INSTALL`, `PWA_ICONS`, `APPLE_WEB_APP` — the single source of the install contract |
| `app/admin/layout.tsx` | the segment that must override `metadata.manifest` |
| `app/apple-icon.png`, `app/icon.png` | Next file conventions; the apple one is what Safari draws on install |
| `public/icons/icon-{192,512}.png`, `icon-maskable-512.png` | the manifest's advertised icons |
| `tools/make_icon_assets.py` | composes every shipped icon from `assets/icon/silhouette.png` |
| `tools/gen_app_icon.py` | generates the silhouette via OpenRouter — **not needed by this plan** |
| `tests/pwa.install.test.ts` | the existing install-contract guard |
| `tests/admin.shell.test.ts` | the precedent for asserting an admin-shell property by reading source |
| `lib/admin/requireAdmin.ts` | why `scope` may not narrow to `/admin` |
| `next.config.ts` | header policy; `/icons/*` is deliberately **not** `immutable` |
| `proxy.ts` | does not match `/admin/**`; irrelevant to the manifest fetch, confirmed |
| `components/push/PushSetupCard.tsx`, `lib/service-worker.js` | the registered worker's scope is `/`, shared by both installs |

---

## Current Dataflow

### Entry Point: the `<head>` of any page

**Location:** `app/layout.tsx:22-65`
**Trigger:** every server render
**Transform:** Next resolves `metadata` from the root layout downwards and emits, among others:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/apple-icon?<hash>" type="image/png" sizes="180x180" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Run Insights" />
```

`app/admin/layout.tsx:67-71` contributes `title` and `robots` and nothing else, so `/admin`
inherits the root's manifest link unchanged. **That inheritance is the bug.**

### Entry Point: `GET /manifest.webmanifest`

**Location:** `app/manifest.ts:20`
**Trigger:** the installer fetching the linked manifest
**Output:** `{ id: '/', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
name: 'Run Insights', short_name: 'Run Insights', background_color: '#c9e9fb',
theme_color: '#c9e9fb', icons: [3] }`
**Exit point:** Safari's Add to Home Screen sheet, which writes a tile whose launch URL is
`start_url` resolved against the manifest URL — `https://runins.site/`.

### How Next decides what a nested manifest and a nested icon do

Read out of the installed framework rather than assumed
(`node_modules/next/dist/lib/metadata/`):

| Fact | Evidence |
|---|---|
| the `manifest` FILE convention is root-of-`app` only | `is-metadata-route.js`: `new RegExp('^[\\\\/]manifest' + …)` — anchored at the app root. `/admin/manifest.webmanifest` does not match, so a directory of that name holding a `route.ts` is compiled as an **ordinary Route Handler**. Also stated in `docs/.../metadata/manifest.md`: *"in the **root** of `app` directory"*. |
| `metadata.manifest` from a deeper segment replaces the parent's | `generate-metadata.md` §Merging: *"Duplicate keys are replaced based on their ordering"*, root → nested → page |
| `icon` / `apple-icon` FILE conventions are valid at any depth | `app-icons.md` table: valid locations `app/**/*`. The regexes for both are unanchored: `[\\\\/]apple-icon\d?(-\w{6})?\.(jpg\|jpeg\|png)` |
| a nested `apple-icon` **replaces** the root's rather than adding to it | `resolve-metadata.js:126-137` — `mergeStaticMetadata` does `leafSegmentStaticIcons.apple = apple`, a plain assignment, walking root → leaf |
| a nested segment with no `icon.png` keeps the root's favicon link | same assignment is guarded by `if (icon)`, so the root's `app/icon.png` survives under `/admin` |
| an explicit `metadata.icons` **suppresses** the file-convention icons entirely | `resolve-metadata.js:817` — the leaf static icons are applied only `if (!resolvedMetadata.icons)`. **So the admin layout must not set `icons`.** |

### Data Persistence

None. No table, no cache, no blob. The install contract is static files and one Route Handler.

### Exit Points

The `<head>` of a server-rendered page, and one JSON response. No side effects.

---

## Key Data Structures

### `INSTALL`
**Location:** `lib/pwa.ts:60-68`
**Fields:** `name`, `shortName`, `description`, `paper`, `paperDark` — all `as const`
**Used In:** `app/manifest.ts` (5 reads), `app/layout.tsx` (4 reads), `tests/pwa.install.test.ts`

### `PWA_ICONS`
**Location:** `lib/pwa.ts:23-43`
**Fields:** a readonly tuple of `{ src, sizes, type, purpose: 'any' | 'maskable' }`
**Used In:** `app/manifest.ts:44` (spread, because `MetadataRoute.Manifest` wants mutable),
`tests/pwa.install.test.ts:87,97`

### `APPLE_WEB_APP`
**Location:** `lib/pwa.ts:91-99`
**Fields:** `capable: true`, `title`, `statusBarStyle: 'default'`
**Used In:** `app/layout.tsx:48` — root only, and it may stay that way.

### `MetadataRoute.Manifest`
**Location:** `next` types
**Note:** `app/manifest.ts` returns it. A Route Handler can be typed against the same type and
`Response.json()`'d, which keeps the admin manifest's field names checked by the compiler rather
than by hope.

---

## Dependencies

### Configuration

- `next.config.ts` — no header entry covers `/icons/*` or `/manifest.webmanifest`; both get Next's
  defaults, deliberately (`tools/make_icon_assets.py` header: *"Do not move these under `/badges/`:
  the header would pin a regenerated icon in every installed home screen for up to a year."*)
- No env var is involved. `lib/pwa.ts` opens with *"No runtime anything"* and that holds.

### External Services

None. `tools/gen_app_icon.py` reaches OpenRouter, and **this plan does not run it** — phase 2
composes the admin tile in `tools/make_icon_assets.py` from the silhouette already committed at
`assets/icon/silhouette.png`, so no image API call and no key are needed. `npm run
ci:openrouter-guard` continues to pass untouched.

### Implicit Dependencies

- **iOS ≥ 16.4** for `mobile-web-app-capable`; the manifest-driven `start_url` behaviour is the
  same generation. `app/layout.tsx:54-64` already keeps `apple-mobile-web-app-capable` as
  insurance for an older phone, and that insurance covers this feature too.
- **The registered service worker's scope is `/`** (`lib/service-worker.js:14-20`), so one worker
  serves both installed apps. Nothing to change: the push target is `/nina`, the notification tap
  opens the runner's app, and an admin tile is not a notification surface.

---

## Reference List

Every site that touches the install contract, so the phase split is built from evidence rather
than from feel.

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `manifest()` | `app/manifest.ts:20` | def | `app` |
| `start_url: '/'` | `app/manifest.ts:26` | config | `app` |
| `id: '/'` | `app/manifest.ts:25` | config | `app` |
| `scope: '/'` | `app/manifest.ts:32` | config | `app` |
| `metadata.manifest` | `app/layout.tsx:47` | config | `app` |
| `appleWebApp` | `app/layout.tsx:48` | config | `app` |
| `metadata` (admin) | `app/admin/layout.tsx:67-71` | config | `app/admin` |
| `INSTALL` | `lib/pwa.ts:60` | def | `lib` |
| `PWA_ICONS` | `lib/pwa.ts:23` | def | `lib` |
| `APPLE_WEB_APP` | `lib/pwa.ts:91` | def | `lib` |
| `app/icon.png` | file | asset | `app` |
| `app/apple-icon.png` | file | asset | `app` |
| `public/icons/icon-192.png` | file | asset | `public` |
| `public/icons/icon-512.png` | file | asset | `public` |
| `public/icons/icon-maskable-512.png` | file | asset | `public` |
| `assets/icon/silhouette.png` | file | asset (master input) | `assets` |
| `assets/icon/master.png` | file | asset (committed, inspectable) | `assets` |
| `MASTER_PX`, `SILHOUETTE`, `MASTER` | `tools/make_icon_assets.py:56-60` | def | `tools` |
| `icon:assets` | `package.json` scripts | config | root |
| the manifest suite | `tests/pwa.install.test.ts:50-83` | test | `tests` |
| the icon-files suite | `tests/pwa.install.test.ts:85-121` | test | `tests` |
| the root-layout suite | `tests/pwa.install.test.ts:148-173` | test | `tests` |
| `requireAdmin()` `redirect('/')` | `lib/admin/requireAdmin.ts:75` | impl (why scope stays `/`) | `lib/admin` |
| `AdminNav` `LINKS` | `components/admin/AdminNav.tsx:59-87` | impl (all five hrefs are `/admin*`) | `components/admin` |
| `/icons/*` header absence | `next.config.ts:33-111` | config | root |

**Not in the reference list, checked and confirmed irrelevant:** `proxy.ts` (does not match
`/admin/**` and never will — ruling D3), `app/robots.ts`, `public/og-default.png`, every `/api/*`
route, and `lib/push/*`.

---

## Impact Points (files that WILL need changes)

1. `lib/pwa.ts` — an `ADMIN_INSTALL` constant beside `INSTALL`, and `ADMIN_PWA_ICONS`. **Phase 1**
   (constant), extended in **phase 2** (icon paths).
2. `app/admin/manifest.webmanifest/route.ts` — new. The second manifest. **Phase 1.**
3. `app/admin/layout.tsx` — `metadata.manifest` pointing at it, plus `appleWebApp.title`. **Phase 1.**
4. `tests/pwa.install.test.ts` — assertions for the admin manifest and for the root's immobility.
   **Phase 1**, extended in **phase 2**.
5. `tools/make_icon_assets.py` — compose and emit the admin tile. **Phase 2.**
6. `app/admin/apple-icon.png`, `public/icons/admin-icon-{192,512}.png`,
   `public/icons/admin-icon-maskable-512.png`, `assets/icon/master-admin.png` — new committed
   assets. **Phase 2.**

**No file is edited by both phases except `lib/pwa.ts` and `tests/pwa.install.test.ts`**, and in
both cases phase 2 appends to what phase 1 wrote. Phase 2 therefore declares `depends_on: [1]` and
quotes those two files as they look after phase 1.

**This document describes. The plan files prescribe.**
