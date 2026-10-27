# SnagChat architecture blueprint

Two interlocking states, one media unit:

- **Flash stream** — everything is born ephemeral and leaves every stream 24 hours after capture unless it is
  anchored.
- **Vault boards** — immutable, user-defined grids that anchor snags permanently and are never mixed with
  conversation logs.

A snag never changes identity when it becomes permanent. `snaps.is_ephemeral`, `snaps.saved` and
`snaps.vault_count` are the only levers; no row is copied into a second table.

## 1. The data matrix

| object | storage | purpose | lifecycle fields |
| --- | --- | --- | --- |
| **Snag** | `snaps` + R2 object | media unit: payload key, layout vector, colour signature, lineage | `is_ephemeral`, `saved`, `vault_count`, `expires_at`, `viewed_at`, `deleted_at` |
| **Vault** | `vaults` | named registry owned by one snagger | `title`, `slug`, `cover_snag_id` |
| **Vault anchor** | `vault_entries` | membership; the only thing that outlives the TTL | `added_at`, `note` |
| **Chat drawer** | derived from `messages` ⋈ `snaps` | pinned media for one conversation | `messages.saved`, `snaps.saved` |
| **Message** | `messages` | text or a snap reference inside a thread | `is_ephemeral`, `saved`, `expires_at` |
| **View** | `snap_views` | per-viewer receipts for flash entries | `viewed_at` |

Full DDL: [`schemas/schema.sql`](../schemas/schema.sql). Runtime copy: [`lib/schema.ts`](../lib/schema.ts).

### Layout metadata vector

Every snag carries `layout`:

```json
{ "overlay": "crt", "pins": [{ "x": 0.78, "y": 0.22, "emoji": "✨", "scale": 1 }] }
```

`overlay` is the creative filter baked into the pixels at capture (`none | crt | hud | grain`). `pins` stay as
normalised coordinates so stickers keep rendering as components over the image instead of being flattened into it.

### Lineage

`parent_snag_id` tracks Re-Snag: a new flash entry pointing at the original media and `content_hash`. The child is
a fresh 24-hour row; the parent keeps its own lifecycle. Bytes are shared, so the refcount rule below matters.

## 2. Lifecycle state machine

```
                     capture
                        │
                        ▼
                  ┌───────────┐   save in chat / vault anchor
                  │ ephemeral │ ──────────────────────────────► permanent
                  └───────────┘                                  (is_ephemeral = 0,
                        │                                         expires_at = NULL)
      ┌─────────────────┼──────────────────┐
      │                 │                  │
 opened once      expires_at <= now   re-snagged
      │                 │                  │
      ▼                 ▼                  ▼
 bytes deleted     leaves every      child is a new
 (last recipient)  stream + bytes    24h ephemeral row
```

| state | condition | visible in | bytes |
| --- | --- | --- | --- |
| `live` | flash, `expires_at > now` | flash stream | kept |
| `unopened` | dm, `viewed_at IS NULL` | recipient inbox | kept |
| `opened` | dm, viewed, inside the grace window | thread receipt | kept briefly |
| `anchored` | `saved = 1` or `vault_count > 0` | chat drawer / vault board | kept forever |
| `expired` | ephemeral and past `expires_at` | nowhere | deleted |

Anchoring is reversible: removing the last vault entry (or deleting the board) sets `vault_count` back to `0`, and
the snag re-enters the ephemeral lifecycle.

## 3. Runtime flow trace

```
User curated upload
  CameraScreen.capture()            ← webcam frame or uploaded photo, nothing is scraped
        │  raw frame
        ▼
Creative layer overlay
  applyOverlay(canvas, overlay)     ← crt scanlines / hud brackets / grain baked in
  placePin() → layout.pins[]        ← stickers as coordinates, not pixels
  samplePalette(canvas)             ← 3–4 colour buckets for the discovery matrix
        │  multipart: media, caption, duration, palette, tags, layout
        ▼
POST /api/snaps
  lib/metadata.ts dominantHue()     ← colourway index stored on the row
  lib/snaps.ts createSnap()         ← expires_at = now + 24h, is_ephemeral = 1
        │
        ├── stream = 'flash'  ──► GET /api/flash  (crew | discover, hue filter)
        └── stream = 'dm'     ──► GET /api/chats/:peerId  (view-once bubble)
        ▼
Ephemeral stream routing
  GET /api/snaps/:id/media          ← authz, marks the first view, no store
  POST /api/snaps/:id/seen          ← finishView(): delete bytes once no live row needs them
        │
        │  long-press (460ms) on a bubble
        ▼
Vault board archiving
  POST /api/snaps/:id/save          ← "Save in chat": pinned, permanent, joins the drawer
  POST /api/vaults/:id/snags        ← anchor: vault_count += 1, is_ephemeral = 0
  GET  /api/vaults/:id              ← masonry grid of anchored snags
```

### Invalidation

`sweep()` runs lazily inside list endpoints (throttled to 20s per isolate) and stands alone as an ops job:

1. promote `saved = 1 OR vault_count > 0` rows to permanent;
2. select ephemeral rows past `expires_at` (or viewed dm snags past the grace window) whose object is not
   referenced by any live row;
3. delete the R2 object, then stamp `deleted_at`;
4. delete unsaved chat text past its TTL.

A saved copy therefore always keeps its bytes, while unsaved siblings of the same object are stamped deleted.

## 4. Module map

| concern | runtime (deployed) | Python counterpart (ops) |
| --- | --- | --- |
| schema | `lib/schema.ts` | `schemas/snag_model.py`, `schemas/schema.sql` |
| invalidation | `lib/invalidation.ts` | `workers/invalidation_engine.py` |
| chat / drawer / wipe | `lib/snaps.ts`, `lib/social.ts`, `app/api/chats/*` | `services/chat_manager.py` |
| metadata | `lib/metadata.ts`, `components/creative.ts` | `services/metadata_parser.py` |

The Worker is the enforcement point: a Python job cannot sit on the request path of a Cloudflare deployment, and
only the runtime can authorize a viewer. The Python modules exist to run the same algorithm against a database
export, to audit drift (`snag_model.py --check`), and to prototype lifecycle rules.

## 5. Boundaries enforced in code

- **No scraping.** There is no screen capture, no background hook, no process inspection. Every byte in the system
  comes from `getUserMedia`, a file picker, or seeded demo artwork.
- **No third-party messaging.** Threads, presence-free polling and lifecycle events are all native D1 queries.
- **No text in vaults.** `vault_entries` may only reference `snaps` rows, and `ChatManager.drawer()` raises
  `BoundaryViolation` if a non-media row is ever returned. Vault boards render media only.
- **No client-trusted identity.** Every route resolves the viewer server-side and scopes by `user.sub`.

## 6. Deliberate deviations

| spec | shipped | why |
| --- | --- | --- |
| Python modules as runtime | Python modules as ops tooling; logic runs in the deployed TypeScript Worker | Workers cannot execute Python, and only the runtime can enforce authorization per request |
| chat disappears "on application close" | unsaved chat expires on a server-side 6-hour TTL, or immediately when you pin/leave it alone | browsers cannot reliably report app close; a `pagehide` wipe would also destroy the thread on every refresh and React double-mount |
| cron worker | throttled lazy sweep + standalone ops job | the Sites deploy manifest exposes no cron triggers |

## 7. Verifying

```bash
npx tsc --noEmit                          # types
bash scripts/check-ephemeral.sh           # view-once + anchor lifecycle over HTTP
python -m schemas.snag_model --check <db> # schema drift
python -m workers.invalidation_engine --db <db> --stats
python -m workers.invalidation_engine --db <db> --dry-run
```
