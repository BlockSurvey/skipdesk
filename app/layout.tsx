import type { Metadata } from 'next'
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { NoSSR } from '@/components/ClientOnly'

const sans = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-sans' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Skip Desk — Front Desk Intelligence',
  description: 'Everything your AI front desk captured: calls, callers, appointments, and leads — one page per business.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: tolerate attributes/nodes injected by browser
    // extensions (dark-mode, password managers, etc.) before React hydrates —
    // they mutate the server HTML and would otherwise throw a hydration error.
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {/* App-wide client render: we don't need SSR here, and gating the whole
            tree behind mount makes hydration mismatches (time/locale/timezone or
            browser-extension DOM injection) impossible. */}
        <NoSSR>{children}</NoSSR>
      </body>
    </html>
  )
}
