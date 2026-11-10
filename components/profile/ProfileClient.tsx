'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CAFirm } from '@/types'
import { useEscapeClose } from '@/lib/hooks/useEscapeClose'

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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEscapeClose(deleteOpen, () => { if (!deleting) setDeleteOpen(false) }, !deleting)

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

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE') {
      setDeleteError('Type DELETE exactly to confirm.')
      return
    }
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Deletion failed')
      router.replace('/')
      router.refresh()
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed')
      setDeleting(false)
    }
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

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">Firm profile</h1>
            <p className="text-sm text-gray-500 mt-1">
              This information appears on your client upload portal and dashboard.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-500">Logged in as</p>
            <p className="font-medium text-gray-900">{userEmail}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                Free early access
              </span>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Firm name</label>
                <input
                  value={form.firm_name}
                  onChange={e => setForm(f => ({ ...f, firm_name: e.target.value }))}
                  placeholder="e.g. Mehta & Associates"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name (CA)</label>
                <input
                  value={form.owner_name}
                  onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
                  placeholder="e.g. CA Rajesh Mehta"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp number</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="9876543210"
                  type="tel"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                <input
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="e.g. Mumbai"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">{error}</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-colors">
                {saving ? 'Saving...' : 'Save profile'}
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium">Profile saved</span>
              )}
            </div>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-red-200 p-8">
          <h2 className="text-lg font-bold text-red-800">Delete account</h2>
          <p className="mt-2 text-sm text-gray-600">
            Permanently deletes your firm, clients, uploaded documents, and login. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => { setDeleteOpen(true); setDeleteConfirm(''); setDeleteError('') }}
            className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Delete my account…
          </button>
        </div>
      </main>

      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
          onMouseDown={e => { if (e.target === e.currentTarget && !deleting) setDeleteOpen(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <h2 id="delete-account-title" className="text-lg font-bold text-gray-900">Delete account</h2>
            <p className="mt-2 text-sm text-gray-600">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm permanent deletion.
            </p>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              className="mt-3 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="DELETE"
              autoFocus
            />
            {deleteError && (
              <p className="mt-2 text-sm text-red-600" role="alert">{deleteError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button type="button" disabled={deleting} onClick={() => setDeleteOpen(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600">
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || deleteConfirm !== 'DELETE'}
                onClick={() => void handleDeleteAccount()}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:bg-red-300"
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
