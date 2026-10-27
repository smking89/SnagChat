import type { Metadata } from 'next'
import Link from 'next/link'

import { DeveloperPortal } from '@/components/DeveloperPortal'
import { BackIcon } from '@/components/icons'
import { requireSession } from '@/lib/api'
import { listApiKeys } from '@/lib/apiKeys'
import { ensureSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Developer portal' }

export default async function DevelopersPage() {
  const user = await requireSession()
  await ensureSchema()
  const keys = await listApiKeys(user.id)

  return (
    <div className="shell">
      <header className="flex shrink-0 items-center gap-2 border-b border-hair px-3 py-3">
        <Link
          href="/me"
          aria-label="Back to your account"
          className="rounded-full p-1.5 text-muted transition hover:bg-panel hover:text-ink"
        >
          <BackIcon className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold text-ink">Developer portal</h1>
          <p className="text-[11px] text-muted">Keys, usage and the read API</p>
        </div>
      </header>

      <DeveloperPortal initialKeys={keys} username={user.username} />
    </div>
  )
}
