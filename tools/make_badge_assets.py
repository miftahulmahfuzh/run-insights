#!/usr/bin/env python3
"""Promote approved masters to shipped assets, and regenerate the manifest.

    python3 tools/make_badge_assets.py
    python3 tools/make_badge_assets.py --dry-run
    python3 tools/make_badge_assets.py --lossless

Design record: docs/plans/F10-badge-art-skill.md §5.4, and D12 (offline
generation, committed, no runtime image calls).

  assets/badges/<key>.png                1024² PNG, lossless, never edited in place
    → public/badges/<key>.<hash8>.webp     768²  — the panel
    → public/badges/<key>.<hash8>.sm.webp  192²  — the shelf mark
    → lib/badges/badge-art.ts              the manifest, a TOTAL Record

ONE DECK. The tool this descends from carries a `DECKS` table because
daily-words ships badge medals AND level panels; Run Insights has only the badge
shelf, so the table is four module constants. If a second deck ever appears,
restore the abstraction then — the same argument gen_badge_art.py uses for
dropping `--provider`.

THE SKILL NEVER RUNS THIS. Regenerating public/** changes what ships. Because
filenames are content-hashed the change is *safe* — new bytes, new hash, new
filename, every cache in the world misses correctly — but it is still a change
to the shipped app, and it belongs in its own commit alongside
`npm run badges:check` and `npm run typecheck`.

WHY THE HASH IS IN THE FILENAME. `next.config.ts` serves /badges/* as
`immutable` with a one-year max-age, which is only safe because a regenerated
image lands at a different URL. Slug-named art plus an immutable header is how
every existing install keeps the old picture for up to a year after a
regeneration; content-hashed names make that impossible rather than merely
documented.

WHY THE Record IS TOTAL. `Record<BadgeKey, BadgeArt>`, never `Partial<>`. Adding
a 23rd key to BADGE_CATALOG without generating its art fails `npm run typecheck`
in the same session, before anything ships. That failure is the feature, and it
costs one keyword. It is also the second of gen_badge_art.py's three drift
mechanisms; the third is `npm run badges:check` (art with no key).

PIL only, like its two neighbours.
"""

import argparse
import hashlib
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

ROOT = Path(__file__).resolve().parent.parent
MASTERS = ROOT / "assets" / "badges"
PUBLIC = ROOT / "public" / "badges"
URL = "/badges"
MANIFEST = ROOT / "lib" / "badges" / "badge-art.ts"
SOURCE = ROOT / "lib" / "badges" / "catalog.ts"

MASTER_SIZE = 1024
PANEL = 768
# 192, for a shelf mark `BadgeShelf` currently draws at 56 css px — 3× on a
# phone, with room for a future panel that draws it larger. It costs about 2 kB
# over a tighter size and lets a consumer draw it smaller, which is always safe.
SMALL = 192
QUALITY = 90
METHOD = 6
# The lossy/lossless choice is a judgement to make while looking at the first
# promoted badge, not a number to trust from a plan, and NOTHING HAS BEEN
# MEASURED HERE YET — this deck has zero approved masters. quality=90 is the
# starting point the reference deck settled on after measuring its own (96–154 kB
# per 768² badge, a maximum difference of 6/255 against lossless at the size the
# panel actually draws). A satin-stitch patch has more high-frequency texture
# than a line engraving, so expect larger files and check the merrowed border for
# ringing at 220 css px before trusting this. `--lossless` is one flag away.

# Same shape as gen_badge_art.py's pair, and for the same reason: the catalog is
# the single source of truth for the key set. Kept as its own copy rather than
# imported, because these two scripts share no module and the regex is two lines.
CATALOG_RE = re.compile(r"BADGE_CATALOG[^=]*=\s*\[(.*?)^\]", re.S | re.M)
KEY_RE = re.compile(r"^\s*badge\(\s*'([a-z0-9_]+)'", re.M)
STYLE_VER_RE = re.compile(r"^style version:\s*(v\d+)\s*$", re.M)


def badge_keys():
    """Every key in BADGE_CATALOG, in catalog order — which IS shelf order."""
    if not SOURCE.exists():
        sys.exit(f"error: no badge catalog at {SOURCE}")
    m = CATALOG_RE.search(SOURCE.read_text(encoding="utf-8"))
    if not m:
        sys.exit(f"error: could not find `BADGE_CATALOG … = [ … ]` in {SOURCE}")
    keys = KEY_RE.findall(m.group(1))
    if not keys:
        sys.exit(f"error: BADGE_CATALOG in {SOURCE} parsed to zero keys")
    return keys


def style_version_for(key):
    """The style version this master was generated against — from its sidecar.

    NOT from style.md's current version. Reading the current version here would
    stamp every image "the version now" and make a mixed set undetectable, which
    is the exact thing the version stamp exists to catch.

    The sidecar arrives by promotion: `gen_badge_art.py` writes `<key>.aNN.txt`
    beside every candidate, and the promotion step copies BOTH files. A master
    with no sidecar is recorded "unknown" and warned about rather than guessed at.
    """
    sidecar = MASTERS / f"{key}.txt"
    if not sidecar.exists():
        return None
    m = STYLE_VER_RE.search(sidecar.read_text(encoding="utf-8"))
    return m.group(1) if m else None


def twill_hex(img):
    """The art's own twill, `#rrggbb`, as the mean of the master's outer 5% frame.

    The same region and the same rule `check_badge_art.py`'s `substrate_stats`
    uses, so the promoted value and the graded value can never disagree. That
    frame is bare cloth by construction: the style block's FULL BLEED rule makes
    the image the twill, and check 3 gates all four edge strips.

    Sampled, never chosen. Regenerating an image can shift its twill, and the
    style block asks for "near #1B2A44" rather than for that exact value —
    a generated navy is what the shelf must match, not a hex from a document.
    Sampled from the 1024² master rather than the 768² derivative so that this
    field and `sha256` describe the same bytes.
    """
    px = img.convert("RGB").load()
    w, h = img.size
    band = max(1, int(round(min(w, h) * 0.05)))
    rs, gs, bs = [], [], []
    for y in range(h):
        edge_row = y < band or y >= h - band
        for x in range(w):
            if not (edge_row or x < band or x >= w - band):
                continue
            r, g, b = px[x, y]
            rs.append(r)
            gs.append(g)
            bs.append(b)
    n = len(rs)
    return "#%02x%02x%02x" % (round(sum(rs) / n), round(sum(gs) / n), round(sum(bs) / n))


def emit_manifest(entries, style_versions):
    versions = sorted({v for v in style_versions.values() if v})
    ver_note = (
        f"generated against style {versions[0]}"
        if len(versions) == 1
        else f"MIXED STYLE VERSIONS: {', '.join(versions)}"
        if versions
        else "style version unknown"
    )
    lines = [
        "/**",
        " * GENERATED FILE — do not edit by hand.",
        " *",
        " *   python3 tools/make_badge_assets.py",
        " *",
        " * Source art is `assets/badges/<key>.png`; these are its derivatives.",
        f" * Every entry here is {ver_note}.",
        " *",
        " * This is a TOTAL `Record<BadgeKey, BadgeArt>` on purpose. A key added to",
        " * BADGE_CATALOG with no art fails `npm run typecheck` immediately, in the same",
        " * session, before anything ships — a far stronger guarantee than a check script",
        " * nobody runs, and it costs one keyword. The fix for that failure is to generate",
        " * the art, not to reach for `Partial<>`.",
        " *",
        " * Filenames carry the first 8 hex of the master's SHA-256. Regenerating an image",
        " * changes its bytes, its hash and its filename, so every cache misses correctly",
        " * and `next.config.ts` may serve /badges/* as `immutable`.",
        " *",
        " * Plain data. No `import 'server-only'` — the shelf is a plain component and this",
        " * holds no secret.",
        " */",
        "import type { BadgeKey } from './types'",
        "",
        "export interface BadgeArt {",
        f"  /** {PANEL}×{PANEL} WebP for a badge panel. */",
        "  src: string",
        f"  /** {SMALL}×{SMALL} WebP for the shelf mark, drawn at 56 css px. */",
        "  small: string",
        "  /** SHA-256 of `assets/badges/<key>.png`, the approved master. */",
        "  sha256: string",
        "  /**",
        "   * The patch's own twill, `#rrggbb`, as the mean of the master's outer 5% frame.",
        "   * A tile can paint its own background with this so the square art sits inside a",
        "   * rounded field with no seam and no crop. Sampled from the master, never chosen;",
        "   * `npm run badges:check` recomputes it exactly as it recomputes `sha256`.",
        "   */",
        "  twill: string",
        "  /** The style.md version this image was generated against. */",
        "  styleVersion: string",
        "}",
        "",
        "/** Intrinsic pixel sizes, so a consumer never has to restate them. */",
        f"export const BADGE_ART_SIZE = {PANEL}",
        f"export const BADGE_ART_SMALL_SIZE = {SMALL}",
        "",
        "export const BADGE_ART: Record<BadgeKey, BadgeArt> = {",
    ]
    for key, sha, twill in entries:
        h8 = sha[:8]
        lines += [
            f"  {key}: {{",
            f"    src: '{URL}/{key}.{h8}.webp',",
            f"    small: '{URL}/{key}.{h8}.sm.webp',",
            f"    sha256: '{sha}',",
            f"    twill: '{twill}',",
            f"    styleVersion: '{style_versions.get(key) or 'unknown'}',",
            "  },",
        ]
    lines += ["}", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Promote approved badge masters and regenerate the manifest."
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would change; write nothing")
    parser.add_argument("--lossless", action="store_true",
                        help="lossless WebP, if the merrowed border rings at 220 px")
    args = parser.parse_args()

    keys = badge_keys()
    missing = [k for k in keys if not (MASTERS / f"{k}.png").exists()]
    if missing:
        print(f"error: {len(missing)} of {len(keys)} masters are missing from "
              f"assets/badges/:", file=sys.stderr)
        for k in missing:
            print(f"  {k}.png", file=sys.stderr)
        print(f"\nNothing was written. The manifest is a TOTAL Record and a partial\n"
              f"one would not compile — refusing is what keeps the build green while\n"
              f"the deck is still being generated. Generate and promote the rest:\n"
              f"  python3 tools/gen_badge_art.py <key> --reference assets/badges/_anchor.png\n"
              f"  cp assets/badges/_candidates/<key>.aNN.png assets/badges/<key>.png\n"
              f"  cp assets/badges/_candidates/<key>.aNN.txt assets/badges/<key>.txt",
              file=sys.stderr)
        sys.exit(1)

    PUBLIC.mkdir(parents=True, exist_ok=True)
    entries = []
    versions = {}
    expected = set()

    for key in keys:
        master = MASTERS / f"{key}.png"
        sha = hashlib.sha256(master.read_bytes()).hexdigest()
        h8 = sha[:8]
        versions[key] = style_version_for(key)
        if versions[key] is None:
            print(f"warning: {key} has no assets/badges/{key}.txt sidecar; its style "
                  f"version will be recorded as \"unknown\". Copy the candidate's .txt "
                  f"when you promote.", file=sys.stderr)

        img = Image.open(master).convert("RGB")
        if img.size != (MASTER_SIZE, MASTER_SIZE):
            sys.exit(f"error: {master} is {img.size[0]}×{img.size[1]}, want {MASTER_SIZE}²")

        # Sampled here, off the master already in memory, so the file is read
        # once and both fields of the entry describe the same bytes.
        entries.append((key, sha, twill_hex(img)))

        for size, suffix in ((PANEL, "webp"), (SMALL, "sm.webp")):
            out = PUBLIC / f"{key}.{h8}.{suffix}"
            expected.add(out.name)
            if args.dry_run:
                print(f"would write {out.relative_to(ROOT)}  ({size}²)")
                continue
            opts = {"lossless": True} if args.lossless else {"quality": QUALITY}
            img.resize((size, size), Image.LANCZOS).save(out, "WEBP", method=METHOD, **opts)
            print(f"{out.relative_to(ROOT)}  {size}²  {out.stat().st_size / 1024:.0f} kB")

    # Orphans: a stale hash left behind by a regeneration. Only files matching the
    # generated shape for a known key are removed; anything else is reported and
    # left alone, because this tool should not be the thing that deletes a file a
    # human put there deliberately.
    shape = re.compile(rf"^({'|'.join(map(re.escape, keys))})\.[0-9a-f]{{8}}\.(sm\.)?webp$")
    if PUBLIC.exists():
        for path in sorted(PUBLIC.iterdir()):
            if path.name in expected or path.is_dir():
                continue
            if shape.match(path.name):
                print(f"{'would remove' if args.dry_run else 'removed'} stale "
                      f"{path.relative_to(ROOT)}")
                if not args.dry_run:
                    path.unlink()
            else:
                print(f"warning: unrecognised file left alone: {path.relative_to(ROOT)}",
                      file=sys.stderr)

    text = emit_manifest(entries, versions)
    if args.dry_run:
        print(f"\nwould write {MANIFEST.relative_to(ROOT)} "
              f"({len(entries)} entries, {len(text.splitlines())} lines)")
    else:
        MANIFEST.write_text(text, encoding="utf-8")
        print(f"\nwrote {MANIFEST.relative_to(ROOT)}  ({len(entries)} entries)")

    mixed = sorted({v for v in versions.values() if v})
    if len(mixed) > 1:
        print(f"\nwarning: MIXED STYLE VERSIONS across the deck: {', '.join(mixed)}. "
              f"`npm run badges:check` treats this as a failure, not a surprise.",
              file=sys.stderr)

    print("\nnext: npm run badges:check && npm run typecheck")


if __name__ == "__main__":
    main()
