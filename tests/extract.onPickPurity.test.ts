import { describe, expect, it } from 'vitest'

import { importGraph, isClientModule, readRepoCode } from './support/importGraph'

/**
 * **No side effect may live inside a `setTiles` updater.** Card #6 / F17.
 *
 * `onPick` launched the compress-and-upload chain from *inside* a `setTiles` state updater, along
 * with `URL.createObjectURL`, a `previewsRef` push, a `filesRef` write and three `setFormError`
 * calls. `next.config.ts` sets `reactStrictMode: true`, and Strict Mode double-invokes state
 * updaters deliberately, to surface impure ones. Measured on the card: one file picked, one tile
 * rendered, **two** `POST /api/upload` token mints and **two distinct blobs** written — one of them
 * referenced by no tile and orphaned in the store for good, on every single pick during
 * development.
 *
 * F16 had already rebuilt `changeKind` around this exact hazard and said so in its source; its §9
 * listed `onPick` as knowingly left behind. This is that item, and this test is what stops it
 * coming back a third time.
 *
 * ── WHY THIS TEST IS A TEXT SCAN ────────────────────────────────────────────────────────────
 * This repo has no component tests by design — `vitest.config.ts` runs `environment: 'node'` and
 * its `include` matches `*.test.ts` only. The behavioural half of F17 is proved properly, as pure
 * logic, in `tests/extract.planPicked.test.ts`.
 *
 * What is left over is a property of the *source*: "can an effect run inside a state updater?"
 * That is answered by reading the module, and answering it that way is strictly stronger than a DOM
 * test would be — the assertion below holds for **every** `setTiles` call in the file, including
 * ones a future feature adds, rather than for the one interaction a rendered scenario happens to
 * simulate. Same case `tests/ui.sheetFocus.test.ts` and `tests/extract.kindSelector.test.ts` make.
 *
 * `readRepoCode` strips comments first, so the paragraphs above — and the ones in the picker, which
 * discuss `createObjectURL` and StrictMode at length — do not trip the assertions.
 */

const PICKER = 'components/extract/UploadPicker.tsx'
const PLANNER = 'lib/extract/planPicked.ts'

/**
 * String and template-literal *contents* blanked, quotes kept.
 *
 * The paren matcher below would miscount on a `)` inside a string. Nothing in this file needs to
 * read a literal's contents — every token it hunts for is an identifier — so emptying them is free
 * and removes the whole class of mismatch.
 */
function blankLiterals(code: string): string {
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!
    if (quote) {
      if (c === '\\') {
        out += '  '
        i++
        continue
      }
      if (c === quote) {
        quote = null
        out += c
        continue
      }
      out += c === '\n' ? '\n' : ' '
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
      continue
    }
    out += c
  }
  return out
}

/** The argument text of every `setTiles(...)` call, by paren matching. */
function setTilesArguments(code: string): string[] {
  const args: string[] = []
  const call = /\bsetTiles\s*\(/g
  let match: RegExpExecArray | null
  while ((match = call.exec(code)) !== null) {
    let depth = 1
    let i = match.index + match[0].length
    const from = i
    for (; i < code.length && depth > 0; i++) {
      if (code[i] === '(') depth++
      else if (code[i] === ')') depth--
    }
    expect(depth, `unbalanced setTiles( at index ${match.index}`).toBe(0)
    args.push(code.slice(from, i - 1))
  }
  return args
}

/** `(current) => …` or `current => …` at the very start — i.e. an updater, not a value. */
const UPDATER_RE = /^\s*(?:\(\s*[A-Za-z_$][\w$]*\s*\)|[A-Za-z_$][\w$]*)\s*=>/

/**
 * Every effect the picker performs on a pick. Each one ran twice per pick under Strict Mode, and
 * each one is named rather than lumped together so a failure says *which* effect crept back in.
 */
const FORBIDDEN: ReadonlyArray<[label: string, needle: string]> = [
  ['launching an upload', 'process('],
  ['minting an object URL', 'createObjectURL'],
  ['pushing to a ref array', '.push('],
  ['writing to a ref map', '.set('],
  ['setting the form error', 'setFormError'],
]

describe('no side effect lives inside a setTiles updater', () => {
  const code = blankLiterals(readRepoCode(PICKER))
  const args = setTilesArguments(code)

  it('finds the setTiles calls at all — the scan is worthless if the regex misses', () => {
    expect(args.length).toBeGreaterThanOrEqual(3) // patchIfCurrent, onPick, changeKind, remove
  })

  /**
   * Stated over every call rather than over `onPick` alone, which is the whole point: it passes for
   * `patchIfCurrent` (a `map`) and `remove` (a `filter`), and it fails for any future updater that
   * reintroduces an effect, wherever in the component it is written.
   */
  it.each(FORBIDDEN)('no updater is %s (`%s`)', (_label, needle) => {
    const offenders = args.filter((arg) => UPDATER_RE.test(arg) && arg.includes(needle))
    expect(offenders).toEqual([])
  })

  /**
   * The positive half. Without this the assertions above could be satisfied by a picker that no
   * longer uploads anything at all.
   */
  it('still uploads what it picks, from outside the updater', () => {
    expect(code).toMatch(/\bvoid process\(tile, file\)/)
    const inUpdater = args.some((arg) => UPDATER_RE.test(arg) && arg.includes('process('))
    expect(inUpdater).toBe(false)
  })
})

describe('the decision itself stays in lib/', () => {
  const code = readRepoCode(PICKER)

  it('asks planPicked what a pick adds', () => {
    expect(code).toMatch(/\bplanPicked\(/)
  })

  /**
   * The two names the inline loop was built out of. If either reappears in the component, the
   * room-and-kind logic has crept back into a `.tsx` where `environment: 'node'` cannot reach it —
   * which is how it came to be untested, and therefore impure, in the first place.
   */
  it.each(['DEFAULT_KIND_BY_INDEX', 'rejectionReason'])('does not decide %s for itself', (name) => {
    expect(code).not.toContain(name)
  })

  /**
   * And the planner must stay reachable from a node test. `rejectionReason` was moved out of
   * `lib/photos/compressForExtraction.ts` for exactly this reason — that module opens with
   * `'use client'` and imports `browser-image-compression` — so a re-import would undo the move
   * silently and break this suite for a reason nobody would connect to F17.
   */
  it('reaches no client module', () => {
    const client = [...importGraph(PLANNER)].filter(isClientModule)
    expect(client).toEqual([])
  })
})

describe('an upload starts at most once per generation', () => {
  const code = readRepoCode(PICKER)

  it('claims a key before doing any work', () => {
    expect(code).toMatch(/started\.current\.has\(key\)/)
    expect(code).toMatch(/started\.current\.add\(key\)/)
  })

  /**
   * Keyed by generation, not by id: `changeKind` bumps `gen` and legitimately re-uploads the same
   * tile, so an id-only guard would break the F16 swap outright.
   */
  it('keys on the tile generation', () => {
    expect(code).toMatch(/const key = `\$\{tile\.id\}:\$\{tile\.gen\}`/)
  })

  /**
   * The release on failure. A guard that only ever adds silently no-ops a legitimate retry — there
   * is no retry affordance today, but the obvious next feature here would arrive at the same `gen`
   * and do nothing, with the guard hiding it. A failed attempt wrote no blob, so re-running it is
   * free.
   */
  it('releases the key when the upload failed', () => {
    expect(code).toMatch(/started\.current\.delete\(key\)/)
  })
})
