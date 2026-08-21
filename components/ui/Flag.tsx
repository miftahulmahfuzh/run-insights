import { flagCopy } from '@/lib/flags/copy'
import type { Flag as FlagData } from '@/lib/metrics'

/**
 * One coaching observation, from one of F06's seven fired flags. **F08 owns the rendering; the
 * sentence comes from `lib/flags/copy.ts` and the number from F06.** This component contains no
 * copy of its own on purpose — a string typed here would be a second place a tone rule could be
 * broken without a test noticing.
 *
 * The design brief's rule, and dataviz's, agree: **colour is never the only channel.** Severity is
 * carried three ways — the glyph (`▲` warn / `•` info), the tint, and the fact that a warn flag's
 * title is a stronger word. Screenshot this in greyscale (§11) and the distinction survives.
 *
 * No exclamation marks, no emoji, no "⚠️". `POSITIVE_SPLIT — the second half averaged +41 s/km
 * slower than the first` is the whole design.
 */
export function Flag({ flag }: { flag: FlagData }) {
  const { title, detail } = flagCopy(flag)
  const warn = flag.severity === 'warn'

  return (
    <li className={warn ? 'flex gap-3 rounded-field bg-warn-soft p-3.5' : 'flex gap-3 p-3.5'}>
      <span
        aria-hidden="true"
        className={
          warn
            ? 'mt-px text-[11px] leading-5 font-semibold text-warn'
            : 'mt-px text-[11px] leading-5 font-semibold text-ink-3'
        }
      >
        {warn ? '▲' : '•'}
      </span>
      <div>
        {/* The severity is in the accessible name too, not only in the glyph. */}
        <p className="text-[13px] font-semibold text-ink">
          <span className="sr-only">{warn ? 'Worth attention: ' : 'Note: '}</span>
          {title}
        </p>
        <p className="mt-0.5 text-[13px] font-medium text-ink-2">{detail}</p>
      </div>
    </li>
  )
}

/** The fired flags, in F06's order — most severe first is F06's job, not this list's. */
export function FlagList({ flags }: { flags: readonly FlagData[] }) {
  if (flags.length === 0) return null
  return (
    <ul className="-mx-1 mt-1 space-y-1">
      {flags.map((flag) => (
        <Flag key={flag.code} flag={flag} />
      ))}
    </ul>
  )
}
