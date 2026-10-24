#!/usr/bin/env bash
set -Eeuo pipefail

# Isolated HTTP test: never invoke against a deployed site.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMP="$(mktemp -d)"
HOST="http://127.0.0.1:18576"
MEDIA_DIR="$ROOT/public/media"
SERVER_PID=""
CREATED_MEDIA_DIR=0
CREATED_HTACCESS=0
[[ -d "$MEDIA_DIR" ]] || { mkdir "$MEDIA_DIR"; CREATED_MEDIA_DIR=1; }
[[ -e "$MEDIA_DIR/.htaccess" ]] || { cp "$ROOT/../deploy/www/media/.htaccess" "$MEDIA_DIR/.htaccess"; CREATED_HTACCESS=1; }
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if (( CREATED_HTACCESS )); then rm -f "$MEDIA_DIR/.htaccess"; fi
  if (( CREATED_MEDIA_DIR )); then rmdir "$MEDIA_DIR" || true; fi
  rm -rf "$TEMP"
}
trap cleanup EXIT
trap 'echo "Media HTTP integration failed at line $LINENO: $BASH_COMMAND" >&2; tail -30 "$TEMP/server.log" >&2' ERR

# Exercise the policy parser and PHP mismatch logic in the existing CI media job.
php "$ROOT/bin/test-upload-limits.php"

mkdir -p "$TEMP/config"
cp "$ROOT/config/app.json" "$TEMP/config/app.json"
export TESTBRAID_APP_CONFIG_FILE="$TEMP/config/app.json"
export TESTBRAID_AUTHORS_FILE="$TEMP/config/authors.json"
export TESTBRAID_LOGIN_DIR="$TEMP/login-attempts"
export TESTBRAID_STORAGE_DIR="$TEMP/private-storage"
export TESTBRAID_ALLOW_HTTP_LOCAL=1
printf '%s\n' 'Only-A-Test-Password-456' | php "$ROOT/bin/create-author.php" alice >/dev/null

printf '%s\n' 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYPjPwMDAxMDAwMDAAAALHwEDmIWXfgAAAABJRU5ErkJggg==' | base64 -d > "$TEMP/blue.png"
base64 -d "$ROOT/bin/fixtures/tiny.mp4.b64" > "$TEMP/clip.mp4"
base64 -d "$ROOT/bin/fixtures/tiny.webm.b64" > "$TEMP/clip.webm"
printf '<?php echo "danger";' > "$TEMP/evil.php"
printf 'not a video' > "$TEMP/invalid.mp4"

cd "$ROOT"
php -S 127.0.0.1:18576 -t public dev-router.php > "$TEMP/server.log" 2>&1 &
SERVER_PID="$!"
for i in {1..40}; do
  if curl -fsS "$HOST/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

request() {
  curl -sS -b "$TEMP/cookies" -c "$TEMP/cookies" "$@"
}
expect() {
  local expected="$1"; shift
  local status
  status="$(request -o "$TEMP/body" -w '%{http_code}' "$@")"
  if [[ "$status" != "$expected" ]]; then
    echo "Expected HTTP $expected; got $status: $(head -c 1000 "$TEMP/body")" >&2
    tail -25 "$TEMP/server.log" >&2
    exit 1
  fi
}
check() {
  if ! jq -e "$@" "$TEMP/body" > /dev/null; then
    echo "Unexpected JSON: $(cat "$TEMP/body")" >&2
    exit 1
  fi
}

expect 200 "$HOST/api/public/config"
check '.site.name == {"cs":"TestBraid","en":"TestBraid"} and (.site.description.cs | type == "string") and (.site.description.en | type == "string") and (.uploads == null)'
# Public translations update immediately; the API must not expose upload limits.
cat > "$TEMP/config/app.json" <<'JSON'
{"site":{"name":{"cs":"Výukové testy","en":"Learning tests"},"description":{"cs":"Procvičování","en":"Practice"}},"uploads":{"maxImageSizeMiB":12,"maxVideoSizeMiB":64}}
JSON
expect 200 "$HOST/api/public/config"
check '.site.name.cs == "Výukové testy" and .site.name.en == "Learning tests" and .site.description.cs == "Procvičování" and (.uploads == null)'
# The author-only upload policy must use the same private file.
expect 401 "$HOST/api/admin/media"
expect 401 "$HOST/api/admin/media/limits"
expect 401 "$HOST/api/admin/media/11111111-1111-4111-8111-111111111111" -X DELETE
check '.error.code == "AUTH_REQUIRED"'
expect 401 "$HOST/api/admin/media" -F "file=@$TEMP/blue.png"
check '.error.code == "AUTH_REQUIRED"'
expect 401 "$HOST/api/admin/media/11111111-1111-4111-8111-111111111111/preview"
check '.error.code == "AUTH_REQUIRED"'
expect 200 "$HOST/api/auth/session"
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"
expect 200 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"username":"alice","password":"Only-A-Test-Password-456"}'
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"

expect 200 "$HOST/api/admin/media/limits"
check '.imageMaxBytes > 0 and .videoMaxBytes > 0
  and .imageMaxBytes <= .configuredImageMaxBytes
  and .videoMaxBytes <= .configuredVideoMaxBytes
  and (.warnings | type == "array")'
expect 403 "$HOST/api/admin/media" -F "file=@$TEMP/blue.png"
check '.error.code == "INVALID_CSRF"'
expect 400 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" -d '{}'
check '.error.code == "INVALID_UPLOAD"'
expect 422 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" \
  -F "file=@$TEMP/blue.png;filename=evil.php.png;type=image/png"
check '.error.code == "INVALID_FILENAME"'
expect 415 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" \
  -F "file=@$TEMP/evil.php;type=image/png"
check '.error.code == "UNSUPPORTED_MEDIA"'
expect 415 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" \
  -F "file=@$TEMP/blue.png;filename=spoof.mp4;type=video/mp4"
check '.error.code == "UNSUPPORTED_MEDIA"'
expect 415 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" \
  -F "file=@$TEMP/invalid.mp4;type=video/mp4"
check '.error.code == "UNSUPPORTED_MEDIA"'
if find "$TEMP/private-storage/media-files" -name '*.php' -o -name '*.mp4' | grep -q .; then
  echo 'Invalid media unexpectedly persisted' >&2; exit 1
fi

expect 201 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" \
  -F "file=@$TEMP/blue.png;filename=blue.png;type=application/octet-stream"
check '.kind == "image" and .mimeType == "image/png" and .originalName == "blue.png" and (.mediaId | test("^[0-9a-f-]{36}$"))'
PNG_ID="$(jq -r '.mediaId' "$TEMP/body")"
expect 200 "$HOST/api/admin/media"
check --arg ID "$PNG_ID" '(.media | length) == 1 and .media[0].id == $ID and .media[0].usedIn == []'
test -f "$TEMP/private-storage/media/$PNG_ID.json"
test -f "$TEMP/private-storage/media-files/$PNG_ID.png"
expect 200 "$HOST/api/admin/media/$PNG_ID"
check --arg ID "$PNG_ID" '.id == $ID and .extension == "png"'
expect 200 "$HOST/api/admin/media/$PNG_ID/preview"
cmp "$TEMP/body" "$TEMP/blue.png"
expect 200 "$HOST/api/admin/media/$PNG_ID/preview" -I
grep -q 'Content-Length:' "$TEMP/body"

expect 201 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" \
  -F "file=@$TEMP/clip.mp4;type=application/octet-stream"
check '.kind == "video" and .mimeType == "video/mp4"'
MP4_ID="$(jq -r '.mediaId' "$TEMP/body")"
test -f "$TEMP/private-storage/media-files/$MP4_ID.mp4"
expect 200 "$HOST/api/admin/media/$MP4_ID/preview"
cmp "$TEMP/body" "$TEMP/clip.mp4"
expect 206 "$HOST/api/admin/media/$MP4_ID/preview" -H 'Range: bytes=0-15' -D "$TEMP/headers"
cmp "$TEMP/body" <(head -c 16 "$TEMP/clip.mp4")
grep -qi '^Content-Range: bytes 0-15/' "$TEMP/headers"
expect 206 "$HOST/api/admin/media/$MP4_ID/preview" -H 'Range: bytes=-8' -D "$TEMP/headers"
cmp "$TEMP/body" <(tail -c 8 "$TEMP/clip.mp4")
expect 416 "$HOST/api/admin/media/$MP4_ID/preview" -H 'Range: bytes=999999-'
expect 416 "$HOST/api/admin/media/$MP4_ID/preview" -H 'Range: bytes=0-10,20-30'

expect 201 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" \
  -F "file=@$TEMP/clip.webm;type=application/octet-stream"
check '.kind == "video" and .mimeType == "video/webm"'
WEBM_ID="$(jq -r '.mediaId' "$TEMP/body")"
expect 200 "$HOST/api/admin/media"
check --arg PNG "$PNG_ID" --arg MP4 "$MP4_ID" --arg WEBM "$WEBM_ID" '
  (.media | length) == 3
  and ([.media[].id] | sort) == ([$PNG,$MP4,$WEBM] | sort)
  and ([.media[].usedIn[]] | length) == 0'
expect 200 "$HOST/api/admin/media/$WEBM_ID/preview"
cmp "$TEMP/body" "$TEMP/clip.webm"

# An unused private upload can be removed, but not while referenced by any
# draft (including another copy of the draft).
expect 403 "$HOST/api/admin/media/$PNG_ID" -X DELETE
check '.error.code == "INVALID_CSRF"'
expect 400 "$HOST/api/admin/media/not-an-id" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "INVALID_ID"'
expect 404 "$HOST/api/admin/media/11111111-1111-4111-8111-111111111111" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "NOT_FOUND"'

expect 201 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":"Shared media draft"}'
GROUP="$(jq -r '.id' "$TEMP/body")"
# Virtual home folders are independent of references and static publication.
expect 403 "$HOST/api/admin/media/$MP4_ID" -X PATCH -H 'Content-Type: application/json' -d '{"groupId":null}'
check '.error.code == "INVALID_CSRF"'
expect 422 "$HOST/api/admin/media/$MP4_ID" -X PATCH -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d '{"groupId":"bad-id"}'
check '.error.code == "INVALID_GROUP"'
expect 422 "$HOST/api/admin/media/$MP4_ID" -X PATCH -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d '{"groupId":"11111111-1111-4111-8111-111111111111"}'
check '.error.code == "GROUP_MISSING"'
expect 200 "$HOST/api/admin/media/$MP4_ID" -X PATCH -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d "{\"groupId\":\"$GROUP\"}"
check --arg group "$GROUP" '.groupId == $group'
expect 200 "$HOST/api/admin/media"
check --arg id "$MP4_ID" --arg group "$GROUP" '[.media[] | select(.id == $id) | .groupId] == [$group]'
expect 422 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" -F "file=@$TEMP/blue.png" -F 'groupId=invalid'
check '.error.code == "INVALID_GROUP"'
expect 201 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" -F "file=@$TEMP/blue.png" -F "groupId=$GROUP"
check --arg group "$GROUP" '.groupId == $group'
ASSIGNED_ID="$(jq -r '.mediaId' "$TEMP/body")"
expect 200 "$HOST/api/admin/media/$ASSIGNED_ID"
check --arg group "$GROUP" '.groupId == $group'
expect 200 "$HOST/api/admin/media/$ASSIGNED_ID" -X PATCH -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d '{"groupId":null}'
check '.groupId == null'
expect 200 "$HOST/api/admin/media/$ASSIGNED_ID" -X PATCH -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d "{\"groupId\":\"$GROUP\"}"
check --arg group "$GROUP" '.groupId == $group'

jq -n --arg group "$GROUP" --arg image "$PNG_ID" '{
  groupId:$group, language:"en", title:"Referenced image", description:"",
  questions:[{id:"q1",type:"choice",mode:"single",
    prompt:[{id:"p1",type:"image",mediaId:$image}],
    options:[
      {id:"o1",content:[{id:"b1",type:"text",text:"One"}]},
      {id:"o2",content:[{id:"b2",type:"text",text:"Two"}]}
    ],
    correctOptionIds:["o1"]
  }]
}' > "$TEMP/referencing-test.json"
expect 201 "$HOST/api/admin/tests" -X POST -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' --data-binary "@$TEMP/referencing-test.json"
T1="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/tests/$T1/duplicate" -X POST -H "X-CSRF-Token: $CSRF"
T2="$(jq -r '.id' "$TEMP/body")"
expect 200 "$HOST/api/admin/media"
check --arg image "$PNG_ID" '[.media[] | select(.id == $image) | .usedIn[]] | length == 2'
# A referenced asset can belong to any home lesson, regardless of the test.
expect 200 "$HOST/api/admin/media/$PNG_ID" -X PATCH -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' -d "{\"groupId\":\"$GROUP\"}"
check --arg group "$GROUP" '.groupId == $group'
expect 200 "$HOST/api/admin/media"
check --arg image "$PNG_ID" '[.media[] | select(.id == $image) | .usedIn[]] | length == 2'
expect 409 "$HOST/api/admin/media/$PNG_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "MEDIA_IN_USE"'
test -f "$TEMP/private-storage/media-files/$PNG_ID.png"
expect 200 "$HOST/api/admin/tests/$T1" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 409 "$HOST/api/admin/media/$PNG_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "MEDIA_IN_USE"'
expect 200 "$HOST/api/admin/tests/$T2" -X DELETE -H "X-CSRF-Token: $CSRF"

expect 200 "$HOST/api/admin/media/$PNG_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
check --arg id "$PNG_ID" '.deleted == true and .id == $id'
test ! -e "$TEMP/private-storage/media/$PNG_ID.json"
test ! -e "$TEMP/private-storage/media-files/$PNG_ID.png"
expect 404 "$HOST/api/admin/media/$PNG_ID/preview"
expect 404 "$HOST/api/admin/media/$PNG_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/media/$MP4_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/media/$WEBM_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
# Deleting an empty lesson must retain files but detach their virtual assignment.
expect 200 "$HOST/api/admin/groups/$GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/media/$ASSIGNED_ID"
check '.groupId == null'
expect 200 "$HOST/api/admin/media/$ASSIGNED_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/admin/media"
check '.media == []'

expect 200 "$HOST/api/auth/logout" -X POST -H "X-CSRF-Token: $CSRF"
expect 401 "$HOST/api/admin/media"
check '.error.code == "AUTH_REQUIRED"'
expect 401 "$HOST/api/admin/media/$PNG_ID/preview"
check '.error.code == "AUTH_REQUIRED"'
expect 401 "$HOST/api/admin/media/$MP4_ID"
check '.error.code == "AUTH_REQUIRED"'

echo "PASS: protected image/video uploads, MIME sniffing, rejection, private persistence and byte-range previews"
