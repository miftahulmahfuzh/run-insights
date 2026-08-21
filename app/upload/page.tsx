import Link from 'next/link'
import { redirect } from 'next/navigation'

import { UploadPicker } from '@/components/extract/UploadPicker'
import { requireUserId } from '@/lib/auth/requireUserId'
import { getProfile } from '@/lib/db/queries'

/**
 * `/upload` — the one flow that matters (roadmap §1), and the centre tab of the four-tab bar.
 *
 * The onboarding gate is repeated here rather than left to `/`: HRmax calibration is what makes
 * a %HRmax honest (D11), and someone deep-linked straight to the upload screen would otherwise
 * produce runs whose effort numbers have no denominator.
 */
export default async function UploadPage() {
  const userId = await requireUserId()
  const profile = await getProfile(userId)
  if (!profile?.onboardedAt) redirect('/onboarding')

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[470px] p-5 pb-[calc(2rem+var(--safe-bottom))]">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">Upload</h1>
        <Link href="/" className="text-[13px] font-semibold text-accent">
          Runs
        </Link>
      </header>

      <p className="mb-5 max-w-[38ch] text-[13px] font-medium text-ink-2">
        Screenshot a run in the Fitness app and drop the screens in here. Nothing is saved until you
        have read the numbers back and confirmed them.
      </p>

      <UploadPicker />
    </main>
  )
}
