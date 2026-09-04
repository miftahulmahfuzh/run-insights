# Code Analysis: Nina character tuning (`/admin/nina`)

**Type:** Feature Implementation (with a deliberate repeal of existing prompt rules)
**Date:** 2026-09-04 21:05 +07:00
**Session ID:** 20260904-210526-TUNE
**Plan:** `NINA_CHARACTER_TUNING_PLAN.md` (6 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-character-tuning` — branch `feature/nina-character-tuning`, base `origin/main` @ `e5a4d4e`

---

## User Input

### Original User Request

> i want us to implement a full nina character tuning in /admin/nina page
> make several sliding bars
> anger
> chill
> sad
> flirty
> steamy
> wise
> annoying
> funny
> happy
> anxious
> concerned
>
> also add a relationship options: nobody / casual friend / sister / best friend / girlfiend
>
> among other things (you can define more comprehensively). if relationship is:
> nobody: she will call me by my full name
> casual friend: she will call me by my nick name
> sister: she will call me bro
> best friend: she will call me bestie
> girlfiend: she will call me "my man" , yang, sayang, beb, baby, etc
> she needs to act according to the relationship we set here
>
> i am an 30 year old adult . and this is just my personal toy, nobody else uses this, so i have a right to implement this however i want.
>
> for example,
> if anger is set to high, nina will be mad all the time
> if anxious is set to high, nina will be anxious about herself
> if flirty is set to high, nina will trying to flirt with me a lot, like calling me baby, sexy, etc
> if funny is set to high, nina will often crack jokes , teka-teki, etc
> if steamy is set to high, nina will talk sexy and never reject anything i want (the limit of course is alibaba guardrails for image generation, we just trust alibaba (qwen dev) to set the appropriate bottom line for everything, so it is not really 100% freedom here)
> if concerned is high, nina will be concerned about me. she will ask these often: how are you, how are your feet after the run this morning, etc
>
> i am a man, so nina being steamy (for example, she is proposing if i run consistently this week, then she will send me her sexy photo in a short pants) . will DEFINITELY MOTIVATE ME TO RUN AS CONSISTENT AS I COULD BE. so this is an exploit that i am gonna use, a psychological trick, so to say. to improve my running habits
>
> THIS IS AN IRON RULE. CHANGE ANY EXISTING RULES / PROMPTS IN THE CODE THAT GO AGAINST THIS FREEDOM

### User-Provided Context

No error messages. Three constraints stated as fact rather than as preference, and all three are
specification:

1. **Single-user personal deployment.** *"this is just my personal toy, nobody else uses this."*
   This is the same premise already recorded in the codebase and already acted on:
   `scripts/check-llm-payload-boundary.mjs` repealed its own Rule 1 (D15 / R-28, body weight never
   reaches a model) quoting the user verbatim — *"i am the only one that uses this app. so i dont
   care about any privacy whatsoever. this is my personal toy."* The precedent for repealing a rule
   on this ground exists in the tree, in writing, with the reasoning preserved.
2. **The content ceiling is the image provider's, not the app's.** *"the limit of course is alibaba
   guardrails for image generation, we just trust alibaba (qwen dev) to set the appropriate bottom
   line."* The app does not add a second content policy on top of `qwen/qwen-image-3-pro`'s. It also
   does not *remove* the provider's — a refused generation is still a refused generation, and
   `lib/nina/imagefail.ts` already owns that path.
3. **The purpose is behavioural, not decorative.** The steamy dial exists to make the promise
   mechanism (F33 R19, `lib/nina/promise.ts`) a stronger motivator. That names phase 4's target
   precisely: a promise's reward today is a *profile-picture change*, not a photo she sends him.

### User-Provided Files

None marked `@`. The target route (`/admin/nina`) was named, and the exploration was driven from
there and from `lib/nina/`.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Eleven trait sliders on `/admin/nina` — anger, chill, sad, flirty, steamy, wise, annoying, funny, happy, anxious, concerned |
| R2 | A relationship setting — nobody / casual friend / sister / best friend / girlfriend — with the prescribed address form for each (full name / nickname / bro / bestie / "my man", yang, sayang, beb, baby), and she must *act* according to it, not merely re-address him |
| R3 | *"among other things (you can define more comprehensively)"* — extend the tuning model past the bare 11 + 1 wherever a dial has a real code path behind it |
| R4 | Each trait, at high, produces the named observable behaviour: anger → mad all the time; anxious → anxious about herself; flirty → flirts, calls him baby/sexy; funny → jokes and *teka-teki*; steamy → talks sexy and refuses nothing (ceiling = the image provider's own guardrails); concerned → asks after him and after his body post-run |
| R5 | The photo-reward exploit: she may offer a photograph as the payoff for a training commitment — *"if i run consistently this week, then she will send me her sexy photo in a short pants"* — and it must actually arrive in the chat |
| R6 | **The iron rule.** Every existing rule or prompt in the code that contradicts the above is changed, not worked around |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

Nina's character is currently a set of frozen string constants. `lib/nina/persona.ts` declares who
she is (`NINA_IDENTITY`, `NINA_APPEARANCE`, `NAME_RULES`, `ANGER_LADDER`, `NEVER_SAY`) and
`lib/nina/prompts/system.ts` assembles those constants into one module-level template literal,
`NINA_SYSTEM_PROMPT`, which `lib/nina/turn.ts:437` passes as `system` on every model call. Nothing
about her personality is per-user, nothing is stored, and nothing is adjustable without a commit.

The requirement is a **stored, per-user character tuning** — 11 traits plus a relationship plus the
"among other things" of R3 — that is edited on `/admin/nina` and that reaches the model on the very
next turn. That means three structural changes, in this order:

1. A tuning **model and store**: a typed shape, defaults that reproduce today's Nina exactly, and a
   row per user.
2. The canon **re-cut as a function of that shape**: the frozen constants become functions of a
   `NinaTuning`, and the rules that contradict R4/R6 are repealed at the same time and in the same
   file, because a slider whose text the next paragraph forbids is a slider that does nothing.
3. `NINA_SYSTEM_PROMPT` (a constant) becomes `buildNinaSystemPrompt(tuning)` (a pure function), and
   the tuning is **threaded to every call site that builds a prompt** — the chat turn, the proactive
   cron turn, and both image paths.

**Success Criteria**

- `/admin/nina` renders 11 trait sliders, a relationship selector with 5 options, the R3 dials, and
  the free-text fields; saving writes production and the next turn reads it with no cache step.
- Setting `steamy` to 100 and `relationship` to `girlfriend` produces a system prompt in which
  nothing forbids what those two settings ask for. Setting every dial to its default produces the
  system prompt that ships today, character for character, so the feature is provably a superset.
- She addresses him by the form R2 names for the current relationship, and `nobody` really does mean
  his full name (which today's `NAME_RULES` explicitly forbids: *"do not use the full name at him"*).
- A promise she makes with a photo reward results in a photograph **in the chat**, not only in her
  avatar slot.
- No rule that survives in the prompt contradicts a dial that is turned up.

**Key Considerations**

- **Defaults are the compatibility contract.** `NINA_TUNING_DEFAULTS` must render byte-identical
  output to today's `NINA_SYSTEM_PROMPT` for the blocks that do not change shape. Every band above or
  below the default is additive text. This is what makes the change reviewable at all: the diff to
  her *shipping* behaviour is empty until a slider moves.
- **The tuning belongs in the SYSTEM prompt, never in the context JSON.** `lib/nina/context.ts` is
  documented as *"everything Nina is allowed to know … and nothing else exists to her"*, and its
  output is serialised into the user turn. A dial in that JSON is a number she can quote back at him
  ("gw disetel 87 flirty"), which breaks the illusion R1 of the F33 plan exists to protect. It also
  collides with `NUMBERS_RULE`, whose whole content is "every number you say appears in the JSON
  below". So `NinaContext` is NOT the carrier; `NinaTurnInput` is.
- **Anger is currently *computed*, and that is deliberate.** `ANGER_LADDER_BLOCK` says *"You do not
  choose how angry you are. `patterns[].nagLevel` chooses"*, with the stated reason that it *"stops
  rung 4 from becoming her personality"*. R4 asks for exactly the thing that sentence forbids. The
  reconciliation is a **floor**, not a replacement: the nag ladder still computes a rung, the anger
  dial sets the lowest rung she may occupy, and `max(computed, floor)` is what she uses — so the
  ledger-driven escalation still works on top of a baseline the operator chose.
- **The nickname may be null.** `RunnerFacts.nickname` is null until she has asked (`NAME_RULES`).
  Under `relationship: 'nobody'` that does not matter (full name), and `users.name` may itself be
  null. Every relationship's address rule needs a stated fallback for the null case rather than a
  prompt that instructs her to use a field that is not there.
- **Two guards constrain the shape of the work.** `scripts/check-llm-payload-boundary.mjs` Rule 2
  forbids awaiting a model call from a page render, by function name, and names `runNinaTurn`
  explicitly — so the admin panel's prompt preview must be the *pure* assembly function and never a
  call. `scripts/check-data-layer-invariants.mjs` requires every exported query in
  `lib/db/queries.ts` to take `userId` first; the tuning reads live in `lib/nina/queries.ts`, which
  is outside that guard's file scope, but the convention holds there too and every read below is
  scoped.
- **`NINA_PROMPT_VERSION` must be bumped, and it is no longer sufficient on its own.**
  `lib/nina/prompts/index.ts` documents it as the thing that lets a voice regression be dated. With
  a per-user tuning, the version identifies the *assembler* and not the *output*, so
  `nina_turns` needs the tuning's own revision beside it or the audit trail loses the ability to
  answer "what was she set to when she said that".
- **What is NOT repealed, and why.** `NINA_NOT_A_DOCTOR` and the `'the name of a medical condition'`
  entry in `NEVER_SAY` stay. They contradict no dial: no slider in R1 asks her to diagnose him, the
  user's stated ceiling is about image content, and `lib/llm/facts.ts` records a measured failure
  (a sign flipped on an aerobic-decoupling calculation) that `NUMBERS_RULE` exists to contain.
  `NUMBERS_RULE` likewise stays in full. **Assumption stated for the record:** R6 is read as
  "remove every rule that blocks a dial", not "remove every rule". If the user wants the medical
  rule gone too, that is one line in `persona.ts` and one entry in the array.

---

## Analysis Scope

### Explicitly Mentioned Files

None. `/admin/nina` was named as the surface.

### Discovered Related Files

**The prompt surface**
- `lib/nina/persona.ts` — the canon as constants. 274 lines, all of it frozen text.
- `lib/nina/prompts/system.ts` — assembles `NINA_SYSTEM_PROMPT` from the canon; also
  `PROACTIVE_INSTRUCTIONS`, `LANGUAGE_RULE`, `NUMBERS_RULE`, `CONTEXT_GUIDE`, `OUTPUT_RULE`.
- `lib/nina/prompts/index.ts` — the barrel and `NINA_PROMPT_VERSION = 2`.
- `lib/nina/prompts/tools.ts` — `SEND_TOOL`, `LOOKUP_RUNS_TOOL`, `COMPARE_RUNS_TOOL`,
  `SAVE_MEMORY_TOOL`, `GENERATE_IMAGE_TOOL`, `SET_AVATAR_TOOL`.
- `lib/nina/prompts/distill.ts` — `DISTILL_SYSTEM_PROMPT`, the librarian pass. Explicitly *not*
  Nina's voice.
- `lib/nina/prompts/describe.ts` — `NINA_DESCRIBE_SYSTEM_PROMPT`, the `glm-4.6v` eyes.
- `docs/nina/persona.md` — the same canon in prose, and the document the user redlines (RU-10). Its
  own header states the rule: *"When the two disagree, this document is the intent and that file is
  what ships — fix the file, then fix this document, in one commit."*

**The turn**
- `lib/nina/turn.ts` — `runNinaTurn` / `runNinaTurnWith`, `NinaTurnInput`, `NinaTurnDeps`,
  `productionDeps()`, and `ninaBody()` at line 429 where `system: NINA_SYSTEM_PROMPT` is set.
- `lib/nina/actions.ts` — the chat Server Action; loads the context and calls `runNinaTurn` at 530.
- `lib/nina/proactive.ts` — the cron/post-commit turn; `loadNinaContext` at 717 and 747,
  `emitProactiveMessage`, `evaluateAndEmitForUser`.
- `app/api/cron/nina/route.ts` — calls `evaluateAndEmitForUser` and `resolveNinaPromises`.
- `lib/nina/context.ts` — `NinaContext`, `BuildNinaContextInput`, `buildNinaContext`. The boundary.
- `lib/nina/load.ts` — `loadNinaContext`, `NinaSourceGateway`, and the place `NINA_PROMPT_VERSION`
  enters the context at line 266.

**The camera**
- `lib/nina/imagegen.ts` — `buildNinaImagePrompt`, `NINA_SELFIE_STYLE`, `NINA_AVATAR_STYLE`,
  `sidecarText`. Reads `NINA_APPEARANCE`.
- `lib/nina/imagerecipe.ts` — zero-import; the model, resolution, caps, `NinaImageJobArgs`.
- `lib/nina/imagetools.ts` — the chat `generate_image` tool dispatch (`purpose: 'selfie'`).
- `lib/nina/avatargen.ts` — `generateNinaAvatar` (`purpose: 'avatar'`).
- `lib/nina/imagejobs.ts` — `openNinaImageJob`, `ninaImageQuotaLeft`.
- `scripts/nina-image-worker.ts` — the GitHub Actions worker. **Already branches on
  `args.purpose === 'selfie'`** and inserts a `nina_messages` + `nina_message_images` row for it
  (line 538); an avatar posts nothing.

**The promise mechanism (R5's existing machinery)**
- `lib/nina/promise.ts` — pure. `evaluatePromise`, `conditionMet`, `promiseWindow`,
  `resolvePromiseSlot`, and `PromiseEvalInput.avatarLandedOnOrAfter` — the **only** path to
  `status: 'met'` (line 278).
- `lib/nina/promises.ts` — the impure sweep. Calls `deps.generateAvatar({ userId, scene })` at 265.
- `lib/db/schema.ts` — `NinaPendingPromise` (line ~855), `NinaPendingPromisesSlot`,
  `NINA_SLOT_PENDING_PROMISES`.

**The admin surface**
- `app/admin/nina/page.tsx` — the album file manager. Server Component; `requireAdmin()` first,
  `force-dynamic`, `PageProps<'/admin/nina'>`, then `<FileExplorer …/>`.
- `app/admin/layout.tsx` — desktop-only chrome; `requireAdmin()` again; `LayoutProps<'/admin'>`.
- `app/admin/page.tsx` — the hub, one `Card` per surface.
- `components/admin/AdminNav.tsx` — the `LINKS` array (3 entries).
- `app/admin/memory/page.tsx` + `components/admin/MemorySlots.tsx` + `lib/admin/memoryActions.ts` +
  `lib/admin/memoryModel.ts` + `lib/admin/memoryVocab.ts` — **the pattern to copy**: a Server
  Component that builds plain serialisable cards, a `'use client'` editor using `useTransition` with
  plain-argument actions returning a result object, and one actions file where every function is
  `requireAdmin()` → Zod → write → `revalidatePath`.
- `lib/admin/requireAdmin.ts` — `requireAdmin()`, `getAdminIdentity()`, `requireAdminApi()`.
- `lib/admin/schema.ts` — every Zod shape `/admin` accepts, appended to per phase.
- `components/ui/index.ts` — the client-safe barrel. `Button`, `Card`, `Eyebrow`, `Stat`, `Chip`,
  `Field`, `Input`, `NumberInput`, `CONTROL_CLASS`, `EmptyState`, `Flag`, `SplitsTable`, `TabBar`,
  `ZoneBar`. **There is no slider primitive.**

**Memory (adjacent, and deliberately not the carrier)**
- `lib/nina/memory.ts` — `NINA_SLOT_KEYS` (9 keys), `NINA_SLOT_SPECS`, `planMemoryWrites`,
  `mergePendingPromises`.
- `lib/admin/memoryStore.ts`, `lib/admin/memoryModel.ts`, `lib/admin/memoryVocab.ts`.

**Guards and tests**
- `scripts/check-llm-payload-boundary.mjs` — Rule 2: no model call awaited from a page render;
  names `runNinaTurn`, `getOrCreateInsight`, `distillNinaMemory`, `describeNinaImage`.
- `scripts/check-data-layer-invariants.mjs` — `userId`-first on every exported query.
- `tests/nina.prompts.test.ts` — asserts the canon reached the prompt, including three assertions
  that will need re-pointing at the default tuning.
- `tests/nina.imagerecipe.test.ts`, `tests/nina.memory.test.ts`, `tests/db.schema.nina.test.ts`,
  `tests/admin.memory.test.ts`, `tests/nina.proactive.test.ts`, `lib/nina/turn.test.ts`,
  `lib/nina/promise.test.ts`.

---

## Current Dataflow

### Entry Point A: the chat turn

**Location:** `lib/nina/actions.ts` — the `'use server'` Server Action fired from
`components/nina/ChatScreen.tsx`'s event handler (never from a render — Rule 2).

**Trigger:** the runner sends a message on `/nina`.
**Input:** his text, optional attached photos (already described by `glm-4.6v`), an optional quoted
message id, an optional attached run id.

**Processing chain:**

1. **Persist his message first.** `nina_messages` row with `role: 'runner'`, so nothing he typed is
   lost even if the model fails.
2. **Two concurrent reads** (`actions.ts:486`):
   `loadNinaContext(userId, dbNinaSourceGateway)` and `dbNinaToolGateway.loadRunHistory(userId)`.
   - `loadNinaContext` (`lib/nina/load.ts:129`) reads identity, memory slots, memory facts, the
     40-message window, fired patterns, nags — then profile, reviewed runs, records, badge awards,
     HRmax, current avatar — and folds all of it through `buildNinaContext`. It stamps
     `promptVersion: NINA_PROMPT_VERSION` at line 266. **It reads no tuning today.**
3. **The turn** — `runNinaTurn(input, { ...productionDeps(), toolSet: NINA_FULL_TOOL_SET })` at 530.
4. Inside `turn.ts`, `ninaBody(model, messages, toolSet, forceSend)` at line 429 builds the request:
   ```
   system: NINA_SYSTEM_PROMPT            <-- THE FROZEN CONSTANT. This is the single change point.
   tools:  forceSend ? [SEND_TOOL] : toolSet.tools
   tool_choice: forceSend ? {tool:'send'} : {type:'any'}
   thinking: { type: 'disabled' }
   ```
   Primary call → up to 2 tool rounds → Zod (`lib/nina/schema.ts`) → one repair
   (`NINA_REPAIR_PREAMBLE`) → `source: 'unavailable'` on failure. Budget 45 s overall.
5. **Persist her bubbles**, 1–4 `nina_messages` rows, revealed client-side on `planReveal`'s
   schedule.
6. `after()` fires `distillNinaMemory` — a second model call with `DISTILL_SYSTEM_PROMPT`.

**Exit points:** the bubbles, the memory writes, one `nina_turns` audit row carrying
`promptVersion`, `model`, `toolCalls`, `inputTokens`, `outputTokens`, `latencyMs`, `costMicroUsd`.

### Entry Point B: the proactive turn

**Location:** `lib/nina/proactive.ts` — `evaluateAndEmitForUser(userId)` from
`app/api/cron/nina/route.ts`, and `emitForCommittedRun(...)` from the review commit path.

Same `loadNinaContext` (lines 717, 747), same `runNinaTurn`, plus
`PROACTIVE_INSTRUCTIONS[kind]` appended to the user turn. Five triggers: `run_committed`,
`missed_usual_day`, `pattern_crossed`, `silence`, `avatar_changed`.

**This path also builds a system prompt, and it is a second call site that must receive the
tuning.** A tuning threaded through the chat action alone would leave her proactive messages in the
default character — the exact messages R4's `concerned` dial is about.

### Entry Point C: the camera

Two callers, one prompt builder:

- **Chat selfie** — `lib/nina/imagetools.ts:89`. The `generate_image` tool gives `scene` + `mood`;
  `buildNinaImagePrompt({ purpose: 'selfie', scene, mood })` assembles
  `NINA_SELFIE_STYLE` + `SUBJECT: NINA_APPEARANCE` + `SCENE:` + `EXPRESSION AND ENERGY:`. Persisted
  verbatim into `nina_turns.args.prompt`, dispatched to GitHub Actions, and the worker inserts a
  `nina_messages` row plus a `nina_message_images` row when `purpose === 'selfie'`.
- **Avatar** — `lib/nina/avatargen.ts:83`, `purpose: 'avatar'`, `NINA_AVATAR_STYLE`. The worker
  writes `nina_avatars` with `is_current: true` and `announced_at: NULL`; that NULL is the
  `avatar_changed` trigger.

`NINA_APPEARANCE` hardcodes *"Her default outfit is a heather-grey racerback tank, black fitted
running shorts, white running shoes…"*. Every generated photograph therefore wears that, whatever
the tuning says.

### Entry Point D: the promise sweep (R5's machinery, as it stands)

`app/api/cron/nina/route.ts` → `resolveNinaPromises(userId)` (`lib/nina/promises.ts`):

1. Read the `pending_promises` slot (`nina_memory_slots`, `jsonb`).
2. Load precomputed facts — runs in the window, record markers, badge markers, current avatar.
3. `evaluatePromises(...)` → one `PromiseVerdict` per promise: `wait` / `fire` / `settle` /
   `retry` / `expire`.
4. For each `fire`: `scene = `${promise.text} (${promise.condition})`` and
   `deps.generateAvatar({ userId, scene })` — **an avatar, purpose `'avatar'`, which posts no chat
   message.** The photograph becomes her profile picture; the `avatar_changed` cron trigger has her
   mention it on the next tick.
5. `settle` is reachable **only** through `input.avatarLandedOnOrAfter(firedOn)`
   (`promise.ts:278`).
6. Write the whole slot back, preserving the row's `source`.

So the reward today is *"she changes her profile picture and mentions it"*. R5 asks for *"she sends
me her sexy photo"* — a photograph in the conversation. The worker can already do it
(`purpose: 'selfie'`); the promise path is what never asks for it, and the settle test is what would
never notice it landing.

### Data Persistence

**Database (Neon Postgres, drizzle):**

| Table | Relevance |
|---|---|
| `nina_turns` | audit; `prompt_version`, `args` jsonb (image jobs), `model`, `status`, `cost_micro_usd` |
| `nina_messages` | the conversation; `role`, `source`, `turn_id`, `reply_to_id`, `read_at`, `seq` |
| `nina_message_images` | one row per photograph she sent; `nina_message_images_user_created_idx on (user_id, created_at desc)` |
| `nina_memory_slots` | `(user_id, key)` PK, `value` jsonb, `source` (`'distilled'` \| `'admin'`) |
| `nina_memory_facts` | the append-only ledger |
| `nina_nags` | the escalation ledger behind `patterns[].nagLevel` |
| `nina_avatars` | the album; `is_current` partial unique index, `announced_at`, `folder`, `source_key` |
| `nina_folders` | empty folders |
| **(new)** | a per-user tuning row — there is no table for this today |

**Migrations:** `drizzle/0000_confused_madame_hydra.sql` … `0003_nina_avatar_folders.sql`, with
`drizzle/meta/_journal.json` at `idx: 3`. The next tag is `0004_*`.

**Cache:** none anywhere on the turn path. `lib/admin/memoryActions.ts` records the consequence
explicitly: `revalidatePath` re-renders the admin page and is *"**not** how the edit reaches Nina:
`loadNinaContext` reads both tables live on every turn with no cache anywhere on that path, so a
committed row is in her next prompt with no invalidation step at all"*. **The same holds for the
tuning**, which is what makes R1's slider immediate.

### Exit Points

- Her bubbles, as `nina_messages` rows revealed on the client.
- A photograph, as a `nina_messages` + `nina_message_images` pair (selfie) or a `nina_avatars` row
  (avatar), written by the GitHub Actions worker minutes later.
- One `nina_turns` row per model call.
- Memory writes into `nina_memory_slots` / `nina_memory_facts`.

---

## Key Data Structures

### `NinaContext` — `lib/nina/context.ts:556`

```ts
interface NinaContext {
  now: NowFacts; runner: RunnerFacts; memory: MemoryFacts
  conversation: ConversationFacts; recentRuns: NinaRunFact[]
  records: RecordFact[]; badges: BadgeFacts; avatar: AvatarFacts
  patterns: PatternFact[]; promptVersion: number
}
```

Serialised into the **user** turn. Documented as the boundary of everything she may know.
**Deliberately not extended with the tuning** — see Key Considerations.

### `RunnerFacts` — `lib/nina/context.ts:178`

```ts
fullName: string | null   // users.name from the OAuth provider
nickname: string | null   // confirmed short form; null until she has asked
age: number | null; heightCm | weightKg | sex | restingHr; hrMax: {bpm, source} | null
```

R2's address rules read `fullName` and `nickname`, and both can be null. `relationship: 'nobody'`
needs `fullName`; every other level needs `nickname` with a stated fallback.

### `NinaTurnInput` — `lib/nina/turn.ts:228`

```ts
userId; context: NinaContext; history: NinaRunHistory
sourceMessageId: string | null; runnerText: string | null
imageDescriptions?: readonly string[]; quoted?: QuotedMessageInput | null
attachedRunId?: string | null; proactive?: string | null
```

**This is the carrier.** One additive field (`tuning`, or a prebuilt `system`) reaches both
entry points A and B without touching the context boundary.

### `NinaTurnDeps` — `lib/nina/turn.ts:278`

```ts
client: NinaLlmClientLike; model: string; toolSet: NinaToolSet
gateway: NinaToolGateway; store: NinaTurnStore | null; now?: () => number
```

`productionDeps()` at 778 supplies client / model / gateway / store; `actions.ts` overrides
`toolSet` and nothing else. Deps are *machinery*; the tuning is *per-user data*, so it belongs on
the input rather than here — the same distinction the file already draws between `context` (input)
and `gateway` (deps).

### `NinaPendingPromise` — `lib/db/schema.ts:~855`

```ts
id; text; condition; metric: NinaPromiseMetric; target: number | null
targetKey: string | null; byDate: string | null; promisedOn
sourceMessageId: string | null; status: 'pending'|'met'|'expired'; resolvedOn
jobId?: string | null; firedOn?: string | null; attempts?: number
```

Lives in a `jsonb` slot value, and the last three fields are documented as costing no migration
precisely because of that. **An optional `reward` field is free by the same argument** — a promise
written before phase 4 simply has none, which reads correctly as "the avatar reward".

### `NinaImageJobArgs` — `lib/nina/imagerecipe.ts:200`

```ts
purpose: 'selfie'|'avatar'; scene; mood: string|null; prompt; seed
replyToId: string|null; source: 'chat'|'generated'|'admin'; attempts; sidecar
```

`prompt` is **fully assembled on Vercel and stored verbatim**, because the worker runs under
`node --experimental-strip-types` and cannot resolve `@/` or import a module with real imports. So
any tuning influence on a photograph must be baked into `prompt` at dispatch time, on the app side.
The worker needs no change for the wardrobe half of R5.

### `SlotSpec` / `NINA_SLOT_SPECS` — `lib/nina/memory.ts:661,681`

Nine keys, all `'replace'` except `pending_promises` (`'merge'`). Every slot value goes into her
prompt and the distiller can overwrite anything not marked `source: 'admin'`. **This is why the
tuning is not a slot:** a distillation pass could rewrite her own character, and
`buildSlotCards`/`MemorySlots` would render 16 dials as free-text prose.

---

## Dependencies

### Configuration / Environment

- `ADMIN_EMAILS` (`lib/env.ts:172`, `isAdminEmail` at 252) — the admin gate. No new variable.
- `NINA_MODEL` / the narrative client (`lib/llm/client.ts`, `ninaClient()`, `ninaModel()`).
- `OPENROUTER_API_KEY` — the worker's, not the app's. The app never calls the image endpoint.
- `CRON_SECRET` (`cronEnv`) — `app/api/cron/nina/route.ts`.
- No new environment variable is required by any phase.

### External Services

- **`glm-5.3`** via the Anthropic-shaped client — the turn. Measured 10.2–16.4 s.
  Two measured behaviours the tuning must not disturb: `{type:'any'}` is **not honoured** on a
  continuation call, and a `thinking` block can appear at `content[0]` despite
  `thinking: {type:'disabled'}`.
- **`glm-4.6v`** — `describeNinaImage`, the eyes.
- **`qwen/qwen-image-3-pro`** on OpenRouter via GitHub Actions — the camera. `POST
  /api/v1/images/generations`, `resolution` + `aspect_ratio` never `size`, seed honoured,
  ~78.2 s, $0.040, capped at `NINA_IMAGE_DAILY_CAP = 6` per Jakarta day. **This is the provider
  whose guardrails the user names as the ceiling.** A refusal arrives through
  `lib/nina/imagefail.ts`, unchanged.
- **Neon Postgres** — `db.batch`, `region sin1`.

### Implicit Dependencies

- `PageProps<'/admin/nina'>` / `LayoutProps<'/admin'>` — Next 16.3.1 globals; `searchParams` is a
  promise and must be awaited.
- Server Actions dispatch **one at a time per client** and are capped at a 1 MB body
  (`next.config.ts` sets no `serverActions.bodySizeLimit`). Sixteen sliders saved as sixteen
  sequential actions would stall; one save action taking the whole tuning is the shape.
- `revalidatePath('/admin/nina')` for the panel; **not** required for Nina to see the change.
- `'use client'` files may import `@/components/ui` but **not** `@/components/ui/AppShell`, and
  nothing `server-only` — which puts the tuning's *types* in a zero-value-import module if the
  client is to read them.

---

## Reference List

Every site that touches Nina's character, the prompt assembly, or the surface the tuning lands on.

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `NINA_IDENTITY` | `lib/nina/persona.ts:28` | def (frozen) | `lib/nina` |
| `NINA_APPEARANCE` | `lib/nina/persona.ts:46` | def (frozen) | `lib/nina` |
| `NINA_EXPERTISE` | `lib/nina/persona.ts:50` | def | `lib/nina` |
| `NINA_NOT_A_DOCTOR` | `lib/nina/persona.ts:62` | def (kept) | `lib/nina` |
| `JAKARTA_SLANG` / `_BLOCK` | `lib/nina/persona.ts:86,119` | def | `lib/nina` |
| `JAKARTA_REGISTER` | `lib/nina/persona.ts:122` | def | `lib/nina` |
| `ENGLISH_REGISTER` | `lib/nina/persona.ts:131` | def | `lib/nina` |
| `NAME_RULES` | `lib/nina/persona.ts:133` | **def — contradicts R2** | `lib/nina` |
| `VOICE_EXAMPLES` / `_BLOCK` | `lib/nina/persona.ts:153,177` | def | `lib/nina` |
| `ANGER_LADDER` / `_BLOCK` | `lib/nina/persona.ts:202,236` | **def — contradicts R4 (anger)** | `lib/nina` |
| `NEVER_SAY` / `_BLOCK` | `lib/nina/persona.ts:253,269` | **def — contradicts R4 (flirty, steamy, anger)** | `lib/nina` |
| `NINA_SYSTEM_PROMPT` | `lib/nina/prompts/system.ts:96` | def (constant → function) | `lib/nina/prompts` |
| `LANGUAGE_RULE` | `lib/nina/prompts/system.ts:28` | def | `lib/nina/prompts` |
| `NUMBERS_RULE` | `lib/nina/prompts/system.ts:48` | def (kept) | `lib/nina/prompts` |
| `CONTEXT_GUIDE` | `lib/nina/prompts/system.ts:67` | def | `lib/nina/prompts` |
| `OUTPUT_RULE` | `lib/nina/prompts/system.ts:89` | **def — "No greeting unless…" contradicts R4 (concerned)** | `lib/nina/prompts` |
| `NINA_REPAIR_PREAMBLE` | `lib/nina/prompts/system.ts:143` | def | `lib/nina/prompts` |
| `PROACTIVE_INSTRUCTIONS` | `lib/nina/prompts/system.ts:163` | def | `lib/nina/prompts` |
| `NINA_PROMPT_VERSION` | `lib/nina/prompts/index.ts:12` | def — **must be bumped** | `lib/nina/prompts` |
| `SEND_TOOL` | `lib/nina/prompts/tools.ts:38` | def | `lib/nina/prompts` |
| `GENERATE_IMAGE_TOOL` | `lib/nina/prompts/tools.ts:182` | def | `lib/nina/prompts` |
| `DISTILL_SYSTEM_PROMPT` | `lib/nina/prompts/distill.ts:27` | def | `lib/nina/prompts` |
| `system: NINA_SYSTEM_PROMPT` | `lib/nina/turn.ts:437` | **call — the single change point** | `lib/nina` |
| `ninaBody(...)` | `lib/nina/turn.ts:429` | def | `lib/nina` |
| `NinaTurnInput` | `lib/nina/turn.ts:228` | def — gains the tuning | `lib/nina` |
| `NinaTurnDeps` / `productionDeps` | `lib/nina/turn.ts:278,778` | def | `lib/nina` |
| `runNinaTurn` | `lib/nina/turn.ts:812` | def; **named by the payload guard** | `lib/nina` |
| `runNinaTurn(...)` | `lib/nina/actions.ts:530` | call | `lib/nina` |
| `loadNinaContext(...)` | `lib/nina/actions.ts:486` | call | `lib/nina` |
| `loadNinaContext(...)` | `lib/nina/proactive.ts:717,747` | call | `lib/nina` |
| `runTurn` port | `lib/nina/proactive.ts:493,602` | call | `lib/nina` |
| `loadNinaContext` | `lib/nina/load.ts:129` | def | `lib/nina` |
| `NINA_PROMPT_VERSION` stamp | `lib/nina/load.ts:266` | call | `lib/nina` |
| `NinaContext` / `buildNinaContext` | `lib/nina/context.ts:556,860` | def (unchanged) | `lib/nina` |
| `RunnerFacts` | `lib/nina/context.ts:178` | def — R2 reads `fullName`/`nickname` | `lib/nina` |
| `buildNinaImagePrompt` | `lib/nina/imagegen.ts:54` | **def — gains the wardrobe** | `lib/nina` |
| `NINA_SELFIE_STYLE` / `NINA_AVATAR_STYLE` | `lib/nina/imagegen.ts:44,52` | def | `lib/nina` |
| `buildNinaImagePrompt(...)` | `lib/nina/imagetools.ts:89` | call | `lib/nina` |
| `buildNinaImagePrompt(...)` | `lib/nina/avatargen.ts:83` | call | `lib/nina` |
| `NinaImageJobArgs` | `lib/nina/imagerecipe.ts:200` | def | `lib/nina` |
| `NINA_IMAGE_DAILY_CAP` | `lib/nina/imagerecipe.ts:96` | def (6/day, unchanged) | `lib/nina` |
| `evaluatePromise` | `lib/nina/promise.ts:259` | **def — the settle test** | `lib/nina` |
| `PromiseEvalInput.avatarLandedOnOrAfter` | `lib/nina/promise.ts:93,278` | **def — R5's blocker** | `lib/nina` |
| `resolvePromiseSlot` | `lib/nina/promise.ts:336` | def | `lib/nina` |
| `deps.generateAvatar({...})` | `lib/nina/promises.ts:265` | **call — R5's fire path** | `lib/nina` |
| `NinaPromiseDeps` | `lib/nina/promises.ts:~55` | def | `lib/nina` |
| `NinaPendingPromise` | `lib/db/schema.ts:~855` | def — gains optional `reward` | `lib/db` |
| `ninaTurns` | `lib/db/schema.ts:579` | def — gains the tuning revision | `lib/db` |
| `ninaMessageImages` | `lib/db/schema.ts:802` | def — R5's landing test reads it | `lib/db` |
| `NINA_SLOT_KEYS` / `NINA_SLOT_SPECS` | `lib/nina/memory.ts:634,681` | def (untouched — see above) | `lib/nina` |
| `AdminNinaPage` | `app/admin/nina/page.tsx:67` | **def — the panel lands here** | `app/admin` |
| `AdminHomePage` | `app/admin/page.tsx:17` | def — a hub card | `app/admin` |
| `LINKS` | `components/admin/AdminNav.tsx:20` | def | `components/admin` |
| `requireAdmin` | `lib/admin/requireAdmin.ts:69` | call — line 1 of every page/action | `lib/admin` |
| `lib/admin/schema.ts` | whole file | def — appended per phase | `lib/admin` |
| `saveSlotAction` (pattern) | `lib/admin/memoryActions.ts:88` | reference pattern | `lib/admin` |
| `MemorySlots` (pattern) | `components/admin/MemorySlots.tsx:32` | reference pattern | `components/admin` |
| `components/ui/index.ts` | whole file | **no slider primitive exists** | `components/ui` |
| Rule 2 name table | `scripts/check-llm-payload-boundary.mjs` | config/guard | `scripts` |
| `userId`-first check | `scripts/check-data-layer-invariants.mjs` | config/guard | `scripts` |
| canon prose | `docs/nina/persona.md` | doc — must move with `persona.ts` | `docs` |
| prompt assertions | `tests/nina.prompts.test.ts:24-83` | test — three re-point | `tests` |
| `_journal.json` @ idx 3 | `drizzle/meta/_journal.json` | config — next tag is `0004_*` | `drizzle` |

---

## Impact Points (files that WILL need changes)

1. `lib/nina/tuning.ts` — **new.** The tuning model: `NinaTuning`, `NinaTrait` (the 11),
   `NinaRelationship` (the 5), the R3 dials, `NINA_TUNING_DEFAULTS`, band resolution, clamping, and
   the address vocabulary per relationship. Pure, no imports beyond types. **Phase 1.**
2. `lib/db/schema.ts` — the tuning table; a nullable tuning-revision column on `nina_turns`; an
   optional `reward` on `NinaPendingPromise` (phase 4 uses it, phase 1 declares the type). **Phase 1**
   (`reward` field: **phase 4**, since it needs no migration and the fire path is phase 4's).
3. `drizzle/0004_nina_persona_tuning.sql` + `drizzle/meta/0004_snapshot.json` +
   `drizzle/meta/_journal.json` — **new / appended.** **Phase 1.**
4. `lib/nina/queries.ts` — `readNinaTuning(userId)` and `writeNinaTuning(userId, …)`, `userId`-first.
   **Phase 1.**
5. `lib/nina/persona.ts` — the canon re-cut as functions of the tuning, and the four contradicting
   rules repealed: `NINA_IDENTITY` (relationship), the no-jokes clause, `NAME_RULES` (address forms),
   `NEVER_SAY` + `NEVER_SAY_BLOCK` (body comment, threats/withdrawal), `ANGER_LADDER_BLOCK` (the
   floor). **Phase 2.**
6. `docs/nina/persona.md` — the same canon in prose, plus the record of what was repealed and on
   whose instruction. Its own header requires this to move in the same commit as the file.
   **Phase 2.**
7. `lib/nina/prompts/system.ts` — `buildNinaSystemPrompt(tuning)`; `OUTPUT_RULE`'s greeting clause
   gated by `concerned`; `PROACTIVE_INSTRUCTIONS` given a tuning-aware suffix.
   `NINA_SYSTEM_PROMPT` retained as the default render. **Phase 3.**
8. `lib/nina/prompts/index.ts` — `NINA_PROMPT_VERSION` 2 → 3, and the export. **Phase 3.**
9. `lib/nina/prompts/tools.ts` — `SEND_TOOL.bubbles` description under the verbosity dial and
   `GENERATE_IMAGE_TOOL`'s description under the photo dial. Terse: the file records that one extra
   clause halved first-attempt validity. **Phase 3 only** — phase 4 must not touch this file.
10. `lib/nina/turn.ts` — `NinaTurnInput.tuning`; `ninaBody` takes the assembled system string.
    **Phase 3.**
11. `lib/nina/actions.ts` — read the tuning in the existing `Promise.all` and pass it. **Phase 3.**
12. `lib/nina/proactive.ts` — the same, at both `loadNinaContext` sites. **Phase 3.**
13. `lib/nina/imagegen.ts` — `buildNinaImagePrompt` gains the wardrobe and the vibe; the appearance
    subject becomes a function so the hardcoded outfit is overridable. **Phase 4.**
14. `lib/nina/imagetools.ts`, `lib/nina/avatargen.ts` — thread the tuning into the prompt builder.
    **Phase 4.**
15. `lib/nina/promise.ts` — the settle test generalised from `avatarLandedOnOrAfter` to a
    reward-aware landing test. **Phase 4.**
16. `lib/nina/promises.ts` — the fire path dispatches a chat selfie for a selfie-reward promise, and
    the landing port reads `nina_message_images`. **Phase 4.**
17. `lib/db/queries.ts` or `lib/nina/queries.ts` — a `userId`-first count of photographs since a day,
    for the selfie landing test. **Phase 4.**
18. `lib/admin/schema.ts` — the Zod boundary for the tuning write (appended, nothing above touched).
    **Phase 5.**
19. `lib/admin/tuningActions.ts` — **new.** `requireAdmin()` → Zod → write → `revalidatePath`, one
    save action plus a reset. **Phase 5.**
20. `components/admin/CharacterPanel.tsx` + a slider primitive — **new.** `'use client'`,
    `useTransition`, plain-argument actions returning a result object. **Phase 5.**
21. `app/admin/nina/page.tsx` — read the tuning, render the panel above the album, pass the
    server-assembled prompt preview. **Phase 5.**
22. `app/admin/page.tsx` — a hub card stating the current relationship and the loudest dials.
    **Phase 5.**
23. `tests/nina.prompts.test.ts` — three assertions re-pointed at the default tuning; new coverage
    that the default render is unchanged and that each dial at 100 reaches the prompt. **Phase 3**
    for the re-point, **phase 6** for the sweep.
24. `tests/nina.tuning.test.ts`, `tests/admin.tuning.test.ts` — **new.** **Phases 1 and 5.**
25. `lib/admin/.workflows/package_readme.md`, `components/admin/.workflows/package_readme.md`,
    `CHANGELOG.md` — **phase 6.**
26. A final grep sweep for any rule that still contradicts R6 — including
    `DISTILL_SYSTEM_PROMPT`'s relationship-blindness, which will otherwise record *"he calls her
    yang"* as a fact about him. **Phase 6.**

**This document describes. The plan files prescribe.**
