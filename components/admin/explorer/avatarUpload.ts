'use client'

import { upload } from '@vercel/blob/client'

import { adminAvatarPathname, extForContentType } from '@/lib/admin/avatars'
import { newId } from '@/lib/id'
import { contentHashOf } from '@/lib/photos/contentHash'

/**
 * A picked file -> an object in Blob at `nina/<userId>/avatar-<id>.<ext>` -> the claims
 * `replaceNinaAvatarAction` needs. The album's own upload path, for the Photoshop detail screen's
 * manual Replace button.
 *
 * Unlike `uploadChatPhoto`, this never re-encodes: `UploadAvatar.tsx`'s retired rule still holds
 * for the album's own bytes (`app/api/admin/nina/upload/route.ts`'s header) — a 4x crop zoom on a
 * downscaled source shows her face at 192 px — so the file's own container and dimensions go up
 * unchanged, and the content type it declares is its own `file.type`, not a fixed JPEG.
 */
export async function uploadAvatarPhoto(
  userId: string,
  file: File,
): Promise<{
  blobUrl: string
  pathname: string
  width: number
  height: number
  bytes: number
  contentHash: string
}> {
  const ext = extForContentType(file.type)
  if (ext == null) throw new Error('Pick a JPEG, PNG or WEBP file.')

  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  bitmap.close()

  const contentHash = await contentHashOf(file)

  const result = await upload(adminAvatarPathname(userId, newId(), ext), file, {
    access: 'public',
    contentType: file.type,
    handleUploadUrl: '/api/admin/nina/upload',
    clientPayload: JSON.stringify({ contentType: file.type }),
  })

  return {
    blobUrl: result.url,
    pathname: result.pathname,
    width,
    height,
    bytes: file.size,
    contentHash,
  }
}
