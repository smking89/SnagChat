'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import type { PublicUser, SnagPin } from '@/lib/types'
import { Avatar, BrandMark } from './Avatar'
import { BoltIcon, CheckIcon, CloseIcon, FlipIcon, ImageIcon, SendIcon, TimerIcon } from './icons'
import { OVERLAYS, STICKERS, applyOverlay, buildLayout, samplePalette, type OverlayId } from './creative'

const TIMERS = [3, 5, 10]

type CameraState = 'starting' | 'live' | 'blocked'
type Shot = { url: string; blob: Blob; palette: string[] }

export function CameraScreen({
  me,
  initialRecipient,
  initialStory = false,
}: {
  me: PublicUser
  initialRecipient?: string
  initialStory?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const rawRef = useRef<{ url: string; mirrored: boolean } | null>(null)
  const shotUrlRef = useRef<string | null>(null)

  const [camera, setCamera] = useState<CameraState>('starting')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [shot, setShot] = useState<Shot | null>(null)
  const [overlay, setOverlay] = useState<OverlayId>('none')
  const [pins, setPins] = useState<SnagPin[]>([])
  const [armedSticker, setArmedSticker] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [duration, setDuration] = useState(5)
  const [friends, setFriends] = useState<PublicUser[]>([])
  const [selected, setSelected] = useState<string[]>(initialRecipient ? [initialRecipient] : [])
  const [toFlash, setToFlash] = useState(initialStory)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera('blocked')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1440 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCamera('live')
      } catch {
        if (!cancelled) setCamera('blocked')
      }
    }

    setCamera('starting')
    void startCamera()
    return () => {
      cancelled = true
    }
  }, [facing])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/friends', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { friends: [] }))
      .then((data: { friends?: PublicUser[] }) => {
        if (!cancelled) setFriends(data.friends ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(timeout)
  }, [toast])

  /** Draws the raw frame, bakes the overlay, samples the colour signature. */
  async function bake(rawUrl: string, mirrored: boolean, nextOverlay: OverlayId) {
    const image = new Image()
    image.src = rawUrl
    await image.decode()

    const maxSide = 1280
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return
    if (mirrored) {
      context.translate(canvas.width, 0)
      context.scale(-1, 1)
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    if (mirrored) context.setTransform(1, 0, 0, 1, 0, 0)

    applyOverlay(canvas, nextOverlay)
    const palette = samplePalette(canvas)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob) return
    if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current)
    const url = URL.createObjectURL(blob)
    shotUrlRef.current = url
    setShot({ url, blob, palette })
  }

  function capture() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) {
      fileInputRef.current?.click()
      return
    }
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const rawUrl = canvas.toDataURL('image/jpeg', 0.9)
    rawRef.current = { url: rawUrl, mirrored: facing === 'user' }
    setPins([])
    void bake(rawUrl, facing === 'user', overlay)
  }

  function changeOverlay(next: OverlayId) {
    setOverlay(next)
    if (rawRef.current) void bake(rawRef.current.url, rawRef.current.mirrored, next)
  }

  function applyUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Pick a photo to send')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('That photo is over 8MB')
      return
    }
    const url = URL.createObjectURL(file)
    rawRef.current = { url, mirrored: false }
    setPins([])
    void bake(url, false, overlay)
  }

  function reset() {
    if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current)
    shotUrlRef.current = null
    rawRef.current = null
    setShot(null)
    setCaption('')
    setTags('')
    setPins([])
    setArmedSticker(null)
    setSelected([])
    setToFlash(false)
    setError(null)
  }

  function placePin(event: React.MouseEvent<HTMLDivElement>) {
    if (!armedSticker) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    setPins((current) => [...current, { x, y, emoji: armedSticker, scale: 1 }].slice(0, 12))
  }

  async function send() {
    if (!shot || sending) return
    if (!toFlash && selected.length === 0) {
      setError('Pick a friend, or send it to the flash stream')
      return
    }
    setSending(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('media', shot.blob, 'snag.jpg')
      form.append('caption', caption)
      form.append('duration', String(duration))
      form.append('recipients', selected.join(','))
      form.append('story', String(toFlash))
      form.append('palette', JSON.stringify(shot.palette))
      form.append('tags', tags)
      form.append('layout', JSON.stringify(buildLayout(overlay, pins)))

      const response = await fetch('/api/snaps', { method: 'POST', body: form })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Could not send that snag')
      }
      const data = (await response.json()) as { sent: number; story: boolean }
      const bits: string[] = []
      if (data.sent > 0) bits.push(`${data.sent} ${data.sent === 1 ? 'friend' : 'friends'}`)
      if (data.story) bits.push('the flash stream')
      setToast(`Sent to ${bits.join(' + ')} · ${duration}s`)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that snag')
    } finally {
      setSending(false)
    }
  }

  const captured = Boolean(shot)

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          captured ? 'opacity-0' : 'opacity-100'
        } ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
      />

      {camera !== 'live' && !captured ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white px-8 text-center">
          <BrandMark size={64} />
          <p className="text-lg font-semibold text-ink">
            {camera === 'starting' ? 'Waking up the camera…' : 'No camera yet'}
          </p>
          <p className="max-w-[260px] text-sm text-muted">
            {camera === 'starting'
              ? 'Give it a second.'
              : 'Allow camera access to snap, or send a photo from your device instead.'}
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white"
          >
            Choose a photo
          </button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) applyUpload(file)
          event.target.value = ''
        }}
      />

      {/* idle controls */}
      <div className={`relative z-10 flex flex-1 flex-col ${captured ? 'pointer-events-none opacity-0' : ''}`}>
        <div className="flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-4">
          <div className="flex items-center gap-2">
            <Avatar user={me} size={34} />
            <div className="leading-tight">
              <p className="text-[13px] font-semibold">{me.displayName}</p>
              <p className="text-[11px] text-white/55">@{me.username}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFacing((current) => (current === 'user' ? 'environment' : 'user'))}
            aria-label="Flip camera"
            className="rounded-full bg-white/15 p-2.5 text-white/90 backdrop-blur transition hover:bg-white/25"
          >
            <FlipIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1" />

        {toast ? (
          <div className="mx-auto mb-3 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-ink pop">{toast}</div>
        ) : null}

        <div className="flex flex-col items-center gap-4 bg-gradient-to-t from-black/80 to-transparent px-6 pb-5 pt-10">
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
              aria-label="Upload a photo"
              title="Upload a photo"
            >
              <ImageIcon className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={capture}
              aria-label="Take a snag"
              className="record-ring grid h-[74px] w-[74px] place-items-center rounded-full border-4 border-white/90 bg-white/10"
            >
              <span className="h-[58px] w-[58px] rounded-full bg-white transition active:scale-90" />
            </button>

            <Link
              href="/flash"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
              aria-label="Open the flash stream"
              title="Open the flash stream"
            >
              <BoltIcon className="h-5 w-5" />
            </Link>
          </div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">tap to snag</p>
        </div>
      </div>

      {/* editor */}
      {shot ? (
        <div className="absolute inset-0 z-30 flex flex-col bg-black pop">
          <div className="absolute inset-0" onClick={placePin}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.url} alt="Your snag" className="h-full w-full object-cover" />
            {pins.map((pin, index) => (
              <span
                key={`${pin.emoji}-${index}-${pin.x}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 select-none text-3xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
                style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                role="button"
                tabIndex={0}
                aria-label={`Remove ${pin.emoji} sticker`}
                onClick={(event) => {
                  event.stopPropagation()
                  setPins((current) => current.filter((_, i) => i !== index))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    setPins((current) => current.filter((_, i) => i !== index))
                  }
                }}
              >
                {pin.emoji}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

          <div className="relative z-10 flex items-center justify-between p-3">
            <button
              type="button"
              onClick={reset}
              aria-label="Discard snag"
              className="rounded-full bg-black/45 p-2.5 text-white/85 backdrop-blur"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDuration(TIMERS[(TIMERS.indexOf(duration) + 1) % TIMERS.length])}
              className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur"
            >
              <TimerIcon className="h-4 w-4" />
              {duration}s
            </button>
          </div>

          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5">
            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value.slice(0, 120))}
              placeholder={armedSticker ? 'tap the photo to place it' : 'Add a caption…'}
              className="w-full bg-transparent text-center text-[26px] font-extrabold leading-tight text-white placeholder:text-white/45 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] outline-none"
            />

            <div className="mt-4 flex max-w-full gap-1.5 overflow-x-auto no-scrollbar">
              {OVERLAYS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => changeOverlay(entry.id)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur ${
                    overlay === entry.id ? 'bg-white text-ink' : 'bg-black/45 text-white/80'
                  }`}
                >
                  <span>{entry.glyph}</span>
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="mt-2 flex max-w-full gap-1 overflow-x-auto no-scrollbar">
              {STICKERS.map((sticker) => (
                <button
                  key={sticker}
                  type="button"
                  onClick={() => setArmedSticker((current) => (current === sticker ? null : sticker))}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm ${
                    armedSticker === sticker ? 'bg-white text-ink' : 'bg-black/40 text-white/80'
                  }`}
                  aria-label={`Place ${sticker}`}
                >
                  {sticker}
                </button>
              ))}
            </div>
          </div>

          <div className="relative z-10 px-4 pb-4">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
              <span>send to</span>
              <span>{selected.length + (toFlash ? 1 : 0) || 'nobody'} selected</span>
            </div>

            <div className="no-scrollbar mb-3 flex gap-3 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setToFlash((current) => !current)}
                className="flex w-14 shrink-0 flex-col items-center gap-1"
              >
                <span
                  className={`grid h-14 w-14 place-items-center rounded-[30%] border-2 ${
                    toFlash ? 'border-white bg-white text-ink' : 'border-white/25 bg-white/10 text-white/70'
                  }`}
                >
                  <BoltIcon className="h-5 w-5" />
                </span>
                <span className={`text-[11px] ${toFlash ? 'font-semibold text-white' : 'text-white/60'}`}>Flash</span>
              </button>

              {friends.map((friend) => {
                const active = selected.includes(friend.id)
                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() =>
                      setSelected((current) =>
                        current.includes(friend.id)
                          ? current.filter((id) => id !== friend.id)
                          : [...current, friend.id]
                      )
                    }
                    className="flex w-14 shrink-0 flex-col items-center gap-1"
                  >
                    <span className="relative">
                      <Avatar user={friend} size={56} className={active ? 'ring-2 ring-white' : 'opacity-75'} />
                      {active ? (
                        <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-ink">
                          <CheckIcon className="h-3 w-3" strokeWidth={3} />
                        </span>
                      ) : null}
                    </span>
                    <span className={`w-14 truncate text-center text-[11px] ${active ? 'font-semibold text-white' : 'text-white/60'}`}>
                      {friend.displayName.split(' ')[0]}
                    </span>
                  </button>
                )
              })}

              {friends.length === 0 ? (
                <p className="self-center text-xs text-white/50">Add friends from the You tab</p>
              ) : null}
            </div>

            <div className="mb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
              {shot.palette.map((hex) => (
                <span
                  key={hex}
                  className="h-4 w-8 shrink-0 rounded-full border border-white/20"
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))}
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="tags: neon, hud"
                className="min-w-[120px] flex-1 rounded-full bg-black/40 px-3 py-1 text-[11px] text-white/85 outline-none placeholder:text-white/35"
              />
            </div>

            {error ? <p className="mb-2 text-center text-xs text-snap-pink">{error}</p> : null}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] leading-snug text-white/45">
                {toFlash
                  ? 'Flash entries leave every stream after 24 hours unless you anchor them to a vault.'
                  : `Direct snags vanish after ${duration}s and are wiped once everyone has looked.`}
              </p>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-ink transition active:scale-95 disabled:opacity-60"
              >
                <SendIcon className="h-4 w-4" strokeWidth={2.2} />
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error && !shot ? (
        <div className="absolute inset-x-4 bottom-4 z-40 rounded-2xl bg-snap-pink/90 px-4 py-2.5 text-center text-xs font-semibold text-white">
          {error}
        </div>
      ) : null}
    </div>
  )
}
