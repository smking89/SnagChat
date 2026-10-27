# SnagChat

SnagChat is a photo messenger with a short memory. You send a snag, it disappears on its own; you anchor one to a
vault board and it stays. Chats clear themselves, accounts are plain email and password, and nothing leaves the app
unless somebody asks it to.

Full design notes: [`docs/architecture.md`](docs/architecture.md) · schema blueprint: [`schemas/schema.sql`](schemas/schema.sql)

## The loop

1. **Snag it** — capture from the webcam (or upload), bake a creative overlay (raw / CRT scanlines / HUD
   brackets / grain), place sticker pins, caption it, pick a `3s / 5s / 10s` timer, tag it.
2. **Route it** — send directly to friends (view-once) or to the Flash stream (24h, discoverable).
3. **It expires** — direct snags are deleted from R2 once the last recipient closes them; flash entries leave
   every stream 24 hours after capture.
4. **Or keep it** — long-press a snag to **Save in chat** (pin it to the shared media drawer and make it
   permanent) or **anchor it to a vault board**. Anchored snags skip the 24-hour sweep. Remove the last anchor
   and the snag hands itself back to the ephemeral lifecycle.

Chat text is ephemeral too: unsaved messages expire on a 6-hour TTL. The single deterministic override is the
same long-press **Save in chat** action.

## Surface

| route | what it does |
| --- | --- |
| `/` | camera, creative overlays, stickers, palette + tags, send |
| `/chat`, `/chat/[peerId]` | threads, snap bubbles, streaks, long-press sheet, shared media drawer |
| `/flash` | 24h stream with crew/discover scopes and a colorway filter |
| `/vaults` | boards, anchored masonry grids, remove anchors |
| `/me` | handle, avatar, friends, sign out / leave demo |

## Data

One media unit, `snaps`, carries its own lifecycle — `is_ephemeral`, `saved`, `vault_count`, `expires_at`,
`viewed_at`, `deleted_at`, plus `layout` (overlay + sticker coordinates), `palette`, `dominant_hue`, `tags`,
`parent_snag_id` (Re-Snag lineage) and `content_hash`. Permanence is never a second table.

`vaults` + `vault_entries` are the anchors. `messages` reference snags and expire independently. `snap_views`
records per-viewer receipts for flash entries.

## API

All responses are `Cache-Control: private, no-store`; every route resolves the session server-side and every
mutation requires a same-origin request.

```
GET    /api/me                      PATCH /api/me                 profile
GET    /api/friends                 POST  /api/friends            add by @username
GET    /api/chats                   GET   /api/chats/:peerId      chat list / thread + drawer
POST   /api/snaps                                                 multipart: media, caption, duration,
                                                                  recipients, story, palette, tags, layout
GET    /api/snaps/:id/media[?peek=1]                              bytes (marks first view) → 410 once gone
POST   /api/snaps/:id/seen                                        finish viewing → delete when unanchored
POST   /api/snaps/:id/save                                        "save in chat" persistence override
POST   /api/snaps/:id/resnag                                      new flash row with parent lineage
GET    /api/flash?scope=crew|discover&hue=205                     the 24h stream
GET    /api/vaults                  POST  /api/vaults            boards
GET    /api/vaults/:id              DELETE /api/vaults/:id        board detail / delete
POST   /api/vaults/:id/snags        DELETE ?snagId=              anchor / release a snag
POST   /api/auth/register                                       email + password account (201 + session cookie)
POST   /api/auth/login                                          sign in (401 on any failure)
POST   /api/auth/logout                                         clears session + demo cookies
POST   /api/auth/forgot-password                                emails a single-use reset link (1h)
POST   /api/auth/forgot-email                                   mails the address on file to the account owner
POST   /api/auth/reset-password                                 token + new password, signs out other sessions
POST   /api/demo                    DELETE /api/demo              demo session
```

## Developer API

Every account can issue its own keys at `/developers` (linked from the You tab) and read its own data over HTTPS.

- **Keys** look like `snag_live_<43 chars>`. Only the SHA-256 is stored, plus a six-character prefix so you can tell
  keys apart in the list. The plaintext is shown once, at creation, and is not recoverable.
- **Scope**: a key reads the snags of the account that created it. Someone else's snag answers `404`, not `403`, so
  ids cannot be probed. Media bytes are deliberately not exposed — images still require a signed-in viewer.
- **Revoking** takes effect on the next request. Ten active keys per account.

| endpoint | returns |
| --- | --- |
| `GET /api/v1/me` | `{ account: { id, username, displayName, isDemo } }` |
| `GET /api/v1/snags` | `{ snags: [{ id, caption, mediaType, createdAt, keptAt, palette, tags, note, overlay }] }` |
| `GET /api/v1/snags/:id` | `{ snag: { id, caption, mediaType, createdAt, keptAt, palette, tags, note, overlay } }` |
| `POST /api/v1/snags` | `201 { snags: [{ id, to, expiresAt }] }` — multipart `media` plus `to` or `story=true` |
| `PATCH /api/v1/snags/:id` | `{ snag: { id, caption, tags } }` — caption and tags, sender only |
| `DELETE /api/v1/snags/:id` | `{ ok, id }` — sender only |
| `POST /api/v1/snags/:id/keep` | `{ snag: { id, kept: true } }` — stops the 24-hour countdown |
| `DELETE /api/v1/snags/:id/keep` | `{ snag: { id, kept: false } }` — back to ephemeral |
| `GET /api/v1/chats/:handle` | `{ peer, messages: [{ id, from, kind, text, snagId, kept, createdAt, expiresAt }] }` |
| `POST /api/v1/chats/:handle/messages` | `201 { message: { id, to, text, createdAt, expiresAt } }` — text clears after 6 hours |

```
curl https://<host>/api/v1/snags \
  -H "Authorization: Bearer snag_live_…"

curl https://<host>/api/v1/snags \
  -H "Authorization: Bearer snag_live_…" \
  -F "media=@frame.png;type=image/png" \
  -F "tags=neon, hud study" \
  -F "caption=levels" \
  -F "to=ada"

curl https://<host>/api/v1/chats/ada/messages \
  -H "Authorization: Bearer snag_live_…" \
  -H "Content-Type: application/json" \
  -d '{"text":"that last one was clean"}'
```

Writes are capped at 30 per minute per key and reads at 120 (`429` with `Retry-After`). Errors are
`{ error: { code, message } }` with `401` for a missing/invalid/revoked key, `404` for an unknown or foreign snag,
`403` when a recipient is not on your crew, and `410` for a snag that is already deleted. Keys are for servers: never
ship one in a browser bundle.

## Brand

| token | value |
| --- | --- |
| canvas | `#FFFFFF` pure white — every screen |
| ink | `#000000` type, icons, and primary actions |
| accent | `#9D00FF` hyper purple, **splash + launcher CTA only** |
| surfaces | `#F6F6F7` panels, `#EDEDF0` wells, `#E2E2E7` hairlines |

Purple is deliberately scarce: `bg-snag` is reserved for the launch splash and the welcome screen's
sign-in button, and `text-snag` is not used at all, so no body copy or link carries the brand colour.
The UI has no system emoji — avatars are initials, and every action uses the vector set in
[`components/icons.tsx`](components/icons.tsx). The camera viewfinder and the full-screen snag viewer keep
their dark scrims because they sit over media, not chrome.

The supplied artwork lives in `brand-source/` (`icon.png`, `wordmark.png`) and `scripts/build-brand.mjs`
turns it into every asset: it traces both drawings into vectors with potrace, so nothing is upscaled from
the 180px originals. That produces [`public/brand/wordmark.svg`](public/brand/wordmark.svg) (white letter
bodies under thick black line work), [`public/brand/fist.svg`](public/brand/fist.svg) for in-app use,
`app/icon.svg` (white tile, black frame, fist in white fill with a black outline) and the rasterised
`app/apple-icon.png` and `public/icons/icon-{192,512,maskable-512}.png`.
`app/favicon.ico` (16/32/48) uses a solid black silhouette of the fist instead, because the outlined line
work cannot resolve at tab size. `app/manifest.ts` adds installable mobile behaviour. Re-run
`node scripts/build-brand.mjs` to regenerate the whole set after changing the artwork.

## Accounts

SnagChat runs its **own email + password auth** — no Freebuff login, no OAuth provider, no third party in the
sign-in path.

- **Register** (`POST /api/auth/register`): email, display name, password of at least 10 characters. The password
  is PBKDF2-SHA256, 210k iterations, per-user salt, and only the hash is stored.
- **Sign in** (`POST /api/auth/login`): one generic failure message for unknown emails, wrong passwords and demo
  rows, so sign-in cannot be used to discover which addresses have accounts.
- **Sessions**: a random 32-byte token in an `HttpOnly`, `SameSite=Lax` cookie (plus `Secure` when `APP_ORIGIN`
  is https). Only the SHA-256 of the token is persisted, so a database leak cannot be replayed. Sessions last 30
  days; a password reset destroys every other session.
- **Forgot password** (`/auth/forgot`): emails a single-use link that expires in an hour. Requesting another link
  invalidates the previous one.
- **Forgot email** (`/auth/forgot`, second tab): look the account up by handle and mail the address on file. The
  address is never returned to the requester.
- **Throttling**: fixed-window counters in D1 keyed by email, handle and client IP — 10 sign-in attempts per 15
  minutes, 5 reset requests per hour, 10 registrations per hour. Exceeding either bucket returns 429.

Email delivery uses [Resend](https://resend.com) over plain `fetch` (`lib/mail.ts`) with `RESEND_API_KEY` and an
optional `MAIL_FROM`. **Without a key, nothing is sent.** In development the API returns the reset link in its
response (`devLink`) so the flow stays testable; in production it returns the same generic message either way and
logs a server-side error if delivery fails.

**Demo accounts** remain for the hosted preview: a normal D1 row marked `is_demo`, seeded with friends, a live
flash stream, an inbox, vault boards and a pinned drawer. The demo cookie is only honoured for rows created as demo
accounts, and an email/password session always wins over it.

## Local development

```bash
npm install
npm run dev                        # http://localhost:3000, D1/R2 state under .wrangler/
npx tsc --noEmit                   # typecheck
bash scripts/check-ephemeral.sh    # view-once lifecycle, two accounts
bash scripts/check-dual-state.sh   # pinning, anchoring, 24h sweep (takes ~1 min: sweeps are throttled)
```

`.env.local` holds only public development values (`APP_ORIGIN`). Account email needs `RESEND_API_KEY` and
optionally `MAIL_FROM`: Sites → Secrets for a deployment, an untracked local env file otherwise. With no key,
reset links are not emailed — the dev API returns them as `devLink` instead.

## Python ops modules

The deployed runtime enforces every rule (a Python process cannot sit on a Cloudflare request path, and only the
Worker can authorize a viewer). The Python modules run the same algorithms against a database export for audits,
backfills and drift checks:

```bash
python -m schemas.snag_model --emit-sql                  # canonical DDL blueprint
python -m schemas.snag_model --check d1.sqlite           # schema drift vs the runtime
python -m workers.invalidation_engine --db d1.sqlite --stats
python -m workers.invalidation_engine --db d1.sqlite --dry-run
python -m workers.invalidation_engine --db d1.sqlite --media-root ./r2-mirror   # purge bytes too
python -m services.chat_manager --db d1.sqlite --drawer <conversation_id>
python -m services.metadata_parser --svg artwork.svg --tags "neon, hud"
```

Dependencies: Python 3.11+, standard library only.

## Deploying

The bundle is produced by the Freebuff Sites/OpenNext toolchain (`sites_prepare_next`) and deployed from the
generated manifest. Production needs its own D1 database, R2 bucket, `APP_ORIGIN`, and `RESEND_API_KEY` /
`MAIL_FROM` if account email should actually deliver. Publishing is a deliberate step.

## Known limits and deviations

- **No cron trigger**: the sweep runs lazily inside list endpoints (throttled to 20s) and as the Python ops job.
- **Chat does not vanish "on app close"**: browsers cannot report that reliably, and an unload wipe would destroy
  threads on every refresh and React double-mount. Unsaved chat expires on a server-side 6-hour TTL instead.
- Photos only (no video snags), no replays, no friend requests (adding is instant), polling instead of a realtime channel.
- Audio and video calls are scaffolded but **disabled**: the chat header shows both entry points with a
  coming-soon sheet, and `POST /api/calls` returns `501`. Flipping `CALL_FEATURE` in `lib/features.ts` is the
  single switch; no signalling or media path exists behind it yet.
- Demo personas (`maya`, `theo`, `priya`, `jonah`) are shared by every demo account.
- Chat text and vault boards are strictly separated surfaces: the drawer only ever returns media.
