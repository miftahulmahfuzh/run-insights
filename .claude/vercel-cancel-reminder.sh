#!/usr/bin/env bash
# SessionStart reminder: cancel the Vercel Pro subscription before it renews.
#
# WHY THIS EXISTS
#   2026-10-13: the Vercel Blob store was suspended account-wide for exceeding the Hobby quota
#   and every photo in production served 403. Upgrading to Pro unblocked it immediately. The plan
#   was always to pay for ONE month, ship the thumbnail work (done: 89% smaller tiles, 100%
#   coverage), and go back to Hobby — but Vercel renews silently, so a missed date costs $20 and
#   then another $20.
#
# THE DATES, measured from the Vercel API on 2026-10-13:
#   billing period  2026-10-12 14:00 WIB  ->  2026-11-12 15:00 WIB  (07:00 / 08:00 UTC)
#   Blob suspension  2026-10-13, and Vercel's rule for an exceeded Hobby account is "wait until
#   30 days have passed" — which also lands ~2026-11-12.
#   So the safe window to downgrade is 2026-11-11 through 2026-11-12 15:00 WIB: the Hobby clock
#   has run out AND the paid month has been used in full. Downgrading EARLIER wins nothing (no
#   proration, no refund) and risks re-suspension, because this month's Blob meters already carry
#   the pre-suspension burn plus the backfill's ~1,037 advanced operations against a 2,000/mo cap.
#
# BEHAVIOUR
#   Silent before 2026-11-11. Silent forever once the marker file exists. Otherwise prints one
#   JSON object: `systemMessage` for the human, `additionalContext` so Claude actually asks.
#   It escalates past the deadline rather than going quiet — a renewal that already happened is
#   the case where the reminder matters most, not least.
#
# TO STOP IT
#   touch .claude/.vercel-cancel-done        (or ask Claude to, once you've cancelled)
set -uo pipefail

START_DATE="2026-11-11"
DEADLINE_EPOCH=$(date -d "2026-11-12 15:00:00" +%s 2>/dev/null || echo 0)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER="$HERE/.vercel-cancel-done"

# Already dealt with — say nothing, ever again.
[ -f "$MARKER" ] && exit 0

TODAY=$(date +%F)
# String compare is safe for ISO-8601 dates and needs no date arithmetic.
[[ "$TODAY" < "$START_DATE" ]] && exit 0

NOW=$(date +%s)
if [ "$DEADLINE_EPOCH" -ne 0 ] && [ "$NOW" -gt "$DEADLINE_EPOCH" ]; then
  HEADLINE="OVERDUE — the Vercel Pro period ended 12 Nov 15:00 WIB. If you have not cancelled, you have likely been charged for another month."
  URGENCY="overdue"
else
  HEADLINE="Cancel the Vercel Pro subscription. Deadline: 12 Nov 2026, 15:00 WIB — it renews silently after that."
  URGENCY="due"
fi

# Single-quoted heredoc + jq-free construction: the strings are ours, so a plain printf with
# escaped quotes is enough and avoids depending on jq being installed.
cat <<JSON
{
  "systemMessage": "⚠️  $HEADLINE",
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "VERCEL CANCELLATION REMINDER ($URGENCY). $HEADLINE\n\nAsk the user, before anything else this session, whether they have cancelled the Vercel Pro subscription for the jmt-arot team.\n\nContext they may need:\n- Downgrade at vercel.com/jmt-arot -> Settings -> Billing -> Downgrade Plan.\n- TRAP: the downgrade flow requires manually transferring any connected Blob Stores first. run-insights-photos holds every photo in production. Do not improvise this step.\n- Downgrading re-applies Hobby limits immediately (1 GB storage / 10 GB transfer / 10,000 simple ops / 2,000 advanced ops per month). The thumbnail work shipped 2026-10-13 cut grid transfer by ~89%, so a clean month should now fit, but check Usage -> Blob before and after.\n- Their one Pro trial is still unspent; it is created as a NEW team and would not cover this one.\n\nIf they say it is done, run: touch .claude/.vercel-cancel-done — that silences this reminder permanently. If they have not, help them do it now."
  }
}
JSON
