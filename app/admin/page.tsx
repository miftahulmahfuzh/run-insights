import Link from 'next/link'

import { Card } from '@/components/ui'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  focusOnKeys,
  promptLengthCopy,
  referenceKey,
  toImageGenDraft,
} from '@/lib/admin/imageGenModel'
import { loudestDials, relationshipCopy, toTuningDraft, tuningCopy } from '@/lib/admin/tuningModel'
import { getAdminUser } from '@/lib/admin/users'
import { NINA_IMAGE_FOCUS_KEYS } from '@/lib/nina/imageprefs'
import {
  countNinaAvatars,
  getCurrentNinaAvatar,
  readNinaImagePrefs,
  readNinaTuning,
} from '@/lib/nina/queries'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'

/**
 * `/admin` — the hub. It exists because `/admin` would otherwise 404 for an admin, which reads as
 * the gate misfiring rather than as "there is no index here".
 *
 * Deliberately thin: a fact and a link, per card. Phase 16 added the memory card,
 * admin-memory-and-chat-photos phase 2 the chat-photos one, and nina-character-tuning phase 5 the
 * character one — which names the relationship and the dials furthest from their defaults, so
 * "what is she set to" is answered without a navigation.
 *
 * That card used to be the argument AGAINST a nav row for the panel: *"the panel is a section of
 * `/admin/nina`, not a route, and two sidebar rows pointing at one URL is worse navigation than
 * one."* The user repealed the premise — the panel is a route now, `/admin/personality`, and
 * `AdminNav` carries it as a fifth cell. The card stays anyway, and for its own reason rather than
 * that one: every card here answers a question without a navigation, and this one answers "what is
 * she set to". The link below it is now just a link to a page, not a fragment into a disclosure.
 */

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  const { userId, email } = await requireAdmin()
  const [albumCount, current, me, tuning, imagePrefs] = await Promise.all([
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
     * than adding a further sequential await, and it is a single indexed read of one row.
     */
    readNinaTuning(userId),
    /*
     * The image-generation prefs, for the card below. It joins the existing `Promise.all` rather
     * than adding a further sequential await, and it is a single indexed read of one row — the
     * same trade the tuning read above makes.
     */
    readNinaImagePrefs(userId),
  ])

  /*
   * "Loudest" is DISTANCE FROM DEFAULT, not highest value — `loudestDials`' docstring has the
   * argument: phase 1's defaults are non-uniform, so ranking by value would print a dial nobody
   * moved and hide the one that changed her.
   */
  const loud = loudestDials(toTuningDraft(tuning), toTuningDraft(NINA_TUNING_DEFAULTS))

  /* The two facts the image card prints. `focusOnKeys` is phase 1's declared order, so the count
   * is over the six options the user named and not over whatever keys the row happens to hold. */
  const imageDraft = toImageGenDraft(imagePrefs)
  const focused = focusOnKeys(imageDraft)

  return (
    <div>
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Admin</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Signed in as {email}. Everything here writes production.
        </p>
      </header>

      {/* `min-h-11` on each card's link is `docs/design-brief.md`'s 44 pt minimum, spelled where
          it is easiest to lose: a 13 px line of text is a 18 px target, and these four links are
          the only navigation on this page that is not the nav bar. `mb-3` rather than `mb-4`
          above them, so the taller control does not make every card 26 px longer. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Image collection</h2>
          <p className="mt-1 mb-3 text-[13px] font-medium text-ink-2">
            {albumCount === 0
              ? 'Empty — she is still using the committed photo.'
              : `${albumCount} album photo${albumCount === 1 ? '' : 's'}, ${
                  current ? 'one current' : 'none current'
                }.`}
          </p>
          <Link
            href="/admin/nina"
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent"
          >
            Manage the collection &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Memory</h2>
          <p className="mt-1 mb-3 text-[13px] font-medium text-ink-2">
            {me === null
              ? 'Nothing kept yet.'
              : `${me.slots} slot${me.slots === 1 ? '' : 's'} and ${me.facts} ledger row${
                  me.facts === 1 ? '' : 's'
                } for your account.`}
          </p>
          <Link
            href="/admin/memory"
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent"
          >
            Read and edit her memory &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Her character</h2>
          <p className="mt-1 mb-3 text-[13px] font-medium text-ink-2">
            {relationshipCopy(tuning.relationship).label}
            {loud.length === 0
              ? ', every dial at its default.'
              : `, loudest: ${loud
                  .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                  .join(', ')}.`}
          </p>
          {/* No fragment any more. This used to point at the album route plus a `#character`
              fragment, aimed at the panel's own `<details id="character">` in the hope that the
              browser would both scroll there and open the disclosure. The panel has a route now
              and is the whole of it, so the route IS the deep link. The id survives on the panel's
              section root so a bookmark kept from the old URL still lands on something real.
              The old URL is not spelled out: plan invariant 10 greps for it. */}
          <Link
            href="/admin/personality"
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent"
          >
            Tune her character &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Image generation</h2>
          <p className="mt-1 mb-3 text-[13px] font-medium text-ink-2">
            Prompt length {promptLengthCopy(imagePrefs.promptLength).band}
            {focused.length === 0
              ? ', nothing emphasised'
              : `, ${focused.length} of ${NINA_IMAGE_FOCUS_KEYS.length} emphasised`}
            {referenceKey(imageDraft.reference) === '' ? ', no reference' : ', one photo reference'}
            .
          </p>
          <Link
            href="/admin/image-generation"
            className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent"
          >
            Set how she is photographed &rarr;
          </Link>
        </Card>
      </div>
    </div>
  )
}
