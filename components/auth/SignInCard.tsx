import { Button } from '@/components/ui'
import { signInWithGoogleAction } from '@/lib/auth/actions'

/**
 * The signed-out state of `/` (R-24 — there is no separate marketing page). Nearly empty by design:
 * app name, one line of purpose, one button. Nothing to read, nothing to configure.
 *
 * A plain `<form>` posting to a Server Action, so it works before hydration and ships no client
 * JavaScript. `next` rides along in a hidden input and is sanitised twice — once by `safeNext()` on
 * the way in from `proxy.ts`'s query string, once again inside the action.
 */
export function SignInCard({ next }: { next: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-[470px]">
        <div className="mb-5 flex gap-[7px]" aria-hidden="true">
          <span className="size-3 rounded-full bg-z1" />
          <span className="size-3 rounded-full bg-z3" />
          <span className="size-3 rounded-full bg-z5" />
        </div>

        <h1 className="mb-2 text-[32px] leading-[1.1] font-bold tracking-[-0.02em] text-ink">
          Run Insights
        </h1>
        <p className="mb-8 max-w-[34ch] text-[15px] font-medium text-ink-2">
          Screenshot a run. Get a coach, not a dashboard.
        </p>

        <form action={signInWithGoogleAction}>
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="primary" size="lg" fullWidth>
            Continue with Google
          </Button>
        </form>

        <p className="mt-5 text-[11px] font-medium text-ink-3">
          Your runs are yours. Nothing is shared until you make a link for it.
        </p>
      </div>
    </main>
  )
}
