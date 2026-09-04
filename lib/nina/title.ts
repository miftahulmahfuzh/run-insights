import type Anthropic from '@anthropic-ai/sdk'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  R3, THE PURE HALF: what a session may be called.
 *
 *  Two rules live here and they are deliberately not the same rule.
 *
 *   · `sanitizeNinaSessionTitle` is what HE typed. It cleans and clamps and refuses nothing else,
 *     because a name he chose is an instruction.
 *   · `sanitizeNinaModelTitle` is what the MODEL guessed. It cleans, enforces R3's 3-4 words, and
 *     REFUSES anything that is not a name — a bad title is worse than no title, because the title
 *     is what the whole session list shows. A refusal keeps phase 1's `SESSION_UNTITLED_TITLE`,
 *     which is already on the row, so there is no third state and nothing to clean up.
 *
 *  ── WHY THIS FILE HAS NO `import 'server-only'` AND MUST NEVER GAIN ONE ──────────────────────
 *  The model call is in `lib/nina/autotitle.ts`, alone, and this file is pure so that:
 *    1. `lib/nina/active.ts` can re-export the rename rule while staying client-safe. Phase 3
 *       declares that file pure and phase 6's `searchHitHref` is expected to import `SESSION_PARAM`
 *       out of it from a `'use client'` component.
 *    2. `NINA_SESSION_TITLE_MAX_CHARS` can be read by phase 5's rename input for its `maxLength`.
 *       `phase-5.md` calls that a hazard rather than a detail, and it is right: `lib/llm/client.ts`
 *       reaches `lib/env.ts`, which opens with `import 'server-only'`, and
 *       `components/ui/index.ts` documents at length what that does to a client import.
 *    3. Every rule below is unit-testable under `vitest.config.ts`'s `environment: 'node'`
 *       (invariant 7).
 *  `lib/nina/search.ts` beside `lib/nina/semantic.ts` (phase 6) is the same split for the same
 *  reason. A runtime import from `@/lib/llm/*`, `@/lib/db/*` or `./queries` does not belong here.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * How long a session title may be, in characters, after sanitising. **The set's one cap, imported.**
 *
 * Sixty, declared in phase 1's `lib/nina/sessions.ts` and imported here — see D3 for the
 * adjudication that put it there rather than in this file. Its reasoning is unchanged: R3's
 * automatic titles are three or four words, so this is not a constraint on the titler but the
 * ceiling on a MANUAL rename, and its job is to stop a pasted paragraph becoming a row in the
 * sidebar.
 *
 * ── ONE DECLARATION, ONE NAME, ONE VALUE ────────────────────────────────────────────────────
 * `lib/nina/sessions.ts` declares it; this file, `lib/nina/active.ts` and phase 5's `SessionRow`
 * all import it under this same name. There is no alias, no storage-versus-rule pair and no second
 * number. `sessions.ts` imports nothing at all, so a `'use client'` row can read the constant with
 * no argument about bundles — which is the property phase 5 needed and the reason it is the home.
 * **Do not re-declare it here.**
 */
import { NINA_SESSION_TITLE_MAX_CHARS } from '@/lib/nina/sessions'

/** Bumped by hand whenever the system prompt or the tool schema below changes. Logged, never sent. */
export const NINA_TITLE_PROMPT_VERSION = 1

/**
 * R3's "3-4 words", as the number of words KEPT.
 *
 * Four and not three: the requirement offers a range and the wider end loses less. There is no
 * matching minimum on purpose — see `sanitizeNinaModelTitle`.
 */
export const NINA_TITLE_MAX_WORDS = 4

/**
 * Above this many words the answer is refused instead of truncated.
 *
 * Six. Five or six words is a model that aimed at a title and overshot, and the first four of a
 * six-word noun phrase is still a noun phrase. Seven or more is prose — a sentence, a question, an
 * explanation, a refusal — and `lib/llm/narrate.ts` settles what to do with prose we cannot use:
 * "the only safe fallback for prose is the absence of prose". Cutting a sentence down to four words
 * invents a label out of the middle of a clause.
 */
export const NINA_TITLE_OVERSHOOT_WORDS = 6

/**
 * How many messages of the session the prompt may see.
 *
 * Six covers R3's trigger with room to spare: the first interaction is one runner message plus up
 * to four of her bubbles (RU-5's ceiling), so five, and the sixth is slack. A titler does not get
 * better with more of the conversation — it gets a bigger context to lose four words in, which is
 * the failure F07 measured when it "spent three of four prose fields on the one scalar that
 * happened to be in front of it".
 */
export const NINA_TITLE_TURN_LIMIT = 6

/**
 * How much of one message the prompt may see.
 *
 * `MAX_RUNNER_MESSAGE_CHARS` is 4000, so a first message can legitimately be a pasted training
 * plan. Four hundred characters is more than enough to name a topic and small enough that six of
 * them cannot crowd out the instruction.
 */
export const NINA_TITLE_SNIPPET_CHARS = 400

/**
 * ASCII control characters, replaced by a SPACE rather than removed: a pasted two-line title is
 * two words, not one run-together word. A pasted title can carry NULs and newlines, and the column
 * is a single-line label.
 *
 * No `eslint-disable` for `no-control-regex`: this config does not enable that rule, and phase 3's
 * `lib/nina/active.ts` carries no directive for the same character class either. A directive here
 * is an unused-directive warning rather than a suppression.
 */
const CONTROL_RE = /[\u0000-\u001F\u007F]/g

/**
 * The invisible characters `.trim()` does not remove, deleted outright.
 *
 * **This set is why this rule is not phase 3's rule.** Phase 3's class was `[\x00-\x1F\x7F]`, and a
 * paste carrying only `U+200B` survives it, passes its empty check, gets written and renders as a
 * blank sidebar row — indistinguishable from a rendering bug, which is the exact failure
 * `sessionTitleFor` exists to prevent. Bidi overrides (`U+202A-U+202E`, `U+2066-U+2069`) are in the
 * set too: one pasted into a row reverses the rendering of everything around it.
 *
 * **`U+200D` is deliberately NOT here.** It is the zero-width joiner; removing it explodes the
 * emoji family he typed into three separate people, and his own title is his to type (see
 * `sanitizeNinaSessionTitle`).
 */
const INVISIBLE_RE = /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/**
 * Emoji and the joiners that glue them together, stripped from a MODEL title only.
 *
 * Unicode property escapes need the `u` flag and `target: ES2022` supplies them; this is their
 * first use in the repo, and the alternative — an explicit range list — would be wrong the day a
 * new emoji block is assigned.
 */
const PICTOGRAPH_RE = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu

/** A title with no letter in it names nothing. Not global: `.test` only, so no `lastIndex`. */
const HAS_LETTER_RE = /\p{L}/u

/**
 * A label the model sometimes prefixes. Four spellings and NOT a general "strip anything before a
 * colon", which would mutilate the legitimate `Cedera lutut: kanan`.
 */
const LABEL_PREFIX_RE = /^(?:title|judul|session title|nama chat)\s*[:\-–—]\s*/i

/**
 * Markdown at either edge. Nothing renders markdown in a bubble or a row — the plan index's scope
 * section keeps it that way deliberately — so an asterisk would be shown literally.
 */
const MARKDOWN_EDGE_RE = /^[#>\-*_~\s]+|[*_~\s]+$/g

/** Sentence punctuation at the end. R3 asked for a name, and a name has no full stop. */
const TRAILING_PUNCT_RE = /[.,;:!?…]+$/

/**
 * A word that ends a clause, used ONLY when an overshoot was truncated.
 *
 * Slicing six words down to four can land mid-clause: `Cedera lutut kanan, sakit banget` becomes
 * `Cedera lutut kanan, sakit`, which reads as half a sentence rather than as a name — the same
 * objection D5 raises against truncating prose at all, arriving one branch later.
 * `TRAILING_PUNCT_RE` cannot see it, because after the slice the comma is interior.
 *
 * Cutting at the boundary instead yields `Cedera lutut kanan`, which is a noun phrase. The check is
 * gated on truncation having actually happened, so a legitimate `Cedera lutut: kanan` — three
 * words, never sliced — is left exactly as the model wrote it.
 */
const CLAUSE_END_RE = /[,;:]$/

/**
 * Wrapping quote pairs, stripped from a MODEL title. A quoted title is the model quoting itself.
 * ASCII first because it is the common case.
 */
const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['\u201C', '\u201D'],
  ['\u2018', '\u2019'],
  ['\u00AB', '\u00BB'],
]

/**
 * The cleaning both rules share: control characters to spaces, invisibles gone, whitespace
 * collapsed to single spaces, trimmed. After this the word rule can split on a plain `' '`.
 */
function cleanTitleText(raw: string): string {
  return raw.replace(CONTROL_RE, ' ').replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim()
}

/**
 * A loop and not one pass, because a model that quotes a quote returns `"'judul'"` and one pass
 * would leave the inner pair. It terminates: every iteration removes two characters or returns.
 */
function stripWrappingQuotes(value: string): string {
  let current = value
  for (;;) {
    const next = current.trim()
    const pair = QUOTE_PAIRS.find(
      ([open, close]) => next.length >= 2 && next.startsWith(open) && next.endsWith(close),
    )
    if (pair === undefined) return next
    current = next.slice(1, -1)
  }
}

/** Words, given that `cleanTitleText` has already collapsed every run of whitespace. */
function titleWords(value: string): string[] {
  return value.split(' ').filter((word) => word.length > 0)
}

/**
 * **The manual rename rule (R3's second half).** `unknown -> title | null`.
 *
 * `unknown` on purpose, on `parseNinaSessionParam`'s precedent: the caller is a Server Action and a
 * form value is whatever the client posted. `null` is "that is not a title", and
 * `lib/nina/sessionActions.ts` refuses rather than writing it — a session with a blank name is a
 * blank row in the sidebar, which is worse than the placeholder it replaced.
 *
 * ── WHAT THIS DOES NOT DO, AND WHY THE ASYMMETRY IS THE POINT ───────────────────────────────
 * No word rule, no emoji stripping, no quote stripping, no punctuation stripping. R3's "3-4 words"
 * is an instruction to the MODEL. This string is one he typed, and the model's output is a guess we
 * accept on his behalf while his input is an instruction — so `sanitizeNinaModelTitle` is
 * sceptical and this one is not. Stripping the emoji he chose is the app overruling him about his
 * own label.
 *
 * ── AN EMPTY RENAME IS REFUSED, NOT A REVERT ────────────────────────────────────────────────
 * Clearing a title is not a feature anybody asked for; he can rename it to something else. And
 * reverting `title` to NULL would put the session back inside the titler's reach, so "clear the
 * name" would silently mean "let the model rename this" — which is not what an empty input box
 * means.
 *
 * The final `.trim()` is not redundant: `.slice(0, 60)` can cut in the middle of a space.
 */
export function sanitizeNinaSessionTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = cleanTitleText(raw)
  if (cleaned.length === 0) return null
  return cleaned.slice(0, NINA_SESSION_TITLE_MAX_CHARS).trim()
}

/**
 * **R3's automatic title, from whatever the model actually returned.** `string -> title | null`.
 *
 * Every `null` below lands in the same place and it is a place that already exists: the session
 * keeps `title IS NULL`, `setNinaSessionTitleIfUntitled` is never called, and phase 1's
 * `sessionTitleFor` renders `SESSION_UNTITLED_TITLE`. Nothing is persisted on a refusal, so the
 * next turn tries again for free — `lib/llm/narrate.ts`'s rule about not recording a failure.
 *
 * ── THERE IS NO MINIMUM WORD COUNT, DELIBERATELY ────────────────────────────────────────────
 * A two-word `Cedera lutut` is a good name for a session. Enforcing "at least three" would discard
 * it in exchange for `Chat baru`, and Indonesian compounds make word count a poor proxy for how
 * much a phrase says. What is enforced is the MAXIMUM, because that is the one that breaks the
 * sidebar.
 */
export function sanitizeNinaModelTitle(raw: string): string | null {
  const cleaned = cleanTitleText(raw)
  if (cleaned.length === 0) return null

  const unlabelled = cleaned.replace(LABEL_PREFIX_RE, '')
  const unquoted = stripWrappingQuotes(unlabelled)
  const unmarked = unquoted.replace(MARKDOWN_EDGE_RE, '')
  const unpictured = unmarked.replace(PICTOGRAPH_RE, '')
  const collapsed = unpictured.replace(/\s+/g, ' ').trim()
  const unpunctuated = collapsed.replace(TRAILING_PUNCT_RE, '').trim()

  const words = titleWords(unpunctuated)
  if (words.length === 0) return null
  /* Seven words or more is prose, and there is no mechanical transformation from prose to a name. */
  if (words.length > NINA_TITLE_OVERSHOOT_WORDS) return null

  /* Five or six is an overshoot: keep the first four. Truncating can expose a comma, and when it
   * does the clause boundary is the better cut — see `CLAUSE_END_RE`. */
  let keptWords = words.slice(0, NINA_TITLE_MAX_WORDS)
  if (words.length > NINA_TITLE_MAX_WORDS) {
    const boundary = keptWords.findIndex((word) => CLAUSE_END_RE.test(word))
    if (boundary >= 0) keptWords = keptWords.slice(0, boundary + 1)
  }
  const kept = keptWords.join(' ').replace(TRAILING_PUNCT_RE, '').trim()

  if (kept.length === 0) return null
  /* Four words this long are token soup, and clamping would cut a word in half. Refuse instead. */
  if (kept.length > NINA_SESSION_TITLE_MAX_CHARS) return null
  if (!HAS_LETTER_RE.test(kept)) return null
  return kept
}

/**
 * The tool block's `input` -> a title, or nothing.
 *
 * **No Zod, and that is a considered choice.** `DistillPayloadSchema` and `describeInsightIssues`
 * exist because a five-field payload has interesting failure modes and there is a repair to inform.
 * There is no repair here (see `lib/nina/autotitle.ts`), and for `{ title?: unknown }` a type guard
 * is smaller, has no error type nobody reads, and is directly unit-testable.
 */
export function parseNinaTitle(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null
  const value = (raw as { title?: unknown }).title
  if (typeof value !== 'string') return null
  return sanitizeNinaModelTitle(value)
}

/** One message of the session, as the prompt wants it. Structurally a subset of `NinaMessageRow`. */
export interface NinaTitleTurn {
  role: 'runner' | 'nina'
  body: string
}

/**
 * The transcript the prompt sees. `HIM:` / `NINA:`, `prompts/distill.ts`'s labels.
 *
 * A message whose cleaned body is empty contributes NO line: R10 makes a photo with no caption a
 * legitimate send, so an empty `body` is an ordinary row and not a bug. Her reply is still in the
 * transcript and it says what she saw, which is a better input to a title than the raw
 * `nina_message_images.description` would be — see the plan's D7 for why that column is not read
 * here even though a prompt is its sanctioned consumer.
 *
 * `slice(0, NINA_TITLE_TURN_LIMIT)` is a clamp on the prompt's size and not a claim about which end
 * of the conversation matters: the caller reads at most that many rows.
 */
export function titleTranscript(turns: readonly NinaTitleTurn[]): string {
  const lines: string[] = []
  for (const turn of turns.slice(0, NINA_TITLE_TURN_LIMIT)) {
    const body = cleanTitleText(turn.body)
    if (body.length === 0) continue
    lines.push(
      `${turn.role === 'runner' ? 'HIM' : 'NINA'}: ${body.slice(0, NINA_TITLE_SNIPPET_CHARS)}`,
    )
  }
  return lines.join('\n')
}

/**
 * The user turn, or `null` for "do not call the model at all".
 *
 * The `null` is load-bearing: a session whose only messages are captionless photos produces an
 * empty transcript, and asking a model to name nothing costs tokens to receive an answer that would
 * be refused anyway.
 */
export function buildNinaTitleRequest(turns: readonly NinaTitleTurn[]): string | null {
  const transcript = titleTranscript(turns)
  if (transcript.length === 0) return null
  return `Name this conversation.\n\n${transcript}`
}

/**
 * **This is not Nina.** `prompts/distill.ts` recorded the finding and it applies exactly: "telling
 * it it is Nina makes it write in her register and editorialise". A titler told it is Nina returns
 * "eh gimana lutut lo" — her voice, addressed to him, useless as a label.
 *
 * ── THE LANGUAGE RULE IS HIS, NOT HERS (plan D8) ────────────────────────────────────────────
 * `prompts/system.ts`'s `LANGUAGE_RULE` ends "never translate his own slang back at him", and a
 * title is his words indexed. So the name is in the language HE used; the Indonesian placeholder
 * stays Indonesian because a placeholder is app chrome and not his words.
 *
 * ── AN EMPTY STRING IS A SANCTIONED ANSWER ──────────────────────────────────────────────────
 * The last paragraph gives the model a way to decline. Without it, a greeting-only exchange gets a
 * confabulated topic; with it, the answer is refused by `sanitizeNinaModelTitle`, the placeholder
 * stands, and the next turn tries again.
 */
export const NINA_TITLE_SYSTEM_PROMPT = `You name one conversation. You are an indexer, not a participant: you never speak to the runner, you never write in Nina's voice, and you never answer anything you read in the transcript.

Return the name through the "title" tool. Nothing else.

THE NAME
Three or four words. What the conversation is ABOUT — the topic, the injury, the race, the meal, the plan, the argument. A noun phrase, the way a folder is named.

IN HIS LANGUAGE
Write it in the language HE used. If he wrote Indonesian, the name is Indonesian; if he wrote English, the name is English. Never translate his own words into the other language — this name is how HE will find this conversation again.

NEVER
- A sentence, a question, or anything ending in a full stop.
- Quotation marks, backticks, markdown, emoji, or a "Title:" prefix. Just the words.
- The words chat, obrolan, percakapan, sesi, conversation. Every conversation is one of those, so the name would say nothing.
- His name, or yours.
- A greeting. "Halo pagi" names nothing — if he greeted you and then asked about his knee, the name is about his knee.

If the exchange is only a greeting, or nothing was really said, return the tool with an empty string. That is a correct answer, and it is better than a name that lies about what is in here.`

/**
 * `maxLength` inside `input_schema` is a JSON Schema keyword, not a request field — `DISTILL_TOOL`
 * already sends `maxItems` and `minimum` to this endpoint. `lib/llm/client.ts`'s warning about
 * unknown fields is about the REQUEST envelope (`strict`, `cache_control`, `temperature`), which
 * this body does not touch.
 *
 * The tool's property description is part of the prompt — `prompts/index.ts` says so of
 * `./tools.ts` and it is true here — so an edit to it bumps `NINA_TITLE_PROMPT_VERSION`.
 */
export const NINA_TITLE_TOOL: Anthropic.Tool = {
  name: 'title',
  description: 'Name this conversation in three or four words.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      title: {
        type: 'string',
        maxLength: NINA_SESSION_TITLE_MAX_CHARS,
        description:
          'REQUIRED. Three or four words naming what this conversation is about, in the language ' +
          'he used. No punctuation, no quotes, no emoji, no prefix. An empty string if the ' +
          'exchange says nothing worth naming.',
      },
    },
  },
}
