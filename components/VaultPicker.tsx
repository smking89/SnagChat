'use client'

import { useEffect, useState } from 'react'

import type { VaultSummary } from '@/lib/types'
import { CloseIcon, PlusIcon } from './icons'

export function VaultPicker({
  snagId,
  onClose,
  onAdded,
}: {
  snagId: string
  onClose: () => void
  onAdded?: (title: string) => void
}) {
  const [vaults, setVaults] = useState<VaultSummary[] | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/vaults', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { vaults: [] }))
      .then((data: { vaults?: VaultSummary[] }) => setVaults(data.vaults ?? []))
      .catch(() => setVaults([]))
  }, [])

  async function add(vaultId: string, vaultTitle: string) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/vaults/${vaultId}/snags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snagId }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not anchor that snag')
      onAdded?.(vaultTitle)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not anchor that snag')
    } finally {
      setBusy(false)
    }
  }

  async function createAndAdd(event: React.FormEvent) {
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
      await add(data.vault.id, data.vault.title)
      setTitle('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that board')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-t-3xl border border-hair bg-white p-4 sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink">Anchor to a vault board</h3>
            <p className="text-[11px] text-muted">Vaulted snags outlive the 24-hour stream.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-hair p-1.5 text-ink transition hover:bg-panel"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto no-scrollbar">
          {vaults === null ? (
            <li className="py-3 text-center text-xs text-muted">Loading boards…</li>
          ) : vaults.length === 0 ? (
            <li className="py-3 text-center text-xs text-muted">No boards yet — name your first one below.</li>
          ) : (
            vaults.map((vault) => (
              <li key={vault.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => add(vault.id, vault.title)}
                  className="flex w-full items-center justify-between rounded-xl border border-hair bg-panel px-3 py-2.5 text-left text-sm text-ink transition hover:border-ink disabled:opacity-60"
                >
                  <span className="font-medium">{vault.title}</span>
                  <span className="text-[11px] text-muted">{vault.count} snags</span>
                </button>
              </li>
            ))
          )}
        </ul>

        <form onSubmit={createAndAdd} className="mt-3 flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 40))}
            placeholder="New board name"
            className="flex-1 rounded-xl border border-hair bg-panel px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
          />
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="grid w-10 place-items-center rounded-xl bg-ink text-white disabled:opacity-40"
            aria-label="Create board"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.6} />
          </button>
        </form>
        {error ? <p className="mt-2 text-center text-[11px] text-snap-pink">{error}</p> : null}
      </div>
    </div>
  )
}
