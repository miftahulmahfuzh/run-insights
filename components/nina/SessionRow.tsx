'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import {
  removeNinaChatSession,
  renameNinaChatSession,
  setNinaChatSessionPinned,
  type NinaSessionActionResult,
} from '@/lib/nina/sessionActions'
import { NINA_SESSION_TITLE_MAX_CHARS } from '@/lib/nina/sessions'
import { planSessionRemoval, type SidebarSession } from '@/lib/nina/sidebar'

/**
 * One chat in the sidebar, with its three secondary actions — F35 R4 (pin), R3's manual half
 * (rename) and R11 (remove).
 *
 * ── THE AFFORDANCE IS A `⋯` DISCLOSURE, AND THREE ALTERNATIVES ARE ON THE RECORD ──────────────
 * The row's primary action is "open this chat". Three secondary actions have to fit beside it on a
 * phone-width, vertically-scrolling list without a scroll ever firing one.
 *
 *   - **Not a swipe.** `decideReplySwipe` is the precedent for building a gesture honestly and
 *     also the precedent for not building one here: its fourth rule exists because the gesture
 *     "must not eat the chat log's vertical scroll", and a denser list is a worse place for that
 *     competition. It affords one action, not three. And R11 is irreversible — a trigger whose
 *     failure mode is being mistaken for a scroll is the worst available one for a permanent
 *     delete.
 *   - **Not a long-press.** On the record in `MessageBubble`: it "collides with iOS text selection
 *     and the native callout menu on a block of selectable prose". A chat title is selectable
 *     prose too.
 *   - **Not a tap on the row.** The row's tap is the navigation, and making the row a button
 *     "breaks text selection just as thoroughly".
 *
 * So: a 44px `⋯` button, a SIBLING of the row's link and not a child (a `<button>` inside an `<a>`
 * is invalid and breaks the link's hit testing). `components/admin/FolderMenu.tsx` is the shape —
 * a `mode` union, one panel per mode, one `run()` that
 * owns the pending flag and the error line, and a Cancel that just resets `mode`.
 *
 * The PIN STATE is on the row; the PIN CONTROL is in the menu. A tappable pin glyph would put a
 * one-tap mutation back into the scroll path to save a tap on the action performed least often.
 *
 * ── THE PANELS EXPAND INLINE, WHICH IS WHERE THIS DIVERGES FROM `FolderMenu` ───────────────────
 * `FolderMenu`'s panels are `absolute` because its trigger "renders inline in `FolderTree`'s `Row`,
 * which is a 200px flex line". This sidebar is the full width of the phone and scrolls vertically;
 * an absolute panel would be clipped by the panel's own `overflow-y-auto` and would need a z-index
 * over rows it does not own. Inline expansion needs neither.
 *
 * ── THE SERVER OWNS EVERY REFUSAL ─────────────────────────────────────────────────────────────
 * `FolderMenu`'s rule, quoted: nothing here pre-validates a title, so "there is exactly one place
 * a rule lives and no chance of a control that permits what the action refuses (or, worse, forbids
 * what it would have allowed)". Phase 4 owns the rename validation rule; this row renders its own
 * sentence when the action refuses, because `NinaSessionActionResult` carries `{ ok, next }` and no
 * error prose. The ONE thing borrowed is the cap, as `NINA_SESSION_TITLE_MAX_CHARS` — the
 * arrangement `lib/nina/albumActions.ts` argues for with `NINA_ATTACH_MAX_CHARS`, so the input's
 * `maxLength` and the server's clamp are one number.
 *
 * ── R11 DELETES ON THE TAP, AND THE CONFIRMATION PANEL THAT WAS HERE IS GONE ──────────────────
 * `⋯` → Hapus, and the removal fires. There is no second panel: task #136 took it out, on the
 * instruction this codebase already carried for the same class of control — *"we dont need
 * confirmation message to execute them"*, recorded in `components/nina/NinaJobActions.tsx` and
 * `lib/nina/jobActions.ts`. This file used to be the precedent that instruction overrode; the
 * set is now one shape.
 *
 * **What that did NOT change is the stake — and R1 has since narrowed it.** Removing a chat is
 * still a hard delete of the session and its messages, with no archive flag and therefore no undo
 * — unlike `nina_turns.deleted_at`, where a mis-tap is one `update … set deleted_at = null` away
 * from being reversed. The PHOTOGRAPHS are no longer part of that loss:
 * `nina_message_images.message_id` is `ON DELETE SET NULL` since R1, so they outlive the
 * conversation and stay in the Image collection's Media folder. So the asymmetry between this control and
 * the job list's is real and stays on the record; what changed is the judgement about what is
 * worth spending on it, and it is the runner's own chats he made that call about.
 *
 * **R1 also put a sentence in the panel saying the photographs survive, and that sentence went out
 * with the panel.** None of the GUARANTEE went with it — that lives in the foreign key, which is
 * where R1 deliberately put it (*"`removeNinaSession` did not change to get this — the FK did"*).
 * What is gone is the reassurance at the moment of the tap, which is the price of the panel going;
 * `/admin/photos` is where the photographs are still found.
 *
 * What guards it now — all of it cheap, none of it a second screen:
 *
 *   1. **Two deliberate taps, not one.** The menu is still behind `⋯`, so the row's own tap is
 *      still the navigation and no stray tap on a scrolling list can delete anything. The two
 *      targets sit at different positions, so a double-tap on the disclosure cannot reach
 *      "Hapus" either.
 *   2. **`loading={pending}` on the destructive button**, which `Button.tsx` turns into
 *      `disabled` — so a second tap inside the round trip cannot fire a second removal.
 *      `NinaJobActions` calls this "the mis-tap protection that IS here … the one that costs
 *      nothing", and for a one-tap mutation it is the whole of it.
 *   3. **44px targets** (`Button`'s `md`), which the same file calls "the safeguard the
 *      confirmation dialog would have been, spent on the input instead of on a second screen".
 *   4. **No `window.confirm`**, for `RetryExtraction`'s recorded reason: on iOS it is "a system
 *      dialog that reads as an error". Nothing in #136 reopens that.
 *
 * An UNDO is the honest replacement for a confirmation, and it is a feature rather than a
 * drive-by: it needs somewhere to put the row, which means giving `nina_chat_sessions` what
 * `nina_turns` already has — a nullable flag, every reader filtering on it, and a trash view to
 * reach the flagged ones from. #136 put that out of scope, and a client-side "undo" over a row
 * already gone from Postgres would be a lie rather than a cheap version of one.
 *
 * One consequence to keep straight: a REFUSED removal leaves the **menu** open with the sentence
 * in it, which is why the error line lives in the menu block. `run()`'s rule is that a refusal
 * keeps the panel it was fired from, and after #136 that panel is the menu.
 *
 * ── THE ACTIVE ROW IS A BUTTON, NOT A LINK ────────────────────────────────────────────────────
 * Navigating to the chat you are already reading costs a server round trip and a history entry to
 * change nothing. Closing the panel is what that tap means. So the element type is conditional,
 * and the open row also says the word "Open" — furniture, and worth it: the panel is opaque and
 * full-screen, so the runner cannot see the conversation a highlight would be pointing at.
 *
 * ── THE THREE ACTIONS WEAR GLYPHS; THE WORDS BECAME THE ACCESSIBLE NAMES ─────────────────────
 * The runner asked (`search-clear-and-sidebar-icons` II.1): "apakah saat ini kita sudah
 * menggunakan suatu icons library? jika sudah, pilih icons yang paling sesuai untuk menggantikan
 * 'Pin ke atas' 'Ganti nama' 'Hapus'". The answer is on the record in `AdminNav` — no package,
 * but the de-facto standard is Lucide-lineage inline SVG, and `AdminNav` R2 already made this
 * exact move on the admin bar (*"replace semua text pada bottom bar menjadi icon"*) and left the
 * pattern: the glyph is `aria-hidden` decor, the word it replaced is the `aria-label`. So the
 * strings invariant 6 protects — "Pin ke atas"/"Lepas pin", "Ganti nama", "Hapus" — are the same
 * words the screen reader read before, verbatim, now conditional on `session.pinned` exactly as
 * the visible text was.
 *
 * The buttons are STILL `Button`s, not the raw `<button>`s `NinaJobActions` uses, because
 * everything the guards above depend on lives in `Button`: `loading` is the mis-tap protection
 * (guard 2), `md` is the 44px target (guard 3), `variant` is the destructive red. Icon-only
 * changes none of that. The one visible trade: while pending, the pulsing dots replace the glyph
 * (`Button.tsx`: "The label keeps its box while loading, so the button never changes size") — a
 * button whose glyph vanishes for dots in a box that does not move. A 18px glyph inside `md`'s
 * `px-4` makes each button ~50px wide where it was word-width, and the three of them take one
 * short row where the words wrapped.
 *
 * The GLYPHS are two fetches and one reuse, at the bottom of this file. `pin` is the thumbtack
 * the row already wears — the hand-written `PinnedIcon` above it is the same
 * pin-with-a-stem silhouette at 14px, so the STATE and the ACTION that changes it are one
 * concept in one shape. `pencil` is the standard rename glyph of every Lucide-era app,
 * unambiguous at 18px beside a title. `trash` is NOT a second fetch: `NinaJobActions`'
 * `TrashIcon` is already the repo's delete shape, and copying it verbatim is what keeps one
 * trash can in the app rather than two versions of lucide's. (The 14px state glyph is
 * deliberately NOT swapped for the lucide path at both sizes: that is a taste call that needs
 * eyes on a render, not a plan.)
 *
 * ── THE RENAME FIELD CLEARS FROM INSIDE, AND THE PREFILL STAYS ───────────────────────────────
 * II.2, the rename field's own ✕ (the search field gets its own in phase 1 — same shape, two
 * fields, no shared control). `Field` already renders its children inside a `relative` wrapper —
 * that is where its `suffix` slot positions "cm" and "kg" — so the ✕ positions against the well
 * without this file owning geometry beyond the one column it must keep clear: `w-11` on the
 * right edge, 44px wide against the control's 52px height, and the input's `pr-11` tracking the
 * button's presence so text never runs under it (`HeroFields`' `className="pr-10"` beside a
 * suffix is the precedent that a caller's padding utility beats `CONTROL_CLASS`'s `px-4` by CSS
 * source order — `cn`'s recorded no-merge stance). Like `suffix`, it renders only when there is
 * something to clear: an empty field shows no ✕. The SKIN is the panel header's own ✕ —
 * `rounded-pill`, a 19px glyph, `text-ink-3`, the hit rows' `active:opacity-70` — the exact
 * convention the search field's ✕ (phase 1) wears; one idiom, two fields.
 *
 * The keyboard NEVER FOLDS on the tap: `onPointerDown` calls `preventDefault()`, so tapping the
 * ✕ never moves focus out of the input and iOS never gets a blur to fold the keyboard over; the
 * `focus()` in the click handler is the net for what pointer events do not cover (a keyboard
 * user's Enter on the button, focus already elsewhere). One tap, an empty field, the keyboard
 * where it was.
 *
 * And the PREFILL IS DELIBERATELY STILL HERE: `open('rename')` still copies `session.title` into
 * the draft, because fixing a typo in one character should be a keystroke and not a retype. The
 * ✕ is for the other case — a new name from scratch — and it makes THAT one tap too. Clearing on
 * open would tax every typo-fix to save the rare rename-from-scratch a tap; the wrong side of
 * the trade. The ✕ is also not gated on `pending`, for the same reason the input it empties is
 * not: the action read `draft` when it fired, and an in-flight rename is unaffected by what the
 * field shows next.
 */
type RowMode = 'idle' | 'menu' | 'rename'

export function SessionRow({
  session,
  active,
  activeSessionId,
  onClose,
}: {
  session: SidebarSession
  active: boolean
  /* Phase 3's `removeNinaChatSession` takes `{ sessionId, activeSessionId }` and returns `next`, so
   * the destination after a removal is decided once, on the server, from ids it has proved
   * ownership of. This row reports which session its URL is showing; it does not decide where to
   * go. */
  activeSessionId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = React.useState<RowMode>('idle')
  const [draft, setDraft] = React.useState(session.title)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  /* R4's ✕ hands the keyboard back after clearing. `Input` forwards `ref` (`Field.tsx` types it
     and `...rest` spreads it — React 19's ordinary-prop ref), so the clear can focus the field
     it emptied rather than hope the panel's effect catches it. */
  const draftInputRef = React.useRef<HTMLInputElement>(null)

  /**
   * Every panel's submit, so the pending flag, the error line and the mode reset cannot get out of
   * step — `FolderMenu`'s `run()`, same reason. A refusal leaves the panel OPEN with the sentence
   * in it: closing it would throw away the only explanation the runner is going to get.
   */
  function run(
    action: () => Promise<NinaSessionActionResult>,
    onOk: (result: NinaSessionActionResult) => void,
  ) {
    setError(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        /* Phase 3's `NinaSessionActionResult` is `{ ok, next }` — it carries NO `error` sentence.
         * `ok: false` is the whole refusal, so the sentence is this row's, in one place, in his
         * language. Phase 4 still owns the RULE that produces the refusal
         * (`sanitizeNinaSessionTitle` — empty, invisible-only, or over the cap); what differs is
         * that the row supplies the words rather than rendering the server's. */
        setError('Tidak bisa. Coba nama lain.')
        return
      }
      onOk(outcome)
    })
  }

  function open(next: RowMode) {
    setError(null)
    setMode(next)
    // A rename starts from the name it has: fixing a typo in one character should be a keystroke
    // and not a retype. `FolderMenu` prefills for the same reason.
    if (next === 'rename') setDraft(session.title)
  }

  const pin = () =>
    run(
      () => setNinaChatSessionPinned({ sessionId: session.id, pinned: !session.pinned }),
      () => {
        setMode('idle')
        // The list reorders on the SERVER (R4 pinned-first, R5 within it), so a refresh is the
        // whole update. Re-sorting the rows here would be the second opinion this phase promised
        // not to write.
        router.refresh()
      },
    )

  const rename = () =>
    run(
      () => renameNinaChatSession({ sessionId: session.id, title: draft }),
      () => {
        setMode('idle')
        router.refresh()
      },
    )

  const remove = () =>
    run(
      () => removeNinaChatSession({ sessionId: session.id, activeSessionId }),
      (result) => {
        /* The DESTINATION is phase 3's answer, not this component's. Its action returns `next` —
         * `'/nina'` to navigate, `null` to stay — so `planSessionRemoval` maps that answer onto the
         * two things the screen can do instead of recomputing "was this the active one" a second
         * time on the client. One decision, one owner. */
        const plan = planSessionRemoval({ next: result.next })
        if (plan.kind === 'navigate') {
          /*
           * `replace`, never `push`. The entry being replaced is the panel's own pushed entry and
           * the one under it is `?s=<the id just deleted>`; pushing would leave a back gesture that
           * lands on a dead session. It also drops `?sidebar=1`, so the panel closes and the runner
           * sees where he landed — which after deleting the conversation he was reading is the
           * reassuring outcome, not a surprise.
           *
           * The href is the BARE `/nina`: which chat opens when none is named is phase 3's rule,
           * and asking it is also, for free, the answer to "he removed his last one".
           */
          router.replace(plan.href)
          return
        }
        setMode('idle')
        router.refresh()
      },
    )

  const label = (
    <>
      <span className="block truncate text-[15px] leading-[1.35] font-semibold">
        {session.title}
      </span>
      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
        {session.pinned && <PinnedIcon />}
        {session.dayLabel !== null && <span>{session.dayLabel}</span>}
        {active && <span className="font-semibold text-ink-2">Open</span>}
      </span>
    </>
  )

  return (
    <div
      className={cn(
        'rounded-card px-3 py-2',
        // `Card.tsx`'s one surface for the open chat; bare paper for a reference to another one.
        active ? 'bg-card shadow-card' : 'bg-transparent',
      )}
    >
      <div className="flex items-center gap-2">
        {active ? (
          <button
            type="button"
            aria-current="page"
            onClick={onClose}
            className="min-w-0 flex-1 text-left text-ink"
          >
            {label}
          </button>
        ) : (
          <Link href={session.href} className="min-w-0 flex-1 text-left text-ink">
            {label}
          </Link>
        )}

        <button
          type="button"
          aria-label={`Aksi untuk ${session.title}`}
          aria-expanded={mode !== 'idle'}
          onClick={() => (mode === 'idle' ? open('menu') : setMode('idle'))}
          className="grid size-11 shrink-0 place-items-center rounded-pill text-[17px] font-semibold text-ink-3"
        >
          {mode === 'idle' ? '⋯' : '✕'}
        </button>
      </div>

      {mode === 'menu' && (
        <div className="mt-2">
          {/*
            R3: the three actions as glyphs. The words they replaced are the `aria-label`s,
            verbatim — the header section above records the move and the choice. Still `Button`s:
            `loading` is the mis-tap guard (dots replace the glyph inside an unchanged box),
            `md` is the 44px target, `variant` carries the destructive red.
          */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              variant="secondary"
              loading={pending}
              aria-label={session.pinned ? 'Lepas pin' : 'Pin ke atas'}
              onClick={pin}
            >
              <PinIcon />
            </Button>
            <Button
              size="md"
              variant="secondary"
              aria-label="Ganti nama"
              onClick={() => open('rename')}
            >
              <PencilIcon />
            </Button>
            {/* #136: no panel and no second tap. `loading` is `disabled` in `Button.tsx`, which is
                the one safeguard a one-tap mutation gets and the one `NinaJobActions` settled on. */}
            <Button
              size="md"
              variant="destructive"
              loading={pending}
              aria-label="Hapus"
              onClick={remove}
            >
              <TrashIcon />
            </Button>
          </div>
          {/* A refused pin or removal leaves THIS panel open, so the sentence belongs here —
              `run()`'s rule, and after #136 the menu is the panel a removal fires from. A rename's
              refusal renders in its own `Field` instead, where a form error reads. */}
          {error !== null && <p className="mt-2 text-[12px] font-semibold text-red">{error}</p>}
        </div>
      )}

      {mode === 'rename' && (
        <form
          className="mt-2"
          onSubmit={(event) => {
            event.preventDefault()
            rename()
          }}
        >
          <Field label="Nama chat" error={error ?? undefined}>
            <Input
              ref={draftInputRef}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              /* The cap, imported and not re-implemented — one number for the input and the
                 server's clamp. Everything else the server refuses. */
              maxLength={NINA_SESSION_TITLE_MAX_CHARS}
              autoComplete="off"
              enterKeyHint="done"
              /* `pr-11` clears the ✕'s 44px column and tracks the button's presence, so an empty
                 field keeps its symmetric padding. `HeroFields`' `pr-10` beside a suffix is the
                 precedent: the caller's utility beats `CONTROL_CLASS`'s `px-4` by CSS source
                 order (`cn`'s recorded no-merge rule). */
              className={cn('font-semibold', draft !== '' && 'pr-11')}
            />
            {/*
              R4's ✕, inside `Field`'s own `relative` wrapper — the slot its `suffix` already
              positions from. 44px wide against the control's 52px height, and the panel header's
              own ✕ skin (raw glyph child; the `aria-label` carries the name) — the same
              convention the search field's ✕ (phase 1) wears.

              `onPointerDown`'s `preventDefault()` is what keeps the keyboard up: the tap never
              moves focus out of the input, so there is no blur for iOS to fold the keyboard
              over. The `focus()` in the click handler covers what pointer events cannot — a
              keyboard user's Enter on the button, focus already elsewhere.
            */}
            {draft !== '' && (
              <button
                type="button"
                aria-label="Kosongkan nama"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  setDraft('')
                  draftInputRef.current?.focus()
                }}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70"
              >
                ✕
              </button>
            )}
          </Field>
          <div className="mt-3 flex gap-2">
            <Button type="submit" size="md" loading={pending}>
              Simpan
            </Button>
            <Button
              type="button"
              size="md"
              variant="ghost"
              disabled={pending}
              onClick={() => setMode('menu')}
            >
              Batal
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * A thumbtack at 14px — the row's pin STATE. Hand-written SVG for `TabBar`'s reason — "four
 * glyphs is not worth a package, and an icon font would be a second webfont on a page whose
 * first is already Poppins". `aria-hidden`, because the state is decoration next to a title
 * that already reads; the ACTION below carries its own accessible name in the menu. Renamed
 * from `PinIcon` when the lucide action glyph arrived: the state is the adjective, the action
 * is the verb — and `AdminNav` names glyphs after their lucide source.
 */
function PinnedIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M7.5 9.5a4.5 4.5 0 1 1 9 0c0 1.7-1 3-2 3.6-.6.4-1 1-1 1.7v.2h-3v-.2c0-.7-.4-1.3-1-1.7-1-.6-2-1.9-2-3.6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 15v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/*
 * The menu's three action glyphs, inlined rather than imported — `AdminNav`'s collection
 * choice, applied at three. `pin` and `pencil` are **Lucide** (lucide-static 1.42.0, ISC),
 * fetched 2026-09-09 from `unpkg.com/lucide-static@1.42.0/icons/<name>.svg` and copied verbatim
 * — the paths and the root's presentation attributes exactly as published; the only adaptations
 * are JSX spelling (`stroke-width` → `strokeWidth`) and dropping lucide's own `class`, `width`
 * and `height` for our `className` and the 18px size. `trash` is NOT a fetch:
 * `NinaJobActions`' `TrashIcon` is already the repo's delete shape, so this is a verbatim copy
 * of THAT component — one trash can in the app, not two versions of lucide's. `AdminNav`'s
 * footer argument covers why a copy and not a dependency: three glyphs is not worth a package
 * either.
 *
 * Every glyph is 18px in `currentColor` and `aria-hidden` — the accessible name is the
 * `aria-label` on the button, never the picture. `AdminNav`'s arrangement, and
 * `NinaJobActions`' before it.
 */

/** "Pin ke atas" / "Lepas pin" — the thumbtack `PinnedIcon` already wears, at action size. */
function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  )
}

/** "Ganti nama" — the pencil, the standard rename glyph in every Lucide-era app. */
function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

/** "Hapus" — `NinaJobActions`' `TrashIcon` verbatim; see the provenance note above. */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 7.5 7.2 18a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9L17.5 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 11v5M13.5 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
