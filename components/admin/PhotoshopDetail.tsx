'use client'

import * as React from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui'
import {
  readPhotoshopJobAction,
  resolvePhotoshopJobAction,
  runPhotoshopJobAction,
  type PhotoshopJobView,
} from '@/lib/admin/photoshopActions'
import type { NinaPhotoshopMode, NinaPhotoshopSourceKind } from '@/lib/db/schema'
import {
  NINA_PHOTOSHOP_INSTRUCTION_MAX,
  NINA_PHOTOSHOP_PRESETS,
  photoshopModelIdsFor,
  photoshopModelSpecFor,
  photoshopPresetText,
} from '@/lib/nina/photoshopPresets'

const POLL_INTERVAL_MS = 3_000

/**
 * The photoshop tab's one screen: mode, model, the improvement field (the Facial Expression
 * pattern — free text plus a non-sticky preset `<select>` that fills it), the execute button, and
 * — once a job lands — the before/after with Replace / Add as new / Cancel.
 *
 * A sequential `setTimeout` poll, not `setInterval` — `ImageGenTestPanel`'s own shape, so a slow
 * response cannot stack a second poll on top of the first.
 */
export function PhotoshopDetail({
  sourceKind,
  sourceId,
  sourceUrl,
}: {
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  sourceUrl: string
}) {
  const [mode, setMode] = React.useState<NinaPhotoshopMode>('anchor')
  const [model, setModel] = React.useState<string>(photoshopModelIdsFor('anchor')[0] ?? '')
  const [instruction, setInstruction] = React.useState('')
  const [presetSelect, setPresetSelect] = React.useState('')
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [job, setJob] = React.useState<PhotoshopJobView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)
  const [resolving, setResolving] = React.useState<'replace' | 'add' | 'discard' | null>(null)

  const router = useRouter()
  const aliveRef = React.useRef(true)
  React.useEffect(
    () => () => {
      aliveRef.current = false
    },
    [],
  )

  function changeMode(next: NinaPhotoshopMode) {
    setMode(next)
    setModel(photoshopModelIdsFor(next)[0] ?? '')
  }

  function applyPreset(key: string) {
    const text = photoshopPresetText(key)
    if (text != null) setInstruction(text)
    setPresetSelect('')
  }

  function pollJob(id: string, attempt: number) {
    window.setTimeout(async () => {
      if (!aliveRef.current) return
      const view = await readPhotoshopJobAction(id)
      if (!aliveRef.current || view == null) return
      setJob(view)
      if (view.status === 'pending' && !view.stale) pollJob(id, attempt + 1)
    }, POLL_INTERVAL_MS)
  }

  async function execute() {
    setError(null)
    setJob(null)
    setJobId(null)
    setRunning(true)
    try {
      const result = await runPhotoshopJobAction({
        sourceKind,
        sourceId,
        mode,
        model,
        presetKey: presetSelect === '' ? null : presetSelect,
        instruction,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setJobId(result.jobId)
      setJob({
        jobId: result.jobId,
        status: 'pending',
        stale: false,
        errorCode: null,
        resultUrl: null,
        resolvedAction: null,
      })
      pollJob(result.jobId, 0)
    } finally {
      setRunning(false)
    }
  }

  async function resolve(action: 'replace' | 'add' | 'discard') {
    if (jobId == null) return
    setResolving(action)
    try {
      const result = await resolvePhotoshopJobAction({ jobId, action })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (action === 'replace' || action === 'add') {
        router.push('/admin/photoshop')
        return
      }
      setJob((current) => (current == null ? current : { ...current, resolvedAction: 'discarded' }))
    } finally {
      setResolving(null)
    }
  }

  const spec = photoshopModelSpecFor(mode, model)
  const showResult = job?.status === 'ok' && job.resultUrl != null
  const resolved = job?.resolvedAction != null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-bold text-ink">Photoshop this photo</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Runs in the background — leaving this page is fine, the result waits in the job below when
          you come back to it.
        </p>
      </div>

      {!showResult && (
        <div>
          <div className="overflow-hidden rounded-field bg-ink-3/20">
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, un-transformed. */}
            <img src={sourceUrl} alt="" className="max-h-[420px] w-full object-contain" />
          </div>
          {/* The id the `/photoshop` and `/pull-photoshop-job` skills take as their first
              argument — the runner's own ask: "print the image id below it, so i can paste it
              here to run the skill." Plain selectable text, not a copy button: a 12-character
              nanoid is one tap-and-hold away on a phone and a triple-click away on a desktop. */}
          <p className="mt-1.5 text-[12px] font-semibold text-ink-3">
            Image ID: <span className="font-mono text-ink-2 select-all">{sourceId}</span>
          </p>
        </div>
      )}

      {showResult && job != null && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[12px] font-semibold text-ink-3">Before</p>
              <div className="overflow-hidden rounded-field bg-ink-3/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sourceUrl} alt="" className="max-h-[420px] w-full object-contain" />
              </div>
            </div>
            <div>
              <p className="mb-1 text-[12px] font-semibold text-ink-3">After</p>
              <div className="overflow-hidden rounded-field bg-ink-3/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={job.resultUrl!} alt="" className="max-h-[420px] w-full object-contain" />
              </div>
            </div>
          </div>

          {resolved ? (
            <p className="text-[13px] font-semibold text-ink-2">Discarded.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="md"
                loading={resolving === 'replace'}
                disabled={resolving !== null}
                onClick={() => resolve('replace')}
              >
                Replace the existing photo
              </Button>
              <Button
                variant="secondary"
                size="md"
                loading={resolving === 'add'}
                disabled={resolving !== null}
                onClick={() => resolve('add')}
              >
                Add as a new photo
              </Button>
              <Button
                variant="ghost"
                size="md"
                loading={resolving === 'discard'}
                disabled={resolving !== null}
                onClick={() => resolve('discard')}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {!showResult && (
        <>
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink">Mode</p>
            <div className="inline-flex rounded-field bg-paper-2 p-1">
              {(['anchor', 'edit'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeMode(option)}
                  className={
                    mode === option
                      ? 'rounded-field bg-card px-4 py-2 text-[13px] font-semibold text-ink'
                      : 'rounded-field px-4 py-2 text-[13px] font-semibold text-ink-2'
                  }
                >
                  {option === 'anchor' ? 'Anchor' : 'Edit'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 max-w-[70ch] text-[12px] font-medium text-ink-3">
              {mode === 'anchor'
                ? 'Sends this photo as a likeness anchor to a fresh generation — the same models as Image Generation. Pose and background may drift.'
                : 'Sends this photo to a model documented to edit it directly, keeping the rest of the photo as it is.'}
            </p>
          </div>

          <div>
            <label
              htmlFor="photoshop-model"
              className="mb-1.5 block text-[13px] font-semibold text-ink"
            >
              Model
            </label>
            <select
              id="photoshop-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="w-full rounded-field bg-paper-2 px-3 py-2 text-[14px] font-medium text-ink"
            >
              {photoshopModelIdsFor(mode).map((id) => (
                <option key={id} value={id}>
                  {photoshopModelSpecFor(mode, id).label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 max-w-[70ch] text-[12px] font-medium text-ink-3">{spec.hint}</p>
          </div>

          <div>
            <label
              htmlFor="photoshop-instruction"
              className="mb-1.5 block text-[13px] font-semibold text-ink"
            >
              What should change
            </label>
            <input
              id="photoshop-instruction"
              type="text"
              value={instruction}
              maxLength={NINA_PHOTOSHOP_INSTRUCTION_MAX}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="e.g. fix her eyes so they look natural"
              className="w-full rounded-field bg-paper-2 px-3 py-2 text-[14px] font-medium text-ink"
            />
            <select
              aria-label="Improvement preset"
              value={presetSelect}
              onChange={(event) => applyPreset(event.target.value)}
              className="mt-1.5 w-full rounded-field bg-paper-2 px-3 py-2 text-[13px] font-medium text-ink-2"
            >
              <option value="">Or pick a preset&hellip;</option>
              {NINA_PHOTOSHOP_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {error != null && <p className="text-[13px] font-semibold text-red">{error}</p>}

          {job?.status === 'pending' && (
            <p className="text-[13px] font-semibold text-ink-2">
              {job.stale
                ? 'Still marked as running longer than expected — it may have stalled. You can run it again.'
                : 'Working…'}
            </p>
          )}
          {job?.status === 'failed' && (
            <p className="text-[13px] font-semibold text-red">
              The model call failed ({job.errorCode ?? 'unknown reason'}). Try again, pick a
              different model, or paste <span className="font-mono select-all">{job.jobId}</span>{' '}
              into <span className="font-mono">/pull-photoshop-job</span> for the raw provider
              error.
            </p>
          )}

          <Button
            variant="primary"
            size="lg"
            aria-label="Run photoshop"
            loading={running || job?.status === 'pending'}
            disabled={running || job?.status === 'pending' || instruction.trim() === ''}
            onClick={execute}
          >
            <SparkleIcon className="size-6" />
          </Button>
        </>
      )}
    </div>
  )
}

/** Lucide `sparkles`, single glyph — distinct from the nav's wand-and-sparkles pair, so the
 * "generate" action and this "edit" action never share a silhouette. */
function SparkleIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  )
}
