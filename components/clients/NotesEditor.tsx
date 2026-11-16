'use client'

// Click-to-edit notes area for a single client.

import { useState } from 'react'

interface NotesEditorProps {
  clientId: string
  initialNotes: string | null
}

// Shows client notes and saves edits to the API.
export function NotesEditor({ clientId, initialNotes }: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [lastSaved, setLastSaved] = useState(initialNotes ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Persists the current notes text for this client.
  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not save notes')
      }
      setLastSaved(notes)
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save notes')
    } finally {
      setSaving(false)
    }
  }

  // Discards edits and closes the editor.
  function cancel() {
    setNotes(lastSaved)
    setError('')
    setEditing(false)
  }

  return (
    <div>
      {editing ? (
        <div>
          <textarea
            autoFocus
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes about this client — regime choice, special deductions, instructions, follow-up reminders..."
            rows={4}
            className="w-full text-sm border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          />
          {error && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">{error}</p>
          )}
          <div className="flex gap-2 mt-2">
            <button onClick={() => void save()} disabled={saving}
              className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save notes'}
            </button>
            <button onClick={cancel} disabled={saving}
              className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setEditing(true)
            }
          }}
          className="cursor-text min-h-15 rounded-xl border border-dashed border-gray-200 hover:border-gray-400 px-4 py-3 transition-colors group focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {notes ? (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{notes}</p>
              <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 shrink-0">Edit</span>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              Click to add notes — regime choice, special deductions, reminders...
            </p>
          )}
          {saved && <p className="text-xs text-green-600 mt-1">Saved</p>}
        </div>
      )}
    </div>
  )
}
