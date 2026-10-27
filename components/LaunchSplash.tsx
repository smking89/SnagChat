'use client'

import { useEffect, useState } from 'react'

/**
 * The one full-brand moment: a hyper-purple launch screen carrying the mark.
 * It fades itself out and never blocks a tap, so a slow first paint can't trap
 * the app behind it.
 */
export function LaunchSplash() {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setGone(true), 1300)
    return () => clearTimeout(timeout)
  }, [])

  if (gone) return null

  return (
    <div
      className="splash pointer-events-none fixed inset-0 z-[100] grid place-items-center bg-snag"
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/wordmark.svg" alt="" className="h-auto w-[228px] max-w-[72vw]" />
    </div>
  )
}
