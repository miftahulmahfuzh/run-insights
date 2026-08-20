'use client'

import * as React from 'react'

import { cn } from '@/lib/cn'

interface FieldContextValue {
  inputId: string
  describedBy: string | undefined
  invalid: boolean
}

const FieldContext = React.createContext<FieldContextValue | null>(null)

export interface FieldProps {
  label: string
  hint?: string
  /** Present = the field is in an error state; the string renders below it. */
  error?: string
  /** Right-aligned unit label inside the control — 'cm', 'kg', 'bpm'. */
  suffix?: string
  className?: string
  children: React.ReactNode
}

/**
 * Owns the label / hint / error / `aria-describedby` / `id` wiring so the controls do not have to.
 * `Input` reads it from context, which means a feature cannot accidentally ship an unlabelled
 * input, or one whose error text is invisible to a screen reader.
 */
export function Field({ label, hint, error, suffix, className, children }: FieldProps) {
  const base = React.useId()
  const inputId = `${base}-input`
  const hintId = hint ? `${base}-hint` : undefined
  const errorId = error ? `${base}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const value = React.useMemo<FieldContextValue>(
    () => ({ inputId, describedBy, invalid: Boolean(error) }),
    [inputId, describedBy, error],
  )

  return (
    <FieldContext.Provider value={value}>
      <div className={className}>
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-semibold tracking-[0.02em] text-ink-2"
        >
          {label}
        </label>

        <div className="relative">
          {children}
          {suffix && (
            <span
              className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[13px] font-medium text-ink-3"
              aria-hidden="true"
            >
              {suffix}
            </span>
          )}
        </div>

        {/* Hint and error never show together: an error supersedes the instruction that failed to
            prevent it. */}
        {hint && !error && (
          <p id={hintId} className="mt-1.5 text-[11px] font-medium text-ink-3">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1.5 text-[11px] font-semibold text-red">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

/**
 * The control shell. `bg-paper-2` on a white card, because the v2 design puts no borders on
 * surfaces — a well is a tint, not an outline.
 *
 * `text-base` is not a taste call: Safari zooms the viewport when you focus an input under 16px,
 * and the design brief makes that one of the iOS rules that beats the design. `app/globals.css`
 * enforces it globally too; stating it here keeps the class list honest about why.
 */
export const CONTROL_CLASS =
  'h-[52px] w-full rounded-field bg-paper-2 px-4 text-base font-semibold tabular-nums text-ink ' +
  'outline-none placeholder:font-medium placeholder:text-ink-3 ' +
  'focus-visible:ring-2 focus-visible:ring-accent aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>
}

export function Input({ className, id, ...rest }: InputProps) {
  const field = React.useContext(FieldContext)
  return (
    <input
      id={id ?? field?.inputId}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      aria-invalid={rest['aria-invalid'] ?? (field?.invalid || undefined)}
      className={cn(CONTROL_CLASS, className)}
      {...rest}
    />
  )
}

/**
 * A number input that does not fight the phone.
 *
 * `inputMode="numeric"` brings up the digit keypad; `type="text"` rather than `type="number"`
 * because Safari's number input silently discards a value that fails its own parse, drops the
 * decimal point on some locales, and scroll-wheels itself on desktop. Validation belongs to
 * `lib/profile/schema.ts`, which sees the raw string and can say something useful about it.
 */
export function NumberInput({ decimal = false, ...rest }: InputProps & { decimal?: boolean }) {
  return (
    <Input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      enterKeyHint="next"
      {...rest}
    />
  )
}
