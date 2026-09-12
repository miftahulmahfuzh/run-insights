#!/usr/bin/env python3
"""One contact sheet of a whole deck, at the sizes the app actually draws.

    python3 tools/make_badge_sheet.py                    # the badge deck (default)
    python3 tools/make_badge_sheet.py --deck records     # the records deck
    python3 tools/make_badge_sheet.py --out /tmp/shelf.png
    python3 tools/make_badge_sheet.py --selftest         # offline, no key, nothing drawn

Design records: docs/plans/archive/F10-badge-art-skill.md §9 task 14 (the sheet);
docs/plans/archive/F25-record-patch-art.md §5 (the deck table this now reads).

WHY THIS EXISTS AND check_badge_art.py DOES NOT COVER IT. That tool measures one
candidate and writes one patch's theme strip; this draws a whole deck together on
both paper values. The plan is explicit that the deck needs this and the reference
deck did not: daily-words grew across many separate sessions over months, so
cross-badge drift surfaced naturally between them. The badge deck was generated in
one concentrated phase, where drift is easy to miss badge-by-badge and obvious
with everything on the shelf at once.

WHY `--deck` EXISTS NOW AND NOT AT F25. Because the premise above stopped
holding. F32 added `earliest_start` to the records deck in its own session, after
F25's concentrated phase — the records deck now grows across sessions, which is
the exact daily-words growth pattern this artefact was built for. Until now this
was also the LAST tool hardcoding its catalog and masters paths instead of
reading `tools/decks.py`; it now reads the same table as the generators, the
grader and the promoter, so the next deck (if one ever comes) gets a sheet for
free, and "where do this deck's masters live" has one place to be wrong.

Three questions only this artefact answers:

  Does any pair collide at 40 px? The collision audit in style.md names the badge
  deck's suspect pairs — century_club/double_century, groundhog_day/
  consistency_gremlin, metronome/boring_excellence, the post tally, the three
  light sources, the disc tally. No records audit exists yet, which is the more
  reason to look: convergence noticed on patch sixteen costs fifteen patches of
  hindsight; convergence noticed here costs one regeneration. For records the
  40 px band is also the F25-bet question — the shelf mark that does not exist
  yet, previewed before it ships.

  Is it one bolt of cloth? Check 9b puts a number on twill tone against the
  anchor one patch at a time. Twenty-two margins side by side is the version of
  that question a human can actually answer — and both decks share ONE anchor,
  so two decks' sheets can be compared against each other too.

  Does the set read as a set? Shape distribution, border weight, how loud the
  signature threads are collectively — none of which is a per-patch property.

Rows are catalog order, which IS contract order (`BADGE_CATALOG` and the
append-only `RECORD_CATALOG` are the sources, so this sheet and the app cannot
disagree about sequence).

PIL only, like its neighbours.
"""

import argparse
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("error: this tool needs Pillow (`python3 -c 'import PIL'` must work)")

ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(Path(__file__).resolve().parent))
from decks import DECKS, DEFAULT_DECK, add_deck_argument, deck_for  # noqa: E402

# app/globals.css, verbatim — the same two values check_badge_art.py composites
# its per-badge strip against.
PAPER_LIGHT = (0xC9, 0xE9, 0xFB)
PAPER_DARK = (0x0E, 0x1B, 0x26)

SHELF = 40   # what BadgeShelf draws, near enough
PANEL = 160  # big enough to judge the subject, small enough to fit 22 across


def deck_keys(deck):
    """The deck's keys, in catalog order — per-deck array name and key shape.

    Both halves are table data in `decks.py`, exactly as for the generators:
    the badge catalog is built by a `badge('key', …)` helper, the records
    catalog is plain `{ key: '…' }` literals, and one shared regex could not
    have expressed both (see decks.py's header). The array-body regex is
    generic because both catalogs are `const NAME … = [` closed by a column-0
    `]`, which is the file's own shape, not an assumption about decks.
    """
    text = deck.catalog_path().read_text(encoding="utf-8")
    m = re.search(rf"{deck.catalog_array}[^=]*=\s*\[(.*?)^\]", text, re.S | re.M)
    if not m:
        sys.exit(f"error: could not find `{deck.catalog_array} … = [ … ]` "
                 f"in {deck.catalog_path()}")
    return re.compile(deck.key_pattern, re.M).findall(m.group(1))


def band(masters, keys, size, bg, cols, pad, gap):
    """One themed row-block: `keys` drawn at `size` on `bg`, wrapped at `cols`."""
    rows = (len(keys) + cols - 1) // cols
    w = pad * 2 + cols * size + (cols - 1) * gap
    h = pad * 2 + rows * size + (rows - 1) * gap
    out = Image.new("RGB", (w, h), bg)
    for i, key in enumerate(keys):
        master = masters / f"{key}.png"
        if not master.exists():
            continue
        art = Image.open(master).convert("RGB").resize((size, size), Image.LANCZOS)
        x = pad + (i % cols) * (size + gap)
        y = pad + (i // cols) * (size + gap)
        out.paste(art, (x, y))
    return out


def selftest() -> int:
    """Offline. No network, no key, nothing drawn.

    Checks the sheet's INPUTS for every deck in the table — the extraction this
    file performs on every run, plus the two drifts nothing else guards: a
    catalog key with no promoted master (the sheet draws it as a silent gap),
    and a promoted master whose catalog row is gone (the sheet would never draw
    it at all). The grader has its own CI gate (`check_badge_controls.py`);
    this review artefact deliberately does not — a sheet has no designed
    failure to assert, only inputs that must be complete.
    """
    failures = []

    def check(label, condition, detail=""):
        if condition:
            print(f"  ok   {label}")
        else:
            failures.append(label)
            print(f"  FAIL {label}{chr(10) + '         ' + detail if detail else ''}")

    print("make_badge_sheet.py selftest")

    check("the default deck is badges", DEFAULT_DECK == "badges",
          "every command ever written down must keep meaning what it said")

    try:
        deck_for("no_such_deck")
        check("an unknown deck is rejected", False,
              "deck_for returned instead of exiting")
    except SystemExit:
        check("an unknown deck is rejected", True)

    for deck in DECKS.values():
        try:
            keys = deck_keys(deck)
        except SystemExit as exc:
            check(f"{deck.name}: keys extracted from {deck.catalog_array}",
                  False, str(exc))
            continue
        check(f"{deck.name}: keys extracted from {deck.catalog_array}",
              len(keys) > 0)
        check(f"{deck.name}: keys are unique", len(keys) == len(set(keys)),
              f"{len(keys)} found, {len(set(keys))} distinct")

        promoted = {p.stem for p in deck.masters_dir().glob("*.png")
                    if not p.stem.startswith("_")}
        gaps = sorted(set(keys) - promoted)
        check(f"{deck.name}: every key has a promoted master", not gaps,
              f"missing: {', '.join(gaps)}" if gaps else "")
        orphans = sorted(promoted - set(keys))
        check(f"{deck.name}: every promoted master is in the catalog", not orphans,
              f"orphaned: {', '.join(orphans)}" if orphans else "")

    print(f"\n{'FAILED: ' + ', '.join(failures) if failures else 'all checks passed'}")
    return 1 if failures else 0


def main():
    parser = argparse.ArgumentParser(
        description="Assemble a whole deck at shelf and panel size, both themes."
    )
    add_deck_argument(parser)
    parser.add_argument("--out", type=Path, default=None,
                        help="where to write (default the deck's own _candidates/, "
                             "which is gitignored — this is a review artefact, "
                             "not art)")
    parser.add_argument("--selftest", action="store_true",
                        help="offline input checks, no drawing")
    args = parser.parse_args()

    if args.selftest:
        sys.exit(selftest())

    deck = deck_for(args.deck)
    keys = deck_keys(deck)
    missing = [k for k in keys if not (deck.masters_dir() / f"{k}.png").exists()]
    if missing:
        print(f"warning: {len(missing)} master(s) missing, drawn as gaps: "
              f"{', '.join(missing)}", file=sys.stderr)

    blocks = [
        # Shelf size first and largest-in-count per row, because "does any pair
        # collide at 40 px" is the question this sheet exists for and the answer
        # is easiest when they are packed tightly in one line of sight.
        band(deck.masters_dir(), keys, SHELF, PAPER_LIGHT, 11, 24, 16),
        band(deck.masters_dir(), keys, SHELF, PAPER_DARK, 11, 24, 16),
        band(deck.masters_dir(), keys, PANEL, PAPER_LIGHT, 6, 24, 16),
        band(deck.masters_dir(), keys, PANEL, PAPER_DARK, 6, 24, 16),
    ]
    w = max(b.width for b in blocks)
    sheet = Image.new("RGB", (w, sum(b.height for b in blocks)))
    y = 0
    for b in blocks:
        sheet.paste(b, (0, y))
        y += b.height

    out = args.out or deck.candidates_dir() / "_shelf.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"{out}  {sheet.width}×{sheet.height}  "
          f"({len(keys) - len(missing)}/{len(keys)} {deck.name})")
    print("\nLook for, in this order:")
    print("  1. any two patches that read the same at 40 px — the pairs you")
    print("     already suspect first (style.md's collision audit names the")
    print("     badge deck's)")
    print("  2. a margin that is not the same cloth as its neighbours")
    print("  3. a merrowed border heavier or lighter than the rest")
    print("  4. a signature thread that has become the loudest thing on the sheet")


if __name__ == "__main__":
    main()
