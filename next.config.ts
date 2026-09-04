import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Every route in this app runs on the Node.js runtime — see docs/plans/F01-foundation.md §6.
  reactStrictMode: true,

  // Vercel Blob public URLs. Roadmap D9/§4.3: run_photos.blob_url and /s/[token] both serve
  // these to the browser. Declared here so all host allow-listing lives in one place.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' }],
  },

  /**
   * Headers for the one public route (F11 §3.4 / Task 16). Four, each doing a distinct job:
   *
   *   - `Cache-Control: private, no-store` — **revocation has to bite on the next request.** The
   *     page is already `force-dynamic`, but a shared CDN or a corporate proxy caching an HTML
   *     response would serve a run the runner believes they deleted. `private` forbids the shared
   *     caches; `no-store` forbids the browser's own.
   *   - `X-Robots-Tag: noindex, nofollow, noarchive` — belt to the page's `generateMetadata`
   *     braces. The header covers responses a meta tag cannot reach (a redirect, a 404, a fetch by
   *     something that never parses HTML) and is honoured by intermediary caches. `noarchive`
   *     matters specifically here: an indexed *snapshot* of a run would outlive revocation in
   *     somebody else's storage.
   *   - `Referrer-Policy: strict-origin-when-cross-origin` — **the pathname IS the bearer token.**
   *     Every screenshot on the page is a cross-origin Blob URL, and a full-path `Referer` on those
   *     requests would hand the live share token to a third-party host in a log line. This trims it
   *     to the origin.
   *
   * The matcher is `/s/:token` and not `/s/:path*`: there is exactly one page under `/s`, and a
   * wildcard would quietly cover a future subroute that had not been reasoned about.
   */
  async headers() {
    return [
      /**
       * F33 phase 11 — the app's only service worker (`lib/service-worker.js`).
       *
       * ── WHY THIS MATCHER AND NOT THE GUIDE'S `/sw.js` ─────────────────────────────────────
       * `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` §8 sets these
       * headers on `/sw.js`, which is where a HAND-PLACED worker in `public/` would live. §2 of
       * the same guide — the part this app follows — registers a BUNDLED module via
       * `new URL('../../lib/service-worker.js', import.meta.url)`, and Next 16 compiles that into
       * `.next/static/service-worker/` and serves it from `/_next/static/service-worker/…`
       * (`next/dist/build/index.js:1657`). `/sw.js` matches nothing in this app, and a header
       * entry that matches nothing is worse than no entry: it looks like protection.
       *
       * The framework already supplies `Service-Worker-Allowed: /` on this path — which is what
       * lets a script served from `/_next/…` claim scope `/` — so it is deliberately NOT repeated
       * here. Two copies of that header on one response is how a scope failure becomes
       * intermittent.
       *
       * ── `no-store`, EVEN THOUGH NEXT ALREADY SENDS `max-age=0, must-revalidate` ────────────
       * `router-server.js:436` sets that default only `if (!res.getHeader('cache-control'))`, so
       * this entry wins cleanly. It is stricter on purpose: `must-revalidate` still permits a
       * shared cache to STORE the script, and the artefact this feature can leave behind on a
       * phone — a service worker from three deploys ago, handling pushes with last month's
       * payload contract — is the one worth spending a round trip to avoid. The script is fetched
       * on the update check, not on every page load, so the cost is close to nothing.
       *
       * `Content-Type` is deliberately NOT set, unlike the guide's block. Next already serves
       * `.next/static/service-worker/*.js` with a JavaScript content type through its static
       * handler, and a second one on a response that has one is the header here most likely to end
       * up fighting the framework — with a registration failure that names neither. If registration
       * ever fails with "The script has an unsupported MIME type", that is the moment to add it
       * back with a note, not before.
       *
       * The CSP is the guide's, verbatim and for its stated reason: the worker executes with it,
       * and it has no business loading anything from anywhere.
       */
      {
        source: '/_next/static/service-worker/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      /**
       * F10 / D12. `public/badges/<key>.<hash8>.webp` carries the first 8 hex of its master's
       * SHA-256 in the filename, written by `tools/make_badge_assets.py` and recomputed from
       * the master by `npm run badges:check`. That is what makes a one-year immutable cache
       * safe rather than reckless: regenerating a patch changes its bytes, its hash and its
       * URL, so every cache in the world misses correctly instead of serving last season's
       * artwork until 2027. **Do not put slug-named art under this path** — the header would
       * pin it for a year, and the orphan sweep in `make_badge_assets.py` (plus §4 of
       * `badges:check`) is what keeps a superseded file from lingering there at all.
       *
       * F25 adds `/records/*` on the same terms and for the same reason: the ten
       * personal-record patches are a second deck out of the same pipeline, content-hashed by
       * the same tool and verified by the same script. The two entries are separate rather
       * than one `/(badges|records)/:file*` matcher because `tools/decks.py` is the list of
       * decks, and a regex here that quietly covered a third deck would be granting a
       * one-year immutable cache to files nobody had checked were hashed.
       */
      {
        source: '/badges/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/records/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/s/:token',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },

  // No `eslint` key: `next build` no longer runs the linter in Next 16.
  // No `webpack` key: Turbopack is the default bundler.
}

export default nextConfig
