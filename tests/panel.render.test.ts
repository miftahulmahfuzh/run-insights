import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DetailPanel } from '@/components/ui/DetailPanel'
import { RunDateLink } from '@/components/ui/RunDateLink'

/**
 * F24's two new pieces of chrome, rendered to static markup — the same technique and the same
 * limits as `tests/badges.render.test.ts`. `createElement` rather than JSX because the runner's
 * `include` covers `tests/**\/*.test.ts` and a second config to admit `.tsx` would be the worse
 * trade.
 *
 * What this catches: that the shell renders nothing while shut, that the band and the footer are
 * where the panel's layout says they are, and that `RunDateLink`'s two branches really are a link
 * and not-a-link. What it cannot catch — no jsdom, so no `showModal`, no Escape, no backdrop tap,
 * no back gesture — is listed in `docs/plans/F24-detail-panel-history.md` §5.
 */
const ART = { src: '/badges/x.deadbeef.webp', twill: '#0a152c', width: 768, height: 576 }

/* eslint-disable react/no-children-prop --
   The shell's child is a render prop, `(titleId: string) => ReactNode`, and `createElement`'s
   positional children are typed `ReactNode`: a function cannot travel that way, so the prop form is
   the only one that type-checks. `next build` runs `tsc` over this file too and says so in six
   places if the positional form is used instead. */
const body = (titleId: string) => createElement('h2', { id: titleId }, 'Fashionably Late')

describe('DetailPanel', () => {
  it('renders no body at all while closed', () => {
    const html = renderToStaticMarkup(
      createElement(DetailPanel, { open: false, art: ART, onClose: () => {}, children: body }),
    )
    // The <dialog> itself is in the document; its contents are not. A `display: none` dialog still
    // has its subtree in the reading order of every other element on the page.
    expect(html).toContain('<dialog')
    expect(html).not.toContain('Fashionably Late')
    expect(html).not.toContain('Close')
    expect(html).not.toContain(ART.src)
  })

  it('hangs the art in the band, at the art’s own intrinsic size', () => {
    const html = renderToStaticMarkup(
      createElement(DetailPanel, { open: true, art: ART, onClose: () => {}, children: body }),
    )
    expect(html).toContain('aspect-[4/3]')
    expect(html).toContain('width="768"')
    expect(html).toContain('height="576"')
    // The band paints the cloth behind a slow decode.
    expect(html).toContain('background-color:#0a152c')
    // Empty alt: everything the panel is about is real text below it.
    expect(html).toContain('alt=""')
    // Not dimmed unless asked — a personal record is always held by a real run.
    expect(html).not.toContain('grayscale')
  })

  it('dims the art on request, which is the locked-badge treatment', () => {
    const html = renderToStaticMarkup(
      createElement(DetailPanel, {
        open: true,
        art: { ...ART, dimmed: true },
        onClose: () => {},
        children: body,
      }),
    )
    expect(html).toContain('grayscale')
    expect(html).toContain('opacity-50')
  })

  it('labels the dialog with the id it hands the body, so a caller cannot forget to', () => {
    const html = renderToStaticMarkup(
      createElement(DetailPanel, { open: true, art: ART, onClose: () => {}, children: body }),
    )
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1]
    expect(labelledBy).toBeTruthy()
    expect(html).toContain(`<h2 id="${labelledBy}">Fashionably Late</h2>`)
  })

  it('keeps the footer’s Close button and the body’s scroll container', () => {
    const html = renderToStaticMarkup(
      createElement(DetailPanel, { open: true, art: ART, onClose: () => {}, children: body }),
    )
    expect(html).toContain('Close')
    expect(html).toContain('overflow-y-auto')
    expect(html).toContain('overscroll-contain')
    // F23's arithmetic: the gap under Close reads as the gap above the body's first line.
    expect(html).toContain('pb-[calc(1rem+var(--safe-bottom))]')
  })

  it('draws no band when there is no art, rather than an empty rectangle', () => {
    const html = renderToStaticMarkup(
      createElement(DetailPanel, { open: true, art: null, onClose: () => {}, children: body }),
    )
    expect(html).not.toContain('aspect-[4/3]')
    expect(html).toContain('Fashionably Late')
  })
})

describe('RunDateLink', () => {
  it('links a day that has a run', () => {
    const html = renderToStaticMarkup(
      createElement(RunDateLink, { day: '2026-08-20', runId: 'run_canonical' }),
    )
    expect(html).toContain('href="/r/run_canonical"')
    expect(html).toContain('Thu, 20 Aug 2026')
    // The affordance belongs to the primitive, so two panels cannot disagree about it.
    expect(html).toContain('underline')
  })

  it('renders a day with no run as text that does not invite a tap', () => {
    /*
     * The ordinary case for a whole class of dates, not an edge case: `StoredBadge.runId` is null
     * for every week, month and lifetime badge — `century_club` was not earned by one run — and for
     * a session badge whose run has since been deleted.
     */
    const html = renderToStaticMarkup(
      createElement(RunDateLink, { day: '2026-08-20', runId: null }),
    )
    expect(html).not.toContain('<a')
    expect(html).not.toContain('underline')
    expect(html).toContain('Thu, 20 Aug 2026')
  })

  it('formats the day through lib/format either way — R-23', () => {
    const linked = renderToStaticMarkup(
      createElement(RunDateLink, { day: '2026-07-04', runId: 'run_x' }),
    )
    const plain = renderToStaticMarkup(
      createElement(RunDateLink, { day: '2026-07-04', runId: null }),
    )
    expect(linked).toContain('Sat, 4 Jul 2026')
    expect(plain).toContain('Sat, 4 Jul 2026')
  })

  it('takes the caller’s type and keeps its own affordance', () => {
    const html = renderToStaticMarkup(
      createElement(RunDateLink, {
        day: '2026-08-20',
        runId: 'run_x',
        className: 'text-[12px] font-semibold text-accent',
      }),
    )
    expect(html).toContain('text-[12px]')
    expect(html).toContain('underline-offset-2')
  })
})
