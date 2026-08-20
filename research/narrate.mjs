import { writeFileSync } from 'node:fs'
import { TRUTH } from './schema.mjs'
import { sessionMetrics, flags, pace, hms } from './metrics.mjs'

const KEY = process.env.LLM_API_KEY
const ANT = 'https://api.z.ai/api/anthropic/v1/messages'
const profile = { age: 30, heightCm: 169, weightKg: 55 }
const m = sessionMetrics(TRUTH, profile)
const f = flags(m, TRUTH)

// The LLM sees ONLY pre-computed numbers. It cannot do arithmetic wrong because it does none.
const facts = {
  profile,
  weeklyContext: { runsPerWeek: 4, typicalDistanceKm: 10.5, monthlyVolumeKm: 180 },
  session: {
    date: TRUTH.dateLabel, distanceKm: TRUTH.distanceKm, duration: hms(TRUTH.durationSec),
    avgPace: pace(TRUTH.avgPaceSecPerKm) + '/km', avgHr: TRUTH.avgHrBpm, maxHr: TRUTH.maxHrBpm,
    avgCadence: TRUTH.avgCadenceSpm, elevationGainM: TRUTH.elevationGainM, activeKcal: TRUTH.activeKcal,
  },
  computed: {
    estimatedHrMax: m.hrMaxEstimated,
    avgHrPctOfMax: +m.avgHrPctMax.toFixed(1),
    aerobicDecouplingPct: +m.decouplingPct.toFixed(1),
    firstToSecondHalfDriftSecPerKm: +m.splitDriftSec.toFixed(0),
    paceStdDevSec: +m.paceSdSec.toFixed(1),
    fastestKm: { km: m.fastestKm.km, pace: pace(m.fastestKm.paceSecPerKm) },
    slowestKm: { km: m.slowestKm.km, pace: pace(m.slowestKm.paceSecPerKm) },
    cadenceFadeSpm: m.cadenceFade,
    hrRecovery1MinBpm: m.hrr60,
    percentTimeInZone4And5: +m.hardPct.toFixed(1),
    zoneBreakdown: m.zonePct.map(z => ({ zone: z.zone, pct: +z.pct.toFixed(1), duration: hms(z.sec) })),
  },
  splits: TRUTH.splits.map(s => ({ km: s.km, pace: pace(s.paceSecPerKm), hr: s.hrBpm, cadence: s.cadenceSpm, partial: s.partial })),
  flags: f.map(x => ({ code: x.code, severity: x.severity, value: +Number(x.value).toFixed(1) })),
}

const SYSTEM = `You are a running coach reading ONE workout from a recreational runner.

HARD RULES
- Every number you state must appear verbatim in the JSON you are given. Do NOT compute
  new numbers, do NOT estimate, do NOT round differently.
- The runner's age/height/weight are self-reported; estimated HRmax is a formula, not a
  measurement. Say so when it matters.
- Be direct and specific. No filler, no "great job!", no hedging into uselessness.
- You are not a doctor. If something looks medically concerning, say plainly that it is
  worth a professional check, once, without alarmism.

Return a JSON object:
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

const res = await fetch(ANT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model: 'glm-5.2', max_tokens: 3000, system: SYSTEM,
    messages: [{ role: 'user', content: 'Analyse this run.\n\n' + JSON.stringify(facts, null, 2) }],
    tools: [{ name: 'report', description: 'Return the coaching report.', input_schema: {
      type: 'object', additionalProperties: false,
      required: ['headline','verdict','whatHappened','observations','doNext','questionForRunner'],
      properties: {
        headline: { type: 'string' }, verdict: { type: 'string', enum: ['easy','moderate','hard','very hard'] },
        whatHappened: { type: 'string' },
        observations: { type: 'array', items: { type: 'object', required: ['title','detail','metric'],
          properties: { title: { type: 'string' }, detail: { type: 'string' }, metric: { type: 'string' } } } },
        doNext: { type: 'array', items: { type: 'string' } },
        questionForRunner: { type: 'string' },
      } } }],
    tool_choice: { type: 'tool', name: 'report' },
  }),
})
const j = await res.json()
const tool = j.content?.find(c => c.type === 'tool_use')
console.log(`status=${res.status} model=${j.model} usage=${JSON.stringify(j.usage)}`)
if (!tool) { console.log(JSON.stringify(j, null, 2).slice(0, 2000)); process.exit(1) }
const out = tool.input
console.log('\n' + '='.repeat(72))
console.log(out.headline.toUpperCase())
console.log('='.repeat(72))
console.log(`verdict: ${out.verdict}\n`)
console.log(out.whatHappened + '\n')
for (const o of out.observations) console.log(`▸ ${o.title}\n  ${o.metric}\n  ${o.detail}\n`)
console.log('DO NEXT:'); for (const d of out.doNext) console.log('  • ' + d)
console.log('\nASKS YOU: ' + out.questionForRunner)
writeFileSync(new URL('./results-narrative.json', import.meta.url), JSON.stringify({ facts, out, usage: j.usage }, null, 2))
