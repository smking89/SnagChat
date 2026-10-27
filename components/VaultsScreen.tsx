'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { timeAgo } from '@/lib/format'
import type { PublicUser, VaultDetail, VaultSummary } from '@/lib/types'
import { Avatar } from './Avatar'
import { BackIcon, ChevronRightIcon, CloseIcon, GridIcon, PlusIcon } from './icons'
import { SnapViewer } from './SnapViewer'

export function VaultsScreen({ me }: { me: PublicUser }) {
  const [vaults, setVaults] = useState<VaultSummary[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VaultDetail | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)

  const loadVaults = useCallback(async () => {
    try {
      const response = await fetch('/api/vaults', { cache: 'no-store' })
      if (!response.ok) return
      const data = (await response.json()) as { vaults: VaultSummary[] }
      setVaults(data.vaults)
    } catch {
      // keep current snapshot
    }
  }, [])

  const loadDetail = useCallback(async (vaultId: string) => {
    try {
      const response = await fetch(`/api/vaults/${vaultId}`, { cache: 'no-store' })
      if (!response.ok) return
      setDetail((await response.json()) as VaultDetail)
    } catch {
      // keep current snapshot
    }
  }, [])

  useEffect(() => {
    void loadVaults()
  }, [loadVaults])

  useEffect(() => {
    if (activeId) void loadDetail(activeId)
  }, [activeId, loadDetail])

  async function createBoard(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/vaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = (await response.json().catch(() => ({}))) as { vault?: VaultSummary; error?: string }
      if (!response.ok || !data.vault) throw new Error(data.error ?? 'Could not create that board')
      setTitle('')
      await loadVaults()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that board')
    } finally {
      setBusy(false)
    }
  }

  async function removeItem(vaultId: string, snagId: string) {
    await fetch(`/api/vaults/${vaultId}/snags?snagId=${encodeURIComponent(snagId)}`, { method: 'DELETE' }).catch(() => {})
    await loadDetail(vaultId)
    await loadVaults()
  }

  async function deleteBoard(vaultId: string) {
    setBusy(true)
    await fetch(`/api/vaults/${vaultId}`, { method: 'DELETE' }).catch(() => {})
    setActiveId(null)
    setDetail(null)
    await loadVaults()
    setBusy(false)
  }

  if (activeId) {
    const items = detail?.items ?? []
    const viewingIndex = items.findIndex((item) => item.snagId === viewingId)
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-2 border-b border-hair px-3 py-3">
          <button
            type="button"
            onClick={() => {
              setActiveId(null)
              setDetail(null)
              void loadVaults()
            }}
            aria-label="Back to boards"
            className="rounded-full p-1.5 text-muted hover:bg-panel hover:text-ink"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{detail?.vault.title ?? 'Board'}</p>
            <p className="text-[11px] text-muted">{items.length} anchored snags · permanent</p>
          </div>
          <button
            type="button"
            onClick={() => deleteBoard(activeId)}
            disabled={busy}
            className="rounded-full border border-hair px-2.5 py-1 text-[11px] text-muted transition hover:border-ink hover:text-ink disabled:opacity-50"
          >
            Delete board
          </button>
        </header>

        <div className="scroll-area no-scrollbar px-3 pb-6 pt-3">
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-hair px-6 py-12 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-hair bg-panel text-ink">
                <GridIcon className="h-5 w-5" />
              </span>
              <p className="mt-2 text-sm font-semibold text-ink">Nothing anchored yet</p>
              <p className="mt-1 text-xs text-muted">Long-press a snag in chat and choose Vault to file it here.</p>
            </div>
          ) : (
            <div className="columns-2 gap-3 [&>*]:mb-3">
              {items.map((item) => (
                <div key={item.snagId} className="relative overflow-hidden rounded-2xl border border-hair">
                  <button type="button" onClick={() => setViewingId(item.snagId)} className="block w-full text-left">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/snaps/${item.snagId}/media?peek=1`}
                      alt={item.caption ?? 'Vault snag'}
                      loading="lazy"
                      className="w-full object-cover"
                    />
                  </button>
                  <div className="bg-white p-2">
                    <p className="truncate text-[11px] font-medium text-ink">{item.caption ?? 'Untitled snag'}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {item.sender ? <Avatar user={item.sender} size={14} /> : null}
                      <span className="truncate text-[10px] text-muted">
                        {item.sender?.displayName.split(' ')[0] ?? 'you'} · {timeAgo(item.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(activeId, item.snagId)}
                        className="ml-auto grid h-5 w-5 place-items-center rounded-full border border-hair text-ink hover:bg-panel"
                        aria-label="Remove from board"
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {viewingIndex >= 0 ? (
          <SnapViewer
            items={[
              {
                id: items[viewingIndex].snagId,
                duration: 6,
                caption: items[viewingIndex].caption,
                kind: 'vault' as const,
                layout: items[viewingIndex].layout,
                palette: items[viewingIndex].palette,
                saved: true,
              },
            ]}
            title={detail?.vault.title ?? 'Vault'}
            subtitle="permanent"
            onClose={() => setViewingId(null)}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-hair px-4 pb-3 pt-5">
        <h1 className="text-2xl font-black tracking-tight text-ink">Vaults.</h1>
        <p className="text-xs text-muted">the permanent half of SnagChat</p>

        <form onSubmit={createBoard} className="mt-3 flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 40))}
            placeholder="New board — neon, hud study, fits…"
            className="flex-1 rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
          />
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="grid w-11 place-items-center rounded-xl bg-ink text-white disabled:opacity-40"
            aria-label="Create board"
          >
            <PlusIcon className="h-5 w-5" strokeWidth={2.4} />
          </button>
        </form>
        {error ? <p className="mt-2 text-[11px] text-snap-pink">{error}</p> : null}
      </header>

      <div className="scroll-area no-scrollbar px-4 pb-6 pt-4">
        {vaults === null ? (
          <div className="space-y-3">
            {[0, 1].map((row) => (
              <div key={row} className="h-24 animate-pulse rounded-2xl bg-panel-2" />
            ))}
          </div>
        ) : vaults.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-hair px-6 py-12 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-hair bg-panel text-ink">
              <GridIcon className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">No boards yet</p>
            <p className="mt-1 text-xs text-muted">
              Vaults are immutable grids of snags. Name one above, then anchor snags from chat or the flash stream.
            </p>
            <Link
              href="/flash"
              className="mt-4 inline-flex rounded-full bg-ink px-4 py-2 text-xs font-bold text-white"
            >
              Browse the flash stream
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {vaults.map((vault) => (
              <button
                key={vault.id}
                type="button"
                onClick={() => setActiveId(vault.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-hair bg-panel p-3 text-left transition hover:bg-panel-2 active:scale-[0.99]"
              >
                <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-hair bg-white">
                  {vault.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/snaps/${vault.cover}/media?peek=1`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <GridIcon className="h-5 w-5 text-muted" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{vault.title}</span>
                  <span className="block text-[11px] text-muted">
                    {vault.count} {vault.count === 1 ? 'snag' : 'snags'} · updated {timeAgo(vault.updatedAt)}
                  </span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
          Snags anchored to a board are promoted to permanent and skip the 24-hour sweep. Remove the last anchor and
          they return to the ephemeral lifecycle.
        </p>
        <p className="mt-1 text-center text-[11px] text-muted">@{me.username}</p>
      </div>
    </div>
  )
}
