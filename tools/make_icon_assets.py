#!/usr/bin/env python3
"""Compose the app icons from the generated silhouette, and write the shipped PNGs.

    python3 tools/make_icon_assets.py                 # both decks
    python3 tools/make_icon_assets.py --deck admin
    python3 tools/make_icon_assets.py --dry-run

    assets/icon/silhouette.png            the chosen candidate from tools/gen_app_icon.py

  deck `app` — the runner's tile, light scheme
      → assets/icon/master.png            1024² composed icon        (committed, inspectable)
      → assets/icon/master-maskable.png   1024² composed, safe-zone  (committed, inspectable)
        → public/icons/icon-192.png            192²   manifest, purpose 'any'
        → public/icons/icon-512.png            512²   manifest, purpose 'any'
        → public/icons/icon-maskable-512.png   512²   manifest, purpose 'maskable'
        → app/icon.png                         512²   Next file convention → <link rel="icon">
        → app/apple-icon.png                   180²   Next file convention → apple-touch-icon

  deck `admin` — `/admin` installed as its own home-screen app, DARK scheme
      → assets/icon/master-admin.png            1024²                (committed, inspectable)
      → assets/icon/master-admin-maskable.png   1024²                (committed, inspectable)
        → public/icons/admin-icon-192.png            192²   manifest, purpose 'any'
        → public/icons/admin-icon-512.png            512²   manifest, purpose 'any'
        → public/icons/admin-icon-maskable-512.png   512²   manifest, purpose 'maskable'
        → app/admin/apple-icon.png                   180²   Next convention, /admin segment only

── WHY THERE ARE TWO DECKS ───────────────────────────────────────────────────────────────────────
Because `/admin` installs as its own home-screen app (`app/admin/manifest.webmanifest/route.ts`,
`start_url: '/admin'`), and two tiles wearing one icon is a worse home screen than one tile. The
admin deck is the SAME silhouette, the SAME five zone colours and the SAME geometry, drawn on the
dark scheme's `--paper` with the figure in the dark scheme's `--ink`. See GROUND_DARK for the
measured reason that is not merely a preference.

There is deliberately NO `app/admin/icon.png`. Next collects the file-convention icons from the
leaf segment and assigns `apple` and `icon` independently — a segment with an `apple-icon` and no
`icon` keeps its parent's favicon link (`next/dist/lib/metadata/resolve-metadata.js`,
`mergeStaticMetadata`). The browser tab is the app's; only the home screen needs telling apart.

── WHY THIS COMPOSES RATHER THAN JUST RESIZING ───────────────────────────────────────────────────
Because the image model draws a superb runner and an unreliable everything-else. Measured on its
own output: the "cyan" ground came back as #2dc1f9 against the token's #23beeb, the five zone
segments came back visibly desaturated, and across three attempts it twice ignored an explicit
instruction to shorten the bar and lift it off the bottom edge — which is the one thing that
matters, because Android crops an icon into a circle and anything near an edge is gone.

So the division of labour is: the model draws the figure, which nothing else here can do, and this
script draws everything a rectangle can express — the ground, the bar, the scale and the centring —
from `app/globals.css`'s real tokens. Same argument `scripts/gen-og-default.mjs` makes for drawing
the share preview in code: re-run it after a palette change and the art follows the design system
instead of drifting from it.

The silhouette is lifted off its background by luminance, not by colour-keying: the figure lands
near `--ink` (luminance ~37) on a cyan ground (luminance ~155), which is a gap wide enough that
0.2% of pixels fall in the ambiguous band. That band is kept as a soft alpha ramp rather than
thresholded flat, so the edges stay anti-aliased instead of turning into stair-steps.

── WHY THESE FILENAMES ARE NOT CONTENT-HASHED ────────────────────────────────────────────────────
Unlike `public/badges/*`, which `tools/make_badge_assets.py` hashes because `next.config.ts` serves
that path `immutable` for a year. The icon paths are named in a manifest and in Next's file
conventions, both of which want stable URLs, and `next.config.ts` deliberately does NOT extend the
immutable header past `/badges/:file*`. Do not move these under `/badges/`: the header would pin a
regenerated icon in every installed home screen for up to a year.

PIL only, like its two neighbours in this directory.
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

ROOT = Path(__file__).resolve().parent.parent
SILHOUETTE = ROOT / "assets" / "icon" / "silhouette.png"

MASTER_PX = 1024
# Composed at 4x and downsampled, so the bar's rounded ends and segment joins are properly
# anti-aliased instead of aliased at final size. PIL has no vector output; this is the cheap
# equivalent, and it is what makes a 3px-tall bar at icon size look drawn rather than dithered.
SS = 4

# --------------------------------------------------------------------------- #
# Tokens — app/globals.css, light scheme, mirrored from docs/design/tokens.css
# --------------------------------------------------------------------------- #
INK = (0x1d, 0x27, 0x33)  # --ink, the silhouette

# GROUND is `--paper`, the app's own background, and NOT `--accent`.
#
# This was measured rather than preferred. Against `--accent` #23beeb the zone bar loses its left
# half: z1 #38c3ee sits at a 1.06 contrast ratio to that ground and z4 at 1.01, and because z1 also
# shares the accent's hue, the bar's leading end dissolves entirely — at 40px the bar reads as
# yellow-orange-red, three zones out of five, which is worse than having no bar at all. On
# `--paper` every segment separates (1.24-2.36, carried by hue where the luminance ratio is low)
# and the ink figure rises to 11.9.
#
# It is also right for a reason beyond contrast: `--paper` is what the app's own screens are
# painted, and it is what `INSTALL.paper` hands the manifest for `background_color`. So the tile,
# the launch splash and the first screen are all one colour, and the app opens without a flash of
# anything else.
GROUND = (0xc9, 0xe9, 0xfb)  # --paper, light scheme

# The admin deck: the dark scheme's `--ink` and `--paper`, same tokens, other scheme.
#
# This is the app's icon at night, and it was checked the same way GROUND was rather than chosen.
# Computed with the WCAG relative-luminance formula over these literal values — the same formula
# reproduces the 11.9 figure recorded above for the light tile, which is what makes the rest of
# this trustworthy:
#
#                       figure/ground   z1     z2     z3     z4     z5
#   light (GROUND)          11.89       1.62   1.47   1.24   1.74   2.36
#   dark  (GROUND_DARK)     16.17       8.48   9.33   11.04  7.90   5.82
#
# So the zone bar — the element the GROUND note says "dissolves entirely" against the wrong ground
# — is carried by luminance here where the light tile carries it by hue alone. And the two grounds
# sit 13.74 apart, which is the number that actually does the job: a light tile and a dark tile are
# told apart at 40px without reading either of them.
#
# ZONES is NOT duplicated per deck, because `--z1`..`--z5` are defined only in `:root` in
# app/globals.css and do not vary by colour scheme. Checked; do not "fix" it by adding a dark set.
INK_DARK = (0xf2, 0xf7, 0xfa)  # --ink, dark scheme
GROUND_DARK = (0x0e, 0x1b, 0x26)  # --paper, dark scheme

ZONES = [
    (0x38, 0xc3, 0xee),  # --z1  <140 bpm
    (0x3f, 0xd6, 0x8f),  # --z2  141-151
    (0xff, 0xc5, 0x31),  # --z3  152-163
    (0xff, 0x93, 0x45),  # --z4  164-174
    (0xff, 0x5e, 0x5b),  # --z5  175+
]

# --------------------------------------------------------------------------- #
# Geometry, all as fractions so the composition is resolution-independent
# --------------------------------------------------------------------------- #
# The content block is the figure, a gap, and the zone bar, treated as one object and centred.
GAP_OF_FIG_H = 0.055  # gap between the rear foot and the bar
BAR_H_OF_FIG_H = 0.130  # bar thickness
BAR_W_OF_FIG_W = 0.92  # bar width, relative to the figure's own width — roughly a stride

# The 'any' icon only has to survive iOS's squircle, which eats corners and nothing else, so a
# centred block at 74% of the height is comfortable. (Checked: at this scale the block's own
# corners sit 248px and 133px from the edges, and the squircle's corner curve reaches 229px.)
CONTENT_H_ANY = 0.74
# The maskable icon has to survive Android cropping to ANY shape, for which the guaranteed-visible
# region is the central circle of 80% diameter. Solved from that circle rather than eyeballed —
# see maskable_content_height().
MASKABLE_SAFE_DIAMETER = 0.80

# Luminance band separating figure from ground. Below LO is solidly figure, above HI solidly
# ground, and the ramp between the two is what keeps the edge smooth.
LUM_LO = 60
LUM_HI = 130

# --------------------------------------------------------------------------- #
# Shipped sizes
# --------------------------------------------------------------------------- #
# (path, pixels, which master). 180 for apple-icon is Apple's own apple-touch-icon size for
# @3x iPhones; Next reads the file and writes `sizes="180x180"` into the link tag.
#
# Two decks, one compositor. Everything a deck varies is in here — the two colours, the two
# masters, the output list — so `compose()` stays a pure function of its arguments and the app
# deck's arithmetic is provably unchanged by the admin deck existing (see the byte-for-byte check
# in this phase's plan).
DECKS = {
    "app": {
        "ink": INK,
        "ground": GROUND,
        "master": ROOT / "assets" / "icon" / "master.png",
        "master_maskable": ROOT / "assets" / "icon" / "master-maskable.png",
        "outputs": [
            (Path("public") / "icons" / "icon-192.png", 192, "any"),
            (Path("public") / "icons" / "icon-512.png", 512, "any"),
            (Path("public") / "icons" / "icon-maskable-512.png", 512, "maskable"),
            (Path("app") / "icon.png", 512, "any"),
            (Path("app") / "apple-icon.png", 180, "any"),
        ],
    },
    "admin": {
        "ink": INK_DARK,
        "ground": GROUND_DARK,
        "master": ROOT / "assets" / "icon" / "master-admin.png",
        "master_maskable": ROOT / "assets" / "icon" / "master-admin-maskable.png",
        "outputs": [
            (Path("public") / "icons" / "admin-icon-192.png", 192, "any"),
            (Path("public") / "icons" / "admin-icon-512.png", 512, "any"),
            (Path("public") / "icons" / "admin-icon-maskable-512.png", 512, "maskable"),
            # No `app/admin/icon.png` — see the docstring. The favicon stays the app's.
            (Path("app") / "admin" / "apple-icon.png", 180, "any"),
        ],
    },
}


def figure_alpha(path: Path) -> Image.Image:
    """The silhouette as a soft alpha mask, trimmed to its own bounding box.

    Luminance rather than colour distance because the generated art is flat: one dark figure on one
    bright field, with no third tone to confuse. The ramp is a straight line between LUM_LO and
    LUM_HI, which for this art means ~99.8% of pixels resolve to a hard 0 or 255 and the remainder
    carry the anti-aliased edge.
    """
    if not path.exists():
        sys.exit(
            f"error: no silhouette at {path.relative_to(ROOT)}\n"
            f"  Generate candidates with `python3 tools/gen_app_icon.py plain`, look at them, then\n"
            f"  copy the one you want to that path."
        )
    src = Image.open(path).convert("L")
    span = LUM_HI - LUM_LO
    # An explicit 256-entry lookup table rather than a lambda: `point` applies it in C in one pass,
    # and the ramp is easier to read written out as the piecewise function it is.
    ramp = [
        255 if lum <= LUM_LO else 0 if lum >= LUM_HI else round((LUM_HI - lum) * 255 / span)
        for lum in range(256)
    ]
    alpha = src.point(ramp)
    box = alpha.getbbox()
    if not box:
        sys.exit(f"error: {path.relative_to(ROOT)} has no dark figure to lift off its background")
    return alpha.crop(box)


def maskable_content_height(aspect: float) -> float:
    """The tallest content block, as a fraction of the canvas, that fits the maskable safe circle.

    The block is `aspect`-wide by 1-tall in figure units; its diagonal must fit the circle. Solving
    w² + h² = d² with w = aspect·h gives h = d / √(1 + aspect²). Derived rather than tuned, because
    "looks fine on my launcher" is exactly how a maskable icon ships clipped on someone else's.
    """
    return MASKABLE_SAFE_DIAMETER / (1 + aspect**2) ** 0.5


def compose(
    alpha: Image.Image,
    content_h: float,
    px: int,
    ground: tuple[int, int, int],
    ink: tuple[int, int, int],
) -> Image.Image:
    """One icon: the deck's ground, the figure scaled and centred, the zone bar beneath it."""
    canvas = px * SS
    fig_w, fig_h = alpha.size

    # Resolve the content block from the figure's height.
    unit = canvas * content_h / (1 + GAP_OF_FIG_H + BAR_H_OF_FIG_H)
    f_h = int(round(unit))
    f_w = int(round(unit * fig_w / fig_h))
    gap = int(round(unit * GAP_OF_FIG_H))
    bar_h = int(round(unit * BAR_H_OF_FIG_H))
    bar_w = int(round(f_w * BAR_W_OF_FIG_W))

    block_h = f_h + gap + bar_h
    top = (canvas - block_h) // 2

    img = Image.new("RGB", (canvas, canvas), ground)

    # The figure, as a flat INK fill punched through by its own alpha.
    scaled = alpha.resize((f_w, f_h), Image.LANCZOS)
    img.paste(Image.new("RGB", (f_w, f_h), ink), ((canvas - f_w) // 2, top), scaled)

    # The bar: one rounded-rectangle mask, then each segment's colour pasted through the slice of
    # that mask it owns. Drawing five separate rounded rects would round every interior join too.
    bar_x = (canvas - bar_w) // 2
    bar_y = top + f_h + gap
    mask = Image.new("L", (bar_w, bar_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, bar_w - 1, bar_h - 1], radius=bar_h // 2, fill=255
    )
    for i, colour in enumerate(ZONES):
        x0 = round(i * bar_w / len(ZONES))
        x1 = round((i + 1) * bar_w / len(ZONES))
        seg = mask.crop((x0, 0, x1, bar_h))
        img.paste(Image.new("RGB", (x1 - x0, bar_h), colour), (bar_x + x0, bar_y), seg)

    # RGB throughout, never RGBA: iOS composites a transparent apple-touch-icon onto BLACK rather
    # than onto the page, which turns any soft edge into a dark halo on the home screen.
    return img.resize((px, px), Image.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compose the Run Insights app icons and write the shipped PNGs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--deck", choices=[*DECKS, "both"], default="both",
                        help="which deck to write (default: both)")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the resolved geometry and the outputs; write nothing")
    args = parser.parse_args()

    decks = list(DECKS) if args.deck == "both" else [args.deck]

    alpha = figure_alpha(SILHOUETTE)
    fig_w, fig_h = alpha.size
    aspect = fig_w / fig_h

    # The block is `aspect` wide per 1 of figure height, but taller than the figure by the gap and
    # the bar — that full ratio is what has to fit the circle.
    block_aspect = aspect / (1 + GAP_OF_FIG_H + BAR_H_OF_FIG_H)
    content_h_maskable = maskable_content_height(block_aspect)

    print(f"silhouette      {SILHOUETTE.relative_to(ROOT)}  figure {fig_w}x{fig_h}, "
          f"aspect {aspect:.3f}")
    print(f"content height  any {CONTENT_H_ANY:.3f}  ·  maskable {content_h_maskable:.3f} "
          f"(fits the {MASKABLE_SAFE_DIAMETER:.0%} safe circle)")

    if args.dry_run:
        for name in decks:
            print(f"deck {name}")
            for path, px, kind in DECKS[name]["outputs"]:
                print(f"  would write  {path}  {px}²  ({kind})")
        return

    for name in decks:
        deck = DECKS[name]
        print(f"deck {name}  ground #{bytes(deck['ground']).hex()}  "
              f"ink #{bytes(deck['ink']).hex()}")
        masters = {
            "any": compose(alpha, CONTENT_H_ANY, MASTER_PX, deck["ground"], deck["ink"]),
            "maskable": compose(
                alpha, content_h_maskable, MASTER_PX, deck["ground"], deck["ink"]
            ),
        }
        for path, image in (
            (deck["master"], masters["any"]),
            (deck["master_maskable"], masters["maskable"]),
        ):
            path.parent.mkdir(parents=True, exist_ok=True)
            image.save(path, optimize=True)
            print(f"  wrote {path.relative_to(ROOT)}  {MASTER_PX}²  {path.stat().st_size:,} bytes")

        for path, px, kind in deck["outputs"]:
            out = ROOT / path
            out.parent.mkdir(parents=True, exist_ok=True)
            masters[kind].resize((px, px), Image.LANCZOS).save(out, optimize=True)
            print(f"  wrote {path}  {px}²  ({kind})  {out.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
