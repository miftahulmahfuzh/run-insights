/**
 * F19 — webm to GIF, with a byte budget that fails loudly.
 *
 * ── WHAT WAS MEASURED, AND WHAT IT OVERTURNED ────────────────────────────────────────────────
 * This started as the standard two-pass palette recipe with Bayer dithering, on the reasoning that
 * quantising this app's dark `--paper` blues to a generic palette would band them. Half of that
 * was right and half was wrong, and the measurement is the only reason we know which:
 *
 *   - `palettegen` from the actual frames: KEPT. It is nearly free and it is what makes 64 colours
 *     enough for a UI that uses maybe thirty.
 *   - Dithering: DROPPED. At 64 colours, `dither=none` is visually indistinguishable from
 *     `bayer_scale=3` at 96 colours on these frames — compared side by side at 2x, no banding
 *     appears anywhere, because this interface is flat fills and text rather than gradients. It is
 *     also ~20% smaller, since dither noise is per-pixel change that GIF's inter-frame compression
 *     then has to store. The banding worry was real for gradients this design does not have.
 *   - `mpdecimate`: KEPT, worth ~18%. Less than hoped, because the pending screen animates an
 *     `ri-pulse` skeleton, so consecutive frames are never quite duplicates.
 *
 * ── THE BUDGET IS A FAILURE, NOT A WARNING ───────────────────────────────────────────────────
 * A README that opens with 8 MB of GIF is a README people close, and the failure mode of a soft
 * limit is a repo that grows one capture run at a time. The first hero recording came out at
 * 8.4 MB on the top rung; the ladder below is what brought it inside budget without anyone
 * quietly editing the budget.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Per GIF. Three of these plus twelve stills is what keeps `docs/media/` inside 8 MB. */
export const MAX_BYTES = 2 * 1024 * 1024

/**
 * The quality ladder.
 *
 * A GIF of a scrolling phone screen is expensive: every scroll step changes most of the frame, so
 * inter-frame compression has little to work with and the file is roughly frames x area. The hero
 * recording came out at 7.1 MB on the top rung.
 *
 * So rather than pick one setting and hope, or quietly raise the budget until whatever we produced
 * fits, this walks down explicit rungs and stops at the first that lands inside it — and prints
 * which rung it used, so a GIF that had to drop to 6 fps says so instead of looking like a choice.
 */
const LADDER = [
  { fps: 12, width: 390 },
  { fps: 10, width: 390 },
  { fps: 10, width: 360 },
  { fps: 8, width: 360 },
  { fps: 8, width: 320 },
  { fps: 6, width: 320 },
]

/** Enough for an interface that uses about thirty. See the note above on why there is no dither. */
const MAX_COLORS = 64

/**
 * `speed` timelapses the whole recording by that factor. It exists for the hero GIF, whose middle
 * is a real 33-38 s wait on a real vision call: the wait is recorded rather than cut, because
 * cutting it would claim the model answers instantly. `setpts` comes FIRST in the chain, before
 * `fps`, so frames are dropped after the timebase moves — the other order re-times an
 * already-decimated stream and stutters.
 */
export async function toGif(webm, out, { max = MAX_BYTES, speed = 1 } = {}) {
  let last = null
  for (const [rung, { fps, width }] of LADDER.entries()) {
    const size = await encode(webm, out, { fps, width, speed })
    last = { fps, width, size }
    if (size <= max) {
      const note = rung === 0 ? '' : `  (rung ${rung + 1}: ${fps} fps, ${width}px)`
      console.log(`    ${path.basename(out)}  ${(size / 1024).toFixed(0)} KB${note}`)
      return size
    }
    console.log(
      `    ${path.basename(out)} at ${fps} fps / ${width}px is ` +
        `${(size / 1024).toFixed(0)} KB — over budget, dropping a rung`,
    )
  }
  throw new Error(
    `${path.basename(out)} is still ${(last.size / 1024).toFixed(0)} KB at the bottom of the ` +
      `ladder (${last.fps} fps, ${last.width}px), against a ${(max / 1024).toFixed(0)} KB budget. ` +
      `Shorten the recording — do not raise the budget without saying why.`,
  )
}

async function encode(webm, out, { fps, width, speed }) {
  const scratch = mkdtempSync(path.join(tmpdir(), 'f19-gif-'))
  const palette = path.join(scratch, 'palette.png')
  const timelapse = speed === 1 ? '' : `setpts=PTS/${speed},`
  const filters = `${timelapse}mpdecimate,fps=${fps},scale=${width}:-1:flags=lanczos`
  try {
    await run('ffmpeg', [
      '-y',
      '-i',
      webm,
      '-vf',
      `${filters},palettegen=max_colors=${MAX_COLORS}:stats_mode=diff`,
      palette,
    ])
    await run('ffmpeg', [
      '-y',
      '-i',
      webm,
      '-i',
      palette,
      '-lavfi',
      `${filters}[x];[x][1:v]paletteuse=dither=none`,
      '-loop',
      '0',
      out,
    ])
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  return statSync(out).size
}
