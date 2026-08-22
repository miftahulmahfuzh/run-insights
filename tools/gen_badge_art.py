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

  ONE DECK, NO `--kind` — UNTIL F25. The reference serves two decks (badge and
  level) because daily-words has both a badge shelf and a level-panel system.
  Run Insights had only the badge shelf, so `KINDS["badge"]`'s five fields were
  four module constants here. F25 added the ten personal-record patches, which
  is the second deck that comment said to restore the abstraction for — so the
  table is back, as `tools/decks.py`, shared with `check_badge_art.py`,
  `make_badge_assets.py` and `scripts/check-badge-art.mjs` rather than copied
  into each. `--deck` DEFAULTS TO `badges`, so every command in this file's
  docstring, in the skill and in F10's plan still means what it said.

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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from decks import DECKS, add_deck_argument, deck_for  # noqa: E402

# The one thing every deck shares, and the reason `decks.py` holds no copy of
# it: the style block is ONE text, which is what makes "one bolt of cloth" a
# statement rather than an aspiration. Only the scene lines and the per-deck
# addendum are keyed by deck.
CONTRACT = SKILL / "style.md"

BASE = "https://openrouter.ai/api/v1"
KEY_VAR = "OPENROUTER_API_KEY"
MODEL = "qwen/qwen-image-3-pro"

# `resolution` and `aspect_ratio`, NOT `size`. OpenRouter ignores `size` and its
# default is 2K, so omitting these silently returns a 2048² master that
# check_badge_art.py rejects on check 1 *after* the money is spent.
# `RESOLUTION` is an enum there ('1K' | '2K'), not a pixel count.
RESOLUTION = "1K"
MASTER_PX = 1024  # what '1K' means on the long edge. Recorded, not sent.

# `--aspect-ratio` DEFAULTS TO 1:1, and that default is load-bearing rather than
# lazy. STYLE BLOCK v2 asks for the patch at "about 80 percent of the image
# WIDTH", and all four observed `SHAPE_WIDTH` numbers in check_badge_art.py were
# measured on square frames — so 1:1 is the frame the composition contract was
# written against, and `extend_badge_art.py` widens an approved square master to
# 4:3 afterwards rather than re-rolling it.
#
# The flag exists because F25 asks whether a deck can be generated at 4:3
# natively and skip the widening pass. That is a QUESTION, not a fact: the same
# header measured prompted patch size as barely responsive ("eighty percent" →
# 66.0%, "eighty-eight percent" → 68.0%). So the flag makes the experiment
# possible for the price of one generation, and the default keeps every existing
# instruction correct while it is being answered.
DEFAULT_ASPECT_RATIO = "1:1"
ASPECT_PX = {
    "1:1": (1024, 1024),
    "4:3": (1024, 768),
    "3:4": (768, 1024),
}


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
SCENE_LINE_RE = re.compile(r"^- ([a-z0-9_]+): (.+)$", re.M)


def region(text, opening, closing=None):
    """The body between `<!-- opening -->` and `<!-- /closing -->`, or None.

    `closing` defaults to `opening`. They differ for the addendum, whose opening
    marker carries a version (`ADDENDUM:records v1`) and whose closing one does
    not — the same asymmetry `<!-- STYLE BLOCK v2 -->` … `<!-- /STYLE BLOCK -->`
    already uses, so a version bump is a one-line edit rather than a two-line
    one that can be half-done.

    Same anchoring rule as STYLE_RE and for the same scar: style.md quotes its
    markers inline in the interface table, and an unanchored non-greedy match
    started at the table and returned zero scenes rather than an error.
    """
    m = re.search(
        rf"^<!-- {re.escape(opening)} -->$\n(.*?)^<!-- /{re.escape(closing or opening)} -->$",
        text, re.S | re.M,
    )
    return m.group(1) if m else None


def load_style(deck):
    """(version, style_block, [(key, scene), ...]) from style.md, for one deck.

    THE BLOCK IS SHARED AND THE SCENES ARE NOT. Both decks are one bolt of
    cloth — same substrate, same merrowed border, same five threads, same
    signature — so there is exactly one `<!-- STYLE BLOCK -->` and every deck
    reads it. What differs is the scene list, and, for a deck the block was not
    literally written for, a short ADDENDUM appended after it.

    The addendum is NOT a version bump. `scripts/check-badge-art.mjs` asserts
    every promoted master's sidecar version equals the block's current version,
    so bumping v2→v3 would fail `npm run badges:check` on all 22 badges until
    every one of them was regenerated — for a change that adds a fifth
    silhouette the badge deck does not use. See `decks.py` and F25 §4.
    """
    if not CONTRACT.exists():
        die(f"no style contract at {rel(CONTRACT)}")
    text = CONTRACT.read_text(encoding="utf-8")

    m = STYLE_RE.search(text)
    if not m:
        die(f"{CONTRACT.name} has no `<!-- STYLE BLOCK vN -->` … `<!-- /STYLE BLOCK -->` "
            "region with each marker alone on its own line")
    version, block = m.group(1), m.group(2).strip()

    if deck.addendum_marker:
        marker = f"{deck.addendum_marker} v{deck.addendum_version}"
        body = region(text, marker, deck.addendum_marker)
        if body is None:
            die(f"deck {deck.name!r} wants `<!-- {marker} -->` … "
                f"`<!-- /{deck.addendum_marker} -->` in {CONTRACT.name}, with each "
                f"marker alone on its own line, and it is not there.\n"
                f"  The addendum is how a deck adds to the shared style block "
                f"without bumping it — see tools/decks.py.")
        block = f"{block}\n\n{body.strip()}"

    body = region(text, deck.scenes_marker)
    if body is None:
        die(f"{CONTRACT.name} has no `<!-- {deck.scenes_marker} -->` … "
            f"`<!-- /{deck.scenes_marker} -->` region with each marker alone on "
            f"its own line")
    scenes = SCENE_LINE_RE.findall(body)
    if not scenes:
        die(f"{CONTRACT.name}'s {deck.scenes_marker} region holds no "
            f"`- <key>: <scene>` lines")

    return deck.style_version(version), block, scenes


# The two patterns this used to hold inline now live in `tools/decks.py`, beside
# the catalog path each one applies to. F09's badge catalog is a
# `readonly BadgeDefinition[]` built by a `badge(key, title, scope)` helper and
# F06's record catalog is plain object literals with a `key:` field, so the
# entry shape genuinely differs per deck — a single module-level KEY_RE could
# only ever have read one of them.
def load_catalog_keys(deck):
    """This deck's keys, in catalog order, read out of its own catalog module.

    Read rather than hardcoded. §4.6 is 22 badge keys today and R-33 already
    moved it from 20 once; a hardcoded count is a line that needs editing in a
    fourth file every time a catalog moves, and the whole point of the parity
    guard below is that the catalog is the single source of truth.

    THE ENTRY SHAPE IS PER DECK. F09 ships `BADGE_CATALOG` as a
    `readonly BadgeDefinition[]` built by a `badge(key, title, scope)` helper;
    F06 ships `RECORD_CATALOG` as plain object literals with a `key:` field.
    One shared regex could not have read both, which is why the pattern lives
    in `decks.py` beside the path it applies to rather than here.
    """
    source = deck.catalog_path()
    if not source.exists():
        die(f"no {deck.noun} catalog at {rel(source)}")
    m = re.search(rf"{deck.catalog_array}[^=]*=\s*\[(.*?)^\]",
                  source.read_text(encoding="utf-8"), re.S | re.M)
    if not m:
        die(f"could not find `{deck.catalog_array} … = [ … ]` in {rel(source)}.\n"
            f"  If that catalog was refactored, `catalog_array` and `key_pattern`\n"
            f"  for deck {deck.name!r} in tools/decks.py are the two lines to fix —\n"
            f"  they only care about the array literal's shape, not about anything\n"
            f"  else in that module.")
    keys = re.findall(deck.key_pattern, m.group(1), re.M)
    if not keys:
        die(f"{deck.catalog_array} in {rel(source)} parsed to zero keys — see "
            f"`key_pattern` for deck {deck.name!r} in tools/decks.py")
    return keys


def assert_parity(deck, scene_keys, source_keys):
    """Refuse to start on any disagreement between style.md and this deck's catalog.

    One of three drift mechanisms, and the only one that fires BEFORE money is
    spent. The other two are `npm run typecheck` (a key with no art, because
    each manifest is a total Record) and `npm run badges:check` (art with no key).

    PER DECK, WHICH IS THE WHOLE POINT. This assertion is exactly why F25's ten
    record scenes could not simply be appended to `<!-- SCENES -->` as first
    drafted: that region is checked against BADGE_CATALOG, so ten record keys
    inside it would have made every BADGE generation refuse to start, reporting
    ten orphans. Each deck's scene region is checked against its own catalog and
    the two cannot interfere.
    """
    source = rel(deck.catalog_path())
    missing = [k for k in source_keys if k not in scene_keys]
    orphan = [k for k in scene_keys if k not in source_keys]
    if missing or orphan:
        lines = [f"{CONTRACT.name} and {deck.catalog_array} disagree "
                 f"(deck {deck.name!r}):"]
        if missing:
            lines.append(f"  in {source}, no scene line: {', '.join(missing)}")
            lines.append(f"  → add `- <key>: <scene>` inside "
                         f"<!-- {deck.scenes_marker} --> in {CONTRACT.name}")
        if orphan:
            lines.append(f"  scene line, not in {source}: {', '.join(orphan)}")
            lines.append(f"  → the key was renamed or removed, or the scene is a "
                         f"draft that belongs outside <!-- {deck.scenes_marker} -->")
        die("\n".join(lines))
    if scene_keys != source_keys:
        # Not fatal. Order is a readability property of a generated diff, not a
        # correctness one, and failing a paid run over it would be absurd.
        warn(f"{CONTRACT.name}'s {deck.scenes_marker} order differs from "
             f"{deck.catalog_array}'s; the two files read more easily in the "
             f"same order")


# --------------------------------------------------------------------------- #
# Prompt assembly
# --------------------------------------------------------------------------- #

def build_prompt(deck, style_block, scene, note=None):
    parts = [style_block, "", f"{deck.subject_label}: {scene}"]
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

def post_generation(key, model, prompt, reference: Path | None, aspect, seed=None):
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
        "aspect_ratio": aspect,
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


def write_sidecar(png_path, deck, key, model, version, reference, prompt,
                  aspect, seed=None):
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
            f"deck:           {deck.name}",
            "provider:       openrouter",
            f"model:          {model}",
            f"seed:           {seed if seed is not None else '(none)'}",
            f"style version:  {version}",
            f"reference:      {rel(reference) if reference else '(none — anchor run)'}",
            f"resolution:     {RESOLUTION} {aspect}  "
            f"(expect {ASPECT_PX[aspect][0]}×{ASPECT_PX[aspect][1]})",
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
    parser.add_argument("key", nargs="?", help="a key from the deck's catalog")
    add_deck_argument(parser)
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
    parser.add_argument("--aspect-ratio", default=DEFAULT_ASPECT_RATIO,
                        choices=sorted(ASPECT_PX),
                        help=f"frame shape (default {DEFAULT_ASPECT_RATIO}; see "
                             f"the constant's comment before changing it)")
    args = parser.parse_args()

    deck = deck_for(args.deck)
    candidates = deck.candidates_dir()

    version, style_block, scenes = load_style(deck)
    scene_by_key = dict(scenes)
    scene_keys = [k for k, _ in scenes]
    source_keys = load_catalog_keys(deck)
    assert_parity(deck, scene_keys, source_keys)

    if args.all:
        if not args.dry_run:
            die("--all is only legal with --dry-run. One badge per invocation: "
                "the three-attempt cap and the look-at-it step are per badge, "
                "and a loop makes both ceremonial.")
        targets = source_keys
    elif args.key:
        if args.key not in scene_by_key:
            die(f"unknown {deck.noun} key {args.key!r} in deck {deck.name!r}. "
                f"Known keys:\n  " + "\n  ".join(source_keys))
        targets = [args.key]
    else:
        die(f"name a {deck.noun} key, or pass --dry-run --all")

    if args.reference and not args.reference.exists():
        die(f"no reference image at {rel(args.reference)}")

    if args.dry_run:
        for key in targets:
            prompt = build_prompt(deck, style_block, scene_by_key[key], args.note)
            print(f"\n{'=' * 76}\n{key}  (deck {deck.name}, style {version}, "
                  f"openrouter {args.model}, {args.aspect_ratio}, "
                  f"{len(prompt)} chars)\n{'=' * 76}\n{prompt}")
        print(f"\n{'-' * 76}\ndry run: {len(targets)} prompt(s) assembled, "
              f"{len(source_keys)} keys in {deck.catalog_array}. "
              f"No key was read, nothing was sent, nothing was written.")
        return

    key_name = targets[0]
    if not args.reference:
        anchor = deck.anchor_path()
        if anchor.exists():
            warn(f"{rel(anchor)} exists but --reference was not passed. "
                 f"Badges 2-N should be generated against the anchor, never "
                 f"against a description of it.")
        else:
            print("no --reference and no anchor on disk: this is an ANCHOR RUN.")

    api_key = read_api_key()
    prompt = build_prompt(deck, style_block, scene_by_key[key_name], args.note)
    print(f"{deck.noun} {key_name}, style {version}, openrouter {args.model}, "
          f"{args.aspect_ratio}, {len(prompt)} chars of prompt")

    png = post_generation(api_key, args.model, prompt, args.reference,
                          args.aspect_ratio, args.seed)

    out = next_attempt_path(candidates, key_name)
    out.write_bytes(png)
    sidecar = write_sidecar(out, deck, key_name, args.model, version,
                            args.reference, prompt, args.aspect_ratio, args.seed)

    print(f"\nwrote {rel(out)}  ({len(png) / 1024:.0f} kB)")
    print(f"      {rel(sidecar)}")
    print(f"\nnext: python3 tools/check_badge_art.py {rel(out)} --deck {deck.name}")


if __name__ == "__main__":
    main()
