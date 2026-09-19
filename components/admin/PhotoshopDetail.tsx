'use client'

import * as React from 'react'

import { useRouter } from 'next/navigation'

import {
  PhotoshopCropStudio,
  type PhotoshopCropSelection,
} from '@/components/admin/PhotoshopCropStudio'
import { uploadAvatarPhoto } from '@/components/admin/explorer/avatarUpload'
import { uploadChatPhoto } from '@/components/admin/explorer/chatPhotoUpload'
import { SwapIcon } from '@/components/admin/photoIcons'
import { Button } from '@/components/ui'
import { replaceChatPhotoAction } from '@/lib/admin/chatPhotoActions'
import { replaceNinaAvatarAction } from '@/lib/admin/ninaAlbumActions'
import {
  readPhotoshopJobAction,
  resolvePhotoshopJobAction,
  runPhotoshopJobAction,
  type PhotoshopJobView,
} from '@/lib/admin/photoshopActions'
import type { NinaPhotoshopMode, NinaPhotoshopSourceKind } from '@/lib/db/schema'
import { nearestNinaImageAspectRatio } from '@/lib/nina/imagerecipe'
import {
  NINA_PHOTOSHOP_INSTRUCTION_MAX,
  NINA_PHOTOSHOP_PRESETS,
  photoshopModelIdsFor,
  photoshopModelSpecFor,
  photoshopPresetText,
} from '@/lib/nina/photoshopPresets'
import { NINA_PHOTOSHOP_CROP_IDENTITY } from '@/lib/nina/photoshopCrop'

const POLL_INTERVAL_MS = 3_000

/**
 * The photoshop tab's one screen: mode, model, the improvement field (the Facial Expression
 * pattern — free text plus a non-sticky preset `<select>` that fills it), the OPTIONAL aspect-ratio
 * crop step, the execute button, and — once a job lands — the before/after with Replace / Add as
 * new / Cancel.
 *
 * A sequential `setTimeout` poll, not `setInterval` — `ImageGenTestPanel`'s own shape, so a slow
 * response cannot stack a second poll on top of the first.
 *
 * ── THE CROP STEP IS OPTIONAL, AND THE DEFAULT IS STILL "OFF" ───────────────────────────────
 * `cropOpen` starts false and `cropSelection` starts null, so a run that never touches the step
 * sends four explicit `null`s and the job behaves exactly as it does without this feature — the
 * whole "skipping it leaves today's behaviour unchanged" contract, held in one boolean. Closing the
 * step again after opening it returns to that payload too: the selection is kept (so re-opening
 * does not lose the framing) but it is not SENT unless the step is open.
 *
 * ── IT IS OFFERED IDENTICALLY IN BOTH MODES, ON PURPOSE ─────────────────────────────────────
 * Nothing below reads `mode` to decide whether to render the crop step. `buildImageRequestBody`
 * sends `aspect_ratio` and `input_references` identically regardless of mode, so once a crop box
 * exists there is nothing mode-specific left to differ about; the only mode-specific behaviour is
 * the NO-crop fallback, which lives on the server and is untouched here.
 *
 * ── WHY IT HIDES WHEN THE SOURCE'S DIMENSIONS ARE UNKNOWN ───────────────────────────────────
 * `getPhotoshopSourcePhoto` returns `width`/`height` as `number | null` — a row predating dimension
 * tracking has neither. Without them there is no source aspect to fit the frame to, no honest
 * preview to draw, and nothing for the server to compute a pixel box from. Offering a control that
 * could only lie is worse than not offering it, so the step is absent and the job runs exactly as
 * it does today.
 */
export function PhotoshopDetail({
  userId,
  sourceKind,
  sourceId,
  sourceUrl,
  sourceWidth,
  sourceHeight,
}: {
  /** The signed-in admin's id, from the server prop chain — Replace's uploads land under it. */
  userId: string
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  sourceUrl: string
  /** The source photo's natural pixel size, straight off `getPhotoshopSourcePhoto`. */
  sourceWidth: number | null
  sourceHeight: number | null
}) {
  const [mode, setMode] = React.useState<NinaPhotoshopMode>('edit')
  const [model, setModel] = React.useState<string>('bytedance-seed/seedream-4.5')
  const [instruction, setInstruction] = React.useState(photoshopPresetText('bigger_boobs') ?? '')
  const [presetSelect, setPresetSelect] = React.useState('')
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [job, setJob] = React.useState<PhotoshopJobView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)
  const [resolving, setResolving] = React.useState<'replace' | 'add' | 'discard' | null>(null)
  const [cropOpen, setCropOpen] = React.useState(false)
  const [cropSelection, setCropSelection] = React.useState<PhotoshopCropSelection | null>(null)

  /*
   * The MANUALLY replaced photo's bytes, kept locally rather than re-read from the server: this
   * route (`/admin/photoshop/[source]/[id]`) is not the path `replaceChatPhotoAction` /
   * `replaceNinaAvatarAction` revalidate (`/admin/nina`), so nothing re-renders this page's props
   * on a successful swap — the operator would otherwise see the OLD bytes until a manual reload.
   */
  const [displayUrl, setDisplayUrl] = React.useState(sourceUrl)
  const [displayWidth, setDisplayWidth] = React.useState(sourceWidth)
  const [displayHeight, setDisplayHeight] = React.useState(sourceHeight)
  const [replacing, setReplacing] = React.useState(false)
  const [replaceError, setReplaceError] = React.useState<string | null>(null)
  const [replaceNote, setReplaceNote] = React.useState<string | null>(null)
  const replaceFileRef = React.useRef<HTMLInputElement>(null)

  const cropAvailable =
    displayWidth != null && displayHeight != null && displayWidth > 0 && displayHeight > 0
  /** What the server would pick on its own if no crop is supplied — the step's default, and the
   *  number the "off" hint quotes so the trade-off is stated rather than implied. */
  const autoRatio = cropAvailable ? nearestNinaImageAspectRatio(displayWidth, displayHeight) : null

  const router = useRouter()
  const aliveRef = React.useRef(true)
  React.useEffect(
    () => () => {
      aliveRef.current = false
    },
    [],
  )

  /**
   * Open or close the crop step. The first open seeds the selection with the auto-picked ratio and
   * an identity crop — so opening the step and running with no further adjustment sends the SAME
   * `aspect_ratio` the server would have chosen by itself, and differs only in that the pixels now
   * genuinely have that shape instead of being stretched into it.
   */
  function toggleCrop() {
    if (displayWidth == null || displayHeight == null) return
    if (cropOpen) {
      setCropOpen(false)
      return
    }
    if (cropSelection == null) {
      setCropSelection({
        ratioLabel: nearestNinaImageAspectRatio(displayWidth, displayHeight),
        crop: { ...NINA_PHOTOSHOP_CROP_IDENTITY },
      })
    }
    setCropOpen(true)
  }

  /**
   * The manual file-pick Replace, mirroring `MediaControls`' `onPick`
   * (`components/admin/explorer/MediaControls.tsx`) onto whichever table this source photo lives
   * in. Distinct from `resolve('replace')` below: that one accepts a FINISHED JOB's own result,
   * this one swaps in a file picked from the operator's computer before any job has run.
   */
  async function onReplacePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clearing the input is what makes picking the SAME file twice fire `change` again.
    event.target.value = ''
    if (file == null || replacing) return

    setReplacing(true)
    setReplaceError(null)
    setReplaceNote(null)
    try {
      if (sourceKind === 'message_image') {
        const uploaded = await uploadChatPhoto(userId, file)
        const result = await replaceChatPhotoAction({ id: sourceId, ...uploaded })
        if (!result.ok) {
          setReplaceError(result.error ?? 'That replacement did not stick.')
          return
        }
        if (result.note != null) setReplaceNote(result.note)
        setDisplayUrl(uploaded.blobUrl)
        setDisplayWidth(uploaded.width)
        setDisplayHeight(uploaded.height)
      } else {
        const uploaded = await uploadAvatarPhoto(userId, file)
        const result = await replaceNinaAvatarAction({ id: sourceId, ...uploaded })
        if (!result.ok) {
          setReplaceError(result.error ?? 'That replacement did not stick.')
          return
        }
        if (result.note != null) setReplaceNote(result.note)
        setDisplayUrl(uploaded.blobUrl)
        setDisplayWidth(uploaded.width)
        setDisplayHeight(uploaded.height)
      }
      // The old bytes' aspect ratio no longer describes the new picture.
      setCropOpen(false)
      setCropSelection(null)
    } catch (cause) {
      setReplaceError(cause instanceof Error ? cause.message : 'That upload failed.')
    } finally {
      setReplacing(false)
    }
  }

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
      /*
       * `null` unless the step is OPEN. A selection kept from an earlier open-then-close is
       * deliberately not sent: "the admin closed the crop step" and "the admin never opened it"
       * have to produce the same job, or the skip contract is decided by history rather than by
       * what is on screen.
       */
      const selection = cropOpen ? cropSelection : null
      const result = await runPhotoshopJobAction({
        sourceKind,
        sourceId,
        mode,
        model,
        presetKey: presetSelect === '' ? null : presetSelect,
        instruction,
        cropRatioLabel: selection?.ratioLabel ?? null,
        cropScale: selection?.crop.scale ?? null,
        cropX: selection?.crop.x ?? null,
        cropY: selection?.crop.y ?? null,
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
            <img src={displayUrl} alt="" className="max-h-[420px] w-full object-contain" />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            {/* The id the `/photoshop` and `/pull-photoshop-job` skills take as their first
                argument — the runner's own ask: "print the image id below it, so i can paste it
                here to run the skill." Plain selectable text, not a copy button: a 12-character
                nanoid is one tap-and-hold away on a phone and a triple-click away on a desktop. */}
            <p className="text-[12px] font-semibold text-ink-3">
              Image ID: <span className="font-mono text-ink-2 select-all">{sourceId}</span>
            </p>
            <Button
              type="button"
              size="md"
              variant="secondary"
              aria-label="Replace this photo"
              title="Replace this photo"
              className="w-11 shrink-0 px-0"
              loading={replacing}
              disabled={replacing || running || job?.status === 'pending'}
              onClick={() => replaceFileRef.current?.click()}
            >
              <SwapIcon className="size-4" />
            </Button>
          </div>
          <input
            ref={replaceFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void onReplacePick(event)}
          />
          {replaceError != null && (
            <p role="alert" className="mt-1.5 text-[12px] font-medium text-red">
              {replaceError}
            </p>
          )}
          {replaceNote != null && (
            <p role="status" className="mt-1.5 text-[12px] font-medium text-ink-3">
              {replaceNote}
            </p>
          )}
        </div>
      )}

      {showResult && job != null && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[12px] font-semibold text-ink-3">Before</p>
              <div className="overflow-hidden rounded-field bg-ink-3/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={displayUrl} alt="" className="max-h-[420px] w-full object-contain" />
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
            <div className="relative">
              <input
                id="photoshop-instruction"
                type="text"
                value={instruction}
                maxLength={NINA_PHOTOSHOP_INSTRUCTION_MAX}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="e.g. fix her eyes so they look natural"
                className="w-full rounded-field bg-paper-2 py-2 pr-9 pl-3 text-[14px] font-medium text-ink"
              />
              {instruction.length > 0 && (
                <button
                  type="button"
                  onClick={() => setInstruction('')}
                  aria-label="Clear text"
                  className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-pill text-ink-3 active:scale-[0.97]"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>
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

          {cropAvailable && (
            <div>
              {/*
                A button with `aria-expanded`, not `<details>`. The two disclosures already in
                `components/admin/` (`ImageGenPanel.tsx:1106`, `CharacterPanel.tsx:594`) are
                `<details>` because nothing outside them cares whether they are open. Here the open
                state IS the payload — `execute()` sends a crop only while the step is open — and a
                `<details>`'s openness lives in the DOM, not in React state, so it would have to be
                mirrored back with an `onToggle` handler and could drift from the thing it decides.
              */}
              <button
                type="button"
                onClick={toggleCrop}
                aria-expanded={cropOpen}
                aria-controls="photoshop-crop-step"
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-field bg-paper-2 px-3 py-2 text-left text-[13px] font-semibold text-ink"
              >
                <span>Aspect ratio crop</span>
                <span className="text-[12px] font-medium text-ink-3">
                  {cropOpen ? 'Skip it' : 'Optional'}
                </span>
              </button>
              <p className="mt-1.5 max-w-[70ch] text-[12px] font-medium text-ink-3">
                {cropOpen
                  ? 'The model is sent exactly these pixels, at exactly this ratio — nothing is stretched to fit.'
                  : `Off: the whole photo goes to the model on its nearest catalogued canvas (${autoRatio}), which can read a little wide or narrow.`}
              </p>
              {cropOpen && cropSelection != null && (
                <div id="photoshop-crop-step" className="mt-3">
                  <PhotoshopCropStudio
                    src={displayUrl}
                    natural={{ width: displayWidth, height: displayHeight }}
                    value={cropSelection}
                    onChange={setCropSelection}
                    disabled={running || job?.status === 'pending'}
                  />
                </div>
              )}
            </div>
          )}

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
