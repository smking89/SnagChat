import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AuthShell } from '@/components/auth/AuthShell'
import { SignInForm } from '@/components/auth/SignInForm'
import { DemoButton } from '@/components/DemoButton'
import { getSession } from '@/lib/api'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sign in' }

export default async function SignInPage() {
  if (await getSession()) redirect('/')

  return (
    <AuthShell
      title="Sign in"
      subtitle="Email and password, held by SnagChat itself — no social login, no third party."
      footer={
        <>
          New here?{' '}
          <Link href="/auth/register" className="font-semibold text-ink underline underline-offset-2">
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm />

      <div className="mt-4 border-t border-hair pt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Or look around first</p>
        <DemoButton />
        <p className="mt-3 text-center text-[11px] text-muted">
          <Link href="/auth/forgot" className="underline underline-offset-2 hover:text-ink">
            Forgot your password or email?
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
