import { AppShell, Card, ScreenHeader } from '@/components/ui'

/**
 * `/trends`'s loading boundary.
 *
 * §9 asks for the *scope switch* to hold the previous frame at reduced opacity rather than flash a
 * skeleton — Week→Month is a fast, common interaction that a skeleton makes feel slower than it is.
 * Next's App Router gives that for free: a navigation between two `?scope=` values keeps the current
 * render on screen while the server responds, and this file is only reached on a **cold** arrival at
 * `/trends`, where there is no previous frame to hold. So it is a skeleton, and it matches the
 * rollup card's height so the real screen does not jump.
 */
export default function Loading() {
  return (
    <AppShell>
      <ScreenHeader title="Trends" />
      <div
        className="mb-5 h-11 [animation:ri-pulse_1.4s_ease-in-out_infinite] rounded-pill bg-paper-2"
        aria-hidden="true"
      />
      <Card className="[animation:ri-pulse_1.4s_ease-in-out_infinite] p-5" aria-hidden="true">
        <div className="mb-4 h-4 w-40 rounded-pill bg-paper-2" />
        <div className="h-9 w-44 rounded-pill bg-paper-2" />
        <div className="mt-2 h-3 w-52 rounded-pill bg-paper-2" />
        <div className="mt-5 h-[168px] rounded-field bg-paper-2" />
      </Card>
      <p className="sr-only" role="status">
        Loading your trends
      </p>
    </AppShell>
  )
}
