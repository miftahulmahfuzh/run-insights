import Link from 'next/link'

import { Card } from '@/components/ui'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { loudestDials, relationshipCopy, toTuningDraft, tuningCopy } from '@/lib/admin/tuningModel'
import { getAdminUser } from '@/lib/admin/users'
import { countNinaAvatars, getCurrentNinaAvatar, readNinaTuning } from '@/lib/nina/queries'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'

/**
 * `/admin` — the hub. It exists because `/admin` would otherwise 404 for an admin, which reads as
 * the gate misfiring rather than as "there is no index here".
 *
 * Deliberately thin: a fact and a link, per card. Phase 16 added the memory card, and
 * nina-character-tuning phase 5 the character one — which names the relationship and the dials
 * furthest from their defaults, so "what is she set to" is answered without a navigation. That is
 * also why this page gets a card rather than `AdminNav` getting a fourth row: the panel is a
 * section of `/admin/nina`, not a route, and two sidebar rows pointing at one URL is worse
 * navigation than one.
 */

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  const { userId, email } = await requireAdmin()
  const [albumCount, current, me, tuning] = await Promise.all([
    /*
     * A COUNT, not the album. This page renders `albumCount` and nothing else about the rows, and
     * F34 R1 makes the album *"hundreds of profile pics"* — so `listNinaAvatars(userId)` here was
     * fetching every column of every row, including the `description` prose, to print one integer
     * on a `force-dynamic` page the operator opens constantly.
     */
    countNinaAvatars(userId),
    getCurrentNinaAvatar(userId),
    getAdminUser(userId),
    /*
     * The tuning row, for the character card below. It joins the existing `Promise.all` rather
     * than adding a fourth sequential await, and it is a single indexed read of one row.
     */
    readNinaTuning(userId),
  ])

  /*
   * "Loudest" is DISTANCE FROM DEFAULT, not highest value — `loudestDials`' docstring has the
   * argument: phase 1's defaults are non-uniform, so ranking by value would print a dial nobody
   * moved and hide the one that changed her.
   */
  const loud = loudestDials(toTuningDraft(tuning), toTuningDraft(NINA_TUNING_DEFAULTS))

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Admin</h1>
        <p className="mt-1 text-[13px] font-medium text-ink-2">
          Signed in as {email}. Everything here writes production.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Nina&rsquo;s album</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {albumCount === 0
              ? 'Empty — she is still using the committed photo.'
              : `${albumCount} photo${albumCount === 1 ? '' : 's'}, ${
                  current ? 'one current' : 'none current'
                }.`}
          </p>
          <Link href="/admin/nina" className="text-[13px] font-semibold text-accent">
            Manage the album &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Memory</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {me === null
              ? 'Nothing kept yet.'
              : `${me.slots} slot${me.slots === 1 ? '' : 's'} and ${me.facts} ledger row${
                  me.facts === 1 ? '' : 's'
                } for your account.`}
          </p>
          <Link href="/admin/memory" className="text-[13px] font-semibold text-accent">
            Read and edit her memory &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Her character</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {relationshipCopy(tuning.relationship).label}
            {loud.length === 0
              ? ', every dial at its default.'
              : `, loudest: ${loud
                  .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                  .join(', ')}.`}{' '}
            Revision {tuning.revision}.
          </p>
          {/* The fragment targets the panel's own `<details id="character">`. It scrolls there in
              every browser and opens the disclosure in the ones that implement fragment-targeted
              details; where it does not, the panel is the first thing on the page and is one
              click. A deep link is not worth a second copy of the panel on its own route. */}
          <Link href="/admin/nina#character" className="text-[13px] font-semibold text-accent">
            Tune her character &rarr;
          </Link>
        </Card>
      </div>
    </div>
  )
}
