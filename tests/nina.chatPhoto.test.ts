import { describe, expect, it } from 'vitest'

import { readRepoCode, repoFileExists } from './support/importGraph'

/**
 * R10's structural claims. The arithmetic and the rules are proven in `lib/nina/chatphotos.test.ts`
 * and `lib/photos/save.test.ts`, where they are pure functions. What is left over is a set of
 * claims about SHAPE — that the wiring exists, that the four pre-existing `PhotoViewer` callers did
 * not change, that no second URL writer appeared, and that the private image text still does not
 * cross into a component — and those are properties of the source, not of any one rendered
 * scenario.
 *
 * Comments are stripped by `readRepoCode`, which is load-bearing here: every file below explains at
 * length why it does what it does, and quotes the very strings these assertions forbid.
 */

const VIEWER = 'components/ui/PhotoViewer.tsx'
const IMAGES = 'components/nina/ChatImages.tsx'
const LIST = 'components/nina/MessageList.tsx'
const SCREEN = 'components/nina/ChatScreen.tsx'
const ACTIONS = 'components/nina/ChatPhotoActions.tsx'
const ABOUT = 'components/nina/NinaAboutScreen.tsx'
const STRIP = 'components/review/ScreenshotStrip.tsx'
const INCLUSION = 'components/share/PhotoInclusionList.tsx'
const PUBLIC_PAGE = 'app/(public)/s/[token]/page.tsx'

describe('a chat photo is a tap target that opens the one overlay', () => {
  it('passes ChatImages both of the props it has accepted since F33 phase 13', () => {
    const source = readRepoCode(LIST)
    expect(source).toContain('kinds={message.imageKinds}')
    expect(source).toContain('onOpenImage(message.id, index)')
  })

  it('keeps the grid non-interactive for any caller that does not ask', () => {
    // ChatImages' contract is that an absent `onOpen` is identical markup. An unconditional inline
    // arrow in MessageList would take that away from every future consumer.
    expect(readRepoCode(LIST)).toContain('onOpenImage == null')
  })

  it('opens the shared overlay rather than a second one', () => {
    expect(repoFileExists(ACTIONS)).toBe(true)
    const source = readRepoCode(SCREEN)
    expect(source).toContain("from '@/components/ui/PhotoViewer'")
    expect(source).toContain('<PhotoViewer')
    expect(source).not.toContain('function PhotoViewer')
  })

  it('derives the overlay from the message rather than snapshotting its photos', () => {
    // A snapshot would keep showing a photo whose row a delete or a refresh has removed, and
    // PhotoViewer's `photos[index]!` would then call nameOf(undefined).
    const source = readRepoCode(SCREEN)
    expect(source).toContain('chatViewerPhotos(viewerMessage)')
    expect(source).toContain('viewerIndex(viewer.index, viewerPhotos.length)')
  })
})

describe('the download is a decision, not an <a download>', () => {
  const source = readRepoCode(ACTIONS)

  it('asks chooseSaveStrategy rather than assuming a platform', () => {
    expect(source).toContain('chooseSaveStrategy(')
  })

  it('never puts the cross-origin blob URL on a download attribute', () => {
    // The whole trap: `download` is honoured only same-origin, so on a blob URL the browser
    // navigates and nothing is saved. The attribute may only ever carry an object URL.
    expect(source).toContain('anchor.href = objectUrl')
    expect(source).not.toMatch(/anchor\.href\s*=\s*url/)
    expect(source).not.toMatch(/download=\{/)
  })

  it('warms the fetch on pointerdown, so share() survives Safari activation', () => {
    expect(source).toContain('onPointerDown={warm}')
  })

  it('treats a dismissed share sheet as silence', () => {
    expect(source).toContain("error.name === 'AbortError'")
  })
})

describe('attaching reuses the machinery instead of re-uploading', () => {
  const source = readRepoCode(SCREEN)

  it('arms the existing photo state with a pointer, not a URL', () => {
    expect(source).toMatch(/setPhoto\(\{\s*kind: 'image',/)
  })

  it('adds no second writer of the query string', () => {
    // ChatScreen's one useLayoutEffect deletes ?attach= and ?photo= together, because two
    // independent replaceState calls in one commit would race. R10 must not add a third caller.
    expect(source.match(/replaceState/g)?.length).toBe(1)
    expect(source).not.toContain('router.push')
    expect(source).not.toContain('photo=image:')
  })
})

describe('the four pre-existing PhotoViewer callers are byte-identical', () => {
  it('none of them passes the new actions slot', () => {
    for (const file of [STRIP, INCLUSION, ABOUT]) {
      expect(readRepoCode(file)).not.toContain('actions=')
    }
  })

  it('leaves the dot pager row exactly as it shipped', () => {
    // The mechanical form of the promise. R10's controls are an absolutely-positioned sibling, so
    // the pager's own classes — and therefore every existing caller's geometry — do not move.
    expect(readRepoCode(VIEWER)).toContain(
      'flex justify-center gap-2 px-4 pt-3 pb-[calc(1rem+var(--safe-bottom))]',
    )
  })

  it('still renders nothing at all when actions is absent', () => {
    expect(readRepoCode(VIEWER)).toContain('{actions != null && (')
  })

  it('still keeps the public shared page out of the client overlay', () => {
    expect(readRepoCode(PUBLIC_PAGE)).not.toContain('PhotoViewer')
  })
})

describe("glm-4.6v's private image text still does not reach a component (invariant 5)", () => {
  it('is not read by anything on the chat photo path', () => {
    for (const file of [IMAGES, LIST, ACTIONS, VIEWER]) {
      expect(readRepoCode(file)).not.toContain('description')
    }
  })

  it('leaves the photo with no alt text, in the grid and in the overlay', () => {
    expect(readRepoCode(IMAGES)).toContain('alt=""')
    expect(readRepoCode(VIEWER)).toContain('alt=""')
  })
})
