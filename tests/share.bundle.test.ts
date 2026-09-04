import { describe, expect, it } from 'vitest'

import {
  importGraph,
  isClientModule,
  readRepoCode,
  readRepoFile,
  repoFileExists,
} from './support/importGraph'

/**
 * **The import-graph suite. This file is F11's structural conscience.**
 *
 * `/s/[token]` is the only route in this application that answers to somebody with no account, and
 * every one of its guarantees is a *negative* — a module it must not reach, a field it must not
 * carry, a boundary a prop must not cross. Negatives are invisible in review and invisible at
 * runtime: a page that "just quickly" resolves HRmax for a nicer percentage renders perfectly and
 * violates a binding constraint. These assertions are what notice.
 *
 * They are static, on purpose. See `tests/support/importGraph.ts` for why a text scan proves more
 * here than an actual import would.
 */

const PAGE = 'app/(public)/s/[token]/page.tsx'
const LAYOUT = 'app/(public)/s/[token]/layout.tsx'

const graph = [...importGraph(PAGE)]

describe('the public share route reaches nothing it must not', () => {
  it('never reaches lib/metrics/hrMax.ts — F02 INVARIANT B', () => {
    /*
     * THE most important assertion in this file.
     *
     * F02 §6.3: "the shared page must render from already-computed, stored values... never by
     * calling resolveHrMax at share-view time." `resolveHrMax` reads `profiles.max_hr` and
     * `birth_year`, and a stranger with a link must not be able to infer — even indirectly, even
     * from the mere presence of a percentage — whether the runner filled in their age.
     *
     * The %HRmax figure on the page comes from `insights.payload.hrMaxUsed`, frozen at generation
     * time inside the authenticated path (R-11). If this assertion ever fails, the fix is to stop
     * importing the resolver, never to relax the test.
     */
    expect(graph).not.toContain('lib/metrics/hrMax.ts')
  })

  it('never reaches lib/metrics/index.ts, whose barrel re-exports the resolver', () => {
    // A subtler version of the same failure: `import { computeSessionMetrics } from '@/lib/metrics'`
    // looks harmless and drags `resolveHrMax` in behind it. Every number on the public page is
    // either a stored column or F11's own division of two stored integers, so the barrel has no
    // business in this graph at all.
    expect(graph).not.toContain('lib/metrics/index.ts')
  })

  it('does not read the session', () => {
    expect(graph.filter((f) => f.startsWith('lib/auth/'))).toEqual([])
    expect(graph).not.toContain('auth.ts')
    expect(graph).not.toContain('auth.config.ts')
  })

  it('does not reach the shell, which is how the session got in once already', () => {
    /*
     * F33 phase 10 put Nina's unread badge — and therefore `getUserId()` — inside `TabBar`, which
     * `AppShell` renders. This page has never rendered either, but it imported five components
     * through `@/components/ui`, whose barrel re-exports `AppShell`, and the assertion above went
     * red. The fix was to import those five by file; this is what keeps the barrel from coming
     * back and taking the shell with it.
     *
     * A shared run is a standalone page for somebody with no account. There is no tab bar to
     * render for them and nothing on it they could press.
     */
    expect(graph).not.toContain('components/ui/index.ts')
    expect(graph).not.toContain('components/ui/AppShell.tsx')
    expect(graph).not.toContain('components/ui/TabBar.tsx')
  })

  it('reaches no Server Action — a shared page has no mutation surface', () => {
    expect(graph.filter((f) => f.startsWith('app/actions/'))).toEqual([])
  })

  it('never reaches the owner-side share components', () => {
    // Their copy says "your screenshots" and "stop sharing", and two of the three carry a Server
    // Action import. None of them belongs on a page whose reader owns nothing.
    for (const owner of [
      'components/share/ShareButton.tsx',
      'components/share/ShareLinkPanel.tsx',
      'components/share/PhotoInclusionList.tsx',
    ]) {
      expect(graph).not.toContain(owner)
    }
  })

  it('never reaches the owner-side copy module', () => {
    // `lib/share/copy.ts` is second-person: "the link you already sent". `app/s/[token]/copy.ts` is
    // the public voice. One page importing both is how a "your" ends up in front of a stranger.
    expect(graph).not.toContain('lib/share/copy.ts')
    expect(graph).toContain('app/(public)/s/[token]/copy.ts')
  })

  it('never reaches the narrative or vision clients — no LLM call at view time', () => {
    expect(graph.filter((f) => f.startsWith('lib/llm/'))).toEqual([])
  })

  it('never reaches the badge or record catalogues — §3.8, one session only', () => {
    expect(graph.filter((f) => f.startsWith('lib/badges/'))).toEqual([])
    expect(graph.filter((f) => f.startsWith('lib/records/'))).toEqual([])
  })

  it('does read the one thing it must: the token query, through F11 own cached wrapper', () => {
    expect(graph).toContain('lib/share/read.ts')
    expect(graph).toContain('lib/db/queries.ts')
  })
})

describe('the public layout is a shell and nothing else', () => {
  const layoutGraph = [...importGraph(LAYOUT)]

  it('imports no session, no tab bar, no analytics', () => {
    expect(layoutGraph.filter((f) => f.startsWith('lib/auth/'))).toEqual([])
    expect(layoutGraph).not.toContain('components/ui/TabBar.tsx')
    expect(layoutGraph).not.toContain('components/ui/AppShell.tsx')
  })
})

describe('caching cannot serve a revoked link', () => {
  const source = readRepoFile(PAGE)

  it('is force-dynamic', () => {
    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })

  it('has no loading.tsx anywhere on its ancestry — measured, not theorised', () => {
    /*
     * `loading.tsx` wraps its own segment AND every segment below it. Once a Suspense fallback can
     * render, the response body starts streaming, the headers are on the wire, and the status can no
     * longer change (Next docs, loading.md -> "Status Codes"). So a boundary four directories up is
     * just as fatal as one in this folder.
     *
     * This is why `/s/[token]` lives in `app/(public)/` and F08's list skeleton moved to
     * `app/(app)/loading.tsx`: `/s/<unknown-token>` answered **200** while that file sat at
     * `app/loading.tsx`, and **404** afterwards, with the page code unchanged.
     */
    for (const segment of ['app', 'app/(public)', 'app/(public)/s', 'app/(public)/s/[token]']) {
      expect(repoFileExists(`${segment}/loading.tsx`), `${segment}/loading.tsx`).toBe(false)
    }
  })

  it('keeps the run-list skeleton scoped to the route it was written for', () => {
    // The other half of the same property, asserted positively so the fix reads as a decision rather
    // than as a deleted file.
    expect(repoFileExists('app/(app)/loading.tsx')).toBe(true)
    expect(repoFileExists('app/(app)/page.tsx')).toBe(true)
  })

  it('declares no revalidation, no static params and no cache directive', () => {
    // Code only. The doc comment above `dynamic` names all four of these, explaining why they are
    // absent — a guard that fires on its own explanation gets silenced.
    const code = readRepoCode(PAGE)
    for (const forbidden of [
      'unstable_cache',
      "'use cache'",
      'generateStaticParams',
      'export const revalidate',
    ]) {
      expect(code).not.toContain(forbidden)
    }
  })

  it('sets no-store and noindex headers on /s/:token', () => {
    const config = readRepoFile('next.config.ts')
    expect(config).toContain("source: '/s/:token'")
    expect(config).toContain('no-store')
    expect(config).toContain('noindex, nofollow, noarchive')
    expect(config).toContain('strict-origin-when-cross-origin')
  })
})

describe('the client boundary carries only narrow props — §3.7', () => {
  /*
   * Recharts requires 'use client', and whatever crosses that boundary is serialised into the page's
   * RSC flight payload and shipped to the browser VERBATIM — an unused key on a prop object is not
   * protected by the component choosing not to render it. So the rule is not "the page is a Server
   * Component, therefore it is fine": it is that no client module in this graph may name one of
   * F11's wide types in a prop position.
   */
  const clientModules = graph.filter(isClientModule)

  it('includes at least the pace/HR chart, or this assertion is vacuous', () => {
    expect(clientModules).toContain('components/charts/PaceHrChart.tsx')
  })

  it('names no wide share type in any client module the page reaches', () => {
    for (const file of clientModules) {
      const source = readRepoCode(file)
      for (const wide of ['SharedRunView', 'SharedInsightView', 'SharedRun']) {
        expect(source, `${file} names ${wide} — narrow the prop instead`).not.toContain(wide)
      }
    }
  })

  it('no client module the page reaches mentions the withheld insight fields', () => {
    for (const file of clientModules) {
      const source = readRepoCode(file)
      expect(source, `${file} mentions doNext`).not.toContain('doNext')
      expect(source, `${file} mentions questionForRunner`).not.toContain('questionForRunner')
    }
  })
})
