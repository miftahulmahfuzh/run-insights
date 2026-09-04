import { z } from 'zod'

import type {
  NinaFactCategory,
  NinaMemorySource,
  NinaPendingPromise,
  NinaPendingPromisesSlot,
  NinaPromiseMetric,
  NinaSlotValue,
} from '@/lib/db/schema'

import type { NinaMemoryWrite } from './schema'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  R4 — the memory, distilled. THE PURE HALF.
 *
 *  RU-6 is two tables and this file is the reading of them:
 *
 *    nina_memory_slots  — "what is true now". One row per (user, key), OVERWRITTEN in place.
 *                         Pre-injected on every turn (RU-4) and QUERIED by the evening cron
 *                         (phase 10), so a slot that is wrong is wrong in every conversation
 *                         until it is corrected, and a slot the cron cannot parse is a slot the
 *                         cron cannot act on.
 *    nina_memory_facts  — "what has he ever told me". APPEND-ONLY. The colour.
 *
 *  ── THE ONE RULE THAT MAKES "PERMANENTLY" TRUE ──────────────────────────────────────────────
 *  A slot upsert is always PRECEDED by the ledger append of the same statement, and the ledger
 *  append is unconditional. So:
 *
 *    - a contradiction REPLACES the slot and leaves BOTH ledger rows, which is what lets her say
 *      "lo bilang benci lari pagi bulan lalu" three months after the slot moved on;
 *    - a slot write this file refuses (bad vocabulary, unparseable value, an admin-owned row)
 *      still lands as a fact, so a refusal is never a loss;
 *    - every fact carries `source_message_id`, so if the slot logic in this file is later found
 *      wrong, the whole distillation is RE-DERIVABLE from the raw conversation. That is the
 *      difference between a memory and a summary.
 *
 *  ── AND THE ONE RULE THAT KEEPS IT HONEST ───────────────────────────────────────────────────
 *  A slot is written only when he ACTUALLY SAID the thing (§6's quote gate, and
 *  SLOT_CONFIDENCE_FLOOR). An inferred slot is a fabricated memory she will then confidently act
 *  on for months. Confidence lives on the ledger row and nowhere else; a low-confidence fact is
 *  recorded and never promoted.
 *
 *  ── WHY THIS FILE IS PURE ───────────────────────────────────────────────────────────────────
 *  No `server-only`, no database import, no clock, no model. Invariant 6: everything worth
 *  testing is a pure function in lib/. `lib/nina/distill.ts` is the thin impure shell — the same
 *  split, for the same reason, as phase 2's context.ts / load.ts.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ============================================================================
 * §2 Weekdays — the `running_days` slot, and the parser phases 9 and 10 share
 * ==========================================================================*/

/**
 * **ISO 8601 weekday: 1 = Monday … 7 = Sunday.** This is the convention phase 9's
 * `PatternInput.usualRunningDays` declares, and phase 9 was explicit that the conversion belongs
 * here rather than in the module that judges him for missing a day.
 */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** `Date.prototype.getUTCDay()`'s convention: 0 = Sunday … 6 = Saturday. Phase 10's `Weekday`. */
export type JsWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** ISO -> JS. The whole difference between the two conventions, in one expression. */
export function isoToJsWeekday(day: IsoWeekday): JsWeekday {
  return (day === 7 ? 0 : day) as JsWeekday
}

/** The canonical display spelling. Indonesian, because that is the register she writes in. */
export const WEEKDAY_ID: Readonly<Record<IsoWeekday, string>> = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
  7: 'Minggu',
}

/** Exported for a caller that wants the English rendering; nothing in this phase uses it. */
export const WEEKDAY_EN_SHORT: Readonly<Record<IsoWeekday, string>> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}

/**
 * Every token that names a day, in both languages this app speaks, plus the clipped forms an
 * Indonesian actually types. **Exact-token matching, never prefixes:** `sun`/`senin` and
 * `min`/`mon` are one letter apart, and prefix matching gets them wrong in a way no test notices
 * until a Tuesday nag arrives on a Sunday.
 */
const DAY_TOKENS: Readonly<Record<string, IsoWeekday>> = {
  senin: 1,
  sen: 1,
  monday: 1,
  mon: 1,
  selasa: 2,
  sel: 2,
  tuesday: 2,
  tue: 2,
  tues: 2,
  rabu: 3,
  rab: 3,
  wednesday: 3,
  wed: 3,
  kamis: 4,
  kam: 4,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  jumat: 5,
  jumaat: 5,
  jumah: 5,
  jum: 5,
  friday: 5,
  fri: 5,
  sabtu: 6,
  sab: 6,
  saturday: 6,
  sat: 6,
  minggu: 7,
  min: 7,
  ahad: 7,
  sunday: 7,
  sun: 7,
}

/**
 * A token that turns two day tokens into an inclusive range. `"Senin sampe Jumat"` names five
 * days and not two, and a parser that returned `[1, 5]` for it would disable Tuesday, Wednesday
 * and Thursday silently — the single most likely phrasing for someone who runs before work.
 *
 * `ke` is deliberately NOT here. It is a range word in `"senin ke jumat"` and a preposition in
 * half of all Indonesian sentences, and a false range is worse than a missed one.
 */
const RANGE_TOKENS: ReadonlySet<string> = new Set([
  'sampai',
  'sampe',
  'hingga',
  'sd',
  'to',
  'through',
  'thru',
  'til',
  'till',
  'until',
])

/**
 * A token that inverts the meaning of every day named after it. `"tiap hari kecuali senin"` names
 * six days, and this parser cannot work out which six — so it returns `[]` and the trigger that
 * depends on the slot switches off. **Refusing to answer is the policy**: a nag built on a guess
 * about which days he runs is a friend confidently misremembering, which is the one failure this
 * whole feature cannot afford.
 */
const NEGATION_TOKENS: ReadonlySet<string> = new Set([
  'kecuali',
  'selain',
  'bukan',
  'tanpa',
  'ga',
  'gak',
  'nggak',
  'engga',
  'enggak',
  'tidak',
  'tak',
  'except',
  'without',
  'minus',
  'not',
  'no',
])

/** `"tiap hari"`, `"daily"`, `"every day"` — the answer is all seven, and it is a real answer. */
const EVERY_DAY_PATTERN =
  /\b(?:tiap|setiap)\s+hari\b|\bharian\b|\bevery\s*day\b|\beveryday\b|\bdaily\b/

const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

type DayItem = { readonly kind: 'day'; readonly day: IsoWeekday } | { readonly kind: 'range' }

/**
 * Dashes and slashes are range markers that the letters-only tokeniser below would throw away, so
 * they are rewritten to a word before tokenising. `"Selasa-Kamis"` and `"Senin s/d Jumat"` both
 * become `"… sampai …"`; the stray `s` and `d` fall out as unrecognised tokens, which is exactly
 * what should happen to them.
 */
function normaliseDayText(value: string): string {
  return value.toLowerCase().replace(/\s*(?:[–—]|-{1,2}|\/)\s*/g, ' sampai ')
}

/**
 * The `running_days` slot value, parsed. The slot stores DISPLAY text (RU-6, and phase 2's
 * `MemorySlotInput` says so) — `"Selasa, Kamis, Sabtu, Minggu"`, or whatever week-one text phase
 * 3's verbatim sink or phase 16's admin editor put there. This turns it into weekday numbers.
 *
 * **The round trip is guaranteed in the WRITER, not here.** Every write this phase makes goes
 * through `formatRunningDays(parseRunningDays(raw))` (see `NINA_SLOT_SPECS`), so a stored value is
 * always the canonical rendering of a parsed set and `parseRunningDays` of it returns that set
 * back. `tests/nina.memory.test.ts` asserts the round trip rather than assuming it.
 *
 * Returns sorted and deduplicated, so two identical states produce two identical prompts and one
 * identical trigger decision.
 */
export function parseRunningDays(value: string | null | undefined): readonly IsoWeekday[] {
  if (!value) return []
  const text = normaliseDayText(value)

  /* Negation first: it invalidates everything after it and there is nothing to salvage. */
  for (const raw of text.split(/[^a-z]+/)) {
    if (raw && NEGATION_TOKENS.has(raw)) return []
  }

  if (EVERY_DAY_PATTERN.test(text)) return ISO_WEEKDAYS

  const items: DayItem[] = []
  for (const raw of text.split(/[^a-z]+/)) {
    if (!raw) continue
    /* Exact match, then one attempt with a plural `s` removed — `"tuesdays and thursdays"` is a
     * real phrasing and `"tuesdays"` is not a day name. Nothing else is stripped. */
    const day = DAY_TOKENS[raw] ?? (raw.endsWith('s') ? DAY_TOKENS[raw.slice(0, -1)] : undefined)
    if (day !== undefined) {
      items.push({ kind: 'day', day })
    } else if (RANGE_TOKENS.has(raw)) {
      items.push({ kind: 'range' })
    }
  }

  const found = new Set<IsoWeekday>()
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (item === undefined || item.kind !== 'day') continue
    found.add(item.day)

    const marker = items[i + 1]
    const end = items[i + 2]
    if (marker?.kind !== 'range' || end?.kind !== 'day') continue
    /* Inclusive, walking forward in ISO order and WRAPPING, so "Sabtu sampe Senin" is
     * {6, 7, 1} and not an empty set. Bounded at seven steps by construction. */
    let cursor = item.day
    for (let step = 0; step < 7; step += 1) {
      cursor = (cursor === 7 ? 1 : cursor + 1) as IsoWeekday
      found.add(cursor)
      if (cursor === end.day) break
    }
  }

  return [...found].sort((a, b) => a - b)
}

/**
 * Phase 10's view of the same parse. **One token table, one range expander, one negation rule,
 * two typed views** — the whole point of ruling (a). Phase 10 keeps its `Weekday` type and its
 * `jakartaWeekdayOf`, and deletes its own copy of everything above.
 */
export function parseRunningDaysAsJsWeekday(
  value: string | null | undefined,
): readonly JsWeekday[] {
  return parseRunningDays(value)
    .map(isoToJsWeekday)
    .sort((a, b) => a - b)
}

/**
 * The canonical rendering, and therefore the only thing this phase ever stores in the slot.
 * `[2, 4, 6, 7]` -> `"Selasa, Kamis, Sabtu, Minggu"`. Display-ready for the prompt, and parseable
 * back by the cron.
 */
export function formatRunningDays(days: readonly IsoWeekday[]): string {
  return [...new Set(days)]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_ID[day])
    .join(', ')
}

/* ============================================================================
 * §3 Work hours — the second machine-readable slot
 * ==========================================================================*/

/** Minutes from Jakarta midnight, both ends. The smallest sensible unit, per the roadmap. */
export interface WorkHours {
  startMinute: number
  endMinute: number
}

/**
 * Requires a QUALIFIER — a leading `jam`, an explicit `:mm`, or a meridiem word — before it will
 * believe a bare number is a time. Without that rule `"lari 10 km terus ngantor"` parses `10` as
 * ten o'clock, and the slot then claims he starts work at 10:00 forever.
 */
const TIME_PATTERN = /(jam\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|pagi|siang|sore|malam)?/gi

function minutesOf(hour: number, minute: number, meridiem: string | undefined): number | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  let h = hour
  switch (meridiem?.toLowerCase()) {
    case 'pm':
    case 'sore':
    case 'malam':
      if (h < 12) h += 12
      break
    case 'siang':
      /* `siang` is roughly 11:00-15:00, so a small number under it is afternoon. */
      if (h < 11) h += 12
      break
    case 'am':
    case 'pagi':
      if (h === 12) h = 0
      break
    default:
      break
  }
  if (h > 23) return null
  return h * 60 + minute
}

/**
 * `"jam 8 sampe jam 5"`, `"08:00-17:00"`, `"9am to 6pm"` -> `{ startMinute, endMinute }`.
 *
 * **The one heuristic, stated so nobody has to guess it later:** if the second time is not later
 * than the first AND carried no meridiem of its own, twelve hours are added to it exactly once.
 * `"jam 8 sampe jam 5"` is a working day and not a negative-length one, and this is the only way
 * to read it. If it is still not later, the value is REFUSED (`null`) — a shift that crosses
 * midnight is a real thing and this parser is not the place to guess at one.
 */
export function parseWorkHours(value: string | null | undefined): WorkHours | null {
  if (!value) return null
  const found: { minutes: number; hadMeridiem: boolean }[] = []

  for (const match of value.matchAll(TIME_PATTERN)) {
    const [, jam, hourText, minuteText, meridiem] = match
    const qualified = jam !== undefined || minuteText !== undefined || meridiem !== undefined
    if (!qualified) continue
    const minutes = minutesOf(
      Number(hourText),
      minuteText === undefined ? 0 : Number(minuteText),
      meridiem,
    )
    if (minutes === null) continue
    found.push({ minutes, hadMeridiem: meridiem !== undefined })
    if (found.length === 2) break
  }

  const start = found[0]
  const end = found[1]
  if (start === undefined || end === undefined) return null

  let endMinute = end.minutes
  if (endMinute <= start.minutes && !end.hadMeridiem) endMinute += 12 * 60
  if (endMinute <= start.minutes || endMinute > 24 * 60) return null

  return { startMinute: start.minutes, endMinute }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function clockOf(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`
}

/** The canonical rendering, and therefore the only thing stored. `"08:00–17:00"`, en dash. */
export function formatWorkHours(hours: WorkHours): string {
  return `${clockOf(hours.startMinute)}–${clockOf(hours.endMinute)}`
}

/* ============================================================================
 * §4 His name — R7 and RU-8
 * ==========================================================================*/

/**
 * ── HOW AN INDONESIAN NICKNAME IS ACTUALLY MADE ────────────────────────────────────────────────
 * It is a CLIPPED SYLLABLE of the given name, not a prefix of it. The user's own two examples are
 * both from the first subword of `Miftahul Mahfuzh`:
 *
 *     mif-ta-hul   ->   "mif"  (the first syllable)
 *                  ->   "tah"  (the second, closed with the following consonant)
 *
 * A `slice(0, 3)` produces `mif` and never `tah`, which is why this file syllabifies. He used both
 * forms in his own examples ("pagi mif", "lo kemaren kemana tah"), so both must be offerable.
 *
 * ── AND WHY THE FUNCTION PROPOSES INSTEAD OF PICKING ──────────────────────────────────────────
 * Phase 2's `NAME_RULES` already tells her: *"Do not invent a nickname from runner.fullName
 * yourself."* That rule is right — being called the wrong clipped syllable by a stranger is worse
 * than being asked. So this returns a CANDIDATE LIST, she offers the first two, and the answer he
 * gives is what becomes the slot. Nothing here ever writes `nickname` on its own.
 */
const VOWELS: ReadonlySet<string> = new Set(['a', 'e', 'i', 'o', 'u'])

/** Two letters that are one Indonesian consonant. They must not be split across a syllable. */
const CONSONANT_DIGRAPHS: readonly string[] = ['ng', 'ny', 'sy', 'kh']

/** Name particles that are never the source of a nickname. */
const NAME_PARTICLES: ReadonlySet<string> = new Set([
  'bin',
  'binti',
  'bt',
  'al',
  'el',
  'van',
  'de',
  'da',
  'dos',
])

interface SyllableParts {
  onset: string
  nucleus: string
  coda: string
}

function consonantUnits(chunk: string): string[] {
  const units: string[] = []
  let index = 0
  while (index < chunk.length) {
    const pair = chunk.slice(index, index + 2)
    if (CONSONANT_DIGRAPHS.includes(pair)) {
      units.push(pair)
      index += 2
      continue
    }
    units.push(chunk.charAt(index))
    index += 1
  }
  return units
}

/**
 * Indonesian syllabification, deliberately the simple textbook rule and nothing cleverer:
 * a syllable is `(onset)(vowel run)(coda)`, ONE consonant between two vowels belongs to the
 * following syllable, and a CLUSTER of two or more splits with the first consonant staying behind.
 * Digraphs count as one consonant, so `"ngga"` does not become `"n-gga"`.
 *
 *     "miftahul" -> mif · ta · hul
 *     "mahfuzh"  -> mah · fuzh
 *     "santoso"  -> san · to · so
 */
function syllableParts(word: string): SyllableParts[] {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '')
  if (letters.length === 0) return []

  /* The vowel runs, as [start, endExclusive] spans. Each one is exactly one nucleus. */
  const nuclei: { start: number; end: number }[] = []
  for (let i = 0; i < letters.length; i += 1) {
    if (!VOWELS.has(letters.charAt(i))) continue
    const last = nuclei[nuclei.length - 1]
    if (last !== undefined && last.end === i) last.end = i + 1
    else nuclei.push({ start: i, end: i + 1 })
  }
  if (nuclei.length === 0) return []

  const parts: SyllableParts[] = nuclei.map((nucleus) => ({
    onset: '',
    nucleus: letters.slice(nucleus.start, nucleus.end),
    coda: '',
  }))

  for (let k = 0; k < nuclei.length; k += 1) {
    const nucleus = nuclei[k]!
    const previousEnd = k === 0 ? 0 : nuclei[k - 1]!.end
    const chunk = letters.slice(previousEnd, nucleus.start)

    if (k === 0) {
      parts[0]!.onset = chunk
      continue
    }
    const units = consonantUnits(chunk)
    if (units.length <= 1) {
      parts[k]!.onset = units.join('')
    } else {
      parts[k - 1]!.coda = units[0]!
      parts[k]!.onset = units.slice(1).join('')
    }
  }

  parts[parts.length - 1]!.coda = letters.slice(nuclei[nuclei.length - 1]!.end)
  return parts
}

/** The syllables as strings. Exported for the test, which is the only honest way to check §4. */
export function syllabify(word: string): readonly string[] {
  return syllableParts(word).map((part) => part.onset + part.nucleus + part.coda)
}

/**
 * One syllable as a nickname would say it: **an open syllable borrows the next syllable's first
 * consonant, a closed one is already finished.** `ta` + `hul` -> `tah`; `mif` is already `mif`.
 * This one rule is the entire difference between producing `mif`/`tah` and producing `mif`/`ta`.
 */
function clippedForms(word: string): string[] {
  const parts = syllableParts(word)
  return parts.map((part, index) => {
    const base = part.onset + part.nucleus + part.coda
    if (part.coda.length > 0) return base
    const nextOnset = parts[index + 1]?.onset ?? ''
    return base + nextOnset.charAt(0)
  })
}

export const NICKNAME_CANDIDATE_LIMIT = 4

/**
 * The candidates she offers. `"Miftahul Mahfuzh"` -> `['mif', 'tah', 'hul', 'mah']`, which
 * contains both forms the user used about himself.
 *
 * Order: every clipped syllable of the FIRST subword, in order, then the first clipped syllable of
 * the LAST subword. The first two are the ones the ask offers, which is why `mif` and `tah` must
 * come out first and do.
 *
 * Two to four letters, letters only, lowercase, deduplicated. Lowercase because that is her
 * register — `NINA_IDENTITY` writes in lowercase and `"pagi Mif"` would be someone else talking.
 */
export function deriveNicknameCandidates(fullName: string | null | undefined): readonly string[] {
  if (!fullName) return []
  const subwords = fullName
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !NAME_PARTICLES.has(word))
  if (subwords.length === 0) return []

  const first = subwords[0]!
  const last = subwords[subwords.length - 1]!
  const raw = [...clippedForms(first)]
  if (last !== first) {
    const lastForm = clippedForms(last)[0]
    if (lastForm !== undefined) raw.push(lastForm)
  }

  const seen = new Set<string>()
  const candidates: string[] = []
  for (const form of raw) {
    if (form.length < 2 || form.length > 4) continue
    if (seen.has(form)) continue
    seen.add(form)
    candidates.push(form)
    if (candidates.length === NICKNAME_CANDIDATE_LIMIT) break
  }
  return candidates
}

/**
 * What may become the `nickname` slot. Returns `null` for anything that is not a single short word.
 *
 * **The slot value MUST be a bare JSON string**, because phase 1's `getNinaIdentity` returns the
 * nickname only when `typeof raw === 'string' && raw.length > 0` and would silently report "no
 * nickname" for an object. That is enforced here, at the one place a nickname is canonicalised.
 */
export function canonicaliseNickname(raw: string): string | null {
  const word = raw.toLowerCase().trim().split(/\s+/)[0] ?? ''
  const cleaned = word.replace(/[^a-z']/g, '')
  if (cleaned.length < 2 || cleaned.length > 16) return null
  return cleaned
}

/**
 * **How many messages count as "the first conversation".** Past this, she stops asking what to
 * call him and simply does without a name — asking on message forty is not warmth, it is a bot
 * that never listened. Twelve is roughly three turns of his plus her 1-4 bubbles each (RU-5).
 */
export const FIRST_CONVERSATION_MESSAGE_LIMIT = 12

export interface NameSlotInput {
  /** `users.name` as the OAuth provider gave it. */
  fullName: string | null
  /** The confirmed `nickname` slot, or null if she has not been told yet. */
  nickname: string | null
  /**
   * How many messages the conversation holds, both parties. **Not a `COUNT(*)`** — phase 1 exports
   * no `countNinaMessages` (RULING A2) and none is being added. The caller passes
   * `context.conversation.window.length`, which is exact below `CONTEXT_MESSAGE_WINDOW`; Step 10
   * argues why that is the right read, and `getNinaMessageWindow`'s `olderCount` is the general
   * answer if a real count is ever needed.
   */
  messageCount: number
}

/**
 * The `name` slot's value — and **the entire channel R7's confirmation travels down.**
 *
 * ── WHY A SLOT AND NOT A CONTEXT FIELD OR A PROMPT EDIT ───────────────────────────────────────
 * Slots are pre-injected on every turn (RU-4) and phase 2 renders their values verbatim into the
 * payload she reads. So putting the candidates in this slot's value gets them in front of her with
 * **no edit to phase 2's context type and no edit to any prompt** — which is what keeps this
 * phase revertable and keeps two plans off the same file. Phase 2's `NAME_RULES` already handles
 * the behaviour ("ask, once; do not invent one yourself"); this supplies the two words to offer.
 *
 * ── THE ONE ORDERING CONSEQUENCE, STATED RATHER THAN DISCOVERED ────────────────────────────────
 * Distillation runs after a turn, so on turn ONE this slot does not exist yet and she asks
 * open-endedly from `runner.fullName` ("nama lo siapa? gw panggil apa?"), exactly as
 * `NAME_RULES` instructs. From turn two the candidates are there. That is acceptable and
 * deliberate: the alternative is a pre-turn write, which means a database write in the render path
 * of the very first chat load.
 *
 * The hint DISAPPEARS the moment `nickname` is set, or once the first conversation is over —
 * which is what bounds the asking without storing an "already asked" flag anywhere.
 */
export function nameSlotValue(input: NameSlotInput): string | null {
  const fullName = input.fullName?.trim()
  if (!fullName) return null
  if (input.nickname !== null && input.nickname.length > 0) return fullName
  if (input.messageCount > FIRST_CONVERSATION_MESSAGE_LIMIT) return fullName

  const candidates = deriveNicknameCandidates(fullName)
  if (candidates.length === 0) {
    return `${fullName} — belum tau mau dipanggil apa. Tanya sekali, jangan nebak.`
  }
  const offer = candidates.slice(0, 2).join(' atau ')
  return `${fullName} — belum tau mau dipanggil apa. Tawarin: ${offer}. Jangan pakai nama panjangnya.`
}

/* ============================================================================
 * §5 The vocabulary — nine keys, and what each one may contain
 * ==========================================================================*/

/**
 * **The closed slot vocabulary.** Phase 2's prompt tells her she never coins a key, and this is
 * the list she is handed. Order is the order they are described to the distiller and the order
 * `/admin/memory` (phase 16) will naturally show them in.
 *
 * `'pending_promises'` must stay identical to phase 1's `NINA_SLOT_PENDING_PROMISES`, which
 * `tests/nina.memory.test.ts` asserts rather than trusting.
 */
export const NINA_SLOT_KEYS = [
  'name',
  'nickname',
  'running_days',
  'work_hours',
  'goals',
  'injuries',
  'food_likes',
  'gear',
  'pending_promises',
] as const

export type NinaSlotKey = (typeof NINA_SLOT_KEYS)[number]

export function isNinaSlotKey(key: string): key is NinaSlotKey {
  return (NINA_SLOT_KEYS as readonly string[]).includes(key)
}

/**
 * `'replace'` — the upsert overwrites. This is RU-6's "upserted" and it is what makes a
 *              contradiction a replacement; both ledger rows survive it.
 * `'merge'`   — the writer reads the current value and folds new entries into it. Only
 *              `pending_promises`, and the reason is ruling (c) rule 3: a merge cannot discard,
 *              so it needs no admin exception.
 */
export type SlotWritePolicy = 'replace' | 'merge'

export interface SlotSpec {
  readonly key: NinaSlotKey
  readonly policy: SlotWritePolicy
  /** The `nina_memory_facts.category` a statement about this slot also becomes. */
  readonly category: NinaFactCategory
  /**
   * Turn a model-supplied display string into the value that will be STORED, or return `null` to
   * refuse the slot write. A refusal is never a loss — §7 turns it into a ledger append.
   */
  readonly canonicalise: (raw: string) => string | null
  /** One line, verbatim, in the distiller's prompt. This is the whole spec the model gets. */
  readonly prompt: string
}

/** Collapse whitespace, trim, cap. The only transformation a prose slot gets. */
function prose(raw: string, max: number): string | null {
  const value = raw.replace(/\s+/g, ' ').trim().slice(0, max)
  return value.length === 0 ? null : value
}

export const NINA_SLOT_SPECS: Readonly<Record<NinaSlotKey, SlotSpec>> = {
  name: {
    key: 'name',
    policy: 'replace',
    category: 'person',
    canonicalise: (raw) => prose(raw, 120),
    prompt:
      'name — his full name as HE says it, plus the "what do I call you" hint. You never write this one; the app maintains it.',
  },
  nickname: {
    key: 'nickname',
    policy: 'replace',
    category: 'person',
    canonicalise: canonicaliseNickname,
    prompt:
      'nickname — the ONE short word he told you to call him. Only from him saying it. Never guessed from his full name.',
  },
  running_days: {
    key: 'running_days',
    policy: 'replace',
    category: 'training',
    /*
     * **This composition is ruling (b).** Parse first, then render the canonical form, so the
     * stored string is always something `parseRunningDays` can read back — which is what makes
     * the evening cron's "jadi ga lari selasa ini?" possible from the slot alone. Text that does
     * not parse (a range this parser refuses, a negation, prose with no day in it) yields `null`
     * and becomes a ledger fact instead of a slot the cron would act on wrongly.
     */
    canonicalise: (raw) => {
      const days = parseRunningDays(raw)
      return days.length === 0 ? null : formatRunningDays(days)
    },
    prompt:
      'running_days — the days he usually runs. Write them as day names: "Selasa, Kamis, Sabtu, Minggu". Only when he says it about his habit, not about one particular week.',
  },
  work_hours: {
    key: 'work_hours',
    policy: 'replace',
    category: 'life',
    canonicalise: (raw) => {
      const hours = parseWorkHours(raw)
      return hours === null ? null : formatWorkHours(hours)
    },
    prompt:
      'work_hours — his working day, as two clock times: "08:00-17:00". Only when he states it.',
  },
  goals: {
    key: 'goals',
    policy: 'replace',
    category: 'goal',
    canonicalise: (raw) => prose(raw, 240),
    prompt: 'goals — what he is training FOR right now. One or two sentences, his words.',
  },
  injuries: {
    key: 'injuries',
    policy: 'replace',
    category: 'body',
    canonicalise: (raw) => prose(raw, 240),
    prompt:
      'injuries — what hurts, or has hurt, and where. One or two sentences. Never a diagnosis.',
  },
  food_likes: {
    key: 'food_likes',
    policy: 'replace',
    category: 'preference',
    canonicalise: (raw) => prose(raw, 240),
    prompt: 'food_likes — what he eats, likes, avoids, or cannot eat.',
  },
  gear: {
    key: 'gear',
    policy: 'replace',
    category: 'training',
    canonicalise: (raw) => prose(raw, 240),
    prompt: 'gear — his shoes, watch, and anything he runs with.',
  },
  pending_promises: {
    key: 'pending_promises',
    policy: 'merge',
    category: 'other',
    /*
     * A string is never a promise. Promises arrive on the payload's own `promises` array as
     * structured candidates (§6) because phase 13 must be able to CHECK one against precomputed
     * facts — invariant 2 applied to a promise. Refusing the string path here means a stray
     * `slotKey: "pending_promises"` write degrades to a ledger fact instead of destroying the
     * structured slot with a sentence.
     */
    canonicalise: () => null,
    prompt: 'pending_promises — do NOT write this as text. Use the "promises" array instead.',
  },
}

/* ============================================================================
 * §6 The distiller's payload — and the quote gate
 * ==========================================================================*/

/**
 * Mirrors phase 1's `NinaFactCategory` exactly. The `satisfies` gives one half of that guarantee
 * and `_ExhaustiveCategories` gives the other, so adding an eighth category to the schema without
 * adding it here is a type error rather than a silently unreachable branch.
 */
export const NINA_FACT_CATEGORIES = [
  'person',
  'preference',
  'body',
  'life',
  'goal',
  'training',
  'other',
] as const satisfies readonly NinaFactCategory[]

type _ExhaustiveCategories =
  Exclude<NinaFactCategory, (typeof NINA_FACT_CATEGORIES)[number]> extends never ? true : never

/** The other half of the mirror above: this line stops compiling if a category goes unlisted. */
const _categoriesExhaustive: _ExhaustiveCategories = true
void _categoriesExhaustive

/** `nina_memory_facts.text` is one fact, one sentence. Matches phase 3's `NinaMemoryWrite.text`. */
export const FACT_TEXT_MAX = 400

/** Twelve is generous for one exchange and still a bound. Enforced by the schema, not by a slice. */
export const MAX_DISTILLED_CANDIDATES = 12

/** Below this a statement is recorded but never promoted to a slot. Ruling (d). */
export const SLOT_CONFIDENCE_FLOOR = 80

/** The ceiling a claim whose quote does not check out is capped to. Ruling (d). */
export const UNVERIFIED_CONFIDENCE_CEILING = 40

export const DistilledCandidateSchema = z.object({
  /** The fact, one sentence, in the language he said it in. */
  text: z.string().trim().min(1).max(FACT_TEXT_MAX),
  category: z.enum(NINA_FACT_CATEGORIES),
  /** Integer percent. 100 is "he said it outright". */
  confidence: z.number().int().min(0).max(100),
  /**
   * **The span of HIS OWN message this came from.** Not a paraphrase — a substring. This is the
   * whole quote gate: `verifyQuote` checks it really is one, and a claim that fails cannot become
   * a slot no matter what confidence it declared.
   */
  quote: z.string().trim().min(1).max(FACT_TEXT_MAX),
  /** One of `NINA_SLOT_KEYS`, when this is standing truth and not just colour. */
  slotKey: z.string().trim().min(1).max(60).optional(),
})

export type DistilledCandidate = z.infer<typeof DistilledCandidateSchema>

/**
 * One promise, as the distiller reports it. `metric` plus `target`/`targetKey` is what makes it
 * CHECKABLE by phase 13 against numbers the app already computed, rather than re-asked of a model
 * — invariant 2, applied to a promise. `'free'` is the escape hatch for one no field can decide;
 * phase 13 leaves those pending and she may ask him about it.
 */
export const PromiseCandidateSchema = z.object({
  /** Her promise in her own words, display-ready. */
  text: z.string().trim().min(1).max(300),
  /** The condition in HIS terms, display-ready — "kalau lo lari 10k besok". */
  condition: z.string().trim().min(1).max(300),
  metric: z.enum(['distance_km_total', 'run_count', 'record', 'badge', 'free']),
  target: z.number().finite().positive().nullable().optional(),
  targetKey: z.string().trim().min(1).max(60).nullable().optional(),
  /** Jakarta `'YYYY-MM-DD'`, or null for open-ended. */
  byDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  quote: z.string().trim().min(1).max(FACT_TEXT_MAX),
})

export type PromiseCandidate = z.infer<typeof PromiseCandidateSchema>

export const DistillPayloadSchema = z.object({
  facts: z.array(DistilledCandidateSchema).max(MAX_DISTILLED_CANDIDATES).optional(),
  promises: z.array(PromiseCandidateSchema).max(4).optional(),
  /**
   * Present only when he said, in this turn, what to call him. A dedicated field rather than a
   * `slotKey` because it is the one slot with a bespoke canonicaliser and a confirmation flow, and
   * because the tool schema can then describe it in one unambiguous sentence.
   */
  nickname: z.string().trim().min(1).max(40).optional(),
})

export type DistillPayload = z.infer<typeof DistillPayloadSchema>

/**
 * The issue list that goes into the repair turn. The same twelve lines as
 * `describeInsightIssues` in `lib/llm/schema.ts` and `describeNinaIssues` in phase 3's
 * `lib/nina/schema.ts`, and not imported from either: both live in modules with their own
 * concerns, and three copies of twelve obvious lines is cheaper than a shared module that has to
 * know about all three payload shapes.
 */
export function describeDistillIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.length === 0 ? '(root)' : issue.path.join('.')
      return `- ${path}: ${issue.message}`
    })
    .join('\n')
}

/** Lowercase, collapse whitespace. Both sides of the quote check get exactly this. */
function normaliseForQuote(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Did he actually say this? Ruling (d).
 *
 * A quote shorter than three characters after normalisation is refused outright: `"gw"` is a
 * substring of almost every message he will ever send and would verify anything.
 */
export function verifyQuote(quote: string, haystack: string): boolean {
  const needle = normaliseForQuote(quote)
  if (needle.length < 3) return false
  return normaliseForQuote(haystack).includes(needle)
}

/* ── pending_promises: the shape phase 13 evaluates ──────────────────────────────────────────── */

/**
 * Twelve open promises is already more than a person tracks. The cap drops RESOLVED entries first
 * (see `mergePendingPromises`) so a full slot never silences a live promise.
 */
export const MAX_PENDING_PROMISES = 12

export interface PromiseMergeContext {
  /** Jakarta `'YYYY-MM-DD'`. Passed in, never read from a clock — this file is pure. */
  todayISO: string
  /** `nina_messages.id` she said it in, or null. */
  sourceMessageId: string | null
  /** `lib/id.ts`'s `newId`, injected so a test gets deterministic ids. */
  newId: () => string
}

export interface PromiseMergeResult {
  slot: NinaPendingPromisesSlot
  /** Candidates whose metric and target did not agree. §7 turns each into a ledger fact. */
  rejected: readonly PromiseCandidate[]
}

/**
 * **`metric` decides which of `target` and `targetKey` is required, and the other must be null.**
 * A promise carrying both, or neither, cannot be evaluated — phase 13 would have to guess, and a
 * guessed promise is a broken one either way. Rejected candidates are not dropped: §7 appends them
 * to the ledger, so "he promised something" survives even when the shape did not.
 */
function normalisePromise(
  candidate: PromiseCandidate,
  ctx: PromiseMergeContext,
): NinaPendingPromise | null {
  const metric: NinaPromiseMetric = candidate.metric
  const target = candidate.target ?? null
  const targetKey = candidate.targetKey ?? null

  const needsTarget = metric === 'distance_km_total' || metric === 'run_count'
  const needsKey = metric === 'record' || metric === 'badge'

  if (needsTarget && (target === null || targetKey !== null)) return null
  if (needsKey && (targetKey === null || target !== null)) return null
  if (metric === 'free' && (target !== null || targetKey !== null)) return null

  return {
    id: ctx.newId(),
    text: candidate.text,
    condition: candidate.condition,
    metric,
    target: needsTarget ? target : null,
    targetKey: needsKey ? targetKey : null,
    byDate: candidate.byDate ?? null,
    promisedOn: ctx.todayISO,
    sourceMessageId: ctx.sourceMessageId,
    status: 'pending',
    resolvedOn: null,
  }
}

/**
 * **A merge, never a replacement — ruling (c) rule 3.** Every existing entry survives untouched,
 * including one the admin typed and one phase 13 has already resolved. New candidates are
 * appended. That is why `pending_promises` needs no admin exception: there is no path through this
 * function that discards someone else's entry.
 *
 * A candidate is treated as already known when a PENDING entry has the same metric and the same
 * condition text after normalisation — she restates a promise across bubbles constantly, and
 * three copies of one promise would make phase 13 change her avatar three times.
 *
 * The cap drops resolved and expired entries oldest-first, and only then pending ones. A slot at
 * its cap must never be the reason a live promise is forgotten.
 */
export function mergePendingPromises(
  current: NinaPendingPromisesSlot | null,
  candidates: readonly PromiseCandidate[],
  ctx: PromiseMergeContext,
): PromiseMergeResult {
  const promises: NinaPendingPromise[] = [...(current?.promises ?? [])]
  const rejected: PromiseCandidate[] = []

  const openKeys = new Set(
    promises
      .filter((entry) => entry.status === 'pending')
      .map((entry) => `${entry.metric}::${normaliseForQuote(entry.condition)}`),
  )

  for (const candidate of candidates) {
    const key = `${candidate.metric}::${normaliseForQuote(candidate.condition)}`
    if (openKeys.has(key)) continue
    const entry = normalisePromise(candidate, ctx)
    if (entry === null) {
      rejected.push(candidate)
      continue
    }
    openKeys.add(key)
    promises.push(entry)
  }

  if (promises.length > MAX_PENDING_PROMISES) {
    const closed = promises.filter((entry) => entry.status !== 'pending')
    const open = promises.filter((entry) => entry.status === 'pending')
    const overflow = promises.length - MAX_PENDING_PROMISES
    /* `promisedOn` ascending: the oldest closed promise is the least interesting row here. */
    closed.sort((a, b) => a.promisedOn.localeCompare(b.promisedOn))
    const keptClosed = closed.slice(Math.min(overflow, closed.length))
    const kept = [...keptClosed, ...open]
    return {
      slot: { promises: kept.slice(Math.max(0, kept.length - MAX_PENDING_PROMISES)) },
      rejected,
    }
  }

  return { slot: { promises }, rejected }
}

/* ============================================================================
 * §7 The plan — the one function that decides what gets written
 * ==========================================================================*/

/** One append-only ledger row, ready for `appendNinaMemoryFacts`. */
export interface PlannedFact {
  category: NinaFactCategory
  text: string
  /** Integer percent 0-100. Already capped by the quote gate where that applied. */
  confidence: number
  sourceMessageId: string | null
}

/** One slot upsert, ready for `upsertNinaMemorySlot`. */
export interface PlannedSlot {
  key: NinaSlotKey
  value: NinaSlotValue
  /**
   * `'distilled'`, except for a `merge` slot whose existing row was `'admin'` — see ruling (c)
   * rule 3. A merge preserved what the admin wrote, so relabelling the row would lie about who
   * owns it.
   */
  source: NinaMemorySource
  sourceMessageId: string | null
}

/** A slot write that was NOT applied because a human owns the row. Ruling (c) rule 2. */
export interface DeferredSlot {
  key: NinaSlotKey
  reason: 'admin-owned'
}

/** A slot write that became a ledger fact instead. Nothing is ever dropped; this says why. */
export interface DemotedWrite {
  key: string
  reason:
    | 'unknown-key'
    | 'unparseable-value'
    | 'low-confidence'
    | 'unverified-quote'
    | 'bad-promise-shape'
}

export interface MemoryPlan {
  /** Applied FIRST and unconditionally. This is what makes "PERMANENTLY" true. */
  facts: readonly PlannedFact[]
  /** Applied SECOND. A failure here costs the current view, never the history. */
  slots: readonly PlannedSlot[]
  deferred: readonly DeferredSlot[]
  demoted: readonly DemotedWrite[]
}

export interface MemoryPlanInput {
  /** The runner's message for this turn, verbatim. The haystack for every quote check. */
  runnerText: string
  /** `nina_messages.id` of that message. Null on a proactive turn — she started it. */
  sourceMessageId: string | null
  /** Phase 3's `send.memoryWrites`, already validated by `NinaMemoryWriteSchema`. */
  memoryWrites: readonly NinaMemoryWrite[]
  /** The distillation payload, or `null` when the model call degraded (ruling (e)). */
  distilled: DistillPayload | null
  /** `source` per existing slot key, from `readSlotSources`. Ruling (c) rule 2. */
  existingSlotSources: ReadonlyMap<string, NinaMemorySource>
  /** The current parsed `pending_promises` value, or null when the slot does not exist. */
  currentPromises: NinaPendingPromisesSlot | null
  identity: NameSlotInput
  promiseCtx: PromiseMergeContext
}

/** A bound on one turn's ledger writes. Twelve distilled + six of hers + promises, with slack. */
export const MAX_PLANNED_FACTS = 24

/**
 * ── THE ORDER OF PRECEDENCE, STATED ONCE ──────────────────────────────────────────────────────
 * 1. `send.memoryWrites` and `save_memory` (phase 3) are her EXPLICIT structured assertions. They
 *    skip the quote gate, exactly as phase 3 already wrote them straight to the slot, but they now
 *    go through the vocabulary and the canonicaliser — so this phase is strictly stricter than
 *    phase 3 and never looser.
 * 2. A distilled candidate for the same key WINS over one of hers, because the distiller read the
 *    whole finished exchange and she was mid-sentence.
 * 3. `name` is written by nobody but this function. It is bookkeeping over `users.name` and the
 *    nickname hint, not something he said, so **it never produces a ledger row** — a fact ledger
 *    that fills up with "his name is still Miftahul Mahfuzh" every turn is a ledger nobody reads.
 */
export function planMemoryWrites(input: MemoryPlanInput): MemoryPlan {
  const facts: PlannedFact[] = []
  const factKeys = new Set<string>()
  const slots = new Map<NinaSlotKey, PlannedSlot>()
  const deferred: DeferredSlot[] = []
  const demoted: DemotedWrite[] = []

  const addFact = (category: NinaFactCategory, text: string, confidence: number): void => {
    if (facts.length >= MAX_PLANNED_FACTS) return
    const value = text.replace(/\s+/g, ' ').trim().slice(0, FACT_TEXT_MAX)
    if (value.length === 0) return
    /* One turn saying the same thing twice is one fact. Two turns a month apart are two — which is
     * why the dedupe is per-plan and phase 1's INSERT deliberately has none. */
    const dedupeKey = normaliseForQuote(value)
    if (factKeys.has(dedupeKey)) return
    factKeys.add(dedupeKey)
    facts.push({
      category,
      text: value,
      confidence: Math.max(0, Math.min(100, Math.round(confidence))),
      sourceMessageId: input.sourceMessageId,
    })
  }

  const proposeSlot = (
    key: NinaSlotKey,
    raw: string,
    verified: boolean,
    confidence: number,
  ): void => {
    const spec = NINA_SLOT_SPECS[key]
    if (spec.policy !== 'replace') {
      demoted.push({ key, reason: 'unparseable-value' })
      return
    }
    if (!verified) {
      demoted.push({ key, reason: 'unverified-quote' })
      return
    }
    if (confidence < SLOT_CONFIDENCE_FLOOR) {
      demoted.push({ key, reason: 'low-confidence' })
      return
    }
    const value = spec.canonicalise(raw)
    if (value === null) {
      demoted.push({ key, reason: 'unparseable-value' })
      return
    }
    slots.set(key, { key, value, source: 'distilled', sourceMessageId: input.sourceMessageId })
  }

  /* ── 1. hers, from the reply she just composed ─────────────────────────────────────────────── */
  for (const write of input.memoryWrites) {
    const key = write.kind === 'slot' ? write.slotKey : undefined
    if (key != null && isNinaSlotKey(key)) {
      addFact(NINA_SLOT_SPECS[key].category, write.text, 100)
      /* `verified: true` — she asserted it through a tool schema, which is the trust level phase 3
       * already granted her; the quote gate exists for the DISTILLER's readings. */
      proposeSlot(key, write.text, true, 100)
      continue
    }
    if (key != null) demoted.push({ key, reason: 'unknown-key' })
    addFact('other', write.text, 100)
  }

  /* ── 2. the distillation ───────────────────────────────────────────────────────────────────── */
  for (const candidate of input.distilled?.facts ?? []) {
    const verified = verifyQuote(candidate.quote, input.runnerText)
    const confidence = verified
      ? candidate.confidence
      : Math.min(candidate.confidence, UNVERIFIED_CONFIDENCE_CEILING)

    const key = candidate.slotKey
    const known = key !== undefined && isNinaSlotKey(key)
    addFact(
      known ? NINA_SLOT_SPECS[key as NinaSlotKey].category : candidate.category,
      candidate.text,
      confidence,
    )

    if (key === undefined) continue
    if (!known) {
      demoted.push({ key, reason: 'unknown-key' })
      continue
    }
    proposeSlot(key as NinaSlotKey, candidate.text, verified, confidence)
  }

  /* ── 3. the nickname (R7) ──────────────────────────────────────────────────────────────────── */
  const rawNickname = input.distilled?.nickname
  if (rawNickname !== undefined) {
    const nickname = canonicaliseNickname(rawNickname)
    /* It has to be IN his message. She may not report a nickname he did not type, because from
     * then on she uses it in every single bubble. */
    if (nickname !== null && verifyQuote(nickname, input.runnerText)) {
      addFact('person', `Dia mau dipanggil "${nickname}".`, 100)
      slots.set('nickname', {
        key: 'nickname',
        value: nickname,
        source: 'distilled',
        sourceMessageId: input.sourceMessageId,
      })
    } else {
      demoted.push({
        key: 'nickname',
        reason: nickname === null ? 'unparseable-value' : 'unverified-quote',
      })
    }
  }

  /* ── 4. the promises (R19, for phase 13) ───────────────────────────────────────────────────── */
  const promiseCandidates = (input.distilled?.promises ?? []).filter((candidate) =>
    verifyQuote(candidate.quote, input.runnerText),
  )
  for (const candidate of input.distilled?.promises ?? []) {
    if (!verifyQuote(candidate.quote, input.runnerText)) {
      demoted.push({ key: 'pending_promises', reason: 'unverified-quote' })
      addFact('other', candidate.text, UNVERIFIED_CONFIDENCE_CEILING)
    }
  }
  if (promiseCandidates.length > 0) {
    const merged = mergePendingPromises(input.currentPromises, promiseCandidates, input.promiseCtx)
    for (const candidate of merged.rejected) {
      demoted.push({ key: 'pending_promises', reason: 'bad-promise-shape' })
      addFact('other', `${candidate.text} (${candidate.condition})`, 100)
    }
    if (merged.slot.promises.length > (input.currentPromises?.promises.length ?? 0)) {
      slots.set('pending_promises', {
        key: 'pending_promises',
        value: merged.slot,
        source: 'distilled',
        sourceMessageId: input.sourceMessageId,
      })
      for (const candidate of promiseCandidates) {
        addFact('other', `Nina janji: ${candidate.text} — kalau ${candidate.condition}.`, 100)
      }
    }
  }

  /* ── 5. the name slot — bookkeeping, and never a ledger row ────────────────────────────────── */
  const nicknameNow =
    (slots.get('nickname')?.value as string | undefined) ?? input.identity.nickname ?? null
  const nameValue = nameSlotValue({ ...input.identity, nickname: nicknameNow })
  if (nameValue !== null) {
    slots.set('name', {
      key: 'name',
      value: nameValue,
      source: 'distilled',
      sourceMessageId: null,
    })
  }

  /* ── 6. the admin-row preservation rule — ruling (c) ───────────────────────────────────────── */
  const applied: PlannedSlot[] = []
  for (const slot of slots.values()) {
    const existing = input.existingSlotSources.get(slot.key)
    if (existing !== 'admin') {
      applied.push(slot)
      continue
    }
    if (NINA_SLOT_SPECS[slot.key].policy === 'merge') {
      /* Sticky source: a merge kept every admin entry, so the row is still the admin's. */
      applied.push({ ...slot, source: 'admin' })
      continue
    }
    /*
     * A human asserted this. The distiller's reading is already in `facts` above (or, for `name`,
     * is bookkeeping worth nothing), so deferring loses nothing and preserving loses nothing
     * either. This is the single line that stops R4 and R24 destroying each other.
     */
    deferred.push({ key: slot.key, reason: 'admin-owned' })
  }

  return { facts, slots: applied, deferred, demoted }
}
