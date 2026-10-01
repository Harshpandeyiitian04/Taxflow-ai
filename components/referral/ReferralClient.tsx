'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { CAFirm } from '@/types'

interface Props { firm: CAFirm & { referral_code: string; referral_credits: number } }

interface ReferralRecord {
  email: string
  created_at: string
}

export function ReferralClient({ firm }: Props) {
  const [copied, setCopied] = useState(false)
  const [referrals, setReferrals] = useState<ReferralRecord[]>([])
  const [loading, setLoading] = useState(true)

  const referralLink = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login?ref=${firm.referral_code}`

  const waMsg = encodeURIComponent(
    `Hi! I've been using TaxFlow AI to extract Form 16 data. It is free during early access and takes a few seconds to try: ${referralLink}`
  )

  useEffect(() => {
    fetch('/api/referrals')
      .then(r => r.json())
      .then(d => { setReferrals(d.referrals ?? []); setLoading(false) })
  }, [])

  function copyLink() {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">Referral program</span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        {/* How it works */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Invite CA colleagues</h1>
          <p className="text-sm text-gray-500 mb-5">
            Share your invite link and track which CA firms join during free early access.
          </p>
          <div className="grid grid-cols-3 gap-3 text-center mb-5">
            {[
              { step:'1', text:'Share your link with CA colleagues' },
              { step:'2', text:'They sign in with a magic link' },
              { step:'3', text:'Their signup appears here' },
            ].map(s => (
              <div key={s.step} className="bg-gray-50 rounded-xl p-3">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold text-sm flex items-center justify-center mx-auto mb-2">{s.step}</div>
                <p className="text-xs text-gray-600">{s.text}</p>
              </div>
            ))}
          </div>

          {/* Link */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Your referral link</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-gray-700 bg-white border border-gray-200 px-3 py-2 rounded-lg truncate">
                {referralLink}
              </code>
              <button onClick={copyLink}
                className={`text-xs font-medium px-3 py-2 rounded-lg shrink-0 transition-colors ${
                  copied ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* WhatsApp share */}
          <a href={`https://wa.me/?text=${waMsg}`}
            target="_blank" rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Share on WhatsApp
          </a>

          <p className="text-xs text-gray-400 text-center mt-3">
            Or share your code: <strong className="text-gray-600">{firm.referral_code}</strong>
          </p>
        </div>

        {/* Referral history */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">
            Your referrals ({referrals.length})
          </h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : referrals.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-500 text-sm">No referrals yet.</p>
              <p className="text-xs text-gray-400 mt-1">Share your link to invite CA colleagues.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {referrals.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.email}</p>
                    <p className="text-xs text-gray-400">
                      Signed up {new Date(r.created_at).toLocaleDateString('en-IN', {day:'numeric',month:'short'})}
                    </p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700">
                    Joined
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}