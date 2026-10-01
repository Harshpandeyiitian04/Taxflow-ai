'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CAFirm } from '@/types'

export function ProfileClient({ firm, userEmail }: { firm: CAFirm; userEmail: string }) {
  const router = useRouter()
  const [form, setForm] = useState({
    firm_name: firm.firm_name ?? '',
    owner_name: firm.owner_name ?? '',
    phone: firm.phone ?? '',
    city: firm.city ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    router.refresh()
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">Firm profile</span>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">Firm profile</h1>
            <p className="text-sm text-gray-500 mt-1">
              This information appears on your client upload portal and dashboard.
            </p>
          </div>

          {/* Account info */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-500">Logged in as</p>
            <p className="font-medium text-gray-900">{userEmail}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                Free access · unlimited extractions
              </span>
              {firm.plan_expires_at && firm.plan !== 'trial' && (
                <span className="text-xs text-gray-400">
                  Expires {new Date(firm.plan_expires_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                </span>
              )}
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Firm name
                </label>
                <input
                  value={form.firm_name}
                  onChange={e => setForm(f => ({...f, firm_name: e.target.value}))}
                  placeholder="e.g. Mehta & Associates"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-400 mt-1">Shown in client upload portal header</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Your name (CA)
                </label>
                <input
                  value={form.owner_name}
                  onChange={e => setForm(f => ({...f, owner_name: e.target.value}))}
                  placeholder="e.g. CA Rajesh Mehta"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  WhatsApp number
                </label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                  placeholder="9876543210"
                  type="tel"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-400 mt-1">Shown to clients on upload portal</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  City
                </label>
                <input
                  value={form.city}
                  onChange={e => setForm(f => ({...f, city: e.target.value}))}
                  placeholder="e.g. Mumbai"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-colors">
                {saving ? 'Saving...' : 'Save profile'}
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium">✓ Profile saved</span>
              )}
            </div>
          </form>
        </div>

      </main>
    </div>
  )
}