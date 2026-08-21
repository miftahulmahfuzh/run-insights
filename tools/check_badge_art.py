#!/usr/bin/env python3
"""Measure one badge candidate, and write the three crops a human has to look at.

    python3 tools/check_badge_art.py assets/badges/_candidates/early_bird.a01.png

Design record: docs/plans/F10-badge-art-skill.md §5.2 and §5.3.

TEN measurements — the reference tool's nine, rebuilt for navy twill, plus one
that has no analogue there (check 10, weave texture) because the reference
substrate is flat by contract and this one explicitly is not. Hard checks set the
exit code; advisory ones only print.

  EVERY BAND IN THIS FILE IS A GUESS. The tool this descends from re-derived its
  bands from a thirteen-badge distribution and records the observed range beside
  each one. This deck has ZERO approved images at the time this file is written,
  so every number below is marked `(guess, 0 badges)` and is a gross-failure
  catch only, sized to pass anything plausible.

  DO NOT TIGHTEN A BAND BECAUSE ONE CANDIDATE MISSED IT. Re-derive all of them
  ONCE, after at least six badges are approved (F10 §9 task 12), and replace
  `(guess, 0 badges)` with `(observed, N badges, style vM)` and the range. The
  deck this tool descends from set a band from one sample — its anchor — and
  then rejected five perfectly good cards for landing one to three points
  outside a floor with no evidence behind it.

WHY THIS IS NOT A PORT. The reference's nine measurements are tuned to flat
cream paper and two flat inks. A textured navy twill with five saturated threads
fails several of them BY CONSTRUCTION rather than by any flaw in the candidate:

  3  wanted the margin WARM, LIGHT and FLAT. This substrate is cool, dark, and
     deliberately textured — §4.7 asks for "visible weave" — so all three bands
     invert and a variance FLOOR joins the ceiling.
  4  keeps its colorimetry and swaps its token list. The "unauthorised
     blue/violet" guard is DELETED, not re-tuned: it exists to catch a cool
     drift against warm cream, and here the substrate IS navy, i.e. sits
     squarely inside the hue band it forbids. It would fail every correct
     candidate by definition.
  5  is replaced, not re-derived. Its premise — the plate should sit "nearly
     flush" with the app's paper — is a compositional decision belonging to
     another app. §4.7 wants an object that looks nothing like the calm chrome
     around it, so the ceiling is gone entirely and only an invisibility floor
     remains.
  8  is the one genuine algorithm rewrite. The reference fits a first harmonic
     to a ring of radial samples, which assumes the shared element is a CIRCLE.
     This deck's outer shape is a shield, a hexagon, a chevron or a rounded
     triangle, varying by design (§4.7) — a radial fit against a chevron is
     close to meaningless. Foreground detection is by distance from the
     substrate colour, and the geometry is a bounding box, not a ring.
  9a inherits that rewrite: "ring radius vs anchor" becomes "foreground width vs
     anchor", with a wider band because shape variation adds spread that pure
     ring noise never had to account for.

TWO UNITS, KEPT APART ON PURPOSE. Check 3, 8b, 9b and 10 report sRGB grey values
(0–255) because they are about fabric texture and tone, where the relative-
luminance scale compresses the darks into noise — #1B2A44 is 40.5 in sRGB grey
and 2.5% in relative luminance, and a stdev of "0.3 relative-luminance points" is
unreadable. Check 5 reports WCAG relative luminance because it computes contrast
ratios and nothing else will do. Every number below carries its unit in the
printed line; do not compare one against the other.

The exit code is not the verdict. The verdict is SKILL.md step 5, read against
the three PNGs this writes — and the largest failure mode of these models,
lettering around a patch edge, is not measured here at all. See NOT_MEASURED.
"""

import argparse
import colorsys
import math
import sys
from pathlib import Path
from typing import NoReturn

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

ROOT = Path(__file__).resolve().parent.parent
ANCHOR = ROOT / "assets" / "badges" / "_anchor.png"

MASTER = 1024

# app/globals.css, verbatim: --paper in each colour scheme. These are the ONLY
# app design tokens anywhere in F10, and they appear here rather than in the
# prompt on purpose (style.md, "Where this style came from"): the patch's palette
# is deliberately not the app's, but the strip a human judges it from has to be
# the page it will actually sit on. F10 §5.3 called these placeholders pending
# F08's DesignSync pull; F08 has shipped, so these are the real values.
PAPER_LIGHT = (0xC9, 0xE9, 0xFB)  # --paper, light
PAPER_DARK = (0x0E, 0x1B, 0x26)  # --paper, dark

# style.md's STYLE BLOCK v1, verbatim: the substrate, the five threads, the
# signature. Seven, where the reference had ten `tokens.css` swatches. Do not
# invent colours here — change the style block, bump its version, and copy.
SUBSTRATE = (0x1B, 0x2A, 0x44)  # navy cotton twill
TOKENS = [
    SUBSTRATE,
    (0xC2, 0x3B, 0x2E),  # cardinal red
    (0x2E, 0x7D, 0x46),  # kelly green
    (0xE3, 0xA7, 0x2E),  # marigold gold
    (0xED, 0xE3, 0xC8),  # bone / cream — the merrowed border
    (0x4C, 0x8F, 0xB0),  # slate sky blue
    (0xF2, 0x60, 0x0C),  # THE SIGNATURE THREAD, safety orange
]

# The signature thread's hue window, for check 6. #F2600C is 21.9°; the nearest
# neighbour in the palette above is marigold at 40.1° and cardinal red at 5.3°,
# so 15–35 separates the signature from both without a knife-edge on either side.
SIGNATURE_HUE = (15.0, 35.0)


# --------------------------------------------------------------------------- #
# Colour maths, all stdlib
# --------------------------------------------------------------------------- #

def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


_LIN = [_lin(i) for i in range(256)]


def rel_luminance(rgb):
    """WCAG relative luminance, 0..1. Check 5's unit and nothing else's."""
    r, g, b = rgb
    return 0.2126 * _LIN[r] + 0.7152 * _LIN[g] + 0.0722 * _LIN[b]


def grey(rgb):
    """sRGB grey value, 0..255 — PIL's own "L" conversion, BT.601 luma.

    The unit for every fabric measurement in this file. On #1B2A44 it reads 40.5
    while relative luminance reads 0.025, and a weave whose stitch-to-stitch
    variation is ±3 sRGB points is ±0.002 in the other unit: real, and invisible
    at any sane number of printed decimals.
    """
    r, g, b = rgb
    return 0.299 * r + 0.587 * g + 0.114 * b


def contrast_l(la, lb):
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def to_lab(rgb):
    """sRGB → CIE Lab (D65). About fifteen lines, and the reason checks 4 and 8 work.

    A plain RGB euclidean distance either passes everything or fails everything;
    Lab is what makes "within ΔE76 of a token" mean roughly "a human would call
    it that colour" — and, in check 8, what lets a saturated thread of the SAME
    luminance as the twill still count as foreground.
    """
    r, g, b = (_LIN[c] for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 1.00000
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t) + (16 / 116)

    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


TOKEN_LABS = [to_lab(c) for c in TOKENS]


def nearest_token_de(lab):
    return min(math.dist(lab, tl) for tl in TOKEN_LABS)


def mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def stdev(xs):
    if len(xs) < 2:
        return 0.0
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


# --------------------------------------------------------------------------- #
# The report
# --------------------------------------------------------------------------- #

class Report:
    def __init__(self):
        self.hard_failures = []
        self.warnings = []

    def hard(self, name, ok, detail):
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}: {detail}")
        if not ok:
            self.hard_failures.append(name)

    def soft(self, name, ok, detail):
        print(f"  [{' ok ' if ok else 'warn'}] {name}: {detail}")
        if not ok:
            self.warnings.append(name)

    def note(self, name, detail):
        print(f"  [ -- ] {name}: {detail}")


# --------------------------------------------------------------------------- #
# Geometry helpers
# --------------------------------------------------------------------------- #

def substrate_stats(px, w, h):
    """The bare twill, sampled from the outer 5% frame.

    The patch occupies about 80% of the width, so from 90% of the half-width
    outward is bare cloth by construction. Taking the substrate from a frame
    rather than from "the darkest pixels" is what keeps a badge with a large
    dark interior from measuring its own subject and calling it the fabric.

    Returns (mean_rgb, mean_grey_srgb, median_rel_luminance).
    """
    band = max(1, int(round(min(w, h) * 0.05)))
    rs, gs, bs, greys, lums = [], [], [], [], []
    for y in range(h):
        edge_row = y < band or y >= h - band
        for x in range(w):
            if not (edge_row or x < band or x >= w - band):
                continue
            rgb = px[x, y][:3]
            rs.append(rgb[0])
            gs.append(rgb[1])
            bs.append(rgb[2])
            greys.append(grey(rgb))
            lums.append(rel_luminance(rgb))
    lums.sort()
    return (
        (round(mean(rs)), round(mean(gs)), round(mean(bs))),
        mean(greys),
        lums[len(lums) // 2],
    )


def edge_strips(px, w, h, frac=0.015):
    """The four outermost strips, as (mean_grey, stdev_grey, warmth) triples.

    Warmth is r − b in raw channel units, and it is NEGATIVE here. The reference
    demands r − b ≥ 6 because its substrate is cream; this one demands r − b well
    below zero because navy twill is cool by definition (#1B2A44 is −41). Porting
    that check's sign is the single easiest mistake to make in this file.
    """
    t = max(1, int(round(min(w, h) * frac)))
    regions = {
        "top": [(x, y) for y in range(t) for x in range(w)],
        "bottom": [(x, y) for y in range(h - t, h) for x in range(w)],
        "left": [(x, y) for x in range(t) for y in range(h)],
        "right": [(x, y) for x in range(w - t, w) for y in range(h)],
    }
    out = {}
    for name, coords in regions.items():
        greys, warms = [], []
        for x, y in coords:
            r, g, b = px[x, y][:3]
            greys.append(grey((r, g, b)))
            warms.append(r - b)
        out[name] = (mean(greys), stdev(greys), mean(warms))
    return out


def foreground_map(img, substrate_rgb, size=256):
    """ΔE76 from the substrate, per pixel, on a `size`² downsample.

    The generalisation of the reference's `inkiness_map`, which measured "how
    much darker than the paper" — a luminance difference. That does not survive
    the medium change: kelly green (#2E7D46, grey 95) and the twill (grey 40) do
    differ in luminance, but slate sky blue at the twill's own luminance would
    read as background under a luminance rule while being obviously foreground to
    a human. Lab distance catches both, which is what "where is the patch" needs.

    Everything that needs a notion of "where the patch is" reads this, so there
    is one definition of foreground in the file.
    """
    small = img.resize((size, size), Image.BILINEAR)
    sp = small.load()
    base = to_lab(substrate_rgb)
    cache = {}
    grid = []
    for y in range(size):
        row = []
        for x in range(size):
            rgb = sp[x, y][:3]
            d = cache.get(rgb)
            if d is None:
                d = math.dist(to_lab(rgb), base)
                cache[rgb] = d
            row.append(d)
        grid.append(row)
    return grid


# The ΔE at which a pixel stops being cloth and starts being patch. #1B2A44 to
# the nearest thread (slate sky blue) is ΔE ≈ 33, and the merrowed bone border is
# ΔE ≈ 62, so 18 sits below every legitimate thread and above the raking light's
# own shading of the bare twill. (guess, 0 badges)
FOREGROUND_DE = 18.0
# A row or column counts as crossed by the patch once this share of its samples
# is foreground. 5% of 256 is 13 px — enough to ignore a speckle of compression
# noise, small enough that a chevron's thin point still registers.
PROFILE_SHARE = 0.05


def foreground_box(grid):
    """(x0, y0, x1, y1) in grid units for the patch, or None.

    SHAPE-AGNOSTIC BY CONSTRUCTION, which is the whole point of the rewrite. The
    reference finds a ring by fitting a first harmonic to 360 radial samples;
    that is exact for a circle, imprecise for a hexagon and meaningless for a
    chevron, and this deck has six shields, five hexagons, five chevrons and six
    rounded triangles by design. A bounding box asks the one question that is the
    same for all four: how much of the frame does the patch occupy, and is it
    centred.

    Row/column profiles rather than a flood fill: a merrowed border is a closed
    curve, so the profile method finds the same extent a contiguous-mass search
    would, without needing a connected-components pass on a 65k-pixel grid in
    pure Python.
    """
    n = len(grid)
    need = max(1, int(round(n * PROFILE_SHARE)))
    rows = [sum(1 for v in grid[y] if v >= FOREGROUND_DE) for y in range(n)]
    cols = [sum(1 for y in range(n) if grid[y][x] >= FOREGROUND_DE) for x in range(n)]
    ys = [y for y, c in enumerate(rows) if c >= need]
    xs = [x for x, c in enumerate(cols) if c >= need]
    if not ys or not xs:
        return None
    return xs[0], ys[0], xs[-1], ys[-1]


def foreground_centroid(grid):
    """The mass-weighted centre of the foreground, as (x, y) in grid units.

    Reported, never gated. The reference learned twice that an ink centroid reads
    the SUBJECT rather than the object: a comet whose tail fans to one side or a
    signpost with three boards on one flank will pull this several percent while
    the patch itself sits dead centre. Check 8a gates the bounding box's centre
    instead, which is driven by the outer silhouette alone. This number is here
    because the gap between the two is itself informative — a large one means the
    interior is lopsided, which is a composition note rather than a rejection.
    """
    n = len(grid)
    sx = sy = sw = 0.0
    for y in range(n):
        for x in range(n):
            v = grid[y][x]
            if v >= FOREGROUND_DE:
                sx += x * v
                sy += y * v
                sw += v
    if sw <= 0:
        return None
    return sx / sw, sy / sw


# --------------------------------------------------------------------------- #
# The ten measurements
# --------------------------------------------------------------------------- #

def measure(path: Path, rep: Report, anchor_stats=None):
    img = Image.open(path)
    raw_mode = img.mode
    w, h = img.size

    # 1 — geometry (hard). Survives the medium change unchanged: the master
    # canvas size has nothing to do with paper or thread. It is also the check
    # that catches gen_badge_art.py's `resolution` field being dropped, which
    # returns a 2048² master AFTER the money is spent.
    rep.hard(
        "1 geometry",
        (w, h) == (MASTER, MASTER),
        f"{w}×{h}, ratio {w / h:.4f} (want {MASTER}×{MASTER}, 1.0000)",
    )

    # 2 — alpha (hard). Also unchanged. The patch is full-bleed ON its substrate,
    # never a cutout with a transparent background, so there is no alpha channel
    # to get a halo, a premultiply bug or a "what is behind the antialiased edge"
    # question wrong.
    if "A" in raw_mode:
        alpha = img.getchannel("A")
        lo, hi = alpha.getextrema()
        rep.hard("2 alpha", lo == 255 and hi == 255,
                 f"mode {raw_mode}, alpha range {lo}–{hi} (want none, or 255 flat)")
    else:
        rep.hard("2 alpha", True, f"mode {raw_mode}, no alpha channel")

    img = img.convert("RGB")
    px = img.load()

    # 3 — twill margin (hard). The reference's "bare-paper edge", with every one
    # of its four properties inverted or rebuilt (see the header). One test
    # catches every form of the substrate failure at once: a black or white
    # margin, a photographed patch on a table, a drop shadow on two sides, a
    # vignette, a product-mockup frame — and, uniquely here, a flat digital navy
    # rectangle with no fabric grain rendered at all, which the variance FLOOR
    # is for and which no check in the reference tool could ever have wanted.
    #
    # All four numbers in sRGB grey (0–255). #1B2A44 is 40.5.
    # (guess, 0 badges): level 22–72, spread ≤18, sd 1.2–16.0, warmth ≤ −6.
    # The spread band is loose because the style block asks for ONE HARD RAKING
    # LIGHT from the upper left — a genuinely directional light makes the top
    # and bottom strips differ by design, and the reference's ±4.0 was written
    # for a substrate with no light on it at all.
    strips = edge_strips(px, w, h)
    means = [s[0] for s in strips.values()]
    spread = max(means) - min(means)
    bad = []
    for name, (m, sd, warm) in strips.items():
        if not (22.0 <= m <= 72.0):
            bad.append(f"{name} grey {m:.1f}")
        if sd < 1.2:
            bad.append(f"{name} sd {sd:.1f} — flat, no weave")
        if sd > 16.0:
            bad.append(f"{name} sd {sd:.1f} — cluttered")
        if warm > -6.0:
            bad.append(f"{name} warmth {warm:.1f} — not a cool navy")
    if spread > 18.0:
        bad.append(f"spread {spread:.1f}")
    sds = [s[1] for s in strips.values()]
    rep.hard(
        "3 twill margin",
        not bad,
        (f"grey {min(means):.1f}–{max(means):.1f} sRGB (want 22–72), spread "
         f"{spread:.1f} (≤18.0), sd {min(sds):.1f}–{max(sds):.1f} (1.2–16.0), "
         f"warmth {max(s[2] for s in strips.values()):.1f} (≤−6, i.e. cool)")
        + (f" — {'; '.join(bad)}" if bad else ""),
    )

    substrate_rgb, substrate_grey, substrate_lum = substrate_stats(px, w, h)

    # 4 — palette agreement (hard). The colorimetry is the reference's and is
    # sound; the token list is this deck's seven, and the "unauthorised
    # blue/violet" guard is DELETED rather than re-tuned (see the header).
    #
    # (guess, 0 badges): ΔE76 ≤ 30 of a token, ≥ 65% of pixels.
    # Both numbers are loosened from the reference's 20 / 88% and the reason is
    # physical rather than tolerant: satin-stitch sheen and a hard raking light
    # put many genuinely-correct pixels BETWEEN two named thread colours — a lit
    # cardinal row and its own core shadow are two different colours, neither of
    # them #C23B2E — in a way flat printed ink never does. Re-derive at six.
    small = img.resize((256, 256), Image.BILINEAR)
    sp = small.load()
    de_cache = {}
    near = 0
    total = 256 * 256
    for y in range(256):
        for x in range(256):
            rgb = sp[x, y][:3]
            d = de_cache.get(rgb)
            if d is None:
                d = nearest_token_de(to_lab(rgb))
                de_cache[rgb] = d
            if d <= 30.0:
                near += 1
    near_pct = 100.0 * near / total
    rep.hard("4 palette agreement", near_pct >= 65.0,
             f"{near_pct:.1f}% within ΔE76 30 of one of the 7 style-block "
             f"colours (≥65.0)")

    # 5 — visible in both themes (hard, floor only). REPLACED, not re-derived.
    #
    # The reference encodes a compositional decision from another app: its plate
    # should sit nearly flush with light --paper because the card frame supplies
    # the separation, so it carries a CEILING that forbids standing out. §4.7
    # asks for the opposite — "the shelf stays quiet so the patches can be loud",
    # an object deliberately unlike the calm chrome around it. Being visibly
    # distinct from the page is the expected outcome here, not a failure mode, so
    # there is no ceiling at all and the floor only asks that the patch is never
    # literally invisible against either --paper.
    #
    # Measured over the CENTRAL 60%, not the whole image and not the margin. The
    # margin is bare twill at 2.5% relative luminance and the dark theme's paper
    # is 1.0% — a whole-image mean would report the substrate and fail every
    # correct badge, because the substrate genuinely is nearly the same colour as
    # dark --paper. What the shelf actually shows at 40 px is dominated by the
    # patch, and the patch is the thing that must not vanish.
    m60 = int(w * 0.20)
    patch_lums = [
        rel_luminance(px[x, y][:3])
        for y in range(m60, h - m60, 2)
        for x in range(m60, w - m60, 2)
    ]
    patch_lum = mean(patch_lums)
    c_light = contrast_l(patch_lum, rel_luminance(PAPER_LIGHT))
    c_dark = contrast_l(patch_lum, rel_luminance(PAPER_DARK))
    # (guess, 0 badges): floor 1.50 against each --paper, no ceiling.
    problems = []
    if c_light < 1.50:
        problems.append(f"vs light paper {c_light:.2f} < 1.50")
    if c_dark < 1.50:
        problems.append(f"vs dark paper {c_dark:.2f} < 1.50")
    rep.hard(
        "5 visible in both themes",
        not problems,
        (f"patch lum {patch_lum * 100:.1f}% rel | vs #C9E9FB {c_light:.2f} | "
         f"vs #0E1B26 {c_dark:.2f} (both ≥1.50, no ceiling — §4.7 wants it loud)")
        + (f" — {'; '.join(problems)}" if problems else ""),
    )

    # 6 — signature-thread share (advisory). The reference's vermilion check
    # under a new name and a new hue window; same tiny-mark philosophy, same
    # reason for staying advisory: a global hue share measures warmth, not
    # intent. A badge can clear this band with its signature mark in entirely the
    # wrong PLACE — that is what LOOK AT IT is for. It does one honest job
    # anyway: 0.00% means there is no second pass at all, and a double-digit
    # percentage means the whole subject got stitched in it.
    lo_hue, hi_hue = SIGNATURE_HUE
    sig = 0
    for y in range(256):
        for x in range(256):
            r, g, b = sp[x, y][:3]
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if lo_hue <= hh * 360 <= hi_hue and ss > 0.45 and vv > 0.35:
                sig += 1
    sig_pct = 100.0 * sig / total
    # (guess, 0 badges): 0.02–3.00%. The floor is deliberately tiny — the scene
    # lines each name ONE SMALL MARK (a nose, a pin, a bubble, an ember), and
    # 0.15% of a 1024² image is ~1600 pixels, which is a mark far larger than any
    # of those. The reference set exactly that floor without measuring and
    # warned on seven of thirteen badges.
    rep.soft("6 signature-thread share", 0.02 <= sig_pct <= 3.0,
             f"{sig_pct:.2f}% in hue {lo_hue:.0f}–{hi_hue:.0f}° "
             f"(want 0.02–3.00; 0.00 means no second pass at all)")

    # 7 — legibility at shelf size (advisory). Survives unchanged in mechanism:
    # the stdev of a 40 px grayscale thumbnail has nothing style-specific in it,
    # it measures "does this collapse into visual mush", and that question is
    # equally worth asking of a stitched patch.
    #
    # (guess, 0 badges): ≥18.0, where the reference's re-derived floor is 16.0. A
    # raised satin-stitch patch under a raking light carries more inherent local
    # contrast — every stitch row is a highlight beside a shadow — than a flat
    # line engraving does, so a genuinely mushy candidate here may clear 16
    # without being legible. Guessed slightly higher for that reason; re-derive.
    tiny = img.resize((40, 40), Image.LANCZOS).convert("L")
    tsd = stdev(list(tiny.tobytes()))
    rep.soft("7 legibility at 40px", tsd >= 18.0,
             f"stddev {tsd:.1f} sRGB (≥18.0) — dissolves at shelf size below this")

    # 8 — composition safety (bounding box hard, margin advisory).
    grid = foreground_map(img, substrate_rgb)
    box = foreground_box(grid)
    n = len(grid)
    if box is None:
        rep.hard("8a patch centred", False,
                 "no foreground found — there is no patch to measure. Either the "
                 "image is bare cloth, or the whole frame is patch and the "
                 "FULL BLEED margin rule was ignored")
        box_w = None
    else:
        x0, y0, x1, y1 = box
        box_w = (x1 - x0 + 1) / n
        box_h = (y1 - y0 + 1) / n
        cx = (x0 + x1) / 2.0
        cy = (y0 + y1) / 2.0
        c = (n - 1) / 2.0
        off = math.hypot(cx - c, cy - c) / n
        # (guess, 0 badges): ≤4.00% off centre. Inherited from the reference's
        # 3.5% and widened a little because a bounding box on a chevron is a
        # coarser instrument than a harmonic fit on a circle. An off-centre patch
        # is visible the moment two badges sit in a list, which is the whole
        # reason this is hard rather than advisory.
        rep.hard("8a patch centred", off <= 0.040,
                 f"{off * 100:.2f}% off centre (≤4.00), box {box_w * 100:.1f}%×"
                 f"{box_h * 100:.1f}% of frame")
        cen = foreground_centroid(grid)
        if cen:
            dm = math.hypot(cen[0] - cx, cen[1] - cy) / n * 100
            rep.note("8c interior balance",
                     f"mass centroid sits {dm:.2f}% from the box centre — a "
                     f"composition note, never a rejection; a fanned tail or a "
                     f"one-sided subject loads this legitimately")

    # 8b — outer margin quiet. INVERTS ITS DIRECTION, same as check 3: the
    # reference wants the margin's stdev LOW because flat paper is correct there;
    # this deck wants it non-trivially present but bounded, because visible weave
    # is correct and visible clutter is not. A floor and a ceiling, not a ceiling
    # alone. (guess, 0 badges): 1.2–14.0 sRGB.
    m = max(1, int(round(min(w, h) * 0.06)))
    marg = []
    for y in range(h):
        edge_row = y < m or y >= h - m
        for x in range(0, w, 2):
            if edge_row or x < m or x >= w - m:
                marg.append(grey(px[x, y][:3]))
    msd = stdev(marg)
    rep.soft("8b outer margin", 1.2 <= msd <= 14.0,
             f"stddev {msd:.2f} sRGB (want 1.2–14.0 — weave present, clutter absent)")

    # 9 — anchor agreement. The quantity that decides whether 22 objects are one
    # set. Badges here are NOT near-identical objects the way the reference's
    # thirteen seals were — four different outer silhouettes, by contract — so
    # what the anchor guarantees is narrower and the bands are wider: one bolt of
    # cloth, one border weight, one patch size. Not one shape.
    if box_w is None:
        rep.note("9 patch width", "no foreground found")
    else:
        rep.note("9 patch width", f"{box_w * 100:.1f}% of image width "
                                  f"(style block asks for ~80%)")

    if anchor_stats is None:
        rep.note("9 anchor agreement",
                 "no anchor on disk at the path --anchor names — this is an "
                 "ANCHOR RUN, or the anchor has not been promoted yet")
    else:
        a_w, a_grey, a_small = anchor_stats
        if box_w is None or a_w is None:
            rep.hard("9a patch width vs anchor", False,
                     "no foreground found in the candidate or in the anchor")
        else:
            drift = abs(box_w - a_w) / a_w * 100
            # (guess, 0 badges): ≤8.0% drift, double the reference's re-derived
            # ±4.0. That tool's badges share ONE circle radius by contract; these
            # share only "about 80 percent of the image width" across a shield, a
            # hexagon, a chevron and a rounded triangle. A chevron's bounding box
            # is wider than its visual mass and a shield's is narrower, and that
            # spread is correct rather than drift. Re-derive at six — and if the
            # observed spread turns out to cluster by SHAPE rather than scatter,
            # the right fix is a per-shape expectation, not a wider band.
            rep.hard("9a patch width vs anchor", drift <= 8.0,
                     f"{box_w * 100:.1f}% vs anchor {a_w * 100:.1f}% "
                     f"— {drift:.1f}% drift (≤8.0)")

        # (guess, 0 badges): ≤8.0 sRGB grey points. "Are all 22 badges stitched
        # on the same shade of the same fabric" is exactly what the anchor exists
        # to guarantee, and it is the one check here that needs no conceptual
        # change from the reference's 9b — only a different baseline and a
        # different unit.
        dg = abs(substrate_grey - a_grey)
        rep.hard("9b twill tone vs anchor", dg <= 8.0,
                 f"{substrate_grey:.1f} vs anchor {a_grey:.1f} sRGB "
                 f"— {dg:.1f} points (≤8.0)")

        dists = []
        for y in range(0, 256, 4):
            for x in range(0, 256, 4):
                dists.append(math.dist(sp[x, y][:3], a_small[x, y][:3]))
        # (guess, 0 badges): ≤60.0, up from the reference's 40.0. Five saturated
        # threads on a shared substrate differ from each other far more than two
        # flat inks on shared paper do. Loose by design either way — the subjects
        # are SUPPOSED to differ, and this only catches a badge that shares
        # nothing with the deck at all.
        rep.soft("9c mean colour distance", mean(dists) <= 60.0,
                 f"{mean(dists):.1f} (≤60.0, loose by design — the subjects are "
                 f"supposed to differ)")

    # 10 — weave texture presence (advisory). NEW. No analogue in the reference
    # tool, because its substrate is flat by contract and this one explicitly is
    # not (§4.7, "visible weave"). Check 3's stdev asks whether the margin varies
    # AT ALL; this asks whether it varies at the right SCALE. A smooth gradient
    # across the margin — a vignette, a soft studio falloff — gives check 3 a
    # healthy stdev while being the opposite of woven cloth, and a high-pass
    # residual is blind to it by construction: subtract each pixel's own 3×3
    # neighbourhood mean and only stitch-scale variation survives.
    #
    # Three outcomes worth telling apart, which is why the band has both ends:
    #   ~0     a flat digital navy fill — the sticker failure, the thing SKILL.md
    #          calls this style's single most likely quiet drift
    #   0.5–5  woven cloth under a raking light
    #   >5     visual noise, JPEG mush or a genuinely busy margin
    # (guess, 0 badges): 0.40–6.00.
    hp = []
    step = 3
    for y in range(m + 2, h - m - 2, step):
        for x in range(2, w - 2, step):
            if not (x < m or x >= w - m):
                continue  # left and right margins only; top/bottom join below
            hp.append(_highpass(px, x, y))
    for y in list(range(2, m - 2, step)) + list(range(h - m + 2, h - 2, step)):
        for x in range(2, w - 2, step):
            hp.append(_highpass(px, x, y))
    weave = math.sqrt(mean([v * v for v in hp])) if hp else 0.0
    rep.soft("10 weave texture", 0.40 <= weave <= 6.00,
             f"high-pass rms {weave:.2f} sRGB (want 0.40–6.00; near 0 is a flat "
             f"digital fill, not cloth)")

    return img, substrate_rgb, substrate_grey, box_w


def _highpass(px, x, y):
    """|this pixel − the mean of its 3×3 neighbourhood|, in sRGB grey."""
    here = grey(px[x, y][:3])
    around = 0.0
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            around += grey(px[x + dx, y + dy][:3])
    return abs(here - around / 9.0)


# --------------------------------------------------------------------------- #
# LOOK AT IT — the three crops
# --------------------------------------------------------------------------- #

def write_theme_strip(img, out: Path):
    """The badge at 40px and 220px, on light --paper and on dark --paper.

    This exists so that "view the asset at its real rendered size" is enforced by
    the artefact rather than requested in prose. At 1024 every stitch looks
    considered, and the app never draws it at 1024 — `BadgeShelf` draws it at 56
    css px in a row and a panel draws it at about 220.

    The shelf's own 2px border and rounded corner are not drawn here on purpose:
    the question this strip answers is whether the PATCH separates from the page
    on its own, before any chrome helps it.
    """
    pad, gap = 32, 32
    sizes = [40, 220]
    row_h = max(sizes) + pad * 2
    W = sum(sizes) + gap + pad * 2

    # Two full-width rows, each its own theme's --paper, stacked. Building the
    # rows whole is what keeps the dark cell's background exactly #0E1B26 rather
    # than whatever a partial paste happened to leave behind.
    strip = Image.new("RGB", (W, row_h * 2))
    for row, bg in enumerate([PAPER_LIGHT, PAPER_DARK]):
        band = Image.new("RGB", (W, row_h), bg)
        x = pad
        for s in sizes:
            band.paste(img.resize((s, s), Image.LANCZOS), (x, (row_h - s) // 2))
            x += s + gap
        strip.paste(band, (0, row * row_h))
    strip.save(out)
    return out


def write_ring_crop(img, box_w, out: Path):
    """The patch's edge, unrolled, in four stacked quarters at 2×.

    Lettering is the single most likely reason a badge burns its three attempts,
    and on a real 1970s patch the club name goes ALL THE WAY ROUND — so a corner
    crop cannot find it. Unrolling turns "read an edge" into "read a line", which
    is the only form in which a ring of half-formed serifs is obviously a ring of
    half-formed serifs.

    KEPT THE REFERENCE'S NAME, CHANGED ITS BAND. There is no ring here: the outer
    silhouette is a shield, a hexagon, a chevron or a rounded triangle, so a
    fixed-radius annulus would cross the merrowed border at some angles and miss
    it entirely at others. The band runs from 1.06× down to 0.70× of the
    bounding-box half-width — wide enough that a chevron's deep notch and a
    hexagon's flats are both inside it — and the magnification drops from the
    reference's 3× to 2× to keep the sheet a sane size at that width.

    NOT a verdict. There is no OCR here (see NOT_MEASURED); this is evidence for
    a human or a model to read.
    """
    w, h = img.size
    px = img.load()
    cx = cy = (w - 1) / 2.0
    half = (box_w if box_w else 0.80) * w / 2.0
    r_out = min(half * 1.06, cx - 1)
    r_in = half * 0.70

    steps = int(2 * math.pi * r_out)
    band = max(8, int(round(r_out - r_in)))
    flat = Image.new("RGB", (steps, band))
    fp = flat.load()
    for i in range(steps):
        theta = 2 * math.pi * i / steps - math.pi / 2  # start at 12 o'clock
        ct, st = math.cos(theta), math.sin(theta)
        for j in range(band):
            rr = r_out - j
            x = int(round(cx + rr * ct))
            y = int(round(cy + rr * st))
            fp[i, j] = px[min(max(x, 0), w - 1), min(max(y, 0), h - 1)][:3]

    quarters = 4
    qw = steps // quarters
    scale = 2
    label = 6
    QW, QH = qw * scale, band * scale
    sheet = Image.new("RGB", (QW, (QH + label) * quarters), PAPER_LIGHT)
    for q in range(quarters):
        piece = flat.crop((q * qw, 0, (q + 1) * qw, band)).resize(
            (QW, QH), Image.LANCZOS
        )
        sheet.paste(piece, (0, q * (QH + label)))
    sheet.save(out)
    return out


def write_centre_crop(img, box_w, out: Path):
    """The subject at 2×, which is where anatomy hides.

    A groundhog's paws, a gremlin's grin and a rooster's comb are the most common
    failure of these models and every one of them is invisible at 40 px, which
    means it survives exactly the review that checked everything else. This crop
    is also where the stitch question is settled: satin rows with a lit edge and
    a shadowed edge, or a smooth airbrushed fill.
    """
    w, _ = img.size
    r = (box_w if box_w else 0.80) * w / 2.0 * 0.80
    c = (w - 1) / 2.0
    box = (int(c - r), int(c - r), int(c + r), int(c + r))
    crop = img.crop(box)
    crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
    crop.save(out)
    return out


# --------------------------------------------------------------------------- #

NOT_MEASURED = """\
  NOT MEASURED — TEXT. There is no OCR on this machine and no dependency worth
  adding for one script. The one cheap proxy that suggests itself — counting
  small bright connected components around the patch edge, on the theory that a
  ring of letters produces 15–40 similar blobs at regular spacing — is BLIND BY
  CONSTRUCTION here, because the style block asks for a merrowed border: a dense,
  regular, tight overlock zigzag in bone thread, in exactly that band, producing
  exactly that signature. It is this deck's equivalent of the reference's
  lozenge-and-dot chain, and it fails for the identical reason.
  Read the .ring.png. Any lettering at all is an instant reject."""


def anchor_statistics(anchor=ANCHOR):
    if not anchor.exists():
        return None
    a = Image.open(anchor).convert("RGB")
    ap = a.load()
    a_rgb, a_grey, _ = substrate_stats(ap, a.width, a.height)
    a_box = foreground_box(foreground_map(a, a_rgb))
    a_w = None
    if a_box:
        n = 256
        a_w = (a_box[2] - a_box[0] + 1) / n
    return a_w, a_grey, a.resize((256, 256), Image.BILINEAR).load()


def die(message) -> NoReturn:
    sys.exit(f"error: {message}")


def main():
    parser = argparse.ArgumentParser(
        description="Measure a badge candidate and write the three crops to look at."
    )
    parser.add_argument("image", type=Path)
    parser.add_argument("--no-crops", action="store_true",
                        help="measure only; skip the three PNGs")
    parser.add_argument("--no-anchor", action="store_true",
                        help="skip check 9; for a synthetic control, which is not "
                             "a deck member")
    parser.add_argument("--anchor", type=Path, default=ANCHOR,
                        help="the deck anchor check 9 compares against")
    args = parser.parse_args()

    if not args.image.exists():
        die(f"no such file: {args.image}")

    print(f"\n{args.image}")
    print("-" * 76)
    rep = Report()
    stats = None if args.no_anchor else anchor_statistics(args.anchor)
    img, _, _, box_w = measure(args.image, rep, stats)

    if not args.no_crops:
        stem = args.image.with_suffix("")
        print("\n  LOOK AT IT — read all three before forming an opinion:")
        print(f"    {write_theme_strip(img, Path(f'{stem}.themes.png'))}"
              "   40px and 220px, light and dark --paper")
        print(f"    {write_ring_crop(img, box_w, Path(f'{stem}.ring.png'))}"
              "     the patch edge unrolled, 4 quarters at 2×")
        print(f"    {write_centre_crop(img, box_w, Path(f'{stem}.centre.png'))}"
              "   the subject at 2×")

    print("\n" + NOT_MEASURED)
    print("-" * 76)
    if rep.hard_failures:
        print(f"REJECT — {len(rep.hard_failures)} hard check(s) failed: "
              f"{', '.join(rep.hard_failures)}")
        if rep.warnings:
            print(f"         warnings: {', '.join(rep.warnings)}")
        sys.exit(1)
    if rep.warnings:
        print(f"hard checks passed; {len(rep.warnings)} warning(s): "
              f"{', '.join(rep.warnings)}")
    else:
        print("all measurements inside their bands.")
    print("The exit code is not the verdict. Judge from the crops, "
          "against SKILL.md step 5.")


if __name__ == "__main__":
    main()
