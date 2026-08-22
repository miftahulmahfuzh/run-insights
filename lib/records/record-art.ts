/**
 * GENERATED FILE — do not edit by hand.
 *
 *   python3 tools/make_badge_assets.py --deck records
 *
 * Source art is `assets/records/<key>.png`; these are its derivatives.
 * Every entry here is generated against style v2.
 *
 * This is a TOTAL `Record<RecordKey, RecordArt>` on purpose. A key added to
 * RECORD_CATALOG with no art fails `npm run typecheck` immediately, in the same
 * session, before anything ships — a far stronger guarantee than a check script
 * nobody runs, and it costs one keyword. The fix for that failure is to generate
 * the art, not to reach for `Partial<>`.
 *
 * Filenames carry the first 8 hex of the master's SHA-256. Regenerating an image
 * changes its bytes, its hash and its filename, so every cache misses correctly
 * and `next.config.ts` may serve /records/* as `immutable`.
 *
 * Plain data. No `import 'server-only'` — the shelf is a plain component and this
 * holds no secret.
 */
import type { RecordKey } from './types'

export interface RecordArt {
  /** 768×576 WebP for a badge panel — the master's own 4:3. */
  src: string
  /** 192×192 WebP, a CENTRE SQUARE CROP of the master rather than a squash
   *  of it — a squashed pentagon is a different silhouette, and the silhouette is
   *  what tells a record patch from a badge at shelf size.
   *
   *  GENERATED EVEN IF NOTHING DRAWS IT YET. F25 ships this whether or not F26's
   *  one-line record row shows a thumbnail, because it is free at generation time
   *  and expensive afterwards: adding it later means regenerating every master's
   *  derivatives, which changes every content hash and every shipped filename. */
  small: string
  /** SHA-256 of `assets/records/<key>.png`, the approved master. */
  sha256: string
  /**
   * The patch's own twill, `#rrggbb`, as the mean of the master's outer 5% frame.
   * Sampled from the master, never chosen; `npm run badges:check` recomputes it
   * exactly as it recomputes `sha256`.
   *
   * Use it to paint the field behind the art, so a slow decode shows cloth rather
   * than card, and so a square consumer of `small` gets a seamless surround. Both
   * decks are one bolt of cloth, but these values are per patch and are NOT
   * interchangeable with the badge deck's — the raking light makes each master's
   * own frame its own colour.
   */
  twill: string
  /** The style.md version this image was generated against. */
  styleVersion: string
}

/** Intrinsic pixel sizes, so a consumer never has to restate them. */
export const RECORD_ART_WIDTH = 768
export const RECORD_ART_HEIGHT = 576
export const RECORD_ART_SMALL_SIZE = 192

export const RECORD_ART: Record<RecordKey, RecordArt> = {
  longest_distance: {
    src: '/records/longest_distance.92060449.webp',
    small: '/records/longest_distance.92060449.sm.webp',
    sha256: '92060449289ddc7005dc1da6f4ac50fef44ee661131167ef8257b6d827319911',
    twill: '#0f1832',
    styleVersion: 'v2',
  },
  longest_duration: {
    src: '/records/longest_duration.f10ce37c.webp',
    small: '/records/longest_duration.f10ce37c.sm.webp',
    sha256: 'f10ce37c08c3568ca17abe187b80ddab38b7b320b21f127451e19b3a2f736aab',
    twill: '#0e162f',
    styleVersion: 'v2',
  },
  fastest_pace_5k: {
    src: '/records/fastest_pace_5k.e43cbeb1.webp',
    small: '/records/fastest_pace_5k.e43cbeb1.sm.webp',
    sha256: 'e43cbeb151a7506ea9033c4f9eca64c2a59a41d38a37e3683bf5a7a37d14311f',
    twill: '#0c152c',
    styleVersion: 'v2',
  },
  fastest_pace_10k: {
    src: '/records/fastest_pace_10k.b04ae79f.webp',
    small: '/records/fastest_pace_10k.b04ae79f.sm.webp',
    sha256: 'b04ae79f12116f6cabf1add2c2897f58cf5db670169eaed6b0aa5a9c175ea566',
    twill: '#0c152b',
    styleVersion: 'v2',
  },
  fastest_km_split: {
    src: '/records/fastest_km_split.d934d72b.webp',
    small: '/records/fastest_km_split.d934d72b.sm.webp',
    sha256: 'd934d72be893c99e9658b98bacd9466c030888cd0bb7dccc112981cee8945182',
    twill: '#101a32',
    styleVersion: 'v2',
  },
  most_kcal: {
    src: '/records/most_kcal.b719a89d.webp',
    small: '/records/most_kcal.b719a89d.sm.webp',
    sha256: 'b719a89d9408729b24227e89d33146807dcacb164ee87cc78c5af7a9392cbb6e',
    twill: '#0f1932',
    styleVersion: 'v2',
  },
  most_elevation: {
    src: '/records/most_elevation.7a75f8c1.webp',
    small: '/records/most_elevation.7a75f8c1.sm.webp',
    sha256: '7a75f8c13ab314b9e097da3f456cf9949dffcd18307cb796b24ffbf46ee2b28d',
    twill: '#0d1832',
    styleVersion: 'v2',
  },
  highest_cadence: {
    src: '/records/highest_cadence.3d617c9e.webp',
    small: '/records/highest_cadence.3d617c9e.sm.webp',
    sha256: '3d617c9ebebca031fbe850a69d278a8b2c42a0f7a4e5471be78966f026caaf15',
    twill: '#0c172f',
    styleVersion: 'v2',
  },
  highest_max_hr: {
    src: '/records/highest_max_hr.0db2a762.webp',
    small: '/records/highest_max_hr.0db2a762.sm.webp',
    sha256: '0db2a7627ae316e00a7bb28fb9c41914360341ca77f9052ba0130880f7725285',
    twill: '#0a1225',
    styleVersion: 'v2',
  },
  best_paced_run: {
    src: '/records/best_paced_run.03ea81b4.webp',
    small: '/records/best_paced_run.03ea81b4.sm.webp',
    sha256: '03ea81b481e5b47931580400c9fe7b1bc48fb482ecd23d4fe5d6e28a2689aef2',
    twill: '#111b35',
    styleVersion: 'v2',
  },
}
