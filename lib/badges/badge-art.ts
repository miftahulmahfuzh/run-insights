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
  /** 768×576 WebP for a badge panel — the master's own 4:3. */
  src: string
  /** 192×192 WebP for the shelf mark, drawn at 56 css px. A CENTRE
   *  SQUARE CROP of the master, not a squash of it: the shelf tile is square,
   *  and the crop restores exactly the patch fraction the square masters had. */
  small: string
  /** SHA-256 of `assets/badges/<key>.png`, the approved master. */
  sha256: string
  /**
   * The patch's own twill, `#rrggbb`, as the mean of the master's outer 5% frame.
   * A tile can paint its own background with this so the square art sits inside a
   * rounded field with no seam and no crop. Sampled from the master, never chosen;
   * `npm run badges:check` recomputes it exactly as it recomputes `sha256`.
   *
   * `BadgeShelf` still needs this: its tile is square and `small` is square, so
   * the rounded field around a 56px mark is still painted rather than drawn.
   * `BadgeDialog` no longer does — `src` is the band's own 4:3 and fills it — but
   * it keeps painting the band behind the image anyway, so a slow decode shows
   * cloth rather than card.
   */
  twill: string
  /** The style.md version this image was generated against. */
  styleVersion: string
}

/** Intrinsic pixel sizes, so a consumer never has to restate them. */
export const BADGE_ART_WIDTH = 768
export const BADGE_ART_HEIGHT = 576
export const BADGE_ART_SMALL_SIZE = 192

export const BADGE_ART: Record<BadgeKey, BadgeArt> = {
  early_bird: {
    src: '/badges/early_bird.9703edee.webp',
    small: '/badges/early_bird.9703edee.sm.webp',
    sha256: '9703edee31a5abe10aa3f81fffc485f428f4ecc9b9a738c76cdb8635d4b7c057',
    twill: '#0a152c',
    styleVersion: 'v2',
  },
  late_start: {
    src: '/badges/late_start.510b5c02.webp',
    small: '/badges/late_start.510b5c02.sm.webp',
    sha256: '510b5c023a3da80080b39a3ad7a98c4bf79165d5ac84d897fc60db7e87142417',
    twill: '#0e1a33',
    styleVersion: 'v2',
  },
  self_reward: {
    src: '/badges/self_reward.2234a58d.webp',
    small: '/badges/self_reward.2234a58d.sm.webp',
    sha256: '2234a58dd83e348c1da2a3ffeab19fc416436ffe7df41094b77ff81dc0277256',
    twill: '#0f1b35',
    styleVersion: 'v2',
  },
  negative_split: {
    src: '/badges/negative_split.9dbc8bb2.webp',
    small: '/badges/negative_split.9dbc8bb2.sm.webp',
    sha256: '9dbc8bb221220e281295a4eec63d5fc7b80c2d14c18902a82f63c8cf9459d4c6',
    twill: '#0d182d',
    styleVersion: 'v2',
  },
  metronome: {
    src: '/badges/metronome.7d7c8e76.webp',
    small: '/badges/metronome.7d7c8e76.sm.webp',
    sha256: '7d7c8e76a56bd2809e3970a43b51d2b4c67849ee1625ad0501a59d9d52e104a1',
    twill: '#101b32',
    styleVersion: 'v2',
  },
  fast_start_fool: {
    src: '/badges/fast_start_fool.abc05269.webp',
    small: '/badges/fast_start_fool.abc05269.sm.webp',
    sha256: 'abc0526963f5f08ba3f0ef2fa2879929e9d0bba5e83fd6bfdb5ab87e5dc2ace5',
    twill: '#0e1a34',
    styleVersion: 'v2',
  },
  redline_republic: {
    src: '/badges/redline_republic.129bfc37.webp',
    small: '/badges/redline_republic.129bfc37.sm.webp',
    sha256: '129bfc3781b7f5db6cc036c9099e41adc9053e7ccf6dd9ec54344eaef09f4e59',
    twill: '#0e1930',
    styleVersion: 'v2',
  },
  sandbagger: {
    src: '/badges/sandbagger.1aee3df0.webp',
    small: '/badges/sandbagger.1aee3df0.sm.webp',
    sha256: '1aee3df0276f7da78d1fcd8045aa844823bf49d18f01ad0679afec60c81e805d',
    twill: '#0e1c37',
    styleVersion: 'v2',
  },
  cadence_collapse: {
    src: '/badges/cadence_collapse.e3b4efeb.webp',
    small: '/badges/cadence_collapse.e3b4efeb.sm.webp',
    sha256: 'e3b4efebbc2e7a5b0fef0a00926110166692f870bdec8db028ad9f93418b7d57',
    twill: '#0f1b35',
    styleVersion: 'v2',
  },
  warmup_who: {
    src: '/badges/warmup_who.a5584b0e.webp',
    small: '/badges/warmup_who.a5584b0e.sm.webp',
    sha256: 'a5584b0e3b6f4b659780920236775210dbd1921ac63f21b46efefd00b8f61fc1',
    twill: '#0f1a33',
    styleVersion: 'v2',
  },
  groundhog_day: {
    src: '/badges/groundhog_day.2211bc4d.webp',
    small: '/badges/groundhog_day.2211bc4d.sm.webp',
    sha256: '2211bc4d944566fdac4a638ed2825c877bc4660ee9b0fab3179c7140594998cd',
    twill: '#0e1b33',
    styleVersion: 'v2',
  },
  tourist: {
    src: '/badges/tourist.38ef252a.webp',
    small: '/badges/tourist.38ef252a.sm.webp',
    sha256: '38ef252ac98ebf00e861d9501020d66de3c938a0a59acb37e8f86ead512ff13d',
    twill: '#0e1a33',
    styleVersion: 'v2',
  },
  century_club: {
    src: '/badges/century_club.c607fd25.webp',
    small: '/badges/century_club.c607fd25.sm.webp',
    sha256: 'c607fd255f19b54a83cc35ef6e08ba101600cafc2d97e6b2194f2c465925a044',
    twill: '#0e1b32',
    styleVersion: 'v2',
  },
  double_century: {
    src: '/badges/double_century.0b4846a6.webp',
    small: '/badges/double_century.0b4846a6.sm.webp',
    sha256: '0b4846a68b907441d81e1b5066e8f751858251d20ac032695ea74f1492eef924',
    twill: '#0d172e',
    styleVersion: 'v2',
  },
  half_ish: {
    src: '/badges/half_ish.1d34671f.webp',
    small: '/badges/half_ish.1d34671f.sm.webp',
    sha256: '1d34671f141331a7c01f16e853c115fab87c53df4ef6c11c375e453700e8d387',
    twill: '#0e1b34',
    styleVersion: 'v2',
  },
  sweat_equity: {
    src: '/badges/sweat_equity.03f2d915.webp',
    small: '/badges/sweat_equity.03f2d915.sm.webp',
    sha256: '03f2d91592a011cd47f4480faa646b486a06ed8a218a8aa4eb63476db7274868',
    twill: '#0a1831',
    styleVersion: 'v2',
  },
  new_ceiling: {
    src: '/badges/new_ceiling.c25c6feb.webp',
    small: '/badges/new_ceiling.c25c6feb.sm.webp',
    sha256: 'c25c6febfef5c9dd1b608ba123def85db2d2fc11a7c5c1cce5e41ba0cccf35e3',
    twill: '#0e1b35',
    styleVersion: 'v2',
  },
  consistency_gremlin: {
    src: '/badges/consistency_gremlin.83f4c6d8.webp',
    small: '/badges/consistency_gremlin.83f4c6d8.sm.webp',
    sha256: '83f4c6d8af8f5da36f17209c8c9f59a42fc5d63d8c12bd130646577abec88a4c',
    twill: '#121b33',
    styleVersion: 'v2',
  },
  dawn_patrol: {
    src: '/badges/dawn_patrol.f4796897.webp',
    small: '/badges/dawn_patrol.f4796897.sm.webp',
    sha256: 'f4796897ca79d88b6f67944de3a32e63b9fe76265e7f4fe2f6107e49007e1cb8',
    twill: '#0f1c35',
    styleVersion: 'v2',
  },
  long_way_home: {
    src: '/badges/long_way_home.9ae94209.webp',
    small: '/badges/long_way_home.9ae94209.sm.webp',
    sha256: '9ae942094b18ebd0641603a357f3b104f351252ef41af7bf03b61e92e9a79c02',
    twill: '#0d1833',
    styleVersion: 'v2',
  },
  two_a_days: {
    src: '/badges/two_a_days.cf5b11d4.webp',
    small: '/badges/two_a_days.cf5b11d4.sm.webp',
    sha256: 'cf5b11d44e203ead7f0349bd2969f22dd5850d57c453848b2c63f4782a9e5065',
    twill: '#111d36',
    styleVersion: 'v2',
  },
  boring_excellence: {
    src: '/badges/boring_excellence.fbda7e82.webp',
    small: '/badges/boring_excellence.fbda7e82.sm.webp',
    sha256: 'fbda7e821bf28b8629edef33993977be1984575073ae76661c0c90f4c03d23b6',
    twill: '#0e1b33',
    styleVersion: 'v2',
  },
}
