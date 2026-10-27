/**
 * Bump whenever TABLES / COLUMNS / INDEXES change: ensureSchema re-runs inside
 * a warm isolate only when this differs from the version it applied last.
 */
export const SCHEMA_VERSION = 2

/**
 * Canonical SnagChat schema. `snaps` is the single media unit for both the
 * ephemeral Flash Stream and direct messages; permanence is expressed by
 * `saved` / `vault_count`, never by a second table.
 */

export const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '·',
    hue INTEGER NOT NULL DEFAULT 48,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS friends (
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  )`,
  `CREATE TABLE IF NOT EXISTS snaps (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_id TEXT,
    is_story INTEGER NOT NULL DEFAULT 0,
    stream TEXT NOT NULL DEFAULT 'dm',
    r2_key TEXT NOT NULL,
    media_type TEXT NOT NULL,
    caption TEXT,
    duration INTEGER NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL,
    viewed_at INTEGER,
    deleted_at INTEGER,
    is_ephemeral INTEGER NOT NULL DEFAULT 1,
    saved INTEGER NOT NULL DEFAULT 0,
    saved_at INTEGER,
    expires_at INTEGER,
    palette TEXT,
    dominant_hue INTEGER,
    tags TEXT,
    layout TEXT,
    parent_snag_id TEXT,
    content_hash TEXT,
    vault_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS snap_views (
    snap_id TEXT NOT NULL,
    viewer_id TEXT NOT NULL,
    viewed_at INTEGER NOT NULL,
    PRIMARY KEY (snap_id, viewer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT,
    snap_id TEXT,
    created_at INTEGER NOT NULL,
    is_ephemeral INTEGER NOT NULL DEFAULT 1,
    saved INTEGER NOT NULL DEFAULT 0,
    saved_at INTEGER,
    expires_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    cover_snag_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 0,
    UNIQUE (owner_id, slug)
  )`,
  `CREATE TABLE IF NOT EXISTS vault_entries (
    vault_id TEXT NOT NULL,
    snag_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    PRIMARY KEY (vault_id, snag_id)
  )`,
  // Email + password accounts. Only the hash of a session or reset token is
  // stored, so a database leak cannot be replayed as a live login.
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS auth_throttle (
    bucket TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL
  )`,
  // Developer API keys. Only the SHA-256 of the key is stored; the plaintext
  // is shown once at creation and never again.
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    request_count INTEGER NOT NULL DEFAULT 0,
    revoked_at INTEGER
  )`,
]

/** Columns added after the first release; applied with ALTER TABLE when missing. */
export const COLUMNS: ReadonlyArray<{ table: string; column: string; ddl: string }> = [
  { table: 'snaps', column: 'stream', ddl: "TEXT NOT NULL DEFAULT 'dm'" },
  { table: 'snaps', column: 'is_ephemeral', ddl: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'snaps', column: 'saved', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'snaps', column: 'saved_at', ddl: 'INTEGER' },
  { table: 'snaps', column: 'expires_at', ddl: 'INTEGER' },
  { table: 'snaps', column: 'palette', ddl: 'TEXT' },
  { table: 'snaps', column: 'dominant_hue', ddl: 'INTEGER' },
  { table: 'snaps', column: 'tags', ddl: 'TEXT' },
  { table: 'snaps', column: 'layout', ddl: 'TEXT' },
  { table: 'snaps', column: 'parent_snag_id', ddl: 'TEXT' },
  { table: 'snaps', column: 'content_hash', ddl: 'TEXT' },
  { table: 'snaps', column: 'vault_count', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'messages', column: 'is_ephemeral', ddl: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'messages', column: 'saved', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'messages', column: 'saved_at', ddl: 'INTEGER' },
  { table: 'messages', column: 'expires_at', ddl: 'INTEGER' },
  { table: 'users', column: 'email', ddl: 'TEXT' },
  { table: 'users', column: 'password_hash', ddl: 'TEXT' },
  { table: 'users', column: 'password_updated_at', ddl: 'INTEGER' },
]

export const INDEXES = [
  `CREATE INDEX IF NOT EXISTS snaps_recipient_idx ON snaps (recipient_id, viewed_at)`,
  `CREATE INDEX IF NOT EXISTS snaps_key_idx ON snaps (r2_key)`,
  `CREATE INDEX IF NOT EXISTS snaps_story_idx ON snaps (is_story, created_at)`,
  `CREATE INDEX IF NOT EXISTS snaps_stream_idx ON snaps (stream, created_at)`,
  `CREATE INDEX IF NOT EXISTS snaps_expiry_idx ON snaps (expires_at)`,
  `CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS messages_expiry_idx ON messages (expires_at)`,
  `CREATE INDEX IF NOT EXISTS vault_entries_snag_idx ON vault_entries (snag_id)`,
  `CREATE INDEX IF NOT EXISTS vaults_owner_idx ON vaults (owner_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email)`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions (expires_at)`,
  `CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id, kind)`,
  `CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens (expires_at)`,
  `CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id)`,
]

/** Lifecycle constants, shared by the runtime sweep and the ops worker. */
export const FLASH_TTL_MS = 24 * 60 * 60 * 1000
export const DM_SNAP_TTL_MS = 24 * 60 * 60 * 1000
export const CHAT_TTL_MS = 6 * 60 * 60 * 1000
export const VIEW_GRACE_MS = 15_000
