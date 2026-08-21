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
       * F10 / D12. `public/badges/<key>.<hash8>.webp` carries the first 8 hex of its master's
       * SHA-256 in the filename, written by `tools/make_badge_assets.py` and recomputed from
       * the master by `npm run badges:check`. That is what makes a one-year immutable cache
       * safe rather than reckless: regenerating a patch changes its bytes, its hash and its
       * URL, so every cache in the world misses correctly instead of serving last season's
       * artwork until 2027. **Do not put slug-named art under this path** — the header would
       * pin it for a year, and the orphan sweep in `make_badge_assets.py` (plus §4 of
       * `badges:check`) is what keeps a superseded file from lingering there at all.
       */
      {
        source: '/badges/:file*',
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
