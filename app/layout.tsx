import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: { default: 'SnagChat', template: '%s · SnagChat' },
  description: 'A camera-first messenger: a Flash stream that empties every 24 hours and Vault boards that keep what you anchor.',
  applicationName: 'SnagChat',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'SnagChat', statusBarStyle: 'default' },
  // app/favicon.ico, app/icon.svg and app/apple-icon.png are auto-detected by Next;
  // the SVG is listed explicitly so modern browsers get the crisp version.
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'SnagChat',
    description: 'Flash for now, vaults for keeps.',
    images: ['/icons/icon-512.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
