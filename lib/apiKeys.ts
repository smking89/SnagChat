/**
 * Developer API keys.
 *
 * A key looks like `snag_live_<43 chars>`. The database stores only its
 * SHA-256, plus a short prefix so a human can tell two keys apart. The
 * plaintext is returned once, at creation, and is never recoverable.
 *
 * Every key is scoped to the account that created it: the v1 endpoints read
 * that user's own data and nothing else.
 */

import { getEnv } from './db'
import { hitThrottle, sha256 } from './auth'
import type { PublicUser } from './types'

export const KEY_PREFIX = 'snag_live_'
export const RATE_LIMIT_REQUESTS = 120
export const RATE_LIMIT_WINDOW_MS = 60_000

export type ApiKeyRow = {
  id: string
  user_id: string
  name: string
  prefix: string
  created_at: number
  last_used_at: number | null
  request_count: number
  revoked_at: number | null
}

export type ApiKeySummary = {
  id: string
  name: string
  prefix: string
  createdAt: number
  lastUsedAt: number | null
  requestCount: number
  revokedAt: number | null
}

export function toKeySummary(row: ApiKeyRow): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    requestCount: row.request_count,
    revokedAt: row.revoked_at,
  }
}

function randomKey(): string {
  const bytes = new Uint8Array(new ArrayBuffer(32))
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `${KEY_PREFIX}${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

export async function createApiKey(userId: string, name: string): Promise<{ key: string; summary: ApiKeySummary }> {
  const { DB } = await getEnv()
  const plaintext = randomKey()
  const id = `key_${crypto.randomUUID()}`
  const now = Date.now()
  const row: ApiKeyRow = {
    id,
    user_id: userId,
    name: name.slice(0, 40),
    // Enough to identify the key in a list without being useful to an attacker.
    prefix: plaintext.slice(0, KEY_PREFIX.length + 6),
    created_at: now,
    last_used_at: null,
    request_count: 0,
    revoked_at: null,
  }
  await DB.prepare(
    `INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at, last_used_at, request_count, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL)`
  )
    .bind(row.id, row.user_id, row.name, row.prefix, await sha256(plaintext), now)
    .run()
  return { key: plaintext, summary: toKeySummary(row) }
}

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  const { DB } = await getEnv()
  const result = await DB.prepare(`SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all<ApiKeyRow>()
  return (result.results ?? []).map(toKeySummary)
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const { DB } = await getEnv()
  const result = await DB.prepare(
    `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
  )
    .bind(Date.now(), keyId, userId)
    .run()
  return Number(result.meta?.changes ?? 0) > 0
}

function readBearer(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (match) return match[1].trim()
  }
  // Also accept the key as a header for tools that find Bearer awkward.
  const direct = request.headers.get('x-api-key')
  return direct ? direct.trim() : null
}

export type ApiAuth =
  | { ok: true; user: PublicUser; keyId: string; remaining: number }
  | { ok: false; response: Response }

export function apiError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

/**
 * Authenticates a v1 request: valid, unrevoked key, under the per-key rate
 * limit. Never echoes the key in an error.
 */
/**
 * Writes get their own, tighter budget: an upload carries up to 8MB of media,
 * so a key that reads in a loop is cheap but a key that writes in a loop is not.
 */
export const WRITE_LIMIT_REQUESTS = 30

export async function checkWriteBudget(keyId: string): Promise<Response | null> {
  const limit = await hitThrottle(`api-write:${keyId}`, WRITE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS)
  if (limit.allowed) return null
  return apiError(429, 'write_rate_limited', `Writes are limited to ${WRITE_LIMIT_REQUESTS} per minute per key.`, {
    'Retry-After': String(limit.retryAfterSeconds),
  })
}

export async function authenticateApiRequest(request: Request): Promise<ApiAuth> {
  const presented = readBearer(request)
  if (!presented || !presented.startsWith(KEY_PREFIX)) {
    return {
      ok: false,
      response: apiError(401, 'missing_key', 'Send an API key as: Authorization: Bearer snag_live_…'),
    }
  }

  const { DB } = await getEnv()
  const hash = await sha256(presented)
  const row = await DB.prepare(
    `SELECT k.id AS key_id, k.revoked_at, u.id, u.username, u.display_name, u.hue, u.is_demo
       FROM api_keys k JOIN users u ON u.id = k.user_id
      WHERE k.key_hash = ?`
  )
    .bind(hash)
    .first<{
      key_id: string
      revoked_at: number | null
      id: string
      username: string
      display_name: string
      hue: number
      is_demo: number
    }>()

  if (!row || row.revoked_at !== null) {
    return { ok: false, response: apiError(401, 'invalid_key', 'That API key is not valid or has been revoked.') }
  }

  const limit = await hitThrottle(`api:${row.key_id}`, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS)
  if (!limit.allowed) {
    return {
      ok: false,
      response: apiError(429, 'rate_limited', `Limit is ${RATE_LIMIT_REQUESTS} requests per minute.`, {
        'Retry-After': String(limit.retryAfterSeconds),
      }),
    }
  }

  await DB.prepare(`UPDATE api_keys SET last_used_at = ?, request_count = request_count + 1 WHERE id = ?`)
    .bind(Date.now(), row.key_id)
    .run()

  return {
    ok: true,
    keyId: row.key_id,
    remaining: Math.max(0, RATE_LIMIT_REQUESTS - 1),
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      hue: row.hue,
      isDemo: row.is_demo === 1,
    },
  }
}

export function apiJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-RateLimit-Limit': String(RATE_LIMIT_REQUESTS),
      'X-RateLimit-Window': String(RATE_LIMIT_WINDOW_MS / 1000),
    },
  })
}
