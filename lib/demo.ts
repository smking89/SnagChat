import { conversationId, createUser, getEnv, linkFriends, type UserRow } from './db'
import { FLASH_TTL_MS } from './schema'

/**
 * Demo identities let people try SnagChat from a preview that cannot complete
 * an OAuth round trip. They are real rows, marked `is_demo`, seeded with a crew,
 * a live flash stream, an inbox of snags, vault boards and a saved chat drawer.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function snapArtwork(hue: number, glyph: string, label: string): string {
  const second = (hue + 46) % 360
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 88% 58%)"/>
      <stop offset="55%" stop-color="hsl(${second} 78% 38%)"/>
      <stop offset="100%" stop-color="hsl(${second} 70% 16%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="720" height="1280" fill="url(#bg)"/>
  <circle cx="150" cy="220" r="320" fill="url(#glow)"/>
  <circle cx="600" cy="1080" r="260" fill="rgba(255,255,255,0.08)"/>
  <text x="360" y="640" font-size="230" text-anchor="middle">${escapeXml(glyph)}</text>
  <text x="360" y="800" font-family="Inter, system-ui, sans-serif" font-size="52" font-weight="700"
        fill="#ffffff" text-anchor="middle" opacity="0.95">${escapeXml(label)}</text>
  <text x="360" y="1180" font-family="Inter, system-ui, sans-serif" font-size="26" letter-spacing="6"
        fill="rgba(255,255,255,0.6)" text-anchor="middle">SNAGCHAT</text>
</svg>`
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360
  const sat = saturation / 100
  const light = lightness / 100
  const chroma = (1 - Math.abs(2 * light - 1)) * sat
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const match = light - chroma / 2
  let rgb: [number, number, number]
  if (h < 60) rgb = [chroma, x, 0]
  else if (h < 120) rgb = [x, chroma, 0]
  else if (h < 180) rgb = [0, chroma, x]
  else if (h < 240) rgb = [0, x, chroma]
  else if (h < 300) rgb = [x, 0, chroma]
  else rgb = [chroma, 0, x]
  return `#${rgb
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function paletteFor(hue: number): string[] {
  return [hslToHex(hue, 92, 58), hslToHex(hue + 46, 78, 38), hslToHex(hue + 12, 60, 20)]
}

type Persona = { username: string; displayName: string; hue: number }

const PERSONAS: Persona[] = [
  { username: 'maya', displayName: 'Maya Chen', hue: 322 },
  { username: 'theo', displayName: 'Theo Park', hue: 205 },
  { username: 'priya', displayName: 'Priya Nair', hue: 265 },
  { username: 'jonah', displayName: 'Jonah Reed', hue: 168 },
]

export async function createDemoAccount(): Promise<UserRow> {
  const id = `demo_${crypto.randomUUID()}`
  const user = await createUser({ id, displayName: 'You', hue: 44, isDemo: true, usernameSeed: 'you' })
  await seedDemoContent(user)
  return user
}

async function seedDemoContent(user: UserRow): Promise<void> {
  const { DB, FILES } = await getEnv()
  const now = Date.now()
  const statements: D1PreparedStatement[] = []

  const friendRows: UserRow[] = []
  for (const persona of PERSONAS) {
    const existing = await DB.prepare(`SELECT * FROM users WHERE username = ?`).bind(persona.username).first<UserRow>()
    let row = existing
    if (!row) {
      row = await createUser({
        id: `demo_${crypto.randomUUID()}`,
        displayName: persona.displayName,
        hue: persona.hue,
        isDemo: true,
        presetUsername: persona.username,
      })
    }
    friendRows.push(row)
    await linkFriends(user.id, row.id)
  }

  const [maya, theo, priya, jonah] = friendRows

  // --- conversation history (explicitly saved, so it survives the TTL) -------
  const texts = [
    { from: maya.id, to: user.id, body: 'did you see the sunset from the roof??', minutesAgo: 42 },
    { from: user.id, to: maya.id, body: 'no way. send me one', minutesAgo: 40 },
    { from: theo.id, to: user.id, body: 'the demo track is finally mixed', minutesAgo: 130 },
    { from: user.id, to: theo.id, body: 'play it for me at 8?', minutesAgo: 127 },
    { from: priya.id, to: user.id, body: 'we are outside your building. hurry.', minutesAgo: 12 },
  ]
  for (const text of texts) {
    statements.push(
      DB.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, recipient_id, kind, body, snap_id, created_at,
                               is_ephemeral, saved, saved_at, expires_at)
         VALUES (?, ?, ?, ?, 'text', ?, NULL, ?, 0, 1, ?, NULL)`
      ).bind(
        crypto.randomUUID(),
        conversationId(text.from, text.to),
        text.from,
        text.to,
        text.body,
        now - text.minutesAgo * 60 * 1000,
        now - text.minutesAgo * 60 * 1000
      )
    )
  }

  // --- unopened snags in the inbox -----------------------------------------
  const inbox = [
    { from: maya, glyph: '◆', label: 'roof, 7:42pm', duration: 4, minutesAgo: 38, overlay: 'crt' },
    { from: theo, glyph: '◉', label: 'turn it UP', duration: 6, minutesAgo: 118, overlay: 'hud' },
    { from: priya, glyph: '◈', label: 'we are downstairs', duration: 3, minutesAgo: 9, overlay: 'none' },
  ]
  for (const snap of inbox) {
    const key = `snags/${snap.from.id}/${crypto.randomUUID()}`
    await FILES.put(key, snapArtwork(snap.from.hue, snap.glyph, snap.label), {
      httpMetadata: { contentType: 'image/svg+xml' },
    })
    const id = crypto.randomUUID()
    const createdAt = now - snap.minutesAgo * 60 * 1000
    const layout = JSON.stringify({ overlay: snap.overlay, pins: [{ x: 0.78, y: 0.22, emoji: '◆', scale: 1 }] })
    statements.push(
      DB.prepare(
        `INSERT INTO snaps (id, sender_id, recipient_id, is_story, stream, r2_key, media_type, caption, duration,
                            created_at, expires_at, palette, dominant_hue, tags, layout, is_ephemeral)
         VALUES (?, ?, ?, 0, 'dm', ?, 'image/svg+xml', ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(
        id,
        snap.from.id,
        user.id,
        key,
        snap.label,
        snap.duration,
        createdAt,
        createdAt + FLASH_TTL_MS,
        JSON.stringify(paletteFor(snap.from.hue)),
        snap.from.hue,
        JSON.stringify(['rooftop', 'nights']),
        layout
      ),
      DB.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, recipient_id, kind, body, snap_id, created_at,
                               is_ephemeral, expires_at)
         VALUES (?, ?, ?, ?, 'snap', ?, ?, ?, 1, ?)`
      ).bind(
        crypto.randomUUID(),
        conversationId(snap.from.id, user.id),
        snap.from.id,
        user.id,
        snap.label,
        id,
        createdAt,
        createdAt + FLASH_TTL_MS
      )
    )
  }

  // --- a snap pinned into the shared chat drawer ---------------------------
  const pinnedKey = `snags/${maya.id}/${crypto.randomUUID()}`
  await FILES.put(pinnedKey, snapArtwork(maya.hue, '◆', 'keep this one'), {
    httpMetadata: { contentType: 'image/svg+xml' },
  })
  const pinnedId = crypto.randomUUID()
  const pinnedAt = now - 90 * 60 * 1000
  statements.push(
    DB.prepare(
      `INSERT INTO snaps (id, sender_id, recipient_id, is_story, stream, r2_key, media_type, caption, duration,
                          created_at, viewed_at, saved, saved_at, is_ephemeral, expires_at, palette, dominant_hue,
                          tags, layout)
       VALUES (?, ?, ?, 0, 'dm', ?, 'image/svg+xml', 'keep this one', 5, ?, ?, 1, ?, 0, NULL, ?, ?, ?, ?)`
    ).bind(
      pinnedId,
      maya.id,
      user.id,
      pinnedKey,
      pinnedAt,
      pinnedAt + 30_000,
      pinnedAt,
      JSON.stringify(paletteFor(maya.hue)),
      maya.hue,
      JSON.stringify(['saved', 'reference']),
      JSON.stringify({ overlay: 'grain', pins: [] })
    ),
    DB.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, recipient_id, kind, body, snap_id, created_at,
                             is_ephemeral, saved, saved_at)
       VALUES (?, ?, ?, ?, 'snap', 'keep this one', ?, ?, 0, 1, ?)`
    ).bind(crypto.randomUUID(), conversationId(maya.id, user.id), maya.id, user.id, pinnedId, pinnedAt, pinnedAt)
  )

  // --- the live flash stream ----------------------------------------------
  const flash = [
    { from: maya, glyph: '◐', label: 'golden hour', hoursAgo: 1, overlay: 'crt' },
    { from: maya, glyph: '◎', label: 'ramen run', hoursAgo: 0.4, overlay: 'none' },
    { from: theo, glyph: '⌁', label: 'studio night', hoursAgo: 3, overlay: 'hud' },
    { from: jonah, glyph: '⟡', label: 'cold water club', hoursAgo: 5, overlay: 'grain' },
    { from: priya, glyph: '◉', label: 'friday baseline', hoursAgo: 7, overlay: 'crt' },
  ]
  const freshByPersona = new Set<string>()
  for (const persona of friendRows) {
    const existing = await DB.prepare(
      `SELECT 1 AS ok FROM snaps WHERE sender_id = ? AND stream = 'flash' AND deleted_at IS NULL AND created_at > ? LIMIT 1`
    )
      .bind(persona.id, now - FLASH_TTL_MS)
      .first<{ ok: number }>()
    if (existing) freshByPersona.add(persona.id)
  }

  for (const entry of flash) {
    if (freshByPersona.has(entry.from.id)) continue
    const key = `snags/${entry.from.id}/${crypto.randomUUID()}`
    await FILES.put(key, snapArtwork(entry.from.hue, entry.glyph, entry.label), {
      httpMetadata: { contentType: 'image/svg+xml' },
    })
    const createdAt = now - entry.hoursAgo * 60 * 60 * 1000
    statements.push(
      DB.prepare(
        `INSERT INTO snaps (id, sender_id, recipient_id, is_story, stream, r2_key, media_type, caption, duration,
                            created_at, expires_at, palette, dominant_hue, tags, layout, is_ephemeral)
         VALUES (?, ?, NULL, 1, 'flash', ?, 'image/svg+xml', ?, 5, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(
        crypto.randomUUID(),
        entry.from.id,
        key,
        entry.label,
        createdAt,
        createdAt + FLASH_TTL_MS,
        JSON.stringify(paletteFor(entry.from.hue)),
        entry.from.hue,
        JSON.stringify(entry.overlay === 'hud' ? ['hud', 'studio'] : ['flash']),
        JSON.stringify({
          overlay: entry.overlay,
          pins:
            entry.overlay === 'hud'
              ? [
                  { x: 0.2, y: 0.18, emoji: '◎', scale: 1 },
                  { x: 0.82, y: 0.76, emoji: '⌁', scale: 1 },
                ]
              : [],
        })
      )
    )
  }

  // --- vault boards: media that outlived the 24h stream -------------------
  const boards = [
    {
      title: 'Neon Nights',
      items: [
        { glyph: '◈', label: 'metro 02:14', hue: 265, overlay: 'crt', daysAgo: 6 },
        { glyph: '◈', label: 'parking garage', hue: 205, overlay: 'hud', daysAgo: 9 },
        { glyph: '◆', label: 'violet lobby', hue: 285, overlay: 'grain', daysAgo: 14 },
      ],
    },
    {
      title: 'Studio HUD',
      items: [
        { glyph: '⌁', label: 'levels', hue: 168, overlay: 'hud', daysAgo: 3 },
        { glyph: '◎', label: 'tape loops', hue: 32, overlay: 'crt', daysAgo: 21 },
      ],
    },
  ]

  for (const board of boards) {
    const vaultId = crypto.randomUUID()
    const createdAt = now - 2 * 24 * 60 * 60 * 1000
    statements.push(
      DB.prepare(
        `INSERT INTO vaults (id, owner_id, title, slug, cover_snag_id, created_at, updated_at, is_public)
         VALUES (?, ?, ?, ?, NULL, ?, ?, 0)`
      ).bind(
        vaultId,
        user.id,
        board.title,
        board.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        createdAt,
        now
      )
    )

    let cover: string | null = null
    for (const item of board.items) {
      const key = `snags/${user.id}/${crypto.randomUUID()}`
      await FILES.put(key, snapArtwork(item.hue, item.glyph, item.label), {
        httpMetadata: { contentType: 'image/svg+xml' },
      })
      const snagId = crypto.randomUUID()
      if (!cover) cover = snagId
      const itemAt = now - item.daysAgo * 24 * 60 * 60 * 1000
      statements.push(
        DB.prepare(
          `INSERT INTO snaps (id, sender_id, recipient_id, is_story, stream, r2_key, media_type, caption, duration,
                              created_at, palette, dominant_hue, tags, layout, is_ephemeral, vault_count)
           VALUES (?, ?, NULL, 1, 'flash', ?, 'image/svg+xml', ?, 5, ?, ?, ?, ?, ?, 0, 1)`
        ).bind(
          snagId,
          user.id,
          key,
          item.label,
          itemAt,
          JSON.stringify(paletteFor(item.hue)),
          item.hue,
          JSON.stringify(['vault', item.overlay]),
          JSON.stringify({ overlay: item.overlay, pins: [] })
        ),
        DB.prepare(`INSERT INTO vault_entries (vault_id, snag_id, added_at, position, note) VALUES (?, ?, ?, 0, ?)`)
          .bind(vaultId, snagId, itemAt + 60_000, item.label)
      )
    }

    if (cover) {
      statements.push(DB.prepare(`UPDATE vaults SET cover_snag_id = ? WHERE id = ?`).bind(cover, vaultId))
    }
  }

  await DB.batch(statements)
}
