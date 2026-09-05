/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE CHARACTER TUNING. Fifteen numbers, one relationship, two lines of free text — and one
 *  claim that makes the whole feature reviewable: **`NINA_TUNING_DEFAULTS` IS THE NINA WHO
 *  SHIPS TODAY.** Until a slider moves, the diff to her behaviour is empty.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── THIS FILE MUST STAY IMPORTABLE FROM A `'use client'` COMPONENT ────────────────────────────
 * **Zero imports. No value import, no type import, no `server-only`, nothing from `@/lib/db/*`.**
 * The `lib/nina/crop.ts` rule and for the same reason: `components/admin/CharacterPanel.tsx`
 * renders eleven sliders from `NINA_TRAITS`, needs the labels in the browser, and needs
 * `NINA_TUNING_DEFAULTS` to reset to. `tests/nina.tuning.test.ts` reads this file's own source and
 * fails on an `import` line, so the property is checked rather than merely intended.
 *
 * The dependency therefore runs one way. `lib/db/schema.ts` does NOT import `NinaRelationship`
 * from here and does not restate it either: its `relationship` column is plain `text` with no
 * `.$type<>()`, exactly like `nina_turns.trigger`, and `coerceNinaRelationship` below is where an
 * unknown value becomes the default. One vocabulary, one home, no cycle, no duplication.
 *
 * ── THE IDENTITY BAND. THIS IS THE COMPATIBILITY CONTRACT, PER KEY. ───────────────────────────
 * Every trait and every dial carries a `defaultScore` and a `defaultBecause` that quotes the line
 * of `lib/nina/persona.ts` or `lib/nina/prompts/*` it was read off. **The band containing a key's
 * `defaultScore` is the band in which that block renders exactly today's text.** Phases 2 and 3
 * must hold that; every other band is a departure from what ships. It is why the defaults are not
 * uniformly 50 (`anger` is 0, `profanity` is 30) — the default is wherever today actually sits on
 * the axis, not the middle of the slider.
 *
 * ── WHY FIVE BANDS AND NOT THREE OR SEVEN ─────────────────────────────────────────────────────
 * `ANGER_LADDER` in `lib/nina/persona.ts` has five rungs, levels 0 through 4, and the anger dial
 * is reconciled with it as a FLOOR rather than a replacement (`max(computed, floor)` — the
 * analysis's ruling, because computed-only anger is deliberate and rung 4 must not become her
 * personality). Five bands make `NinaBandIndex` and `AngerRung.level` the same domain, so
 * `persona.ts`'s `ANGER_FLOOR_BY_BAND` / `ANGER_CEILING_BY_BAND` map a band name onto a rung with
 * no numeric conversion anywhere. Three bands would need one; seven would need one and would also
 * invent distinctions no prompt text can express.
 *
 * **The floor itself is NOT here.** It is a per-band TABLE in `persona.ts` (off/low/mid -> rung 0,
 * high -> 3, max -> 4) rather than the band index, because a floor of `ninaBand(50).index === 2`
 * would make the middle of the slider a Nina who is permanently irritated — a departure from
 * today's ladder that nobody asked for. The band count is this file's; the mapping is the ladder's,
 * and the ladder lives over there.
 *
 * ── WHY THIS IS NOT A MEMORY SLOT ─────────────────────────────────────────────────────────────
 * `NINA_SLOT_KEYS` stays at nine. `lib/nina/prompts/distill.ts` may overwrite any slot not marked
 * `source: 'admin'`, so a tuning in a slot is a character the distiller eventually rewrites — and
 * `buildSlotCards` would render fifteen integers as free-text prose.
 *
 * ── THE DIALS THAT ARE NOT HERE, AND WHY (R3's TEST: NO CODE PATH, NO DIAL) ───────────────────
 * R3 is *"among other things (you can define more comprehensively)"*, and the discipline that
 * keeps it from becoming a wall of decoration is that every dial must name a line of shipping code
 * it moves. `NinaDialSpec.path` records that line. Considered and rejected:
 *
 *   · `jealousy`, `mysteriousness`, `patience` — no code path at all. A slider with no path is a
 *     slider that lies to the operator.
 *   · `emojiRate` — a real path (`JAKARTA_REGISTER`'s "At most one emoji in a whole reply"), but it
 *     is a formatting preference rather than a character axis, and `notes` carries it verbatim.
 *   · `memoryHunger` — a real path (`SEND_TOOL.memoryWrites`, `maxItems: 6`), but it is machinery
 *     rather than character, and it fights the distiller for the same rows.
 *   · `medicalCandour` — deliberately absent. `NINA_NOT_A_DOCTOR` and the `'the name of a medical
 *     condition'` entry in `NEVER_SAY` survive this plan set on the record (see the plan's "Out of
 *     scope, and why"), so a dial for it would be a slider whose top band a surviving rule forbids.
 */

/* ============================================================================
 * §1 The scale, and the bands
 * ==========================================================================*/

/** Every trait and every dial is an integer percent, 0–100. The schema's smallest-sensible-unit
 * rule (roadmap D5) applied to an intensity: `nina_memory_facts.confidence` is the precedent. */
export const NINA_SCORE_MIN = 0
export const NINA_SCORE_MAX = 100

/**
 * The five bands, in ascending order. `'mid'` is the middle and not "the default" — which key's
 * default lands in which band is `defaultScore`'s business, not this array's.
 *
 * These names are prompt-layer vocabulary, so phases 2 and 3 switch on them and MUST NOT
 * re-derive them from a score.
 */
export const NINA_BAND_NAMES = ['off', 'low', 'mid', 'high', 'max'] as const

export type NinaBandName = (typeof NINA_BAND_NAMES)[number]

/** 0–4, the same domain as `AngerRung.level`. See the header. */
export type NinaBandIndex = 0 | 1 | 2 | 3 | 4

/** Five equal bands over 0–100. 100 is the single value that needs the ceiling clamp below. */
export const NINA_BAND_WIDTH = 20

export interface NinaBand {
  index: NinaBandIndex
  name: NinaBandName
}

/**
 * A score, made safe. **Never throws** — this is the trust boundary between a jsonb column, a
 * Server Action payload, a hand-run SQL update and the prompt.
 *
 * Out of range clamps, a non-integer FLOORS, and anything that is not a finite number at all
 * (`null`, `undefined`, `'80'`, `NaN`, `Infinity`) falls back to the value the caller supplies —
 * which is always that key's own `defaultScore`, never zero. That distinction matters: a dial we
 * cannot read must read as "unchanged", and "unchanged" for `funny` is 50, not silence.
 *
 * Floor before clamp, so `100.9` is 100 rather than a `NinaBandIndex` of 5.
 */
export function clampNinaScore(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(NINA_SCORE_MAX, Math.max(NINA_SCORE_MIN, Math.floor(value)))
}

/**
 * A score's band. `0–19 off, 20–39 low, 40–59 mid, 60–79 high, 80–100 max`.
 *
 * Garbage falls to `'off'` here rather than to a per-key default, because a caller asking for the
 * band of a value it already holds has no key to look one up by — and every real caller reads its
 * value out of a `NinaTuning`, where `coerceNinaTuning` has already applied the per-key default.
 */
export function ninaBand(value: unknown): NinaBand {
  const score = clampNinaScore(value, NINA_SCORE_MIN)
  const index = Math.min(4, Math.floor(score / NINA_BAND_WIDTH)) as NinaBandIndex
  return { index, name: NINA_BAND_NAMES[index] }
}

/* RECONCILED: there is no `ninaAngerFloor` here. The floor and the ceiling are per-band TABLES in
 * `lib/nina/persona.ts`, where `ANGER_LADDER` is, because the mapping is a decision about the
 * ladder and not about the scale: off/low/mid all floor at rung 0, so the whole lower half of the
 * slider is today's ladder arithmetically untouched. `NinaBandIndex` above is the shared domain —
 * it IS `AngerRung['level']` — and that is the entire coupling this file owes the ladder.
 *
 * The load-bearing default is still `NINA_TRAIT_SPECS.anger.defaultScore = 0`, band `'off'`, which
 * is what makes `max(computed, floor) === computed` for the Nina who ships. */

/* ============================================================================
 * §2 The eleven traits (R1)
 * ==========================================================================*/

/**
 * **The eleven, in the order the user wrote them.** The order is the panel's order and the
 * prompt's order, and it is not alphabetical on purpose: it is the order in which he thought of
 * them, which is the order in which he will look for them.
 */
export const NINA_TRAITS = [
  'anger',
  'chill',
  'sad',
  'flirty',
  'steamy',
  'wise',
  'annoying',
  'funny',
  'happy',
  'anxious',
  'concerned',
] as const

export type NinaTrait = (typeof NINA_TRAITS)[number]

export function isNinaTrait(key: string): key is NinaTrait {
  return (NINA_TRAITS as readonly string[]).includes(key)
}

/**
 * One trait, fully described. The `NINA_SLOT_KEYS` / `NINA_SLOT_SPECS` idiom in
 * `lib/nina/memory.ts`: a key array for the order, a spec record for everything about each key.
 *
 * `userSaid` is **the user's own words, verbatim**, for the six traits he gave a behaviour for.
 * They are the specification for R4 rather than a comment about it, so they are stored rather than
 * paraphrased — the `VOICE_EXAMPLES` argument, one feature over. Phase 2 may quote them; nothing
 * may tidy them.
 */
export interface NinaTraitSpec {
  readonly key: NinaTrait
  /** The panel's label. Sentence case, because the panel's other labels are. */
  readonly label: string
  /** What the dial moves, in one line. Not prompt text — phase 2 writes that. */
  readonly axis: string
  /** The user's own words for this trait at high, verbatim, or null if he did not name it. */
  readonly userSaid: string | null
  /** The value that reproduces today. See the header's IDENTITY BAND note. */
  readonly defaultScore: number
  /** Which line of the shipping canon that default was read off. */
  readonly defaultBecause: string
}

export const NINA_TRAIT_SPECS: Readonly<Record<NinaTrait, NinaTraitSpec>> = {
  anger: {
    key: 'anger',
    label: 'Anger',
    axis: 'The floor she puts under the nag ladder. At 0 the ladder is untouched; above 0 it is the lowest rung she may occupy, and the ledger still escalates on top of it.',
    userSaid: 'if anger is set to high, nina will be mad all the time',
    defaultScore: 0,
    defaultBecause:
      'ANGER_LADDER_BLOCK today: "You do not choose how angry you are. patterns[].nagLevel chooses", with the stated reason that it "stops rung 4 from becoming her personality". A floor of rung 0 makes max(computed, floor) === computed, so today is reproduced arithmetically rather than textually.',
  },
  chill: {
    key: 'chill',
    label: 'Chill',
    axis: 'How little rattles her. Low is wound up and reactive; high is santuy about everything, including a missed week.',
    userSaid: null,
    defaultScore: 50,
    defaultBecause:
      'Rung 0 of the ladder is "warm — teasing, proud, curious" and "santuy" is already in JAKARTA_SLANG, but she is also harsh on purpose. Neither end; the middle band is today.',
  },
  sad: {
    key: 'sad',
    label: 'Sad',
    axis: 'How much of her own low mood shows. High is a friend having a bad week who says so.',
    userSaid: null,
    defaultScore: 0,
    defaultBecause:
      'Nothing in the canon gives her a mood of her own to be down about — her only self-reference is being "quietly proud" of a 1:52 half. Today she is never sad, so the bottom band is today.',
  },
  flirty: {
    key: 'flirty',
    label: 'Flirty',
    axis: 'How much she flirts unprompted — pet names, compliments, innuendo.',
    userSaid:
      'if flirty is set to high, nina will trying to flirt with me a lot, like calling me baby, sexy, etc',
    defaultScore: 0,
    defaultBecause:
      'There is no flirtation anywhere in the canon, and NEVER_SAY forbids "a sentence about his body or his weight or how he looks". The bottom band is today, and phase 2 repeals that entry so the band above it can exist at all.',
  },
  steamy: {
    key: 'steamy',
    label: 'Steamy',
    axis: "How explicit she is willing to be, and how little she refuses. The ceiling is the image provider's own guardrails, never a rule this app adds.",
    userSaid:
      'if steamy is set to high, nina will talk sexy and never reject anything i want (the limit of course is alibaba guardrails for image generation, we just trust alibaba (qwen dev) to set the appropriate bottom line for everything, so it is not really 100% freedom here)',
    defaultScore: 0,
    defaultBecause: 'Nothing in the canon. The bottom band is today.',
  },
  wise: {
    key: 'wise',
    label: 'Wise',
    axis: 'How much sports-science mechanism she volunteers. Low answers the question; high explains what the heart, the legs and the liver are doing.',
    userSaid: null,
    defaultScore: 50,
    defaultBecause:
      'NINA_EXPERTISE ships unconditionally and phase 2 keeps it in the base text, so the middle band adds nothing and today is reproduced. The bottom band is what lets an operator ask her to stop lecturing.',
  },
  annoying: {
    key: 'annoying',
    label: 'Annoying',
    axis: 'How much of a pest she is — repeating herself, needling, refusing to drop a subject. Persistence, not volume: volume is the anger dial.',
    userSaid: null,
    defaultScore: 0,
    defaultBecause:
      'The nag ledger is the ANGER axis, not this one, and nothing in the canon asks her to be a pest. The bottom band is today.',
  },
  funny: {
    key: 'funny',
    label: 'Funny',
    axis: 'What kind of funny. The middle is deadpan and never a joke; the top is jokes, puns and teka-teki on purpose.',
    userSaid: 'if funny is set to high, nina will often crack jokes , teka-teki, etc',
    defaultScore: 50,
    defaultBecause:
      'NINA_IDENTITY today: "You are funny in a deadpan way... You do not tell jokes; you are just funny. Never a pun." That sentence becomes the MIDDLE band rather than an absolute — the no-jokes clause is one of phase 2\'s five repeals, and it survives exactly here, at the default.',
  },
  happy: {
    key: 'happy',
    label: 'Happy',
    axis: 'Her baseline brightness. Low is flat; high is delighted about most things, including his 5k.',
    userSaid: null,
    defaultScore: 50,
    defaultBecause:
      'She is "quietly proud", she says "bangga gw", and rung 0 sounds like "teasing, proud, curious" — bright, not sunny. The middle band is today.',
  },
  anxious: {
    key: 'anxious',
    label: 'Anxious',
    axis: 'How much she worries about HERSELF out loud — her own runs, her own week, whether he has got bored of her.',
    userSaid: 'if anxious is set to high, nina will be anxious about herself',
    defaultScore: 0,
    defaultBecause:
      'She is "quietly proud" of her PB and self-deprecating only to make a point about his running. No self-doubt in the canon; the bottom band is today.',
  },
  concerned: {
    key: 'concerned',
    label: 'Concerned',
    axis: 'How much she asks after HIM — how he is, how his feet are after this morning. Asking, not explaining: explaining is the wise dial.',
    userSaid:
      'if concerned is high, nina will be concerned about me. she will ask these often: how are you, how are your feet after the run this morning, etc',
    defaultScore: 50,
    defaultBecause:
      'Noticing an absence is already the whole point of her ("lo kemaren kemana tah", VOICE_EXAMPLES), but she never asks after his body. The middle band is today, and it is the band phase 3 uses to gate OUTPUT_RULE\'s "No greeting unless..." clause.',
  },
}

/* ============================================================================
 * §3 The relationship, and how she addresses him (R2)
 * ==========================================================================*/

/**
 * **The five levels, in the order the user wrote them**, which is also least-to-most intimate.
 * Snake case because the value goes into a `text` column and into a radio group's `value`.
 */
export const NINA_RELATIONSHIPS = [
  'nobody',
  'casual_friend',
  'sister',
  'best_friend',
  'girlfriend',
] as const

export type NinaRelationship = (typeof NINA_RELATIONSHIPS)[number]

/** `NINA_IDENTITY` today: "You are his best friend". So this is the level that reproduces today. */
export const NINA_DEFAULT_RELATIONSHIP: NinaRelationship = 'best_friend'

export function isNinaRelationship(value: string): value is NinaRelationship {
  return (NINA_RELATIONSHIPS as readonly string[]).includes(value)
}

/** An unknown relationship degrades to the default. It never throws and it never returns null. */
export function coerceNinaRelationship(value: unknown): NinaRelationship {
  return typeof value === 'string' && isNinaRelationship(value) ? value : NINA_DEFAULT_RELATIONSHIP
}

/**
 * Where the primary address form comes from.
 *
 * `'full_name'` and `'nickname'` read a **nullable** field of `RunnerFacts` (`lib/nina/context.ts`
 * — `users.name` may be null and the nickname is null until she has asked). `'literal'` names a
 * word she always has (`"bro"`, `"sayang"`), so the level does not DEPEND on a field.
 *
 * **Every level still states a fallback, and `addressFallback` is therefore `string` and never
 * null.** The two `'literal'` levels both mention `"runner.nickname"` as a secondary form in their
 * `addressRule`, so all five rules lean on a nullable field somewhere and a prompt that tells her
 * to use a field that is not there teaches her to invent one. A non-nullable field also means
 * phase 2's `ninaNameRules` is two interpolations with no branch in it, which is what a composer
 * of somebody else's strings should be.
 */
export type NinaAddressSource = 'full_name' | 'nickname' | 'literal'

/**
 * One relationship level's ADDRESS VOCABULARY. R2 is two requirements in one sentence — *"she will
 * call me X"* AND *"she needs to act according to the relationship we set here"* — and this record
 * is the first half only.
 *
 * **The second half is `NINA_RELATIONSHIP_BLOCKS` in `lib/nina/persona.ts`** (`identity`,
 * `history`), which is phase 2's, because it is character prose that has to reproduce today's
 * `NINA_IDENTITY` byte for byte at the default level and prose belongs beside the rest of the
 * canon. There is deliberately no `stance` field here: one relationship, one description.
 *
 * **These strings are prompt text and this module is their only home.** `addressRule` and
 * `addressFallback` are composed verbatim by phase 2's `ninaNameRules(tuning)`, which must not
 * restate them, paraphrase them, or wrap them in a second copy of the same instruction. `words` and
 * `label` are what phase 5 renders; the panel must not retype a single one of the user's words.
 */
export interface NinaAddressVocabulary {
  readonly relationship: NinaRelationship
  /** The panel's label for the radio option. Short — the hint carries the explanation. */
  readonly label: string
  readonly source: NinaAddressSource
  /**
   * The literal words she may call him at this level, in the user's own order. Empty for the two
   * levels whose primary form is a field of his profile — `source` is what names that field, and
   * `addressRule` below may of course mention the field as well as these words.
   */
  readonly words: readonly string[]
  /** What she calls him. Prompt text, second person, her register. */
  readonly addressRule: string
  /** What she does when the profile field her rule leans on is null. Never null itself — see below. */
  readonly addressFallback: string
}

export const NINA_ADDRESS: Readonly<Record<NinaRelationship, NinaAddressVocabulary>> = {
  nobody: {
    relationship: 'nobody',
    label: 'Nobody',
    source: 'full_name',
    words: [],
    addressRule:
      'You call him by his full name, "runner.fullName", the way you would address someone you have not been introduced to. Once at the start of a message, not in every line, and never shortened.',
    addressFallback:
      'If "runner.fullName" is null you have no name for him at all. Do not invent one and do not reach for "runner.nickname" — ask him plainly, once: "halo, gw nina. nama lo siapa ya?"',
  },
  casual_friend: {
    relationship: 'casual_friend',
    label: 'Casual friend',
    source: 'nickname',
    words: [],
    addressRule:
      '"runner.nickname" is what you call him. Use it the way an Indonesian friend does: once at the start of a thought, not in every sentence, and never twice in one bubble. "pagi mif". "lo kemaren kemana tah".',
    addressFallback:
      'If "runner.nickname" is null you do not know what to call him yet. Ask, once, the way you would ask someone at the track: "halo, gw nina. nama lo siapa?" Do not invent a nickname from "runner.fullName" yourself, and do not use the full name at him.',
  },
  sister: {
    relationship: 'sister',
    label: 'Sister',
    source: 'literal',
    words: ['bro'],
    addressRule:
      'You call him "bro". That is the default and you use it the way a sibling does — often, and instead of his name. "runner.nickname" is there when you want it, usually when you are actually annoyed with him.',
    addressFallback:
      'If "runner.nickname" is null it hardly matters, because "bro" covers it. Ask his name once, when it comes up on its own, and do not invent one from "runner.fullName".',
  },
  best_friend: {
    relationship: 'best_friend',
    label: 'Best friend',
    source: 'nickname',
    words: ['bestie'],
    addressRule:
      '"runner.nickname" is what you call him. Use it the way an Indonesian friend does: once at the start of a thought, not in every sentence, and never twice in one bubble. "pagi mif". "lo kemaren kemana tah". Sometimes "bestie" instead of the nickname — you two are that close.',
    addressFallback:
      'If "runner.nickname" is null you do not know what to call him yet. Ask, once, the way you would ask someone at the track: "halo, gw nina. nama lo siapa?" Do not invent a nickname from "runner.fullName" yourself, and do not use the full name at him.',
  },
  girlfriend: {
    relationship: 'girlfriend',
    label: 'Girlfriend',
    source: 'literal',
    words: ['my man', 'yang', 'sayang', 'beb', 'baby'],
    addressRule:
      'You call him "my man", "yang", "sayang", "beb", "baby". Pick whichever fits the moment and use one in most messages — that is what they are for. "runner.nickname" is for when you are being serious with him.',
    addressFallback:
      'If "runner.nickname" is null it changes nothing, because the pet names do not need it. Ask his name once, lightly, and do not invent one from "runner.fullName".',
  },
}

/* ============================================================================
 * §4 The R3 dials — "among other things"
 * ==========================================================================*/

/**
 * The four that survived the code-path test. See the header for the ones that did not.
 *
 * camelCase, because these are object keys read by a `'use client'` panel; the column names are
 * snake_case and `lib/nina/queries.ts` is the one place the two spellings meet.
 */
export const NINA_DIALS = ['profanity', 'clinginess', 'photoEagerness', 'verbosity'] as const

export type NinaDial = (typeof NINA_DIALS)[number]

export function isNinaDial(key: string): key is NinaDial {
  return (NINA_DIALS as readonly string[]).includes(key)
}

export interface NinaDialSpec {
  readonly key: NinaDial
  readonly label: string
  readonly axis: string
  /**
   * **The line of shipping code this dial moves.** R3's test, made a field: a dial with an empty
   * `path` is a slider that lies, and `tests/nina.tuning.test.ts` fails on one.
   */
  readonly path: string
  readonly defaultScore: number
  readonly defaultBecause: string
}

export const NINA_DIAL_SPECS: Readonly<Record<NinaDial, NinaDialSpec>> = {
  profanity: {
    key: 'profanity',
    label: 'Profanity',
    axis: 'How freely she swears. Separate from anger on purpose: anger is volume and CAPS, this is vocabulary — a Nina who swears calmly and a Nina who shouts politely are both reachable.',
    path: 'lib/nina/persona.ts JAKARTA_SLANG — the "anjir" gloss ("mild expletive of astonishment. Sparingly.") and the "bego" gloss ("idiot. RUNG 4 ONLY, and about the decision, never about him."). Those two glosses are the fence this dial moves.',
    defaultScore: 30,
    defaultBecause:
      'Today she swears, but sparingly and fenced: "anjir" is marked Sparingly and "bego" is rung 4 only. That is genuinely below the middle of the axis. Phase 2 leaves the two glosses exactly as they are in the "low" band; "off" strips them and "high"/"max" unfence them.',
  },
  clinginess: {
    key: 'clinginess',
    label: 'Clinginess',
    axis: 'How soon she speaks first, and how often. Low waits to be spoken to; high notices a quiet afternoon.',
    path: 'lib/nina/proactive.ts SILENCE_NO_CHAT_DAYS (4), SILENCE_NO_RUN_DAYS (5) and SILENCE_COOLDOWN_DAYS (3) — three integer thresholds that decide how long she waits before opening a conversation, plus the PROACTIVE_INSTRUCTIONS suffix phase 3 adds.',
    defaultScore: 50,
    defaultBecause:
      'Four days of silence, five days without a run, a three-day cooldown. Neither eager nor withdrawn; the middle band is today, and it is the band in which those three constants keep their shipping values.',
  },
  photoEagerness: {
    key: 'photoEagerness',
    label: 'Photo eagerness',
    axis: 'How readily she takes a photograph of herself, and how readily she offers one as the reward for a training commitment.',
    path: 'lib/nina/prompts/tools.ts GENERATE_IMAGE_TOOL ("Use it when he asks, or when you promised one") and lib/nina/promises.ts\'s reward dispatch. NOT NINA_IMAGE_DAILY_CAP — that is a money cap of 6/day and its docstring says so; this dial changes how eagerly she OFFERS, never what the operator spends.',
    defaultScore: 50,
    defaultBecause:
      'Today she takes one when asked or when she promised one, and the promise mechanism already exists. Reactive but not reluctant; the middle band is today.',
  },
  verbosity: {
    key: 'verbosity',
    label: 'Verbosity',
    axis: 'How much she says per turn — how many bubbles, and how long each is.',
    path: 'lib/nina/prompts/tools.ts SEND_TOOL.bubbles (minItems 1, maxItems 4) and lib/nina/prompts/system.ts OUTPUT_RULE ("1 to 4 bubbles... One bubble is the right answer more often than four").',
    defaultScore: 50,
    defaultBecause:
      "The schema allows 1–4 and the prompt leans toward one. Neither terse nor talkative; the middle band is today, and it is the band that leaves SEND_TOOL's bounds and that sentence untouched.",
  },
}

/* ============================================================================
 * §5 The two free-text fields
 * ==========================================================================*/

/**
 * One line. It is baked into an image prompt beside `NINA_SELFIE_STYLE` and `NINA_APPEARANCE`
 * (phase 4), where a paragraph fights the style block for the model's attention and loses money
 * doing it. 200 characters is a sentence about clothes.
 */
export const NINA_WARDROBE_MAX = 200

/**
 * Appended verbatim to a system prompt that is already about seven kilobytes. 2000 characters is
 * roughly a screen of notes — enough for the operator to say something this model has no dial for,
 * and small enough that it cannot drown the canon it is appended to.
 */
export const NINA_NOTES_MAX = 2000

/**
 * The wardrobe line, made safe. Whitespace collapsed to single spaces, because this is ONE line
 * and a newline inside an image prompt splits a sentence the provider then reads as two.
 *
 * `''` means "no override" — phase 4 falls back to `NINA_APPEARANCE`'s heather-grey tank, and that
 * is what makes the empty default reproduce today's photographs exactly.
 */
export function coerceNinaWardrobe(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, NINA_WARDROBE_MAX)
}

/**
 * The notes field, made safe. Newlines survive (it is prose, and paragraphs are how the operator
 * will write it) but CRLF is normalised and a run of blank lines is collapsed to one, so two
 * identical intentions produce one identical prompt — the same reproducibility argument
 * `getNinaMemorySlots` makes for ordering by key.
 *
 * `''` means "nothing appended", which is what makes the empty default reproduce today's prompt.
 * A cut mid-word at the cap is acceptable: phase 5's textarea enforces the same constant with
 * `maxLength`, so this is the last line of defence rather than the first.
 */
export function coerceNinaNotes(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, NINA_NOTES_MAX)
}

/* ============================================================================
 * §6 The tuning itself
 * ==========================================================================*/

/**
 * **Everything the operator can set about who she is.** One value, read live on every turn with no
 * cache (`memoryActions.ts` under `lib/admin/` records why that is the whole shape of the feature:
 * a committed row is in her next prompt with no invalidation step at all). **Cited with the
 * directory split off the filename on purpose** — `tests/admin.memory.test.ts` forbids the joined
 * path as a substring in every `lib/nina/*.ts`, which is how it proves no file here can reach the
 * admin memory modules. The citation is prose; joining it back up breaks that guard.
 *
 * Every field is `readonly` and `NINA_TUNING_DEFAULTS` is frozen, because `readNinaTuning` returns
 * that shared singleton for a user with no row — a caller that mutated it would corrupt every
 * subsequent turn in the same process. Frozen means the attempt throws instead.
 *
 * **The tuning never enters `NinaContext`** (plan invariant 3). The context JSON is serialised into
 * the USER turn and is documented as the boundary of everything she may know; a dial in there is a
 * number she can quote back at him, and it collides head-on with `NUMBERS_RULE`'s "every number you
 * say appears in the JSON below". The carrier is `NinaTurnInput`.
 */
export interface NinaTuning {
  readonly traits: Readonly<Record<NinaTrait, number>>
  readonly relationship: NinaRelationship
  readonly dials: Readonly<Record<NinaDial, number>>
  /** `''` = no override; phase 4 uses `NINA_APPEARANCE`'s outfit. */
  readonly wardrobe: string
  /** `''` = nothing appended to the system prompt. */
  readonly notes: string
  /**
   * Bumped by the DATABASE on every save, so `nina_turns.tuning_revision` can date a voice change
   * to a SETTING rather than only to a commit.
   *
   * **`0` means no row has ever been written**, i.e. she is on the shipping defaults. A stored row
   * always has `revision >= 1`, which is why the write below computes it in SQL and why
   * `NinaTuningWrite` cannot supply one: a revision the client sends is a revision a stale tab can
   * move backwards.
   */
  readonly revision: number
}

/** What a caller supplies to `writeNinaTuning`. The revision is the database's to assign. */
export type NinaTuningWrite = Omit<NinaTuning, 'revision'>

/**
 * What `coerceNinaTuning` accepts: the shape of a tuning, with every field `unknown`.
 *
 * Deliberately not `Partial<NinaTuning>`. The real inputs are a flat database row mapped by
 * `lib/nina/queries.ts`, a Server Action payload from phase 5, and a `NinaTuning` being
 * round-tripped — and a type that admits only the last of those pushes the validation out to three
 * call sites. `unknown` puts the whole trust boundary in one function.
 */
export interface NinaTuningInput {
  readonly traits?: unknown
  readonly relationship?: unknown
  readonly dials?: unknown
  readonly wardrobe?: unknown
  readonly notes?: unknown
  readonly revision?: unknown
}

/** One property of something that may not be an object at all. Never throws. */
function pick(bag: unknown, key: string): unknown {
  if (typeof bag !== 'object' || bag === null) return undefined
  return (bag as Record<string, unknown>)[key]
}

/** The defaults for a key set, read off its specs so there is one source of truth for each. */
function defaultScores<K extends string>(
  keys: readonly K[],
  specs: Readonly<Record<K, { readonly defaultScore: number }>>,
): Readonly<Record<K, number>> {
  const out = {} as Record<K, number>
  for (const key of keys) out[key] = specs[key].defaultScore
  return Object.freeze(out)
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **THE COMPATIBILITY CONTRACT.** `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` must render
 *  today's `NINA_SYSTEM_PROMPT` for every block whose shape does not change, and phase 3 asserts
 *  it. Until a slider moves, the diff to her behaviour is empty.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Derived from the specs rather than written out again — a second literal list of fifteen numbers
 * is a second thing to keep in step, and its failure mode is silent (the default IS today's Nina,
 * so a wrong default reads as "she didn't change"). Every value's justification is in its own
 * spec's `defaultBecause`.
 *
 * Frozen, and its two records frozen, because `readNinaTuning` hands this exact object to every
 * caller for a user with no row.
 */
export const NINA_TUNING_DEFAULTS: NinaTuning = Object.freeze({
  traits: defaultScores(NINA_TRAITS, NINA_TRAIT_SPECS),
  relationship: NINA_DEFAULT_RELATIONSHIP,
  dials: defaultScores(NINA_DIALS, NINA_DIAL_SPECS),
  wardrobe: '',
  notes: '',
  revision: 0,
})

/** A revision, made safe. Integer, never negative, and 0 is the "never written" sentinel. */
function coerceRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

/**
 * **Anything at all, made into a usable `NinaTuning`. This function never throws.**
 *
 * The `resolveCrop` rule in `lib/nina/crop.ts`, quoted: *"a renderer that throws on bad data shows
 * the user a broken page, and this data has three writers"*. This data has four — the panel, a
 * hand-run SQL update, a restored backup, and a future migration — and its consumer is a model
 * call in the middle of a conversation, which must degrade rather than 500.
 *
 * Three behaviours worth stating because tests pin them:
 *
 *   1. **An absent or unreadable key falls back to that key's own default, not to zero.** A dial we
 *      cannot read must read as "unchanged", and "unchanged" for `funny` is 50.
 *   2. **An unknown relationship degrades to `best_friend`**, which is today's. A typo in the
 *      column is Nina as she shipped, not Nina with no identity.
 *   3. **The result is always a fresh, unfrozen object**, never `NINA_TUNING_DEFAULTS` itself, so a
 *      caller may hold it, spread it and hand it to React state without touching the singleton.
 */
export function coerceNinaTuning(input: NinaTuningInput | null | undefined): NinaTuning {
  const traitsIn = input?.traits
  const dialsIn = input?.dials

  const traits = {} as Record<NinaTrait, number>
  for (const key of NINA_TRAITS) {
    traits[key] = clampNinaScore(pick(traitsIn, key), NINA_TRAIT_SPECS[key].defaultScore)
  }

  const dials = {} as Record<NinaDial, number>
  for (const key of NINA_DIALS) {
    dials[key] = clampNinaScore(pick(dialsIn, key), NINA_DIAL_SPECS[key].defaultScore)
  }

  return {
    traits,
    relationship: coerceNinaRelationship(input?.relationship),
    dials,
    wardrobe: coerceNinaWardrobe(input?.wardrobe),
    notes: coerceNinaNotes(input?.notes),
    revision: coerceRevision(input?.revision),
  }
}
