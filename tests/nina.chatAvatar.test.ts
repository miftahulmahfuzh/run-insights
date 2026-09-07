import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * **R1 — the chat's 28 px circle renders her CURRENT face, not the committed PNG.**
 *
 * The reported bug was `<NinaAvatar size="sm" />` in `TypingIndicator`, with no `src` and no
 * `crop`: `NinaAvatar`'s defaults then selected `/nina/avatar-001.png` and its `isFallback`
 * branch, so `ninaCropStyle` was never called for that circle and neither the current album photo
 * nor its saved framing could reach it. Nothing threw; the circle was simply always the same face.
 *
 * ── WHY THIS IS A SOURCE-TEXT TEST ───────────────────────────────────────────────────────────
 * `vitest.config.ts` is `environment: 'node'` — there is no DOM to render into and no rendered
 * `style` attribute to assert. What broke was a PROP CHAIN, and a prop chain is a fact about the
 * source. Three files in this suite already take that route for the same reason
 * (`nina.softDelete`, `motion.reducedMotion`, `admin.shell`), and a chain of four hops is exactly
 * the thing a reviewer's eye skips.
 *
 * `tsc` catches three of the four hops on its own, because the prop is REQUIRED at `ChatScreen`
 * and at `MessageList`. It does NOT catch the fourth: `TypingIndicator`'s prop is optional by
 * design (it is `aria-hidden` decoration and should degrade to the committed face, never crash),
 * so deleting `avatar={avatar}` from the `<TypingIndicator>` call compiles cleanly and silently
 * restores the bug. That one hop is the reason this file exists; the rest are asserted because a
 * test that checks the weak link and not the chain reads as if the chain were not the point.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

/**
 * The source with its block comments removed.
 *
 * The two `not.toMatch` assertions below are about JSX, and both components' docstrings quote the
 * defect they forbid — deliberately, because "it used to be `<NinaAvatar size=\"sm\" />`" is the
 * single most useful sentence either file carries. Asserting against the raw text would make the
 * prose that documents the bug indistinguishable from the bug, and the fix for that must not be
 * to delete the prose.
 */
const jsxOf = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '')

describe('the chat avatar follows the current profile settings (R1)', () => {
  it('TypingIndicator hands NinaAvatar a src, a natural size and a crop', () => {
    const source = read('components/nina/TypingIndicator.tsx')

    // The defect, spelled exactly: a bare `size="sm"` with no other attribute.
    expect(jsxOf(source)).not.toMatch(/<NinaAvatar\s+size="sm"\s*\/>/)

    expect(source).toMatch(/src=\{avatar\?\.src\}/)
    expect(source).toMatch(/natural=\{avatar\?\.natural \?\? null\}/)
    expect(source).toMatch(/crop=\{avatar\?\.crop \?\? null\}/)
  })

  it('MessageList passes the avatar to TypingIndicator', () => {
    const source = read('components/nina/MessageList.tsx')

    // The one hop `tsc` cannot see, because TypingIndicator's prop is optional on purpose.
    expect(source).toMatch(/<TypingIndicator avatar=\{avatar\} \/>/)
    expect(jsxOf(source)).not.toMatch(/<TypingIndicator\s*\/>/)

    // Required, so a future second caller is a compile error rather than a silent fallback.
    expect(source).toMatch(/\n {2}avatar: ChatAvatar\n/)
  })

  it('ChatScreen passes the avatar to MessageList', () => {
    const source = read('components/nina/ChatScreen.tsx')

    expect(source).toMatch(/avatar=\{avatar\}/)
    expect(source).toMatch(/\n {2}avatar: ChatAvatar\n/)
  })

  it('the page passes the same ninaAvatarView result to both circles', () => {
    const source = read('app/nina/page.tsx')

    // ONE resolution, feeding both surfaces — this is what makes the two circles agree.
    expect(source.match(/ninaAvatarView\(/g)).toHaveLength(1)
    expect(source).toMatch(
      /avatar=\{\{ src: avatar\.src, natural: avatar\.natural, crop: avatar\.crop \}\}/,
    )
    expect(source).toMatch(
      /avatar=\{\{ src: avatar\.src, natural: avatar\.natural, crop: avatar\.crop \}\}[\s\S]*?<NinaSidebar/,
    )
  })

  it('description never crosses into a client component (invariant 5)', () => {
    const page = read('app/nina/page.tsx')
    const types = read('components/nina/types.ts')

    // The triple is destructured field by field; a spread would carry the private prose.
    expect(page).not.toMatch(/avatar=\{\{ \.\.\.avatar/)
    expect(page).not.toMatch(/avatar=\{avatar\}/)

    // And the type has no room for it even if a call site tried.
    const shape = types.slice(types.indexOf('export interface ChatAvatar'))
    expect(shape).not.toMatch(/description/)
  })
})
