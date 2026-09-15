'use client'

import { useState } from 'react'

import { CheckIcon, SparklesIcon } from '@/components/admin/photoIcons'
import { Button, CONTROL_CLASS } from '@/components/ui'
import {
  ADMIN_AVATAR_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS,
  ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS,
} from '@/lib/admin/avatars'
import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import { cn } from '@/lib/cn'

/**
 * **The one describe control, for every photograph on the page — R3.** The stored prose rendered
 * in full and editable by hand, with the vision model one click away: always available, overwriting
 * whatever is stored, never confirming. Album rows and Media rows get the SAME component; the host
 * picks the actions, this file owns the interaction.
 *
 * ── IT IMPORTS NO SERVER ACTION ──────────────────────────────────────────────────────────────
 * `ChatPhotoDetail`'s rule for `ChatPhotoDescription`, kept because it is what makes the prop
 * renames impossible to miss: `onSave`, `onRedescribe` and `onSaveKeywords` are handed in as
 * closures by the arm that mounts this panel — `AlbumSelectionPane` or `MediaPane`, each of which
 * already knows which table its row is backed by (Phase 2's dispatcher narrowed them). A rename in
 * either action family fails at the call site in that arm, not silently inside a component that
 * guessed.
 *
 * ── A SAVE BUTTON, NOT COMMIT-ON-BLUR, AND NOT A CONFIRMATION ─────────────────────────────
 * R1's ruling — *"no need for all these bullshit confirmation"* — is about a SECOND click on
 * something. This is the FIRST click of the write, the distinction `MemoryTable.tsx:553-558` makes
 * in as many words for its own `+`. Commit-on-blur is right for that file (forty cells of 400
 * characters, `Escape` to revert); it is wrong for one 2000-character paragraph, where a stray blur
 * would silently store a half-finished sentence into Nina's prompt with nothing to say it happened.
 * **The keyword box obeys the same rule for the same reason**, and one more besides: an unsaved
 * keyword edit that committed on blur would re-embed the row every time the operator tabbed away.
 *
 * ── NO `<form>`, NO `router.refresh()` ────────────────────────────────────────────────────
 * `ChatPhotoDescription`'s shape and its cited reason. All three actions end in `revalidatePath`,
 * and Next 16 *"re-renders the current route server-side and includes a newly rendered RSC payload
 * in the action's response"*, so the saved (or re-described) prose arrives in the same round trip
 * and the box shows it — a `<form action={…}>` would need `useActionState` to surface the inline
 * error, which is a second error vocabulary on a screen that already has one.
 *
 * ── `draft === null` MEANS UNTOUCHED, WHICH IS WHY THERE IS NO EFFECT ─────────────────────
 * The box shows the SERVER's prose until the operator types; once he has typed, nothing from the
 * server can overwrite him. This is what makes a re-describe safe to fire while the box holds
 * unsaved text: the fresh prose arrives in the payload and is simply not shown while his draft
 * stands — his typing is never discarded by a machine pass, and the "unsaved" marker stays honest.
 * After a successful SAVE the draft is dropped back to `null`, which is what makes the marker
 * clear itself when the saved text comes back. The host still keys the pane per selection, which
 * covers the other direction: switching tiles with unsaved text in the box. **`keywordsDraft` is a
 * second, independent draft under the identical rule** — the two boxes hold two different columns
 * and neither save may disturb the other's typing, which is also why the album has two actions and
 * not one widened one.
 *
 * ── ONE FLIGHT AT A TIME, ACROSS ALL THREE VERBS ─────────────────────────────────────────────
 * A save and a describe running concurrently would interleave two writes to one column with no
 * meaning attached to the winner, so while any of them is in flight the others are disabled (the
 * in-flight one shows the pulsing dots). R2's keyword save joins the SAME lock rather than getting
 * one of its own, and the reason is sharper than symmetry: all three verbs write
 * `description_embedding`. A keyword save nulls the vector and schedules the re-embed off the
 * response; a re-describe computes a vector in band and writes it. Run together, the deferred
 * re-embed can land on either side of the in-band write, and which one wins is not a thing the
 * operator can see or reason about. One lock makes the sequence a fact.
 *
 * A textarea is disabled during ITS OWN save — the value being written must not change under the
 * write — and every box is left ENABLED during a DESCRIBE: an 8-11 s vendor call must not lock him
 * out of typing, and the draft rule above protects whatever he types.
 *
 * ── THE KEYWORD BOX IS OPTIONAL, AND ABSENT IS NOT DISABLED ──────────────────────────────────
 * R2, 2026-09-15. `search_keywords` is a `nina_avatars` column and `nina_message_images` has no
 * counterpart, so the Media arm mounts this panel WITHOUT `onSaveKeywords` and the whole block is
 * not rendered — the same call `FileExplorer.tsx:368` makes for the search field over the Media
 * view: *"a search field over it would be a field that cannot answer — absent, not disabled."*
 *
 * ── THE FONT SIZE IS `CONTROL_CLASS`'s AND IS NOT SHRUNK ─────────────────────────────────
 * `text-base` comes from `CONTROL_CLASS` and stays. Safari zooms the viewport when a control
 * smaller than 16 px takes focus and leaves it zoomed, and the design brief makes that one of the
 * rules that beats the design. The recipe is `ChatPhotoDescription`'s, verbatim.
 */

/** What either describe verb answers with. Both action result shapes satisfy it structurally. */
export interface DescribeOutcome {
  ok: boolean
  error?: string
  note?: string
}

export function PhotoDescription({
  description,
  emptyNote,
  onSave,
  onRedescribe,
  searchKeywords = null,
  onSaveKeywords,
  negativeSearchKeywords = null,
  onSaveNegativeKeywords,
}: {
  /** The row's stored prose, straight from the server. `null` is "not described yet". */
  description: string | null
  /**
   * The sentence for `description === null`, worded by the host for its table — the media rows
   * fill in from `scheduleChatPhotoCaption`'s `after()` pass moments after an add or a replace;
   * album rows fill in when the photo becomes hers. The panel shows it, and only the host can
   * know which promise is true.
   */
  emptyNote: string
  /** The hand-edit write. Receives the box's current text; an empty string clears the field. */
  onSave: (text: string) => Promise<DescribeOutcome>
  /** The vision-model write. Takes nothing, overwrites everything. */
  onRedescribe: () => Promise<DescribeOutcome>
  /**
   * R2. The row's stored keyword line, or `null`. Read only when `onSaveKeywords` is given —
   * the two travel together, because a box that shows a value it cannot save is worse than no box.
   */
  searchKeywords?: string | null
  /**
   * R2. The keyword write, or ABSENT for a table that has no such column. Absent means the whole
   * block is not rendered; see the docstring. An empty string clears the field.
   */
  onSaveKeywords?: (text: string) => Promise<DescribeOutcome>
  /**
   * R2 follow-up, 2026-09-15. The row's stored EXCLUSION line, or `null`. Same travel-together
   * rule as `searchKeywords`: read only when `onSaveNegativeKeywords` is given.
   */
  negativeSearchKeywords?: string | null
  /**
   * R2 follow-up. The exclusion write, or ABSENT for a table with no such column. An empty string
   * clears the field. Unlike `onSaveKeywords`, saving this does NOT re-embed the row — see the
   * component's own note below, beside the box.
   */
  onSaveNegativeKeywords?: (text: string) => Promise<DescribeOutcome>
}) {
  const stored = description ?? ''
  const storedKeywords = searchKeywords ?? ''
  const storedNegativeKeywords = negativeSearchKeywords ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [keywordsDraft, setKeywordsDraft] = useState<string | null>(null)
  const [negativeKeywordsDraft, setNegativeKeywordsDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'describe' | 'keywords' | 'negativeKeywords' | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const text = draft ?? stored
  const dirty = draft !== null && draft !== stored
  /* Mirrors the schema's transform, which trims before it decides, so the label cannot lie. */
  const willClear = text.trim().length === 0

  const keywordsText = keywordsDraft ?? storedKeywords
  const keywordsDirty = keywordsDraft !== null && keywordsDraft !== storedKeywords
  const keywordsWillClear = keywordsText.trim().length === 0

  const negativeKeywordsText = negativeKeywordsDraft ?? storedNegativeKeywords
  const negativeKeywordsDirty =
    negativeKeywordsDraft !== null && negativeKeywordsDraft !== storedNegativeKeywords
  const negativeKeywordsWillClear = negativeKeywordsText.trim().length === 0

  const save = async () => {
    if (busy !== null || !dirty) return
    setBusy('save')
    setError(null)
    setNote(null)
    try {
      const result = await onSave(text)
      if (!result.ok) {
        setError(result.error ?? 'That description did not stick.')
      } else {
        setNote(result.note ?? null)
        /* Back to "untouched", so the box follows the server again — and so the payload that
         * `revalidatePath` just produced, which carries exactly what was written, does not read as
         * an unsaved edit. */
        setDraft(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That save failed.')
    } finally {
      setBusy(null)
    }
  }

  /**
   * The keyword save. `save()`'s body with its own draft and its own sentences — deliberately not
   * a shared helper parameterised over four things, which would be harder to read than the twenty
   * lines it saves and would have to explain which state each verb touches anyway.
   *
   * The description draft is NOT reset here. The two boxes are two columns, and a keyword save must
   * leave unsaved prose exactly where the operator left it — the same rule a re-describe follows
   * for the same reason.
   */
  const saveKeywords = async () => {
    if (busy !== null || !keywordsDirty || onSaveKeywords == null) return
    setBusy('keywords')
    setError(null)
    setNote(null)
    try {
      const result = await onSaveKeywords(keywordsText)
      if (!result.ok) {
        setError(result.error ?? 'Those keywords did not stick.')
      } else {
        setNote(result.note ?? null)
        setKeywordsDraft(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That save failed.')
    } finally {
      setBusy(null)
    }
  }

  /**
   * The negative-keyword save. `saveKeywords`'s body verbatim, its own draft, its own busy value —
   * same reason: two independent columns, two independent drafts, and this one does not share the
   * "all three verbs write `description_embedding`" lock argument `saveKeywords` makes, because
   * this column never touches the vector. It still joins the ONE `busy` state rather than getting
   * a fully separate lock, so a description save, a re-describe and either keyword save still
   * cannot run concurrently against the same row.
   */
  const saveNegativeKeywords = async () => {
    if (busy !== null || !negativeKeywordsDirty || onSaveNegativeKeywords == null) return
    setBusy('negativeKeywords')
    setError(null)
    setNote(null)
    try {
      const result = await onSaveNegativeKeywords(negativeKeywordsText)
      if (!result.ok) {
        setError(result.error ?? 'That exclusion did not stick.')
      } else {
        setNote(result.note ?? null)
        setNegativeKeywordsDraft(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That save failed.')
    } finally {
      setBusy(null)
    }
  }

  const redescribe = async () => {
    if (busy !== null) return
    setBusy('describe')
    setError(null)
    setNote(null)
    try {
      const result = await onRedescribe()
      if (!result.ok) {
        setError(result.error ?? 'The description call failed. Try again.')
      } else {
        setNote(result.note ?? null)
        /* The draft is deliberately LEFT AS IT IS — see the docstring: his unsaved typing survives
         * the machine pass, and the fresh prose reaches the box the moment he saves or reverts.
         * `keywordsDraft` likewise: a re-describe does not touch that column at all. */
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The description call failed. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-5 border-t border-rule pt-4">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
        What she can see in it
      </p>

      <textarea
        aria-label="What she can see in it"
        className={cn(CONTROL_CLASS, 'min-h-[104px] resize-y py-2 leading-relaxed')}
        value={text}
        maxLength={ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        disabled={busy === 'save'}
        placeholder="Not described yet."
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
          setNote(null)
        }}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {/*
         * R1: a check glyph, not a word. `Clear` when an emptied box would null a row that HAS
         * prose — the distinction the old label carried moves whole into the accessible name and
         * the tooltip, and stays out of the layout. Still one click, the first click; still not a
         * confirmation.
         */}
        <Button
          type="button"
          size="md"
          variant="secondary"
          className="w-11 px-0"
          aria-label={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          title={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          loading={busy === 'save'}
          disabled={busy !== null || !dirty}
          onClick={() => void save()}
        >
          <CheckIcon className="size-4" />
        </Button>

        {/*
         * ALWAYS rendered — the null guard the pane used to put around this verb was the defect R3
         * exists to remove: a described photo with wrong prose had no way to re-run the eyes. It
         * OVERWRITES, and the accessible name says so once the row has prose; there is no
         * confirmation, because the hand-edit box above is the correction path.
         */}
        <Button
          type="button"
          size="md"
          variant="secondary"
          className="w-11 px-0"
          aria-label={description == null ? 'Describe it' : 'Re-describe it — it overwrites'}
          title={description == null ? 'Describe it' : 'Re-describe it — it overwrites'}
          loading={busy === 'describe'}
          disabled={busy !== null}
          onClick={() => void redescribe()}
        >
          <SparklesIcon className="size-4" />
        </Button>

        <span className="text-[11px] font-medium text-ink-3 tabular-nums">
          {text.length}/{ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        </span>
        {dirty && <span className="text-[11px] font-semibold text-accent">unsaved</span>}
      </div>

      {/*
       * The honest sentence about the ROW's state, kept from `ChatPhotoDescription` and kept for
       * its original reason: after an add, a replace, or a promotion this field is NULL for the
       * few seconds the `after()` describe pass takes, and then fills in on the next load. A field
       * that is merely empty would read as a permanent defect for a photograph that is about to be
       * fine. The WORDS are the host's, because which promise is true depends on the table.
       */}
      {description === null && !dirty && (
        <p className="mt-1.5 text-[12px] leading-relaxed font-medium text-ink-3">{emptyNote}</p>
      )}

      {/*
       * ── R2: THE SEARCH KEYWORDS ───────────────────────────────────────────────────────────
       * Rendered only for a table that HAS the column — see the docstring. No re-describe twin:
       * these are the operator's own words by definition, and a model that guessed them would be
       * guessing at the correction the operator came here to make.
       */}
      {onSaveKeywords != null && (
        <div className="mt-4 border-t border-rule pt-3">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            Search keywords
          </p>

          <textarea
            aria-label="Search keywords"
            className={cn(CONTROL_CLASS, 'min-h-[56px] resize-y py-2 leading-relaxed')}
            value={keywordsText}
            maxLength={ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS}
            disabled={busy === 'keywords'}
            placeholder="tete, putih"
            onChange={(event) => {
              setKeywordsDraft(event.target.value)
              setError(null)
              setNote(null)
            }}
          />

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="md"
              variant="secondary"
              className="w-11 px-0"
              aria-label={
                keywordsWillClear && searchKeywords !== null
                  ? 'Clear the search keywords'
                  : 'Save the search keywords'
              }
              title={
                keywordsWillClear && searchKeywords !== null
                  ? 'Clear the search keywords'
                  : 'Save the search keywords'
              }
              loading={busy === 'keywords'}
              disabled={busy !== null || !keywordsDirty}
              onClick={() => void saveKeywords()}
            >
              <CheckIcon className="size-4" />
            </Button>

            <span className="text-[11px] font-medium text-ink-3 tabular-nums">
              {keywordsText.length}/{ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS}
            </span>
            {keywordsDirty && (
              <span className="text-[11px] font-semibold text-accent">unsaved</span>
            )}
          </div>

          <p className="mt-1.5 text-[12px] leading-relaxed font-medium text-ink-3">
            Phrases, comma-separated. They are embedded with the description, so search can find the
            photo by them — saving re-embeds the row.
          </p>
        </div>
      )}

      {/*
       * ── R2 FOLLOW-UP: THE NEGATIVE KEYWORDS ───────────────────────────────────────────────
       * Rendered only for a table that HAS the column — same absent-not-disabled rule as the
       * search keywords block. No re-describe twin, for the same reason: these are the
       * operator's own words, naming a query this photo should never answer to.
       */}
      {onSaveNegativeKeywords != null && (
        <div className="mt-4 border-t border-rule pt-3">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            Negative keywords
          </p>

          <textarea
            aria-label="Negative keywords"
            className={cn(CONTROL_CLASS, 'min-h-[56px] resize-y py-2 leading-relaxed')}
            value={negativeKeywordsText}
            maxLength={ADMIN_AVATAR_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS}
            disabled={busy === 'negativeKeywords'}
            placeholder="tete"
            onChange={(event) => {
              setNegativeKeywordsDraft(event.target.value)
              setError(null)
              setNote(null)
            }}
          />

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="md"
              variant="secondary"
              className="w-11 px-0"
              aria-label={
                negativeKeywordsWillClear && negativeSearchKeywords !== null
                  ? 'Clear the negative keywords'
                  : 'Save the negative keywords'
              }
              title={
                negativeKeywordsWillClear && negativeSearchKeywords !== null
                  ? 'Clear the negative keywords'
                  : 'Save the negative keywords'
              }
              loading={busy === 'negativeKeywords'}
              disabled={busy !== null || !negativeKeywordsDirty}
              onClick={() => void saveNegativeKeywords()}
            >
              <CheckIcon className="size-4" />
            </Button>

            <span className="text-[11px] font-medium text-ink-3 tabular-nums">
              {negativeKeywordsText.length}/{ADMIN_AVATAR_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS}
            </span>
            {negativeKeywordsDirty && (
              <span className="text-[11px] font-semibold text-accent">unsaved</span>
            )}
          </div>

          <p className="mt-1.5 text-[12px] leading-relaxed font-medium text-ink-3">
            Words, comma-separated. A search containing one of them as a whole word never shows
            this photo — the description is not re-embedded, and nothing else changes.
          </p>
        </div>
      )}

      {/* Both lines answer an awaited write, so both are live regions — the action resolved
       * after focus already moved on (`MemoryTable`'s result-line rule). */}
      {error !== null && (
        <p role="alert" className="mt-1.5 text-[12px] font-medium text-red">
          {error}
        </p>
      )}
      {note !== null && (
        <p role="status" className="mt-1.5 text-[12px] font-medium text-ink-3">
          {note}
        </p>
      )}
    </section>
  )
}
