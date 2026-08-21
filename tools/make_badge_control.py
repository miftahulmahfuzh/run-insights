#!/usr/bin/env python3
"""Draw synthetic badge controls, so `check_badge_art.py` can be exercised for free.

    python3 tools/make_badge_control.py                      # all four, to /tmp
    python3 tools/make_badge_control.py --out-dir /tmp/x
    python3 tools/make_badge_control.py --only good

Design record: docs/plans/F10-badge-art-skill.md §5.2 (the ten bands) and §7 (why
nothing in F10 should spend money to find out whether the code runs).

WHAT THIS IS FOR. F10 ships a measurement tool for a deck that does not exist
yet: at the moment this is written there are zero approved masters, so every band
in `check_badge_art.py` is a documented guess and there is nothing on disk to run
it against. These four images are drawn from `style.md`'s own hex values by
arithmetic — navy twill with a woven grain, a bone merrowed border, two thread
colours and one signature mark — and they make four questions answerable without
an API call:

  good      does a plausible patch pass all six hard checks?
  flat      does the variance FLOOR in checks 3 and 10 catch a flat digital navy
            fill with no weave at all — the "sticker, not a patch" failure that
            SKILL.md names as this style's single most likely quiet drift?
  offcentre does check 8a catch a patch that is not centred?
  bleached  does check 3's grey band catch a substrate that has drifted pale?

WHAT THIS IS NOT. Not art, not a fixture the deck is graded against, and NOT a
source for re-deriving any band. A control is drawn from the tokens by arithmetic
and a real candidate is photographed thread under a raking light; the two differ
in every way that matters to a threshold. §9 task 12's re-derivation reads six
approved MASTERS, never these. Run the controls with `--no-anchor`: once an
anchor exists they fail check 9 by construction, and that failure means nothing.

PIL only, like its two neighbours.
"""

import argparse
import math
import random
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

SIZE = 1024

# style.md's STYLE BLOCK v1, verbatim — the same seven colours check_badge_art.py
# measures against. Imported by copy rather than by import because these two
# tools share no module and a two-line import shim would be more coupling than
# the duplication costs; if the style block's palette moves, both files move.
TWILL = (0x1B, 0x2A, 0x44)
BONE = (0xED, 0xE3, 0xC8)
CARDINAL = (0xC2, 0x3B, 0x2E)
GOLD = (0xE3, 0xA7, 0x2E)
SIGNATURE = (0xF2, 0x60, 0x0C)


def shade(rgb, k):
    return tuple(max(0, min(255, int(round(c * k)))) for c in rgb)


def twill_ground(size, base, weave=True, seed=7):
    """Navy cloth: a diagonal weave under a raking light from the upper left.

    Three components, each answering one band in check 3 or check 10: a fine
    diagonal ripple (the weave itself, which is what the variance FLOOR asks
    for), per-pixel thread noise, and a broad corner-to-corner gradient (the
    raking light, which is what the inter-strip SPREAD band tolerates).
    """
    rnd = random.Random(seed)
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            k = 1.0
            if weave:
                # 4 px diagonal repeat — a twill line, not a plain weave.
                k += 0.055 * math.sin((x + y) * math.pi / 4.0)
                k += rnd.uniform(-0.035, 0.035)
            # The raking light: brightest at the upper left, ~8% across the frame.
            k += 0.08 * (1.0 - (x + y) / (2.0 * size))
            px[x, y] = shade(base, k)
    return img


def hexagon(cx, cy, r):
    return [
        (cx + r * math.cos(math.pi / 6 + i * math.pi / 3),
         cy + r * math.sin(math.pi / 6 + i * math.pi / 3))
        for i in range(6)
    ]


def draw_patch(img, cx, cy, half):
    """A hexagon patch: bone merrowed border, two threads, one signature mark."""
    d = ImageDraw.Draw(img)

    # The merrowed border, drawn as a thick bone outline on a filled hexagon.
    d.polygon(hexagon(cx, cy, half), fill=shade(TWILL, 1.15), outline=BONE,
              width=int(half * 0.10))

    # Interior: a cardinal disc under a gold bar. Two of the five threads, which
    # is what the style block asks of any single badge.
    d.ellipse((cx - half * 0.45, cy - half * 0.52, cx + half * 0.45, cy + half * 0.38),
              fill=CARDINAL)
    d.rectangle((cx - half * 0.55, cy + half * 0.42, cx + half * 0.55, cy + half * 0.58),
                fill=GOLD)

    # THE SIGNATURE THREAD: one small mark, ~0.3% of the frame, nowhere else.
    d.ellipse((cx - half * 0.10, cy - half * 0.62, cx + half * 0.10, cy - half * 0.42),
              fill=SIGNATURE)

    # Stitch rows. A blur then a per-row highlight is the cheapest thing that
    # reads as satin under a raking light rather than as a vector fill, and check
    # 7's legibility proxy would otherwise measure a suspiciously clean picture.
    return img.filter(ImageFilter.GaussianBlur(0.6))


CONTROLS = {
    "good": "a plausible patch: woven twill, centred hexagon, bone border, "
            "two threads, one signature mark",
    "flat": "the sticker failure — a perfectly flat navy fill with no weave "
            "(should fail check 3's sd floor and warn on check 10)",
    "offcentre": "the patch pushed 9% off centre (should fail check 8a)",
    "bleached": "the substrate drifted pale (should fail check 3's grey band)",
}


def build(name):
    if name == "flat":
        img = twill_ground(SIZE, TWILL, weave=False)
        return draw_patch(img, SIZE / 2, SIZE / 2, SIZE * 0.40)
    if name == "bleached":
        img = twill_ground(SIZE, shade(TWILL, 2.6))
        return draw_patch(img, SIZE / 2, SIZE / 2, SIZE * 0.40)
    img = twill_ground(SIZE, TWILL)
    if name == "offcentre":
        return draw_patch(img, SIZE * 0.59, SIZE * 0.53, SIZE * 0.36)
    return draw_patch(img, SIZE / 2, SIZE / 2, SIZE * 0.40)


def main():
    parser = argparse.ArgumentParser(
        description="Draw synthetic badge controls for check_badge_art.py.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="\n".join(f"  {k:<10} {v}" for k, v in CONTROLS.items()),
    )
    parser.add_argument("--out-dir", type=Path, default=Path("/tmp"),
                        help="where to write (default /tmp — these are NOT deck art "
                             "and do not belong under assets/)")
    parser.add_argument("--only", choices=sorted(CONTROLS),
                        help="just one control")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name in ([args.only] if args.only else sorted(CONTROLS)):
        out = args.out_dir / f"_control_{name}.png"
        build(name).save(out)
        print(f"{out}  — {CONTROLS[name]}")

    print("\nnext: python3 tools/check_badge_art.py <path> --no-anchor")


if __name__ == "__main__":
    main()
