import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'About' }

const SECTIONS = [
  {
    title: 'What it is',
    body: 'SnagChat is a photo messenger. You take a photo, add a caption or a sticker if you want, and send it to a friend or to the public stream. Nothing you send stays in the app forever unless you say so.',
  },
  {
    title: 'Snags and vaults',
    body: 'A snag is one photo with its details: who sent it, when, which colours it uses, and what is pinned on it. Snags in the stream expire after 24 hours. When you want to keep one, you anchor it to a vault board, and it stops expiring.',
  },
  {
    title: 'Chat',
    body: 'Text in a conversation clears after six hours unless you save it. Saved snags collect in a shared board attached to that conversation, so the two of you can look back without screenshotting anything.',
  },
  {
    title: 'Your account',
    body: 'You sign up with an email address and a password. We store a password hash, never the password. Sessions live in a cookie, and resetting your password signs you out everywhere else.',
  },
  {
    title: 'Not built yet',
    body: 'Audio and video calls are visible in a chat but switched off. There is no advertising system and no public API today. When those exist, they will be listed here first, not added quietly.',
  },
]

export default function AboutPage() {
  return (
    <div className="shell px-6">
      <div className="scroll-area no-scrollbar py-10">
        <Link href="/welcome" className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wordmark.svg" alt="SnagChat" className="h-auto w-[196px] max-w-full" />
        </Link>

        <h1 className="mt-8 text-3xl font-black tracking-tight text-ink">About SnagChat</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          A photo messenger with a short memory. Plain description, no sales pitch.
        </p>

        <div className="mt-8 space-y-7">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{section.title}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{section.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-hair pt-5 text-[13px] leading-relaxed text-muted">
          Questions about your account go to the address on the{' '}
          <Link href="/auth/forgot" className="text-ink underline underline-offset-2">
            account recovery
          </Link>{' '}
          page.
        </p>
      </div>
    </div>
  )
}
