#!/usr/bin/env python3
"""One contact sheet of the whole deck, at the sizes the app actually draws.

    python3 tools/make_badge_sheet.py
    python3 tools/make_badge_sheet.py --out /tmp/shelf.png

Design record: docs/plans/F10-badge-art-skill.md §9 task 14.

WHY THIS EXISTS AND check_badge_art.py DOES NOT COVER IT. That tool measures one
candidate and writes one badge's theme strip; this draws all 22 together on both
`--paper` values. The plan is explicit that the deck needs this and the reference
deck did not: daily-words grew across many separate sessions over months, so
cross-badge drift surfaced naturally between them. This deck is generated in one
concentrated phase, where drift is easy to miss badge-by-badge and obvious with
everything on the shelf at once.

Three questions only this artefact answers:

  Does any pair collide at 40 px? The collision audit in style.md names the ones
  checked at DESIGN time — century_club/double_century, groundhog_day/
  consistency_gremlin, metronome/boring_excellence, the post tally, the three
  light sources, the disc tally. Convergence noticed on badge sixteen costs
  fifteen badges of hindsight; convergence noticed here costs one regeneration.

  Is it one bolt of cloth? Check 9b puts a number on twill tone against the
  anchor one badge at a time. Twenty-two margins side by side is the version of
  that question a human can actually answer.

  Does the shelf read as a set? Shape distribution, border weight, how loud the
  signature threads are collectively — none of which is a per-badge property.

Rows are catalog order, which IS shelf order (`BADGE_CATALOG` is the source, so
this sheet and `/me` cannot disagree about sequence).

PIL only, like its neighbours.
"""

import argparse
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

ROOT = Path(__file__).resolve().parent.parent
MASTERS = ROOT / "assets" / "badges"
SOURCE = ROOT / "lib" / "badges" / "catalog.ts"

# app/globals.css, verbatim — the same two values check_badge_art.py composites
# its per-badge strip against.
PAPER_LIGHT = (0xC9, 0xE9, 0xFB)
PAPER_DARK = (0x0E, 0x1B, 0x26)

SHELF = 40   # what BadgeShelf draws, near enough
PANEL = 160  # big enough to judge the subject, small enough to fit 22 across

CATALOG_RE = re.compile(r"BADGE_CATALOG[^=]*=\s*\[(.*?)^\]", re.S | re.M)
KEY_RE = re.compile(r"^\s*badge\(\s*'([a-z0-9_]+)'", re.M)


def badge_keys():
    m = CATALOG_RE.search(SOURCE.read_text(encoding="utf-8"))
    if not m:
        sys.exit(f"error: could not find `BADGE_CATALOG … = [ … ]` in {SOURCE}")
    return KEY_RE.findall(m.group(1))


def band(keys, size, bg, cols, pad, gap):
    """One themed row-block: `keys` drawn at `size` on `bg`, wrapped at `cols`."""
    rows = (len(keys) + cols - 1) // cols
    w = pad * 2 + cols * size + (cols - 1) * gap
    h = pad * 2 + rows * size + (rows - 1) * gap
    out = Image.new("RGB", (w, h), bg)
    for i, key in enumerate(keys):
        master = MASTERS / f"{key}.png"
        if not master.exists():
            continue
        art = Image.open(master).convert("RGB").resize((size, size), Image.LANCZOS)
        x = pad + (i % cols) * (size + gap)
        y = pad + (i // cols) * (size + gap)
        out.paste(art, (x, y))
    return out


def main():
    parser = argparse.ArgumentParser(
        description="Assemble the whole deck at shelf and panel size, both themes."
    )
    parser.add_argument("--out", type=Path,
                        default=MASTERS / "_candidates" / "_shelf.png",
                        help="where to write (default assets/badges/_candidates/, "
                             "which is gitignored — this is a review artefact, not art)")
    args = parser.parse_args()

    keys = badge_keys()
    missing = [k for k in keys if not (MASTERS / f"{k}.png").exists()]
    if missing:
        print(f"warning: {len(missing)} master(s) missing, drawn as gaps: "
              f"{', '.join(missing)}", file=sys.stderr)

    blocks = [
        # Shelf size first and largest-in-count per row, because "does any pair
        # collide at 40 px" is the question this sheet exists for and the answer
        # is easiest when they are packed tightly in one line of sight.
        band(keys, SHELF, PAPER_LIGHT, 11, 24, 16),
        band(keys, SHELF, PAPER_DARK, 11, 24, 16),
        band(keys, PANEL, PAPER_LIGHT, 6, 24, 16),
        band(keys, PANEL, PAPER_DARK, 6, 24, 16),
    ]
    w = max(b.width for b in blocks)
    sheet = Image.new("RGB", (w, sum(b.height for b in blocks)))
    y = 0
    for b in blocks:
        sheet.paste(b, (0, y))
        y += b.height

    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out)
    print(f"{args.out}  {sheet.width}×{sheet.height}  ({len(keys) - len(missing)}"
          f"/{len(keys)} badges)")
    print("\nLook for, in this order:")
    print("  1. any two badges that read the same at 40 px — check style.md's")
    print("     collision audit pairs first, they are the ones already suspected")
    print("  2. a margin that is not the same cloth as its neighbours")
    print("  3. a merrowed border heavier or lighter than the rest")
    print("  4. a signature thread that has become the loudest thing on the shelf")


if __name__ == "__main__":
    main()
