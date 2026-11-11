/**
 * How many of Nina's photographs the Blob store can hold before the Hobby plan's storage cap gets
 * close. `/admin`'s layout counts them on every full load and shows `PhotoBudgetBanner` while the
 * count is over this number.
 *
 * ── WHY THERE IS A NUMBER AT ALL ────────────────────────────────────────────────────────────
 * The team went back to Hobby on 2026-11-11. Hobby includes 1 GB of Blob storage, and the cap
 * is ACCOUNT-WIDE: `run-insights-photos`, `k3rs-uploads` and `expense-tracking-photos` share it,
 * and going over suspends every store at once for 30 days (2026-10-13 was the rate meters doing
 * exactly that). Storage is the one meter a photo COUNT moves; transfer and operations follow page
 * views, not how many photos exist, and this banner says nothing about them.
 *
 * ── THE DERIVATION (measured 2026-11-11, Vercel API + production DB) ────────────────────────
 *   cap                                       1,000 MB   (decimal GB, the smaller reading)
 *   ceiling at 80% — headroom for the other
 *     apps, run screenshots and orphans          800 MB
 *   everything that is NOT a Nina photo          244 MB
 *     k3rs-uploads                    46.0 MB
 *     expense-tracking-photos         69.7 MB
 *     run-insights-photos minus Nina 128.3 MB   (run photos, screenshots, orphans)
 *   left for Nina's photos                       556 MB
 *   one photo, original + 256 px tile           ~420 kB   (all-time mean 375 kB, Oct 322, Sep
 *                                                          433; tile ~20 kB from the backfill)
 *   556 MB / 420 kB                             ≈ 1,324   → rounded DOWN to 1,300
 *
 * At measurement there were 1,002, so the banner was quiet. An album photo (727 kB mean) costs four
 * chat photos (181 kB); a month of mostly album generations moves the real ceiling down, which is
 * what the 80% is for. Re-measure — store sizes from `GET /v1/storage/stores`, bytes from
 * `SUM(bytes)` over distinct pathnames — before raising this, never instead of.
 */
export const NINA_PHOTO_SAFE_COUNT = 1300

/** Strictly over: AT the safe number is still safe. */
export function isOverPhotoBudget(count: number): boolean {
  return count > NINA_PHOTO_SAFE_COUNT
}
