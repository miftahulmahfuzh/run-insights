'use client'

import { upload } from '@vercel/blob/client'
import { useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui'
import {
  ADMIN_AVATAR_CONTENT_TYPES,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_MIN_EDGE_PX,
  adminAvatarPathname,
  extForContentType,
  type AdminAvatarContentType,
} from '@/lib/admin/avatars'
import { registerNinaAvatarAction } from '@/lib/admin/ninaAlbumActions'
import { newId } from '@/lib/id'

/**
 * Add a photo to Nina's album. F33 R23: *"admin can add / remove profpic album of nina."*
 *
 * The flow, and every step visible:
 *
 *   pick → read intrinsic size → PUT straight to Blob → registerNinaAvatarAction → described
 *
 * ── WHY THE BYTES ARE NOT COMPRESSED ────────────────────────────────────────────────────────
 * `UploadPicker` compresses to a 560 px short edge because a vision model reads those pixels.
 * `compressForNina` (phase 6) targets 768 px for the same reason. An avatar is neither: the crop
 * is a display transform, so a 4× zoom on a 768 px source would show her face at 192 px of real
 * detail, and phase 13's full-screen viewer serves the same blob. The original goes up whole —
 * which is only possible because the browser PUTs directly to Blob and never through a Function.
 *
 * ── WHY THE BROWSER MEASURES THE IMAGE ──────────────────────────────────────────────────────
 * `clampCrop` needs the aspect ratio, and nothing on the server has the bytes (the Function never
 * sees them, by design). `createImageBitmap` gives it in one call with no `<img>` in the document,
 * and `avatarRegisterSchema` bounds what comes back. A lie here would only mis-frame her own
 * avatar, and the server re-clamps against the stored numbers on every save regardless.
 */

function isAllowed(type: string): type is AdminAvatarContentType {
  return (ADMIN_AVATAR_CONTENT_TYPES as readonly string[]).includes(type)
}

export function UploadAvatar({ userId, onUploaded }: { userId: string; onUploaded?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [makeCurrent, setMakeCurrent] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // so re-picking the same file fires change again
    if (!file) return
    setError(null)

    if (!isAllowed(file.type)) {
      setError('JPEG, PNG or WebP only.')
      return
    }
    if (file.size > ADMIN_AVATAR_MAX_UPLOAD_BYTES) {
      setError(`That is ${(file.size / 1024 / 1024).toFixed(1)} MB — the cap is 8 MB.`)
      return
    }
    const ext = extForContentType(file.type)
    if (ext == null) {
      setError('JPEG, PNG or WebP only.')
      return
    }

    let width = 0
    let height = 0
    try {
      const bitmap = await createImageBitmap(file)
      width = bitmap.width
      height = bitmap.height
      bitmap.close()
    } catch {
      setError('That file did not decode as an image.')
      return
    }
    if (Math.min(width, height) < ADMIN_AVATAR_MIN_EDGE_PX) {
      setError(
        `Too small to frame — the short edge is ${Math.min(width, height)} px, minimum is ${ADMIN_AVATAR_MIN_EDGE_PX}.`,
      )
      return
    }

    setStatus('Uploading')
    try {
      const requested = adminAvatarPathname(userId, newId(), ext)
      const result = await upload(requested, file, {
        access: 'public',
        contentType: file.type,
        handleUploadUrl: '/api/admin/nina/upload',
        clientPayload: JSON.stringify({ contentType: file.type }),
      })

      setStatus('Asking her what is in it')
      startTransition(async () => {
        const outcome = await registerNinaAvatarAction({
          blobUrl: result.url,
          pathname: result.pathname,
          contentType: file.type,
          width,
          height,
          bytes: file.size,
          makeCurrent,
        })
        if (!outcome.ok) {
          setStatus(null)
          setError(outcome.error ?? 'The server refused that upload.')
          return
        }
        setStatus(
          outcome.description == null
            ? 'Uploaded. No description yet — use Describe it on the card.'
            : null,
        )
        onUploaded?.()
      })
    } catch (cause) {
      setStatus(null)
      setError(cause instanceof Error ? cause.message : 'Upload failed.')
    }
  }

  return (
    <div className="rounded-card border border-dashed border-rule bg-card p-5">
      <input
        ref={inputRef}
        type="file"
        accept={ADMIN_AVATAR_CONTENT_TYPES.join(',')}
        className="hidden"
        onChange={onPick}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="md"
          onClick={() => inputRef.current?.click()}
          loading={busy || status === 'Uploading' || status === 'Asking her what is in it'}
        >
          Add a photo
        </Button>
        <label className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
          <input
            type="checkbox"
            checked={makeCurrent}
            onChange={(event) => setMakeCurrent(event.target.checked)}
            className="size-4 accent-accent"
          />
          Make it her current photo
        </label>
        <span className="text-[12px] font-medium text-ink-3">
          JPEG, PNG or WebP &middot; up to 8 MB &middot; not re-compressed
        </span>
      </div>

      {status && (
        <p aria-live="polite" className="mt-3 text-[12px] font-semibold text-ink-2">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}

      <p className="mt-3 max-w-[70ch] text-[12px] font-medium text-ink-3">
        This changes the photo she shows. It does not touch{' '}
        <code className="text-ink-2">assets/nina/_anchor.png</code> — but nothing reads that file at
        runtime today, because generation sends no reference image. The anchor is a seed for the
        deferred consistent-face feature, and{' '}
        <code className="text-ink-2">/update-nina-profpic</code> is what re-seeds it.
      </p>
    </div>
  )
}
