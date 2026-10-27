'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { SnagLayout } from '@/lib/types'
import { BookmarkIcon, CloseIcon, GridIcon, RepeatIcon, TimerIcon } from './icons'

export type ViewerItem = {
  id: string
  duration: number
  caption?: string | null
  kind: 'snap' | 'flash' | 'vault'
  layout?: SnagLayout | null
  palette?: string[]
  saved?: boolean
}

type Status = 'loading' | 'ready' | 'error'

export function SnapViewer({
  items,
  title,
  subtitle,
  onClose,
  onFinished,
  onToggleSave,
  onAddToVault,
  onResnag,
}: {
  items: ViewerItem[]
  title: string
  subtitle?: string
  onClose: () => void
  onFinished?: (item: ViewerItem) => void
  onToggleSave?: (item: ViewerItem) => void
  onAddToVault?: (item: ViewerItem) => void
  onResnag?: (item: ViewerItem) => void
}) {
  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [saved, setSaved] = useState(Boolean(items[0]?.saved))

  const item = items[index]
  const indexRef = useRef(index)
  indexRef.current = index
  const itemsRef = useRef(items)
  itemsRef.current = items
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  const advance = useCallback(() => {
    const current = itemsRef.current[indexRef.current]
    if (current) {
      const url =
        current.kind === 'flash'
          ? `/api/snaps/${current.id}/seen`
          : current.kind === 'snap'
            ? `/api/snaps/${current.id}/seen`
            : '/api/snaps/' // vault items are already permanent: nothing to mark
      if (current.kind !== 'vault') void fetch(url, { method: 'POST' }).catch(() => {})
      onFinishedRef.current?.(current)
    }
    if (indexRef.current + 1 < itemsRef.current.length) {
      setIndex(indexRef.current + 1)
    } else {
      onCloseRef.current()
    }
  }, [])

  useEffect(() => {
    const current = itemsRef.current[index]
    if (!current) return
    let cancelled = false
    let objectUrl: string | null = null
    setStatus('loading')
    setSrc(null)
    setError(null)
    setProgress(0)
    setPaused(false)
    setSaved(Boolean(current.saved))

    fetch(`/api/snaps/${current.id}/media`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'This snag is gone')
        }
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'This snag is gone')
        setStatus('error')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [index])

  useEffect(() => {
    if (status !== 'ready' || paused) return
    const durationMs = Math.max(1200, (item?.duration ?? 5) * 1000)
    const start = performance.now() - progress * durationMs
    let frame = 0
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / durationMs)
      setProgress(next)
      if (next >= 1) {
        advance()
      } else {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // progress is intentionally excluded: the timer resumes where it paused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, paused, index, advance])

  useEffect(() => {
    if (status !== 'error') return
    const timeout = setTimeout(advance, 1400)
    return () => clearTimeout(timeout)
  }, [status, advance])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key === 'ArrowRight' || event.key === ' ') advance()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [advance])

  const hasActions = Boolean(onToggleSave || onAddToVault || onResnag)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-start gap-2 p-3">
        <div className="flex flex-1 flex-col gap-2">
          {items.length > 1 ? (
            <div className="flex gap-1">
              {items.map((entry, i) => (
                <span key={entry.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
                  <span
                    className="block h-full rounded-full bg-white"
                    style={{ width: i < index ? '100%' : i === index ? `${progress * 100}%` : '0%' }}
                  />
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-semibold">{title}</p>
            {subtitle ? <p className="text-xs text-white/45">{subtitle}</p> : null}
          </div>
        </div>
        {item?.palette?.length ? (
          <div className="mt-1 flex gap-1">
            {item.palette.slice(0, 4).map((hex) => (
              <span key={hex} className="h-3 w-3 rounded-full border border-white/25" style={{ backgroundColor: hex }} />
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close snag"
          className="rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div
        className="relative flex-1 overflow-hidden"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Snag" className="h-full w-full object-contain pop" />
        ) : null}

        {item?.layout?.pins?.map((pin, pinIndex) => (
          <span
            key={`${pin.emoji}-${pinIndex}`}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)]"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, transform: `translate(-50%, -50%) scale(${pin.scale ?? 1})` }}
          >
            {pin.emoji}
          </span>
        ))}

        {status === 'loading' ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-white/60">
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <p className="text-xs uppercase tracking-[0.2em]">Loading snag</p>
            </div>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="absolute inset-0 grid place-items-center px-8 text-center">
            <div>
              <TimerIcon className="mx-auto h-10 w-10 text-white/50" />
              <p className="mt-3 text-lg font-semibold">{error}</p>
              <p className="mt-1 text-sm text-white/50">Unsaved snags disappear the moment they expire.</p>
            </div>
          </div>
        ) : null}

        {item?.caption ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-8 mx-auto max-w-[85%] text-center text-[22px] leading-tight font-extrabold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)]">
            {item.caption}
          </p>
        ) : null}

        <div
          className="absolute inset-y-0 left-0 w-1/3"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
        />
        <div className="absolute inset-y-0 right-0 w-2/3" onClick={advance} />
      </div>

      {hasActions ? (
        <div className="flex items-center justify-center gap-2 px-4 pb-2 pt-3">
          {onToggleSave ? (
            <button
              type="button"
              onClick={() => {
                onToggleSave(item)
                setSaved((current) => !current)
              }}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ${
                saved ? 'bg-white text-ink' : 'bg-white/10 text-white/80'
              }`}
            >
              <BookmarkIcon className="h-3.5 w-3.5" /> {saved ? 'Saved' : 'Save in chat'}
            </button>
          ) : null}
          {onAddToVault ? (
            <button
              type="button"
              onClick={() => onAddToVault(item)}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/80"
            >
              <GridIcon className="h-3.5 w-3.5" /> Vault
            </button>
          ) : null}
          {onResnag ? (
            <button
              type="button"
              onClick={() => onResnag(item)}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/80"
            >
              <RepeatIcon className="h-3.5 w-3.5" /> Re-snag
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between px-5 pb-6 pt-4 text-xs text-white/40">
        <span>{paused ? 'holding' : `${Math.max(0, Math.ceil((item?.duration ?? 5) * (1 - progress)))}s left`}</span>
        <span>
          {index + 1} / {items.length}
        </span>
      </div>
    </div>
  )
}
