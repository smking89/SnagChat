'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SignInForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not sign you in')
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
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
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="password"
            className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted"
          >
            Password
          </label>
          <a href="/auth/forgot" className="text-[11px] text-muted underline underline-offset-2 hover:text-ink">
            Forgot password?
          </a>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your password"
          className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
        />
      </div>

      {error ? <p className="text-xs font-medium text-snap-pink">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || !email.trim() || !password}
        className="w-full rounded-xl bg-white px-4 py-3 text-[15px] font-bold text-ink transition hover:bg-white/90 disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
