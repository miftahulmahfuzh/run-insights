import { describe, expect, it } from 'vitest'

import { NINA_SESSION_TITLE_MAX_CHARS } from '@/lib/nina/sessions'

import {
  NINA_TITLE_MAX_WORDS,
  NINA_TITLE_OVERSHOOT_WORDS,
  NINA_TITLE_SNIPPET_CHARS,
  NINA_TITLE_SYSTEM_PROMPT,
  NINA_TITLE_TOOL,
  NINA_TITLE_TURN_LIMIT,
  buildNinaTitleRequest,
  parseNinaTitle,
  sanitizeNinaModelTitle,
  sanitizeNinaSessionTitle,
  titleTranscript,
  type NinaTitleTurn,
} from './title'

/**
 * R3's pure rules. The interesting cases are not the happy paths — they are the ones where the
 * model misbehaved, because a bad title is worse than no title: it is what the whole session list
 * shows, and a refusal costs nothing since phase 1's placeholder is already on the row.
 */

describe('sanitizeNinaSessionTitle — what HE typed', () => {
  it('keeps a plain title', () => {
    expect(sanitizeNinaSessionTitle('Latihan half marathon')).toBe('Latihan half marathon')
  })

  it('trims and collapses whitespace', () => {
    expect(sanitizeNinaSessionTitle('  Latihan   pagi \n ')).toBe('Latihan pagi')
  })

  it('refuses a non-string, because a form value is whatever the client posted', () => {
    expect(sanitizeNinaSessionTitle(undefined)).toBeNull()
    expect(sanitizeNinaSessionTitle(null)).toBeNull()
    expect(sanitizeNinaSessionTitle(42)).toBeNull()
    expect(sanitizeNinaSessionTitle(['Latihan'])).toBeNull()
  })

  it('refuses empty and whitespace-only — a blank row is worse than the placeholder', () => {
    expect(sanitizeNinaSessionTitle('')).toBeNull()
    expect(sanitizeNinaSessionTitle('   ')).toBeNull()
    expect(sanitizeNinaSessionTitle('\n\t')).toBeNull()
  })

  it('strips control characters a paste can carry, as SPACES not deletions', () => {
    expect(sanitizeNinaSessionTitle('Latihan\u0000pagi')).toBe('Latihan pagi')
    expect(sanitizeNinaSessionTitle('Latihan\u001Fpagi')).toBe('Latihan pagi')
  })

  /* The bug this rule exists to fix: phase 3's class did not cover these, and a title made only of
   * them passes an empty check, gets written, and renders as a blank sidebar row. */
  it('refuses a title made only of invisible characters', () => {
    expect(sanitizeNinaSessionTitle('\u200B')).toBeNull()
    expect(sanitizeNinaSessionTitle('\uFEFF\u200B\u2060')).toBeNull()
    expect(sanitizeNinaSessionTitle('\u202E')).toBeNull()
  })

  it('strips invisible characters from around real words', () => {
    expect(sanitizeNinaSessionTitle('\u200BLatihan\u200Bpagi\uFEFF')).toBe('Latihanpagi')
  })

  it('keeps the zero-width joiner, so his emoji family survives', () => {
    const family = 'Keluarga \u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
    expect(sanitizeNinaSessionTitle(family)).toBe(family)
  })

  it('keeps his emoji, his quotes and his full stop — his label is his instruction', () => {
    expect(sanitizeNinaSessionTitle('Latihan pagi 🔥')).toBe('Latihan pagi 🔥')
    expect(sanitizeNinaSessionTitle('"Latihan pagi"')).toBe('"Latihan pagi"')
    expect(sanitizeNinaSessionTitle('Latihan pagi.')).toBe('Latihan pagi.')
  })

  it('imposes NO word limit on him — R3 constrains the model, not the runner', () => {
    const his = 'Latihan half marathon bulan Desember tahun ini'
    expect(sanitizeNinaSessionTitle(his)).toBe(his)
  })

  it('clamps at the cap and leaves no trailing space behind the cut', () => {
    const long = `${'a'.repeat(NINA_SESSION_TITLE_MAX_CHARS - 1)} bcd`
    const result = sanitizeNinaSessionTitle(long)
    expect(result).toHaveLength(NINA_SESSION_TITLE_MAX_CHARS - 1)
    expect(result?.endsWith(' ')).toBe(false)
  })
})

describe('sanitizeNinaModelTitle — what the MODEL guessed', () => {
  it('keeps a three or four word answer verbatim', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut kanan')).toBe('Cedera lutut kanan')
    expect(sanitizeNinaModelTitle('Rencana half marathon Desember')).toBe(
      'Rencana half marathon Desember',
    )
  })

  it('accepts one and two word answers rather than falling back to the placeholder', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('Karbohidrat')).toBe('Karbohidrat')
  })

  it('refuses the empty string the prompt sanctions', () => {
    expect(sanitizeNinaModelTitle('')).toBeNull()
    expect(sanitizeNinaModelTitle('   ')).toBeNull()
  })

  it('strips wrapping quotes, including a quoted quote', () => {
    expect(sanitizeNinaModelTitle('"Cedera lutut kanan"')).toBe('Cedera lutut kanan')
    expect(sanitizeNinaModelTitle("'Cedera lutut'")).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('`Cedera lutut`')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('\u201CCedera lutut\u201D')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('"\'Cedera lutut\'"')).toBe('Cedera lutut')
  })

  it('strips a Title: or Judul: prefix', () => {
    expect(sanitizeNinaModelTitle('Judul: Cedera lutut')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('Title - Knee pain')).toBe('Knee pain')
    expect(sanitizeNinaModelTitle('TITLE: Knee pain')).toBe('Knee pain')
  })

  it('does not strip a colon that is part of the name', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut: kanan')).toBe('Cedera lutut: kanan')
  })

  it('strips markdown, because nothing renders it in a row', () => {
    expect(sanitizeNinaModelTitle('**Cedera lutut**')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('# Cedera lutut')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('- Cedera lutut')).toBe('Cedera lutut')
  })

  it('strips emoji from a machine title but keeps the words', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut 🔥')).toBe('Cedera lutut')
    expect(sanitizeNinaModelTitle('🏃 Latihan pagi')).toBe('Latihan pagi')
  })

  it('strips a trailing full stop, comma or question mark', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut kanan.')).toBe('Cedera lutut kanan')
    expect(sanitizeNinaModelTitle('Cedera lutut kanan!')).toBe('Cedera lutut kanan')
    expect(sanitizeNinaModelTitle('Cedera lutut kanan…')).toBe('Cedera lutut kanan')
  })

  it('keeps the first four words of a five or six word overshoot', () => {
    expect(sanitizeNinaModelTitle('Rencana half marathon bulan Desember')).toBe(
      'Rencana half marathon bulan',
    )
    expect(sanitizeNinaModelTitle('a b c d e f')).toBe('a b c d')
  })

  it('leaves no dangling comma behind the truncation', () => {
    expect(sanitizeNinaModelTitle('Cedera lutut kanan, sakit banget')).toBe('Cedera lutut kanan')
  })

  it('refuses seven or more words — a sentence is not a title', () => {
    expect(sanitizeNinaModelTitle('a b c d e f g')).toBeNull()
    expect(
      sanitizeNinaModelTitle('Dia bertanya tentang cedera lutut kanannya setelah lari jauh'),
    ).toBeNull()
  })

  it('refuses a refusal, because a refusal is prose', () => {
    expect(
      sanitizeNinaModelTitle('I am sorry, I cannot name this conversation for you.'),
    ).toBeNull()
    expect(sanitizeNinaModelTitle('Maaf, saya tidak bisa membuat judul untuk ini.')).toBeNull()
  })

  it('refuses four words that are too long to be a title', () => {
    expect(sanitizeNinaModelTitle(`${'a'.repeat(58)} b c d`)).toBeNull()
  })

  it('refuses an answer with no letter left in it', () => {
    expect(sanitizeNinaModelTitle('...')).toBeNull()
    expect(sanitizeNinaModelTitle('🔥🔥')).toBeNull()
    expect(sanitizeNinaModelTitle('"" ')).toBeNull()
  })

  it('refuses invisible-only, like the manual rule', () => {
    expect(sanitizeNinaModelTitle('\u200B\uFEFF')).toBeNull()
  })

  it('never returns something over the cap', () => {
    const answers = ['Cedera lutut kanan', `${'x'.repeat(200)}`, 'a b c d e f', '']
    for (const answer of answers) {
      const result = sanitizeNinaModelTitle(answer)
      if (result !== null) expect(result.length).toBeLessThanOrEqual(NINA_SESSION_TITLE_MAX_CHARS)
    }
  })

  it('never returns more than NINA_TITLE_MAX_WORDS words', () => {
    const result = sanitizeNinaModelTitle('satu dua tiga empat lima')
    expect(result?.split(' ')).toHaveLength(NINA_TITLE_MAX_WORDS)
  })
})

describe('parseNinaTitle — the tool block', () => {
  it('reads the title property', () => {
    expect(parseNinaTitle({ title: 'Cedera lutut kanan' })).toBe('Cedera lutut kanan')
  })

  it('refuses anything that is not an object with a string title', () => {
    expect(parseNinaTitle(null)).toBeNull()
    expect(parseNinaTitle(undefined)).toBeNull()
    expect(parseNinaTitle('Cedera lutut')).toBeNull()
    expect(parseNinaTitle({})).toBeNull()
    expect(parseNinaTitle({ title: 42 })).toBeNull()
    expect(parseNinaTitle({ title: null })).toBeNull()
    expect(parseNinaTitle({ name: 'Cedera lutut' })).toBeNull()
  })

  it('applies the whole model rule, not just the type check', () => {
    expect(parseNinaTitle({ title: '"Cedera lutut."' })).toBe('Cedera lutut')
    expect(parseNinaTitle({ title: '' })).toBeNull()
    expect(parseNinaTitle({ title: 'a b c d e f g' })).toBeNull()
  })
})

describe('titleTranscript and buildNinaTitleRequest', () => {
  const turns: NinaTitleTurn[] = [
    { role: 'runner', body: 'lutut gw sakit abis lari 15k' },
    { role: 'nina', body: 'sakitnya di bagian mana' },
  ]

  it('labels the two roles the way the distillation prompt does', () => {
    expect(titleTranscript(turns)).toBe(
      'HIM: lutut gw sakit abis lari 15k\nNINA: sakitnya di bagian mana',
    )
  })

  it('skips a message with an empty body — a captionless photo is a legitimate send', () => {
    expect(titleTranscript([{ role: 'runner', body: '   ' }, ...turns])).toBe(
      'HIM: lutut gw sakit abis lari 15k\nNINA: sakitnya di bagian mana',
    )
  })

  it('caps the number of messages', () => {
    const many: NinaTitleTurn[] = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? ('runner' as const) : ('nina' as const),
      body: `pesan ${String(index)}`,
    }))
    expect(titleTranscript(many).split('\n')).toHaveLength(NINA_TITLE_TURN_LIMIT)
  })

  it('caps the length of one message', () => {
    const long = [{ role: 'runner' as const, body: 'x'.repeat(4000) }]
    /* 'HIM: ' is five characters. */
    expect(titleTranscript(long)).toHaveLength(NINA_TITLE_SNIPPET_CHARS + 5)
  })

  it('builds a request with the transcript in it', () => {
    const request = buildNinaTitleRequest(turns)
    expect(request).toContain('lutut gw sakit abis lari 15k')
    expect(request?.startsWith('Name this conversation.')).toBe(true)
  })

  it('returns null when there is nothing to name, so no call is made', () => {
    expect(buildNinaTitleRequest([])).toBeNull()
    expect(buildNinaTitleRequest([{ role: 'runner', body: '' }])).toBeNull()
    expect(buildNinaTitleRequest([{ role: 'nina', body: '\u200B' }])).toBeNull()
  })
})

describe('the prompt and the tool', () => {
  it('forces the tool the caller looks for by name', () => {
    expect(NINA_TITLE_TOOL.name).toBe('title')
    expect(NINA_TITLE_TOOL.input_schema.required).toEqual(['title'])
  })

  /* The 3-4 word instruction has to be IN the prompt, because the code enforces only the maximum
   * (there is no minimum, deliberately) — so the prompt is the only place the range is asked for. */
  it('asks for three or four words and forbids the useless words', () => {
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('Three or four words')
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('percakapan')
  })

  it('tells it to write in his language and not to translate', () => {
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('language HE used')
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('Never translate')
  })

  it('tells it it is not Nina', () => {
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('not a participant')
  })

  it('offers the empty string as a sanctioned answer', () => {
    expect(NINA_TITLE_SYSTEM_PROMPT).toContain('empty string')
  })

  it('keeps the overshoot window above the keep window', () => {
    expect(NINA_TITLE_OVERSHOOT_WORDS).toBeGreaterThan(NINA_TITLE_MAX_WORDS)
  })
})
