import Link from 'next/link'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="auth-surface">
      <div className="shell px-6">
        <div className="flex flex-1 flex-col justify-center gap-6 py-10">
          <Link href="/welcome" className="mx-auto block w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wordmark.svg" alt="SnagChat" className="h-auto w-[200px] max-w-full" />
          </Link>

          <div className="text-center">
            <h1 className="text-[26px] leading-tight font-black tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm leading-snug">{subtitle}</p> : null}
          </div>

          <div>{children}</div>

          {footer ? <div className="text-center text-[13px] text-muted">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}
