#!/usr/bin/env bash
# End-to-end check of the ephemeral snap lifecycle against a running server.
# Usage: bash scripts/check-ephemeral.sh [base-url]
set -euo pipefail

B="${1:-http://127.0.0.1:3000}"
A_JAR=/tmp/snag-a.jar
B_JAR=/tmp/snag-b.jar
rm -f "$A_JAR" "$B_JAR"

json() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

echo "→ creating two demo accounts"
NAME_A=$(curl -s -c "$A_JAR" -X POST -H "Origin: $B" "$B/api/demo" | json "['user']['username']")
NAME_B=$(curl -s -c "$B_JAR" -X POST -H "Origin: $B" "$B/api/demo" | json "['user']['username']")
echo "  a=@$NAME_A  b=@$NAME_B"

echo "→ a adds b"
curl -s -b "$A_JAR" -X POST -H "Origin: $B" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$NAME_B\"}" "$B/api/friends" | head -c 120; echo

echo "→ a sends a snap to b"
python3 -c "import base64;open('/tmp/snag.png','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+Z1UAAAAASUVORK5CYII='))"
B_ID=$(curl -s -b "$A_JAR" "$B/api/friends" | TARGET="$NAME_B" python3 -c "
import os, sys, json
target = os.environ['TARGET']
print([f['id'] for f in json.load(sys.stdin)['friends'] if f['username'] == target][0])
")
SEND=$(curl -s -b "$A_JAR" -H "Origin: $B" -F "media=@/tmp/snag.png;type=image/png" \
  -F "caption=one look only" -F "duration=4" -F "recipients=$B_ID" "$B/api/snaps")
echo "  $SEND"
SNAP=$(echo "$SEND" | json "['ids'][0]")

echo "→ b has an unread snap"
curl -s -b "$B_JAR" "$B/api/chats" | python3 -c "
import sys, json
chats = json.load(sys.stdin)['chats']
print('  unread total:', sum(c['unread'] for c in chats))
"

echo "→ b opens it (status / type / bytes)"
curl -s -o /dev/null -w '  %{http_code} %{content_type} %{size_download} bytes\n' -b "$B_JAR" "$B/api/snaps/$SNAP/media"

echo "→ b closes it"
curl -s -b "$B_JAR" -X POST -H "Origin: $B" "$B/api/snaps/$SNAP/seen"; echo

echo "→ sender tries again (expect 410)"
curl -s -o /dev/null -w '  %{http_code}\n' -b "$A_JAR" "$B/api/snaps/$SNAP/media"

echo "→ recipient tries again (expect 410)"
curl -s -o /dev/null -w '  %{http_code}\n' -b "$B_JAR" "$B/api/snaps/$SNAP/media"

echo "→ third party cannot open another person's snap (expect 403/404)"
C_JAR=/tmp/snag-c.jar
curl -s -c "$C_JAR" -X POST -H "Origin: $B" "$B/api/demo" > /dev/null
curl -s -o /dev/null -w '  %{http_code}\n' -b "$C_JAR" "$B/api/snaps/$SNAP/media"

echo "→ thread state for the sender"
curl -s -b "$A_JAR" "$B/api/chats" | python3 -c "
import sys, json
for chat in json.load(sys.stdin)['chats']:
    if chat['last'] and chat['last']['kind'] == 'snap':
        print('  last snap from', chat['peer']['username'], '| fromMe:', chat['last']['fromMe'], '| opened:', chat['last']['opened'])
        break
"
echo "done"
