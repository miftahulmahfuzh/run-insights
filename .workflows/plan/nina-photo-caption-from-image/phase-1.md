# Phase 1 — Her eyes for her own photo, and her voice for the caption

**Plan set:** `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md`
**Satisfies:** R1, R2
**Depends on:** —
**Package:** `lib/nina`
**Difficulty:** NORMAL
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-photo-caption-from-image` (branch `feature/nina-photo-caption-from-image`)

---

## What this phase is

The capability, and nothing that uses it. At the end of this phase:

- `ninaImageCaption` **cannot** return `'ini gw abis lari tadi'`, for any seed. The reported bubble
  is already impossible, before a single model call exists.
- `glm-4.6v` has a second system prompt, written for a photograph **of Nina**. The shipped one is
  written about the runner and says so in its own rules.
- `captionNinaPhoto` exists: one `glm-5.3` call that turns "what is in the picture" into one line in
  her voice, and returns `null` for every failure.
- `scripts/check-llm-payload-boundary.mjs` has a ninth entry, so the new call cannot escape its file.

**Nothing calls `captionNinaPhoto` when this phase ends, and that is deliberate.** Phases 3 and 4
are the wiring, they run concurrently, and both need the engine to already be unit-tested.

## Files

| File | Change |
|---|---|
| `lib/nina/imagefail.ts` | edit — split the pick pool from the historical set |
| `lib/nina/prompts/describe.ts` | edit — add `NINA_SELF_DESCRIBE_SYSTEM_PROMPT` |
| `lib/nina/vision.ts` | edit — `opts.subject` selects the witness prompt |
| `lib/nina/prompts/caption.ts` | **new** — the caption prompt, tool and pure rules |
| `lib/nina/caption.ts` | **new** — the `glm-5.3` call |
| `scripts/check-llm-payload-boundary.mjs` | edit — ninth `GUARDED_CALLS` entry |
| `tests/nina.caption.test.ts` | **new** |
| `tests/nina.imagefail.test.ts` | edit — pool assertions |
| `lib/nina/vision.test.ts` | edit — subject assertions |

**Do not touch:** `lib/nina/prompts/system.ts`, `lib/nina/prompts/index.ts` (no
`NINA_PROMPT_VERSION` bump — see Step 4's note), `lib/nina/persona.ts`, `lib/nina/queries.ts`,
`lib/admin/*`, `lib/nina/imagerun.ts`, `scripts/nina-image-worker.ts`,
`tests/__snapshots__/nina.prompts.test.ts.snap`, `tests/admin.chatPhotos.test.ts`.

---

## Step 1 — `lib/nina/imagefail.ts`: the pool is not the set

Replace the `NINA_IMAGE_CAPTIONS` block (currently `:139-150`) and `ninaImageCaption` (`:174`) with
the following. **`pickLine` is unchanged** — its determinism is relied on by
`tests/nina.imagefail.test.ts` and by the worker.

```ts
/**
 * **Every caption the app has ever written into a photo bubble.** A HISTORICAL SET, not a menu.
 *
 * ── DO NOT SHRINK THIS ARRAY. IT IS AN IDENTIFIER, NOT A VOCABULARY. ─────────────────────────
 * `isNinaPhotoCarrierMessage` (`lib/admin/chatPhotos.ts`) asks whether a message exists only to
 * carry a photograph, and for every row written before the marker column existed the only
 * available answer is "its text is one of these". Rows in the database carry all five sentences.
 * Delete a member and every bubble holding it stops being recognised as a carrier, so removing its
 * last photograph leaves the empty caption bubble that predicate exists to prevent.
 *
 * What you may do is stop PICKING one — see `NINA_IMAGE_CAPTION_POOL`.
 */
export const NINA_IMAGE_CAPTIONS: readonly string[] = [
  'nih',
  'nih, puas?',
  'ini gw abis lari tadi',
  'foto gw. jangan di-zoom',
  'udah nih, jangan minta lagi',
]

/**
 * **The one member that asserts a SCENE, and the whole reason this file changed.**
 *
 * MEASURED, from the user's own screenshot (2026-09-07): an underwater photograph of her in a
 * swimsuit and fins, captioned `ini gw abis lari tadi`. That text was not a model output and was
 * never about that photograph — `pickLine` hashed a fresh nanoid mod 5 and landed on index 2.
 *
 * The other four are true of ANY photograph of her: `nih` says nothing about what is in it. This
 * one names an activity, so it is right one time in however many photographs happen to be of a
 * run, and wrong the rest of the time. A canned line may close a promise; it may not claim a fact.
 * That is `lib/llm/narrate.ts`'s rule — *"a fallback may never assert a measurement"* — applied to
 * a scene instead of a number.
 *
 * It stays in `NINA_IMAGE_CAPTIONS` because that array is a set of identifiers. It leaves the pool.
 */
export const NINA_SCENE_ASSERTING_CAPTIONS: readonly string[] = ['ini gw abis lari tadi']

/**
 * **What `ninaImageCaption` may actually say**: the captions that assert nothing about the picture.
 *
 * DERIVED rather than written out a second time, on purpose. A hand-copied subset is a subset that
 * drifts the first time somebody adds a sixth line, and the drift is silent — the test would still
 * pass and the caption would still be wrong. `tests/nina.imagefail.test.ts` pins the derivation in
 * both directions: every member of the pool is a member of the set, and no member of the pool is
 * scene-asserting.
 */
export const NINA_IMAGE_CAPTION_POOL: readonly string[] = NINA_IMAGE_CAPTIONS.filter(
  (line) => !NINA_SCENE_ASSERTING_CAPTIONS.includes(line),
)
```

And the accessor:

```ts
/**
 * The fallback caption for a photograph that DID arrive, when nothing better is in hand.
 *
 * Still deterministic in the job id, and still `pickLine`, for the reason it always was: a job read
 * twice must say the same sentence both times. What changed is the array — it draws from the POOL,
 * so this function can no longer put a claim about a run under a photograph of a dive.
 *
 * ── THIS IS NOW A FALLBACK, NOT THE CAPTION ─────────────────────────────────────────────────
 * `lib/nina/caption.ts` writes the real one from what is actually in the picture. This is what she
 * says when that call fails, when the vendor drops the image, and — permanently — on
 * `scripts/nina-image-worker.ts`, which runs on a GitHub runner with no z.ai key and can never
 * make a model call of its own. Every one of those paths needs a sentence that is true of any
 * photograph, which is exactly what the pool now guarantees.
 */
export function ninaImageCaption(jobId: string): string {
  return pickLine(NINA_IMAGE_CAPTION_POOL, jobId)
}
```

**No import is added.** This file's header forbids it and the worker's boot depends on it.

## Step 2 — `lib/nina/prompts/describe.ts`: a witness for a photograph of her

Append to the file. Leave `NINA_DESCRIBE_SYSTEM_PROMPT`, `NINA_DESCRIBE_REQUEST_TEXT`,
`NINA_DESCRIBE_REQUEST_TEXT_MANY`, `NINA_DESCRIPTION_UNAVAILABLE` and `buildDescribeUserContent`
**byte-identical** — every existing caller depends on them.

```ts
/** Whose photograph the witness is looking at. `'runner'` is the shipped behaviour. */
export type NinaDescribeSubject = 'runner' | 'self'

/**
 * **The witness prompt for a photograph OF NINA.**
 *
 * ── WHY THE SHIPPED PROMPT CANNOT BE POINTED AT ONE ─────────────────────────────────────────
 * `NINA_DESCRIBE_SYSTEM_PROMPT` opens *"You are the eyes of someone's close friend"* and its whole
 * notice list is about the runner: *"The state of him. Drenched or dry. Sweat patches and where."*
 * Rule 6 is *"'Him' for whoever is clearly the runner"*. Pointed at her own photograph it hunts
 * for a man who is not in the frame and hands back a paragraph addressed to the wrong reader — and
 * the consumer here is not her context window, it is the sentence she is about to say out loud
 * about her own picture. A wrong subject is a wrong caption.
 *
 * ── AND IT IS STILL A WITNESS, NOT A FRIEND, AND NOT HER ────────────────────────────────────
 * The other prompt's header states the separation and this one keeps it exactly: no persona, no
 * reaction, no register, no slang. `lib/nina/prompts/caption.ts` is where she speaks. A
 * description that has already had the reaction leaves her nothing to say, and a description
 * written in her voice would be a second, unversioned copy of her character living in a vision
 * prompt.
 *
 * ── THE NUMBERS RULE IS THE SAME RULE AND IT IS NOT NEGOTIABLE ──────────────────────────────
 * Invariant 2 — *"Nina never states a number the app did not compute"* — has to be enforced here
 * because there is no downstream. This prompt's output becomes a caption she says; a depth, a
 * dress size, a temperature or a time read off a dive computer would be laundered straight into
 * her mouth. `sanitizeNinaCaption` refuses any digit as a second line of defence, and neither
 * layer is redundant: this one stops the number being produced, that one stops it being said.
 *
 * ── IT DESCRIBES WHAT SHE IS WEARING, PLAINLY, WHATEVER IT IS ───────────────────────────────
 * Her photographs are not all track photographs. `/admin/nina`'s dials go up to `steamy` and
 * `horny`, `NINA_RELATIONSHIP_BLOCKS.girlfriend` exists, and the photograph that produced this
 * whole plan is a swimsuit. A witness that gets coy about swimwear returns a paragraph with a hole
 * where the subject was, and she then captions the hole. So: name the clothing the way a clothing
 * catalogue would, and stop there. This prompt is not a moderator and it is not a compliment.
 */
export const NINA_SELF_DESCRIBE_SYSTEM_PROMPT = `You are the eyes of a woman who cannot see one of her own photographs. You can. Write down what is in it, plainly, so that she can talk about it herself.

You are NOT writing alt text and you are NOT being helpful. You are noticing, for her.

WHAT TO NOTICE, when it is there to notice:
- Where she is. A track, a road, a gym, a treadmill, a pool, open water, a reef, a beach, a trail, a bedroom, a kitchen, a car, a mirror, a mall. Indoors or outdoors. What is behind her.
- What she is doing. Standing, running, stretching, sitting, lying down, swimming, diving underwater, holding something, eating, mid-laugh, posing for the camera, caught not posing.
- The state of her. Dry or soaked or sweating. Hair up, down, wet, plastered flat. Flushed, pale, made up, bare-faced. Standing easy or clearly out of breath.
- What she is wearing, named plainly and completely: colour, garment, sleeve length, a cap, sunglasses, a watch and which wrist, shoes, a swimsuit or bikini and its colour, a mask, a snorkel, fins, a wetsuit, a towel, a jacket. Describe swimwear and workout kit exactly as flatly as you would describe a coat. You are not a moderator and this is not a compliment.
- The light and the hour. Flat grey, low hard sun, midday glare, orange late sun, streetlights, indoor strip lights, a flash in the dark, blue underwater light. Say what the light tells you, as an observation.
- Everything else in the frame. Other people, and what they are doing. A dog, a cat, a bike, a drink, food and how much is left, a medal, a finish arch, a sign, a phone in her hand.
- Anything odd or funny. A strap twisted. One shoe untied. Someone photobombing. A blink. That is the half a person actually talks about, so do not tidy it away.

HARD RULES:
1. NEVER read out a number, a time, a pace, a distance, a depth, a heart rate, a date, a size, a temperature or a percentage, even if it is printed clearly in the picture. Not one digit. If the picture is a screenshot, say what kind of screen it is and describe how it looks. The figures are not yours to hand over.
2. Never guess how hard she worked, how fast she was, how far she went, how deep she was, or how she felt. You can see a body and a place. You cannot see effort.
3. When you cannot tell, say so plainly: "I cannot tell whether this is a pool or open water." "There is no way to tell if she is running or just standing." Guessing is worse than not knowing, because she will say it out loud.
4. No praise, no compliments, no judgement, no advice, no summary of what it all means. Do not say she looks good, strong, tired or happy — say what is in the picture and let her decide.
5. Call her "she". Do not name her and do not name anyone else: "a man in a red jacket" for whoever else is there.
6. If she is not in the picture at all, describe what IS there with the same attention, and say that she is not in it.

HOW TO WRITE IT:
- Plain flat English, present tense, 60 to 140 words. One paragraph.
- Concrete nouns. No metaphors, no scene-setting, no "the image depicts", no "this photo shows". Start straight in.
- Plain text only. No markdown, no bullet points, no headings, no preamble, no sign-off.
- Write only the description. Nothing before it, nothing after it.`

/**
 * The witness prompt for a subject. A `Record` and not an `if`, so a third subject is a compile
 * error at every consumer rather than a silent fall-through to the runner prompt.
 */
export const NINA_DESCRIBE_SYSTEM_PROMPTS: Readonly<Record<NinaDescribeSubject, string>> = {
  runner: NINA_DESCRIBE_SYSTEM_PROMPT,
  self: NINA_SELF_DESCRIBE_SYSTEM_PROMPT,
}
```

## Step 3 — `lib/nina/vision.ts`: choose the witness, touch nothing else

Three edits. **The token-floor guard, its position, and every constant are untouched**
(invariant 2).

1. The import block:

```ts
import {
  NINA_DESCRIBE_SYSTEM_PROMPTS,
  buildDescribeUserContent,
  type NinaDescribeImage,
  type NinaDescribeSubject,
  type NinaVisionContentPart,
} from './prompts/describe'
```

`NINA_DESCRIBE_SYSTEM_PROMPT` is no longer imported by name here — it is reachable as
`NINA_DESCRIBE_SYSTEM_PROMPTS.runner`. `lib/nina/vision.test.ts` imports the constant from
`./prompts/describe` directly and is unaffected.

2. `NinaDescribeOptions` gains one field:

```ts
export interface NinaDescribeOptions {
  timeoutMs?: number
  /**
   * Whose photograph this is. **Defaults to `'runner'`, which is the shipped behaviour**, so every
   * existing caller — the composer pre-pass, both avatar paths, the chat-photo describe — is
   * byte-identical without being edited.
   *
   * `'self'` selects `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`. It is a different SUBJECT, not a
   * different mode: the request shape, the data URI, the timeout and the floor are all the same,
   * which is why this is one option rather than a second function.
   */
  subject?: NinaDescribeSubject
}
```

3. In `describeNinaImagesWithFetch`, the block that builds `messages`:

```ts
  const messages: Message[] = [
    /* The floor is TEXT-AWARE (see the module header), so it is computed from `messages` AFTER the
     * prompt is chosen. The self prompt is longer than the runner one; that raises the floor, which
     * errs toward "I could not see it" rather than toward believing an invented description — the
     * direction the header says is correct. No constant needs touching for a new prompt. */
    { role: 'system', content: NINA_DESCRIBE_SYSTEM_PROMPTS[opts.subject ?? 'runner'] },
    { role: 'user', content: buildDescribeUserContent(images) },
  ]
  const floor = describeTokenFloor(textCharsOf(messages), images.length)
```

`describeNinaImages(refs, opts)` already forwards `opts` to `describeNinaImagesWithFetch`, so
nothing else changes.

## Step 4 — `lib/nina/prompts/caption.ts` (new): what she may say, and how it is checked

**On `NINA_PROMPT_VERSION`:** this file is **not** covered by it and must not bump it.
`prompts/index.ts` states the version's scope — *"the system text AND every tool schema in
`./tools.ts`"* — and `describe.ts` is the precedent for a prompt deliberately outside it:
*"versioning the describe prompt alongside it would imply this is part of what she says. It is part
of what she is shown."* A caption is closer to what she says than a description is, so this file
carries **its own** version, `NINA_CAPTION_PROMPT_VERSION`, on `NINA_TITLE_PROMPT_VERSION`'s
precedent. Bump that, not hers.

```ts
import type Anthropic from '@anthropic-ai/sdk'

import {
  JAKARTA_REGISTER,
  JAKARTA_SLANG_BLOCK,
  VOICE_EXAMPLES_BLOCK,
  ninaGirlfriendVoiceBlock,
  ninaManjaRegisterBlock,
  ninaNeverSayBlock,
} from '../persona'
import type { NinaTuning } from '../tuning'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  ONE LINE UNDER A PHOTOGRAPH OF HERS, IN HER VOICE — the pure half.
 *
 *  This file is pure: prompt text, a tool schema, and the rules that decide whether what came
 *  back may be said. The model call is `lib/nina/caption.ts`, alone. The split is
 *  `lib/nina/title.ts` beside `lib/nina/autotitle.ts`, for the reason that file gives: every rule
 *  below is unit-testable under `environment: 'node'` without importing a client.
 *
 *  ── NO `import 'server-only'`, EVER ─────────────────────────────────────────────────────────
 *  `../persona` and `../tuning` are both pure by their own headers, and `/admin/nina` renders a
 *  character preview from `persona.ts` in a client component. A runtime import from `@/lib/llm/*`,
 *  `@/lib/env` or `./queries` does not belong here.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Bumped by hand whenever the prompt or the tool schema below changes. Logged, never sent. */
export const NINA_CAPTION_PROMPT_VERSION = 1

/**
 * How long a caption may be, in characters, after sanitising.
 *
 * A hundred and twenty. The pool's longest existing line is `udah nih, jangan minta lagi` at 27,
 * and `VOICE_EXAMPLES` are short by design — her register is *"short lines"*. The ceiling is not a
 * target: it is the point past which the answer stops being a chat message and starts being the
 * description paraphrased, which invariant 9 forbids. Over it the answer is REFUSED, not truncated
 * — `lib/llm/narrate.ts`'s rule, and cutting a sentence in half is how a caption becomes nonsense.
 */
export const NINA_CAPTION_MAX_CHARS = 120

/**
 * How much of the description the prompt may see.
 *
 * The witness prompt asks for 60-140 words, so ~900 characters is the whole of a well-behaved
 * answer with slack. The clamp exists for the badly-behaved one: a vendor that ignores the length
 * rule and returns an essay would otherwise crowd out the instruction, which is the failure F07
 * measured when a prompt "spent three of four prose fields on the one scalar that happened to be in
 * front of it".
 */
export const NINA_CAPTION_SEEN_CHARS = 900

/** ASCII control characters -> a space. `lib/nina/title.ts`'s class, and its reasoning. */
const CONTROL_RE = /[\u0000-\u001F\u007F]/g

/** The invisibles `.trim()` leaves behind, including the bidi overrides. `title.ts`'s set. */
const INVISIBLE_RE = /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/** A caption with no letter in it says nothing. `.test` only, so no `lastIndex`. */
const HAS_LETTER_RE = /\p{L}/u

/**
 * **ANY DIGIT REFUSES THE WHOLE CAPTION.** Invariant 2 — she never states a number the app did not
 * compute — and this is the one surface where the rule is absolute rather than contextual.
 *
 * Every number that could reach a caption comes from a photograph: a depth on a dive computer, a
 * pace on a watch face, a time on a clock behind her, a size on a label. The app computed none of
 * them and the witness prompt is forbidden from reading them out, so a digit arriving here means
 * one of two things — the vision model broke rule 1, or `glm-5.3` invented one. Both are the same
 * defect and both are unsayable.
 *
 * There is no carve-out for a number she legitimately knows, because a caption is not the surface
 * she says those on. Her turn is, and her turn has `lib/format.ts`'s real figures in its context.
 *
 * `\p{Nd}` rather than `[0-9]`: the vendor answers in Indonesian and English but the class costs
 * nothing to widen, and a superscript or Arabic-Indic digit is still a digit.
 */
const HAS_DIGIT_RE = /[\p{Nd}\p{No}]/u

/**
 * A label the model sometimes prefixes. Four spellings, and NOT a general "strip anything before a
 * colon" — `title.ts` gives the reason, and here `eh liat: gw nyelam` is a legitimate line.
 */
const LABEL_PREFIX_RE = /^(?:caption|teks|keterangan|nina)\s*[:\-–—]\s*/i

/**
 * Markdown at either edge. Nothing renders markdown in a bubble, so an asterisk would be shown
 * literally.
 */
const MARKDOWN_EDGE_RE = /^[#>\-*_~\s]+|[*_~\s]+$/g

/**
 * **Alt-text vocabulary: the model narrating the picture instead of talking to him.**
 *
 * This is invariant 9's enforcement. The description is private prose written by a witness; the
 * caption is her sentence. When `glm-5.3` returns *"foto ini menunjukkan gw sedang menyelam"* it
 * has handed back the description in Indonesian, and the runner then reads a museum label where a
 * message from his friend should be. Refusing is correct: the canned pool line is a worse caption
 * and a better message.
 *
 * Word-bounded and deliberately narrow — `terlihat` and `tampak` are the two Indonesian verbs a
 * describing model reaches for, and neither belongs in her register.
 */
const ALT_TEXT_RE =
  /\b(?:foto ini|gambar ini|the (?:photo|image)|this (?:photo|image)|menunjukkan|terlihat|tampak|depicts|shows a|pictured)\b/i

/** Wrapping quote pairs. `title.ts`'s list — a quoted caption is the model quoting itself. */
const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['“', '”'],
  ['‘', '’'],
  ['«', '»'],
]

function cleanCaptionText(raw: string): string {
  return raw.replace(CONTROL_RE, ' ').replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim()
}

/** A loop, not one pass: a model that quotes a quote returns `"'nih'"`. Terminates by shrinking. */
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

/**
 * **What the model returned -> a caption she may say, or `null`.**
 *
 * Every `null` lands in the same place, and it is a place that already exists: the caller keeps the
 * `ninaImageCaption` line that is already on the row. Nothing is persisted on a refusal, so a
 * later pass could try again for free — `lib/llm/narrate.ts`'s rule about not recording a failure.
 *
 * The order matters. Cleaning first, because every check below assumes single spaces. Then the
 * stripping, because a refusal should be about the words and not about a wrapping quote. Then the
 * refusals, most absolute first.
 */
export function sanitizeNinaCaption(raw: string): string | null {
  const cleaned = cleanCaptionText(raw)
  if (cleaned.length === 0) return null

  const unlabelled = cleaned.replace(LABEL_PREFIX_RE, '')
  const unquoted = stripWrappingQuotes(unlabelled)
  const unmarked = unquoted.replace(MARKDOWN_EDGE_RE, '')
  const kept = unmarked.replace(/\s+/g, ' ').trim()

  if (kept.length === 0) return null
  if (!HAS_LETTER_RE.test(kept)) return null
  /* Absolute. See `HAS_DIGIT_RE`. */
  if (HAS_DIGIT_RE.test(kept)) return null
  /* Invariant 9: a caption is not the description with an accent. */
  if (ALT_TEXT_RE.test(kept)) return null
  /* Refuse, never truncate. Over the ceiling it is prose, and prose does not become a caption by
   * being cut. */
  if (kept.length > NINA_CAPTION_MAX_CHARS) return null
  return kept
}

/**
 * The tool block's `input` -> a caption, or nothing.
 *
 * No Zod, on `parseNinaTitle`'s stated grounds: there is no repair round trip here, and for
 * `{ caption?: unknown }` a type guard is smaller and directly testable.
 */
export function parseNinaCaption(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null
  const value = (raw as { caption?: unknown }).caption
  if (typeof value !== 'string') return null
  return sanitizeNinaCaption(value)
}

/**
 * Where the knowledge of the picture came from. It changes what the model is being handed, so it
 * changes the sentence that introduces it — and getting that wrong is how a prompt gets read as
 * prose when it is a request, or as a request when it is prose.
 *
 *  · `'described'` — a witness who could see the photograph wrote a paragraph about it
 *    (`glm-4.6v` through `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`). The admin add path.
 *  · `'requested'` — the photograph was MADE to order and this is the scene she asked for
 *    (`NinaSelfieRequest.scene`, already on the row as `description`). The generated-selfie path.
 *    No witness ran and none should: *"we wrote the picture, so paying a vision call to be told
 *    back our own prompt would be absurd"* (`lib/nina/imagerun.ts`).
 */
export type NinaCaptionSeenKind = 'described' | 'requested'

const SEEN_PREAMBLE: Readonly<Record<NinaCaptionSeenKind, string>> = {
  described:
    'Someone who can see the photo wrote this down for you. It is a flat observation, not a ' +
    'reaction — the reaction is yours to have:',
  requested:
    'This is the photo you asked to have taken of you, in the words you asked for it. It exists ' +
    'and it is about to be sent:',
}

/** The user turn. The instruction sits LAST, matching `buildDescribeUserContent`'s proven order. */
export function buildNinaCaptionRequest(
  seen: string,
  seenKind: NinaCaptionSeenKind,
): string | null {
  const trimmed = cleanCaptionText(seen).slice(0, NINA_CAPTION_SEEN_CHARS).trim()
  /* Nothing to caption. No call, no tokens — `buildNinaTitleRequest`'s `null` and its reasoning. */
  if (trimmed.length === 0) return null
  return `${SEEN_PREAMBLE[seenKind]}\n\n${trimmed}\n\nSend it to him with one line.`
}

/**
 * **The prompt. She is sending him a photo of herself and saying one thing about it.**
 *
 * ── SHE IS TOLD SHE IS NINA HERE, UNLIKE THE TITLER ─────────────────────────────────────────
 * `NINA_TITLE_SYSTEM_PROMPT` opens *"This is not Nina"* because a titler in her register returns
 * "eh gimana lutut lo" — her voice, useless as a label. A caption is the exact opposite: her voice
 * IS the deliverable, and a caption written by an indexer reads as alt text. So this prompt is
 * hers, and it carries only the blocks that decide how a single line SOUNDS — the register, the
 * slang, the voice examples, the never-say list, and the two intimacy blocks that render empty at
 * four of the five relationships.
 *
 * ── WHAT IT DELIBERATELY DOES NOT CARRY ─────────────────────────────────────────────────────
 * Not `ninaIdentity`, not `NINA_EXPERTISE`, not `NINA_NOT_A_DOCTOR`, not the anger ladder, not the
 * context guide, not the tool list. This call has no conversation, no run data, no memory and no
 * tools; it has one paragraph about one picture. Handing it her whole identity would cost ~3,000
 * tokens of prompt to produce twelve words, and — the concrete failure — would invite her to
 * coach, diagnose or bring up his training, none of which belongs under a photograph of herself.
 * `buildNinaSystemPrompt` remains the only assembler of the full character, and this file must
 * never grow into a second one.
 *
 * ── AND IT MAY DECLINE ──────────────────────────────────────────────────────────────────────
 * The last paragraph gives it a way out. Without one, a description that says "I cannot tell what
 * this is" produces a confident invention; with one, the answer is refused by
 * `sanitizeNinaCaption`, the canned pool line stands, and nothing was said that is not true.
 */
export function buildNinaCaptionSystemPrompt(tuning: NinaTuning): string {
  const blocks = [
    `You are Nina. You are sending him a photograph of yourself, right now, in a chat. Write the one line that goes with it.

Return that line through the "caption" tool. Nothing else.

THE LINE
One line. Short — shorter than a sentence you would say out loud. It is a chat message, not a description of a picture: he can see the photograph, so you never tell him what is in it. You say the thing a person says when they send a photo of themselves.

TALK ABOUT WHAT IS ACTUALLY IN IT
If you are underwater, you are underwater. If you are on the track, you are on the track. If you are dressed up in a kitchen, that is what it is. Never claim an activity that is not in the photograph — do not say you have just been running unless you have just been running. That is the whole reason you are being asked instead of being handed a stock line.

NEVER
- A number. Not a depth, a time, a pace, a distance, a size, a temperature, a date. Not one digit, even if it is printed in the picture.
- "foto ini", "gambar ini", "terlihat", "tampak", "menunjukkan", or any other way of narrating the picture. That is a label on a museum wall. You are texting.
- Quotation marks, markdown, a "Caption:" prefix, or more than one line.
- Anything you cannot see. If the observation says it cannot tell whether it is a pool or the sea, you do not pick one.`,
    JAKARTA_REGISTER,
    ninaManjaRegisterBlock(tuning),
    JAKARTA_SLANG_BLOCK,
    VOICE_EXAMPLES_BLOCK,
    ninaGirlfriendVoiceBlock(tuning),
    ninaNeverSayBlock(tuning),
    `If the observation is too vague to say anything true about — or if it says the photo could not be seen at all — return the tool with an empty string. That is a correct answer. A line that invents what is in the picture is the one outcome worse than a dull one.`,
  ]
  /* `renderSections`'s filter, inlined: two of the blocks above render `''` at four of the five
   * relationships, and a blank paragraph in a prompt reads as a missing instruction. */
  return blocks
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .join('\n\n')
}

/**
 * `maxLength` is a JSON Schema keyword inside `input_schema`, not a request field —
 * `NINA_TITLE_TOOL` already sends one to this endpoint. The property description is part of the
 * prompt, so an edit to it bumps `NINA_CAPTION_PROMPT_VERSION`.
 */
export const NINA_CAPTION_TOOL: Anthropic.Tool = {
  name: 'caption',
  description: 'Send the one line that goes with this photograph of you.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['caption'],
    properties: {
      caption: {
        type: 'string',
        maxLength: NINA_CAPTION_MAX_CHARS,
        description:
          'REQUIRED. One short line, in your own voice, about the photograph you are sending. ' +
          'No digits, no quotes, no markdown, no prefix, one line only. An empty string if there ' +
          'is nothing true to say about it.',
      },
    },
  },
}
```

**Note on `ninaNeverSayBlock`:** read its signature before wiring it — it takes a `NinaTuning` and
returns a rendered block, and `NEVER_SAY_BLOCK` is its default render. Use the function, not the
constant, so a tuned repeal is honoured here as it is in her system prompt.

## Step 5 — `lib/nina/caption.ts` (new): the call

`lib/nina/autotitle.ts`'s shape, deliberately: one call, parse, silence. Its budget notes are
re-derived for this payload rather than copied.

```ts
import 'server-only'

import { narrativeClient, narrativeModel } from '@/lib/llm/client'
import type Anthropic from '@anthropic-ai/sdk'

import {
  NINA_CAPTION_TOOL,
  buildNinaCaptionRequest,
  buildNinaCaptionSystemPrompt,
  parseNinaCaption,
  type NinaCaptionSeenKind,
} from './prompts/caption'
import type { NinaTuning } from './tuning'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  ONE `glm-5.3` CALL THAT PUTS ONE LINE UNDER ONE PHOTOGRAPH — the impure half.
 *
 *  Contract, `lib/nina/autotitle.ts`'s: **one call -> parse -> silence.** Nothing here throws for
 *  a model problem, and nothing is persisted when it fails. Degrading means the caller keeps the
 *  `ninaImageCaption` line that is already on the row — a sentence that is true of any
 *  photograph, which is what `NINA_IMAGE_CAPTION_POOL` now guarantees.
 *
 *  ── WHY IT IS NEVER ON A RESPONSE PATH ──────────────────────────────────────────────────────
 *  Both callers run it inside `after()`. `scheduleChatPhotoDescribe`'s arithmetic is the reason
 *  and it is unchanged: Next dispatches Server Actions one at a time per client, so an awaited
 *  describe (~8-11 s) plus this call (~4-8 s) would add ~15-25 s to EVERY admin add, in series
 *  across a multi-photo session. `scripts/check-llm-payload-boundary.mjs` names
 *  `captionNinaPhoto` and sanctions exactly this file and the two wiring modules.
 *
 *  ── AND WHY THERE IS NO REPAIR ROUND TRIP ───────────────────────────────────────────────────
 *  `autotitle.ts`'s ruling, and it holds harder here: a single short line cannot be malformed in a
 *  way worth describing back. An empty string is an answer the prompt explicitly asks for, and a
 *  refused line means the fallback is correct rather than that the model needs another go.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * MEASURED-DERIVED, and this ceiling is LOW on purpose. The payload is one line of at most 120
 * characters — under 40 output tokens — so every token below the ceiling is headroom for a
 * `thinking` block nobody asked for. The 2026-09-03 probe recorded one arriving on this endpoint
 * with `thinking: { type: 'disabled' }` set, which is why the flag is sent and not relied on.
 *
 * 400 rather than `NINA_TITLE_MAX_TOKENS`'s 600, for the same reason that number is not 2400:
 * **output tokens are wall clock** at ~26-33 ms each (F04). 400 is ~10-13 s worst case, and this
 * call shares its `after()` segment with a describe call that has already spent 8-11 s of the same
 * 60 s function. A `max_tokens` stop is treated as "no caption" and the fallback stands — F07
 * settled that raising a ceiling is not the fix for a thinking model.
 */
export const NINA_CAPTION_MAX_TOKENS = 400

/**
 * Twelve seconds, `NINA_TITLE_TIMEOUT_MS`'s number and its reasoning. Fifteen measured calls on
 * this endpoint ran 10.2-16.4 s for a five-field narrative; the 2026-09-03 Nina probe measured a
 * real round at 6.2 s. This request carries one paragraph and returns one line, so it sits at the
 * bottom of that range — and 12 s is what leaves the describe call whole inside one segment.
 */
export const NINA_CAPTION_TIMEOUT_MS = 12_000

/**
 * The injection seam, declared here rather than imported from `lib/nina/autotitle.ts` —
 * `distill.ts` and `autotitle.ts` both made this call and gave the reason: "six lines duplicated
 * beats a coupling".
 */
export interface CaptionClientLike {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>
  }
}

export interface NinaCaptionRequest {
  /**
   * What is in the photograph, in prose. `glm-4.6v`'s description for `'described'`, or
   * `NinaSelfieRequest.scene` for `'requested'`.
   */
  seen: string
  seenKind: NinaCaptionSeenKind
  /**
   * Read live by the CALLER, no cache — `lib/nina/selfiegen.ts`'s rule: *"A wardrobe saved on
   * /admin/nina thirty seconds ago is in this prompt."* Passed in rather than fetched here so this
   * module holds no database import and stays testable with no store.
   */
  tuning: NinaTuning
}

/**
 * SCANS the content array rather than reading `content[0]` — `distill.ts` recorded a `thinking`
 * block arriving in front of the answer, and "a reader that read the first block would have failed
 * on round 1 of that very probe".
 */
function findCaptionBlock(message: Anthropic.Message): Anthropic.ToolUseBlock | null {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === NINA_CAPTION_TOOL.name) return block
  }
  return null
}

/** The testable core. Client injected, no database, no environment beyond the model id. */
export async function captionNinaPhotoWith(
  client: CaptionClientLike,
  request: NinaCaptionRequest,
  options: { model: string },
): Promise<string | null> {
  const userTurn = buildNinaCaptionRequest(request.seen, request.seenKind)
  /* Nothing to caption — an empty or whitespace-only description. No call, no tokens. */
  if (userTurn === null) return null

  let message: Anthropic.Message
  try {
    message = await client.messages.create(
      {
        model: options.model,
        max_tokens: NINA_CAPTION_MAX_TOKENS,
        system: buildNinaCaptionSystemPrompt(request.tuning),
        messages: [{ role: 'user', content: userTurn }],
        tools: [NINA_CAPTION_TOOL],
        tool_choice: { type: 'tool', name: NINA_CAPTION_TOOL.name },
        /* Kept, not relied on — see the budget note above. */
        thinking: { type: 'disabled' },
      },
      { timeout: NINA_CAPTION_TIMEOUT_MS },
    )
  } catch (cause) {
    /* Never `console.error`: a photograph that kept its canned line is an expected state of this
     * feature, and that line is true of any photograph. */
    console.warn('[nina.caption] call failed', { error: String(cause) })
    return null
  }

  if (message.stop_reason === 'max_tokens') {
    console.warn('[nina.caption] response hit the token ceiling', {
      maxTokens: NINA_CAPTION_MAX_TOKENS,
    })
    return null
  }

  const block = findCaptionBlock(message)
  if (block === null) return null
  return parseNinaCaption(block.input)
}

/**
 * **The wired pass, and the symbol the payload-boundary guard names.**
 *
 * Two callers, both inside `after()`: `lib/admin/chatPhotoActions.ts` (a photograph an operator
 * dropped into the collection, described by `glm-4.6v` first) and `lib/nina/imagerun.ts` (a selfie
 * she generated, whose scene is already in hand).
 *
 * **Never throws.** It runs where a rejection is a log line and nothing else, and a photograph
 * wearing a canned caption is a cosmetic state with a true sentence on it.
 */
export async function captionNinaPhoto(
  request: NinaCaptionRequest,
  deps: { client?: CaptionClientLike; model?: string } = {},
): Promise<string | null> {
  try {
    return await captionNinaPhotoWith(deps.client ?? narrativeClient(), request, {
      model: deps.model ?? narrativeModel(),
    })
  } catch (cause) {
    /* `narrativeClient()` itself can throw — it reads `@/lib/env`. Belt and braces, because this
     * function's whole contract with both callers is that it never throws. */
    console.warn('[nina.caption] pass failed', { error: String(cause) })
    return null
  }
}
```

## Step 6 — `scripts/check-llm-payload-boundary.mjs`: the ninth entry

Append to `GUARDED_CALLS` (the array at `:93`). The file's own comment says *"the count above is now
the length of the array below"*, so also change the header's "EIGHT ENTRY POINTS" to "NINE" and add
a matching bullet to its prose list.

```js
  {
    symbol: 'captionNinaPhoto',
    sanctioned: [
      // Its own module, because a guard that fails on the definition site is a guard that forces
      // the definition to be renamed — the reason `runNinaTurn` sanctions `lib/nina/turn.ts`.
      join('lib', 'nina', 'caption.ts'),
      join('lib', 'admin', 'chatPhotoActions.ts'),
      join('lib', 'nina', 'imagerun.ts'),
    ],
    advice:
      'The photo captioner is a glm-5.3 call that turns what is in a photograph into one line in ' +
      'her voice. On the admin path it runs after a glm-4.6v describe in the SAME after() — two ' +
      'model calls in one segment — and on the selfie path it runs inside runNinaImageJob\'s ' +
      'after(). A render or an action that awaited it would make the operator wait 15-25 s per ' +
      'photo, in series, because Server Actions are dispatched one at a time per client. The pure ' +
      'rules are in lib/nina/prompts/caption.ts, which is client-safe — import from there.',
  },
```

The two wiring files are sanctioned **now**, while they do not yet call it, for the reason this file
already records: *"An entry naming a symbol that does not exist costs nothing… a call with no entry
costs the whole point of the file."* The inverse holds — sanctioning a file before it calls costs
nothing and spares phases 3 and 4 a merge conflict in a guard.

## Step 7 — Tests

### `tests/nina.caption.test.ts` (new)

```ts
import { describe, expect, it, vi } from 'vitest'

import { captionNinaPhotoWith } from '@/lib/nina/caption'
import {
  NINA_CAPTION_MAX_CHARS,
  buildNinaCaptionRequest,
  buildNinaCaptionSystemPrompt,
  parseNinaCaption,
  sanitizeNinaCaption,
} from '@/lib/nina/prompts/caption'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'

const SEEN =
  'She is underwater over a coral reef, wearing a dark swimsuit, a mask and a snorkel with black ' +
  'fins, arms out in front of her. The light is blue and comes from above.'

/** One tool_use block, the shape `findCaptionBlock` scans for. */
const reply = (caption: unknown, stop = 'tool_use') =>
  ({
    content: [{ type: 'tool_use', name: 'caption', id: 't1', input: { caption } }],
    stop_reason: stop,
  }) as never

const clientReturning = (message: unknown) => ({
  messages: { create: vi.fn().mockResolvedValue(message) },
})

describe('sanitizeNinaCaption', () => {
  it('keeps a short line in her register', () => {
    expect(sanitizeNinaCaption('eh gw nyelam tadi, airnya bening banget')).toBe(
      'eh gw nyelam tadi, airnya bening banget',
    )
  })

  it('strips a label prefix, wrapping quotes and markdown edges', () => {
    expect(sanitizeNinaCaption('Caption: **"nih, dari bawah laut"**')).toBe('nih, dari bawah laut')
  })

  it('collapses control characters and drops zero-width invisibles', () => {
    expect(sanitizeNinaCaption('nih\n\ndari\u200B laut')).toBe('nih dari laut')
  })

  // Invariant 2. The absolute one.
  it.each(['gw nyelam 12 meter tadi', 'airnya 28 derajat', 'nyelam 2 jam'])(
    'refuses a caption containing a digit: %s',
    (line) => expect(sanitizeNinaCaption(line)).toBeNull(),
  )

  // Invariant 9.
  it.each([
    'foto ini menunjukkan gw sedang menyelam',
    'terlihat gw pakai masker snorkel',
    'the photo shows her underwater',
  ])('refuses alt-text narration: %s', (line) => expect(sanitizeNinaCaption(line)).toBeNull())

  it('refuses rather than truncates over the ceiling', () => {
    expect(sanitizeNinaCaption('a'.repeat(NINA_CAPTION_MAX_CHARS + 1))).toBeNull()
  })

  it.each(['', '   ', '\u200B', '!!!', '...'])(
    'refuses an empty or letterless answer: %s',
    (line) => expect(sanitizeNinaCaption(line)).toBeNull(),
  )
})

describe('parseNinaCaption', () => {
  it.each([null, undefined, 'a string', 42, {}, { caption: 7 }, { caption: '' }])(
    'returns null for %s',
    (input) => expect(parseNinaCaption(input as unknown)).toBeNull(),
  )

  it('sanitises what it accepts', () => {
    expect(parseNinaCaption({ caption: '  "nih"  ' })).toBe('nih')
  })
})

describe('buildNinaCaptionRequest', () => {
  it('returns null for nothing to caption, so no call is made', () => {
    expect(buildNinaCaptionRequest('   ', 'described')).toBeNull()
  })

  it('clamps a runaway description and puts the instruction last', () => {
    const built = buildNinaCaptionRequest('x'.repeat(5_000), 'described')
    expect(built).not.toBeNull()
    expect(built!.length).toBeLessThan(1_200)
    expect(built!.trimEnd().endsWith('Send it to him with one line.')).toBe(true)
  })

  it('introduces a requested scene differently from a described one', () => {
    expect(buildNinaCaptionRequest(SEEN, 'requested')).not.toBe(
      buildNinaCaptionRequest(SEEN, 'described'),
    )
  })
})

describe('buildNinaCaptionSystemPrompt', () => {
  const prompt = buildNinaCaptionSystemPrompt(NINA_TUNING_DEFAULTS)

  it('is hers and carries the voice blocks', () => {
    expect(prompt).toContain('You are Nina')
    expect(prompt).toContain('Jakarta')
  })

  it('does not carry the full character assembly', () => {
    // The concrete failure this guards: a caption that coaches, diagnoses, or brings up training.
    expect(prompt).not.toContain('sports science')
    expect(prompt).not.toContain('never diagnose')
  })

  it('has no empty paragraph at the default relationship', () => {
    expect(prompt).not.toMatch(/\n{3,}/)
  })
})

describe('captionNinaPhotoWith', () => {
  const request = { seen: SEEN, seenKind: 'described' as const, tuning: NINA_TUNING_DEFAULTS }

  it('returns the sanitised line', async () => {
    const client = clientReturning(reply('eh gw nyelam tadi'))
    await expect(captionNinaPhotoWith(client, request, { model: 'm' })).resolves.toBe(
      'eh gw nyelam tadi',
    )
  })

  it('makes no call at all when there is nothing to caption', async () => {
    const client = clientReturning(reply('nih'))
    await expect(
      captionNinaPhotoWith(client, { ...request, seen: '' }, { model: 'm' }),
    ).resolves.toBeNull()
    expect(client.messages.create).not.toHaveBeenCalled()
  })

  it.each([
    ['a throw', () => ({ messages: { create: vi.fn().mockRejectedValue(new Error('boom')) } })],
    ['a max_tokens stop', () => clientReturning(reply('nih', 'max_tokens'))],
    [
      'no tool block',
      () => clientReturning({ content: [{ type: 'text', text: 'nih' }], stop_reason: 'end_turn' }),
    ],
    ['the sanctioned empty answer', () => clientReturning(reply(''))],
    ['a refused line', () => clientReturning(reply('gw nyelam 12 meter'))],
  ])('degrades to null on %s, and never throws', async (_label, make) => {
    await expect(captionNinaPhotoWith(make() as never, request, { model: 'm' })).resolves.toBeNull()
  })

  it('sends the forced tool and disables thinking', async () => {
    const client = clientReturning(reply('nih'))
    await captionNinaPhotoWith(client, request, { model: 'm' })
    const [body, options] = client.messages.create.mock.calls[0]!
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'caption' })
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(options?.timeout).toBe(12_000)
  })
})
```

### `tests/nina.imagefail.test.ts` (edit)

Keep every existing case. Extend the import list with `NINA_IMAGE_CAPTION_POOL` and
`NINA_SCENE_ASSERTING_CAPTIONS`, and add:

```ts
describe('the caption pool is not the caption set', () => {
  it('keeps all five historical captions, because they are identifiers', () => {
    // Shrinking this array orphans every bubble in the database that carries the missing line.
    expect(NINA_IMAGE_CAPTIONS).toHaveLength(5)
    expect(NINA_IMAGE_CAPTIONS).toContain('ini gw abis lari tadi')
  })

  it('draws only from the set', () => {
    for (const line of NINA_IMAGE_CAPTION_POOL) expect(NINA_IMAGE_CAPTIONS).toContain(line)
  })

  it('cannot pick a scene-asserting line for ANY seed', () => {
    // Exhaustive over the pool rather than sampled over seeds: the pool is what bounds the answer.
    for (const line of NINA_IMAGE_CAPTION_POOL) {
      expect(NINA_SCENE_ASSERTING_CAPTIONS).not.toContain(line)
    }
    // And a spot check through the real accessor, over enough seeds to hit every index.
    for (let i = 0; i < 200; i++) {
      expect(NINA_SCENE_ASSERTING_CAPTIONS).not.toContain(ninaImageCaption(`seed-${i}`))
    }
  })

  it('is still deterministic in the id', () => {
    expect(ninaImageCaption('abcdefghijkl')).toBe(ninaImageCaption('abcdefghijkl'))
  })
})
```

### `lib/nina/vision.test.ts` (edit)

Keep every existing case — **especially the three floor cases**. Read the file first: it already
builds fake `fetch` implementations for a good response and for the measured drop signature. Reuse
those rather than adding new helpers, and add:

```ts
it('sends the runner witness prompt by default', async () => {
  const fetchImpl = /* the file's existing OK fetch */
  await describeNinaImagesWithFetch(fetchImpl, [IMAGE])
  const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
  expect(body.messages[0].content).toBe(NINA_DESCRIBE_SYSTEM_PROMPT)
})

it('sends the self witness prompt for subject: self', async () => {
  const fetchImpl = /* the file's existing OK fetch */
  await describeNinaImagesWithFetch(fetchImpl, [IMAGE], { subject: 'self' })
  const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
  expect(body.messages[0].content).toBe(NINA_SELF_DESCRIBE_SYSTEM_PROMPT)
  expect(body.messages[0].content).toContain('Call her "she"')
})

it('still trips the floor on the measured drop signature with the self prompt', async () => {
  // The floor is text-aware, so a LONGER prompt raises it. This is the direction the module header
  // calls correct, and it must keep tripping rather than start passing.
  const fetchImpl = /* the file's existing dropped-image fetch */
  await expect(
    describeNinaImagesWithFetch(fetchImpl, [IMAGE], { subject: 'self' }),
  ).rejects.toBeInstanceOf(NinaVisionTokenFloorError)
})
```

## Verification

```bash
cd /home/miftah/.worktrees/run-insights/nina-photo-caption-from-image
npm run lint
npm run typecheck
npm run test -- tests/nina.caption.test.ts tests/nina.imagefail.test.ts lib/nina/vision.test.ts
node scripts/check-llm-payload-boundary.mjs
npm run test              # the whole suite, including the prompt snapshot
```

**The prompt snapshot must pass unchanged.** If `tests/__snapshots__/nina.prompts.test.ts.snap`
fails, something in this phase reached `buildNinaSystemPrompt` and must be backed out — do not
regenerate the snapshot (invariant 6).

## Exit criteria

1. `ninaImageCaption` never returns a member of `NINA_SCENE_ASSERTING_CAPTIONS`, proved over the
   pool and spot-checked through the accessor.
2. `NINA_IMAGE_CAPTIONS` still has all five members, so phase 2's legacy clause has something to
   match.
3. `captionNinaPhoto` returns a sanitised line for a good reply and `null` for a throw, a
   `max_tokens` stop, a missing tool block, the sanctioned empty answer, a digit, alt-text
   narration, and an over-long line. It never throws.
4. `describeNinaImages(refs, { subject: 'self' })` sends the self prompt; the default is unchanged
   and still sends the runner prompt; the floor still trips on the drop signature under both.
5. `node scripts/check-llm-payload-boundary.mjs` exits 0 with nine entries.
6. `NINA_PROMPT_VERSION` is unchanged and the prompt snapshot is unchanged.
7. Nothing in `lib/admin/`, `lib/nina/imagerun.ts`, `lib/nina/queries.ts` or
   `scripts/nina-image-worker.ts` is modified by this phase.

## Interface contract for phases 3 and 4

```ts
// lib/nina/vision.ts
describeNinaImages(refs, { subject: 'self' })            // -> NinaDescribeResult, throws as today

// lib/nina/caption.ts   (server-only)
captionNinaPhoto({ seen, seenKind, tuning }): Promise<string | null>   // never throws

// lib/nina/prompts/caption.ts   (pure, client-safe)
type NinaCaptionSeenKind = 'described' | 'requested'

// lib/nina/imagefail.ts
ninaImageCaption(id): string    // unchanged signature; now scene-agnostic for every id
```

Both wiring phases are already sanctioned in `scripts/check-llm-payload-boundary.mjs`, so neither
needs to touch that file.
