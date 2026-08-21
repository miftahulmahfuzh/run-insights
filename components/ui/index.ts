/**
 * The UI barrel. Screens import from `@/components/ui`; only the components themselves import each
 * other by path.
 *
 * The design brief names the primitive set (`Button`, `Card`, `Sheet`, `Field`, `Stat`, `ZoneBar`,
 * `SplitsTable`, `Flag`, `EmptyState`, `Toast`, `TabBar`, …). F01/F02/F05 shipped the first five;
 * **F08 adds the run-domain and chrome half** — `ZoneBar`, `SplitsTable`, `Flag`, `EmptyState`,
 * `Chip`, `TabBar`, `AppShell`. `Toast` has no caller yet and is not written on spec.
 *
 * Note the two `SplitsTable`s and the two `ZoneBar`s in this repo, which is deliberate and not a
 * duplication to collapse: `components/review/*` are F05's **editable** controls (a sheet per row, a
 * draft state, correction chips) and these are F08's **read-only** presentations of committed data.
 * Merging them would put a review-only concern (`editedPaths`, `onChange`) into the run detail page
 * and a display-only concern (R-30's pace bar) into the review screen.
 */

export { AppShell, ScreenHeader } from './AppShell'
export { Button, ButtonLink, LoadingDots, buttonClasses } from './Button'
export type { ButtonProps, ButtonLinkProps, ButtonSize, ButtonVariant } from './Button'
export { Card, Eyebrow, Stat } from './Card'
export { Chip, chipClasses, CHIP_CLASS } from './Chip'
export { EmptySlot, EmptyState } from './EmptyState'
export { CONTROL_CLASS, Field, Input, NumberInput } from './Field'
export type { FieldProps, InputProps } from './Field'
export { Flag, FlagList } from './Flag'
export { SplitsTable } from './SplitsTable'
export { TabBar } from './TabBar'
export { ZoneBar } from './ZoneBar'
