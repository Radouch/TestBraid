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
  and (keys | length) == 14'
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
check '.status == "draft" and .publishedAt == null and .questions == [] and .showOverallScore == true'
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

# Disabling score display is persisted independently of the answer key.
# An older editor omitting this optional setting must not reset it.
jq '.showOverallScore = false' "$TEMP/update.json" > "$TEMP/no-score.json"
expect 200 "$HOST/api/admin/tests/$TEST_ID" -X PUT -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/no-score.json"
check '.showOverallScore == false and .questions[0].correctOptionIds == ["option-a"]'
expect 200 "$HOST/api/admin/tests/$TEST_ID" -X PUT -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/update.json"
check '.showOverallScore == false'
expect 200 "$HOST/api/admin/tests/$TEST_ID"
check '.showOverallScore == false'
expect 200 "$HOST/api/admin/tests?groupId=$GROUP"
check --arg ID "$TEST_ID" 'any(.tests[]; .id == $ID and .showOverallScore == false)'

# The type is validated, not interpreted using PHP truthiness.
jq '.showOverallScore = "false"' "$TEMP/update.json" > "$TEMP/invalid-score.json"
expect 422 "$HOST/api/admin/tests/$TEST_ID" -X PUT -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/invalid-score.json"
check '.error.code == "VALIDATION_FAILED"'
expect 200 "$HOST/api/admin/tests/$TEST_ID"
check '.showOverallScore == false'
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

# UX enhancements: the saved complete draft is ready to publish,
# duplicates are independent drafts and per-lesson order persists.
expect 200 "$HOST/api/admin/tests/readiness"
check --arg ID "$TEST_ID" '.tests[$ID].ready == true and (.tests[$ID].issues | length) == 0'
expect 201 "$HOST/api/admin/tests/$TEST_ID/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check --arg ID "$TEST_ID" '.id != $ID and .title == "Updated test (1)" and .status == "draft" and .showOverallScore == false and (.questions | length) == 1'
COPY_ID="$(jq -r '.id' "$TEMP/body")"
expect 200 "$HOST/api/admin/tests"
check --arg ID "$COPY_ID" '([.tests[].id] | index($ID)) != null'
expect 422 "$HOST/api/admin/tests/order" -X PUT -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' -d "{\"groupId\":\"$GROUP\",\"ids\":[\"$TEST_ID\"]}"
check '.error.code == "INVALID_ORDER"'
expect 200 "$HOST/api/admin/tests/order" -X PUT -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' -d "{\"groupId\":\"$GROUP\",\"ids\":[\"$COPY_ID\",\"$TEST_ID\"]}"
check --arg FIRST "$COPY_ID" --arg SECOND "$TEST_ID" '.tests[0].id == $FIRST and .tests[1].id == $SECOND'
expect 200 "$HOST/api/admin/tests/$COPY_ID"
check '.position == 0'
expect 200 "$HOST/api/admin/groups/order" -X PUT -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' -d "{\"ids\":[\"$GROUP\"]}"
check --arg ID "$GROUP" '.groups[0].id == $ID and .groups[0].position == 0'
expect 200 "$HOST/api/admin/tests/$COPY_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.deleted == true'

# Repeated duplications use the lowest free suffix in the same lesson.
expect 201 "$HOST/api/admin/tests/$TEST_ID/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.title == "Updated test (1)"'
COPY_ONE="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/tests/$TEST_ID/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.title == "Updated test (2)"'
COPY_TWO="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/tests/$COPY_TWO/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.title == "Updated test (3)"'
COPY_THREE="$(jq -r '.id' "$TEMP/body")"

# Gaps are reused, even when duplicating a previously numbered copy.
expect 200 "$HOST/api/admin/tests/$COPY_TWO" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 201 "$HOST/api/admin/tests/$COPY_THREE/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.title == "Updated test (2)"'
GAP_COPY="$(jq -r '.id' "$TEMP/body")"

# Titles in another language in the same lesson do not occupy copy suffixes.
jq '.title = "Updated test (4)" | .language = "cs"' "$TEMP/create.json" > "$TEMP/czech-title.json"
expect 201 "$HOST/api/admin/tests" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/czech-title.json"
CZECH_TEST="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/tests/$TEST_ID/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.title == "Updated test (4)"'
COPY_FIVE="$(jq -r '.id' "$TEMP/body")"
for id in "$COPY_ONE" "$COPY_THREE" "$GAP_COPY" "$CZECH_TEST" "$COPY_FIVE"; do
  expect 200 "$HOST/api/admin/tests/$id" -X DELETE -H "X-CSRF-Token: $CSRF"
done

# Other lessons have independent title sequences.
expect 201 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":"Other lesson"}'
OTHER_GROUP="$(jq -r '.id' "$TEMP/body")"
jq --arg group "$OTHER_GROUP" '.groupId = $group | .title = "Updated test (1)"' \
  "$TEMP/create.json" > "$TEMP/other-lesson.json"
expect 201 "$HOST/api/admin/tests" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/other-lesson.json"
OTHER_TEST="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/tests/$TEST_ID/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.title == "Updated test (1)"'
INDEPENDENT_COPY="$(jq -r '.id' "$TEMP/body")"
expect 200 "$HOST/api/admin/tests/$INDEPENDENT_COPY" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/tests/$OTHER_TEST" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/groups/$OTHER_GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"

# The 250-character title limit counts Unicode characters, not UTF-8 bytes.
LONG_TITLE="$(printf 'ž%.0s' {1..250})"
LONG_PREFIX="$(printf 'ž%.0s' {1..246})"
jq --arg title "$LONG_TITLE" '.title = $title' "$TEMP/create.json" > "$TEMP/long-title.json"
expect 201 "$HOST/api/admin/tests" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/long-title.json"
LONG_ID="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/tests/$LONG_ID/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check --arg prefix "$LONG_PREFIX" '.title == ($prefix + " (1)") and (.title | length) == 250'
LONG_COPY="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/tests/$LONG_COPY/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check --arg prefix "$LONG_PREFIX" '.title == ($prefix + " (2)") and (.title | length) == 250'
LONG_COPY_TWO="$(jq -r '.id' "$TEMP/body")"
for id in "$LONG_COPY_TWO" "$LONG_COPY" "$LONG_ID"; do
  expect 200 "$HOST/api/admin/tests/$id" -X DELETE -H "X-CSRF-Token: $CSRF"
done

# An untitled draft still gets a readable title when duplicated.
jq '.title = ""' "$TEMP/create.json" > "$TEMP/untitled.json"
expect 201 "$HOST/api/admin/tests" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/untitled.json"
UNTITLED_ID="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/tests/$UNTITLED_ID/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.title == "Test (1)"'
UNTITLED_COPY="$(jq -r '.id' "$TEMP/body")"
expect 200 "$HOST/api/admin/tests/$UNTITLED_COPY" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/tests/$UNTITLED_ID" -X DELETE -H "X-CSRF-Token: $CSRF"

# Name collisions are checked by lesson + content language, not globally.
jq '.title = "updated TEST"' "$TEMP/create.json" > "$TEMP/collision-test.json"
expect 409 "$HOST/api/admin/tests" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/collision-test.json"
check '.error.code == "TEST_TITLE_EXISTS"'
jq '.title = "Updated test" | .language = "cs"' "$TEMP/create.json" > "$TEMP/allowed-czech.json"
expect 201 "$HOST/api/admin/tests" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/allowed-czech.json"
CS_TEST="$(jq -r '.id' "$TEMP/body")"
# Moving between languages or lessons is also checked, not just renaming.
jq '.title = "Updated test" | .language = "cs"' "$TEMP/update.json" > "$TEMP/collision-update.json"
expect 409 "$HOST/api/admin/tests/$TEST_ID" -X PUT -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/collision-update.json"
check '.error.code == "TEST_TITLE_EXISTS"'
expect 200 "$HOST/api/admin/tests/$TEST_ID"
check '.language == "en" and .title == "Updated test"'

# Uniqueness is enforced for legacy and multilingual lesson records.
expect 409 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":"renamed LESSON"}'
check '.error.code == "GROUP_NAME_EXISTS"'
expect 201 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"names":{"cs":"Lekce 1","en":"Lesson 1"}}'
check '.name == "Lekce 1" and .names.cs == "Lekce 1" and .names.en == "Lesson 1"'
BILINGUAL_GROUP="$(jq -r '.id' "$TEMP/body")"
expect 409 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"names":{"cs":"jiná lekce","en":"LESSON 1"}}'
check '.error.code == "GROUP_NAME_EXISTS"'
expect 409 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"names":{"cs":"LEKCE 1"}}'
check '.error.code == "GROUP_NAME_EXISTS"'
expect 422 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"names":{}}'
check '.error.code == "VALIDATION_FAILED"'
expect 200 "$HOST/api/admin/groups/$BILINGUAL_GROUP" -X PATCH -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"names":{"cs":"Nová lekce","en":"New lesson"}}'
check '.names.cs == "Nová lekce" and .names.en == "New lesson"'
expect 409 "$HOST/api/admin/groups/$BILINGUAL_GROUP" -X PATCH -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"names":{"cs":"Renamed lesson","en":"Other title"}}'
check '.error.code == "GROUP_NAME_EXISTS"'
expect 200 "$HOST/api/admin/groups"
check --arg id "$BILINGUAL_GROUP" 'any(.groups[]; .id == $id and .names.en == "New lesson")'

# Copying a localized lesson creates matching numbered translations and tests.
expect 201 "$HOST/api/admin/groups/$BILINGUAL_GROUP/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.name == "Nová lekce (1)" and .names.cs == "Nová lekce (1)" and .names.en == "New lesson (1)"'
LESSON_COPY="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/groups/$BILINGUAL_GROUP/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.names.cs == "Nová lekce (2)" and .names.en == "New lesson (2)"'
LESSON_COPY_TWO="$(jq -r '.id' "$TEMP/body")"
expect 200 "$HOST/api/admin/groups/$LESSON_COPY_TWO" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/groups/$LESSON_COPY" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/groups/$BILINGUAL_GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"

# A lesson copy preserves test titles by language, order and media references.
expect 201 "$HOST/api/admin/groups/$GROUP/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
check '.name == "Renamed lesson (1)"'
CLONED_GROUP="$(jq -r '.id' "$TEMP/body")"
expect 200 "$HOST/api/admin/tests?groupId=$CLONED_GROUP"
check --arg group "$CLONED_GROUP" '(.tests | length) == 2 and
  any(.tests[]; .groupId == $group and .language == "en" and .title == "Updated test" and .status == "draft" and (.questions | length) == 1) and
  any(.tests[]; .groupId == $group and .language == "cs" and .title == "Updated test" and .status == "draft")'
CLONED_TESTS="$(jq -r '[.tests[].id] | join(" ")' "$TEMP/body")"
for id in $CLONED_TESTS; do
  expect 200 "$HOST/api/admin/tests/$id" -X DELETE -H "X-CSRF-Token: $CSRF"
done
expect 200 "$HOST/api/admin/groups/$CLONED_GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"

# A conflicting destination title blocks a move and leaves source data intact.
expect 201 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":"Move target"}'
MOVE_GROUP="$(jq -r '.id' "$TEMP/body")"
jq --arg id "$MOVE_GROUP" '.groupId = $id | .title = "Updated test"' \
  "$TEMP/create.json" > "$TEMP/move-target.json"
expect 201 "$HOST/api/admin/tests" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/move-target.json"
MOVE_TEST="$(jq -r '.id' "$TEMP/body")"
jq --arg id "$MOVE_GROUP" '.groupId = $id' "$TEMP/update.json" > "$TEMP/move-attempt.json"
expect 409 "$HOST/api/admin/tests/$TEST_ID" -X PUT -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" --data-binary "@$TEMP/move-attempt.json"
check '.error.code == "TEST_TITLE_EXISTS"'
expect 200 "$HOST/api/admin/tests/$TEST_ID"
check --arg group "$GROUP" '.groupId == $group'
expect 200 "$HOST/api/admin/tests/$MOVE_TEST" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/groups/$MOVE_GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/tests/$CS_TEST" -X DELETE -H "X-CSRF-Token: $CSRF"

# Deletions must be protected by auth and CSRF and must never
# silently cascade: a lesson with even one draft test cannot be deleted.
expect 409 "$HOST/api/admin/groups/$GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "GROUP_NOT_EMPTY"'
test -f "$TEMP/private-storage/groups/$GROUP.json"
test -f "$TEMP/private-storage/tests/$TEST_ID.json"

expect 403 "$HOST/api/admin/tests/$TEST_ID" -X DELETE
check '.error.code == "INVALID_CSRF"'
expect 400 "$HOST/api/admin/tests/not-a-uuid" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "INVALID_ID"'
expect 404 "$HOST/api/admin/tests/11111111-1111-4111-8111-111111111111" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "NOT_FOUND"'

expect 200 "$HOST/api/admin/tests/$TEST_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
check --arg ID "$TEST_ID" '.deleted == true and .id == $ID'
test ! -e "$TEMP/private-storage/tests/$TEST_ID.json"
expect 404 "$HOST/api/admin/tests/$TEST_ID"
check '.error.code == "NOT_FOUND"'
expect 404 "$HOST/api/admin/tests/$TEST_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "NOT_FOUND"'

expect 200 "$HOST/api/admin/groups/$GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"
check --arg ID "$GROUP" '.deleted == true and .id == $ID'
test ! -e "$TEMP/private-storage/groups/$GROUP.json"
expect 404 "$HOST/api/admin/groups/$GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "NOT_FOUND"'
expect 200 "$HOST/api/admin/groups"
check '.groups == []'

expect 200 "$HOST/api/auth/logout" -X POST -H "X-CSRF-Token: $CSRF"
expect 401 "$HOST/api/admin/tests/$TEST_ID" -X DELETE
check '.error.code == "AUTH_REQUIRED"'
echo "PASS: authenticated JSON CRUD, guarded deletes, validation, private persistence and rollback"
