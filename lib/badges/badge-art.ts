/**
 * GENERATED FILE — do not edit by hand.
 *
 *   python3 tools/make_badge_assets.py
 *
 * Source art is `assets/badges/<key>.png`; these are its derivatives.
 * Every entry here is generated against style v2.
 *
 * This is a TOTAL `Record<BadgeKey, BadgeArt>` on purpose. A key added to
 * BADGE_CATALOG with no art fails `npm run typecheck` immediately, in the same
 * session, before anything ships — a far stronger guarantee than a check script
 * nobody runs, and it costs one keyword. The fix for that failure is to generate
 * the art, not to reach for `Partial<>`.
 *
 * Filenames carry the first 8 hex of the master's SHA-256. Regenerating an image
 * changes its bytes, its hash and its filename, so every cache misses correctly
 * and `next.config.ts` may serve /badges/* as `immutable`.
 *
 * Plain data. No `import 'server-only'` — the shelf is a plain component and this
 * holds no secret.
 */
import type { BadgeKey } from './types'

export interface BadgeArt {
  /** 768×768 WebP for a badge panel. */
  src: string
  /** 192×192 WebP for the shelf mark, drawn at 56 css px. */
  small: string
  /** SHA-256 of `assets/badges/<key>.png`, the approved master. */
  sha256: string
  /**
   * The patch's own twill, `#rrggbb`, as the mean of the master's outer 5% frame.
   * A tile can paint its own background with this so the square art sits inside a
   * rounded field with no seam and no crop. Sampled from the master, never chosen;
   * `npm run badges:check` recomputes it exactly as it recomputes `sha256`.
   */
  twill: string
  /** The style.md version this image was generated against. */
  styleVersion: string
}

/** Intrinsic pixel sizes, so a consumer never has to restate them. */
export const BADGE_ART_SIZE = 768
export const BADGE_ART_SMALL_SIZE = 192

export const BADGE_ART: Record<BadgeKey, BadgeArt> = {
  early_bird: {
    src: '/badges/early_bird.5cb505c5.webp',
    small: '/badges/early_bird.5cb505c5.sm.webp',
    sha256: '5cb505c59dac7c7071abcfb15e4b57dfc809e0b3e5f9d1035f4459489b55a094',
    twill: '#0d1b31',
    styleVersion: 'v2',
  },
  late_start: {
    src: '/badges/late_start.bfca7354.webp',
    small: '/badges/late_start.bfca7354.sm.webp',
    sha256: 'bfca7354d49e72f2ae5e6e941e03ac89db56e66bf4fa42c330974183672b9222',
    twill: '#0f1c35',
    styleVersion: 'v2',
  },
  self_reward: {
    src: '/badges/self_reward.7c888e64.webp',
    small: '/badges/self_reward.7c888e64.sm.webp',
    sha256: '7c888e643c02b7496751bc96dc51c35055629f517053bc8fb3ae0e5db9180293',
    twill: '#0f1d34',
    styleVersion: 'v2',
  },
  negative_split: {
    src: '/badges/negative_split.e61a7a1a.webp',
    small: '/badges/negative_split.e61a7a1a.sm.webp',
    sha256: 'e61a7a1af2d9ad18283b3b0699dfa72d41bd2ba7c06cbfff52eef8270a3a18bb',
    twill: '#0f1b30',
    styleVersion: 'v2',
  },
  metronome: {
    src: '/badges/metronome.35ff9b83.webp',
    small: '/badges/metronome.35ff9b83.sm.webp',
    sha256: '35ff9b831cc6acf77e0e78be9c32297699bc0aa0c4b080715911c61983a895c9',
    twill: '#131f35',
    styleVersion: 'v2',
  },
  fast_start_fool: {
    src: '/badges/fast_start_fool.9fd3511f.webp',
    small: '/badges/fast_start_fool.9fd3511f.sm.webp',
    sha256: '9fd3511f6077b4a620ff4f589a19b6df0c1718195cd7b52c08eb9c86d2470077',
    twill: '#132037',
    styleVersion: 'v2',
  },
  redline_republic: {
    src: '/badges/redline_republic.11356ef8.webp',
    small: '/badges/redline_republic.11356ef8.sm.webp',
    sha256: '11356ef8c02b5f0455663faf15471dff61c85d23b0ba0dc8c2b4ff573f062e9b',
    twill: '#0e1b30',
    styleVersion: 'v2',
  },
  sandbagger: {
    src: '/badges/sandbagger.e73b2161.webp',
    small: '/badges/sandbagger.e73b2161.sm.webp',
    sha256: 'e73b2161e9090166ee6d5b50f0a73ba3670790140dc58f3c57c2045fb12edade',
    twill: '#14233b',
    styleVersion: 'v2',
  },
  cadence_collapse: {
    src: '/badges/cadence_collapse.064b2c94.webp',
    small: '/badges/cadence_collapse.064b2c94.sm.webp',
    sha256: '064b2c94619f3c139e10d2f3907a55b94d67574d8fc19886d5a4a385b0954ce0',
    twill: '#101e35',
    styleVersion: 'v2',
  },
  warmup_who: {
    src: '/badges/warmup_who.a967d10d.webp',
    small: '/badges/warmup_who.a967d10d.sm.webp',
    sha256: 'a967d10d97e32c737c217bd6390d89c6bafa5d899c7712e130100b2a19b10003',
    twill: '#132037',
    styleVersion: 'v2',
  },
  groundhog_day: {
    src: '/badges/groundhog_day.b8747cf7.webp',
    small: '/badges/groundhog_day.b8747cf7.sm.webp',
    sha256: 'b8747cf70ba0639f6ea24877090767002ac6fdef624fecc56f8c2313eb0f4f28',
    twill: '#101e35',
    styleVersion: 'v2',
  },
  tourist: {
    src: '/badges/tourist.2a9a41bf.webp',
    small: '/badges/tourist.2a9a41bf.sm.webp',
    sha256: '2a9a41bf03563fe48708fd70684a0e1434efb6e8be5bb7b178e691b020b2761c',
    twill: '#111e36',
    styleVersion: 'v2',
  },
  century_club: {
    src: '/badges/century_club.a81a5da7.webp',
    small: '/badges/century_club.a81a5da7.sm.webp',
    sha256: 'a81a5da7e9f68820f9e093ff0f4521230ba6f93b17af5db16134445f350b57cd',
    twill: '#162338',
    styleVersion: 'v2',
  },
  double_century: {
    src: '/badges/double_century.38a22314.webp',
    small: '/badges/double_century.38a22314.sm.webp',
    sha256: '38a2231481b5b1f0ecc26b5524aa82ff6b4ff44e6d8b87d782298a681ecab52c',
    twill: '#0f1b30',
    styleVersion: 'v2',
  },
  half_ish: {
    src: '/badges/half_ish.e2fd8395.webp',
    small: '/badges/half_ish.e2fd8395.sm.webp',
    sha256: 'e2fd8395cfc93a018462a8b83152014478c1c25f4ee4ff639d89c2ec30c0cfcf',
    twill: '#101e36',
    styleVersion: 'v2',
  },
  sweat_equity: {
    src: '/badges/sweat_equity.1a3c6cee.webp',
    small: '/badges/sweat_equity.1a3c6cee.sm.webp',
    sha256: '1a3c6cee2e43db0717d2b933bdf9a519faa3dea87f09233b4f8c6aec2e571f81',
    twill: '#0d1c32',
    styleVersion: 'v2',
  },
  new_ceiling: {
    src: '/badges/new_ceiling.7a7cb756.webp',
    small: '/badges/new_ceiling.7a7cb756.sm.webp',
    sha256: '7a7cb756f4c58bf095fce8851d4ad87fe94d17e3ea3e2ee405a987e05be06d6f',
    twill: '#0f1d35',
    styleVersion: 'v2',
  },
  consistency_gremlin: {
    src: '/badges/consistency_gremlin.da3ad9f0.webp',
    small: '/badges/consistency_gremlin.da3ad9f0.sm.webp',
    sha256: 'da3ad9f0d44d49d73ee813f2cb6ea71cdf2e85bf7417cc7d191c32347f9b81e9',
    twill: '#141f34',
    styleVersion: 'v2',
  },
  dawn_patrol: {
    src: '/badges/dawn_patrol.110655f7.webp',
    small: '/badges/dawn_patrol.110655f7.sm.webp',
    sha256: '110655f7712fd04640525dea02b50a06b0cf1a45df6e060e906cb7cf3e68acaa',
    twill: '#0f1d34',
    styleVersion: 'v2',
  },
  long_way_home: {
    src: '/badges/long_way_home.0f4e123a.webp',
    small: '/badges/long_way_home.0f4e123a.sm.webp',
    sha256: '0f4e123abaad31f111fc78b1c352f69469d1aa2ea125e36d615491833cad1771',
    twill: '#0f1c35',
    styleVersion: 'v2',
  },
  two_a_days: {
    src: '/badges/two_a_days.dceedf4d.webp',
    small: '/badges/two_a_days.dceedf4d.sm.webp',
    sha256: 'dceedf4d7753a65de269e467a33a543f805f556fb9e787826e4cda8c255feba1',
    twill: '#121f35',
    styleVersion: 'v2',
  },
  boring_excellence: {
    src: '/badges/boring_excellence.d15437ac.webp',
    small: '/badges/boring_excellence.d15437ac.sm.webp',
    sha256: 'd15437ac4b4d9b4d4991cb943dec3a0fd1efecd01c0cf9d71d027bc037ec0f09',
    twill: '#101e35',
    styleVersion: 'v2',
  },
}
