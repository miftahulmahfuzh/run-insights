#!/usr/bin/env bash
# Push the environment variables in .env.local to Vercel.
#
#   ./scripts/vercel-env-push.sh          # dry run: shows what WOULD be pushed
#   ./scripts/vercel-env-push.sh --apply  # actually calls `vercel env add`
#
# Run it after `vercel login` and `vercel link`. It prints variable NAMES and value
# lengths, never values.
#
# Why this exists rather than a `for` loop over `vercel env add` — both failure modes
# below were found the hard way on Vercel CLI 59 in the sibling app (expense-tracking):
#
#  1. `grep "^VAR=" .env.local | cut -d= -f2-` keeps any surrounding quotes, so a quoted
#     value gets stored WITH the quotes. LLM_BASE_URL would then fail lib/env.ts's
#     z.url() check with a message that reads like a MISSING variable rather than a
#     malformed one — the most expensive kind of confusing.
#
#  2. `vercel env add KEY production preview` does not add one variable to two
#     environments. The signature is `vercel env add name [environment]`, and the third
#     positional is the *git branch*, so that command fails with "Environment Variables
#     with `gitBranch` can only be used with target=preview". One invocation per
#     {variable} x {environment}.
#
# R-40: there is deliberately no LLM_VISION_API_KEY. One z.ai key serves both endpoints.
set -euo pipefail

cd "$(dirname "$0")/.."

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

if [[ ! -f .env.local ]]; then
  echo "FAIL  .env.local not found. Run from the repo root." >&2
  exit 1
fi

# Present in every environment. Roadmap §4.1, minus the F02/F04-owned optionals below.
ALL_ENVS=(
  LLM_API_KEY LLM_VISION_BASE_URL LLM_VISION_MODEL
  LLM_BASE_URL LLM_MODEL
  DATABASE_URL DATABASE_URL_UNPOOLED
  AUTH_SECRET CRON_SECRET
)
# Pushed only if already set locally — F02 owns AUTH_GOOGLE_*, Task 29 creates the Blob token.
OPTIONAL=(AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET BLOB_READ_WRITE_TOKEN)

# Stored write-only: unreadable from the dashboard and from `vercel env pull`. Vercel only
# accepts --sensitive for production and preview, so development is pushed plain.
SENSITIVE=(
  LLM_API_KEY DATABASE_URL DATABASE_URL_UNPOOLED
  AUTH_SECRET AUTH_GOOGLE_SECRET CRON_SECRET BLOB_READ_WRITE_TOKEN
)

is_sensitive() {
  local key="$1" s
  for s in "${SENSITIVE[@]}"; do [[ "$s" == "$key" ]] && return 0; done
  return 1
}

# Reads a key out of .env.local and strips surrounding single or double quotes.
read_env() {
  local key="$1" line value
  line="$(grep -m1 -E "^${key}=" .env.local || true)"
  [[ -z "$line" ]] && return 1
  value="${line#*=}"
  if [[ "$value" == \"*\" ]]; then value="${value:1:${#value}-2}"; fi
  if [[ "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; fi
  [[ -z "$value" ]] && return 1
  printf '%s' "$value"
}

push() { # push KEY ENV  — exactly one environment per call; see note 2 in the header
  local key="$1" target="$2"
  local value flags=()
  if ! value="$(read_env "$key")"; then
    echo "skip  $key (absent or empty in .env.local)"
    return 0
  fi
  if is_sensitive "$key" && [[ "$target" != development ]]; then
    flags+=(--sensitive)
  fi
  echo "push  $key -> $target (${#value} chars)${flags[*]:+ ${flags[*]}}"
  if $APPLY; then
    # Value goes over stdin, never as --value: argv is world-readable via /proc.
    # printf, not echo: no trailing newline gets stored as part of the value.
    # --force makes a re-run idempotent instead of erroring on an existing variable.
    printf '%s' "$value" | vercel env add "$key" "$target" --force "${flags[@]}"
  fi
}

for VAR in "${ALL_ENVS[@]}" "${OPTIONAL[@]}"; do
  for TARGET in production preview development; do
    push "$VAR" "$TARGET"
  done
done

# AUTH_URL is production-only (roadmap §4.1): every preview deployment has a different
# *.vercel.app origin, so pinning it would break the OAuth callback there. Auth.js infers
# the origin from the request in dev and preview instead.
#
# ROADMAP §4.8 is authoritative: the canonical origin is https://runins.site. F01's §5 had
# proposed skipping the custom domain; that was adjudicated against on 2026-08-20 and its
# paragraph is marked superseded. Override only to test against a Vercel alias:
#
#   RUN_INSIGHTS_ORIGIN=https://run-insights-xyz.vercel.app ./scripts/vercel-env-push.sh --apply
#
ORIGIN="${RUN_INSIGHTS_ORIGIN:-https://runins.site}"
echo
echo "push  AUTH_URL -> production ($ORIGIN)"
echo "      F02's Google OAuth redirect URI must use the SAME host."
if $APPLY; then
  printf '%s' "$ORIGIN" | vercel env add AUTH_URL production --force
fi

if $APPLY; then
  echo
  echo "Done. Verify with: vercel env ls"
  echo "Count Preview explicitly — a first --apply run can leave Preview empty:"
  echo "  vercel env ls | grep -c Preview"
else
  echo
  echo "DRY RUN — nothing was sent. Re-run with --apply to push."
fi
