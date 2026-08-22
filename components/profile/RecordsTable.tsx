'use client'

/* By path, not through the `@/components/ui` barrel it used to come from. The barrel's own rule is
   that screens import from it — true while this file was a server component, and the cost changed
   when it stopped being one: a `'use client'` module importing the barrel puts `SplitsTable`,
   `ZoneBar`, `TabBar` and `AppShell` on the boundary for one 40-line empty state. The same
   reasoning F24 gives for keeping `DetailPanel` OUT of the barrel, from the consumer's side. */
import { EmptySlot } from '@/components/ui/EmptyState'
import { usePanelParam } from '@/components/ui/usePanelParam'
import { panelKeyFor } from '@/lib/panel/param'
import { formatRecordValue, RECORD_LABELS } from '@/lib/records/labels'
import type { RecordKey } from '@/lib/records/types'
import { RecordDialog } from './RecordDialog'

export interface RecordRowView {
  key: RecordKey
  runId: string
  value: number
  achievedOn: string
  previousValue: number | null
}

/**
 * The ten personal records, in `RECORD_CATALOG` order — one line each, and a tap opens the panel.
 *
 * ── A KEY WITH NO HOLDER IS ABSENT, NOT ZERO ────────────────────────────────────────────────
 * `records` only ever contains keys something qualified for (F06's `replaceRecords`), so a runner
 * with no 10 km run has no `fastest_pace_10k` row. This renders only what is there. Printing
 * "Fastest pace, 10 km+ — 0'00\"/km" would be a claim about a run that does not exist, and the same
 * reasoning F08 applies to an empty zone bar (five 0% segments is not "no data") applies here.
 *
 * ── F26: ONE LINE, AND THE SECOND LINE'S CONTENT MOVED RATHER THAN DIED ─────────────────────
 * The row was a `<Link>` stacking the value over `<date> · was 10.67 km`. #25's ask is that each
 * record take one row, and the way that is paid for is a panel: the row is now label-left,
 * value-right, and tapping it opens `RecordDialog`, which is F24's shell with a record body. The
 * date and `previousValue` are both *in* that panel, so the trim removes two lines of text and no
 * facts.
 *
 * `previousValue` is still the interesting half — F06 keeps the value the key was worth before the
 * current holder took it specifically so a shelf can say "beat 7'30\" to get here". The one-row
 * constraint is what pushed it off the row; the panel is where it now lives, and where it finally
 * has room to be that sentence instead of `· was 7'30"/km`. Where it is null the panel says so in
 * the same slot rather than dropping the line (round 2) — the row prints neither branch either way,
 * because the row prints nothing but the label and the value.
 *
 * ── THE NAVIGATION DID NOT DISAPPEAR, IT MOVED ONTO THE DATE ────────────────────────────────
 * The row's `<Link href={/r/${runId}}>` is gone, which is what lets the row be a `<button>` — and a
 * button is what a row that opens a panel has to be. The run is still one tap further in, on the
 * panel's date, via F24's `RunDateLink`. That is the record half of the card's (1b).
 *
 * ── WHY THIS IS THE CLIENT BOUNDARY (AND WHY IT IS `panel=`) ────────────────────────────────
 * The same construction as `BadgeShelf`, for the same reasons and deliberately not a variation on
 * them: the ROW KEY lives in the URL rather than in `useState`, so the phone's back gesture closes
 * the panel and a return from `/r/<id>` restores it (F24, card #23). `rows` is replaced wholesale on
 * every navigation to /me, so a held row object would keep a panel open against data the page no
 * longer shows; a key resolves against whatever the current rows are, or resolves to nothing and
 * closes — which is also what makes `?panel=record.nonsense` harmless, since a hand-typed URL is the
 * one input that can name a record that does not exist.
 *
 * `lib/panel/param.ts` holds ONE parameter for both surfaces, so the badge panel and this one cannot
 * both be open: the `kind` is the discriminator, and `?panel=badge.tourist` resolves to no record
 * here. That exclusivity is structural rather than remembered, which is why neither surface has to
 * know the other exists — and it is why this component owns its own `usePanelParam` instead of a
 * wrapper on `/me` owning both. See `docs/plans/F26-record-row-and-panel.md` §2 B.
 *
 * This is the smallest unit that can be the client component, by `BadgeShelf`'s own rule: `rows`
 * crosses as the RSC payload either way, and pushing the boundary down to a per-row wrapper would
 * be one more module for no behaviour. `app/me/page.tsx` still runs every query and still passes
 * exactly the props it did before.
 */
export function RecordsTable({ rows }: { rows: readonly RecordRowView[] }) {
  const { selection, open, close } = usePanelParam()
  const openKey = panelKeyFor(selection, 'record')
  const selected = rows.find((row) => row.key === openKey) ?? null

  if (rows.length === 0) {
    return <EmptySlot>No records yet. The first reviewed run sets most of them at once.</EmptySlot>
  }

  return (
    <div>
      <ul className="flex flex-col">
        {rows.map((row, index) => (
          <li key={row.key} className={index === 0 ? '' : 'mt-3 border-t border-rule-2 pt-3'}>
            {/* The `<button>` IS the row, with two `<span>`s and no wrapper element. A `<button>`
                takes phrasing content only — the constraint that made `BadgeShelf`'s rows hold
                `<span className="block">`s rather than `<p>`s — and a single line needs no block
                child at all, so this row does not even have the `<div>` the shelf's two-dimensional
                row needs.

                The label is the whole accessible name plus what the tap does, because `aria-label`
                REPLACES the content for a screen reader rather than adding to it. That is the
                opposite call from `BadgeShelf`, whose label adds only what its visual row encodes
                rather than states (earned, tappable) — a record row states everything it has, so
                both halves have to be repeated here for the name to survive. */}
            <button
              type="button"
              onClick={() => open({ kind: 'record', key: row.key })}
              aria-label={`${RECORD_LABELS[row.key]} — ${formatRecordValue(row.key, row.value)}. Show the record.`}
              className="flex w-full items-baseline justify-between gap-3 rounded-field text-left active:opacity-70"
            >
              <span className="min-w-0 flex-1 text-[13px] font-medium text-ink-2">
                {RECORD_LABELS[row.key]}
              </span>
              <span className="shrink-0 text-[15px] font-semibold text-ink tabular-nums">
                {formatRecordValue(row.key, row.value)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* One dialog for ten rows, driven by the selection — not one per row. */}
      <RecordDialog row={selected} onClose={close} />
    </div>
  )
}
