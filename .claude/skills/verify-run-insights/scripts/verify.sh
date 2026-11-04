#!/usr/bin/env bash
# verify.sh: launch, drive and tear down a throwaway Run Insights for verification.
#
# Every run gets its own Postgres database (in one shared Docker container with pgvector), a
# stand-in on loopback that speaks Neon's HTTP protocol and the Vercel Blob API in front of it, a
# snapshot of the checkout served by its own `next dev` on a free port, a seeded runner and a minted
# session cookie. Paid calls (z.ai, OpenRouter) go through a per-run budget. Nothing touches the
# production Neon database, the production Blob store, web push, Google, Vercel or GitHub.
# Evidence lives under $VERIFY_HOME/<run>/evidence and survives `down`.
#
#   verify.sh up [--seed=demo|review|new] [--llm=N | --offline] [--openrouter[=N]]
#                                        start a run from the current checkout; prints RUN= URL= EVIDENCE= MODE=
#   verify.sh doctor RUN                 is this run worth driving? (read-only)
#   verify.sh api RUN METHOD PATH [JSON] signed-in HTTP call; request + response saved as evidence
#   verify.sh upload RUN [KIND=]IMAGE.jpg...
#                                        the upload screen's exact sequence: token, Blob PUT, POST
#                                        /api/extract, then poll until the vision read settles
#   verify.sh cron RUN rollup|nina       call a Vercel cron route with the run's own CRON_SECRET
#   verify.sh ui RUN STEPS.mjs [--width N] [--theme light|dark] [-- ARG...]
#                                        drive the app with Playwright, signed in (video + screenshots);
#                                        ARGs reach the steps module as `args`
#   verify.sh sql RUN "SELECT ..."       read the run's Postgres (read-only transaction)
#   verify.sh blobs RUN [PREFIX]         list the run's stand-in Blob store
#   verify.sh logs RUN [REGEX] [N]       the server log's matching lines (default: errors, last 40)
#   verify.sh budget RUN                 paid calls spent / left / refused
#   verify.sh note RUN "TEXT"            append a line to evidence/LOG.md (what you proved)
#   verify.sh down RUN|--all             stop what `up` started, drop its DB; evidence stays
#   verify.sh ls                         runs with state, mode and evidence count
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_HOME="${VERIFY_HOME:-$HOME/.local/state/run-insights-verify}"
PG_CONTAINER=run-insights-pg-verify
PG_IMAGE=pgvector/pgvector:pg16
PG_PORT=55438
# The run's fake Blob store. Its public host is what the app's URL checks demand
# (*.public.blob.vercel-storage.com); preload.mjs and ui.mjs serve it from the stand-in, and every
# other store host, production's included, is refused.
STORE_ID=riverifystore0000
STORE_HOST=$STORE_ID.public.blob.vercel-storage.com
# next/font/google fetches Poppins while compiling; a public font CDN, nothing else.
FONT_HOSTS=fonts.googleapis.com,fonts.gstatic.com
OPENROUTER_HOST=openrouter.ai
RUNNER_NAME="Demo Runner"
STEPS_DIR="$(cd "$HERE/../features/steps" && pwd)"

die() { echo "verify: $*" >&2; exit 1; }
repo_root() { git rev-parse --show-toplevel 2>/dev/null || die "run from inside a run-insights checkout"; }
# The main checkout: where .env.local lives (a worktree may not have one).
main_root() { (cd "$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)/.." && pwd); }

run_dir() {
  local run=${1:-}
  [ -n "$run" ] || die "missing RUN id (see: verify.sh ls)"
  [ -d "$VERIFY_HOME/$run" ] || die "no run $run under $VERIFY_HOME"
  echo "$VERIFY_HOME/$run"
}
meta() { sed -n "s/^$2=//p" "$1/meta" | sed -n 1p; }
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'; }
slug() { printf %s "$1" | tr -c 'a-zA-Z0-9_.-' '_' | cut -c1-40; }

# Numbered evidence: evidence/NN-<kind>-<slug>.<ext>, counting only the primary .txt files.
next_evidence() {
  local dir=$1/evidence n
  n=$(find "$dir" -maxdepth 1 -type f -name '[0-9][0-9]-*.txt' ! -name '00-*' | wc -l)   # 00-*: up's own
  printf '%s/%02d-%s-%s.%s' "$dir" $((n + 1)) "$2" "$(slug "$3")" "$4"
}

# What the code under test is: HEAD plus a digest of uncommitted changes to the app's own paths.
# .workflows/ and docs/ are left out so a peer's bookkeeping does not read as drift.
APP_PATHS=(app components lib public auth.ts auth.config.ts proxy.ts next.config.ts drizzle scripts/capture package.json)
tree_digest() {
  { git -C "$1" diff HEAD -- "${APP_PATHS[@]}"
    git -C "$1" ls-files --others --exclude-standard -- "${APP_PATHS[@]}" | sort | while read -r f; do sha1sum "$1/$f"; done
  } 2>/dev/null | sha1sum | cut -c1-12
}

ensure_pg() {
  command -v docker >/dev/null || die "docker is not on PATH"
  local state
  state="$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null)" || state=missing
  case "$state" in
    true) ;;
    false) docker start "$PG_CONTAINER" >/dev/null ;;
    # trust auth: bound to 127.0.0.1 only, holds nothing but throwaway v_* databases.
    *) docker run -d --name "$PG_CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust \
         -p "127.0.0.1:$PG_PORT:5432" "$PG_IMAGE" >/dev/null ;;
  esac
  for _ in $(seq 1 60); do
    docker exec "$PG_CONTAINER" pg_isready -q -h 127.0.0.1 -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done
  die "$PG_CONTAINER did not become ready in 60s"
}
psql_run() { docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -X -q -U postgres "$@"; }

# One value from the main checkout's .env.local, parsed (never sourced: values carry inline
# comments and URLs with a bare &).
env_value() {
  sed -n "s/^$2=//p" "$1/.env.local" 2>/dev/null | sed -n 1p | sed -E 's/[[:space:]]+#.*$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}
host_of() { printf %s "$1" | sed -E 's#^[a-z]+://([^/:]+).*#\1#'; }

# The environment of the app and the seeder: nothing inherited but PATH/HOME/locale, so no secret
# in the caller's shell (VERCEL_OIDC_TOKEN, BLOB_*, the production DATABASE_URL) leaks in. The
# snapshot has no .env.local, so Next and dotenv find nothing to load either.
write_web_env() {
  local dir=$1 sp
  sp="http://127.0.0.1:$(cat "$dir/standin_port")"
  {
    printf '%s\n' "PATH=$PATH" "HOME=$dir/home" "LANG=${LANG:-C.UTF-8}" "TERM=dumb" "NEXT_TELEMETRY_DISABLED=1"
    echo "DATABASE_URL=$(meta "$dir" neon_url)"
    echo "DATABASE_URL_UNPOOLED=$(meta "$dir" neon_url)"
    echo "AUTH_SECRET=$(cat "$dir/secrets/auth")"
    echo "AUTH_GOOGLE_ID=ri-verify-unused"
    echo "AUTH_GOOGLE_SECRET=ri-verify-unused"
    echo "AUTH_URL="
    echo "AUTH_TRUST_HOST=true"
    cat "$dir/secrets/llm.env"
    echo "BLOB_READ_WRITE_TOKEN=vercel_blob_rw_${STORE_ID}_$(cat "$dir/secrets/blob")"
    echo "VERCEL_BLOB_API_URL=$sp/blob"
    # The browser's twin (inlined into the client bundle) is the stand-in's HTTPS + HTTP/2 listener:
    # with onUploadProgress the Blob client streams its PUT body, which Chromium sends only over h2.
    echo "NEXT_PUBLIC_VERCEL_BLOB_API_URL=https://127.0.0.1:$(cat "$dir/standin_tls_port")/blob"
    echo "CRON_SECRET=$(cat "$dir/secrets/cron")"
    echo "OPENROUTER_API_KEY=$(cat "$dir/secrets/openrouter")"
    cat "$dir/secrets/vapid.env"
    echo "VAPID_SUBJECT=mailto:runner@ri-verify.invalid"
    echo "ADMIN_EMAILS=$(cat "$dir/runner_email" 2>/dev/null || echo runner@ri-verify.invalid)"
    echo "NODE_OPTIONS=--import=file://$HERE/preload.mjs"
    echo "RI_VERIFY_STANDIN=$sp"
    echo "RI_VERIFY_STORE_HOST=$STORE_HOST"
    echo "RI_VERIFY_ALLOW_HOSTS=$FONT_HOSTS"
    echo "RI_VERIFY_PAID_HOSTS=$(meta "$dir" paid_hosts)"
  } >"$dir/web.env"
  chmod 600 "$dir/web.env"
}

# Run a command under an env file (one VAR=value per line), with nothing else inherited.
with_env() { local file=$1; shift; local -a e=(); mapfile -t e <"$file"; env -i "${e[@]}" "$@"; }

cookie_of() { cat "$1/cookie"; }
base_of() { echo "http://127.0.0.1:$(cat "$1/port")"; }

# curl as the signed-in runner, from the same origin (server actions and the Blob handshake check it).
curl_app() {
  local dir=$1; shift
  curl -sS -m 180 -H "Cookie: authjs.session-token=$(cookie_of "$dir")" -H "Origin: $(base_of "$dir")" "$@"
}

migrate() {
  local dir=$1 root=$2 db=$3 tag n=0
  psql_run -d "$db" -c 'create schema if not exists drizzle; create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)' >/dev/null
  # drizzle-kit migrate cannot reach a local Postgres (no TCP driver is installed: the app ships
  # only Neon's HTTP one), so apply the journal in order the way it would: each file in one
  # transaction, recorded with its sha256. `--> statement-breakpoint` is an SQL comment to psql.
  while read -r tag when; do
    local f="$root/drizzle/$tag.sql"
    [ -f "$f" ] || die "migrate: $f is in the journal but missing"
    psql_run -d "$db" -1 <"$f" >>"$dir/migrate.log" 2>&1 || { tail -20 "$dir/migrate.log" >&2; die "migration $tag failed (verify.sh down $(basename "$dir"))"; }
    psql_run -d "$db" -c "insert into drizzle.__drizzle_migrations (hash, created_at) values ('$(sha256sum "$f" | cut -d' ' -f1)', $when)" </dev/null >/dev/null   # -i would eat the journal loop's stdin
    n=$((n + 1))
  done < <(python3 -c 'import json,sys; [print(e["tag"], e["when"]) for e in json.load(open(sys.argv[1]))["entries"]]' "$root/drizzle/meta/_journal.json")
  echo "migrations=$n" >>"$dir/meta"
}

cmd_up() {
  local seed=demo llm=25 openrouter=0
  for a in "$@"; do
    case "$a" in
      --seed=demo|--seed=review|--seed=new) seed=${a#--seed=} ;;
      --llm=*) llm=${a#--llm=}; [[ $llm =~ ^[0-9]+$ ]] || die "--llm=N takes a number" ;;
      --offline) llm=0; openrouter=0 ;;
      --openrouter) openrouter=3 ;;
      --openrouter=*) openrouter=${a#--openrouter=}; [[ $openrouter =~ ^[0-9]+$ ]] || die "--openrouter=N takes a number" ;;
      *) die "up: unknown flag $a (see verify.sh with no arguments)" ;;
    esac
  done
  local root main run dir db
  root="$(repo_root)"
  [ -f "$root/lib/env.ts" ] && [ -f "$root/scripts/capture/seed-demo.mjs" ] || die "$root is not a run-insights checkout"
  [ -d "$root/node_modules/next" ] || die "no node_modules in $root (npm ci)"
  main="$(main_root "$root")"
  if [ "$llm" != 0 ]; then [ -n "$(env_value "$main" LLM_API_KEY)" ] || die "--llm: LLM_API_KEY is not in $main/.env.local (or run --offline)"; fi
  if [ "$openrouter" != 0 ]; then [ -n "$(env_value "$main" OPENROUTER_API_KEY)" ] || die "--openrouter: OPENROUTER_API_KEY is not in $main/.env.local"; fi

  run="$(date +%m%d-%H%M%S)-$$"
  dir="$VERIFY_HOME/$run"
  db="v_$(echo "$run" | tr -- '-' '_')"
  mkdir -p "$dir/evidence" "$dir/secrets" "$dir/home" "$dir/blobs"
  chmod 700 "$dir/secrets"
  : >"$dir/pgids"

  # Paid hosts: the LLM endpoints the code under test is configured for, and OpenRouter.
  local vision_url text_url paid
  vision_url="$(env_value "$main" LLM_VISION_BASE_URL)"; vision_url=${vision_url:-https://api.z.ai/api/coding/paas/v4}
  text_url="$(env_value "$main" LLM_BASE_URL)"; text_url=${text_url:-https://api.z.ai/api/anthropic}
  paid="$(host_of "$vision_url")=llm"
  [ "$(host_of "$text_url")" = "$(host_of "$vision_url")" ] || paid="$paid,$(host_of "$text_url")=llm"
  paid="$paid,$OPENROUTER_HOST=openrouter"
  {
    echo "repo=$root"; echo "main=$main"
    echo "head=$(git -C "$root" rev-parse --short HEAD)"; echo "tree=$(tree_digest "$root")"
    echo "db=$db"; echo "seed=$seed"; echo "llm=$llm"; echo "openrouter=$openrouter"
    echo "mode=$([ "$llm$openrouter" = 00 ] && echo offline || echo "real(llm=$llm openrouter=$openrouter)")"
    echo "paid_hosts=$paid"
    echo "neon_url=postgresql://postgres:ri-verify@pg.riverify.invalid/$db?sslmode=require"
    echo "started=$(date -Iseconds)"
  } >"$dir/meta"

  # Secrets of the run's own: random, or the real LLM key only when the budget allows paid calls.
  head -c 32 /dev/urandom | base64 >"$dir/secrets/auth"
  head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' >"$dir/secrets/blob"
  head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' >"$dir/secrets/cron"
  {
    # LLM_* are in lib/env.ts's eager core: the app does not boot without them. Offline they hold
    # a placeholder key and the budget refuses every call before it leaves.
    if [ "$llm" != 0 ]; then echo "LLM_API_KEY=$(env_value "$main" LLM_API_KEY)"; else echo "LLM_API_KEY=ri-verify-offline-no-key"; fi
    echo "LLM_VISION_BASE_URL=$vision_url"
    echo "LLM_VISION_MODEL=$(env_value "$main" LLM_VISION_MODEL | sed 's/^$/glm-4.6v/')"
    echo "LLM_BASE_URL=$text_url"
    echo "LLM_MODEL=$(env_value "$main" LLM_MODEL | sed 's/^$/glm-5.3/')"
  } >"$dir/secrets/llm.env"
  if [ "$openrouter" != 0 ]; then env_value "$main" OPENROUTER_API_KEY >"$dir/secrets/openrouter"; else : >"$dir/secrets/openrouter"; fi

  # The app is served from a snapshot: Next 16's `next dev` locks .next/dev per project directory,
  # so two runs (or the owner's own dev server) cannot share the checkout. The snapshot has no
  # .env.local, no .vercel link, no git. node_modules is hard-linked (a symlink breaks Turbopack).
  # Edits after `up` are not picked up: doctor warns, down + up again.
  rsync -a --exclude /node_modules --exclude /.next --exclude /.git --exclude /.env.local --exclude '/.env.*.local' \
    --exclude /.vercel --exclude /.worktrees --exclude /.workflows --exclude /docs --exclude /assets/badges \
    --exclude /assets/records --exclude /.claude --exclude /tsconfig.tsbuildinfo --exclude '/scripts/capture/.manifest.json' \
    --exclude '/scripts/capture/*.webm' --exclude '/scripts/capture/.video' "$root/" "$dir/app/"
  cp -al "$root/node_modules" "$dir/app/node_modules"
  (cd "$dir/app" && node scripts/copy-image-compression-worker.mjs) >"$dir/predev.log" 2>&1 || die "copy-image-compression-worker failed"
  # Throwaway VAPID pair: the pages that offer notifications render, and nothing it signs can
  # reach a subscription outside this run's database.
  (cd "$dir/app" && node -e 'const k=require("web-push").generateVAPIDKeys(); console.log("VAPID_PUBLIC_KEY="+k.publicKey); console.log("VAPID_PRIVATE_KEY="+k.privateKey)') >"$dir/secrets/vapid.env"

  ensure_pg
  psql_run -c "create database $db" >/dev/null
  migrate "$dir" "$dir/app" "$db"

  free_port >"$dir/standin_port"
  free_port >"$dir/standin_tls_port"
  # A self-signed certificate for the stand-in's browser-facing HTTPS listener, minted per run and
  # accepted only by the run's own Playwright context (ignoreHTTPSErrors); nothing else trusts it.
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 \
    -keyout "$dir/secrets/tls.key" -out "$dir/secrets/tls.crt" >/dev/null 2>&1 || die "openssl could not mint the stand-in's certificate"
  RI_STANDIN_TLS_PORT="$(cat "$dir/standin_tls_port")" RI_STANDIN_TLS_KEY="$dir/secrets/tls.key" RI_STANDIN_TLS_CERT="$dir/secrets/tls.crt" \
  RI_STANDIN_RW_TOKEN="vercel_blob_rw_${STORE_ID}_$(cat "$dir/secrets/blob")" setsid node "$HERE/standin.mjs" "$dir/app" "$(cat "$dir/standin_port")" "$PG_PORT" "$db" "$dir/blobs" "$STORE_ID" \
    "$dir/budget.json" "$llm" "$openrouter" </dev/null >"$dir/standin.log" 2>&1 &
  echo "standin $!" >>"$dir/pgids"
  local sp="http://127.0.0.1:$(cat "$dir/standin_port")"
  for _ in $(seq 1 40); do curl -fsS -m 2 "$sp/health" >/dev/null 2>&1 && break; sleep 0.25; done
  curl -fsS -m 2 "$sp/health" >/dev/null || { cat "$dir/standin.log" >&2; die "stand-in did not start (verify.sh down $run)"; }
  write_web_env "$dir"

  # The runner. demo/review: the README capture harness's own seeder (one user + profile, 25 runs'
  # extractions and a flagged one, three screenshots put into the run's Blob store). new: a bare
  # user row, not onboarded.
  if [ "$seed" = new ]; then
    psql_run -d "$db" -c "insert into \"user\" (id, name, email, \"emailVerified\") values ('ri-verify-runner', '$RUNNER_NAME', 'runner@ri-verify.invalid', now())" >/dev/null
  else
    (cd "$dir/app" && with_env "$dir/web.env" node scripts/capture/seed-demo.mjs) >"$dir/seed.log" 2>&1 \
      || { tail -20 "$dir/seed.log" >&2; die "seed failed (verify.sh down $run)"; }
  fi
  psql_run -d "$db" -tAc 'select id from "user" order by id limit 1' >"$dir/runner_id"
  psql_run -d "$db" -tAc 'select email from "user" order by id limit 1' >"$dir/runner_email"
  [ -s "$dir/runner_id" ] || die "no runner was seeded"
  write_web_env "$dir"   # again: ADMIN_EMAILS is the seeded runner's address

  (cd "$dir/app" && with_env "$dir/web.env" node --input-type=module -e "
    import { mintSessionCookie } from './scripts/capture/session-cookie.mjs';
    const c = await mintSessionCookie({ userId: '$(cat "$dir/runner_id")', name: '$RUNNER_NAME', email: '$(cat "$dir/runner_email")', origin: 'http://127.0.0.1' });
    process.stdout.write(c.value);
  ") >"$dir/cookie" || die "could not mint a session"

  local port; port="$(free_port)"; echo "$port" >"$dir/port"
  # setsid: own process group (down kills exactly this tree); every fd redirected so no caller's
  # pipe stays open behind the server.
  local -a webenv=()
  mapfile -t webenv <"$dir/web.env"
  # Not `(cd ... && setsid ... &)`: that backgrounds a bash wrapper and records its pid.
  cd "$dir/app"
  setsid env -i "${webenv[@]}" node node_modules/next/dist/bin/next dev -p "$port" -H 127.0.0.1 </dev/null >"$dir/next.log" 2>&1 &
  echo "next $!" >>"$dir/pgids"
  local url="http://127.0.0.1:$port" code="" last="" same=0
  for _ in $(seq 1 240); do
    code="$(curl -s -o /dev/null -m 90 -w '%{http_code}' -H "Cookie: authjs.session-token=$(cookie_of "$dir")" "$url/me" || true)"
    [ "$code" = 200 ] && break
    # The same 5xx several times in a row is a broken page, not a slow compile.
    if [[ $code == 5* ]] && [ "$code" = "$last" ]; then same=$((same + 1)); else same=0; fi
    last=$code
    [ "$same" -ge 4 ] && break
    kill -0 "$(awk '$1=="next"{print $2}' "$dir/pgids")" 2>/dev/null || { tail -30 "$dir/next.log" >&2; die "next dev exited during startup (verify.sh down $run)"; }
    sleep 1
  done
  [ "$code" = 200 ] || { tail -30 "$dir/next.log" >&2; die "/me did not answer 200 signed in (last $code; log $dir/next.log; verify.sh down $run)"; }

  if [ "$seed" = demo ]; then
    # Commit the 25 seeded extractions through the real review screen (the capture harness's
    # commit pass, driven by this run's fenced browser). Paid calls are refused, unspent, until
    # the run is armed below, so the narratives and Nina's run_committed openers the commits fire
    # do not eat the budget.
    local ids
    ids="$(python3 -c 'import json,sys; print(",".join(r["extractionId"] for r in json.load(open(sys.argv[1]))["runs"]))' "$dir/app/scripts/capture/.manifest.json")"
    (cd "$dir/app" && env RI_VERIFY_EXTRACTIONS="$ids" node "$HERE/ui.mjs" "$url" "$STEPS_DIR/seed-commit-all.mjs" "$dir/evidence" \
      "$(cookie_of "$dir")" "$sp" "$STORE_HOST" 390 dark 00-seed-commit) >"$dir/commit.log" 2>&1 \
      || { tail -20 "$dir/commit.log" >&2; die "committing the demo runs failed (verify.sh down $run)"; }
  fi
  curl -fsS -m 5 -X POST "$sp/budget/arm" >/dev/null || die "could not arm the budget"
  echo "RUN=$run"; echo "URL=$url"; echo "EVIDENCE=$dir/evidence"; echo "MODE=$(meta "$dir" mode)"
}

pgid_of() { awk -v k="$2" '$1==k{print $2}' "$1/pgids" 2>/dev/null; }

cmd_doctor() {
  local dir ok=1 root
  dir="$(run_dir "${1:-}")"
  [ ! -f "$dir/state" ] || die "run $(basename "$dir") is stopped"
  root="$(meta "$dir" repo)"
  local si next sp port db
  si="$(pgid_of "$dir" standin)"; next="$(pgid_of "$dir" next)"; db="$(meta "$dir" db)"
  sp="http://127.0.0.1:$(cat "$dir/standin_port")"; port="$(cat "$dir/port")"
  if curl -fsS -m 3 "$sp/health" | grep -q run-insights-verify-standin; then echo "standin  ok   $sp (pgid $si)"; else echo "standin  FAIL $sp not answering"; ok=0; fi
  if [ -n "$next" ] && kill -0 "$next" 2>/dev/null; then echo "next     ok   pgid $next"; else echo "next     FAIL not running"; ok=0; fi
  local owner
  owner="$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | sed -n 1p | cut -d= -f2)"
  if [ -n "$owner" ] && [ "$(ps -o pgid= -p "$owner" | tr -d ' ')" = "$next" ]; then
    echo "port     ok   :$port owned by this run (pid $owner)"
  else
    echo "port     FAIL :$port is ${owner:+owned by pid $owner, }not this run's next"; ok=0
  fi
  local code
  code="$(curl -s -o "$dir/doctor.me.html" -m 60 -w '%{http_code}' -H "Cookie: authjs.session-token=$(cookie_of "$dir")" "$(base_of "$dir")/me" || true)"
  if [ "$code" = 200 ] && grep -q "$RUNNER_NAME" "$dir/doctor.me.html"; then echo "signin   ok   /me answers 200 as $RUNNER_NAME ($(cat "$dir/runner_email"))"
  else echo "signin   FAIL /me answered $code"; ok=0; fi
  rm -f "$dir/doctor.me.html"
  local counts
  if counts="$(psql_run -d "$db" -tAc "select (select count(*) from drizzle.__drizzle_migrations)||' migrations, runs '||(select count(*) from runs)||', extractions '||(select count(*) from extractions)||', nina_messages '||(select count(*) from nina_messages)||', push_subscriptions '||(select count(*) from push_subscriptions)" 2>/dev/null)"; then
    echo "database ok   $db ($counts)"
  else echo "database FAIL $db"; ok=0; fi
  echo "blobs    ok   $(find "$dir/blobs" -type f ! -name '*.__meta.json' | wc -l) object(s) in the run's store ($STORE_HOST)"
  echo "mode     $(meta "$dir" mode)   seed=$(meta "$dir" seed)"
  echo "budget   $(curl -fsS -m 3 "$sp/budget" | python3 -c 'import json,sys; s=json.load(sys.stdin); print("armed" if s["armed"] else "SEEDING", "; ".join("%s: %d spent, %d left, %d refused" % (k, v["spent"], v["left"], v["refused"]) for k,v in s["pools"].items()))')"
  printf 'meta     repo=%s head=%s\n' "$root" "$(meta "$dir" head)"
  if [ "$(git -C "$root" rev-parse --short HEAD)" != "$(meta "$dir" head)" ]; then
    echo "code     WARN HEAD moved since up: the snapshot is stale (down + up)"
  fi
  if [ "$(tree_digest "$root")" != "$(meta "$dir" tree)" ]; then
    echo "code     WARN working tree changed since up: the snapshot is stale (down + up)"
  fi
  # Egress, from a process with the server's exact env and preload. Nothing leaves either way:
  # the guard refuses before connecting.
  local probe
  probe="$(cd "$dir/app" && with_env "$dir/web.env" node --input-type=module -e "
    const out = [];
    for (const u of ['https://api.github.com/', 'https://abcdefghij123456.public.blob.vercel-storage.com/shots/x.jpg', 'https://console.neon.tech/']) {
      try { await fetch(u); out.push('REACHED ' + u) } catch (e) { out.push((/blocked/.test(e.message) ? 'blocked ' : 'error ') + new URL(u).host) }
    }
    try { const r = await fetch('https://$STORE_HOST/__doctor_probe__'); out.push('store ' + r.status) } catch (e) { out.push('store ERROR ' + e.message) }
    console.log(out.join('; '));
  " 2>/dev/null)"
  if [[ $probe == *REACHED* ]] || [[ $probe != *"store 404"* ]]; then echo "egress   FAIL $probe"; ok=0
  else echo "egress   ok   $probe (fake store answers from the stand-in)"; fi
  local blocked
  blocked="$(cat "$dir"/next.log "$dir"/seed.log 2>/dev/null | grep -oE '(egress BLOCKED|paid call REFUSED) [A-Z]+ https?://[^/ ]+' | sort | uniq -c || true)"
  [ -n "$blocked" ] && echo "$blocked" | sed 's/^/egress   /'
  grep -E "⨯|Error:" "$dir/next.log" 2>/dev/null | grep -v "ri-verify" | tail -3 | sed 's/^/log      /' || true
  [ "$ok" = 1 ] || exit 1
}

save_response() {
  # save_response OUT BODYFILE CODE CTYPE: prints the response as text, binary goes to a file.
  local out=$1 bodyf=$2 code=$3 ctype=$4 redir=${5:-}
  echo "< HTTP $code ${ctype:-} ${redir:+-> $redir}"
  if [[ ${ctype:-} =~ json|text|javascript ]] || [ ! -s "$bodyf" ]; then
    if [[ ${ctype:-} =~ html ]]; then
      echo "[html $(wc -c <"$bodyf") bytes; visible text:]"
      python3 "$HERE/htmltext.py" "$bodyf" 120
      mv "$bodyf" "${out%.txt}.html"; echo "[full html: ${out%.txt}.html]"
    elif [[ ${ctype:-} =~ json ]]; then
      python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), indent=1, ensure_ascii=False)[:20000])' "$bodyf" 2>/dev/null || cat "$bodyf"
      echo; rm -f "$bodyf"
    else cat "$bodyf"; echo; rm -f "$bodyf"; fi
  else
    mv "$bodyf" "${out%.txt}.bin"
    echo "[binary $(wc -c <"${out%.txt}.bin") bytes, sha256 $(sha256sum "${out%.txt}.bin" | cut -c1-16): ${out%.txt}.bin]"
  fi
}

cmd_api() {
  local dir method path body out
  dir="$(run_dir "${1:-}")"; method=${2:?METHOD}; path=${3:?PATH}; body=${4:-}
  out="$(next_evidence "$dir" api "$method$path" txt)"
  local -a args=(-o "$out.body" -w '%{http_code}|%{content_type}|%{redirect_url}' -X "$method" "$(base_of "$dir")$path")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data "$body")
  local m code ctype redir
  m="$(curl_app "$dir" "${args[@]}")"
  IFS='|' read -r code ctype redir <<<"$m"
  { echo "> $method $path"; [ -n "$body" ] && echo "> $(printf %s "$body" | cut -c1-400)"
    save_response "$out" "$out.body" "$code" "$ctype" "$redir"; } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_cron() {
  local dir which out
  dir="$(run_dir "${1:-}")"; which=${2:?rollup|nina}
  [[ $which == rollup || $which == nina ]] || die "cron: rollup or nina"
  out="$(next_evidence "$dir" cron "$which" txt)"
  local m code ctype
  m="$(curl -sS -m 300 -o "$out.body" -w '%{http_code}|%{content_type}' -H "Authorization: Bearer $(cat "$dir/secrets/cron")" "$(base_of "$dir")/api/cron/$which")"
  IFS='|' read -r code ctype <<<"$m"
  { echo "> GET /api/cron/$which  (Bearer: the run's own CRON_SECRET)"; save_response "$out" "$out.body" "$code" "$ctype"; } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_upload() {
  local dir; dir="$(run_dir "${1:-}")"; shift
  [ $# -ge 1 ] || die "upload: at least one IMAGE.jpg (optionally KIND=IMAGE.jpg; kinds summary, splits, heartrate)"
  local out base sp
  out="$(next_evidence "$dir" upload "$(basename "${1#*=}")" txt)"
  base="$(base_of "$dir")"; sp="http://127.0.0.1:$(cat "$dir/standin_port")"
  local kinds=(summary splits heartrate) i=0 refs="[]"
  {
    for spec in "$@"; do
      local kind file
      if [[ $spec == *=* ]]; then kind=${spec%%=*}; file=${spec#*=}; else kind=${kinds[$((i % 3))]}; file=$spec; fi
      i=$((i + 1))
      [ -f "$file" ] || die "upload: no such file $file"
      local id req tok put
      id="$(python3 -c 'import secrets,string; a=string.ascii_letters+string.digits; print("".join(secrets.choice(a) for _ in range(12)))')"
      # 1. The handshake UploadPicker's upload() makes: a client token for shots/<id>.jpg.
      req="{\"type\":\"blob.generate-client-token\",\"payload\":{\"pathname\":\"shots/$id.jpg\",\"clientPayload\":\"{\\\"kind\\\":\\\"$kind\\\"}\",\"multipart\":false}}"
      echo "> POST /api/upload  shots/$id.jpg kind=$kind ($(wc -c <"$file") bytes, $file)"
      tok="$(curl_app "$dir" -X POST "$base/api/upload" -H 'Content-Type: application/json' --data "$req")"
      echo "< $(printf %s "$tok" | sed -E 's/"clientToken":"[^"]{12}[^"]*"/"clientToken":"<redacted>"/')"
      tok="$(printf %s "$tok" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("clientToken",""))')"
      [ -n "$tok" ] || { echo "upload: no client token"; break; }
      # 2. The browser's PUT, to the run's Blob stand-in (NEXT_PUBLIC_VERCEL_BLOB_API_URL).
      put="$(curl -sS -m 60 -X PUT "$sp/blob/?pathname=shots/$id.jpg" -H "Authorization: Bearer $tok" -H 'x-api-version: 12' \
        -H 'x-content-type: image/jpeg' -H 'x-add-random-suffix: 1' --data-binary "@$file")"
      echo "> PUT blob shots/$id.jpg"; echo "< $put"
      refs="$(python3 -c '
import json,sys,hashlib,struct
refs=json.loads(sys.argv[1]); put=json.loads(sys.argv[2]); b=open(sys.argv[4],"rb").read()
w=h=None
i=2
while i < len(b)-9:
  if b[i]!=0xFF: i+=1; continue
  m=b[i+1]
  if m in (0xC0,0xC1,0xC2): h,w=struct.unpack(">HH",b[i+5:i+9]); break
  i+=2+struct.unpack(">H",b[i+2:i+4])[0]
refs.append({"url":put["url"],"pathname":put["pathname"],"kind":sys.argv[3],"width":w,"height":h,"bytes":len(b),"contentHash":hashlib.sha256(b).hexdigest()})
print(json.dumps(refs))' "$refs" "$put" "$kind" "$file")"
    done
    # 3. POST /api/extract with every ref, exactly UploadPicker's submit().
    local body m code ctype xid
    body="{\"images\":$refs}"
    echo "> POST /api/extract $(printf %s "$body" | cut -c1-600)"
    m="$(curl_app "$dir" -o "$out.body" -w '%{http_code}|%{content_type}' -X POST "$base/api/extract" -H 'Content-Type: application/json' --data "$body")"
    IFS='|' read -r code ctype <<<"$m"
    echo "< HTTP $code $ctype"; cat "$out.body"; echo
    xid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("extractionId",""))' "$out.body" 2>/dev/null || true)"
    rm -f "$out.body"
    if [ -n "$xid" ]; then
      # 4. useExtractionStatus's poll, until the background vision read settles (33-38 s measured).
      local st="" t0=$SECONDS
      while [ $((SECONDS - t0)) -lt 240 ]; do
        st="$(curl_app "$dir" "$base/api/extract/$xid")"
        printf %s "$st" | grep -q '"status":"pending"' || break
        sleep 3
      done
      echo "> GET /api/extract/$xid  (polled $((SECONDS - t0)) s)"
      echo "< $(printf %s "$st" | cut -c1-3000)"
      echo "EXTRACTION=$xid  review at /x/$xid"
    fi
  } >"$out" 2>&1
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_ui() {
  local dir steps width=390 theme=dark
  dir="$(run_dir "${1:-}")"; steps=${2:?STEPS.mjs}; shift 2
  local -a args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --width) width=$2; shift 2 ;;
      --theme) theme=$2; shift 2 ;;
      --) shift; args=("$@"); break ;;
      *) die "ui: unknown flag $1 (step arguments go after --)" ;;
    esac
  done
  [ -f "$steps" ] || die "no such steps file: $steps"
  steps="$(realpath "$steps")"   # before the cd into the snapshot, so relative paths work
  local argv
  argv="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "${args[@]}")"
  (cd "$dir/app" && RI_VERIFY_ARGS="$argv" node "$HERE/ui.mjs" "$(base_of "$dir")" "$steps" "$dir/evidence" "$(cookie_of "$dir")" \
    "http://127.0.0.1:$(cat "$dir/standin_port")" "$STORE_HOST" "$width" "$theme")
}

cmd_sql() {
  local dir out
  dir="$(run_dir "${1:-}")"
  out="$(next_evidence "$dir" sql query txt)"
  { echo "> ${2:?SQL}"; printf 'begin read only;\n%s;\nrollback;\n' "$2" | psql_run -d "$(meta "$dir" db)" 2>&1; } >"$out" || true
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_blobs() {
  local dir out
  dir="$(run_dir "${1:-}")"
  out="$(next_evidence "$dir" blobs "${2:-all}" txt)"
  { echo "> list ${2:-(all)} in $STORE_HOST (the run's stand-in store)"
    (cd "$dir/blobs" && find . -type f ! -name '*.__meta.json' -path "./${2:-}*" -printf '%P  %s bytes  %TY-%Tm-%Td %TH:%TM\n' | sort); } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_logs() {
  local dir re=${2:-'⨯|Error|error|REFUSED|BLOCKED'} n=${3:-40} out
  dir="$(run_dir "${1:-}")"
  out="$(next_evidence "$dir" logs "$re" txt)"
  { echo "> grep -E '$re' next.log (last $n)"; grep -E -- "$re" "$dir/next.log" | tail -n "$n" || echo "(no match)"; } >"$out"
  cat "$out"
  echo "[evidence: $out]" >&2
}

cmd_budget() {
  local dir; dir="$(run_dir "${1:-}")"
  if [ -f "$dir/state" ]; then cat "$dir/evidence/zz-budget.json"; else curl -fsS -m 3 "http://127.0.0.1:$(cat "$dir/standin_port")/budget"; fi
  echo
  grep -E '^paid ' "$dir/standin.log" 2>/dev/null | tail -20 || true
}

cmd_note() {
  local dir; dir="$(run_dir "${1:-}")"
  echo "$(date -Iseconds) ${2:?TEXT}" >>"$dir/evidence/LOG.md"
}

stop_run() {
  local dir=$1 kind pgid
  while read -r kind pgid; do
    [ -n "${pgid:-}" ] || continue
    if kill -0 "$pgid" 2>/dev/null; then
      kill -TERM -- "-$pgid" 2>/dev/null || true
      for _ in $(seq 1 20); do kill -0 "$pgid" 2>/dev/null || break; sleep 0.25; done
      kill -KILL -- "-$pgid" 2>/dev/null || true
    fi
  done <"$dir/pgids"
  for f in next.log standin.log seed.log commit.log migrate.log meta; do [ -f "$dir/$f" ] && cp "$dir/$f" "$dir/evidence/zz-$f"; done
  [ -f "$dir/budget.json" ] && cp "$dir/budget.json" "$dir/evidence/zz-budget.json"
  if docker inspect "$PG_CONTAINER" >/dev/null 2>&1 && [ -n "$(meta "$dir" db)" ]; then
    psql_run -c "drop database if exists $(meta "$dir" db) with (force)" >/dev/null || true
  fi
  rm -rf "$dir/app" "$dir/blobs" "$dir/home" "$dir/secrets" "$dir/web.env" "$dir/cookie" "$dir/port" "$dir/standin_port" "$dir/standin_tls_port"
  : >"$dir/pgids"; echo stopped >"$dir/state"
  echo "verify: stopped $(basename "$dir"); evidence kept in $dir/evidence ($(find "$dir/evidence" -type f | wc -l) files)"
}

cmd_down() {
  if [ "${1:-}" = --all ]; then
    for d in "$VERIFY_HOME"/*/; do [ -f "$d/meta" ] && [ ! -f "$d/state" ] && stop_run "${d%/}"; done
    return 0
  fi
  stop_run "$(run_dir "${1:-}")"
}

cmd_ls() {
  [ -d "$VERIFY_HOME" ] || return 0
  for d in "$VERIFY_HOME"/*/; do
    d=${d%/}
    local state=stopped
    [ -f "$d/state" ] || state="up:$(cat "$d/port" 2>/dev/null || echo '?')"
    printf '%-20s %-10s %-34s %-7s %3s evidence  %s\n' "$(basename "$d")" "$state" "$(meta "$d" mode 2>/dev/null)" \
      "$(meta "$d" seed 2>/dev/null)" "$(find "$d/evidence" -type f 2>/dev/null | wc -l)" "$(meta "$d" repo 2>/dev/null)"
  done
}

sub=${1:-}; shift || true
case "$sub" in
  up) cmd_up "$@" ;;
  doctor) cmd_doctor "$@" ;;
  api) cmd_api "$@" ;;
  upload) cmd_upload "$@" ;;
  cron) cmd_cron "$@" ;;
  ui) cmd_ui "$@" ;;
  sql) cmd_sql "$@" ;;
  blobs) cmd_blobs "$@" ;;
  logs) cmd_logs "$@" ;;
  budget) cmd_budget "$@" ;;
  note) cmd_note "$@" ;;
  down) cmd_down "$@" ;;
  ls) cmd_ls ;;
  *) sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
