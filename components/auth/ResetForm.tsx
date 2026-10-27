'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const MIN_PASSWORD = 10

export function ResetForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mismatch = confirm.length > 0 && confirm !== password

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || mismatch) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not set that password')
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set that password')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          New password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`At least ${MIN_PASSWORD} characters`}
          className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Repeat it
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Same password again"
          className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
        />
        {mismatch ? <p className="mt-1.5 text-[11px] text-snap-pink">Those two do not match yet.</p> : null}
      </div>

      {error ? <p className="text-xs font-medium text-snap-pink">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || password.length < MIN_PASSWORD || password !== confirm}
        className="w-full rounded-xl bg-white px-4 py-3 text-[15px] font-bold text-ink transition hover:bg-white/90 disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Set new password'}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-muted">
        Setting a new password signs you out on every other device.
      </p>
    </form>
  )
}
