import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthShell } from '@/components/auth/AuthShell'
import { ForgotForm } from '@/components/auth/ForgotForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Recover your account' }

export default function ForgotPage() {
  return (
    <AuthShell
      title="Recover your account"
      subtitle="Lost the password, or the address you signed up with? Both are covered here."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/auth/sign-in" className="font-semibold text-ink underline underline-offset-2">
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotForm />
    </AuthShell>
  )
}
