/**
 * Writes `public/og-default.png` — the ONE preview image every share link gets (F11 §3.6).
 *
 * ── WHY THIS IS A COMMITTED FILE AND NOT AN `opengraph-image.tsx` ──────────────────────────────
 * Because Meta caches a scraped preview on its own CDN for days, beyond the reach of
 * `revokeShareLink`. A per-run image burning distance, pace and heart rate into a bitmap would put
 * those numbers somewhere revocation cannot follow — the same category of mistake as a permanent
 * blob URL, with the added charm of being served by a company we cannot ask. One flat, branded,
 * numberless thumbnail for every link, forever.
 *
 * ── WHY A SCRIPT AND NOT A HAND-DRAWN ASSET ────────────────────────────────────────────────────
 * Nothing in the pinned stack draws images (roadmap §3), so this writes the PNG bytes directly:
 * raw RGB rows, one zlib deflate, three chunks with CRCs. It is reproducible — re-run it after a
 * palette change and the file follows the design tokens instead of drifting from them — and it
 * pulls in no dependency to do it.
 *
 *   node scripts/gen-og-default.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const W = 1200
const H = 630

// docs/design/tokens.css, light scheme. --paper, --card, --accent, --ink, and the five HR zones.
const PAPER = [0xc9, 0xe9, 0xfb]
const CARD = [0xff, 0xff, 0xff]
const INK = [0x1d, 0x27, 0x33]
const ZONES = [
  [0x38, 0xc3, 0xee],
  [0x3f, 0xd6, 0x8f],
  [0xff, 0xc5, 0x31],
  [0xff, 0x93, 0x45],
  [0xff, 0x5e, 0x5b],
]

/**
 * The composition, deliberately abstract: a white card on the sky canvas, and inside it the zone
 * bar — the app's one signature graphic, and the only element that is recognisably THIS app without
 * naming a distance, a pace or a heart rate. Widths are the canonical fixture's own zone shares
 * (2/1/7/47/43), so the picture is a true shape rather than a decorative gradient.
 */
const CARD_X = 90
const CARD_Y = 90
const CARD_W = W - CARD_X * 2
const CARD_H = H - CARD_Y * 2
const BAR_X = CARD_X + 70
const BAR_W = CARD_W - 140
const BAR_H = 54
const BAR_Y = CARD_Y + Math.round((CARD_H - BAR_H) / 2)
const SHARES = [2, 1, 7, 47, 43]
const GAP = 6

const RULE_Y = BAR_Y + BAR_H + 90
const RULE_H = 14

function zoneAt(x) {
  let cursor = BAR_X
  const total = SHARES.reduce((a, b) => a + b, 0)
  for (let i = 0; i < SHARES.length; i++) {
    const width = Math.round((SHARES[i] / total) * (BAR_W - GAP * (SHARES.length - 1)))
    if (x >= cursor && x < cursor + width) return ZONES[i]
    cursor += width + GAP
  }
  return null
}

/** One byte per channel, one filter byte per row (0 = None). */
const raw = Buffer.alloc(H * (1 + W * 3))
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 3)
  raw[rowStart] = 0
  for (let x = 0; x < W; x++) {
    let colour = PAPER
    const inCard = x >= CARD_X && x < CARD_X + CARD_W && y >= CARD_Y && y < CARD_Y + CARD_H
    if (inCard) colour = CARD
    if (inCard && y >= BAR_Y && y < BAR_Y + BAR_H) colour = zoneAt(x) ?? CARD
    // A short ink rule under the bar: a wordmark's worth of weight with no text to mis-set.
    if (inCard && y >= RULE_Y && y < RULE_Y + RULE_H && x >= BAR_X && x < BAR_X + 220) colour = INK

    const i = rowStart + 1 + x * 3
    raw[i] = colour[0]
    raw[i + 1] = colour[1]
    raw[i + 2] = colour[2]
  }
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // colour type 2 = truecolour RGB
ihdr[10] = 0 // deflate
ihdr[11] = 0 // adaptive filtering
ihdr[12] = 0 // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync('public/og-default.png', png)
console.log(`wrote public/og-default.png — ${W}x${H}, ${png.length} bytes`)
