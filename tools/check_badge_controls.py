#!/usr/bin/env python3
"""Gate the badge control loop: every control must do what it was drawn to do.

    python3 tools/check_badge_controls.py     # what CI runs, as `npm run badges:controls`

Design record: docs/plans/archive/F10-badge-art-skill.md §5.2/§7 (the controls, and
why exercising the grader should never spend money), and the follow-up in
docs/token_maxxing/2026-09-12-tools-package-hygiene.md that wired this gate.

WHAT THIS GATES. `make_badge_control.py` draws four synthetic patches, each one
question about `check_badge_art.py`'s bands:

    good       a plausible patch        → must PASS every hard check
    flat       a sticker, not a patch   → must FAIL check 3's sd floor, WARN check 10
    offcentre  pushed 9% off centre     → must FAIL check 8a
    bleached   pale substrate           → must FAIL check 3's grey band

The controls are free and offline, which makes the checker itself testable for
free — and testable is not the same as tested. F15 moved the masters' frame to
4:3 and the controls stayed 1024² squares: the "good" control then died on check 1
before a single band was measured, and the loop sat silently broken for three
weeks until a session actually RAN it (2026-09-12, re-cut in the same pass). This
file is the thing that runs it, on every push, so the next band or frame change
that quietly breaks the loop breaks a green build instead of nothing at all.

WHAT IS ASSERTED, EXACTLY. Per control: the exit code, the hard-failure SET — a
failure control must fail EXACTLY its designed check and nothing else — and, where
two controls share a check name, the reason phrase that tells them apart. flat and
bleached both fail "3 twill margin", but by different sub-measurements: flat's
detail line carries the checker's "flat, no weave" diagnosis (the sd floor), while
bleached's carries only grey values (the grey band). flat's designed check-10
warning is asserted too; it is in the control's own design statement. Warnings on
`good` are printed but not failed on — the control promises to pass the hard
checks, and a soft warning is a signal for a human, not a broken gate.

MAINTENANCE. Bands are re-derived from real masters as the deck grows, and a
re-derivation can legitimately move an outcome. That is not something to soften
this gate for: re-run the loop, confirm each control still fails its DESIGNED
check (if one now fails differently, the control or the band has drifted — fix
the drawing or re-derive, never widen this file's expectations to make red go
away), then re-stamp EXPECTED below with the new date.

Measured 2026-09-12 — Python 3.12.7, Pillow 12.3.0, bands as re-cut in `9aa0d44`.

PIL is not imported here: this file only drives the two tools as subprocesses,
which is the honest thing to gate on — the real CLI, its real exit codes.
"""

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent

# The designed outcome of each control, as of the stamp in the header. `fails` is
# the EXACT set of hard-check names; `fail_detail_has` / `fail_detail_has_not`
# disambiguate controls that share a check name; `warns` must all be present.
EXPECTED = {
    "good": {"exit": 0},
    "flat": {
        "exit": 1,
        "fails": {"3 twill margin"},
        "fail_detail_has": "no weave",
        "warns": {"10 weave texture"},
    },
    "offcentre": {"exit": 1, "fails": {"8a patch centred"}},
    "bleached": {"exit": 1, "fails": {"3 twill margin"}, "fail_detail_has_not": "no weave"},
}

FAIL_RE = re.compile(r"^\s+\[FAIL\] (.+?): (.*)$", re.M)
WARN_RE = re.compile(r"^\s+\[warn\] (.+?): (.*)$", re.M)
REJECT_RE = re.compile(r"^REJECT — ", re.M)


def run_tool(cmd, timeout):
    try:
        return subprocess.run(
            [sys.executable, *cmd], capture_output=True, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        sys.exit(f"error: {' '.join(cmd)} timed out after {timeout}s")


def build_controls(out_dir):
    proc = run_tool([str(TOOLS / "make_badge_control.py"), "--out-dir", str(out_dir)], 600)
    if proc.returncode != 0:
        print(proc.stdout, end="")
        print(proc.stderr, file=sys.stderr, end="")
        sys.exit("error: make_badge_control.py failed; the loop cannot be exercised")


def measure(control_png):
    """Run the checker on one control and parse what it reported."""
    proc = run_tool(
        [str(TOOLS / "check_badge_art.py"), str(control_png), "--no-anchor", "--no-crops"],
        600,
    )
    fails = {name: detail for name, detail in FAIL_RE.findall(proc.stdout)}
    warns = {name for name, _ in WARN_RE.findall(proc.stdout)}
    return proc, fails, warns


def verdict(name, proc, fails, warns):
    """The designed-vs-measured diff for one control, as a list of strings."""
    want = EXPECTED[name]
    bad = []
    if proc.returncode != want["exit"]:
        bad.append(f"exit was {proc.returncode}, designed {want['exit']}")
    measured_fails = set(fails)
    designed_fails = want.get("fails", set())
    if measured_fails != designed_fails:
        bad.append(
            f"hard failures were {sorted(measured_fails)}, "
            f"designed exactly {sorted(designed_fails)}"
        )
    if "fail_detail_has" in want:
        joined = " ".join(fails.values())
        if want["fail_detail_has"] not in joined:
            bad.append(
                f"no failing detail mentions {want['fail_detail_has']!r} "
                f"(the designed sub-measurement)"
            )
    if "fail_detail_has_not" in want:
        joined = " ".join(fails.values())
        if want["fail_detail_has_not"] in joined:
            bad.append(
                f"failing detail mentions {want['fail_detail_has_not']!r}, "
                f"which is the OTHER control's sub-measurement"
            )
    for warn in want.get("warns", set()):
        if warn not in warns:
            bad.append(f"designed warning {warn!r} did not fire")
    # A designed failure must be a REJECT verdict, never a crash: the checker's
    # die() also exits 1, but prints "error:" and no verdict at all.
    if want["exit"] == 1 and not REJECT_RE.search(proc.stdout):
        bad.append("exit 1 but no REJECT verdict — the checker died, it did not grade")
    return bad


def main():
    parser = argparse.ArgumentParser(
        description="Assert that every badge control fails exactly its designed check.",
    )
    parser.add_argument(
        "--keep", type=Path, default=None,
        help="keep the drawn controls in this directory instead of a cleaned temp dir",
    )
    args = parser.parse_args()

    tmp = args.keep or Path(tempfile.mkdtemp(prefix="badge-controls-"))
    own_tmp = args.keep is None
    try:
        build_controls(tmp)
        print(f"controls drawn to {tmp}\n")
        failed = False
        for name in sorted(EXPECTED):
            proc, fails, warns = measure(tmp / f"_control_{name}.png")
            bad = verdict(name, proc, fails, warns)
            head = (
                f"exit {proc.returncode}"
                + (f", failed {sorted(fails)}" if fails else ", passed all hard checks")
                + (f", warned {sorted(warns)}" if warns else "")
            )
            if bad:
                failed = True
                print(f"MISMATCH {name}: {head}")
                print(f"  designed: {EXPECTED[name]}")
                for reason in sorted(bad):
                    print(f"  - {reason}")
                print("  --- checker output ---")
                for line in proc.stdout.splitlines():
                    print(f"  | {line}")
                if proc.stderr:
                    print("  --- checker stderr ---")
                    for line in proc.stderr.splitlines():
                        print(f"  | {line}")
            else:
                print(f"ok        {name}: {head}")
        print()
        if failed:
            sys.exit(
                "error: at least one control is not behaving as designed — see above. "
                "The bands or a control has drifted; never widen EXPECTED to make "
                "this red go away (see this file's header)."
            )
        print(f"{len(EXPECTED)}/{len(EXPECTED)} controls behaved as designed.")
    finally:
        if own_tmp:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
