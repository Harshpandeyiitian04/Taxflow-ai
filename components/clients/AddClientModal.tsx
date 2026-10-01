'use client'

import { useState } from 'react'
import type { Client } from '@/types'

interface AddClientModalProps {
  open: boolean
  onClose: () => void
  onCreated: (client: Client, uploadUrl: string) => void
}

export function AddClientModal({ open, onClose, onCreated }: AddClientModalProps) {
  const [form, setForm] = useState({ name: '', pan: '', phone: '', email: '', assessment_year: '2027-28' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onCreated(data.client, data.uploadUrl)
      setForm({ name: '', pan: '', phone: '', email: '', assessment_year: '2027-28' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create client')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Add new client</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
              placeholder="Ramesh Gupta" required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PAN <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={form.pan} onChange={e => setForm(f => ({...f, pan: e.target.value.toUpperCase()}))}
              placeholder="ABCDE1234F" maxLength={10}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-gray-400 font-normal">(for WhatsApp link)</span></label>
            <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
              placeholder="9876543210" type="tel"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="client@example.com" type="email"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assessment Year</label>
            <select value={form.assessment_year} onChange={e => setForm(f => ({...f, assessment_year: e.target.value}))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="2027-28">AY 2027-28</option>
              <option value="2026-27">AY 2026-27</option>
              <option value="2025-26">AY 2025-26</option>
              <option value="2024-25">AY 2024-25</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {loading ? 'Creating...' : 'Create & get link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}