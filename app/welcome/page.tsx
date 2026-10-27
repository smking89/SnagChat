import Link from 'next/link'
import { redirect } from 'next/navigation'

import { DemoButton } from '@/components/DemoButton'
import { BoltIcon, GridIcon, TimerIcon } from '@/components/icons'
import { getSession } from '@/lib/api'

export const dynamic = 'force-dynamic'

const POINTS = [
  { Icon: TimerIcon, text: 'Direct snags self-destruct after one look' },
  { Icon: BoltIcon, text: 'A Flash stream that empties every 24 hours' },
  { Icon: GridIcon, text: 'Vault boards that keep only what you anchor' },
]

export default async function WelcomePage() {
  const user = await getSession()
  if (user) redirect('/')

  return (
    <div className="shell px-6">
      <div className="relative flex flex-1 flex-col justify-center gap-8 py-10">
        <div className="flex flex-col gap-3">
          <h1 className="sr-only">SnagChat</h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wordmark.svg" alt="SnagChat" className="h-auto w-[268px] max-w-full" />
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">send it · it&apos;s gone</p>
        </div>

        <p className="text-[22px] leading-snug font-semibold text-ink">
          A camera-first messenger with two states:{' '}
          <span className="underline decoration-ink decoration-2 underline-offset-4">flash</span> for now, vaults for
          keeps.
        </p>

        <ul className="space-y-2.5 text-sm text-ink/70">
          {POINTS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3 rounded-2xl border border-hair bg-panel/60 px-3.5 py-2.5">
              <Icon className="h-4.5 w-4.5 shrink-0 text-ink" aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-3">
          {/* The launcher action: the one place brand purple carries a button. */}
          <Link
            href="/auth/sign-in"
            className="flex w-full items-center justify-center rounded-2xl bg-snag px-5 py-3.5 text-[15px] font-bold text-white transition hover:brightness-95"
          >
            Sign in
          </Link>
          <Link
            href="/auth/register"
            className="flex w-full items-center justify-center rounded-2xl border border-ink bg-white px-5 py-3.5 text-[15px] font-semibold text-ink transition hover:bg-panel"
          >
            Create an account
          </Link>
          <DemoButton />
          <p className="text-center text-[11px] leading-relaxed text-muted">
            Email and password only — SnagChat holds the account. The demo is temporary and starts pre-loaded with
            friends, snaps and stories.
          </p>
          <p className="text-center text-[11px]">
            <Link href="/about" className="text-ink underline underline-offset-2">
              About SnagChat
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
