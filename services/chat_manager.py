"""SnagChat chat manager: view-and-wipe, the persistence override, the drawer.

Rules enforced here:

* A direct snag is opened once. When the last recipient closes it, the bytes are
  deleted from the bucket and only a receipt row remains.
* Chat text is ephemeral on a TTL (CHAT_TTL_MS). "Save in chat" is the single
  deterministic action that makes a message or snag permanent.
* The shared media drawer only ever contains media. Text never enters it, and
  vault boards are a different surface entirely — the boundary is asserted, not
  merely documented.

This mirrors app/api/chats/* and lib/snaps.ts for ops use.

Usage:
    python -m services.chat_manager --db d1.sqlite --drawer <conversation_id>
    python -m services.chat_manager --db d1.sqlite --save <message_id>
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from schemas.snag_model import CHAT_TTL_MS, VIEW_GRACE_MS, open_db

PROTECTED_SQL = """
SELECT COUNT(*) AS n
  FROM snaps
 WHERE r2_key = ?
   AND deleted_at IS NULL
   AND (is_ephemeral = 0 OR saved = 1 OR vault_count > 0)
"""

PENDING_SQL = """
SELECT COUNT(*) AS n
  FROM snaps
 WHERE r2_key = ?
   AND deleted_at IS NULL
   AND viewed_at IS NULL
   AND is_ephemeral = 1
   AND saved = 0
   AND vault_count = 0
"""


class BoundaryViolation(RuntimeError):
    """Raised if text would ever leak into the media drawer."""


@dataclass
class ViewResult:
    message_id: str
    wiped: bool
    kept_bytes: bool
    reason: str


class ChatManager:
    def __init__(self, conn: sqlite3.Connection, media_root: Path | None = None) -> None:
        self.conn = conn
        self.media_root = media_root

    # -- reading -----------------------------------------------------------
    def open_thread(self, conversation_id: str, limit: int = 200) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT m.id, m.sender_id, m.kind, m.body, m.created_at, m.snap_id, m.saved,
                   s.deleted_at AS snap_deleted_at, s.viewed_at AS snap_viewed_at, s.expires_at AS snap_expires
              FROM messages m
              LEFT JOIN snaps s ON s.id = m.snap_id
             WHERE m.conversation_id = ?
             ORDER BY m.created_at ASC
             LIMIT ?
            """,
            (conversation_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]

    def drawer(self, conversation_id: str) -> list[dict[str, Any]]:
        """The shared media board: saved snags only, never text."""
        rows = self.conn.execute(
            """
            SELECT s.id AS snag_id, s.caption, s.created_at, s.palette, s.layout, s.sender_id
              FROM messages m
              JOIN snaps s ON s.id = m.snap_id
             WHERE m.conversation_id = ?
               AND s.deleted_at IS NULL
               AND (m.saved = 1 OR s.saved = 1)
             ORDER BY s.created_at DESC
            """,
            (conversation_id,),
        ).fetchall()
        items = [dict(row) for row in rows]
        self._assert_media_only(items)
        return items

    # -- lifecycle ---------------------------------------------------------
    def mark_viewed(self, message_id: str, viewer_id: str, now_ms: int | None = None) -> ViewResult:
        """View-and-wipe: opening a snag starts, and finishing it ends, its life."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        row = self.conn.execute(
            """
            SELECT m.id AS message_id, m.sender_id, m.recipient_id, m.snap_id, m.saved AS message_saved,
                   s.*
              FROM messages m
              LEFT JOIN snaps s ON s.id = m.snap_id
             WHERE m.id = ?
            """,
            (message_id,),
        ).fetchone()

        if row is None:
            return ViewResult(message_id, wiped=False, kept_bytes=False, reason="message not found")
        if row["snap_id"] is None:
            return ViewResult(message_id, wiped=False, kept_bytes=False, reason="not a media message")
        if row["deleted_at"] is not None:
            return ViewResult(message_id, wiped=False, kept_bytes=False, reason="already gone")
        if row["recipient_id"] != viewer_id and row["sender_id"] != viewer_id:
            return ViewResult(message_id, wiped=False, kept_bytes=False, reason="not a participant")

        if row["recipient_id"] == viewer_id and row["viewed_at"] is None:
            self.conn.execute("UPDATE snaps SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL", (now, row["id"]))
            self.conn.commit()

        if row["is_ephemeral"] == 0 or row["saved"] == 1 or row["vault_count"] > 0:
            return ViewResult(message_id, wiped=False, kept_bytes=True, reason="anchored")

        pending = self.conn.execute(PENDING_SQL, (row["r2_key"],)).fetchone()["n"]
        if pending:
            return ViewResult(message_id, wiped=False, kept_bytes=True, reason="other recipients pending")

        protected = self.conn.execute(PROTECTED_SQL, (row["r2_key"],)).fetchone()["n"]
        if protected == 0:
            self._delete_object(row["r2_key"])

        cursor = self.conn.execute(
            """
            UPDATE snaps
               SET deleted_at = ?
             WHERE r2_key = ?
               AND deleted_at IS NULL
               AND is_ephemeral = 1
               AND saved = 0
               AND vault_count = 0
            """,
            (now, row["r2_key"]),
        )
        self.conn.commit()
        return ViewResult(
            message_id,
            wiped=(cursor.rowcount or 0) > 0,
            kept_bytes=protected > 0,
            reason="last view" if protected == 0 else "bytes kept for an anchor",
        )

    def save_in_chat(self, message_id: str, saved: bool = True, now_ms: int | None = None) -> dict[str, Any]:
        """The long-press override: the only path from ephemeral to permanent."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        row = self.conn.execute("SELECT snap_id FROM messages WHERE id = ?", (message_id,)).fetchone()
        if row is None:
            return {"ok": False, "error": "message not found"}

        if saved:
            self.conn.execute(
                "UPDATE messages SET saved = 1, saved_at = ?, is_ephemeral = 0, expires_at = NULL WHERE id = ?",
                (now, message_id),
            )
            if row["snap_id"]:
                self.conn.execute(
                    """
                    UPDATE snaps
                       SET saved = 1, saved_at = ?, is_ephemeral = 0, expires_at = NULL
                     WHERE id = ?
                    """,
                    (now, row["snap_id"]),
                )
        else:
            self.conn.execute(
                """
                UPDATE messages
                   SET saved = 0, saved_at = NULL, is_ephemeral = 1,
                       expires_at = COALESCE(expires_at, created_at + ?)
                 WHERE id = ?
                """,
                (CHAT_TTL_MS, message_id),
            )
            if row["snap_id"]:
                self.conn.execute(
                    """
                    UPDATE snaps
                       SET saved = 0, saved_at = NULL,
                           is_ephemeral = CASE WHEN vault_count > 0 THEN 0 ELSE 1 END,
                           expires_at = CASE WHEN vault_count > 0 THEN NULL
                                             ELSE COALESCE(expires_at, created_at + ?) END
                     WHERE id = ?
                    """,
                    (CHAT_TTL_MS, row["snap_id"]),
                )
        self.conn.commit()
        return {"ok": True, "saved": saved, "messageId": message_id, "snapId": row["snap_id"]}

    def wipe_expired(self, now_ms: int | None = None) -> int:
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        cursor = self.conn.execute(
            "DELETE FROM messages WHERE saved = 0 AND expires_at IS NOT NULL AND expires_at <= ?",
            (now,),
        )
        self.conn.commit()
        return cursor.rowcount or 0

    # -- internals ---------------------------------------------------------
    def _assert_media_only(self, items: list[dict[str, Any]]) -> None:
        for item in items:
            if not item.get("snag_id"):
                raise BoundaryViolation("the media drawer may not contain text messages")

    def _delete_object(self, key: str) -> None:
        if self.media_root is None:
            return
        target = self.media_root / key
        try:
            target.unlink()
        except FileNotFoundError:
            return


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SnagChat chat manager")
    parser.add_argument("--db", required=True)
    parser.add_argument("--conversation", help="print a thread")
    parser.add_argument("--drawer", help="print the shared media drawer for a conversation")
    parser.add_argument("--save", metavar="MESSAGE_ID", help="save a message in chat")
    parser.add_argument("--unsave", metavar="MESSAGE_ID", help="make a saved message ephemeral again")
    parser.add_argument("--open", metavar="MESSAGE_ID", help="simulate a view-and-wipe")
    parser.add_argument("--viewer", help="viewer id for --open")
    parser.add_argument("--wipe", action="store_true", help="delete unsaved expired chat text")
    parser.add_argument("--media-root", help="optional R2 mirror for byte deletion")
    args = parser.parse_args(argv)

    manager = ChatManager(open_db(args.db), Path(args.media_root) if args.media_root else None)

    if args.conversation:
        print(json.dumps(manager.open_thread(args.conversation), indent=2))
    if args.drawer:
        print(json.dumps(manager.drawer(args.drawer), indent=2))
    if args.save:
        print(json.dumps(manager.save_in_chat(args.save, True)))
    if args.unsave:
        print(json.dumps(manager.save_in_chat(args.unsave, False)))
    if args.open:
        if not args.viewer:
            parser.error("--open requires --viewer")
        print(json.dumps(manager.mark_viewed(args.open, args.viewer).__dict__))
    if args.wipe:
        print(json.dumps({"purgedMessages": manager.wipe_expired()}))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
