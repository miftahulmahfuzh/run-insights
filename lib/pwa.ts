/**
 * The install contract: what this app is called on a home screen, what it is coloured, and which
 * icon files exist. One module, because the same four facts are needed in three places that cannot
 * see each other — `app/manifest.ts`, the `metadata` export in `app/layout.tsx`, and
 * `tests/pwa.install.test.ts` — and three copies of a hex value is three chances to disagree.
 *
 * ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────────────────────────
 * Because "Add to Home Screen" on iOS gave a Safari bookmark with a letter "R" tiled on it. Two
 * symptoms, one absence: with no manifest there is no `display: standalone`, so Safari keeps its
 * URL bar and share bar; with no icon file there is nothing to draw, so iOS renders the first
 * letter of `<title>`. Neither is visible to a typecheck, a lint or a build — an install contract
 * is invisible to every tool except a phone — which is why it is stated once, here, and asserted.
 *
 * ── NO RUNTIME ANYTHING ────────────────────────────────────────────────────────────────────────
 * Plain constants. No `server-only`, no env read, no image generation: the icons are committed
 * PNGs, generated offline by `tools/gen_app_icon.py` and promoted by `tools/make_icon_assets.py`,
 * the same offline-and-committed rule D12 sets for badge art. Nothing here may ever reach for the
 * image API key those tools use — `npm run ci:openrouter-guard` greps `lib/` for its name, and it
 * greps comments too, which is why this sentence does not spell it out.
 */

/** Icon entries, shared by the manifest and by the test that checks they are really on disk. */
export const PWA_ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  /*
   * A separate FILE, not a flag on the one above. Android draws an installed icon inside its own
   * shape (circle, squircle, teardrop, whichever the launcher uses) and crops whatever it is
   * given, so a design that fills its square loses its edges. A maskable icon is the same art
   * drawn small inside a safe circle of 80% diameter, which is why it cannot be the same bytes.
   */
  {
    src: '/icons/icon-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
] as const satisfies readonly {
  src: string
  sizes: string
  type: string
  purpose: 'any' | 'maskable'
}[]

/**
 * Names and colours.
 *
 * `shortName` is what appears under the icon, and iOS truncates it past roughly twelve
 * characters — "Run Insights" is exactly twelve, which fits with nothing to spare. That is a
 * deliberate choice over a safer abbreviation: "Insights" alone could be any note-taking app, and
 * the label under an icon is the only place this app gets to say its own name.
 *
 * The two colours are `--paper`, light scheme, from `app/globals.css`. A manifest carries a single
 * `theme_color`, so it carries the light one; only the `<meta name="theme-color" media="...">`
 * pair in the layout's `viewport` export can vary by scheme, and that pair is what Safari actually
 * reads to tint the status bar. They are the APP's ground colour, not the icon's background —
 * this value paints the splash screen and the status bar, so it has to match the screen the app
 * opens onto, not the tile it was launched from.
 */
export const INSTALL = {
  name: 'Run Insights',
  shortName: 'Run Insights',
  description: 'Screenshot a run. Get a coach, not a dashboard.',
  /** --paper, light. Keep in step with app/globals.css and docs/design/tokens.css. */
  paper: '#c9e9fb',
  /** --paper, dark. Only the viewport's media-matched pair can use this. */
  paperDark: '#0e1b26',
} as const

/**
 * The SECOND install contract: `/admin`, installed as its own home-screen app.
 *
 * ── WHY A SECOND ONE AND NOT A FIELD ON THE FIRST ──────────────────────────────────────────────
 * Because a manifest describes ONE app. `start_url` is a single value, and it is the value Safari
 * launches an installed tile from — so an app that starts at `/` and an app that starts at
 * `/admin` are two manifests or they are one app. See `app/admin/manifest.webmanifest/route.ts`,
 * which is the whole of the second one.
 *
 * ── WHAT DIFFERS FROM `INSTALL`, AND WHY EACH ONE DIFFERS ──────────────────────────────────────
 * `shortName` is 8 characters and not a suffix of "Run Insights", because that string is already
 * exactly the ~12-character ceiling iOS truncates at (see `INSTALL`) and there is no room to add
 * to it. Two tiles whose labels both read "Run Insigh…" would be a worse outcome than no second
 * tile at all.
 *
 * `paper` is `--paper-2` and not `--paper`: it becomes the admin manifest's `background_color`,
 * which paints the launch splash, and `/admin`'s shell is `bg-paper-2` (`app/admin/layout.tsx`).
 * `INSTALL`'s note applies unchanged — this is the APP's ground colour, not the icon's background,
 * so it has to match the screen the app opens onto. **Phase 2's admin TILE is drawn on the dark
 * scheme's `--paper` and that is not a contradiction**: the tile is the thing you tap, the splash
 * is the frame you land in, and they are answering different questions.
 *
 * ── NO `paperDark` HERE, DELIBERATELY ──────────────────────────────────────────────────────────
 * `INSTALL.paperDark` exists for the media-matched `themeColor` pair in `app/layout.tsx`'s
 * `viewport` export — the only place a scheme-varying status-bar tint can live. Giving `/admin` its
 * own tint would mean exporting `viewport` from `app/admin/layout.tsx`, and whether a nested
 * `viewport` export replaces the whole object or merges key by key has NOT been verified here. If
 * it replaces, `/admin` silently loses `viewportFit: 'cover'` — and every `env(safe-area-inset-*)`
 * in that shell, all four of which `admin-responsive-nina-intimacy` phase 1 put there on purpose,
 * goes inert. A status-bar tint is not worth that bet. Verify it first if you want the tint.
 */
export const ADMIN_INSTALL = {
  name: 'Run Insights Admin',
  /** 8 characters. iOS truncates past ~12; see `INSTALL.shortName`. */
  shortName: 'RI Admin',
  description: "Nina's album, her personality, the chat photos and the memory store.",
  /** --paper-2, light. The admin shell's ground, so the splash matches the first screen. */
  paper: '#f1f7fb',
} as const

/**
 * The admin app's icon entries. Same shape as `PWA_ICONS`, same three purposes, different files.
 *
 * These are the app's icon in the DARK scheme — the same committed silhouette and the same five
 * zone colours as the runner's, drawn on `--paper` dark with the figure in `--ink` dark. That is
 * not decoration: two identically-tiled squircles on one home screen is most of the value of
 * installing the second one gone, and a light tile against a dark tile is the discriminator that
 * survives being 40px wide in peripheral vision. `tools/make_icon_assets.py`'s `GROUND_DARK` note
 * carries the measured contrast table.
 *
 * The HOME-SCREEN icon is not here: `app/admin/apple-icon.png` is a Next file convention, valid at
 * any segment depth, and Next replaces the root's `apple-touch-icon` link with it for `/admin` and
 * everything under it. A manifest alone does not give iOS a home-screen icon — the same sentence
 * `app/layout.tsx` carries about the runner's tile, and the same file convention is the fix.
 */
export const ADMIN_PWA_ICONS = [
  { src: '/icons/admin-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/admin-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: '/icons/admin-icon-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
] as const satisfies readonly {
  src: string
  sizes: string
  type: string
  purpose: 'any' | 'maskable'
}[]

/**
 * `metadata.appleWebApp`, spread into the root layout.
 *
 * ── `statusBarStyle: 'default'`, AND WHY IT IS NOT 'black-translucent' ─────────────────────────
 * Translucent is the better-looking option and the wrong one here. It means the page is drawn
 * UNDER the status bar, and it is only safe when every fixed top element pads itself by
 * `env(safe-area-inset-top)`.
 *
 * That is now true of PART of the app and not of the part that decides this value.
 * `components/review/ScreenshotStrip.tsx` has always padded it, and `admin-responsive-nina-intimacy`
 * phase 1 added the second surface: `app/admin/layout.tsx` pads all four insets and
 * `components/admin/AdminNav.tsx` is a bottom bar on a phone. But `/admin` is one authenticated
 * tool with four routes, while `ScreenHeader` and every page under `app/` still use a plain `p-5`
 * — and those are the screens that would slide up behind the clock and the notch. Turning this
 * translucent today would still trade a visible bug for a worse-looking one, on more screens than
 * it fixed.
 *
 * The prerequisite for changing it is unchanged and is now half done: pad the top of the RUNNER's
 * chrome by `--safe-top`, the inset token `globals.css` defines. Until then, `default` keeps the
 * status bar opaque and the layout honest.
 */
export const APPLE_WEB_APP = {
  /*
   * The line that stops the install from being a bookmark. Next renders it as
   * `<meta name="mobile-web-app-capable" content="yes">`.
   */
  capable: true,
  title: INSTALL.shortName,
  statusBarStyle: 'default',
} as const
