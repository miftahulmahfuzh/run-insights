'use client'

import * as React from 'react'

import { Button } from '@/components/ui'
import {
  readNinaImageTestAction,
  runNinaImageTestAction,
  type NinaImageTestReadResult,
} from '@/lib/admin/imageGenActions'
import {
  imageTestPollDelayFor,
  imageTestReason,
  imageTestVerdict,
  imageTestVerdictIsOpen,
  NINA_IMAGE_TEST_GIVE_UP_MS,
  NINA_IMAGE_TEST_VERDICT_LINE,
  NINA_IMAGE_TEST_VERDICT_WHY,
  type NinaImageTestVerdict,
} from '@/lib/admin/imageGenTestView'
import { formatJobLatency, formatMicroUsd } from '@/lib/nina/jobview'

/**
 * **R11's surface.** *"add a test prompt button, so we can see if this prompt is actually allowed
 * by Alibaba (qwen 3 devs) guardrails."*
 *
 * ── IT DOES NOT AWAIT THE GENERATION ─────────────────────────────────────────────────────────
 * The click opens a job and returns (`dispatchNinaImageTest`). This component then asks
 * `readNinaImageTestAction` on an escalating schedule until the verdict is terminal or
 * `NINA_IMAGE_TEST_GIVE_UP_MS` has passed. Both are derived in `lib/admin/imageGenTestView.ts`
 * against `NINA_IMAGE_MAX_ATTEMPTS ×` phase 3's anchored ceiling.
 *
 * ── ONE SEQUENTIAL ASYNC LOOP, NOT A `setInterval` ───────────────────────────────────────────
 * `components/nina/ChatScreen.tsx` states the rule and this is the same situation: a tick
 * must not fire while the previous request is in flight, and a poll here is a Server Action round
 * trip against a job that takes 78-220 s. `components/extract/useExtractionStatus.ts` is
 * the same loop with the same three parts — a `cancelled` flag, one `setTimeout` handle cleared on
 * unmount, and a wall-clock give-up. A single failed poll is NOT a failed test: the generation is
 * still running on the server, so it is reported quietly and the loop continues.
 *
 * ── IT READS THE QUOTA ITSELF RATHER THAN TAKING IT AS A PROP ────────────────────────────────
 * Two reasons. The number must be true at the moment of the click, and a chat selfie can spend it
 * between renders — a server-rendered quota would be a stale promise about money. And it keeps
 * this component propless, so the one edit this phase makes to `ImageGenPanel.tsx` is a single
 * line that cannot conflict with phase 4's or phase 5's edits to the same file.
 *
 * ── THE PREVIEW IS THE SAVED PREFS, NOT THE DRAFT ────────────────────────────────────────────
 * `dispatchNinaImageTest` reads the row, so an unsaved field is not in the test. The label says
 * "saved settings" in as many words, and `dirty` — optional, so this file needs no change if
 * nobody passes it — turns that into a warning when phase 4 wires its own dirty flag.
 *
 * ── NO CONFIRMATION DIALOG ───────────────────────────────────────────────────────────────────
 * `lib/admin/chatPhotoActions.ts`'s header states the standing ruling for this whole surface:
 * *"i am the only one using this app, no need for all these bullshit confirmation"*. One click, it
 * happens. The remaining quota IS the disclosure, and it is on screen before the click.
 */
export function ImageGenTestPanel({ dirty = false }: { dirty?: boolean }) {
  const [view, setView] = React.useState<NinaImageTestReadResult | null>(null)
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pollNote, setPollNote] = React.useState<string | null>(null)
  const [gaveUp, setGaveUp] = React.useState(false)

  /* `useExtractionStatus`'s `cancelled` guard, hoisted so the click handler honours it too. */
  const alive = React.useRef(true)
  React.useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = React.useCallback(async (id: string | null): Promise<boolean> => {
    try {
      const next = await readNinaImageTestAction(id)
      if (!alive.current) return true
      setView(next)
      setPollNote(null)
      return true
    } catch {
      /* A failed READ is not a failed test — the generation is still running on the server. Say so
       * quietly and leave whatever is on screen on screen. `useExtractionStatus` makes exactly
       * this distinction, and it is the reason the loop keeps going. */
      if (alive.current) setPollNote('Could not reach the server on that check. Still watching.')
      return false
    }
  }, [])

  /* The mount read: the quota and the prompt preview, before anything has been spent.
   *
   * ── ARMED THROUGH A TIMER, NOT CALLED IN THE EFFECT BODY ──────────────────────────────────
   * `useExtractionStatus` has the same shape for the same reason — its first poll is
   * `setTimeout(run, pollDelayFor(0))` and never a bare call — and `react-hooks/set-state-in-effect`
   * enforces it: a read whose `setView` is reachable synchronously from an effect body is a
   * cascading render, which is the rule `CharacterPanel.tsx` also records when it rejects the
   * effect form of its draft sync. The handle is cleared on unmount, and `load` additionally
   * honours `alive`, so a resolution arriving after unmount sets nothing either way. */
  React.useEffect(() => {
    const timer = setTimeout(() => void load(null), 0)
    return () => clearTimeout(timer)
  }, [load])

  const verdict: NinaImageTestVerdict = imageTestVerdict(view?.job ?? null)
  const open = imageTestVerdictIsOpen(verdict)

  /*
   * The poll: ONE sequential async loop. See the header — a tick must not fire while the previous
   * request is in flight. Bounded three ways: the verdict going terminal, the wall-clock give-up,
   * and unmount.
   */
  React.useEffect(() => {
    if (jobId === null || !open || gaveUp) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const startedAt = Date.now()
    let attempts = 0

    const step = async () => {
      if (cancelled) return

      if (Date.now() - startedAt > NINA_IMAGE_TEST_GIVE_UP_MS) {
        setGaveUp(true)
        return
      }

      attempts += 1
      await load(jobId)
      if (cancelled) return

      timer = setTimeout(() => void step(), imageTestPollDelayFor(attempts))
    }

    timer = setTimeout(() => void step(), imageTestPollDelayFor(attempts))

    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [jobId, open, gaveUp, load])

  const onTest = async () => {
    if (busy || open) return
    setBusy(true)
    setError(null)
    setPollNote(null)
    setGaveUp(false)
    try {
      const result = await runNinaImageTestAction()
      if (!result.ok) {
        setError(result.message)
        /* The refusal already told us nothing was spent; re-read so the quota on screen is the
         * server's number and not our arithmetic. */
        await load(null)
        return
      }
      setJobId(result.jobId)
      await load(result.jobId)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `The test could not be started: ${cause.message}. Nothing was sent and nothing was billed — this is not a refusal.`
          : 'The test could not be started. Nothing was sent and nothing was billed — this is not a refusal.',
      )
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const quotaLeft = view?.quotaLeft ?? null
  const capped = quotaLeft !== null && quotaLeft <= 0
  const job = view?.job ?? null
  const reason = job === null ? null : imageTestReason(job.errorCode)

  return (
    <section className="mb-8 rounded-card border border-rule bg-card px-5">
      <div className="flex items-center justify-between gap-4 py-5">
        <h2 className="text-[15px] font-semibold text-ink">Test this prompt</h2>
        <p className="text-right text-[12px] font-medium text-ink-3">
          {quotaLeft === null
            ? 'checking today’s quota'
            : capped
              ? 'no generations left today'
              : `${quotaLeft} of today’s generations left`}
        </p>
      </div>

      <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Sends the prompt below to the provider and reports whether it was allowed. It spends one
        generation off today&rsquo;s cap, plus its caption, and the daily cap counts failures too. A
        successful test lands in Chat photos &mdash; along with a caption bubble from Nina in the
        conversation, because a chat photo cannot exist without a message to hang on.
      </p>

      {dirty && (
        <p className="mb-3 text-[12px] font-semibold text-accent">
          You have unsaved changes. The test reads the saved settings, so save first or you will be
          testing the previous prompt.
        </p>
      )}

      {error !== null && <p className="mb-3 text-[12px] font-semibold text-red">{error}</p>}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button disabled={busy || capped || open} loading={busy} onClick={() => void onTest()}>
          {open ? 'Waiting for the provider' : 'Test prompt'}
        </Button>
        {capped && (
          <span className="text-[12px] font-medium text-ink-3">
            Nothing will be sent. The cap rolls over at midnight in Jakarta.
          </span>
        )}
      </div>

      {/*
       * ── THE VERDICT ────────────────────────────────────────────────────────────────────────
       * `NINA_IMAGE_TEST_VERDICT_LINE` is the headline and `..._WHY` is the clause that stops it
       * being misread; both come from `lib/admin/imageGenTestView.ts` and neither is written here.
       * The leading `*` on every line is load-bearing: `ci:client-secret-guard`'s Rule 3 exempts
       * only lines a comment scanner recognises, which `app/admin/personality/page.tsx` records.
       */}
      <div className="mb-6 rounded-card bg-paper-2 p-4">
        <h3 className="text-[13px] font-semibold text-ink">
          {NINA_IMAGE_TEST_VERDICT_LINE[verdict]}
        </h3>
        <p className="mt-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
          {NINA_IMAGE_TEST_VERDICT_WHY[verdict]}
        </p>
        {reason !== null && (verdict === 'inconclusive' || verdict === 'refused') && (
          <p className="mt-1 max-w-[70ch] text-[11px] font-medium text-ink-2">
            What the pipeline recorded: {reason}.
          </p>
        )}
        {pollNote !== null && <p className="mt-1 text-[11px] font-medium text-ink-3">{pollNote}</p>}
        {gaveUp && (
          <p className="mt-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
            Stopped watching after eight minutes. The job is still open and nothing has gone wrong
            yet &mdash; one that never finishes is given up at twenty minutes. Reload to look again,
            or open it on the job list.
          </p>
        )}
        {job !== null && (
          <p className="mt-2 text-[11px] font-medium text-ink-3 tabular-nums">
            job {job.jobId} &middot; attempt {job.attempts} &middot; {job.status}
            {job.errorCode === null ? '' : ` / ${job.errorCode}`} &middot;{' '}
            {formatJobLatency(job.latencyMs)} &middot; {formatMicroUsd(job.costMicroUsd)}
          </p>
        )}
      </div>

      {/* ── the prompt as sent ────────────────────────────────────────────────────────────── */}
      <div className="pb-5">
        <h3 className="text-[13px] font-semibold text-ink">Prompt as sent</h3>
        <p className="mb-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
          Assembled from the <strong>saved</strong> settings by the same function the button uses.{' '}
          {view?.referenceUrl == null
            ? 'No photo reference is selected, so this generation is unanchored.'
            : 'Anchored to the selected photo reference.'}
        </p>
        <pre className="mt-3 max-h-[420px] overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
          {job?.prompt ?? view?.promptPreview ?? ''}
        </pre>
      </div>
    </section>
  )
}
