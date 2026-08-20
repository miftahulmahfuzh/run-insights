/**
 * Age, derived — never stored.
 *
 * THE BUG THIS AVOIDS. An app that stores `age: 30` on 2026-08-20 is correct on that date and
 * wrong on every other date it is read. The runner turns 31 within the year. If `age` were a
 * column, either nobody updates it and every Tanaka estimate from that day forward silently uses
 * last year's age — making an already-imperfect formula *more* wrong for no reason — or something
 * has to remember to update it, which means a cron job whose only purpose is to fix a bug that
 * storing the right thing would have made impossible.
 *
 * `profiles.birth_year` is stable. It never needs updating, and "how old are you right now" becomes
 * a pure function of it and the wall clock.
 *
 * Onboarding still ASKS for age, because "I'm 30" is what a human types. The conversion happens
 * once, at the Server Action boundary — `lib/profile/schema.ts`'s `toProfileWrite()` — and never
 * round-trips back into a form.
 */

/**
 * Age in whole years. Takes `now` as a parameter, defaulted to `new Date()`, so tests can pin a
 * date without mocking global time.
 *
 * Whole-year subtraction is all the input supports: onboarding asks for a YEAR, not a birthdate, so
 * there is no month or day to compare against. Computing an "exact" age from a birth year would be
 * false precision — the answer would be wrong for everyone who has not yet had their birthday this
 * year, and the app would have no way to know which half that is.
 *
 * Timezone: roadmap D6 fixes the app to Asia/Jakarta, but a year boundary is the only thing this
 * function reads, and the only day on which Jakarta and UTC disagree about the year is 1 January
 * before 07:00 WIB. The error is at most one year, for at most seven hours, on the estimate branch
 * of an HRmax resolution that is already labelled `estimated`. Not worth a date library.
 */
export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear
}

/**
 * The inverse, for pre-filling the profile form. Same one-way relationship as onboarding, just read
 * instead of written: `/me` always shows the *current*, freshly computed age, so nothing ever goes
 * stale and re-saving the form in the same year is idempotent.
 */
export function birthYearFromAge(age: number, now: Date = new Date()): number {
  return now.getFullYear() - age
}
