'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { PublicUser } from '@/lib/types'
import { CameraIcon, ChatIcon, GridIcon, PersonIcon, StoryIcon } from './icons'
import { Avatar } from './Avatar'
import { LaunchSplash } from './LaunchSplash'

const TABS = [
  { href: '/', label: 'Camera', Icon: CameraIcon },
  { href: '/chat', label: 'Chat', Icon: ChatIcon },
  { href: '/flash', label: 'Flash', Icon: StoryIcon },
  { href: '/vaults', label: 'Vaults', Icon: GridIcon },
  { href: '/me', label: 'You', Icon: PersonIcon },
]

export function Shell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="shell">
      <LaunchSplash />
      {user.isDemo ? (
        <div className="flex items-center justify-center gap-1.5 border-b border-hair bg-panel py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          demo mode — snaps are real, the account is temporary
        </div>
      ) : null}
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      <nav className="relative z-20 flex shrink-0 items-center justify-around border-t border-hair bg-white/95 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] backdrop-blur">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex w-14 flex-col items-center gap-1 rounded-2xl py-1 transition ${
                active ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {href === '/me' ? (
                <Avatar user={user} size={22} className={active ? 'ring-2 ring-ink' : ''} />
              ) : (
                <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} />
              )}
              <span className={`text-[10px] tracking-wide ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
