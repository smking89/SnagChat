import type { PublicUser } from '@/lib/types'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Monogram avatar: no emoji, no colour noise — a neutral plate with the
 * person's initials, so identity reads the same everywhere in the dashboard.
 */
export function Avatar({
  user,
  size = 44,
  ring,
  className = '',
}: {
  user: Pick<PublicUser, 'displayName'>
  size?: number
  ring?: 'unseen' | 'seen' | 'none'
  className?: string
}) {
  const ringClass =
    ring === 'unseen'
      ? 'ring-2 ring-ink ring-offset-2 ring-offset-white'
      : ring === 'seen'
        ? 'ring-1 ring-hair ring-offset-2 ring-offset-white'
        : ''
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-[30%] border border-hair bg-panel-2 font-semibold tracking-tight text-ink ${ringClass} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(7.5, size * 0.36) }}
      title={user.displayName}
    >
      <span style={{ lineHeight: 1 }}>{initialsOf(user.displayName)}</span>
    </div>
  )
}

/** The fist mark, rendered from the traced brand asset. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/fist.svg"
      width={size}
      height={size}
      alt="SnagChat"
      style={{ width: size, height: size }}
      className="shrink-0"
    />
  )
}
