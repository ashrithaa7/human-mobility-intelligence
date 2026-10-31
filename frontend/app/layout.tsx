import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Human Mobility Intelligence',
  description:
    'Spatiotemporal Movement Pattern Discovery and Urban Planning Decision Support',
  icons: {
    icon: '/logo.svg',
  },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen text-gray-100 antialiased">
        {children}
      </body>
    </html>
  )
}
