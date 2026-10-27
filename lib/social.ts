import { conversationId, getEnv, toPublicUser, type UserRow } from './db'
import { CHAT_TTL_MS } from './schema'
import type {
  ChatPreview,
  DrawerItem,
  FlashItem,
  PublicUser,
  SnagLayout,
  Thread,
  ThreadMessage,
} from './types'

export type { ChatPreview, PublicUser, Thread, ThreadMessage } from './types'

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export async function listFriends(userId: string): Promise<PublicUser[]> {
  const { DB } = await getEnv()
  const result = await DB.prepare(
    `SELECT u.* FROM friends f JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ? ORDER BY u.display_name COLLATE NOCASE ASC`
  )
    .bind(userId)
    .all<UserRow>()
  return (result.results ?? []).map(toPublicUser)
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const { DB } = await getEnv()
  const row = await DB.prepare(`SELECT 1 AS ok FROM friends WHERE user_id = ? AND friend_id = ?`)
    .bind(a, b)
    .first<{ ok: number }>()
  return Boolean(row)
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function streakFromDays(days: Set<string>): number {
  if (days.size === 0) return 0
  const cursor = new Date()
  let streak = 0
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    if (!days.has(dayKey(cursor.getTime()))) return 0
  }
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

export async function listChats(userId: string): Promise<ChatPreview[]> {
  const { DB } = await getEnv()
  const friends = await listFriends(userId)
  if (friends.length === 0) return []

  const [latest, unread, saved, dayRows] = await Promise.all([
    DB.prepare(
      `SELECT m.conversation_id, m.sender_id, m.kind, m.body, m.created_at, m.saved,
              (SELECT viewed_at FROM snaps WHERE snaps.id = m.snap_id) AS snap_viewed_at
         FROM messages m
         JOIN (
           SELECT conversation_id, MAX(created_at) AS newest
             FROM messages
            WHERE sender_id = ?1 OR recipient_id = ?1
            GROUP BY conversation_id
         ) latest
           ON latest.conversation_id = m.conversation_id AND latest.newest = m.created_at
        WHERE m.sender_id = ?1 OR m.recipient_id = ?1`
    )
      .bind(userId)
      .all<{
        conversation_id: string
        sender_id: string
        kind: string
        body: string | null
        created_at: number
        saved: number
        snap_viewed_at: number | null
      }>(),
    DB.prepare(
      `SELECT sender_id, COUNT(*) AS n FROM snaps
        WHERE recipient_id = ? AND stream = 'dm' AND viewed_at IS NULL AND deleted_at IS NULL
        GROUP BY sender_id`
    )
      .bind(userId)
      .all<{ sender_id: string; n: number }>(),
    DB.prepare(
      `SELECT conversation_id, SUM(CASE WHEN saved = 1 THEN 1 ELSE 0 END) AS n
         FROM messages WHERE sender_id = ? OR recipient_id = ? GROUP BY conversation_id`
    )
      .bind(userId, userId)
      .all<{ conversation_id: string; n: number }>(),
    DB.prepare(
      `SELECT conversation_id, created_at FROM messages
        WHERE (sender_id = ? OR recipient_id = ?) AND created_at > ?`
    )
      .bind(userId, userId, Date.now() - 14 * 24 * 60 * 60 * 1000)
      .all<{ conversation_id: string; created_at: number }>(),
  ])

  const latestByConversation = new Map((latest.results ?? []).map((row) => [row.conversation_id, row]))
  const unreadBySender = new Map((unread.results ?? []).map((row) => [row.sender_id, row.n]))
  const savedByConversation = new Map((saved.results ?? []).map((row) => [row.conversation_id, row.n]))
  const daysByConversation = new Map<string, Set<string>>()
  for (const row of dayRows.results ?? []) {
    const set = daysByConversation.get(row.conversation_id) ?? new Set<string>()
    set.add(dayKey(row.created_at))
    daysByConversation.set(row.conversation_id, set)
  }

  return friends
    .map((peer) => {
      const conversation = conversationId(userId, peer.id)
      const row = latestByConversation.get(conversation)
      return {
        peer,
        last: row
          ? {
              kind: row.kind,
              body: row.body,
              fromMe: row.sender_id === userId,
              createdAt: row.created_at,
              opened: row.snap_viewed_at !== null,
              saved: row.saved === 1,
            }
          : null,
        unread: unreadBySender.get(peer.id) ?? 0,
        streak: streakFromDays(daysByConversation.get(conversation) ?? new Set<string>()),
        savedCount: savedByConversation.get(conversation) ?? 0,
      }
    })
    .sort((a, b) => {
      const aTime = a.last?.createdAt ?? 0
      const bTime = b.last?.createdAt ?? 0
      if (aTime !== bTime) return bTime - aTime
      return a.peer.displayName.localeCompare(b.peer.displayName)
    })
}

export async function getDrawer(userId: string, peerId: string): Promise<DrawerItem[]> {
  const { DB } = await getEnv()
  const rows = await DB.prepare(
    `SELECT m.id AS message_id, m.sender_id, s.id AS snag_id, s.caption, s.created_at, s.palette, s.layout
       FROM messages m
       JOIN snaps s ON s.id = m.snap_id
      WHERE m.conversation_id = ? AND s.deleted_at IS NULL AND (m.saved = 1 OR s.saved = 1)
      ORDER BY s.created_at DESC
      LIMIT 60`
  )
    .bind(conversationId(userId, peerId))
    .all<{
      message_id: string
      sender_id: string
      snag_id: string
      caption: string | null
      created_at: number
      palette: string | null
      layout: string | null
    }>()

  return (rows.results ?? []).map((row) => ({
    snagId: row.snag_id,
    caption: row.caption,
    createdAt: row.created_at,
    palette: safeJson<string[]>(row.palette, []),
    layout: safeJson<SnagLayout | null>(row.layout, null),
    fromMe: row.sender_id === userId,
    messageId: row.message_id,
  }))
}

export async function getThread(userId: string, peerId: string): Promise<Thread | null> {
  const { DB } = await getEnv()
  const peer = await DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(peerId).first<UserRow>()
  if (!peer) return null
  if (!(await areFriends(userId, peerId))) return null

  const [rows, drawer] = await Promise.all([
    DB.prepare(
      `SELECT m.id, m.sender_id, m.kind, m.body, m.created_at, m.snap_id, m.saved AS message_saved,
              m.expires_at AS message_expires,
              s.viewed_at AS snap_viewed_at, s.deleted_at AS snap_deleted_at, s.duration AS snap_duration,
              s.saved AS snap_saved, s.palette AS snap_palette, s.layout AS snap_layout, s.expires_at AS snap_expires
         FROM messages m
         LEFT JOIN snaps s ON s.id = m.snap_id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at DESC
        LIMIT 150`
    )
      .bind(conversationId(userId, peerId))
      .all<{
        id: string
        sender_id: string
        kind: string
        body: string | null
        created_at: number
        snap_id: string | null
        message_saved: number
        message_expires: number | null
        snap_viewed_at: number | null
        snap_deleted_at: number | null
        snap_duration: number | null
        snap_saved: number | null
        snap_palette: string | null
        snap_layout: string | null
        snap_expires: number | null
      }>(),
    getDrawer(userId, peerId),
  ])

  const messages: ThreadMessage[] = (rows.results ?? []).reverse().map((row) => ({
    id: row.id,
    fromMe: row.sender_id === userId,
    kind: row.kind,
    body: row.body,
    createdAt: row.created_at,
    snapId: row.snap_id,
    snapOpened: row.snap_viewed_at !== null,
    snapDeleted: row.snap_deleted_at !== null,
    snapDuration: row.snap_duration ?? 3,
    saved: row.message_saved === 1 || row.snap_saved === 1,
    layout: safeJson<SnagLayout | null>(row.snap_layout, null),
    palette: safeJson<string[]>(row.snap_palette, []),
    expiresAt: row.snap_expires ?? row.message_expires ?? null,
  }))

  return { peer: toPublicUser(peer), messages, drawer }
}

/**
 * Chat text is ephemeral: it lives for CHAT_TTL_MS unless the thread is kept.
 * Shared by the app and the public API so both obey the same lifecycle.
 */
export async function sendTextMessage(
  senderId: string,
  peerId: string,
  text: string
): Promise<{ id: string; createdAt: number; expiresAt: number }> {
  const { DB } = await getEnv()
  const now = Date.now()
  const expiresAt = now + CHAT_TTL_MS
  const id = crypto.randomUUID()

  await DB.prepare(
    `INSERT INTO messages (id, conversation_id, sender_id, recipient_id, kind, body, snap_id, created_at,
                           is_ephemeral, expires_at)
     VALUES (?, ?, ?, ?, 'text', ?, NULL, ?, 1, ?)`
  )
    .bind(id, conversationId(senderId, peerId), senderId, peerId, text, now, expiresAt)
    .run()

  return { id, createdAt: now, expiresAt }
}

export type FlashScope = 'crew' | 'discover'

export async function listFlash(userId: string, scope: FlashScope, hueBucket: number | null): Promise<FlashItem[]> {
  const { DB } = await getEnv()
  const now = Date.now()
  const rows = await DB.prepare(
    `SELECT s.*, u.username, u.display_name, u.emoji, u.hue, u.is_demo, u.created_at AS u_created,
            (SELECT 1 FROM snap_views v WHERE v.snap_id = s.id AND v.viewer_id = ?1) AS seen
       FROM snaps s
       JOIN users u ON u.id = s.sender_id
      WHERE s.stream = 'flash'
        AND s.deleted_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > ?2)
        AND (
          ?3 = 'discover'
          OR s.sender_id = ?1
          OR s.sender_id IN (SELECT friend_id FROM friends WHERE user_id = ?1)
        )
        AND (
          ?4 IS NULL
          OR (s.dominant_hue IS NOT NULL AND s.dominant_hue >= ?4 - 18 AND s.dominant_hue <= ?4 + 18)
        )
      ORDER BY s.created_at DESC
      LIMIT 60`
  )
    .bind(userId, now, scope, hueBucket)
    .all<
      Record<string, unknown> & {
        id: string
        caption: string | null
        created_at: number
        expires_at: number | null
        palette: string | null
        layout: string | null
        tags: string | null
        parent_snag_id: string | null
        sender_id: string
        seen: number
        username: string
        display_name: string
        hue: number
        is_demo: number
        u_created: number
      }
    >()

  return (rows.results ?? []).map((row) => ({
    snagId: row.id,
    sender: toPublicUser({
      id: row.sender_id,
      username: row.username,
      display_name: row.display_name,
      hue: row.hue,
      is_demo: row.is_demo,
    }),
    caption: row.caption,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    palette: safeJson<string[]>(row.palette, []),
    dominantHue: (row.dominant_hue as number | null) ?? null,
    layout: safeJson<SnagLayout | null>(row.layout, null),
    tags: safeJson<string[]>(row.tags, []),
    viewed: row.seen === 1,
    mine: row.sender_id === userId,
    parentSnagId: row.parent_snag_id,
  }))
}
