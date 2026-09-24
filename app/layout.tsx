import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import ConvexClientProvider from '@/components/ConvexClientProvider'

const geist = Geist({
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'ChatApp',
  description: 'Messagerie en temps réel',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${geist.className} h-full antialiased`}>
      <body className="h-full">
        <ClerkProvider
          afterSignOutUrl="/"
          signInFallbackRedirectUrl="/chat"
          signUpFallbackRedirectUrl="/chat"
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
