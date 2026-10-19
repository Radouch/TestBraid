#!/usr/bin/env bash
set -euo pipefail

# Local-only HTTP integration test. Never point this script at a deployed host.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMP="$(mktemp -d)"
HOST="http://127.0.0.1:18575"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TEMP"
}
trap cleanup EXIT

mkdir -p "$TEMP/config"
export TESTBRAID_AUTHORS_FILE="$TEMP/config/authors.json"
export TESTBRAID_LOGIN_DIR="$TEMP/login-attempts"
export TESTBRAID_STORAGE_DIR="$TEMP/private-storage"
export TESTBRAID_ALLOW_HTTP_LOCAL=1
export TESTBRAID_TEST_REWRITTEN_SCRIPT_NAME='/private/testbraid-backend/public/api/index.php'
printf '%s\n' 'Only-A-Test-Password-456' | php "$ROOT/bin/create-author.php" alice >/dev/null
cd "$ROOT"
php -S 127.0.0.1:18575 -t public dev-router.php > "$TEMP/server.log" 2>&1 &
SERVER_PID="$!"

for i in {1..40}; do
  if curl -fsS "$HOST/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

request() {
  curl -sS -b "$TEMP/cookies" -c "$TEMP/cookies" "$@"
}
expect() {
  local status="$1"
  shift
  local actual
  actual="$(request -o "$TEMP/body" -w '%{http_code}' "$@")"
  if [[ "$actual" != "$status" ]]; then
    echo "Expected HTTP $status, got $actual: $(cat "$TEMP/body")" >&2
    tail -30 "$TEMP/server.log" >&2
    exit 1
  fi
}
check() {
  if ! jq -e "$@" "$TEMP/body" >/dev/null; then
    echo "Unexpected response: $(cat "$TEMP/body")" >&2
    exit 1
  fi
}

# Privileged routes must be protected before AND after an author logs out.
expect 401 "$HOST/api/admin/groups"
check '.error.code == "AUTH_REQUIRED"'
expect 401 "$HOST/api/admin/storage-diagnostics"
check '.error.code == "AUTH_REQUIRED"'
expect 401 "$HOST/api/admin/environment-diagnostics"
check '.error.code == "AUTH_REQUIRED"'
expect 401 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' -d '{"name":"Not allowed"}'
expect 200 "$HOST/api/auth/session"
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"
expect 200 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"username":"alice","password":"Only-A-Test-Password-456"}'
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"

# The diagnostic probe runs through web PHP, remains author-only, does not
# reveal server paths, and exercises the same directory setup as GET /groups.
# The report must come from web PHP (not a CLI php -i) and expose only
# allowlisted public capability values; never private filesystem paths.
expect 200 "$HOST/api/admin/environment-diagnostics"
check '.fileinfoEnabled == true and .jsonEnabled == true
  and .fileUploadsEnabled == true
  and .sessionCookieHttpOnly == true
  and .sessionCookieSameSite == "Lax"
  and .sessionStrictMode == true
  and .sessionUseOnlyCookies == true
  and .sessionCookieSecure == false
  and (.phpVersion | type == "string")
  and .phpSapi == "cli-server"
  and (.uploadMaxFilesize | type == "string")
  and (.postMaxSize | type == "string")
  and (keys | length) == 13'
if grep -Eiq 'auth(or)?s\.json|setup\.key|/home/|/tmp/|TESTBRAID_|DOCUMENT_ROOT|session\.save_path' "$TEMP/body"; then
  echo 'Environment diagnostics disclosed a private setting or path' >&2
  exit 1
fi
expect 200 "$HOST/api/admin/storage-diagnostics"
check '.storageDirectoryExists == true and .storageDirectoryWritable == true
  and .documentRootResolved == true and .storageUnderDocumentRoot == false
  and .publicRootSource == "bootstrap" and .servedPublicRootResolved == true
  and .storageUnderServedPublicRoot == false
  and .groupListing == "ok" and .failure == null'
expect 200 "$HOST/api/admin/groups"
check '.groups == []'

expect 403 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' -d '{"name":"Missing CSRF"}'
check '.error.code == "INVALID_CSRF"'
expect 400 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":'
check '.error.code == "INVALID_JSON"'
expect 422 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":"No","id":"client-controlled"}'
check '.error.code == "VALIDATION_FAILED"'

expect 201 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":"Lesson 1"}'
check '.schemaVersion == 1 and .name == "Lesson 1" and (.id | test("^[0-9a-f-]{36}$"))'
GROUP="$(jq -r '.id' "$TEMP/body")"
test -f "$TEMP/private-storage/groups/$GROUP.json"
expect 200 "$HOST/api/admin/groups"
check --arg ID "$GROUP" 'any(.groups[]; .id == $ID and .name == "Lesson 1")'
expect 200 "$HOST/api/admin/groups/$GROUP" -X PATCH -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":"Renamed lesson"}'
check '.name == "Renamed lesson"'

# Drafts may be incomplete, but all editable fields must be explicit on update.
printf '{"groupId":"%s","language":"en","title":"Draft","description":"Intro","questions":[]}' "$GROUP" > "$TEMP/create.json"
expect 201 "$HOST/api/admin/tests" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/create.json"
check '.status == "draft" and .publishedAt == null and .questions == []'
TEST_ID="$(jq -r '.id' "$TEMP/body")"
test -f "$TEMP/private-storage/tests/$TEST_ID.json"
expect 200 "$HOST/api/admin/tests/$TEST_ID"
check --arg ID "$TEST_ID" '.id == $ID and .title == "Draft"'
expect 200 "$HOST/api/admin/tests?groupId=$GROUP"
check --arg ID "$TEST_ID" 'any(.tests[]; .id == $ID)'
expect 400 "$HOST/api/admin/tests?unexpected=value"
check '.error.code == "INVALID_QUERY"'
expect 400 "$HOST/api/admin/tests/not-a-uuid"
check '.error.code == "INVALID_ID"'

# A valid choice question can be persisted and loaded without a browser editor.
jq '.title = "Updated test" | .questions = [{
  "id": "question-1", "type": "choice", "mode": "single",
  "prompt": [{"id":"prompt-1","type":"text","text":"Which answer?"}],
  "options": [
    {"id":"option-a","content":[{"id":"block-a","type":"text","text":"A"}]},
    {"id":"option-b","content":[{"id":"block-b","type":"text","text":"B"}]}
  ],
  "correctOptionIds":["option-a"]
}]' "$TEMP/create.json" > "$TEMP/update.json"
expect 200 "$HOST/api/admin/tests/$TEST_ID" -X PUT -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/update.json"
check '.title == "Updated test" and (.questions | length) == 1'
expect 200 "$HOST/api/admin/tests/$TEST_ID"
check '.questions[0].correctOptionIds == ["option-a"]'
jq '. + {"status":"published"}' "$TEMP/update.json" > "$TEMP/illegal.json"
expect 422 "$HOST/api/admin/tests/$TEST_ID" -X PUT -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/illegal.json"
check '.error.code == "VALIDATION_FAILED"'

# Unknown groups and unresolved media references must not enter storage.
jq '.groupId = "11111111-1111-4111-8111-111111111111"' "$TEMP/create.json" > "$TEMP/missing-group.json"
expect 422 "$HOST/api/admin/tests" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/missing-group.json"
check '.error.code == "GROUP_MISSING"'
jq '.questions[0].prompt = [{"id":"block-missing","type":"image","mediaId":"11111111-1111-4111-8111-111111111111"}]' "$TEMP/update.json" > "$TEMP/missing-media.json"
expect 422 "$HOST/api/admin/tests/$TEST_ID" -X PUT -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/missing-media.json"
check '.error.code == "MEDIA_MISSING"'
expect 200 "$HOST/api/admin/tests/$TEST_ID"
check '.questions[0].prompt[0].type == "text"'

expect 200 "$HOST/api/auth/logout" -X POST -H "X-CSRF-Token: $CSRF"
expect 401 "$HOST/api/admin/tests/$TEST_ID"
check '.error.code == "AUTH_REQUIRED"'
echo "PASS: authenticated JSON CRUD, validation, private persistence and rollback on rejected requests"
