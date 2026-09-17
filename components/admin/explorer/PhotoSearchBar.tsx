'use client'

import { useRef, useState } from 'react'

import { TOUCH_ICON } from '@/components/admin/touch'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui/Field'
import { searchNinaAvatarsAction, type AdminSearchHit } from '@/lib/admin/ninaAlbumActions'
import { cn } from '@/lib/cn'

import { encodeSearchQueryImage } from './searchQueryImage'

/**
 * Semantic search over the album, above everything — R1, in his words: *"in image collection, above
 * 'Album' text. put a search field, plus a button to upload image"*, because *"our image collection
 * is getting crowded now, i am struggling to see the image i want."*
 *
 * ── WHAT THIS COMPONENT OWNS, AND WHAT IT HANDS UP ──────────────────────────────────────────
 * It owns the DRAFT: the words, the picked photograph, whether a call is in flight, and the one
 * sentence under the row. It owns no results — a landed search leaves through `onResults`, because
 * the thing that has to branch on it is the content pane, which is `FileExplorer`'s. That split is
 * what keeps `Clear` honest: it resets this component AND calls `onClear`, and there is no third
 * place where a stale search could survive.
 *
 * ── THE PHOTOGRAPH IS A QUESTION, NOT AN UPLOAD ─────────────────────────────────────────────
 * `searchQueryImage.ts` re-encodes the pick in the browser and returns a data URI. Nothing is PUT
 * to Blob — see that module's header. The preview below is that same data URI, so what the operator
 * sees is exactly the bytes the vision model will see.
 *
 * ── THE SEARCH IS WIDE, AND THAT IS THE POINT ───────────────────────────────────────────────
 * `?folder=` is not sent. The complaint is *"i am struggling to see the image i want"*, which is
 * not a complaint about one folder — it is not knowing which folder. Since
 * media-album-unified-search R1 (2026-09-17) it is not a complaint about one TABLE either: the one
 * action behind this row ranks `nina_avatars` and `nina_message_images` together and hands back a
 * single deduplicated list, so *"every single picture in any directory"* is one query's answer.
 * This component is unchanged by that — it holds the draft, counts what came back and forwards the
 * array; it reads no field of a hit, which is why widening the hit reached it as nothing at all.
 * The breadcrumb above still says where browsing would resume; the summary line below says how many
 * photographs matched, anywhere.
 *
 * ── WHY NO CAPTION AND NO SCORE ARE SHOWN ───────────────────────────────────────────────────
 * Invariant 5: `glm-4.6v`'s prose about a photograph is Nina's and does not reach a component
 * (`components/admin/explorer/model.ts:49` states it for the browsing grid). That covers the
 * caption phase 3 derives from the query image too — it is the same model's private text. A raw
 * cosine number would be the other half of the same mistake: the ranking IS the answer, and a
 * number beside it is a number nobody can act on.
 */

/** What a landed search hands to `FileExplorer`. */
export interface AlbumSearchState {
  /** Best-first, exactly as the action ordered them. Never re-sorted here. */
  hits: readonly AdminSearchHit[]
  /** What was typed, trimmed. `''` for an image-only search. */
  text: string
  /** Whether a query photograph was part of it. */
  withImage: boolean
}

export function PhotoSearchBar({
  active,
  onResults,
  onClear,
}: {
  /** Whether a search is currently driving the content pane. Only the Clear button reads it. */
  active: boolean
  onResults: (state: AlbumSearchState) => void
  onClear: () => void
}) {
  const [text, setText] = useState('')
  const [queryImage, setQueryImage] = useState<{ dataUri: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)

  const trimmed = text.trim()
  const canSearch = !busy && (trimmed !== '' || queryImage !== null)

  async function onPickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    // So re-picking the same file fires `change` again — `FileExplorer.onPickFolder`'s line.
    event.target.value = ''
    if (file == null) return

    setBusy(true)
    setError(null)
    try {
      const dataUri = await encodeSearchQueryImage(file)
      setQueryImage({ dataUri, name: file.name })
    } catch (cause) {
      setQueryImage(null)
      setError(cause instanceof Error ? cause.message : 'That photo could not be read.')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSearch) return

    setBusy(true)
    setError(null)
    try {
      const result = await searchNinaAvatarsAction({
        text: trimmed === '' ? undefined : trimmed,
        imageDataUri: queryImage?.dataUri,
      })
      if (!result.ok) {
        setSummary(null)
        setError(result.error ?? 'The search did not run.')
        return
      }
      setSummary(summaryLine(result.hits.length, trimmed, queryImage !== null))
      onResults({ hits: result.hits, text: trimmed, withImage: queryImage !== null })
    } catch (cause) {
      setSummary(null)
      setError(cause instanceof Error ? cause.message : 'The search did not run.')
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    setText('')
    setQueryImage(null)
    setError(null)
    setSummary(null)
    onClear()
  }

  return (
    <form
      role="search"
      aria-label="Search the album"
      onSubmit={(event) => void onSubmit(event)}
      className="mb-4 space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* The field gives; the buttons do not. `min-w-0` on the wrapper is what lets the row wrap
            on a narrow screen instead of blowing the track out — `FileExplorer`'s own rule for its
            breadcrumb. `Input` carries `w-full` from `CONTROL_CLASS`, so the wrapper owns the
            flexing and no two width utilities land on one element. `relative` hosts the in-field
            Kosongkan below — `ImageGenPanel`/`SessionRow`'s idiom verbatim: the input pays `pr-11`
            only while there are words, the tap never moves focus out of the field, and the
            `::-webkit-search-cancel-button` is hidden because this is a `type="search"` input and
            the browser's own ✕ would otherwise sit beside ours. */}
        <div className="relative min-w-0 flex-1 basis-[16rem]">
          <Input
            ref={fieldRef}
            type="search"
            name="album-search"
            value={text}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
            placeholder="Describe the photo you are looking for"
            aria-label="Describe the photo you are looking for"
            className={cn('[&::-webkit-search-cancel-button]:hidden', text !== '' && 'pr-11')}
          />
          {text !== '' && (
            <button
              type="button"
              aria-label="Kosongkan pencarian"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                setText('')
                fieldRef.current?.focus()
              }}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70"
            >
              &#10005;
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void onPickImage(event)}
        />

        {/* Icon-only, the toolbar's rule: the accessible name is the `aria-label`, never the
            glyph. */}
        <Button
          type="button"
          size="md"
          variant="secondary"
          aria-label="Search with a photo"
          title="Search with a photo"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <ImageIcon className="size-5" />
        </Button>

        <Button type="submit" size="md" loading={busy} disabled={!canSearch}>
          <SearchIcon className="size-5" />
          Search
        </Button>

        {(active || trimmed !== '' || queryImage !== null) && (
          <Button type="button" size="md" variant="ghost" onClick={clear}>
            Clear
          </Button>
        )}
      </div>

      {queryImage !== null && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- an ephemeral data URI that
           * never reached a network. There is nothing for `next/image` to optimise and no host
           * to allow-list. */}
          <img
            src={queryImage.dataUri}
            alt=""
            className="size-11 shrink-0 rounded-field object-cover"
          />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">
            {queryImage.name}
          </span>
          <button
            type="button"
            onClick={() => setQueryImage(null)}
            aria-label="Remove the search photo"
            className={cn(TOUCH_ICON, 'shrink-0 text-[15px] font-semibold text-ink-3')}
          >
            &#10005;
          </button>
        </div>
      )}

      {error !== null && (
        <p role="alert" className="text-[12px] font-medium text-red">
          {error}
        </p>
      )}

      {error === null && summary !== null && (
        <p aria-live="polite" className="text-[12px] font-medium text-ink-2">
          {summary}
        </p>
      )}
    </form>
  )
}

/**
 * The one sentence under the row. It names WHAT was searched for, because a text-and-photo search
 * that returns surprising results is otherwise indistinguishable from a photo-only one that ignored
 * the words.
 */
function summaryLine(count: number, text: string, withImage: boolean): string {
  const what =
    text !== '' && withImage ? `"${text}" and that photo` : text !== '' ? `"${text}"` : 'that photo'
  if (count === 0) return `Nothing matched ${what}.`
  return count === 1 ? `1 photo matches ${what}.` : `${count} photos match ${what}.`
}

/*
 * Two glyphs, inlined rather than imported — `FileExplorer.tsx:582-591`'s ruling for this screen,
 * extended: **Lucide** (lucide-static, ISC), copied verbatim with `class`/`width`/`height` dropped
 * and `stroke-width` normalised to `strokeWidth` on the root `svg`, where the `stroke*`
 * presentation attributes inherit to every child. Both take `className` and are `aria-hidden` —
 * the accessible name is the button's, never the picture.
 */

/** Search: a magnifier. */
function SearchIcon({ className }: { className: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

/** Search with a photo: a picture. */
function ImageIcon({ className }: { className: string }) {
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
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}
