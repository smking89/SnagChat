'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function DemoButton({ className = '' }: { className?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enterDemo() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/demo', { method: 'POST' })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Could not start the demo')
      }
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the demo')
      setBusy(false)
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={enterDemo}
        disabled={busy}
        className={`w-full rounded-2xl border border-ink bg-white px-5 py-3.5 text-[15px] font-semibold text-ink transition hover:bg-panel disabled:opacity-60 ${className}`}
      >
        {busy ? 'Packing your snaps…' : 'Try a demo account'}
      </button>
      {error ? <p className="mt-2 text-center text-xs text-snap-pink">{error}</p> : null}
    </div>
  )
}
