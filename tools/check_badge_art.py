#!/usr/bin/env python3
"""Measure one badge candidate, and write the three crops a human has to look at.

    python3 tools/check_badge_art.py assets/badges/_candidates/early_bird.a01.png

Design record: docs/plans/F10-badge-art-skill.md §5.2 and §5.3.

TEN measurements — the reference tool's nine, rebuilt for navy twill, plus one
that has no analogue there (check 10, weave texture) because the reference
substrate is flat by contract and this one explicitly is not. Hard checks set the
exit code; advisory ones only print.

  EVERY BAND WAS A GUESS, AND ALL OF THEM HAVE NOW BEEN RE-DERIVED ONCE, from
  the six approved shields (early_bird, self_reward, sandbagger, century_club,
  new_ceiling, dawn_patrol) under style v2 — F10 §9 task 12, done at exactly the
  six the rule names and not before. Each band below carries
  `(observed, 6 badges, v2)` and the range it was drawn from.

  Four bands had been firing on EVERY candidate — check 3's margin sd, 8b, 10,
  and check 6 on two of six — because they were guessed for a substrate nobody
  had seen yet. Real navy twill under a hard raking light is far more textured
  than the guess allowed: margin sd ran 11.3-23.1 against a guessed ceiling of
  16.0, and weave rms ran 10.1-11.1 against a guessed 6.0. A threshold that
  fails on every good candidate is the threshold somebody comments out, which is
  why the rule says re-derive at six rather than never.

  DO NOT RE-DERIVE AGAIN FROM ONE NEW SAMPLE. A later session adding badge 23
  should NOT move a band because that badge sat outside it; the whole point of
  waiting for six was that a distribution, not a candidate, sets a threshold.
  The next honest re-derivation is at all 22, if the spread by then warrants it.

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
import re
import sys
from collections import namedtuple
from pathlib import Path
from typing import NoReturn

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(Path(__file__).resolve().parent))
from decks import add_deck_argument, deck_for  # noqa: E402

# Both decks share one anchor, deliberately — check 9b measures twill-tone drift
# against it, and the premise of the two decks is that they are one bolt of
# cloth. `--deck` is still threaded through rather than hardcoded here, so that
# the day a deck does need its own anchor, `decks.py` is the one place it says
# so. See that file's header.
ANCHOR = deck_for(None).anchor_path()

# 4:3, NOT square, and the ratio is the load-bearing half.
#
# F10 shipped 1024² masters against a `BadgeDialog` band that is `aspect-[4/3]`,
# so the dialog drew the square art `h-full w-auto` and painted the ~12.5% of
# band either side with the MEAN of the master's outer frame. That mean cannot be
# right: the style block's light rakes from the upper LEFT, so every master's
# left edge is lighter than its right — measured across all 22 as up to 12.4
# sRGB apart (two_a_days; boring_excellence 9.8, century_club 8.5) — and one flat
# colour lands between the two, wrong at BOTH seams. The twill's diagonal weave
# grain has no flat-fill equivalent either, so the seam showed as
# texture-stops-here even where the value matched.
#
# So the master is now the band's own shape and the dialog paints nothing.
# `tools/extend_badge_art.py` is what converted the deck, and its header carries
# the full argument.
MASTER_W, MASTER_H = 1024, 768

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
# Outer shape, and why check 9a has to know it
# --------------------------------------------------------------------------- #
#
# 9a asks "is this patch the same SIZE as the rest of the deck", and it measures
# that as the width of the foreground bounding box. That is exact for a deck
# where every badge shares one silhouette — the tool this descends from has
# thirteen circular seals — and it is a category error here, because §4.7 gives
# this deck four different outer shapes ON PURPOSE. A regular hexagon presents
# its points left and right and fills its bounding box; a shield tapers away
# from its widest line. Two patches that a human would call the same size do not
# have the same bounding-box width, and the difference is the shape's, not
# drift's.
#
# The deck said so as soon as the second family arrived:
#
#   shield           80.1  80.5  81.6  82.4  80.9  80.5     mean 81.0, spread 2.3
#   rounded triangle 76.2  84.4  76.2  75.8  76.6  77.7     mean 77.8, spread 8.6
#   hexagon          87.1  87.5  88.7  85.2  87.9           mean 87.3, spread 3.5
#   chevron          84.0  81.2  85.2  86.3  85.2           mean 84.4, spread 5.1
#
# The two hexagons land 0.4 points apart — as tight a cluster as the deck has —
# and seven points clear of every shield. Measured against a shield anchor they
# both "drifted" 8.8% and 9.3%. Nothing drifted.
#
# So 9a compares a candidate against the expectation FOR ITS OWN SHAPE, read out
# of style.md's scene line (`SHAPE: hexagon`), keyed on the candidate's filename.
# This is the fix the re-derivation comment named in advance — "if the observed
# spread turns out to cluster by SHAPE rather than scatter, the right fix is a
# per-shape expectation, not a wider band" — and it is why the band is NOT being
# widened to paper over the difference.
#
# All four are now (observed, 22 badges, v2). The chevron entry shipped as a
# geometric ESTIMATE of 0.850 with no images behind it; its family came in at a
# mean of 84.4, so the guess was high by 0.6 points — the one number in this file
# a pure geometric argument got essentially right, recorded because the other
# three guesses were not close.
# A BAND CARRIES ITS PROVENANCE, AND 9a READS IT.
#
# The four shapes above are `(observed, 22 badges, v2)` — a real distribution
# behind every number. F25's `pentagon` is not: it is one deck old and its band
# is pure geometry, the way `chevron`'s 0.850 was before its family arrived (and
# that guess came in 0.6 points high, the only one of the four a geometric
# argument got essentially right).
#
# A guessed band must not set the exit code. This file's own header says why —
# "A threshold that fails on every good candidate is the threshold somebody
# comments out" — and a hard gate on a guess covering an ENTIRE new deck is that
# failure at its worst, because there is no good candidate to disprove it with
# yet. So `observed == 0` makes 9a advisory and says loudly that it is; every
# already-observed shape stays hard, and the badge deck's gate does not weaken
# by a single point.
#
# THE GUESS IS NOT MEANT TO SURVIVE. F25's last step re-derives `pentagon` from
# all ten promoted records and sets `observed=10`, at which point 9a goes hard
# for records too. That is this file's own rule — a distribution, not a
# candidate, sets a threshold — applied to a new deck instead of deferred.
Band = namedtuple("Band", "width observed")

SHAPE_WIDTH = {
    "shield": Band(0.810, observed=22),
    "rounded triangle": Band(0.778, observed=22),
    "hexagon": Band(0.873, observed=22),
    "chevron": Band(0.844, observed=22),
    # F25, records deck. Shipped as a geometric estimate of 0.855 — a pentagon's
    # widest chord fills its bounding box the way a hexagon's points do while its
    # apex tapers like a shield's shoulders, so it should land between the two —
    # and re-derived here from all ten promoted records the same session, which
    # is the point of the `observed` field. The guess was 4.3% low.
    #
    #   longest_distance 0.807   most_kcal        0.875   longest_duration 0.932
    #   highest_cadence  0.864   fastest_km_split 0.885   fastest_pace_10k 0.964
    #   best_paced_run   0.869   fastest_pace_5k  0.901   most_elevation   0.964
    #   highest_max_hr   0.869
    #
    # THE PENTAGON FAMILY IS THE WIDEST-SPREAD IN EITHER DECK: 15.7 points,
    # against hexagon 3.5, shield 2.3, chevron 5.1 and rounded triangle 8.6. That
    # is a property of the SCENES rather than of the shape — this deck ranges from
    # a kite filling only the upper half to a cable car spanning the full width,
    # where the badge deck's scenes are more uniformly massed. The worst member
    # (`longest_distance`, 9.7% from the mean) therefore sits just inside the ±10%
    # tolerance, and the tolerance is NOT widened to give it room: it passes, and
    # an eleventh record that misses is exactly what this check is for.
    "pentagon": Band(0.893, observed=10),
}
# ±10%, which passes every promoted badge (worst: redline_republic, a genuinely
# wide rounded triangle at 8.5% from its family mean) and still catches a gross
# size error — double_century's rejected squat first attempt sat 16.5% out.
SHAPE_WIDTH_TOLERANCE = 10.0

SHAPE_RE = re.compile(r"^- ([a-z0-9_]+): .*?SHAPE:\s*([a-z ]+?)\s*\.", re.M)
CONTRACT = ROOT / ".claude" / "skills" / "generate-badge" / "style.md"


def shape_for(path: Path):
    """The outer shape style.md assigns this candidate, or None.

    The key comes from the filename — `early_bird.a03.png` and `early_bird.png`
    both key on `early_bird` — which is why the promotion step's naming matters
    to more than tidiness. A file this cannot key is not an error: check 9a falls
    back to the anchor comparison and says which one it used.
    """
    if not CONTRACT.exists():
        return None
    key = path.name.split(".")[0]
    for k, shape in SHAPE_RE.findall(CONTRACT.read_text(encoding="utf-8")):
        if k == key:
            return shape if shape in SHAPE_WIDTH else None
    return None


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

def substrate_stats(px, w, h, box=None):
    """The bare twill, sampled from the frame OUTSIDE the patch.

    Taking the substrate from a frame rather than from "the darkest pixels" is
    what keeps a badge with a large dark interior from measuring its own subject
    and calling it the fabric. But a FIXED frame only works while the patch is
    the size the style block asks for, and this one measured six generations
    before that assumption broke:

        badge                box (w × h)      9b drift
        early_bird  a03      80.1% × 89.1%     (anchor)
        self_reward a03      80.5% × 89.1%      1.9  PASS
        sandbagger  a01      80.5% × 89.5%      3.8  PASS
        sandbagger  a03      81.6% × 95.7%      7.7  PASS, only just
        century_club a02     82.4% × 95.3%      8.5  FAIL
        century_club a03     81.6% × 96.1%      9.6  FAIL

    Width barely moves; HEIGHT is what tracks the drift. A patch 96% tall
    reaches into the outer 5% frame on the top and bottom edges, so the "twill"
    sample is part bone merrowed border and part slate field — and it reports
    the cloth as several points lighter than it is. That is the instrument
    reading the subject, which is precisely the fault the tool this descends
    from corrected twice in its own centre-offset check. **It is a correctness
    fix, not a band loosened because it fired**: the bands are untouched, and a
    candidate whose twill is genuinely pale still fails.

    So: pass the foreground box and this samples the margin strictly outside it,
    with the 5% frame as a floor so a modest patch measures exactly what it
    always did. `box` is in 256-grid units; None keeps the old fixed frame, which
    is what the first pass needs before any box has been found.

    Returns (mean_rgb, mean_grey_srgb, median_rel_luminance).
    """
    if box is not None:
        n = 256
        x0, y0, x1, y1 = box
        # The smallest gap between the patch and any edge, minus a two-pixel
        # guard for the contact shadow the style block asks the patch to cast.
        gap = min(x0, y0, n - 1 - x1, n - 1 - y1) / n
        band = max(1, int(round(min(w, h) * max(0.02, gap - 2 / n))))
    else:
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
    shape = shape_for(path)
    img = Image.open(path)
    raw_mode = img.mode
    w, h = img.size

    # 1 — geometry (hard). Survives the medium change unchanged: the master
    # canvas size has nothing to do with paper or thread. It is also the check
    # that catches gen_badge_art.py's `resolution` field being dropped, which
    # returns a 2048² master AFTER the money is spent.
    rep.hard(
        "1 geometry",
        (w, h) == (MASTER_W, MASTER_H),
        f"{w}×{h}, ratio {w / h:.4f} "
        f"(want {MASTER_W}×{MASTER_H}, {MASTER_W / MASTER_H:.4f})",
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
    # All four numbers in sRGB grey (0–255). #1B2A44 is 40.5 on flat cloth; the
    # rendered twill sits darker because the raking light shades most of it.
    #
    # (observed, 6 badges, v2): level 22.1–31.6, spread 4.7–7.7, sd 11.3–23.1,
    # warmth −35.0 to −40.0.
    #
    # THE SD CEILING IS THE ONE THAT MOVED, and it moved because it was wrong:
    # guessed at 16.0 with no images in hand, it rejected all six approved
    # badges. Real twill under this light is a coarse, high-contrast weave. The
    # FLOOR is what earns its keep here — 4.0 still catches the flat-fill
    # "sticker" control at 0.5 with a factor of eight to spare, and that failure
    # is the one this check exists for.
    strips = edge_strips(px, w, h)
    means = [s[0] for s in strips.values()]
    spread = max(means) - min(means)
    bad = []
    for name, (m, sd, warm) in strips.items():
        if not (16.0 <= m <= 52.0):
            bad.append(f"{name} grey {m:.1f}")
        if sd < 4.0:
            bad.append(f"{name} sd {sd:.1f} — flat, no weave")
        if sd > 30.0:
            bad.append(f"{name} sd {sd:.1f} — cluttered")
        if warm > -15.0:
            bad.append(f"{name} warmth {warm:.1f} — not a cool navy")
    if spread > 14.0:
        bad.append(f"spread {spread:.1f}")
    sds = [s[1] for s in strips.values()]
    rep.hard(
        "3 twill margin",
        not bad,
        (f"grey {min(means):.1f}–{max(means):.1f} sRGB (want 16–52), spread "
         f"{spread:.1f} (≤14.0), sd {min(sds):.1f}–{max(sds):.1f} (4.0–30.0), "
         f"warmth {max(s[2] for s in strips.values()):.1f} (≤−15, i.e. cool)")
        + (f" — {'; '.join(bad)}" if bad else ""),
    )

    # TWO PASSES, for the reason substrate_stats' docstring gives: the box is
    # needed to sample the cloth, and an estimate of the cloth is needed to find
    # the box. The first pass uses the fixed 5% frame; if that frame turns out
    # to be clear of the patch the second pass reproduces it exactly, so a
    # normally-sized badge measures what it always did.
    substrate_rgb, _, _ = substrate_stats(px, w, h)
    grid = foreground_map(img, substrate_rgb)
    box = foreground_box(grid)
    substrate_rgb, substrate_grey, substrate_lum = substrate_stats(px, w, h, box)

    # 4 — palette agreement (hard). The colorimetry is the reference's and is
    # sound; the token list is this deck's seven, and the "unauthorised
    # blue/violet" guard is DELETED rather than re-tuned (see the header).
    #
    # (observed, 6 badges, v2): 91.0–96.6% within ΔE76 30. The tolerance of 30
    # held on first contact and is left alone; the percentage floor rises from a
    # guessed 65 to 80, which still clears the worst approved badge by 11 points.
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
    rep.hard("4 palette agreement", near_pct >= 80.0,
             f"{near_pct:.1f}% within ΔE76 30 of one of the 7 style-block "
             f"colours (≥80.0)")

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
    # (observed, 6 badges, v2): patch lum 16.4–22.5% rel; contrast 2.77–3.83
    # against light --paper and 3.09–4.96 against dark. The 1.50 floor is left
    # exactly where it was: it is an INVISIBILITY floor, not a style band, and
    # every approved badge clears it with room to spare. Raising it toward the
    # observed minimum would convert a safety check into a taste check.
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
    # (observed, 6 badges, v2): 2.02–4.12%. The ceiling rises from a guessed
    # 3.00 to 6.00. `dawn_patrol` is why: its scene makes the LIGHTHOUSE BEAM
    # the signature, and a wedge of light is inherently a larger mark than a
    # nose, a pin or a bubble — 4.12% is that scene working, not failing. The
    # ceiling still catches a badge stitched entirely in orange.
    # The floor is deliberately tiny — the scene
    # lines each name ONE SMALL MARK (a nose, a pin, a bubble, an ember), and
    # 0.15% of a 1024² image is ~1600 pixels, which is a mark far larger than any
    # of those. The reference set exactly that floor without measuring and
    # warned on seven of thirteen badges.
    rep.soft("6 signature-thread share", 0.02 <= sig_pct <= 6.0,
             f"{sig_pct:.2f}% in hue {lo_hue:.0f}–{hi_hue:.0f}° "
             f"(want 0.02–6.00; 0.00 means no second pass at all)")

    # 7 — legibility at shelf size (advisory). Survives unchanged in mechanism:
    # the stdev of a 40 px grayscale thumbnail has nothing style-specific in it,
    # it measures "does this collapse into visual mush", and that question is
    # equally worth asking of a stitched patch.
    #
    # (observed, 6 badges, v2): 51.3–55.2, which is three times the guessed
    # floor and confirms the guess's direction outright. Raised to 30.0 — still
    # far below every approved badge, and far above the mush regime a floor
    # exists to catch.
    # Guessed at ≥18.0, where the reference's re-derived floor is 16.0. A
    # raised satin-stitch patch under a raking light carries more inherent local
    # contrast — every stitch row is a highlight beside a shadow — than a flat
    # line engraving does, so a genuinely mushy candidate here may clear 16
    # without being legible. Guessed slightly higher for that reason; re-derive.
    tiny = img.resize((40, 40), Image.LANCZOS).convert("L")
    tsd = stdev(list(tiny.tobytes()))
    rep.soft("7 legibility at 40px", tsd >= 30.0,
             f"stddev {tsd:.1f} sRGB (≥30.0) — dissolves at shelf size below this")

    # 8 — composition safety (bounding box hard, margin advisory). `grid` and
    # `box` were computed above, because the substrate sample depends on them.
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
        # (observed, 6 badges, v2): 0.20–1.14% off centre. Tightened from a
        # guessed 4.00 to 3.00 — the only band that got STRICTER, and it can
        # afford to: the worst approved badge sits at a third of it, and the
        # synthetic off-centre control is caught at 9.51% either way.
        # Inherited from the reference's
        # 3.5% and widened a little because a bounding box on a chevron is a
        # coarser instrument than a harmonic fit on a circle. An off-centre patch
        # is visible the moment two badges sit in a list, which is the whole
        # reason this is hard rather than advisory.
        rep.hard("8a patch centred", off <= 0.030,
                 f"{off * 100:.2f}% off centre (≤3.00), box {box_w * 100:.1f}%×"
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
    # alone. (observed, 6 badges, v2): 15.4–42.4 sRGB — every approved badge was
    # over the guessed 14.0 ceiling, for the same reason check 3's sd was. The
    # spread here is wide because this band samples six percent of the frame and
    # a tall patch loads it; 5.0–55.0 keeps the flat-fill floor meaningful (the
    # control reads 0.9) without firing on real cloth.
    m = max(1, int(round(min(w, h) * 0.06)))
    marg = []
    for y in range(h):
        edge_row = y < m or y >= h - m
        for x in range(0, w, 2):
            if edge_row or x < m or x >= w - m:
                marg.append(grey(px[x, y][:3]))
    msd = stdev(marg)
    rep.soft("8b outer margin", 5.0 <= msd <= 55.0,
             f"stddev {msd:.2f} sRGB (want 5.0–55.0 — weave present, clutter absent)")

    # 9 — anchor agreement. The quantity that decides whether 22 objects are one
    # set. Badges here are NOT near-identical objects the way the reference's
    # thirteen seals were — four different outer silhouettes, by contract — so
    # what the anchor guarantees is narrower and the bands are wider: one bolt of
    # cloth, one border weight, one patch size. Not one shape.
    if box_w is None:
        rep.note("9 patch width", "no foreground found")
    else:
        rep.note("9 patch width", f"{box_w * 100:.1f}% of image width "
                                  f"(the style block's ~80% is of a SQUARE frame, "
                                  f"so ~{80 * h / w:.0f}% here)")

    if anchor_stats is None:
        rep.note("9 anchor agreement",
                 "no anchor on disk at the path --anchor names — this is an "
                 "ANCHOR RUN, or the anchor has not been promoted yet")
    else:
        a_w, a_grey, a_small = anchor_stats
        if box_w is None:
            rep.hard("9a patch width", False, "no foreground found in the candidate")
        elif shape:
            # SCALED BY THE FRAME'S OWN ASPECT, and the numbers in SHAPE_WIDTH are
            # NOT re-derived. They were observed as a fraction of image WIDTH on
            # square masters, where a frame's width and its height are the same
            # number — so "the patch that occupies 87.3% of the cloth" was
            # measurable either way and width was simply the one picked. On the
            # 4:3 masters the two stop agreeing, and HEIGHT is the one that
            # matters: `BadgeDialog` draws the master to fill a 4:3 band, so what
            # sets the patch's apparent size in the panel is its height as a
            # fraction of the frame's height. Multiplying by h/w converts the
            # observed number into the same physical patch on a wider frame,
            # which is exactly what `extend_badge_art.py` crops to — the two
            # agree by construction rather than by coincidence.
            #
            # On a square master h/w is 1 and this is the old check unchanged,
            # which is why the conversion is a factor here rather than a second
            # table nobody would keep in step.
            band = SHAPE_WIDTH[shape]
            expected = band.width * h / w
            drift = abs(box_w - expected) / expected * 100
            detail = (f"{box_w * 100:.1f}% vs {shape} expectation "
                      f"{expected * 100:.1f}% — {drift:.1f}% "
                      f"(≤{SHAPE_WIDTH_TOLERANCE:.1f})")
            if band.observed:
                rep.hard("9a patch width vs shape",
                         drift <= SHAPE_WIDTH_TOLERANCE, detail)
            else:
                # Advisory, and loud about why. See the SHAPE_WIDTH comment: the
                # band is a geometric estimate with no images behind it, so it
                # can report drift but must not be the thing that rejects the
                # first candidate that could have corrected it.
                rep.note("9a patch width vs shape (ESTIMATED BAND, not a gate)",
                         f"{detail} — `{shape}` is a guess from 0 images. "
                         f"Judge this one by eye, and re-derive the band once "
                         f"the deck is promoted.")
        elif a_w is not None:
            # No shape on file for this key — fall back to the anchor, and say
            # so, because the two comparisons mean different things.
            drift = abs(box_w - a_w) / a_w * 100
            rep.hard("9a patch width vs ANCHOR (no shape on file)", drift <= 12.0,
                     f"{box_w * 100:.1f}% vs anchor {a_w * 100:.1f}% "
                     f"— {drift:.1f}% drift (≤12.0, loose: shapes differ)")
        else:
            rep.note("9a patch width", "no shape on file and no anchor width")

        # (observed, 6 badges, v2): 0.0–3.6 points, AFTER the sampling fix in
        # `substrate_stats` — before it, the same six read 0.0–9.6 and two
        # failed. Tightened from a guessed 8.0 to 6.0.
        # "Are all 22 badges stitched
        # on the same shade of the same fabric" is exactly what the anchor exists
        # to guarantee, and it is the one check here that needs no conceptual
        # change from the reference's 9b — only a different baseline and a
        # different unit.
        dg = abs(substrate_grey - a_grey)
        rep.hard("9b twill tone vs anchor", dg <= 6.0,
                 f"{substrate_grey:.1f} vs anchor {a_grey:.1f} sRGB "
                 f"— {dg:.1f} points (≤6.0)")

        dists = []
        for y in range(0, 256, 4):
            for x in range(0, 256, 4):
                dists.append(math.dist(sp[x, y][:3], a_small[x, y][:3]))
        # (observed, 6 badges, v2): 43.7–60.0, with century_club landing on the
        # guessed ceiling exactly. Raised to 75.0. Five saturated
        # threads on a shared substrate differ from each other far more than two
        # flat inks on shared paper do. Loose by design either way — the subjects
        # are SUPPOSED to differ, and this only catches a badge that shares
        # nothing with the deck at all.
        rep.soft("9c mean colour distance", mean(dists) <= 75.0,
                 f"{mean(dists):.1f} (≤75.0, loose by design — the subjects are "
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
    #   ~0      a flat digital navy fill — the sticker failure, the thing
    #           SKILL.md calls this style's single most likely quiet drift
    #   10–11   woven cloth under a raking light (the whole approved deck)
    #   >18     visual noise, JPEG mush or a genuinely busy margin
    # (observed, 6 badges, v2): 10.14–11.10 — a remarkably tight cluster, and
    # every approved badge was over the guessed 6.00 ceiling. The guess was
    # simply calibrated to synthetic cloth. 4.00–18.00 brackets the observed
    # cluster with headroom on both sides while still catching the flat digital
    # fill this check exists for, which reads 0.01.
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
    rep.soft("10 weave texture", 4.00 <= weave <= 18.00,
             f"high-pass rms {weave:.2f} sRGB (want 4.00–18.00; near 0 is a flat "
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

def centre_square(img):
    """The master's central square — what `make_badge_assets.py` ships as `small`.

    A no-op on a square master, so nothing that calls this had to learn whether
    the deck had been widened yet.
    """
    w, h = img.size
    if w == h:
        return img
    if w > h:
        return img.crop(((w - h) // 2, 0, (w + h) // 2, h))
    return img.crop((0, (h - w) // 2, w, (h + w) // 2))


def write_theme_strip(img, out: Path):
    """The badge at 40px and 220px, on light --paper and on dark --paper.

    This exists so that "view the asset at its real rendered size" is enforced by
    the artefact rather than requested in prose. At 1024 every stitch looks
    considered, and the app never draws it at 1024 — `BadgeShelf` draws it at 56
    css px in a row and a panel draws it at about 220.

    The shelf's own 2px border and rounded corner are not drawn here on purpose:
    the question this strip answers is whether the PATCH separates from the page
    on its own, before any chrome helps it.

    THE TWO CELLS TAKE DIFFERENT ROUTES OUT OF THE MASTER, because the app does.
    `BadgeShelf`'s tile is square and it draws a square derivative, so the 40px
    cell is a CENTRE SQUARE CROP — the same crop `make_badge_assets.py` writes as
    `small`. `BadgeDialog`'s band is 4:3 and the master now is too, so the panel
    cell keeps the master's aspect at the band's real css size, 360×270. Resizing
    a 4:3 master into a square cell — which this did before the masters changed
    shape — squashes a hexagon into something no reviewer should be asked to
    judge.
    """
    pad, gap = 32, 32
    mark = 40                                  # BadgeShelf, 56 css px, judged smaller
    panel_w = 360                              # BadgeDialog's max-w-[360px] band
    panel_h = round(panel_w * img.height / img.width)
    row_h = max(mark, panel_h) + pad * 2
    W = mark + panel_w + gap + pad * 2

    # Two full-width rows, each its own theme's --paper, stacked. Building the
    # rows whole is what keeps the dark cell's background exactly #0E1B26 rather
    # than whatever a partial paste happened to leave behind.
    square = centre_square(img)
    strip = Image.new("RGB", (W, row_h * 2))
    for row, bg in enumerate([PAPER_LIGHT, PAPER_DARK]):
        band = Image.new("RGB", (W, row_h), bg)
        x = pad
        for src, (cw, ch) in ((square, (mark, mark)), (img, (panel_w, panel_h))):
            band.paste(src.resize((cw, ch), Image.LANCZOS), (x, (row_h - ch) // 2))
            x += cw + gap
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
    # Both axes, separately. This read `cx = cy = (w - 1) / 2` while every master
    # was square, which put the unrolling centre 128 px BELOW the patch on the
    # 4:3 masters — the band then crossed the merrowed border at the top and the
    # bare twill at the bottom, which is a crop that hides the one thing it is
    # for. `r_out` is clamped against the shorter axis for the same reason.
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    half = (box_w if box_w else 0.80) * w / 2.0
    r_out = min(half * 1.06, cx - 1, cy - 1)
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
    w, h = img.size
    r = (box_w if box_w else 0.80) * w / 2.0 * 0.80
    # Per-axis centre, and clamped: this used `(w - 1) / 2` for BOTH coordinates,
    # which on a 4:3 master crops a square from below the subject.
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    r = min(r, cx, cy)
    box = (int(cx - r), int(cy - r), int(cx + r), int(cy + r))
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
    a_rgb, _, _ = substrate_stats(ap, a.width, a.height)
    a_box = foreground_box(foreground_map(a, a_rgb))
    _, a_grey, _ = substrate_stats(ap, a.width, a.height, a_box)
    a_w = None
    if a_box:
        a_w = (a_box[2] - a_box[0] + 1) / 256
    return a_w, a_grey, a.resize((256, 256), Image.BILINEAR).load()


def die(message) -> NoReturn:
    sys.exit(f"error: {message}")


def main():
    parser = argparse.ArgumentParser(
        description="Measure a badge candidate and write the three crops to look at."
    )
    parser.add_argument("image", type=Path)
    add_deck_argument(parser)
    parser.add_argument("--no-crops", action="store_true",
                        help="measure only; skip the three PNGs")
    parser.add_argument("--no-anchor", action="store_true",
                        help="skip check 9; for a synthetic control, which is not "
                             "a deck member")
    parser.add_argument("--anchor", type=Path, default=None,
                        help="the deck anchor check 9 compares against")
    args = parser.parse_args()

    if not args.image.exists():
        die(f"no such file: {args.image}")

    print(f"\n{args.image}")
    print("-" * 76)
    rep = Report()
    anchor = args.anchor or deck_for(args.deck).anchor_path()
    stats = None if args.no_anchor else anchor_statistics(anchor)
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
