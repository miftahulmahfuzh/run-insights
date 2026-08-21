#!/usr/bin/env python3
"""Widen approved badge masters from 1:1 to 4:3 by extending their own twill.

    python3 tools/extend_badge_art.py two_a_days
    python3 tools/extend_badge_art.py --all                  # resumes; skips what exists
    python3 tools/extend_badge_art.py two_a_days --dry-run
    python3 tools/extend_badge_art.py --all --recrop         # re-crop from stored raws, free

THE ORDER OF OPERATIONS FOR A NEW BADGE, WHICH THIS TOOL CHANGED

The masters are 4:3 now but `gen_badge_art.py` still generates at 1:1, and that
is deliberate rather than an oversight: the style block's composition rules — the
patch at "about 80 percent of the image width", a generous margin of bare twill
on every side — were written for a square frame and every one of the four
`SHAPE_WIDTH` numbers was observed on one. Regenerating the deck at 4:3 from
scratch would invalidate all of it and re-roll 22 approved pictures for a change
that is about cloth. So a badge is still INVENTED square and then WIDENED:

    1. python3 tools/gen_badge_art.py <key> --seed 1970
    2. judge the square candidate — skill step 5, all of it
    3. python3 tools/extend_badge_art.py <key> \
           --source assets/badges/_candidates/<key>.aNN.png
    4. python3 tools/check_badge_art.py assets/badges/_candidates/<key>.wNN.png
       and judge again: the patch must be the SAME patch
    5. promote the .wNN pair, not the .aNN pair:
           cp assets/badges/_candidates/<key>.wNN.png assets/badges/<key>.png
           cp assets/badges/_candidates/<key>.wNN.txt assets/badges/<key>.txt

`--source` exists for step 3: a new badge has no master yet, so the default of
`assets/badges/<key>.png` would either miss or — worse — silently widen the
PREVIOUS master. Omitting it is right only when re-widening a badge that is
already promoted.

WHY THIS EXISTS AND WHY IT IS NOT `gen_badge_art.py --aspect-ratio 4:3`

`BadgeDialog`'s art band is `aspect-[4/3]`; every style-v2 master is 1024². The
dialog therefore draws the square art `h-full w-auto` and paints the ~12.5% of
band either side with `BADGE_ART.twill`, the *mean* of the master's outer 5%
frame. A mean cannot match a photograph of cloth in two ways at once:

  - the raking light the style block asks for comes from the upper LEFT, so each
    master's left edge is measurably lighter than its right. MEASURED across all
    22, as |left-edge mean − frame mean| in sRGB: two_a_days 12.4,
    boring_excellence 9.8, century_club 8.5, sweat_equity 8.4, down to tourist
    3.0. One flat colour lands between the two edges, so it is visibly wrong at
    BOTH seams rather than at neither.
  - the twill has a diagonal weave grain and a flat fill has none, so the seam
    reads as texture-stops-here even where the value happens to match.

The fix is a master that is already 4:3, so the band has nothing to paint. That
is NOT a re-generation: the approved subject, silhouette, stitch gauge and
signature thread must survive byte-for-eye and only the cloth around them is new.
So this is a distinct operation, and it is deliberately a separate file rather
than a flag on `gen_badge_art.py`:

  - the prompt is an OUTPAINT instruction, not the style block plus a scene. The
    style block's job is to invent a patch; here inventing anything is the
    failure mode, so sending it would be sending the wrong instruction.
  - the reference image is REQUIRED and is the approved master, which inverts
    that tool's hard-won finding (skill step 2: `input_references` behaves like a
    strong img2img, transferring the SUBJECT hard while ignoring cloth tone —
    fatal when inventing, and exactly the behaviour wanted when copying).
  - the cheap model is enough. `gen_badge_art.py` pins `qwen-image-3-pro`
    because it is inventing a picture; copying one across a wider canvas is a
    much easier ask, so this pins plain `qwen-image-3`. MEASURED at $0.033 per
    call (OpenRouter credit ledger, differenced before/after — image models
    return no `usage` block and are absent from `/api/v1/models`, so the ledger
    is the only number that is actually the bill).

WHY `--all` IS ALLOWED HERE AND FORBIDDEN THERE. `gen_badge_art.py` refuses
`--all` without `--dry-run`, because a three-attempt cap and a look-at-it step
are per badge and a loop makes both ceremonial. That argument is about
INVENTION: each of those 22 images is a different picture, judged on its own
subject. This operation is mechanical and identical 22 times — same prompt, same
instruction, one input each — and its failure modes (the patch redrawn, a shadow
appearing on the bare cloth, lettering) are the same three every time and are
read off one contact sheet at the end. Batching the calls does not make the
looking ceremonial; it just stops 22 invocations from being 22 identical
paragraphs. **The looking is still mandatory and is still per badge.**

WHY THE OUTPUT IS CROPPED BEFORE IT IS WRITTEN

The model returns a 4:3 frame with the patch at roughly 68% of frame height,
where the square masters read ~87% of width — so as generated the patch is about
a fifth smaller in the panel than the deck it has to sit in. Asking the prompt
for a bigger patch barely moves it (measured: "eighty percent" → 66.0%,
"eighty-eight percent" → 68.0%). So the size is fixed by arithmetic instead: the
patch's bounding box is measured with `check_badge_art.foreground_box` — the same
definition of foreground the checker gates on, imported rather than
reimplemented — and the frame is centre-cropped by exactly the factor that lands
the patch on its own shape's `SHAPE_WIDTH` expectation, scaled to the 4:3 frame.
The crop is then resized back to a fixed 1024×768 so `check_badge_art.py` check 1
and `make_badge_assets.py` keep asserting one master size.

This is a crop of cloth the model already drew, not an upscale of the patch: the
worst case is ~1.2× of a 1K generation, and the shipped derivative is 768 wide,
so the round trip stays a net downscale. The raw generation is kept beside the
cropped one as `<key>.wNN.raw.png` so a different crop can be tried for free.

Key handling, the DNS workaround, the sidecar format and the never-print-the-key
rule are carried over verbatim from `gen_badge_art.py`; read its header for the
reasoning. `OPENROUTER_API_KEY` is read here and in that file and nowhere else —
no file under `app/`, `lib/` or `components/` may ever name it.
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

os.environ.setdefault("RES_OPTIONS", "no-aaaa")

ROOT = Path(__file__).resolve().parent.parent
MASTERS = ROOT / "assets" / "badges"
CANDIDATES = MASTERS / "_candidates"
SOURCE = ROOT / "lib" / "badges" / "catalog.ts"
BASE = "https://openrouter.ai/api/v1"
KEY_VAR = "OPENROUTER_API_KEY"

MODEL = "qwen/qwen-image-3"
RESOLUTION = "1K"
ASPECT_RATIO = "4:3"
OUT_W, OUT_H = 1024, 768

# The crop is clamped rather than trusted. Below this the patch came back far too
# small and cropping to fix it would be an upscale of the subject rather than a
# trim of the cloth — that is a failed generation and should be re-rolled, not
# rescued. Above 1.0 the patch came back too BIG, which cropping cannot fix at
# all (there is no cloth to add), so it is reported and left alone.
CROP_FLOOR = 0.70

# The patch may not exceed this share of the frame's HEIGHT after cropping, and
# this ceiling overrides the width target when the two disagree.
#
# MEASURED, and it cost a badge to learn: `double_century` is a tall rounded
# triangle, so cropping it to the `SHAPE_WIDTH` target for its shape ran its
# height to 98.4% of the frame and it bled off the top and bottom edges. Check 3
# then failed — not because the cloth was wrong, but because there was no bare
# cloth left at the top or bottom for `substrate_stats` to sample, so the
# "twill" reading was part merrowed border and part slate field. That is the
# exact instrument-reads-the-subject fault `substrate_stats`' own docstring was
# written to correct.
#
# 0.90 is the deck's own observed ceiling rather than a guess: `early_bird` and
# `self_reward`, the two masters the anchor and check 9b were calibrated on, sit
# at 89.1% tall. `substrate_stats` records 95.3–96.1% as the range where the
# sample breaks down and 95.7% as "passes, only just".
PATCH_HEIGHT_MAX = 0.90

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

# One definition of "where is the patch" for the whole deck. Imported from the
# checker rather than copied, because a crop computed against a different notion
# of foreground than the one check 9a gates on would be a tool that cheerfully
# produces images its own checker rejects.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_badge_art as chk  # noqa: E402


PROMPT = """\
A photograph of the same embroidered cloth patch as the reference image, on a WIDER piece of the
same cloth.

THE PATCH IS UNCHANGED. Same outer silhouette, same merrowed bone-white border at the same gauge,
same interior field, same subject, same thread colours, same stitch directions, same single small
orange accent, same hard raking light from the upper left, same close contact shadow on the cloth
around its border. It is a copy, not a redrawing: every stitch is where the reference put it.

THE CLOTH IS WIDER. The dark navy cotton twill continues outward to the LEFT and to the RIGHT of
the patch, filling the whole wide frame edge to edge and corner to corner. The new cloth is the
same cloth: the same navy near #1B2A44, the same fine diagonal weave grain visible under the same
raking light, continuing without a seam, a join, an edge, a fold or a change of tone.

THE CLOTH IS EVENLY LIT. The twill is one flat, taut, evenly lit expanse of the same navy in all
four corners and along all four edges, at the same brightness throughout — the fabric's own weave
grain is the only variation on it. The single close contact shadow hugging the patch's merrowed
border is the only shadow in the frame: the bare cloth carries no broad soft shading, no dark
diagonal band, no corner darkening, no vignette, and no shadow of any object outside the frame.

THE PATCH IS CENTRED AND KEEPS ITS SIZE. It stands in the middle of the wide frame and it is
LARGE: its height is about eighty-eight percent of the frame's height, so it very nearly touches
the top and bottom edges of the frame. Because the frame is wider than it is tall, a margin of
bare navy twill lies to the left of the patch and an equally wide margin lies to its right. The
patch is not stretched wider and it is not shrunk.

The image IS the twill with the patch sewn onto it, and nothing else is in the frame: no lettering
in any alphabet, no second patch, no table, no jacket, no hand, no frame, no border, no vignette,
no white margin.\
"""


# --------------------------------------------------------------------------- #
# The key
# --------------------------------------------------------------------------- #

def read_api_key():
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
    sys.exit(f"error: {KEY_VAR} is in neither .env.local nor the environment. It is a\n"
             f"  DIFFERENT key from LLM_API_KEY; paste it into .env.local by hand.")


# --------------------------------------------------------------------------- #
# The request
# --------------------------------------------------------------------------- #

def get_json(key, path):
    req = urllib.request.Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def usage(key):
    """Lifetime spend on the account, USD. Differenced to price one call."""
    return float(get_json(key, "/credits")["data"]["total_usage"])


def post(key, model, reference: Path, seed):
    data_url = "data:image/png;base64," + base64.b64encode(reference.read_bytes()).decode("ascii")
    payload = {
        "model": model,
        "prompt": PROMPT,
        "resolution": RESOLUTION,
        "aspect_ratio": ASPECT_RATIO,
        "n": 1,
        "input_references": [{"type": "image_url", "image_url": {"url": data_url}}],
    }
    if seed is not None:
        payload["seed"] = seed
    req = urllib.request.Request(
        f"{BASE}/images/generations",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return None, f"HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:600]}"
    except urllib.error.URLError as exc:
        return None, f"could not reach {BASE}: {exc.reason}"
    data = body.get("data") or []
    if not data or "b64_json" not in data[0]:
        return None, f"no b64_json in response: {json.dumps(body)[:600]}"
    print(f"    generated in {time.monotonic() - started:.1f}s")
    return base64.b64decode(data[0]["b64_json"]), None


# --------------------------------------------------------------------------- #
# The crop
# --------------------------------------------------------------------------- #

def patch_box(img):
    """The patch's bounding box as fractions of the frame, or None.

    `foreground_map` squashes to 256² regardless of the frame's aspect, so the
    grid units are not pixels — but every number taken out of it here is a
    FRACTION of the frame's own width or height, which the squash preserves
    exactly. That is also why check 8a's `box W%×H%` reads correctly on a 4:3
    candidate with no change to the checker.
    """
    rgb = img.convert("RGB")
    w, h = rgb.size
    substrate, _, _ = chk.substrate_stats(rgb.load(), w, h)
    grid = chk.foreground_map(rgb, substrate)
    box = chk.foreground_box(grid)
    if box is None:
        return None
    n = len(grid)
    x0, y0, x1, y1 = box
    return ((x0 + 0.5) / n, (y0 + 0.5) / n, (x1 + 0.5) / n, (y1 + 0.5) / n)


def crop_to_deck_size(raw: Image.Image, key: str):
    """Centre-crop `raw` so the patch lands on its shape's deck-wide size.

    Returns (image, note). The image is always exactly OUT_W×OUT_H.

    `SHAPE_WIDTH` was calibrated as a fraction of image WIDTH on square masters,
    where the frame's width and height are the same number. On a 4:3 frame the
    patch that has the same physical size relative to the cloth spans
    `SHAPE_WIDTH × (h/w)` of the width — the same scaling check 9a now applies,
    so the two agree by construction rather than by coincidence.
    """
    shape = chk.shape_for(Path(f"{key}.png"))
    box = patch_box(raw)
    if box is None or shape is None:
        return resize_out(raw), (
            f"no crop: {'no foreground found' if box is None else 'no shape on file'}"
        )
    fw, fh = box[2] - box[0], box[3] - box[1]
    target = chk.SHAPE_WIDTH[shape] * (raw.height / raw.width)

    # TWO constraints, and the LESS aggressive crop wins. Landing the width on
    # its shape's target is the goal; keeping the patch inside the frame is the
    # requirement. `max` is what makes the second one binding — see
    # PATCH_HEIGHT_MAX for the badge that taught this.
    by_width = fw / target
    by_height = fh / PATCH_HEIGHT_MAX
    factor = max(by_width, by_height)
    bound = "height ceiling" if by_height > by_width else "width target"

    if factor >= 1.0:
        return resize_out(raw), (
            f"no crop ({bound} binds): patch is {fw * 100:.1f}%×{fh * 100:.1f}% of the "
            f"frame against a {target * 100:.1f}% width target and a "
            f"{PATCH_HEIGHT_MAX * 100:.0f}% height ceiling — cropping cannot shrink a patch"
        )
    if factor < CROP_FLOOR:
        return resize_out(raw), (
            f"NO CROP, TOO SMALL: patch {fw * 100:.1f}% of width wants a "
            f"{factor:.3f} crop, below the {CROP_FLOOR} floor — re-roll this badge"
        )

    # Centred on the PATCH, not on the frame, so the crop improves check 8a
    # rather than inheriting whatever offset the generation had. Clamped to the
    # frame, which can reintroduce a little offset on a badly-placed patch — the
    # honest trade, since running off the edge would add a black margin.
    cw, ch = raw.width * factor, raw.height * factor
    cx = (box[0] + box[2]) / 2 * raw.width
    cy = (box[1] + box[3]) / 2 * raw.height
    x0 = min(max(cx - cw / 2, 0), raw.width - cw)
    y0 = min(max(cy - ch / 2, 0), raw.height - ch)
    out = raw.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch)))
    return resize_out(out), (
        f"cropped {factor:.3f} ({out.width}×{out.height}), {bound} binds — patch "
        f"{fw * 100:.1f}%×{fh * 100:.1f}% → {fw / factor * 100:.1f}%×"
        f"{fh / factor * 100:.1f}%, {shape} wants {target * 100:.1f}% wide"
    )


def resize_out(img):
    return img.convert("RGB").resize((OUT_W, OUT_H), Image.LANCZOS)


# --------------------------------------------------------------------------- #
# Output
# --------------------------------------------------------------------------- #

def badge_keys():
    m = re.search(r"BADGE_CATALOG[^=]*=\s*\[(.*?)^\]", SOURCE.read_text(encoding="utf-8"),
                  re.S | re.M)
    if not m:
        sys.exit(f"error: could not find `BADGE_CATALOG … = [ … ]` in {SOURCE}")
    keys = re.findall(r"^\s*badge\(\s*'([a-z0-9_]+)'", m.group(1), re.M)
    if not keys:
        sys.exit("error: BADGE_CATALOG parsed to zero keys")
    return keys


def next_attempt_path(key):
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    used = {
        int(m.group(1))
        for p in CANDIDATES.glob(f"{key}.w*.png")
        if (m := re.fullmatch(rf"{re.escape(key)}\.w(\d+)\.png", p.name))
    }
    return CANDIDATES / f"{key}.w{(max(used) + 1) if used else 1:02d}.png"


STYLE_VER_RE = re.compile(r"^style version:\s*(v\d+)\s*$", re.M)


def inherited_style_version(source: Path):
    """The `style version:` line from the source image's own sidecar.

    LOAD-BEARING, and easy to miss: `make_badge_assets.py` reads this line out of
    `assets/badges/<key>.txt` to stamp `styleVersion` in the manifest, and a
    master whose sidecar lacks it is recorded `"unknown"` and warned about. A
    widened master is the same badge, generated against the same style block, so
    the version is INHERITED from the source rather than re-read from style.md —
    taking the current version here would stamp every badge "the version now" and
    make a mixed deck undetectable, which is the one thing the stamp exists to
    catch.
    """
    sidecar = source.with_suffix(".txt")
    if not sidecar.exists():
        return None, f"no sidecar beside {source.name}"
    m = STYLE_VER_RE.search(sidecar.read_text(encoding="utf-8"))
    if not m:
        return None, f"{sidecar.name} has no `style version:` line"
    return m.group(1), None


def write_sidecar(out: Path, key, model, seed, cost, note, sha, source: Path):
    version, why = inherited_style_version(source)
    if version is None:
        print(f"    warning: style version unknown — {why}. The manifest will "
              f"record \"unknown\" for {key}.")
    out.with_suffix(".txt").write_text("\n".join([
        f"badge:          {key}",
        "operation:      extend 1:1 to 4:3 (outpaint)",
        "provider:       openrouter",
        f"model:          {model}",
        f"seed:           {seed}",
        # Inherited from the source, never read from style.md — see above.
        f"style version:  {version or 'unknown'}",
        f"reference:      {rel(source)}",
        f"resolution:     {RESOLUTION} {ASPECT_RATIO} → {OUT_W}×{OUT_H}",
        f"crop:           {note}",
        f"image sha256:   {sha}",
        f"measured cost:  {cost}",
        "",
        "--- prompt as sent ---",
        PROMPT,
        "",
    ]), encoding="utf-8")


def rel(path):
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def finish(png: bytes, key, model, seed, cost, source: Path):
    """Write the raw generation, the cropped candidate and the sidecar."""
    out = next_attempt_path(key)
    raw_path = out.with_name(out.stem + ".raw.png")
    raw_path.write_bytes(png)
    recrop(out, raw_path, key, model, seed, cost, source)
    print(f"    wrote {out.relative_to(ROOT)}  ({raw_path.name} kept)")
    return out


def recrop(out: Path, raw_path: Path, key, model, seed, cost, source: Path):
    """Re-derive `out` and its sidecar from a stored raw generation, in place.

    IN PLACE, not as a new attempt number. A re-crop is not a new roll of the
    dice — the pixels the model returned are identical — so giving it its own
    attempt number would make the candidate list read as if money had been spent
    twice. This is the whole reason the raw is kept beside the crop, and it is
    what makes a change to `crop_to_deck_size` free to apply across the deck.
    """
    with Image.open(raw_path) as raw:
        cropped, note = crop_to_deck_size(raw, key)
    cropped.save(out)
    write_sidecar(out, key, model, seed, cost, note,
                  hashlib.sha256(out.read_bytes()).hexdigest(), source)
    print(f"    {note}")


def stored_raws(key):
    """Every `<key>.wNN.raw.png` on disk, oldest attempt first."""
    return sorted(
        p for p in CANDIDATES.glob(f"{key}.w*.raw.png")
        if re.fullmatch(rf"{re.escape(key)}\.w(\d+)\.raw\.png", p.name)
    )


# --------------------------------------------------------------------------- #

def main():
    ap = argparse.ArgumentParser(description="Widen approved badge masters to 4:3.")
    ap.add_argument("key", nargs="?", help="a badge key with an approved master")
    ap.add_argument("--all", action="store_true",
                    help="every key in the catalog; skips keys that already have a candidate")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--seed", type=int, default=1970)
    ap.add_argument("--source", type=Path,
                    help="the square image to widen (default: assets/badges/<key>.png). "
                         "A NEW badge has no master yet, so point this at the approved "
                         "square candidate — see THE ORDER OF OPERATIONS in the header")
    ap.add_argument("--recrop", action="store_true",
                    help="re-derive every candidate from its stored .raw.png, in place. "
                         "No network and no charge — use after changing the crop rule")
    ap.add_argument("--dry-run", action="store_true", help="print the prompt and stop")
    args = ap.parse_args()

    if args.dry_run:
        print(PROMPT)
        return

    if args.recrop:
        keys = badge_keys() if args.all else [args.key]
        n = 0
        for k in keys:
            for raw_path in stored_raws(k):
                out = raw_path.with_name(raw_path.name.replace(".raw.png", ".png"))
                print(f"{out.name}")
                recrop(out, raw_path, k, args.model, args.seed,
                       "(re-crop of a generation already paid for)",
                       args.source or MASTERS / f"{k}.png")
                n += 1
        print(f"\nre-cropped {n} candidate(s); nothing was charged")
        return

    if args.source and args.all:
        sys.exit("error: --source names one image, so it cannot be combined with --all")

    if args.all == bool(args.key):
        sys.exit("error: pass exactly one of a badge key or --all")

    keys = badge_keys() if args.all else [args.key]
    if args.key and args.key not in badge_keys():
        sys.exit(f"error: unknown badge key {args.key!r}")

    todo = []
    for k in keys:
        source = args.source or MASTERS / f"{k}.png"
        if not source.exists():
            print(f"skip {k}: nothing to widen at {rel(source)}")
            continue
        if args.all and list(CANDIDATES.glob(f"{k}.w*.png")):
            print(f"skip {k}: already has a candidate")
            continue
        todo.append((k, source))
    if not todo:
        print("nothing to do")
        return

    api_key = read_api_key()
    start = usage(api_key)
    print(f"account lifetime usage before: ${start:.6f}")
    print(f"{len(todo)} badge(s) to widen at ~$0.033 each "
          f"— about ${len(todo) * 0.033:.2f}\n")

    failed = []
    for i, (k, source) in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {k}", flush=True)
        before = usage(api_key)
        png, err = post(api_key, args.model, source, args.seed)
        if err or png is None:
            print(f"    FAILED: {err}")
            failed.append(k)
            continue
        after = before
        for _ in range(12):
            time.sleep(4)
            after = usage(api_key)
            if after > before:
                break
        finish(png, k, args.model, args.seed, f"${after - before:.6f}", source)

    total = usage(api_key) - start
    print(f"\ntotal for this run: ${total:.6f} over {len(todo) - len(failed)} image(s)")
    if failed:
        print(f"FAILED, re-run to retry: {', '.join(failed)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
