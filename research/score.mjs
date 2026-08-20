import { TRUTH } from './schema.mjs'

const SCALARS = ['activityType','goal','dateLabel','startTime','endTime','location','durationSec',
  'distanceKm','activeKcal','totalKcal','elevationGainM','avgCadenceSpm','avgPaceSecPerKm',
  'avgHrBpm','maxHrBpm','restingHrBpm']

const eq = (a, b) => {
  if (typeof b === 'number' && typeof a === 'number') return Math.abs(a - b) < 0.005
  if (typeof b === 'string' && typeof a === 'string') return a.trim().toLowerCase().replace(/[.,]/g,'') === b.trim().toLowerCase().replace(/[.,]/g,'')
  return a === b
}

export function score(got) {
  const errs = []
  let pass = 0, total = 0
  const check = (path, g, t) => { total++; if (eq(g, t)) pass++; else errs.push(`${path}: got ${JSON.stringify(g)} want ${JSON.stringify(t)}`) }

  for (const k of SCALARS) check(k, got?.[k], TRUTH[k])

  const gs = Array.isArray(got?.splits) ? got.splits : []
  total++; if (gs.length === 11) pass++; else errs.push(`splits.length: got ${gs.length} want 11`)
  TRUTH.splits.forEach((t, i) => {
    const g = gs[i] ?? {}
    for (const f of ['km','timeSec','paceSecPerKm','hrBpm','cadenceSpm','partial']) check(`splits[${i}].${f}`, g[f], t[f])
  })

  const gz = Array.isArray(got?.hrZones) ? got.hrZones : []
  total++; if (gz.length === 5) pass++; else errs.push(`hrZones.length: got ${gz.length} want 5`)
  TRUTH.hrZones.forEach((t, i) => {
    const g = gz[i] ?? {}
    for (const f of ['zone','durationSec','minBpm','maxBpm']) check(`hrZones[${i}].${f}`, g[f], t[f])
  })

  const gp = Array.isArray(got?.postWorkoutHr) ? got.postWorkoutHr : []
  total++; if (gp.length === 3) pass++; else errs.push(`postWorkoutHr.length: got ${gp.length} want 3`)
  TRUTH.postWorkoutHr.forEach((t, i) => check(`postWorkoutHr[${i}].bpm`, gp[i]?.bpm, t.bpm))

  return { pass, total, pct: ((pass / total) * 100).toFixed(1), errs }
}

export function extractJson(text) {
  if (!text) return null
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a === -1 || b === -1) return null
  try { return JSON.parse(s.slice(a, b + 1)) } catch { return null }
}
