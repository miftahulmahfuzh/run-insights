import { auth } from '@/auth'
import { SignOutButton } from './SignOutButton'

/**
 * "Who am I, and get me out." F08 owns the real chrome; this exists so F02 is verifiable end to end
 * on its own, and so exactly one component renders the signed-in identity.
 *
 * Reads `auth()` rather than `getUserId()` because it is the one place that wants the profile —
 * name, email — rather than the id. Everything else uses `requireUserId()`.
 */
export async function AccountMenu() {
  const session = await auth()
  if (!session?.user) return null

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-ink">
          {session.user.name ?? 'Runner'}
        </p>
        <p className="truncate text-[12px] font-medium text-ink-3">{session.user.email}</p>
      </div>
      <SignOutButton />
    </div>
  )
}
