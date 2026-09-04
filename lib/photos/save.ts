/**
 * The two decisions "save this photograph" has to get right, as pure functions.
 *
 * Split out of `components/nina/ChatPhotoActions.tsx` for the reason `lib/photos/gallery.ts` gives
 * verbatim: **this is the whole of the behaviour**, and a pure function is the only version of it
 * this repo's runner can prove. `vitest.config.ts` runs `environment: 'node'` — there is no jsdom,
 * no `navigator`, no `File` picker and no download bar — so the impure half (the fetch, the share
 * sheet, the synthetic anchor click) stays in the component and everything that can be decided
 * without a browser is decided here.
 *
 * ── WHY THERE IS A DECISION AT ALL ────────────────────────────────────────────────────────────
 * Because `<a download href={crossOriginUrl}>` is not a download. The attribute is honoured only
 * for same-origin URLs, and every photo in this app lives on
 * `https://<store>.public.blob.vercel-storage.com/…`, so the attribute is ignored and the browser
 * navigates instead — the image opens and nothing is saved. A control that looks like a download
 * and is not one is worse than no control, which is why the strategy is chosen rather than assumed.
 */

export type SaveStrategy =
  /**
   * `navigator.share({ files: [file] })`. The platform's own sheet, whose first action for an image
   * on iOS is **Save Image** — which lands the photo in Photos, where a photograph belongs, rather
   * than in Files/Downloads.
   */
  | 'share'
  /**
   * Open the URL and let the platform save it. On iOS a long-press on a full-size image offers
   * "Add to Photos", which is a real save that needs no fetch, no CORS and no download permission.
   *
   * Never a RETURN value of `chooseSaveStrategy` — it is the runtime fallback the component reaches
   * when the bytes never arrived or the sheet refused, and it is named here so the ladder is one
   * type rather than a type plus an untyped escape hatch.
   */
  | 'open'
  /**
   * Fetch the bytes, wrap them in a `blob:` object URL — which IS same-origin — and click a
   * synthetic `<a download>`. The only branch on which the `download` attribute works.
   */
  | 'download'

/**
 * ── WHY THE GATE IS A POINTER TYPE AND NOT A BROWSER NAME ─────────────────────────────────────
 * `canShare({ files })` is true on Windows Chrome/Edge and macOS Safari as well as on phones, and
 * the Windows share sheet has **no save action at all** — a desktop runner would be handed an app
 * picker where he asked for a file. `(pointer: coarse)` is a capability signal rather than a user
 * agent string, and it separates precisely the two populations whose correct answer differs:
 * a phone wants the sheet (and therefore Photos), a mouse wants a file on disk.
 *
 * A touch device WITHOUT file sharing — an older iOS, an in-app webview — gets `'download'` and
 * not `'open'`: the object-URL anchor is same-origin and therefore honoured there too, and when it
 * is not, the component's own fallback opens the photo and says to long-press it. Choosing `'open'`
 * here instead would give up on a save that usually works before trying it.
 */
export function chooseSaveStrategy(env: {
  /** `navigator.canShare({ files: [...] })`, probed with a stand-in file. */
  canShareFiles: boolean
  /** `window.matchMedia('(pointer: coarse)').matches`. */
  coarsePointer: boolean
}): SaveStrategy {
  if (env.coarsePointer) return env.canShareFiles ? 'share' : 'download'
  return 'download'
}

/** Anything that is not safe in a filename on every platform the runner might save onto. */
const UNSAFE_FILENAME_CHARS = /[^A-Za-z0-9_-]+/g

/** Extensions worth preserving. Anything else is served as, and saved as, a JPEG. */
const KNOWN_EXTENSIONS = new Map<string, string>([
  ['jpg', 'jpg'],
  ['jpeg', 'jpg'],
  ['png', 'png'],
  ['webp', 'webp'],
  ['gif', 'gif'],
  ['avif', 'avif'],
])

/** Long enough to stay unique, short enough that a Downloads list is still readable. */
const MAX_STEM_CHARS = 40

/**
 * What the saved file is called: `<prefix>-<the blob's own last path segment>.<ext>`.
 *
 * ── WHY THE BLOB'S SEGMENT AND NOT SOMETHING FRIENDLIER ───────────────────────────────────────
 * A chat photo's pathname is `nina/<userId>/chat/<id>.jpg` and Vercel appends its own random
 * suffix, so the last segment is already unique per photo (`lib/nina/images.ts:63-68`). Two saves
 * of two different photos therefore cannot collide, which a date or a caption could not promise.
 * Only the LAST segment is used, so the user id in the path never reaches the filename.
 *
 * A caption is not an option for a stronger reason: the only description that exists for a chat
 * photo is `glm-4.6v`'s private prose on the image row, which may not leave the server
 * (invariant 5).
 *
 * Never throws. A malformed URL, an empty path or an unknown extension all degrade to
 * `<prefix>.jpg` — a save is not the moment to surface a parse error.
 */
export function saveFilenameFor(url: string, prefix: string): string {
  let segment = ''
  try {
    segment =
      new URL(url).pathname
        .split('/')
        .filter((part) => part.length > 0)
        .pop() ?? ''
  } catch {
    segment = ''
  }

  const dot = segment.lastIndexOf('.')
  const rawStem = dot > 0 ? segment.slice(0, dot) : segment
  const rawExtension = dot > 0 ? segment.slice(dot + 1).toLowerCase() : ''
  const extension = KNOWN_EXTENSIONS.get(rawExtension) ?? 'jpg'

  const clean = (value: string) =>
    value.replace(UNSAFE_FILENAME_CHARS, '-').replace(/^-+/, '').replace(/-+$/, '')

  const stem = clean(rawStem).slice(0, MAX_STEM_CHARS).replace(/-+$/, '')
  const safePrefix = clean(prefix) || 'foto'

  return stem.length === 0 ? `${safePrefix}.${extension}` : `${safePrefix}-${stem}.${extension}`
}
