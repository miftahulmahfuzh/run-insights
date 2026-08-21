import type { MetadataRoute } from 'next'

import { shareOrigin } from '@/lib/share/origin'

/**
 * `robots.txt`, and the one non-obvious tradeoff in it.
 *
 * ── WHY `/s` IS *ALLOWED* TO BE CRAWLED, ON A PAGE CARRYING HEALTH DATA ────────────────────────
 * "It's sensitive, so disallow it too" is the wrong instinct twice over.
 *
 *   1. **`Disallow` and `noindex` are different mechanisms.** `Disallow` says *don't fetch*;
 *      `noindex` says *don't list*. A URL Google learns about some other way — a public tweet, a
 *      forwarded link in a crawled forum — gets indexed on the strength of that reference alone
 *      **precisely because** the crawler was forbidden from fetching the page and reading the
 *      `noindex` that would have stopped it. Blocking the fetch removes the only instruction that
 *      actually works.
 *   2. **It would kill the WhatsApp card.** `facebookexternalhit` respects robots.txt. Disallowing
 *      `/s` means every shared run arrives as a bare blue URL with no preview — breaking the exact
 *      delivery mechanism D9 was designed around ("send it to a friend over WhatsApp").
 *
 * So: `/s` is fetchable and unindexable, enforced twice over in `next.config.ts`'s `X-Robots-Tag`
 * header and the page's own `generateMetadata` `robots` block (the header covers non-HTML responses
 * and intermediary caches; the meta tag is what a crawler that already fetched actually reads).
 *
 * ── WHY THE AUTHENTICATED ROUTES ARE DISALLOWED ANYWAY ────────────────────────────────────────
 * Not as a security control — `requireUserId()` is that, and a crawler gets a redirect to the
 * sign-in screen from every one of them. It is to stop a search result that says "Run Insights ·
 * Trends" and lands a human on a sign-in page. `/api/*` is listed for the same reason: there is
 * nothing there for a crawler and a 401 in an index is noise.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/s/'],
      disallow: ['/upload', '/r/', '/x/', '/trends', '/me', '/onboarding', '/api/'],
    },
    // The canonical apex (roadmap §4.8), never a per-deployment hostname — same resolver the share
    // links themselves are built from, so the two can never disagree about what this site is called.
    host: shareOrigin(),
  }
}
