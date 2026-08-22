import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * The regression guard for "I asked my OS to reduce motion and the app pulsed at me for 35 seconds"
 * (F20 / card #17).
 *
 * A reduced-motion contract is invisible to every tool in this repo. It is not a type, so
 * `tsc` cannot see it; it is not a lint rule, so `eslint` cannot; and no unit test that renders a
 * component can see it either, because the thing that decides the outcome is a media query
 * evaluated by the browser against an OS setting. `tests/pwa.install.test.ts` is the precedent and
 * says the same of an install contract — *asserted here or not asserted at all* — and takes the
 * same approach: read the source as text and assert properties of it.
 *
 * WHY NOT A `scripts/check-*.mjs`. The seven bespoke CI guards exist for *boundary* properties that
 * span directories — which module can reach which, where a secret may appear. This is one
 * stylesheet and the files that name its keyframes, so it belongs in `npm test`, which the gate
 * already runs.
 *
 * ── THE FOUR PROPERTIES ───────────────────────────────────────────────────────────────────────
 *   1. every keyframe an `[animation:…]` utility runs is redefined under the reduced-motion query;
 *   2. each such redefinition is genuinely STILL — see `isStill` for why "all stops equal" alone
 *      is not enough, and why `ri-spin`'s shape is the counter-example that proves it;
 *   3. the reduced-motion block exists at all;
 *   4. no keyframe is defined and never used.
 *
 * Property 4 is the one that needed arguing (F20 §4). Dead CSS is harmless, and a guard that fails
 * over harmless things is a guard people switch off. It is here because an unused keyframe was not
 * hypothetical: `ri-spin` sat unreferenced long enough to be reported as a live defect in two
 * documents, and it made card #17's own premise wrong.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SOURCE_DIRS = ['app', 'components']
const REDUCED_MOTION_QUERY = '@media (prefers-reduced-motion: reduce)'

/**
 * Comments are stripped before anything else, and that is load-bearing rather than tidy: this
 * repo's stylesheets carry long explanatory headers, and the block F20 adds is documented with a
 * comment that names `@keyframes` and shows declarations. Parsing braces without stripping first
 * would read the prose as CSS.
 */
function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The body of the `{…}` whose opening brace is at or after `from`, by brace depth. */
function blockAfter(css: string, from: number) {
  const open = css.indexOf('{', from)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return { body: css.slice(open + 1, i), end: i }
    }
  }
  return null
}

type Keyframes = { name: string; body: string }

/** Every `@keyframes <name> { … }` in `css`, with its body. */
function keyframesIn(css: string): Keyframes[] {
  const found: Keyframes[] = []
  const re = /@keyframes\s+([A-Za-z_][\w-]*)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(css)) !== null) {
    const block = blockAfter(css, match.index)
    if (!block) continue
    found.push({ name: match[1], body: block.body })
    re.lastIndex = block.end
  }
  return found
}

/** `{ '0%, 50%': 'opacity:1' }` — each stop rule's selector and its normalised declarations. */
function stops(body: string) {
  const parsed: Array<{ selector: string; declarations: string }> = []
  let cursor = 0
  for (;;) {
    const block = blockAfter(body, cursor)
    if (!block) break
    const selector = body.slice(cursor, body.indexOf('{', cursor)).trim()
    const declarations = block.body
      .split(';')
      .map((d) => d.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .sort()
      .join(';')
    parsed.push({ selector, declarations })
    cursor = block.end + 1
  }
  return parsed
}

/**
 * Does this keyframe hold completely still?
 *
 * Two conditions, and the second is the one that is easy to miss. Every stop must declare the same
 * thing — otherwise `0%,100% {opacity:1} 50% {opacity:.5}` satisfies "has a reduced-motion block"
 * while pulsing exactly as before. AND the stops must span the whole range, because a keyframe that
 * names only one end still animates: `@keyframes ri-spin { to { transform: rotate(360deg) } }` — the
 * shape F20 deleted — interpolates from whatever the element's own transform is, and every stop in
 * it is trivially identical. Requiring both ends makes the assertion about the animation's effect
 * rather than about its syntax.
 */
function isStill(body: string) {
  const parsed = stops(body)
  if (parsed.length === 0) return false

  const distinct = new Set(parsed.map((s) => s.declarations))
  if (distinct.size !== 1) return false

  const offsets = parsed.flatMap((s) => s.selector.split(',').map((o) => o.trim().toLowerCase()))
  const spansOrigin = offsets.some((o) => o === '0%' || o === 'from')
  const spansTerminus = offsets.some((o) => o === '100%' || o === 'to')
  return spansOrigin && spansTerminus
}

function filesUnder(dir: string, extensions: string[]): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(ROOT, dir))) {
    const relative = join(dir, entry)
    if (statSync(join(ROOT, relative)).isDirectory()) out.push(...filesUnder(relative, extensions))
    else if (extensions.includes(extname(entry))) out.push(relative)
  }
  return out
}

const styleSheets = SOURCE_DIRS.flatMap((dir) => filesUnder(dir, ['.css']))
const sourceFiles = SOURCE_DIRS.flatMap((dir) => filesUnder(dir, ['.ts', '.tsx']))

/** Keyframes declared anywhere OUTSIDE a reduced-motion block: the app's real animations. */
const declared = new Map<string, string>()
/** The same names as redefined INSIDE one: the escapes. */
const escapes = new Map<string, string>()
let sawReducedMotionBlock = false

for (const sheet of styleSheets) {
  const css = stripComments(readFileSync(join(ROOT, sheet), 'utf8'))

  let rest = css
  for (;;) {
    const at = rest.indexOf(REDUCED_MOTION_QUERY)
    if (at === -1) break
    const block = blockAfter(rest, at)
    if (!block) break
    sawReducedMotionBlock = true
    for (const frames of keyframesIn(block.body)) escapes.set(frames.name, frames.body)
    rest = rest.slice(0, at) + rest.slice(block.end + 1)
  }

  for (const frames of keyframesIn(rest)) declared.set(frames.name, frames.body)
}

/**
 * Which declared keyframes each source file actually runs.
 *
 * The name is matched as a TOKEN of the `animation` shorthand rather than as its first word,
 * because the shorthand's order is free: `[animation:ri-pulse_2.4s_linear_infinite]` and
 * `[animation:2.4s_linear_infinite_ri-pulse]` are the same rule and both must count. Tailwind's
 * arbitrary-value syntax spells the spaces as underscores, so the tokens split on both.
 */
function animationsIn(source: string) {
  const used = new Set<string>()
  for (const match of source.matchAll(/\[animation:([^\]]+)\]/g)) {
    for (const token of match[1].split(/[_\s,]+/)) {
      if (declared.has(token)) used.add(token)
    }
  }
  return used
}

const usedBy = new Map<string, string[]>()
for (const file of sourceFiles) {
  for (const name of animationsIn(readFileSync(join(ROOT, file), 'utf8'))) {
    usedBy.set(name, [...(usedBy.get(name) ?? []), file])
  }
}

describe('prefers-reduced-motion', () => {
  it('finds the keyframes and the call sites it is asserting about', () => {
    // A guard that silently measures nothing is worse than no guard. If a refactor moves the
    // keyframes or changes how call sites spell an animation, this fails first and says so.
    expect(declared.size, 'no @keyframes found in app/ or components/').toBeGreaterThan(0)
    expect(usedBy.size, 'no [animation:…] call site found in app/ or components/').toBeGreaterThan(
      0,
    )
  })

  it('has a reduced-motion block at all', () => {
    expect(sawReducedMotionBlock, `no ${REDUCED_MOTION_QUERY} in any stylesheet`).toBe(true)
  })

  it('gives every animated keyframe a reduced-motion escape', () => {
    for (const [name, files] of usedBy) {
      expect(
        escapes.has(name),
        `@keyframes ${name} runs in ${files.join(', ')} with no ${REDUCED_MOTION_QUERY} ` +
          `redefinition. Add one that holds still.`,
      ).toBe(true)
    }
  })

  it('holds each escape completely still', () => {
    for (const name of usedBy.keys()) {
      const body = escapes.get(name)
      if (body === undefined) continue // reported by the previous case
      expect(
        isStill(body),
        `the reduced-motion @keyframes ${name} still animates: every stop must declare the ` +
          `same values, and the stops must cover both 0%/from and 100%/to.`,
      ).toBe(true)
    }
  })

  it('defines no keyframe that nothing uses', () => {
    for (const name of declared.keys()) {
      expect(
        usedBy.has(name),
        `@keyframes ${name} has no [animation:…] call site. Delete it, or use it.`,
      ).toBe(true)
    }
  })
})
