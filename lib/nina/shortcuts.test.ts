import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  classifyNinaTrigger,
  matchNinaShortcuts,
  NINA_SHORTCUT_BLOCK_MAX_CHARS,
  NINA_SHORTCUT_EXPANSION_MAX,
  NINA_SHORTCUT_LABEL_MAX,
  NINA_SHORTCUT_LOOKBACK,
  NINA_SHORTCUT_MAX_FIRED,
  NINA_TRIGGER_MAX,
  normalizeNinaTrigger,
  renderNinaShortcutBlock,
  type NinaShortcutMatchable,
} from './shortcuts'

/**
 * The matcher, driven by the triggers that are ALREADY IN PRODUCTION rather than by invented ones.
 * *"read Memory data from prod and you would understand what i meant"* was half the specification,
 * and a fixture of made-up emoji would have tested a feature nobody asked for.
 *
 * Read from `nina_memory_facts` on 2026-09-07 and reproduced verbatim: nineteen emoji and five
 * onomatopoeic Latin tokens, twenty-four triggers in all — **at the time of that read.** The table
 * is live and moved during the analysis, so this list is a FIXTURE of what production held that
 * afternoon and not a count anything may depend on. Nothing in `lib/nina/shortcuts.ts` knows how
 * many rows exist, and phase 4's importer classifies at run time.
 */
const PROD_EMOJI = [
  '🍑',
  '💦',
  '💋',
  '🍆',
  '🤤',
  '🫦',
  '🤏',
  '🫴',
  '✌️', // U+270C U+FE0F — the one production trigger carrying a variation selector
  '🤲',
  '👌',
  '👐',
  '🤝',
  '🫶',
  '🙌',
  '👏',
  '👍',
  '👎',
  '👊',
] as const

const PROD_WORDS = ['plak!', 'slurp!', 'yumm', 'nom nom', 'lick!'] as const

const PROD_TRIGGERS = [...PROD_EMOJI, ...PROD_WORDS]

/**
 * `✌️` spelled out, because the difference between these two is invisible in an editor and is the
 * single most important case in this file. `U+FE0F` is VARIATION SELECTOR-16.
 */
const PEACE_WITH_VS = '\u270C\uFE0F'
const PEACE_BARE = '\u270C'

/** A row exactly as `lib/nina/queries.ts` would return it, minus the four fields matching ignores. */
function shortcut(
  id: string,
  trigger: string,
  over: Partial<NinaShortcutMatchable> = {},
): NinaShortcutMatchable {
  const matchKey = normalizeNinaTrigger(trigger)
  return {
    id,
    trigger,
    matchKey,
    kind: classifyNinaTrigger(matchKey),
    label: `${id} label`,
    expansion: `${id} expansion`,
    enabled: true,
    ...over,
  }
}

describe('normalizeNinaTrigger', () => {
  it('folds the variation selector out, which is what makes ✌️ and ✌ one shortcut', () => {
    expect(PEACE_WITH_VS.length).toBe(2)
    expect(PEACE_BARE.length).toBe(1)
    expect(normalizeNinaTrigger(PEACE_WITH_VS)).toBe(PEACE_BARE)
    expect(normalizeNinaTrigger(PEACE_BARE)).toBe(PEACE_BARE)
  })

  it('lowercases, trims, and collapses internal whitespace runs to one space', () => {
    expect(normalizeNinaTrigger('  Plak!  ')).toBe('plak!')
    expect(normalizeNinaTrigger('NOM   NOM')).toBe('nom nom')
    expect(normalizeNinaTrigger('nom\tnom')).toBe('nom nom')
  })

  it('KEEPS the zero-width joiner, or two distinct emoji sequences collide on one match_key', () => {
    const joined = '\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F468}'
    expect(normalizeNinaTrigger(joined)).toContain('\u200D')
    expect(normalizeNinaTrigger(joined)).not.toContain('\uFE0F')
  })

  it('is idempotent, which is what lets the matcher re-fold a stored match_key for free', () => {
    for (const trigger of PROD_TRIGGERS) {
      const once = normalizeNinaTrigger(trigger)
      expect(normalizeNinaTrigger(once), trigger).toBe(once)
    }
  })

  it('survives a non-string without throwing — plan invariant 7', () => {
    expect(normalizeNinaTrigger(null as unknown as string)).toBe('')
    expect(normalizeNinaTrigger(undefined as unknown as string)).toBe('')
    expect(normalizeNinaTrigger('   ')).toBe('')
  })
})

describe('classifyNinaTrigger, over the real production set', () => {
  it('calls every emoji in the fixture a glyph and every onomatopoeic token a word', () => {
    for (const emoji of PROD_EMOJI) {
      expect(classifyNinaTrigger(normalizeNinaTrigger(emoji)), emoji).toBe('glyph')
    }
    for (const word of PROD_WORDS) {
      expect(classifyNinaTrigger(normalizeNinaTrigger(word)), word).toBe('word')
    }
  })

  it('is not fooled by the trailing bang: plak! is a word on the strength of plak', () => {
    expect(classifyNinaTrigger('!')).toBe('glyph')
    expect(classifyNinaTrigger('plak!')).toBe('word')
  })
})

describe('the bounds fit the data they were sized for', () => {
  it('NINA_TRIGGER_MAX holds every real trigger with room for a ZWJ sequence', () => {
    for (const trigger of PROD_TRIGGERS) {
      expect(trigger.length, trigger).toBeLessThanOrEqual(NINA_TRIGGER_MAX)
    }
    // 👩‍❤️‍👨 — the shape the 16 was chosen for.
    expect('\u{1F469}\u200D\u2764\uFE0F\u200D\u{1F468}'.length).toBeLessThanOrEqual(
      NINA_TRIGGER_MAX,
    )
  })

  it('gives an expansion five times the ledger cap that is binding in production today', () => {
    // ADMIN_FACT_TEXT_MAX is 400 and the three longest production expansions sit within eight
    // characters of it. That is the defect this table exists to remove.
    expect(NINA_SHORTCUT_EXPANSION_MAX).toBe(2000)
    expect(NINA_SHORTCUT_LABEL_MAX).toBe(80)
    expect(NINA_SHORTCUT_MAX_FIRED).toBe(4)
    expect(NINA_SHORTCUT_LOOKBACK).toBe(6)
  })
})

describe('matchNinaShortcuts — the boundary rules', () => {
  it('matches ✌️ in a message carrying bare ✌, and bare ✌ in a message carrying ✌️', () => {
    const withVs = matchNinaShortcuts({
      shortcuts: [shortcut('a', PEACE_WITH_VS)],
      current: `oke ${PEACE_BARE} sayang`,
    })
    expect(withVs.fired.map((h) => h.id)).toEqual(['a'])

    const bare = matchNinaShortcuts({
      shortcuts: [shortcut('a', PEACE_BARE)],
      current: `oke ${PEACE_WITH_VS} sayang`,
    })
    expect(bare.fired.map((h) => h.id)).toEqual(['a'])
  })

  it('fires a glyph anywhere, including with no space around it', () => {
    const hits = matchNinaShortcuts({ shortcuts: [shortcut('a', '🍑')], current: 'ini🍑dong' })
    expect(hits.fired.map((h) => h.id)).toEqual(['a'])
  })

  it('does NOT fire yumm inside yummy — the whole reason a word gets a different rule', () => {
    const inside = matchNinaShortcuts({
      shortcuts: [shortcut('a', 'yumm')],
      current: 'yummy banget masakannya',
    })
    expect(inside.fired).toEqual([])

    const alone = matchNinaShortcuts({ shortcuts: [shortcut('a', 'yumm')], current: 'yumm banget' })
    expect(alone.fired.map((h) => h.id)).toEqual(['a'])
  })

  it('fires Plak! for the trigger plak!, because both sides are lowercased', () => {
    const hits = matchNinaShortcuts({ shortcuts: [shortcut('a', 'plak!')], current: 'Plak! keras' })
    expect(hits.fired.map((h) => h.id)).toEqual(['a'])
  })

  it('fires nom nom in "aku mau nom nom dong" but not in "nomnom"', () => {
    const spaced = matchNinaShortcuts({
      shortcuts: [shortcut('a', 'nom nom')],
      current: 'aku mau nom nom dong',
    })
    expect(spaced.fired.map((h) => h.id)).toEqual(['a'])

    const jammed = matchNinaShortcuts({ shortcuts: [shortcut('a', 'nom nom')], current: 'nomnom' })
    expect(jammed.fired).toEqual([])

    // And the whitespace collapse is what makes the double space still count.
    const doubled = matchNinaShortcuts({
      shortcuts: [shortcut('a', 'nom nom')],
      current: 'aku mau nom  nom dong',
    })
    expect(doubled.fired.map((h) => h.id)).toEqual(['a'])
  })

  it('fires every one of the twenty-four real triggers when he sends it on its own', () => {
    for (const trigger of PROD_TRIGGERS) {
      const hits = matchNinaShortcuts({
        shortcuts: [shortcut('a', trigger)],
        current: trigger,
      })
      expect(
        hits.fired.map((h) => h.id),
        trigger,
      ).toEqual(['a'])
    }
  })

  it('fires nothing for any of them when the message is about something else', () => {
    const shortcuts = PROD_TRIGGERS.map((trigger, i) => shortcut(`s${i}`, trigger))
    const hits = matchNinaShortcuts({
      shortcuts,
      current: 'tadi pagi lari 5k pace 6 menit, kaki agak pegal',
    })
    expect(hits.fired).toEqual([])
    expect(hits.inPlay).toEqual([])
  })
})

describe('matchNinaShortcuts — what does not fire', () => {
  it('never fires a disabled row', () => {
    const hits = matchNinaShortcuts({
      shortcuts: [shortcut('a', '🍑', { enabled: false })],
      current: 'ini 🍑 dong',
    })
    expect(hits.fired).toEqual([])
    expect(hits.inPlay).toEqual([])
  })

  it('fires nothing for a null message and nothing for an empty one', () => {
    const shortcuts = [shortcut('a', '🍑')]
    for (const current of [null, '', '   ']) {
      const hits = matchNinaShortcuts({ shortcuts, current })
      expect(hits.fired, String(current)).toEqual([])
      expect(renderNinaShortcutBlock(hits), String(current)).toBeNull()
    }
  })

  it('degrades rather than throws on a row whose kind and match_key are junk', () => {
    const broken = {
      id: 'a',
      trigger: '🍑',
      matchKey: '',
      kind: 'GLYPH' as unknown as NinaShortcutMatchable['kind'],
      label: '',
      expansion: 'x',
      enabled: true,
    }
    // match_key is empty, so it falls back to the trigger; kind is unrecognised, so it is
    // re-derived. Both paths are plan invariant 7.
    const hits = matchNinaShortcuts({ shortcuts: [broken], current: 'ini 🍑' })
    expect(hits.fired.map((h) => h.id)).toEqual(['a'])
  })

  it('counts a duplicated id once', () => {
    const one = shortcut('a', '🍑')
    const hits = matchNinaShortcuts({ shortcuts: [one, one], current: '🍑' })
    expect(hits.fired).toHaveLength(1)
  })
})

describe('matchNinaShortcuts — ordering, in-play and the cap', () => {
  it('orders fired by where each trigger first occurs in the message', () => {
    const hits = matchNinaShortcuts({
      shortcuts: [shortcut('peach', '🍑'), shortcut('splash', '💦')],
      current: 'dulu 💦 baru 🍑',
    })
    expect(hits.fired.map((h) => h.id)).toEqual(['splash', 'peach'])
  })

  it('puts a shortcut that matches BOTH current and recent in fired, exactly once', () => {
    const hits = matchNinaShortcuts({
      shortcuts: [shortcut('a', '🍑')],
      current: 'ini 🍑',
      recent: ['tadi 🍑 juga'],
    })
    expect(hits.fired.map((h) => h.id)).toEqual(['a'])
    expect(hits.inPlay).toEqual([])
  })

  it('keeps an earlier code in play when this message does not carry it', () => {
    const hits = matchNinaShortcuts({
      shortcuts: [shortcut('a', '🫦')],
      current: 'terusin',
      recent: ['🫦'],
    })
    expect(hits.fired).toEqual([])
    expect(hits.inPlay.map((h) => h.id)).toEqual(['a'])
  })

  it('stops looking back after NINA_SHORTCUT_LOOKBACK messages', () => {
    const recent = ['1', '2', '3', '4', '5', '6', 'tadi 🍑']
    expect(recent.length).toBeGreaterThan(NINA_SHORTCUT_LOOKBACK)
    const hits = matchNinaShortcuts({ shortcuts: [shortcut('a', '🍑')], current: 'hai', recent })
    expect(hits.inPlay).toEqual([])
  })

  it('gives every slot to fired first, so four in one message leaves no room for in-play', () => {
    const shortcuts = [
      shortcut('a', '🍑'),
      shortcut('b', '💦'),
      shortcut('c', '💋'),
      shortcut('d', '🍆'),
      shortcut('e', '🤤'),
    ]
    const full = matchNinaShortcuts({ shortcuts, current: '🍑💦💋🍆', recent: ['🤤'] })
    expect(full.fired).toHaveLength(NINA_SHORTCUT_MAX_FIRED)
    expect(full.inPlay).toEqual([])

    const partial = matchNinaShortcuts({ shortcuts, current: '🍑💦', recent: ['🤤 💋'] })
    expect(partial.fired.map((h) => h.id)).toEqual(['a', 'b'])
    expect(partial.inPlay.map((h) => h.id)).toEqual(['e', 'c'])
    expect(partial.fired.length + partial.inPlay.length).toBe(NINA_SHORTCUT_MAX_FIRED)
  })

  it('drops a fifth fired shortcut rather than growing the block', () => {
    const shortcuts = PROD_EMOJI.slice(0, 5).map((emoji, i) => shortcut(`s${i}`, emoji))
    const hits = matchNinaShortcuts({ shortcuts, current: PROD_EMOJI.slice(0, 5).join(' ') })
    expect(hits.fired.map((h) => h.id)).toEqual(['s0', 's1', 's2', 's3'])
  })
})

describe('renderNinaShortcutBlock', () => {
  it('is null when nothing fired and nothing is in play — plan invariant 2', () => {
    expect(renderNinaShortcutBlock({ fired: [], inPlay: [] })).toBeNull()
    expect(renderNinaShortcutBlock(null)).toBeNull()
    expect(renderNinaShortcutBlock(undefined)).toBeNull()
  })

  it('prints the trigger, the label and the whole expansion, under a directive header', () => {
    const hits = matchNinaShortcuts({
      shortcuts: [shortcut('a', '🍑', { label: 'remes pantat', expansion: 'a'.repeat(600) })],
      current: 'ini 🍑',
    })
    const block = renderNinaShortcutBlock(hits)
    expect(block).not.toBeNull()
    expect(block).toContain('HE USED A SHORTCUT')
    expect(block).toContain('🍑 — remes pantat')
    expect(block).toContain('a'.repeat(600))
    // The expansion is NOT truncated at the ledger's 400 — that cap is what this table removed.
    expect(block).not.toContain('…')
  })

  it('renders a still-in-play code under its own header even when nothing fired', () => {
    const hits = matchNinaShortcuts({
      shortcuts: [shortcut('a', '🫦')],
      current: 'terusin',
      recent: ['🫦'],
    })
    const block = renderNinaShortcutBlock(hits)
    expect(block).toContain('STILL IN PLAY')
    expect(block).not.toContain('HE USED A SHORTCUT')
  })

  it('never exceeds NINA_SHORTCUT_BLOCK_MAX_CHARS, and drops whole entries to stay under it', () => {
    // Four maximal expansions are 8000 characters against a 5000 ceiling, so this is reachable.
    const shortcuts = PROD_EMOJI.slice(0, 4).map((emoji, i) =>
      shortcut(`s${i}`, emoji, { expansion: 'z'.repeat(NINA_SHORTCUT_EXPANSION_MAX) }),
    )
    const hits = matchNinaShortcuts({ shortcuts, current: PROD_EMOJI.slice(0, 4).join('') })
    const block = renderNinaShortcutBlock(hits)
    expect(block).not.toBeNull()
    expect(block!.length).toBeLessThanOrEqual(NINA_SHORTCUT_BLOCK_MAX_CHARS)
    // Whole entries, not half a directive: no expansion in the block is a partial one.
    expect(block).not.toContain('…')
    expect(block).toContain(PROD_EMOJI[0])
  })

  it('clamps a single over-ceiling expansion rather than emitting a headline with no body', () => {
    const hits = matchNinaShortcuts({
      shortcuts: [shortcut('a', '🍑', { expansion: 'q'.repeat(9000) })],
      current: '🍑',
    })
    const block = renderNinaShortcutBlock(hits)
    expect(block!.length).toBe(NINA_SHORTCUT_BLOCK_MAX_CHARS)
    expect(block!.endsWith('…')).toBe(true)
    expect(block).toContain('HE USED A SHORTCUT')
  })
})

describe('the module stays importable from a client component', () => {
  it('has no imports at all, and nothing server-only', () => {
    // Phase 3's `components/admin/ShortcutTable.tsx` is `'use client'` and imports the three
    // length bounds directly. The `lib/nina/tuning.ts` rule, verbatim, including the reason it is
    // tested by READING rather than by importing: an import that works in Vitest proves nothing
    // about the react-server condition.
    const source = readFileSync(fileURLToPath(new URL('./shortcuts.ts', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/^\s*export\s+.*\bfrom\s+'/m)
    // Against the CODE with comments stripped, not the raw source: this module's header names
    // `server-only` and `@/lib/db/*` in the very sentence that forbids them, and deleting the
    // explanation to satisfy a substring search would delete the reason the rule exists.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('server-only')
    expect(code).not.toContain('@/lib/db')
  })
})
