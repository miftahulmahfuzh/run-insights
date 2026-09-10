import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_SHORTCUT_PAGE,
  NINA_SHORTCUT_EXPANSION_MAX,
  NINA_SHORTCUT_LABEL_MAX,
  NINA_TRIGGER_MAX,
  SHORTCUT_FIELDS,
  buildShortcutRows,
  formatFired,
  type ShortcutSource,
} from '@/lib/admin/shortcutModel'

/**
 * `/admin/shortcuts`'s testable surface — R1's exit criteria, encoded.
 *
 * The structural half at the bottom reads source files and asserts boundaries, the same technique
 * and the same reason as `tests/admin.memory.test.ts` and `tests/nina.distill.test.ts` case 14:
 * *a structural guarantee that is only a comment decays.* Three of those properties are the ones
 * this phase was most able to get wrong — the two derived columns must not be reachable from a
 * payload, the client table must not name a `lib/nina` module, and there must be no second click
 * anywhere on the page.
 */

const SOURCE: ShortcutSource = {
  id: 's1',
  trigger: '🍑',
  matchKey: '🍑',
  kind: 'glyph',
  label: 'remes pantat',
  expansion: 'ahh remes pantat aku sayang',
  enabled: true,
  uses: 3,
  lastUsedAt: new Date('2026-09-05T04:31:00Z'),
  createdAt: new Date('2026-09-01T00:00:00Z'),
}

describe('the bounds this page renders against', () => {
  it('re-exports phase 1s three caps rather than retyping them', () => {
    // The numbers are phase 1's; asserting them here is what catches a re-export that silently
    // stopped resolving (an `export … from` of a name that no longer exists is a build error, but
    // an export of the WRONG name is not).
    expect(NINA_TRIGGER_MAX).toBe(16)
    expect(NINA_SHORTCUT_LABEL_MAX).toBe(80)
    expect(NINA_SHORTCUT_EXPANSION_MAX).toBe(2000)
  })

  it('renders one page of the table, and the ledgers number is the one it borrows', () => {
    expect(ADMIN_SHORTCUT_PAGE).toBe(200)
  })

  it('names the three editable cells once, in a stable order', () => {
    expect(SHORTCUT_FIELDS).toEqual(['trigger', 'label', 'expansion'])
  })
})

describe('buildShortcutRows', () => {
  it('turns every Date into an ISO string and changes nothing else', () => {
    const [row] = buildShortcutRows([SOURCE])
    expect(row).toEqual({
      id: 's1',
      trigger: '🍑',
      matchKey: '🍑',
      kind: 'glyph',
      label: 'remes pantat',
      expansion: 'ahh remes pantat aku sayang',
      enabled: true,
      uses: 3,
      lastUsedAt: '2026-09-05T04:31:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
    })
  })

  it('keeps a never-fired row, with a null instant rather than an epoch', () => {
    const [row] = buildShortcutRows([{ ...SOURCE, uses: 0, lastUsedAt: null }])
    expect(row?.lastUsedAt).toBeNull()
    expect(row?.uses).toBe(0)
  })

  it('keeps a disabled row — off is not deleted, and the table still renders it', () => {
    const [row] = buildShortcutRows([{ ...SOURCE, enabled: false }])
    expect(row?.enabled).toBe(false)
  })

  it('preserves order, because the store already decided it', () => {
    const rows = buildShortcutRows([SOURCE, { ...SOURCE, id: 's2' }, { ...SOURCE, id: 's3' }])
    expect(rows.map((row) => row.id)).toEqual(['s1', 's2', 's3'])
  })

  it('gives every row a unique id, because it is the React key and the result-map key', () => {
    const rows = buildShortcutRows([SOURCE, { ...SOURCE, id: 's2' }])
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
  })
})

describe('formatFired', () => {
  it('says never rather than zero, because zero is not the question being asked', () => {
    expect(formatFired(0, null)).toBe('never')
    // A stale instant with a zeroed count is still "never": the count is what the sentence is about.
    expect(formatFired(0, '2026-09-05T04:31:00.000Z')).toBe('never')
  })

  it('reads as a count and a day', () => {
    expect(formatFired(3, '2026-09-05T04:31:00.000Z')).toBe('3× · 2026-09-05')
  })

  it('drops the day when there is a count and no instant', () => {
    expect(formatFired(3, null)).toBe('3×')
  })
})

/* ── the structural half ────────────────────────────────────────────────────────────────────── */

const MODEL = 'lib/admin/shortcutModel.ts'
const STORE = 'lib/admin/shortcutStore.ts'
const ACTIONS = 'lib/admin/shortcutActions.ts'
const SCHEMA = 'lib/admin/schema.ts'
const TABLE = 'components/admin/ShortcutTable.tsx'
const PURE = 'lib/nina/shortcuts.ts'

const read = (path: string) => readFileSync(path, 'utf8')

describe('the derived columns cannot be forgotten, and cannot be supplied', () => {
  it('leaves the derivation to the query layer and does not classify anything itself', () => {
    // `lib/nina/queries.ts` derives `match_key` and `kind` from `trigger` inside every write, and
    // `NinaShortcutInsert` / `NinaShortcutPatch` have NO FIELD for either — so this file could not
    // supply a mismatched key even by accident. That guarantee is the compiler's, and it is
    // stronger than the one this phase originally planned (two calls in this file, remembered by
    // hand). What is left for a test is the observable half: the classifier is not here at all.
    //
    // Read against the CODE with comments stripped, `lib/nina/shortcuts.test.ts`'s technique and
    // for the identical reason: the store's header names `classifyNinaTrigger` in the very
    // sentence that explains why it is absent, and deleting that sentence to satisfy a substring
    // search would delete the reason the rule exists. This is the same trap
    // `tests/admin.shell.test.ts`'s `classNames()` helper exists for.
    const code = read(STORE)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('classifyNinaTrigger')

    // The two `normalizeNinaTrigger` calls that DO remain are the empty-trigger QUESTION — one in
    // the insert path, one in the trigger branch of the cell save — and not derivations. Neither
    // result is passed to the query layer; both only decide whether to answer `'empty'`. A third
    // is either a new write path (fine, extend this) or a derivation creeping back in (not fine).
    expect(code.match(/normalizeNinaTrigger\(/g)).toHaveLength(2)

    // And neither derived column is handed DOWN. `matchKey` appears once in this file, in
    // `adminReadShortcuts`' projection of a row it read; it never appears inside a write call.
    for (const write of ['insertNinaShortcut(', 'updateNinaShortcut(']) {
      const calls = code.split(write).slice(1)
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) {
        const args = call.slice(0, call.indexOf('\n\n') === -1 ? 200 : call.indexOf('\n\n'))
        expect(args, `${write} must not be handed a derived column`).not.toContain('matchKey')
        expect(args, `${write} must not be handed a derived column`).not.toMatch(/\bkind\b/)
      }
    }
  })

  it('leaves nowhere in the payload to put either of them', () => {
    // The zod section: no field for the folded key, no field for the classification. Anchored to
    // the section banner so the memory schemas above it are not searched, and asserted on the
    // CAMEL-CASE spelling and on the property form, because the section's own prose has to be able
    // to explain the rule without failing it — the same trap `tests/admin.shell.test.ts`'s
    // `classNames()` helper exists for.
    const section = read(SCHEMA).slice(read(SCHEMA).indexOf('nina-emoji-shortcuts phase 3'))
    expect(section.length).toBeGreaterThan(0)
    expect(section).not.toContain('matchKey')
    expect(section).not.toMatch(/\bkind:/)

    const actions = read(ACTIONS)
    expect(actions).not.toContain('matchKey')
    expect(actions).not.toMatch(/\bkind:/)
  })

  it('routes every shortcut write through shortcutStore, never straight at the query layer', () => {
    const source = read(ACTIONS)
    expect(source).not.toMatch(/from '@\/lib\/nina\/queries'/)
    for (const writer of ['insertNinaShortcut', 'updateNinaShortcut', 'deleteNinaShortcut']) {
      expect(source).not.toContain(writer)
    }
  })

  it('keeps every shortcut write inside shortcutStore, and nowhere else under lib/admin', () => {
    // The writers live in `lib/nina/queries.ts` and exactly one `lib/admin` module may name them.
    // The old form of this case looked for `.insert(ninaShortcuts` and now passes vacuously — no
    // module under `lib/admin` touches the drizzle table at all — so it looks for the IMPORTS
    // instead, which is what a second writer would actually need.
    for (const entry of readdirSync('lib/admin', { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
      if (entry.name === 'shortcutStore.ts') continue
      const source = read(`lib/admin/${entry.name}`)
      for (const writer of ['insertNinaShortcut', 'updateNinaShortcut', 'deleteNinaShortcut']) {
        expect(source, `lib/admin/${entry.name} must not call ${writer}`).not.toContain(writer)
      }
      expect(source, `lib/admin/${entry.name} must not write nina_shortcuts`).not.toMatch(
        /\.(insert|update|delete)\(\s*ninaShortcuts/,
      )
    }
  })

  it('keeps the store on the server', () => {
    expect(read(STORE).startsWith("import 'server-only'")).toBe(true)
  })

  it('reads the registry through the query layer, not a second statement of its own', () => {
    const source = read(STORE)
    // One read exists in the tree and it is `lib/nina/queries.ts`'s. A `db.select` reappearing here
    // is the duplicate the reconciliation removed: `NinaShortcutRecord` already carries every
    // column this page renders, so a second statement can only fall behind the schema.
    expect(source).toContain('listNinaShortcuts')
    expect(source).not.toContain('db.select')
    expect(source).not.toContain("from '@/lib/db/schema'")
  })

  it('catches the unique violation instead of selecting first', () => {
    const source = read(STORE)
    // The rule from `lib/db/.workflows/package_readme.md`: "Never check-then-insert against a
    // unique index." A pre-flight read would race itself — and `insertNinaShortcut` THROWS the
    // 23505 precisely so this file can turn it into a sentence.
    expect(source).toContain('isUniqueViolation')
    expect(source).toContain('nina_shortcuts_user_match_unq')
    expect(source).not.toMatch(/\.where\([^)]*ninaShortcuts\.matchKey/)
  })
})

describe('the client boundary — one door, and it is shortcutModel', () => {
  it('lets shortcutModel through with exactly one value import, and it is the pure module', () => {
    const source = read(MODEL)

    // Every module specifier this file reaches for, however the statement is wrapped. Two of them
    // exist and both name the same module: one `import type` for the kind union, one value
    // re-export for the three caps. Matching the specifier rather than the statement keeps this
    // independent of how prettier wraps a multi-line `export { … } from '…'`.
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(specifiers).toEqual(['@/lib/nina/shortcuts', '@/lib/nina/shortcuts'])

    // And exactly one of the two is a value statement. `import type` may not be the thing that
    // carries the caps, and a plain `import {…}` of them would be a value import with no
    // re-export — both would still satisfy the check above, and neither is the shape argued for in
    // this module's header.
    expect(source.match(/^import type /gm)).toHaveLength(1)
    expect(source.match(/^export \{$/gm)).toHaveLength(1)
    expect(source).not.toMatch(/^import \{/m)
  })

  it('rests on lib/nina/shortcuts.ts having zero imports, so it asserts that too', () => {
    // Phase 1's invariant 4, re-asserted here because this file is one of the two things that
    // depend on it: the re-export above is only safe while that module pulls nothing into the
    // bundle behind it, and phase 4's `.mjs` importer only BOOTS while the same holds. One rule,
    // two consumers, asserted in all three places.
    const source = read(PURE)
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/\brequire\(/)
  })

  it('keeps the table client-safe: it names no lib/nina module and no server-only module', () => {
    const source = read(TABLE)
    for (const banned of [
      "from 'zod'",
      '@/lib/db/schema',
      '@/lib/db',
      '@/lib/nina/',
      '@/lib/admin/shortcutStore',
      '@/lib/admin/schema',
      '@/lib/admin/users',
    ]) {
      expect(source, `${TABLE} must not name ${banned}`).not.toContain(banned)
    }
  })

  it('hides the telemetry column with table-cell utilities and not a colgroup', () => {
    const source = read(TABLE)
    // `MemoryTable.tsx`'s header has the argument: a `<col>` maps to a column by position among
    // the cells actually rendered, so hiding a `<td>` slides every later column into the wrong
    // `<col>`; and `display:none` on a `<col>` is not defined to hide a column at all.
    expect(source).not.toContain('<colgroup')
    expect(source).toContain('hidden lg:table-cell')
  })

  it('keeps every control 16px and 44px below lg, on a page that is nothing but controls', () => {
    const source = read(TABLE)
    // Safari zooms the viewport when a control under 16px takes focus, and leaves it zoomed.
    // `CELL_CONTROL`'s docstring in `MemoryTable.tsx` has the cascade argument.
    expect(source).toContain('text-base')
    expect(source).toContain('min-h-11')
    expect(source).toContain('lg:min-h-0')
    expect(source).toContain('lg:text-[13px]')
  })

  it('toggles in one click: the on/off control is a checkbox, and no dropdown comes back', () => {
    const source = read(TABLE)
    // The owner retired the two-word on/off dropdown on 2026-09-10: open the picker, then pick,
    // is two clicks for a toggle, and a checkbox is one — in the table's FIRST column, so the
    // thumb lands on it before anything it toggles. This pins the property the same way the
    // no-confirmation suite pins its own, because a "make it consistent with the other tables"
    // edit is exactly how the second click comes back. And as with that suite, the cell's own
    // comment must not spell the machinery it is arguing against — the guard cannot tell an
    // explanation from a reintroduction.
    expect(source).toContain('type="checkbox"')
    expect(source).not.toContain('<select')
    expect(source).not.toContain('<option')
  })
})

describe('R1 — no confirmation, anywhere on this page', () => {
  it('never asks a second time', () => {
    const source = read(TABLE)
    for (const banned of [
      'window.confirm',
      'PURGE',
      '<dialog',
      'showModal',
      'Are you sure',
      'confirming',
    ]) {
      expect(source, `${TABLE} must not contain "${banned}"`).not.toContain(banned)
    }
  })

  it('exports exactly the four actions the table calls', () => {
    const exported = [...read(ACTIONS).matchAll(/^export async function (\w+)/gm)].map(
      ([, name]) => name,
    )
    expect(exported.sort()).toEqual([
      'addShortcutAction',
      'deleteShortcutAction',
      'saveShortcutCellAction',
      'toggleShortcutAction',
    ])
  })

  it('keeps requireAdmin, Zod and the revalidate at every one of those four boundaries', () => {
    const source = read(ACTIONS)
    expect(source.match(/\.safeParse\(input\)/g)).toHaveLength(4)
    // Anchored to the STATEMENT form (start of line, two-space body indent) so the numbered list in
    // this module's own header does not count as a fifth call site.
    expect(source.match(/^ {2}await requireAdmin\(\)$/gm)).toHaveLength(4)
    expect(source.match(/revalidatePath\('\/admin\/shortcuts'\)/g)).toHaveLength(4)
  })

  it('names the trigger when the unique index refuses it', () => {
    const source = read(ACTIONS)
    const refusal = source.slice(source.indexOf('function refusal'))
    expect(refusal).toContain('${trigger}')
  })
})
