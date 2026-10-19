#!/usr/bin/env bash
set -euo pipefail

# Isolated HTTP test: never invoke against a deployed site.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMP="$(mktemp -d)"
HOST="http://127.0.0.1:18576"
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

expect 401 "$HOST/api/admin/media" -F "file=@$TEMP/blue.png"
check '.error.code == "AUTH_REQUIRED"'
expect 401 "$HOST/api/admin/media/11111111-1111-4111-8111-111111111111/preview"
check '.error.code == "AUTH_REQUIRED"'
expect 200 "$HOST/api/auth/session"
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"
expect 200 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"username":"alice","password":"Only-A-Test-Password-456"}'
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"

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
test -f "$TEMP/private-storage/media/$PNG_ID.json"
test -f "$TEMP/private-storage/media-files/$PNG_ID.png"
expect 200 "$HOST/api/admin/media/$PNG_ID"
check --arg ID "$PNG_ID" '.id == $ID and .extension == "png"'
expect 200 "$HOST/api/admin/media/$PNG_ID/preview"
cmp "$TEMP/body" "$TEMP/blue.png"
expect 200 "$HOST/api/admin/media/$PNG_ID/preview" -I
test ! -s "$TEMP/body"

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
expect 200 "$HOST/api/admin/media/$WEBM_ID/preview"
cmp "$TEMP/body" "$TEMP/clip.webm"

expect 200 "$HOST/api/auth/logout" -X POST -H "X-CSRF-Token: $CSRF"
expect 401 "$HOST/api/admin/media/$PNG_ID/preview"
check '.error.code == "AUTH_REQUIRED"'
expect 401 "$HOST/api/admin/media/$MP4_ID"
check '.error.code == "AUTH_REQUIRED"'

echo "PASS: protected image/video uploads, MIME sniffing, rejection, private persistence and byte-range previews"
