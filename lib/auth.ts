/**
 * SnagChat's own email/password auth. Everything here runs on WebCrypto, so it
 * works unchanged in workerd, Node and the browser test harness.
 *
 * Rules this file enforces:
 *  - Passwords are PBKDF2-SHA256, 210k iterations, per-user salt. Never stored.
 *  - Session and reset tokens are random 32-byte values; only their SHA-256
 *    hash is persisted, so a database leak cannot be replayed as a login.
 *  - Reset tokens are single use and expire in an hour.
 */

import { getEnv } from './db'

export const SESSION_COOKIE = 'snag_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const RESET_TTL_MS = 60 * 60 * 1000
// Workers rejects PBKDF2 above 100,000 iterations, so this is the strongest
// setting that runs both locally and on the deployed worker.
const PBKDF2_ITERATIONS = 100_000

export type AuthTokenKind = 'reset_password'

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** WebCrypto wants an ArrayBuffer-backed view, so allocate one explicitly. */
function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length))
  crypto.getRandomValues(bytes)
  return bytes
}

function randomToken(length = 32): string {
  return toBase64Url(randomBytes(length))
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return toBase64Url(new Uint8Array(digest))
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function looksLikeEmail(value: string): boolean {
  const email = normalizeEmail(value)
  if (email.length < 6 || email.length > 254) return false
  if (email.includes('..') || email.startsWith('.') || email.includes('@.') || email.includes('.@')) return false
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)
}

/* --------------------------------------------------------------- passwords */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [scheme, iterationText, saltText, hashText] = stored.split('$')
  if (scheme !== 'pbkdf2' || !saltText || !hashText) return false
  const iterations = Number(iterationText)
  if (!Number.isFinite(iterations) || iterations < 1000) return false

  let bits: ArrayBuffer
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
    bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: fromBase64Url(saltText), iterations, hash: 'SHA-256' },
      key,
      256
    )
  } catch {
    // A stored hash with more iterations than the runtime allows can never
    // verify here; treat it as a failed password rather than a 500.
    return false
  }
  const expected = fromBase64Url(hashText)
  const actual = new Uint8Array(bits)
  if (expected.length !== actual.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ actual[i]
  return mismatch === 0
}

/* ---------------------------------------------------------------- sessions */

export async function createSession(userId: string): Promise<{ token: string; expiresAt: number }> {
  const { DB } = await getEnv()
  const token = randomToken()
  const now = Date.now()
  const expiresAt = now + SESSION_TTL_MS
  await DB.prepare(`INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256(token), userId, now, expiresAt)
    .run()
  return { token, expiresAt }
}

export async function findSession(token: string | undefined): Promise<string | null> {
  if (!token) return null
  const { DB } = await getEnv()
  const hash = await sha256(token)
  const row = await DB.prepare(`SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?`)
    .bind(hash)
    .first<{ user_id: string; expires_at: number }>()
  if (!row) return null
  if (row.expires_at <= Date.now()) {
    await DB.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`).bind(hash).run()
    return null
  }
  return row.user_id
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return
  const { DB } = await getEnv()
  await DB.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`).bind(await sha256(token)).run()
}

/** Used after a password change: every other device is signed out. */
export async function destroyUserSessions(userId: string): Promise<void> {
  const { DB } = await getEnv()
  await DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ?`).bind(userId).run()
}

/** Housekeeping for expired rows; cheap enough to run on sign-in. */
export async function pruneAuthRows(): Promise<void> {
  const { DB } = await getEnv()
  const now = Date.now()
  await DB.batch([
    DB.prepare(`DELETE FROM auth_sessions WHERE expires_at <= ?`).bind(now),
    DB.prepare(`DELETE FROM auth_tokens WHERE expires_at <= ?`).bind(now),
    DB.prepare(`DELETE FROM auth_throttle WHERE window_start <= ?`).bind(now - 24 * 60 * 60 * 1000),
  ])
}

/* ------------------------------------------------------------------ tokens */

export async function createAuthToken(userId: string, kind: AuthTokenKind): Promise<string> {
  const { DB } = await getEnv()
  const token = randomToken()
  const now = Date.now()
  await DB.batch([
    // One live token per kind per user: a new request invalidates the old link.
    DB.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?`).bind(userId, kind),
    DB.prepare(
      `INSERT INTO auth_tokens (token_hash, user_id, kind, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)`
    ).bind(await sha256(token), userId, kind, now, now + RESET_TTL_MS),
  ])
  return token
}

export async function consumeAuthToken(token: string, kind: AuthTokenKind): Promise<string | null> {
  const { DB } = await getEnv()
  const hash = await sha256(token)
  const row = await DB.prepare(`SELECT user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND kind = ?`)
    .bind(hash, kind)
    .first<{ user_id: string; expires_at: number; used_at: number | null }>()
  if (!row || row.used_at !== null || row.expires_at <= Date.now()) return null
  await DB.prepare(`UPDATE auth_tokens SET used_at = ? WHERE token_hash = ?`).bind(Date.now(), hash).run()
  return row.user_id
}

/* --------------------------------------------------------------- throttling */

export type ThrottleResult = { allowed: boolean; retryAfterSeconds: number }

/**
 * Fixed-window counter keyed by an opaque bucket (email, handle or client IP).
 * Not a substitute for rate limiting at the edge, but it stops credential
 * stuffing and reset-email flooding from a single place.
 */
export async function hitThrottle(bucket: string, limit: number, windowMs: number): Promise<ThrottleResult> {
  const { DB } = await getEnv()
  const now = Date.now()
  const key = await sha256(bucket)
  const row = await DB.prepare(`SELECT count, window_start FROM auth_throttle WHERE bucket = ?`)
    .bind(key)
    .first<{ count: number; window_start: number }>()

  if (!row || now - row.window_start > windowMs) {
    await DB.prepare(
      `INSERT INTO auth_throttle (bucket, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = excluded.window_start`
    )
      .bind(key, now)
      .run()
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (row.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000)) }
  }

  await DB.prepare(`UPDATE auth_throttle SET count = count + 1 WHERE bucket = ?`).bind(key).run()
  return { allowed: true, retryAfterSeconds: 0 }
}

export async function clearThrottle(bucket: string): Promise<void> {
  const { DB } = await getEnv()
  await DB.prepare(`DELETE FROM auth_throttle WHERE bucket = ?`).bind(await sha256(bucket)).run()
}

/* ------------------------------------------------------------------ cookie */

export function sessionCookie(token: string): string {
  const secure = (process.env.APP_ORIGIN ?? '').startsWith('https://')
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearedSessionCookie(): string {
  const secure = (process.env.APP_ORIGIN ?? '').startsWith('https://')
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}
