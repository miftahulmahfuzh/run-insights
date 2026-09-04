/**
 * Chat search (R6, second half), as the decisions it actually is: what a query means, what the SQL
 * narrows to, how a match is scored, what a result says, and where a tap goes.
 *
 * ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────────────────────────
 * `vitest.config.ts` is `environment: 'node'` with an `include` matching `*.test.ts` only: there is
 * no jsdom, so a rule that lives in a component cannot be tested. `lib/nina/chatview.ts`,
 * `lib/nina/reply.ts` and `lib/photos/gallery.ts` were all split out for exactly this reason and
 * each says so in its own header. This module is the same shape: decisions here, measurement in the
 * component, SQL in the action.
 *
 * **No `import 'server-only'`, deliberately.** Three importers with three different graphs:
 * `lib/nina/searchActions.ts` (a Server Action), `lib/nina/semantic.ts` (server), and
 * `components/nina/NinaSearchField.tsx` plus `components/nina/useSemanticPref.ts` (client). That is
 * only safe because there is nothing in here but string handling and arithmetic — no `db`, no
 * `env`, no DOM type in any signature. `lib/nina/reply.ts` states the same rule for the same reason.
 *
 * ── WHAT THE SEARCH DOES NOT READ ─────────────────────────────────────────────────────────────
 * `nina_message_images.description` (invariant 5). Not avoided by discipline — the SQL in
 * `searchActions.ts` never names that table, so there is no projection that could carry it. The
 * visible consequence is that an image-only message has empty `text` and can never be a hit, which
 * is also why a result row can never be blank.
 */

import { SESSION_PARAM } from './active'

/* ── the persisted toggle ──────────────────────────────────────────────────────────────────── */

/**
 * **The first `localStorage` key in this codebase**, so it sets the convention: an `ri:` origin
 * prefix, then the feature, then the preference. `grep -rn "localStorage" lib components app`
 * returned nothing before this line existed.
 *
 * Why `localStorage` at all, when the app's habit (`lib/panel/param.ts`, `usePanelParam`) is to put
 * UI state in the URL: the URL is per-history-entry and R6 asks for "across app usage". Why not a
 * cookie, which the server render could read: this preference has **no server consumer** — it is an
 * argument to a Server Action that the client already holds — so a cookie would add a request-time
 * input to `/nina` and buy nothing.
 */
export const NINA_SEMANTIC_PREF_KEY = 'ri:nina:semantic-search'

/**
 * The one stored value that means "on". `PANEL_DATES_OPEN`'s rule, in a second storage medium:
 * absent, `''`, `'0'`, `'true'`, `'yes'` and anything else are off. One spelling to write, one to
 * parse, and it fails closed — an unrecognised value costs no model call.
 */
export const SEMANTIC_PREF_ON = '1'

export function decodeSemanticPref(raw: string | null | undefined): boolean {
  return raw === SEMANTIC_PREF_ON
}

/** The value to store, or `null` for "remove the key" — the `encodePanelDates` shape. */
export function encodeSemanticPref(on: boolean): string | null {
  return on ? SEMANTIC_PREF_ON : null
}

/* ── budgets and floors ────────────────────────────────────────────────────────────────────── */

/** Below this, nothing is queried and nothing is rendered. Idle is not "no matches". */
export const SEARCH_MIN_CHARS = 2

/**
 * Below this the toggle is honoured but the model pass is skipped and the response comes back
 * `mode: 'text'`. Two or three characters is a substring probe, not a concept, and this is the
 * cheapest real reduction in model calls the feature has.
 */
export const SEMANTIC_MIN_CHARS = 4

/** A Server Action per keystroke is a serverless invocation per keystroke. See `searchDebounceMs`. */
export const SEARCH_DEBOUNCE_MS = 250
export const SEMANTIC_DEBOUNCE_MS = 700

/** A search field is not a composer. Longer than this is a paste, and it is truncated, not refused. */
export const SEARCH_QUERY_MAX_CHARS = 200

/**
 * More terms than this and every extra one is another `ILIKE` in an `AND` chain that already
 * returns nothing. Six is past the point where a seventh changes an answer.
 */
export const SEARCH_TERM_MAX = 6

/** How many hits the list shows, and the ceiling on what the model may rank. */
export const SEARCH_RESULT_MAX = 20

/** The SQL cap on text matches. Newest first, so the cap drops the oldest matches. */
export const TEXT_CANDIDATE_MAX = 200

/** The ceiling on what goes to `glm-5.3`. 120 × 240 chars ≈ 8k tokens. See `buildSemanticCandidates`. */
export const SEMANTIC_CANDIDATE_MAX = 120

/**
 * The recency filler. This is what makes "a query that shares no words with a message still finds
 * it" answerable at all — a text-only narrowing returns nothing for such a query, so the ranker
 * would have nothing to rank.
 */
export const SEMANTIC_RECENCY_WINDOW = 80

/** Per-candidate text budget in the prompt. */
export const SEMANTIC_SNIPPET_CHARS = 240

/** Per-candidate session-title budget in the prompt. A title is 3-4 words (R3); 60 is generous. */
export const SEMANTIC_TITLE_CHARS = 60

/**
 * The output is `{"ranked":[12,3,40]}` and nothing else, so 400 tokens is roomy.
 * **Deliberately not `NINA_MAX_TOKENS = 2400`** from `lib/nina/turn.ts`, which is sized for a
 * four-bubble reply plus a `tool_use` block. Inheriting that number here would be inheriting a
 * budget for a different shape of answer.
 */
export const SEMANTIC_MAX_TOKENS = 400

/**
 * `lib/llm/narrate.ts` measured `glm-5.3` at 10.2-16.4 s, but for 1,200-1,600 tokens of prose
 * through a tool. This call emits at most 400 tokens of a flat integer array with `thinking`
 * disabled, and 8 s is the outer edge of what a person holds still for at a search field. There is
 * no repair round trip, so this is the whole budget rather than one of four numbers.
 */
export const SEMANTIC_TIMEOUT_MS = 8_000

/** About two lines at the result row's size, matching `QUOTE_PREVIEW_MAX_CHARS`'s reasoning. */
export const SNIPPET_MAX_CHARS = 140

/* ── scoring weights, named so a test can assert on the rule and not on a number ──────────── */

/** A session-title hit outranks every message hit. Titles are the coarse answer; group them first. */
export const SESSION_HIT_BONUS = 1_000
/** The whole query present as a contiguous phrase beats the same words scattered. */
export const PHRASE_HIT_BONUS = 100
export const OCCURRENCE_WEIGHT = 2
/** Past three occurrences of one term, a fourth says nothing new about relevance. */
export const OCCURRENCE_CAP = 3

/* ── the query ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Whatever arrived from a client, as one line of at most `SEARCH_QUERY_MAX_CHARS`.
 *
 * `unknown` in, `string` out: a Server Action is an untrusted POST endpoint
 * (`lib/nina/actions.ts`'s point 3), so the action's first act on its own argument is to run it
 * through here rather than to trust its declared type.
 */
export function normalizeSearchQuery(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_MAX_CHARS)
}

/**
 * The query as distinct lowercased terms, in order, capped. Deduplicated, because `lari lari` is
 * one condition twice and the second one narrows nothing.
 */
export function searchTerms(query: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const piece of normalizeSearchQuery(query).toLowerCase().split(' ')) {
    if (piece.length === 0) continue
    if (seen.has(piece)) continue
    seen.add(piece)
    out.push(piece)
    if (out.length === SEARCH_TERM_MAX) break
  }
  return out
}

/**
 * A term as a `LIKE` pattern, with `LIKE`'s own metacharacters escaped.
 *
 * **This is not cosmetic.** Unescaped, a query of `100%` matches every row in the table and a query
 * of `_` matches everything of length one or more — the search would silently claim the whole
 * conversation is a hit. drizzle binds the pattern as a parameter, so the backslashes below reach
 * `LIKE` intact and `\` is `LIKE`'s default escape character.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

/** 250 ms for text, 700 ms when a keystroke pause costs a `glm-5.3` call. */
export function searchDebounceMs(semantic: boolean): number {
  return semantic ? SEMANTIC_DEBOUNCE_MS : SEARCH_DEBOUNCE_MS
}

export function shouldRunSearch(query: string): boolean {
  return normalizeSearchQuery(query).length >= SEARCH_MIN_CHARS
}

/** The toggle AND a query long enough to be a concept. Both, or the model pass is skipped. */
export function shouldRunSemantic(query: string, semantic: boolean): boolean {
  return semantic && normalizeSearchQuery(query).length >= SEMANTIC_MIN_CHARS
}

/**
 * The TypeScript mirror of the SQL's `AND` chain of `ILIKE`s.
 *
 * It exists so ranking and the tests can agree with the database without a database: the SQL
 * narrows, this re-checks, and a divergence between the two shows up as a unit-test failure rather
 * than as a row that came back and then scored zero. Zero terms match nothing — a search with no
 * terms is not a search that matches everything.
 */
export function matchesAllTerms(text: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return false
  const haystack = text.toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

/* ── what a result says ────────────────────────────────────────────────────────────────────── */

/**
 * One line of text around the first matching term.
 *
 * Whitespace is collapsed first, for `quotePreview`'s reason: the bubble is `whitespace-pre-wrap`
 * because her line breaks are how she talks, but a result row is a reference and a two-line snippet
 * spending both lines on a blank line is useless. Collapsing also makes the budget mean 140
 * characters of prose rather than 140 characters of `\n`.
 *
 * A quarter of the budget of lead-in, so the matched word is visible without being flush against
 * the left edge. Ellipses mark a cut on either side and only where one happened — a snippet that is
 * the whole message gets none, which is how the reader can tell.
 *
 * No matching term (the semantic path, where a hit need share no word with the query) falls back to
 * the head of the message. That is the honest answer: there is nothing to centre on.
 */
export function snippetAround(
  text: string,
  terms: readonly string[],
  budget: number = SNIPPET_MAX_CHARS,
): string {
  if (budget <= 0) return ''
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return ''
  if (flat.length <= budget) return flat

  const haystack = flat.toLowerCase()
  let first = -1
  for (const term of terms) {
    if (term.length === 0) continue
    const at = haystack.indexOf(term)
    if (at !== -1 && (first === -1 || at < first)) first = at
  }
  if (first === -1) return `${flat.slice(0, budget).trimEnd()}…`

  const lead = Math.floor(budget / 4)
  let start = Math.max(0, first - lead)
  let end = start + budget
  if (end > flat.length) {
    end = flat.length
    start = Math.max(0, end - budget)
  }

  const head = start > 0 ? '…' : ''
  const tail = end < flat.length ? '…' : ''
  return `${head}${flat.slice(start, end).trim()}${tail}`
}

/** A title hit points at a session; a text hit points at one message inside one. */
export type NinaSearchHitKind = 'session' | 'message'

/**
 * A row the search may return, as the pure layer wants it.
 *
 * **Structural, not imported from `lib/db` or from `lib/nina/queries.ts`.** `lib/nina/attach.ts`
 * and `lib/nina/reply.ts` both draw this boundary and both state why: the pure module declares what
 * it needs and the query happens to return something assignable to it, so a column rename is a
 * compile error at one call site rather than an edit to this file. It also means this module never
 * learns that `role` is spelled `'runner'` — `mine` is a boolean the action computes.
 *
 * `day` is a **rendered string**, produced on the server by `lib/format.ts`'s `formatDay`
 * (invariant 4). A client component formatting an instant is the classic hydration mismatch and the
 * codebase says so in three places.
 */
export interface NinaSearchCandidate {
  kind: NinaSearchHitKind
  sessionId: string
  sessionTitle: string
  /** `null` for a `'session'` candidate — a title hit names no message. */
  messageId: string | null
  /** `nina_messages.seq`. `0` for a `'session'` candidate, which never competes on recency. */
  seq: number
  /** True when the runner wrote it. False for hers, and for a session candidate. */
  mine: boolean
  /** The message body, or the session title for a `'session'` candidate. */
  text: string
  /** `formatDay(jakartaDayOf(sentAt))`. Empty for a `'session'` candidate. */
  day: string
}

/** What a result row renders. Everything it needs, nothing it does not. */
export interface NinaSearchHit {
  kind: NinaSearchHitKind
  sessionId: string
  sessionTitle: string
  messageId: string | null
  mine: boolean
  /** Never empty for a message hit — see `snippetAround`. */
  snippet: string
  day: string
  /** Where a tap goes. `searchHitHref`, so the grammar is tested and not retyped. */
  href: string
}

export type NinaSearchMode = 'text' | 'semantic'

/**
 * `requested` is what he asked for; `mode` is what actually ran. They differ exactly when the model
 * was unavailable or the query was too short for a concept, and `isDegradedSearch` is the name for
 * that. `lib/llm/narrate.ts`'s ruling — "the only safe fallback for prose is the absence of prose"
 * — applied to ranking gives the opposite answer: the fallback is the ranking we CAN compute, said
 * out loud. Silence here would read as "your conversation does not contain this", which is a false
 * claim about the runner's own history.
 */
export interface NinaSearchResponse {
  requested: NinaSearchMode
  mode: NinaSearchMode
  hits: NinaSearchHit[]
  /** The SQL cap cut the corpus, so "nothing else matched" is not a claim about everything. */
  capped: boolean
}

export function emptySearchResponse(requested: NinaSearchMode): NinaSearchResponse {
  return { requested, mode: 'text', hits: [], capped: false }
}

export function isDegradedSearch(response: NinaSearchResponse | null): boolean {
  return response !== null && response.requested === 'semantic' && response.mode === 'text'
}

/**
 * Where a hit goes: **phase 3's `?s=` and `lib/nina/scroll.ts`'s `?at=`, and no third grammar.**
 *
 * `decodeChatScrollMark` accepts `<messageId>~<offset>` with the id matching
 * `^[A-Za-z0-9_-]{1,64}$` and the offset `^-?\d{1,6}$`, and `resolveRestoreTop` returns
 * `anchorTop - offset` clamped into the document. So `~0` means "this message's top edge at the top
 * of the viewport", which is exactly a jump to it, and `components/nina/MessageList.tsx` already
 * consumes the mark. Deep-linking to the message therefore costs one function and no new parameter.
 *
 * `encodeURIComponent` rather than `URLSearchParams`: the latter percent-encodes `~` to `%7E`,
 * which round-trips fine through `useSearchParams().get('at')` but throws away the reason
 * `scroll.ts` chose `~` in the first place ("unreserved in a query string, so no percent-encoding").
 * Ids are `[0-9A-Za-z_-]{12}` so the call is a no-op in practice and correct hygiene anyway.
 *
 * **A message older than `CHAT_HISTORY_LIMIT` inside its own session degrades**: the anchor is not
 * in the document, `resolveRestoreTop` returns `null`, and the screen opens where it normally
 * would. That is `scroll.ts`'s documented behaviour, not a new failure mode.
 *
 * **RECONCILED: the parameter's name is imported, not spelled.** Phase 3 exports
 * `SESSION_PARAM = 's'` from `lib/nina/active.ts`, which is pure and client-safe (its cap comes
 * from phase 1's `lib/nina/sessions.ts`, and phase 4's model call lives in
 * `lib/nina/autotitle.ts`, so nothing `server-only` is reachable from it). This module is imported
 * by the `'use client'` `NinaSearchField`, so that matters — and it is the very path phase 4's D1
 * cites when it argues for keeping `active.ts` pure. Phase 5's session hrefs import the same
 * constant, so `?s=` has exactly one spelling in the set.
 */
export function searchHitHref(hit: { sessionId: string; messageId: string | null }): string {
  const session = encodeURIComponent(hit.sessionId)
  const base = `/nina?${SESSION_PARAM}=${session}`
  if (hit.messageId === null) return base
  return `${base}&at=${encodeURIComponent(hit.messageId)}~0`
}

export function toSearchHit(
  candidate: NinaSearchCandidate,
  terms: readonly string[],
): NinaSearchHit {
  return {
    kind: candidate.kind,
    sessionId: candidate.sessionId,
    sessionTitle: candidate.sessionTitle,
    messageId: candidate.messageId,
    mine: candidate.mine,
    snippet: snippetAround(candidate.text, terms),
    day: candidate.day,
    href: searchHitHref(candidate),
  }
}

/* ── text ranking ──────────────────────────────────────────────────────────────────────────── */

/** Occurrences of `needle`, stopping at `cap`. Non-overlapping, which is what "how often" means. */
function countOccurrences(haystack: string, needle: string, cap: number): number {
  if (needle.length === 0 || cap <= 0) return 0
  let found = 0
  let at = haystack.indexOf(needle)
  while (at !== -1 && found < cap) {
    found += 1
    at = haystack.indexOf(needle, at + needle.length)
  }
  return found
}

/**
 * How well a candidate answers the query, given that every term is already present (the SQL's `AND`
 * chain guarantees it, and `matchesAllTerms` re-checks). So coverage cannot discriminate and the
 * three things that can are: a title hit, the query present as a contiguous phrase, and how often
 * the terms appear.
 *
 * The `+1` for a candidate that STARTS with a term is a tiebreak, not a signal: between two
 * otherwise equal messages, the one whose first word is what he searched for is the one he meant.
 */
export function scoreTextCandidate(
  candidate: NinaSearchCandidate,
  terms: readonly string[],
): number {
  const haystack = candidate.text.toLowerCase()
  let score = candidate.kind === 'session' ? SESSION_HIT_BONUS : 0
  if (terms.length > 1 && haystack.includes(terms.join(' '))) score += PHRASE_HIT_BONUS
  for (const term of terms) {
    score += countOccurrences(haystack, term, OCCURRENCE_CAP) * OCCURRENCE_WEIGHT
  }
  if (terms.some((term) => term.length > 0 && haystack.startsWith(term))) score += 1
  return score
}

/**
 * The text ranking: score descending, then `seq` descending, then id, so the order is total and a
 * test can assert on it.
 *
 * Recency as the first tiebreak is the honest default for a conversation — two messages that score
 * the same are distinguished by which one he is more likely to be looking for, and that is the
 * newer one. `nina_messages.seq` is the total order (invariant 6); nothing here re-sorts by a
 * timestamp.
 */
export function rankTextHits(
  candidates: readonly NinaSearchCandidate[],
  terms: readonly string[],
  limit: number = SEARCH_RESULT_MAX,
): NinaSearchHit[] {
  const scored = candidates
    .filter((candidate) => matchesAllTerms(candidate.text, terms))
    .map((candidate) => ({ candidate, score: scoreTextCandidate(candidate, terms) }))

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.candidate.seq !== a.candidate.seq) return b.candidate.seq - a.candidate.seq
    const left = a.candidate.messageId ?? a.candidate.sessionId
    const right = b.candidate.messageId ?? b.candidate.sessionId
    return left < right ? -1 : left > right ? 1 : 0
  })

  return scored.slice(0, Math.max(0, limit)).map(({ candidate }) => toSearchHit(candidate, terms))
}

/* ── the semantic pass ─────────────────────────────────────────────────────────────────────── */

/**
 * What `glm-5.3` is given, and **the order is the whole design.**
 *
 * Assumption A7 reads "search using llm" as a model pass over SQL-narrowed candidates. Taken
 * literally as "narrowed by a text match", that contradicts R6's own acceptance test — *a query
 * that shares no words with a message still finds it* — because a text narrowing returns nothing
 * for such a query and a ranker with no candidates ranks nothing. So the set is a union:
 *
 *   1. session-title matches,
 *   2. message text matches (newest first),
 *   3. the newest `SEMANTIC_RECENCY_WINDOW` messages, as filler.
 *
 * In that order, deduplicated, truncated to `limit`. **The cap can therefore only ever eat recency
 * filler, never a text hit** — A7's narrowing is fully present, and the filler is what makes the
 * no-shared-word case answerable at all.
 *
 * The dedup key includes `kind`, because a session hit and a message hit are different rows even
 * when one session produced both.
 */
export function buildSemanticCandidates(
  sessions: readonly NinaSearchCandidate[],
  textMatches: readonly NinaSearchCandidate[],
  recent: readonly NinaSearchCandidate[],
  limit: number = SEMANTIC_CANDIDATE_MAX,
): NinaSearchCandidate[] {
  const out: NinaSearchCandidate[] = []
  const seen = new Set<string>()
  for (const group of [sessions, textMatches, recent]) {
    for (const candidate of group) {
      if (out.length >= limit) return out
      const key = `${candidate.kind}:${candidate.messageId ?? candidate.sessionId}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(candidate)
    }
  }
  return out
}

/** One flat line, so a tab in the source text cannot break the format the prompt describes. */
function clampFlat(text: string, budget: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= budget ? flat : `${flat.slice(0, budget).trimEnd()}…`
}

/**
 * The candidates as the prompt's tab-separated block: `<index>\t<HIM|HER|TITLE>\t<title>\t<text>`.
 *
 * The index is what comes back, not the id: an integer array is a fraction of the output tokens of
 * an array of nanoids, and `SEMANTIC_MAX_TOKENS = 400` is sized for the former. Ownership is not at
 * stake either way — every candidate came out of an owner-scoped read, so the ids are already facts
 * (`lib/nina/queries.ts`'s rule) and the model is only permuting them.
 *
 * Both fields are flattened and clamped, so 120 candidates cost a predictable number of tokens
 * however long a message was.
 */
export function semanticCandidateBlock(candidates: readonly NinaSearchCandidate[]): string {
  const lines: string[] = []
  for (const [index, candidate] of candidates.entries()) {
    const who = candidate.kind === 'session' ? 'TITLE' : candidate.mine ? 'HIM' : 'HER'
    const title = clampFlat(candidate.sessionTitle, SEMANTIC_TITLE_CHARS)
    const text = clampFlat(candidate.text, SEMANTIC_SNIPPET_CHARS)
    lines.push(`${index}\t${who}\t${title}\t${text}`)
  }
  return lines.join('\n')
}

/**
 * `{"ranked": [12, 3, 40]}` → the indexes we will actually use, or `null`.
 *
 * Tolerant in exactly the ways a model is untidy — a numeric string, a duplicate, an index it
 * invented — and intolerant of nothing else, because every one of those is repairable here for free
 * and none of them is a reason to throw away a good answer. Out-of-range indexes are dropped rather
 * than clamped: an index we did not send is not a candidate, and clamping it would return a row the
 * model never chose.
 *
 * **An empty result is `null`, i.e. a failure, and that is a decision.** We cannot distinguish "the
 * model judged nothing relevant" from "the model returned junk", and degrading to the text ranking
 * is never dishonest in either case: the text hits are exact `AND` matches, so they are relevant by
 * construction. Reporting "no matches" on the model's say-so is the worse of the two errors, and it
 * is the failure `lib/llm/narrate.ts` names.
 */
export function parseSemanticRanking(raw: unknown, candidateCount: number): number[] | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = (raw as { ranked?: unknown }).ranked
  if (!Array.isArray(value)) return null

  const seen = new Set<number>()
  const out: number[] = []
  for (const entry of value) {
    const index = typeof entry === 'number' ? entry : Number(entry)
    if (!Number.isInteger(index)) continue
    if (index < 0 || index >= candidateCount) continue
    if (seen.has(index)) continue
    seen.add(index)
    out.push(index)
    if (out.length === SEARCH_RESULT_MAX) break
  }
  return out.length === 0 ? null : out
}

/**
 * The model's order, applied. No re-sort and no re-score: the ranking IS the answer, and second-
 * guessing it with the text score would produce a third order that neither layer chose.
 */
export function applySemanticRanking(
  candidates: readonly NinaSearchCandidate[],
  order: readonly number[],
  terms: readonly string[],
): NinaSearchHit[] {
  const hits: NinaSearchHit[] = []
  for (const index of order) {
    const candidate = candidates[index]
    if (candidate == null) continue
    hits.push(toSearchHit(candidate, terms))
  }
  return hits
}
