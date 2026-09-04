import { describe, expect, it } from 'vitest'

import {
  NINA_SEMANTIC_PREF_KEY,
  OCCURRENCE_CAP,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_CHARS,
  SEARCH_QUERY_MAX_CHARS,
  SEARCH_RESULT_MAX,
  SEARCH_TERM_MAX,
  SEMANTIC_CANDIDATE_MAX,
  SEMANTIC_DEBOUNCE_MS,
  SEMANTIC_MIN_CHARS,
  SEMANTIC_PREF_ON,
  SEMANTIC_SNIPPET_CHARS,
  SESSION_HIT_BONUS,
  SNIPPET_MAX_CHARS,
  applySemanticRanking,
  buildSemanticCandidates,
  decodeSemanticPref,
  emptySearchResponse,
  encodeSemanticPref,
  isDegradedSearch,
  likePattern,
  matchesAllTerms,
  normalizeSearchQuery,
  parseSemanticRanking,
  rankTextHits,
  scoreTextCandidate,
  searchDebounceMs,
  searchHitHref,
  searchTerms,
  semanticCandidateBlock,
  shouldRunSearch,
  shouldRunSemantic,
  snippetAround,
  type NinaSearchCandidate,
} from './search'

/* ── fixtures ──────────────────────────────────────────────────────────────────────────────── */

function message(over: Partial<NinaSearchCandidate> = {}): NinaSearchCandidate {
  return {
    kind: 'message',
    sessionId: 'sess00000001',
    sessionTitle: 'Morning long run',
    messageId: 'msg000000001',
    seq: 1,
    mine: true,
    text: 'lari gw kemaren gimana menurut lo?',
    day: 'Thu, 20 Aug 2026',
    ...over,
  }
}

/**
 * A session candidate's `text` IS its title — `narrowSearchCandidates` sets both from `row.title`,
 * because there is no message body to search. So the fixture mirrors an overridden `sessionTitle`
 * into `text` rather than letting the two drift apart, which would let a test assert on a shape the
 * action cannot produce.
 */
function session(over: Partial<NinaSearchCandidate> = {}): NinaSearchCandidate {
  const sessionTitle = over.sessionTitle ?? 'Morning long run'
  return {
    kind: 'session',
    sessionId: 'sess00000001',
    sessionTitle,
    messageId: null,
    seq: 0,
    mine: false,
    text: sessionTitle,
    day: '',
    ...over,
  }
}

/* ── the persisted toggle ──────────────────────────────────────────────────────────────────── */

describe('the semantic-search preference', () => {
  it('uses one namespaced key', () => {
    expect(NINA_SEMANTIC_PREF_KEY).toBe('ri:nina:semantic-search')
  })

  it('reads exactly one value as on', () => {
    expect(decodeSemanticPref(SEMANTIC_PREF_ON)).toBe(true)
  })

  it('fails closed on everything else', () => {
    for (const raw of [null, undefined, '', '0', 'true', 'yes', 'on', '1 ', ' 1']) {
      expect(decodeSemanticPref(raw)).toBe(false)
    }
  })

  it('encodes off as null, so the key is removed rather than set to a falsy string', () => {
    expect(encodeSemanticPref(true)).toBe(SEMANTIC_PREF_ON)
    expect(encodeSemanticPref(false)).toBeNull()
  })

  it('round-trips', () => {
    expect(decodeSemanticPref(encodeSemanticPref(true))).toBe(true)
    expect(decodeSemanticPref(encodeSemanticPref(false))).toBe(false)
  })
})

/* ── the query ─────────────────────────────────────────────────────────────────────────────── */

describe('normalizeSearchQuery', () => {
  it('collapses every kind of whitespace and trims', () => {
    expect(normalizeSearchQuery('  pagi   mif\n\nlari\tlagi?  ')).toBe('pagi mif lari lagi?')
  })

  it('returns empty for a non-string', () => {
    for (const raw of [null, undefined, 42, {}, [], true]) {
      expect(normalizeSearchQuery(raw)).toBe('')
    }
  })

  it('truncates a paste rather than refusing it', () => {
    expect(normalizeSearchQuery('a'.repeat(SEARCH_QUERY_MAX_CHARS + 50))).toHaveLength(
      SEARCH_QUERY_MAX_CHARS,
    )
  })
})

describe('searchTerms', () => {
  it('lowercases and splits', () => {
    expect(searchTerms('Lari Pagi')).toEqual(['lari', 'pagi'])
  })

  it('drops duplicates, keeping first order', () => {
    expect(searchTerms('lari lari pagi lari')).toEqual(['lari', 'pagi'])
  })

  it('caps the term count', () => {
    const query = Array.from({ length: SEARCH_TERM_MAX + 4 }, (_, i) => `t${i}`).join(' ')
    expect(searchTerms(query)).toHaveLength(SEARCH_TERM_MAX)
  })

  it('is empty for an empty query', () => {
    expect(searchTerms('   ')).toEqual([])
  })
})

describe('likePattern', () => {
  it('wraps a plain term in wildcards', () => {
    expect(likePattern('lari')).toBe('%lari%')
  })

  it('escapes the percent that would otherwise match every row', () => {
    expect(likePattern('100%')).toBe('%100\\%%')
  })

  it('escapes the underscore that would otherwise match any character', () => {
    expect(likePattern('a_b')).toBe('%a\\_b%')
  })

  it('escapes a literal backslash first, so an escape cannot be forged', () => {
    expect(likePattern('a\\b')).toBe('%a\\\\b%')
    expect(likePattern('\\%')).toBe('%\\\\\\%%')
  })
})

describe('the run gates', () => {
  it('needs at least SEARCH_MIN_CHARS to query anything', () => {
    expect(shouldRunSearch('a'.repeat(SEARCH_MIN_CHARS - 1))).toBe(false)
    expect(shouldRunSearch('a'.repeat(SEARCH_MIN_CHARS))).toBe(true)
  })

  it('measures the NORMALISED query, so whitespace does not buy a search', () => {
    expect(shouldRunSearch('  a  ')).toBe(false)
  })

  it('needs the toggle AND SEMANTIC_MIN_CHARS for the model pass', () => {
    const short = 'a'.repeat(SEMANTIC_MIN_CHARS - 1)
    const long = 'a'.repeat(SEMANTIC_MIN_CHARS)
    expect(shouldRunSemantic(long, false)).toBe(false)
    expect(shouldRunSemantic(short, true)).toBe(false)
    expect(shouldRunSemantic(long, true)).toBe(true)
  })

  it('charges a longer debounce for a query that costs a model call', () => {
    expect(searchDebounceMs(false)).toBe(SEARCH_DEBOUNCE_MS)
    expect(searchDebounceMs(true)).toBe(SEMANTIC_DEBOUNCE_MS)
    expect(SEMANTIC_DEBOUNCE_MS).toBeGreaterThan(SEARCH_DEBOUNCE_MS)
  })
})

describe('matchesAllTerms', () => {
  it('requires every term', () => {
    expect(matchesAllTerms('lari pagi enak', ['lari', 'pagi'])).toBe(true)
    expect(matchesAllTerms('lari pagi enak', ['lari', 'malam'])).toBe(false)
  })

  it('is case-insensitive on both sides of the comparison', () => {
    expect(matchesAllTerms('LARI Pagi', ['lari', 'pagi'])).toBe(true)
  })

  it('matches inside a word, which is the point of ILIKE over to_tsquery', () => {
    expect(matchesAllTerms('berlari terus', ['lari'])).toBe(true)
  })

  it('matches nothing when there are no terms', () => {
    expect(matchesAllTerms('anything', [])).toBe(false)
  })
})

/* ── snippets ──────────────────────────────────────────────────────────────────────────────── */

describe('snippetAround', () => {
  it('returns a short message whole, with no ellipsis', () => {
    expect(snippetAround('lari pagi', ['lari'])).toBe('lari pagi')
  })

  it('collapses newlines, because a result row is a reference and not the message', () => {
    expect(snippetAround('lari\n\npagi', ['lari'])).toBe('lari pagi')
  })

  it('centres on the first matching term and marks both cuts', () => {
    const text = `${'x'.repeat(400)} TARGET ${'y'.repeat(400)}`
    const snippet = snippetAround(text, ['target'], 40)
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
    expect(snippet.toLowerCase()).toContain('target')
  })

  it('does not mark a leading cut when the match is already near the start', () => {
    const snippet = snippetAround(`TARGET ${'y'.repeat(400)}`, ['target'], 40)
    expect(snippet.startsWith('…')).toBe(false)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('does not mark a trailing cut when the match is at the very end', () => {
    const snippet = snippetAround(`${'x'.repeat(400)} TARGET`, ['target'], 40)
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(false)
  })

  it('falls back to the head when no term is present — the semantic path', () => {
    const snippet = snippetAround('a'.repeat(400), ['nothing'], 40)
    expect(snippet).toBe(`${'a'.repeat(40)}…`)
  })

  it('stays within budget plus its ellipses', () => {
    const snippet = snippetAround('z'.repeat(1000), ['zz'], 40)
    expect(snippet.length).toBeLessThanOrEqual(42)
  })

  it('returns empty for empty text and for a non-positive budget', () => {
    expect(snippetAround('   ', ['a'])).toBe('')
    expect(snippetAround('lari', ['lari'], 0)).toBe('')
  })

  it('defaults to SNIPPET_MAX_CHARS', () => {
    expect(snippetAround('q'.repeat(1000), [])).toHaveLength(SNIPPET_MAX_CHARS + 1)
  })
})

/* ── the href: no third URL grammar ────────────────────────────────────────────────────────── */

describe('searchHitHref', () => {
  it('deep-links to the message through phase 3 s ?s= and scroll.ts s ?at=', () => {
    expect(searchHitHref({ sessionId: 'sess00000001', messageId: 'msg000000001' })).toBe(
      '/nina?s=sess00000001&at=msg000000001~0',
    )
  })

  it('leaves the ~ unencoded, which is why scroll.ts chose it', () => {
    const href = searchHitHref({ sessionId: 's1', messageId: 'm1' })
    expect(href).toContain('~0')
    expect(href).not.toContain('%7E')
  })

  it('opens the session with no mark when the hit is a title', () => {
    expect(searchHitHref({ sessionId: 'sess00000001', messageId: null })).toBe(
      '/nina?s=sess00000001',
    )
  })
})

/* ── text ranking ──────────────────────────────────────────────────────────────────────────── */

describe('scoreTextCandidate', () => {
  it('puts every session-title hit above every message hit', () => {
    const title = scoreTextCandidate(session({ text: 'lari' }), ['lari'])
    const body = scoreTextCandidate(message({ text: 'lari '.repeat(50) }), ['lari'])
    expect(title).toBeGreaterThan(body)
    expect(title).toBeGreaterThanOrEqual(SESSION_HIT_BONUS)
  })

  it('rewards the query appearing as a contiguous phrase', () => {
    const phrase = scoreTextCandidate(message({ text: 'lari pagi enak' }), ['lari', 'pagi'])
    const scattered = scoreTextCandidate(message({ text: 'lari kemarin, pagi ini' }), [
      'lari',
      'pagi',
    ])
    expect(phrase).toBeGreaterThan(scattered)
  })

  it('does not award a phrase bonus for a single term', () => {
    const once = scoreTextCandidate(message({ text: 'lari' }), ['lari'])
    expect(once).toBeLessThan(100)
  })

  it('caps how much repetition can buy', () => {
    const capped = scoreTextCandidate(message({ text: 'lari '.repeat(OCCURRENCE_CAP) }), ['lari'])
    const beyond = scoreTextCandidate(message({ text: 'lari '.repeat(OCCURRENCE_CAP + 20) }), [
      'lari',
    ])
    expect(beyond).toBe(capped)
  })
})

describe('rankTextHits', () => {
  it('drops a candidate that does not match every term', () => {
    const hits = rankTextHits(
      [message({ messageId: 'm1', text: 'lari pagi' }), message({ messageId: 'm2', text: 'lari' })],
      ['lari', 'pagi'],
    )
    expect(hits.map((hit) => hit.messageId)).toEqual(['m1'])
  })

  it('breaks a score tie by seq descending — the newer message is the one he means', () => {
    const hits = rankTextHits(
      [
        message({ messageId: 'old', seq: 1, text: 'lari' }),
        message({ messageId: 'new', seq: 9, text: 'lari' }),
      ],
      ['lari'],
    )
    expect(hits.map((hit) => hit.messageId)).toEqual(['new', 'old'])
  })

  it('is a total order, so two equal candidates never swap between runs', () => {
    const rows = [
      message({ messageId: 'bbb', seq: 5, text: 'lari' }),
      message({ messageId: 'aaa', seq: 5, text: 'lari' }),
    ]
    expect(rankTextHits(rows, ['lari']).map((hit) => hit.messageId)).toEqual(['aaa', 'bbb'])
    expect(rankTextHits([...rows].reverse(), ['lari']).map((hit) => hit.messageId)).toEqual([
      'aaa',
      'bbb',
    ])
  })

  it('groups titles first', () => {
    const hits = rankTextHits(
      [message({ messageId: 'm1', text: 'lari' }), session({ text: 'lari' })],
      ['lari'],
    )
    expect(hits.map((hit) => hit.kind)).toEqual(['session', 'message'])
  })

  it('honours the limit', () => {
    const rows = Array.from({ length: SEARCH_RESULT_MAX + 8 }, (_, i) =>
      message({ messageId: `m${i}`, seq: i, text: 'lari' }),
    )
    expect(rankTextHits(rows, ['lari'])).toHaveLength(SEARCH_RESULT_MAX)
    expect(rankTextHits(rows, ['lari'], 3)).toHaveLength(3)
  })

  it('returns nothing for no terms rather than everything', () => {
    expect(rankTextHits([message()], [])).toEqual([])
  })

  it('carries the rendered day straight through, formatting nothing', () => {
    const [hit] = rankTextHits([message({ day: 'Thu, 20 Aug 2026' })], ['lari'])
    expect(hit?.day).toBe('Thu, 20 Aug 2026')
  })
})

/* ── the semantic pass ─────────────────────────────────────────────────────────────────────── */

describe('buildSemanticCandidates', () => {
  it('orders titles, then text matches, then recency filler', () => {
    const built = buildSemanticCandidates(
      [session({ sessionId: 's1' })],
      [message({ messageId: 'text' })],
      [message({ messageId: 'recent' })],
    )
    expect(built.map((row) => row.messageId)).toEqual([null, 'text', 'recent'])
  })

  it('deduplicates a message that is both a text match and inside the recency window', () => {
    const row = message({ messageId: 'shared' })
    const built = buildSemanticCandidates([], [row], [row, message({ messageId: 'other' })])
    expect(built.map((r) => r.messageId)).toEqual(['shared', 'other'])
  })

  it('keeps a session and a message from the same session as two candidates', () => {
    const built = buildSemanticCandidates(
      [session({ sessionId: 'same' })],
      [message({ sessionId: 'same', messageId: 'm1' })],
      [],
    )
    expect(built).toHaveLength(2)
  })

  it('lets the cap eat only recency filler, never a text hit', () => {
    const texts = Array.from({ length: 5 }, (_, i) => message({ messageId: `t${i}` }))
    const recent = Array.from({ length: 50 }, (_, i) => message({ messageId: `r${i}` }))
    const built = buildSemanticCandidates([], texts, recent, 6)
    expect(built).toHaveLength(6)
    expect(built.slice(0, 5).map((r) => r.messageId)).toEqual(['t0', 't1', 't2', 't3', 't4'])
    expect(built[5]?.messageId).toBe('r0')
  })

  it('defaults to SEMANTIC_CANDIDATE_MAX', () => {
    const recent = Array.from({ length: SEMANTIC_CANDIDATE_MAX + 30 }, (_, i) =>
      message({ messageId: `r${i}` }),
    )
    expect(buildSemanticCandidates([], [], recent)).toHaveLength(SEMANTIC_CANDIDATE_MAX)
  })
})

describe('semanticCandidateBlock', () => {
  it('emits one tab-separated line per candidate, indexed from zero', () => {
    const block = semanticCandidateBlock([
      message({ mine: true, text: 'lari pagi', sessionTitle: 'Long run' }),
      message({ mine: false, text: 'mantap', sessionTitle: 'Long run' }),
    ])
    expect(block.split('\n')).toEqual(['0\tHIM\tLong run\tlari pagi', '1\tHER\tLong run\tmantap'])
  })

  it('labels a session candidate TITLE', () => {
    expect(semanticCandidateBlock([session({ sessionTitle: 'Long run' })])).toBe(
      '0\tTITLE\tLong run\tLong run',
    )
  })

  it('flattens text, so a tab in a message cannot forge a column', () => {
    const block = semanticCandidateBlock([message({ text: 'a\tb\nc' })])
    expect(block.split('\t')).toHaveLength(4)
    expect(block.endsWith('a b c')).toBe(true)
  })

  it('clamps a long message to the per-candidate budget', () => {
    const block = semanticCandidateBlock([message({ text: 'w'.repeat(2000) })])
    const text = block.split('\t')[3] ?? ''
    expect(text).toHaveLength(SEMANTIC_SNIPPET_CHARS + 1)
    expect(text.endsWith('…')).toBe(true)
  })

  it('is empty for no candidates', () => {
    expect(semanticCandidateBlock([])).toBe('')
  })
})

describe('parseSemanticRanking', () => {
  it('accepts the documented shape', () => {
    expect(parseSemanticRanking({ ranked: [2, 0, 1] }, 3)).toEqual([2, 0, 1])
  })

  it('coerces a numeric string, because a model is untidy and this is free', () => {
    expect(parseSemanticRanking({ ranked: ['2', 0] }, 3)).toEqual([2, 0])
  })

  it('drops an index it invented rather than clamping it into a row nobody chose', () => {
    expect(parseSemanticRanking({ ranked: [0, 99, -1, 1.5, 1] }, 3)).toEqual([0, 1])
  })

  it('drops duplicates', () => {
    expect(parseSemanticRanking({ ranked: [1, 1, 0] }, 3)).toEqual([1, 0])
  })

  it('caps the result count', () => {
    const ranked = Array.from({ length: SEARCH_RESULT_MAX + 10 }, (_, i) => i)
    expect(parseSemanticRanking({ ranked }, ranked.length)).toHaveLength(SEARCH_RESULT_MAX)
  })

  it('treats an empty ranking as a failure, so the caller degrades to text', () => {
    expect(parseSemanticRanking({ ranked: [] }, 3)).toBeNull()
  })

  it('returns null for every malformed body', () => {
    for (const raw of [null, undefined, 'ranked', 42, [], [1, 2], {}, { ranked: 'nope' }]) {
      expect(parseSemanticRanking(raw, 3)).toBeNull()
    }
  })
})

describe('applySemanticRanking', () => {
  it('preserves the model s order exactly, with no re-score', () => {
    const candidates = [
      message({ messageId: 'a', seq: 9 }),
      message({ messageId: 'b', seq: 1 }),
      message({ messageId: 'c', seq: 5 }),
    ]
    const hits = applySemanticRanking(candidates, [1, 2, 0], ['lari'])
    expect(hits.map((hit) => hit.messageId)).toEqual(['b', 'c', 'a'])
  })

  it('skips an index with no candidate behind it', () => {
    expect(applySemanticRanking([message({ messageId: 'a' })], [0, 7], [])).toHaveLength(1)
  })

  it('still builds a snippet when the hit shares no word with the query', () => {
    const [hit] = applySemanticRanking(
      [message({ text: 'kaki gw ga mau gerak' })],
      [0],
      ['exhausted'],
    )
    expect(hit?.snippet).toBe('kaki gw ga mau gerak')
  })
})

/* ── the response shape ────────────────────────────────────────────────────────────────────── */

describe('the response shape', () => {
  it('starts empty in text mode, whatever was requested', () => {
    expect(emptySearchResponse('semantic')).toEqual({
      requested: 'semantic',
      mode: 'text',
      hits: [],
      capped: false,
    })
  })

  it('names the degraded state and only that state', () => {
    expect(isDegradedSearch(emptySearchResponse('semantic'))).toBe(true)
    expect(isDegradedSearch(emptySearchResponse('text'))).toBe(false)
    expect(
      isDegradedSearch({ requested: 'semantic', mode: 'semantic', hits: [], capped: false }),
    ).toBe(false)
    expect(isDegradedSearch(null)).toBe(false)
  })
})
