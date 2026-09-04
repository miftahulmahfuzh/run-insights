import { NINA_SLOT_PENDING_PROMISES, type NinaPendingPromise } from '@/lib/db/schema'
import {
  canonicaliseNickname,
  deriveNicknameCandidates,
  formatRunningDays,
  formatWorkHours,
  isNinaSlotKey,
  mergePendingPromises,
  nameSlotValue,
  NINA_SLOT_KEYS,
  NINA_SLOT_SPECS,
  parseRunningDays,
  parseRunningDaysAsJsWeekday,
  parseWorkHours,
  planMemoryWrites,
  syllabify,
  UNVERIFIED_CONFIDENCE_CEILING,
  verifyQuote,
  type DistillPayload,
  type IsoWeekday,
  type MemoryPlanInput,
  type PromiseCandidate,
  type PromiseMergeContext,
} from '@/lib/nina/memory'
import { describe, expect, it } from 'vitest'

/**
 * Phase 5's pure half. **No fake of any kind** — `lib/nina/memory.ts` imports zod and three type
 * declarations, so every rule this phase makes is assertable with a plain function call. The
 * impure shell is `tests/nina.distill.test.ts`.
 */

/* ============================================================================
 * §1 The vocabulary
 * ==========================================================================*/

describe('the slot vocabulary is closed and agrees with phase 1', () => {
  it('contains phase 1’s one declared key, and every spec is keyed by its own key', () => {
    expect(NINA_SLOT_KEYS).toContain(NINA_SLOT_PENDING_PROMISES)
    expect(NINA_SLOT_KEYS).toHaveLength(9)
    for (const key of NINA_SLOT_KEYS) {
      expect(NINA_SLOT_SPECS[key].key).toBe(key)
      expect(isNinaSlotKey(key)).toBe(true)
    }
    expect(isNinaSlotKey('favourite_colour')).toBe(false)
  })
})

/* ============================================================================
 * §2 parseRunningDays — the phrasings a runner actually types
 * ==========================================================================*/

describe('parseRunningDays', () => {
  const cases: Array<[string, readonly IsoWeekday[]]> = [
    ['Selasa, Kamis, Sabtu, Minggu', [2, 4, 6, 7]],
    ['selasa kamis sabtu dan minggu', [2, 4, 6, 7]],
    ['tue, thu, sat, sun', [2, 4, 6, 7]],
    ['tuesdays and thursdays', [2, 4]],
    ['gw biasanya lari selasa sama kamis', [2, 4]],
    ['Senin sampe Jumat', [1, 2, 3, 4, 5]],
    ['Selasa-Kamis', [2, 3, 4]],
    ['Senin s/d Jumat', [1, 2, 3, 4, 5]],
    ['Sabtu sampe Senin', [1, 6, 7]],
    ['tiap hari', [1, 2, 3, 4, 5, 6, 7]],
    ['daily', [1, 2, 3, 4, 5, 6, 7]],
  ]

  for (const [text, expected] of cases) {
    it(`reads ${JSON.stringify(text)} as ${JSON.stringify(expected)}`, () => {
      expect(parseRunningDays(text)).toEqual(expected)
    })
  }

  it('refuses a negation rather than misremembering which six days he meant', () => {
    expect(parseRunningDays('tiap hari kecuali senin')).toEqual([])
    expect(parseRunningDays('semua hari selain minggu')).toEqual([])
  })

  it('returns nothing for prose that names no day', () => {
    expect(parseRunningDays('kapan aja')).toEqual([])
    expect(parseRunningDays('')).toEqual([])
    expect(parseRunningDays(null)).toEqual([])
    expect(parseRunningDays(undefined)).toEqual([])
  })

  it('round-trips through formatRunningDays — ruling (b), asserted rather than hoped', () => {
    for (const [, expected] of cases) {
      expect(parseRunningDays(formatRunningDays(expected))).toEqual(expected)
    }
  })

  it('gives phase 10 the JS-weekday view of the same parse', () => {
    expect(parseRunningDaysAsJsWeekday('Minggu, Senin')).toEqual([0, 1])
    expect(parseRunningDaysAsJsWeekday('Sabtu')).toEqual([6])
  })

  it('canonicalises the slot value through the parser, or refuses it', () => {
    const spec = NINA_SLOT_SPECS.running_days
    expect(spec.canonicalise('senin sampe jumat')).toBe('Senin, Selasa, Rabu, Kamis, Jumat')
    expect(spec.canonicalise('kapan aja')).toBeNull()
  })
})

/* ============================================================================
 * §3 parseWorkHours
 * ==========================================================================*/

describe('parseWorkHours', () => {
  it('applies the PM heuristic to an unqualified second time', () => {
    expect(parseWorkHours('jam 8 sampe jam 5')).toEqual({ startMinute: 480, endMinute: 1020 })
  })

  it('reads explicit meridiems and 24-hour clocks', () => {
    expect(parseWorkHours('9am to 6pm')).toEqual({ startMinute: 540, endMinute: 1080 })
    expect(parseWorkHours('08:00-17:00')).toEqual({ startMinute: 480, endMinute: 1020 })
  })

  it('requires a qualifier, so a distance is never read as a clock time', () => {
    expect(parseWorkHours('lari 10 km terus ngantor')).toBeNull()
  })

  it('round-trips through formatWorkHours', () => {
    for (const hours of [
      { startMinute: 480, endMinute: 1020 },
      { startMinute: 540, endMinute: 1080 },
      { startMinute: 0, endMinute: 480 },
    ]) {
      expect(parseWorkHours(formatWorkHours(hours))).toEqual(hours)
    }
  })
})

/* ============================================================================
 * §4 The name — R7
 * ==========================================================================*/

describe('syllabify', () => {
  it('splits Indonesian words the textbook way, digraphs kept whole', () => {
    expect(syllabify('miftahul')).toEqual(['mif', 'ta', 'hul'])
    expect(syllabify('mahfuzh')).toEqual(['mah', 'fuzh'])
    expect(syllabify('santoso')).toEqual(['san', 'to', 'so'])
    expect(syllabify('nggak')).toEqual(['nggak'])
  })
})

describe('deriveNicknameCandidates', () => {
  it('offers BOTH forms the runner used about himself — mif and tah', () => {
    const candidates = deriveNicknameCandidates('Miftahul Mahfuzh')
    expect(candidates).toEqual(['mif', 'tah', 'hul', 'mah'])
    /* The ask offers the first two, so these two must come out first, and do. */
    expect(candidates.slice(0, 2)).toEqual(['mif', 'tah'])
  })

  it('clips the first subword and adds the last subword’s first syllable', () => {
    expect(deriveNicknameCandidates('Budi Santoso')).toEqual(['bud', 'di', 'san'])
    expect(deriveNicknameCandidates('Sukarno')).toEqual(['suk', 'kar', 'no'])
  })

  it('skips name particles and answers nothing for no name', () => {
    const candidates = deriveNicknameCandidates('Ahmad bin Yusuf')
    expect(candidates).toEqual(['ah', 'mad', 'yus'])
    expect(candidates).not.toContain('bin')
    expect(deriveNicknameCandidates(null)).toEqual([])
    expect(deriveNicknameCandidates('')).toEqual([])
  })
})

describe('canonicaliseNickname', () => {
  it('takes one short lowercase word, or nothing', () => {
    expect(canonicaliseNickname('Mif')).toBe('mif')
    expect(canonicaliseNickname('mif aja')).toBe('mif')
    expect(canonicaliseNickname('m')).toBeNull()
    /* Documented: this IS what the canonicaliser returns for a sentence. What stops it landing in
     * the slot is the caller's quote gate in §7, not this function. */
    expect(canonicaliseNickname('panggil gw apa aja')).toBe('panggil')
  })
})

describe('nameSlotValue', () => {
  it('offers two candidates while the first conversation is still running', () => {
    const value = nameSlotValue({
      fullName: 'Miftahul Mahfuzh',
      nickname: null,
      messageCount: 3,
    })
    expect(value).toContain('mif atau tah')
  })

  it('collapses to the bare full name once he has answered', () => {
    expect(nameSlotValue({ fullName: 'Miftahul Mahfuzh', nickname: 'mif', messageCount: 3 })).toBe(
      'Miftahul Mahfuzh',
    )
  })

  it('stops asking once the first conversation is over', () => {
    expect(nameSlotValue({ fullName: 'Miftahul Mahfuzh', nickname: null, messageCount: 40 })).toBe(
      'Miftahul Mahfuzh',
    )
  })

  it('has nothing to say when the provider gave no name', () => {
    expect(nameSlotValue({ fullName: null, nickname: null, messageCount: 1 })).toBeNull()
  })
})

/* ============================================================================
 * §5 verifyQuote — ruling (d)
 * ==========================================================================*/

describe('verifyQuote', () => {
  it('refuses a needle too short to mean anything', () => {
    expect(verifyQuote('gw', 'gw lari pagi tadi')).toBe(false)
  })

  it('ignores case and whitespace differences on both sides', () => {
    expect(verifyQuote('LARI   PAGI', 'gw lari pagi tadi')).toBe(true)
    expect(verifyQuote('lari pagi', 'gw  LARI\n pagi tadi')).toBe(true)
  })

  it('refuses a claim that is not in his message', () => {
    expect(verifyQuote('gw pindah ke Bandung', 'gw lari pagi tadi')).toBe(false)
  })
})

/* ============================================================================
 * §6 planMemoryWrites — every rule this phase makes
 * ==========================================================================*/

const RUNNER_TEXT =
  'gw biasanya lari selasa, kamis, sabtu sama minggu. lagi siapin half marathon bulan depan.'

function planInput(overrides: Partial<MemoryPlanInput> = {}): MemoryPlanInput {
  return {
    runnerText: RUNNER_TEXT,
    sourceMessageId: 'm1',
    memoryWrites: [],
    distilled: null,
    existingSlotSources: new Map(),
    currentPromises: null,
    identity: { fullName: 'Miftahul Mahfuzh', nickname: null, messageCount: 4 },
    promiseCtx: promiseCtx(),
    ...overrides,
  }
}

function promiseCtx(): PromiseMergeContext {
  let n = 0
  return {
    todayISO: '2026-09-04',
    sourceMessageId: 'm1',
    newId: () => `p${(n += 1)}`,
  }
}

const FIXTURE_PAYLOAD: DistillPayload = {
  facts: [
    {
      text: 'Dia biasanya lari Selasa, Kamis, Sabtu dan Minggu.',
      category: 'training',
      confidence: 100,
      quote: 'gw biasanya lari selasa, kamis, sabtu sama minggu',
      slotKey: 'running_days',
    },
    {
      text: 'Dia lagi siapin half marathon bulan depan.',
      category: 'goal',
      confidence: 95,
      quote: 'lagi siapin half marathon bulan depan',
      slotKey: 'goals',
    },
  ],
}

describe('planMemoryWrites — the fixture conversation', () => {
  const plan = planMemoryWrites(planInput({ distilled: FIXTURE_PAYLOAD }))

  it('appends one ledger row per distilled statement, categorised by its slot', () => {
    expect(plan.facts).toEqual([
      {
        category: 'training',
        text: 'Dia biasanya lari Selasa, Kamis, Sabtu dan Minggu.',
        confidence: 100,
        sourceMessageId: 'm1',
      },
      {
        category: 'goal',
        text: 'Dia lagi siapin half marathon bulan depan.',
        confidence: 95,
        sourceMessageId: 'm1',
      },
    ])
  })

  it('upserts running_days CANONICALISED, goals verbatim, and the name hint', () => {
    expect(plan.slots.map((slot) => slot.key)).toEqual(['running_days', 'goals', 'name'])
    expect(plan.slots[0]!.value).toBe('Selasa, Kamis, Sabtu, Minggu')
    expect(plan.slots[1]!.value).toBe('Dia lagi siapin half marathon bulan depan.')
    expect(plan.slots[2]!.value).toContain('mif atau tah')
    expect(plan.slots.every((slot) => slot.source === 'distilled')).toBe(true)
    expect(plan.demoted).toEqual([])
    expect(plan.deferred).toEqual([])
  })

  it('never writes a ledger row for the name slot — it is bookkeeping, not something he said', () => {
    expect(plan.facts.some((fact) => fact.text.includes('Miftahul'))).toBe(false)
  })
})

describe('planMemoryWrites — the contradiction', () => {
  it('replaces the slot and leaves BOTH ledger rows', () => {
    const first = planMemoryWrites(planInput({ distilled: FIXTURE_PAYLOAD }))
    const second = planMemoryWrites(
      planInput({
        runnerText: 'gw ganti, sekarang senin rabu jumat',
        sourceMessageId: 'm2',
        distilled: {
          facts: [
            {
              text: 'Sekarang dia lari Senin, Rabu, Jumat.',
              category: 'training',
              confidence: 100,
              quote: 'sekarang senin rabu jumat',
              slotKey: 'running_days',
            },
          ],
        },
      }),
    )

    const replaced = second.slots.find((slot) => slot.key === 'running_days')
    expect(replaced?.value).toBe('Senin, Rabu, Jumat')

    /* Two plans, two ledger rows, and neither plan carries anything that removes the other's. */
    expect(first.facts).toHaveLength(2)
    expect(second.facts).toHaveLength(1)
    expect(first.facts[0]!.sourceMessageId).toBe('m1')
    expect(second.facts[0]!.sourceMessageId).toBe('m2')
    expect(second.facts[0]!.text).toBe('Sekarang dia lari Senin, Rabu, Jumat.')
  })
})

describe('planMemoryWrites — ruling (c), the admin rows', () => {
  it('defers a replace-policy slot a human owns, and STILL records the statement', () => {
    const plan = planMemoryWrites(
      planInput({
        distilled: FIXTURE_PAYLOAD,
        existingSlotSources: new Map([['running_days', 'admin']]),
      }),
    )
    expect(plan.slots.map((slot) => slot.key)).not.toContain('running_days')
    expect(plan.deferred).toEqual([{ key: 'running_days', reason: 'admin-owned' }])
    expect(plan.facts[0]!.text).toBe('Dia biasanya lari Selasa, Kamis, Sabtu dan Minggu.')
  })

  it('writes a merge-policy slot back with a STICKY admin source, keeping the admin entry', () => {
    const adminEntry: NinaPendingPromise = {
      id: 'admin-1',
      text: 'gw traktir kopi',
      condition: 'kalau lo lari 50k bulan ini',
      metric: 'distance_km_total',
      target: 50,
      targetKey: null,
      byDate: null,
      promisedOn: '2026-08-01',
      sourceMessageId: null,
      status: 'pending',
      resolvedOn: null,
    }
    const plan = planMemoryWrites(
      planInput({
        runnerText: 'kalo gw lari 10k besok lo ganti foto profil ya',
        existingSlotSources: new Map([['pending_promises', 'admin']]),
        currentPromises: { promises: [adminEntry] },
        distilled: {
          promises: [
            {
              text: 'gw ganti foto profil',
              condition: 'kalau lo lari 10k besok',
              metric: 'distance_km_total',
              target: 10,
              quote: 'kalo gw lari 10k besok',
            },
          ],
        },
      }),
    )

    const slot = plan.slots.find((s) => s.key === 'pending_promises')
    expect(slot?.source).toBe('admin')
    const promises = (slot?.value as { promises: NinaPendingPromise[] }).promises
    expect(promises.map((entry) => entry.id)).toEqual(['admin-1', 'p1'])
    expect(plan.deferred).toEqual([])
  })
})

describe('planMemoryWrites — ruling (d), the quote gate', () => {
  it('records an unverified claim at the ceiling and refuses it as a slot', () => {
    const plan = planMemoryWrites(
      planInput({
        distilled: {
          facts: [
            {
              text: 'Dia pindah ke Bandung.',
              category: 'life',
              confidence: 100,
              quote: 'gw pindah ke Bandung',
              slotKey: 'goals',
            },
          ],
        },
      }),
    )
    expect(plan.slots.map((slot) => slot.key)).toEqual(['name'])
    expect(plan.facts[0]!.confidence).toBe(UNVERIFIED_CONFIDENCE_CEILING)
    expect(plan.demoted).toEqual([{ key: 'goals', reason: 'unverified-quote' }])
  })

  it('records a low-confidence reading and refuses it as a slot', () => {
    const plan = planMemoryWrites(
      planInput({
        runnerText: 'sepatu gw udah tipis banget',
        distilled: {
          facts: [
            {
              text: 'Sepatunya mungkin Nike.',
              category: 'training',
              confidence: 60,
              quote: 'sepatu gw udah tipis banget',
              slotKey: 'gear',
            },
          ],
        },
      }),
    )
    expect(plan.slots.map((slot) => slot.key)).toEqual(['name'])
    expect(plan.facts[0]!.confidence).toBe(60)
    expect(plan.demoted).toEqual([{ key: 'gear', reason: 'low-confidence' }])
  })

  it('records a fact under a key it does not know, and coins no slot for it', () => {
    const plan = planMemoryWrites(
      planInput({
        runnerText: 'warna favorit gw ijo',
        distilled: {
          facts: [
            {
              text: 'Warna favoritnya hijau.',
              category: 'preference',
              confidence: 100,
              quote: 'warna favorit gw ijo',
              slotKey: 'favourite_colour',
            },
          ],
        },
      }),
    )
    expect(plan.slots.map((slot) => slot.key)).toEqual(['name'])
    expect(plan.facts[0]!.category).toBe('preference')
    expect(plan.demoted).toEqual([{ key: 'favourite_colour', reason: 'unknown-key' }])
  })

  it('lets HER structured assertions past the quote gate — phase 3’s trust level, preserved', () => {
    const plan = planMemoryWrites(
      planInput({
        runnerText: 'pagi',
        memoryWrites: [{ kind: 'slot', slotKey: 'gear', text: 'Nike Pegasus 41' }],
      }),
    )
    const gear = plan.slots.find((slot) => slot.key === 'gear')
    expect(gear?.value).toBe('Nike Pegasus 41')
    expect(plan.facts[0]).toMatchObject({ category: 'training', text: 'Nike Pegasus 41' })
  })
})

/* ============================================================================
 * §7 pending_promises — the shape phase 13 evaluates
 * ==========================================================================*/

function promiseCandidate(overrides: Partial<PromiseCandidate> = {}): PromiseCandidate {
  return {
    text: 'gw ganti foto profil',
    condition: 'kalau lo lari 10k besok',
    metric: 'distance_km_total',
    target: 10,
    quote: 'kalo gw lari 10k besok',
    ...overrides,
  }
}

function pendingEntry(id: string, promisedOn: string, status: NinaPendingPromise['status']) {
  return {
    id,
    text: `janji ${id}`,
    condition: `kondisi ${id}`,
    metric: 'free',
    target: null,
    targetKey: null,
    byDate: null,
    promisedOn,
    sourceMessageId: null,
    status,
    resolvedOn: status === 'pending' ? null : promisedOn,
  } satisfies NinaPendingPromise
}

describe('mergePendingPromises', () => {
  it('rejects a candidate whose metric and target disagree, and the plan records it', () => {
    const merged = mergePendingPromises(
      null,
      [promiseCandidate({ metric: 'record', target: 10, targetKey: null })],
      promiseCtx(),
    )
    expect(merged.slot.promises).toEqual([])
    expect(merged.rejected).toHaveLength(1)

    const plan = planMemoryWrites(
      planInput({
        runnerText: 'kalo gw lari 10k besok lo ganti foto profil ya',
        distilled: { promises: [promiseCandidate({ metric: 'record', target: 10 })] },
      }),
    )
    expect(plan.slots.map((slot) => slot.key)).toEqual(['name'])
    expect(plan.demoted).toEqual([{ key: 'pending_promises', reason: 'bad-promise-shape' }])
    expect(plan.facts[0]!.text).toBe('gw ganti foto profil (kalau lo lari 10k besok)')
  })

  it('treats a restatement of the same open promise as one entry', () => {
    const merged = mergePendingPromises(
      null,
      [promiseCandidate(), promiseCandidate({ text: 'beneran gw ganti fotonya' })],
      promiseCtx(),
    )
    expect(merged.slot.promises).toHaveLength(1)
  })

  it('drops RESOLVED entries first when the cap is reached, and no pending one is lost', () => {
    const current = {
      promises: [
        ...Array.from({ length: 9 }, (_, i) => pendingEntry(`open${i}`, '2026-08-10', 'pending')),
        pendingEntry('done0', '2026-07-01', 'met'),
        pendingEntry('done1', '2026-07-02', 'met'),
        pendingEntry('done2', '2026-07-03', 'expired'),
      ],
    }
    const merged = mergePendingPromises(current, [promiseCandidate()], promiseCtx())
    const kept = merged.slot.promises
    expect(kept).toHaveLength(12)
    /* Every pending entry survived, including the new one; the oldest resolved one went. */
    expect(kept.filter((entry) => entry.status === 'pending')).toHaveLength(10)
    expect(kept.map((entry) => entry.id)).not.toContain('done0')
    expect(kept.map((entry) => entry.id)).toContain('p1')
  })

  it('drops resolved entries entirely before it will drop a pending one', () => {
    /*
     * The plan's case 35 said "12 pending + 3 resolved + 1 new -> no pending entry is dropped".
     * With a cap of 12 that cannot hold: thirteen pending promises do not fit in twelve slots.
     * What the algorithm actually guarantees, and what is asserted here, is the ORDER — every
     * resolved entry goes before any pending one does, and only the OLDEST pending is then lost.
     */
    const current = {
      promises: [
        ...Array.from({ length: 12 }, (_, i) =>
          pendingEntry(
            `open${String(i).padStart(2, '0')}`,
            `2026-08-${String(i + 1).padStart(2, '0')}`,
            'pending',
          ),
        ),
        pendingEntry('done0', '2026-07-01', 'met'),
        pendingEntry('done1', '2026-07-02', 'met'),
        pendingEntry('done2', '2026-07-03', 'expired'),
      ],
    }
    const kept = mergePendingPromises(current, [promiseCandidate()], promiseCtx()).slot.promises
    expect(kept).toHaveLength(12)
    expect(kept.every((entry) => entry.status === 'pending')).toBe(true)
    expect(kept.map((entry) => entry.id)).not.toContain('open00')
    expect(kept.map((entry) => entry.id)).toContain('p1')
  })

  it('builds an entry phase 13 can evaluate: metric decides which target field is set', () => {
    const merged = mergePendingPromises(null, [promiseCandidate()], promiseCtx())
    expect(merged.slot.promises[0]).toEqual({
      id: 'p1',
      text: 'gw ganti foto profil',
      condition: 'kalau lo lari 10k besok',
      metric: 'distance_km_total',
      target: 10,
      targetKey: null,
      byDate: null,
      promisedOn: '2026-09-04',
      sourceMessageId: 'm1',
      status: 'pending',
      resolvedOn: null,
    })
  })
})
