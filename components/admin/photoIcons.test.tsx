// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  BrushIcon,
  CheckIcon,
  DownloadIcon,
  PersonFrameIcon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  SparklesIcon,
  SwapIcon,
  TrashIcon,
} from './photoIcons'

/**
 * Ten glyphs, one contract. The file header names the two invariants that can actually
 * regress: every glyph is `aria-hidden` (the accessible name is the control's `aria-label`, never
 * the picture — an un-hidden icon would double-announce every button on the page), and the size
 * belongs to the caller via `className`. Below that, each glyph pins ONE signature substring of
 * its own path data — the header's stated fear is "one trash can ends up with two silhouettes",
 * and a copy-paste that overwrote one glyph's paths with another's would otherwise render
 * fine and look almost right. `PersonFrameIcon` is circles, not paths, so its signature is its
 * outer circle.
 */

const GLYPHS: ReadonlyArray<{
  name: string
  Icon: (props: { className: string }) => React.ReactElement
  signature: string
}> = [
  { name: 'PlusIcon', Icon: PlusIcon, signature: '<path d="M5 12h14"></path>' },
  { name: 'SwapIcon', Icon: SwapIcon, signature: '<path d="M21 12a9 9 0 0 0-15-6.7L3 8">' },
  { name: 'TrashIcon', Icon: TrashIcon, signature: '<path d="M3 6h18">' },
  { name: 'CheckIcon', Icon: CheckIcon, signature: '<path d="M20 6 9 17l-5-5">' },
  { name: 'BrushIcon', Icon: BrushIcon, signature: '<path d="m9.06 11.9 8.07-8.06' },
  {
    name: 'PersonFrameIcon',
    Icon: PersonFrameIcon,
    signature: '<circle cx="12" cy="12" r="10">',
  },
  { name: 'DownloadIcon', Icon: DownloadIcon, signature: '<path d="M12 15V3">' },
  { name: 'RotateCcwIcon', Icon: RotateCcwIcon, signature: '<path d="M3 12a9 9 0 1 0 9-9' },
  { name: 'SendIcon', Icon: SendIcon, signature: '<path d="M14.536 21.686' },
  { name: 'SparklesIcon', Icon: SparklesIcon, signature: '<path d="M11.017 2.814' },
]

describe('photoIcons', () => {
  it.each(GLYPHS)('$name renders exactly one svg', ({ Icon }) => {
    const { container } = render(<Icon className="size-4" />)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })

  it.each(GLYPHS)(
    '$name is aria-hidden — the accessible name is the control’s, never the picture',
    ({ Icon }) => {
      const { container } = render(<Icon className="size-4" />)
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    },
  )

  it.each(GLYPHS)('$name takes its size from the caller’s className', ({ Icon }) => {
    const { container } = render(<Icon className="size-7 text-red" />)
    expect(container.querySelector('svg')).toHaveClass('size-7', 'text-red')
  })

  it.each(GLYPHS)('$name draws with the shared stroke idiom', ({ Icon }) => {
    const { container } = render(<Icon className="size-4" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('fill', 'none')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('stroke-width', '2')
    expect(svg).toHaveAttribute('stroke-linecap', 'round')
    expect(svg).toHaveAttribute('stroke-linejoin', 'round')
  })

  it.each(GLYPHS)('$name keeps its own silhouette', ({ Icon, signature }) => {
    // Pins one distinctive fragment of the glyph’s own markup. A paste-over of one icon’s
    // geometry with another’s fails here even though the component still renders.
    const { container } = render(<Icon className="size-4" />)
    expect(container.querySelector('svg')?.innerHTML).toContain(signature)
  })

  it('gives every glyph a DISTINCT signature — the table itself must not collapse', () => {
    // If two rows ever carry the same signature, the per-glyph pin above can no longer tell the
    // two silhouettes apart, which is the exact failure this suite exists to catch.
    const signatures = GLYPHS.map((g) => g.signature)
    expect(new Set(signatures).size).toBe(signatures.length)
  })
})
