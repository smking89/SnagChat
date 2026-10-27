import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthShell } from '@/components/auth/AuthShell'
import { ResetForm } from '@/components/auth/ResetForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Choose a new password' }

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams

  if (!token) {
    return (
      <AuthShell
        title="That link is incomplete"
        subtitle="Reset links carry a single-use token. Open the link from your email, or ask for a fresh one."
        footer={
          <Link href="/auth/forgot" className="font-semibold text-ink underline underline-offset-2">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          For safety, SnagChat never accepts a password change without a valid token — otherwise anyone who guessed an
          email address could take the account.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password" subtitle="This link works once. Pick something you have not used here before.">
      <ResetForm token={token} />
    </AuthShell>
  )
}
