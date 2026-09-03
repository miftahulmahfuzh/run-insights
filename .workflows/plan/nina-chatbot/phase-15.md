# Phase 15: Admin — the desktop shell and her album

> ## ⚠ RECONCILIATION — binding rulings not yet folded into the body of this plan
>
> `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md` is **normative** and outranks anything
> below it. Two rulings change this plan structurally:
>
> - **E6 — `lib/nina/crop.ts` MOVES TO PHASE 13.** This plan's Steps 1–2 become **no-ops**: do not
>   create the file, `import` it from `@/lib/nina/crop` instead. Phase 13 lands first and cannot
>   import a file this phase creates — that was the plan set's one true ordering conflict, and this
>   is its resolution. Everything else about the crop control (the clamp, the circular preview, the
>   shared `ninaCropStyle` mapping) is unchanged and still yours.
> - **A5 — delete `CircleFrame`'s `NINA_AVATAR_FALLBACK_SRC` declaration** and import it from
>   `@/lib/nina/album` (phase 13). Two spellings of `/nina/avatar-001.png` is one too many.
> - **RU-18 — the admin upload's inability to re-anchor no longer matters.** Generation sends no
>   reference image, so the on-screen note explaining the divergence from the CLI should say the
>   anchor is inert for now, not that the page is the weaker tool.
> - **A6 — `NINA_BLOB_PREFIX` has one definition**; import it rather than re-declaring `'nina/'`.
> - **D3 — the `proxy.ts` matcher ruling** covers `/nina` and `/admin` together; see the sheet.


**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R23 — a desktop `/admin/nina` where the album is managed by hand: add a photo,
remove one, choose which is current, and zoom/reposition a face inside a circular frame
**Depends on:** Phase 1 (schema, `nina_avatars`, `lib/nina/queries.ts`, `adminEnv()` /
`isAdminEmail()`), Phase 12 (only for the optional "generate one now" link — see Step 9)
**Difficulty:** HARD
**Package:** `app/admin`, `lib/admin`, `components/admin`, plus one pure module in `lib/nina`

---

## Goal

After this phase the app has an admin surface: `runins.site/admin` and `runins.site/admin/nina`,
reachable only by a signed-in Google account whose email is in `ADMIN_EMAILS` (seeded
`mahfuzh74@gmail.com`), rendered in the app's **first deliberately-desktop layout** rather than in
a 470 px phone column. On `/admin/nina` the operator uploads a photo straight to Blob, sees it
described by `glm-4.6v` so R25 has something true to work from, drags and wheel-zooms it until
Nina's face sits centred in a circular frame, and saves that framing to
`nina_avatars.{crop_scale, crop_x, crop_y}` — where every other screen in the app reads it back
through **one** shared mapping function, so the circle in the admin tool and the circle in the chat
header are the same circle by construction rather than by coincidence.

The two things that were impossible before and are possible after: framing her face without
regenerating the image, and changing her current photo without a terminal.

## Two layout and interaction decisions, stated up front

These are the phase's two named risks, and both are answered here rather than discovered during
implementation.

### 1. The first desktop screen — what I decided, and why

`docs/design-brief.md:26-29` is explicit, and it is the reason there is no precedent to copy:

> Design **mobile-first for an iPhone XS Max — 414 × 896 CSS px** … **Desktop only needs to not
> look broken: centre the mobile column on a wide viewport.**

`components/ui/AppShell.tsx:32` hardcodes `max-w-[470px]` and pairs itself with `<TabBar />`. So the
admin group cannot use `AppShell`, and there is no wide-layout token to reach for. The decisions:

| Decision | Why |
|---|---|
| **`app/admin/layout.tsx` is a plain nested layout, NOT a `(group)` folder** | Parentheses exist to hide a URL segment or to declare a *second root layout*. `/admin` is a real segment I want in the URL, and a second root layout would mean duplicating `<html>`/`<body>`/`next/font` and taking a full page reload on every crossing between `/nina` and `/admin/nina` (`route-groups.md`, "Caveats → Full page load"). The root layout already supplies the font, the tokens and the viewport; this layout supplies the chrome. |
| **No `AppShell`, no `TabBar`, no `max-w-[470px]`** | Phase scope, and the tab bar's five cells are the runner's app. An admin tool that borrows the runner's chrome invites the runner to tap into it. |
| **Two-column shell: a 224 px fixed sidebar and a fluid work area, capped at `max-w-[1400px]` and centred** | The album manager's real content is *side by side*: a live circular preview and the album grid. Below `1024px` the sidebar collapses above the content (`lg:grid-cols-[224px_minmax(0,1fr)]`), so a phone still renders it usably without the layout pretending to be a phone app. The cap exists because a 3440 px-wide album grid is not more legible than a 1400 px one. |
| **Design tokens still apply in full** | `--paper`, `--paper-2`, `--card`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--accent`, `--radius-card`, `--shadow-card` and the dark-scheme media query are unchanged. `Card`, `Button`, `Field`/`Input` are reused as-is. **The layout is new; the palette is not**, which is what stops the admin pages from reading like a different product. |
| **Density is desktop density** | 14 px body text instead of the reading app's 17 px, `p-4` cards instead of `p-6`, a real `<table>`-shaped album list, hover states, and keyboard affordances (arrow keys nudge the crop, `+`/`-` zoom). The mobile rules that stay: `input { font-size: max(16px,1rem) }` from `globals.css` is global and is not overridden, and every interactive control keeps a ≥ 36 px hit box (the 44 px iOS floor is relaxed for a mouse, deliberately). |
| **No `--safe-bottom` padding, no `min-h-dvh` gymnastics** | There is no fixed chrome to clear. The sidebar is `sticky top-0`, which needs no inset. |
| **`components/admin/*` is a new component family, and nothing from it goes into `components/ui`** | `components/ui/index.ts`'s header names the primitive set the design brief defined. A sidebar and a crop studio are not primitives of the runner's design system; putting them in that barrel would make the next reader think the phone app has a sidebar. |

### 2. The crop control — all arithmetic in `lib/nina/crop.ts`, only plumbing in the component

Invariant 6 and `vitest.config.ts` (`environment: 'node'`, no jsdom, no `PointerEvent`) decide
this, and `lib/photos/gallery.ts` (carved out of `PhotoViewer.tsx`) and
`lib/photos/resizeTarget.ts` are the two precedents. So:

- **`lib/nina/crop.ts` is pure, zero-import, client- and server-importable, and unit-tested.** It
  owns: resolving a nullable DB triple into usable numbers, fitting an arbitrary aspect ratio into
  the circle, clamping so the image can never be dragged off its frame, converting pointer and
  wheel deltas into stored values, and **mapping stored values to CSS**.
- **`components/admin/CropStudio.tsx` owns pointer capture and nothing else.** It reads
  `event.clientX/clientY` and the frame's measured pixel size, hands them to a pure function, and
  writes the result to state. There is no arithmetic in the component beyond a subtraction of two
  pointer positions.
- **`ninaCropStyle()` is the single crop-to-CSS mapping in the repo.** The admin preview calls it;
  the chat header and her detail page must call the same function (see §Handoffs — the two-line
  edit to `components/nina/NinaAvatar.tsx` belongs to phase 13, because rendering her current
  avatar in the app serves R17/R19/R20, not R23). A second implementation of that mapping is the
  failure mode this phase is most exposed to, so the function is written to be the *only* way to
  turn `{scale,x,y}` into pixels, and the mapping uses **percentages of the frame only** — no `px`,
  no `transform` — so the same three numbers are correct at a 28 px bubble avatar and at a 512 px
  studio frame without either caller knowing the other's size.

### 3. Four consistency rulings this phase has to take, because the CLI already took them

Phase 14's `/update-nina-profpic` is the same operation from a terminal. A page and a CLI that
disagree is a bug waiting to happen, so each divergence is named and argued.

| Question | CLI (phase 14) | This page | Why |
|---|---|---|---|
| Does it **re-anchor** `assets/nina/_anchor.png`? (RU-16) | Always | **No, and it says so on screen** | `assets/nina/_anchor.png` is a **committed repo file**. A Vercel Function has a read-only filesystem and no working tree, so this page *cannot* re-anchor — not "chooses not to". Rather than leave that silent, the album card for the current photo carries one line of copy: *"Generated photos still use the committed anchor. To change the face she generates from, run `/update-nina-profpic` with this image."* The alternative — moving the anchor into Blob so both writers can update it — is a real fix and is a **Handoff to phase 12**, which owns the anchor read path. |
| Does it **make her speak**? (RU-17) | Yes — leaves `announced_at NULL` and pokes the cron | **Yes, identically** | `insertNinaAvatarAsCurrent` already inserts with `announced_at = null`, and phase 10 owns the `avatar_changed` trigger keyed on `is_current AND announced_at IS NULL`. **This phase writes no `nina_messages` row and composes no line.** It does not poke the cron either: a browser session is followed by the user opening `/nina` within seconds, and phase 10's `after()`/cron path will find the row. |
| Does **making an existing album photo current** announce? | n/a | **Yes** — it sets `announced_at = NULL` on the newly-current row | What the user perceives is "her face changed", and the cause is irrelevant to that. Re-arming `announced_at` is what makes the second and third swap announce as well as the first. |
| Does **saving a crop** announce? | n/a | **No** | Same photo, different framing. `updateNinaAvatarCrop` touches three columns and nothing else. |

### 4. What "zero current avatars" means — the question phase 1 left open

Phase 1 states it plainly (`phase-1.md:3031`): **no `nina_avatars` seed row is written**, and
`'seed'` exists in the source union for whoever decides otherwise. **This phase relies on that and
does not write one.** So:

- `getCurrentNinaAvatar(userId) === null` means *"use the committed constant"* —
  `public/nina/avatar-001.png`, which is what `components/nina/NinaAvatar.tsx` already renders
  (phase 4, `NINA_AVATAR_SRC`). An empty album is a valid, permanent state, not an error.
- **Zero current avatars while the album is non-empty is made unreachable, not repaired.** The
  current row **cannot be deleted**: the Remove control is disabled on it with the reason on
  screen, and `deleteNinaAvatarAction` refuses it server-side. Promotion-on-delete was rejected
  because "delete the current one and something else silently becomes her face" is a worse
  outcome than a refusal that names the fix ("make another photo current first"), and because
  auto-promotion means picking a winner, which is exactly the choice this page exists to give the
  user.
- Consequence, stated so it is not a surprise: once the album has one photo, it never drops back
  to zero rows. Emptying it completely is a database operation, not a UI one.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No file, no symbol, no config key.

**Renames:** nothing.

**Creates — `lib/nina/crop.ts`** (new file; **pure, zero imports**, client- and
server-importable — the `lib/extract/constants.ts` / `lib/photos/gallery.ts` rule):
`NINA_CROP_MIN_SCALE = 1`, `NINA_CROP_MAX_SCALE = 4`, `NINA_CROP_SCALE_DECIMALS = 3`,
`NINA_CROP_OFFSET_UNITS_PER_FRAME = 1000`, `NINA_CROP_MAX_ABS_OFFSET = 5_000`,
`NINA_CROP_KEY_STEP = 10`, `NINA_CROP_WHEEL_DIVISOR = 400`,
`NINA_CROP_WHEEL_MAX_FACTOR = 2`, `NINA_CROP_IDENTITY`;
functions `resolveCrop`, `isIdentityCrop`, `cropSpanPct`, `maxCropOffset`, `clampCrop`,
`panCrop`, `zoomCrop`, `zoomFactorForWheel`, `nudgeCrop`, `ninaCropStyle`, `cropForWrite`;
types `NinaCrop`, `NinaCropInput`, `NinaNaturalSize`, `NinaCropStyle`, `NinaCropSpan`.

**`ninaCropStyle(natural, crop)` is the ONE crop-to-CSS mapping in the repo.** Phases 13 and 4
must render her circular avatar through it rather than through their own arithmetic; the exact edit
is written out in §Handoffs.

**Creates — `lib/nina/crop.test.ts`:** pure-unit coverage (co-located `lib/**/*.test.ts`, which
`vitest.config.ts:37` includes).

**Creates — `lib/admin/requireAdmin.ts`** (`server-only`):
`requireAdmin()`, `requireAdminApi()`, `getAdminIdentity()`, `AdminForbiddenError`,
`forbiddenJson()`; type `AdminIdentity` (`{ userId: string; email: string }`).

- `requireAdmin(): Promise<AdminIdentity>` — for **Server Components and Server Actions**. No
  session → `redirect('/')` (identical to `requireUserId()`). Session but not an admin email →
  **`notFound()`**.
- `requireAdminApi(): Promise<AdminIdentity>` — for **Route Handlers**. Throws
  `UnauthorizedError` (phase F02's existing class, re-thrown not redefined) when signed out and
  `AdminForbiddenError` (status 404) when signed in and not an admin.
- **The refusal is a 404, and that is deliberate.** Phase 1's own `.env.example` copy says *"THE
  GOOGLE ACCOUNT YOU SIGN IN WITH MUST APPEAR HERE or those pages 404"*, and its `lib/env.ts`
  header calls a 404 "the correct symptom". `forbidden()` and `unauthorized()` are Next 16
  interrupts behind the **experimental `authInterrupts` flag**, and
  `lib/auth/requireUserId.ts:57-60` already rejects that flag by name under "no feature flags" —
  so using them here would reverse a documented decision. A redirect to `/` was rejected too: it
  would bounce the admin's own mistyped URL to the runs list with no explanation.

**Creates — `lib/admin/avatars.ts`** (pure, zero imports — the picker, the Route Handler, the
Server Action and the test all read it):
`ADMIN_AVATAR_PREFIX = 'nina/'`, `ADMIN_AVATAR_EXTS`, `ADMIN_AVATAR_CONTENT_TYPES`,
`ADMIN_AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024`, `ADMIN_AVATAR_MIN_EDGE_PX = 256`,
`ADMIN_AVATAR_MAX_EDGE_PX = 12_000`, `ADMIN_AVATAR_ID_RE`, `ADMIN_AVATAR_TOKEN_TTL_MS`,
`ADMIN_AVATAR_CACHE_MAX_AGE`; functions `adminAvatarPathname(userId, id, ext)`,
`extForContentType(contentType)`, `isAdminAvatarRequestPathname(pathname, userId)`;
types `AdminAvatarExt`, `AdminAvatarContentType`.

**Creates — `lib/admin/schema.ts`** (Zod, client-safe):
`cropWriteSchema`, `avatarRegisterSchema`, `avatarIdSchema`; types `CropWrite`, `AvatarRegister`.
This is the range validation phase 1 explicitly deferred to this phase
(`lib/nina/queries.ts`'s `updateNinaAvatarCrop` docstring: *"No range validation here … belongs to
a Zod schema phase 15 owns"*).

**Creates — `lib/admin/ninaAlbumActions.ts`** (`'use server'`):
`registerNinaAvatarAction`, `setCurrentNinaAvatarAction`, `saveNinaAvatarCropAction`,
`deleteNinaAvatarAction`, `describeNinaAvatarAction`; type `AdminActionResult`.

**Creates — `lib/nina/queries.ts` (TWO functions APPENDED to a phase-1 file):**
`setCurrentNinaAvatar(userId, id)` and `deleteNinaAvatar(userId, id)`. Phase 1's avatar section
ships five readers/writers and neither of these; the album manager cannot exist without both.
They are appended beside their five siblings rather than put in a second module, because two
data-access homes for one table is worse than one additive edit to a landed file. **Both take
`userId` first** (invariant 7 / `ci:data-layer-guard`'s rule, which greps `lib/db/queries.ts` only
but is obeyed here anyway). Exact bodies in Step 4.

**Creates — routes and components:**

- `app/admin/layout.tsx` — the desktop shell (`LayoutProps<'/admin'>`).
- `app/admin/page.tsx` — the admin index (`/admin`), a two-card hub. Phase 16 appends its card.
- `app/admin/nina/page.tsx` — the album manager (`PageProps<'/admin/nina'>`),
  `export const dynamic = 'force-dynamic'`.
- `app/api/admin/nina/upload/route.ts` — `POST`, the Vercel Blob client-upload handshake for admin
  avatars. **A separate route, deliberately: it does not touch `app/api/upload/route.ts`**, which
  phase 6 edits for chat images. Different auth rule (admin, not merely signed-in), different size
  cap, different content types, different pathname regex — one more branch in the shared route
  would have needed all four to be conditional on the branch.
- `components/admin/AdminNav.tsx` — `AdminNav` (the sidebar; phase 16 adds one array entry).
- `components/admin/AlbumManager.tsx` — `AlbumManager` (`'use client'`), types `AlbumPhoto`.
- `components/admin/CropStudio.tsx` — `CropStudio` (`'use client'`).
- `components/admin/CircleFrame.tsx` — `CircleFrame` (the circular preview; presentational,
  server- and client-renderable, and the only markup that reads `ninaCropStyle`).
- `components/admin/UploadAvatar.tsx` — `UploadAvatar` (`'use client'`).
- `tests/admin.avatars.test.ts` — pathname/content-type/schema coverage.

**Signature changes:** **none to any existing exported symbol.** Every edit in this phase is a new
file or an append. The two exceptions worth naming, because they are additive edits to existing
files:

- `package.json` — no change. No dependency is added (`@vercel/blob` 2.8.0 already exports both
  `handleUpload` and `del`; `zod`, `nanoid` and `next/image` are all present).
- `proxy.ts` — **no change, verified.** Its matcher is positive and enumerated
  (`['/upload','/r/:path*','/x/:path*','/trends','/me','/onboarding']`), and its own header says it
  is a UX redirect and *not* the security boundary. Adding `/admin/:path*` would only buy a
  signed-out human a nicer bounce; `requireAdmin()` already gives them `redirect('/')` and the
  `?next=` parameter is not read by anything on `/`. Leaving it out also keeps the matcher's
  "adding a protected page means adding a line here" comment honest rather than half-true, since
  `/nina` (phase 4) faces the same choice. **Recorded as a Handoff, not a change**, so the
  reconciler can rule once for `/nina` and `/admin` together instead of twice.
- `auth.config.ts` — **no change.** D8 says any Google account may sign in; admin-ness is an
  authorisation question answered per page, not a `signIn` gate.

**Requires (from earlier phases):**

- **Phase 1 — `lib/env.ts` exports `isAdminEmail(email: string | null | undefined): boolean`** and
  `adminEnv()`, with `ADMIN_EMAILS` seeded `mahfuzh74@gmail.com`. Case-insensitive,
  comma-separated, `null`/`''` fail closed. Used by exactly one file, `lib/admin/requireAdmin.ts`.
- **Phase 1 — `nina_avatars` with `crop_scale numeric(5,3)`, `crop_x integer`, `crop_y integer`,
  `description text`, all nullable**, and the documented convention: `crop_scale` is a multiple of
  the **cover** fit (`1.000` = smallest scale that fills the circle), `crop_x`/`crop_y` are the
  image centre's offset from the frame centre in **thousandths of the frame's width**, positive x
  right and positive y down, all three NULL = no transform, a partial triple reads missing offsets
  as 0. **`lib/nina/crop.ts` implements exactly that convention and nothing else.**
- **Phase 1 — `lib/nina/queries.ts` exports `listNinaAvatars`, `getCurrentNinaAvatar`,
  `insertNinaAvatarAsCurrent`, `updateNinaAvatarCrop`, `setNinaAvatarDescription`** with the
  signatures at `phase-1.md:1951-2100`, and the types `NinaAvatarRow`, `NinaAvatarInsert`,
  `NinaAvatarCrop`, `NinaAvatarSource` (which must include `'admin'`).
- **Phase 1 — the partial unique index `nina_avatars_user_current_unq on (user_id) where
  is_current`**, and the un-current-then-insert statement order it forces. `setCurrentNinaAvatar`
  in Step 4 obeys the same order for the same reason.
- **Phase 1 — `lib/id.ts`'s `newId()`** (nanoid(12)) and `lib/cn.ts`'s `cn()`. Both already exist.
- **Phase 6 (soft) — `lib/nina/vision.ts` exports
  `describeNinaImages(refs: readonly NinaImageRef[], opts?): Promise<NinaDescribeResult>`** where
  `NinaImageRef` is `{ blobUrl: string; pathname: string }`. Phase 6 is not in this phase's
  `depends_on`, so **Step 7 imports it behind a narrow local interface and one `await import()`**,
  and an upload lands with `description = null` plus a visible "Describe" button if the module is
  absent. If phase 6 has landed — it will have, it is phase 6 — the describe runs automatically on
  upload and the button is the retry.
- **Phase 12 (soft) — an avatar generation entry point.** Only used for one link on the page
  ("generate one instead"), which is rendered only when the module resolves. Nothing in this phase
  generates an image.
- **Phase 6 (naming) — `NINA_BLOB_PREFIX = 'nina/'` in `lib/nina/images.ts`.**
  `ADMIN_AVATAR_PREFIX` here has the same value. If the reconciler prefers one constant,
  `lib/admin/avatars.ts` should import phase 6's; the value must not diverge.
- **Phase 14 (naming) — `nina/<userId>/avatar-<nanoid12>.jpg`.** This phase writes
  `nina/<userId>/avatar-<nanoid12>.<jpg|png|webp>` — the same shape, three extensions instead of
  one, because an admin upload is not re-encoded (see Step 5's argument). `blob-reap.mjs` knows
  neither; that is phase 14's already-filed handoff.

**Leaves alone (owned by others):**

- `app/nina/**`, `components/nina/**` — phases 4, 6, 7, 8, 13. **In particular
  `components/nina/NinaAvatar.tsx` is NOT edited here**; the two-line change that routes it through
  `ninaCropStyle` is written out in §Handoffs for phase 13, whose R17/R19/R20 it serves.
- `app/api/upload/route.ts` — phase 6. This phase adds its own route instead.
- `lib/nina/{turn,tools,context,load,persona,memory,patterns,nags,proactive,imagegen,vision,images,actions}.ts`
  and `lib/nina/prompts/**` — phases 2, 3, 5, 6, 9, 10, 12. `lib/nina/queries.ts` gains two
  appended functions and nothing else; `lib/nina/crop.ts` is a new file in that directory (the same
  move phase 6 makes with `lib/nina/prompts/describe.ts`).
- `app/admin/memory/**` and any memory query — phase 16. It reuses `requireAdmin()`,
  `app/admin/layout.tsx` and `AdminNav`'s array; this phase writes neither the page nor its
  actions.
- `assets/nina/_anchor.png` and `public/nina/avatar-001.png` — phase 1's, and untouched. See §3.
- `components/ui/**` — reused (`Card`, `Button`, `Input`, `Field`, `EmptyState`), not edited, and
  nothing is added to `components/ui/index.ts`.
- `lib/photos/**` — `gallery.ts` and `resizeTarget.ts` are read as precedent and not touched;
  `compressForNina.ts` is phase 6's and is deliberately not used (Step 5).
- `scripts/check-*.mjs` — none needs an edit. Verified: `check-client-secret-boundary.mjs`'s
  `SECRETS` list does not contain `ADMIN_EMAILS`, no file here is `'use client'` *and* names a
  secret, no file reads `process.env.*` directly, and nothing is `NEXT_PUBLIC_`-prefixed;
  `check-data-layer-invariants.mjs` reads only `lib/db/queries.ts`;
  `check-llm-payload-boundary.mjs` guards `getOrCreateInsight` and `runNinaTurn`, neither of which
  is called here; `check-openrouter-boundary.mjs` scans for OpenRouter usage and this phase has
  none.
- `proxy.ts`, `auth.config.ts`, `auth.ts`, `next.config.ts` (its `remotePatterns` already covers
  `**.public.blob.vercel-storage.com`), `vercel.json`, `package.json`.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/crop.ts` | create | the whole crop transform: resolve, fit, clamp, pan, zoom, and the one CSS mapping |
| `lib/nina/crop.test.ts` | create | ~30 pure cases, including the two that would have shipped a silent bug |
| `lib/nina/queries.ts` | modify | **append two functions** at the end of the avatar section (after `setNinaAvatarDescription`, `phase-1.md` Step 6 §avatars): `setCurrentNinaAvatar`, `deleteNinaAvatar` |
| `lib/admin/requireAdmin.ts` | create | the gate: `requireAdmin`, `requireAdminApi`, `getAdminIdentity`, `AdminForbiddenError`, `forbiddenJson` |
| `lib/admin/avatars.ts` | create | pathname shape, extensions, size caps — pure, shared by picker + route + action + test |
| `lib/admin/schema.ts` | create | `cropWriteSchema`, `avatarRegisterSchema`, `avatarIdSchema` — the bounds phase 1 deferred |
| `lib/admin/ninaAlbumActions.ts` | create | five Server Actions, each opening with `requireAdmin()` |
| `app/admin/layout.tsx` | create | the desktop shell — sidebar + fluid work area, no `AppShell`, no `TabBar` |
| `app/admin/page.tsx` | create | `/admin`, the hub |
| `app/admin/nina/page.tsx` | create | `/admin/nina`, loads the album and renders `AlbumManager` |
| `app/api/admin/nina/upload/route.ts` | create | admin-gated Blob client-upload handshake |
| `components/admin/AdminNav.tsx` | create | the sidebar; one array phase 16 appends to |
| `components/admin/CircleFrame.tsx` | create | the circular preview — the only markup reading `ninaCropStyle` |
| `components/admin/CropStudio.tsx` | create | pointer/wheel/keyboard plumbing, zero arithmetic |
| `components/admin/UploadAvatar.tsx` | create | pick → measure → PUT to Blob → register |
| `components/admin/AlbumManager.tsx` | create | the grid, the selection, the four actions, the pending states |
| `tests/admin.avatars.test.ts` | create | pathname regex, content-type mapping, the three Zod schemas |

Seventeen files against the index's estimate of ~11. The extra six are the consequences of the two
risks: the pure crop module and its test exist because the arithmetic must be provable without a
browser, and `avatars.ts` / `schema.ts` / the dedicated upload route exist because an admin upload
cannot borrow phase 6's chat-image path (different auth, different caps, different types).

---

## Implementation Steps

### Step 1: `lib/nina/crop.ts` — the whole transform, pure

**File:** `lib/nina/crop.ts` (new)

**Change:** implement phase 1's stored convention as pure functions. This module is the answer to
risk 2, and every number the studio produces or consumes passes through it.

**Code:**

```ts
/**
 * The circular-frame transform (R23), as pure arithmetic.
 *
 * ── WHY THIS IS A MODULE AND NOT A COMPONENT ─────────────────────────────────────────────────
 * `/admin/nina` is the only free-form direct-manipulation UI in this repo, and `vitest.config.ts`
 * runs `environment: 'node'`: no jsdom, no `PointerEvent`, no `getBoundingClientRect`. So the
 * clamping, the aspect fit, the gesture conversion and the CSS mapping all live here where they
 * can be proven, and `components/admin/CropStudio.tsx` is left holding two pointer positions and
 * a subtraction. This is the same carve-out as `lib/photos/gallery.ts` out of `PhotoViewer.tsx`
 * and `lib/photos/resizeTarget.ts` out of `compressForExtraction.ts`, for the same stated reason.
 *
 * Zero imports, so a `'use client'` component, a Server Action, a Server Component and the unit
 * suite can all read it — the `lib/extract/constants.ts` rule.
 *
 * ── THE STORED CONVENTION (phase 1 owns it; this module implements it) ───────────────────────
 * `nina_avatars.crop_scale` is a multiple of the **cover** fit: `1.000` is the smallest scale that
 * still fills the circle, `1.500` is 50% further in. `crop_x` / `crop_y` are the image centre's
 * offset from the frame centre in **thousandths of the frame's width**, positive x right, positive
 * y down. All three NULL means "no transform" — render `object-cover`, centred. A partial triple
 * reads a missing scale as 1 and missing offsets as 0 rather than throwing.
 *
 * ── WHY THE FRAME IS ASSUMED SQUARE ──────────────────────────────────────────────────────────
 * A circle is inscribed in a square box, so frame width == frame height at every call site, and
 * `top: N%` (which resolves against the containing block's HEIGHT) is therefore the same unit as
 * `left: N%` (which resolves against its WIDTH). That equality is what lets one stored offset unit
 * — thousandths of the frame's *width* — position both axes. **Every caller must render the frame
 * in a square box** (`size-7`, `size-11`, `h-[512px] w-[512px]`, `aspect-square`); a non-square
 * box would silently stretch the y offset. `CircleFrame` is the component that guarantees it.
 *
 * ── WHY PERCENTAGES AND NOT `transform: translate()` ─────────────────────────────────────────
 * A percentage `translate()` resolves against the ELEMENT's own box, not its container's — so a
 * translate-based mapping would need the frame's pixel size at every call site, and the 28 px
 * bubble avatar and the 512 px studio frame would each have to know their own size to agree. With
 * `width`/`height`/`left`/`top` all expressed as percentages of the frame, the same three stored
 * numbers are correct at any size, with no measurement anywhere. That property is the reason the
 * admin preview and the chat header cannot drift.
 */

/** The resolved transform: never null, always usable. */
export interface NinaCrop {
  /** Multiple of the cover fit. >= NINA_CROP_MIN_SCALE. */
  scale: number
  /** Thousandths of the frame's width, positive = image moves right. Integer. */
  x: number
  /** Thousandths of the frame's width, positive = image moves down. Integer. */
  y: number
}

/** What the database hands back: any of the three may be NULL. */
export interface NinaCropInput {
  scale: number | null
  x: number | null
  y: number | null
}

/** The image's intrinsic pixel size. `nina_avatars.width`/`height` may be NULL, hence the union. */
export interface NinaNaturalSize {
  width: number | null
  height: number | null
}

/** The rendered image's size in frame-widths, before offsets. Both >= 100. */
export interface NinaCropSpan {
  widthPct: number
  heightPct: number
}

/**
 * The inline style for the `<img>` inside a square, `overflow-hidden`, `rounded-pill` box.
 * Deliberately a plain object of strings rather than `React.CSSProperties`, so this module keeps
 * its zero imports and stays assertable with `toEqual`.
 */
export interface NinaCropStyle {
  position: 'absolute'
  width: string
  height: string
  left: string
  top: string
  objectFit: 'cover'
}

/** `1.000` is cover. Below it the image would not fill the circle, so it is the floor. */
export const NINA_CROP_MIN_SCALE = 1

/**
 * 4x cover. Chosen against the real source: the anchor is 1792x2400, so 4x cover renders a
 * 1792 px-wide face into a 512 px studio frame at 448 px of source per 128 px of screen — still
 * sharp. A higher ceiling only offers the operator a way to make her face a blur.
 */
export const NINA_CROP_MAX_SCALE = 4

/** `numeric(5,3)` — three decimals is what the column stores, so it is what we round to. */
export const NINA_CROP_SCALE_DECIMALS = 3

/** Offsets are thousandths of the frame's width. Phase 1's column comment, as a constant. */
export const NINA_CROP_OFFSET_UNITS_PER_FRAME = 1000

/**
 * A hard cap the server can apply WITHOUT knowing the image's dimensions.
 * `clampCrop` is exact when `width`/`height` are known; this is the fallback for a row whose
 * dimension columns are NULL, and it is generous on purpose — at the 4x ceiling a 1:6 panorama's
 * legitimate x range is +/-4900.
 */
export const NINA_CROP_MAX_ABS_OFFSET = 5_000

/** One arrow-key press: 10 thousandths = 1% of the frame. Fine enough to centre an eye. */
export const NINA_CROP_KEY_STEP = 10

/** Wheel sensitivity: `deltaY` of 400 (about three notches) is one e-fold of zoom. */
export const NINA_CROP_WHEEL_DIVISOR = 400

/** No single wheel event may more than double or halve the scale — trackpads emit huge deltas. */
export const NINA_CROP_WHEEL_MAX_FACTOR = 2

/** "No transform", as the value every pre-phase-15 row means. */
export const NINA_CROP_IDENTITY: NinaCrop = { scale: NINA_CROP_MIN_SCALE, x: 0, y: 0 }

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * A stored triple (or nothing at all) as usable numbers.
 *
 * The partial-triple rule is phase 1's, quoted: *"A renderer must treat a partial triple (scale
 * set, offsets NULL) as offsets of zero rather than as an error."* NaN, Infinity and a
 * below-cover scale are all folded into the identity too — a renderer that throws on bad data
 * shows the user a broken page, and this data has three writers.
 */
export function resolveCrop(input: NinaCropInput | null | undefined): NinaCrop {
  if (input == null) return { ...NINA_CROP_IDENTITY }
  return {
    scale: Math.max(NINA_CROP_MIN_SCALE, finiteOr(input.scale, NINA_CROP_MIN_SCALE)),
    x: Math.round(finiteOr(input.x, 0)),
    y: Math.round(finiteOr(input.y, 0)),
  }
}

/** True when this crop renders exactly as plain centred `object-cover`. */
export function isIdentityCrop(crop: NinaCrop): boolean {
  return crop.scale === NINA_CROP_MIN_SCALE && crop.x === 0 && crop.y === 0
}

/**
 * How much of the frame the rendered image spans, per axis, in percent — the aspect fit.
 *
 * At `scale = 1` the SHORT edge is exactly 100% (that is what "cover" means) and the long edge
 * overflows by the aspect ratio. An unknown or implausible natural size degrades to a square:
 * `{100, 100}` renders as plain `object-cover`, which is the honest answer when we do not know
 * the shape of the file.
 */
export function cropSpanPct(natural: NinaNaturalSize, crop: NinaCrop): NinaCropSpan {
  const w = finiteOr(natural.width, 0)
  const h = finiteOr(natural.height, 0)
  if (w <= 0 || h <= 0) return { widthPct: 100 * crop.scale, heightPct: 100 * crop.scale }
  const short = Math.min(w, h)
  return {
    widthPct: (w / short) * crop.scale * 100,
    heightPct: (h / short) * crop.scale * 100,
  }
}

/**
 * The furthest the image centre may sit from the frame centre, per axis, in stored units —
 * i.e. **the clamp that makes dragging the image off its frame impossible.**
 *
 * The frame must stay fully covered, so the image's left edge may not cross 0% and its right edge
 * may not cross 100%:
 *
 *     left  = 50 + x/10 - widthPct/2 <= 0     ->  x <=  10 * (widthPct/2 - 50)
 *     right = 50 + x/10 + widthPct/2 >= 100   ->  x >= -10 * (widthPct/2 - 50)
 *
 * so `|x| <= 5 * widthPct - 500`. At `scale = 1` on a portrait image that is exactly 0 for x — the
 * width already fits the frame precisely, so there is nowhere to slide horizontally, which is
 * correct and is the case a naive implementation gets wrong by allowing a sliver of background.
 *
 * `Math.max(0, ...)` guards the sub-cover case, which `resolveCrop` already prevents.
 */
export function maxCropOffset(natural: NinaNaturalSize, crop: NinaCrop): { x: number; y: number } {
  const { widthPct, heightPct } = cropSpanPct(natural, crop)
  return {
    x: Math.max(0, Math.floor(widthPct * 5 - 500)),
    y: Math.max(0, Math.floor(heightPct * 5 - 500)),
  }
}

/**
 * The only way a crop becomes valid. Scale into `[MIN, MAX]` and rounded to the column's three
 * decimals FIRST, because the offset bounds depend on it — clamping offsets against the old scale
 * and then changing the scale is how a zoom-out leaves a corner of background showing.
 */
export function clampCrop(natural: NinaNaturalSize, crop: NinaCrop): NinaCrop {
  const scale = round(
    Math.min(NINA_CROP_MAX_SCALE, Math.max(NINA_CROP_MIN_SCALE, finiteOr(crop.scale, 1))),
    NINA_CROP_SCALE_DECIMALS,
  )
  const limit = maxCropOffset(natural, { ...crop, scale })
  const clamp = (value: number, max: number) =>
    Math.round(Math.min(max, Math.max(-max, finiteOr(value, 0))))
  return { scale, x: clamp(crop.x, limit.x), y: clamp(crop.y, limit.y) }
}

/**
 * A drag: pointer deltas in CSS px against a frame of `framePx` px, converted to stored units and
 * clamped. The image follows the pointer, so a rightward drag increases x.
 *
 * `framePx <= 0` returns the crop untouched rather than dividing by zero — a component can be
 * asked for a pointer move before layout has measured the frame.
 */
export function panCrop(
  natural: NinaNaturalSize,
  crop: NinaCrop,
  dxPx: number,
  dyPx: number,
  framePx: number,
): NinaCrop {
  if (!Number.isFinite(framePx) || framePx <= 0) return crop
  const perUnit = NINA_CROP_OFFSET_UNITS_PER_FRAME / framePx
  return clampCrop(natural, {
    scale: crop.scale,
    x: crop.x + finiteOr(dxPx, 0) * perUnit,
    y: crop.y + finiteOr(dyPx, 0) * perUnit,
  })
}

/**
 * A zoom about the FRAME CENTRE, which is where the face is being aimed.
 *
 * ── WHY THE OFFSETS SCALE TOO ────────────────────────────────────────────────────────────────
 * The image point currently under the frame centre sits at some image-relative position `p`; its
 * frame position is `imageCentre + p * s`. Holding it still while the scale becomes `s * k`
 * requires the centre offset to become `k` times what it was. Leaving x and y alone instead —
 * the obvious implementation — makes the picture appear to slide away from the crosshair as you
 * zoom in, which is the single most common bug in a crop widget.
 */
export function zoomCrop(natural: NinaNaturalSize, crop: NinaCrop, factor: number): NinaCrop {
  const k = finiteOr(factor, 1)
  if (k <= 0) return crop
  return clampCrop(natural, { scale: crop.scale * k, x: crop.x * k, y: crop.y * k })
}

/**
 * A wheel/trackpad `deltaY` as a multiplicative zoom factor. Up (negative delta) zooms in.
 * Exponential, so zoom feels linear per notch at every scale, and hard-capped both ways because a
 * momentum trackpad can emit a `deltaY` of several hundred in one event.
 */
export function zoomFactorForWheel(deltaY: number): number {
  const raw = Math.exp(-finiteOr(deltaY, 0) / NINA_CROP_WHEEL_DIVISOR)
  return Math.min(NINA_CROP_WHEEL_MAX_FACTOR, Math.max(1 / NINA_CROP_WHEEL_MAX_FACTOR, raw))
}

/** An arrow-key nudge, in stored units. The keyboard path to the same clamp. */
export function nudgeCrop(
  natural: NinaNaturalSize,
  crop: NinaCrop,
  dx: number,
  dy: number,
): NinaCrop {
  return clampCrop(natural, { scale: crop.scale, x: crop.x + dx, y: crop.y + dy })
}

/**
 * **THE ONE CROP-TO-CSS MAPPING IN THE REPO.** The admin studio's preview, the album grid's
 * thumbnails, the chat header's 44 px avatar and the typing row's 28 px avatar must all render
 * through this function. Two implementations of it means a crop that looks centred in the tool and
 * off-centre in the app, with nothing failing anywhere — the exact silent failure R23 exists to
 * prevent.
 *
 * Usage — the box MUST be square, `relative` and `overflow-hidden`:
 *
 *     <span className="relative block size-11 overflow-hidden rounded-pill bg-paper-2">
 *       <img src={url} alt="" style={ninaCropStyle({ width, height }, resolveCrop(row))} />
 *     </span>
 *
 * The identity crop returns `{100%, 100%, 0%, 0%}` for a square image and a correctly
 * cover-centred box for any other aspect ratio, so a row with NULL crop columns renders exactly as
 * `object-cover` did before this phase existed. That equality is asserted in the test suite and is
 * what makes the whole album safe to leave un-backfilled.
 */
export function ninaCropStyle(natural: NinaNaturalSize, crop: NinaCrop): NinaCropStyle {
  const { widthPct, heightPct } = cropSpanPct(natural, crop)
  const offsetPct = (units: number) => units / (NINA_CROP_OFFSET_UNITS_PER_FRAME / 100)
  const pct = (value: number) => `${round(value, 4)}%`
  return {
    position: 'absolute',
    width: pct(widthPct),
    height: pct(heightPct),
    left: pct(50 + offsetPct(crop.x) - widthPct / 2),
    top: pct(50 + offsetPct(crop.y) - heightPct / 2),
    objectFit: 'cover',
  }
}

/**
 * What to persist. An identity crop is written as three NULLs, so the "Reset framing" button and
 * "Save framing" are one code path and one query — phase 1's `updateNinaAvatarCrop` docstring
 * makes exactly that promise, and this is the function that keeps it.
 */
export function cropForWrite(crop: NinaCrop): NinaCropInput {
  if (isIdentityCrop(crop)) return { scale: null, x: null, y: null }
  return { scale: crop.scale, x: crop.x, y: crop.y }
}
```

**Impact:** one new pure module, no existing file touched. It is the only place in the repo that
knows what `crop_scale` means.

---

### Step 2: `lib/nina/crop.test.ts` — the arithmetic, proved without a browser

**File:** `lib/nina/crop.test.ts` (new; `vitest.config.ts:37` includes `lib/**/*.test.ts`)

**Change:** the suite that makes Step 1 trustworthy. Every number below was computed by hand from
the real anchor's dimensions (1792x2400, `phase-1.md:212`), so a failure here is a real
disagreement and not a rounding argument.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  NINA_CROP_IDENTITY,
  NINA_CROP_MAX_SCALE,
  NINA_CROP_MIN_SCALE,
  clampCrop,
  cropForWrite,
  cropSpanPct,
  isIdentityCrop,
  maxCropOffset,
  ninaCropStyle,
  nudgeCrop,
  panCrop,
  resolveCrop,
  zoomCrop,
  zoomFactorForWheel,
} from './crop'

/** Her anchor, and therefore the shape of every generated and hand-uploaded photo so far. */
const PORTRAIT = { width: 1792, height: 2400 }
const LANDSCAPE = { width: 4000, height: 3000 }
const SQUARE = { width: 1024, height: 1024 }

describe('resolveCrop', () => {
  it('reads all-NULL as the identity — phase 1 s "no transform" row', () => {
    expect(resolveCrop({ scale: null, x: null, y: null })).toEqual(NINA_CROP_IDENTITY)
    expect(resolveCrop(null)).toEqual(NINA_CROP_IDENTITY)
    expect(resolveCrop(undefined)).toEqual(NINA_CROP_IDENTITY)
  })

  it('reads a PARTIAL triple as offsets of zero, not as an error', () => {
    expect(resolveCrop({ scale: 1.5, x: null, y: null })).toEqual({ scale: 1.5, x: 0, y: 0 })
    expect(resolveCrop({ scale: null, x: 40, y: -10 })).toEqual({ scale: 1, x: 40, y: -10 })
  })

  it('folds nonsense into the identity rather than throwing', () => {
    expect(resolveCrop({ scale: Number.NaN, x: Number.POSITIVE_INFINITY, y: 0 })).toEqual(
      NINA_CROP_IDENTITY,
    )
    expect(resolveCrop({ scale: 0.25, x: 0, y: 0 }).scale).toBe(NINA_CROP_MIN_SCALE)
  })
})

describe('cropSpanPct — the aspect fit', () => {
  it('puts the SHORT edge at exactly 100% at cover scale', () => {
    expect(cropSpanPct(PORTRAIT, NINA_CROP_IDENTITY).widthPct).toBeCloseTo(100, 6)
    expect(cropSpanPct(PORTRAIT, NINA_CROP_IDENTITY).heightPct).toBeCloseTo(133.9286, 4)
    expect(cropSpanPct(LANDSCAPE, NINA_CROP_IDENTITY)).toEqual({ widthPct: 400 / 3, heightPct: 100 })
    expect(cropSpanPct(SQUARE, NINA_CROP_IDENTITY)).toEqual({ widthPct: 100, heightPct: 100 })
  })

  it('scales both axes together', () => {
    const span = cropSpanPct(PORTRAIT, { scale: 2, x: 0, y: 0 })
    expect(span.widthPct).toBeCloseTo(200, 6)
    expect(span.heightPct).toBeCloseTo(267.8571, 4)
  })

  it('degrades an unknown natural size to a square instead of dividing by zero', () => {
    expect(cropSpanPct({ width: null, height: null }, NINA_CROP_IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
    expect(cropSpanPct({ width: 0, height: 900 }, NINA_CROP_IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
  })
})

describe('maxCropOffset — the image can never leave its frame', () => {
  it('allows NO horizontal travel on a portrait at cover scale', () => {
    expect(maxCropOffset(PORTRAIT, NINA_CROP_IDENTITY)).toEqual({ x: 0, y: 169 })
  })

  it('allows NO vertical travel on a landscape at cover scale', () => {
    expect(maxCropOffset(LANDSCAPE, NINA_CROP_IDENTITY)).toEqual({ x: 166, y: 0 })
  })

  it('pins a square at cover scale completely', () => {
    expect(maxCropOffset(SQUARE, NINA_CROP_IDENTITY)).toEqual({ x: 0, y: 0 })
  })

  it('opens up as the scale rises', () => {
    expect(maxCropOffset(PORTRAIT, { scale: 2, x: 0, y: 0 })).toEqual({ x: 500, y: 839 })
  })
})

describe('clampCrop', () => {
  it('holds the scale inside [1, MAX] and rounds to the column s three decimals', () => {
    expect(clampCrop(PORTRAIT, { scale: 0.2, x: 0, y: 0 }).scale).toBe(NINA_CROP_MIN_SCALE)
    expect(clampCrop(PORTRAIT, { scale: 99, x: 0, y: 0 }).scale).toBe(NINA_CROP_MAX_SCALE)
    expect(clampCrop(PORTRAIT, { scale: 1.23456, x: 0, y: 0 }).scale).toBe(1.235)
  })

  it('clamps offsets to the frame, symmetrically', () => {
    expect(clampCrop(PORTRAIT, { scale: 1, x: 900, y: 900 })).toEqual({ scale: 1, x: 0, y: 169 })
    expect(clampCrop(PORTRAIT, { scale: 1, x: -900, y: -900 })).toEqual({ scale: 1, x: 0, y: -169 })
  })

  it('clamps offsets against the NEW scale, not the old one', () => {
    // The regression this ordering exists to prevent: legal at 2x, illegal at 1x.
    expect(clampCrop(PORTRAIT, { scale: 1, x: 0, y: 800 }).y).toBe(169)
  })

  it('returns integer offsets, because the columns are integers', () => {
    const crop = clampCrop(PORTRAIT, { scale: 2, x: 12.6, y: -4.2 })
    expect(Number.isInteger(crop.x)).toBe(true)
    expect(crop).toEqual({ scale: 2, x: 13, y: -4 })
  })
})

describe('panCrop', () => {
  it('converts pointer px to thousandths of the frame and follows the pointer', () => {
    // 51.2px on a 512px frame is 100 thousandths; x is pinned at cover, y is free.
    expect(panCrop(PORTRAIT, { scale: 1, x: 0, y: 0 }, 51.2, 51.2, 512)).toEqual({
      scale: 1,
      x: 0,
      y: 100,
    })
    expect(panCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 51.2, 0, 512).x).toBe(100)
  })

  it('is size-independent — the same fraction of any frame is the same crop', () => {
    const big = panCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 128, 0, 512)
    const small = panCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 7, 0, 28)
    expect(big.x).toBe(250)
    expect(small.x).toBe(250)
  })

  it('is a no-op before the frame has been measured', () => {
    const crop = { scale: 2, x: 10, y: 10 }
    expect(panCrop(PORTRAIT, crop, 40, 40, 0)).toBe(crop)
    expect(panCrop(PORTRAIT, crop, 40, 40, Number.NaN)).toBe(crop)
  })
})

describe('zoomCrop', () => {
  it('scales the offsets with the zoom, so the frame centre holds still', () => {
    expect(zoomCrop(PORTRAIT, { scale: 1, x: 0, y: 100 }, 2)).toEqual({ scale: 2, x: 0, y: 200 })
  })

  it('pulls an offset back inside the frame when zooming OUT', () => {
    // y=800 is legal at 2x (max 839) and must not survive the return to 1x (max 169).
    expect(zoomCrop(PORTRAIT, { scale: 2, x: 0, y: 800 }, 0.5)).toEqual({ scale: 1, x: 0, y: 169 })
  })

  it('refuses a non-positive factor rather than inverting the image', () => {
    const crop = { scale: 2, x: 0, y: 0 }
    expect(zoomCrop(PORTRAIT, crop, 0)).toBe(crop)
    expect(zoomCrop(PORTRAIT, crop, -1)).toBe(crop)
  })
})

describe('zoomFactorForWheel', () => {
  it('zooms in on a negative delta and out on a positive one', () => {
    expect(zoomFactorForWheel(-100)).toBeCloseTo(1.284, 3)
    expect(zoomFactorForWheel(100)).toBeCloseTo(0.7788, 4)
    expect(zoomFactorForWheel(0)).toBe(1)
  })

  it('caps a momentum trackpad s huge delta at 2x / 0.5x per event', () => {
    expect(zoomFactorForWheel(-4000)).toBe(2)
    expect(zoomFactorForWheel(4000)).toBe(0.5)
    expect(zoomFactorForWheel(Number.NaN)).toBe(1)
  })
})

describe('nudgeCrop', () => {
  it('is the keyboard path to the same clamp', () => {
    expect(nudgeCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 10, -10)).toEqual({
      scale: 2,
      x: 10,
      y: -10,
    })
    expect(nudgeCrop(PORTRAIT, { scale: 1, x: 0, y: 169 }, 0, 10).y).toBe(169)
  })
})

describe('ninaCropStyle — the one mapping', () => {
  it('renders the identity exactly as centred object-cover', () => {
    expect(ninaCropStyle(SQUARE, NINA_CROP_IDENTITY)).toEqual({
      position: 'absolute',
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
      objectFit: 'cover',
    })
    expect(ninaCropStyle(PORTRAIT, NINA_CROP_IDENTITY)).toEqual({
      position: 'absolute',
      width: '100%',
      height: '133.9286%',
      left: '0%',
      top: '-16.9643%',
      objectFit: 'cover',
    })
  })

  it('moves the image right and down for positive offsets', () => {
    const style = ninaCropStyle(PORTRAIT, { scale: 2, x: 100, y: -200 })
    expect(style).toEqual({
      position: 'absolute',
      width: '200%',
      height: '267.8571%',
      left: '-40%', // 50 + 10 - 100
      top: '-103.9286%', // 50 - 20 - 133.9286
      objectFit: 'cover',
    })
  })

  it('always covers the frame for any clamped crop — the property that matters', () => {
    for (const natural of [PORTRAIT, LANDSCAPE, SQUARE, { width: 6000, height: 1000 }]) {
      for (const scale of [1, 1.001, 1.5, 2.75, 4]) {
        for (const [x, y] of [
          [0, 0],
          [9999, 9999],
          [-9999, -9999],
          [9999, -9999],
        ]) {
          const crop = clampCrop(natural, { scale, x, y })
          const style = ninaCropStyle(natural, crop)
          const left = Number.parseFloat(style.left)
          const top = Number.parseFloat(style.top)
          const width = Number.parseFloat(style.width)
          const height = Number.parseFloat(style.height)
          expect(left).toBeLessThanOrEqual(0.0001)
          expect(top).toBeLessThanOrEqual(0.0001)
          expect(left + width).toBeGreaterThanOrEqual(99.9999)
          expect(top + height).toBeGreaterThanOrEqual(99.9999)
        }
      }
    }
  })
})

describe('cropForWrite', () => {
  it('writes an identity crop as three NULLs, so Reset needs no second query', () => {
    expect(cropForWrite(NINA_CROP_IDENTITY)).toEqual({ scale: null, x: null, y: null })
    expect(isIdentityCrop(NINA_CROP_IDENTITY)).toBe(true)
  })

  it('writes a real crop as itself', () => {
    expect(cropForWrite({ scale: 1.75, x: -120, y: 40 })).toEqual({ scale: 1.75, x: -120, y: 40 })
  })
})
```

**Impact:** the `left + width >= 100` property test is the one that would have caught every version
of the clamp bug at once, and it is the reason the clamp is expressed as a bound rather than as a
condition inside a drag handler.

---

### Step 3: `lib/admin/requireAdmin.ts` — the gate phase 1 deliberately left unbuilt

**File:** `lib/admin/requireAdmin.ts` (new)

**Change:** the one place that turns "signed in" into "admin". Phase 1 shipped `adminEnv()` and
`isAdminEmail()` and noted that nothing in `app/` calls them yet; this is the caller.

**Code:**

```ts
import 'server-only'

import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import { UnauthorizedError } from '@/lib/auth/requireUserId'
import { isAdminEmail } from '@/lib/env'

/**
 * The admin boundary — R23/R24, and the `app/` half of what phase 1 built in `lib/env.ts`.
 *
 * This file is to `/admin/**` what `lib/auth/requireUserId.ts` is to the rest of the app: the
 * ACTUAL security boundary. `proxy.ts` does not match `/admin` (and deliberately still does not —
 * its own header says it is a UX redirect, not authorization), and it does not match `/api/*` at
 * all, so the checks in here and in the Route Handler are the only thing between a signed-in
 * stranger and Nina s album.
 *
 * ── WHY A NON-ADMIN GETS A 404 ───────────────────────────────────────────────────────────────
 * Three refusals were on the table:
 *
 *   `notFound()`   — CHOSEN. Phase 1 s own `.env.example` copy already promises it ("THE GOOGLE
 *                    ACCOUNT YOU SIGN IN WITH MUST APPEAR HERE or those pages 404") and its
 *                    `lib/env.ts` header calls a 404 "the correct symptom". It also tells a
 *                    signed-in stranger nothing: `/admin/nina` and `/admin/nonsense` answer
 *                    identically, so the existence of an admin surface is not confirmed.
 *   `forbidden()`  — REJECTED. Next 16 ships it, but behind the experimental `authInterrupts`
 *                    flag. `lib/auth/requireUserId.ts:57-60` already rejected `unauthorized()`
 *                    for exactly that reason under the roadmap s "no feature flags" tenet.
 *                    Reversing that here would be a flag decision taken by a side door.
 *   `redirect('/')`— REJECTED for the ADMIN-EMAIL case (it is right for the NO-SESSION case). A
 *                    mistyped admin URL silently landing on the runs list looks like a bug.
 *
 * ── SIGNED OUT IS A DIFFERENT ANSWER FROM NOT-AN-ADMIN ──────────────────────────────────────
 * No session -> `redirect('/')`, identical to `requireUserId()`, because `/` IS the sign-in screen
 * (R-24) and signing in is the useful next step. A session whose email is not on the list ->
 * `notFound()`, because signing in again will not help.
 */

export interface AdminIdentity {
  userId: string
  /** The session email, already verified against `ADMIN_EMAILS`. */
  email: string
}

/**
 * The identity if this session is an admin, `null` otherwise — for the rare caller that wants to
 * BRANCH rather than refuse (a nav link that only admins see). No caller in this phase uses it;
 * it exists because the alternative is a second `auth()` read written by hand later.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const session = await auth()
  const userId = session?.user?.id
  const email = session?.user?.email
  if (!userId || !isAdminEmail(email)) return null
  return { userId, email: email as string }
}

/**
 * THE function every page and every Server Action under `/admin` opens with:
 *
 *     export default async function Page() {
 *       const { userId } = await requireAdmin()      // <- always line 1
 *       const album = await listNinaAvatars(userId)  // <- always scoped
 *     }
 *
 * Both exits throw a framework control-flow error, so nothing after the call runs. The same two
 * rules as `requireUserId()` apply: call it FIRST, and never wrap it in a bare try/catch.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const session = await auth()
  // Both read off the same optional chain: `userId` being truthy does not narrow `session` for
  // the compiler, and reading `session.user.email` after the redirect would need a `!`.
  const userId = session?.user?.id
  const email = session?.user?.email
  if (!userId) redirect('/')
  if (!isAdminEmail(email)) notFound()
  return { userId, email: email as string }
}

/** Thrown by `requireAdminApi()` when the session is real but not an admin. Answer it with a 404. */
export class AdminForbiddenError extends Error {
  readonly status = 404
  constructor(message = 'Not found') {
    super(message)
    this.name = 'AdminForbiddenError'
  }
}

/**
 * Route Handler flavour. Throws, never redirects — a 307 to an HTML page is a terrible answer to
 * `fetch()`, which is the same argument `requireUserIdApi()` makes. `UnauthorizedError` is F02 s
 * class, imported rather than redefined, so a handler can keep one catch for both.
 */
export async function requireAdminApi(): Promise<AdminIdentity> {
  const identity = await getAdminIdentity()
  if (identity) return identity
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  throw new AdminForbiddenError()
}

/** The canonical refusal body, so every admin route answers identically and says nothing. */
export function forbiddenJson(): Response {
  return Response.json({ error: 'Not found' }, { status: 404 })
}
```

**Impact:** the first file under `lib/admin/`. `import 'server-only'` is what stops a client
component from ever pulling `isAdminEmail` (and therefore `adminEnv()`) into a bundle;
`vitest.config.ts` aliases `server-only` to a stub, so this module stays importable in tests even
though nothing here is unit-tested (the parsing logic it depends on is phase 1 s
`tests/env.admin.test.ts`, and the rest is two framework interrupts).

---

### Step 4: three functions appended to `lib/nina/queries.ts`

**File:** `lib/nina/queries.ts` — appended at the end of the avatar section, immediately after
`setNinaAvatarDescription` (phase 1, Step 6 §avatars; in the landed file the last avatar function
before the turns section)

**Change:** phase 1 shipped five avatar functions and none of them can (a) fetch one row by id,
(b) make an existing album row current, or (c) remove a row. An album manager needs all three.
They go in this file rather than a new one because two data-access homes for one table is worse
than one additive edit to a landed file — and because `avatarColumns` (the explicit column list
phase 1 wrote precisely so a `select()` cannot widen silently) is module-local and must be reused,
not copied.

**Code** — appended, using the module's existing imports (`and`, `eq`, `isNull`, `db`,
`ninaAvatars`, `avatarColumns`):

```ts
/**
 * One album row by id, ownership-scoped. Phase 15 s `/admin/nina` uses it to validate an id
 * arriving from a form before it changes anything, and to read `width`/`height` back for the crop
 * clamp. Returns `null` for "not yours" and for "does not exist" alike — the caller has no
 * legitimate use for the difference.
 */
export async function getNinaAvatar(userId: string, id: string): Promise<NinaAvatarRow | null> {
  const rows = await db
    .select(avatarColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Make an existing album photo the current one. R23 s "admin can also set which photo will be set
 * as her profpic".
 *
 * ── THE PRE-CHECK IS WHAT MAKES ZERO CURRENT AVATARS UNREACHABLE ─────────────────────────────
 * The statement order is forced by `nina_avatars_user_current_unq` (partial unique on `(user_id)
 * where is_current`): un-current first, then set the new one, exactly as
 * `insertNinaAvatarAsCurrent` does. But an UPDATE that matches no row does not fail — so if the id
 * were bogus, the batch would un-current the album and set nothing, leaving her with NO current
 * avatar and the page with nothing to show. Reading the row first and refusing turns that into a
 * `false` return. (One user, one writer, so the window between the read and the batch is
 * theoretical; the alternative is a `WHERE EXISTS` that this driver expresses far less legibly.)
 *
 * ── `announced_at` IS RE-ARMED ON PURPOSE ────────────────────────────────────────────────────
 * RU-17: a hand-changed avatar makes her speak. What the user perceives is "her face changed", and
 * the cause is irrelevant to that, so promoting an old album photo re-arms the announcement the
 * same way a fresh upload does. Phase 10 owns the trigger (`is_current AND announced_at IS NULL`);
 * this function writes no message and composes no line.
 */
export async function setCurrentNinaAvatar(userId: string, id: string): Promise<boolean> {
  const existing = await getNinaAvatar(userId, id)
  if (existing == null) return false
  if (existing.isCurrent) return true // idempotent: no un-currenting, no re-announcement

  await db.batch([
    db
      .update(ninaAvatars)
      .set({ isCurrent: false })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.isCurrent, true))),

    db
      .update(ninaAvatars)
      .set({ isCurrent: true, announcedAt: null })
      .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id))),
  ])
  return true
}

/**
 * Remove a photo from the album, and hand its blob back so the caller can delete the object.
 *
 * ── THE CURRENT PHOTO CANNOT BE DELETED, AND THAT IS THE WHOLE GUARD ────────────────────────
 * `eq(ninaAvatars.isCurrent, false)` in the WHERE clause is what makes "zero current avatars"
 * unreachable rather than repaired. Promotion-on-delete was rejected: "delete her face and
 * something else silently becomes it" is worse than a refusal that names the fix, and picking the
 * successor is precisely the choice `/admin/nina` exists to give the operator.
 *
 * `null` means "not yours, already gone, or current" — the caller turns that into one message,
 * because a page that distinguishes them is a page that tells a stranger which ids exist.
 */
export async function deleteNinaAvatar(
  userId: string,
  id: string,
): Promise<{ blobUrl: string; pathname: string } | null> {
  const removed = await db
    .delete(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.id, id),
        eq(ninaAvatars.isCurrent, false),
      ),
    )
    .returning({ blobUrl: ninaAvatars.blobUrl, pathname: ninaAvatars.pathname })
  return removed[0] ?? null
}
```

**Impact:** three exported functions, all `userId`-first. Nothing existing changes, so every
phase-1 caller compiles untouched. `ci:data-layer-guard` reads `lib/db/queries.ts` only and does
not see this file, but its rule is obeyed anyway (invariant 7).

**Reconciler note:** if the reconciler prefers these to sit in phase 1's own Step 6 they can be
moved there verbatim — they depend on nothing this phase adds. Phase 13 may also want
`getNinaAvatar`; if it declares the same function, keep phase 1's copy and delete this step.

---

### Step 5: `lib/admin/avatars.ts` and `lib/admin/schema.ts` — the pathname, the caps, the bounds

**File:** `lib/admin/avatars.ts` (new), `lib/admin/schema.ts` (new)

**Change:** the constants the picker, the Route Handler, the Server Action and the test all have to
agree on, plus the Zod bounds phase 1 explicitly deferred to this phase.

**On not compressing the upload.** `components/extract/UploadPicker.tsx` compresses to a 560 px
short edge because a vision model reads those pixels; phase 6's `compressForNina` targets 768 px
for the same reason. **An admin avatar is compressed by neither**, and that is a decision, not an
omission: the crop is a *display transform*, so zooming to 4x on a 768 px source would show her
face at 192 px of real detail in a 512 px frame, and the same blob feeds phase 13's full-screen
photo viewer. The bytes go up whole, straight from the browser to Blob — which is exactly what the
client-upload handshake exists to make possible (a Vercel Function rejects bodies over ~4.5 MB).
The cap is 8 MB, the three formats a camera or a generator actually produces are allowed, and
there is no `sharp` on the server path at all. Not using `lib/photos/compressForNina.ts` also keeps
this phase free of a dependency on phase 6's client module.

**Code — `lib/admin/avatars.ts`:**

```ts
/**
 * Where an admin-uploaded avatar lives, what it may be, and how big it may get. R23.
 *
 * Pure, zero imports, in the shape of `lib/extract/constants.ts` and for the same stated reason:
 * `components/admin/UploadAvatar.tsx` (a client module), `app/api/admin/nina/upload/route.ts`
 * (a Route Handler), `lib/admin/ninaAlbumActions.ts` (a Server Action) and
 * `tests/admin.avatars.test.ts` all have to agree, and a constant that is agreed rather than
 * shared is a constant that will one day disagree.
 *
 * ── THE PATHNAME IS PHASE 14 S, WITH THREE EXTENSIONS INSTEAD OF ONE ────────────────────────
 * `/update-nina-profpic` writes `nina/<userId>/avatar-<nanoid12>.jpg` because it re-encodes
 * through `sharp`. This page does not re-encode (see the plan's Step 5 argument), so it keeps the
 * source container: `.jpg`, `.png` or `.webp`. Same prefix (RU-7: blobs under `nina/<userId>/`),
 * same `avatar-` segment, same id length — so `scripts/blob-reap.mjs` will one day be taught one
 * pattern and not two. It knows about neither today; that is phase 14 s filed handoff.
 *
 * ── WHY THE REQUEST REGEX AND THE STORED PATH ARE DIFFERENT SHAPES ──────────────────────────
 * `addRandomSuffix: true` means Blob rewrites the pathname it was asked for. The regex here
 * validates what the CLIENT may ASK for; the stored pathname carries Blob s suffix and is
 * whatever `put` returned. This is the `SHOT_REQUEST_PATHNAME_RE` / `SHOT_STORED_PATHNAME_RE`
 * split in `lib/extract/constants.ts:101-107`, and only the request half is enforceable.
 */

/** RU-7. Same value as phase 6 s `NINA_BLOB_PREFIX`; if both survive, import theirs. */
export const ADMIN_AVATAR_PREFIX = 'nina/'

export const ADMIN_AVATAR_EXTS = ['jpg', 'png', 'webp'] as const
export type AdminAvatarExt = (typeof ADMIN_AVATAR_EXTS)[number]

/** The three a phone camera, a screenshot and an image generator actually produce. */
export const ADMIN_AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AdminAvatarContentType = (typeof ADMIN_AVATAR_CONTENT_TYPES)[number]

/**
 * 8 MB. A 4032x3024 iPhone JPEG is ~4 MB and a lightly-compressed PNG portrait is ~7 MB, so this
 * accepts an un-touched original while still refusing a 40 MB TIFF-in-a-PNG by accident. The
 * browser PUTs straight to Blob, so the ~4.5 MB Vercel Function body limit does not apply.
 */
export const ADMIN_AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** Below this the circular frame cannot be zoomed at all without visible mush. */
export const ADMIN_AVATAR_MIN_EDGE_PX = 256

/** A sanity ceiling on the dimensions the client reports. Nothing real is 12000 px. */
export const ADMIN_AVATAR_MAX_EDGE_PX = 12_000

/** `newId()` is nanoid(12) over `A-Za-z0-9_-`. */
export const ADMIN_AVATAR_ID_RE = /^[A-Za-z0-9_-]{12}$/

/** Ten minutes, matching `UPLOAD_TOKEN_TTL_MS`. Long enough for a slow desktop upload. */
export const ADMIN_AVATAR_TOKEN_TTL_MS = 10 * 60 * 1000

/** One year. The pathname carries a random suffix, so the bytes at a URL never change. */
export const ADMIN_AVATAR_CACHE_MAX_AGE = 60 * 60 * 24 * 365

/** `nina/<userId>/avatar-<id>.<ext>` — what the client asks for. */
export function adminAvatarPathname(userId: string, id: string, ext: AdminAvatarExt): string {
  return `${ADMIN_AVATAR_PREFIX}${userId}/avatar-${id}.${ext}`
}

/** The extension for a content type, or `null` if we do not accept it. */
export function extForContentType(contentType: string): AdminAvatarExt | null {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return null
  }
}

/**
 * The path-traversal defence and the "do not write beside anything else in the store" defence, in
 * one predicate. The user id is INTERPOLATED FROM THE SESSION by the route, never taken from the
 * request, so a client cannot write into another user s folder even though there is one user.
 */
export function isAdminAvatarRequestPathname(pathname: string, userId: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return false
  const pattern = new RegExp(
    `^${ADMIN_AVATAR_PREFIX}${userId}/avatar-[A-Za-z0-9_-]{12}\\.(${ADMIN_AVATAR_EXTS.join('|')})$`,
  )
  return pattern.test(pathname)
}
```

**Code — `lib/admin/schema.ts`:**

```ts
import { z } from 'zod'

import {
  ADMIN_AVATAR_CONTENT_TYPES,
  ADMIN_AVATAR_ID_RE,
  ADMIN_AVATAR_MAX_EDGE_PX,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_MIN_EDGE_PX,
} from './avatars'
import {
  NINA_CROP_MAX_ABS_OFFSET,
  NINA_CROP_MAX_SCALE,
  NINA_CROP_MIN_SCALE,
} from '@/lib/nina/crop'

/**
 * Everything `/admin/nina` accepts from a browser, validated at the boundary. R23.
 *
 * Phase 1 s `updateNinaAvatarCrop` docstring hands this file its job in as many words: *"No range
 * validation here. The bounds ('scale >= 1, offsets inside the frame') are a property of the
 * framing UI and belong to a Zod schema phase 15 owns."* This is that schema.
 *
 * ── TWO LAYERS OF BOUNDS, AND WHY BOTH ──────────────────────────────────────────────────────
 * The EXACT bound on an offset depends on the image s aspect ratio and the current scale, which
 * this schema does not know — so it enforces the shape (integer, within the absolute ceiling that
 * no legitimate crop can exceed) and the Server Action then re-runs `clampCrop` against the row s
 * real `width`/`height`. Zod refuses garbage; `clampCrop` is what guarantees the frame stays
 * covered. Neither alone is sufficient: a schema cannot know the aspect ratio, and a clamp cannot
 * reject `scale: "banana"`.
 */

export const avatarIdSchema = z.string().regex(ADMIN_AVATAR_ID_RE, 'Not an avatar id')

export const cropWriteSchema = z.object({
  id: avatarIdSchema,
  /** `numeric(5,3)`: three decimals, and never below cover. */
  scale: z
    .number()
    .min(NINA_CROP_MIN_SCALE)
    .max(NINA_CROP_MAX_SCALE)
    .refine((v) => Number.isFinite(v), 'Not a scale'),
  x: z.number().int().min(-NINA_CROP_MAX_ABS_OFFSET).max(NINA_CROP_MAX_ABS_OFFSET),
  y: z.number().int().min(-NINA_CROP_MAX_ABS_OFFSET).max(NINA_CROP_MAX_ABS_OFFSET),
})
export type CropWrite = z.infer<typeof cropWriteSchema>

/**
 * What the browser reports after a successful PUT. Every field is checked, including the two the
 * browser measured itself — `width`/`height` come from `HTMLImageElement.naturalWidth`, which is
 * trustworthy in practice and client-supplied in principle, and they are the input to the crop
 * clamp, so a lie here is a lie about the frame.
 */
export const avatarRegisterSchema = z.object({
  blobUrl: z.string().url().startsWith('https://'),
  pathname: z.string().min(1).max(512),
  contentType: z.enum(ADMIN_AVATAR_CONTENT_TYPES),
  width: z.number().int().min(ADMIN_AVATAR_MIN_EDGE_PX).max(ADMIN_AVATAR_MAX_EDGE_PX),
  height: z.number().int().min(ADMIN_AVATAR_MIN_EDGE_PX).max(ADMIN_AVATAR_MAX_EDGE_PX),
  bytes: z.number().int().positive().max(ADMIN_AVATAR_MAX_UPLOAD_BYTES),
  /** Make it hers immediately, or just park it in the album. The checkbox on the picker. */
  makeCurrent: z.boolean(),
})
export type AvatarRegister = z.infer<typeof avatarRegisterSchema>
```

**Impact:** two new pure modules. `lib/admin/schema.ts` imports `lib/nina/crop.ts` for its
bounds, which is the reason those bounds are constants there and not literals here.

---

### Step 6: `app/api/admin/nina/upload/route.ts` — the admin Blob handshake

**File:** `app/api/admin/nina/upload/route.ts` (new)

**Change:** a second client-upload handshake, admin-gated. Structurally ported from
`app/api/upload/route.ts:1-110`, including its header's warning, which applies here with more
force: `proxy.ts`'s matcher does not cover `/api/*` at all, so the check inside
`onBeforeGenerateToken` is the only thing between the open internet and Nina's blob folder.

**Why a separate route and not a third branch in `app/api/upload/route.ts`.** That file is phase
6's (it adds the `chat/` branch), and every one of the four values that matter here differs:
the authorisation rule (**admin**, not merely signed-in), `maximumSizeInBytes` (8 MB, not 600 KB),
`allowedContentTypes` (three, not one) and the pathname regex. A shared route would have made all
four conditional on a branch discriminator, which is a bigger change to a file another phase is
editing than a new file is to the tree.

**Code:**

```ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { z } from 'zod'

import { getAdminIdentity } from '@/lib/admin/requireAdmin'
import {
  ADMIN_AVATAR_CACHE_MAX_AGE,
  ADMIN_AVATAR_CONTENT_TYPES,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_TOKEN_TTL_MS,
  isAdminAvatarRequestPathname,
} from '@/lib/admin/avatars'
import { blobEnv } from '@/lib/env'

/**
 * `POST /api/admin/nina/upload` — the Vercel Blob client-upload handshake for R23's album.
 *
 * THIS ROUTE NEVER RECEIVES IMAGE BYTES. It mints a short-lived signed token and the browser PUTs
 * straight to Blob, for the three reasons `app/api/upload/route.ts` lists — a Function rejects
 * bodies over ~4.5 MB, streaming an upload through one bills wall-clock for no computation, and
 * only a direct PUT reports honest progress. Here the first reason is load-bearing rather than
 * incidental: an admin avatar is deliberately NOT downscaled, so an 8 MB original is normal.
 *
 * ── IT IS A SECURITY BOUNDARY IN ITS OWN RIGHT ──────────────────────────────────────────────
 * `proxy.ts` deliberately does not match `/api/*` (a 307 to an HTML sign-in page is a terrible
 * answer to `fetch()`), so `getAdminIdentity()` below is the ONLY thing between the open internet
 * and a writable blob store — and specifically the only thing stopping a signed-in non-admin from
 * writing into Nina's folder. Two rules, both enforced here:
 *
 *   1. Admin or nothing. Not "signed in": `/admin/nina` is the only screen that uses this route.
 *   2. The user id in the pathname is INTERPOLATED FROM THE SESSION, never read from the request.
 *      There is one user today; the scoping rule (invariant 7) does not care.
 *
 * The token also carries `{ userId }` so that if `onUploadCompleted` is ever made a writer, it
 * cannot be spoofed into claiming a different owner than the authenticated session declared. It is
 * inert today, exactly as F04's is, and for the same reason: the row is written by a Server Action
 * after the bytes land, and Blob cannot reach a laptop during local development.
 */

export const runtime = 'nodejs'

/** What the browser may tell us. Validated, never trusted. */
const ClientPayload = z.object({
  contentType: z.enum(ADMIN_AVATAR_CONTENT_TYPES),
})

export async function POST(request: Request): Promise<Response> {
  // Fail loudly here if the Blob store was never linked, rather than at token-mint time with an
  // SDK message about a missing store.
  blobEnv()

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // AUTH. Without this line the route is an open upload endpoint for the internet.
        // getAdminIdentity(), not requireAdmin(): the latter calls notFound()/redirect(), and
        // handleUpload turns this throw into a 400 the fetch caller can actually read.
        const identity = await getAdminIdentity()
        if (!identity) throw new Error('Not found')

        if (!isAdminAvatarRequestPathname(pathname, identity.userId)) {
          throw new Error('Invalid pathname')
        }

        const payload = ClientPayload.parse(JSON.parse(clientPayload || '{}'))

        return {
          allowedContentTypes: [payload.contentType],
          maximumSizeInBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES,
          addRandomSuffix: true, // collision-proof; rewrites the stored pathname
          allowOverwrite: false, // never clobber an existing blob
          cacheControlMaxAge: ADMIN_AVATAR_CACHE_MAX_AGE,
          validUntil: Date.now() + ADMIN_AVATAR_TOKEN_TTL_MS,
          tokenPayload: JSON.stringify({ userId: identity.userId }),
        }
      },

      /** Production-only observability. NOT a writer — `registerNinaAvatarAction` is. */
      onUploadCompleted: async ({ blob }) => {
        console.log('[f33] admin avatar blob landed', { pathname: blob.pathname })
      },
    })

    return Response.json(jsonResponse)
  } catch (error) {
    // Terse on purpose, and it echoes nothing a probe could use to learn what exists.
    console.error('[f33] admin avatar upload refused', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upload rejected' },
      { status: 400 },
    )
  }
}
```

**Impact:** one new Route Handler. `next.config.ts`'s `remotePatterns` already allows
`**.public.blob.vercel-storage.com`, so the uploaded image renders through `next/image` with no
config change.

---

### Step 7: `lib/admin/ninaAlbumActions.ts` — five Server Actions

**File:** `lib/admin/ninaAlbumActions.ts` (new)

**Change:** every mutation the page can perform, each opening with `requireAdmin()`, each ending
with `revalidatePath('/admin/nina')`. The describe pre-pass lives here too, which is this phase's
share of R25.

**Two decisions inside this file:**

1. **The describe pre-pass runs on register, and a failure is not fatal.** An uploaded image has no
   generation prompt, so `glm-4.6v` is the only way `nina_avatars.description` ever gets filled for
   it — R25's "asked where she is in her new profile photo, Nina invents a story true to the photo"
   has nothing to work from otherwise. But a describe call is a ~25 s round trip to a vendor, and
   holding the album faceless while it runs (or failing the whole upload when z.ai is overloaded)
   would be the wrong trade — which is precisely why phase 1 made `setNinaAvatarDescription` a
   separate write. So: insert the row, then describe, then stamp the description. A failure leaves
   `description = null`, the album card shows "No description yet", and `describeNinaAvatarAction`
   is the retry button. **Every upload lands with a description on the happy path, and the unhappy
   path is visible and one click from repair** — which is how the exit criterion is met honestly.
2. **`lib/nina/vision.ts` is reached through a dynamic import behind a local interface.** Phase 6
   owns that module and is not in this phase's `depends_on`. A static import would make this phase
   fail to typecheck if it landed first. The interface is three lines, the dynamic import is one,
   and if the module is absent the action returns `{ ok: false, error: … }` and the page still
   works. (In the shipped ordering phase 6 lands ninth and this is dead insurance — but a phase
   that cannot build alone is not shippable, and RU-11 says every phase is shippable.)

**Code:**

```ts
'use server'

import { del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'

import { avatarRegisterSchema, cropWriteSchema, avatarIdSchema } from '@/lib/admin/schema'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { clampCrop, cropForWrite, resolveCrop } from '@/lib/nina/crop'
import {
  deleteNinaAvatar,
  getCurrentNinaAvatar,
  getNinaAvatar,
  insertNinaAvatarAsCurrent,
  setCurrentNinaAvatar,
  setNinaAvatarDescription,
  updateNinaAvatarCrop,
} from '@/lib/nina/queries'

/**
 * The album's write side — R23, plus this phase's share of R25 (the describe pre-pass).
 *
 * Every action opens with `requireAdmin()` and is scoped to the id it returns. `proxy.ts` governs
 * Server Actions only incidentally (they POST to the page they are used on) and does not match
 * `/admin` at all, so this line is the authorization, exactly as `requireUserId()` is everywhere
 * else in the app.
 *
 * ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────────────────────
 *  · It writes no `nina_messages` row and composes no line of Nina's dialogue. A new current
 *    avatar is left with `announced_at = NULL`, which is phase 10's `avatar_changed` trigger
 *    (RU-17). Writing her line here would put words in her mouth from a file that has never read
 *    her persona.
 *  · It does not re-anchor `assets/nina/_anchor.png` (RU-16). It CANNOT: that is a committed repo
 *    file and this runs on a read-only serverless filesystem. `/update-nina-profpic` is still the
 *    only way to change the face she GENERATES from, and the page says so on screen.
 *  · It generates nothing. Phase 12 owns image generation.
 */

/** One shape for every action, so the client has one branch and no `unknown`. */
export interface AdminActionResult {
  ok: boolean
  error?: string
  /** Set by `registerNinaAvatarAction` so the client can select the new row immediately. */
  id?: string
  /** Set by the describe actions, so the card can show the prose without a refetch. */
  description?: string
}

/** Phase 6's `describeNinaImages`, as the three lines of it this file needs. */
interface VisionModule {
  describeNinaImages: (
    refs: readonly { blobUrl: string; pathname: string }[],
  ) => Promise<{ description: string }>
}

async function loadVision(): Promise<VisionModule | null> {
  try {
    return (await import('@/lib/nina/vision')) as unknown as VisionModule
  } catch {
    // Phase 6 has not landed. The album still works; descriptions arrive when it does.
    return null
  }
}

/**
 * Describe one album row with `glm-4.6v` and stamp `nina_avatars.description`. R25's raw material.
 *
 * RU-12 is why this exists at all: `glm-5.3` is never sent an image, so the only way she can say
 * anything true about a photograph is for a vision model to have written down what is in it. Also
 * the retry button for a failed pre-pass.
 */
export async function describeNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const row = await getNinaAvatar(userId, parsed.data)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  const vision = await loadVision()
  if (vision == null) {
    return { ok: false, error: 'Her eyes are not wired up in this build yet.' }
  }

  try {
    const { description } = await vision.describeNinaImages([
      { blobUrl: row.blobUrl, pathname: row.pathname },
    ])
    await setNinaAvatarDescription(userId, row.id, description)
    revalidatePath('/admin/nina')
    return { ok: true, description }
  } catch (cause) {
    console.error('[f33] admin describe failed', cause)
    return { ok: false, error: 'The description call failed. Try again.' }
  }
}

/**
 * Register a blob the browser has just PUT. **The only writer of `nina_avatars` on this path** —
 * `onUploadCompleted` is inert, exactly as F04's is.
 *
 * `insertNinaAvatarAsCurrent` is phase 1's, and it un-currents before inserting because
 * `nina_avatars_user_current_unq` makes the order load-bearing. `makeCurrent: false` still goes
 * through it — see the branch below for why that is a deliberate small cost rather than a second
 * insert path.
 */
export async function registerNinaAvatarAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarRegisterSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe itself properly.' }
  const { blobUrl, pathname, width, height, bytes, makeCurrent } = parsed.data

  // `insertNinaAvatarAsCurrent` is the only insert phase 1 exposes, and it always makes the new row
  // current. For "park it in the album" we insert it as current and then hand the crown straight
  // back to whoever had it — two statements instead of one, on an operation a human performs a
  // handful of times a year, in exchange for not writing a second insert path that could disagree
  // with phase 1's about the partial unique index.
  const previousCurrentId = makeCurrent ? null : ((await getCurrentNinaAvatar(userId))?.id ?? null)
  const row = await insertNinaAvatarAsCurrent(userId, {
    blobUrl,
    pathname,
    source: 'admin',
    width,
    height,
    bytes,
  })
  if (previousCurrentId != null) await setCurrentNinaAvatar(userId, previousCurrentId)

  revalidatePath('/admin/nina')

  // The pre-pass. Non-fatal by design: the row exists, the album renders, and a failure leaves a
  // visible "Describe" button rather than a lost upload.
  const vision = await loadVision()
  if (vision != null) {
    try {
      const { description } = await vision.describeNinaImages([{ blobUrl, pathname }])
      await setNinaAvatarDescription(userId, row.id, description)
      revalidatePath('/admin/nina')
      return { ok: true, id: row.id, description }
    } catch (cause) {
      console.error('[f33] admin describe pre-pass failed', cause)
    }
  }
  return { ok: true, id: row.id }
}

/**
 * "Set as her profile photo" — R23, verbatim. Re-arms `announced_at`, so she comments on the
 * change (RU-17) via phase 10's trigger. Idempotent when the row is already current.
 */
export async function setCurrentNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const changed = await setCurrentNinaAvatar(userId, parsed.data)
  if (!changed) return { ok: false, error: 'That photo is not in the album.' }
  revalidatePath('/admin/nina')
  return { ok: true }
}

/**
 * Save the framing the operator just dragged — R23's whole point.
 *
 * **`clampCrop` runs again here, server-side, against the row's real `width`/`height`.** The Zod
 * schema cannot know the aspect ratio, so it can only reject nonsense; this is what guarantees the
 * stored numbers keep the circle covered no matter what a hand-crafted POST claims. An identity
 * crop is written as three NULLs by `cropForWrite`, which is how "Reset framing" and "Save
 * framing" stay one code path — phase 1's `updateNinaAvatarCrop` docstring promises exactly that.
 */
export async function saveNinaAvatarCropAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = cropWriteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That framing is out of range.' }

  const row = await getNinaAvatar(userId, parsed.data.id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  const clamped = clampCrop(
    { width: row.width, height: row.height },
    resolveCrop({ scale: parsed.data.scale, x: parsed.data.x, y: parsed.data.y }),
  )
  const saved = await updateNinaAvatarCrop(userId, row.id, cropForWrite(clamped))
  if (!saved) return { ok: false, error: 'That photo is not in the album.' }
  revalidatePath('/admin/nina')
  return { ok: true }
}

/**
 * Remove a photo from the album, and its blob with it.
 *
 * ── ROW FIRST, BLOB SECOND ──────────────────────────────────────────────────────────────────
 * A failed `del` leaves an orphaned object, which is recoverable (and is what
 * `scripts/blob-reap.mjs` exists for, once it is taught the `nina/` prefix — phase 14's filed
 * handoff). A deleted blob under a live row is a permanently broken image in her album. So the
 * row goes first and the `del` is best-effort, logged rather than surfaced.
 *
 * The current photo cannot be removed: `deleteNinaAvatar`'s WHERE clause refuses it, which is what
 * makes "zero current avatars" unreachable rather than repaired.
 */
export async function deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const removed = await deleteNinaAvatar(userId, parsed.data)
  if (removed == null) {
    return {
      ok: false,
      error: 'That is her current photo — make another one current first.',
    }
  }

  try {
    await del(removed.blobUrl)
  } catch (cause) {
    console.error('[f33] album row deleted, blob left behind', removed.pathname, cause)
  }

  revalidatePath('/admin/nina')
  return { ok: true }
}
```

**Impact:** five actions, one shape of result, no new dependency (`del` and `handleUpload` both
ship in the `@vercel/blob` 2.8.0 already in `package.json`). The id in the blob pathname is minted
client-side by the picker (Step 9), so this file never calls `newId()`.

---

### Step 8: the desktop shell and the two pages

**File:** `app/admin/layout.tsx`, `components/admin/AdminNav.tsx`, `app/admin/page.tsx`,
`app/admin/nina/page.tsx` (all new)

**Change:** the app's first non-mobile layout, and the two Server Components that sit in it. Read
alongside §1 above, which is where the layout decisions are argued.

**Code — `app/admin/layout.tsx`:**

```tsx
import type { Metadata } from 'next'

import { AdminNav } from '@/components/admin/AdminNav'
import { requireAdmin } from '@/lib/admin/requireAdmin'

/**
 * **The app's first deliberately-desktop layout.** R23: *"in fact, i am thinking about a whole new
 * page. but this UI is for desktop."*
 *
 * ── WHY THIS IS A NESTED LAYOUT AND NOT A `(group)` ─────────────────────────────────────────
 * A parenthesised folder exists to hide a URL segment or to declare a second ROOT layout.
 * `/admin` is a segment we want in the URL, and a second root layout would mean re-declaring
 * `<html>`, `<body>` and `next/font` and taking a full page reload on every crossing between the
 * runner's app and this one (`route-groups.md`, Caveats). The root layout keeps supplying Poppins,
 * the tokens, the viewport and the theme colour; this file supplies the chrome.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────────────────────
 * No `AppShell`: that component hardcodes `max-w-[470px]` and pairs itself with `<TabBar />`
 * (`components/ui/AppShell.tsx:32-41`). Both are wrong here. The tab bar is the runner's five-cell
 * navigation and an admin tool that borrows it invites the runner to tap into it; the 470 px column
 * is `docs/design-brief.md`'s iPhone XS Max target, and the album manager's content is genuinely
 * side-by-side.
 *
 * ── WHAT IT KEEPS ──────────────────────────────────────────────────────────────────────────
 * Every design token: `--paper`, `--paper-2`, `--card`, `--ink*`, `--rule`, `--accent`,
 * `--radius-card`, `--shadow-card`, and the `prefers-color-scheme: dark` block that redefines them
 * all. `Card`, `Button` and `Input` are reused unmodified. The layout is new; the palette is not,
 * which is what stops these pages from reading like a different product.
 *
 * ── THE GATE IS HERE **AND** IN EVERY PAGE AND ACTION ──────────────────────────────────────
 * A layout does not re-run on every navigation within its subtree and cannot be relied on as the
 * only check — Next's own docs are explicit that auth belongs next to the data. So `requireAdmin()`
 * is called here (so a non-admin gets a 404 for `/admin/anything`, including a segment that does
 * not exist yet), and again at the top of every page, and again at the top of every Server Action.
 * Three calls, one cookie decrypt each, zero round trips — the same argument `requireUserId()`
 * makes for being on the hot path of every interaction.
 */

export const metadata: Metadata = {
  title: 'Admin — Run Insights',
  // Belt to the 404's braces: an admin surface has no business in an index.
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireAdmin()

  return (
    <div className="min-h-dvh bg-paper-2">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 p-6 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-8 lg:p-8">
        <AdminNav />
        {/* `min-w-0` is load-bearing: without it a wide album grid blows out the grid track
            instead of scrolling inside it. */}
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
```

**Code — `components/admin/AdminNav.tsx`:**

```tsx
import Link from 'next/link'

/**
 * The admin sidebar. **The one array phase 16 appends to** — its `/admin/memory` entry goes in
 * `LINKS` and nothing else about this file changes.
 *
 * A plain link list and not an icon rail: `docs/design-brief.md`'s "a plain-text link, never an
 * icon button — unambiguous at a glance and an icon is a guess" is a navigation stance, not a
 * mobile one, and it survives the move to desktop unchanged (`AppShell.tsx:45-49` makes the same
 * argument for `ScreenHeader`).
 *
 * `sticky top-8` rather than `fixed`: there is no safe-area inset to pad on a desktop and a
 * sticky element needs no compensating padding on the sibling column.
 *
 * Not a client component and no active-link highlighting. `usePathname()` would make the whole
 * sidebar client-rendered to bold one word; a two-item list does not need it, and phase 16 can
 * revisit when there are five.
 */

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/nina', label: "Nina's album" },
] as const

export function AdminNav() {
  return (
    <nav className="lg:sticky lg:top-8 lg:self-start" aria-label="Admin">
      <p className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
        Run Insights admin
      </p>
      <ul className="flex flex-wrap gap-1 lg:block lg:space-y-1">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-field px-3 py-2 text-[14px] font-semibold text-ink-2 transition-colors hover:bg-card hover:text-ink"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 hidden max-w-[20ch] text-[12px] font-medium text-ink-3 lg:block">
        Desktop only, on purpose. The runner&rsquo;s app is the five tabs; this is the workshop
        behind it.
      </p>
    </nav>
  )
}
```

**Code — `app/admin/page.tsx`:**

```tsx
import Link from 'next/link'

import { Card } from '@/components/ui'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { getCurrentNinaAvatar, listNinaAvatars } from '@/lib/nina/queries'

/**
 * `/admin` — the hub. It exists because `/admin` would otherwise 404 for an admin, which reads as
 * the gate misfiring rather than as "there is no index here".
 *
 * Deliberately thin: two counts and a link. Phase 16 adds a second card for `/admin/memory`.
 */

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  const { userId, email } = await requireAdmin()
  const [album, current] = await Promise.all([
    listNinaAvatars(userId),
    getCurrentNinaAvatar(userId),
  ])

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Admin</h1>
        <p className="mt-1 text-[13px] font-medium text-ink-2">
          Signed in as {email}. Everything here writes production.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Nina&rsquo;s album</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {album.length === 0
              ? 'Empty — she is still using the committed photo.'
              : `${album.length} photo${album.length === 1 ? '' : 's'}, ${
                  current ? 'one current' : 'none current'
                }.`}
          </p>
          <Link href="/admin/nina" className="text-[13px] font-semibold text-accent">
            Manage the album &rarr;
          </Link>
        </Card>
      </div>
    </div>
  )
}
```

**Code — `app/admin/nina/page.tsx`:**

```tsx
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { AlbumManager, type AlbumPhoto } from '@/components/admin/AlbumManager'
import { NINA_AVATAR_FALLBACK_SRC } from '@/components/admin/CircleFrame'
import { listNinaAvatars } from '@/lib/nina/queries'

/**
 * `/admin/nina` — R23, the whole requirement: *"here admin can add / remove profpic album of nina.
 * admin can also set which photo will be set as her profpic. implement a zoom in and positioning
 * feature so user can manually position nina's face in the middle of circular profile frame."*
 *
 * A Server Component that does two things: gate, and hand the album to one client component. Every
 * mutation is a Server Action in `lib/admin/ninaAlbumActions.ts`, so there is no `/api` route on
 * the write path and no client-side data fetching.
 *
 * `force-dynamic` because the album is per-request state that must reflect the action that just
 * ran; `revalidatePath('/admin/nina')` in every action is what makes that immediate.
 */

export const dynamic = 'force-dynamic'

export default async function AdminNinaPage() {
  const { userId } = await requireAdmin()
  const rows = await listNinaAvatars(userId)

  // The row -> prop mapping is here rather than in the client component so that `NinaAvatarRow`
  // (which carries `announcedAt` and `pathname`, neither of which the UI needs) never crosses the
  // serialization boundary wholesale.
  const photos: AlbumPhoto[] = rows.map((row) => ({
    id: row.id,
    url: row.blobUrl,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    isCurrent: row.isCurrent,
    description: row.description,
    crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
    createdAt: row.createdAt.toISOString(),
  }))

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Nina&rsquo;s album</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Add a photo, pick which one she uses, and frame her face inside the circle. Framing is
          stored per photo and every avatar in the app reads it back through the same transform.
        </p>
      </header>

      {photos.length === 0 ? (
        <p className="mb-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          The album is empty, so she is still showing the committed photo
          (<code className="text-ink">{NINA_AVATAR_FALLBACK_SRC}</code>). Upload one below and it
          becomes her face.
        </p>
      ) : null}

      <AlbumManager photos={photos} userId={userId} />
    </div>
  )
}
```

**Impact:** `/admin` and `/admin/nina` exist and answer 404 to everyone else. Four new files, no
existing file touched. `LayoutProps<'/admin'>` and the two pages' prop types come from
`next typegen`, which `npm run typecheck` runs first.

---

### Step 9a: `components/admin/CircleFrame.tsx` — the circular preview, and the only reader of `ninaCropStyle`

**File:** `components/admin/CircleFrame.tsx` (new)

**Change:** the square-box-plus-circle markup, in one place, so that "the preview matches what the
app renders" is a property of one component and one function rather than of four hand-written
`<span>`s.

**Code:**

```tsx
import { cn } from '@/lib/cn'
import { ninaCropStyle, resolveCrop, type NinaCropInput } from '@/lib/nina/crop'

/**
 * A photo, framed in a circle, with the stored crop applied. R23's frame.
 *
 * ── THIS IS THE ONLY MARKUP IN THE ADMIN TREE THAT READS `ninaCropStyle` ────────────────────
 * Three call sites use it — the studio's big frame, the album grid's thumbnails, and the "as she
 * appears in chat" 44 px sanity check — and they differ only in `sizeClass`. A component rather
 * than a copied `<span>` because the invariant it enforces is invisible: the box **must be square**
 * (`ninaCropStyle`'s docstring explains why `top: N%` and `left: N%` are only the same unit in a
 * square box), and a copied span is a square that someone will one day make 4:5.
 *
 * ── WHY A PLAIN `<img>` AND NOT `next/image` ────────────────────────────────────────────────
 * Two independent reasons. (1) The source is a Vercel Blob URL holding bytes we deliberately did
 * not re-encode; running a paid transformation over them to draw a 96 px circle buys nothing —
 * the same call the other four blob-image sites in this repo make. (2) `next/image` with `fill`
 * sets `position:absolute; inset:0; width:100%; height:100%` itself, which is exactly the four
 * properties the crop transform has to control. Fighting it with `!important` would be worse than
 * not using it. `components/nina/NinaAvatar.tsx` uses `next/image` legitimately because its source
 * is committed local art at unknown intrinsic size; when phase 13 points it at the album, it
 * inherits this argument too (see §Handoffs).
 */

/** Phase 1's committed first avatar, and what an empty album renders. Phase 4 exports the same
 *  literal as `NINA_AVATAR_SRC`; §Handoffs asks the reconciler to collapse the two. */
export const NINA_AVATAR_FALLBACK_SRC = '/nina/avatar-001.png'

export function CircleFrame({
  src,
  natural,
  crop,
  sizeClass = 'size-24',
  ring = false,
  className,
}: {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCropInput | null
  /** A Tailwind `size-*` or an explicit square. **Must be square.** */
  sizeClass?: string
  /** The accent ring the current photo wears in the grid. */
  ring?: boolean
  className?: string
}) {
  const style = ninaCropStyle(natural, resolveCrop(crop))
  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-pill bg-paper-2',
        ring && 'ring-2 ring-accent ring-offset-2 ring-offset-card',
        sizeClass,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} style={style} />
    </span>
  )
}
```

**Impact:** one presentational component. It is the whole of "the circular preview here is
identical to what the app renders", on this side of the handoff.

---

### Step 9b: `components/admin/CropStudio.tsx` — pointer plumbing, and nothing else

**File:** `components/admin/CropStudio.tsx` (new)

**Change:** the direct-manipulation control. **Every line of arithmetic in it is a call into
`lib/nina/crop.ts`**; what remains is pointer capture, a measured frame size, and a wheel listener
registered non-passively.

**Code:**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import {
  NINA_CROP_KEY_STEP,
  NINA_CROP_MAX_SCALE,
  NINA_CROP_MIN_SCALE,
  ninaCropStyle,
  nudgeCrop,
  panCrop,
  zoomCrop,
  zoomFactorForWheel,
  type NinaCrop,
} from '@/lib/nina/crop'

/**
 * Drag to move, wheel or slider to zoom, until her face sits in the middle of the circle. R23.
 *
 * ── THE DIVISION OF LABOUR IS THE POINT ─────────────────────────────────────────────────────
 * `vitest.config.ts` runs `environment: 'node'`: no jsdom, no `PointerEvent`, no
 * `getBoundingClientRect`. So this component contains **no arithmetic beyond subtracting two
 * pointer positions**; the clamping, the aspect fit, the delta conversion and the CSS mapping are
 * all `lib/nina/crop.ts` and are all unit-tested. Invariant 6, and the precedent is exact:
 * `lib/photos/gallery.ts` was carved out of `PhotoViewer.tsx` for this reason.
 *
 * ── CONTROLLED, NOT STATEFUL ────────────────────────────────────────────────────────────────
 * The crop lives in `AlbumManager`, because "Save framing" and "Reset framing" and the dirty
 * marker are all its business and a component that owned the value would have to tell it anyway.
 *
 * ── WHY THE WHEEL LISTENER IS REGISTERED BY HAND ────────────────────────────────────────────
 * React attaches `wheel` at the root as a PASSIVE listener, so `event.preventDefault()` inside an
 * `onWheel` prop logs an "Unable to preventDefault inside passive event listener" warning and the
 * page scrolls anyway — which on this screen means the studio zooms *and* the page jumps. A direct
 * `addEventListener(..., { passive: false })` is the only way to get the default suppressed.
 *
 * ── TOUCH ───────────────────────────────────────────────────────────────────────────────────
 * `touch-none` on the frame, so a drag on a touch device pans the image instead of scrolling the
 * page. Pinch-to-zoom is NOT implemented: R23 says "this UI is for desktop", the slider covers
 * every zoom a touch user needs, and a second pointer's worth of gesture arithmetic for a screen
 * nobody will open on a phone is scope this phase does not need. Named here rather than left as an
 * unexplained gap.
 */

export function CropStudio({
  src,
  natural,
  crop,
  onChange,
  disabled = false,
}: {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCrop
  onChange: (next: NinaCrop) => void
  disabled?: boolean
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [framePx, setFramePx] = useState(0)
  const [dragging, setDragging] = useState(false)

  /** The last pointer position, per active pointer. A ref because it must not re-render. */
  const last = useRef<{ id: number; x: number; y: number } | null>(null)

  /** The frame's rendered size, measured — the one number the pure module needs from the DOM. */
  useEffect(() => {
    const element = frameRef.current
    if (element == null) return
    const measure = () => setFramePx(element.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /** `crop` in a ref, so the non-React wheel listener never closes over a stale value. */
  const cropRef = useRef(crop)
  cropRef.current = crop

  const naturalRef = useRef(natural)
  naturalRef.current = natural

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const element = frameRef.current
    if (element == null || disabled) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      onChangeRef.current(
        zoomCrop(naturalRef.current, cropRef.current, zoomFactorForWheel(event.deltaY)),
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [disabled])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      last.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      setDragging(true)
    },
    [disabled],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = last.current
      if (start == null || start.id !== event.pointerId) return
      // The only arithmetic in this file, and it is a subtraction.
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      last.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      onChange(panCrop(natural, crop, dx, dy, framePx))
    },
    [crop, framePx, natural, onChange],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (last.current?.id !== event.pointerId) return
    last.current = null
    setDragging(false)
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const step = event.shiftKey ? NINA_CROP_KEY_STEP * 5 : NINA_CROP_KEY_STEP
      switch (event.key) {
        case 'ArrowLeft':
          onChange(nudgeCrop(natural, crop, -step, 0))
          break
        case 'ArrowRight':
          onChange(nudgeCrop(natural, crop, step, 0))
          break
        case 'ArrowUp':
          onChange(nudgeCrop(natural, crop, 0, -step))
          break
        case 'ArrowDown':
          onChange(nudgeCrop(natural, crop, 0, step))
          break
        case '+':
        case '=':
          onChange(zoomCrop(natural, crop, 1.1))
          break
        case '-':
        case '_':
          onChange(zoomCrop(natural, crop, 1 / 1.1))
          break
        default:
          return
      }
      event.preventDefault()
    },
    [crop, disabled, natural, onChange],
  )

  return (
    <div>
      <div
        ref={frameRef}
        role="application"
        aria-label="Frame her face — drag to move, scroll or use the slider to zoom, arrow keys to nudge"
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          'relative aspect-square w-full max-w-[420px] touch-none overflow-hidden rounded-pill bg-paper-2 outline-none',
          'ring-1 ring-rule focus-visible:ring-2 focus-visible:ring-accent',
          disabled ? 'cursor-default opacity-60' : dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} style={ninaCropStyle(natural, crop)} />
        {/* The centring crosshair. Purely decorative, and the reason the operator can tell
            "middle of the frame" from "roughly middle". */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-pill border border-white/70 mix-blend-difference"
        />
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-[12px] font-semibold text-ink-2">
          Zoom &middot; {crop.scale.toFixed(2)}&times;
        </span>
        <input
          type="range"
          min={NINA_CROP_MIN_SCALE * 1000}
          max={NINA_CROP_MAX_SCALE * 1000}
          step={10}
          value={Math.round(crop.scale * 1000)}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value) / 1000
            // Expressed as a factor so the frame centre holds still, exactly as the wheel does.
            onChange(zoomCrop(natural, crop, next / crop.scale))
          }}
          className="w-full max-w-[420px] accent-accent"
        />
      </label>

      <p className="mt-2 max-w-[420px] text-[12px] font-medium text-ink-3">
        Drag the photo, scroll to zoom, arrow keys to nudge (hold shift for a bigger step).
        Stored as scale {crop.scale.toFixed(3)}&times;, offset {crop.x}/{crop.y} thousandths of the
        frame.
      </p>
    </div>
  )
}
```

**Impact:** the app's first direct-manipulation control, with its arithmetic somewhere a Node test
runner can reach. The `role="application"` plus `tabIndex` plus arrow keys are what stop it from
being mouse-only.

---

### Step 9c: `components/admin/UploadAvatar.tsx` — pick, measure, PUT, register

**File:** `components/admin/UploadAvatar.tsx` (new)

**Change:** the "add a photo" half of R23. Same client-upload handshake as
`components/extract/UploadPicker.tsx:120-150`, minus the compression (Step 5's argument) and plus
one thing that path does not need: **the intrinsic dimensions, measured in the browser**, because
`lib/nina/crop.ts` cannot clamp a crop without them and there is no `sharp` on this path.

**Code:**

```tsx
'use client'

import { upload } from '@vercel/blob/client'
import { useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui'
import {
  ADMIN_AVATAR_CONTENT_TYPES,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_MIN_EDGE_PX,
  adminAvatarPathname,
  extForContentType,
  type AdminAvatarContentType,
} from '@/lib/admin/avatars'
import { registerNinaAvatarAction } from '@/lib/admin/ninaAlbumActions'
import { newId } from '@/lib/id'

/**
 * Add a photo to Nina's album. R23: *"admin can add / remove profpic album of nina."*
 *
 * The flow, and every step visible:
 *
 *   pick -> read intrinsic size -> PUT straight to Blob -> registerNinaAvatarAction -> described
 *
 * ── WHY THE BYTES ARE NOT COMPRESSED ────────────────────────────────────────────────────────
 * `UploadPicker` compresses to a 560 px short edge because a vision model reads those pixels.
 * `compressForNina` (phase 6) targets 768 px for the same reason. An avatar is neither: the crop
 * is a display transform, so a 4x zoom on a 768 px source would show her face at 192 px of real
 * detail, and phase 13's full-screen viewer serves the same blob. The original goes up whole —
 * which is only possible because the browser PUTs directly to Blob and never through a Function.
 *
 * ── WHY THE BROWSER MEASURES THE IMAGE ──────────────────────────────────────────────────────
 * `clampCrop` needs the aspect ratio, and nothing on the server has the bytes (the Function never
 * sees them, by design). `createImageBitmap` gives it in one call with no `<img>` in the document,
 * and `avatarRegisterSchema` bounds what comes back. A lie here would only mis-frame her own
 * avatar, and the server re-clamps against the stored numbers on every save regardless.
 */

function isAllowed(type: string): type is AdminAvatarContentType {
  return (ADMIN_AVATAR_CONTENT_TYPES as readonly string[]).includes(type)
}

export function UploadAvatar({ userId, onUploaded }: { userId: string; onUploaded?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [makeCurrent, setMakeCurrent] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // so re-picking the same file fires change again
    if (!file) return
    setError(null)

    if (!isAllowed(file.type)) {
      setError('JPEG, PNG or WebP only.')
      return
    }
    if (file.size > ADMIN_AVATAR_MAX_UPLOAD_BYTES) {
      setError(`That is ${(file.size / 1024 / 1024).toFixed(1)} MB — the cap is 8 MB.`)
      return
    }
    const ext = extForContentType(file.type)
    if (ext == null) {
      setError('JPEG, PNG or WebP only.')
      return
    }

    let width = 0
    let height = 0
    try {
      const bitmap = await createImageBitmap(file)
      width = bitmap.width
      height = bitmap.height
      bitmap.close()
    } catch {
      setError('That file did not decode as an image.')
      return
    }
    if (Math.min(width, height) < ADMIN_AVATAR_MIN_EDGE_PX) {
      setError(`Too small to frame — the short edge is ${Math.min(width, height)} px, minimum is ${ADMIN_AVATAR_MIN_EDGE_PX}.`)
      return
    }

    setStatus('Uploading')
    try {
      const requested = adminAvatarPathname(userId, newId(), ext)
      const result = await upload(requested, file, {
        access: 'public',
        contentType: file.type,
        handleUploadUrl: '/api/admin/nina/upload',
        clientPayload: JSON.stringify({ contentType: file.type }),
      })

      setStatus('Asking her what is in it')
      startTransition(async () => {
        const outcome = await registerNinaAvatarAction({
          blobUrl: result.url,
          pathname: result.pathname,
          contentType: file.type,
          width,
          height,
          bytes: file.size,
          makeCurrent,
        })
        setStatus(null)
        if (!outcome.ok) {
          setError(outcome.error ?? 'The server refused that upload.')
          return
        }
        if (outcome.description == null) {
          setStatus('Uploaded. No description yet — use Describe on the card.')
        }
        onUploaded?.()
      })
    } catch (cause) {
      setStatus(null)
      setError(cause instanceof Error ? cause.message : 'Upload failed.')
    }
  }

  return (
    <div className="rounded-card border border-dashed border-rule bg-card p-5">
      <input
        ref={inputRef}
        type="file"
        accept={ADMIN_AVATAR_CONTENT_TYPES.join(',')}
        className="hidden"
        onChange={onPick}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => inputRef.current?.click()} loading={busy || status !== null}>
          Add a photo
        </Button>
        <label className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
          <input
            type="checkbox"
            checked={makeCurrent}
            onChange={(event) => setMakeCurrent(event.target.checked)}
            className="size-4 accent-accent"
          />
          Make it her current photo
        </label>
        <span className="text-[12px] font-medium text-ink-3">
          JPEG, PNG or WebP &middot; up to 8 MB &middot; not re-compressed
        </span>
      </div>

      {status && (
        <p aria-live="polite" className="mt-3 text-[12px] font-semibold text-ink-2">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}

      <p className="mt-3 max-w-[70ch] text-[12px] font-medium text-ink-3">
        This changes the photo she shows. It does <strong>not</strong> change the face she
        generates from — that is the committed anchor, and only{' '}
        <code className="text-ink-2">/update-nina-profpic</code> can replace it.
      </p>
    </div>
  )
}
```

**Impact:** the RU-16 divergence is on screen, in the place where someone would otherwise assume
otherwise. The `makeCurrent` checkbox defaults to on, because "add a photo" almost always means
"use this photo".

---

### Step 9d: `components/admin/AlbumManager.tsx` — the grid, the selection, the four actions

**File:** `components/admin/AlbumManager.tsx` (new)

**Change:** the screen. It holds the selected photo, the in-flight crop, the dirty flag and the
error line, and it is the only caller of the four non-describe actions.

**Code:**

```tsx
'use client'

import { useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import { UploadAvatar } from '@/components/admin/UploadAvatar'
import { Button } from '@/components/ui'
import {
  deleteNinaAvatarAction,
  describeNinaAvatarAction,
  saveNinaAvatarCropAction,
  setCurrentNinaAvatarAction,
} from '@/lib/admin/ninaAlbumActions'
import { cn } from '@/lib/cn'
import { isIdentityCrop, resolveCrop, type NinaCrop, type NinaCropInput } from '@/lib/nina/crop'

/**
 * `/admin/nina`'s body — R23 end to end: add, remove, choose the current one, and frame a face.
 *
 * ── THE LAYOUT IS THE REASON THIS SCREEN IS NOT MOBILE ──────────────────────────────────────
 * Two columns from `xl` up: the studio on the left, the album on the right, so a change to the
 * framing is visible against the other photos without scrolling. Below `xl` they stack, studio
 * first. The album is a grid of circular thumbnails rather than a table of filenames because the
 * only question this screen answers about a photo is "what does she look like in it".
 *
 * ── STATE, AND WHAT IS DELIBERATELY NOT IN IT ───────────────────────────────────────────────
 * `selectedId` and `draft` (the crop being dragged) are the whole of it. The photos come from the
 * server on every render, and every action calls `revalidatePath('/admin/nina')`, so there is no
 * optimistic copy of the album to keep in sync — the one class of bug this screen could plausibly
 * have shipped.
 */

export interface AlbumPhoto {
  id: string
  url: string
  width: number | null
  height: number | null
  bytes: number | null
  source: string
  isCurrent: boolean
  description: string | null
  crop: NinaCropInput
  createdAt: string
}

export function AlbumManager({ photos, userId }: { photos: AlbumPhoto[]; userId: string }) {
  const current = photos.find((photo) => photo.isCurrent) ?? null
  const [selectedId, setSelectedId] = useState<string | null>(current?.id ?? photos[0]?.id ?? null)
  const selected = photos.find((photo) => photo.id === selectedId) ?? null

  /** The crop being dragged. `null` means "the stored one", which is what Reset restores to. */
  const [draft, setDraft] = useState<NinaCrop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const stored = selected ? resolveCrop(selected.crop) : null
  const crop = draft ?? stored
  const dirty =
    draft != null &&
    stored != null &&
    (draft.scale !== stored.scale || draft.x !== stored.x || draft.y !== stored.y)

  function select(id: string) {
    setSelectedId(id)
    setDraft(null) // a new photo's framing is its own, never the last one's
    setError(null)
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        setError(outcome.error ?? 'That did not work.')
        return
      }
      onOk?.()
    })
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Framing</h2>
        {selected == null || crop == null ? (
          <p className="rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
            Add a photo to start framing.
          </p>
        ) : (
          <>
            <CropStudio
              src={selected.url}
              natural={{ width: selected.width, height: selected.height }}
              crop={crop}
              onChange={setDraft}
              disabled={pending}
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                disabled={!dirty || pending}
                onClick={() =>
                  run(
                    () =>
                      saveNinaAvatarCropAction({
                        id: selected.id,
                        scale: crop.scale,
                        x: crop.x,
                        y: crop.y,
                      }),
                    () => setDraft(null),
                  )
                }
              >
                {dirty ? 'Save framing' : 'Framing saved'}
              </Button>
              <Button
                variant="secondary"
                disabled={pending || (isIdentityCrop(crop) && !dirty)}
                onClick={() =>
                  run(
                    () => saveNinaAvatarCropAction({ id: selected.id, scale: 1, x: 0, y: 0 }),
                    () => setDraft(null),
                  )
                }
              >
                Reset framing
              </Button>
            </div>

            {/* The honesty check. Same helper, same component, the sizes the app actually draws —
                so "it looked right in the tool" and "it looks right in chat" cannot diverge. */}
            <div className="mt-6 flex items-center gap-4">
              <CircleFrame
                src={selected.url}
                natural={{ width: selected.width, height: selected.height }}
                crop={dirty ? crop : selected.crop}
                sizeClass="size-11"
              />
              <CircleFrame
                src={selected.url}
                natural={{ width: selected.width, height: selected.height }}
                crop={dirty ? crop : selected.crop}
                sizeClass="size-7"
              />
              <p className="text-[12px] font-medium text-ink-3">
                44 px and 28 px — the chat header and the typing row, at the sizes they render.
              </p>
            </div>

            <dl className="mt-6 space-y-1 text-[12px] font-medium text-ink-3">
              <div className="flex gap-2">
                <dt>Source</dt>
                <dd className="text-ink-2">{selected.source}</dd>
              </div>
              <div className="flex gap-2">
                <dt>Pixels</dt>
                <dd className="text-ink-2">
                  {selected.width ?? '?'} &times; {selected.height ?? '?'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt>Description</dt>
                <dd className="max-w-[46ch] text-ink-2">
                  {selected.description ?? 'None yet — she cannot talk about this photo.'}
                </dd>
              </div>
            </dl>

            {selected.description == null && (
              <Button
                variant="secondary"
                className="mt-3"
                disabled={pending}
                onClick={() => run(() => describeNinaAvatarAction(selected.id))}
              >
                Describe it
              </Button>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 text-[13px] font-semibold text-warn">
            {error}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">
          Album {photos.length > 0 && <span className="text-ink-3">({photos.length})</span>}
        </h2>

        <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={cn(
                'rounded-card border bg-card p-4 text-center',
                photo.id === selectedId ? 'border-accent' : 'border-rule',
              )}
            >
              <button
                type="button"
                onClick={() => select(photo.id)}
                className="mx-auto block"
                aria-pressed={photo.id === selectedId}
              >
                <CircleFrame
                  src={photo.url}
                  natural={{ width: photo.width, height: photo.height }}
                  crop={photo.crop}
                  sizeClass="size-24"
                  ring={photo.isCurrent}
                />
              </button>
              <p className="mt-3 text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
                {photo.isCurrent ? 'Current' : photo.source}
              </p>
              <div className="mt-2 space-y-1">
                <Button
                  size="md"
                  variant="secondary"
                  fullWidth
                  disabled={pending || photo.isCurrent}
                  onClick={() => run(() => setCurrentNinaAvatarAction(photo.id))}
                >
                  {photo.isCurrent ? 'Hers now' : 'Make current'}
                </Button>
                <button
                  type="button"
                  disabled={pending || photo.isCurrent}
                  title={
                    photo.isCurrent
                      ? 'Make another photo current first — she is never left without one.'
                      : undefined
                  }
                  onClick={() => {
                    run(() => deleteNinaAvatarAction(photo.id), () => {
                      if (selectedId === photo.id) setSelectedId(null)
                    })
                  }}
                  className="w-full py-1 text-[12px] font-semibold text-ink-3 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <UploadAvatar userId={userId} onUploaded={() => setDraft(null)} />
      </section>
    </div>
  )
}
```

**Impact:** the screen. Note the two disabled states that carry the zero-current invariant: the
current photo's Remove is disabled with the reason in its `title`, and the server refuses it anyway
(Step 4). `Button`'s `size`, `variant`, `fullWidth` and `loading` props are exactly the ones
`components/ui/Button.tsx` already exports — **and `ButtonSize` is `'md' | 'lg'` only, verified at
`components/ui/Button.tsx:14`, so `size="md"` is the small one**; nothing in `components/ui` is
edited and nothing is added to its barrel.

---

### Step 10: `tests/admin.avatars.test.ts`

**File:** `tests/admin.avatars.test.ts` (new)

**Change:** the boundary logic that is not in `lib/nina/crop.ts` — the pathname regex (a
path-traversal defence), the content-type mapping, and the three Zod schemas.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  adminAvatarPathname,
  extForContentType,
  isAdminAvatarRequestPathname,
} from '@/lib/admin/avatars'
import { avatarRegisterSchema, cropWriteSchema } from '@/lib/admin/schema'

const USER = 'abc123XYZ_-9'
const ID = 'aB3_dEf-hI9k'

describe('adminAvatarPathname / isAdminAvatarRequestPathname', () => {
  it('round-trips the shape the CLI already writes', () => {
    const pathname = adminAvatarPathname(USER, ID, 'jpg')
    expect(pathname).toBe(`nina/${USER}/avatar-${ID}.jpg`)
    expect(isAdminAvatarRequestPathname(pathname, USER)).toBe(true)
  })

  it('accepts all three extensions and nothing else', () => {
    expect(isAdminAvatarRequestPathname(adminAvatarPathname(USER, ID, 'png'), USER)).toBe(true)
    expect(isAdminAvatarRequestPathname(adminAvatarPathname(USER, ID, 'webp'), USER)).toBe(true)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/avatar-${ID}.gif`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/avatar-${ID}.jpg.html`, USER)).toBe(false)
  })

  it('refuses another user s folder, traversal, and the chat prefix', () => {
    expect(isAdminAvatarRequestPathname(`nina/someoneelse/avatar-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/../avatar-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/chat/avatar-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`shots/${ID}.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(adminAvatarPathname(USER, ID, 'jpg'), 'other')).toBe(false)
  })

  it('refuses an id that is not nanoid(12)', () => {
    expect(isAdminAvatarRequestPathname(`nina/${USER}/avatar-short.jpg`, USER)).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/${USER}/avatar-${ID}x.jpg`, USER)).toBe(false)
  })

  it('refuses a user id that is not id-shaped, rather than interpolating it into a regex', () => {
    expect(isAdminAvatarRequestPathname('nina/./avatar.jpg', '.')).toBe(false)
    expect(isAdminAvatarRequestPathname(`nina/a.*/avatar-${ID}.jpg`, 'a.*')).toBe(false)
  })
})

describe('extForContentType', () => {
  it('maps the three we accept and refuses everything else', () => {
    expect(extForContentType('image/jpeg')).toBe('jpg')
    expect(extForContentType('image/png')).toBe('png')
    expect(extForContentType('image/webp')).toBe('webp')
    expect(extForContentType('image/gif')).toBeNull()
    expect(extForContentType('image/svg+xml')).toBeNull()
    expect(extForContentType('')).toBeNull()
  })
})

describe('cropWriteSchema', () => {
  const base = { id: ID, scale: 1.5, x: 10, y: -10 }

  it('accepts a real crop', () => {
    expect(cropWriteSchema.safeParse(base).success).toBe(true)
  })

  it('refuses a sub-cover or absurd scale', () => {
    expect(cropWriteSchema.safeParse({ ...base, scale: 0.9 }).success).toBe(false)
    expect(cropWriteSchema.safeParse({ ...base, scale: 40 }).success).toBe(false)
  })

  it('refuses non-integer offsets and offsets past the absolute ceiling', () => {
    expect(cropWriteSchema.safeParse({ ...base, x: 1.5 }).success).toBe(false)
    expect(cropWriteSchema.safeParse({ ...base, y: 99_999 }).success).toBe(false)
  })

  it('refuses a bogus id', () => {
    expect(cropWriteSchema.safeParse({ ...base, id: 'nope' }).success).toBe(false)
  })
})

describe('avatarRegisterSchema', () => {
  const base = {
    blobUrl: 'https://example.public.blob.vercel-storage.com/nina/u/avatar-x.jpg',
    pathname: `nina/${USER}/avatar-${ID}-suffix.jpg`,
    contentType: 'image/jpeg' as const,
    width: 1792,
    height: 2400,
    bytes: 1_500_000,
    makeCurrent: true,
  }

  it('accepts a real registration', () => {
    expect(avatarRegisterSchema.safeParse(base).success).toBe(true)
  })

  it('refuses an image too small to frame and one impossibly large', () => {
    expect(avatarRegisterSchema.safeParse({ ...base, width: 64 }).success).toBe(false)
    expect(avatarRegisterSchema.safeParse({ ...base, height: 99_999 }).success).toBe(false)
  })

  it('refuses a non-https blob url and an unaccepted content type', () => {
    expect(avatarRegisterSchema.safeParse({ ...base, blobUrl: 'http://x/y.jpg' }).success).toBe(
      false,
    )
    expect(avatarRegisterSchema.safeParse({ ...base, contentType: 'image/gif' }).success).toBe(
      false,
    )
  })

  it('refuses a payload over the upload cap', () => {
    expect(
      avatarRegisterSchema.safeParse({ ...base, bytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES + 1 }).success,
    ).toBe(false)
  })
})
```

**Impact:** two new test files in total for this phase (this one and `lib/nina/crop.test.ts`), and
no jsdom anywhere.

---

## Verification

**Build:**

```
npm run typecheck        # next typegen && tsc --noEmit — LayoutProps<'/admin'> comes from typegen
npm run lint
npm run build
```

**Tests:**

```
npm test                                   # the whole suite
npx vitest run lib/nina/crop.test.ts       # the arithmetic on its own
npx vitest run tests/admin.avatars.test.ts
```

**Guards — all of them, and none needs an edit:**

```
npm run ci:client-secret-guard   # no NEXT_PUBLIC_, no secret named in a 'use client' module,
                                 # no direct process.env read anywhere in this phase
npm run ci:data-layer-guard
npm run ci:llm-payload-guard
npm run ci:openrouter-guard
npm run ci:f08-guard
npm run ci:f11-guard
npm run badges:check
```

**Manual check** (`npm run dev`, signed in as `mahfuzh74@gmail.com`):

1. **The gate.** Open `/admin/nina` — the page renders. Remove your address from `ADMIN_EMAILS` in
   `.env.local`, restart, reload: **a 404, not a page, not an error screen**. Sign out entirely and
   open `/admin/nina`: the sign-in screen. Put the address back.
2. **Not a phone column.** At 1440 px wide the sidebar is on the left and the two sections sit side
   by side; there is no tab bar anywhere and no 470 px column. Narrow to 900 px: the sidebar moves
   above, the sections stack, nothing overflows horizontally. Switch the OS to dark mode: the
   palette follows, because the tokens are unchanged.
3. **Upload.** Add a portrait JPEG. It appears in the album with the accent ring, and within ~25 s
   its Description line is prose about the photo rather than "None yet". Check the Network tab: the
   `POST /api/admin/nina/upload` response carries a token and **no image bytes**, and the PUT goes
   to `*.public.blob.vercel-storage.com`.
4. **The crop round-trips, and matches.** Zoom to ~2x, drag her face to the centre, Save framing.
   Reload the page: the studio and both small circles come back framed exactly as saved. Now open
   `/nina` — **after phase 13's handoff edit has landed**, the chat header's 44 px avatar shows the
   same framing; before it, the header shows plain `object-cover` and that difference is the
   handoff, not a bug.
5. **The clamp holds.** Drag hard in every direction at 1x and at 4x: no background is ever visible
   inside the circle, and the number under the slider stops moving at the bound rather than
   continuing to count.
6. **Reset.** Reset framing, then check the row: `crop_scale`, `crop_x`, `crop_y` are all NULL
   again (`npm run db:studio`, or `select crop_scale, crop_x, crop_y from nina_avatars`).
7. **Zero current is unreachable.** Try Remove on the current photo: disabled, with the reason in
   the tooltip. Force it anyway from the console by calling the action with that id: it returns
   *"That is her current photo — make another one current first."* and the row is still there.
   Then make another photo current and remove the first: the row goes, and
   `select count(*) from nina_avatars where is_current` is still exactly 1.
8. **She notices.** After a Make current, `select is_current, announced_at from nina_avatars` shows
   the new row `is_current = true, announced_at = null` — phase 10's `avatar_changed` trigger's
   input, with no `nina_messages` row written by this phase.

**Exit criteria** — the phase is done when all eight hold:

1. A signed-in account not in `ADMIN_EMAILS` gets a 404 from `/admin`, `/admin/nina` and
   `POST /api/admin/nina/upload` alike; a signed-out one gets the sign-in screen.
2. `/admin/nina` renders in a deliberate desktop layout: no `AppShell`, no `TabBar`, no
   `max-w-[470px]`, and the tokens and dark mode still work.
3. A crop saved in the studio reads back identically after a reload, and an identity crop is stored
   as three NULLs.
4. `ninaCropStyle` is the only crop-to-CSS mapping in the repo (`grep -rn "crop_scale\|cropScale"
   app components lib | grep -v crop.ts` finds no arithmetic outside it), and the studio, both
   sanity circles and the album thumbnails all render through it.
5. The image can never be dragged or zoomed off its frame — proved by the property test in
   `lib/nina/crop.test.ts`, not by hand.
6. Every upload lands with a description on the happy path; a describe failure leaves a visible
   "Describe it" button and no lost photo.
7. Removing the current photo is impossible from the UI **and** from the action, and
   `count(*) where is_current` is never 0 while the album is non-empty.
8. `npm run typecheck && npm run lint && npm test` and every `ci:*` guard pass.

---

## Handoffs

**1. Phase 13 (R17/R19/R20) must render her avatar through `ninaCropStyle`.** This is the other
half of exit criterion 4 and it is deliberately not done here: rendering the *current album photo*
in the chat header and on her detail page serves R17/R19/R20, which are phase 13's, and
`components/nina/NinaAvatar.tsx` is phase 4's file extended by phase 13. Phase 13 also lands
*before* this phase in the index's ordering, so it cannot import `lib/nina/crop.ts` unless the
reconciler moves that file earlier (see note 2). **The exact edit, so nobody has to derive it:**

```tsx
// components/nina/NinaAvatar.tsx — phase 13's version, which takes the current album row
import { ninaCropStyle, resolveCrop, type NinaCropInput } from '@/lib/nina/crop'

export function NinaAvatar({
  size = 'md',
  src = NINA_AVATAR_SRC,
  natural = null,
  crop = null,
  className,
}: {
  size?: keyof typeof SIZES
  src?: string
  natural?: { width: number | null; height: number | null } | null
  crop?: NinaCropInput | null
  className?: string
}) {
  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-pill bg-paper-2',
        SIZES[size],
        className,
      )}
    >
      {/* A blob-hosted album photo is a plain <img>: the crop transform owns
          position/width/height/left/top, which is exactly what `next/image fill` sets itself.
          The committed fallback keeps its <Image>. */}
      {crop == null && src === NINA_AVATAR_SRC ? (
        <Image src={src} alt="" fill sizes="88px" className="object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" draggable={false} style={ninaCropStyle(natural ?? {
          width: null, height: null,
        }, resolveCrop(crop))} />
      )}
    </span>
  )
}
```

Until that lands, a crop saved in the admin tool is stored correctly and simply not honoured by the
chat header — visible, additive, and not a data problem.

**2. Reconciler: `lib/nina/crop.ts` may need to move earlier.** It is pure, imports nothing and
depends on no schema, so it can be lifted into phase 1 (or phase 13) verbatim. That is the clean
fix for the ordering problem in note 1. If it moves, Step 1 and Step 2 of this phase become
no-ops and everything else here is unchanged.

**3. `public/nina/avatar-001.png` is spelled in two places.** Phase 4 exports `NINA_AVATAR_SRC`
from `components/nina/NinaAvatar.tsx`; this phase exports `NINA_AVATAR_FALLBACK_SRC` from
`components/admin/CircleFrame.tsx` rather than importing across a phase boundary it does not own.
One of the two should win — probably a constant in `lib/nina/crop.ts`'s neighbourhood or in phase
6's `lib/nina/images.ts`. Trivial, and worth doing before a third copy appears.

**4. Phase 12: move the generation anchor into Blob, so both writers can re-anchor.** RU-16 says
the profpic path always re-anchors, and this page **cannot** — `assets/nina/_anchor.png` is a
committed repo file and a serverless filesystem is read-only. Today the consequence is that an
admin upload changes the photo she *shows* but not the face she *generates*, which the page states
on screen. The real fix belongs to phase 12, which owns the anchor read path: store the anchor as a
blob (`nina/<userId>/_anchor.<ext>`) with the committed PNG as the fallback, and both the CLI and
this page can then re-anchor with one write. **Not done here** because changing what phase 12 reads
from is phase 12's decision, and R20 is its requirement, not R23.

**5. `scripts/blob-reap.mjs` still only knows `shots/`.** This phase deletes an avatar's blob
inline when the row goes, so it does not *create* orphans on the happy path — but a failed `del`
leaves one, and phase 6 and phase 12 write under `nina/` too. Phase 14 already filed this; it is
restated because this phase adds a third writer under that prefix.

**6. `proxy.ts`'s matcher: one ruling covers `/nina` and `/admin` together.** Neither is in the
positive matcher. For `/admin` that is argued above (the gate already redirects, and `?next=` is
read by nothing). The reconciler should decide once for both rather than letting two phases each
decide differently; if the answer is "add them", the line is
`matcher: [..., '/nina', '/admin/:path*']` and `tests/auth.proxy.matcher.test.ts` gains two cases.

**7. Phase 16 inherits three things and should touch nothing else here:** `requireAdmin()` /
`requireAdminApi()` from `lib/admin/requireAdmin.ts`, `app/admin/layout.tsx` (no edit — the layout
gates the whole subtree), and **one entry appended to `LINKS` in `components/admin/AdminNav.tsx`**.
Its own page, actions and schema are its own.

**8. Not done, deliberately, and each is a card rather than a TODO:** pinch-to-zoom on touch
(argued in `CropStudio`'s header — R23 says desktop); a "generate one now" button that calls phase
12's avatar entry point (phase 12 owns the queue, the cap and the failure copy, and R18/R22 are
its requirements); bulk delete; reordering the album; and editing a description by hand, which is
`/admin/memory`-shaped work and belongs beside phase 16's ledger editor if it is wanted at all.

---

## Rollback

This phase is **purely additive except for one append**, so backing it out is mechanical:

1. `git revert` the phase commit. That deletes the sixteen new files and removes the three appended
   functions from `lib/nina/queries.ts`.
2. Nothing else in the tree referenced any of it — no existing component imports
   `lib/nina/crop.ts`, no route imports `lib/admin/*`, `package.json` is unchanged, `proxy.ts` and
   `auth.config.ts` are unchanged, and no migration was written. `/admin` simply 404s for everyone
   again.
3. **Two things survive the revert and are data, not code:**
   - `nina_avatars` rows with `source = 'admin'`, including whichever one is `is_current`. Her
     current photo stays whatever the admin last chose; the committed
     `public/nina/avatar-001.png` fallback only reappears if the album is emptied by hand.
   - `crop_scale` / `crop_x` / `crop_y` values on any row that was framed. **They are inert after
     a revert** — phase 1's convention says all-NULL is "no transform", and a renderer that has
     lost `ninaCropStyle` reads none of the three, so a framed photo renders as plain
     `object-cover` again rather than incorrectly. To clear them:
     `update nina_avatars set crop_scale = null, crop_x = null, crop_y = null;`
4. Blob objects under `nina/<userId>/avatar-*` are not removed by the revert. They are public
   images nothing references once the rows are gone; delete them with `npm run blob:reap` **after**
   that script learns the `nina/` prefix (Handoff 5), or by hand.
