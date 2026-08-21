#!/usr/bin/env python3
"""Generate one embroidered badge patch for Run Insights via OpenRouter.

    python3 tools/gen_badge_art.py early_bird
    python3 tools/gen_badge_art.py sandbagger --reference assets/badges/_anchor.png
    python3 tools/gen_badge_art.py metronome --note "the pendulum arm is leaning; stand it upright"
    python3 tools/gen_badge_art.py --dry-run --all

Design record: docs/plans/F10-badge-art-skill.md §5.1 and §6; roadmap §4.6 (the
22 keys), §4.7 (the style), D12 (offline generation, committed, no runtime image
calls).

Descends from /home/miftah/daily-words/tools/gen_badge_art.py with two
deliberate simplifications, both argued in plan §5.1:

  ONE PROVIDER, NO `--provider`. The roadmap header pins the model outright —
  `qwen/qwen-image-3-pro` via OpenRouter. The reference tool carries a
  two-provider table because its deck was actually built across an
  OpenAI-to-OpenRouter migration and both providers have shipped masters on
  disk. This deck starts from zero with one provider chosen in advance, so the
  OpenAI branch (the multipart /images/edits upload, `post_edit`, the
  default-model-per-provider logic) would be dead code from the first commit.
  If a second provider is ever needed, port the table back in at that time.

  ONE DECK, NO `--kind`. The reference serves two decks (badge and level)
  because daily-words has both a badge shelf and a level-panel system.
  Run Insights has only the badge shelf; there is no `lib/badges/levels.ts`
  equivalent in the roadmap and none is planned. `KINDS["badge"]`'s five fields
  are the four module constants below.

Everything else carries over verbatim and should NOT be re-derived: the
`.env.local`-before-environment key read and its printed-source-not-value line,
the `RES_OPTIONS=no-aaaa` WSL DNS workaround, the hand-built JSON POST, the
sidecar `.txt` format and its `style version:` line (parsed by
`make_badge_assets.py`), the `next_attempt_path` numbering, `--dry-run` /
`--note` / `--seed`, and the parity assertion between `<!-- SCENES -->` and the
catalog that refuses to start rather than generating something the manifest
cannot place.

stdlib only, on purpose. This machine has neither `requests` nor `httpx` nor the
`openai` package, and one hand-built JSON POST is the whole cost of not adding a
dependency to an art tool that runs offline on one developer's machine. (The
*checker* needs PIL; this does not.)

THE KEY. `OPENROUTER_API_KEY` is read here and nowhere else. It is NOT
`LLM_API_KEY` — the app's model access is GLM via z.ai (roadmap §4.1, R-40), and
this is an image API, a different provider, a different key and a different
bill. `lib/env.ts` has no entry for it by design. No file under `app/`, `lib/` or
`components/` may ever name it, and that grep staying empty is a checked
property of the repository: `npm run badges:check` and `npm run
ci:openrouter-guard`. This script prints which SOURCE the key came from and
never prints the key.
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

# Inherited from the repository this tool descends from, where AAAA lookups were
# measured hanging 4-12 s under WSL before every request. This is the same WSL
# family (6.18.x-microsoft-standard-WSL2) but the hang has NOT been measured
# here — the line is free and the honest note is cheaper than the measurement.
# Must be set before any DNS resolution happens.
os.environ.setdefault("RES_OPTIONS", "no-aaaa")

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / ".claude" / "skills" / "generate-badge"

# What `--kind` used to select, inlined. One deck, so these are constants.
CONTRACT = SKILL / "style.md"
SOURCE = ROOT / "lib" / "badges" / "catalog.ts"
MASTERS = ROOT / "assets" / "badges"
SUBJECT = "SUBJECT FOR THIS BADGE"
TABLE = "BADGE_CATALOG"

BASE = "https://openrouter.ai/api/v1"
KEY_VAR = "OPENROUTER_API_KEY"
MODEL = "qwen/qwen-image-3-pro"

# `resolution` and `aspect_ratio`, NOT `size`. OpenRouter ignores `size` and its
# default is 2K, so omitting these silently returns a 2048² master that
# check_badge_art.py rejects on check 1 *after* the money is spent.
# `RESOLUTION` is an enum there ('1K' | '2K'), not a pixel count.
RESOLUTION = "1K"
ASPECT_RATIO = "1:1"
MASTER_PX = 1024  # what '1K' means, and what check 1 asserts. Recorded, not sent.


# --------------------------------------------------------------------------- #
# The style contract
# --------------------------------------------------------------------------- #

# Markers only count when they are alone on their own line. style.md quotes both
# markers inline in its interface table, and a non-greedy match that did not
# anchor started at the table and returned zero scenes rather than an error.
STYLE_RE = re.compile(
    r"^<!-- STYLE BLOCK (v\d+) -->$\n(.*?)^<!-- /STYLE BLOCK -->$",
    re.S | re.M,
)
SCENES_RE = re.compile(r"^<!-- SCENES -->$\n(.*?)^<!-- /SCENES -->$", re.S | re.M)
SCENE_LINE_RE = re.compile(r"^- ([a-z0-9_]+): (.+)$", re.M)


def load_style():
    """(version, style_block, [(key, scene), ...]) from style.md."""
    if not CONTRACT.exists():
        die(f"no style contract at {rel(CONTRACT)}")
    text = CONTRACT.read_text(encoding="utf-8")

    m = STYLE_RE.search(text)
    if not m:
        die(f"{CONTRACT.name} has no `<!-- STYLE BLOCK vN -->` … `<!-- /STYLE BLOCK -->` "
            "region with each marker alone on its own line")
    version, block = m.group(1), m.group(2).strip()

    s = SCENES_RE.search(text)
    if not s:
        die(f"{CONTRACT.name} has no `<!-- SCENES -->` … `<!-- /SCENES -->` region with "
            "each marker alone on its own line")
    scenes = SCENE_LINE_RE.findall(s.group(1))
    if not scenes:
        die(f"{CONTRACT.name}'s SCENES region holds no `- <key>: <scene>` lines")

    return version, block, scenes


# F09 shipped `lib/badges/catalog.ts` as a `readonly BadgeDefinition[]` built by a
# `badge(key, title, scope)` helper rather than as the object-literal array the
# reference tool's regex expected — plan §5.1 flagged exactly this as an
# assumption to check when F09 landed, and it is the two-line change it promised
# rather than a redesign. The array literal is still the thing being read; only
# the shape of one entry differs, so `KEY_RE` matches `badge('key', …)` instead
# of `key: "…"`. Single quotes because that is what Prettier writes here.
CATALOG_RE = re.compile(r"BADGE_CATALOG[^=]*=\s*\[(.*?)^\]", re.S | re.M)
KEY_RE = re.compile(r"^\s*badge\(\s*'([a-z0-9_]+)'", re.M)


def load_catalog_keys():
    """Badge keys in BADGE_CATALOG order, read out of lib/badges/catalog.ts.

    Read rather than hardcoded. §4.6 is 22 keys today and R-33 already moved it
    from 20 once; a hardcoded count is a line that needs editing in a fourth
    file every time the catalog moves, and the whole point of the parity guard
    below is that the catalog is the single source of truth.
    """
    if not SOURCE.exists():
        die(f"no badge catalog at {rel(SOURCE)}")
    m = CATALOG_RE.search(SOURCE.read_text(encoding="utf-8"))
    if not m:
        die(f"could not find `{TABLE} … = [ … ]` in {rel(SOURCE)}.\n"
            f"  If F09's catalog was refactored, CATALOG_RE/KEY_RE at the top of\n"
            f"  this file are the two lines to fix — they only care about the\n"
            f"  array literal's shape, not about anything else in that module.")
    keys = KEY_RE.findall(m.group(1))
    if not keys:
        die(f"{TABLE} in {rel(SOURCE)} parsed to zero keys — see CATALOG_RE/KEY_RE")
    return keys


def assert_parity(scene_keys, source_keys):
    """Refuse to start on any disagreement between style.md and the catalog.

    One of three drift mechanisms, and the only one that fires BEFORE money is
    spent. The other two are `npm run typecheck` (a key with no art, because
    `lib/badges/badge-art.ts` is a total Record) and `npm run badges:check` (art
    with no key).
    """
    missing = [k for k in source_keys if k not in scene_keys]
    orphan = [k for k in scene_keys if k not in source_keys]
    if missing or orphan:
        lines = [f"{CONTRACT.name} and {TABLE} disagree:"]
        if missing:
            lines.append(f"  in {rel(SOURCE)}, no scene line: {', '.join(missing)}")
            lines.append(f"  → add `- <key>: <scene>` inside <!-- SCENES --> in {CONTRACT.name}")
        if orphan:
            lines.append(f"  scene line, not in {rel(SOURCE)}: {', '.join(orphan)}")
            lines.append("  → the key was renamed or removed, or the scene is a draft "
                         "that belongs outside <!-- SCENES -->")
        die("\n".join(lines))
    if scene_keys != source_keys:
        # Not fatal. Order is a readability property of a generated diff, not a
        # correctness one, and failing a paid run over it would be absurd.
        warn(f"{CONTRACT.name}'s scene order differs from {TABLE}'s; the two files "
             f"read more easily in the same order")


# --------------------------------------------------------------------------- #
# Prompt assembly
# --------------------------------------------------------------------------- #

def build_prompt(style_block, scene, note=None):
    parts = [style_block, "", f"{SUBJECT}: {scene}"]
    if note:
        # After the scene line, so a correction is read as a refinement of this
        # image rather than as an amendment to the deck's style.
        parts += ["", f"CORRECTION FOR THIS ATTEMPT: {note}"]
    return "\n".join(parts)


# --------------------------------------------------------------------------- #
# The key
# --------------------------------------------------------------------------- #

def read_api_key():
    """`.env.local` first, then the environment. Prints WHICH, never the value.

    The order and the announcement are both scar tissue: a stale exported shell
    variable silently winning over the file you just edited is a confusing hour,
    and one printed word ends it.
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
        f"  script print it (plan §6).")


# --------------------------------------------------------------------------- #
# The request
# --------------------------------------------------------------------------- #

def post_generation(key, model, prompt, reference: Path | None, seed=None):
    """OpenRouter's single image endpoint, with or without the anchor.

    **There is no `/images/edits` here.** It 404s on this provider — not
    "unknown model", the route does not exist — so the anchor rides in
    `input_references`, an array of the same `image_url` objects a chat message
    would carry, on the ordinary generations call. One endpoint does both jobs.

    The chat-completions route — `modalities: ["image", "text"]` — also produces
    images on this provider, but `qwen/qwen-image-3-pro` refuses it with "no
    endpoints found that support the requested output modalities". Do not reach
    for it: this endpoint is the one the model answers.
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
    if reference:
        data_url = "data:image/png;base64," + base64.b64encode(
            reference.read_bytes()
        ).decode("ascii")
        payload["input_references"] = [
            {"type": "image_url", "image_url": {"url": data_url}}
        ]

    req = urllib.request.Request(
        f"{BASE}/images/generations",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    return send(req)


def send(req):
    started = time.monotonic()
    try:
        # An anchored Qwen call has been measured at just over two minutes on
        # the deck this tool descends from, so this ceiling is doing real work
        # rather than guarding a hypothetical.
        with urllib.request.urlopen(req, timeout=300) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:2000]
        die(f"HTTP {exc.code} from the image API\n{detail}\n\n"
            f"  If this says the model is unknown, list what the provider\n"
            f"  actually serves — and note that OpenRouter's image models are\n"
            f"  NOT in /api/v1/models, which is why they look absent:\n"
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

def next_attempt_path(candidates, key):
    candidates.mkdir(parents=True, exist_ok=True)
    used = {
        int(m.group(1))
        for p in candidates.glob(f"{key}.a*.png")
        if (m := re.fullmatch(rf"{re.escape(key)}\.a(\d+)\.png", p.name))
    }
    return candidates / f"{key}.a{(max(used) + 1) if used else 1:02d}.png"


def write_sidecar(png_path, key, model, version, reference, prompt, seed=None):
    """The exact prompt beside the exact image.

    This is what lets a candidate you like six weeks from now be explained, and
    what makes "is this badge on the current style block?" answerable without
    guessing. Only `style version:` is ever parsed (by make_badge_assets.py);
    the rest is for a human six weeks later.
    """
    sidecar = png_path.with_suffix(".txt")
    sidecar.write_text(
        "\n".join([
            f"badge:          {key}",
            "provider:       openrouter",
            f"model:          {model}",
            f"seed:           {seed if seed is not None else '(none)'}",
            f"style version:  {version}",
            f"reference:      {rel(reference) if reference else '(none — anchor run)'}",
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

def rel(path):
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def die(message) -> NoReturn:
    print(f"\nerror: {message}", file=sys.stderr)
    sys.exit(1)


def warn(message):
    print(f"warning: {message}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(
        description="Generate one embroidered badge patch for Run Insights.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="The style contract is .claude/skills/generate-badge/style.md — a "
               "file a human edits and this script reads, so the prompt that was "
               "sent can never drift from the prompt that is documented.",
    )
    parser.add_argument("key", nargs="?", help=f"a badge key from {TABLE}")
    parser.add_argument("--all", action="store_true",
                        help="every key in the deck; only legal with --dry-run")
    parser.add_argument("--dry-run", action="store_true",
                        help="assemble and print the prompt; no key, no network, no file")
    parser.add_argument("--reference", type=Path,
                        help="anchor image, normally assets/badges/_anchor.png")
    parser.add_argument("--note", help="a correction appended after the scene line")
    parser.add_argument("--model", default=MODEL,
                        help=f"image model (default {MODEL}, pinned by the roadmap header)")
    parser.add_argument("--seed", type=int,
                        help="reproducibility; qwen-image-3-pro honours it")
    args = parser.parse_args()

    candidates = MASTERS / "_candidates"

    version, style_block, scenes = load_style()
    scene_by_key = dict(scenes)
    scene_keys = [k for k, _ in scenes]
    source_keys = load_catalog_keys()
    assert_parity(scene_keys, source_keys)

    if args.all:
        if not args.dry_run:
            die("--all is only legal with --dry-run. One badge per invocation: "
                "the three-attempt cap and the look-at-it step are per badge, "
                "and a loop makes both ceremonial.")
        targets = source_keys
    elif args.key:
        if args.key not in scene_by_key:
            die(f"unknown badge key {args.key!r}. Known keys:\n  "
                + "\n  ".join(source_keys))
        targets = [args.key]
    else:
        die("name a badge key, or pass --dry-run --all")

    if args.reference and not args.reference.exists():
        die(f"no reference image at {rel(args.reference)}")

    if args.dry_run:
        for key in targets:
            prompt = build_prompt(style_block, scene_by_key[key], args.note)
            print(f"\n{'=' * 76}\n{key}  (style {version}, openrouter {args.model}, "
                  f"{len(prompt)} chars)\n{'=' * 76}\n{prompt}")
        print(f"\n{'-' * 76}\ndry run: {len(targets)} prompt(s) assembled, "
              f"{len(source_keys)} keys in {TABLE}. "
              f"No key was read, nothing was sent, nothing was written.")
        return

    key_name = targets[0]
    if not args.reference:
        anchor = MASTERS / "_anchor.png"
        if anchor.exists():
            warn(f"{rel(anchor)} exists but --reference was not passed. "
                 f"Badges 2-N should be generated against the anchor, never "
                 f"against a description of it.")
        else:
            print("no --reference and no anchor on disk: this is an ANCHOR RUN.")

    api_key = read_api_key()
    prompt = build_prompt(style_block, scene_by_key[key_name], args.note)
    print(f"badge {key_name}, style {version}, openrouter {args.model}, "
          f"{len(prompt)} chars of prompt")

    png = post_generation(api_key, args.model, prompt, args.reference, args.seed)

    out = next_attempt_path(candidates, key_name)
    out.write_bytes(png)
    sidecar = write_sidecar(out, key_name, args.model, version, args.reference,
                            prompt, args.seed)

    print(f"\nwrote {rel(out)}  ({len(png) / 1024:.0f} kB)")
    print(f"      {rel(sidecar)}")
    print(f"\nnext: python3 tools/check_badge_art.py {rel(out)}")


if __name__ == "__main__":
    main()
