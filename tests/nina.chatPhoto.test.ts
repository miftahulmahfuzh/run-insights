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
/* The 2026-09-12 ChatScreen split moved the viewer derivation into its own hook. */
const VIEWER_HOOK = 'components/nina/usePhotoViewer.ts'
/* ...and moved one of the two sanctioned replaceState writers into this one. */
const QUOTE_LANDING = 'components/nina/useQuoteLanding.ts'
const ACTIONS = 'components/nina/ChatPhotoActions.tsx'
const SAVE = 'components/ui/useSavePhoto.ts'
const ABOUT = 'components/nina/NinaAboutScreen.tsx'
const STRIP = 'components/review/ScreenshotStrip.tsx'
const INCLUSION = 'components/share/PhotoInclusionList.tsx'
const PUBLIC_PAGE = 'app/(public)/s/[token]/page.tsx'
/* R2's follow, 2026-10-01: the effect that scrolls the conversation behind the open overlay. */
const FOLLOW = 'components/nina/useChatPhotoFollow.ts'

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

  it('derives the overlay from the whole session rather than snapshotting one bubble', () => {
    // R1. The list is every photograph the open conversation renders, in order — and it is still
    // DERIVED, so a delete or a refresh clamps or closes rather than leaving PhotoViewer's
    // `photos[index]!` calling nameOf(undefined).
    const source = readRepoCode(VIEWER_HOOK)
    expect(source).toContain('chatSessionPhotos(messages)')
    expect(source).toContain('sessionPhotoIndex(sessionPhotos, viewer.messageId, viewer.index)')
    // Invariant 3: the identity is STILL a message id and a position inside it. A stored flat
    // position would re-aim at a different photograph whenever a bubble above it went away.
    expect(source).toContain('useState<{ messageId: string; index: number } | null>(null)')
  })

  it('maps the overlay\u2019s flat position back to the photo that owns it', () => {
    // `onIndex={(next) => setViewerIndex(viewer.messageId, next)}` WAS the bubble-scoping: it
    // re-aimed every page turn at the opened message, so stepIndex could only wrap inside it.
    const hook = readRepoCode(VIEWER_HOOK)
    expect(hook).toContain('photo.indexWithinMessage')
    // The bubble-local derivation is gone: no per-message lookup, no one-bubble photo list. Spelled
    // as the two constructs that WERE it, because `viewerMessage` is now a prefix of the
    // `viewerMessageId` R2's follow is wired from.
    expect(hook).not.toContain('messages.find(')
    expect(hook).not.toContain('chatViewerPhotos')
    const screenSource = readRepoCode(SCREEN)
    expect(screenSource).toContain('onIndex={setViewerIndex}')
    expect(screenSource).not.toContain('setViewerIndex(viewer.messageId')
  })

  it('acts on the photograph on screen, not on the bubble the overlay was opened in', () => {
    // The attach handle travels with the photo (`ChatSessionPhoto.attachId`), so crossing into
    // another bubble cannot arm the composer with a neighbour's image row.
    expect(readRepoCode(VIEWER_HOOK)).toContain('shownPhoto?.attachId')
    const screenSource = readRepoCode(SCREEN)
    expect(screenSource).toContain('url={shownPhoto.url}')
    expect(screenSource).not.toContain('viewerPhotos[shownIndex]')
  })
})

describe('the download is a decision, not an <a download>', () => {
  // The machinery's home since it was lifted out of ChatPhotoActions for the attach strip and the
  // two admin rails — one ladder, four buttons. Re-growing a copy in any surface is the drift.
  const source = readRepoCode(SAVE)

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

  it('treats a dismissed share sheet as silence', () => {
    expect(source).toContain("error.name === 'AbortError'")
  })

  it('is what ChatPhotoActions uses, and not a second copy of the ladder', () => {
    const actions = readRepoCode(ACTIONS)
    expect(actions).toContain('useSavePhoto(')
    expect(actions).not.toContain('chooseSaveStrategy(')
    // The warm survives as the button's own props, on the surface that renders it.
    expect(actions).toContain('onPointerDown={warm}')
  })
})

describe('attaching reuses the machinery instead of re-uploading', () => {
  const source = readRepoCode(SCREEN)

  it('arms the existing photo state with a pointer, not a URL', () => {
    expect(source).toMatch(/setPhoto\(\{\s*kind: 'image',/)
  })

  it('adds no unsanctioned writer of the query string', () => {
    // ChatScreen's mount-time useLayoutEffect (deps `[]`) deletes ?attach=, ?photo= and ?jump=
    // together, because two independent replaceState calls in one commit would race. R10 must not
    // add a third caller. The ONE sanctioned second writer is the soft-nav watcher's strip: it
    // deletes ?jump= by name in the commit where the navigation arrived — a commit the mount-time
    // effect (deps `[]`) does not run in — so there is still exactly one writer per commit. The
    // 2026-09-12 split moved the strip's effect into useQuoteLanding.ts, so the two sanctioned
    // writers now live one per file rather than both in ChatScreen.
    expect(source.match(/replaceState/g)?.length).toBe(1)
    expect(readRepoCode(QUOTE_LANDING).match(/replaceState/g)?.length).toBe(1)
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

  it('leaves the dot pager row exactly as it shipped, and bounds how long it gets', () => {
    // The mechanical form of the promise. R10's controls are an absolutely-positioned sibling, so
    // the pager's own classes — and therefore every existing caller's geometry — do not move.
    const source = readRepoCode(VIEWER)
    expect(source).toContain(
      'flex justify-center gap-2 px-4 pt-3 pb-[calc(1rem+var(--safe-bottom))]',
    )
    // R1 made the chat's list session-long and the album's was already 200. Above the bound the
    // row is not drawn at all and the header counter carries the position; at or below it — which
    // is every pre-existing caller — the markup above is what they have always drawn.
    expect(source).toContain('photos.length <= PHOTO_VIEWER_MAX_DOTS')
  })

  it('still renders nothing at all when actions is absent', () => {
    expect(readRepoCode(VIEWER)).toContain('{actions != null && (')
  })

  it('still keeps the public shared page out of the client overlay', () => {
    expect(readRepoCode(PUBLIC_PAGE)).not.toContain('PhotoViewer')
  })
})

describe('the history follows the photograph on screen (R2)', () => {
  it('routes through the ONE scroll decision function instead of inventing a second', () => {
    // `measureQuoteScroll` → `planQuoteScroll` is the only rule about the band the composer leaves
    // over, and R12's quote tap and both `?jump=` landings already route through it. The follow
    // takes that measurement as an argument and owns no geometry at all.
    expect(repoFileExists(FOLLOW)).toBe(true)
    const follow = readRepoCode(FOLLOW)
    expect(follow).toContain('planScroll(messageId)')
    expect(follow).not.toContain('getBoundingClientRect')
    expect(follow).not.toContain('planQuoteScroll')
    expect(readRepoCode(QUOTE_LANDING)).toContain('clearFlashId, measureQuoteScroll }')
    expect(readRepoCode(SCREEN)).toContain('planScroll: measureQuoteScroll')
  })

  it('moves the document and adds no writer of the query string (invariant 7)', () => {
    const follow = readRepoCode(FOLLOW)
    expect(follow).toContain("behavior: 'instant'")
    expect(follow).not.toContain('replaceState')
    expect(follow).not.toContain('router.push')
  })

  it('does not fire the landing flash on every page turn', () => {
    // `flashMessage`'s blink train is useQuoteLanding's vocabulary for an ARRIVAL from elsewhere.
    // Restarting its timer on each swipe would burn it out long before the overlay closed, and
    // the user asked to SEE the bubble, not to have it highlighted.
    expect(readRepoCode(FOLLOW)).not.toContain('flash')
  })
})

describe("glm-4.6v's private image text still does not reach a component (invariant 5)", () => {
  it('is not read by anything on the chat photo path', () => {
    for (const file of [IMAGES, LIST, ACTIONS, VIEWER, SAVE]) {
      expect(readRepoCode(file)).not.toContain('description')
    }
  })

  it('leaves the photo with no alt text, in the grid and in the overlay', () => {
    expect(readRepoCode(IMAGES)).toContain('alt=""')
    expect(readRepoCode(VIEWER)).toContain('alt=""')
  })
})
