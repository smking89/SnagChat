'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { timeAgo } from '@/lib/format'
import { colorwayName } from '@/lib/metadata'
import type { FlashItem, PublicUser } from '@/lib/types'
import { Avatar } from './Avatar'
import { BoltIcon, CameraIcon } from './icons'
import { SnapViewer } from './SnapViewer'
import { VaultPicker } from './VaultPicker'

const HUE_FILTERS: Array<{ label: string; hue: number | null }> = [
  { label: 'All', hue: null },
  { label: 'Citrus', hue: 44 },
  { label: 'Mint', hue: 150 },
  { label: 'Ocean', hue: 205 },
  { label: 'Ultraviolet', hue: 265 },
  { label: 'Magenta', hue: 320 },
]

function hoursLeft(expiresAt: number | null): string {
  if (!expiresAt) return 'permanent'
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'expiring'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `${hours}h left`
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`
}

export function FlashScreen({ me }: { me: PublicUser }) {
  const [scope, setScope] = useState<'crew' | 'discover'>('crew')
  const [hue, setHue] = useState<number | null>(null)
  const [items, setItems] = useState<FlashItem[] | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [vaultFor, setVaultFor] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ scope })
      if (hue !== null) params.set('hue', String(hue))
      const response = await fetch(`/api/flash?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) return
      const data = (await response.json()) as { items: FlashItem[] }
      setItems(data.items)
    } catch {
      // keep the current snapshot
    }
  }, [scope, hue])

  useEffect(() => {
    void load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(timeout)
  }, [toast])

  const viewingIndex = items?.findIndex((item) => item.snagId === viewingId) ?? -1

  async function resnag(snagId: string) {
    const response = await fetch(`/api/snaps/${snagId}/resnag`, { method: 'POST' })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    setToast(response.ok ? 'Re-snagged to your flash' : (data.error ?? 'Could not re-snag'))
    void load()
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-hair px-4 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink">Flash.</h1>
            <p className="text-xs text-muted">every snag here is gone in 24 hours</p>
          </div>
          <Link href="/" aria-label="Add to the flash stream" className="rounded-full bg-ink p-2.5 text-white">
            <CameraIcon className="h-5 w-5" />
          </Link>
        </div>

        <div className="mt-3 flex gap-1.5 rounded-full border border-hair bg-panel p-1">
          {(['crew', 'discover'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setScope(entry)}
              className={`flex-1 rounded-full py-1.5 text-[12px] font-semibold capitalize transition ${
                scope === entry ? 'bg-ink text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {entry === 'crew' ? 'My crew' : 'Discover'}
            </button>
          ))}
        </div>

        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
          {HUE_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={() => setHue(filter.hue)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition ${
                hue === filter.hue ? 'border-ink bg-ink text-white' : 'border-hair text-muted hover:border-ink hover:text-ink'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      <div className="scroll-area no-scrollbar px-3 pb-6 pt-3">
        {toast ? (
          <div className="mx-auto mb-3 w-fit rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-white pop">
            {toast}
          </div>
        ) : null}

        {items === null ? (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((card) => (
              <div key={card} className="h-56 animate-pulse rounded-2xl bg-panel-2" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-hair px-6 py-12 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-hair bg-panel text-ink">
              <BoltIcon className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">The stream is empty</p>
            <p className="mt-1 text-xs text-muted">
              {scope === 'crew' ? 'No flash from your crew yet.' : 'Nothing in discovery for this colorway.'}
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white"
            >
              <CameraIcon className="h-4 w-4" /> Post one
            </Link>
          </div>
        ) : (
          <div className="columns-2 gap-3 [&>*]:mb-3">
            {items.map((item) => (
              <button
                key={item.snagId}
                type="button"
                onClick={() => setViewingId(item.snagId)}
                className={`relative block w-full overflow-hidden rounded-2xl border text-left transition ${
                  item.viewed ? 'border-hair' : 'border-ink'
                }`}
              >
                <div className="relative" style={{ backgroundColor: item.palette[0] ?? '#1c1c25' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/snaps/${item.snagId}/media?peek=1`}
                    alt={item.caption ?? 'Flash snag'}
                    loading="lazy"
                    className="w-full object-cover"
                  />
                  {item.layout?.pins?.map((pin, index) => (
                    <span
                      key={`${pin.emoji}-${index}`}
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-base"
                      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                    >
                      {pin.emoji}
                    </span>
                  ))}
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink backdrop-blur">
                    {hoursLeft(item.expiresAt)}
                  </span>
                  {item.viewed ? null : <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-ink" />}
                </div>
                <div className="bg-white p-2">
                  <div className="flex items-center gap-1.5">
                    <Avatar user={item.sender} size={18} />
                    <span className="truncate text-[11px] font-medium text-ink">
                      {item.mine ? 'You' : item.sender.displayName.split(' ')[0]}
                    </span>
                    <span className="ml-auto text-[10px] text-muted">{timeAgo(item.createdAt)}</span>
                  </div>
                  {item.caption ? <p className="mt-1 truncate text-[11px] text-ink/70">{item.caption}</p> : null}
                  <div className="mt-1.5 flex items-center gap-1">
                    {item.palette.slice(0, 3).map((hex) => (
                      <span key={hex} className="h-2 w-2 rounded-full" style={{ backgroundColor: hex }} />
                    ))}
                    <span className="ml-1 text-[9px] uppercase tracking-[0.12em] text-muted">
                      {colorwayName(item.dominantHue)}
                      {item.tags[0] ? ` · ${item.tags[0]}` : ''}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {viewingIndex >= 0 && items ? (
        <SnapViewer
          items={items.map((item) => ({
            id: item.snagId,
            duration: 5,
            caption: item.caption,
            kind: 'flash' as const,
            layout: item.layout,
            palette: item.palette,
            saved: false,
          }))}
          title={items[viewingIndex].mine ? 'Your flash' : items[viewingIndex].sender.displayName}
          subtitle={hoursLeft(items[viewingIndex].expiresAt)}
          onClose={() => {
            setViewingId(null)
            void load()
          }}
          onFinished={() => void load()}
          onAddToVault={(item) => setVaultFor(item.id)}
          onResnag={(item) => void resnag(item.id)}
        />
      ) : null}

      {vaultFor ? (
        <VaultPicker
          snagId={vaultFor}
          onClose={() => setVaultFor(null)}
          onAdded={(title) => setToast(`Anchored in ${title}`)}
        />
      ) : null}
    </div>
  )
}
