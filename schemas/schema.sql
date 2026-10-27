-- SnagChat canonical schema blueprint.
-- The runtime applies the same statements from lib/schema.ts (Workers cannot
-- read files at runtime); schemas/snag_model.py exposes this file to Python
-- tooling and can diff a live database against it with `--check`.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '😎',
  hue           INTEGER NOT NULL DEFAULT 48,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
  user_id    TEXT NOT NULL,
  friend_id  TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

-- SNAGS: the single media unit. `stream` decides routing ('dm' | 'flash').
-- Permanence is expressed by saved / vault_count / is_ephemeral, never by a
-- separate table, so a snag can move between states without losing identity.
CREATE TABLE IF NOT EXISTS snaps (
  id              TEXT PRIMARY KEY,
  sender_id       TEXT NOT NULL,
  recipient_id    TEXT,                    -- NULL for flash entries
  is_story        INTEGER NOT NULL DEFAULT 0,
  stream          TEXT NOT NULL DEFAULT 'dm',
  r2_key          TEXT NOT NULL,
  media_type      TEXT NOT NULL,
  caption         TEXT,
  duration        INTEGER NOT NULL DEFAULT 3,
  created_at      INTEGER NOT NULL,
  viewed_at       INTEGER,
  deleted_at      INTEGER,
  is_ephemeral    INTEGER NOT NULL DEFAULT 1,
  saved           INTEGER NOT NULL DEFAULT 0,   -- "Save in chat" override
  saved_at        INTEGER,
  expires_at      INTEGER,                      -- created_at + 24h
  palette         TEXT,                         -- JSON array of #rrggbb
  dominant_hue    INTEGER,                      -- 0-359, colourway index
  tags            TEXT,                         -- JSON array
  layout          TEXT,                         -- JSON { overlay, pins[] }
  parent_snag_id  TEXT,                         -- re-snag lineage
  content_hash    TEXT,                         -- sha256[:32] of the bytes
  vault_count     INTEGER NOT NULL DEFAULT 0    -- active vault anchors
);

CREATE TABLE IF NOT EXISTS snap_views (
  snap_id   TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (snap_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id       TEXT NOT NULL,
  recipient_id    TEXT NOT NULL,
  kind            TEXT NOT NULL,          -- 'text' | 'snap'
  body            TEXT,
  snap_id         TEXT,
  created_at      INTEGER NOT NULL,
  is_ephemeral    INTEGER NOT NULL DEFAULT 1,
  saved           INTEGER NOT NULL DEFAULT 0,
  saved_at        INTEGER,
  expires_at      INTEGER
);

-- VAULTS: immutable registries. Entries are the anchors that outlive the TTL.
CREATE TABLE IF NOT EXISTS vaults (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL,
  title          TEXT NOT NULL,
  slug           TEXT NOT NULL,
  cover_snag_id  TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  is_public      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (owner_id, slug)
);

CREATE TABLE IF NOT EXISTS vault_entries (
  vault_id TEXT NOT NULL,
  snag_id  TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  note     TEXT,
  PRIMARY KEY (vault_id, snag_id)
);

CREATE INDEX IF NOT EXISTS snaps_recipient_idx    ON snaps (recipient_id, viewed_at);
CREATE INDEX IF NOT EXISTS snaps_key_idx          ON snaps (r2_key);
CREATE INDEX IF NOT EXISTS snaps_stream_idx       ON snaps (stream, created_at);
CREATE INDEX IF NOT EXISTS snaps_expiry_idx       ON snaps (expires_at);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_expiry_idx    ON messages (expires_at);
CREATE INDEX IF NOT EXISTS vault_entries_snag_idx ON vault_entries (snag_id);
CREATE INDEX IF NOT EXISTS vaults_owner_idx       ON vaults (owner_id);
