import { Button } from '@/components/ui'
import { signOutAction } from '@/lib/auth/actions'

/**
 * The sign-out affordance. A plain `<form>` posting to a Server Action, so it works before
 * hydration and ships no client JavaScript.
 *
 * `ghost`, not `primary`: the design's rule is one filled button per screen, and leaving is never
 * the screen's main action.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="md">
        Sign out
      </Button>
    </form>
  )
}
