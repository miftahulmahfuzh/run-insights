#!/usr/bin/env python3
"""Regenerate a fixture set's shipped/ JPEGs from its canonical PNGs.

Two sets, picked by the first argument (default `canonical`, the original behaviour):

  canonical         research/fixtures/screenshots/{1,2,3}.png -> screenshots/shipped/
  workout-details   research/fixtures/workout-details/*.png   -> workout-details/shipped/
                    (the chart estimator's fixtures, lib/extract/chart/; WORKOUT_DETAILS_ESTIMATE
                    phase 1)

The three `.jpg` files under `shipped/` are what the browser actually uploads: 560 px on the
SHORT edge, JPEG quality 80 — the recipe `research/downscale.mjs` scored at 108/108 and the one
`lib/photos/compressForExtraction.ts` produces. They are committed so the tagged live suite can
send exactly what production sends, rather than the originals (which cost 5,494 input tokens
against the shipped recipe's ~3,600).

This script exists because the real compressor runs in a browser Web Worker and cannot be invoked
from a test or a shell. It reimplements the same two decisions in Pillow:

  1. the long-edge target from `lib/photos/resizeTarget.ts` — `round(560 * long / short)`, which
     is the whole of the §3.1 trap. Passing 560 to a portrait image directly would clamp the
     1600 px height and yield a 259 px-wide image, far outside the tested envelope.
  2. quality 80, matching TARGET_QUALITY exactly, with no iterative byte-budget search.

It is NOT the production path and is not imported by anything — it is a documented, re-runnable
recipe for a committed artefact. Pillow's JPEG encoder is not the browser's, so the byte sizes
differ slightly from the measured table (183 KB total here vs the 170 KB
`research/downscale.mjs` recorded); the PIXEL DIMENSIONS, which are what drive token cost and
accuracy, are identical.

    python3 scripts/shipped-image-recipe.py                    # canonical
    python3 scripts/shipped-image-recipe.py workout-details    # the chart estimator's set
"""

import sys
from pathlib import Path

from PIL import Image
from PIL.Image import Resampling

# Mirrors lib/extract/constants.ts. Kept as literals with the constant names beside them because
# a Python script cannot import the TypeScript, and a silent drift here would produce a fixture
# that no longer represents what the browser sends.
TARGET_SHORT_EDGE_PX = 560  # TARGET_SHORT_EDGE_PX
TARGET_QUALITY = 80  # TARGET_QUALITY (0.8)

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "research" / "fixtures"

# set name -> (source directory, PNG stems). Each set writes <source>/shipped/<stem>.jpg.
SETS = {
    "canonical": (FIXTURES / "screenshots", ("1", "2", "3")),
    "workout-details": (
        FIXTURES / "workout-details",
        (
            "2026-11-20-details",
            "2026-11-20-heartrate",
            "2026-11-20-splits",
            "2026-11-20-summary",
            "2026-11-22-details",
            "2026-11-22-heartrate",
            "2026-11-22-summary",
        ),
    ),
}


def long_edge_target_for(width: int, height: int, short_edge_target: int) -> int:
    """Port of lib/photos/resizeTarget.ts's longEdgeTargetFor(). Never upscales."""
    short_edge, long_edge = min(width, height), max(width, height)
    if short_edge <= short_edge_target:
        return long_edge
    return round(short_edge_target * (long_edge / short_edge))


def main() -> None:
    set_name = sys.argv[1] if len(sys.argv) > 1 else "canonical"
    if set_name not in SETS:
        raise SystemExit(f"unknown set {set_name!r}; expected one of {sorted(SETS)}")
    src, names = SETS[set_name]
    out = src / "shipped"
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    for name in names:
        source = src / f"{name}.png"
        image = Image.open(source).convert("RGB")
        width, height = image.size

        target_long = long_edge_target_for(width, height, TARGET_SHORT_EDGE_PX)
        # browser-image-compression's maxWidthOrHeight clamps the LONGER dimension and preserves
        # the aspect ratio; this reproduces that, not a direct resize to the target.
        # Resampling.LANCZOS, not the deprecated Image.LANCZOS alias: the latter still works at
        # runtime on Pillow 12 but is untyped, and this repo type-checks what it can.
        scale = target_long / max(width, height)
        resized = image.resize((round(width * scale), round(height * scale)), Resampling.LANCZOS)

        destination = out / f"{name}.jpg"
        resized.save(destination, "JPEG", quality=TARGET_QUALITY)

        kb = destination.stat().st_size / 1024
        total += kb
        short = min(resized.size)
        assert abs(short - TARGET_SHORT_EDGE_PX) <= 5, (
            f"{name}: short edge {short} is outside the tested 560 +/- 5 envelope"
        )
        print(f"{name}: {width}x{height} -> {resized.size[0]}x{resized.size[1]}  short {short}  {kb:.0f} KB")

    print(f"total {total:.0f} KB")
    if set_name == "canonical":
        print("(research/downscale.mjs measured 170 KB with the browser encoder)")


if __name__ == "__main__":
    main()
