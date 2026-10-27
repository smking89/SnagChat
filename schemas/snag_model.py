"""SnagChat domain model.

The canonical unit of media is a *Snag*. It carries its own lifecycle: a snag
is ephemeral from birth and is only promoted to permanent when it is explicitly
saved in a chat or anchored to a vault board. Nothing else makes it permanent.

This module is the Python counterpart of lib/snaps.ts and lib/schema.ts: it
validates payloads, classifies lifecycle state and exposes the documented DDL
from schemas/schema.sql. It runs on the standard library only.

Usage:
    python -m schemas.snag_model --emit-sql
    python -m schemas.snag_model --check path/to/d1.sqlite
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping

DAY_MS = 24 * 60 * 60 * 1000
CHAT_TTL_MS = 6 * 60 * 60 * 1000
VIEW_GRACE_MS = 15 * 1000

SCHEMA_PATH = Path(__file__).with_name("schema.sql")

#: Columns each table is expected to expose; used by --check to detect drift
#: between the Python tooling and the TypeScript runtime schema.
EXPECTED_COLUMNS: dict[str, set[str]] = {
    "users": {"id", "username", "display_name", "emoji", "hue", "is_demo", "created_at"},
    "friends": {"user_id", "friend_id", "created_at"},
    "snaps": {
        "id",
        "sender_id",
        "recipient_id",
        "is_story",
        "stream",
        "r2_key",
        "media_type",
        "caption",
        "duration",
        "created_at",
        "viewed_at",
        "deleted_at",
        "is_ephemeral",
        "saved",
        "saved_at",
        "expires_at",
        "palette",
        "dominant_hue",
        "tags",
        "layout",
        "parent_snag_id",
        "content_hash",
        "vault_count",
    },
    "snap_views": {"snap_id", "viewer_id", "viewed_at"},
    "messages": {
        "id",
        "conversation_id",
        "sender_id",
        "recipient_id",
        "kind",
        "body",
        "snap_id",
        "created_at",
        "is_ephemeral",
        "saved",
        "saved_at",
        "expires_at",
    },
    "vaults": {"id", "owner_id", "title", "slug", "cover_snag_id", "created_at", "updated_at", "is_public"},
    "vault_entries": {"vault_id", "snag_id", "added_at", "position", "note"},
}

STREAMS = ("dm", "flash")
ALLOWED_MEDIA = ("image/jpeg", "image/png", "image/webp", "image/svg+xml")


class SnagValidationError(ValueError):
    """Raised when a payload cannot become a snag."""


@dataclass(frozen=True)
class SnagPin:
    """An interactive sticker pinned at normalised coordinates (0–1)."""

    x: float
    y: float
    emoji: str
    scale: float = 1.0

    def to_dict(self) -> dict[str, Any]:
        return {"x": round(self.x, 4), "y": round(self.y, 4), "emoji": self.emoji, "scale": self.scale}


@dataclass(frozen=True)
class SnagLayout:
    """Layout metadata vector: the creative layer baked over the media."""

    overlay: str = "none"
    pins: tuple[SnagPin, ...] = ()
    caption_y: float | None = None

    def to_json(self) -> str:
        payload: dict[str, Any] = {"overlay": self.overlay, "pins": [pin.to_dict() for pin in self.pins]}
        if self.caption_y is not None:
            payload["captionY"] = self.caption_y
        return json.dumps(payload, separators=(",", ":"))

    @classmethod
    def from_json(cls, raw: str | None) -> "SnagLayout":
        if not raw:
            return cls()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return cls()
        pins = []
        for entry in data.get("pins") or []:
            try:
                pins.append(
                    SnagPin(
                        x=_clamp(float(entry["x"])),
                        y=_clamp(float(entry["y"])),
                        emoji=str(entry.get("emoji", ""))[:4],
                        scale=float(entry.get("scale", 1.0)),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return cls(overlay=str(data.get("overlay", "none"))[:16], pins=tuple(pins))


@dataclass
class SnagRecord:
    """A row of `snaps`, decoded. Mirrors the runtime columns exactly."""

    id: str
    sender_id: str
    recipient_id: str | None
    stream: str
    r2_key: str
    media_type: str
    caption: str | None
    duration: int
    created_at: int
    viewed_at: int | None = None
    deleted_at: int | None = None
    is_ephemeral: int = 1
    saved: int = 0
    saved_at: int | None = None
    expires_at: int | None = None
    palette: list[str] = field(default_factory=list)
    dominant_hue: int | None = None
    tags: list[str] = field(default_factory=list)
    layout: SnagLayout = field(default_factory=SnagLayout)
    parent_snag_id: str | None = None
    content_hash: str | None = None
    vault_count: int = 0

    # -- lifecycle ---------------------------------------------------------
    @property
    def anchored(self) -> bool:
        """Anchored snags never expire, whatever their stream."""
        return self.saved == 1 or self.vault_count > 0 or self.is_ephemeral == 0

    def state(self, now_ms: int) -> str:
        """One of: deleted | anchored | expired | unopened | opened | live."""
        if self.deleted_at is not None:
            return "deleted"
        if self.anchored:
            return "anchored"
        if self.expires_at is not None and self.expires_at <= now_ms:
            return "expired"
        if self.stream == "dm":
            if self.viewed_at is None:
                return "unopened"
            return "opened"
        return "live"

    def is_purgeable(self, now_ms: int) -> bool:
        """True when the row should leave every stream *and* lose its bytes."""
        if self.deleted_at is not None or self.anchored:
            return False
        if self.expires_at is not None and self.expires_at <= now_ms:
            return True
        return (
            self.stream == "dm"
            and self.viewed_at is not None
            and self.viewed_at <= now_ms - VIEW_GRACE_MS
        )

    def to_row(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "sender_id": self.sender_id,
            "recipient_id": self.recipient_id,
            "stream": self.stream,
            "r2_key": self.r2_key,
            "media_type": self.media_type,
            "caption": self.caption,
            "duration": self.duration,
            "created_at": self.created_at,
            "viewed_at": self.viewed_at,
            "deleted_at": self.deleted_at,
            "is_ephemeral": self.is_ephemeral,
            "saved": self.saved,
            "saved_at": self.saved_at,
            "expires_at": self.expires_at,
            "palette": json.dumps(self.palette),
            "dominant_hue": self.dominant_hue,
            "tags": json.dumps(self.tags),
            "layout": self.layout.to_json(),
            "parent_snag_id": self.parent_snag_id,
            "content_hash": self.content_hash,
            "vault_count": self.vault_count,
        }

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "SnagRecord":
        return cls(
            id=row["id"],
            sender_id=row["sender_id"],
            recipient_id=row["recipient_id"],
            stream=row.get("stream") or ("flash" if row.get("is_story") else "dm"),
            r2_key=row["r2_key"],
            media_type=row["media_type"],
            caption=row["caption"],
            duration=int(row["duration"]),
            created_at=int(row["created_at"]),
            viewed_at=row["viewed_at"],
            deleted_at=row["deleted_at"],
            is_ephemeral=int(row.get("is_ephemeral", 1)),
            saved=int(row.get("saved", 0)),
            saved_at=row.get("saved_at"),
            expires_at=row.get("expires_at"),
            palette=json.loads(row.get("palette") or "[]"),
            dominant_hue=row.get("dominant_hue"),
            tags=json.loads(row.get("tags") or "[]"),
            layout=SnagLayout.from_json(row.get("layout")),
            parent_snag_id=row.get("parent_snag_id"),
            content_hash=row.get("content_hash"),
            vault_count=int(row.get("vault_count", 0)),
        )


@dataclass(frozen=True)
class VaultRecord:
    """An immutable multi-column registry that anchors snags permanently."""

    id: str
    owner_id: str
    title: str
    slug: str
    cover_snag_id: str | None = None
    created_at: int = 0
    updated_at: int = 0
    is_public: bool = False


def _clamp(value: float) -> float:
    return min(1.0, max(0.0, value))


def conversation_id(a: str, b: str) -> str:
    """Deterministic thread key: one conversation per unordered pair."""
    return f"{a}:{b}" if a < b else f"{b}:{a}"


def validate_snag(payload: Mapping[str, Any], *, now_ms: int | None = None) -> SnagRecord:
    """Normalise and validate a create-snag payload; raises on bad input."""
    now = now_ms if now_ms is not None else _now_ms()
    sender = str(payload.get("senderId") or payload.get("sender_id") or "").strip()
    if not sender:
        raise SnagValidationError("senderId is required")

    media_type = str(payload.get("mediaType") or payload.get("media_type") or "")
    if media_type not in ALLOWED_MEDIA:
        raise SnagValidationError(f"unsupported media type: {media_type!r}")

    r2_key = str(payload.get("r2Key") or payload.get("r2_key") or "").strip()
    if not r2_key:
        raise SnagValidationError("r2Key is required")

    stream = str(payload.get("stream") or "dm")
    if stream not in STREAMS:
        raise SnagValidationError(f"unknown stream: {stream!r}")

    duration = int(payload.get("duration") or 5)
    duration = min(10, max(1, duration))

    layout_raw = payload.get("layout")
    layout = layout_raw if isinstance(layout_raw, SnagLayout) else SnagLayout.from_json(
        json.dumps(layout_raw) if isinstance(layout_raw, dict) else (layout_raw if isinstance(layout_raw, str) else None)
    )

    return SnagRecord(
        id=str(payload.get("id") or ""),
        sender_id=sender,
        recipient_id=payload.get("recipientId") or payload.get("recipient_id"),
        stream=stream,
        r2_key=r2_key,
        media_type=media_type,
        caption=(str(payload["caption"])[:120] if payload.get("caption") else None),
        duration=duration,
        created_at=int(payload.get("createdAt") or payload.get("created_at") or now),
        is_ephemeral=1,
        expires_at=int(payload.get("expiresAt") or now + DAY_MS),
        palette=[c for c in (payload.get("palette") or []) if is_hex_color(c)][:5],
        dominant_hue=payload.get("dominantHue"),
        tags=list(payload.get("tags") or [])[:8],
        layout=layout,
        parent_snag_id=payload.get("parentSnagId") or payload.get("parent_snag_id"),
        content_hash=payload.get("contentHash") or payload.get("content_hash"),
    )


def is_hex_color(value: Any) -> bool:
    if not isinstance(value, str) or len(value) != 7 or not value.startswith("#"):
        return False
    return all(char in "0123456789abcdefABCDEF" for char in value[1:])


def _now_ms() -> int:
    import time

    return int(time.time() * 1000)


# -- schema helpers ---------------------------------------------------------
def canonical_sql() -> str:
    """The documented DDL blueprint."""
    return SCHEMA_PATH.read_text(encoding="utf-8")


def apply_schema(conn: sqlite3.Connection) -> None:
    """Create any missing tables/indexes (safe to run repeatedly)."""
    conn.executescript(canonical_sql())
    conn.commit()


def check_schema(conn: sqlite3.Connection) -> list[str]:
    """Return human-readable drift between EXPECTED_COLUMNS and a live DB."""
    problems: list[str] = []
    for table, expected in EXPECTED_COLUMNS.items():
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        if not rows:
            problems.append(f"missing table: {table}")
            continue
        actual = {row["name"] for row in rows} if isinstance(rows[0], sqlite3.Row) else {row[1] for row in rows}
        missing = expected - actual
        if missing:
            problems.append(f"{table}: missing columns {sorted(missing)}")
    return problems


def open_db(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def load_snags(conn: sqlite3.Connection, where: str = "", params: Iterable[Any] = ()) -> list[SnagRecord]:
    query = "SELECT * FROM snaps"
    if where:
        query += f" WHERE {where}"
    return [SnagRecord.from_row(row) for row in conn.execute(query, tuple(params))]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SnagChat domain model utilities")
    parser.add_argument("--emit-sql", action="store_true", help="print the canonical schema blueprint")
    parser.add_argument("--check", metavar="DB", help="verify a SQLite/D1 database against the blueprint")
    args = parser.parse_args(argv)

    if args.emit_sql:
        print(canonical_sql())
        return 0

    if args.check:
        conn = open_db(args.check)
        problems = check_schema(conn)
        if problems:
            for problem in problems:
                print(f"drift: {problem}", file=sys.stderr)
            return 1
        print(f"schema ok: {args.check}")
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
