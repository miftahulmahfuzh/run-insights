'use client'

import * as React from 'react'

import { cn } from '@/lib/cn'
import { CONTROL_CLASS } from '@/components/ui'
import { maskTimeInput, type TimeMaskShape } from '@/lib/review/inputs'

/**
 * A text input over an integer field.
 *
 * **It holds its own string state, and that is the entire point.** A controlled input driven
 * directly off the parsed number cannot be typed into: entering `4:48` passes through `4`, `4:`
 * and `4:4`, and the middle of those is unparseable. A naive implementation either rejects the
 * keystroke or rewrites the field under the cursor — both of which make correcting a split feel
 * broken on exactly the screen whose whole job is careful correction.
 *
 * So the string is local and the number is lifted. Every keystroke re-parses:
 *
 *   parses        → push the value up, clear the local error
 *   does not      → keep the text, mark the field invalid, push nothing
 *
 * The value is never pushed up as `null` on a parse failure. `null` is a legitimate value for most
 * of these fields (a blank cadence cell is normal), so collapsing a typo into `null` would erase
 * a real number silently. See `lib/review/inputs.ts` for the same rule stated from the other side.
 *
 * The external value re-seeds the text only when it stops agreeing with what is typed, so a
 * programmatic change (the partial toggle rewriting a pace) lands without stomping a half-typed
 * entry.
 *
 * ── THE COLON FIELDS ────────────────────────────────────────────────────────────────────────
 * `inputMode="numeric"` gets a digits-only keypad, which has no colon on it — so duration, pace,
 * split time, split pace and time-in-zone were impossible to correct on a phone, on the one screen
 * whose entire purpose is correcting a field. `mask` fixes that by drawing the separator instead of
 * accepting it, and `deferError` keeps the field from going red on the intermediate states a
 * right-to-left mask has to pass through. Both are opt-in: thirteen of this component's eighteen
 * call sites are integer fields where a digits-only keypad was always the right keypad, and they
 * are untouched.
 */

export interface ParsedInputProps<T> {
  value: T
  toText: (value: T) => string
  parse: (text: string) => { value: T; invalid?: true }
  onChange: (value: T) => void
  /** Shown under the control when the text cannot be parsed at all. */
  invalidMessage?: string
  /** A server-side error for this path, which outranks the local parse state. */
  error?: string
  id?: string
  className?: string
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  /**
   * Draw the `:` instead of accepting it. Digits shift in from the right and `maskTimeInput` lays
   * them out, so the separator never has to exist on the keypad. Masking runs BEFORE the parse,
   * which is why `parse` needs no knowledge of it.
   */
  mask?: TimeMaskShape
  /**
   * Hold `invalidMessage` until blur.
   *
   * A right-to-left mask cannot avoid intermediate invalid states — `1:18:36` is reached by typing
   * `1,1,8,3,6` and the fourth keystroke is `11:83` — and refusing that keystroke would make the
   * destination unreachable. So the message waits instead. **The value contract does not change:**
   * an invalid entry is still never pushed up. Only the red text is deferred, and a server-side
   * `error` is never deferred at all, because it did not arrive from the keystroke under the
   * reviewer's thumb.
   */
  deferError?: boolean
  'aria-label'?: string
  ref?: React.Ref<HTMLInputElement>
}

export function ParsedInput<T>({
  value,
  toText,
  parse,
  onChange,
  invalidMessage = 'That does not read as a number.',
  error,
  id,
  className,
  placeholder,
  inputMode = 'numeric',
  mask,
  deferError,
  ref,
  ...rest
}: ParsedInputProps<T>) {
  const [text, setText] = React.useState(() => toText(value))
  const [invalid, setInvalid] = React.useState(false)
  const [lastValue, setLastValue] = React.useState(value)
  const [touched, setTouched] = React.useState(false)
  const errorId = React.useId()
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  /**
   * Re-seeding is done **during render, not in an effect** — React's documented "adjusting state
   * when a prop changes" pattern. An effect would paint the stale text first and correct it on the
   * next commit, which on a text input under a moving cursor is a visible flicker; it would also
   * be a cascading render the linter is right to refuse.
   *
   * The comparison is on the PARSED value, not the raw text, so `4:48` and `04:48` both count as
   * already agreeing with 288 and the reviewer's own spelling survives an unrelated re-render.
   */
  if (!Object.is(lastValue, value)) {
    setLastValue(value)
    const parsed = parse(text)
    if (parsed.invalid || !Object.is(parsed.value, value)) {
      setText(toText(value))
      setInvalid(false)
    }
  }

  /**
   * A masked field re-lays its whole string on every keystroke, so a caret left mid-string edits
   * digits the reviewer is not looking at. Right-to-left entry is the entire gesture here; there is
   * no mid-string edit worth preserving, so the caret is pinned to the end after the DOM has the
   * new value. Only while focused — moving the caret in a field nobody is typing in would be rude.
   */
  React.useEffect(() => {
    if (!mask) return
    const element = inputRef.current
    if (!element || document.activeElement !== element) return
    const end = element.value.length
    element.setSelectionRange(end, end)
  }, [mask, text])

  const message = error ?? (invalid && (!deferError || touched) ? invalidMessage : undefined)

  return (
    <>
      <input
        {...rest}
        ref={(node) => {
          inputRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        onFocus={() => setTouched(false)}
        onBlur={() => setTouched(true)}
        onChange={(event) => {
          const next = mask ? maskTimeInput(event.target.value, mask) : event.target.value
          setText(next)
          const parsed = parse(next)
          setInvalid(Boolean(parsed.invalid))
          if (!parsed.invalid) onChange(parsed.value)
        }}
        className={cn(CONTROL_CLASS, className)}
      />
      {message && (
        <p id={errorId} className="mt-1.5 text-[11px] font-semibold text-red">
          {message}
        </p>
      )}
    </>
  )
}
