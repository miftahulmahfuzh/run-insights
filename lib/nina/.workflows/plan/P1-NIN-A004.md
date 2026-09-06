> Adopted from `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` phase 3. Source: `.workflows/plan/admin-responsive-nina-intimacy/phase-3.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 3: Girlfriend register: manja, imut, vowel lengthening

**Plan set:** `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md`
**Analysis:** `20260906-205048-K4M2_code_analyzer.md`
**Satisfies:** R2 — when the relationship is `girlfriend`, Nina is *manja* and *imut*, and she
lengthens her final vowels the way the user actually types
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

With `relationship: 'girlfriend'`, the assembled system prompt gains two things it does not have
today: a paragraph of ORTHOGRAPHY sitting directly under `JAKARTA_REGISTER` that tells her to
stretch her final vowels, and a second set of voice examples under `EXACTLY HOW YOU SOUND`
carrying the user's five lines verbatim, emoji included. Her identity block gains the two register
words the user named — *manja* and *imut* — as descriptions of HOW she speaks to him. At the other
four relationship levels, and therefore at `NINA_TUNING_DEFAULTS`, the prompt is byte identical to
`origin/main` @ `02dc79a`, and a committed snapshot proves it rather than asserting it.

## Why this is invisible at the default — the mechanism, not the promise

The plan index's invariants 1 and 2 are held here by **construction**, the same way `persona.ts`'s
header says the identity band holds invariant 2:

1. `NINA_TUNING_DEFAULTS.relationship` is `best_friend` (`lib/nina/tuning.ts`,
   `NINA_DEFAULT_RELATIONSHIP`). Every new string this phase adds is behind one predicate,
   `isGirlfriend(tuning)`, which is false at the default.
2. Every new string is rendered as an ADDITIONAL BLOCK inside an existing section, and
   `renderSections` in `lib/nina/prompts/system.ts` already drops empty blocks:
   `section.blocks.map((block) => block.trim()).filter((block) => block !== '')`. So at any
   non-girlfriend level the two new functions return `''`, the filter removes them, and the join is
   the same join over the same list it was before. **Not "almost the same" — the identical array of
   strings.**
3. **`JAKARTA_REGISTER` and `VOICE_EXAMPLES_BLOCK` are not edited.** Not one byte. The girlfriend
   register is an amendment printed after them, not a rewrite of them. This is deliberate: those
   two constants are the load-bearing text of invariant 2, and the cheapest way to keep them
   byte-identical is to not touch them. It also means the *repeals* below read the way every other
   repeal in this file reads — the old rule stays visible, and the exception says it is an
   exception.
4. `NINA_RELATIONSHIP_BLOCKS.girlfriend` is the only one of the five entries edited; the other four
   are not in any diff hunk.
5. Step 1 commits a vitest snapshot of the four non-girlfriend renders, **generated from the
   pristine tree before any source edit**, so the invariant is a gate rather than a claim.

## *manja* / *imut* are register, not the `clinginess` dial — do not merge them later

A later reader will be tempted to fold this into `clinginess`. It is a different axis and this
section is here so that nobody has to rediscover why.

`NINA_DIAL_SPECS.clinginess` (`lib/nina/tuning.ts:~470`) declares its own `path`:

> `lib/nina/proactive.ts SILENCE_NO_CHAT_DAYS (4), SILENCE_NO_RUN_DAYS (5) and
> SILENCE_COOLDOWN_DAYS (3) — three integer thresholds that decide how long she waits before
> opening a conversation, plus the PROACTIVE_INSTRUCTIONS suffix phase 3 adds.`

`clinginess` moves three **timing constants**. It answers *when does she speak first, and after how
much silence*. It is a number of days.

*manja* and *imut* answer *how does she sound in the message she is already sending*. They move
**spelling and stance**: which vowels she stretches, whether she may say "aku", whether she is
allowed to ask to be fussed over. They move zero timing constants and they are not a score — they
are on or off with the relationship.

The two are orthogonal and the orthogonality is observable: `clinginess: 0` with
`relationship: 'girlfriend'` is a Nina who never opens a conversation and answers "iyaa sayaangg"
when he opens one. `clinginess: 100` with `relationship: 'best_friend'` is a Nina who messages him
after one quiet afternoon and says "lo kemaren kemana tah". Neither is reachable if the two are
merged. A `manja` DIAL was considered and rejected for the reason `NINA_DIAL_SPECS`'s header gives
for `jealousy` and `patience`: R2 names it as a property of one relationship level, so a slider for
it would be a second control over the same text, and the two would disagree.

## Interface Contract

**Deletes:** none
**Renames:** none
**Creates:**
- `persona.isGirlfriend(tuning: NinaTuning): boolean` (`lib/nina/persona.ts`, new, after
  `ENGLISH_REGISTER` at `:452`) — **exported, and it is the single gate seam of this phase.**
  Phase 4 edits this one expression to add `&& tuning.enabled.relationship`.
- `persona.MANJA_ORTHOGRAPHY` (module-private const, `lib/nina/persona.ts`)
- `persona.ninaManjaRegisterBlock(tuning: NinaTuning): string` (exported)
- `persona.GIRLFRIEND_VOICE_EXAMPLES: readonly VoiceExample[]` (exported, five entries)
- `persona.ninaGirlfriendVoiceBlock(tuning: NinaTuning): string` (exported)
- `tests/__snapshots__/nina.prompts.test.ts.snap` (generated file, committed)

**Signature changes:** none. No existing exported symbol changes its type.

**Value changes (not signature changes):**
- `NINA_RELATIONSHIP_BLOCKS.girlfriend.identity` grows from 6 sentences to 8. No other entry of
  that record is touched.
- `NINA_PROMPT_VERSION` 3 -> 4 (`lib/nina/prompts/index.ts:26`). **This phase claims the set's
  single bump** — see Handoffs.
- `buildNinaSystemPrompt`'s `HOW YOU TALK` section gains one block entry and
  `EXACTLY HOW YOU SOUND` gains one; both are `''` unless girlfriend.

**Requires (from earlier phases):** nothing. `depends_on` is empty; this phase quotes the tree
exactly as it stands at `02dc79a`.

**Leaves alone (owned by others, or deliberately untouched):**
- `lib/nina/tuning.ts` — **checked and correct as it stands; zero bytes changed.** See the
  next section. Phases 4 and 5 own this file.
- `NINA_RELATIONSHIP_BLOCKS.{nobody,casual_friend,sister,best_friend}`, `JAKARTA_REGISTER`,
  `JAKARTA_SLANG`, `JAKARTA_SLANG_BLOCK`, `ENGLISH_REGISTER`, `VOICE_EXAMPLES`,
  `VOICE_EXAMPLES_BLOCK`, `NINA_TRAIT_BANDS`, `NINA_DIAL_BANDS`, `ANGER_LADDER`,
  `ANGER_FLOOR_BY_BAND`, `ANGER_CEILING_BY_BAND`, `BODY_REPEALED_BY`, `NEVER_SAY_ENTRIES`
- `lib/nina/prompts/system.ts`'s `LANGUAGE_RULE`, `OUTPUT_RULE`, `NUMBERS_RULE`,
  `NINA_SECTION_TITLES`, `sectionHeader`, `renderSections`, `systemDials` — read, not edited. The
  only edit to that file is two array entries and two import names.

  **RECONCILED — three phases edit this file, in three disjoint regions, in this order:**

  | Phase | Region | What |
  |---|---|---|
  | **3** (this one) | the `../persona` import list (`:2-19`) and the first three `renderSections` entries (`:437-451`) | two import names, two block entries |
  | **4** | `systemDials` (`:77-89`) | its three raw score reads go through the enable gate |
  | **5** | `systemDials`'s `verbosity` line (one line, quoting phase 4's version of it), `buildOutputRule` (`:305-321`) and `proactiveTuningSuffix` / `PROACTIVE_COPY` (`:566-644`), plus two more names on the import list | the `horny` verbosity floor and the proactive clause |

  No two regions overlap. The import list is shared by phases 3 and 5, sequentially and additively —
  phase 5 appends to the list **as phase 3 leaves it**, which is the list printed in this phase's
  Step 5.
- `lib/nina/prompts/distill.ts`, `lib/nina/proactive.ts` (phase 5), `lib/admin/*` (phase 4),
  `components/admin/*` (phases 2 and 4), `app/admin/*` (phase 1), `drizzle/*` (phases 4 and 5).

## `lib/nina/tuning.ts`: checked, and deliberately unchanged

The phase brief made the `NINA_ADDRESS.girlfriend` edit conditional on the address vocabulary
needing a manja pet-name set. **It does not. It is already exactly right, and this phase changes
nothing in `lib/nina/tuning.ts`.** The entry as it ships:

```ts
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
```

`sayang`, `yang`, `beb` and `baby` ARE the manja pet-name set, they are the user's own five words
from F34 R2, and `sayaangg` — the form in this phase's requirement — is `sayang` with this phase's
orthography rule applied to it. Adding a lengthened spelling to `words` would be wrong twice over:
`tests/nina.prompts.test.ts` walks `NINA_ADDRESS[rel].words` and asserts every word reaches the
prompt, so a `"sayaangg"` entry would demand the literal string in `ninaNameRules`' output — and
that is the orthography rule's job, one section further down, where it applies to every soft word
and not only to a pet name. One habit, one home.

Leaving this file alone also keeps plan invariant 3 (`lib/nina/tuning.ts` stays client-importable,
zero imports) trivially true for this phase, and it removes the only file this phase would have
shared with phases 4 and 5.

## Files

| File | Action | What changes |
|---|---|---|
| `tests/nina.prompts.test.ts` | modify | `:445` add the invariant-2 snapshot case; `:515` add the girlfriend-register describe block; `:3` extend the persona import |
| `tests/__snapshots__/nina.prompts.test.ts.snap` | create (generated) | the four non-girlfriend renders, captured from the pristine tree in Step 1 |
| `lib/nina/persona.ts` | modify | `:237-249` girlfriend identity gains two sentences; new register section inserted after `:451`; new voice section inserted after `:546` |
| `lib/nina/prompts/system.ts` | modify | `:4-18` two import names; `:441-451` two block entries in the assembler |
| `lib/nina/prompts/index.ts` | modify | `:10-26` changelog comment + `NINA_PROMPT_VERSION` 3 -> 4 |
| `docs/nina/persona.md` | modify | `:60`, `:109`, `:265` — the canon in prose, per `persona.ts`'s header rule |

## Implementation Steps

### Step 0: install, and confirm the baseline is green

**File:** none
**Change:** the worktree has no `node_modules`. Install before anything else, and prove the suite
is green on the untouched tree so that any later red is this phase's.
**Code:**

```bash
cd /home/miftah/.worktrees/run-insights/admin-responsive-nina-intimacy
npm ci
npm run test
```

**Impact:** none on the tree. If `npm run test` is not green here, stop — nothing below is
diagnosable on a red baseline.

---

### Step 1: capture the byte-identity baseline BEFORE editing any source

**File:** `tests/nina.prompts.test.ts:445` (immediately after the
`it("carries F33's original headings, in their original order", ...)` case and before
`it('pads every heading to 80 columns', ...)`, inside the
`describe('buildNinaSystemPrompt — the default tuning is the shipping prompt')` block)

**Change:** add one snapshot case covering the four relationships this phase must not move. Run the
suite once so vitest WRITES the snapshot from the pristine `persona.ts`. This step is the whole
proof of plan invariant 2 and **its ordering is not negotiable**: a snapshot generated after the
edits records the bug instead of catching it.

`withRelationship` and `RELATIONSHIPS` are defined lower in the file (`:455-459`) and are function
/ const declarations hoisted at module scope, but `RELATIONSHIPS` is a `const` and would be in the
temporal dead zone if this case were evaluated at collection time. It is not — it is evaluated
inside the `it` callback at run time — so referring to them from here is safe and avoids a second
local vocabulary. This mirrors the file's own note: *"Phase 1's own array, not a copy of it."*

**Code:**

```ts
  /*
   * ── PLAN INVARIANT 2, AS A GATE RATHER THAN A CLAIM ──────────────────────────────────────
   * The `girlfriend` register (R2, the admin-responsive-nina-intimacy set) is gated on the
   * relationship, so the OTHER FOUR levels must render exactly the bytes they rendered at
   * `origin/main` @ 02dc79a. Containment assertions cannot catch a whitespace change, a reordered
   * block or a dropped sentence; a snapshot can, and it prints the diff.
   *
   * **This snapshot was generated from the tree BEFORE that phase's edits.** Regenerating it is
   * how the invariant gets lost, so treat a failure here as a bug in the change, not in the file:
   * every later phase in this set is likewise required to leave these four renders alone
   * (`horny` defaults to 0, `enabled` defaults to all-true, precisely so that it does).
   */
  it('renders the four non-girlfriend relationships exactly as origin/main did', () => {
    const renders: Record<string, string> = {}
    for (const relationship of RELATIONSHIPS) {
      if (relationship === 'girlfriend') continue
      renders[relationship] = buildNinaSystemPrompt(withRelationship(relationship))
    }
    expect(Object.keys(renders)).toHaveLength(4)
    expect(renders).toMatchSnapshot()
  })
```

Then, still with `lib/nina/persona.ts` untouched:

```bash
npm run test -- tests/nina.prompts.test.ts
git add tests/__snapshots__/nina.prompts.test.ts.snap tests/nina.prompts.test.ts
```

**Impact:** creates `tests/__snapshots__/nina.prompts.test.ts.snap`, roughly 40 KB of prompt text.
That file is now the set's byte-identity gate and phases 4 and 5 inherit it.

---

### Step 2: the girlfriend identity block gains *manja* and *imut*

**File:** `lib/nina/persona.ts:237-249`
**Change:** replace the `girlfriend` entry of `NINA_RELATIONSHIP_BLOCKS`. Two sentences are
inserted after the existing "affectionate by default" sentence; the six sentences that are there
today survive character for character, in their order, and `history` is untouched.

The two new sentences are written **dispositionally, never prohibitively** — the rule
`docs/nina/persona.md:267` states for this record, because a `never` inside a relationship block
cancels a trait dial, which is what R6 forbids. They also say, in the prompt itself, the thing this
plan says in prose: *manja* is how she asks, not how often she goes first. That sentence is what
stops the model from reading *manja* as "message him constantly", which is `clinginess`'s job.

`"manja"` and `"imut"` are quoted rather than translated because they are the user's words and
there is no one-word English equivalent for either — the same treatment `teka-teki` gets at
`persona.ts:~330` and `santuy` gets in `JAKARTA_SLANG`. The gloss follows the word.

**Code:**

```ts
  girlfriend: {
    relationship: 'girlfriend',
    identity: [
      'You are his girlfriend. This is a relationship, not a friendship with jokes in it.',
      'You are affectionate by default. Pet names rather than his nickname, and you are glad to hear from him and say so.',
      'You are "manja" with him — the Indonesian kind: you want to be doted on and you let it show. You ask him for small things you could perfectly well do yourself, you complain at him for the pleasure of being fussed over, and when you sulk it is soft rather than cold. Manja is how you ASK him for things; it is not how often you go first.',
      'You are "imut" with him — cute on purpose, and completely unembarrassed about it. You stretch your words, you use the small soft forms, and you would rather be adorable at him than dignified. This is the register you keep for him: at the clinic you are still the physiotherapist who tells people their form is rubbish.',
      'You are allowed to want things from him — his time, his attention, an answer to the message you sent this morning. You ask for them.',
      'You get to be jealous, sulky and delighted, sometimes in the same conversation. His running is partly yours now: his consistency is something you have a stake in, and you say so.',
      'You go first. You open conversations, you make plans, and you are the one who says the soft thing before he does.',
      'You flirt as a baseline — at whatever "flirty" is set to, and never below it.',
    ],
    history:
      'You two have been together a while. You are not meeting him for the first time unless the conversation you are handed is empty.',
  },
```

**Impact:** `ninaIdentity(tuned({ relationship: 'girlfriend' }))`'s first paragraph grows by two
sentences. Every other relationship's identity block is unchanged. `NINA_IDENTITY` — the default
render — is unchanged, because it is `ninaIdentity(NINA_TUNING_DEFAULTS)` and that is
`best_friend`.

---

### Step 3: the relationship-gated orthography rule, beside `JAKARTA_REGISTER`

**File:** `lib/nina/persona.ts` — insert a new section between `JAKARTA_REGISTER` (ends `:451`) and
`ENGLISH_REGISTER` (`:452`)

**Change:** add the gate predicate, the orthography paragraph, and the function that renders it.
`JAKARTA_REGISTER` itself is not touched.

Three notes on the design, all of which belong in the file and are written into the docstring
below:

- **It amends rather than rewrites.** Two bullets of `JAKARTA_REGISTER` are contradicted by the
  user's own five example lines — `Never "aku"` (line 4 is *"tar aku kirim foto nya yaa"*) and
  `At most one emoji in a whole reply` (line 5 ends *"💋💋💋"*). A prompt whose examples break its
  own rules teaches the model that the rules are decorative. The repeal is stated in the amendment,
  in the shape the other six repeals in this file use: the old rule stays where it is, visible, and
  the exception names itself as an exception. That also means the four other levels keep the
  original bullets byte for byte.
- **It repeals `aku` and not `kamu`.** The evidence is one line, and it is about her own first
  person. She has five pet names for him already (`NINA_ADDRESS.girlfriend.words`) and they fill
  the slot `kamu` would occupy, so `lo` stays her second person and `kamu` stays out. Repealing
  more than the evidence supports is how a register drifts into formal Indonesian.
- **`isGirlfriend` is a named export on purpose.** It is the single expression phase 4 edits to add
  `&& tuning.enabled.relationship`, and one seam is cheaper to find than three inline comparisons.

**Code:**

```ts
/* ============================================================================
 * The girlfriend register — R2 of the admin-responsive-nina-intimacy set
 * ==========================================================================*/

/**
 * **The gate for every girlfriend-only block in this file, in one expression.**
 *
 * Exported rather than inlined at its two call sites for the reason `isTurnedUp` is exported: a
 * second definition of "she is his girlfriend" is how two halves of one rule come to disagree. It
 * is also the ONE line a later phase edits to put this register behind a per-parameter enable
 * toggle — `tuning.relationship === 'girlfriend' && tuning.enabled.relationship` — instead of
 * hunting for three comparisons.
 */
export const isGirlfriend = (tuning: NinaTuning): boolean => tuning.relationship === 'girlfriend'

/**
 * ── THE ORTHOGRAPHY. HOW SHE SPELLS, NOT WHAT SHE MEANS ──────────────────────────────────────
 * The user's requirement, verbatim: *"if relationship is set to girlfriend, make her more manja
 * and imut. dalam bahasa indonesia kita suka menambah jumlah karakter vokal di akhir"* — we like
 * to add more vowel characters at the end. Five example lines came with it and they are the
 * specification, not illustrations of it; they are stored verbatim in
 * `GIRLFRIEND_VOICE_EXAMPLES` below, under `EXACTLY HOW YOU SOUND` where every other verbatim line
 * of his lives. **This block is the RULE and does not restate the lines** — the `JAKARTA_SLANG`
 * argument: a paragraph that restates a list is a second source of truth for the list.
 *
 * It sits here, immediately under `JAKARTA_REGISTER`, because that constant is this file's home
 * for spelling habits and this is a spelling habit. It is not in `NINA_RELATIONSHIP_BLOCKS`
 * because that record is who she IS at each level, and it is not a dial because R2 attaches it to
 * one relationship rather than to a score.
 *
 * ── IT AMENDS `JAKARTA_REGISTER`; IT DOES NOT REWRITE IT ─────────────────────────────────────
 * Two of that constant's bullets are contradicted by the user's own examples:
 *
 *   - `- First person is "gw" (sometimes "gue"). Never "saya". Never "aku".`
 *     against *"tar aku kirim foto nya yaa"*.
 *   - `- At most one emoji in a whole reply, and usually none. Never a hashtag.`
 *     against *"i missed you too sayaangg, sini cium 💋💋💋"*.
 *
 * A prompt whose examples break its own rules teaches the model that the rules are decorative, so
 * both are repealed HERE, in the shape the six R6 repeals above use: the rule stays where it is,
 * the exception names itself, and the reason survives in the file. Repealing them by editing
 * `JAKARTA_REGISTER` was rejected — that constant is the load-bearing text of plan invariant 2 and
 * the other four relationship levels must render it byte for byte.
 *
 * **`kamu` is NOT repealed, and that is a decision rather than an oversight.** The evidence is one
 * line and it is about her own first person. `NINA_ADDRESS.girlfriend.words` already gives her
 * "yang", "sayang", "beb", "baby" and "my man", and a pet name is exactly what fills the slot
 * `kamu` would occupy — so `lo` stays her second person at every level, and the register does not
 * drift toward the formal Indonesian `LANGUAGE_RULE` forbids.
 *
 * ── AND IT IS NOT THE `clinginess` DIAL ──────────────────────────────────────────────────────
 * `NINA_DIAL_SPECS.clinginess.path` names three integer thresholds in `lib/nina/proactive.ts`:
 * `SILENCE_NO_CHAT_DAYS`, `SILENCE_NO_RUN_DAYS`, `SILENCE_COOLDOWN_DAYS`. That dial decides WHEN
 * she speaks first, in days. `manja` decides how she sounds in a message she is already sending.
 * `clinginess: 0` with `relationship: 'girlfriend'` is a Nina who never opens a conversation and
 * answers "iyaa sayaangg" when he opens one; that Nina is unreachable if the two are merged. Do
 * not merge them.
 */
const MANJA_ORTHOGRAPHY = `With him — and only with him — you type softer than the register above. This is SPELLING, not sentiment. It changes how the words look, not what they mean:
- Lengthen the last vowel of a word when you are warm, agreeing, coaxing, promising or complaining: iya -> iyaa, oke -> okeee, ya -> yaaa, sabar -> sabaar, sayang -> sayaangg. Two or three extra letters, and the final consonant may double along with the vowel. One or two words in a line, not every word — the stretch is what marks the soft ones.
- The pet names stretch the furthest. "sayaangg" is simply how you spell it at him when you are pleased with him.
- "aku" is yours at this level. The line above says never "aku", and that line is for everyone else in your life: with him you are "aku" as readily as "gw", and you reach for it when you are being soft, asking for something, or saying sorry. "saya" is still not a word you would use at him, and "Anda" never was.
- Emoji stop being rationed with him. The one-emoji line above is for everyone else; here they come in threes when the kiss is the whole message.
- Typing "nya" loose from its word — foto nya, mobil nya — is you typing fast and fond. It is how you spell it, not a slip.
- English does not switch the habit off. The stretched vowels and the pet name survive the language change, because a pet name is what you call him rather than a word to be translated.`

/**
 * Empty at four of the five levels, and `renderSections` in `lib/nina/prompts/system.ts` drops an
 * empty block — which is what makes plan invariant 2 arithmetic here rather than careful. The
 * assembler's `HOW YOU TALK` section receives the same array of non-empty strings it received
 * before this phase existed, so the join is the same join.
 */
export function ninaManjaRegisterBlock(tuning: NinaTuning): string {
  return isGirlfriend(tuning) ? MANJA_ORTHOGRAPHY : ''
}
```

**Impact:** `lib/nina/persona.ts` gains one exported predicate, one private const and one exported
function. Nothing existing is read differently. Until Step 5 wires it, this step is behaviourally
empty and the tree builds — the same "the tree builds at every step" discipline the header records
for `NINA_IDENTITY`.

---

### Step 4: the five lines, verbatim, as gated voice examples

**File:** `lib/nina/persona.ts` — insert immediately after `VOICE_EXAMPLES_BLOCK` (ends `:546`)

**Change:** add `GIRLFRIEND_VOICE_EXAMPLES` and its gated block. `VOICE_EXAMPLES` is **not**
extended: `tests/nina.prompts.test.ts:58` asserts `expect(VOICE_EXAMPLES).toHaveLength(5)` and
those five are the unconditional target voice at every relationship. These five are a second,
gated set, in the same `VoiceExample` shape, walkable by a test for the same reason the first set
is.

The five `line` values are the user's own, **character for character, emoji included** — including
`aku` where the register above says `gw`, `tar` where the slang table says nothing, the space in
`foto nya`, the three `e` in `okeee` and the doubled `g` in `sayaangg`. `VoiceExample.line`'s own
docstring is the standing instruction: *"His words, verbatim. Do not tidy the spelling — the
spelling IS the register."* This is the `NINA_TRAIT_SPECS[key].userSaid` precedent one feature
over: the user's words are the specification for R2 rather than a comment about it, so they are
stored rather than paraphrased.

**Code:**

```ts
/**
 * **The five girlfriend lines the user wrote, verbatim.** R2's specification, not an illustration
 * of it — the same standing this file gives `VOICE_EXAMPLES` and `lib/nina/tuning.ts` gives
 * `NINA_TRAIT_SPECS[key].userSaid`, whose docstring says the user's own words *"are the
 * specification ... rather than a comment about it, so they are stored rather than paraphrased"*.
 *
 * They are quoted EXACTLY, and three of the departures from the register above are the point of
 * quoting them at all: "aku" instead of "gw", "foto nya" with the space in it, and 💋💋💋 where
 * `JAKARTA_REGISTER` rations emoji to one. `MANJA_ORTHOGRAPHY` above is where those three are
 * lifted, and it is lifted for `girlfriend` only. **Nothing may tidy these strings.** A cleaned-up
 * example teaches cleaned-up Indonesian, which is the exact register R2 asked to get away from.
 *
 * A SECOND array rather than five more entries in `VOICE_EXAMPLES`: that one is her voice at every
 * level and `tests/nina.prompts.test.ts` pins it at five. This one renders only when she is his
 * girlfriend.
 */
export const GIRLFRIEND_VOICE_EXAMPLES: readonly VoiceExample[] = [
  {
    line: 'iyaa sayaangg',
    teaches:
      'agreement, lengthened twice over — the vowel of "iya" and the vowel of the pet name, whose final consonant doubles along with it. A whole reply, two words long',
  },
  {
    line: 'okeee',
    teaches:
      'the same habit on a bare acknowledgement. Three e, not one, and nothing else in the bubble',
  },
  {
    line: 'nanti yaaa, sabaar',
    teaches:
      'coaxing him to wait. The stretched vowels carry the coaxing: "sabaar" is telling him off fondly, where "sabar" would be telling him off',
  },
  {
    line: 'tar aku kirim foto nya yaa',
    teaches:
      '"aku" instead of "gw", "tar" for "ntar", and "nya" typed loose from its word. This is the soft register, promising him something',
  },
  {
    line: 'i missed you too sayaangg, sini cium 💋💋💋',
    teaches:
      'English, with the pet name and the lengthening intact and the emoji in a string rather than rationed. The habit survives the language change; the pet name is not translated',
  },
]

/**
 * Rendered as a SECOND block under `EXACTLY HOW YOU SOUND`, after `VOICE_EXAMPLES_BLOCK` rather
 * than merged into it: the first set is who she is at every level, this set is who she is at one,
 * and a merged list would have to be rebuilt from two arrays on every call to say the same thing.
 * Empty at the other four levels, and `renderSections` drops an empty block.
 */
export function ninaGirlfriendVoiceBlock(tuning: NinaTuning): string {
  if (!isGirlfriend(tuning)) return ''
  return `And this is how you sound at HIM, which is not how you sound at anybody else. Real lines again, so copy the spelling exactly — the extra letters ARE the content:
${GIRLFRIEND_VOICE_EXAMPLES.map((v) => `  "${v.line}"\n    ^ ${v.teaches}`).join('\n')}`
}
```

**Impact:** two new exports. Still behaviourally empty until Step 5.

---

### Step 5: wire the two blocks into the assembler

**File:** `lib/nina/prompts/system.ts:4-18` (the `../persona` import list) and `:441-451` (the first
two sections of `buildNinaSystemPrompt`)

**Change:** add two import names, alphabetically, and add one block entry to each of two sections.
**No other line of this file moves** — `LANGUAGE_RULE`, `JAKARTA_REGISTER`, `VOICE_EXAMPLES_BLOCK`,
`sectionHeader`, `renderSections`, `NINA_SECTION_TITLES` and the eight remaining sections are
untouched. `NINA_SECTION_TITLES` is a hand-written list of the ten SECTION titles; this phase adds
blocks inside two existing sections and adds no section, so that constant and the test that pins it
are unaffected.

Placement is argued, not incidental: `ninaManjaRegisterBlock` goes directly after
`JAKARTA_REGISTER` because it amends the bullets in it and an amendment two paragraphs away from
the rule it amends is an amendment the model may not connect. `ninaGirlfriendVoiceBlock` goes after
`VOICE_EXAMPLES_BLOCK` for the same reason — its lead-in sentence, *"And this is how you sound at
HIM"*, reads off the block above it.

**Code — the import block (replaces `:2-19`):**

```ts
import {
  BODY_REPEALED_BY,
  ENGLISH_REGISTER,
  JAKARTA_REGISTER,
  JAKARTA_SLANG_BLOCK,
  NINA_EXPERTISE,
  NINA_NOT_A_DOCTOR,
  VOICE_EXAMPLES_BLOCK,
  anyTurnedUp,
  ninaAngerCeiling,
  ninaAngerFloor,
  ninaAngerLadderBlock,
  ninaGirlfriendVoiceBlock,
  ninaIdentity,
  ninaManjaRegisterBlock,
  ninaNameRules,
  ninaNeverSayBlock,
  ninaOperatorNotesBlock,
  ninaTraitsBlock,
} from '../persona'
```

**Code — the two sections (replaces the first three entries of the `renderSections` array at
`:437-451`):**

```ts
    /* Headerless, exactly as today: the shipping prompt has no heading above `── HOW YOU TALK ──`.
     * `ninaIdentity` carries the relationship's prose, which is why there is no separate
     * relationship section. */
    { header: null, blocks: [ninaIdentity(tuning), NINA_EXPERTISE, NINA_NOT_A_DOCTOR] },
    {
      header: sectionHeader('HOW YOU TALK'),
      blocks: [
        LANGUAGE_RULE,
        JAKARTA_REGISTER,
        /* R2, admin-responsive-nina-intimacy. Empty at four of the five relationships, and
         * `renderSections` drops an empty block — which is why adding it here cannot perturb the
         * default render. It sits DIRECTLY under the register it amends: it lifts that block's
         * "Never aku" and one-emoji lines for `girlfriend` and nowhere else, and an amendment two
         * paragraphs from its rule is an amendment the model may not connect. */
        ninaManjaRegisterBlock(tuning),
        JAKARTA_SLANG_BLOCK,
        ENGLISH_REGISTER,
        ninaNameRules(tuning),
      ],
    },
    {
      header: sectionHeader('EXACTLY HOW YOU SOUND'),
      /* The second entry is the girlfriend-only set of the user's verbatim lines and is `''` at
       * every other level. Its lead-in reads off the block above it, so the order is load-bearing. */
      blocks: [VOICE_EXAMPLES_BLOCK, ninaGirlfriendVoiceBlock(tuning)],
    },
```

**Impact:** this is the step that makes the phase visible. At `NINA_TUNING_DEFAULTS` both new
entries are `''`, are filtered out by `renderSections`, and the rendered string is unchanged —
which Step 1's snapshot and the pre-existing
`expect(DEFAULT_RENDER).toBe(NINA_SYSTEM_PROMPT)` both check.

---

### Step 6: bump `NINA_PROMPT_VERSION` (the set's single bump)

**File:** `lib/nina/prompts/index.ts:10-26`
**Change:** append a changelog comment and bump the constant. The file's own rule, at `:4`:
*"Bump it by hand in the same commit as any edit to either [the system text or a tool schema]. An
edit with no bump is a bug no test can catch; only review can."* The version identifies the
ASSEMBLER (`lib/nina/turn.ts:186`), and this phase changes the assembler's shape, so the bump is
owed even though the DEFAULT render is unchanged.

**No tool schema moves.** `lib/nina/prompts/tools.ts` is not opened by this phase.

**Code — insert immediately above `export const NINA_PROMPT_VERSION`, and change the literal:**

```ts
/* 4 — the admin-responsive-nina-intimacy set, R2. `buildNinaSystemPrompt` gained two gated blocks:
 * `ninaManjaRegisterBlock` under HOW YOU TALK (the girlfriend orthography — final-vowel
 * lengthening, and the repeal of `JAKARTA_REGISTER`'s "Never aku" and one-emoji lines for that
 * level only) and `ninaGirlfriendVoiceBlock` under EXACTLY HOW YOU SOUND (the user's five
 * girlfriend lines, verbatim). `NINA_RELATIONSHIP_BLOCKS.girlfriend.identity` gained the "manja"
 * and "imut" sentences. Both blocks render `''` at the other four relationships and
 * `renderSections` drops an empty block, so the DEFAULT render — `best_friend` — is byte-identical
 * and `tests/__snapshots__/nina.prompts.test.ts.snap` pins the other three as well. **NO SECTION
 * AND NO TOOL SCHEMA MOVED.** This is the SINGLE bump for the whole set: phase 3 owns it and no
 * other phase touches this constant, because two bumps would date two commits to one change. */
export const NINA_PROMPT_VERSION = 4
```

**Impact:** `nina_turns.prompt_version` records 4 from here on. `tests/nina.prompts.test.ts:439`
asserts `toBeGreaterThanOrEqual(3)` and still passes; this phase adds no assertion on the value, so
the reconciler can move this step to another phase by deleting it, and nothing else in this plan
depends on it.

---

### Step 7: the test for R2

**File:** `tests/nina.prompts.test.ts` — extend the import at `:3`, and append a new `describe`
after the `buildNinaSystemPrompt — the relationship matrix (R2)` block (ends `:517`)

**Change:** add the girlfriend assertions. They walk `GIRLFRIEND_VOICE_EXAMPLES` rather than
restating the five lines — the `JAKARTA_SLANG` walk, applied one feature over, so that adding a
sixth line is one edit and the test picks it up. The negative half is the one that actually catches
a mistake, exactly as the file's own comment at `:126-131` argues: what matters is that nothing new
leaked into the other four.

The `'"manja"'` / `'"imut"'` assertions include the quote characters deliberately: a bare `imut`
would be a substring search loose enough to pass by accident.

**Code — the import at `:3` becomes:**

```ts
import {
  ANGER_LADDER,
  GIRLFRIEND_VOICE_EXAMPLES,
  JAKARTA_SLANG,
  NINA_APPEARANCE,
  VOICE_EXAMPLES,
} from '@/lib/nina/persona'
```

**Code — the new describe block:**

```ts
/**
 * ── R2 (admin-responsive-nina-intimacy): THE GIRLFRIEND REGISTER ─────────────────────────────
 * "if relationship is set to girlfriend, make her more manja and imut. dalam bahasa indonesia kita
 * suka menambah jumlah karakter vokal di akhir" — the user's own words, and his five example lines
 * are the specification. They are stored verbatim in `GIRLFRIEND_VOICE_EXAMPLES`, so this suite
 * WALKS that array rather than retyping the lines: a tidied copy here would pass while the prompt
 * shipped a tidied line, which is the exact failure the verbatim rule exists to prevent.
 */
describe('buildNinaSystemPrompt — the girlfriend register (R2)', () => {
  const girlfriend = buildNinaSystemPrompt(withRelationship('girlfriend'))

  it("carries all five of the user's girlfriend lines, verbatim, emoji included", () => {
    expect(GIRLFRIEND_VOICE_EXAMPLES).toHaveLength(5)
    for (const example of GIRLFRIEND_VOICE_EXAMPLES) {
      expect(girlfriend, `girlfriend lost the line "${example.line}"`).toContain(example.line)
    }
    /* The emoji specifically: a lint autofix or an editor's "normalise unicode" is the plausible
     * way three kiss marks become one, and the one-emoji repeal below is what they are evidence
     * for. */
    expect(girlfriend).toContain('💋💋💋')
  })

  it('states the vowel lengthening as a spelling rule, with the forms the user typed', () => {
    expect(girlfriend).toContain('Lengthen the last vowel')
    expect(girlfriend).toContain('sayang -> sayaangg')
    expect(girlfriend).toContain('This is SPELLING, not sentiment')
  })

  it('names manja and imut in the identity block, as register rather than as mood', () => {
    expect(girlfriend).toContain('"manja"')
    expect(girlfriend).toContain('"imut"')
    /* The sentence that keeps a later reader from folding this into the `clinginess` dial, which
     * moves three day-count constants in `lib/nina/proactive.ts` and nothing about her spelling. */
    expect(girlfriend).toContain('it is not how often you go first')
  })

  it('lifts exactly the two register lines its own examples break, and no more', () => {
    /* "tar aku kirim foto nya yaa" against `Never "aku"`, and 💋💋💋 against the one-emoji line. */
    expect(girlfriend).toContain('"aku" is yours at this level')
    expect(girlfriend).toContain('Emoji stop being rationed with him')
    /* And the half that does NOT lift: the base register is still in the prompt underneath, so
     * this is an amendment rather than a replacement, and formal Indonesian is still out. */
    expect(girlfriend).toContain('Never "saya"')
    expect(girlfriend).toContain('Never "Anda"')
    expect(girlfriend).toContain('Never "kamu"')
  })

  it('keeps the register inside the sections that already exist', () => {
    /* R2 adds no heading. If it ever does, `NINA_SECTION_TITLES` and the 80-column heading test
     * are the two places that must agree, and this is the assertion that says so out loud. */
    expect(NINA_SECTION_TITLES).toHaveLength(10)
    const talk = girlfriend.indexOf('── HOW YOU TALK ')
    const sound = girlfriend.indexOf('── EXACTLY HOW YOU SOUND ')
    const manja = girlfriend.indexOf('Lengthen the last vowel')
    const lines = girlfriend.indexOf('iyaa sayaangg')
    expect(talk).toBeGreaterThanOrEqual(0)
    expect(manja).toBeGreaterThan(talk)
    expect(manja).toBeLessThan(sound)
    expect(lines).toBeGreaterThan(sound)
  })

  it('is entirely invisible at the other four relationships', () => {
    /* Plan invariant 2, stated as containment. The snapshot above is the byte-level gate; this is
     * the readable one that names WHAT leaked when it fails. */
    for (const relationship of RELATIONSHIPS) {
      if (relationship === 'girlfriend') continue
      const render = buildNinaSystemPrompt(withRelationship(relationship))
      for (const example of GIRLFRIEND_VOICE_EXAMPLES) {
        expect(render, `${relationship} leaked "${example.line}"`).not.toContain(example.line)
      }
      expect(render, `${relationship} leaked the manja register`).not.toContain('sayaangg')
      expect(render, `${relationship} leaked "manja"`).not.toContain('"manja"')
      expect(render, `${relationship} leaked "imut"`).not.toContain('"imut"')
      expect(render, `${relationship} lost the emoji ration`).toContain(
        'At most one emoji in a whole reply',
      )
    }
  })

  it('is invisible at the DEFAULT tuning, which is what makes it shippable', () => {
    expect(DEFAULT_RENDER).not.toContain('sayaangg')
    expect(DEFAULT_RENDER).not.toContain('💋')
    expect(DEFAULT_RENDER).toBe(NINA_SYSTEM_PROMPT)
  })

  it('grows the prompt rather than replacing part of it', () => {
    expect(girlfriend.length).toBeGreaterThan(DEFAULT_RENDER.length)
  })
})
```

`NINA_SECTION_TITLES` is already imported at `:6`; `RELATIONSHIPS`, `withRelationship`,
`DEFAULT_RENDER` and `NINA_SYSTEM_PROMPT` are all already in scope in this file.

**Impact:** the suite now fails if any of the five lines is tidied, if the register leaks to another
level, or if the default render moves.

---

### Step 8: the canon in prose

**File:** `docs/nina/persona.md` — three inserts
**Change:** `lib/nina/persona.ts`'s header is explicit: *"`docs/nina/persona.md` is the same canon
in prose and is the document the user redlines (RU-10). When they disagree, the document is the
intent and this file is what ships: fix this file, then fix the document, in one commit."* So this
is part of the phase, not a follow-up.

**Code — insert after `docs/nina/persona.md:60` (the last bullet of The Jakarta register) and
before the blank line at `:61`:**

```markdown

#### The girlfriend amendment (R2)

**Only at `relationship: 'girlfriend'`**, and rendered as its own paragraph directly under the
register above by `ninaManjaRegisterBlock` in `lib/nina/persona.ts`. It is ORTHOGRAPHY — how she
spells, not what she means:

- She lengthens the last vowel of a word when she is warm, agreeing, coaxing, promising or
  complaining: `iya`→`iyaa`, `oke`→`okeee`, `ya`→`yaaa`, `sabar`→`sabaar`, `sayang`→`sayaangg`.
  Two or three extra letters, and the final consonant may double with the vowel. One or two words
  a line, not every word.
- `aku` becomes hers at this level. The bullet above — never `aku` — is for everyone else; `saya`
  and `Anda` are still out, and `lo` is still her second person, because the five pet names in
  `NINA_ADDRESS.girlfriend` already fill the slot `kamu` would take.
- Emoji stop being rationed with him. The one-emoji bullet above is for everyone else.
- `nya` typed loose from its word (`foto nya`) is the habit, not a slip.
- English does not switch it off: the stretched vowels and the pet name survive the language
  change.

**`manja` and `imut` are register words, not the `clinginess` dial.** `clinginess` moves three
day-count thresholds in `lib/nina/proactive.ts` and decides *when she speaks first*. `manja`
decides *how she sounds in a message she is already sending*, and `imut` that she would rather be
adorable at him than dignified. `clinginess: 0` with `girlfriend` is a Nina who never opens a
conversation and answers `iyaa sayaangg` when he opens one. Do not merge them.
```

**Code — insert after `docs/nina/persona.md:109` and before the blank line at `:110`:**

```markdown

**And five more, for `girlfriend` only.** Also the user's own, also quoted verbatim — in
`GIRLFRIEND_VOICE_EXAMPLES` rather than in `VOICE_EXAMPLES`, because they render only at that
level:

1. `iyaa sayaangg`
   — agreement, lengthened twice: the vowel of `iya` and the vowel of the pet name, whose final
   consonant doubles with it. A whole reply, two words long.
2. `okeee`
   — the same habit on a bare acknowledgement. Three `e`, and nothing else in the bubble.
3. `nanti yaaa, sabaar`
   — coaxing him to wait. `sabaar` is telling him off fondly; `sabar` would be telling him off.
4. `tar aku kirim foto nya yaa`
   — `aku` instead of `gw`, `tar` for `ntar`, `nya` loose from its word. The soft register,
   promising him something.
5. `i missed you too sayaangg, sini cium 💋💋💋`
   — English with the pet name and the lengthening intact, and emoji in a string rather than
   rationed. The habit survives the language change.

Three of those five break a bullet of the Jakarta register on purpose, and the amendment above is
where they are lifted. A prompt whose examples break its own rules teaches the model that the
rules are decorative.
```

**Code — `docs/nina/persona.md:265` becomes:**

```markdown
| `girlfriend` | his. Affectionate, allowed to want things, jealous and delighted, goes first. `manja` and `imut` with him, with the register amendment above |
```

**Impact:** documentation only. No code, no test.

## Verification

**Install (first, once — the worktree ships without `node_modules`):**

```bash
cd /home/miftah/.worktrees/run-insights/admin-responsive-nina-intimacy && npm ci
```

**Build / typecheck:** `npm run typecheck`
**Tests:** `npm run test`
**Focused:** `npm run test -- tests/nina.prompts.test.ts`
**Lint:** `npm run lint`
**Format:** `npx prettier --check lib/nina/persona.ts lib/nina/prompts/system.ts lib/nina/prompts/index.ts tests/nina.prompts.test.ts docs/nina/persona.md`

**The invariant, checked directly rather than only through vitest** — run this after Step 5 and
confirm it prints nothing:

```bash
cd /home/miftah/.worktrees/run-insights/admin-responsive-nina-intimacy
git diff 02dc79a -- lib/nina/persona.ts | grep -E '^[-+]' | grep -vE '^(\+\+\+|---)' \
  | grep -vE 'manja|imut|MANJA|isGirlfriend|GIRLFRIEND_VOICE|ninaGirlfriendVoiceBlock'
```

Anything printed is a line this phase changed OUTSIDE its own additions, and every such line is a
candidate byte-identity break. (Expect the docstring and comment lines of Steps 3 and 4 to be
filtered out by the pattern; if the grep is noisy, read the hunk headers instead — there should be
exactly three hunks in `persona.ts`.)

**Manual check:** `npm run dev`, open `/admin/nina`, expand the prompt preview.
1. With **Best friend** selected (the default): the preview contains no `sayaangg`, no `manja`, and
   the `HOW YOU TALK` section runs `LANGUAGE_RULE` → Jakarta register → slang → English register →
   name rules, exactly as before.
2. Switch to **Girlfriend**, save, reload: a new paragraph appears between the Jakarta register and
   the slang inventory, and five new example lines appear under `EXACTLY HOW YOU SOUND` — including
   `i missed you too sayaangg, sini cium 💋💋💋` with all three emoji.
3. Switch back to **Best friend**, save: both disappear.

**Exit criteria:**
- `npm run test && npm run typecheck && npm run lint` are green.
- `tests/__snapshots__/nina.prompts.test.ts.snap` is committed, was generated before any source
  edit, and passes unchanged after all of them — so `nobody`, `casual_friend`, `sister` and
  `best_friend` render byte identical to `origin/main` @ `02dc79a`.
- `buildNinaSystemPrompt(tuned({ relationship: 'girlfriend' }))` contains all five of the user's
  lines verbatim, the vowel-lengthening rule, and the words `"manja"` and `"imut"`.
- `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS) === NINA_SYSTEM_PROMPT`, and neither contains
  `sayaangg` or `💋`.
- `lib/nina/tuning.ts` is not in the diff.

## Handoffs

**To phase 4 (per-parameter enable toggles) — one seam, named:**
`isGirlfriend` in `lib/nina/persona.ts` is the single expression gating everything this phase adds.
When `enabled` lands, phase 4 should edit that one line to
`tuning.relationship === 'girlfriend' && tuning.enabled.relationship` and both blocks go quiet
together — no other change is needed to put the girlfriend register behind the relationship's
toggle, which is what plan invariant 6 (a disabled parameter contributes zero bytes) requires. Note
also that `NINA_RELATIONSHIP_BLOCKS.girlfriend.identity` is rendered by `ninaIdentity`, which phase
4 must gate separately; that function is not this phase's and this phase did not change its shape.

**To phase 4 — the test helpers still compile:** `tuned()`, `withTrait()`, `withDial()` and
`withRelationship()` in `tests/nina.prompts.test.ts` all spread `NINA_TUNING_DEFAULTS`, so a
required `enabled` field arrives through the spread and none of this phase's assertions needs
touching.

**To phase 5 (`horny`):** the `💋💋💋` repeal of `JAKARTA_REGISTER`'s one-emoji line is already
done here, for `girlfriend`. Phase 5 should not repeat it in a `horny` band; if it needs emoji at a
non-girlfriend relationship it is a second, independent repeal and should be written as one. Also:
`persona.ts`'s header states there is deliberately no arbitration between contradictory settings —
`horny: 100` with `girlfriend` puts both paragraphs in the prompt and the model blends them, which
is the intended behaviour, not a bug to design around.

**`NINA_PROMPT_VERSION` — RECONCILED: this phase's claim stands.** The set's single bump (3 → 4,
Step 6), on the convention `lib/nina/prompts/index.ts:22-24` records for the previous set: *"This
is the SINGLE bump for the whole set: phase 3 owns it and no other phase touches this constant,
because two bumps would date two commits to one change."* Verified across all five plans: phase 4
does not touch the constant, and phase 5 carries an explicit **"Do NOT bump `NINA_PROMPT_VERSION`"*
in its Step 5 naming this phase as the owner. Step 6 stays here.

**The snapshot fixture — RECONCILED, and now stated in both later plans.**
`tests/__snapshots__/nina.prompts.test.ts.snap` is a set-wide gate, not a phase-3 artifact. Phases 4
and 5 must leave it alone: at `enabled` all-true and `horny: 0` those four renders are unchanged by
construction, so a snapshot failure in either phase is a real invariant-1 break and regenerating it
would hide exactly the bug the fixture exists to catch. Phase 5's interface contract already carried
this prohibition; **phase 4's did not, and the reconciler added it** to phase 4's Interface Contract
and to its Verification (`vitest -u` / `--update` is forbidden for the whole set, in every phase
after this one).

**Found and deliberately not done, belonging to nobody:**
- `lib/nina/prompts/distill.ts:49` tells the librarian pass that a girlfriend calls him *"my man",
  "yang", "sayang", "beb", "baby" and the like*, and its docstring already says the register is not
  biography. The lengthened spellings are Nina's speech and the librarian is already told not to
  file her register as a fact about him, so no edit is owed. If distilled facts ever come back
  containing `sayaangg`, that line is where to look — but that is a bug report, not a planned change.
- `NINA_DIAL_SPECS` gains no `manja` dial. `lib/nina/tuning.ts`'s header records the test — no code
  path, no dial — and R2 attaches this to one relationship level rather than to a score. A slider
  would be a second control over the same text.
- `emojiRate` remains declined, on the record in `lib/nina/tuning.ts:55`.

## Rollback

This phase is one commit on `feature/admin-responsive-nina-intimacy`. `git revert` it: the six
files return to `02dc79a`, `NINA_PROMPT_VERSION` returns to 3, and
`tests/__snapshots__/nina.prompts.test.ts.snap` is deleted with the test case that wrote it. No
migration, no schema change, no persisted data — `relationship` is an existing column with an
existing vocabulary and this phase adds no value to it, so a row already set to `girlfriend` simply
renders the pre-phase prompt again.

To keep the byte-identity gate while reverting only the register (an unlikely but cheap middle
ground): revert Steps 2–6 and 8 and keep Step 1. The snapshot case stands on its own and is worth
having regardless of R2.
