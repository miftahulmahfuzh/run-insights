import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'

import * as filetree from '@/lib/admin/filetree'
import type {
  ExplorerView,
  FolderCount,
  FolderNode,
  LocalFileLike,
  ManifestEntryLike,
  PlannedUpload,
  UploadRefusal,
} from '@/lib/admin/filetree'

/**
 * The compatibility contract of the `lib/admin/filetree` split, asserted rather than assumed.
 *
 * `filetree.ts` was one 1,151-line pure module; it is now a barrel over the cohesive modules in
 * `lib/admin/filetree/`, and every importer — the `'use client'` explorer, the `'use server'`
 * action modules, the Route Handler, the unit suites — still enters through
 * `@/lib/admin/filetree`. Two things make that safe, and both are pinned here so a future edit
 * that quietly breaks one is a red test and not a production surprise:
 *
 * ── THE SURFACE PIN ─────────────────────────────────────────────────────────────────────────
 * The barrel must re-export EXACTLY the public surface the single file had — no fewer (an
 * importer breaks) and no more (the 2026-09-11 dead-exports session un-exported 12 zero-caller
 * types from this module; a barrel that lazily re-exports module-internal helpers like
 * `sanitiseSegment` or `compareFolded` would undo that audit through the back door). The runtime
 * half is a sorted key list — 13 constants + 22 functions — written out in full so a diff to the
 * surface is a diff to this test. The type half (7 names) cannot appear in `Object.keys`, so it
 * is asserted with `expectTypeOf`, which compiles away at runtime and fails `tsc` if a re-export
 * goes missing. Characterization tests pass the day they are written, which proves nothing on
 * its own — so the pin was mutation-proven during the split: dropping one export from the barrel
 * turns this file red before it turns any importer red.
 *
 * ── THE PURITY RULE ─────────────────────────────────────────────────────────────────────────
 * The old header's invariant — *no imports at all*, so that one file can be read by a client
 * component and a server action without either half of the bundle dragging the other in — now
 * belongs to seven files instead of one. Restated as a rule a test can measure: every file in
 * `lib/admin/filetree/` imports ONLY `./`-siblings from inside the directory, and the barrel
 * imports ONLY from `./filetree/`. No bare specifiers (a package), no `../` (a reach outside —
 * which is also how a module would import the barrel and close a cycle). The regex is anchored
 * to line start so prose inside the doc comments cannot impersonate an import statement, the
 * same trap the openrouter guard's history records. Adding an eighth module inherits the rule
 * automatically, which is the point: the invariant is checked against the directory as it is,
 * not against a hand-maintained file list.
 *
 * Why a vitest test and not a lint rule: `npm test` is the gate this repo already runs
 * everywhere, `environment: 'node'` gives the fs access the check needs, and the rule is about
 * this one directory rather than a codebase-wide convention.
 */

/** The directory holding the split modules. The barrel sits beside it as `filetree.ts`. */
const MODULE_DIR = fileURLToPath(new URL('../lib/admin/filetree', import.meta.url))
const BARREL_PATH = fileURLToPath(new URL('../lib/admin/filetree.ts', import.meta.url))

/**
 * Every static `import … from '…'`, `export … from '…'` and bare `import '…'` specifier in a
 * source file. The `export` arm REQUIRES a `from` clause: without it, `export const
 * NINA_FOLDER_ROOT_LABEL = 'Album'` reads as a re-export of `'Album'` — the first version of
 * this regex reported exactly that. `[^'"]` crosses newlines (the barrel's re-export blocks span
 * several lines) but cannot cross into another string; the `^`/`m` anchor means a doc-comment
 * line — which prettier keeps indented under its ` * ` — can never start a match.
 */
const SPECIFIER_RE = /^(?:import\b[^'"]*?(?:\bfrom\s*)?|export\b[^'"]*?\bfrom\s*)'([^']+)'/gm

function importSpecifiers(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(SPECIFIER_RE)].map((m) => m[1] ?? '')
}

/** The 35 runtime exports the single `filetree.ts` had: 13 constants, 22 functions. */
const EXPECTED_RUNTIME_EXPORTS = [
  'NINA_FILENAME_MAX_CHARS',
  'NINA_FOLDER_FORBIDDEN_RE',
  'NINA_FOLDER_MAX_DEPTH',
  'NINA_FOLDER_MAX_PATH_CHARS',
  'NINA_FOLDER_MAX_SEGMENT_CHARS',
  'NINA_FOLDER_ROOT',
  'NINA_FOLDER_ROOT_LABEL',
  'NINA_FOLDER_SEPARATOR',
  'NINA_MEDIA_NODE_LABEL',
  'NINA_MEDIA_VIEW_PARAM',
  'NINA_MEDIA_VIEW_VALUE',
  'NINA_SOURCE_KEY_MAX_CHARS',
  'NINA_SOURCE_KEY_VERSION',
  'buildTree',
  'classifyFile',
  'fileExtension',
  'findFolderNode',
  'folderAncestors',
  'folderBreadcrumbs',
  'folderCounts',
  'folderDepth',
  'folderName',
  'folderParent',
  'foldFolderPath',
  'isFolderAncestorOf',
  'isInFolderTree',
  'joinFolderPath',
  'mediaViewNode',
  'normaliseFolderPath',
  'planFolderUpload',
  'readExplorerView',
  'sanitiseFolderSegment',
  'sourceKeyFor',
  'splitFolderPath',
  'validateFolderPath',
]

describe('the filetree barrel', () => {
  it('re-exports exactly the historical runtime surface', () => {
    expect(Object.keys(filetree).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort())
  })

  it('still exports the seven type names', () => {
    expectTypeOf<ExplorerView>().toEqualTypeOf<'album' | 'media'>()
    expectTypeOf<FolderCount>().toEqualTypeOf<{ folder: string | null; count: number }>()
    expectTypeOf<FolderNode['path']>().toEqualTypeOf<string>()
    expectTypeOf<FolderNode['children']>().toEqualTypeOf<FolderNode[]>()
    expectTypeOf<LocalFileLike['relativePath']>().toEqualTypeOf<string>()
    expectTypeOf<ManifestEntryLike['sourceKey']>().toEqualTypeOf<string | null>()
    expectTypeOf<PlannedUpload<LocalFileLike>['sourceKey']>().toEqualTypeOf<string>()
    expectTypeOf<UploadRefusal>().toEqualTypeOf<
      | 'too_deep'
      | 'path_too_long'
      | 'segment_too_long'
      | 'bad_segment'
      | 'traversal'
      | 'too_large'
      | 'empty_file'
      | 'unnamed'
      | 'name_too_long'
    >()
  })

  it('keeps the split modules import-pure — `./` siblings only', () => {
    expect(existsSync(MODULE_DIR), 'lib/admin/filetree/ has not been created yet').toBe(true)
    const modules = readdirSync(MODULE_DIR).filter((f) => f.endsWith('.ts'))
    expect(modules.length, 'the module directory is empty').toBeGreaterThan(0)

    for (const file of modules) {
      const specs = importSpecifiers(`${MODULE_DIR}/${file}`)
      for (const spec of specs) {
        expect(
          /^\.\/[A-Za-z0-9]/.test(spec),
          `${file} imports '${spec}' — module files may import only ./siblings`,
        ).toBe(true)
      }
    }
  })

  it('keeps the barrel a pure re-export shell over ./filetree/', () => {
    const specs = importSpecifiers(BARREL_PATH)
    expect(specs.length, 'the barrel re-exports nothing').toBeGreaterThan(0)
    for (const spec of specs) {
      expect(
        /^\.\/filetree\//.test(spec),
        `the barrel imports '${spec}' — it may re-export only from ./filetree/`,
      ).toBe(true)
    }
  })
})
