#!/usr/bin/env python3
"""Regenerate research/fixtures/screenshots/shipped/ from the canonical PNGs.

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

    python3 scripts/shipped-image-recipe.py
"""

from pathlib import Path

from PIL import Image
from PIL.Image import Resampling

# Mirrors lib/extract/constants.ts. Kept as literals with the constant names beside them because
# a Python script cannot import the TypeScript, and a silent drift here would produce a fixture
# that no longer represents what the browser sends.
TARGET_SHORT_EDGE_PX = 560  # TARGET_SHORT_EDGE_PX
TARGET_QUALITY = 80  # TARGET_QUALITY (0.8)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "research" / "fixtures" / "screenshots"
OUT = SRC / "shipped"


def long_edge_target_for(width: int, height: int, short_edge_target: int) -> int:
    """Port of lib/photos/resizeTarget.ts's longEdgeTargetFor(). Never upscales."""
    short_edge, long_edge = min(width, height), max(width, height)
    if short_edge <= short_edge_target:
        return long_edge
    return round(short_edge_target * (long_edge / short_edge))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name in ("1", "2", "3"):
        source = SRC / f"{name}.png"
        image = Image.open(source).convert("RGB")
        width, height = image.size

        target_long = long_edge_target_for(width, height, TARGET_SHORT_EDGE_PX)
        # browser-image-compression's maxWidthOrHeight clamps the LONGER dimension and preserves
        # the aspect ratio; this reproduces that, not a direct resize to the target.
        # Resampling.LANCZOS, not the deprecated Image.LANCZOS alias: the latter still works at
        # runtime on Pillow 12 but is untyped, and this repo type-checks what it can.
        scale = target_long / max(width, height)
        resized = image.resize((round(width * scale), round(height * scale)), Resampling.LANCZOS)

        destination = OUT / f"{name}.jpg"
        resized.save(destination, "JPEG", quality=TARGET_QUALITY)

        kb = destination.stat().st_size / 1024
        total += kb
        short = min(resized.size)
        assert abs(short - TARGET_SHORT_EDGE_PX) <= 5, (
            f"{name}: short edge {short} is outside the tested 560 +/- 5 envelope"
        )
        print(f"{name}: {width}x{height} -> {resized.size[0]}x{resized.size[1]}  short {short}  {kb:.0f} KB")

    print(f"total {total:.0f} KB  (research/downscale.mjs measured 170 KB with the browser encoder)")


if __name__ == "__main__":
    main()
