import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PaceHrChart } from '@/components/charts/PaceHrChart'
/*
 * **The five components by file, not through `@/components/ui`** — and that is an F11 boundary,
 * not a style preference. The barrel re-exports `AppShell`, which renders `TabBar`, which since
 * F33 phase 10 renders Nina's unread badge, which reads the session. This page never renders any
 * of that, but `tests/share.bundle.test.ts` walks IMPORTS rather than renders — correctly, because
 * "the bundler will tree-shake it" is not a guarantee to hang a public route's isolation on. Going
 * straight to the files makes the static graph say what the page actually does. Do not collapse
 * these back into the barrel.
 */
import { Card, Eyebrow, Stat } from '@/components/ui/Card'
import { SplitsTable } from '@/components/ui/SplitsTable'
import { ZoneBar } from '@/components/ui/ZoneBar'
import { fastestSlowestFullKm, toPaceHrPoints, toZoneShares } from '@/lib/charts'
import {
  formatBpm,
  formatCadence,
  formatClock,
  formatDay,
  formatDistanceM,
  formatDuration,
  formatElevation,
  formatKcal,
  formatPace,
  formatPercent,
} from '@/lib/format'
import { SHARE_OG_IMAGE, SHARE_OG_IMAGE_HEIGHT, SHARE_OG_IMAGE_WIDTH } from '@/lib/share/config'
import { readSharedRun } from '@/lib/share/read'
import type { SharedPhotoView } from '@/lib/share/types'
import {
  FOOTER,
  PHOTOS_NOTE,
  PUBLIC_TITLE,
  SECTION_ANALYSIS,
  SECTION_PHOTOS,
  SECTION_SPLITS,
  SECTION_ZONES,
} from './copy'

/**
 * `/s/[token]` — the one page in this application that answers to somebody with no account.
 *
 * ── `force-dynamic`, AND WHY THERE IS NO `loading.tsx` NEXT TO THIS FILE ────────────────────────
 * Revocation has to take effect on the next request, not on the next revalidation window, so this
 * route is never cached: `force-dynamic`, no `revalidate`, no `generateStaticParams`, no
 * `unstable_cache`, no `'use cache'`. A CDN `HIT` on a revoked token would serve a page the runner
 * believes they deleted.
 *
 * The missing `loading.tsx` is the subtler half. A Suspense boundary over the token lookup would
 * make Next stream a **200** before `notFound()` ever runs — the status line is already on the wire
 * and cannot be changed afterwards, so a revoked link would answer 200 with a 404 body. Soft-404s
 * are also exactly what a crawler indexes. `tests/share.bundle.test.ts` asserts the file's absence.
 *
 * ── WHAT THIS PAGE DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────
 *   - **No LLM call.** The prose was generated once by F07, authenticated, and cached in
 *     `insights.payload`. This route reads that stored JSON. It never calls `lib/llm/narrate.ts`.
 *   - **No metric computation.** Every number here is either a stored column or F11's single
 *     division of two stored integers (`avgHrPctMax`). Nothing is re-derived from raw splits.
 *   - **No HRmax resolution — F02's INVARIANT B.** `resolveHrMax(userId)` reads `profiles`, and this
 *     route has no `userId` and must never learn one. The %HRmax figure comes from `hrMaxUsed`,
 *     frozen into the insight at generation time (R-11). When it is absent the figure is **omitted**
 *     — never computed from a formula, never defaulted, because a stranger must not be able to infer
 *     even indirectly whether the runner filled in their age.
 *   - **No badges, records, or "your longest run this month".** §3.8: a single session may be
 *     shared. A claim about this runner's history is not a claim about this session.
 *   - **No route to anything else.** The only outbound link is the footer, to `/`.
 */
export const dynamic = 'force-dynamic'

/**
 * The WhatsApp card — and the gap between "on the page" and "on a lock screen" (§3.6).
 *
 * These links are sent over WhatsApp, which fetches the URL server-side and renders a card **inside
 * the chat**: the bubble, the recipient's chat-list snippet, their lock-screen notification, every
 * member of a group, every forward. That card is shown *before* anyone chose to look, which is why
 * fields already cleared for the page itself still do not reach the preview:
 *
 *   - the `headline` — the narrative's bluntest line, verbatim, on a lock screen. No.
 *   - `avgHr` and %HRmax — health data on a notification banner is strictly worse exposure than
 *     health data behind a tap.
 *   - the location, if it is shown at all — a place name plus a date, unrequested, on a lock screen.
 *
 * What is left is distance and date: deliberately boring, closer to a calendar-invite subject line
 * than a performance brag, and the same thing the runner is about to type in the message anyway.
 *
 * `robots` is belt and braces with the `X-Robots-Tag` header in `next.config.ts`: the header covers
 * non-HTML responses and intermediary caches, the meta tag is what a crawler that already fetched
 * the page actually reads.
 */
export async function generateMetadata({ params }: PageProps<'/s/[token]'>): Promise<Metadata> {
  const { token } = await params
  // Memoised by `readSharedRun`'s `cache()` wrap, so this is the SAME round trip the page body
  // below uses — one query per request, not two, and not four on a scrape.
  const run = await readSharedRun(token)

  const robots = { index: false, follow: false, nocache: true } as const
  if (!run) return { title: PUBLIC_TITLE, robots }

  return {
    title: `${formatDistanceM(run.distanceM)} run`,
    description: formatDay(run.occurredOn),
    robots,
    openGraph: {
      type: 'website',
      title: `${formatDistanceM(run.distanceM)} run`,
      description: formatDay(run.occurredOn),
      images: [
        {
          url: SHARE_OG_IMAGE,
          width: SHARE_OG_IMAGE_WIDTH,
          height: SHARE_OG_IMAGE_HEIGHT,
        },
      ],
    },
  }
}

export default async function SharedRunPage({ params }: PageProps<'/s/[token]'>) {
  const { token } = await params
  const run = await readSharedRun(token)
  if (!run) notFound()

  const points = toPaceHrPoints(run.splits, run.distanceM)
  const { fastestKm, slowestKm } = fastestSlowestFullKm(points)
  const zoneShares = toZoneShares(run.zones)
  const hardSeconds = run.zones
    .filter((z) => z.zone >= 4)
    .reduce((sum, z) => sum + z.durationSec, 0)
  const totalZoneSeconds = run.zones.reduce((sum, z) => sum + z.durationSec, 0)

  return (
    <main className="mx-auto w-full max-w-[470px] p-5 pb-[calc(2rem+var(--safe-bottom))]">
      <p className="mb-5 text-xs font-semibold tracking-[0.02em] text-accent">{PUBLIC_TITLE}</p>

      <Card>
        <Eyebrow className="mb-3">
          {/* Date only, no clock time, and no location unless SHARE_SHOWS_LOCATION says so. Both
              are null by the time they reach this component — the projector stripped them, so this
              JSX cannot leak a field a flag turned off. */}
          {[formatDay(run.occurredOn), run.location].filter(Boolean).join(' · ')}
        </Eyebrow>

        <Stat
          label={run.activityType}
          value={formatDistanceM(run.distanceM)}
          size="hero"
          note={
            [
              formatDuration(run.durationSec),
              formatPace(run.avgPaceSec, true),
              run.startedAt && formatClock(run.startedAt),
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        />

        <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-5">
          <Stat label="Avg HR" value={formatBpm(run.avgHr)} size="sm" />
          <Stat label="Max HR" value={formatBpm(run.maxHr)} size="sm" />
          <Stat label="Cadence" value={formatCadence(run.avgCadence)} size="sm" />
          <Stat label="Active" value={formatKcal(run.activeKcal)} size="sm" />
          <Stat label="Elevation" value={formatElevation(run.elevationM)} size="sm" />
        </div>

        {/*
          Roadmap §4.4: "every metric that divides by HRmax carries the source through to the UI,
          and the UI shows it." Here the denominator is a FROZEN one, so the label says which kind it
          was at the time the analysis was written — a percentage against an "estimated" ceiling is a
          different claim from one against a measured ceiling, and a reader who cannot tell them
          apart has been handed a number dressed as a fact.

          Absent hrMaxUsed, this whole block disappears. There is no fallback denominator.
        */}
        {run.avgHrPctMax != null && run.insight?.hrMaxUsed != null && (
          <div className="mt-5 rounded-field bg-paper-2 p-4">
            <Stat
              label="Average, as a share of maximum heart rate"
              value={formatPercent(run.avgHrPctMax, 1)}
              note={`of ${formatBpm(run.insight.hrMaxUsed)}${
                run.insight.hrMaxSource ? ` · ${run.insight.hrMaxSource}` : ''
              }`}
            />
          </div>
        )}
      </Card>

      {points.length > 0 && (
        <div className="mt-4">
          {/*
            §3.7's binding rule, at its one real test. Recharts requires 'use client', and whatever
            crosses that boundary is serialised into the RSC flight payload and shipped to the
            browser VERBATIM — an unused key on a prop object is not protected by the component
            choosing not to render it.

            So this receives `PaceHrPoint[]` — km, pace, time, hr, cadence, partial, metres — and
            nothing else. Never `run`. Never `run.insight`. The zone bar and the splits table below
            are Server Components with no client boundary at all, which is why the zone bounds can
            go to them but not here.
          */}
          <PaceHrChart points={points} />
        </div>
      )}

      {zoneShares.length > 0 && (
        <Card className="mt-4 p-5">
          <Eyebrow className="mb-3">{SECTION_ZONES}</Eyebrow>
          <ZoneBar
            shares={zoneShares}
            caption={
              totalZoneSeconds === 0
                ? undefined
                : `${formatPercent((hardSeconds / totalZoneSeconds) * 100, 1)} of this run was zone 4 or harder.`
            }
          />
        </Card>
      )}

      {points.length > 0 && (
        <Card className="mt-4 p-5">
          <Eyebrow className="mb-3">{SECTION_SPLITS}</Eyebrow>
          <SplitsTable
            points={points}
            zones={run.zones}
            fastestKm={fastestKm}
            slowestKm={slowestKm}
          />
        </Card>
      )}

      {run.insight && (run.insight.headline || run.insight.whatHappened) && (
        <Card className="mt-4">
          <Eyebrow className="mb-3">{SECTION_ANALYSIS}</Eyebrow>
          {run.insight.headline && (
            <p className="text-[19px] leading-[1.3] font-semibold text-ink">
              {run.insight.headline}
            </p>
          )}
          {run.insight.whatHappened && (
            <p className="mt-2.5 text-[13px] leading-[1.55] font-medium text-ink-2">
              {run.insight.whatHappened}
            </p>
          )}
          {run.insight.observations.length > 0 && (
            <ul className="mt-4 space-y-3">
              {run.insight.observations.map((o, i) => (
                <li key={`${o.title ?? 'observation'}-${i}`}>
                  {o.title && <p className="text-[13px] font-semibold text-ink">{o.title}</p>}
                  {o.detail && (
                    <p className="mt-0.5 text-[13px] font-medium text-ink-2">{o.detail}</p>
                  )}
                  {o.metric && (
                    <p className="mt-0.5 text-[11px] font-semibold text-ink-3 tabular-nums">
                      {o.metric}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/*
            No "Next" block and no closing question — R-27. `doNext[]` is direct coaching advice
            about a specific person's training, and read by a friend who received a WhatsApp link it
            becomes that person's flaws itemised for an audience they did not choose the size of.
            `questionForRunner` is by definition an unanswered private reflection. Neither is read
            out of the payload at all (see `readSharedInsight`), so neither can appear here.
          */}
        </Card>
      )}

      {run.photos.length > 0 && <PhotoGrid photos={run.photos} />}

      <p className="mt-8 text-center text-[11px] font-medium text-ink-3">{FOOTER}</p>
    </main>
  )
}

/**
 * The screenshots, as plain links — **a Server Component, no lightbox, no JavaScript.**
 *
 * `/r/[id]`'s owner-side viewer is a Client Component with a pinch-zoom overlay and keyboard
 * navigation. This is not, and the reason is not laziness: an `<a target="_blank">` around each
 * thumbnail gives a viewer the platform's own image viewer — real pinch-zoom, real save, real back
 * gesture — for zero shipped JavaScript on a page whose entire job is to be read once. It also
 * means the photo grid has no client boundary, so there is no prop object to audit here at all
 * (§3.7).
 *
 * Every URL on this page is a public Vercel Blob URL and therefore its own bearer secret. R-15's
 * rotation on revoke is what stops those URLs outliving the link; nothing here can help with a copy
 * somebody already saved, and the revoke confirm says so rather than implying otherwise.
 */
function PhotoGrid({ photos }: { photos: readonly SharedPhotoView[] }) {
  return (
    <Card className="mt-4 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Eyebrow>{SECTION_PHOTOS}</Eyebrow>
        <span className="text-[11px] font-semibold text-ink-3 tabular-nums">{photos.length}</span>
      </div>
      <ul className="flex gap-2 overflow-x-auto">
        {photos.map((photo) => (
          <li key={photo.blobUrl}>
            <a
              href={photo.blobUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="block overflow-hidden rounded-field bg-paper-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted and already
                  compressed to ~55 KB by the client before upload (F04 §3). next/image would
                  re-optimise a file that is already at its target size, on a paid transform quota,
                  for no gain — and on a page with no session it would also route every image
                  through our own optimiser for an unauthenticated visitor. */}
              <img
                src={photo.blobUrl}
                alt=""
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                className="h-[168px] w-auto object-cover"
              />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] font-medium text-ink-3">{PHOTOS_NOTE}</p>
    </Card>
  )
}
