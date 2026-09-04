'use client'

import { useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import { UploadAvatar } from '@/components/admin/UploadAvatar'
import { Button } from '@/components/ui'
import {
  deleteNinaAvatarAction,
  describeNinaAvatarAction,
  saveNinaAvatarCropAction,
  setCurrentNinaAvatarAction,
} from '@/lib/admin/ninaAlbumActions'
import { cn } from '@/lib/cn'
import { isIdentityCrop, resolveCrop, type NinaCrop, type NinaCropInput } from '@/lib/nina/crop'

/**
 * `/admin/nina`'s body — F33 R23 end to end: add, remove, choose the current one, and frame a face.
 *
 * ── THE LAYOUT IS THE REASON THIS SCREEN IS NOT MOBILE ──────────────────────────────────────
 * Two columns from `xl` up: the studio on the left, the album on the right, so a change to the
 * framing is visible against the other photos without scrolling. Below `xl` they stack, studio
 * first. The album is a grid of circular thumbnails rather than a table of filenames because the
 * only question this screen answers about a photo is "what does she look like in it".
 *
 * ── STATE, AND WHAT IS DELIBERATELY NOT IN IT ───────────────────────────────────────────────
 * `selectedId` and `draft` (the crop being dragged) are the whole of it. The photos come from the
 * server on every render, and every action calls `revalidatePath('/admin/nina')`, so there is no
 * optimistic copy of the album to keep in sync — the one class of bug this screen could plausibly
 * have shipped.
 */

export interface AlbumPhoto {
  id: string
  url: string
  width: number | null
  height: number | null
  bytes: number | null
  source: string
  isCurrent: boolean
  description: string | null
  crop: NinaCropInput
  createdAt: string
}

export function AlbumManager({ photos, userId }: { photos: AlbumPhoto[]; userId: string }) {
  const current = photos.find((photo) => photo.isCurrent) ?? null
  const [selectedId, setSelectedId] = useState<string | null>(current?.id ?? photos[0]?.id ?? null)
  const selected = photos.find((photo) => photo.id === selectedId) ?? null

  /** The crop being dragged. `null` means "the stored one", which is what Reset restores to. */
  const [draft, setDraft] = useState<NinaCrop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const stored = selected ? resolveCrop(selected.crop) : null
  const crop = draft ?? stored
  const dirty =
    draft != null &&
    stored != null &&
    (draft.scale !== stored.scale || draft.x !== stored.x || draft.y !== stored.y)

  function select(id: string) {
    setSelectedId(id)
    setDraft(null) // a new photo's framing is its own, never the last one's
    setError(null)
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        setError(outcome.error ?? 'That did not work.')
        return
      }
      onOk?.()
    })
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Framing</h2>
        {selected == null || crop == null ? (
          <p className="rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
            Add a photo to start framing.
          </p>
        ) : (
          <>
            <CropStudio
              src={selected.url}
              natural={{ width: selected.width, height: selected.height }}
              crop={crop}
              onChange={setDraft}
              disabled={pending}
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                size="md"
                disabled={!dirty || pending}
                onClick={() =>
                  run(
                    () =>
                      saveNinaAvatarCropAction({
                        id: selected.id,
                        scale: crop.scale,
                        x: crop.x,
                        y: crop.y,
                      }),
                    () => setDraft(null),
                  )
                }
              >
                {dirty ? 'Save framing' : 'Framing saved'}
              </Button>
              <Button
                size="md"
                variant="secondary"
                disabled={pending || (isIdentityCrop(crop) && !dirty)}
                onClick={() =>
                  run(
                    () => saveNinaAvatarCropAction({ id: selected.id, scale: 1, x: 0, y: 0 }),
                    () => setDraft(null),
                  )
                }
              >
                Reset framing
              </Button>
            </div>

            {/* The honesty check. Same helper, same square box, the sizes the app actually draws —
                so "it looked right in the tool" and "it looks right in chat" cannot diverge. */}
            <div className="mt-6 flex items-center gap-4">
              <CircleFrame
                src={selected.url}
                natural={{ width: selected.width, height: selected.height }}
                crop={dirty ? crop : selected.crop}
                sizeClass="size-11"
              />
              <CircleFrame
                src={selected.url}
                natural={{ width: selected.width, height: selected.height }}
                crop={dirty ? crop : selected.crop}
                sizeClass="size-7"
              />
              <p className="text-[12px] font-medium text-ink-3">
                44 px and 28 px — the chat header and the typing row, at the sizes they render.
              </p>
            </div>

            <dl className="mt-6 space-y-1 text-[12px] font-medium text-ink-3">
              <div className="flex gap-2">
                <dt>Source</dt>
                <dd className="text-ink-2">{selected.source}</dd>
              </div>
              <div className="flex gap-2">
                <dt>Pixels</dt>
                <dd className="text-ink-2">
                  {selected.width ?? '?'} &times; {selected.height ?? '?'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt>Description</dt>
                <dd className="max-w-[46ch] text-ink-2">
                  {selected.description ?? 'None yet — she cannot talk about this photo.'}
                </dd>
              </div>
            </dl>

            {selected.description == null && (
              <Button
                size="md"
                variant="secondary"
                className="mt-3"
                disabled={pending}
                onClick={() => run(() => describeNinaAvatarAction(selected.id))}
              >
                Describe it
              </Button>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 text-[13px] font-semibold text-warn">
            {error}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">
          Album {photos.length > 0 && <span className="text-ink-3">({photos.length})</span>}
        </h2>

        <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={cn(
                'rounded-card border bg-card p-4 text-center',
                photo.id === selectedId ? 'border-accent' : 'border-rule',
              )}
            >
              <button
                type="button"
                onClick={() => select(photo.id)}
                className="mx-auto block"
                aria-pressed={photo.id === selectedId}
              >
                <CircleFrame
                  src={photo.url}
                  natural={{ width: photo.width, height: photo.height }}
                  crop={photo.crop}
                  sizeClass="size-24"
                  ring={photo.isCurrent}
                />
              </button>
              <p className="mt-3 text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
                {photo.isCurrent ? 'Current' : photo.source}
              </p>
              <div className="mt-2 space-y-1">
                <Button
                  size="md"
                  variant="secondary"
                  fullWidth
                  disabled={pending || photo.isCurrent}
                  onClick={() => run(() => setCurrentNinaAvatarAction(photo.id))}
                >
                  {photo.isCurrent ? 'Hers now' : 'Make current'}
                </Button>
                <button
                  type="button"
                  disabled={pending || photo.isCurrent}
                  title={
                    photo.isCurrent
                      ? 'Make another photo current first — she is never left without one.'
                      : undefined
                  }
                  onClick={() =>
                    run(
                      () => deleteNinaAvatarAction(photo.id),
                      () => {
                        if (selectedId === photo.id) setSelectedId(null)
                      },
                    )
                  }
                  className="w-full py-1 text-[12px] font-semibold text-ink-3 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <UploadAvatar userId={userId} onUploaded={() => setDraft(null)} />
      </section>
    </div>
  )
}
