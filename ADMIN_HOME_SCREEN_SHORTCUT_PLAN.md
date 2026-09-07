# Plan: an iOS home-screen shortcut that opens `/admin`

**Slug:** admin-home-screen-shortcut
**Date:** 2026-09-07 09:11:06 +07
**Analysis:** `20260907-091106-ADMN_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-home-screen-shortcut`
**Branch:** `feature/admin-home-screen-shortcut` (base: `origin/main` @ `f839116`)
**Phases:** 2
**Status:** planned
**Coordinator:** —

---

## Why

The user's words, verbatim:

> i use /admin page so much, i want to make it into a shortcut (ios safari -> create into a
> homepage). i could do this, but the resulting shortcut only opens to runins.site/ (the homepage,
> not the admin page). what should we to to achieve this? should i buy a new domain, and put /admin
> into that new domain?

The tile is not misbehaving. `app/manifest.ts:26` says `start_url: '/'`, every page in the app
links that one manifest (`app/layout.tsx:47`), and Safari on iOS ≥ 16.4 launches an installed app
from its manifest's `start_url` rather than from the URL that was on screen. So Add to Home Screen
on `/admin` installs *the runner's app*, correctly, from an admin page. The fix is a second
manifest.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | A home-screen tile that opens on `/admin` — *"i want to make it into a shortcut (ios safari -> create into a homepage)"* | 1, 2 |
| R2 | An answer to *"should i buy a new domain, and put /admin into that new domain?"* | 1 |

R2 is answered **no**, decided at Step 8 and recorded under `## Decisions`. Phase 1 owns it because
its plan writes the reasoning into the new route's docstring, where the next person to wonder will
be standing. A second domain solves nothing the manifest does not — the launch URL comes from
`start_url`, not from the hostname — and it costs a certificate, an `AUTH_URL`, a second Auth.js
callback origin, a cross-origin session cookie that `auth.config.ts` does not issue, and a
`next.config.ts` image allow-list entry. See the Decisions table.

## Scope

**In scope**

- A second web app manifest served at `/admin/manifest.webmanifest`, `start_url: '/admin'`,
  `id: '/admin'`, linked from `app/admin/layout.tsx` and therefore from every route under `/admin`.
- An admin-specific `apple-touch-icon` and manifest icon set, so the two tiles are told apart on a
  home screen at 40 px.
- Assertions in `tests/pwa.install.test.ts` for both, plus assertions that the **runner's** install
  contract did not move.

**Out of scope, and why**

- **A second domain.** R2, answered no. See Decisions.
- **`statusBarStyle: 'black-translucent'`.** `lib/pwa.ts:73-89` gates it on the RUNNER's screens
  padding `--safe-top`, and `appleWebApp` is emitted once from the root layout, so flipping it for
  `/admin` flips it for `/`. `tests/pwa.install.test.ts:128-141` holds the value and is the
  reminder. Untouched.
- **`scope: '/admin'`.** Refused deliberately. `lib/admin/requireAdmin.ts:75` answers a session-less
  request with `redirect('/')`; a narrower scope would eject the installed admin app into Safari on
  exactly the day the cookie expired.
- **Offline/caching for `/admin`.** `lib/service-worker.js` has no `fetch` handler by design and
  this feature does not get to add one in passing.
- **`tools/gen_app_icon.py`, OpenRouter, any image API.** Phase 2 composes the admin tile from the
  silhouette already committed at `assets/icon/silhouette.png`. No key, no call, and
  `npm run ci:openrouter-guard` stays green untouched.
- **A `/admin` entry in `proxy.ts`.** Ruling D3 settled that; nothing here reopens it.
- **A `viewport` export on `app/admin/layout.tsx`** — i.e. an admin-specific status-bar tint from
  `--paper-2`. Whether a nested `viewport` export replaces the whole object or merges key by key
  was **not verified**, and if it replaces, `/admin` silently loses `viewportFit: 'cover'` and
  every `env(safe-area-inset-*)` in that shell — all four of which
  `admin-responsive-nina-intimacy` phase 1 put there deliberately — goes inert. A tint is not
  worth that bet. Verify it first if you want it; `lib/pwa.ts` gets no `ADMIN_INSTALL.paperDark`
  until someone does.

## Invariants

1. **The runner's install contract does not move.** `app/manifest.ts` is not edited by either
   phase. `INSTALL`, `PWA_ICONS` and `APPLE_WEB_APP` keep every current value; phase 1 and 2 *add*
   exports beside them. `public/icons/icon-*.png`, `app/icon.png` and `app/apple-icon.png` keep
   their exact current bytes. If a phase's diff touches any of those, the phase is wrong.
2. **`npm run lint`, `npm run typecheck` and `npm test` pass at the end of each phase**, and the
   tree builds. A phase never leaves the tree red for the next.
3. **The admin layout never sets `metadata.icons`.** `next/dist/lib/metadata/resolve-metadata.js:817`
   applies the file-convention icons only `if (!resolvedMetadata.icons)`, so an explicit `icons`
   key would silently delete the very `apple-touch-icon` phase 2 ships.
4. **`scope` is `/` in both manifests.** See Scope.
5. **Every icon PNG shipped is opaque RGB, never RGBA.** iOS mattes a transparent
   apple-touch-icon onto black. `tests/pwa.install.test.ts:101` asserts this for the runner's files
   and phase 2 extends the same assertion to the admin ones.
6. **Icon paths are never content-hashed and never move under `/badges/`.**
   `tools/make_icon_assets.py`'s header states why: `next.config.ts` serves `/badges/:file*`
   `immutable` for a year, which would pin a regenerated icon in every installed home screen.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | The second manifest: `/admin` starts at `/admin` | R1, R2 | `app/admin` + `lib` | 4 | — | NORMAL | `.workflows/plan/admin-home-screen-shortcut/phase-1.md` | — | — |
| 2 | A tile you can tell apart: the admin icon set | R1 | `tools` + `app/admin` + `public/icons` | 10 | 1 | NORMAL | `.workflows/plan/admin-home-screen-shortcut/phase-2.md` | — | — |

### Phase 1 — The second manifest: `/admin` starts at `/admin`

**Satisfies:** R1, R2
**Owns:**
- `lib/pwa.ts` — adds `ADMIN_INSTALL` beside `INSTALL`. Appends only.
- `app/admin/manifest.webmanifest/route.ts` — new. The manifest, and the docstring that answers R2.
- `app/admin/layout.tsx` — adds `manifest` and `appleWebApp` to the existing `metadata` export.
- `tests/pwa.install.test.ts` — appends two `describe` blocks.

**Does not touch:** `app/manifest.ts`, `app/layout.tsx`, any file under `public/`, `app/icon.png`,
`app/apple-icon.png`, `tools/`, `next.config.ts`, `proxy.ts`, the `AdminNav`, or any admin page.

**Exit criteria:**
- `GET /admin/manifest.webmanifest` → `200`, `Content-Type: application/manifest+json`,
  `start_url: "/admin"`, `id: "/admin"`, `scope: "/"`, `display: "standalone"`.
- `/admin`'s `<head>` carries `<link rel="manifest" href="/admin/manifest.webmanifest">` and no
  link to `/manifest.webmanifest`.
- `/`'s `<head>` is unchanged.
- `git diff --stat` names exactly the four files above.
- lint, typecheck, test, build all green.

### Phase 2 — A tile you can tell apart: the admin icon set

**Satisfies:** R1
**Owns:**
- `tools/make_icon_assets.py` — a `--deck {app,admin}` flag; the admin deck is the same
  composition in the DARK scheme's tokens.
- `assets/icon/master-admin.png`, `assets/icon/master-admin-maskable.png` — committed, inspectable.
- `public/icons/admin-icon-192.png`, `admin-icon-512.png`, `admin-icon-maskable-512.png` — new.
- `app/admin/apple-icon.png` — new, 180², the one Safari draws on install.
- `lib/pwa.ts` — appends `ADMIN_PWA_ICONS`.
- `app/admin/manifest.webmanifest/route.ts` — one line: `PWA_ICONS` → `ADMIN_PWA_ICONS`.
- `tests/pwa.install.test.ts` — extends phase 1's admin block with the icon assertions.

**Does not touch:** the runner's five icon files, `assets/icon/master.png`,
`assets/icon/master-maskable.png`, `assets/icon/silhouette.png`, `app/manifest.ts`,
`app/layout.tsx`, `next.config.ts`, `tools/gen_app_icon.py`.

**Exit criteria:**
- `python3 tools/make_icon_assets.py --deck app` reproduces the five runner PNGs **byte for byte**
  (`git status` clean for them) — the regression guard for having refactored the tool.
- `python3 tools/make_icon_assets.py --deck admin` writes the five admin files.
- `/admin`'s `<head>` carries exactly one `<link rel="apple-touch-icon">` and its href resolves to
  `app/admin/apple-icon.png`.
- The admin manifest advertises three admin icons, all present on disk, all opaque, all square, all
  the size they claim.
- lint, typecheck, test, build all green.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| `lib/pwa.ts` edited by both | 1, 2 | Phase 1 adds `ADMIN_INSTALL` only; phase 2 appends `ADMIN_PWA_ICONS` *below* it and quotes the file as phase 1 leaves it. Sequenced by `depends_on: [1]`. |
| `tests/pwa.install.test.ts` edited by both | 1, 2 | Phase 1 owns the two new `describe` blocks; phase 2 adds cases *inside* the ones phase 1 wrote and quotes them post-phase-1. |
| `app/admin/manifest.webmanifest/route.ts` written by 1, edited by 2 | 1, 2 | Phase 1 ships it importing `PWA_ICONS`; phase 2's edit is the single `icons:` line. Phase 1 is deliberately shippable with the runner's icons — a tile that opens `/admin` is the requirement, a distinguishable tile is the polish. |
| which colours the admin tile uses | 2 | The dark scheme's `--paper` / `--ink`, not a new palette. Measured: figure-to-ground 16.17 (the light tile's is 11.89), every zone segment 5.8–11.0 against that ground where the light tile's are 1.24–2.36, and the two grounds sit 13.74 apart, which is the number that makes the tiles distinguishable at 40 px. |
| whether the admin manifest's `background_color` matches the tile | 1, 2 | No, and deliberately. `background_color` paints the launch splash and must match the screen the app opens onto — `/admin`'s shell is `bg-paper-2`, so `#f1f7fb`. `lib/pwa.ts:53-58` makes exactly this argument for the runner: *"They are the APP's ground colour, not the icon's background."* |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| R2: buy a second domain and move `/admin` there, vs. a second manifest on the same origin | **A second manifest. Do not buy a domain.** The launch URL of an installed web app comes from `start_url`, not from the hostname — a second domain serving `/admin` at its root would need the same `start_url` fix to be worth anything, and would additionally cost a DNS record, a certificate, a second `AUTH_URL` and Google OAuth redirect origin, a session cookie that `auth.config.ts` does not issue cross-origin (so every admin visit would be a fresh sign-in), a `next.config.ts` `images.remotePatterns` review, and a second `ADMIN_EMAILS`-scoped environment. It buys nothing the four files in phase 1 do not. | 5: the user's raw input — they asked the question rather than asserting the answer, so it is a fork to decide, not a constraint to honour |
| `orientation` for the admin manifest: `'portrait'` (copy the runner) vs `'any'` | **`'any'`.** `app/admin/layout.tsx:36-40` states that an XS Max in landscape is 896 px and therefore *keeps* the phone layout, and calls that the right outcome. The runner's `'portrait'` is justified by *"there is no landscape layout to rotate into"*; the admin shell has one. | 6: surrounding convention — the admin layout's own docstring |
| `short_name` for the admin app | **`'RI Admin'`** (8 chars). `'Run Insights'` is already exactly the ~12-character ceiling `lib/pwa.ts:47-51` records, so no suffix of it fits. `'Admin'` alone is what every admin panel on the phone is called. | 4: the index's Requirements table — the tile has to be *findable*, which is the point of R1 |
| where the admin manifest lives: `app/admin/manifest.webmanifest/route.ts` vs `app/admin/manifest/route.ts` | **`manifest.webmanifest/route.ts`.** Verified against the installed framework, not assumed: `next/dist/lib/metadata/is-metadata-route.js` anchors the manifest convention regex at the app root (`^[\\/]manifest…`), so a nested directory of that name is compiled as an ordinary Route Handler. The URL then matches what the root manifest is served at, which is the whole reason to prefer it. | 6: convention, decided on read framework source |
| the admin tile's art: generate new art via `tools/gen_app_icon.py`, vs. recompose the committed silhouette | **Recompose.** The silhouette at `assets/icon/silhouette.png` is committed and `tools/make_icon_assets.py` already draws everything else from tokens. A generated second figure would cost an image API call, a judgement loop, and a second master to keep in step, to say the same thing a scheme swap says. | 6: convention — `tools/make_icon_assets.py`'s own division of labour |

## Open Questions

*(empty — every fork above was decidable and was decided)*

## Rollback

- **Phase 2:** `git revert <phase-2-sha>`. The runner's tiles were never touched, and reverting
  restores phase 1's state — an admin tile that opens `/admin` wearing the runner's icon. Anyone
  who already installed it keeps the old icon until iOS refetches the manifest.
- **Phase 1:** `git revert <phase-1-sha>` (revert phase 2 first if it landed). `/admin` goes back
  to linking the root manifest, and an installed admin tile starts opening `/` again. **Delete the
  tile from the home screen after reverting** — iOS caches the manifest per install and a stale one
  will keep launching `/admin` until it does.
- **Whole set:** `git branch -D feature/admin-home-screen-shortcut` before merge; after merge,
  `git revert --no-commit <phase-1-sha>..<phase-2-sha>` in one commit. Nothing in this set writes
  to a database, a blob, or an external service, so rollback is purely a code revert.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f ADMIN_HOME_SCREEN_SHORTCUT_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f ADMIN_HOME_SCREEN_SHORTCUT_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan ADMIN_HOME_SCREEN_SHORTCUT_PLAN.md
