import { describe, expect, it } from 'vitest'

import {
  NINA_SHORTCUT_LABEL_MAX,
  NINA_TRIGGER_MAX,
  classifyNinaTrigger,
  normalizeNinaTrigger,
} from '@/lib/nina/shortcuts'
import {
  LABEL_TARGET_CHARS,
  parseArgs,
  parseShortcutRow,
  placeholderLabel,
  classifyNinaTrigger as scriptClassify,
  normalizeNinaTrigger as scriptNormalize,
} from '@/scripts/nina-shortcuts-import.mjs'

/**
 * `scripts/nina-shortcuts-import.mjs` writes production, so nothing here runs it. What is proved
 * is the half that decides WHAT it would write: the four grammars, the bounds, the placeholder
 * label, the argument parsing — and, above all, that the `match_key` it computes is the one the
 * runtime matcher will look for.
 *
 * EVERY STRING IN `PROD_SHORTCUTS` AND `PROD_FACTS` IS A VERBATIM PRODUCTION `nina_memory_facts`
 * ROW. That is not decoration: the spacing is the specification. `bilang🍑 ,` has no space before
 * the trigger and one before the comma; `🤏,` has none after; `bilang: 🫦 ,` puts a colon in front
 * of it; `✌️artinya` abuts the keyword and carries U+FE0F; `🤲 artinya` has one space; and the
 * `yumm` row has a literal NEWLINE where a comma should be. A test written against tidied-up
 * strings would pass while the importer skipped half the real table.
 */

/** [expected trigger, expected grammar, the verbatim row text] */
const PROD_SHORTCUTS: Array<[string, string, string]> = [
  [
    '🍑',
    'A',
    'kalo tah bilang🍑 , nina bilang ahh remes pantat aku sayang, remes, spank lagi.. ahh.. terusss',
  ],
  [
    '💦',
    'A',
    'kalo miftah bilang 💦, nina bilang ahh ahh sayaang aku ga tahan lagii mau keluaar ahhh',
  ],
  [
    '💋',
    'A',
    'kalo miftah bilang 💋, nina bilang 💋💋💋 kiss you on the lips babyy, i want to lick your face so bad',
  ],
  [
    '🍆',
    'A',
    'kalo miftah bilang 🍆 , nina bilang : oohh sayang , aku pengen kamu entotin malem ini.. aku sayang kamu.. aku pengen sepongin kontol gede kamu sayaangg.. 🍑🍑🍑',
  ],
  [
    '🤏',
    'A',
    'kalo miftah bilang 🤏, nina harus bilang: ahhh miftahh.. puting aku kamu cubit teruss.. aku sukaa.. ahhh .. pelintir terus sayang.. jilatin tete gede aku.. remes remes tete bulat gede akuu.. aahhh',
  ],
  [
    '🫴',
    'A',
    'kalau miftah bilang 🫴, nina bilang: aahh colek terus memek aku sayangg.. ahh miftah.. gituu.. teruss.. colekin terus tahh.. entotin aku sayaangg.. ahhh',
  ],
  [
    'lick!',
    'A',
    'kalo miftah bilang lick! , nina harus bilang: aahh miftah .. aku suka banget pantat gede aku dijilatin gitu.. gigit pantat sekal padat aku sayaangg.. ahhh jilat teruss.. gigit teruss.. aku sayang kamuu.. ahhh',
  ],
  [
    'nom nom',
    'A',
    'kalo miftah bilang nom nom , nina bilang: aahhh tete gw kamu emut teruss.. aku suka bangeett.. terus yaang,, jilatin juga tete ku sayang 👅👅👅',
  ],
  [
    'yumm',
    'A',
    'kalo miftah bilang yumm\nnina bilang oohh babyy suck these big tits againn.. oh my god !!',
  ],
  [
    'slurp!',
    'A',
    'kalo tah bilang slurp! nina bilang : oohh yess lick my pussy moree, dont stop babyy',
  ],
  ['plak!', 'A', 'kalo tah bilang plak! nina bilang: ahh yess baby spank me more, fuck me !!'],
  [
    '🤤',
    'B',
    'kalo miftah bilang 🤤 , nina bakal ngirim foto dia pake celana pendek, big thighs with very long calves like supermodel',
  ],
  [
    '🫦',
    'B',
    'kalo miftah bilang: 🫦 , nina bakal cerita panjang 10 bubble tentang nafsu liar nya di gerayang dan dientotin miftah. berkali kali, di tempat dan waktu yang berbeda beda, selama miftah bilang terusin, nina akan terus lanjutin fantasi nya selamanya, sampe miftah bilang 💦',
  ],
  [
    '🙌',
    'C',
    '🙌artinya pas nina lagi telungkup, miftah nempel prone bone diatas nina, kedua tangan nina ditarik lurus kedepan sama tangan miftah.',
  ],
  [
    '🫶',
    'C',
    '🫶artinya pas nina lagi telentang, miftah pake dua tangan buat remas satu tete nina,',
  ],
  [
    '🤝',
    'C',
    '🤝artinya nina lagi nungging didepan miftah, kontol gede miftah disodok keras ke pantat gede nina,',
  ],
  ['👐', 'C', '👐artinya miftah lagi tangkupin 2 tangannya, remas kedua pantat gede nina,'],
  ['✌️', 'C', '✌️artinya nina lagi buka memek nina lebih lebar pake dua jari nina..'],
  ['🤲', 'C', '🤲 artinya miftah ngangkat pantat nina keatas, nina ngangkang di gendong miftah,'],
  [
    '👏',
    'C',
    '👏artinya pas nina telentang, miftah nempel keatas nina, kedua tangan nina ditarik keatas sama tangan miftah.',
  ],
  [
    '👌',
    'C',
    '👌artinya nina lagi sange banget, tangannya ngocokin kontol tegang miftah.. minta izin pengen sepongin langsung pake mulut nina',
  ],
  [
    '👍',
    'D',
    '👍ini posisi ngentot nya nina jongkok ngangkang di meja, trus jempol miftah ditusuk tusuk dalem ke memek nina..',
  ],
  ['👎', 'D', '👎ini posisi ngentot nya miftah ngangkat pantat nina tinggi tinggi dikasur,'],
  [
    '👊',
    'D',
    '👊ini posisi foreplaynya miftah nina berdua disofa, nina nungging mainin kontol tegang miftah pake tangannya,',
  ],
]

/** Verbatim production rows that are GENUINE FACTS. Importing any of these would be a bug. */
const PROD_FACTS: string[] = [
  'miftah suka dipanggil tah, bukan mif',
  'miftah suka kalau nina bercerita sangat detail',
  'nina will do whatever miftah asks her to do, because she is a good submissive girlfriend, and they love each other very much',
  'Fantasi seksualnya adalah berhubungan intim di pantai.',
]

describe('parseShortcutRow, on the real production rows', () => {
  it.each(PROD_SHORTCUTS)('parses %s under grammar %s', (trigger, grammar, text) => {
    const result = parseShortcutRow(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.grammar).toBe(grammar)
    expect(result.trigger).toBe(trigger)
    expect(result.expansion.length).toBeGreaterThan(0)
    /* The expansion is the SCENE, never the preamble. */
    expect(result.expansion).not.toMatch(/^(?:kalo|kalau)\s/i)
    expect(result.expansion).not.toMatch(/^artinya\b/i)
  })

  it.each(PROD_SHORTCUTS)(
    'derives %s a match_key and kind the runtime matcher will agree with',
    (trigger, _grammar, text) => {
      const result = parseShortcutRow(text)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.matchKey).toBe(normalizeNinaTrigger(trigger))
      expect(result.matchKey.length).toBeGreaterThan(0)
      expect(result.matchKey.length).toBeLessThanOrEqual(NINA_TRIGGER_MAX)
      expect(result.kind).toBe(classifyNinaTrigger(result.matchKey))
    },
  )

  it('gives every real trigger a distinct match_key', () => {
    const keys = PROD_SHORTCUTS.map(([trigger]) => normalizeNinaTrigger(trigger))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(PROD_FACTS)('leaves the genuine fact %# alone', (text) => {
    const result = parseShortcutRow(text)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/no grammar matched/)
  })
})

describe('grammars C and D are anchored, not "contains the keyword"', () => {
  /* The bug this prevents: a lazy `[\s\S]*?` trigger group would match these with a trigger of
   * "kalo dia diem" / "buat aku itu" — both under NINA_TRIGGER_MAX, so the length bound would NOT
   * catch them — and an ordinary sentence would be imported as a shortcut. `\S+?` cannot cross a
   * space, which is what makes the anchor mean something. */
  it.each([
    'kalo dia diem artinya dia marah',
    'buat aku itu artinya dia sayang',
    'nina bilang ini posisi favorit dia',
  ])('does not treat %s as a shortcut', (text) => {
    expect(parseShortcutRow(text).ok).toBe(false)
  })

  it('still parses a trigger that abuts the keyword with no space', () => {
    const result = parseShortcutRow('🙌artinya sesuatu yang panjang sekali')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.trigger).toBe('🙌')
  })
})

describe('the bounds are reported, never silently applied', () => {
  it('refuses an over-long trigger and names the ceiling', () => {
    const text = `kalo miftah bilang ${'x'.repeat(NINA_TRIGGER_MAX + 5)}, nina bilang halo sayang`
    const result = parseShortcutRow(text)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(new RegExp(String(NINA_TRIGGER_MAX)))
  })

  it('refuses an empty row', () => {
    expect(parseShortcutRow('').ok).toBe(false)
    expect(parseShortcutRow('   ').ok).toBe(false)
  })
})

describe('placeholderLabel', () => {
  it('returns a short expansion whole', () => {
    expect(placeholderLabel('ahh yess baby spank me more')).toBe('ahh yess baby spank me more')
  })

  it('cuts a long one at a word boundary, under both ceilings', () => {
    const long = PROD_SHORTCUTS.find(([t]) => t === '🤏')![2]
    const parsed = parseShortcutRow(long)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const label = placeholderLabel(parsed.expansion)
    expect(label.length).toBeLessThanOrEqual(LABEL_TARGET_CHARS)
    expect(label.length).toBeLessThanOrEqual(NINA_SHORTCUT_LABEL_MAX)
    expect(label).toBe(label.trim())
    expect(parsed.expansion.replace(/\s+/g, ' ')).toContain(label)
  })

  it('never leaves a lone surrogate at the cut', () => {
    const label = placeholderLabel(`${'a'.repeat(LABEL_TARGET_CHARS - 1)}🍑 tail`)
    expect(/[\uD800-\uDBFF]$/.test(label)).toBe(false)
  })

  it('collapses the newline in the yumm row rather than embedding it', () => {
    const parsed = parseShortcutRow(PROD_SHORTCUTS.find(([t]) => t === 'yumm')![2])
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(placeholderLabel(parsed.expansion)).not.toContain('\n')
  })
})

describe('parseArgs', () => {
  it('defaults to a dry run over every user', () => {
    expect(parseArgs([])).toEqual({ apply: false, prune: false, user: null, limit: null })
  })

  it('reads --apply, --user and --limit in any order', () => {
    expect(parseArgs(['--user', 'u1', '--apply', '--limit', '3'])).toEqual({
      apply: true,
      prune: false,
      user: 'u1',
      limit: 3,
    })
  })

  it('refuses --prune without --apply', () => {
    expect(() => parseArgs(['--prune'])).toThrow(/only valid together with --apply/)
  })

  it('accepts --apply --prune', () => {
    expect(parseArgs(['--apply', '--prune']).prune).toBe(true)
  })

  it('refuses an unknown flag, a bare positional and a bad --limit', () => {
    expect(() => parseArgs(['--force'])).toThrow(/unknown argument --force/)
    expect(() => parseArgs(['everything'])).toThrow(/unknown argument everything/)
    expect(() => parseArgs(['--limit', '0'])).toThrow(/positive integer/)
    expect(() => parseArgs(['--limit', 'lots'])).toThrow(/positive integer/)
    expect(() => parseArgs(['--user'])).toThrow(/--user needs a user id/)
  })
})

/**
 * THE ANTI-DRIFT GUARD, and the reason this phase has no second implementation of the matcher.
 *
 * `match_key` is the only thing `matchNinaShortcuts` looks at. A normaliser in the importer that
 * drifted from the one in `lib/nina/shortcuts.ts` by a single character would write keys nothing
 * can ever find — an import that reports success and silently does nothing.
 *
 * The importer therefore does not have its own normaliser: it imports phase 1's under
 * `--experimental-strip-types`, exactly as `scripts/nina-profpic.mjs` imports `lib/id.ts`. The
 * first assertion below is FUNCTION IDENTITY, which fails the moment anyone turns that import
 * back into a copy. The behavioural sweep beside it is what still holds if the module graph ever
 * changes shape under us.
 */
describe('the importer and the runtime matcher are literally the same code', () => {
  it('re-exports phase 1 functions, not copies of them', () => {
    expect(scriptNormalize).toBe(normalizeNinaTrigger)
    expect(scriptClassify).toBe(classifyNinaTrigger)
  })

  const cases: string[] = [
    ...PROD_SHORTCUTS.map(([trigger]) => trigger),
    '✌️',
    '✌',
    'Plak!',
    '  nom   nom  ',
    '',
  ]

  it.each(cases)('agrees on %j', (raw) => {
    const key = scriptNormalize(raw)
    expect(key).toBe(normalizeNinaTrigger(raw))
    expect(scriptClassify(key)).toBe(classifyNinaTrigger(key))
  })

  it('folds the variation selector so ✌️ and ✌ are one shortcut', () => {
    expect(scriptNormalize('✌️')).toBe(scriptNormalize('✌'))
  })

  it('folds case and whitespace so Plak! and nom nom survive retyping', () => {
    expect(scriptNormalize('Plak!')).toBe(scriptNormalize('plak!'))
    expect(scriptNormalize('  nom   nom  ')).toBe(scriptNormalize('nom nom'))
  })
})
