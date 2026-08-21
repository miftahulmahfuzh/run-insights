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
 * `metadata.appleWebApp`, spread into the root layout.
 *
 * ── `statusBarStyle: 'default'`, AND WHY IT IS NOT 'black-translucent' ─────────────────────────
 * Translucent is the better-looking option and the wrong one here. It means the page is drawn
 * UNDER the status bar, and it is only safe when every fixed top element pads itself by
 * `env(safe-area-inset-top)`. In this app exactly one element does — `components/review/
 * ScreenshotStrip.tsx`, a full-bleed overlay — while `ScreenHeader` and every page under `app/`
 * use a plain `p-5`. Turning this translucent would slide the "TODAY" and "TRENDS" titles up
 * behind the clock and the notch, trading a visible bug for a worse-looking one.
 *
 * The prerequisite for changing it is padding the top of the app's chrome by `--safe-top`, the
 * inset token `globals.css` already defines and almost nothing uses. Until then, `default` keeps
 * the status bar opaque and the layout honest.
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
