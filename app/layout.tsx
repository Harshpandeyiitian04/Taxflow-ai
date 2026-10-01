import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { PostHogProvider } from '@/components/PostHogProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TaxFlow AI — AI-powered Form 16 extraction for CA firms',
  description: 'Upload Form 16 PDFs and extract all fields automatically in 8 seconds. Built for Indian CA practitioners. Works with Winman, Computax, KDK.',
  keywords: 'Form 16 extractor, CA software India, ITR filing automation, TDS certificate reader',
  openGraph: {
    title: 'TaxFlow AI — Stop typing Form 16 data manually',
    description: 'AI reads your clients Form 16 and extracts every field in 8 seconds.',
    url: 'https://taxflowai.in',
    siteName: 'TaxFlow AI',
    locale: 'en_IN',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}