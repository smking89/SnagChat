'use client'

import { useEffect, useState } from 'react'

import type { ApiKeySummary } from '@/lib/apiKeys'
import { timeAgo } from '@/lib/format'
import { CheckIcon, CloseIcon, PlusIcon } from './icons'

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/me',
    description: 'The account the key belongs to.',
  },
  {
    method: 'GET',
    path: '/api/v1/snags',
    description: 'Every snag you have kept, newest first.',
  },
  {
    method: 'GET',
    path: '/api/v1/snags/:id',
    description: 'One kept snag and its metadata.',
  },
  {
    method: 'POST',
    path: '/api/v1/snags',
    description: 'Upload a snag: multipart `media` plus `to` handles or `story=true`.',
  },
  {
    method: 'PATCH',
    path: '/api/v1/snags/:id',
    description: 'Edit the caption and tags of a snag you sent.',
  },
  {
    method: 'DELETE',
    path: '/api/v1/snags/:id',
    description: 'Delete a snag you sent.',
  },
  {
    method: 'POST',
    path: '/api/v1/snags/:id/keep',
    description: 'Keep a snag, so it stops counting down at 24 hours.',
  },
  {
    method: 'DELETE',
    path: '/api/v1/snags/:id/keep',
    description: 'Release a kept snag back to the 24-hour lifecycle.',
  },
  {
    method: 'GET',
    path: '/api/v1/chats/:handle',
    description: 'The conversation with someone on your crew, oldest message first.',
  },
  {
    method: 'POST',
    path: '/api/v1/chats/:handle/messages',
    description: 'Send a text message. It clears after 6 hours unless kept.',
  },
]

export function DeveloperPortal({
  initialKeys,
  username,
}: {
  initialKeys: ApiKeySummary[]
  username: string
}) {
  const [keys, setKeys] = useState<ApiKeySummary[]>(initialKeys)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('https://your-snagchat-host')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  async function refresh() {
    const response = await fetch('/api/keys', { cache: 'no-store' })
    if (!response.ok) return
    const data = (await response.json()) as { keys: ApiKeySummary[] }
    setKeys(data.keys)
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (busy || name.trim().length < 2) return
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = (await response.json().catch(() => ({}))) as { key?: string; error?: string }
      if (!response.ok || !data.key) throw new Error(data.error ?? 'Could not create that key')
      setFreshKey(data.key)
      setName('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that key')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(keyId: string) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Could not revoke that key')
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke that key')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!freshKey) return
    try {
      await navigator.clipboard.writeText(freshKey)
      setCopied(true)
    } catch {
      setError('Copy failed — select the key and copy it manually.')
    }
  }

  const active = keys.filter((key) => !key.revokedAt)
  const revoked = keys.filter((key) => key.revokedAt)

  return (
    <div className="scroll-area no-scrollbar px-4 pb-10">
      <section className="mt-4 rounded-3xl border border-hair p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">API keys</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Keys read your own account data. The full key is shown once, so store it in your server environment, never
          in a browser app.
        </p>

        <form onSubmit={create} className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 40))}
            placeholder="Key name — sync script, notes export…"
            className="flex-1 rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
          />
          <button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="grid w-11 place-items-center rounded-xl bg-ink text-white disabled:opacity-40"
            aria-label="Create key"
          >
            <PlusIcon className="h-5 w-5" strokeWidth={2.4} />
          </button>
        </form>

        {error ? <p className="mt-2 text-xs font-medium text-snap-pink">{error}</p> : null}

        {freshKey ? (
          <div className="mt-3 rounded-2xl border-2 border-ink p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Your new key</p>
            <p className="mt-1.5 break-all font-mono text-[12px] leading-relaxed text-ink">{freshKey}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex items-center gap-1.5 rounded-lg border border-ink px-2.5 py-1.5 text-[11px] font-semibold text-ink"
              >
                {copied ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                {copied ? 'Copied' : 'Copy key'}
              </button>
              <button
                type="button"
                onClick={() => setFreshKey(null)}
                className="text-[11px] font-semibold text-muted underline underline-offset-2"
              >
                I saved it — hide
              </button>
            </div>
          </div>
        ) : null}

        <ul className="mt-4 divide-y divide-hair">
          {active.length === 0 ? (
            <li className="py-3 text-xs text-muted">No active keys yet.</li>
          ) : (
            active.map((key) => (
              <li key={key.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{key.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">{key.prefix}…</p>
                  <p className="mt-1 text-[11px] text-muted">
                    created {timeAgo(key.createdAt)} · {key.requestCount} {key.requestCount === 1 ? 'request' : 'requests'}
                    {key.lastUsedAt ? ` · used ${timeAgo(key.lastUsedAt)}` : ' · never used'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(key.id)}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-hair px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-ink hover:text-ink disabled:opacity-50"
                >
                  <CloseIcon className="h-3 w-3" /> Revoke
                </button>
              </li>
            ))
          )}
        </ul>

        {revoked.length ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Revoked · {revoked.length}
            </summary>
            <ul className="mt-2 space-y-1.5">
              {revoked.map((key) => (
                <li key={key.id} className="text-[11px] text-muted">
                  <span className="font-mono">{key.prefix}…</span> · {key.name} · revoked {timeAgo(key.revokedAt!)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="mt-4 rounded-3xl border border-hair p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Read API</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          JSON over HTTPS. Your key belongs to <span className="font-semibold text-ink">@{username}</span>, and every
          response is limited to that account.
        </p>

        <div className="mt-3 rounded-xl border border-hair bg-panel px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Authorization</p>
          <p className="mt-1 font-mono text-[11px] break-all text-ink">Authorization: Bearer snag_live_…</p>
        </div>

        <ul className="mt-3 divide-y divide-hair">
          {ENDPOINTS.map((endpoint) => (
            <li key={endpoint.path} className="py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                  {endpoint.method}
                </span>
                <span className="font-mono text-[12px] text-ink">{endpoint.path}</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{endpoint.description}</p>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Example</p>
        <pre className="mt-1.5 overflow-x-auto rounded-xl border border-hair bg-panel p-3 font-mono text-[11px] leading-relaxed text-ink">
          {`curl ${origin}/api/v1/snags \\\n  -H "Authorization: Bearer snag_live_…"`}
        </pre>

        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl border border-hair p-2.5">
            <p className="font-semibold text-ink">Rate limit</p>
            <p className="mt-0.5 text-muted">120 reads / 30 writes per minute</p>
          </div>
          <div className="rounded-xl border border-hair p-2.5">
            <p className="font-semibold text-ink">Errors</p>
            <p className="mt-0.5 text-muted">401 key, 404 missing, 429 limit</p>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Writes are capped at 30 per minute per key, reads at 120. Media bytes are not exposed through this API: images
          still require a signed-in viewer. Revoking a key takes effect on the next request.
        </p>
      </section>
    </div>
  )
}
