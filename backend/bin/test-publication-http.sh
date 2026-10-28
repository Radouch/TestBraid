#!/usr/bin/env bash
set -Eeuo pipefail

# Isolated local HTTP test, never runs on the deployed host.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMP="$(mktemp -d)"
HOST="http://127.0.0.1:18577"
MEDIA_DIR="$ROOT/public/media"
SERVER_PID=""
CREATED_MEDIA_DIR=0
[[ -d "$MEDIA_DIR" ]] || { mkdir "$MEDIA_DIR"; CREATED_MEDIA_DIR=1; }
[[ -e "$MEDIA_DIR/.htaccess" ]] || cp "$ROOT/../deploy/www/media/.htaccess" "$MEDIA_DIR/.htaccess"
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -d "$MEDIA_DIR" && -f "$TEMP/copied-names" ]]; then
    while IFS= read -r name; do
      [[ -z "$name" ]] || rm -f "$MEDIA_DIR/$name"
    done < "$TEMP/copied-names"
  fi
  if (( CREATED_MEDIA_DIR )); then rm -f "$MEDIA_DIR/.htaccess"; rmdir "$MEDIA_DIR" || true; fi
  rm -rf "$TEMP"
}
trap cleanup EXIT
trap 'echo "Publication test failed at line $LINENO: $BASH_COMMAND" >&2; tail -35 "$TEMP/server.log" >&2' ERR

mkdir -p "$TEMP/config"
cp "$ROOT/config/app.json" "$TEMP/config/app.json"
export TESTBRAID_APP_CONFIG_FILE="$TEMP/config/app.json"
export TESTBRAID_AUTHORS_FILE="$TEMP/config/authors.json"
export TESTBRAID_LOGIN_DIR="$TEMP/login-attempts"
export TESTBRAID_STORAGE_DIR="$TEMP/private-storage"
export TESTBRAID_ALLOW_HTTP_LOCAL=1
printf '%s\n' 'Only-A-Test-Password-456' | php "$ROOT/bin/create-author.php" alice >/dev/null

printf '%s\n' 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYPjPwMDAxMDAwMDAAAALHwEDmIWXfgAAAABJRU5ErkJggg==' | base64 -d > "$TEMP/image.png"
base64 -d "$ROOT/bin/fixtures/tiny.mp4.b64" > "$TEMP/movie.mp4"
cd "$ROOT"
php -S 127.0.0.1:18577 -t public dev-router.php > "$TEMP/server.log" 2>&1 &
SERVER_PID="$!"
for i in {1..40}; do
  if curl -fsS "$HOST/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

request() { curl -sS -b "$TEMP/cookies" -c "$TEMP/cookies" "$@"; }
expect() {
  local desired="$1"; shift
  local actual
  actual="$(request -o "$TEMP/body" -w '%{http_code}' "$@")"
  if [[ "$actual" != "$desired" ]]; then
    echo "Expected $desired got $actual: $(head -c 800 "$TEMP/body")" >&2
    exit 1
  fi
}
check() {
  jq -e "$@" "$TEMP/body" >/dev/null || { echo "Unexpected JSON: $(cat "$TEMP/body")" >&2; exit 1; }
}

expect 401 "$HOST/api/admin/tests/11111111-1111-4111-8111-111111111111/publish" -X POST
expect 404 "$HOST/api/public/tests/11111111-1111-4111-8111-111111111111"
expect 200 "$HOST/api/auth/session"
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"
expect 200 "$HOST/api/auth/login" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"username":"alice","password":"Only-A-Test-Password-456"}'
CSRF="$(jq -r '.csrfToken' "$TEMP/body")"
expect 403 "$HOST/api/admin/tests/11111111-1111-4111-8111-111111111111/publish" -X POST

expect 201 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":"Published tests"}'
GROUP="$(jq -r '.id' "$TEMP/body")"
expect 201 "$HOST/api/admin/groups" -X POST -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"name":"Unpublished lesson"}'
PRIVATE_GROUP="$(jq -r '.id' "$TEMP/body")"
expect 200 "$HOST/api/public/catalog"
check '.groups == []'
test "$(curl -sS -o "$TEMP/anon-catalog.json" -w '%{http_code}' "$HOST/api/public/catalog")" = "200"
jq -e '.groups == []' "$TEMP/anon-catalog.json" >/dev/null
expect 201 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" -F "file=@$TEMP/image.png"
IMAGE_ID="$(jq -r '.mediaId' "$TEMP/body")"
expect 201 "$HOST/api/admin/media" -H "X-CSRF-Token: $CSRF" -F "file=@$TEMP/movie.mp4"
MOVIE_ID="$(jq -r '.mediaId' "$TEMP/body")"
IMAGE_NAME="$IMAGE_ID.png"
MOVIE_NAME="$MOVIE_ID.mp4"
printf '%s\n' "$IMAGE_NAME" "$MOVIE_NAME" > "$TEMP/copied-names"
test ! -f "$MEDIA_DIR/$IMAGE_NAME"
test ! -f "$MEDIA_DIR/$MOVIE_NAME"
expect 404 "$HOST/media/$IMAGE_NAME"

# Create one incomplete test. Publication must fail without materializing any
# public asset, and the previously stored draft must remain unchanged.
jq -n --arg group "$GROUP" '{
  groupId:$group,language:"en",title:"Incomplete",
  description:"",questions:[]
}' > "$TEMP/incomplete.json"
expect 201 "$HOST/api/admin/tests" -X POST -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' --data-binary "@$TEMP/incomplete.json"
INCOMPLETE_ID="$(jq -r '.id' "$TEMP/body")"
expect 422 "$HOST/api/admin/tests/$INCOMPLETE_ID/publish" -X POST -H "X-CSRF-Token: $CSRF"
check '.error.code == "NOT_PUBLISHABLE"'
expect 200 "$HOST/api/admin/tests/$INCOMPLETE_ID"
check '.status == "draft" and .publishedAt == null'
expect 404 "$HOST/api/public/tests/$INCOMPLETE_ID"
expect 200 "$HOST/api/public/catalog"
check '.groups == []'

# Choice questions may mix text, images and video. Only the referenced assets
# become public; unrelated private uploads remain private.
jq -n --arg group "$GROUP" --arg img "$IMAGE_ID" '{
  groupId:$group,language:"en",title:"Published example",
  description:"A multimedia question",showOverallScore:false,
  questions:[{
    id:"q1",type:"choice",mode:"single",
    prompt:[{id:"p1",type:"image",mediaId:$img}],
    options:[
      {id:"o1",content:[{id:"b1",type:"text",text:"Correct"}]},
      {id:"o2",content:[{id:"b2",type:"text",text:"Wrong"}]}
    ],
    correctOptionIds:["o1"]
  }]
}' > "$TEMP/test1.json"
expect 201 "$HOST/api/admin/tests" -X POST -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' --data-binary "@$TEMP/test1.json"
T1="$(jq -r '.id' "$TEMP/body")"
expect 404 "$HOST/api/public/tests/$T1"
expect 200 "$HOST/api/public/catalog"
check '.groups == []'
expect 200 "$HOST/api/admin/tests/$T1/publish" -X POST -H "X-CSRF-Token: $CSRF"
check '.status == "published" and .publishedAt != null and .showOverallScore == false'
test -f "$MEDIA_DIR/$IMAGE_NAME"
test ! -f "$MEDIA_DIR/$MOVIE_NAME"
expect 200 "$HOST/api/public/tests/$T1"
check --arg id "$IMAGE_ID" '.test.status == "published" and .test.showOverallScore == false and .mediaUrls[$id] == ("/media/" + $id + ".png")'
# An anonymous catalog must include only published tests under the group
# containing them. It must not leak private-only lessons, draft titles,
# question content, answer keys, media IDs, author metadata or timestamps.
test "$(curl -sS -o "$TEMP/anon-catalog.json" -w '%{http_code}' "$HOST/api/public/catalog")" = "200"
jq -e --arg group "$GROUP" --arg id "$T1" --arg draft "$INCOMPLETE_ID" \
  --arg media "$IMAGE_ID" '
    (.groups | length) == 1
    and .groups[0].id == $group
    and .groups[0].name == "Published tests"
    and (.groups[0].tests | length) == 1
    and .groups[0].tests[0].id == $id
    and .groups[0].tests[0].title == "Published example"
    and .groups[0].tests[0].language == "en"
    and .groups[0].tests[0].questionCount == 1
    and ((.groups[0].tests[0] | keys | sort) == ["id", "language", "questionCount", "title"])
    and (tostring | contains($draft) | not)
    and (tostring | contains($media) | not)
    and (tostring | contains("Unpublished lesson") | not)
    and (tostring | contains("correctOptionIds") | not)
  ' "$TEMP/anon-catalog.json" >/dev/null

# The new public Vue learner route must be able to fetch the exact answer
# key and media URL without sending an author cookie or a CSRF header.
PUBLIC_CODE="$(curl -sS -o "$TEMP/anonymous-public.json" -w '%{http_code}' "$HOST/api/public/tests/$T1")"
test "$PUBLIC_CODE" = "200"
jq -e --arg image "$IMAGE_ID" '
  .test.status == "published" and .test.questions[0].type == "choice"
  and .test.questions[0].correctOptionIds == ["o1"]
  and .test.questions[0].options[0].id == "o1"
  and .mediaUrls[$image] == ("/media/" + $image + ".png")
' "$TEMP/anonymous-public.json" >/dev/null
expect 200 "$HOST/media/$IMAGE_NAME"
cmp "$TEMP/body" "$TEMP/image.png"
expect 404 "$HOST/media/$MOVIE_NAME"
expect 409 "$HOST/api/admin/tests/$T1/publish" -X POST -H "X-CSRF-Token: $CSRF"
check '.error.code == "ALREADY_PUBLISHED"'
expect 409 "$HOST/api/admin/tests/$T1" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "TEST_PUBLISHED"'
test -f "$MEDIA_DIR/$IMAGE_NAME"
expect 200 "$HOST/api/public/tests/$T1"

# A second published test shares an asset. Withdrawing the first must NOT
# delete its image. A published edit immediately promotes the new video.
jq --arg img "$IMAGE_ID" '.title = "Shared media" | .questions[0].prompt[0].mediaId = $img' \
  "$TEMP/test1.json" > "$TEMP/test2.json"
expect 201 "$HOST/api/admin/tests" -X POST -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' --data-binary "@$TEMP/test2.json"
T2="$(jq -r '.id' "$TEMP/body")"
expect 200 "$HOST/api/admin/tests/$T2/publish" -X POST -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/public/catalog"
check --arg id1 "$T1" --arg id2 "$T2" '
  (.groups | length) == 1
  and (.groups[0].tests | length) == 2
  and ([.groups[0].tests[].id] | sort) == ([$id1, $id2] | sort)
'
# Publish a separate group and ensure catalog lessons remain distinct.
jq --arg group "$PRIVATE_GROUP" '.groupId=$group | .title="Second lesson test"' "$TEMP/test1.json" > "$TEMP/test3.json"
expect 201 "$HOST/api/admin/tests" -X POST -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' --data-binary "@$TEMP/test3.json"
T3="$(jq -r '.id' "$TEMP/body")"
expect 200 "$HOST/api/admin/tests/$T3/publish" -X POST -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/public/catalog"
check --arg other "$PRIVATE_GROUP" --arg test "$T3" '(.groups | length) == 2 and ([.groups[].id] | index($other)) != null and ([.groups[].tests[].id] | index($test)) != null'
expect 200 "$HOST/api/admin/tests/$T3/unpublish" -X POST -H "X-CSRF-Token: $CSRF"
expect 200 "$HOST/api/public/catalog"
check '.groups | length == 1'

expect 200 "$HOST/api/admin/tests/$T1/unpublish" -X POST -H "X-CSRF-Token: $CSRF"
check '.status == "draft" and .publishedAt == null'
expect 404 "$HOST/api/public/tests/$T1"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$HOST/api/public/tests/$T1")" = "404"
expect 200 "$HOST/api/public/catalog"
check --arg id "$T2" '
  (.groups | length) == 1
  and (.groups[0].tests | length) == 1
  and .groups[0].tests[0].id == $id
'
test -f "$MEDIA_DIR/$IMAGE_NAME"
expect 200 "$HOST/media/$IMAGE_NAME"

jq --arg video "$MOVIE_ID" \
  '.title = "Now showing video" | .questions[0].prompt=[{id:"p2",type:"video",mediaId:$video}]' \
  "$TEMP/test2.json" > "$TEMP/video-update.json"
expect 200 "$HOST/api/admin/tests/$T2" -X PUT -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' --data-binary "@$TEMP/video-update.json"
check '.status == "published" and .title == "Now showing video"'
test ! -f "$MEDIA_DIR/$IMAGE_NAME"
test -f "$MEDIA_DIR/$MOVIE_NAME"
expect 200 "$HOST/api/public/tests/$T2"
check --arg id "$MOVIE_ID" '.test.title == "Now showing video" and .mediaUrls[$id] == ("/media/" + $id + ".mp4")'
expect 200 "$HOST/media/$MOVIE_NAME"
cmp "$TEMP/body" "$TEMP/movie.mp4"

# A published edit with an invalid question fails without breaking the old
# public data or removing the previously published video.
jq '.questions[0].options=[]' "$TEMP/video-update.json" > "$TEMP/bad-update.json"
expect 422 "$HOST/api/admin/tests/$T2" -X PUT -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' --data-binary "@$TEMP/bad-update.json"
check '.error.code == "NOT_PUBLISHABLE"'
test -f "$MEDIA_DIR/$MOVIE_NAME"
expect 200 "$HOST/api/public/tests/$T2"
check '.test.title == "Now showing video"'

# Withdrawal must remove the final unreferenced public video.
expect 200 "$HOST/api/admin/tests/$T2/unpublish" -X POST -H "X-CSRF-Token: $CSRF"
test ! -f "$MEDIA_DIR/$MOVIE_NAME"
expect 404 "$HOST/api/public/tests/$T2"
expect 200 "$HOST/api/public/catalog"
check '.groups == []'
expect 404 "$HOST/media/$MOVIE_NAME"
expect 200 "$HOST/api/admin/tests/$T2"
check '.status == "draft"'

# Explicit deletion of a withdrawn/draft test never destroys a private media
# original, even if its media are no longer publicly referenced.
expect 200 "$HOST/api/admin/tests/$T1" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.deleted == true'
expect 200 "$HOST/api/admin/tests/$T2" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.deleted == true'
test -f "$TEMP/private-storage/media-files/$IMAGE_NAME"
test -f "$TEMP/private-storage/media-files/$MOVIE_NAME"
expect 404 "$HOST/api/admin/tests/$T1"
expect 404 "$HOST/api/admin/tests/$T2"
# The earlier incomplete publication fixture remains a separate draft in
# the same lesson; the group may be deleted only once it is removed too.
expect 409 "$HOST/api/admin/groups/$GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.error.code == "GROUP_NOT_EMPTY"'
expect 200 "$HOST/api/admin/tests/$INCOMPLETE_ID" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.deleted == true'
expect 200 "$HOST/api/admin/groups/$GROUP" -X DELETE -H "X-CSRF-Token: $CSRF"
check '.deleted == true'


echo "PASS: atomic publication, minimal anonymous lesson catalog, static media, shared references and withdrawal"
