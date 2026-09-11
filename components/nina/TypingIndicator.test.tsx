// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

// Real NinaAvatar and real LoadingDots: the indicator is a COMPOSITION — its whole job is that her
// face and the app's one loading vocabulary land inside her bubble's exact shape. Stubbing either
// would only prove this file's own imagination about the pairing.
import { TypingIndicator } from './TypingIndicator'
import { ninaCropStyle, resolveCrop } from '@/lib/nina/crop'
import type { ChatAvatar } from './types'

const AVATAR: ChatAvatar = {
  src: 'https://blob.example/nina-album.jpg',
  natural: { width: 1200, height: 900 },
  crop: { scale: 1.4, x: 120, y: -60 },
}

function row(container: HTMLElement) {
  return container.querySelector('li') as HTMLElement
}

describe('TypingIndicator', () => {
  it('is decoration: the whole row is aria-hidden', () => {
    const { container } = render(<TypingIndicator avatar={AVATAR} />)
    expect(row(container).getAttribute('aria-hidden')).toBe('true')
  })

  it('carries the shared three-dot loading vocabulary, not a spinner of its own', () => {
    const { container } = render(<TypingIndicator avatar={AVATAR} />)
    // `LoadingDots` animates through `ri-pulse`, the app's one keyframe — the one a reduced-motion
    // escape already covers. A second keyframe here would fail the motion gate; assert none snuck in.
    const dots = container.querySelectorAll('[class*="ri-pulse"]')
    expect(dots.length).toBe(3)
  })

  it('renders her album face, transformed by the one shared crop mapping', () => {
    const { container } = render(<TypingIndicator avatar={AVATAR} />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(AVATAR.src)
    const expected = ninaCropStyle(AVATAR.natural, resolveCrop(AVATAR.crop))
    expect(img.style.width).toBe(expected.width)
    expect(img.style.left).toBe(expected.left)
    expect(img.style.top).toBe(expected.top)
  })

  it('degrades to the committed face when the caller passes no avatar at all', () => {
    const { container } = render(<TypingIndicator />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toContain('avatar-001')
  })

  it('sits in her bubble’s exact shape — same fill family and tail corner as a "hers" bubble', () => {
    const { container } = render(<TypingIndicator avatar={AVATAR} />)
    const bubble = row(container).querySelector('span:last-child') as HTMLElement
    expect(bubble.className).toContain('bg-card')
    expect(bubble.className).toContain('rounded-bl-chip')
  })
})
