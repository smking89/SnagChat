'use client'

import { useState } from 'react'

type Mode = 'password' | 'email'

export function ForgotForm() {
  const [mode, setMode] = useState<Mode>('password')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ message: string; devHint?: string } | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setValue('')
    setError(null)
    setSent(null)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const endpoint = mode === 'password' ? '/api/auth/forgot-password' : '/api/auth/forgot-email'
      const payload = mode === 'password' ? { email: value } : { handle: value }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        message?: string
        devLink?: string
        devAddress?: string
      }
      if (!response.ok) throw new Error(data.error ?? 'That did not work')
      setSent({
        message: data.message ?? 'Check your inbox.',
        devHint: data.devLink ?? data.devAddress,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-full border border-hair bg-panel p-1">
        {(
          [
            ['password', 'Forgot password'],
            ['email', 'Forgot email'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchMode(key)}
            className={`flex-1 rounded-full py-1.5 text-[12px] font-semibold transition ${
              mode === key ? 'bg-ink text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {sent ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink">{sent.message}</p>
          {sent.devHint ? (
            <p className="rounded-xl border border-hair bg-panel px-3 py-2 text-[11px] leading-relaxed break-all text-muted">
              Dev only — no mail key is configured. {sent.devHint}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSent(null)
              setValue('')
            }}
            className="text-[13px] font-semibold text-ink underline underline-offset-2"
          >
            Send another
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="recover" className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {mode === 'password' ? 'Email' : 'Handle'}
            </label>
            <input
              id="recover"
              type={mode === 'password' ? 'email' : 'text'}
              autoComplete={mode === 'password' ? 'email' : 'username'}
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={mode === 'password' ? 'you@example.com' : '@yourhandle'}
              className="mt-1.5 w-full rounded-xl border border-hair bg-panel px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              {mode === 'password'
                ? 'We email a link that lets you pick a new password. It works once and expires in an hour.'
                : 'We never show the address here — a reminder goes to the mailbox on the account.'}
            </p>
          </div>

          {error ? <p className="text-xs font-medium text-snap-pink">{error}</p> : null}

          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="w-full rounded-xl bg-white px-4 py-3 text-[15px] font-bold text-ink transition hover:bg-white/90 disabled:opacity-60"
          >
            {busy ? 'Sending…' : mode === 'password' ? 'Send reset link' : 'Email me my address'}
          </button>
        </form>
      )}
    </div>
  )
}
