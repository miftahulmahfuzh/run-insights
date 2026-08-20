import { TRUTH } from './schema.mjs'
import { sessionMetrics, flags, pace, hms } from './metrics.mjs'

const profile = { age: 30, heightCm: 169, weightKg: 55, restingHrBpm: null }
const m = sessionMetrics(TRUTH, profile)
const f = flags(m, TRUTH)

console.log('=== DETERMINISTIC METRICS (no LLM) ===')
console.log(`est. HRmax (Tanaka)   ${m.hrMaxEstimated} bpm`)
console.log(`avg HR as % of max    ${m.avgHrPctMax.toFixed(1)}%`)
console.log(`aerobic decoupling    ${m.decouplingPct.toFixed(1)}%   (>5% = cardiac drift)`)
console.log(`1st→2nd half drift    ${m.splitDriftSec > 0 ? '+' : ''}${m.splitDriftSec.toFixed(0)}s/km  (${m.negativeSplit ? 'negative split' : 'positive split'})`)
console.log(`pace consistency (sd) ${m.paceSdSec.toFixed(1)}s`)
console.log(`fastest / slowest km  km${m.fastestKm.km} ${pace(m.fastestKm.paceSecPerKm)}  /  km${m.slowestKm.km} ${pace(m.slowestKm.paceSecPerKm)}`)
console.log(`cadence fade          ${m.cadenceFade > 0 ? '+' : ''}${m.cadenceFade} spm (km1 → km10)`)
console.log(`HR recovery @1 min    ${m.hrr60} bpm`)
console.log(`time in Z4+Z5         ${m.hardPct.toFixed(1)}% of ${hms(m.zoneTotalSec)}`)
console.log('zones:', m.zonePct.map(z => `Z${z.zone} ${z.pct.toFixed(0)}%`).join('  '))
console.log('\n=== FLAGS ===')
for (const x of f) console.log(`  [${x.severity}] ${x.code} = ${typeof x.value === 'number' ? x.value.toFixed(1) : x.value}`)
