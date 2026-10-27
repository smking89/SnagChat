import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AuthShell } from '@/components/auth/AuthShell'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { getSession } from '@/lib/api'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Create account' }

export default async function RegisterPage() {
  if (await getSession()) redirect('/')

  return (
    <AuthShell
      title="Create your account"
      subtitle="One email, one password. Snags stay ephemeral; the account does not have to."
      footer={
        <>
          Already have one?{' '}
          <Link href="/auth/sign-in" className="font-semibold text-ink underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  )
}
