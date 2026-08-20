import { TRUTH } from './schema.mjs'
import { sessionMetrics } from './metrics.mjs'
const KEY = process.env.LLM_API_KEY
const ANT = 'https://api.z.ai/api/anthropic/v1/messages'
const m = sessionMetrics(TRUTH, { age: 30, heightCm: 169, weightKg: 55 })

const SYSTEM = `You are a running coach. Analyse the workout and compute the key metrics yourself.
Return JSON only: {"avgHrPctOfMax":number,"aerobicDecouplingPct":number,"firstToSecondHalfDriftSecPerKm":number,"percentTimeInZone4And5":number,"cadenceFadeSpm":number,"paceStdDevSec":number,"summary":string}
The runner is 30, 169cm, 55kg. Estimate HRmax with Tanaka (208 - 0.7*age).
Decoupling = (speed/HR of first half - speed/HR of second half) / first half * 100, using the 10 FULL kilometres only.
Drift = mean pace of 2nd half minus mean pace of 1st half, in seconds per km, full kms only.
Cadence fade = cadence of km10 minus cadence of km1.`

const res = await fetch(ANT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model: 'glm-5.2', max_tokens: 4000, system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify({
      distanceKm: TRUTH.distanceKm, durationSec: TRUTH.durationSec, avgHrBpm: TRUTH.avgHrBpm,
      splits: TRUTH.splits, hrZones: TRUTH.hrZones }) }] }),
})
const j = await res.json()
const txt = j.content?.map(c => c.text).join('') ?? ''
const g = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1))

const truth = {
  avgHrPctOfMax: m.avgHrPctMax, aerobicDecouplingPct: m.decouplingPct,
  firstToSecondHalfDriftSecPerKm: m.splitDriftSec, percentTimeInZone4And5: m.hardPct,
  cadenceFadeSpm: m.cadenceFade, paceStdDevSec: m.paceSdSec,
}
console.log('=== CONTROL: LLM does its own arithmetic ===')
console.log('metric                              LLM        truth      err')
let bad = 0
for (const [k, t] of Object.entries(truth)) {
  const v = g[k]
  const err = typeof v === 'number' ? Math.abs(v - t) : NaN
  const tol = Math.max(0.5, Math.abs(t) * 0.02)
  const ok = err <= tol
  if (!ok) bad++
  console.log(`${k.padEnd(34)} ${String(v).padEnd(10)} ${t.toFixed(2).padEnd(10)} ${ok ? 'ok' : '❌ ' + err.toFixed(2)}`)
}
console.log(`\n${bad}/6 metrics wrong beyond 2% tolerance`)
