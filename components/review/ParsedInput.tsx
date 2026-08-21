'use client'

import * as React from 'react'

import { cn } from '@/lib/cn'
import { CONTROL_CLASS } from '@/components/ui'

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
  ref,
  ...rest
}: ParsedInputProps<T>) {
  const [text, setText] = React.useState(() => toText(value))
  const [invalid, setInvalid] = React.useState(false)
  const [lastValue, setLastValue] = React.useState(value)
  const errorId = React.useId()

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

  const message = error ?? (invalid ? invalidMessage : undefined)

  return (
    <>
      <input
        {...rest}
        ref={ref}
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        onChange={(event) => {
          const next = event.target.value
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
