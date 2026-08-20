# F07 — Insights (LLM narrative)

> **Feature:** deterministic metrics → coaching-grade prose, cached, never blocking.
> **Depends on:** F06 (`lib/metrics/*`, `lib/records/*`, flags — the numbers this feature explains).
> **Consumed by:** F08 (run detail, `/trends`), `/api/cron/rollup`.
> **Model:** `glm-5.3` via z.ai's **Anthropic-compatible** endpoint (`LLM_BASE_URL=https://api.z.ai/api/anthropic`), forced tool use, `@anthropic-ai/sdk`.

F07 owns `lib/llm/narrate.ts`: the session/week/month system prompts, the fact-shaping adapters that turn F06's metrics into LLM-ready JSON, the output Zod schemas, the repair round-trip, `facts_hash` caching into the `insights` table, and the nightly `/api/cron/rollup` refresh. F07 owns **no UI** — F08 renders whatever this module returns, including the graceful "no narrative yet" state.

The single highest-value artifact in this document is **§2, the three system prompts** — they are the tested proof-of-work from `research/narrate.mjs`, extended just far enough to cover week/month comparison and the intent write-back loop, no further.

---

## 0. Non-negotiable technical facts

Get these wrong and nothing works. They are stated once, here, and every task assumes them.

### 0.1 `glm-5.3` is not Claude, and the vision client is a different animal entirely

This feature talks to the **Anthropic-compatible** endpoint (`api.z.ai/api/anthropic`), the same one F04's extraction research proved silently drops images (IMPLEMENTATION_PLAN §1.1). That trap does not apply here — **F07 sends no images, ever.** The token-floor guard (D3) belongs to F04's vision client, not this one. Do not port it here; it would be dead code testing a condition that cannot occur.

What *does* port from the expense tracker's F04 (`expense-tracking/docs/plans/F04-llm-parsing.md` §0.1): the allowed request surface is `model · max_tokens · system · messages · tools · tool_choice` and nothing else. No `thinking`, no `strict: true`, no `cache_control`, no `temperature`. Structured output is a single forced tool, exactly as `research/narrate.mjs` proved:

```ts
tool_choice: { type: 'tool', name: 'report' }
```

### 0.2 The boundary: the LLM never computes (roadmap D2)

Measured, not assumed (IMPLEMENTATION_PLAN §1.5): given raw splits and asked to compute aerobic decoupling itself, `glm-5.3` returned **−14.1%** against a true value of **+12.3%** — not a rounding error, a **flipped sign**. Shipped, it would have told a runner their aerobic fitness held up on a run where it visibly collapsed.

**Every number F07 sends the model has already been computed by F06, rounded to its display precision, and is never recomputed by the LLM.** The LLM's only job is prose about numbers that are already correct. §1 below draws the line precisely.

### 0.3 z.ai does not enforce a tool schema's `required` array — measured

`research/results-narrative.json`, a real captured response: **the model omitted `title` from every `observations[]` entry**, despite `title` being listed in `input_schema.required`. The server returned 200. Nothing complained except downstream code that trusted the shape.

This is the same failure class the expense tracker already solved. **Reuse the exact pattern**, not a new one: Zod-validate → one repair round-trip → render the metrics with no prose. `expense-tracking/lib/llm/parseExpense.ts` is the reference implementation; §3 below is its narrate-shaped twin.

### 0.4 Cost and latency are not a constraint

Measured: ~1.7k input / ~500 output tokens, ~10s, for a session insight (`research/results-narrative.json`, `usage: { input_tokens: 1743, output_tokens: 546 }`). At list rates this is a fraction of a cent; under the coding plan it's included. **Design for correctness and restraint in the prose, not for token thrift.** §7 sets timeouts generously, not stingily.

---

## Contract deltas

One addition to ROADMAP §4.3. Nothing existing changes shape or meaning.

**Add an index to `insights`:**

```sql
CREATE INDEX insights_latest_idx ON insights (user_id, scope, scope_key, created_at DESC);
```

Rationale: `UNIQUE (user_id, scope, scope_key, facts_hash)` (already in §4.3) means a single `scope_key` (e.g. `'2026-W34'`) can accumulate several rows over time as a correction or a new run changes the facts. Every read path in this feature — "get the current insight for this run", "get last week's insight for the memory feature in §6" — wants the newest row for a `scope_key` regardless of which `facts_hash` produced it. Without this index that query is a sequential scan past every historical row. No column, type, or constraint changes.

Everything else in §4.3's `insights` table is used exactly as specified. `runs.intent` (already in §4.3, values `'easy'|'tempo'|'long'|'race'|'unspecified'`) is read and written by this feature as specified in §4, with no schema change — see the note there on the `NULL` vs `'unspecified'` distinction, which is a usage clarification, not a contract change.

This also **closes ROADMAP §10, open question 2** ("should weekly/monthly insights have memory of the previous advice?"): **yes** — see §6. It needed no schema change beyond the index above, which was going to be worth adding for query performance regardless.

---

## Interfaces I publish

Everything below is what F08 and `/api/cron/rollup` may import. Nothing else in `lib/llm/narrate.ts` is public API.

```ts
// lib/llm/narrate.ts

export type InsightScope = 'session' | 'week' | 'month'

export interface Observation {
  title: string
  detail: string
  metric: string
}

export interface InsightPayload {
  headline: string             // <= 70 chars
  verdict: 'easy' | 'moderate' | 'hard' | 'very hard'
  whatHappened: string
  observations: Observation[]  // 2-4 items
  doNext: string[]             // 1-3 items
  questionForRunner: string
}

export type InsightSource = 'llm' | 'llm_repair' | 'unavailable'

export interface InsightResult {
  /** null only when source === 'unavailable' — F08 renders metrics with no prose. */
  payload: InsightPayload | null
  source: InsightSource
  factsHash: string
  /** True for a cache hit — no LLM call was made this request. */
  cached: boolean
  usage: { inputTokens: number; outputTokens: number } | null
}

/**
 * The one function F08 and the cron job call. Never throws for an LLM problem.
 * Looks up `(userId, scope, scopeKey)` for the newest row; if its facts_hash
 * matches the freshly computed hash of `facts`, returns it (cached: true).
 * Otherwise calls the model, validates, repairs once if needed, persists a new
 * row, and returns it. On total LLM failure, returns `{ payload: null,
 * source: 'unavailable' }` and persists nothing — never a fabricated fallback,
 * see §7.
 */
export function getOrCreateInsight(
  userId: string,
  scope: InsightScope,
  scopeKey: string,
  facts: SessionNarrateFacts | WeekNarrateFacts | MonthNarrateFacts,
): Promise<InsightResult>

// The fact-shaping adapters F06's metrics feed into. See §1.
export function buildSessionFacts(input: BuildSessionFactsInput): SessionNarrateFacts
export function buildWeekFacts(input: BuildWeekFactsInput): WeekNarrateFacts
export function buildMonthFacts(input: BuildMonthFactsInput): MonthNarrateFacts

// The testable core — client injected, mirrors parseExpenseWith. See Task 4.
export function narrateWith(
  client: LlmClientLike,
  scope: InsightScope,
  facts: unknown,
  options: { model: string },
): Promise<{ payload: InsightPayload | null; source: InsightSource; usage: Usage | null }>
```

---

## 1. The boundary — what the LLM is allowed to see

**Input:** the metrics object F06 computed, the profile, and the flags F06 fired. That is the entire universe of facts. Nothing else exists to the model.

### 1.1 Never in the payload

| Excluded | Why |
|---|---|
| **Raw per-second HR or GPS time-series** | Not even close to relevant — F06 never computes with this either. Only zone-bucketed durations (already aggregated) go in. |
| **Splits with no accompanying computed stats** | Splits *are* included (§1.6 of the research proved this is safe — the model narrates them, it does not average them), but only ever alongside `computed.paceStdDevSec`, `computed.fastestKm`/`slowestKm`, etc. Never make the model the only place a split-level average would be derived. |
| **`weightKg`** | D15: no weight-based coaching claims, ever, and no comment on weight at all. `research/narrate.mjs`'s `profile` object includes `weightKg` — F07 deliberately drops it. If a future feature needs a calorie sanity check, that check is a **flag**, computed by F06, not something the narrator infers from weight. |
| **Any question requiring arithmetic** ("what fraction of this month's runs were easy") | If F06 hasn't precomputed it as a field, it does not exist for the model. There is no "the model can probably manage this one" exception — §0.2's −14.1%/+12.3% flip was on an *easier* calculation than most of these. |
| **`runs.note` (free text)** | Out of scope for v1. A runner's own words might contain numbers ("did 15k today") that disagree with the reviewed record. Mixing verified and unverified numeric claims in one prompt is exactly the kind of ambiguity §0.2 exists to prevent. Revisit only with an explicit "this is self-reported and may be wrong" label if ever added. |
| **The previous insight's full payload** (week/month) | Only a *summary* (§6) — headline, `doNext` text, timestamp. The model is told what it said, not asked to grade itself against it. |

### 1.2 What is always labelled by provenance

Two categories of number carry a label the prompt must repeat back:

1. **Self-reported profile** — age (derived from `birth_year`), height. These come from a form, not a sensor.
2. **HRmax** — carries `source: 'measured' | 'observed' | 'estimated'` from `lib/metrics/hrMax.ts` (ROADMAP §4.4). `'estimated'` is a Tanaka formula and must be called out as a formula whenever it's used in a percentage; `'observed'` is a real watch reading and may be stated plainly; `'measured'` (the runner entered it) may also be stated plainly.

This is not cosmetic. §4.1 of IMPLEMENTATION_PLAN shows the estimate was already wrong by 2 bpm on the very first run analysed. Presenting a formula as fact is the most likely way this app gives bad advice.

### 1.3 Fact shapes

Reusing `lib/format.ts`'s `pace()` and `hms()` helpers (ROADMAP §4.2 — single source of truth for how a pace or a duration renders, shared with F08's charts) so the LLM sees the exact same strings a human sees, never a second, possibly-inconsistent formatting of the same number.

```ts
// lib/llm/facts.ts — owned by F07

export interface ProfileFacts {
  age: number | null
  heightCm: number | null
  hrMax: { bpm: number; source: 'measured' | 'observed' | 'estimated' } | null
}

export interface SplitFact {
  km: number
  pace: string          // "7'22\"" — via lib/format.ts pace()
  hr: number | null
  cadence: number | null
  partial: boolean
}

export interface FlagFact {
  code: string           // e.g. 'HIGH_DECOUPLING' — see ROADMAP §4, F06 owns the catalog
  severity: 'info' | 'warn'
  value: number
}

export interface SessionFacts {
  date: string            // display label, e.g. "Thu, 20 Aug" — never used for date math
  distanceKm: number
  duration: string         // "1:18:36"
  avgPace: string           // "7'22\"/km"
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  elevationGainM: number | null
  activeKcal: number | null
  /** Ground truth once answered. See §4. Null until the runner answers. */
  intent: 'easy' | 'tempo' | 'long' | 'race' | 'unspecified' | null
}

export interface ComputedFacts {
  avgHrPctOfMax: number | null                 // null if hrMax is null — never silently defaulted
  aerobicDecouplingPct: number | null
  firstToSecondHalfDriftSecPerKm: number | null
  paceStdDevSec: number
  fastestKm: { km: number; pace: string }
  slowestKm: { km: number; pace: string }
  cadenceFadeSpm: number | null
  hrRecovery1MinBpm: number | null
  percentTimeInZone4And5: number | null
  zoneBreakdown: Array<{ zone: number; pct: number; duration: string }>
}

export interface SessionNarrateFacts {
  profile: ProfileFacts
  weeklyContext?: { runsPerWeek: number; typicalDistanceKm: number; monthlyVolumeKm: number }
  session: SessionFacts
  computed: ComputedFacts
  splits: SplitFact[]
  flags: FlagFact[]
  /** Bumped by hand whenever SESSION_SYSTEM_PROMPT's text changes. See §5. */
  promptVersion: number
}
```

`WeekNarrateFacts` and `MonthNarrateFacts` are in §6, since their distinguishing content *is* the memory/comparison design.

---

## 2. The system prompts

### 2.1 Session — the tested prompt, extended for intent-awareness

This is `research/narrate.mjs`'s `SYSTEM` constant verbatim, plus three additions: the weight exclusion (§1.1), and rules 6-7 which implement the write-back loop in §4.

```ts
export const SESSION_SYSTEM_PROMPT = `You are a running coach reading ONE workout from a recreational runner. You see only the numbers in the JSON below — nothing else is known about this runner.

HARD RULES
- Every number you state must appear verbatim in the JSON you are given. Do NOT compute
  new numbers, do NOT estimate, do NOT round differently.
- The runner's age/height are self-reported; an "estimated" HRmax is a formula, not a
  measurement. Say so when it matters. An "observed" HRmax is a real watch reading and may
  be stated plainly.
- Never mention or imply anything about body weight. It is not in your data.
- Be direct and specific. No filler, no "great job!", no hedging into uselessness.
- You are not a doctor. If something looks medically concerning, say plainly that it is
  worth a professional check, once, without alarmism. Do not repeat the warning, and do not
  alarm the runner about ordinary hard-effort numbers.
- If "session.intent" is not null, treat it as ground truth for why the effort was what it
  was. Do not ask again whether the run was deliberate — use "questionForRunner" for
  something else, or keep it light (how it felt, what's next).
- If "session.intent" is null and the flags suggest an effort/pace mismatch (e.g. a hard
  run with no obvious reason, or a very fast start), "questionForRunner" should ask whether
  that was intentional. This is the single most useful thing you can learn that the numbers
  cannot tell you.

Return a JSON object via the report tool:
{
  "headline": string,              // <= 70 chars, the single most important thing
  "verdict": "easy"|"moderate"|"hard"|"very hard",
  "whatHappened": string,          // 2-3 sentences, the story of the run in plain words
  "observations": [                // 2-4 items, most important first
    { "title": string, "detail": string, "metric": string }
  ],
  "doNext": [ string ],            // 1-3 concrete, actionable items
  "questionForRunner": string      // one thing the data cannot tell you
}`
```

### 2.2 Week — comparison, not recap

```ts
export const WEEK_SYSTEM_PROMPT = `You are a running coach reviewing ONE runner's week. You see pre-computed numbers for this week, the previous week's totals, and — if available — a short memory of what you told this runner last week and how the issues you flagged have moved since. Nothing else is known about this runner.

HARD RULES (same as session-level coaching)
- Every number you state must appear verbatim in the JSON you are given.
- Self-reported profile fields and estimated HRmax must be labelled as such.
- Never mention or imply anything about body weight.
- Be direct and specific. No filler, no "great job!".
- You are not a doctor. Flag concerns once, plainly, without alarmism.

WEEK-SPECIFIC RULES
- This is a comparison, not a recap. Lead with what changed relative to last week (volume,
  pace at matched distance, zone balance, acute:chronic ratio) — do not just re-describe this
  week's numbers as if last week did not exist.
- If "previousInsight" is present, you already told this runner something last week. Do NOT
  reuse its headline or its sentences. Read "trendSincePrevious":
    - "flagsPersisting" — an issue you raised last week that is STILL present. Say plainly
      it is still unresolved. Do not present it as a fresh discovery.
    - "flagsResolved" — a flag from last week that is now absent. You may note the
      improvement, but describe it as "this stopped showing up," never as "you fixed it
      because of my advice" — you cannot know the runner's intent, only what the numbers show.
    - "flagsNew" — something that was not a problem last week and is now. This is usually
      the most important thing to lead with.
- If nothing meaningfully changed, say that plainly in "whatHappened" and shift the
  observations to whatever IS different (even a small one) rather than restating last
  week's three points. Two weeks of identical observations is a failure of this feature,
  not a fact about the runner.
- "acuteChronicRatio" outside 0.8-1.3 is an injury-risk signal, not a performance one.
  Treat it with the same restraint as the "not a doctor" rule — mention it once, plainly.

Return a JSON object via the report tool:
{
  "headline": string,               // <= 70 chars
  "verdict": "easy"|"moderate"|"hard"|"very hard",   // this week's overall training load
  "whatHappened": string,
  "observations": [ { "title": string, "detail": string, "metric": string } ],
  "doNext": [ string ],
  "questionForRunner": string
}`
```

### 2.3 Month — trend, not a bigger week

```ts
export const MONTH_SYSTEM_PROMPT = `You are a running coach reviewing ONE runner's month. You see pre-computed numbers for this month, the previous month's totals, a week-by-week trend within the month, and — if available — a short memory of last month's advice and how things have moved since. Nothing else is known about this runner.

HARD RULES (same as session- and week-level coaching)
- Every number you state must appear verbatim in the JSON you are given.
- Self-reported profile fields and estimated HRmax must be labelled as such.
- Never mention or imply anything about body weight.
- Be direct and specific. No filler, no "great job!".
- You are not a doctor. Flag concerns once, plainly, without alarmism.

MONTH-SPECIFIC RULES
- Describe the SHAPE of the month, not a bigger version of one run: was it building volume,
  holding steady, cutting back, or overreaching? Use "verdict" for that judgement — map it
  as: "easy" = a recovery/cutback month, "moderate" = steady maintenance, "hard" = a real
  build, "very hard" = volume or intensity climbed in a way the acute:chronic trend flags as
  risky. This is a different meaning of the same four words used at session/week scope —
  that reuse is deliberate so the UI can render one verdict badge everywhere.
- Compare against the previous month's volume and against the pace trend across the weeks
  WITHIN this month at matched distance. A single week's number is not a trend; use the
  week-by-week series you are given.
- Apply the same "trendSincePrevious" discipline as the week prompt: lead with what changed,
  say plainly when an old issue persists, never claim credit or blame for what the runner did.
- If nothing meaningfully changed month over month, say so and look for the one thing that
  did — do not repeat last month's observations.

Return a JSON object via the report tool:
{
  "headline": string,
  "verdict": "easy"|"moderate"|"hard"|"very hard",
  "whatHappened": string,
  "observations": [ { "title": string, "detail": string, "metric": string } ],
  "doNext": [ string ],
  "questionForRunner": string
}`
```

### 2.4 One tool schema, shared

The output shape is identical across all three scopes (roadmap §5), so one Anthropic tool definition serves all three prompts — only `system` and the `facts` in the user turn change.

```ts
export const REPORT_TOOL: Anthropic.Tool = {
  name: 'report',
  description: 'Return the coaching report.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'verdict', 'whatHappened', 'observations', 'doNext', 'questionForRunner'],
    properties: {
      headline: { type: 'string', maxLength: 70 },
      verdict: { type: 'string', enum: ['easy', 'moderate', 'hard', 'very hard'] },
      whatHappened: { type: 'string' },
      observations: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'detail', 'metric'],
          properties: {
            title: { type: 'string' },
            detail: { type: 'string' },
            metric: { type: 'string' },
          },
        },
      },
      doNext: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
      questionForRunner: { type: 'string' },
    },
  },
}
```

**§0.3 stands: this `required` array is documentation, not enforcement.** Sending it is still correct practice (it costs nothing and it is the honest description of the contract), but the code must never assume the server checked it. Zod does the actual checking — §3.

---

## 3. Output validation — Zod, one repair, then silence

```ts
// lib/llm/schema.ts — owned by F07

import { z } from 'zod'

export const Observation = z.object({
  title: z.string().trim().min(1).max(80),
  detail: z.string().trim().min(1).max(500),
  metric: z.string().trim().min(1).max(120),
})

export const InsightPayload = z.object({
  headline: z.string().trim().min(1).max(70),
  verdict: z.enum(['easy', 'moderate', 'hard', 'very hard']),
  whatHappened: z.string().trim().min(1).max(800),
  observations: z.array(Observation).min(2).max(4),
  doNext: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
  questionForRunner: z.string().trim().min(1).max(300),
})

export type InsightPayload = z.infer<typeof InsightPayload>
```

`Observation.title` is exactly the field measured missing in `research/results-narrative.json`. This is the field the repair round-trip exists to fix.

The control flow is `parseExpenseWith` (`expense-tracking/lib/llm/parseExpense.ts:114-240`) with the fallback stage deleted, because **there is no safe deterministic fallback for prose.** A regex can safely re-derive a title or an amount because those are mechanical transformations of the same text. There is no mechanical transformation that turns `computed.aerobicDecouplingPct: 12.3` into a truthful sentence — inventing one is exactly the failure mode §0.2 exists to prevent, just moved into "our" code instead of the model's. **The only safe fallback for narrative is the absence of narrative.**

```ts
// lib/llm/narrate.ts (excerpt) — the repair round-trip, structurally identical to
// parseExpenseWith, minus the fallback stage.

async function narrateWith(
  client: LlmClientLike,
  scope: InsightScope,
  facts: unknown,
  options: { model: string },
): Promise<{ payload: InsightPayload | null; source: InsightSource; usage: Usage | null }> {
  const system = systemPromptFor(scope)
  const deadline = Date.now() + OVERALL_DEADLINE_MS
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Analyse this ' + scope + '.\n\n' + JSON.stringify(facts, null, 2) },
  ]

  let first: Anthropic.Message | null = null
  try {
    first = await client.messages.create(baseBody(options.model, system, messages), {
      timeout: Math.min(PRIMARY_TIMEOUT_MS, remaining(deadline)),
    })
  } catch (cause) {
    logLlmFailure('primary', scope, cause)
  }

  const firstBlock = first ? findToolUse(first) : null
  const truncated = first?.stop_reason === 'max_tokens'
  if (firstBlock && !truncated) {
    const parsed = InsightPayload.safeParse(firstBlock.input)
    if (parsed.success) return { payload: parsed.data, source: 'llm', usage: usageOf(first) }

    if (deadline - Date.now() > MIN_REPAIR_BUDGET_MS) {
      const repaired = await attemptRepair(client, options.model, system, messages, firstBlock, parsed.error, deadline)
      if (repaired) return { payload: repaired.data, source: 'llm_repair', usage: repaired.usage }
    }
  }

  // No safe fallback for prose. Metrics render with no narrative. Never fabricate.
  return { payload: null, source: 'unavailable', usage: null }
}
```

**Repair preamble**, mirroring the expense tracker's `REPAIR_PREAMBLE`:

```ts
const REPAIR_PREAMBLE =
  'Your report call did not validate. Fix ONLY the listed problems and call report again ' +
  'with the corrected data. Every observation needs title, detail, AND metric — do not drop ' +
  'title. Do not introduce any new numbers; reuse exactly what you already had.\n\n' +
  'Validation errors:\n'
```

The added line ("do not introduce any new numbers") exists because a naive repair invites the model to "helpfully" rewrite the whole payload — including numbers that were already correct — while fixing one missing field. Constraining the repair to the *listed* problems keeps §0.2's guarantee intact through the repair path too.

---

## 4. `questionForRunner` and the intent write-back loop

### 4.1 Why this field exists

The data cannot know whether a hard run was *intended*. `flags.TOO_MUCH_HARD` and `flags.HIGH_DECOUPLING` fire identically whether the runner meant to run easy and blew it, or meant to run a tempo session and executed it exactly as planned. Scolding the second runner is wrong and erodes trust in every future insight. Asking turns a scolding into a conversation — and per the measured example, it's a genuinely good question:

> *"Was there a reason for the aggressive opening km — racing a segment, running with someone, or just feeling good?"*

### 4.2 The write-back

`questionForRunner` is prose — a runner cannot reliably reply to open text with something F06's flag logic can consume later. The answer that matters is `runs.intent`, a closed enum (ROADMAP §4.3: `'easy'|'tempo'|'long'|'race'|'unspecified'`), because only a closed value is safe for a future rule like *"suppress `HIGH_DECOUPLING` severity when `intent = 'tempo'`."*

So the loop is: **the LLM's question is open-ended and human; the runner's answer is a five-button closed choice.** F08 renders the question text under the narrative card with five buttons (the enum values, human-labelled: "Easy run", "Tempo/hard on purpose", "Long run", "Race", "Not sure"). Picking one calls a Server Action owned by F03's data layer:

```ts
// F03 owns this mutation; F07 only depends on its effect.
setRunIntent(runId: string, intent: RunIntent): Promise<void>
```

**Clarifying the `NULL` vs `'unspecified'` distinction** (no schema change, just precise usage): `NULL` means *never asked or never answered* — F07 should keep asking. `'unspecified'` means the runner was asked and picked "Not sure" — a real answer that means "no, I don't have a reason." F07 must not keep re-asking the intent question once `intent` is non-null, `'unspecified'` included (rule 6 in §2.1); asking twice is exactly the nagging the product's "reading app, not a dashboard" tenet forbids.

### 4.3 Why the write-back invalidates, and why that's enough

`session.intent` is part of `SessionNarrateFacts` (§1.3), which is part of what gets hashed (§5). Setting it therefore changes `facts_hash` for:

1. **That session's own insight** — its narrative should now acknowledge the intent instead of asking about it.
2. **Every week/month insight whose scope includes that run** — a deliberate tempo session should stop being read as a pacing failure in the weekly rollup too, which is the whole point (roadmap §5: *"the answer... stops future analysis from mislabelling deliberate tempo runs as pacing failures"*).

No eager regeneration is needed for any of these — `getOrCreateInsight` is lazy by construction (§5). The Server Action only needs to call Next's path revalidation for the affected run/week/month routes so the next render is guaranteed to see the stale hash and regenerate, rather than serving a stale cached React payload showing the now-outdated question. A ~10s wait right after an explicit user action ("thanks, updating...") is acceptable; a silent nightly cron making a passive page-view wait is not (§7).

---

## 5. `facts_hash` — precise input, and why it must include the prompt itself

**Purpose:** regenerate an insight only when something that could change its content has changed — a review correction (F05), a newly observed HRmax (F02/F06's `hrMax.ts`), a rollup gaining a new run, or an intent answer (§4). Everything else is a cache hit.

### 5.1 What's hashed

Exactly the object serialized into the user turn — the full `SessionNarrateFacts` / `WeekNarrateFacts` / `MonthNarrateFacts`, **plus one field not shown in §1.3's types because it isn't a fact about the run: `promptVersion`.**

```ts
// lib/llm/factsHash.ts

import { createHash } from 'node:crypto'

/**
 * Recursively sorts object keys so JSON.stringify is independent of insertion
 * order — the roadmap's D2/D5 integer discipline already keeps every NUMBER
 * exact; this is the same discipline applied to serialization shape. Arrays
 * are NOT reordered: splits are ordered by km, weekly trend points by date,
 * and that order is itself meaningful.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalize(v)]),
    )
  }
  return value
}

export function factsHash(facts: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(facts))).digest('hex')
}
```

### 5.2 Why `promptVersion` is part of the hash

If the system prompt text changes (a wording fix, a new hard rule) but the underlying numbers haven't, `facts_hash` computed from the numbers alone would be **identical** to the previous version's hash — the old, now-stale insight would serve forever with no way to bust it short of a manual DB delete. `promptVersion` is a small integer constant next to each `*_SYSTEM_PROMPT`, bumped by hand on every prompt edit:

```ts
export const SESSION_PROMPT_VERSION = 1
export const WEEK_PROMPT_VERSION = 1
export const MONTH_PROMPT_VERSION = 1
```

It is folded into the facts object before hashing (`{ ...facts, promptVersion }`), never sent to the model (it is stripped before serializing the user turn — the model has no use for it and it is not a "fact" in the §1 sense).

### 5.3 A pleasant side effect: caching also hides run-to-run nondeterminism

IMPLEMENTATION_PLAN §1.6 and this feature's own measured fixture disagree with each other: the plan's prose quotes a **"very hard"** verdict and a headline about "93% of estimated HRmax" from one sampling run; `research/results-narrative.json` — a different call against the *identical* facts — returned **"hard"** and a headline about "zone 4-5... too hard to be easy, too slow to be a workout." Same numbers, two different (both reasonable) narrations. That's the model, not a bug.

Because `getOrCreateInsight` only calls the model when the hash is a miss, a runner never sees this variance — the first successful call for a given `(scope_key, facts, promptVersion)` triple is the one they see until something real changes. Caching solves the cost problem and the nondeterminism-annoyance problem with the same mechanism.

---

## 6. Week/month: comparison, memory, and the insight-fatigue problem

**Recommendation: yes, give weekly/monthly insights memory.** It costs one extra query and one extra JSON object per call; retrofitting it later means backfilling "what did we tell this runner historically" with no record of what actually shipped. Cheap now, as the roadmap already suspected.

### 6.1 What "memory" actually is

Not a chat history, not a running transcript. Two small, purpose-built objects:

```ts
export interface PreviousInsightSummary {
  scopeKey: string        // '2026-W33'
  headline: string
  doNext: string[]
  createdAt: string       // ISO, for "N days ago" framing if F08 wants it
}

/**
 * The ENTIRE anti-repetition mechanism. Deterministic, TS-computed, unit-tested —
 * never left to the model to infer by diffing two headline strings itself, which
 * would be exactly the arithmetic-by-LLM mistake §0.2 exists to prevent.
 */
export interface TrendSincePrevious {
  flagsNew: string[]                              // fired this period, not last
  flagsResolved: string[]                         // fired last period, not this one
  flagsPersisting: string[]                       // fired both periods
  volumeDeltaPct: number | null                   // (this - prev) / prev * 100, precomputed
  paceDeltaSecPerKmAtMatchedDistance: number | null
}
```

`TrendSincePrevious` is built by a pure function in `lib/llm/facts.ts`:

```ts
export function buildTrendSincePrevious(
  currentFlags: FlagFact[],
  previousFlags: FlagFact[],
  currentVolumeKm: number,
  previousVolumeKm: number | null,
  currentPaceAtMatched: number | null,
  previousPaceAtMatched: number | null,
): TrendSincePrevious {
  const curCodes = new Set(currentFlags.map((f) => f.code))
  const prevCodes = new Set(previousFlags.map((f) => f.code))
  return {
    flagsNew: [...curCodes].filter((c) => !prevCodes.has(c)),
    flagsResolved: [...prevCodes].filter((c) => !curCodes.has(c)),
    flagsPersisting: [...curCodes].filter((c) => prevCodes.has(c)),
    volumeDeltaPct:
      previousVolumeKm && previousVolumeKm > 0
        ? +(((currentVolumeKm - previousVolumeKm) / previousVolumeKm) * 100).toFixed(1)
        : null,
    paceDeltaSecPerKmAtMatchedDistance:
      currentPaceAtMatched != null && previousPaceAtMatched != null
        ? currentPaceAtMatched - previousPaceAtMatched
        : null,
  }
}
```

This is set arithmetic and subtraction over numbers F06 already computed — not new arithmetic the model would otherwise have to do, and not a rule the model invents (the flag catalog stays entirely F06's).

### 6.2 Full week/month fact shapes

```ts
export interface WeekMetricsFacts {
  isoWeek: string                       // '2026-W34'
  runCount: number
  volumeKm: number
  longestRunKm: number
  zone1And2Pct: number                  // the polarisation check, roadmap §4
  acuteChronicRatio: number | null      // null until 28 days of history exist
  avgPaceAtComparableDistance: string | null
}

export interface WeekNarrateFacts {
  profile: ProfileFacts
  week: WeekMetricsFacts
  previousWeek: { volumeKm: number; runCount: number } | null
  previousInsight: PreviousInsightSummary | null
  trendSincePrevious: TrendSincePrevious | null   // null iff previousInsight is null
  flags: FlagFact[]
  promptVersion: number
}

export interface MonthMetricsFacts {
  monthKey: string                      // '2026-08'
  volumeKm: number
  weeklyVolumeSeries: Array<{ isoWeek: string; volumeKm: number }>   // the "trend, not a bigger week"
  paceTrendAtMatchedDistance: Array<{ date: string; paceSecPerKm: number; distanceKm: number }>
  zoneBreakdown: Array<{ zone: number; pct: number }>
  acuteChronicRatioTrend: Array<{ isoWeek: string; ratio: number | null }>
}

export interface MonthNarrateFacts {
  profile: ProfileFacts
  month: MonthMetricsFacts
  previousMonth: { volumeKm: number } | null
  previousInsight: PreviousInsightSummary | null
  trendSincePrevious: TrendSincePrevious | null
  flags: FlagFact[]
  promptVersion: number
}
```

`previousInsight` is fetched by `getPreviousInsight(userId, scope, precedingScopeKey)` — a query against the `insights_latest_idx` index added in **Contract deltas**, filtered to the scope_key immediately before the one being generated (previous ISO week / previous calendar month), ordered `created_at DESC LIMIT 1`. No new table.

### 6.3 The insight-fatigue problem, addressed directly

The failure mode named in the brief — "week 5 reads identically to week 4" — is prevented by three independent mechanisms, not one:

1. **Structural**: `TrendSincePrevious` is *always* non-empty-shaped (even an all-persisting week has a non-trivial `flagsPersisting` list), so the model always has *something* different to say relative to last time, even when the underlying numbers barely moved.
2. **Prompt-level**: WEEK/MONTH rule "do not reuse its headline or its sentences" plus the explicit instruction to say "still unresolved" rather than re-discovering an old flag. This is a direct instruction, not a hope.
3. **Product-level, the honest fallback**: if truly nothing changed, the prompt tells the model to *say that plainly* rather than manufacture false novelty. A week that says "nothing changed, here's the one thing that's slightly different" is a correct, non-repetitive output even when it's short — the failure mode is pretending three points changed when none did, not brevity.

**What memory explicitly does NOT do:** claim the runner acted on prior advice. `doNext` text is free-form ("cap easy runs at Zone 2") and there is no reliable, honest way to verify a runner "followed" a sentence like that from metrics alone — the flags diff shows *outcomes* (did `TOO_MUCH_HARD` stop firing), never *causation* (did they read the advice and act on it, or did the weather change). Both prompts carry this restraint as an explicit rule. Overclaiming causation is a second, subtler version of §0.2's arithmetic mistake: it's the model inventing a fact (why something changed) it cannot verify.

---

## 7. Cost, timeouts, and graceful failure

### 7.1 Timeouts

Two budgets: session calls are smaller (§0.4: ~1.7k in / ~500 out measured); week/month calls carry more context (`trendSincePrevious`, weekly series) and are allowed more headroom.

```ts
// Session
const SESSION_PRIMARY_TIMEOUT_MS = 15_000
const SESSION_REPAIR_TIMEOUT_MS  = 10_000
const SESSION_OVERALL_DEADLINE_MS = 28_000
const SESSION_MAX_TOKENS = 1_200        // measured 546 out; ~2x headroom

// Week / month
const PERIOD_PRIMARY_TIMEOUT_MS = 20_000
const PERIOD_REPAIR_TIMEOUT_MS  = 12_000
const PERIOD_OVERALL_DEADLINE_MS = 35_000
const PERIOD_MAX_TOKENS = 1_600

// Shared
const MIN_REPAIR_BUDGET_MS = 3_000      // below this, skip repair — same rule as F04
```

Every path stays comfortably under Vercel Hobby's 60s ceiling even invoked inline (35s worst case + auth/serialization, versus F04's 41s worst case for a 60s ceiling) — **but F07 should not run inline with page render regardless.** §7.2 explains why.

### 7.2 Never block the page on the model

The run detail page's numbers (F06's output — stored, deterministic, already correct) render immediately regardless of narrative status. The narrative card is a **separate, suspended fetch**: the page ships with the metrics and a "the coach is reading this..." skeleton, and the insight streams in over the ~10-28s it takes, or resolves to the "coach unavailable" state (§7.3). This is the literal meaning of roadmap §5's "render the metrics with no prose" and CRITICAL DESIGN POINT 8's "never block" — it is a UI/data-fetching pattern, not just an error-handling one. F08 owns the component; F07's job is only to make `getOrCreateInsight` safe to await from a slow, non-blocking boundary (a route handler or a Server Action called from a client-side `useEffect`/Suspense boundary, not from the page's own server component render path).

For week/month, this concern mostly evaporates: §8's nightly cron means the common case is a cache hit that resolves in single-digit milliseconds when `/trends` is opened. The slow path only fires the first time a period is viewed before the cron has run.

### 7.3 When the model is down

`narrateWith` (§3) already returns `{ payload: null, source: 'unavailable' }` on total failure — never an exception for an LLM problem, exactly like `parseExpense`'s contract. **Unlike `parseExpense`, there is no third stage.** No regex can write two honest sentences about aerobic decoupling; a deterministic "fallback narrative" would just be a canned platitude wearing a coach's voice, which is worse than nothing. The correct behaviour is: `insights` gets no new row, `getOrCreateInsight` returns `unavailable`, and F08 renders the metrics/flags/charts (already complete and useful on their own — F06 shipped before F07 for exactly this reason) with a plain, honest state: *"Coach's take isn't available right now."* No retry loop inside the request — the next natural view of the page, or the next cron run, tries again for free because nothing was cached from the failure.

---

## 8. `/api/cron/rollup`

Guarded by `CRON_SECRET` (ROADMAP §4.1, §4.8), scheduled nightly via Vercel Cron (`vercel.json`).

```ts
// app/api/cron/rollup/route.ts — sketch, not the final implementation

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const users = await listActiveUsers()  // F03 query: anyone with a reviewed run in, say, 60d

  for (const userId of users) {
    try {
      const week = await buildWeekFacts({ userId, isoWeek: currentIsoWeek() })
      await getOrCreateInsight(userId, 'week', week.week.isoWeek, week)

      const month = await buildMonthFacts({ userId, monthKey: currentMonthKey() })
      await getOrCreateInsight(userId, 'month', month.month.monthKey, month)
    } catch (cause) {
      // One user's failure must never stop the run for everyone else.
      console.warn(`[cron rollup] user=${userId} ${String(cause)}`)
    }
  }

  return Response.json({ ok: true, users: users.length })
}
```

**Why this is cheap in steady state:** `getOrCreateInsight` only reaches the LLM on a hash miss. A user who ran nothing new since yesterday's cron produces the same facts, the same hash, and a pure cache hit — the nightly job's real LLM cost is proportional to *new activity*, not to user count times two calls. At the project's own scale (one user, ~17 runs/month) this is a non-issue; the loop stays sequential rather than parallel for the same reason F04 stays conservative about concurrency against z.ai — no evidence yet that the rate limit tolerates a burst, and no need to find out on a personal app.

**Only the current, in-progress week/month is generated** — no special-casing for "wait until the period is over." A mid-week insight is still useful (that's the entire point of `/trends` being readable at any time), and caching means it simply refreshes as more runs land within the same period.

---

## 9. Task breakdown

1. **Branch, directories.** `lib/llm/{narrate.ts,facts.ts,schema.ts,factsHash.ts,client.ts}`, `lib/llm/__tests__/`, `lib/llm/__fixtures__/` (symlink or copy `research/results-narrative.json` in as the canonical fixture — do not hand-transcribe it a second time).

2. **`lib/llm/schema.ts`.** `Observation` and `InsightPayload` Zod schemas (§3). Test: the *measured* `results-narrative.json`'s `out` object round-trips through `InsightPayload.parse` (it has `title` present in that capture — confirm; if a captured fixture ever has `title` missing, that becomes the primary repair-path test fixture instead).

3. **`lib/llm/factsHash.ts`.** `canonicalize` + `factsHash` (§5). Tests: two objects with identical values but different key insertion order hash identically; two objects differing only in `promptVersion` hash differently; array order changes the hash (splits are not key-sorted).

4. **`lib/llm/prompt.ts`.** `SESSION_SYSTEM_PROMPT`, `WEEK_SYSTEM_PROMPT`, `MONTH_SYSTEM_PROMPT`, `REPORT_TOOL`, the three `*_PROMPT_VERSION` constants (§2, §5.2). No logic here, just the constants — type-only SDK import, same convention as `expense-tracking/lib/llm/prompt.ts`.

5. **`lib/llm/client.ts`.** Same shape as the expense tracker's (`import 'server-only'`, lazy singleton, `env.LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL`). This may already exist from F04's vision work if F04 chose to colocate both clients — if so, confirm it, do not duplicate it.

6. **`lib/llm/narrate.ts` core — `narrateWith`.** The client-injected testable function (§3). Tests, with a fake `LlmClientLike`:
   - a well-formed tool_use response on attempt 1 → `source: 'llm'`, no second call made.
   - a response missing `title` on attempt 1, well-formed on attempt 2 → `source: 'llm_repair'`, exactly one repair call, and the repair message contains the `REPAIR_PREAMBLE` text.
   - both attempts malformed → `payload: null`, `source: 'unavailable'`, no exception thrown.
   - the primary call throwing (network error) → falls straight to `unavailable` without attempting a repair against nothing.
   - remaining deadline under `MIN_REPAIR_BUDGET_MS` → repair is skipped even though the first response was invalid.

7. **`lib/llm/facts.ts` — session.** `buildSessionFacts`, consuming F06's `SessionMetrics` + `Flag[]` + `ProfileRecord` + `runs.intent`. Test: feeding it the canonical fixture's known values (decoupling `+12.3%`, drift `+41 s/km`, cadence fade `−18 spm`, from ROADMAP §4.9's pinned test values) produces a `SessionNarrateFacts` object whose `JSON.stringify` contains every one of those numbers as a substring — the mechanical proof that §1's "verbatim" promise starts from a fact object that actually carries the numbers, before the model is even involved.

8. **Live smoke test**, gated like F04's (`LLM_LIVE_TEST=1`), reusing the canonical fixture's exact facts from `research/results-narrative.json`. Assert shape only (Zod-valid, `verdict` is one of the four values) plus **numeric fidelity**: every metric string that appears in `computed`/`session` (e.g. `"92.5"`, `"12.3"`, `"-18"`) that the model chooses to cite must appear verbatim somewhere in the response's `whatHappened` + `observations[].detail` + `observations[].metric` concatenated — never assert exact prose, LLM output varies run to run (§5.3), but a cited number that doesn't match the input is an instant, hard failure of this test.

9. **`lib/llm/facts.ts` — week/month + `buildTrendSincePrevious`.** Pure function, unit-tested directly (§6.1) with hand-built flag-list fixtures: a week with one new flag, one resolved, one persisting produces exactly that partition; a first-ever week (`previousWeek: null`) produces `trendSincePrevious: null` without crashing.

10. **`getPreviousInsight` + `getOrCreateInsight`.** Data-layer read/write against `insights` (using the new `insights_latest_idx`, Contract deltas). Tests against a fake/in-memory DB adapter: a hash hit skips the LLM entirely (assert the injected client's `create` was never called); a hash miss calls the LLM and persists a new row without deleting the old one; a second call with unchanged facts is a hit against the row just written.

11. **Intent write-back integration test.** Build `SessionNarrateFacts` with `intent: null`, compute its hash; rebuild with `intent: 'tempo'`; assert the hashes differ. This is the mechanical proof behind §4.3's invalidation claim — no live LLM call needed for this one.

12. **`/api/cron/rollup`.** Route handler (§8): `CRON_SECRET` check returns 401 on mismatch; one user's `buildWeekFacts`/`getOrCreateInsight` throwing does not stop the loop for the next user (test with two fake users, one wired to throw); a repeat run with no new data makes zero LLM calls (assert via the injected client's call count).

13. **Wire into F08's boundary** (coordination only — F08 owns the component, F07 owns making it easy to call correctly): document, in this file's own final form or in a short README next to `lib/llm/`, that `getOrCreateInsight` must be called from a non-blocking boundary per §7.2, and that `payload: null` is not an error state to surface loudly — it's the expected shape of "no narrative yet."

---

## 10. Verification

- `pnpm vitest run lib/llm/` — all offline tests (Tasks 2–3, 6–7, 9–12) green, no network access, no live key required.
- `LLM_API_KEY=… pnpm test:live` (Task 8) — green against the real endpoint. Rerun this whenever `SESSION_SYSTEM_PROMPT`/`WEEK_SYSTEM_PROMPT`/`MONTH_SYSTEM_PROMPT` text changes, and bump the corresponding `*_PROMPT_VERSION` (§5.2) as part of that same commit — a prompt edit with no version bump is a bug.
- **Manual QA against the canonical fixture:** open the canonical run's detail page in dev. Confirm `headline.length <= 70`; confirm `verdict` is a reasonable read of a run that was 90.6% in zones 4-5 (`'hard'` or `'very hard'`, not `'easy'`); cross-check every number quoted in `observations[].detail`/`metric` against `research/results-narrative.json`'s `facts` object by eye — none should be absent from that JSON.
- **Kill switch test:** set `LLM_API_KEY` to garbage, load the run detail page. Expected: metrics, charts, splits table all render normally (F06's output, independent of F07); the narrative card shows the "coach unavailable" state; **no 500, no unhandled rejection, no partial/garbled narrative.**
- **Hash stability:** round-trip a `SessionNarrateFacts` object through `JSON.parse(JSON.stringify(...))` with keys manually reordered; `factsHash` output is byte-identical. Reorder `splits` — hash changes (arrays are order-sensitive by design).
- **Intent write-back, end to end:** on the canonical run (whose flags include `FAST_START` and `HIGH_DECOUPLING` — exactly the pattern that should trigger a `questionForRunner` about intent), answer the question with "Tempo/hard on purpose." Reload the run page: the new narrative should no longer ask about intent (rule 6, §2.1), and should reference the effort as deliberate. Reload `/trends` for the week containing that run: its `facts_hash` should differ from before the answer (Task 11's assertion, now observed live).
- **Insight fatigue, week 2:** manually seed a second week's facts with `previousInsight` pointing at week 1's real captured headline and `doNext`. Confirm the week-2 output's `headline` string is not equal to week 1's, and that `trendSincePrevious.flagsPersisting`/`flagsResolved`/`flagsNew` are referenced sensibly rather than the three observations simply repeating.
- **Cron idempotency:** run `/api/cron/rollup` twice in a row against the same seeded data with no new runs in between. Second run must make **zero** LLM calls (assert via a spy on the injected client) — the entire steady-state cost claim in §8 rests on this being true, not assumed.
