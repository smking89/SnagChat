#!/usr/bin/env bash
# Verifies the dual state: ephemeral flash, save-in-chat pinning, vault anchoring,
# and the 24-hour invalidation sweep (including the anchored bypass).
#
# Usage: bash scripts/check-dual-state.sh [base-url]
set -euo pipefail

B="${1:-http://127.0.0.1:3000}"
JAR=/tmp/snag-dual.jar
rm -f "$JAR"

DB=$(python3 - <<'PY'
import glob, sqlite3
for path in glob.glob('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite'):
    try:
        con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        names = {row[0] for row in con.execute("select name from sqlite_master where type='table'")}
        if 'snaps' in names:
            print(path)
            break
    except sqlite3.Error:
        continue
PY
)
[ -n "$DB" ] || { echo "could not find the local D1 database"; exit 1; }

sql() {
  python3 - "$DB" "$1" <<'PY'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1], timeout=25)
con.execute('PRAGMA busy_timeout=25000')
for statement in sys.argv[2].split(';'):
    if statement.strip():
        con.execute(statement)
con.commit()
print('\n'.join(str(row) for row in con.execute('SELECT 1')) if False else '')
con.close()
PY
}

scalar() {
  python3 - "$DB" "$1" <<'PY'
import sqlite3, sys
con = sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True)
row = con.execute(sys.argv[2]).fetchone()
print(row[0] if row else '')
con.close()
PY
}

backdate() {
  python3 - "$DB" "$1" <<'PY'
import sqlite3, sys, time
con = sqlite3.connect(sys.argv[1], timeout=25)
con.execute('PRAGMA busy_timeout=25000')
con.execute('UPDATE snaps SET expires_at = ? WHERE id = ?', (int(time.time() * 1000) - 60_000, sys.argv[2]))
con.commit()
con.close()
PY
}

json() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

echo "→ demo session"
curl -s -c "$JAR" -X POST -H "Origin: $B" "$B/api/demo" > /dev/null
NAME=$(curl -s -b "$JAR" "$B/api/me" | json "['user']['username']")
echo "  @$NAME"

echo
echo "→ save-in-chat: pin an incoming snag"
PEER=$(curl -s -b "$JAR" "$B/api/chats" | json "['chats'][1]['peer']['id']")
THREAD=$(curl -s -b "$JAR" "$B/api/chats/$PEER")
SNAP=$(echo "$THREAD" | python3 -c "
import sys, json
thread = json.load(sys.stdin)['thread']
snaps = [m for m in thread['messages'] if m['kind'] == 'snap' and not m['fromMe']]
print(snaps[0]['snapId'] if snaps else '')
")
echo "  snap: $SNAP"
curl -s -b "$JAR" -X POST -H "Origin: $B" -H 'Content-Type: application/json' \
  -d '{"saved":true}' "$B/api/snaps/$SNAP/save"; echo
echo "  drawer size: $(curl -s -b "$JAR" "$B/api/chats/$PEER" | json "['thread']['drawer'].__len__()")"
echo "  snap row saved/ephemeral/vault: $(scalar "SELECT saved || '/' || is_ephemeral || '/' || vault_count FROM snaps WHERE id = '$SNAP'")"

echo
echo "→ view the pinned snag, then close it: bytes must survive"
curl -s -o /dev/null -w '  media %{http_code}\n' -b "$JAR" "$B/api/snaps/$SNAP/media"
curl -s -b "$JAR" -X POST -H "Origin: $B" "$B/api/snaps/$SNAP/seen"; echo
curl -s -o /dev/null -w '  media after close %{http_code}\n' -b "$JAR" "$B/api/snaps/$SNAP/media"
echo "  deleted_at: '$(scalar "SELECT COALESCE(deleted_at,'') FROM snaps WHERE id = '$SNAP'")'"

echo
echo "→ vault anchoring"
VAULT=$(curl -s -b "$JAR" -X POST -H "Origin: $B" -H 'Content-Type: application/json' \
  -d '{"title":"Test Anchor"}' "$B/api/vaults" | json "['vault']['id']")
curl -s -b "$JAR" -X POST -H "Origin: $B" -H 'Content-Type: application/json' \
  -d "{\"snagId\":\"$SNAP\"}" "$B/api/vaults/$VAULT/snags"; echo
echo "  board items: $(curl -s -b "$JAR" "$B/api/vaults/$VAULT" | json "['items'].__len__()")"
echo "  vault_count now: $(scalar "SELECT vault_count FROM snaps WHERE id = '$SNAP'")"

echo
echo "→ 24h sweep: an unanchored flash entry must vanish, an anchored one must not"
FLASH=$(curl -s -b "$JAR" -H "Origin: $B" -F "media=@/tmp/snag.png;type=image/png" \
  -F "caption=sweep me" -F "duration=5" -F "story=true" "$B/api/snaps" | json "['ids'][0]")
echo "  created flash snag: $FLASH"
backdate "$FLASH"
echo "  coalesce before sweep: '$(scalar "SELECT COALESCE(deleted_at,'') FROM snaps WHERE id = '$FLASH'")'"
sleep 21  # the runtime sweep is throttled to once every 20s per isolate
curl -s -b "$JAR" "$B/api/flash?scope=discover" > /dev/null
echo "  after sweep deleted_at: '$(scalar "SELECT COALESCE(deleted_at,'') FROM snaps WHERE id = '$FLASH'")'"
curl -s -o /dev/null -w '  media %{http_code} (expect 410)\n' -b "$JAR" "$B/api/snaps/$FLASH/media"

backdate "$SNAP"
sql "UPDATE snaps SET is_ephemeral = 1 WHERE id = '$SNAP'"
sleep 21
curl -s -b "$JAR" "$B/api/flash?scope=discover" > /dev/null
echo "  anchored snag state after sweep: $(scalar "SELECT is_ephemeral || '/' || vault_count || '/' || COALESCE(deleted_at,'alive') FROM snaps WHERE id = '$SNAP'") (expect 0/1/alive)"

echo
echo "→ remove the anchor while still pinned in chat"
curl -s -b "$JAR" -X DELETE -H "Origin: $B" "$B/api/vaults/$VAULT/snags?snagId=$SNAP" > /dev/null
echo "  after anchor removal: $(scalar "SELECT is_ephemeral || '/' || vault_count || '/' || saved FROM snaps WHERE id = '$SNAP'") (expect 0/0/1 — still pinned)"

echo
echo "→ unpin: now nothing anchors it, so it returns to the ephemeral lifecycle"
curl -s -b "$JAR" -X POST -H "Origin: $B" -H 'Content-Type: application/json' -d '{"saved":false}' "$B/api/snaps/$SNAP/save"; echo
echo "  after unpin: $(scalar "SELECT is_ephemeral || '/' || vault_count || '/' || saved FROM snaps WHERE id = '$SNAP'") (expect 1/0/0)"
curl -s -b "$JAR" -X DELETE -H "Origin: $B" "$B/api/vaults/$VAULT" > /dev/null
echo "  board deleted: $(scalar "SELECT COUNT(*) FROM vaults WHERE id = '$VAULT'")"
echo
echo "done"
