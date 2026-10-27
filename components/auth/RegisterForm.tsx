'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const MIN_PASSWORD = 10

export function RegisterForm() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, password }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not create that account')
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that account')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="displayName" className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          autoComplete="name"
          required
          minLength={2}
          maxLength={28}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="How friends see you"
          className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`At least ${MIN_PASSWORD} characters`}
          className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
        />
        <p className={`mt-1.5 text-[11px] ${tooShort ? 'text-snap-pink' : 'text-muted'}`}>
          {tooShort ? `${MIN_PASSWORD - password.length} more characters needed` : 'A phrase you can remember beats a short scramble.'}
        </p>
      </div>

      {error ? <p className="text-xs font-medium text-snap-pink">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || !displayName.trim() || !email.trim() || password.length < MIN_PASSWORD}
        className="w-full rounded-xl bg-snag px-4 py-3 text-[15px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
      >
        {busy ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  )
}
