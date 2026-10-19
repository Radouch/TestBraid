#!/usr/bin/env bash
set -euo pipefail

# Local-only integration run. Never point this script at a public production URL.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP="$(mktemp -d)"
PORT=18573
HOST="http://127.0.0.1:$PORT"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$TEMP"
}
trap cleanup EXIT

export TESTBRAID_AUTHORS_FILE="$TEMP/authors.json"
export TESTBRAID_LOGIN_DIR="$TEMP/login-attempts"
export TESTBRAID_ALLOW_HTTP_LOCAL=1
printf 'Only-A-Test-Password-456\n' | php "$ROOT/bin/create-author.php" alice >/dev/null
cd "$ROOT"
php -S "127.0.0.1:$PORT" -t public dev-router.php > "$TEMP/php.log" 2>&1 &
SERVER_PID=$!

for i in {1..40}; do
  if curl -fsS "$HOST/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

response() {
  curl -sS -b "$TEMP/cookies" -c "$TEMP/cookies" "$@"
}
assert_status() {
  local expected="$1"; shift
  local actual
  actual="$(response -o "$TEMP/body" -w '%{http_code}' "$@")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected HTTP $expected; got $actual. Body: $(cat "$TEMP/body")" >&2
    echo "Session cookie jar:" >&2
    sed -E 's/(TESTBRAIDSESSID[[:space:]]+).*/\\1[REDACTED]/' "$TEMP/cookies" >&2
    echo "PHP server diagnostics:" >&2
    tail -40 "$TEMP/php.log" >&2
    exit 1
  fi
}
assert_json() {
  if ! jq -e "$1" "$TEMP/body" >/dev/null; then
    echo "Unexpected JSON response: $(cat "$TEMP/body")" >&2
    exit 1
  fi
}

assert_status 200 "$HOST/api/health"
assert_json '.status == "ok"'
assert_status 401 "$HOST/api/admin/ping"
assert_json '.error.code == "AUTH_REQUIRED"'
assert_status 200 "$HOST/api/auth/session"
assert_json '.authenticated == false and (.csrfToken | length) == 64'
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"
grep -q 'HttpOnly' "$TEMP/cookies" || { echo "Missing HttpOnly session cookie" >&2; exit 1; }

# Login must reject absent CSRF and a cross-origin POST even with a valid token.
assert_status 403 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' -d '{"username":"alice","password":"Only-A-Test-Password-456"}'
assert_json '.error.code == "INVALID_CSRF"'
assert_status 403 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' -H 'Origin: https://attacker.invalid' -H "X-CSRF-Token: $CSRF" -d '{"username":"alice","password":"Only-A-Test-Password-456"}'
assert_json '.error.code == "INVALID_ORIGIN"'
assert_status 200 "$HOST/api/auth/session"
if [[ "$(jq -r '.csrfToken' "$TEMP/body")" != "$CSRF" ]]; then
  echo "CSRF token changed unexpectedly between anonymous requests" >&2
  exit 1
fi
assert_status 401 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d '{"username":"alice","password":"wrong-password"}'
assert_json '.error.code == "INVALID_CREDENTIALS"'
assert_status 200 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d '{"username":"alice","password":"Only-A-Test-Password-456"}'
assert_json '.authenticated == true and .user.username == "alice"'
NEW_CSRF="$(jq -r '.csrfToken' "$TEMP/body")"
[[ "$NEW_CSRF" != "$CSRF" ]] || { echo 'CSRF token did not rotate' >&2; exit 1; }
assert_status 200 "$HOST/api/admin/ping"
assert_json '.status == "ok" and .user.username == "alice"'

# Unauthorized logout must not alter the authenticated session.
assert_status 403 "$HOST/api/auth/logout" -X POST -H "X-CSRF-Token: $CSRF"
assert_status 200 "$HOST/api/admin/ping"
assert_status 200 "$HOST/api/auth/logout" -X POST -H "X-CSRF-Token: $NEW_CSRF"
assert_json '.authenticated == false'
assert_status 401 "$HOST/api/admin/ping"

# A shared IP is blocked after repeated failed attempts, even for another username.
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"
for i in {1..5}; do
  assert_status 401 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d '{"username":"other","password":"bad"}'
done
assert_status 429 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d '{"username":"another","password":"bad"}'
assert_json '.error.code == "RATE_LIMITED"'

echo "PASS: session, authorization, login/logout, CSRF rotation, origin and rate limits"
