/** Deterministic training metrics. No LLM. Every number the narrative quotes comes from here. */

export const pace = (s) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`
export const hms = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.round(s % 60)
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}` : `${m}:${String(x).padStart(2,'0')}`
}

export function sessionMetrics(s, profile) {
  const full = s.splits.filter(x => !x.partial)
  const hrMax = profile.maxHrBpm ?? Math.round(208 - 0.7 * profile.age)   // Tanaka
  const hrr = hrMax - (s.restingHrBpm ?? profile.restingHrBpm ?? 60)

  // Aerobic decoupling (Pa:Hr) — first half vs second half of the FULL kms.
  const half = Math.floor(full.length / 2)
  const ratio = (rows) => {
    const p = rows.reduce((a, r) => a + r.paceSecPerKm, 0) / rows.length
    const h = rows.reduce((a, r) => a + r.hrBpm, 0) / rows.length
    return (1000 / p) / h            // speed (m/s) per bpm
  }
  const r1 = ratio(full.slice(0, half)), r2 = ratio(full.slice(half))
  const decouplingPct = ((r1 - r2) / r1) * 100

  // Pacing: how much the second half slowed vs the first.
  const p1 = full.slice(0, half).reduce((a, r) => a + r.paceSecPerKm, 0) / half
  const p2 = full.slice(half).reduce((a, r) => a + r.paceSecPerKm, 0) / (full.length - half)
  const splitDriftSec = p2 - p1

  const paces = full.map(r => r.paceSecPerKm)
  const mean = paces.reduce((a, b) => a + b, 0) / paces.length
  const sd = Math.sqrt(paces.reduce((a, p) => a + (p - mean) ** 2, 0) / paces.length)

  const zoneTotal = s.hrZones.reduce((a, z) => a + z.durationSec, 0)
  const zonePct = s.hrZones.map(z => ({ zone: z.zone, sec: z.durationSec, pct: (z.durationSec / zoneTotal) * 100 }))
  const hardPct = zonePct.filter(z => z.zone >= 4).reduce((a, z) => a + z.pct, 0)

  const cad = full.map(r => r.cadenceSpm)
  const cadenceFade = cad[cad.length - 1] - cad[0]

  // Recovery: drop from peak in the first minute after stopping.
  const post = s.postWorkoutHr ?? []
  const hrr60 = post.length >= 2 ? post[0].bpm - post[1].bpm : null

  const kmPerKcal = s.activeKcal ? s.distanceKm / s.activeKcal : null

  return {
    hrMaxEstimated: hrMax,
    avgHrPctMax: (s.avgHrBpm / hrMax) * 100,
    decouplingPct, splitDriftSec, paceSdSec: sd,
    fastestKm: full.reduce((a, r) => (r.paceSecPerKm < a.paceSecPerKm ? r : a)),
    slowestKm: full.reduce((a, r) => (r.paceSecPerKm > a.paceSecPerKm ? r : a)),
    zonePct, hardPct, cadenceFade, hrr60, kmPerKcal,
    zoneTotalSec: zoneTotal,
    negativeSplit: splitDriftSec < 0,
  }
}

/** Fixed, testable flags. The LLM explains these; it does not invent them. */
export function flags(m, s) {
  const out = []
  if (m.decouplingPct > 5) out.push({ code: 'HIGH_DECOUPLING', severity: 'warn', value: m.decouplingPct })
  if (m.hardPct > 70) out.push({ code: 'TOO_MUCH_HARD', severity: 'warn', value: m.hardPct })
  if (m.splitDriftSec > 30) out.push({ code: 'POSITIVE_SPLIT', severity: 'info', value: m.splitDriftSec })
  if (m.cadenceFade < -8) out.push({ code: 'CADENCE_FADE', severity: 'warn', value: m.cadenceFade })
  if (m.avgHrPctMax > 90) out.push({ code: 'VERY_HIGH_AVG_HR', severity: 'warn', value: m.avgHrPctMax })
  if (m.hrr60 !== null && m.hrr60 < 20) out.push({ code: 'SLOW_HR_RECOVERY', severity: 'info', value: m.hrr60 })
  if (s.splits[0] && s.splits[0].paceSecPerKm < m.fastestKm.paceSecPerKm + 1) out.push({ code: 'FAST_START', severity: 'info', value: s.splits[0].paceSecPerKm })
  return out
}
