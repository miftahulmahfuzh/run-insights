#!/usr/bin/env python3
"""Generate the Run Insights home-screen app icon via OpenRouter.

    python3 tools/gen_app_icon.py --dry-run
    python3 tools/gen_app_icon.py zone-streaks
    python3 tools/gen_app_icon.py zone-bar --seed 7
    python3 tools/gen_app_icon.py plain --note "the runner's trailing leg is fused to the ground"

Masters land in `assets/icon/_candidates/<variant>.aNN.png` with a `.txt` sidecar carrying the
exact prompt. Promote the chosen one with:

    cp assets/icon/_candidates/<variant>.aNN.png assets/icon/master.png
    python3 tools/make_icon_assets.py

── WHY THIS IS NOT `tools/gen_badge_art.py` ──────────────────────────────────────────────────────
Two reasons, either sufficient. First, that tool asserts parity between the scene lines in
`.claude/skills/generate-badge/style.md` and the keys in `BADGE_CATALOG`, and refuses to start on
any disagreement — an app icon is not a badge key, so it could not run at all without weakening
the guard that protects 22 images. Second, its style block is an embroidered cloth patch on navy
twill: the wrong visual register entirely. An app icon has to survive being drawn at 40px inside a
squircle, which rewards one flat readable shape and punishes satin-stitch texture.

What IS shared, deliberately and verbatim, is the plumbing, because it was all bought with someone
else's afternoon: the `.env.local`-before-environment key read and its printed-source-not-value
line, the `RES_OPTIONS=no-aaaa` WSL DNS workaround, the hand-built JSON POST to
`/images/generations` (there is no `/images/edits` on this provider — it 404s), the sidecar format,
the `next_attempt_path` numbering, and `--dry-run` / `--note` / `--seed`.

THE KEY. `OPENROUTER_API_KEY`, read here and in `tools/gen_badge_art.py` and nowhere else. It is
NOT `LLM_API_KEY` — the app's model access is GLM via z.ai (roadmap §4.1, R-40) and this is an
image API: a different provider, a different key, a different bill. No file under `app/`, `lib/` or
`components/` may ever name it, and that grep staying empty is a checked property of the
repository (`npm run ci:openrouter-guard`). This script prints which SOURCE the key came from and
never the value.

stdlib only, on purpose — same as its neighbour. The *promoter* needs PIL; this does not.
"""

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import NoReturn

# Inherited from tools/gen_badge_art.py, where AAAA lookups were measured hanging 4-12s under WSL
# before every request. Must be set before any DNS resolution happens.
os.environ.setdefault("RES_OPTIONS", "no-aaaa")

ROOT = Path(__file__).resolve().parent.parent
CANDIDATES = ROOT / "assets" / "icon" / "_candidates"

BASE = "https://openrouter.ai/api/v1"
KEY_VAR = "OPENROUTER_API_KEY"
MODEL = "qwen/qwen-image-3-pro"

# `resolution` and `aspect_ratio`, NOT `size`. OpenRouter ignores `size` and defaults to 2K, so
# omitting these silently returns a 2048² master *after* the money is spent. RESOLUTION is an enum
# there ('1K' | '2K'), not a pixel count.
RESOLUTION = "1K"
ASPECT_RATIO = "1:1"
MASTER_PX = 1024  # what '1K' means. Recorded in the sidecar, not sent.

STYLE_VERSION = "v1"

# --------------------------------------------------------------------------- #
# The palette
# --------------------------------------------------------------------------- #
# app/globals.css, light scheme, mirrored from docs/design/tokens.css. Named here so the prompt
# quotes the app's real tokens rather than a designer's memory of them.
INK = "#1d2733"  # --ink
ACCENT = "#23beeb"  # --accent
PAPER = "#c9e9fb"  # --paper
ZONES = ("#38c3ee", "#3fd68f", "#ffc531", "#ff9345", "#ff5e5b")  # --z1 … --z5

# --------------------------------------------------------------------------- #
# The style block
# --------------------------------------------------------------------------- #
# Sent identically for every variant. The three rules in capitals are the three ways this style
# burns an attempt, in the order it burns them: a product mockup instead of an icon, lettering
# somewhere, and art that runs to the edge and loses its limbs to the squircle mask.
STYLE = f"""
A single flat vector app icon for a mobile running app, in the manner of a modern iOS home-screen
icon — one bold graphic idea, drawn cleanly, readable at a glance.

FULL BLEED — THE MOST IMPORTANT RULE. The background colour fills the entire square image, edge to
edge and corner to corner. Do NOT draw a rounded-corner tile, a squircle, a circle or any badge
shape sitting on a backdrop. Do NOT render a phone, a screen, a home screen, a device frame, an
app-store listing, a presentation mockup or a drop shadow. Do NOT add a border, an outline frame,
a vignette, a glow, rounded photo corners or a white margin. The image IS the icon's artwork: the
operating system applies its own rounded mask afterwards, so any corner treatment drawn here will
be masked into a dark crescent.

NO TEXT ANYWHERE. No app name, no word, no letter, no monogram, no initial, no number, no motto,
no watermark, no signature, no glyph in any alphabet. Any text is an automatic rejection.

GENEROUS MARGIN. The runner sits centred with clear empty space on all four sides, occupying about
62 percent of the image height and staying well inside the middle. iOS masks this square into a
squircle and Android crops it into a circle, and both eat the corners — nothing that matters may
sit near an edge or a corner. The runner's head, leading hand and trailing foot must all have room
around them; a limb touching the edge is a limb the mask amputates.

THE SUBJECT: a solid black silhouette of a man running, seen from the side in full profile, caught
mid-stride at the moment of maximum extension — front knee driving up and forward, rear leg
extended behind with the heel lifted, arms bent at the elbow and counter-swinging. One clean
unbroken filled shape, near-black {INK}, with no interior detail whatsoever: no face, no eyes, no
clothing, no shoe laces, no muscle shading, no highlight, no gradient, no outline around it. A
pictogram, not a drawing — the crisp confident geometry of a transit-system or Olympic sport
pictogram, athletic and light on its feet rather than heavy or plodding. The stride must read
instantly as RUNNING and not as walking or standing: the gap between the legs is the whole
silhouette's job.

TECHNIQUE: flat vector fills only. Every colour is a solid area of one flat tone with a hard clean
edge. No gradients, no soft shadows, no glow, no bevel, no gloss, no highlight, no texture, no
noise, no paper grain, no 3D shading, no photographic lighting, no airbrush. Smooth crisp curves,
generous solid masses, nothing thinner than a confident stroke — hairlines vanish at 40 pixels,
which is the size this icon is judged at.
""".strip()

# --------------------------------------------------------------------------- #
# The variants
# --------------------------------------------------------------------------- #
# Three treatments of the same silhouette, to be compared at draw size rather than argued about.
# All three put a black runner on the app's accent cyan: it is the app's signature colour, it holds
# maximum contrast against black, and a saturated tile survives a home screen full of other icons
# in a way the pale `--paper` sky does not — a light tile next to Instagram looks unfinished.
#
# What differs is whether the five heart-rate zone colours appear, and how. The zone bar is this
# app's one signature graphic (it is what `scripts/gen-og-default.mjs` draws for every share
# preview), so quoting it ties the icon to the product; the risk is that five more colours turn a
# clean silhouette into mush at 40px. Hence a variant with none.
VARIANTS = {
    "zone-streaks": f"""
BACKGROUND: one flat solid field of bright cyan {ACCENT}, filling the whole square.

BEHIND THE RUNNER: three or four horizontal speed streaks — flat, solid, rounded-end bars lying
parallel to the ground, trailing back behind the runner from around hip and shoulder height, as
though left in the air by the stride. They read as motion, and they are the only other element in
the frame. Colour them from this set, one flat colour per streak, no gradients and no blending:
{ZONES[0]}, {ZONES[1]}, {ZONES[2]}, {ZONES[3]}, {ZONES[4]}. Vary their lengths so the group reads
as speed rather than as a chart, keep them clearly behind and separate from the silhouette so the
runner's outline is never broken or ambiguous, and stop them well short of the left edge.
""",
    "zone-bar": f"""
BACKGROUND: one flat solid field of bright cyan {ACCENT}, filling the whole square.

BENEATH THE RUNNER: a single horizontal bar spanning the lower middle of the image, like a track
the runner is striding along, divided left to right into five equal solid segments in exactly this
order: {ZONES[0]}, {ZONES[1]}, {ZONES[2]}, {ZONES[3]}, {ZONES[4]}. Flat colour, hard edges between
segments, no gradient and no blending between them. The bar has rounded ends, is thick and
confident rather than thin, and does not reach the left or right edge of the image. The runner
strides above it with clear space between the silhouette and the bar.
""",
    "plain": f"""
BACKGROUND: one flat solid field of bright cyan {ACCENT}, filling the whole square, and nothing
else at all.

NOTHING BEHIND THE RUNNER. No streaks, no bar, no track, no ground line, no horizon, no sun, no
circle, no arc, no pattern, no secondary shape of any kind. Two colours in the entire image: the
cyan field and the black silhouette. The composition is carried by the silhouette alone.
""",
}


def build_prompt(variant: str, note: str | None = None) -> str:
    parts = [STYLE, "", f"THIS VARIANT — {variant}:", VARIANTS[variant].strip()]
    if note:
        # After the variant block, so a correction reads as a refinement of this image rather than
        # as an amendment to the style.
        parts += ["", f"CORRECTION FOR THIS ATTEMPT: {note}"]
    return "\n".join(parts)


# --------------------------------------------------------------------------- #
# The key
# --------------------------------------------------------------------------- #

def read_api_key() -> str:
    """`.env.local` first, then the environment. Prints WHICH, never the value.

    The order and the announcement are both scar tissue carried over from gen_badge_art.py: a stale
    exported shell variable silently winning over the file you just edited is a confusing hour, and
    one printed word ends it.
    """
    env_file = ROOT / ".env.local"
    if env_file.exists():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            if name.strip() != KEY_VAR:
                continue
            value = value.strip().strip('"').strip("'")
            if value:
                print(f"key source: .env.local ({KEY_VAR})")
                return value

    value = os.environ.get(KEY_VAR, "").strip()
    if value:
        print(f"key source: environment ({KEY_VAR})")
        return value

    die(f"{KEY_VAR} is in neither .env.local nor the environment.\n"
        f"  It is a DIFFERENT key from LLM_API_KEY — the app's model access is\n"
        f"  GLM via z.ai (roadmap §4.1) and this is an image API, a different\n"
        f"  provider and a different bill. Paste the value into .env.local by\n"
        f"  hand; that file is gitignored. Do not echo it, pipe it or let a\n"
        f"  script print it.")


# --------------------------------------------------------------------------- #
# The request
# --------------------------------------------------------------------------- #

def post_generation(key: str, model: str, prompt: str, seed: int | None = None) -> bytes:
    """OpenRouter's single image endpoint.

    **There is no `/images/edits` here.** It 404s on this provider — not "unknown model", the route
    does not exist. The chat-completions route (`modalities: ["image", "text"]`) also produces
    images on this provider, but `qwen/qwen-image-3-pro` refuses it with "no endpoints found that
    support the requested output modalities". Do not reach for it: this endpoint is the one the
    model answers. Both facts are gen_badge_art.py's, paid for once already.
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "resolution": RESOLUTION,
        "aspect_ratio": ASPECT_RATIO,
        "n": 1,
    }
    if seed is not None:
        payload["seed"] = seed

    req = urllib.request.Request(
        f"{BASE}/images/generations",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    return send(req)


def send(req) -> bytes:
    started = time.monotonic()
    try:
        # A Qwen call has been measured at just over two minutes on the deck this descends from,
        # so this ceiling is doing real work rather than guarding a hypothetical.
        with urllib.request.urlopen(req, timeout=300) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:2000]
        die(f"HTTP {exc.code} from the image API\n{detail}\n\n"
            f"  If this says the model is unknown, list what the provider actually\n"
            f"  serves — and note that OpenRouter's image models are NOT in\n"
            f"  /api/v1/models, which is why they look absent:\n"
            f"    curl -s {BASE}/images/models | python3 -m json.tool | grep '\"id\"'")
    except urllib.error.URLError as exc:
        die(f"could not reach {BASE}: {exc.reason}")

    elapsed = time.monotonic() - started
    data = payload.get("data") or []
    if not data or "b64_json" not in data[0]:
        die(f"response had no b64_json image:\n{json.dumps(payload)[:2000]}")
    print(f"generated in {elapsed:.1f}s")
    return base64.b64decode(data[0]["b64_json"])


# --------------------------------------------------------------------------- #
# Output
# --------------------------------------------------------------------------- #

def next_attempt_path(variant: str) -> Path:
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    used = {
        int(m.group(1))
        for p in CANDIDATES.glob(f"{variant}.a*.png")
        if (m := re.fullmatch(rf"{re.escape(variant)}\.a(\d+)\.png", p.name))
    }
    return CANDIDATES / f"{variant}.a{(max(used) + 1) if used else 1:02d}.png"


def write_sidecar(png_path: Path, variant: str, model: str, prompt: str, seed: int | None) -> Path:
    """The exact prompt beside the exact image, so a candidate you like in six weeks can be
    explained and regenerated instead of guessed at."""
    sidecar = png_path.with_suffix(".txt")
    sidecar.write_text(
        "\n".join([
            f"variant:        {variant}",
            "provider:       openrouter",
            f"model:          {model}",
            f"seed:           {seed if seed is not None else '(none)'}",
            f"style version:  {STYLE_VERSION}",
            f"resolution:     {RESOLUTION} {ASPECT_RATIO}  (expect {MASTER_PX}²)",
            f"image sha256:   {hashlib.sha256(png_path.read_bytes()).hexdigest()}",
            "",
            "--- prompt as sent ---",
            prompt,
            "",
        ]),
        encoding="utf-8",
    )
    return sidecar


# --------------------------------------------------------------------------- #

def rel(path) -> str:
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def die(message) -> NoReturn:
    print(f"\nerror: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate the Run Insights home-screen app icon.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Promote a chosen candidate to assets/icon/master.png, then run "
               "tools/make_icon_assets.py to write the shipped PNGs.",
    )
    parser.add_argument("variant", nargs="?", choices=sorted(VARIANTS),
                        help="which background treatment to draw")
    parser.add_argument("--all", action="store_true",
                        help="print every variant's prompt; only legal with --dry-run")
    parser.add_argument("--dry-run", action="store_true",
                        help="assemble and print the prompt; no key, no network, no file")
    parser.add_argument("--note", help="a correction appended after the variant block")
    parser.add_argument("--model", default=MODEL, help=f"image model (default {MODEL})")
    parser.add_argument("--seed", type=int, help="reproducibility; qwen-image-3-pro honours it")
    args = parser.parse_args()

    if args.all:
        if not args.dry_run:
            # gen_badge_art.py's argument, and it applies harder to an icon: the whole point of
            # three variants is looking at them, and a loop makes the looking ceremonial.
            die("--all is only legal with --dry-run. One image per invocation, so the "
                "look-at-it step stays real.")
        targets = sorted(VARIANTS)
    elif args.variant:
        targets = [args.variant]
    else:
        die("name a variant, or pass --all --dry-run. Choices: " + ", ".join(sorted(VARIANTS)))

    # Two loops rather than one with a `continue`, so the key is a `str` and not a `str | None`
    # threaded through a call that cannot accept None.
    if args.dry_run:
        for variant in targets:
            prompt = build_prompt(variant, args.note)
            print(f"\n{'=' * 78}\n{variant}  ({len(prompt)} chars)\n{'=' * 78}\n{prompt}")
        return

    # Read before the first request, so a missing key costs nothing instead of failing after the
    # first image is already paid for.
    key = read_api_key()

    for variant in targets:
        prompt = build_prompt(variant, args.note)
        print(f"\n{variant} — {args.model}")
        png = post_generation(key, args.model, prompt, args.seed)
        path = next_attempt_path(variant)
        path.write_bytes(png)
        sidecar = write_sidecar(path, variant, args.model, prompt, args.seed)
        print(f"wrote {rel(path)} ({len(png):,} bytes)")
        print(f"      {rel(sidecar)}")


if __name__ == "__main__":
    main()
