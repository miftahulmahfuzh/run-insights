'use client'

import { upload } from '@vercel/blob/client'
import { useCallback, useRef, useState } from 'react'

import {
  adminAvatarPathname,
  adminAvatarThumbPathname,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_MIN_EDGE_PX,
  extForContentType,
} from '@/lib/admin/avatars'
import { planFolderUpload, type PlannedUpload } from '@/lib/admin/filetree'
import {
  listNinaAlbumManifestAction,
  registerNinaAvatarsAction,
} from '@/lib/admin/ninaAlbumActions'
import type { AvatarBatchRecord } from '@/lib/admin/schema'
import { newId } from '@/lib/id'
import { NINA_ADMIN_BATCH_MAX } from '@/lib/nina/album'

import type { QueueItem, QueueReport } from './model'
import { walkEntries, type WalkedFile } from './dropWalk'
import { EXPLORER_THUMB_CONTENT_TYPE, measureAndThumbnail } from './thumbnail'

/**
 * One gesture, from "he let go of the mouse" to "the rows exist".
 *
 * ── THE SHAPE IS F17'S, AND THAT IS NOT A STYLE CHOICE ──────────────────────────────────────
 * `docs/plans/F17-onpick-purity.md` measured what happens when a decision is made inside a
 * `setState` updater: `reactStrictMode: true` double-invokes updaters in dev, so one picked file
 * minted **two** upload tokens and wrote **two** blobs, one of them orphaned in the store forever.
 * Nothing in `run()` below is inside an updater. It gathers, it awaits the manifest, it calls one
 * pure function, it calls `setItems`/`setReport` with values, and only then does it start any
 * effect — decide, set, run. `components/nina/Composer.tsx:256-287` is the same three steps at
 * three files instead of three hundred.
 *
 * ── BOUNDED CONCURRENCY, NOT `Promise.all` ──────────────────────────────────────────────────
 * `Promise.all` over three hundred files would open three hundred token-mint requests to
 * `/api/admin/nina/upload` and three hundred simultaneous PUTs, decode three hundred images at once,
 * and report progress as one long pause followed by everything. Four lanes is enough to saturate a
 * home upstream link, keeps at most four decoded bitmaps alive, and makes the progress line mean
 * something.
 *
 * ── PER-FILE FAILURE IS NOT BATCH FAILURE ───────────────────────────────────────────────────
 * A file that will not decode, or a PUT that 500s, marks THAT item `error` and the lane moves on.
 * Three hundred files with one bad frame must not lose two hundred and ninety-nine uploads.
 *
 * ── REGISTERING IN CHUNKS, AS THEY LAND ─────────────────────────────────────────────────────
 * Records are flushed to `registerNinaAvatarsAction` every `NINA_ADMIN_BATCH_MAX` completions
 * rather than once at the end, for one reason: a tab closed at file 290 of 300 should leave 250
 * registered rows, not 300 orphaned blobs. Phase 4's action is idempotent on the dedupe key's
 * unique index, so a re-drop after a crash re-registers nothing and re-uploads only what is missing
 * — which is the same mechanism as *"upload only the new folders and files"*, applied to our own
 * failure.
 *
 * ── THE ORPHAN EXPOSURE, NAMED ──────────────────────────────────────────────────────────────
 * An upload that dies between the PUT and its register chunk leaves an object in Blob that no row
 * points at. That is the album's existing exposure (ruling D4's open card for
 * `scripts/blob-reap.mjs`, which still does not know the `nina/` prefix) and a batch upload widens
 * it. It is why `dismiss()` refuses to run while the queue is busy: throwing away the records of
 * in-flight PUTs would manufacture orphans on purpose.
 */

/** Four parallel PUTs. See the header. */
export const EXPLORER_UPLOAD_CONCURRENCY = 4

/**
 * How many records go into one `registerNinaAvatarsAction` call.
 *
 * **`NINA_ADMIN_BATCH_MAX` and nothing else** — phase 1's one definition, imported from
 * `lib/nina/album.ts`, which is the module that satisfies the constraint this file actually has:
 * it carries no `zod`, no `server-only` and no database import, so reading a constant from it costs
 * the `/admin/nina` browser bundle nothing. (Reading one from `lib/admin/schema.ts` would have
 * pulled a validator in for the sake of an integer; a module-level `z.object(...)` is a side effect
 * no bundler tree-shakes. That is why the constant is not there.) Phase 4's Zod bounds the array
 * with the same number and `insertNinaAvatars` throws above it, so this is the first of three
 * agreeing checks rather than a second opinion.
 */
export const EXPLORER_REGISTER_CHUNK = NINA_ADMIN_BATCH_MAX

export type UploadPhase = 'idle' | 'reading' | 'planning' | 'uploading' | 'finished'

export interface FolderUpload {
  phase: UploadPhase
  items: readonly QueueItem[]
  report: QueueReport | null
  /** A gesture that failed before a queue existed — the manifest read, or nothing readable dropped. */
  error: string | null
  /** Files from either `<input>`. */
  start: (walked: readonly WalkedFile[]) => void
  /** Entries captured synchronously from a drop; the walk happens inside. */
  startWalk: (entries: readonly FileSystemEntry[]) => void
  /** Clear the queue. Refused while busy — see the header's orphan note. */
  dismiss: () => void
}

export function useFolderUpload({
  userId,
  destination,
  onFinished,
}: {
  userId: string
  /** The folder the gesture lands in — the folder the explorer is showing. */
  destination: string
  /** Called once per gesture, after the last register chunk. `router.refresh()` lives here. */
  onFinished: () => void
}): FolderUpload {
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [items, setItems] = useState<readonly QueueItem[]>([])
  const [report, setReport] = useState<QueueReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Which gesture is live. `Composer`'s `dropped` ref (`Composer.tsx:183`) at gesture granularity:
   * a promise from a dismissed or superseded run must not write into the state of the current one.
   */
  const runRef = useRef(0)
  const busyRef = useRef(false)

  const patch = useCallback((run: number, id: string, next: Partial<QueueItem>) => {
    if (run !== runRef.current) return
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }, [])

  /**
   * One file: measure, thumbnail, PUT the original, PUT the thumbnail, hand back the record.
   * Returns `null` when this file failed — the item is already marked and the lane continues.
   *
   * **Declared before `run`, and that is required rather than tidy.** `run` lists it in its
   * dependency array, and a dependency array is evaluated DURING RENDER — so a `const` declared
   * below would still be in its temporal dead zone at that moment and the render would throw.
   */
  const uploadOne = useCallback(
    async (
      gesture: number,
      planned: PlannedUpload<WalkedFile>,
    ): Promise<AvatarBatchRecord | null> => {
      const file = planned.source.file
      const fail = (message: string): null => {
        patch(gesture, planned.sourceKey, { state: 'error', error: message })
        return null
      }

      /*
       * `planned.contentType` and `planned.ext` come off the plan and are guaranteed to agree with
       * each other (phase 2's `classifyFile` derives the extension from the CONTENT TYPE, never
       * from the filename, so a blob called `.png` cannot hold a JPEG). Nothing is re-classified
       * here — the draft called `uploadableContentType` a second time, which was a second answer to
       * a question the plan had already answered.
       *
       * `extForContentType` is still called, on the content type rather than on the name, as the
       * one assertion that this phase and `lib/admin/avatars.ts` agree about the mapping: it is
       * typed `AdminAvatarExt`, so this line is where a divergence between phase 2's union and
       * `ADMIN_AVATAR_EXTS` becomes a build error instead of a bad pathname.
       */
      const contentType = planned.contentType
      const ext = extForContentType(contentType)
      if (ext == null) return fail('Not a JPEG, PNG or WebP.')

      patch(gesture, planned.sourceKey, { state: 'thumbnailing' })
      let measured
      try {
        measured = await measureAndThumbnail(file)
      } catch {
        return fail('That file did not decode as an image.')
      }
      if (Math.min(measured.width, measured.height) < ADMIN_AVATAR_MIN_EDGE_PX) {
        // The same refusal `UploadAvatar.tsx:81-86` made, for the same reason: below this the
        // circular frame cannot be zoomed at all without visible mush. It cannot be decided by
        // `planFolderUpload`, which has no pixels — only a decode knows.
        return fail(
          `Too small to frame — the short edge is ${Math.min(measured.width, measured.height)} px.`,
        )
      }

      patch(gesture, planned.sourceKey, { state: 'uploading' })
      const id = newId()
      let original
      try {
        original = await upload(adminAvatarPathname(userId, id, ext), file, {
          access: 'public',
          contentType,
          handleUploadUrl: '/api/admin/nina/upload',
          clientPayload: JSON.stringify({ contentType }),
        })
      } catch (cause) {
        return fail(cause instanceof Error ? cause.message : 'That upload failed.')
      }

      /*
       * The thumbnail is a SECOND blob under the SAME id: `avatar-<id>.<ext>` and
       * `thumb-<id>.jpg`. A failure here is not a failure of the upload — `thumbUrl` is nullable
       * and the grid falls back to the original, which is exactly what every pre-phase-1 row does.
       */
      let thumbUrl: string | null = null
      let thumbPathname: string | null = null
      if (measured.thumb != null) {
        try {
          /*
           * `'jpg'` is the THIRD argument and is required: the Route Handler cross-checks the
           * pathname's extension against the `contentType` declared below, and a mismatch is a
           * 400. `EXPLORER_THUMB_CONTENT_TYPE` is `image/jpeg`, so the extension is `jpg`.
           */
          const thumb = await upload(adminAvatarThumbPathname(userId, id, 'jpg'), measured.thumb, {
            access: 'public',
            contentType: EXPLORER_THUMB_CONTENT_TYPE,
            handleUploadUrl: '/api/admin/nina/upload',
            clientPayload: JSON.stringify({ contentType: EXPLORER_THUMB_CONTENT_TYPE }),
          })
          thumbUrl = thumb.url
          thumbPathname = thumb.pathname
        } catch (cause) {
          console.warn('[f33] thumbnail upload failed; the grid will load the original', cause)
        }
      }

      /*
       * `thumb` is ONE nullable object and not two nullable fields, which is phase 4's schema
       * shape and is better than the draft's flat pair: "has a thumbnail" becomes one question
       * instead of two fields that can disagree about it.
       */
      return {
        blobUrl: original.url,
        pathname: original.pathname,
        contentType,
        width: measured.width,
        height: measured.height,
        bytes: file.size,
        folder: planned.folder,
        filename: planned.filename,
        sourceKey: planned.sourceKey,
        thumb:
          thumbUrl == null || thumbPathname == null
            ? null
            : { url: thumbUrl, pathname: thumbPathname },
      }
    },
    [patch, userId],
  )

  const run = useCallback(
    async (gather: () => Promise<readonly WalkedFile[]>) => {
      if (busyRef.current) return
      busyRef.current = true
      const gesture = ++runRef.current

      setError(null)
      setItems([])
      setReport(null)
      setPhase('reading')

      try {
        const walked = await gather()
        if (gesture !== runRef.current) return
        if (walked.length === 0) {
          setPhase('finished')
          setError('Nothing readable in that drop. Try the folder picker instead.')
          return
        }

        setPhase('planning')

        /*
         * The manifest is read for the DESTINATION SUBTREE, not for the whole album. Dropping
         * `bali/` into `2026/` compares against what is already under `2026/`, which is the only
         * comparison that can be right: the dedupe key folds in the path, so the same file dropped
         * into two different folders is two different files — and it should be, because a photo's
         * location in the tree is information the operator put there on purpose.
         */
        const manifest = await listNinaAlbumManifestAction({ folder: destination })
        if (gesture !== runRef.current) return
        if (!manifest.ok || manifest.entries == null) {
          setPhase('finished')
          setError(manifest.error ?? 'Could not read what is already in this folder.')
          return
        }

        /*
         * Pure from here to `setItems`, and there is no `Map` any more.
         *
         * The draft kept a `sourceKey -> File` map because it prefixed the destination onto each
         * path itself and then had to find the `File` again after the plan partitioned the list.
         * Neither is needed: `planFolderUpload` takes `base` and joins it per file, and
         * `PlannedUpload<T>.source` hands the caller's own object straight back — which is what
         * phase 2 designed it for. So the `File` rides along on the input object and comes out the
         * other side attached to its plan entry. One less structure that can be wrong, and no
         * second computation of the dedupe key on this side of the boundary at all.
         *
         * `walked` is already `{ relativePath, name, type, size, lastModified, file }` — see
         * `dropWalk.ts` — so nothing is mapped here either.
         */
        const plan = planFolderUpload({
          base: destination,
          files: walked,
          /*
           * `AdminManifestEntry` carries `sourceKey: string`, and `ManifestEntryLike` asks for
           * `sourceKey: string | null` — so the array goes straight in. Phase 2 ignores a null or
           * empty key rather than matching it, which is what makes the diff safe against rows that
           * predate the dedupe column.
           */
          manifest: manifest.entries,
          /*
           * The cap has ONE home (`lib/admin/avatars.ts:43`) and phase 2 takes it as a parameter
           * rather than declaring a second 8 MB. This is the call site that keeps that true.
           */
          maxBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES,
        })

        setReport({
          already: plan.counts.existing,
          rejected: plan.counts.rejected,
          refused: plan.refused.map((entry) => ({ name: entry.name, reason: entry.reason })),
          found: plan.counts.total,
        })
        setItems(
          plan.upload.map((planned) => ({
            id: planned.sourceKey,
            /* The path as it will exist in the album, assembled from the plan's canonical
             * destination and its sanitised filename — not from the raw walked path. */
            path:
              planned.folder === '' ? planned.filename : `${planned.folder}/${planned.filename}`,
            folder: planned.folder,
            filename: planned.filename,
            state: 'waiting' as const,
            error: null,
          })),
        )

        if (manifest.truncated === true) {
          // Honest and non-fatal: a truncated manifest makes the diff OVER-report, so some files
          // are re-PUT and their inserts are discarded by `ON CONFLICT DO NOTHING`. Slower, never
          // wrong — phase 1 and phase 4 both argue it at the functions that produce it.
          setError('This folder is large enough that some already-uploaded files may upload again.')
        }

        if (plan.upload.length === 0) {
          setPhase('finished')
          return
        }

        setPhase('uploading')
        const pending: AvatarBatchRecord[] = []

        const flush = async (force: boolean): Promise<void> => {
          while (pending.length >= EXPLORER_REGISTER_CHUNK || (force && pending.length > 0)) {
            // `splice` is synchronous, so two lanes can never take the same records: whichever
            // reaches this line first has already emptied what it took before the other runs.
            const chunk = pending.splice(0, EXPLORER_REGISTER_CHUNK)
            for (const record of chunk) patch(gesture, record.sourceKey, { state: 'registering' })
            /*
             * THE ENVELOPE, not a bare array: `{ records }`. Phase 4 chose an object holding one
             * array so that a later field (a batch id, a "last chunk" flag) is additive rather
             * than a shape change on an action this file already calls.
             *
             * `ok` means every record in the chunk either inserted or was already in the album —
             * the unique index on `(user_id, source_key)` decides, not application code — so
             * marking the whole chunk `done` is correct and `outcome.inserted` does not need to be
             * consulted per tile. `outcome.skipped` is the number the "nothing new" line wants,
             * and it is already covered by `report.already` for the client-side half of the same
             * fact.
             */
            const outcome = await registerNinaAvatarsAction({ records: chunk })
            for (const record of chunk) {
              patch(
                gesture,
                record.sourceKey,
                outcome.ok
                  ? { state: 'done' }
                  : { state: 'error', error: outcome.error ?? 'The server refused this batch.' },
              )
            }
          }
        }

        await runLanes(plan.upload, async (planned) => {
          if (gesture !== runRef.current) return
          // No lookup, no "lost track of that file" branch: `planned.source` IS the walked entry
          // this plan row was built from, and `planned.source.file` is its `File`.
          const record = await uploadOne(gesture, planned)
          if (record == null) return
          pending.push(record)
          await flush(false)
        })

        await flush(true)
        if (gesture !== runRef.current) return
        setPhase('finished')
        onFinished()
      } catch (cause) {
        if (gesture !== runRef.current) return
        setPhase('finished')
        setError(cause instanceof Error ? cause.message : 'That upload did not finish.')
      } finally {
        busyRef.current = false
      }
    },
    [destination, onFinished, patch, uploadOne],
  )

  const start = useCallback(
    (walked: readonly WalkedFile[]) => {
      void run(async () => walked)
    },
    [run],
  )

  const startWalk = useCallback(
    (entries: readonly FileSystemEntry[]) => {
      void run(() => walkEntries(entries))
    },
    [run],
  )

  const dismiss = useCallback(() => {
    if (busyRef.current) return
    runRef.current += 1
    setItems([])
    setReport(null)
    setError(null)
    setPhase('idle')
  }, [])

  return { phase, items, report, error, start, startWalk, dismiss }
}

/**
 * A fixed number of lanes drawing from one shared index.
 *
 * `next++` needs no lock: JavaScript is single-threaded and each lane only advances at an `await`
 * boundary, so the read-and-increment is atomic with respect to every other lane. This is the whole
 * of "bounded concurrency" and it is four lines rather than a dependency.
 */
async function runLanes<T>(units: readonly T[], worker: (unit: T) => Promise<void>): Promise<void> {
  let next = 0
  const lanes = Array.from(
    { length: Math.min(EXPLORER_UPLOAD_CONCURRENCY, units.length) },
    async () => {
      for (;;) {
        const unit = units[next++]
        if (unit == null) return
        await worker(unit)
      }
    },
  )
  await Promise.all(lanes)
}
