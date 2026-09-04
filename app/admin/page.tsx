import Link from 'next/link'

import { Card } from '@/components/ui'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { getAdminUser } from '@/lib/admin/users'
import { getCurrentNinaAvatar, listNinaAvatars } from '@/lib/nina/queries'

/**
 * `/admin` — the hub. It exists because `/admin` would otherwise 404 for an admin, which reads as
 * the gate misfiring rather than as "there is no index here".
 *
 * Deliberately thin: two counts and a link, per card. Phase 16 added the memory card.
 */

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  const { userId, email } = await requireAdmin()
  const [album, current, me] = await Promise.all([
    listNinaAvatars(userId),
    getCurrentNinaAvatar(userId),
    getAdminUser(userId),
  ])

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
            {album.length === 0
              ? 'Empty — she is still using the committed photo.'
              : `${album.length} photo${album.length === 1 ? '' : 's'}, ${
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
      </div>
    </div>
  )
}
