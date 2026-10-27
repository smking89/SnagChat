import { getEnv } from './db'
import { CHAT_TTL_MS, VIEW_GRACE_MS } from './schema'

export type SweepReport = {
  anchored: number
  purgedSnaps: number
  purgedObjects: number
  purgedMessages: number
}

/**
 * The invalidation engine.
 *
 * Rules, applied in order:
 *  1. Anything explicitly saved, or anchored to a vault board, is promoted to
 *     permanent (`is_ephemeral = 0`) and never expires.
 *  2. Ephemeral snags past their `expires_at` (24h for flash + dm) or direct
 *     snags the recipient already opened are purged from every stream.
 *  3. Bytes are deleted only when no live row still references the object, so a
 *     saved copy always keeps its media.
 *  4. Unsaved chat text past its TTL is removed outright.
 */
export async function sweep(now = Date.now()): Promise<SweepReport> {
  const { DB, FILES } = await getEnv()
  const report: SweepReport = { anchored: 0, purgedSnaps: 0, purgedObjects: 0, purgedMessages: 0 }

  const anchored = await DB.prepare(
    `UPDATE snaps SET is_ephemeral = 0, expires_at = NULL
      WHERE is_ephemeral = 1 AND (saved = 1 OR vault_count > 0)`
  ).run()
  report.anchored = anchored.meta?.changes ? Number(anchored.meta.changes) : 0

  await DB.prepare(`UPDATE messages SET is_ephemeral = 0, expires_at = NULL WHERE is_ephemeral = 1 AND saved = 1`).run()

  const candidates = await DB.prepare(
    `SELECT DISTINCT s.r2_key AS r2_key FROM snaps s
      WHERE s.deleted_at IS NULL
        AND s.is_ephemeral = 1
        AND s.saved = 0
        AND s.vault_count = 0
        AND (
          (s.expires_at IS NOT NULL AND s.expires_at <= ?1)
          OR (s.is_story = 0 AND s.viewed_at IS NOT NULL AND s.viewed_at <= ?2)
        )
        AND NOT EXISTS (
          SELECT 1 FROM snaps keep
           WHERE keep.r2_key = s.r2_key
             AND keep.deleted_at IS NULL
             AND (
               keep.is_ephemeral = 0
               OR keep.saved = 1
               OR keep.vault_count > 0
               OR (keep.expires_at IS NULL OR keep.expires_at > ?1)
             )
        )
      LIMIT 100`
  )
    .bind(now, now - VIEW_GRACE_MS)
    .all<{ r2_key: string }>()

  for (const row of candidates.results ?? []) {
    try {
      await FILES.delete(row.r2_key)
      report.purgedObjects += 1
    } catch {
      // Already gone: still record the deletion so it is never served again.
    }
    const result = await DB.prepare(
      `UPDATE snaps SET deleted_at = ?1
        WHERE r2_key = ?2 AND deleted_at IS NULL
          AND is_ephemeral = 1 AND saved = 0 AND vault_count = 0`
    )
      .bind(now, row.r2_key)
      .run()
    report.purgedSnaps += result.meta?.changes ? Number(result.meta.changes) : 0
  }

  const messages = await DB.prepare(
    `DELETE FROM messages WHERE saved = 0 AND expires_at IS NOT NULL AND expires_at <= ?`
  )
    .bind(now)
    .run()
  report.purgedMessages = messages.meta?.changes ? Number(messages.meta.changes) : 0

  return report
}

let lastSweep = 0

/** Cheap, throttled sweep for request paths. Never allowed to fail a request. */
export async function maybeSweep(): Promise<void> {
  if (Date.now() - lastSweep < 20_000) return
  lastSweep = Date.now()
  try {
    await sweep()
  } catch (error) {
    console.error('[snagchat] sweep failed:', error instanceof Error ? error.message : 'unknown error')
  }
}

export { CHAT_TTL_MS }
