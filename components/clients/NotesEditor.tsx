'use client'

import { useState } from 'react'

interface NotesEditorProps {
  clientId: string
  initialNotes: string | null
}

export function NotesEditor({ clientId, initialNotes }: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    await fetch(`/api/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setSaving(false)
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 2000)
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
          <div className="flex gap-2 mt-2">
            <button onClick={save} disabled={saving}
              className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save notes'}
            </button>
            <button onClick={() => { setEditing(false); setNotes(initialNotes ?? '') }}
              className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="cursor-text min-h-15 rounded-xl border border-dashed border-gray-200 hover:border-gray-400 px-4 py-3 transition-colors group"
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
          {saved && <p className="text-xs text-green-600 mt-1">✓ Saved</p>}
        </div>
      )}
    </div>
  )
}