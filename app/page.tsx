/*
 * F02 replaces this with the sign-in landing / signed-in redirect to `/`.
 *
 * Until then it doubles as the smoke test for the v2 design tokens: if the palette, Poppins, the
 * radii, the shadow and the zone ramp all render here, `app/globals.css` is wired correctly and
 * F08 can build on it. Delete the token strip along with the placeholder.
 */
const ZONES = [
  { key: 'z1', label: 'Z1', range: '<140', cls: 'bg-z1' },
  { key: 'z2', label: 'Z2', range: '141–151', cls: 'bg-z2' },
  { key: 'z3', label: 'Z3', range: '152–163', cls: 'bg-z3' },
  { key: 'z4', label: 'Z4', range: '164–174', cls: 'bg-z4' },
  { key: 'z5', label: 'Z5', range: '175+', cls: 'bg-z5' },
] as const

export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-[470px] rounded-card bg-card p-7 shadow-sheet">
        <div className="mb-4 flex gap-[7px]">
          <span className="size-3 rounded-full bg-z1" />
          <span className="size-3 rounded-full bg-z3" />
          <span className="size-3 rounded-full bg-z5" />
        </div>

        <h1 className="mb-1.5 text-[28px] font-bold tracking-[-0.02em] text-ink">Run Insights</h1>
        <p className="mb-7 text-[13px] font-medium text-ink-3">
          Foundation is up, v2 design tokens are wired. F02 lands sign-in here.
        </p>

        <div className="mb-3 text-xs font-semibold text-accent">The five zones</div>
        <div className="mb-2 flex h-8 gap-1">
          {/* The canonical fixture: 90.6% of this run sat in zones 4 and 5. */}
          <span className="min-w-[5px] flex-[2_0_0] rounded-[9px] bg-z1" />
          <span className="min-w-[5px] flex-[1_0_0] rounded-[9px] bg-z2" />
          <span className="min-w-[5px] flex-[7_0_0] rounded-[9px] bg-z3" />
          <span className="flex-[47_0_0] rounded-[9px] bg-z4" />
          <span className="flex-[43_0_0] rounded-[9px] bg-z5" />
        </div>
        <div className="mb-7 grid grid-cols-5 gap-1.5 text-[11px] font-semibold text-ink-2 tabular-nums">
          {ZONES.map((z) => (
            <div key={z.key} className="flex flex-col gap-px">
              <span className="flex items-center gap-1">
                <span className={`${z.cls} size-2 rounded-full`} />
                {z.label}
              </span>
              <span className="text-ink-3">{z.range}</span>
            </div>
          ))}
        </div>

        <div className="mb-3 text-xs font-semibold text-accent">Number formats</div>
        <div className="mb-7 rounded-card bg-paper-2 px-[18px] py-1.5">
          {[
            ['distance', '10.67 km'],
            ['duration', '1:18:36'],
            ['pace', '7’22"'],
            ['heart rate', '173'],
            ['cadence', '144 spm'],
          ].map(([label, value], i, all) => (
            <div
              key={label}
              className={`flex items-center justify-between py-[11px] ${
                i < all.length - 1 ? 'border-b border-rule' : ''
              }`}
            >
              <span className="text-xs font-medium text-ink-3">{label}</span>
              <span className="text-[15px] font-semibold tabular-nums">{value}</span>
            </div>
          ))}
        </div>

        <div className="mb-3 text-xs font-semibold text-accent">The honesty marks</div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tabular-nums">10.67 km</span>
            <span className="rounded-pill bg-rule-2 px-[9px] py-[3px] text-[10px] font-semibold text-ink-3">
              scan
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tabular-nums">173</span>
            <span className="rounded-pill bg-z2 px-[9px] py-[3px] text-[10px] font-semibold text-white">
              edited
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-warn tabular-nums">1:16:12</span>
            <span className="rounded-pill bg-warn px-[9px] py-[3px] text-[10px] font-semibold text-ink">
              check
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}
