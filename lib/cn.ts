/**
 * Join class names, dropping anything falsy.
 *
 * Deliberately not `clsx` + `tailwind-merge`: this app's components take a `className` that is
 * applied LAST, so a caller's utility already wins by CSS source order for same-specificity
 * classes. A merge library would buy conflict resolution we do not have a case for, at the cost of
 * a dependency in every client bundle.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
