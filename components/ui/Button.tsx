import type * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/cn'

/*
 * Deliberately NOT marked 'use client'. Nothing here uses a hook or an effect, so the module
 * compiles into whichever graph imports it: a client screen gets an interactive button, and F11's
 * public share page gets a `ButtonLink` with no React shipped at all.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
/** `lg` = 52px, the design's normal button. `md` = 44px — the iOS minimum tap target, never less. */
export type ButtonSize = 'md' | 'lg'

export interface ButtonBaseProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  leadingIcon?: React.ReactNode
}

export interface ButtonProps
  extends ButtonBaseProps, Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  /** Disables the button, keeps its exact width, swaps the label for pulsing dots. */
  loading?: boolean
}

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap ' +
  'rounded-field text-[15px] font-semibold transition-[opacity,transform] active:scale-[0.985] ' +
  'disabled:pointer-events-none disabled:opacity-50'

const SIZES: Record<ButtonSize, string> = {
  md: 'h-11 px-4',
  lg: 'h-[52px] px-5',
}

/*
 * The v2 design has no borders on surfaces — a raised thing is a tinted fill or a soft shadow. So
 * `primary` is a solid ink slab rather than an outline, `secondary` is a tint of the page, and
 * `ghost` is text.
 *
 * `bg-ink text-card` rather than `bg-accent text-white`: the cyan accent is bright enough that
 * white type on it lands near 2:1, well under WCAG's 4.5:1. Ink-on-card is ~14:1 and inverts
 * correctly in dark mode, where `--ink` is near-white and `--card` is near-navy. The accent earns
 * its keep on labels and links, where it sits on paper.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-card',
  secondary: 'bg-paper-2 text-ink',
  ghost: 'bg-transparent text-ink-2',
  destructive: 'bg-transparent text-red',
}

/** Exported so a non-`<button>` element can borrow the look. Prefer `ButtonLink`. */
export function buttonClasses(o: ButtonBaseProps = {}): string {
  const { variant = 'primary', size = 'lg', fullWidth = false } = o
  return cn(BASE, SIZES[size], VARIANTS[variant], fullWidth && 'w-full')
}

/**
 * Three dots pulsing out of phase, in `currentColor`, so it works on ink and on paper without a
 * variant. Not a spinner: a spinner reads as "the app is thinking about itself", three dots read as
 * "your thing is being worked on".
 */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-hidden="true">
      <span className="size-1 [animation:ri-pulse_1.1s_ease-in-out_infinite] rounded-full bg-current" />
      <span className="size-1 [animation:ri-pulse_1.1s_ease-in-out_0.18s_infinite] rounded-full bg-current" />
      <span className="size-1 [animation:ri-pulse_1.1s_ease-in-out_0.36s_infinite] rounded-full bg-current" />
    </span>
  )
}

export function Button({
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  loading = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // Defaults to "button" on purpose: an unlabelled <button> inside a <form> submits it, which
      // has surprised every codebase that let the platform default stand. Pass type="submit".
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        buttonClasses({ variant, size, fullWidth }),
        loading && 'opacity-85',
        className,
      )}
      {...rest}
    >
      {/* The label keeps its box while loading, so the button never changes size. */}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {leadingIcon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <LoadingDots />
        </span>
      )}
    </button>
  )
}

export interface ButtonLinkProps
  extends ButtonBaseProps, Omit<React.ComponentProps<typeof Link>, 'className'> {
  className?: string
}

export function ButtonLink({
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  leadingIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={cn(buttonClasses({ variant, size, fullWidth }), className)} {...rest}>
      {leadingIcon}
      {children}
    </Link>
  )
}
