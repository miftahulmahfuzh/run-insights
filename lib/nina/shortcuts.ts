/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  SHORTCUTS. He types `🍑` and means four sentences he wrote once, months ago. This module is
 *  the whole of "did he type one, and which", and it knows nothing about a database.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── THIS FILE MUST STAY IMPORTABLE FROM A `'use client'` COMPONENT, AND FROM A `.mjs` SCRIPT ──
 * **Zero imports. No value import, no type import, no `server-only`, nothing from `@/lib/db/*`.**
 * The `lib/nina/tuning.ts` rule, and it is load-bearing for TWO consumers rather than one:
 *
 *   · phase 3's `components/admin/ShortcutTable.tsx` is `'use client'` and needs
 *     `NINA_TRIGGER_MAX`, `NINA_SHORTCUT_LABEL_MAX` and `NINA_SHORTCUT_EXPANSION_MAX` in the
 *     browser to size and cap its inputs (it reaches them through
 *     `lib/admin/shortcutModel.ts`'s re-export, but the property it rests on is this one);
 *   · phase 4's `scripts/nina-shortcuts-import.mjs` IMPORTS THIS MODULE DIRECTLY under
 *     `--experimental-strip-types`, so that the importer's `match_key` is computed by literally
 *     the same function the matcher compares against. `scripts/nina-memory-reap.mjs`'s header
 *     records the one case where a `.mjs` cannot import a `.ts`: a module whose own imports are
 *     runtime values (drizzle) rather than `import type`. Zero imports is exactly the condition
 *     that keeps this module out of that case.
 *
 * So a value import added here does not merely fatten a bundle — **it stops phase 4's script
 * booting at all.** That is the correct failure (loud, immediate, at the top of the file), but it
 * is a failure, and it is why this rule is an invariant rather than a preference.
 * `lib/nina/shortcuts.test.ts` reads this file's own source and fails on an `import` line, so the
 * property is checked rather than merely intended.
 *
 * That is also why `NinaShortcutMatchable` is declared HERE as a plain interface instead of being
 * imported from `lib/db/schema.ts`. It is the structural minimum the matcher needs; the rows
 * `lib/nina/queries.ts` returns are a superset of it and satisfy it without a mapping step.
 *
 * ── NORMALISATION IS FIVE OPERATIONS, IN THIS ORDER, AND PHASE 4 MUST REPRODUCE THEM ──────────
 *   1. `NFC` — one canonical spelling of a composed character.
 *   2. **remove every `U+FE0F`** (variation selector 16). `✌️` in the production ledger is
 *      `U+270C U+FE0F`; the same emoji from an iOS keyboard may arrive as bare `U+270C`. Folding
 *      it out of BOTH sides is what makes those the same shortcut. This is the single highest-value
 *      line in the file and the one a "simplification" will delete first.
 *   3. collapse internal whitespace runs to one space — `nom  nom` is `nom nom`.
 *   4. trim.
 *   5. lowercase — `Plak!` fires the `plak!` he defined.
 *
 * **`U+200D` (ZERO WIDTH JOINER) IS DELIBERATELY KEPT.** It is meaningful inside an emoji
 * sequence: stripping it would merge `👩‍❤️‍👨` into the three separate glyphs it is built from, and
 * two distinct shortcuts would collide on one `match_key`. `NINA_TRIGGER_MAX = 16` exists to leave
 * room for exactly that.
 *
 * The same function normalises the trigger and the message it is looked for in. It is named for
 * the trigger because that is the side that gets STORED (`nina_shortcuts.match_key`), but a
 * haystack that is not folded the same way cannot be searched with a folded needle.
 *
 * ── A GLYPH AND A WORD NEED DIFFERENT BOUNDARY RULES ──────────────────────────────────────────
 * An emoji is self-delimiting: `ini🍑dong` contains the peach and means it. A Latin token is not:
 * `yumm` inside `yummy` is not him using the `yumm` code, it is him saying a word. So a `'glyph'`
 * trigger matches anywhere in the haystack, and a `'word'` trigger matches only when it touches
 * neither a letter nor a digit on either side. Five of the twenty-four production triggers are
 * Latin tokens, so this is not a hypothetical.
 *
 * ── NOTHING HERE THROWS (plan invariant 7) ────────────────────────────────────────────────────
 * Every entry point tolerates `null`, `undefined`, a wrong-typed field and a `match_key` that is
 * empty after folding, and degrades to "nothing fired". The one construction that CAN throw —
 * `new RegExp` with a lookbehind, on a runtime that does not support one — is caught, and the
 * shortcut simply does not fire. A turn that dies because a trigger was malformed is a turn lost
 * to a feature that is meant to be additive.
 */

/* ============================================================================
 * §1 Bounds
 * ==========================================================================*/

/**
 * The longest real trigger is `nom nom` (7 UTF-16 units). 16 leaves room for a ZWJ emoji sequence
 * — `👩‍❤️‍👨` is 8 units before folding — with the same margin again on top.
 *
 * Measured in UTF-16 code units, i.e. `String.length`, because that is what zod's `.max()`
 * measures and phase 3's schema is the only enforcer.
 */
export const NINA_TRIGGER_MAX = 16
/** One line in a phone table cell. */
export const NINA_SHORTCUT_LABEL_MAX = 80
/** `NINA_NOTES_MAX`'s number. 5× `ADMIN_FACT_TEXT_MAX`, the cap that is binding in production. */
export const NINA_SHORTCUT_EXPANSION_MAX = 2000
/** Fired plus still-in-play, COMBINED. Fired takes every slot it needs first. */
export const NINA_SHORTCUT_MAX_FIRED = 4
/** How many earlier RUNNER messages are scanned for a still-in-play code. */
export const NINA_SHORTCUT_LOOKBACK = 6
/** Hard ceiling on the rendered block, applied after the count cap. */
export const NINA_SHORTCUT_BLOCK_MAX_CHARS = 5000

/* ============================================================================
 * §2 Shapes
 * ==========================================================================*/

/** Which boundary rule a trigger gets. `nina_shortcuts.kind` stores this as untyped `text`. */
export type NinaShortcutKind = 'glyph' | 'word'

/**
 * The structural minimum the matcher needs. `NinaShortcutRecord` from `lib/nina/queries.ts` is a
 * superset and satisfies it with no mapping. Declared here rather than imported because this file
 * has zero imports — see the header.
 */
export interface NinaShortcutMatchable {
  id: string
  /** As the admin typed it. Rendered in the block; never matched against. */
  trigger: string
  /** `normalizeNinaTrigger(trigger)`. What is matched against. */
  matchKey: string
  kind: NinaShortcutKind
  label: string
  expansion: string
  enabled: boolean
}

/** One shortcut that matched, reduced to what the block prints. */
export interface NinaShortcutHit {
  id: string
  trigger: string
  label: string
  expansion: string
}

/**
 * `fired` — matched in THIS message, ordered by where it first occurs, so the block reads in the
 * order he typed them. `inPlay` — matched in an earlier runner message and NOT in this one, newest
 * first. A shortcut is never in both: `fired` wins, because the strongest signal is that he just
 * used it.
 */
export interface NinaShortcutHits {
  fired: NinaShortcutHit[]
  inPlay: NinaShortcutHit[]
}

/* ============================================================================
 * §3 Normalisation and classification
 * ==========================================================================*/

/**
 * The five operations in the header, in that order. Idempotent, so calling it on a stored
 * `match_key` is free and safe — which is what lets the matcher be defensive about a row written
 * by something other than `lib/nina/queries.ts` (phase 4's importer is a `.mjs`, and it IMPORTS
 * this very function under `--experimental-strip-types` rather than reimplementing it —
 * `tests/nina.shortcutsImport.test.ts` asserts function IDENTITY, so there is no second
 * implementation for the two sides to disagree about. Plan invariant 4 and decision D5; the
 * header says the same thing, and an earlier draft of this sentence said the opposite).
 */
export function normalizeNinaTrigger(raw: string): string {
  if (typeof raw !== 'string') return ''
  return raw
    .normalize('NFC')
    .replace(/\uFE0F/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * A trigger containing any letter or digit is a WORD and gets the boundary rule; anything else is
 * a GLYPH and matches anywhere.
 *
 * Deliberately not an emoji regex. Five of the twenty-four production triggers (`plak!`, `slurp!`,
 * `yumm`, `nom nom`, `lick!`) are Latin, and the question this function answers is not "is this an
 * emoji" but "can this be confused with a fragment of a word". `!` alone is not a letter, so
 * `plak!` still classifies as a word on the strength of `plak`.
 *
 * Takes the NORMALISED form. Passing a raw trigger works — no code point that matters here is
 * created or destroyed by folding — but the call sites all normalise first and the parameter name
 * says so.
 */
export function classifyNinaTrigger(normalized: string): NinaShortcutKind {
  return /[\p{L}\p{N}]/u.test(normalized) ? 'word' : 'glyph'
}

/* ============================================================================
 * §4 Matching
 * ==========================================================================*/

/** The standard metacharacter set. Every escape below is legal in `u` mode. */
function escapeForRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Where `key` first occurs in `haystack`, or `-1`. Both sides are already normalised.
 *
 * The word rule is `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` — not `\b`, which is ASCII-word-boundary
 * and would put a boundary in the middle of `plak!` (between `k` and `!`) and none at all around
 * an accented letter. The lookbehind is what a runtime could refuse, so the construction is
 * wrapped: a refusal degrades that one shortcut to "did not fire" instead of failing the turn.
 */
function firstMatchIndex(haystack: string, key: string, kind: NinaShortcutKind): number {
  if (key === '' || haystack === '') return -1
  if (kind === 'glyph') return haystack.indexOf(key)
  try {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeForRegExp(key)}(?![\\p{L}\\p{N}])`, 'u')
    const found = pattern.exec(haystack)
    return found === null ? -1 : found.index
  } catch {
    return -1
  }
}

interface LiveShortcut {
  shortcut: NinaShortcutMatchable
  key: string
  kind: NinaShortcutKind
}

/**
 * Disabled rows, duplicate ids and rows whose key folds to nothing are dropped here, once, before
 * any matching happens. `kind` is re-derived when the stored value is not one of the two we know —
 * invariant 7 at the only boundary where a bad `nina_shortcuts.kind` could be noticed.
 */
function liveShortcuts(shortcuts: readonly NinaShortcutMatchable[]): LiveShortcut[] {
  const seen = new Set<string>()
  const live: LiveShortcut[] = []
  for (const shortcut of shortcuts) {
    if (shortcut == null || shortcut.enabled !== true) continue
    if (typeof shortcut.id !== 'string' || shortcut.id === '' || seen.has(shortcut.id)) continue
    let key = normalizeNinaTrigger(shortcut.matchKey)
    if (key === '') key = normalizeNinaTrigger(shortcut.trigger)
    if (key === '') continue
    const kind =
      shortcut.kind === 'glyph' || shortcut.kind === 'word'
        ? shortcut.kind
        : classifyNinaTrigger(key)
    seen.add(shortcut.id)
    live.push({ shortcut, key, kind })
  }
  return live
}

function toHit(shortcut: NinaShortcutMatchable): NinaShortcutHit {
  return {
    id: shortcut.id,
    trigger: typeof shortcut.trigger === 'string' ? shortcut.trigger : '',
    label: typeof shortcut.label === 'string' ? shortcut.label : '',
    expansion: typeof shortcut.expansion === 'string' ? shortcut.expansion : '',
  }
}

/**
 * The whole of "did he use a code, and which".
 *
 * `current` is the runner's message this turn — `null` on a proactive turn, which is why the
 * parameter is nullable rather than optional. `recent` is EARLIER RUNNER MESSAGES ONLY, newest
 * first, already excluding the one this turn is answering; phase 2 slices it out of
 * `loadedContext.conversation.window` with no new query. **Nina's own bubbles are never passed**
 * (assumption A3) — an expansion she echoed would re-fire itself forever.
 *
 * Ordering:
 *   · `fired` — by first index of occurrence in `current`, so the block reads in the order he
 *     typed them. Ties (one trigger a prefix of another at the same offset) go to the longer key,
 *     then to the lower id, so the result is total and reproducible — the same property
 *     `listNinaMemoryFacts`' `id DESC` tiebreak buys for the prompt.
 *   · `inPlay` — by how recent the message was, then by offset within it.
 *
 * Capping: `fired` is filled to `NINA_SHORTCUT_MAX_FIRED` first and `inPlay` gets whatever is
 * left, which may be nothing. Four codes in one message means no still-in-play context at all,
 * and that is the right trade: what he just said outranks what he said three messages ago.
 */
export function matchNinaShortcuts(input: {
  shortcuts: readonly NinaShortcutMatchable[]
  current: string | null
  recent?: readonly string[]
}): NinaShortcutHits {
  const live = liveShortcuts(input.shortcuts ?? [])
  if (live.length === 0) return { fired: [], inPlay: [] }

  const currentHaystack = normalizeNinaTrigger(input.current ?? '')
  const firedRanked: { at: number; live: LiveShortcut }[] = []
  const firedIds = new Set<string>()
  for (const candidate of live) {
    const at = firstMatchIndex(currentHaystack, candidate.key, candidate.kind)
    if (at < 0) continue
    firedRanked.push({ at, live: candidate })
    firedIds.add(candidate.shortcut.id)
  }
  firedRanked.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at
    if (a.live.key.length !== b.live.key.length) return b.live.key.length - a.live.key.length
    return a.live.shortcut.id < b.live.shortcut.id ? -1 : 1
  })

  const inPlayRanked: { at: number; live: LiveShortcut }[] = []
  const inPlayIds = new Set<string>()
  const recent = input.recent ?? []
  const depthLimit = Math.min(recent.length, NINA_SHORTCUT_LOOKBACK)
  for (let depth = 0; depth < depthLimit; depth++) {
    const haystack = normalizeNinaTrigger(recent[depth] ?? '')
    if (haystack === '') continue
    const here: { at: number; live: LiveShortcut }[] = []
    for (const candidate of live) {
      if (firedIds.has(candidate.shortcut.id) || inPlayIds.has(candidate.shortcut.id)) continue
      const at = firstMatchIndex(haystack, candidate.key, candidate.kind)
      if (at < 0) continue
      here.push({ at, live: candidate })
    }
    here.sort((a, b) => {
      if (a.at !== b.at) return a.at - b.at
      return a.live.shortcut.id < b.live.shortcut.id ? -1 : 1
    })
    for (const entry of here) {
      inPlayIds.add(entry.live.shortcut.id)
      inPlayRanked.push(entry)
    }
  }

  const fired = firedRanked.slice(0, NINA_SHORTCUT_MAX_FIRED).map((e) => toHit(e.live.shortcut))
  const room = NINA_SHORTCUT_MAX_FIRED - fired.length
  const inPlay = room <= 0 ? [] : inPlayRanked.slice(0, room).map((e) => toHit(e.live.shortcut))
  return { fired, inPlay }
}

/* ============================================================================
 * §5 Rendering
 * ==========================================================================*/

/**
 * The two headers are the ONLY instruction text this feature adds anywhere. There is deliberately
 * no section in `lib/nina/prompts/system.ts` telling her what a shortcut is: every word she needs
 * travels with the shortcut, adjacent to the expansion it governs, and costs nothing on the turns
 * where nothing fired (plan invariant 2).
 */
const FIRED_HEADER =
  'HE USED A SHORTCUT. Each code below is one HE defined, and typing it is how he says the whole ' +
  'situation written under it. This is an instruction for THIS reply, not background colour: ' +
  'answer as if he had written the whole thing out.'

const IN_PLAY_HEADER =
  'STILL IN PLAY. He used these in the last few messages but not in this one. They are still ' +
  'running unless he has ended them.'

function renderHit(hit: NinaShortcutHit): string {
  const label = hit.label.trim()
  const head = label === '' ? hit.trigger : `${hit.trigger} — ${label}`
  return `${head}\n${hit.expansion.trim()}`
}

function clampHard(text: string): string {
  return text.length <= NINA_SHORTCUT_BLOCK_MAX_CHARS
    ? text
    : `${text.slice(0, NINA_SHORTCUT_BLOCK_MAX_CHARS - 1)}…`
}

/**
 * The block phase 2 pushes into `userTurnText`, immediately above `'HE JUST SAID:'`, or `null`.
 *
 * **`null` means "emit nothing at all"** — not an empty string, not a header with no body. Plan
 * invariant 2 is that a turn in which nothing fired carries ZERO shortcut bytes, and returning
 * `null` is what lets phase 2's `if (block != null) parts.push(block)` be the whole of the
 * integration.
 *
 * **A still-in-play code renders even when nothing fired this turn.** That is the point of
 * `inPlay`: one production shortcut (`🫦`) opens a mode that runs until he says `💦`, and the
 * instruction has to still be legible on the turn where he only says *"terusin"*. `null` therefore
 * means both lists are empty, not that `fired` is.
 *
 * The ceiling is enforced by DROPPING WHOLE ENTRIES from the end rather than by cutting the text,
 * because half a directive can invert a directive — `…jangan` and `…jangan berhenti` are opposite
 * instructions. Four maximal expansions are 8000 characters against a 5000 ceiling, so this path
 * is reachable in practice and not merely theoretical. Truncation mid-sentence survives only as
 * the last resort for a SINGLE entry that is over the ceiling on its own, where the alternative is
 * a header with nothing under it.
 */
export function renderNinaShortcutBlock(hits: NinaShortcutHits | null | undefined): string | null {
  const fired = hits?.fired ?? []
  const firedIds = new Set(fired.map((hit) => hit.id))
  const inPlay = (hits?.inPlay ?? []).filter((hit) => !firedIds.has(hit.id))
  if (fired.length === 0 && inPlay.length === 0) return null

  const parts: string[] = []
  let used = 0
  const push = (text: string): boolean => {
    const cost = parts.length === 0 ? text.length : text.length + 2 // the '\n\n' join
    if (used + cost > NINA_SHORTCUT_BLOCK_MAX_CHARS) return false
    parts.push(text)
    used += cost
    return true
  }

  if (fired.length > 0) {
    push(FIRED_HEADER)
    let kept = 0
    for (const hit of fired) {
      if (!push(renderHit(hit))) break
      kept++
    }
    if (kept === 0) return clampHard(`${FIRED_HEADER}\n\n${renderHit(fired[0]!)}`)
  }

  if (inPlay.length > 0) {
    const before = parts.length
    if (push(IN_PLAY_HEADER)) {
      let kept = 0
      for (const hit of inPlay) {
        if (!push(renderHit(hit))) break
        kept++
      }
      // A header with nothing under it is bytes that say nothing. Take it back out.
      if (kept === 0) {
        parts.length = before
        if (before === 0) return clampHard(`${IN_PLAY_HEADER}\n\n${renderHit(inPlay[0]!)}`)
      }
    } else if (parts.length === 0) {
      return clampHard(`${IN_PLAY_HEADER}\n\n${renderHit(inPlay[0]!)}`)
    }
  }

  return clampHard(parts.join('\n\n'))
}
