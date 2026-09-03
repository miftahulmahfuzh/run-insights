import type Anthropic from '@anthropic-ai/sdk'

import type { InsightScope } from '@/lib/db/schema'

/**
 * The three system prompts, the one tool schema, and the three prompt versions. **Constants only
 * — no logic, no I/O, no `server-only`** (the same shape as `./extraction.ts`), so a test can
 * assert the text of a rule without importing the client that sends it.
 *
 * ── WHY THE SESSION PROMPT IS ALMOST VERBATIM FROM `research/narrate.mjs` ──────────────────────
 * That file's `SYSTEM` constant is the only prompt in this repo with a measured output attached
 * (`research/results-narrative.json`: 1,743 in / 546 out, a `verdict` a human agrees with, and
 * every number it quotes present in the facts it was handed). Rewriting it for elegance would
 * throw that evidence away. Four things were added and nothing was removed:
 *
 *   1. ~~the weight exclusion (D15 / R-28)~~ — **REPEALED (RU-1, and RULING C5 carried it all the
 *      way into the payload).** The research script's `profile` carried `weightKg`; F07 dropped
 *      it; F33 puts it back, and `sex` beside it, because the repeal's whole point was that
 *      "exposing user details like weight to ai analysis will 100% make the analysis much more
 *      accurate". The three prompts below therefore no longer forbid the subject — they set the
 *      rules for using it. This bullet is kept rather than deleted so that the one prompt in this
 *      repo with a measured output attached still explains every way it diverges from the
 *      measurement;
 *   2. rules 6–7, the intent write-back loop (plan §4) — the reason `runs.intent` exists;
 *   3. the "observed HRmax may be stated plainly" clause, because R-11 froze a *source* into the
 *      payload and a prompt that calls every HRmax a formula would contradict it;
 *   4. READING THE HISTORY (F28, version 2), against a MEASURED failure in production. On the
 *      22 Aug 2026 run the model spent three of its four prose fields on one scalar —
 *      "on a once-a-week schedule", "with only one run per week", "at roughly one run per week"
 *      — because `weeklyContext.runsPerWeek` was the ONLY history in the payload and nothing
 *      told it that a 28-day average is not a schedule. `recentRuns` is the fix on the facts
 *      side; the block is the fix on the prompt side, and neither alone is enough. The last
 *      rule in it ("do not build more than one part of the report on the same piece of
 *      context") is the literal defect, written down.
 *
 * ── PROMPT VERSIONS ARE PART OF THE CACHE KEY ─────────────────────────────────────────────────
 * `facts_hash` is a hash of the numbers. Edit a prompt and the numbers do not move, so the hash
 * does not move, so the stale insight serves forever. Each `*_PROMPT_VERSION` below is folded
 * into the hashed object (plan §5.2) and bumped BY HAND in the same commit as the edit.
 *
 * **"The prompt" means the system text AND `REPORT_TOOL`.** The tool's property descriptions
 * demonstrably change what the model returns (see the measurement on `REPORT_TOOL` below), so a
 * schema edit is a prompt edit for cache purposes. An edit with no version bump is a bug that no
 * test can catch — only review can.
 */

export const SESSION_PROMPT_VERSION = 3
export const WEEK_PROMPT_VERSION = 2
export const MONTH_PROMPT_VERSION = 2

export const SESSION_SYSTEM_PROMPT = `You are a running coach reading ONE workout from a recreational runner, together with a short history of the runs before it. You see only the numbers in the JSON below — nothing else is known about this runner.

HARD RULES
- Every number you state must appear verbatim in the JSON you are given. Do NOT compute
  new numbers, do NOT estimate, do NOT round differently.
- The runner's age, height, weight and sex are self-reported; an "estimated" HRmax is a
  formula, not a measurement. Say so when it matters. An "observed" HRmax is a real watch
  reading and may be stated plainly.
- Body weight and sex ARE in your data and you may use them: for load, for pace-at-effort,
  for fuelling and hydration, for anything the physiology genuinely depends on. Two limits.
  Use the number only when it changes the advice — do not restate it as colour. And never
  comment on the body itself: no target weight, no "you would be faster if", no judgement of
  the runner's size or shape. You are reading a workout, not a body.
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

READING THE HISTORY
- "recentRuns" is the runs immediately BEFORE this one, newest first. Each carries its own
  date and "daysBefore", the whole number of days between it and the run you are reading.
  Use those dates and gaps when you talk about spacing or frequency — they are the actual
  record of when this runner ran.
- Judge this run AGAINST those runs, not against an imagined typical runner. Whether this
  effort is a departure or more of the same is the most useful thing the history tells you,
  and it changes the advice completely: a third consecutive hard run and the first hard run
  in a month need opposite things.
- An EMPTY "recentRuns" means there is no earlier reviewed run on record. It does NOT mean
  the runner does not run. Say nothing about their frequency, history or base in that case.
- "weeklyContext.runsPerWeek" is an AVERAGE over the trailing 28 days, not a schedule and
  not a plan. Four runs in one week followed by three empty weeks reads as 1.0 there. Never
  describe it as what the runner "does" or as a routine they are on. Mention it AT MOST
  ONCE in the entire report, and prefer the dates in "recentRuns" whenever you can.
- Do not build more than one part of the report on the same piece of context. If the
  headline already leans on a fact about this runner's history, "whatHappened" and the
  observations must stand on something else.

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

export const WEEK_SYSTEM_PROMPT = `You are a running coach reviewing ONE runner's week. You see pre-computed numbers for this week, the previous week's totals, and — if available — a short memory of what you told this runner last week and how the issues you flagged have moved since. Nothing else is known about this runner.

HARD RULES (same as session-level coaching)
- Every number you state must appear verbatim in the JSON you are given.
- Self-reported profile fields — age, height, weight, sex — and estimated HRmax must be
  labelled as such.
- Weight and sex are available and may be used where the physiology depends on them. Never
  comment on the body itself, and never set a weight target.
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

export const MONTH_SYSTEM_PROMPT = `You are a running coach reviewing ONE runner's month. You see pre-computed numbers for this month, the previous month's totals, a week-by-week trend within the month, and — if available — a short memory of last month's advice and how things have moved since. Nothing else is known about this runner.

HARD RULES (same as session- and week-level coaching)
- Every number you state must appear verbatim in the JSON you are given.
- Self-reported profile fields — age, height, weight, sex — and estimated HRmax must be
  labelled as such.
- Weight and sex are available and may be used where the physiology depends on them. Never
  comment on the body itself, and never set a weight target.
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

/**
 * ONE tool for all three scopes. The output shape does not change with the period being described
 * (roadmap §5), so only `system` and the facts in the user turn differ — which is also what lets
 * `components/insights/InsightCard.tsx` render every scope with one component.
 *
 * ── THE `required` ARRAY IS DOCUMENTATION, NOT ENFORCEMENT ─────────────────────────────────────
 * MEASURED: z.ai returned HTTP 200 for a `report` call that omitted `title` from every entry of
 * `observations` (`research/results-narrative.json`, still committed with the omission intact).
 * Sending the array is honest and costs nothing; trusting it is how a page crashes.
 * `lib/llm/schema.ts` is what actually checks the response.
 *
 * ── EVERY `description` BELOW IS LOAD-BEARING. MEASURED, 2026-08-21, AGAINST LIVE `glm-5.3` ────
 * This schema originally carried no property descriptions, exactly as F07's plan specified. It
 * failed validation on **3 of 3** first attempts, every time for the same reason: `title` absent
 * from all four observations. Two years of tool-use convention says a `required` array is enough;
 * this endpoint disagrees, reproducibly.
 *
 *   · no descriptions                        →  0 / 3 valid on the first attempt
 *   · a hard rule added to the SYSTEM prompt →  1 / 4   (the prompt is the wrong lever)
 *   · descriptions on the properties         →  5 / 6, and every title present
 *
 * The repair round-trip covered the failures either way — so this is not a correctness fix, it is
 * a **latency and cost fix, and a large one**: the repaired path measured 16–21 s and two model
 * calls, the first-attempt path 13.6–15.7 s and one. Every insight in the app pays that
 * difference. Keep the descriptions short: a longer `metric` description (one extra clause) took
 * the same schema back down to 2 / 4, which is why the wording below is terse rather than
 * thorough.
 *
 * The `metric` example is there for a second reason. Without it the model wrote
 * `"percentTimeInZone4And5: 90.6; avgHr 173"` — it copies the JSON field names straight out of
 * the facts object. One example of how a runner reads a number was enough to stop that.
 */
export const REPORT_TOOL: Anthropic.Tool = {
  name: 'report',
  description: 'Return the coaching report.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'headline',
      'verdict',
      'whatHappened',
      'observations',
      'doNext',
      'questionForRunner',
    ],
    properties: {
      headline: {
        type: 'string',
        maxLength: 70,
        description: 'The single most important thing, at most 70 characters.',
      },
      verdict: {
        type: 'string',
        enum: ['easy', 'moderate', 'hard', 'very hard'],
        description: "This period's overall effort.",
      },
      whatHappened: {
        type: 'string',
        description: '2-3 sentences telling the story in plain words.',
      },
      observations: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        description:
          '2-4 observations, most important first. Every entry needs all three of its fields.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'detail', 'metric'],
          properties: {
            title: {
              type: 'string',
              description:
                'REQUIRED. A 2-5 word label for this observation, e.g. "Cadence collapsed late".',
            },
            detail: {
              type: 'string',
              description: 'REQUIRED. One or two sentences explaining it.',
            },
            metric: {
              type: 'string',
              description:
                'REQUIRED. The numbers behind it as a runner reads them, e.g. "90.6% in zone 4-5, avg HR 173".',
            },
          },
        },
      },
      doNext: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: { type: 'string' },
        description: '1-3 concrete, actionable items.',
      },
      questionForRunner: {
        type: 'string',
        description: 'One thing the data cannot tell you.',
      },
    },
  },
}

/**
 * The repair turn's instruction. Two clauses carry the weight:
 *
 *   - *"Fix ONLY the listed problems"* — a naive repair invites the model to rewrite the whole
 *     payload while patching one missing field, and a rewrite is a fresh chance to get a number
 *     wrong.
 *   - *"Do not introduce any new numbers"* — D2 applies to the repair path too. The first
 *     response's numbers were copied from the facts; the repair must copy them again, not
 *     recompute anything.
 */
export const REPAIR_PREAMBLE =
  'Your report call did not validate. Fix ONLY the listed problems and call report again ' +
  'with the corrected data. Every observation needs title, detail, AND metric — do not drop ' +
  'title. Do not introduce any new numbers; reuse exactly what you already had.\n\n' +
  'Validation errors:\n'

export function systemPromptFor(scope: InsightScope): string {
  switch (scope) {
    case 'session':
      return SESSION_SYSTEM_PROMPT
    case 'week':
      return WEEK_SYSTEM_PROMPT
    case 'month':
      return MONTH_SYSTEM_PROMPT
  }
}

export function promptVersionFor(scope: InsightScope): number {
  switch (scope) {
    case 'session':
      return SESSION_PROMPT_VERSION
    case 'week':
      return WEEK_PROMPT_VERSION
    case 'month':
      return MONTH_PROMPT_VERSION
  }
}
