#!/usr/bin/env bash
set -euo pipefail

# End-to-end bootstrap test using a disposable private config and PHP server.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP="$(mktemp -d)"
PORT=18574
HOST="http://127.0.0.1:$PORT"
KEY='Temporary-Setup-Key-For-Integration-Testing-123456'
PASS='Only-A-Setup-Password-456'

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TEMP"
}
trap cleanup EXIT

mkdir -p "$TEMP/config"
export TESTBRAID_AUTHORS_FILE="$TEMP/config/authors.json"
export TESTBRAID_SETUP_KEY_FILE="$TEMP/config/setup.key"
export TESTBRAID_LOGIN_DIR="$TEMP/login-attempts"
export TESTBRAID_ALLOW_HTTP_LOCAL=1
export TESTBRAID_TEST_REWRITTEN_SCRIPT_NAME='/internal/private/api/index.php'
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
    echo "Expected HTTP $expected; got $actual: $(cat "$TEMP/body")" >&2
    tail -30 "$TEMP/php.log" >&2
    exit 1
  fi
}
assert_json() {
  jq -e "$1" "$TEMP/body" >/dev/null || {
    echo "Unexpected JSON body: $(cat "$TEMP/body")" >&2
    exit 1
  }
}

assert_status 200 "$HOST/api/auth/session"
assert_json '.authenticated == false and .setupState == "needs-key"'
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"

# SFTP is represented by creating the private key file, not calling any CLI
# provisioning tool. The browser subsequently supplies the same secret.
printf '%s\n' "$KEY" > "$TESTBRAID_SETUP_KEY_FILE"
chmod 600 "$TESTBRAID_SETUP_KEY_FILE"
assert_status 200 "$HOST/api/auth/session"
assert_json '.setupState == "ready"'

body() {
  printf '{"username":"alice","password":"%s","setupKey":"%s"}' "$PASS" "$1"
}

assert_status 403 "$HOST/api/auth/setup" -X POST -H 'Content-Type: application/json' -d "$(body "$KEY")"
assert_json '.error.code == "INVALID_CSRF"'
assert_status 403 "$HOST/api/auth/setup" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "$(body 'Wrong-Setup-Key-For-Integration-Testing-123456')"
assert_json '.error.code == "INVALID_SETUP_KEY"'
[[ ! -e "$TESTBRAID_AUTHORS_FILE" ]] || { echo 'A failed setup wrote an account' >&2; exit 1; }

assert_status 201 "$HOST/api/auth/setup" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "$(body "$KEY")"
assert_json '.authenticated == true and .user.username == "alice" and .setupState == "complete"'
NEW_CSRF="$(jq -r '.csrfToken' "$TEMP/body")"
[[ "$NEW_CSRF" != "$CSRF" ]] || { echo 'CSRF token was not rotated' >&2; exit 1; }
[[ -f "$TESTBRAID_AUTHORS_FILE" && ! -e "$TESTBRAID_SETUP_KEY_FILE" ]] || {
  echo 'Account file was not created or setup key was not removed' >&2
  exit 1
}
if grep -q "$PASS" "$TESTBRAID_AUTHORS_FILE"; then
  echo 'Plaintext password was persisted' >&2
  exit 1
fi
[[ "$(jq -r '.users | length' "$TESTBRAID_AUTHORS_FILE")" == '1' ]] || exit 1
assert_status 200 "$HOST/api/admin/ping"
assert_json '.user.username == "alice"'

# Even re-uploading the private key cannot reopen a completed installation.
printf '%s\n' "$KEY" > "$TESTBRAID_SETUP_KEY_FILE"
assert_status 409 "$HOST/api/auth/setup" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $NEW_CSRF" -d "$(body "$KEY")"
assert_json '.error.code == "SETUP_COMPLETE"'
[[ "$(jq -r '.users | length' "$TESTBRAID_AUTHORS_FILE")" == '1' ]] || exit 1
assert_status 200 "$HOST/api/auth/logout" -X POST -H "X-CSRF-Token: $NEW_CSRF"
assert_json '.authenticated == false'
assert_status 200 "$HOST/api/auth/session"
assert_json '.authenticated == false and .setupState == "complete"'
assert_status 401 "$HOST/api/admin/ping"

echo 'PASS: first-author browser setup, CSRF, private key, no replay and account persistence'
