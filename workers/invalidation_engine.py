"""SnagChat invalidation engine.

Every snag is born ephemeral and expires 24 hours after creation. The engine
promotes anchored snags to permanent, then purges everything else from every
stream and deletes its bytes. It is deterministic: given a database and a
clock, the same rows always disappear.

The deployed runtime runs this logic in the Worker (lib/invalidation.ts) on a
lazy, throttled sweep, because Workers cannot take cron triggers through the
Sites deploy manifest. This module is the same algorithm as an ops job: it runs
against a SQLite database (a local D1 state file or an export) and can delete
media from a mirror of the R2 bucket.

Usage:
    python -m workers.invalidation_engine --db d1.sqlite --dry-run
    python -m workers.invalidation_engine --db d1.sqlite --media-root ./r2 --json
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from schemas.snag_model import CHAT_TTL_MS, VIEW_GRACE_MS, open_db

CANDIDATE_SQL = """
SELECT DISTINCT s.r2_key AS r2_key
  FROM snaps s
 WHERE s.deleted_at IS NULL
   AND s.is_ephemeral = 1
   AND s.saved = 0
   AND s.vault_count = 0
   AND (
     (s.expires_at IS NOT NULL AND s.expires_at <= ?)
     OR (s.stream = 'dm' AND s.viewed_at IS NOT NULL AND s.viewed_at <= ?)
   )
   AND NOT EXISTS (
     SELECT 1
       FROM snaps keep
      WHERE keep.r2_key = s.r2_key
        AND keep.deleted_at IS NULL
        AND (
          keep.is_ephemeral = 0
          OR keep.saved = 1
          OR keep.vault_count > 0
          OR (keep.expires_at IS NULL OR keep.expires_at > ?)
        )
   )
 LIMIT ?
"""

PURGE_ROWS_SQL = """
UPDATE snaps
   SET deleted_at = ?
 WHERE r2_key = ?
   AND deleted_at IS NULL
   AND is_ephemeral = 1
   AND saved = 0
   AND vault_count = 0
"""


@dataclass
class SweepReport:
    anchored: int = 0
    purged_snaps: int = 0
    purged_objects: int = 0
    purged_messages: int = 0
    dry_run: bool = False
    keys: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "dryRun": self.dry_run,
            "anchored": self.anchored,
            "purgedSnaps": self.purged_snaps,
            "purgedObjects": self.purged_objects,
            "purgedMessages": self.purged_messages,
            "keys": self.keys,
        }


def anchor_snags(conn: sqlite3.Connection) -> int:
    """Promote saved / vaulted snags to permanent. Anchors always win."""
    cursor = conn.execute(
        """
        UPDATE snaps
           SET is_ephemeral = 0, expires_at = NULL
         WHERE is_ephemeral = 1
           AND (saved = 1 OR vault_count > 0)
        """
    )
    conn.execute(
        """
        UPDATE messages
           SET is_ephemeral = 0, expires_at = NULL
         WHERE is_ephemeral = 1 AND saved = 1
        """
    )
    return cursor.rowcount or 0


def find_candidates(conn: sqlite3.Connection, now_ms: int, limit: int = 100) -> list[str]:
    grace = now_ms - VIEW_GRACE_MS
    # expires deadline, view-once deadline, "another live row still needs it", limit
    rows = conn.execute(CANDIDATE_SQL, (now_ms, grace, now_ms, limit)).fetchall()
    return [row["r2_key"] for row in rows]


def delete_object(key: str, media_root: Path | None) -> bool:
    """Delete media from a local mirror of the R2 bucket, when one is given."""
    if media_root is None:
        return False
    target = media_root / key
    try:
        target.unlink()
        return True
    except FileNotFoundError:
        return False
    except OSError as error:  # pragma: no cover - filesystem specific
        print(f"warning: could not delete {target}: {error}", file=sys.stderr)
        return False


def purge_messages(conn: sqlite3.Connection, now_ms: int) -> int:
    """Unsaved chat text past its TTL simply ceases to exist."""
    cursor = conn.execute(
        "DELETE FROM messages WHERE saved = 0 AND expires_at IS NOT NULL AND expires_at <= ?",
        (now_ms,),
    )
    return cursor.rowcount or 0


def sweep(
    conn: sqlite3.Connection,
    *,
    now_ms: int | None = None,
    media_root: Path | None = None,
    dry_run: bool = False,
    limit: int = 100,
) -> SweepReport:
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    report = SweepReport(dry_run=dry_run)

    report.anchored = anchor_snags(conn)
    keys = find_candidates(conn, now, limit=limit)
    report.keys = keys

    for key in keys:
        if not dry_run:
            deleted = delete_object(key, media_root)
            report.purged_objects += 1 if deleted else 0
            cursor = conn.execute(PURGE_ROWS_SQL, (now, key))
            report.purged_snaps += cursor.rowcount or 0
        else:
            rows = conn.execute(
                "SELECT COUNT(*) AS n FROM snaps WHERE r2_key = ? AND deleted_at IS NULL", (key,)
            ).fetchone()
            report.purged_snaps += int(rows["n"]) if rows else 0

    if not dry_run:
        report.purged_messages = purge_messages(conn, now)
        conn.commit()
    else:
        report.purged_messages = int(
            conn.execute(
                "SELECT COUNT(*) AS n FROM messages WHERE saved = 0 AND expires_at IS NOT NULL AND expires_at <= ?",
                (now,),
            ).fetchone()["n"]
        )

    return report


def describe(conn: sqlite3.Connection, now_ms: int | None = None) -> dict[str, int]:
    """Counters used by the CLI and by ops dashboards."""
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    def scalar(sql: str, params: tuple[Any, ...] = ()) -> int:
        row = conn.execute(sql, params).fetchone()
        return int(row[0]) if row else 0

    return {
        "live": scalar("SELECT COUNT(*) FROM snaps WHERE deleted_at IS NULL"),
        "anchored": scalar(
            "SELECT COUNT(*) FROM snaps WHERE deleted_at IS NULL AND (is_ephemeral = 0 OR saved = 1 OR vault_count > 0)"
        ),
        "expired": scalar(
            "SELECT COUNT(*) FROM snaps WHERE deleted_at IS NULL AND is_ephemeral = 1 AND expires_at IS NOT NULL AND expires_at <= ?",
            (now,),
        ),
        "deleted": scalar("SELECT COUNT(*) FROM snaps WHERE deleted_at IS NOT NULL"),
        "ephemeral_messages": scalar("SELECT COUNT(*) FROM messages WHERE saved = 0"),
        "saved_messages": scalar("SELECT COUNT(*) FROM messages WHERE saved = 1"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the SnagChat 24-hour invalidation sweep")
    parser.add_argument("--db", required=True, help="path to a SQLite/D1 state database")
    parser.add_argument("--media-root", help="optional directory mirroring the R2 bucket (files deleted in place)")
    parser.add_argument("--now", type=int, help="override the clock in epoch milliseconds")
    parser.add_argument("--limit", type=int, default=100, help="max objects to purge per run")
    parser.add_argument("--dry-run", action="store_true", help="report what would be purged, change nothing")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--stats", action="store_true", help="print counters instead of sweeping")
    args = parser.parse_args(argv)

    conn = open_db(args.db)
    now = args.now if args.now is not None else int(time.time() * 1000)

    if args.stats:
        stats = describe(conn, now)
        print(json.dumps(stats, indent=2) if args.json else "\n".join(f"{k}: {v}" for k, v in stats.items()))
        return 0

    report = sweep(
        conn,
        now_ms=now,
        media_root=Path(args.media_root) if args.media_root else None,
        dry_run=args.dry_run,
        limit=args.limit,
    )

    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        mode = "dry run" if report.dry_run else "sweep"
        print(f"[{mode}] anchored={report.anchored} purged_snaps={report.purged_snaps} "
              f"objects={report.purged_objects} messages={report.purged_messages}")
        for key in report.keys:
            print(f"  - {key}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
