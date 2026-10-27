/**
 * Transactional email for account recovery.
 *
 * Delivery goes through Resend's HTTP API with a plain fetch: no SDK, no Node
 * built-ins, so it runs unchanged in workerd. If RESEND_API_KEY is not
 * configured we do not pretend a message was sent — the caller gets
 * `delivered: false` and decides what to tell the person.
 */

export type MailResult = { delivered: boolean; reason?: 'not_configured' | 'failed'; detail?: string }

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

function fromAddress(): string {
  return process.env.MAIL_FROM ?? 'SnagChat <onboarding@resend.dev>'
}

export async function sendMail(message: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { delivered: false, reason: 'not_configured' }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    })
    if (!response.ok) {
      // Never include the recipient address or body in diagnostics.
      return { delivered: false, reason: 'failed', detail: `resend ${response.status}` }
    }
    return { delivered: true }
  } catch (error) {
    return { delivered: false, reason: 'failed', detail: error instanceof Error ? error.message : 'network' }
  }
}

function layout(title: string, body: string, footer: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#ffffff;color:#000000;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto">
    <tr><td style="padding-bottom:24px">
      <span style="font-size:13px;font-weight:700;letter-spacing:.22em;text-transform:uppercase">SnagChat</span>
    </td></tr>
    <tr><td style="border:1px solid #e2e2e7;border-radius:20px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${title}</h1>
      ${body}
      <p style="margin:24px 0 0;font-size:12px;color:#6b6b76;line-height:1.6">${footer}</p>
    </td></tr>
  </table>
</body></html>`
}

const button = (url: string, label: string) =>
  `<p style="margin:20px 0"><a href="${url}" style="display:inline-block;background:#9D00FF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 22px;border-radius:14px">${label}</a></p>`

export function passwordResetEmail(name: string, url: string) {
  return {
    subject: 'Reset your SnagChat password',
    text: `Hi ${name},\n\nUse this link to choose a new SnagChat password. It works once and expires in an hour:\n${url}\n\nIf you did not ask for this, ignore the email — your password stays the same.`,
    html: layout(
      `Reset your password`,
      `<p style="margin:0;font-size:15px;line-height:1.6">Hi ${name}, choose a new password below. The link works once and expires in an hour.</p>
       ${button(url, 'Choose a new password')}
       <p style="margin:0;font-size:13px;color:#6b6b76;word-break:break-all">${url}</p>`,
      'If you did not ask for this, ignore this email — your password stays the same.'
    ),
  }
}

export function emailReminderEmail(name: string, email: string, url: string) {
  return {
    subject: 'The email on your SnagChat account',
    text: `Hi ${name},\n\nSomebody asked which email address signs in to your SnagChat account. It is:\n${email}\n\nSign in: ${url}\n\nIf that was not you, you can ignore this message.`,
    html: layout(
      'The email on your account',
      `<p style="margin:0;font-size:15px;line-height:1.6">Somebody asked which email address signs in to your SnagChat account. It is:</p>
       <p style="margin:16px 0;font-size:18px;font-weight:700;word-break:break-all">${email}</p>
       ${button(url, 'Sign in')}`,
      'If that was not you, you can ignore this message. Nobody can change your password with it.'
    ),
  }
}
