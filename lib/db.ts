import { getCloudflareContext } from '@opennextjs/cloudflare'

import { COLUMNS, INDEXES, SCHEMA_VERSION, TABLES } from './schema'
import type { PublicUser } from './types'

export type Env = {
  DB: D1Database
  FILES: R2Bucket
  APP_ORIGIN?: string
  RESEND_API_KEY?: string
  MAIL_FROM?: string
}

export async function getEnv(): Promise<Env> {
  const ctx = await getCloudflareContext({ async: true })
  return ctx.env as unknown as Env
}

export type UserRow = {
  id: string
  username: string
  display_name: string
  emoji: string
  hue: number
  is_demo: number
  created_at: number
  email: string | null
  password_hash: string | null
  password_updated_at: number | null
}

export function toPublicUser(row: Pick<UserRow, 'id' | 'username' | 'display_name' | 'hue' | 'is_demo'>): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    hue: row.hue,
    isDemo: row.is_demo === 1,
  }
}

let schemaReady: { version: number; promise: Promise<void> } | null = null

async function runSchema(): Promise<void> {
  const { DB } = await getEnv()
  for (const statement of TABLES) {
    await DB.prepare(statement).run()
  }

  for (const { table, column, ddl } of COLUMNS) {
    const info = await DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
    const existing = new Set((info.results ?? []).map((row) => row.name))
    if (!existing.has(column)) {
      await DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`).run()
    }
  }

  for (const statement of INDEXES) {
    await DB.prepare(statement).run()
  }
}

/** Idempotent per schema version: creates tables, then backfills new columns. */
export async function ensureSchema(): Promise<void> {
  if (schemaReady?.version === SCHEMA_VERSION) return schemaReady.promise

  const entry: { version: number; promise: Promise<void> } = {
    version: SCHEMA_VERSION,
    promise: runSchema().catch((error) => {
      if (schemaReady === entry) schemaReady = null
      throw error
    }),
  }
  schemaReady = entry
  return entry.promise
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { DB } = await getEnv()
  return DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<UserRow>()
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { DB } = await getEnv()
  return DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<UserRow>()
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const { DB } = await getEnv()
  return DB.prepare(`SELECT * FROM users WHERE username = ?`).bind(username.toLowerCase()).first<UserRow>()
}

function slugify(value: string): string {
  const cleaned = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 14)
  const base = cleaned.length >= 3 ? cleaned : 'snagger'
  return /^[a-z]/.test(base) ? base : `snag${base}`
}

export function slugifyTitle(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
  return cleaned || 'board'
}

async function uniqueUsername(seed: string): Promise<string> {
  const base = slugify(seed)
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`
    const existing = await findUserByUsername(candidate)
    if (!existing) return candidate
  }
  return `${base}${Date.now().toString(36).slice(-5)}`
}

const HUES = [44, 12, 168, 265, 322, 205]
// Avatars are initials; the legacy avatar column keeps a neutral placeholder.
const NEUTRAL_AVATAR = '\u00b7'

export type NewUserInput = {
  id: string
  displayName: string
  emoji?: string
  hue?: number
  isDemo?: boolean
  usernameSeed?: string
  presetUsername?: string
  email?: string
  passwordHash?: string
}

export async function createUser(input: NewUserInput): Promise<UserRow> {
  const { DB } = await getEnv()
  const username = input.presetUsername ?? (await uniqueUsername(input.usernameSeed ?? input.displayName))
  const emoji = input.emoji ?? NEUTRAL_AVATAR
  const hue = input.hue ?? HUES[Math.floor(Math.random() * HUES.length)]
  const row: UserRow = {
    id: input.id,
    username,
    display_name: input.displayName,
    emoji,
    hue,
    is_demo: input.isDemo ? 1 : 0,
    created_at: Date.now(),
    email: input.email ?? null,
    password_hash: input.passwordHash ?? null,
    password_updated_at: input.passwordHash ? Date.now() : null,
  }
  await DB.prepare(
    `INSERT INTO users (id, username, display_name, emoji, hue, is_demo, created_at, email, password_hash,
                        password_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.username,
      row.display_name,
      row.emoji,
      row.hue,
      row.is_demo,
      row.created_at,
      row.email,
      row.password_hash,
      row.password_updated_at
    )
    .run()
  return row
}

export async function linkFriends(a: string, b: string): Promise<void> {
  const { DB } = await getEnv()
  const now = Date.now()
  await DB.batch([
    DB.prepare(`INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)`).bind(a, b, now),
    DB.prepare(`INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)`).bind(b, a, now),
  ])
}

export function conversationId(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}
